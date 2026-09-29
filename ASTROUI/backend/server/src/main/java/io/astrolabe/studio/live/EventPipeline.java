package io.astrolabe.studio.live;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import io.astrolabe.studio.bridge.BusSubscription;
import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The live pipeline (§25.9): bus → per-campaign serial executor → normalizer → event log → topics, with the journal
 * tailed after event batches (G-08) and every 2 s while live. The sink only enqueues (never blocks the bus
 * dispatcher). A growing `dropped` count marks live campaigns for resynchronization from the store.
 */
@Component
public class EventPipeline implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(EventPipeline.class);
    public static final String EPHEMERAL = "cell.model_progress";

    private final HostService hosts;
    private final EventLog eventLog;
    private final TopicBroker broker;
    private final CampaignService campaigns;
    private final Map<String, ExecutorService> workers = new ConcurrentHashMap<>();
    private final Map<String, String> projects = new ConcurrentHashMap<>();
    private final Map<String, Long> journalCursor = new ConcurrentHashMap<>();
    private final Set<String> tailScheduled = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon().name("studio-tail").factory());
    private final AtomicLong received = new AtomicLong();
    private final AtomicLong lastDropped = new AtomicLong();
    private volatile BusSubscription subscription;

    public EventPipeline(HostService hosts, EventLog eventLog, TopicBroker broker, CampaignService campaigns, DecisionService decisions) {
        this.hosts = hosts;
        this.eventLog = eventLog;
        this.broker = broker;
        this.campaigns = campaigns;
        decisions.wire(this::studioItemRaw, this::projectOf);
    }

    /** Subscribes to the shared bus; called once at start. */
    public void start() {
        subscription = hosts.host().subscribe((work, busSeq, kind, json) -> {
            received.incrementAndGet();
            worker(work).execute(() -> ingest(work, kind, json));
        });
        scheduler.scheduleWithFixedDelay(this::tick, 2, 2, TimeUnit.SECONDS);
    }

    private ExecutorService worker(String work) {
        return workers.computeIfAbsent(work, w -> Executors.newSingleThreadExecutor(Thread.ofVirtual().name("stream-" + w).factory()));
    }

    /** The project of [work] (known once the campaign index row exists). */
    public String projectOf(String work) {
        String p = projects.get(work);
        if (p != null) return p;
        p = campaigns.projectOf(work);
        if (p != null) projects.put(work, p);
        return p;
    }

    /** A campaign is about to start in [projectId] with the pre-assigned [work] id. */
    public void expect(String work, String projectId) { projects.put(work, projectId); }

    // ------------------------------------------------------------------------------------------------ normalizer

    private void ingest(String work, String kind, String json) {
        try {
            JsonNode record = Json.parse(json);
            JsonNode event = record.get("event");
            ObjectNode item = Json.obj();
            item.put("at", Json.text(record, "at"));
            item.put("source", "bus");
            item.put("kind", kind);
            JsonNode ids = event.get("ids");
            item.set("ids", normalizeIds(ids));
            String context = ids == null ? null : Json.text(ids, "context");
            if (context != null) item.put("cell", context);
            if (event.hasNonNull("phase")) item.put("phase", Json.text(event, "phase"));
            if (event.hasNonNull("span")) item.put("span", Json.text(event, "span"));
            if (event.hasNonNull("parent")) item.put("parent", Json.text(event, "parent"));
            item.put("busSeq", record.get("seq").asLong());
            ObjectNode data = ((ObjectNode) event).deepCopy();
            for (String f : new String[]{"type", "ids", "phase", "span", "parent"}) data.remove(f);
            item.set("data", data);
            if (EPHEMERAL.equals(kind)) {
                // Ephemeral (§27.4): no durable seq, never a false gap.
                item.put("ephemeral", true);
                broker.publish(topic(work), item);
                return;
            }
            eventLog.append(work, item);
            broker.publish(topic(work), item);
            onEvent(work, kind, data);
            scheduleTail(work, 150);
        } catch (RuntimeException e) {
            log.warn("event for {} not ingested: {}", work, e.toString());
        }
        checkDrops();
    }

    private static ObjectNode normalizeIds(JsonNode ids) {
        ObjectNode o = Json.obj();
        if (ids == null) return o;
        o.put("work", Json.text(ids, "work"));
        o.put("attempt", Json.text(ids, "attempt"));
        if (ids.hasNonNull("candidate")) o.put("candidate", Json.text(ids, "candidate"));
        if (ids.hasNonNull("context")) o.put("context", Json.text(ids, "context"));
        return o;
    }

    private void onEvent(String work, String kind, JsonNode data) {
        switch (kind) {
            case "campaign.shape_selected" -> {
                campaigns.noteShape(work, Json.text(data, "shape"));
                campaigns.changed(work, true);
            }
            case "campaign.opened", "campaign.finished", "campaign.increment_closed", "campaign.increment_selected", "cell.started", "cell.ended", "blocked" -> {
                campaigns.touch(work);
                campaigns.changed(work, kind.startsWith("campaign.") || "blocked".equals(kind));
            }
            default -> {
                if (kind.startsWith("cell.turn_started")) {
                    campaigns.touch(work);
                    campaigns.changed(work, false);
                }
            }
        }
    }

    private void checkDrops() {
        BusSubscription s = subscription;
        if (s == null) return;
        long dropped = s.dropped();
        long previous = lastDropped.get();
        if (dropped > previous && lastDropped.compareAndSet(previous, dropped)) {
            for (String work : hosts.host().liveWorks()) {
                long head = eventLog.head(work);
                eventLog.recordGap(work, head, (dropped - previous) + " bus record(s) dropped");
                worker(work).execute(() -> {
                    tail(work, false);
                    ObjectNode data = Json.obj().put("reason", "bus records dropped; journal re-read and views reloaded").put("dropped", dropped - previous);
                    appendStudio(work, "studio.resync", data);
                });
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ journal tailing

    private void scheduleTail(String work, long delayMillis) {
        if (!tailScheduled.add(work)) return;
        scheduler.schedule(() -> {
            tailScheduled.remove(work);
            worker(work).execute(() -> tail(work, false));
        }, delayMillis, TimeUnit.MILLISECONDS);
    }

    /** Tails now (on the campaign's serial worker). */
    public void tailNow(String work) { worker(work).execute(() -> tail(work, false)); }

    private void tick() {
        try {
            for (String work : hosts.host().liveWorks()) scheduleTail(work, 0);
        } catch (RuntimeException e) {
            log.debug("tail tick: {}", e.toString());
        }
    }

    /** G-08: `journal` rows after the cursor become `journal.<kind>` items (runs on the campaign's worker). */
    private void tail(String work, boolean reconstructed) {
        String projectId = projectOf(work);
        if (projectId == null || !hosts.host().isOpen(projectId)) return;
        long after = journalCursor.computeIfAbsent(work, campaigns::lastJournalSeq);
        long start = after;
        try {
            while (true) {
                JsonNode rows = Json.parse(hosts.host().journalAfter(projectId, work, after, 500));
                if (!rows.isArray() || rows.isEmpty()) break;
                for (JsonNode row : rows) {
                    ObjectNode item = Json.obj();
                    item.put("at", Json.text(row, "at"));
                    item.put("source", "journal");
                    item.put("kind", "journal." + Json.text(row, "kind"));
                    JsonNode ids = row.get("ids");
                    item.set("ids", normalizeIds(ids));
                    String context = ids == null ? null : Json.text(ids, "context");
                    if (context != null) item.put("cell", context);
                    if (row.hasNonNull("turn")) item.put("turn", row.get("turn").asInt());
                    if (reconstructed) item.put("reconstructed", true);
                    item.set("data", row);
                    eventLog.append(work, item);
                    broker.publish(topic(work), item);
                    after = row.get("seq").asLong();
                }
                if (rows.size() < 500) break;
            }
        } catch (RuntimeException e) {
            log.debug("journal tail for {}: {}", work, e.toString());
        }
        if (after != start) {
            journalCursor.put(work, after);
            campaigns.setLastJournalSeq(work, after);
        }
    }

    /**
     * A campaign with no Studio stream yet (run before this Studio, or trimmed) is rebuilt from its journal; the items
     * are marked `reconstructed` (§3.2 rule 5). Bus-only animation is not recoverable and is not invented.
     */
    public void backfillIfEmpty(String work) {
        if (!eventLog.isEmpty(work)) return;
        String projectId = projectOf(work);
        if (projectId == null) return;
        var done = new java.util.concurrent.CompletableFuture<Void>();
        worker(work).execute(() -> {
            try {
                if (eventLog.isEmpty(work)) {
                    tail(work, true);
                    appendStudio(work, "studio.resync", Json.obj().put("reason", "rebuilt from the store: live events of this campaign were not captured by this Studio"));
                }
            } finally {
                done.complete(null);
            }
        });
        try {
            done.get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.debug("backfill {}: {}", work, e.toString());
        }
    }

    // ------------------------------------------------------------------------------------------------ studio items

    /** Appends a `studio.*` item in stream order (on the campaign's worker). */
    public void studioItem(String work, String kind, ObjectNode data) {
        worker(work).execute(() -> appendStudio(work, kind, data));
    }

    private void studioItemRaw(String work, ObjectNode item) {
        worker(work).execute(() -> {
            eventLog.append(work, item);
            broker.publish(topic(work), item);
        });
    }

    private void appendStudio(String work, String kind, ObjectNode data) {
        ObjectNode item = Json.obj();
        item.put("at", Json.now());
        item.put("source", "studio");
        item.put("kind", kind);
        item.putObject("ids").put("work", work).put("attempt", "a1");
        item.set("data", data);
        eventLog.append(work, item);
        broker.publish(topic(work), item);
    }

    /** `studio.run_ended` after a final journal tail, so the Thread closes with every row of the run. */
    public void runEnded(String work, ObjectNode data) {
        worker(work).execute(() -> {
            tail(work, false);
            appendStudio(work, "studio.run_ended", data);
        });
    }

    public static String topic(String work) { return "campaign:" + work; }

    public long received() { return received.get(); }

    public long dropped() { return subscription == null ? 0 : subscription.dropped(); }

    @Override
    public void destroy() {
        if (subscription != null) subscription.close();
        scheduler.shutdownNow();
        workers.values().forEach(ExecutorService::shutdown);
    }
}
