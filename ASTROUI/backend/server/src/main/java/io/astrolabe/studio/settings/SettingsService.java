package io.astrolabe.studio.settings;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import io.astrolabe.studio.bridge.ConfigCheck;
import io.astrolabe.studio.bridge.ConfigSupport;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Layered settings (§17.1): ASTROLABE defaults → Studio defaults → project overrides → campaign options → frozen at
 * the attempt boundary. A layer is `{config: <partial Config>, runtime: <Studio runtime keys>}`. Validation is the
 * libraries' own (through the bridge); saving uses an expected revision and writes `settings_history` (R-SET-01).
 */
@Service
public class SettingsService {
    public static final String STUDIO = "studio";

    private final JdbcTemplate jdbc;
    private final ProfileStore profiles;
    private final TransportService transport;
    private final TopicBroker broker;
    private final JsonNode libraryDefaults;

    public SettingsService(JdbcTemplate jdbc, ProfileStore profiles, TransportService transport, TopicBroker broker) {
        this.jdbc = jdbc;
        this.profiles = profiles;
        this.transport = transport;
        this.broker = broker;
        this.libraryDefaults = Json.parse(ConfigSupport.libraryDefaultsJson());
        ensureStudioLayer();
    }

    /** First run: the Studio layer routes the main and helper functions to the demo profiles (fixture mode). */
    private void ensureStudioLayer() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM settings_layer WHERE scope = ?", Integer.class, STUDIO);
        if (n != null && n > 0) return;
        ObjectNode layer = Json.obj();
        ObjectNode roles = layer.putObject("config").putObject("profileRoles");
        roles.put("main", FixtureBrain.MAIN_PROFILE);
        roles.put("helper", FixtureBrain.HELPER_PROFILE);
        roles.putNull("escalation");
        layer.putObject("runtime");
        jdbc.update("INSERT INTO settings_layer (scope, revision, json, updated_at) VALUES (?, 1, ?, ?)", STUDIO, Json.write(layer), Json.now());
    }

    public static String projectScope(String projectId) { return "project:" + projectId; }

    public static final ObjectNode RUNTIME_DEFAULTS = Json.obj()
        .put("leaseMinutes", 480)
        .put("maxCells", 12)
        .put("autoResumeOnLateAnswer", false)
        .put("decisionReminderMinutes", 15)
        .put("maxConcurrentCampaigns", 3)
        .put("acceptNonWeakening", false)
        .put("effort", "Medium");

    // ------------------------------------------------------------------------------------------------ layers

    public record Layer(String scope, long revision, ObjectNode json, String updatedAt) { }

    public Layer layer(String scope) {
        List<Layer> rows = jdbc.query("SELECT * FROM settings_layer WHERE scope = ?", (rs, i) -> new Layer(rs.getString("scope"), rs.getLong("revision"),
            Json.parseObject(rs.getString("json")), rs.getString("updated_at")), scope);
        if (!rows.isEmpty()) return rows.getFirst();
        ObjectNode empty = Json.obj();
        empty.putObject("config");
        empty.putObject("runtime");
        return new Layer(scope, 0, empty, null);
    }

    private static JsonNode part(Layer layer, String name) {
        JsonNode n = layer.json().get(name);
        return n == null ? Json.obj() : n;
    }

    /** The merged `Config` JSON for [projectId] with optional campaign [overrides] (a partial Config) and every known profile. */
    public String effectiveConfigJson(String projectId, JsonNode overrides) {
        return effectiveConfigJson(projectId, overrides, null, null);
    }

    private String effectiveConfigJson(String projectId, JsonNode overrides, String candidateScope, ObjectNode candidate) {
        JsonNode merged = libraryDefaults.deepCopy();
        merged = Json.merge(merged, configPart(STUDIO, candidateScope, candidate));
        if (projectId != null) merged = Json.merge(merged, configPart(projectScope(projectId), candidateScope, candidate));
        if (overrides != null && !overrides.isNull()) merged = Json.merge(merged, overrides);
        ObjectNode config = (ObjectNode) merged;
        ObjectNode profileMap = Json.obj();
        for (Map.Entry<String, String> e : profiles.profilesJson().entrySet()) profileMap.set(e.getKey(), Json.parse(e.getValue()));
        config.set("profiles", profileMap);
        return Json.write(config);
    }

    private JsonNode configPart(String scope, String candidateScope, ObjectNode candidate) {
        if (candidate != null && scope.equals(candidateScope)) return candidate.has("config") ? candidate.get("config") : Json.obj();
        return part(layer(scope), "config");
    }

    /** Studio runtime settings (Appendix B.7) merged over their defaults. */
    public ObjectNode runtime(String projectId) {
        JsonNode merged = RUNTIME_DEFAULTS.deepCopy();
        merged = Json.merge(merged, part(layer(STUDIO), "runtime"));
        if (projectId != null) merged = Json.merge(merged, part(layer(projectScope(projectId)), "runtime"));
        return (ObjectNode) merged;
    }

    /** The configuration a project is opened with (state root, git deadline are read live at open). */
    public String projectOpenConfigJson(String projectId) { return effectiveConfigJson(projectId, null); }

    public JsonNode rulesBinding(String projectId) {
        JsonNode config = part(layer(projectScope(projectId)), "config");
        JsonNode rules = config.get("rulesFile");
        return rules == null || rules.isNull() ? null : rules;
    }

    // ------------------------------------------------------------------------------------------------ validation and saving

    public ObjectNode validate(String scope, ObjectNode candidateLayer) {
        String projectId = scope.startsWith("project:") ? scope.substring("project:".length()) : null;
        String json = effectiveConfigJson(projectId, null, scope, candidateLayer);
        ConfigCheck check = ConfigSupport.validate(json, transport.llm());
        ObjectNode o = Json.obj();
        o.put("valid", check.getValid());
        if (check.getFingerprint() != null) o.put("fingerprint", check.getFingerprint());
        o.set("violations", Json.parse(check.getViolationsJson()));
        ArrayNode w = o.putArray("adapterWarnings");
        check.getAdapterWarnings().forEach(w::add);
        return o;
    }

    /** Saves a layer (R-SET-01/02): expected revision, full validation, history row, audit; reports the new fingerprint. */
    public ObjectNode save(String scope, ObjectNode candidateLayer, long expectedRevision, String actor) {
        if (!scope.equals(STUDIO) && !scope.startsWith("project:")) throw ApiException.invalid("unknown settings scope " + scope);
        Layer current = layer(scope);
        if (current.revision() != expectedRevision) {
            throw new ApiException("conflict_revision", 409, "settings moved to revision " + current.revision(), false, null, List.of(), (int) current.revision(), null);
        }
        ObjectNode normalized = Json.obj();
        normalized.set("config", candidateLayer.has("config") ? candidateLayer.get("config") : Json.obj());
        normalized.set("runtime", candidateLayer.has("runtime") ? candidateLayer.get("runtime") : Json.obj());
        ObjectNode check = validate(scope, normalized);
        if (!check.get("valid").asBoolean()) {
            List<ApiException.FieldError> fields = new ArrayList<>();
            for (JsonNode v : check.get("violations")) fields.add(new ApiException.FieldError(Json.text(v, "path"), Json.text(v, "message")));
            throw new ApiException("config_invalid", 422, "the configuration has " + fields.size() + " violation(s)", false, null, fields, null, check);
        }
        List<String> changed = new ArrayList<>();
        Json.diff("", current.json(), normalized, changed);
        long revision = current.revision() + 1;
        jdbc.update("INSERT INTO settings_layer (scope, revision, json, updated_at) VALUES (?,?,?,?) " +
            "ON CONFLICT(scope) DO UPDATE SET revision = excluded.revision, json = excluded.json, updated_at = excluded.updated_at",
            scope, revision, Json.write(normalized), Json.now());
        String summary = String.join(", ", changed.stream().limit(20).toList());
        jdbc.update("INSERT INTO settings_history (scope, revision, json, summary, at) VALUES (?,?,?,?,?)", scope, revision, Json.write(normalized), summary, Json.now());
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), actor, "settings.apply", scope, summary);
        ObjectNode result = Json.obj();
        result.put("scope", scope);
        result.put("revision", revision);
        if (check.has("fingerprint")) result.set("fingerprint", check.get("fingerprint"));
        result.put("applies", "Applies to new campaigns and new attempts; running campaigns keep their frozen configuration.");
        ArrayNode c = result.putArray("changed");
        changed.forEach(c::add);
        broker.publishApp("settings.changed", Json.obj().put("scope", scope).put("revision", revision));
        return result;
    }

    /** Binds (or unbinds, with a null path) a rules file in the project layer (§19.2 "Review & bind"). */
    public ObjectNode bindRules(String projectId, String path, String digest, String actor) {
        String scope = projectScope(projectId);
        Layer current = layer(scope);
        ObjectNode next = current.json().deepCopy();
        ObjectNode config = next.has("config") && next.get("config").isObject() ? (ObjectNode) next.get("config") : next.putObject("config");
        if (path == null) {
            config.putNull("rulesFile");
        } else {
            ObjectNode binding = config.putObject("rulesFile");
            binding.put("path", path);
            binding.put("digest", digest);
            binding.put("provenance", "user:" + actor);
        }
        return save(scope, next, current.revision(), actor);
    }

    public ArrayNode history(String scope, int limit) {
        ArrayNode a = Json.arr();
        jdbc.query("SELECT revision, summary, at FROM settings_history WHERE scope = ? ORDER BY id DESC LIMIT ?", rs -> {
            a.addObject().put("revision", rs.getLong(1)).put("summary", rs.getString(2)).put("at", rs.getString(3));
        }, scope, limit);
        return a;
    }

    /** Settings for the UI: the layer, its revision, the effective values, their provenance and the schema. */
    public ObjectNode view(String scope) {
        String projectId = scope.startsWith("project:") ? scope.substring("project:".length()) : null;
        ObjectNode o = Json.obj();
        Layer layer = layer(scope);
        o.put("scope", scope);
        o.put("revision", layer.revision());
        o.set("layer", layer.json());
        o.set("studioLayer", layer(STUDIO).json());
        ObjectNode effective = Json.obj();
        effective.set("config", Json.parse(effectiveConfigJson(projectId, null)));
        effective.set("runtime", runtime(projectId));
        o.set("effective", effective);
        ObjectNode defaults = Json.obj();
        defaults.set("config", libraryDefaults);
        defaults.set("runtime", RUNTIME_DEFAULTS);
        o.set("defaults", defaults);
        o.set("schema", SettingsSchema.describe(defaults));
        o.set("roles", Json.parse(ConfigSupport.declaredRolesJson()));
        o.set("history", history(scope, 20));
        String fp = ConfigSupport.fingerprint(effectiveConfigJson(projectId, null));
        if (fp != null) o.put("fingerprint", fp);
        o.put("credentialStorage", transport.credentialStorage());
        o.put("dataDir", transport.dataDir().toString());
        return o;
    }

    public JsonNode libraryDefaults() { return libraryDefaults; }

    /** Preset layers (§17.5): Cautious, Balanced (library defaults), Autonomous. */
    public static ArrayNode presets() {
        ArrayNode a = Json.arr();
        a.add(preset("cautious", "Cautious", "Interactive", "Ask", "Human", "Patch", "Host"));
        a.add(preset("balanced", "Balanced (library defaults)", "Interactive", "Ask", "Autonomous", "Patch", "Host"));
        a.add(preset("autonomous", "Autonomous", "Autonomous", "Ask", "Autonomous", "Patch", "Automatic"));
        return a;
    }

    private static ObjectNode preset(String id, String label, String mode, String dClass, String integrity, String ceiling, String unknown) {
        ObjectNode p = Json.obj();
        p.put("id", id);
        p.put("label", label);
        ObjectNode c = p.putObject("config");
        c.put("mode", mode);
        c.put("dClass", dClass);
        c.put("integrityApproval", integrity);
        c.put("ceiling", ceiling);
        c.put("unknownOutcomeReconciliation", unknown);
        return p;
    }
}
