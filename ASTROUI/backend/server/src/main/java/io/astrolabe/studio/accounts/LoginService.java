package io.astrolabe.studio.accounts;

import java.net.InetAddress;
import java.net.ServerSocket;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;
import io.astrolabe.studio.support.StudioError;

import net.ai.gate.Provider;
import net.ai.gate.auth.AuthType;
import net.ai.gate.auth.interaction.AuthInteraction;
import net.ai.gate.auth.interaction.AuthNotice;
import net.ai.gate.auth.interaction.AuthPrompt;
import net.ai.gate.lifecycle.CancelToken;
import net.ai.gate.providers.Providers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Service;

import tools.jackson.databind.node.ObjectNode;

/**
 * Sign-in sessions (Studio 2 §6.2, BE-2). The SDK's login blocks, so each session runs on a virtual thread; the
 * `AuthInteraction` answers the method prompt with what the user chose and forwards the address to open or the code
 * to type to the UI. Tokens stay in the backend's credential store; the UI sees states only.
 *
 * <pre>
 * starting → waiting_for_browser | waiting_for_code → finishing → connected
 * any state → cancelled | timed_out | failed(code)
 * </pre>
 */
@Service
public class LoginService implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(LoginService.class);
    /** Presets whose redirect is registered on a fixed loopback port (§6.2): the listener needs that port free. */
    private static final Map<String, Integer> FIXED_PORT = Map.of("openai-codex", 1455);
    private static final Duration SESSION_LIMIT = Duration.ofMinutes(16);

    private final TransportService transport;
    private final AccountService accounts;
    private final TopicBroker broker;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public LoginService(TransportService transport, AccountService accounts, TopicBroker broker) {
        this.transport = transport;
        this.accounts = accounts;
        this.broker = broker;
    }

    private static final class Session {
        final String id = "login-" + UUID.randomUUID().toString().substring(0, 8);
        final String provider;
        final CancelToken cancel = CancelToken.create();
        final Instant startedAt = Instant.now();
        volatile String method;
        volatile String state = "starting";
        volatile String url;
        volatile String userCode;
        volatile String verificationUri;
        volatile Instant expiresAt;
        volatile String fallback;
        volatile ObjectNode error;
        volatile ObjectNode result;
        volatile Thread thread;

        Session(String provider, String method) {
            this.provider = provider;
            this.method = method;
        }

        boolean terminal() { return switch (state) { case "connected", "cancelled", "timed_out", "failed" -> true; default -> false; }; }
    }

    private static boolean supportsCode(String providerId) { return "openai-codex".equals(providerId); }

    /** True when nothing listens on the loopback [port]. */
    static boolean portFree(int port) {
        try (ServerSocket socket = new ServerSocket(port, 1, InetAddress.getLoopbackAddress())) {
            return socket.isBound();
        } catch (java.io.IOException e) {
            return false;
        }
    }

    /** `POST /accounts/login`: `{ provider, method: browser|code }`. */
    public ObjectNode start(String providerId, String requested) {
        Provider provider = Providers.presets().stream().filter(p -> p.id().equals(providerId)).findFirst()
            .orElseThrow(() -> ApiException.notFound("no account type " + providerId));
        if (provider.oauthAuth().isEmpty()) throw ApiException.invalid(provider.name() + " has no sign-in; use an API key");
        String method = "code".equals(requested) ? "code" : "browser";
        if (method.equals("code") && !supportsCode(providerId)) throw ApiException.invalid(provider.name() + " has no sign-in with a code");
        for (Session other : sessions.values()) {
            if (other.provider.equals(providerId) && !other.terminal()) cancel(other.id);
        }
        Session s = new Session(providerId, method);
        Integer port = FIXED_PORT.get(providerId);
        if (method.equals("browser") && port != null && !portFree(port)) {
            // E-10: another app (a Codex CLI login, for example) holds the sign-in port; the code path needs none.
            if (!supportsCode(providerId)) {
                s.state = "failed";
                s.error = StudioError.of(StudioError.LOGIN_PORT_BUSY, Json.obj().put("port", port), "port " + port + " is in use").body();
                sessions.put(s.id, s);
                return dto(s);
            }
            s.method = "code";
            s.fallback = StudioError.LOGIN_PORT_BUSY;
        }
        sessions.put(s.id, s);
        s.thread = Thread.ofVirtual().name("login-" + providerId).start(() -> run(s));
        return dto(s);
    }

    private void run(Session s) {
        AuthInteraction ui = new AuthInteraction() {
            @Override
            public String prompt(AuthPrompt prompt) {
                if (prompt instanceof AuthPrompt.Select) return s.method.equals("code") ? "device" : "browser";
                throw new IllegalStateException("this sign-in asks for input the Studio cannot give: " + prompt.message());
            }

            @Override
            public void notify(AuthNotice notice) {
                switch (notice) {
                    case AuthNotice.OpenUrl open -> {
                        s.url = open.url().toString();
                        if (s.method.equals("browser")) move(s, "waiting_for_browser");
                        else publish(s);
                    }
                    case AuthNotice.DeviceCode code -> {
                        s.userCode = code.userCode();
                        s.verificationUri = code.verificationUri().toString();
                        s.expiresAt = code.expiresAt();
                        move(s, "waiting_for_code");
                    }
                    default -> { }
                }
            }
        };
        try {
            transport.llm().auth().login(s.provider, AuthType.OAUTH, ui, s.cancel);
            if (s.cancel.isCancelled()) {
                move(s, "cancelled");
                return;
            }
            move(s, "finishing");
            transport.rebuild();
            try {
                s.result = accounts.afterConnect(s.provider);
            } catch (StudioError e) {
                // Signed in, but the first check failed: the account is connected and the sentence says what is wrong.
                s.result = Json.obj().put("provider", s.provider).put("name", accounts.accountName(s.provider));
                s.result.set("warning", e.body());
                accounts.changed(s.provider);
            }
            move(s, "connected");
        } catch (RuntimeException e) {
            if (s.cancel.isCancelled()) {
                move(s, "cancelled");
                return;
            }
            String text = String.valueOf(e.getMessage()).toLowerCase(Locale.ROOT);
            boolean timeout = text.contains("no browser callback within") || text.contains("expired before it was approved");
            String code = timeout ? StudioError.LOGIN_TIMEOUT
                : text.contains("access_denied") || text.contains("access was denied") ? StudioError.LOGIN_DENIED
                : text.contains("address already in use") || text.contains("bind") ? StudioError.LOGIN_PORT_BUSY
                : StudioError.LOGIN_FAILED;
            s.error = StudioError.of(code, Json.obj().put("account", accounts.accountName(s.provider)), e.getClass().getSimpleName() + ": " + e.getMessage()).body();
            log.info("sign-in to {} ended: {} ({})", s.provider, code, e.getMessage());
            move(s, timeout ? "timed_out" : "failed");
        }
    }

    private void move(Session s, String state) {
        s.state = state;
        publish(s);
    }

    private void publish(Session s) { broker.publishApp("auth.login.updated", dto(s)); }

    public ObjectNode get(String id) {
        Session s = sessions.get(id);
        if (s == null) throw ApiException.notFound("no sign-in " + id);
        if (!s.terminal() && Duration.between(s.startedAt, Instant.now()).compareTo(SESSION_LIMIT) > 0) {
            s.cancel.cancel();
            s.error = StudioError.of(StudioError.LOGIN_TIMEOUT, Json.obj().put("account", accounts.accountName(s.provider)), "the sign-in was not finished in time").body();
            move(s, "timed_out");
        }
        return dto(s);
    }

    /** `POST /accounts/login/{id}/cancel`. */
    public ObjectNode cancel(String id) {
        Session s = sessions.get(id);
        if (s == null) throw ApiException.notFound("no sign-in " + id);
        if (!s.terminal()) {
            s.cancel.cancel();
            Thread t = s.thread;
            if (t != null) t.interrupt();
            move(s, "cancelled");
        }
        return dto(s);
    }

    private ObjectNode dto(Session s) {
        ObjectNode o = Json.obj();
        o.put("loginId", s.id);
        o.put("provider", s.provider);
        o.put("name", accounts.accountName(s.provider));
        o.put("method", s.method);
        o.put("state", s.state);
        if (s.url != null) o.put("url", s.url);
        if (s.userCode != null) o.put("userCode", s.userCode);
        if (s.verificationUri != null) o.put("verificationUri", s.verificationUri);
        if (s.expiresAt != null) o.put("expiresAt", s.expiresAt.toString());
        if (s.fallback != null) o.put("fallback", s.fallback);
        if (s.error != null) o.set("error", s.error);
        if (s.result != null) o.set("result", s.result);
        return o;
    }

    @Override
    public void destroy() {
        for (Session s : sessions.values()) if (!s.terminal()) s.cancel.cancel();
    }
}
