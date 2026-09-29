package io.astrolabe.studio.security;

import java.io.IOException;
import java.nio.file.Files;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import io.astrolabe.studio.StudioProperties;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Local single-user session (§30.1): a 256-bit single-use launch token exchanged at `/launch` for an HttpOnly,
 * SameSite=Strict session cookie; a double-submit CSRF header on REST mutations; `Host` restricted to the loopback
 * origin (DNS-rebinding protection); `Origin` checked on WebSocket upgrades. No CORS.
 */
@Component
@Order(1)
public class LocalSession extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(LocalSession.class);
    public static final String SESSION = "studio_session";
    public static final String CSRF = "studio_csrf";
    public static final String CSRF_HEADER = "X-Studio-CSRF";
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");

    private final StudioProperties properties;
    private final SecureRandom random = new SecureRandom();
    private final String sessionSecret = token();
    private final String csrfSecret = token();
    private final AtomicReference<String> launchToken = new AtomicReference<>(token());
    private volatile int port;

    public LocalSession(StudioProperties properties) { this.properties = properties; }

    private String token() {
        byte[] b = new byte[32];
        random.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void announce(ApplicationReadyEvent event) {
        ApplicationContext ctx = event.getApplicationContext();
        if (ctx instanceof WebServerApplicationContext web) port = web.getWebServer().getPort();
        String url = launchUrl();
        log.info("ASTROLABE Studio is ready: {}", url);
        writeLaunchFile();
        if (properties.openBrowser() && java.awt.Desktop.isDesktopSupported()) {
            try {
                java.awt.Desktop.getDesktop().browse(java.net.URI.create(url));
            } catch (Exception e) {
                log.info("open the launch URL in a browser: {}", url);
            }
        }
    }

    /** Keeps `launch-url.txt` (owner's data directory) on the current single-use link, so another browser can sign in. */
    private void writeLaunchFile() {
        try {
            Files.writeString(properties.dataPath().resolve("launch-url.txt"), launchUrl() + System.lineSeparator());
        } catch (IOException e) {
            log.debug("launch url not written: {}", e.toString());
        }
    }

    /** The one-time launch URL (a fresh token each time it is consumed). */
    public String launchUrl() {
        return properties.security() ? "http://127.0.0.1:" + port + "/launch?t=" + launchToken.get() : "http://127.0.0.1:" + port + "/";
    }

    public boolean security() { return properties.security(); }

    public int port() { return port; }

    /** True when [request] carries the session cookie (or security is off). */
    public boolean authenticated(HttpServletRequest request) {
        if (!properties.security()) return true;
        return sessionSecret.equals(cookie(request, SESSION));
    }

    public boolean allowedHost(String host) {
        if (!properties.security() || host == null) return !properties.security();
        String h = host.toLowerCase();
        return h.equals("127.0.0.1:" + port) || h.equals("localhost:" + port) || isDevOrigin("http://" + h);
    }

    public boolean allowedOrigin(String origin) {
        if (!properties.security()) return true;
        if (origin == null) return false;
        String o = origin.toLowerCase();
        return o.equals("http://127.0.0.1:" + port) || o.equals("http://localhost:" + port) || isDevOrigin(o);
    }

    private boolean isDevOrigin(String origin) {
        String dev = properties.devOrigins();
        if (dev == null || dev.isBlank()) return false;
        for (String d : dev.split(",")) if (d.trim().equalsIgnoreCase(origin)) return true;
        return false;
    }

    private static String cookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) if (name.equals(c.getName())) return c.getValue();
        return null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path.equals("/launch")) {
            String t = request.getParameter("t");
            String expected = launchToken.get();
            if (!properties.security() || (t != null && t.equals(expected) && launchToken.compareAndSet(expected, token()))) {
                if (properties.security()) writeLaunchFile();
                response.addHeader("Set-Cookie", SESSION + "=" + sessionSecret + "; Path=/; HttpOnly; SameSite=Strict");
                response.addHeader("Set-Cookie", CSRF + "=" + csrfSecret + "; Path=/; SameSite=Strict");
                response.sendRedirect("/");
                return;
            }
            deny(response, 401, new ApiException("unauthorized", 401, "the launch link was already used or is invalid; restart the Studio or use the link it printed"));
            return;
        }
        if (!properties.security()) {
            chain.doFilter(request, response);
            return;
        }
        if (!allowedHost(request.getHeader("Host"))) {
            deny(response, 403, new ApiException("forbidden_origin", 403, "the Host header is not the Studio origin"));
            return;
        }
        boolean api = path.startsWith("/api/");
        if (api && !path.equals("/api/v1/health")) {
            if (!authenticated(request)) {
                deny(response, 401, new ApiException("unauthorized", 401, "no Studio session: open the launch link printed at start"));
                return;
            }
            if (!SAFE.contains(request.getMethod()) && !csrfSecret.equals(request.getHeader(CSRF_HEADER))) {
                deny(response, 403, new ApiException("forbidden_origin", 403, "missing or wrong CSRF header"));
                return;
            }
        }
        if (!api && authenticated(request) && cookie(request, CSRF) == null) {
            response.addHeader("Set-Cookie", CSRF + "=" + csrfSecret + "; Path=/; SameSite=Strict");
        }
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        if (!api) {
            response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-ancestors 'none'");
        }
        chain.doFilter(request, response);
    }

    private static void deny(HttpServletResponse response, int status, ApiException e) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write(Json.write(e.toJson(null)));
    }
}
