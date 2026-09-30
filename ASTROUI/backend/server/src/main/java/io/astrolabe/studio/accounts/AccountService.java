package io.astrolabe.studio.accounts;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.models.ModelService;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.settings.Preferences;
import io.astrolabe.studio.settings.ProfileStore;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;
import io.astrolabe.studio.support.StudioError;

import net.ai.gate.Llm;
import net.ai.gate.Provider;
import net.ai.gate.auth.ApiKeyCredential;
import net.ai.gate.auth.AuthInput;
import net.ai.gate.auth.AuthStatus;
import net.ai.gate.auth.AuthType;
import net.ai.gate.auth.Environment;
import net.ai.gate.diagnostics.ConnectionReport;
import net.ai.gate.model.Model;
import net.ai.gate.providers.Providers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Accounts (Studio 2 §6.1, §6.3, BE-1): a provider plus the way the user connected it. Only connected or detected
 * accounts are listed; the presets are what "Add account" offers. An environment key or a local server is used only
 * after the user's click. Secrets never leave the backend. Every change rebuilds the runtime.
 */
@Service
public class AccountService {
    private static final Logger log = LoggerFactory.getLogger(AccountService.class);
    private static final List<String> LOCAL = List.of("ollama", "lm-studio", "vllm");
    private static final Duration PROBE = Duration.ofMillis(700);

    private final TransportService transport;
    private final Preferences preferences;
    private final ProfileStore profiles;
    private final ModelService models;
    private final TopicBroker broker;
    private final JdbcTemplate jdbc;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(PROBE).build();
    private final Map<String, Probe> probes = new ConcurrentHashMap<>();

    private record Probe(boolean reachable, int models, long at) { }

    public AccountService(TransportService transport, Preferences preferences, ProfileStore profiles, ModelService models, TopicBroker broker, JdbcTemplate jdbc) {
        this.transport = transport;
        this.preferences = preferences;
        this.profiles = profiles;
        this.models = models;
        this.broker = broker;
        this.jdbc = jdbc;
    }

    private Llm llm() { return transport.llm(); }

    // ------------------------------------------------------------------------------------------------ presets

    /** What "Add account" offers (§6.1): every preset with the methods that work for it. */
    public ArrayNode presets() {
        ArrayNode a = Json.arr();
        for (Provider p : Providers.presets()) {
            ObjectNode o = a.addObject();
            o.put("provider", p.id());
            o.put("name", displayName(p));
            ArrayNode methods = o.putArray("methods");
            boolean local = LOCAL.contains(p.id());
            if (local) methods.add("local");
            if (p.oauthAuth().isPresent()) methods.add("signin");
            if (!local && p.apiKeyAuth().isPresent() && !"openai-codex".equals(p.id())) methods.add("key");
            p.apiKeyUrl().ifPresent(u -> o.put("keyUrl", u.toString()));
            if (p.oauthAuth().isPresent()) o.put("code", deviceCode(p));
            o.put("baseUrl", String.valueOf(p.baseUrl()));
        }
        ObjectNode custom = a.addObject();
        custom.put("provider", "custom");
        custom.put("name", "Custom (OpenAI-compatible)");
        custom.putArray("methods").add("custom");
        return a;
    }

    /** Sign-in with a code on another device; of the presets only the ChatGPT sign-in offers it. */
    static boolean deviceCode(Provider p) { return "openai-codex".equals(p.id()); }

    private static String displayName(Provider p) {
        return switch (p.id()) {
            case "openai-codex" -> "ChatGPT";
            case "openai" -> "OpenAI API";
            case "google" -> "Google Gemini";
            default -> p.name();
        };
    }

    private Optional<Provider> provider(String id) {
        if (FixtureBrain.PROVIDER.equals(id) && transport.demoMode()) return Optional.of(transport.brain().provider());
        for (Provider p : Providers.presets()) if (p.id().equals(id)) return Optional.of(p);
        for (TransportService.Custom c : transport.customEndpoints()) if (c.id().equals(id)) return Optional.of(TransportService.customProvider(c));
        return Optional.empty();
    }

    private Provider require(String id) {
        return provider(id).orElseThrow(() -> ApiException.notFound("no account type " + id));
    }

    // ------------------------------------------------------------------------------------------------ list

    /** Connected and detected accounts (§6.3). */
    public ArrayNode list() {
        ArrayNode a = Json.arr();
        Map<String, String> enabledEnv = transport.enabledEnvKeys();
        JsonNode localPref = preferences.get(Preferences.LOCAL_SERVERS);
        if (transport.demoMode()) {
            ObjectNode demo = a.addObject();
            demo.put("id", FixtureBrain.PROVIDER);
            demo.put("provider", FixtureBrain.PROVIDER);
            demo.put("name", "Demo");
            demo.put("kind", "demo");
            demo.put("enabled", true);
            demo.put("usable", true);
        }
        for (Provider p : Providers.presets()) {
            if (LOCAL.contains(p.id())) {
                Probe probe = probe(p, false);
                boolean enabled = localPref != null && localPref.path(p.id()).asBoolean(false);
                if (!probe.reachable() && !enabled) continue;
                ObjectNode o = base(a, p, "local");
                o.put("enabled", enabled);
                o.put("reachable", probe.reachable());
                o.put("models", probe.models());
                o.put("baseUrl", String.valueOf(p.baseUrl()));
                o.put("usable", enabled && probe.reachable());
                continue;
            }
            AuthStatus status = status(p.id());
            String variable = envVariable(p);
            if (status.state() != AuthStatus.State.NOT_CONFIGURED) {
                boolean oauth = status.type().orElse(AuthType.API_KEY) == AuthType.OAUTH && p.oauthAuth().isPresent() && !isIssuedKey(p);
                boolean fromEnv = !oauth && enabledEnv.containsKey(p.id()) && status.source().map(s -> s.equals(enabledEnv.get(p.id()))).orElse(false);
                ObjectNode o = base(a, p, oauth ? "oauth" : fromEnv ? "env" : "key");
                if (status.type().orElse(null) == AuthType.OAUTH) o.put("signedIn", true);
                status.account().ifPresent(acc -> o.put("account", acc));
                status.expiresAt().ifPresent(e -> o.put("expiresAt", e.toString()));
                if (fromEnv) o.put("variable", enabledEnv.get(p.id()));
                boolean expired = status.state() == AuthStatus.State.EXPIRED || status.state() == AuthStatus.State.REFRESH_FAILED;
                o.put("enabled", true);
                o.put("state", expired ? "expired" : "ok");
                o.put("usable", !expired);
                lastTest(p.id()).ifPresent(t -> o.set("lastTest", t));
            } else if (variable != null) {
                ObjectNode o = base(a, p, "env");
                o.put("variable", variable);
                o.put("enabled", false);
                o.put("usable", false);
            }
        }
        for (TransportService.Custom c : transport.customEndpoints()) {
            ObjectNode o = a.addObject();
            o.put("id", c.id());
            o.put("provider", c.id());
            o.put("name", c.name());
            o.put("kind", "custom");
            o.put("baseUrl", c.baseUrl());
            if (c.model() != null) o.put("model", c.model());
            o.put("enabled", true);
            o.put("usable", true);
            lastTest(c.id()).ifPresent(t -> o.set("lastTest", t));
        }
        return a;
    }

    /** OpenRouter's sign-in issues an API key: the account behaves as a key account that can be replaced or removed. */
    private static boolean isIssuedKey(Provider p) { return "openrouter".equals(p.id()); }

    private static ObjectNode base(ArrayNode a, Provider p, String kind) {
        ObjectNode o = a.addObject();
        o.put("id", p.id());
        o.put("provider", p.id());
        o.put("name", displayName(p));
        o.put("kind", kind);
        return o;
    }

    private AuthStatus status(String providerId) {
        try {
            return llm().auth().status(providerId);
        } catch (RuntimeException e) {
            return AuthStatus.notConfigured();
        }
    }

    private Optional<JsonNode> lastTest(String providerId) {
        return jdbc.queryForList("SELECT last_test_json FROM provider_config WHERE id = ?", String.class, providerId).stream()
            .filter(s -> s != null).findFirst().map(Json::parse);
    }

    /** Accounts a task can run on, as the model picker needs them. */
    public List<ModelService.Account> usable() {
        List<ModelService.Account> out = new ArrayList<>();
        for (JsonNode a : list()) {
            if (a.path("usable").asBoolean(false)) out.add(new ModelService.Account(Json.text(a, "provider"), Json.text(a, "name"), Json.text(a, "kind")));
        }
        return out;
    }

    public ArrayNode usableModels() { return models.usable(usable()); }

    // ------------------------------------------------------------------------------------------------ detection

    /** The environment variable that would authenticate [p], when it is set; never its value. */
    private String envVariable(Provider p) {
        if (p.apiKeyAuth().isEmpty() || LOCAL.contains(p.id())) return null;
        Environment system = Environment.system();
        AtomicReference<String> found = new AtomicReference<>();
        Environment recording = name -> {
            Optional<String> value = system.get(name);
            if (value.isPresent()) found.compareAndSet(null, name);
            return value;
        };
        try {
            if (!p.apiKeyAuth().get().configured(new AuthInput(Optional.empty(), recording))) return null;
        } catch (RuntimeException e) {
            return null;
        }
        return found.get();
    }

    private Probe probe(Provider p, boolean fresh) {
        Probe cached = probes.get(p.id());
        if (!fresh && cached != null && System.currentTimeMillis() - cached.at() < 5_000) return cached;
        Probe result;
        try {
            String base = String.valueOf(p.baseUrl());
            HttpRequest request = HttpRequest.newBuilder(URI.create(base.endsWith("/") ? base + "models" : base + "/models")).timeout(PROBE).GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            int count = 0;
            if (response.statusCode() / 100 == 2) {
                JsonNode data = Json.parse(response.body()).path("data");
                count = data.isArray() ? data.size() : 0;
            }
            result = new Probe(response.statusCode() / 100 == 2, count, System.currentTimeMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            result = new Probe(false, 0, System.currentTimeMillis());
        } catch (java.io.IOException | RuntimeException e) {
            result = new Probe(false, 0, System.currentTimeMillis());
        }
        probes.put(p.id(), result);
        return result;
    }

    /** `POST /accounts/detect` (§5 UX-6): environment keys and local servers found, not yet in use. */
    public ArrayNode detect() {
        for (Provider p : Providers.presets()) if (LOCAL.contains(p.id())) probe(p, true);
        ArrayNode found = Json.arr();
        for (JsonNode a : list()) {
            String kind = Json.text(a, "kind", "");
            if ((kind.equals("env") || kind.equals("local")) && !a.path("enabled").asBoolean(false)) found.add(a);
        }
        return found;
    }

    // ------------------------------------------------------------------------------------------------ connect

    /**
     * `POST /accounts` (§6.1): `{ provider, method: key|env|local|custom, apiKey?, name?, baseUrl?, model? }`. After a
     * successful connection the non-billable test runs and the recommended model becomes the default when none is set.
     */
    public ObjectNode connect(JsonNode body, String actor) {
        String method = Json.text(body, "method", "key");
        String providerId = Json.text(body, "provider");
        String secret = null;
        switch (method) {
            case "key" -> {
                Provider p = require(providerId);
                String key = Json.text(body, "apiKey");
                if (key == null || key.isBlank()) throw ApiException.invalid("an API key is required");
                if (p.apiKeyAuth().isEmpty() || "openai-codex".equals(p.id())) throw ApiException.invalid(displayName(p) + " has no API key; sign in instead");
                llm().auth().save(providerId, ApiKeyCredential.of(key.strip()));
                secret = key.strip();
            }
            case "env" -> {
                Provider p = require(providerId);
                String variable = envVariable(p);
                if (variable == null) throw ApiException.invalid("no environment key was found for " + displayName(p));
                ObjectNode enabled = (ObjectNode) preferences.get(Preferences.ENV_KEYS).deepCopy();
                enabled.put(providerId, variable);
                preferences.set(Preferences.ENV_KEYS, enabled);
                secret = System.getenv(variable);
            }
            case "local" -> {
                Provider p = require(providerId);
                if (!LOCAL.contains(p.id())) throw ApiException.invalid(displayName(p) + " is not a local server");
                if (!probe(p, true).reachable()) throw StudioError.of(StudioError.PROVIDER_UNREACHABLE, Json.obj().put("account", displayName(p)), "no answer from " + p.baseUrl());
                ObjectNode enabled = (ObjectNode) preferences.get(Preferences.LOCAL_SERVERS).deepCopy();
                enabled.put(providerId, true);
                preferences.set(Preferences.LOCAL_SERVERS, enabled);
            }
            case "custom" -> providerId = saveCustom(body);
            default -> throw ApiException.invalid("unknown connection method " + method);
        }
        audit(actor, "account.connect", providerId, method);
        transport.rebuild();
        try {
            verifyKey(providerId, secret);
            return afterConnect(providerId);
        } catch (StudioError e) {
            // A key that does not work is not kept: the dialog shows the sentence and the user tries again (§6.1, A-7).
            if (!method.equals("local")) forget(providerId, method.equals("custom"));
            transport.rebuild();
            throw e;
        }
    }

    /**
     * Finding F-6: the connection test of the SDK proves a key through the model listing, and the listing of OpenRouter
     * is public, so any key passes. Its key endpoint answers 401 for a key it does not know.
     */
    private void verifyKey(String providerId, String key) {
        if (key == null || !"openrouter".equals(providerId)) return;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://openrouter.ai/api/v1/key")).timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + key).GET().build();
            int status = http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status == 401 || status == 403) {
                throw StudioError.of(StudioError.AUTH_REJECTED, Json.obj().put("account", accountName(providerId)), "the key endpoint answered HTTP " + status);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (java.io.IOException e) {
            throw StudioError.of(StudioError.PROVIDER_UNREACHABLE, Json.obj().put("account", accountName(providerId)), String.valueOf(e.getMessage()));
        }
    }

    private String saveCustom(JsonNode body) {
        String name = Json.text(body, "name", "").strip();
        String baseUrl = Json.text(body, "baseUrl", "").strip();
        if (name.isEmpty()) throw ApiException.invalid("a name is required");
        URI uri;
        try {
            uri = URI.create(baseUrl);
        } catch (IllegalArgumentException e) {
            throw ApiException.invalid("not an address: " + baseUrl);
        }
        if (uri.getScheme() == null || uri.getHost() == null || !(uri.getScheme().equals("http") || uri.getScheme().equals("https"))) {
            throw ApiException.invalid("the address starts with http:// or https://");
        }
        String existing = Json.text(body, "id");
        String id = existing != null && existing.startsWith("custom-") ? existing
            : "custom-" + name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (id.equals("custom-")) id = "custom-endpoint";
        ObjectNode json = Json.obj();
        ObjectNode custom = json.putObject("custom");
        custom.put("name", name);
        custom.put("baseUrl", baseUrl);
        String model = Json.text(body, "model");
        if (model != null && !model.isBlank()) custom.put("model", model.strip());
        jdbc.update("INSERT INTO provider_config (id, json, updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
            id, Json.write(json), Json.now());
        transport.rebuild();
        String key = Json.text(body, "apiKey");
        if (key != null && !key.isBlank()) llm().auth().save(id, ApiKeyCredential.of(key.strip()));
        return id;
    }

    /** Test, load models, pick the recommended one (§5 UX-7). Also runs after a successful sign-in. */
    public ObjectNode afterConnect(String providerId) {
        Provider p = require(providerId);
        ObjectNode params = Json.obj().put("account", accountName(providerId));
        try {
            llm().models().refresh(providerId);
        } catch (RuntimeException e) {
            log.debug("model listing of {}: {}", providerId, e.toString());
        }
        ModelService.Account account = new ModelService.Account(providerId, accountName(providerId), kindOf(providerId));
        String ref = models.recommendedRef(account);
        if (ref == null) {
            throw StudioError.of(StudioError.MODEL_UNAVAILABLE, params.put("model", "a model"), displayName(p) + " lists no model with text output and tool calling");
        }
        ModelService.Ref model = ModelService.Ref.parse(ref);
        ObjectNode test = test(providerId, model.model());
        if (!test.path("ok").asBoolean(false)) {
            String failed = Json.text(test, "firstFailure", "");
            String detail = Json.text(test, "detail", failed);
            String code = switch (failed) {
                case "AUTHENTICATION" -> StudioError.AUTH_REJECTED;
                case "MODEL_ACCESS" -> StudioError.MODEL_UNAVAILABLE;
                case "NETWORK" -> StudioError.PROVIDER_UNREACHABLE;
                default -> StudioError.codeOf(detail);
            };
            if (code.equals(StudioError.AGENT_ERROR)) code = StudioError.PROVIDER_UNREACHABLE;
            throw StudioError.of(code, params.put("model", model.model()), detail);
        }
        String chosen = models.ensureDefault(usable());
        changed(providerId);
        ObjectNode o = Json.obj();
        o.put("provider", providerId);
        o.put("name", accountName(providerId));
        o.put("recommended", ref);
        if (chosen != null) o.put("defaultModel", chosen);
        o.set("model", models.describe(chosen != null ? chosen : ref, usable()));
        return o;
    }

    /** The staged, non-billable connection test of the SDK; the result is stored with the account. */
    public ObjectNode test(String providerId, String modelId) {
        ObjectNode o = Json.obj();
        o.put("providerId", providerId);
        o.put("modelId", modelId);
        o.put("at", Json.now());
        try {
            Model model = llm().models().require(providerId, modelId);
            ConnectionReport report = llm().test(model);
            o.put("ok", report.ok());
            report.firstFailure().ifPresent(f -> {
                o.put("firstFailure", f.kind().name());
                o.put("detail", f.error().map(e -> e.code().value() + ": " + e.getMessage()).orElse(f.message()));
            });
        } catch (RuntimeException e) {
            o.put("ok", false);
            o.put("firstFailure", "CONFIGURATION");
            o.put("detail", e.getMessage() == null ? e.toString() : e.getMessage());
        }
        jdbc.update("INSERT INTO provider_config (id, json, last_test_json, updated_at) VALUES (?, '{}', ?, ?) ON CONFLICT(id) DO UPDATE SET last_test_json = excluded.last_test_json, updated_at = excluded.updated_at",
            providerId, Json.write(o), Json.now());
        return o;
    }

    public String accountName(String providerId) {
        if (FixtureBrain.PROVIDER.equals(providerId)) return "Demo";
        for (TransportService.Custom c : transport.customEndpoints()) if (c.id().equals(providerId)) return c.name();
        return provider(providerId).map(AccountService::displayName).orElse(providerId);
    }

    private String kindOf(String providerId) {
        for (JsonNode a : list()) if (providerId.equals(Json.text(a, "provider"))) return Json.text(a, "kind", "key");
        return "key";
    }

    // ------------------------------------------------------------------------------------------------ remove

    /**
     * `DELETE /accounts/{id}` (§6.3): the credential, the stored test result and the automatic profiles go; the
     * default model moves to the next recommended one. An environment key or a local server is switched off.
     */
    public ObjectNode remove(String providerId, String actor) {
        String kind = kindOf(providerId);
        require(providerId);
        forget(providerId, kind.equals("custom"));
        audit(actor, "account.remove", providerId, kind);
        transport.rebuild();
        String next = models.ensureDefault(usable());
        changed(providerId);
        ObjectNode o = Json.obj();
        o.put("removed", providerId);
        if (next != null) o.put("defaultModel", next); else o.putNull("defaultModel");
        return o;
    }

    private void forget(String providerId, boolean custom) {
        try {
            llm().auth().logout(providerId);
        } catch (RuntimeException e) {
            log.debug("logout of {}: {}", providerId, e.toString());
        }
        ObjectNode env = (ObjectNode) preferences.get(Preferences.ENV_KEYS).deepCopy();
        if (env.remove(providerId) != null) preferences.set(Preferences.ENV_KEYS, env);
        ObjectNode local = (ObjectNode) preferences.get(Preferences.LOCAL_SERVERS).deepCopy();
        if (local.remove(providerId) != null) preferences.set(Preferences.LOCAL_SERVERS, local);
        jdbc.update("DELETE FROM provider_config WHERE id = ?", providerId);
        profiles.deleteAutomatic(providerId);
        if (custom) log.info("custom endpoint {} removed", providerId);
    }

    /** What stops working when [providerId] is removed: tasks keep their history, the model leaves the picker. */
    public ObjectNode removalImpact(String providerId) {
        ObjectNode o = Json.obj();
        o.put("account", accountName(providerId));
        String current = preferences.text(Preferences.DEFAULT_MODEL);
        ModelService.Ref r = ModelService.Ref.parse(current);
        o.put("defaultModelAffected", r != null && r.provider().equals(providerId));
        int n = 0;
        for (JsonNode m : usableModels()) if (providerId.equals(Json.text(m, "provider"))) n++;
        o.put("models", n);
        return o;
    }

    public void changed(String providerId) {
        broker.publishApp("accounts.changed", Json.obj().put("provider", providerId));
    }

    private void audit(String actor, String action, String target, String details) {
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), actor, action, target, details);
    }

    /** Settings 4: the accounts with their models count, for the accounts list. */
    public Map<String, Integer> modelCounts() {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (JsonNode m : usableModels()) out.merge(Json.text(m, "provider"), 1, Integer::sum);
        return out;
    }
}
