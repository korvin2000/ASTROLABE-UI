package io.astrolabe.studio.runtime;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import io.astrolabe.studio.StudioProperties;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;

import net.ai.gate.Llm;
import net.ai.gate.auth.CredentialStore;
import net.ai.gate.auth.Environment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Service;

/**
 * The AI Gate runtime (§25.6): one `Llm` per backend with the presets, the Studio's credential store, the
 * environment policy (OD-06), a frozen catalog snapshot, telemetry, and the fixture-mode demo provider. A rebuild
 * (credentials or provider changes) never touches running campaigns: they keep the runtime they started with.
 */
@Service
public class TransportService implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(TransportService.class);

    private final StudioProperties properties;
    private final Path dataDir;
    private final FixtureBrain brain;
    private final CredentialStore credentials;
    private final Telemetry telemetry;
    private final List<Path> roots = new CopyOnWriteArrayList<>();
    private final List<Llm> retired = new CopyOnWriteArrayList<>();
    private volatile Llm llm;

    public TransportService(StudioProperties properties, Telemetry telemetry) {
        this.properties = properties;
        this.telemetry = telemetry;
        this.dataDir = properties.dataPath();
        this.brain = new FixtureBrain(() -> List.copyOf(roots), properties.fixtureLatencyMillis(), 60);
        try {
            Files.createDirectories(dataDir);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("cannot create the Studio data directory " + dataDir, e);
        }
        // G-27 interim: the SDK's owner-only file store; the UI states that it is not encrypted.
        this.credentials = CredentialStore.file(dataDir.resolve("credentials.json"));
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

    /** Builds a fresh runtime for future campaigns; the previous one closes at shutdown (running calls keep it). */
    public synchronized void rebuild() {
        Llm previous = llm;
        llm = build();
        if (previous != null) retired.add(previous);
    }

    private Llm build() {
        Llm.Builder builder = Llm.builder()
            .discoverProviders()
            .provider(brain.provider())
            .credentials(credentials)
            .environment(properties.useEnvironmentKeys() ? Environment.system() : Environment.none())
            .catalog(c -> c.snapshotFile(dataDir.resolve("catalog-snapshot.json")).manualRefresh())
            .listener(telemetry);
        Llm built = builder.build();
        log.info("AI Gate runtime ready (demo provider '{}', environment keys {})", FixtureBrain.PROVIDER, properties.useEnvironmentKeys() ? "on" : "off");
        return built;
    }

    /** Repository roots the demo model may resolve paths against. */
    public void registerRoot(Path root) {
        if (!roots.contains(root)) roots.add(0, root);
    }

    public FixtureBrain brain() { return brain; }

    public Path dataDir() { return dataDir; }

    public String credentialStorage() { return "file (owner-only, not encrypted — G-27): " + dataDir.resolve("credentials.json"); }

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
