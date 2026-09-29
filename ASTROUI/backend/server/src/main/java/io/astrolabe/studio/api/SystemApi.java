package io.astrolabe.studio.api;

import io.astrolabe.studio.StudioProperties;
import io.astrolabe.studio.bridge.Versions;
import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.commands.CommandService;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.live.EventLog;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.providers.ProviderService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.runtime.Telemetry;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.security.LocalSession;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.Json;
import io.astrolabe.studio.ws.StudioSocket;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** System routes (§28): health, host facts, one-call bootstrap for the workspace, command fallback and status. */
@RestController
@RequestMapping("/api/v1")
public class SystemApi {
    private final HostService hosts;
    private final ProjectService projects;
    private final CampaignService campaigns;
    private final DecisionService decisions;
    private final ProviderService providers;
    private final SettingsService settings;
    private final CommandService commands;
    private final EventLog eventLog;
    private final EventPipeline pipeline;
    private final TopicBroker broker;
    private final Telemetry telemetry;
    private final TransportService transport;
    private final LocalSession session;
    private final StudioProperties properties;

    public SystemApi(HostService hosts, ProjectService projects, CampaignService campaigns, DecisionService decisions, ProviderService providers,
                     SettingsService settings, CommandService commands, EventLog eventLog, EventPipeline pipeline, TopicBroker broker,
                     Telemetry telemetry, TransportService transport, LocalSession session, StudioProperties properties) {
        this.hosts = hosts;
        this.projects = projects;
        this.campaigns = campaigns;
        this.decisions = decisions;
        this.providers = providers;
        this.settings = settings;
        this.commands = commands;
        this.eventLog = eventLog;
        this.pipeline = pipeline;
        this.broker = broker;
        this.telemetry = telemetry;
        this.transport = transport;
        this.session = session;
        this.properties = properties;
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() { return Raw.json(Json.obj().put("status", "ok")); }

    @GetMapping("/host")
    public ResponseEntity<String> host() { return Raw.json(hostJson()); }

    private ObjectNode hostJson() {
        ObjectNode o = Json.obj();
        o.put("studioVersion", "0.1.0");
        o.put("astrolabeVersion", Versions.getAstrolabe());
        o.put("schemaVersion", Versions.getStoreSchema());
        o.put("aiGateVersion", Versions.getAiGate());
        o.put("jdk", Runtime.version().toString());
        o.put("os", System.getProperty("os.name") + " " + System.getProperty("os.arch"));
        o.put("platformSupported", !System.getProperty("os.name", "").toLowerCase().contains("mac"));
        o.put("dataDir", transport.dataDir().toString());
        o.put("credentialStorage", transport.credentialStorage());
        o.put("security", session.security());
        o.put("epoch", StudioSocket.EPOCH);
        o.put("fixtures", properties.fixtures());
        ObjectNode counters = o.putObject("counters");
        counters.put("busRecordsReceived", pipeline.received());
        counters.put("busRecordsDropped", pipeline.dropped());
        counters.put("busSinkFailures", hosts.host().busSinkFailures());
        counters.put("busLastSeq", hosts.host().busLastSeq());
        counters.put("eventLogItems", eventLog.count());
        counters.put("gaps", eventLog.gaps());
        counters.put("webSocketSessions", broker.clients().size());
        counters.put("framesSent", broker.sent());
        counters.put("sendFailures", broker.failures());
        counters.put("pendingDecisions", decisions.pendingCount(null));
        counters.put("liveCampaigns", hosts.host().liveWorks().size());
        counters.put("inFlightProviderCalls", telemetry.inFlight().size());
        Runtime rt = Runtime.getRuntime();
        counters.put("heapUsedMb", (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024));
        return o;
    }

    /** Everything the shell needs on first paint (the workspace then subscribes to `app` for changes). */
    @GetMapping("/bootstrap")
    public ResponseEntity<String> bootstrap() {
        ObjectNode o = Json.obj();
        o.set("host", hostJson());
        o.set("projects", projects.list());
        o.set("campaigns", campaigns.list(null, false));
        o.set("decisions", decisions.list("pending", null, 500));
        ArrayNode providerList = providers.list();
        ArrayNode connected = Json.arr();
        for (JsonNode p : providerList) {
            String state = p.path("auth").path("state").asString("NOT_CONFIGURED");
            boolean keyless = p.path("keyless").asBoolean(false);
            boolean tested = p.path("lastTest").path("ok").asBoolean(false);
            // Keyless local servers report CONFIGURED without any credential: they count once a connection test passed.
            if (p.path("demo").asBoolean(false) || (!"NOT_CONFIGURED".equals(state) && (!keyless || tested))) connected.add(p);
        }
        o.set("providers", connected);
        o.set("profiles", providers.profiles());
        ObjectNode runtime = settings.runtime(null);
        o.set("runtime", runtime);
        JsonNode effective = Json.parse(settings.effectiveConfigJson(null, null));
        ObjectNode cfg = o.putObject("config");
        cfg.set("profileRoles", effective.get("profileRoles"));
        cfg.put("mode", Json.text(effective, "mode"));
        cfg.put("ceiling", Json.text(effective, "ceiling"));
        cfg.put("dClass", Json.text(effective, "dClass"));
        cfg.put("executionMode", Json.text(effective, "executionMode"));
        cfg.put("unknownOutcomeReconciliation", Json.text(effective, "unknownOutcomeReconciliation"));
        cfg.put("campaignCells", effective.path("defaults").path("campaignCells").asInt());
        cfg.put("turnsPerCell", effective.path("defaults").path("turnsPerCell").asInt());
        cfg.put("alpha", effective.path("defaults").path("alpha").asDouble());
        cfg.put("registerCapTokens", effective.path("defaults").path("registerCapTokens").asInt());
        o.put("settingsRevision", settings.layer(SettingsService.STUDIO).revision());
        // The `app` topic resumes from here: items before the snapshot are already reflected in it.
        o.put("appSeq", broker.appHead());
        return Raw.json(o);
    }

    @PostMapping("/commands")
    public ResponseEntity<String> command(@RequestBody JsonNode envelope) {
        CommandService.Outcome outcome = commands.execute(envelope, "local");
        if (outcome.error() != null) {
            return ResponseEntity.status(outcome.error().status()).contentType(org.springframework.http.MediaType.parseMediaType("application/problem+json"))
                .body(Json.write(outcome.error().toJson(Json.text(envelope, "id"))));
        }
        ObjectNode o = Json.obj();
        o.put("id", Json.text(envelope, "id"));
        o.put("status", outcome.status());
        if (outcome.result() != null) o.set("result", outcome.result());
        return Raw.json(o);
    }

    @GetMapping("/operations/{id}")
    public ResponseEntity<String> operation(@PathVariable String id) { return Raw.json(commands.status(id)); }

    @GetMapping("/diagnostics")
    public ResponseEntity<String> diagnostics() {
        ObjectNode o = hostJson();
        ArrayNode stores = o.putArray("projects");
        for (var r : projects.rows()) {
            ObjectNode p = stores.addObject().put("id", r.id()).put("name", r.name()).put("open", hosts.host().isOpen(r.id()));
            if (hosts.host().isOpen(r.id())) p.set("storeCounts", Json.parse(hosts.host().storeCounts(r.id())));
        }
        o.set("inFlight", Json.tree(telemetry.inFlight()));
        return Raw.json(o);
    }
}
