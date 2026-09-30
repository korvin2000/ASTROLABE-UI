package io.astrolabe.studio.runtime;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import io.astrolabe.studio.StudioProperties;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.settings.Preferences;
import io.astrolabe.studio.support.Json;

import net.ai.gate.Llm;
import net.ai.gate.Provider;
import net.ai.gate.auth.CredentialStore;
import net.ai.gate.auth.Environment;
import net.ai.gate.model.Capability;
import net.ai.gate.model.Modality;
import net.ai.gate.model.Model;
import net.ai.gate.vendors.openai.OpenAiCompatible;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;

/**
 * The AI Gate runtime (§25.6): one `Llm` per backend with the presets, the user's custom endpoints, the Studio's
 * credential store, a frozen catalog snapshot and telemetry. Environment keys reach it only for the providers the
 * user enabled (Studio 2 §6.3); the demo provider is registered only in demo mode (BE-9). A rebuild (accounts or
 * demo mode changed) never touches running tasks: they keep the runtime they started with.
 */
@Service
public class TransportService implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(TransportService.class);

    /** A custom OpenAI-compatible endpoint the user added (§6.1). */
    public record Custom(String id, String name, String baseUrl, String model) { }

    private final StudioProperties properties;
    private final Preferences preferences;
    private final JdbcTemplate jdbc;
    private final Path dataDir;
    private final FixtureBrain brain;
    private final CredentialStore credentials;
    private final Path credentialFile;
    private final Telemetry telemetry;
    private final List<Path> roots = new CopyOnWriteArrayList<>();
    /** Project roots of the runs the demo model serves at the moment, by run. */
    private final Map<String, Path> demoRuns = new ConcurrentHashMap<>();
    private final List<Llm> retired = new CopyOnWriteArrayList<>();
    private volatile Llm llm;

    public TransportService(StudioProperties properties, Telemetry telemetry, Preferences preferences, JdbcTemplate jdbc) {
        this.properties = properties;
        this.telemetry = telemetry;
        this.preferences = preferences;
        this.jdbc = jdbc;
        this.dataDir = properties.dataPath();
        this.brain = new FixtureBrain(this::demoRoots, properties.fixtureLatencyMillis(), 60);
        try {
            Files.createDirectories(dataDir);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("cannot create the Studio data directory " + dataDir, e);
        }
        // G-27 interim: the SDK's owner-only file store; the UI states that it is not encrypted. `STUDIO_CREDENTIALS` names
        // another store, so a separate test instance can use an existing sign-in without copying it (a copied OAuth
        // login would rotate its refresh token away from the original).
        String shared = System.getenv("STUDIO_CREDENTIALS");
        this.credentialFile = shared != null && !shared.isBlank() ? Path.of(shared) : dataDir.resolve("credentials.json");
        this.credentials = CredentialStore.file(credentialFile);
    }

    /** The current runtime, built lazily. */
    public Llm llm() {
        Llm current = llm;
        if (current != null) return current;
        synchronized (this) {
            if (llm == null) llm = build();
            return llm;
        }
    }

    /** Builds a fresh runtime for future tasks; the previous one closes at shutdown (running calls keep it). */
    public synchronized void rebuild() {
        Llm previous = llm;
        llm = build();
        if (previous != null) retired.add(previous);
    }

    /** True when the scripted demo model is offered (setting 15, or the `STUDIO_FIXTURES` switch). */
    public boolean demoMode() { return properties.fixtures() || preferences.flag(Preferences.DEMO_MODE); }

    /** The environment variable names the user allowed, by provider id. */
    public java.util.Map<String, String> enabledEnvKeys() {
        java.util.Map<String, String> out = new java.util.LinkedHashMap<>();
        if (!properties.useEnvironmentKeys()) return out;
        JsonNode enabled = preferences.get(Preferences.ENV_KEYS);
        if (enabled != null && enabled.isObject()) {
            for (var e : enabled.properties()) if (e.getValue().isString()) out.put(e.getKey(), e.getValue().asString());
        }
        return out;
    }

    public List<Custom> customEndpoints() {
        List<Custom> out = new ArrayList<>();
        jdbc.query("SELECT id, json FROM provider_config", rs -> {
            JsonNode custom = Json.parse(rs.getString(2)).path("custom");
            if (custom.isObject()) out.add(new Custom(rs.getString(1), Json.text(custom, "name", rs.getString(1)), Json.text(custom, "baseUrl"), Json.text(custom, "model")));
        });
        return out;
    }

    /** The provider of a custom endpoint; a named model is described with conservative limits (§6.5). */
    public static Provider customProvider(Custom c) {
        Provider.Builder b = OpenAiCompatible.custom(c.id(), URI.create(c.baseUrl())).toBuilder().name(c.name());
        if (c.model() != null && !c.model().isBlank()) {
            b.model(Model.builder(c.id(), c.model()).name(c.model()).input(Modality.TEXT).output(Modality.TEXT)
                .contextWindow(32_768).maxOutputTokens(4_096).supports(Capability.STREAMING, Capability.TOOLS).build());
        }
        return b.build();
    }

    private Llm build() {
        Set<String> allowed = new HashSet<>(enabledEnvKeys().values());
        Environment system = Environment.system();
        Environment environment = name -> allowed.contains(name) ? system.get(name) : Optional.empty();
        Llm.Builder builder = Llm.builder()
            .discoverProviders()
            .credentials(credentials)
            .environment(environment)
            .catalog(c -> c.snapshotFile(dataDir.resolve("catalog-snapshot.json")).manualRefresh())
            .listener(telemetry);
        boolean demo = demoMode();
        if (demo) builder.provider(brain.provider());
        int custom = 0;
        for (Custom c : customEndpoints()) {
            try {
                builder.provider(customProvider(c));
                custom++;
            } catch (RuntimeException e) {
                log.warn("custom endpoint {} skipped: {}", c.id(), e.getMessage());
            }
        }
        Llm built = builder.build();
        log.info("AI Gate runtime ready (demo {}, environment keys allowed {}, custom endpoints {})", demo ? "on" : "off", allowed.size(), custom);
        return built;
    }

    /** Repository roots the demo model may resolve paths against. */
    public void registerRoot(Path root) {
        if (!roots.contains(root)) roots.add(0, root);
    }

    /**
     * A demo run starts in [root]. While demo runs work in one project only, the demo model knows its project
     * without a hint in the request.
     */
    public void demoStarted(String workId, Path root) { demoRuns.put(workId, root); }

    public void demoEnded(String workId) { demoRuns.remove(workId); }

    private List<Path> demoRoots() {
        List<Path> active = demoRuns.values().stream().distinct().toList();
        return active.isEmpty() ? List.copyOf(roots) : active;
    }

    public FixtureBrain brain() { return brain; }

    public Path dataDir() { return dataDir; }

    public String credentialStorage() { return "file (owner-only, not encrypted — G-27): " + credentialFile; }

    @Override
    public void destroy() {
        for (Llm l : retired) closeQuietly(l);
        if (llm != null) closeQuietly(llm);
    }

    private static void closeQuietly(Llm l) {
        try {
            l.close();
        } catch (RuntimeException e) {
            log.debug("closing runtime: {}", e.toString());
        }
    }
}
