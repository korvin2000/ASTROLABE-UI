package io.astrolabe.studio.providers;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import io.astrolabe.provider.Profile;
import io.astrolabe.provider.aigate.AiGateAdapter;
import io.astrolabe.provider.aigate.AiGateProfiles;
import io.astrolabe.provider.aigate.Qualification;
import io.astrolabe.studio.bridge.ConfigSupport;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.Telemetry;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.settings.ProfileStore;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import net.ai.gate.Llm;
import net.ai.gate.Provider;
import net.ai.gate.auth.ApiKeyCredential;
import net.ai.gate.auth.AuthStatus;
import net.ai.gate.auth.AuthType;
import net.ai.gate.config.FieldDescriptor;
import net.ai.gate.diagnostics.ConnectionReport;
import net.ai.gate.model.Model;
import net.ai.gate.providers.Providers;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Providers, accounts, models and profiles (§18). A valid key, a catalog entry and a qualified profile are three
 * separate readiness checks. Secrets never leave the backend: only the credential fingerprint, type, source and the
 * SDK's `AuthStatus` values verbatim (R-PRV-01, R-PRV-03). Billable actions need an explicit confirmation (R-PRV-02).
 */
@Service
public class ProviderService {
    private final TransportService transport;
    private final ProfileStore profiles;
    private final Telemetry telemetry;
    private final TopicBroker broker;
    private final JdbcTemplate jdbc;

    public ProviderService(TransportService transport, ProfileStore profiles, Telemetry telemetry, TopicBroker broker, JdbcTemplate jdbc) {
        this.transport = transport;
        this.profiles = profiles;
        this.telemetry = telemetry;
        this.broker = broker;
        this.jdbc = jdbc;
    }

    private Llm llm() { return transport.llm(); }

    private List<Provider> providers() {
        List<Provider> list = new ArrayList<>();
        if (transport.demoMode()) list.add(transport.brain().provider());
        list.addAll(Providers.presets());
        for (TransportService.Custom c : transport.customEndpoints()) list.add(TransportService.customProvider(c));
        return list;
    }

    private Provider provider(String id) {
        return providers().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow(() -> ApiException.notFound("no provider " + id));
    }

    public ArrayNode list() {
        ArrayNode a = Json.arr();
        for (Provider p : providers()) a.add(dto(p, false));
        return a;
    }

    public ObjectNode get(String id) { return dto(provider(id), true); }

    private ObjectNode dto(Provider p, boolean detail) {
        ObjectNode o = Json.obj();
        o.put("id", p.id());
        o.put("name", p.name());
        o.put("preset", p.preset().orElse(p.id()));
        o.put("baseUrl", String.valueOf(p.baseUrl()));
        o.put("demo", FixtureBrain.PROVIDER.equals(p.id()));
        ArrayNode apis = o.putArray("apis");
        p.apis().forEach(api -> apis.add(String.valueOf(api.id())));
        p.apiKeyUrl().ifPresent(u -> o.put("apiKeyUrl", u.toString()));
        ArrayNode methods = o.putArray("authMethods");
        try {
            for (AuthType t : llm().auth().methods(p.id())) methods.add(t.name());
        } catch (RuntimeException e) {
            // Methods are informational.
        }
        ObjectNode auth = authStatus(p.id());
        o.set("auth", auth);
        // Keyless local servers (ollama, lm-studio, vllm) report CONFIGURED with source "keyless" and no credential.
        o.put("keyless", (p.apiKeyAuth().isEmpty() && p.oauthAuth().isEmpty()) || "keyless".equalsIgnoreCase(Json.text(auth, "source", "")));
        try {
            o.put("models", llm().models().all(p.id()).size());
        } catch (RuntimeException e) {
            o.put("models", 0);
        }
        String lastTest = jdbc.queryForList("SELECT last_test_json FROM provider_config WHERE id = ?", String.class, p.id()).stream().findFirst().orElse(null);
        if (lastTest != null) o.set("lastTest", Json.parse(lastTest));
        if (detail) {
            ArrayNode fields = o.putArray("fields");
            for (FieldDescriptor f : p.fields()) fields.add(field(f));
        }
        return o;
    }

    private ObjectNode authStatus(String providerId) {
        ObjectNode o = Json.obj();
        try {
            AuthStatus s = llm().auth().status(providerId);
            o.put("state", s.state().name());
            s.type().ifPresent(t -> o.put("type", t.name()));
            s.source().ifPresent(src -> o.put("source", src));
            s.expiresAt().ifPresent(e -> o.put("expiresAt", e.toString()));
            s.account().ifPresent(acc -> o.put("account", acc));
        } catch (RuntimeException e) {
            o.put("state", "NOT_CONFIGURED");
            o.put("error", e.getMessage());
        }
        return o;
    }

    private static ObjectNode field(FieldDescriptor f) {
        ObjectNode o = Json.obj();
        o.put("key", f.key());
        o.put("label", f.label());
        o.put("kind", f.kind().name());
        o.put("required", f.required());
        f.defaultValue().ifPresent(v -> o.put("defaultValue", v));
        f.help().ifPresent(v -> o.put("help", v));
        f.group().ifPresent(v -> o.put("group", v));
        if (!f.choices().isEmpty()) {
            ArrayNode c = o.putArray("choices");
            f.choices().forEach(c::add);
        }
        f.min().ifPresent(v -> o.put("min", v));
        f.max().ifPresent(v -> o.put("max", v));
        f.unit().ifPresent(v -> o.put("unit", v));
        return o;
    }

    /** Saves an API key (write-only, R-PRV-01); the response carries the re-read status, never the key. */
    public ObjectNode saveApiKey(String providerId, String key, String actor) {
        provider(providerId);
        if (key == null || key.isBlank()) throw ApiException.invalid("an API key is required");
        llm().auth().save(providerId, ApiKeyCredential.of(key.strip()));
        audit(actor, "provider.credentials", providerId, "api key saved");
        broker.publishApp("provider.changed", Json.obj().put("providerId", providerId));
        return get(providerId);
    }

    public ObjectNode logout(String providerId, String actor) {
        provider(providerId);
        llm().auth().logout(providerId);
        audit(actor, "provider.logout", providerId, null);
        broker.publishApp("provider.changed", Json.obj().put("providerId", providerId));
        return get(providerId);
    }

    /** `llm.test(model)` unbilled steps (§18.3); billable probes are not run by the Studio without confirmation. */
    public ObjectNode test(String providerId, String modelId) {
        Provider p = provider(providerId);
        Model model = modelId == null || modelId.isBlank()
            ? llm().models().all(p.id()).stream().findFirst().orElseThrow(() -> ApiException.invalid("provider " + providerId + " lists no models; name one"))
            : llm().models().require(p.id(), modelId);
        ConnectionReport report = llm().test(model);
        ObjectNode o = Json.obj();
        o.put("providerId", providerId);
        o.put("modelId", model.id());
        o.put("ok", report.ok());
        o.put("at", Json.now());
        ArrayNode steps = o.putArray("steps");
        for (ConnectionReport.Step s : report.steps()) {
            ObjectNode st = steps.addObject();
            st.put("kind", s.kind().name());
            st.put("status", s.status().name());
            s.latency().ifPresent(l -> st.put("latencyMillis", l.toMillis()));
            st.put("message", s.message());
            s.error().ifPresent(err -> st.put("error", String.valueOf(err.getMessage())));
        }
        report.firstFailure().ifPresent(f -> o.put("firstFailure", f.kind().name()));
        jdbc.update("INSERT INTO provider_config (id, json, last_test_json, updated_at) VALUES (?, '{}', ?, ?) ON CONFLICT(id) DO UPDATE SET last_test_json = excluded.last_test_json, updated_at = excluded.updated_at",
            providerId, Json.write(o), Json.now());
        broker.publishApp("provider.changed", Json.obj().put("providerId", providerId));
        return o;
    }

    public ArrayNode models(String providerId, String query) {
        ArrayNode a = Json.arr();
        List<Model> all = providerId == null || providerId.isBlank() ? llm().models().all() : llm().models().all(providerId);
        String q = query == null ? "" : query.toLowerCase();
        for (Model m : all) {
            if (!q.isEmpty() && !(m.id().toLowerCase().contains(q) || m.name().toLowerCase().contains(q) || m.providerId().contains(q))) continue;
            ObjectNode o = (ObjectNode) Json.parse(m.toJson().toJson());
            o.put("providerId", m.providerId());
            o.put("modelId", m.id());
            o.put("displayName", m.name());
            o.put("sourceKind", String.valueOf(m.source()));
            a.add(o);
        }
        return a;
    }

    public ObjectNode refreshCatalog() {
        var report = llm().models().refresh();
        broker.publishApp("catalog.refreshed", Json.obj().put("report", String.valueOf(report)));
        return Json.obj().put("report", String.valueOf(report));
    }

    // ------------------------------------------------------------------------------------------------ profiles

    public ArrayNode profiles() { return profiles.list(); }

    /** `AiGateProfiles.draft` (§18.5): a reviewable profile with limits, dated prices and the `gate` block. */
    public JsonNode draft(String providerId, String modelId, String profileId, String actor) {
        if (profileId == null || !profileId.matches("[A-Za-z0-9._-]{1,128}")) throw ApiException.invalid("profile ids match [A-Za-z0-9._-]{1,128}");
        Profile draft = AiGateProfiles.draft(llm(), providerId, modelId, profileId, LocalDate.now());
        String json = ConfigSupport.profileJson(draft);
        profiles.save(profileId, json, "draft", null);
        validateAndMark(profileId);
        audit(actor, "profile.draft", profileId, providerId + "/" + modelId);
        broker.publishApp("profiles.changed", Json.obj().put("profileId", profileId));
        return profiles.get(profileId);
    }

    public JsonNode update(String profileId, JsonNode profileJson, String actor) {
        if (profiles.isDemo(profileId)) throw ApiException.invalid("demo profiles are fixed; draft a profile from a real model instead");
        profiles.save(profileId, Json.write(profileJson), "draft", null);
        validateAndMark(profileId);
        audit(actor, "profile.update", profileId, null);
        broker.publishApp("profiles.changed", Json.obj().put("profileId", profileId));
        return profiles.get(profileId);
    }

    public void delete(String profileId, String actor) {
        if (profiles.isDemo(profileId)) throw ApiException.invalid("demo profiles cannot be deleted");
        profiles.delete(profileId);
        audit(actor, "profile.delete", profileId, null);
        broker.publishApp("profiles.changed", Json.obj().put("profileId", profileId));
    }

    /** `AiGateAdapter.violations(llm, [profile])` → state `validated` or `draft` with the violations listed. */
    public ObjectNode validateAndMark(String profileId) {
        JsonNode dto = profiles.get(profileId);
        Profile profile = ConfigSupport.decodeProfile(Json.write(dto.get("profile")));
        List<?> violations = AiGateAdapter.violations(llm(), List.of(profile));
        ObjectNode o = Json.obj();
        ArrayNode v = o.putArray("violations");
        violations.forEach(x -> v.add(String.valueOf(x)));
        List<String> warnings = new ArrayList<>();
        try (AiGateAdapter adapter = new AiGateAdapter(llm(), List.of(profile), false)) {
            adapter.warnings().forEach(w -> warnings.add(String.valueOf(w)));
        } catch (RuntimeException e) {
            warnings.add(e.getMessage());
        }
        ArrayNode w = o.putArray("warnings");
        warnings.forEach(w::add);
        if (!profiles.isDemo(profileId)) {
            String state = violations.isEmpty() ? (Json.text(dto, "state", "draft").startsWith("qualified") ? Json.text(dto, "state") : "validated") : "draft";
            profiles.save(profileId, Json.write(dto.get("profile")), state, null);
            o.put("state", state);
        } else {
            o.put("state", "validated");
        }
        return o;
    }

    /** Billable qualification (§18.5): only with `confirm`; the narrowed profile is a proposal until frozen. */
    public JsonNode qualify(String profileId, boolean confirm, String actor) {
        if (!confirm) throw new ApiException("billable_not_confirmed", 422, "qualification makes 3–5 short billable calls; confirm naming the provider and model");
        JsonNode dto = profiles.get(profileId);
        Profile profile = ConfigSupport.decodeProfile(Json.write(dto.get("profile")));
        Qualification q = AiGateProfiles.qualify(llm(), profile);
        ObjectNode report = Json.obj();
        report.put("qualified", q.getQualified());
        report.put("at", Json.now());
        ArrayNode problems = report.putArray("problems");
        q.getProblems().forEach(x -> problems.add(String.valueOf(x)));
        ArrayNode notes = report.putArray("notes");
        q.getNotes().forEach(x -> notes.add(String.valueOf(x)));
        report.put("report", String.valueOf(q.getReport()));
        report.set("proposal", Json.parse(ConfigSupport.profileJson(q.getProfile())));
        if (!profiles.isDemo(profileId)) {
            profiles.save(profileId, Json.write(dto.get("profile")), Json.text(dto, "state", "draft"), Json.write(report));
        }
        audit(actor, "profile.qualify", profileId, String.valueOf(q.getQualified()));
        broker.publishApp("profiles.changed", Json.obj().put("profileId", profileId));
        return report;
    }

    /** Freezes a qualification proposal as the profile for future attempts. */
    public JsonNode freeze(String profileId, String actor) {
        JsonNode dto = profiles.get(profileId);
        JsonNode proposal = Optional.ofNullable(dto.get("qualification")).map(q -> q.get("proposal")).orElse(null);
        if (proposal == null || proposal.isNull()) throw ApiException.invalid("no qualification proposal to freeze");
        profiles.save(profileId, Json.write(proposal), "qualified " + LocalDate.now(), null);
        audit(actor, "profile.freeze", profileId, null);
        broker.publishApp("profiles.changed", Json.obj().put("profileId", profileId));
        return profiles.get(profileId);
    }

    public ArrayNode health(String providerId) { return telemetry.recent(providerId, 50); }

    private void audit(String actor, String action, String target, String details) {
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), actor, action, target, details);
    }
}
