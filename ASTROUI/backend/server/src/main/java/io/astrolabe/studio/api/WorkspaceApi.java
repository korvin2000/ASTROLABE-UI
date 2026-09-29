package io.astrolabe.studio.api;

import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.providers.ProviderService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.runtime.Telemetry;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.stats.StatsService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Decisions, settings, providers, models, profiles, statistics and activity (§28). */
@RestController
@RequestMapping("/api/v1")
public class WorkspaceApi {
    private final DecisionService decisions;
    private final SettingsService settings;
    private final ProviderService providers;
    private final StatsService stats;
    private final CampaignService campaigns;
    private final ProjectService projects;
    private final HostService hosts;
    private final Telemetry telemetry;

    public WorkspaceApi(DecisionService decisions, SettingsService settings, ProviderService providers, StatsService stats, CampaignService campaigns,
                        ProjectService projects, HostService hosts, Telemetry telemetry) {
        this.decisions = decisions;
        this.settings = settings;
        this.providers = providers;
        this.stats = stats;
        this.campaigns = campaigns;
        this.projects = projects;
        this.hosts = hosts;
        this.telemetry = telemetry;
    }

    // ---- decisions ------------------------------------------------------------------------------------------

    @GetMapping("/decisions")
    public ResponseEntity<String> decisions(@RequestParam(required = false) String status, @RequestParam(required = false) String work, @RequestParam(defaultValue = "200") int limit) {
        return Raw.json(decisions.list(status, work, Math.min(limit, 1000)));
    }

    @GetMapping("/decisions/{id}")
    public ResponseEntity<String> decision(@PathVariable String id) { return Raw.json(decisions.get(id)); }

    // ---- settings -------------------------------------------------------------------------------------------

    @GetMapping("/settings")
    public ResponseEntity<String> settings(@RequestParam(defaultValue = SettingsService.STUDIO) String scope) { return Raw.json(settings.view(scope)); }

    @PostMapping("/settings/validate")
    public ResponseEntity<String> validate(@RequestBody JsonNode body) {
        if (!(body.get("layer") instanceof ObjectNode layer)) throw ApiException.invalid("validate needs {scope, layer}");
        return Raw.json(settings.validate(Json.text(body, "scope", SettingsService.STUDIO), layer));
    }

    @GetMapping("/settings/presets")
    public ResponseEntity<String> presets() { return Raw.json(SettingsService.presets()); }

    @GetMapping("/settings/effective")
    public ResponseEntity<String> effective(@RequestParam(required = false) String project) {
        ObjectNode o = Json.obj();
        o.set("config", Json.parse(settings.effectiveConfigJson(project, null)));
        o.set("runtime", settings.runtime(project));
        return Raw.json(o);
    }

    // ---- providers, models, profiles ------------------------------------------------------------------------

    @GetMapping("/providers")
    public ResponseEntity<String> providers() { return Raw.json(providers.list()); }

    @GetMapping("/providers/{id}")
    public ResponseEntity<String> provider(@PathVariable String id) { return Raw.json(providers.get(id)); }

    /** Write-only credential entry (R-PRV-01): the key is never echoed or logged. */
    @PostMapping("/providers/{id}/credentials")
    public ResponseEntity<String> credentials(@PathVariable String id, @RequestBody JsonNode body) {
        return Raw.json(providers.saveApiKey(id, Json.text(body, "apiKey"), "local"));
    }

    @GetMapping("/providers/{id}/health")
    public ResponseEntity<String> providerHealth(@PathVariable String id) { return Raw.json(providers.health(id)); }

    @GetMapping("/models")
    public ResponseEntity<String> models(@RequestParam(required = false) String provider, @RequestParam(required = false) String q) {
        return Raw.json(providers.models(provider, q));
    }

    @PostMapping("/models/refresh")
    public ResponseEntity<String> refresh() { return Raw.json(providers.refreshCatalog()); }

    @GetMapping("/profiles")
    public ResponseEntity<String> profiles() { return Raw.json(providers.profiles()); }

    @PutMapping("/profiles/{id}")
    public ResponseEntity<String> updateProfile(@PathVariable String id, @RequestBody JsonNode body) {
        return Raw.json(providers.update(id, body.has("profile") ? body.get("profile") : body, "local"));
    }

    @DeleteMapping("/profiles/{id}")
    public ResponseEntity<String> deleteProfile(@PathVariable String id) {
        providers.delete(id, "local");
        return Raw.json(Json.obj().put("deleted", id));
    }

    @PostMapping("/profiles/{id}/validate")
    public ResponseEntity<String> validateProfile(@PathVariable String id) { return Raw.json(providers.validateAndMark(id)); }

    // ---- statistics and activity ----------------------------------------------------------------------------

    @GetMapping("/stats")
    public ResponseEntity<String> stats(@RequestParam(required = false) String scope) { return Raw.json(stats.stats(scope)); }

    /** Activity (§14): live campaigns, in-flight provider calls, background processes and unknown intents. */
    @GetMapping("/activity")
    public ResponseEntity<String> activity() {
        ObjectNode o = Json.obj();
        ArrayNode live = o.putArray("campaigns");
        for (String w : hosts.host().liveWorks()) live.add(campaigns.summary(w));
        o.set("providerCalls", Json.tree(telemetry.inFlight()));
        ArrayNode handles = o.putArray("processes");
        ArrayNode intents = o.putArray("intents");
        for (var p : projects.rows()) {
            if (!hosts.host().isOpen(p.id())) continue;
            for (JsonNode h : Json.parse(hosts.host().handles(p.id()))) {
                ((ObjectNode) h).put("projectId", p.id());
                handles.add(h);
            }
            for (JsonNode i : Json.parse(hosts.host().intents(p.id(), null))) {
                String status = Json.text(i, "status", "");
                if (!status.equalsIgnoreCase("Committed")) {
                    ((ObjectNode) i).put("projectId", p.id());
                    intents.add(i);
                }
            }
        }
        return Raw.json(o);
    }
}
