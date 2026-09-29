package io.astrolabe.studio.campaigns;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import io.astrolabe.studio.bridge.AutonomousPolicyOptions;
import io.astrolabe.studio.bridge.CampaignRef;
import io.astrolabe.studio.bridge.StartSpec;
import io.astrolabe.studio.bridge.StudioHost;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.ErrorHandling;
import io.astrolabe.studio.support.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Campaign lifecycle (§5, §25.5): start, resume (G-01), cancel (final, R-CMP-06), amend (R-CMP-09), the campaign index
 * across projects and the derived display status (§5.2). Status comes from the store, the runtime registry and the
 * pending decisions — never from model prose (P-03).
 */
@Service
public class CampaignService {
    private static final Logger log = LoggerFactory.getLogger(CampaignService.class);
    private static final Set<String> RESUMABLE = Set.of("waiting_for_input", "blocked_external", "waiting_for_process");

    private final JdbcTemplate jdbc;
    private final HostService hosts;
    private final TransportService transport;
    private final SettingsService settings;
    private final ProjectService projects;
    private final DecisionService decisions;
    private final TopicBroker broker;
    private final EventPipeline pipeline;
    private final Set<String> opening = ConcurrentHashMap.newKeySet();
    private final Set<String> cancelling = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> lastChanged = new ConcurrentHashMap<>();

    public CampaignService(JdbcTemplate jdbc, HostService hosts, TransportService transport, SettingsService settings, ProjectService projects,
                           DecisionService decisions, TopicBroker broker, @Lazy EventPipeline pipeline) {
        this.jdbc = jdbc;
        this.hosts = hosts;
        this.transport = transport;
        this.settings = settings;
        this.projects = projects;
        this.decisions = decisions;
        this.broker = broker;
        this.pipeline = pipeline;
    }

    private StudioHost host() { return hosts.host(); }

    // ------------------------------------------------------------------------------------------------ index

    public String projectOf(String workId) {
        List<String> r = jdbc.queryForList("SELECT project_id FROM campaign_index WHERE work_id = ?", String.class, workId);
        return r.isEmpty() ? null : r.getFirst();
    }

    public long lastJournalSeq(String workId) {
        List<Long> r = jdbc.queryForList("SELECT last_journal_seq FROM campaign_index WHERE work_id = ?", Long.class, workId);
        return r.isEmpty() || r.getFirst() == null ? 0 : r.getFirst();
    }

    public void setLastJournalSeq(String workId, long seq) {
        jdbc.update("UPDATE campaign_index SET last_journal_seq = ? WHERE work_id = ?", seq, workId);
    }

    /** Refreshes the index rows of [projectId] from its store (the truth). */
    public void syncProject(String projectId) {
        if (!host().isOpen(projectId)) return;
        JsonNode rows = Json.parse(host().campaigns(projectId));
        for (JsonNode c : rows) upsert(projectId, c);
    }

    private void upsert(String projectId, JsonNode c) {
        String work = Json.text(c, "workId");
        JsonNode state = c.get("state");
        JsonNode contract = c.get("contract");
        String title = Json.text(c, "title");
        String now = Json.now();
        String created = Json.text(c, "createdAt", now);
        String updated = Json.text(c, "updatedAt", created);
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, phase, outcome, reason, shape, mode, fingerprint, created_at, updated_at) " +
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(work_id) DO UPDATE SET phase = excluded.phase, outcome = excluded.outcome, reason = excluded.reason, " +
                "shape = coalesce(excluded.shape, campaign_index.shape), mode = coalesce(excluded.mode, campaign_index.mode), fingerprint = coalesce(excluded.fingerprint, campaign_index.fingerprint), " +
                "title = coalesce(campaign_index.title, excluded.title), updated_at = max(campaign_index.updated_at, excluded.updated_at)",
            work, projectId, firstLine(title), "stored", Json.text(c, "phase"), Json.text(c, "outcome"), state == null ? null : Json.text(state, "reason"),
            contract == null ? null : Json.text(contract, "shape"), contract == null ? null : Json.text(contract, "mode"), Json.text(c, "fingerprint"), created, updated);
    }

    /** Re-reads one campaign from its store into the index and notifies clients (R-SHL-01). */
    public void refresh(String workId) {
        String projectId = projectOf(workId);
        if (projectId == null || !host().isOpen(projectId)) return;
        String json = host().campaign(projectId, workId);
        if (json != null) upsert(projectId, Json.parse(json));
        changed(workId, true);
    }

    /** Publishes `campaign.changed` (throttled unless [force]). */
    public void changed(String workId, boolean force) {
        long now = System.currentTimeMillis();
        Long last = lastChanged.get(workId);
        if (!force && last != null && now - last < 300) return;
        lastChanged.put(workId, now);
        try {
            broker.publishApp("campaign.changed", summary(workId));
        } catch (RuntimeException e) {
            log.debug("summary for {} unavailable: {}", workId, e.toString());
        }
    }

    public void touch(String workId) {
        jdbc.update("UPDATE campaign_index SET updated_at = ? WHERE work_id = ?", Json.now(), workId);
    }

    public void noteShape(String workId, String shape) {
        jdbc.update("UPDATE campaign_index SET shape = ? WHERE work_id = ?", shape, workId);
    }

    // ------------------------------------------------------------------------------------------------ status

    /** The display status of §5.2, derived from the store row, the runtime registry and pending decisions. */
    public String displayStatus(String workId, String phase, String outcome, String indexStatus) {
        if (opening.contains(workId)) return "opening";
        if ("open_failed".equals(indexStatus)) return "open_failed";
        boolean live = host().isLive(workId);
        if (live) {
            if (cancelling.contains(workId)) return "cancelling";
            if (decisions.pendingCount(workId) > 0) return "needs_you";
            if ("Finishing".equals(phase)) return "finishing";
            return "running";
        }
        if (outcome != null) return outcome;
        if ("Running".equals(phase) || "Finishing".equals(phase) || "Opened".equals(phase)) return "interrupted";
        return phase == null ? "unknown" : phase.toLowerCase();
    }

    public ObjectNode summary(String workId) {
        List<ObjectNode> rows = jdbc.query("SELECT * FROM campaign_index WHERE work_id = ?", (rs, i) -> {
            ObjectNode o = Json.obj();
            String phase = rs.getString("phase");
            String outcome = rs.getString("outcome");
            o.put("workId", rs.getString("work_id"));
            o.put("projectId", rs.getString("project_id"));
            String custom = rs.getString("custom_title");
            o.put("title", custom != null ? custom : rs.getString("title"));
            o.put("phase", phase);
            o.put("outcome", outcome);
            o.put("reason", rs.getString("reason"));
            o.put("shape", rs.getString("shape"));
            o.put("mode", rs.getString("mode"));
            o.put("fingerprint", rs.getString("fingerprint"));
            o.put("demo", rs.getInt("demo") != 0);
            o.put("createdAt", rs.getString("created_at"));
            o.put("updatedAt", rs.getString("updated_at"));
            o.put("pinned", rs.getInt("pinned") != 0);
            o.put("archived", rs.getInt("archived") != 0);
            o.put("parentWork", rs.getString("parent_work"));
            o.put("indexStatus", rs.getString("status"));
            return o;
        }, workId);
        if (rows.isEmpty()) throw ApiException.notFound("no campaign " + workId);
        ObjectNode o = rows.getFirst();
        String status = displayStatus(workId, Json.text(o, "phase"), Json.text(o, "outcome"), Json.text(o, "indexStatus"));
        o.remove("indexStatus");
        o.put("displayStatus", status);
        o.put("live", host().isLive(workId));
        o.put("attached", host().isAttached(workId));
        o.put("attemptId", "a1");
        int pendingDecisions = decisions.pendingCount(workId);
        o.put("pendingDecisions", pendingDecisions);
        boolean resumable = RESUMABLE.contains(status) || "interrupted".equals(status);
        o.put("resumable", resumable);
        String projectId = Json.text(o, "projectId");
        Integer revision = projectId == null ? null : host().contractRevision(projectId, workId);
        if (revision != null) o.put("contractVersion", revision);
        var lease = host().leaseExpiry(workId);
        if (lease != null) o.put("leaseExpiresAt", lease.toString());
        ArrayNode actions = o.putArray("allowedActions");
        boolean live = host().isLive(workId);
        action(actions, "amend", live || resumable, live || resumable ? null : "the campaign is final");
        action(actions, "cancel", live && !cancelling.contains(workId), live ? null : "no live run");
        action(actions, "resume", resumable && !live, resumable ? null : "only waiting, blocked or interrupted campaigns resume");
        action(actions, "publish", host().isAttached(workId) && !live && "completed".equals(Json.text(o, "outcome")), "publication needs a finished campaign inside its publication window (G-22)");
        action(actions, "newFromThis", !live, null);
        return o;
    }

    private static void action(ArrayNode actions, String name, boolean enabled, String reason) {
        ObjectNode a = actions.addObject();
        a.put("name", name);
        a.put("enabled", enabled);
        if (!enabled && reason != null) a.put("reason", reason);
    }

    public ArrayNode list(String projectId, boolean includeArchived) {
        List<String> works = projectId == null
            ? jdbc.queryForList("SELECT work_id FROM campaign_index WHERE archived <= ? ORDER BY pinned DESC, updated_at DESC", String.class, includeArchived ? 1 : 0)
            : jdbc.queryForList("SELECT work_id FROM campaign_index WHERE project_id = ? AND archived <= ? ORDER BY pinned DESC, updated_at DESC", String.class, projectId, includeArchived ? 1 : 0);
        ArrayNode a = Json.arr();
        for (String w : works) a.add(summary(w));
        return a;
    }

    public void updateSession(String workId, String title, Boolean pinned, Boolean archived) {
        summary(workId);
        if (title != null) jdbc.update("UPDATE campaign_index SET custom_title = ? WHERE work_id = ?", title.isBlank() ? null : title, workId);
        if (pinned != null) jdbc.update("UPDATE campaign_index SET pinned = ? WHERE work_id = ?", pinned ? 1 : 0, workId);
        if (archived != null) jdbc.update("UPDATE campaign_index SET archived = ? WHERE work_id = ?", archived ? 1 : 0, workId);
        changed(workId, true);
    }

    // ------------------------------------------------------------------------------------------------ lifecycle

    /** `campaign.start` (§27.6): preflight, open (blocking: freeze, snapshot 0, contract, reconciliation, lease, shape), run. */
    public ObjectNode start(String projectId, String request, String annex, JsonNode options, String parentWork) {
        if (request == null || request.isBlank()) throw ApiException.invalid("a campaign needs a request");
        projects.require(projectId);
        projects.open(projectId);
        String running = host().runningWork(projectId);
        if (running != null) throw new ApiException("campaign_active", 409, "project already runs campaign " + running, false, null, List.of(), null, Json.obj().put("workId", running));
        ObjectNode runtime = settings.runtime(projectId);
        int max = runtime.path("maxConcurrentCampaigns").asInt(3);
        if (host().liveWorks().size() >= max) throw new ApiException("rate_limited", 429, "at most " + max + " campaigns run at once (Settings › Studio runtime)");

        ObjectNode overrides = Json.obj();
        if (options != null) {
            for (String k : List.of("mode", "ceiling", "dClass")) if (options.hasNonNull(k)) overrides.put(k, Json.text(options, k));
        }
        String configJson = settings.effectiveConfigJson(projectId, overrides);
        JsonNode config = Json.parse(configJson);
        String mainId = config.path("profileRoles").path("main").asString("");
        JsonNode main = config.path("profiles").path(mainId);
        if (main.isMissingNode()) throw new ApiException("config_invalid", 422, "no profile '" + mainId + "' is configured for the main routing function (Settings › Models & routing)");
        long cells = config.path("defaults").path("campaignCells").asLong(12);
        long tokens = options != null && options.hasNonNull("tokens") ? options.get("tokens").asLong()
            : runtime.hasNonNull("defaultTokens") ? runtime.get("defaultTokens").asLong()
            : main.path("capabilities").path("contextLimitTokens").asLong(128_000) * cells;
        String text = annex == null || annex.isBlank() ? request.strip()
            : request.strip() + "\n\n--- astrolabe-studio annex v1 · hints, not contract items ---\n" + annex.strip();
        String costAmount = options != null ? Json.text(options, "costAmount") : null;
        StartSpec spec = new StartSpec(
            text, tokens,
            costAmount == null ? null : Json.text(options, "costCurrency", "USD"), costAmount,
            options != null && Json.bool(options, "resumeExpected", false),
            (int) (options != null && options.hasNonNull("maxCells") ? options.get("maxCells").asLong() : runtime.path("maxCells").asLong(12)),
            runtime.path("leaseMinutes").asLong(480),
            options != null && options.hasNonNull("effort") ? Json.text(options, "effort") : Json.text(runtime, "effort", "Medium"),
            runtime.hasNonNull("maxOutputTokens") ? runtime.get("maxOutputTokens").asInt() : null);
        boolean demo = FixtureBrain.PROVIDER.equals(main.path("provider").asString(""));
        String workId = host().newWorkId();
        String now = Json.now();
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, mode, demo, parent_work, created_at, updated_at, options_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
            workId, projectId, firstLine(request), "opening", config.path("mode").asString("Interactive"), demo ? 1 : 0, parentWork, now, now,
            options == null ? null : Json.write(options));
        opening.add(workId);
        changed(workId, true);
        pipeline.expect(workId, projectId);
        try {
            CampaignRef ref = host().start(projectId, workId, spec, configJson, transport.llm(), decisions, decisions,
                new AutonomousPolicyOptions(runtime.path("acceptNonWeakening").asBoolean(false), Json.text(runtime, "reviewer")),
                (w, outcome, reason, failure) -> onRunEnded(w, outcome, reason, failure));
            opening.remove(workId);
            jdbc.update("UPDATE campaign_index SET status = 'started', shape = ?, fingerprint = ? WHERE work_id = ?", ref.getShape(), ref.getFingerprint(), workId);
            pipeline.studioItem(workId, "studio.opened", opened(ref, spec, demo));
            refresh(workId);
            return summary(workId);
        } catch (RuntimeException e) {
            opening.remove(workId);
            ApiException api = ErrorHandling.translate(e);
            jdbc.update("UPDATE campaign_index SET status = 'open_failed', reason = ? WHERE work_id = ?", api.getMessage(), workId);
            pipeline.studioItem(workId, "studio.open_failed", Json.obj().put("code", api.code()).put("message", api.getMessage()));
            changed(workId, true);
            throw api;
        }
    }

    private static ObjectNode opened(CampaignRef ref, StartSpec spec, boolean demo) {
        ObjectNode o = Json.obj();
        o.put("workId", ref.getWorkId());
        o.put("attemptId", ref.getAttemptId());
        o.put("shape", ref.getShape());
        o.put("contractVersion", ref.getContractVersion());
        o.put("fingerprint", ref.getFingerprint());
        o.set("reconciliation", Json.parse(ref.getReconciliationJson()));
        if (ref.getStopReason() != null) o.put("stopReason", ref.getStopReason());
        o.put("tokens", spec.getTokens());
        o.put("maxCells", spec.getMaxCells());
        o.put("leaseMinutes", spec.getLeaseMinutes());
        o.put("effort", spec.getEffort());
        o.put("demo", demo);
        return o;
    }

    private void onRunEnded(String workId, String outcome, String reason, Throwable failure) {
        cancelling.remove(workId);
        String why = outcome == null ? "campaign run stopped: " + (reason == null ? "unknown" : reason) : "campaign ended " + outcome;
        decisions.expireForWork(workId, why);
        ObjectNode data = Json.obj();
        data.put("outcome", outcome);
        data.put("reason", reason);
        if (failure != null) data.put("failure", failure.getClass().getSimpleName() + (failure.getMessage() == null ? "" : ": " + failure.getMessage()));
        pipeline.runEnded(workId, data);
        refresh(workId);
        if (outcome != null) {
            ObjectNode note = summary(workId);
            broker.publishApp("notification", Json.obj().put("kind", "campaign.finished").put("workId", workId)
                .put("projectId", Json.text(note, "projectId")).put("title", "Campaign " + outcome.replace('_', ' ')).put("body", Json.text(note, "title")));
        }
    }

    /** `campaign.resume` (G-01): unreconciled intents under `Host` fence it (§5.5, AS-13); an amendment may precede it. */
    public ObjectNode resume(String workId, String amendment) {
        ObjectNode s = summary(workId);
        String projectId = Json.text(s, "projectId");
        projects.open(projectId);
        if (host().isLive(workId)) throw new ApiException("campaign_active", 409, "campaign " + workId + " is running");
        if (!s.get("resumable").asBoolean()) throw new ApiException("not_resumable", 409, "campaign " + workId + " is " + Json.text(s, "displayStatus") + "; only waiting, blocked or interrupted campaigns resume");
        String running = host().runningWork(projectId);
        if (running != null) throw new ApiException("campaign_active", 409, "project already runs campaign " + running);
        String configJson = settings.effectiveConfigJson(projectId, null);
        JsonNode config = Json.parse(configJson);
        if ("Host".equals(config.path("unknownOutcomeReconciliation").asString("Host"))) {
            JsonNode unknown = Json.parse(host().intents(projectId, "Unknown"));
            int open = 0;
            for (JsonNode i : unknown) if (workId.equals(Json.text(i, "workId"))) open++;
            if (open > 0) throw new ApiException("unreconciled_intents", 409, open + " effect(s) with unknown outcome must be reconciled before resume (Reconcile wizard)", false, null, List.of(), null, unknown);
        }
        if (amendment != null && !amendment.isBlank()) host().amend(projectId, workId, amendment.strip());
        ObjectNode runtime = settings.runtime(projectId);
        StartSpec spec = new StartSpec("resume", 1, null, null, false, runtime.path("maxCells").asInt(12), runtime.path("leaseMinutes").asLong(480),
            Json.text(runtime, "effort", "Medium"), runtime.hasNonNull("maxOutputTokens") ? runtime.get("maxOutputTokens").asInt() : null);
        opening.add(workId);
        changed(workId, true);
        pipeline.expect(workId, projectId);
        try {
            CampaignRef ref = host().resume(projectId, workId, spec, configJson, transport.llm(), decisions, decisions,
                new AutonomousPolicyOptions(runtime.path("acceptNonWeakening").asBoolean(false), Json.text(runtime, "reviewer")),
                (w, outcome, reason, failure) -> onRunEnded(w, outcome, reason, failure));
            opening.remove(workId);
            ObjectNode data = opened(ref, spec, s.get("demo").asBoolean());
            data.put("resumed", true);
            pipeline.studioItem(workId, "studio.opened", data);
            refresh(workId);
            return summary(workId);
        } catch (RuntimeException e) {
            opening.remove(workId);
            changed(workId, true);
            throw ErrorHandling.translate(e);
        }
    }

    /** `campaign.cancel`: through the cancellation token — the outcome is final (R-CMP-06, AS-11). */
    public ObjectNode cancel(String workId, String reason) {
        if (!host().isLive(workId)) throw new ApiException("not_resumable", 409, "campaign " + workId + " has no live run to cancel");
        cancelling.add(workId);
        host().cancel(workId, reason == null || reason.isBlank() ? "cancelled by the user" : reason);
        pipeline.studioItem(workId, "studio.cancel_requested", Json.obj().put("reason", reason == null ? "" : reason));
        changed(workId, true);
        return summary(workId);
    }

    /** `campaign.amend` (R-CMP-02): bound to the contract revision the user saw; returns the new version. */
    public ObjectNode amend(String workId, String text, Integer expectedRevision) {
        if (text == null || text.isBlank()) throw ApiException.invalid("an amendment needs text");
        ObjectNode s = summary(workId);
        String projectId = Json.text(s, "projectId");
        projects.open(projectId);
        Integer current = host().contractRevision(projectId, workId);
        if (expectedRevision != null && current != null && !expectedRevision.equals(current)) {
            throw ApiException.superseded(current, "contract moved to v" + current + " — review before amending");
        }
        boolean live = host().isLive(workId);
        if (!live && !s.get("resumable").asBoolean()) throw new ApiException("not_resumable", 409, "a final campaign cannot be amended; start a new campaign from it");
        int version = host().amend(projectId, workId, text.strip());
        if (!live) pipeline.tailNow(workId);
        refresh(workId);
        return Json.obj().put("workId", workId).put("version", version);
    }

    public ObjectNode resolveAmendment(String workId, String amendmentId, String outcome, String reason, JsonNode patch) {
        String projectId = Json.text(summary(workId), "projectId");
        int version = host().resolveAmendment(projectId, workId, amendmentId, outcome, reason, patch == null || patch.isNull() ? null : Json.write(patch)).join();
        refresh(workId);
        return Json.obj().put("workId", workId).put("version", version);
    }

    public ObjectNode reconcileIntent(String projectId, String intentId, String evidence) {
        host().reconcileIntent(projectId, intentId, evidence);
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), "user", "intent.reconcile", intentId, evidence);
        return Json.obj().put("intentId", intentId).put("reconciled", true);
    }

    public ObjectNode publish(String workId, JsonNode args) {
        String through = Json.text(args, "through");
        if (through == null) throw ApiException.invalid("publication needs a target stage");
        java.util.Set<String> remotes = new java.util.LinkedHashSet<>();
        for (JsonNode r : Json.each(args.get("knownRemotes"))) remotes.add(r.asString());
        String result = host().publish(workId, through, Json.text(args, "remote"), Json.text(args, "mergeTarget"),
            Json.text(args, "deployName"), Json.bool(args, "deployProduction", false), remotes, Json.text(args, "message")).join();
        ObjectNode data = (ObjectNode) Json.parse(result);
        pipeline.studioItem(workId, "studio.publication", data);
        refresh(workId);
        return data;
    }

    public void onProjectOpened(String projectId) {
        syncProject(projectId);
    }

    static String firstLine(String text) {
        if (text == null) return null;
        String line = text.strip().lines().findFirst().orElse("");
        return line.length() > 140 ? line.substring(0, 137) + "…" : line;
    }
}
