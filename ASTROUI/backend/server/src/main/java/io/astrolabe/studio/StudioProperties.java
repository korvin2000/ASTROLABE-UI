package io.astrolabe.studio;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Studio host configuration (§31 `studio.yaml`, `STUDIO_*` overrides). The bind address is always loopback in v1.
 *
 * @param dataDir            Studio data directory (studio.db, credentials, catalog snapshot, fixtures, exports); blank = OS default
 * @param fixtures           create and register the demo repository on first start (fixture mode, §24.3)
 * @param fixtureLatencyMillis think time of the scripted demo model per reply
 * @param security           launch-token session, Origin/Host and CSRF checks (§30.1); off only for local development
 * @param openBrowser        open the launch URL in the default browser at start
 * @param devOrigins         extra allowed origins (the Angular dev server) when security is on
 * @param useEnvironmentKeys API keys from environment variables (OD-06)
 */
@ConfigurationProperties(prefix = "studio")
public record StudioProperties(
        String dataDir,
        boolean fixtures,
        long fixtureLatencyMillis,
        boolean security,
        boolean openBrowser,
        String devOrigins,
        boolean useEnvironmentKeys) {

    public StudioProperties {
        if (fixtureLatencyMillis < 0) fixtureLatencyMillis = 0;
    }

    /** The resolved data directory: explicit, else `%LOCALAPPDATA%\AstrolabeStudio` or `~/.local/share/astrolabe-studio`. */
    public Path dataPath() {
        if (dataDir != null && !dataDir.isBlank()) return Path.of(dataDir).toAbsolutePath().normalize();
        String os = System.getProperty("os.name", "").toLowerCase();
        String home = System.getProperty("user.home");
        if (os.contains("win")) {
            String local = System.getenv("LOCALAPPDATA");
            return Path.of(local != null && !local.isBlank() ? local : home, "AstrolabeStudio");
        }
        String xdg = System.getenv("XDG_DATA_HOME");
        return (xdg != null && !xdg.isBlank() ? Path.of(xdg) : Path.of(home, ".local", "share")).resolve("astrolabe-studio");
    }
}
