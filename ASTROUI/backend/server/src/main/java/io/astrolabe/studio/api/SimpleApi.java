package io.astrolabe.studio.api;

import java.util.ArrayList;
import java.util.List;

import io.astrolabe.studio.accounts.AccountService;
import io.astrolabe.studio.accounts.LoginService;
import io.astrolabe.studio.bridge.Versions;
import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.changes.ChangesService;
import io.astrolabe.studio.changes.LandingService;
import io.astrolabe.studio.fs.FolderService;
import io.astrolabe.studio.live.EventLog;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.models.ModelService;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.providers.ProviderService;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.security.LocalSession;
import io.astrolabe.studio.settings.Preferences;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;
import io.astrolabe.studio.tasks.DiagnosticsExport;
import io.astrolabe.studio.tasks.OutputService;
import io.astrolabe.studio.tasks.ProgressService;
import io.astrolabe.studio.tasks.ProjectSettings;
import io.astrolabe.studio.tasks.TaskService;

import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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

/**
 * The API of Studio 2 (§12.3): accounts, models, preferences, folders, projects and tasks. It is a thin layer that
 * configures the agent automatically; the endpoints of the first Studio stay and are not used by the new screens.
 */
@RestController
@RequestMapping("/api/v1")
public class SimpleApi {
    private final AccountService accounts;
    private final LoginService logins;
    private final ModelService models;
    private final Preferences preferences;
    private final FolderService folders;
    private final ProjectService projects;
    private final ProjectSettings projectSettings;
    private final TaskService tasks;
    private final CampaignService campaigns;
    private final ChangesService changes;
    private final LandingService landing;
    private final OutputService output;
    private final DiagnosticsExport diagnostics;
    private final TransportService transport;
    private final ProviderService providers;
    private final EventLog eventLog;
    private final EventPipeline pipeline;
    private final TopicBroker broker;
    private final LocalSession session;
    private final ProgressService progress;

    public SimpleApi(AccountService accounts, LoginService logins, ModelService models, Preferences preferences, FolderService folders, ProjectService projects,
                     ProjectSettings projectSettings, TaskService tasks, CampaignService campaigns, ChangesService changes, LandingService landing,
                     OutputService output, DiagnosticsExport diagnostics, TransportService transport, ProviderService providers, EventLog eventLog,
                     EventPipeline pipeline, TopicBroker broker, LocalSession session, ProgressService progress) {
        this.progress = progress;
        this.accounts = accounts;
        this.logins = logins;
        this.models = models;
        this.preferences = preferences;
        this.folders = folders;
        this.projects = projects;
        this.projectSettings = projectSettings;
        this.tasks = tasks;
        this.campaigns = campaigns;
        this.changes = changes;
        this.landing = landing;
        this.output = output;
        this.diagnostics = diagnostics;
        this.transport = transport;
        this.providers = providers;
        this.eventLog = eventLog;
        this.pipeline = pipeline;
        this.broker = broker;
        this.session = session;
    }

    // ------------------------------------------------------------------------------------------------ app

    /** Everything the shell needs on first paint; the client then follows the `app` topic from `appSeq`. */
    @GetMapping("/app")
    public ResponseEntity<String> app() {
        ObjectNode o = Json.obj();
        ArrayNode list = accounts.list();
        o.set("accounts", list);
        List<ModelService.Account> usable = accounts.usable();
        String ref = models.ensureDefault(usable);
        if (ref != null) o.set("defaultModel", models.describe(ref, usable)); else o.putNull("defaultModel");
        o.set("preferences", publicPreferences());
        o.set("projects", projects.list());
        ArrayNode all = tasks.tasks();
        o.set("tasks", all);
        int needsYou = 0;
        for (JsonNode t : all) if ("needs_you".equals(Json.text(t, "state"))) needsYou++;
        o.put("needsYou", needsYou);
        ObjectNode host = o.putObject("host");
        host.put("version", "0.2.0");
        host.put("agentVersion", Versions.getAstrolabe());
        host.put("dataDir", transport.dataDir().toString());
        host.put("demoMode", transport.demoMode());
        host.put("platformSupported", !System.getProperty("os.name", "").toLowerCase().contains("mac"));
        host.put("security", session.security());
        o.put("appSeq", broker.appHead());
        return Raw.json(o);
    }

    private ObjectNode publicPreferences() {
        ObjectNode p = preferences.all();
        p.remove(Preferences.ENV_KEYS);
        p.remove(Preferences.LOCAL_SERVERS);
        return p;
    }

    // ------------------------------------------------------------------------------------------------ accounts

    @GetMapping("/accounts")
    public ResponseEntity<String> accounts() { return Raw.json(accounts.list()); }

    @GetMapping("/accounts/presets")
    public ResponseEntity<String> presets() { return Raw.json(accounts.presets()); }

    @PostMapping("/accounts")
    public ResponseEntity<String> connect(@RequestBody JsonNode body) { return Raw.json(accounts.connect(body, "local")); }

    @DeleteMapping("/accounts/{id}")
    public ResponseEntity<String> remove(@PathVariable String id) { return Raw.json(accounts.remove(id, "local")); }

    @GetMapping("/accounts/{id}/impact")
    public ResponseEntity<String> impact(@PathVariable String id) { return Raw.json(accounts.removalImpact(id)); }

    @PostMapping("/accounts/detect")
    public ResponseEntity<String> detect() { return Raw.json(accounts.detect()); }

    @PostMapping("/accounts/login")
    public ResponseEntity<String> login(@RequestBody JsonNode body) { return Raw.json(logins.start(Json.text(body, "provider"), Json.text(body, "method"))); }

    @GetMapping("/accounts/login/{id}")
    public ResponseEntity<String> loginState(@PathVariable String id) { return Raw.json(logins.get(id)); }

    @PostMapping("/accounts/login/{id}/cancel")
    public ResponseEntity<String> loginCancel(@PathVariable String id) { return Raw.json(logins.cancel(id)); }

    // ------------------------------------------------------------------------------------------------ models, preferences

    @GetMapping("/models/usable")
    public ResponseEntity<String> usableModels() { return Raw.json(accounts.usableModels()); }

    /** Setting 16: a paid calibration of the default model; the narrowed description is kept when it passes. */
    @PostMapping("/models/calibrate")
    public ResponseEntity<String> calibrate(@RequestBody JsonNode body) {
        if (!Json.bool(body, "confirm", false)) throw new ApiException("confirmation_required", 422, "calibration makes 3 to 5 short paid requests");
        String ref = models.ensureDefault(accounts.usable());
        ModelService.Bound bound = models.bind(ref);
        JsonNode report = providers.qualify(bound.profileId(), true, "local");
        ObjectNode o = Json.obj();
        boolean qualified = report.path("qualified").asBoolean(false);
        o.put("qualified", qualified);
        o.put("model", ref);
        o.set("problems", report.path("problems"));
        o.set("notes", report.path("notes"));
        if (qualified) providers.freeze(bound.profileId(), "local");
        return Raw.json(o);
    }

    @GetMapping("/preferences")
    public ResponseEntity<String> preferences() { return Raw.json(publicPreferences()); }

    @PutMapping("/preferences")
    public ResponseEntity<String> putPreferences(@RequestBody JsonNode body) {
        if (!body.isObject()) throw ApiException.invalid("preferences are an object");
        boolean demoBefore = transport.demoMode();
        for (var e : body.properties()) {
            if (e.getKey().equals(Preferences.ENV_KEYS) || e.getKey().equals(Preferences.LOCAL_SERVERS)) throw ApiException.invalid(e.getKey() + " is changed through accounts");
            preferences.set(e.getKey(), e.getValue());
        }
        if (demoBefore != transport.demoMode()) demoChanged();
        broker.publishApp("preferences.changed", publicPreferences());
        return Raw.json(publicPreferences());
    }

    @PostMapping("/preferences/reset")
    public ResponseEntity<String> resetPreferences(@RequestBody JsonNode body) {
        if (!Json.bool(body, "confirm", false)) throw new ApiException("confirmation_required", 422, "resetting the settings needs a confirmation");
        boolean demoBefore = transport.demoMode();
        preferences.reset();
        if (demoBefore != transport.demoMode()) demoChanged();
        models.ensureDefault(accounts.usable());
        broker.publishApp("preferences.changed", publicPreferences());
        return Raw.json(publicPreferences());
    }

    /** Demo mode switched: the demo account, its model and the demo project come or go together (BE-9). */
    private void demoChanged() {
        transport.rebuild();
        if (transport.demoMode()) {
            var demo = projects.ensureDemo();
            projects.open(demo.id());
            campaigns.onProjectOpened(demo.id());
        }
        models.ensureDefault(accounts.usable());
        accounts.changed("studio-demo");
        broker.publishApp("project.changed", Json.obj().put("change", "demo"));
    }

    // ------------------------------------------------------------------------------------------------ folders, projects

    @GetMapping("/fs/folders")
    public ResponseEntity<String> folders(@RequestParam(required = false) String path) { return Raw.json(folders.list(path)); }

    @PostMapping("/fs/git-init")
    public ResponseEntity<String> gitInit(@RequestBody JsonNode body) { return Raw.json(folders.gitInit(Json.text(body, "path"))); }

    @PostMapping("/projects")
    public ResponseEntity<String> addProject(@RequestBody JsonNode body) {
        ObjectNode project = folders.addProject(Json.text(body, "path"));
        campaigns.onProjectOpened(Json.text(project, "id"));
        preferences.set(Preferences.LAST_PROJECT, project.get("id"));
        return Raw.json(project);
    }

    @DeleteMapping("/projects/{id}")
    public ResponseEntity<String> removeProject(@PathVariable String id) {
        projects.remove(id);
        return Raw.json(Json.obj().put("removed", id));
    }

    @GetMapping("/projects/{id}/settings")
    public ResponseEntity<String> projectSettings(@PathVariable String id) { return Raw.json(projectSettings.get(id)); }

    @PutMapping("/projects/{id}/settings")
    public ResponseEntity<String> putProjectSettings(@PathVariable String id, @RequestBody JsonNode body) { return Raw.json(projectSettings.put(id, body, "local")); }

    // ------------------------------------------------------------------------------------------------ tasks

    @GetMapping("/tasks")
    public ResponseEntity<String> tasks() { return Raw.json(tasks.tasks()); }

    @PostMapping("/tasks")
    public ResponseEntity<String> start(@RequestBody JsonNode body) {
        return Raw.json(tasks.start(Json.text(body, "projectId"), Json.text(body, "text"), Json.text(body, "model"), Json.text(body, "effort"), Json.text(body, "mode"),
            Json.text(body, "preset"), body.get("limits")));
    }

    @GetMapping("/tasks/{id}")
    public ResponseEntity<String> task(@PathVariable String id) { return Raw.json(tasks.task(id, true)); }

    @PutMapping("/tasks/{id}")
    public ResponseEntity<String> rename(@PathVariable String id, @RequestBody JsonNode body) { return Raw.json(tasks.rename(id, Json.text(body, "title"))); }

    @DeleteMapping("/tasks/{id}")
    public ResponseEntity<String> delete(@PathVariable String id) { return Raw.json(tasks.delete(id)); }

    @PostMapping("/tasks/{id}/messages")
    public ResponseEntity<String> message(@PathVariable String id, @RequestBody JsonNode body) {
        return Raw.json(tasks.message(id, Json.text(body, "text"), Json.text(body, "questionId"), Json.text(body, "model"), Json.text(body, "effort"), Json.text(body, "mode"),
            Json.text(body, "preset"), body.get("limits")));
    }

    @PostMapping("/tasks/{id}/stop")
    public ResponseEntity<String> stop(@PathVariable String id) { return Raw.json(tasks.stop(id)); }

    @PostMapping("/tasks/{id}/continue")
    public ResponseEntity<String> resume(@PathVariable String id, @RequestBody(required = false) JsonNode body) {
        return Raw.json(tasks.resume(id, Json.text(body, "model"), Json.text(body, "effort"), Json.text(body, "mode"), body == null ? null : body.get("limits")));
    }

    @PostMapping("/tasks/{id}/cards/{cardId}")
    public ResponseEntity<String> card(@PathVariable String id, @PathVariable String cardId, @RequestBody JsonNode body) { return Raw.json(tasks.card(id, cardId, body)); }

    @PostMapping("/tasks/{id}/skipped/{decisionId}/allow")
    public ResponseEntity<String> allowSkipped(@PathVariable String id, @PathVariable String decisionId) { return Raw.json(tasks.allowSkipped(id, decisionId)); }

    /** The recorded events of every run of the task, in order; each item names its run in `ids.work`. */
    @GetMapping("/tasks/{id}/events")
    public ResponseEntity<String> events(@PathVariable String id) {
        ArrayNode a = Json.arr();
        for (String work : tasks.works(id)) {
            pipeline.backfillIfEmpty(work);
            ObjectNode run = a.addObject();
            run.put("workId", work);
            ArrayNode items = run.putArray("items");
            eventLog.after(work, 0, 20_000).forEach(items::add);
            run.put("head", eventLog.head(work));
        }
        return Raw.json(a);
    }

    private String opened(String taskId) {
        String project = tasks.projectOf(taskId);
        projects.open(project);
        return project;
    }

    @GetMapping("/tasks/{id}/changes")
    public ResponseEntity<String> changes(@PathVariable String id) { return Raw.json(changes.taskChanges(opened(id), tasks.works(id), true)); }

    @GetMapping("/tasks/{id}/diff")
    public ResponseEntity<String> diff(@PathVariable String id, @RequestParam(required = false) String path, @RequestParam(defaultValue = "false") boolean earlier) {
        return Raw.json(changes.taskDiff(opened(id), tasks.works(id), path, earlier));
    }

    @PostMapping("/tasks/{id}/undo")
    public ResponseEntity<String> undo(@PathVariable String id, @RequestBody(required = false) JsonNode body) {
        List<String> paths = new ArrayList<>();
        for (JsonNode p : Json.each(body == null ? null : body.get("paths"))) paths.add(p.asString());
        ObjectNode result = landing.undo(opened(id), tasks.works(id), paths);
        broker.publishApp("task.updated", tasks.task(id, false));
        return Raw.json(result);
    }

    @GetMapping("/tasks/{id}/commit")
    public ResponseEntity<String> commitPlan(@PathVariable String id, @RequestParam(required = false) String summary) {
        ObjectNode task = tasks.task(id, false);
        return Raw.json(landing.commitPlan(opened(id), tasks.works(id), Json.text(task, "title"), summary));
    }

    @PostMapping("/tasks/{id}/commit")
    public ResponseEntity<String> commit(@PathVariable String id, @RequestBody JsonNode body) {
        List<String> paths = new ArrayList<>();
        for (JsonNode p : Json.each(body.get("paths"))) paths.add(p.asString());
        return Raw.json(landing.commit(opened(id), tasks.works(id), Json.text(body, "message"), paths, Json.text(body, "branch")));
    }

    @GetMapping("/tasks/{id}/progress")
    public ResponseEntity<String> progress(@PathVariable String id) { return Raw.json(progress.progress(tasks.projectOf(id), tasks.works(id))); }

    @GetMapping("/tasks/{id}/output")
    public ResponseEntity<String> output(@PathVariable String id) { return Raw.json(output.list(tasks.works(id))); }

    @GetMapping("/tasks/{id}/output/{runId}")
    public ResponseEntity<String> outputOf(@PathVariable String id, @PathVariable String runId) { return Raw.json(output.output(tasks.works(id), runId)); }

    // ------------------------------------------------------------------------------------------------ diagnostics

    @PostMapping("/diagnostics/export")
    public ResponseEntity<String> export() { return Raw.json(diagnostics.export()); }

    @GetMapping("/diagnostics/export/{name}")
    public ResponseEntity<FileSystemResource> download(@PathVariable String name) {
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
            .contentType(MediaType.parseMediaType("application/zip"))
            .body(new FileSystemResource(diagnostics.file(name)));
    }
}
