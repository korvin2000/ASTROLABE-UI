package io.astrolabe.studio.tasks;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import io.astrolabe.studio.accounts.AccountService;
import io.astrolabe.studio.bridge.Versions;
import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.live.EventLog;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.settings.Preferences;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Diagnostics export (Studio 2 §9 setting 18, BE-16): one archive with the host facts, the settings, the accounts
 * without their secrets, the audit trail and the event logs of the last tasks. Secret-shaped text is removed from
 * every file before it is written.
 */
@Service
public class DiagnosticsExport {
    private static final int TASKS = 5;

    private final TransportService transport;
    private final Preferences preferences;
    private final SettingsService settings;
    private final AccountService accounts;
    private final ProjectService projects;
    private final CampaignService campaigns;
    private final TaskService tasks;
    private final EventLog eventLog;
    private final JdbcTemplate jdbc;

    public DiagnosticsExport(TransportService transport, Preferences preferences, SettingsService settings, AccountService accounts, ProjectService projects,
                             CampaignService campaigns, TaskService tasks, EventLog eventLog, JdbcTemplate jdbc) {
        this.transport = transport;
        this.preferences = preferences;
        this.settings = settings;
        this.accounts = accounts;
        this.projects = projects;
        this.campaigns = campaigns;
        this.tasks = tasks;
        this.eventLog = eventLog;
        this.jdbc = jdbc;
    }

    /** Conservative removal of secret-shaped text. */
    public static String redact(String text) {
        return text
            .replaceAll("(?i)(\"?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|authorization)\"?\\s*[=:]\\s*\"?)[^\"\\s,}]+", "$1[removed]")
            .replaceAll("sk-[A-Za-z0-9_-]{16,}", "[removed]")
            .replaceAll("gh[pousr]_[A-Za-z0-9]{20,}", "[removed]")
            .replaceAll("(?i)bearer\\s+[A-Za-z0-9._~+/-]+=*", "Bearer [removed]")
            .replaceAll("eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{5,}", "[removed]");
    }

    private Path folder() throws IOException {
        return Files.createDirectories(transport.dataDir().resolve("exports"));
    }

    public Path file(String name) {
        if (!name.matches("diagnostics-[0-9-]+\\.zip")) throw ApiException.notFound("no export " + name);
        try {
            Path file = folder().resolve(name);
            if (!Files.isRegularFile(file)) throw ApiException.notFound("no export " + name);
            return file;
        } catch (IOException e) {
            throw ApiException.notFound("no export " + name);
        }
    }

    public ObjectNode export() {
        String name = "diagnostics-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".zip";
        try {
            Path file = folder().resolve(name);
            try (OutputStream out = Files.newOutputStream(file); ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
                ObjectNode host = Json.obj();
                host.put("studio", "0.2.0");
                host.put("agent", Versions.getAstrolabe());
                host.put("transport", Versions.getAiGate());
                host.put("jdk", Runtime.version().toString());
                host.put("os", System.getProperty("os.name") + " " + System.getProperty("os.arch"));
                host.put("dataDir", transport.dataDir().toString());
                host.put("demoMode", transport.demoMode());
                host.put("at", Json.now());
                entry(zip, "host.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(host));
                entry(zip, "preferences.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(preferences.all()));
                entry(zip, "accounts.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(accounts.list()));
                entry(zip, "projects.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(projects.list()));
                ObjectNode layers = Json.obj();
                layers.set(SettingsService.STUDIO, settings.layer(SettingsService.STUDIO).json());
                for (var p : projects.rows()) layers.set(SettingsService.projectScope(p.id()), settings.layer(SettingsService.projectScope(p.id())).json());
                entry(zip, "settings.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(layers));
                ArrayNode audit = Json.arr();
                jdbc.query("SELECT at, actor, action, target FROM audit ORDER BY id DESC LIMIT 500", rs -> {
                    audit.addObject().put("at", rs.getString(1)).put("actor", rs.getString(2)).put("action", rs.getString(3)).put("target", rs.getString(4));
                });
                entry(zip, "audit.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(audit));
                ArrayNode requests = Json.arr();
                jdbc.query("SELECT at, provider, model, outcome, latency_ms, attempts, input_tokens, output_tokens, warnings, error_code, attempts_detail, tags FROM llm_request ORDER BY id DESC LIMIT 500", rs -> {
                    ObjectNode r = requests.addObject().put("at", rs.getString(1)).put("provider", rs.getString(2)).put("model", rs.getString(3)).put("outcome", rs.getString(4))
                        .put("latencyMs", rs.getLong(5)).put("attempts", rs.getInt(6)).put("inputTokens", rs.getLong(7)).put("outputTokens", rs.getLong(8)).put("warnings", rs.getString(9))
                        .put("errorCode", rs.getString(10)).put("attemptsDetail", rs.getString(11));
                    // B6: the host's tags say which task and purpose (e.g. the review pass) a call served.
                    if (rs.getString(12) != null) r.set("tags", Json.parse(rs.getString(12)));
                });
                entry(zip, "model-requests.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(requests));
                List<String> ids = campaigns.taskIds();
                int n = 0;
                for (String id : ids) {
                    if (n++ >= TASKS) break;
                    entry(zip, "tasks/" + id + "/task.json", Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(tasks.task(id, true)));
                    for (String work : tasks.works(id)) {
                        StringBuilder lines = new StringBuilder();
                        for (JsonNode item : eventLog.after(work, 0, 20_000)) lines.append(Json.write(item)).append('\n');
                        entry(zip, "tasks/" + id + "/" + work + ".events.jsonl", lines.toString());
                    }
                }
            }
            jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), "local", "diagnostics.export", name, null);
            ObjectNode o = Json.obj();
            o.put("name", name);
            o.put("path", file.toString());
            o.put("bytes", Files.size(file));
            return o;
        } catch (IOException e) {
            throw new ApiException("export_failed", 500, "the diagnostics could not be written: " + e.getMessage());
        }
    }

    private static void entry(ZipOutputStream zip, String name, String text) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(redact(text).getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
