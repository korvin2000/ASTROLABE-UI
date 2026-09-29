package io.astrolabe.studio.api;

import java.util.List;

import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.changes.ChangesService;
import io.astrolabe.studio.live.EventLog;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.stats.StatsService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Campaign views (§28): summary, stream pages, contract, plan, cells, register, evidence, changes, economics. */
@RestController
@RequestMapping("/api/v1/campaigns")
public class CampaignsApi {
    private final CampaignService campaigns;
    private final ProjectService projects;
    private final HostService hosts;
    private final EventLog eventLog;
    private final EventPipeline pipeline;
    private final ChangesService changes;
    private final StatsService stats;

    public CampaignsApi(CampaignService campaigns, ProjectService projects, HostService hosts, EventLog eventLog, EventPipeline pipeline, ChangesService changes, StatsService stats) {
        this.campaigns = campaigns;
        this.projects = projects;
        this.hosts = hosts;
        this.eventLog = eventLog;
        this.pipeline = pipeline;
        this.changes = changes;
        this.stats = stats;
    }

    /** The project of [work], opened on demand. */
    private String project(String work) {
        String p = campaigns.projectOf(work);
        if (p == null) throw ApiException.notFound("no campaign " + work);
        projects.open(p);
        return p;
    }

    @GetMapping
    public ResponseEntity<String> list(@RequestParam(required = false) String project) { return Raw.json(campaigns.list(project, false)); }

    @GetMapping("/{work}")
    public ResponseEntity<String> summary(@PathVariable String work) { return Raw.json(campaigns.summary(work)); }

    /** The campaign store row: `CampaignState` with phase, outcome, graph and cells. */
    @GetMapping("/{work}/state")
    public ResponseEntity<String> state(@PathVariable String work) { return Raw.json(hosts.host().campaign(project(work), work)); }

    @GetMapping("/{work}/events")
    public ResponseEntity<String> events(@PathVariable String work, @RequestParam(defaultValue = "0") long after, @RequestParam(defaultValue = "2000") int limit) {
        pipeline.backfillIfEmpty(work);
        ArrayNode a = Json.arr();
        eventLog.after(work, after, Math.min(limit, 5000)).forEach(a::add);
        return Raw.json(a);
    }

    @GetMapping("/{work}/contract")
    public ResponseEntity<String> contract(@PathVariable String work) {
        String p = project(work);
        ObjectNode o = Json.obj();
        o.set("view", Json.parse(hosts.host().contract(p, work)));
        o.set("versions", Json.parse(hosts.host().contractVersions(p, work)));
        o.set("requests", Json.parse(hosts.host().requests(p, work)));
        return Raw.json(o);
    }

    @GetMapping("/{work}/ledger")
    public ResponseEntity<String> ledger(@PathVariable String work) { return Raw.json(hosts.host().ledger(project(work), work)); }

    @GetMapping("/{work}/cells")
    public ResponseEntity<String> cells(@PathVariable String work) { return Raw.json(hosts.host().cells(project(work), work)); }

    @GetMapping("/{work}/cells/{ctx}/turns")
    public ResponseEntity<String> turns(@PathVariable String work, @PathVariable String ctx) { return Raw.json(hosts.host().turns(project(work), ctx)); }

    @GetMapping("/{work}/register/{ctx}")
    public ResponseEntity<String> register(@PathVariable String work, @PathVariable String ctx, @RequestParam(defaultValue = "false") boolean history) {
        String p = project(work);
        if (history) return Raw.json(hosts.host().registerVersions(p, ctx));
        return Raw.json(hosts.host().register(p, ctx));
    }

    @GetMapping("/{work}/workset/{ctx}")
    public ResponseEntity<String> workset(@PathVariable String work, @PathVariable String ctx) { return Raw.json(hosts.host().workset(project(work), ctx)); }

    @GetMapping("/{work}/manifests/{ctx}")
    public ResponseEntity<String> manifests(@PathVariable String work, @PathVariable String ctx) { return Raw.json(hosts.host().manifests(project(work), ctx)); }

    @GetMapping("/{work}/checks")
    public ResponseEntity<String> checks(@PathVariable String work) {
        String p = project(work);
        ObjectNode o = Json.obj();
        o.set("view", Json.parse(hosts.host().checks(p, work)));
        o.set("receipts", Json.parse(hosts.host().receiptRows(p, work)));
        o.set("stamps", Json.parse(hosts.host().stamps(p, work)));
        return Raw.json(o);
    }

    @GetMapping("/{work}/finish-receipt")
    public ResponseEntity<String> finishReceipt(@PathVariable String work) {
        String receipt = hosts.host().finishReceipt(project(work), work);
        if (receipt == null) {
            return Raw.json(Json.obj().put("available", false).put("reason", "no finish receipt yet: the campaign has not finished"));
        }
        return Raw.json(Json.obj().put("available", true).set("receipt", Json.parse(receipt)));
    }

    @GetMapping("/{work}/budget")
    public ResponseEntity<String> budget(@PathVariable String work) { return Raw.json(stats.campaign(project(work), work)); }

    @GetMapping("/{work}/routing")
    public ResponseEntity<String> routing(@PathVariable String work) { return Raw.json(hosts.host().routing(project(work), work)); }

    @GetMapping("/{work}/packets")
    public ResponseEntity<String> packets(@PathVariable String work, @RequestParam(required = false) String kind) {
        return Raw.json(hosts.host().packets(project(work), work, kind));
    }

    @GetMapping("/{work}/attempt-config")
    public ResponseEntity<String> attemptConfig(@PathVariable String work) { return Raw.json(hosts.host().attemptConfig(project(work), work)); }

    @GetMapping("/{work}/claims")
    public ResponseEntity<String> claims(@PathVariable String work) { return Raw.json(hosts.host().claims(project(work), work)); }

    @GetMapping("/{work}/journal/search")
    public ResponseEntity<String> search(@PathVariable String work, @RequestParam String q, @RequestParam(defaultValue = "100") int limit) {
        return Raw.json(hosts.host().journalSearch(project(work), work, q, limit));
    }

    /** `#n` → observation → content blob (served kinds only). */
    @GetMapping("/{work}/aliases/{n}")
    public ResponseEntity<String> alias(@PathVariable String work, @PathVariable long n) {
        String p = project(work);
        String json = hosts.host().alias(p, work, n);
        if (json == null) throw ApiException.notFound("no alias #" + n);
        ObjectNode o = (ObjectNode) Json.parse(json);
        String blob = Json.text(o, "contentBlob");
        if (blob != null) {
            JsonNode meta = Json.parse(hosts.host().blobMeta(p, blob));
            String kind = Json.text(meta, "kind", "");
            if (!meta.path("recovery").asBoolean(false) && List.of("OUTPUT", "LOG", "DIFF", "PACKET", "MODULE").contains(kind)) {
                byte[] bytes = hosts.host().blobBytes(p, blob);
                int cap = Math.min(bytes.length, 512 * 1024);
                o.put("content", new String(bytes, 0, cap, java.nio.charset.StandardCharsets.UTF_8));
                o.put("contentTruncated", bytes.length > cap);
                o.put("contentKind", kind);
            }
        }
        return Raw.json(o);
    }

    @GetMapping("/{work}/changes")
    public ResponseEntity<String> changes(@PathVariable String work, @RequestParam(required = false) Integer from, @RequestParam(required = false) Integer to,
                                          @RequestParam(defaultValue = "true") boolean ignoreEol) {
        return Raw.json(changes.changes(project(work), work, from, to, ignoreEol));
    }

    @GetMapping("/{work}/diff")
    public ResponseEntity<String> diff(@PathVariable String work, @RequestParam(required = false) Integer from, @RequestParam(required = false) Integer to, @RequestParam(required = false) String path,
                                       @RequestParam(defaultValue = "true") boolean ignoreEol) {
        return Raw.json(changes.diff(project(work), work, from, to, path, ignoreEol));
    }

    @GetMapping("/{work}/patch")
    public ResponseEntity<String> patch(@PathVariable String work, @RequestParam(defaultValue = "true") boolean agentOnly) {
        String patch = changes.patch(project(work), work, agentOnly);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + work + (agentOnly ? "-agent" : "") + ".patch\"")
            .contentType(MediaType.TEXT_PLAIN).body(patch);
    }

    @GetMapping("/{work}/publication")
    public ResponseEntity<String> publication(@PathVariable String work) {
        String result = hosts.host().publicationResult(work);
        ObjectNode o = Json.obj();
        o.put("attached", hosts.host().isAttached(work));
        var lease = hosts.host().leaseExpiry(work);
        if (lease != null) o.put("windowExpiresAt", lease.toString());
        if (result != null) o.set("result", Json.parse(result));
        return Raw.json(o);
    }
}
