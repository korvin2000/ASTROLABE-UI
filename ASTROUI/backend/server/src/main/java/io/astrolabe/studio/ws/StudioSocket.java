package io.astrolabe.studio.ws;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.astrolabe.studio.bridge.Versions;
import io.astrolabe.studio.commands.CommandService;
import io.astrolabe.studio.live.EventLog;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.security.LocalSession;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import jakarta.servlet.http.HttpServletRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * ASTRO-WS/1 (§27): one endpoint, JSON text frames, `hello/welcome`, `sub/subbed` with replay from a cursor, `evt`,
 * `cmd/result`, `ping/pong`. Callbacks parse, authenticate, validate, enqueue and return (§25.12); commands run on
 * virtual threads so lifecycle and decision commands never wait behind slow reads.
 */
@Configuration
@EnableWebSocket
public class StudioSocket extends TextWebSocketHandler implements WebSocketConfigurer {
    private static final Logger log = LoggerFactory.getLogger(StudioSocket.class);
    public static final String EPOCH = Long.toString(System.currentTimeMillis(), 36);

    private final TopicBroker broker;
    private final EventLog eventLog;
    private final EventPipeline pipeline;
    private final CommandService commands;
    private final LocalSession session;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public StudioSocket(TopicBroker broker, EventLog eventLog, EventPipeline pipeline, CommandService commands, LocalSession session) {
        this.broker = broker;
        this.eventLog = eventLog;
        this.pipeline = pipeline;
        this.commands = commands;
        this.session = session;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(this, "/api/v1/ws")
            .addInterceptors(new HandshakeInterceptor() {
                @Override
                public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Map<String, Object> attributes) {
                    if (!(request instanceof ServletServerHttpRequest servlet)) return false;
                    HttpServletRequest http = servlet.getServletRequest();
                    if (!session.authenticated(http)) return false;
                    return session.allowedOrigin(http.getHeader("Origin"));
                }

                @Override
                public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Exception exception) { }
            })
            .setAllowedOriginPatterns("*");
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession ws) {
        ws.setTextMessageSizeLimit(1024 * 1024);
        broker.register(ws);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession ws, CloseStatus status) {
        broker.unregister(ws.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession ws, TextMessage message) {
        TopicBroker.Client client = broker.client(ws.getId());
        if (client == null) return;
        JsonNode frame;
        try {
            frame = Json.parse(message.getPayload());
        } catch (RuntimeException e) {
            broker.send(client, err(null, ApiException.invalid("malformed frame")));
            return;
        }
        String t = Json.text(frame, "t", "");
        String id = Json.text(frame, "id");
        switch (t) {
            case "hello" -> {
                broker.send(client, welcome());
                for (JsonNode r : Json.each(frame.path("data").path("resume"))) {
                    subscribe(client, null, Json.text(r, "topic"), r.path("sinceSeq").asLong(0));
                }
            }
            case "sub" -> subscribe(client, id, Json.text(frame, "topic"), frame.path("sinceSeq").asLong(0));
            case "unsub" -> broker.unsubscribe(client, Json.text(frame, "topic"));
            case "ping" -> broker.send(client, Json.obj().put("v", 1).put("t", "pong"));
            case "cmd" -> executor.execute(() -> {
                ObjectNode running = Json.obj().put("v", 1).put("t", "result").put("id", id);
                running.putObject("data").put("status", "running");
                broker.send(client, running);
                CommandService.Outcome outcome = commands.execute(frame, "local");
                ObjectNode result = Json.obj().put("v", 1).put("t", "result").put("id", id);
                ObjectNode data = result.putObject("data");
                data.put("status", outcome.status());
                if (outcome.result() != null) data.set("result", outcome.result());
                if (outcome.error() != null) data.set("error", outcome.error().toJson(id));
                broker.send(client, result);
            });
            default -> broker.send(client, err(id, ApiException.invalid("unknown frame type '" + t + "'")));
        }
    }

    private ObjectNode welcome() {
        ObjectNode w = Json.obj().put("v", 1).put("t", "welcome");
        ObjectNode d = w.putObject("data");
        d.put("sessionId", "s-" + Long.toString(System.nanoTime(), 36));
        d.put("epoch", EPOCH);
        d.put("server", "0.1.0");
        d.put("astrolabe", Versions.getAstrolabe());
        d.put("storeSchema", Versions.getStoreSchema());
        d.put("aiGate", Versions.getAiGate());
        d.put("mode", "live");
        d.put("heartbeatMs", 15_000);
        d.putObject("limits").put("frameBytes", 262_144).put("queuedFrames", 2_000);
        d.putObject("capabilities").put("textPreview", false).put("confined", false).put("mcp", false).put("resume", true);
        return w;
    }

    /** `sub`: replay after the cursor, then live; the per-campaign lock keeps replay and live contiguous (§27.4). */
    private void subscribe(TopicBroker.Client client, String id, String topic, long sinceSeq) {
        if (topic == null) {
            broker.send(client, err(id, new ApiException("unknown_topic", 400, "missing topic")));
            return;
        }
        if (topic.equals(TopicBroker.APP)) {
            broker.subscribe(client, topic);
            ObjectNode subbed = Json.obj().put("v", 1).put("t", "subbed").put("topic", topic);
            if (id != null) subbed.put("id", id);
            subbed.putObject("data").put("headSeq", broker.appHead());
            broker.send(client, subbed);
            for (ObjectNode item : broker.appAfter(sinceSeq)) broker.send(client, TopicBroker.evt(topic, item));
            return;
        }
        if (topic.startsWith("campaign:")) {
            String work = topic.substring("campaign:".length());
            executor.execute(() -> {
                pipeline.backfillIfEmpty(work);
                var lock = eventLog.lock(work);
                lock.lock();
                try {
                    long head = eventLog.head(work);
                    long from = sinceSeq > head ? 0 : sinceSeq;
                    ObjectNode subbed = Json.obj().put("v", 1).put("t", "subbed").put("topic", topic);
                    if (id != null) subbed.put("id", id);
                    subbed.putObject("data").put("headSeq", head).put("epoch", EPOCH);
                    broker.send(client, subbed);
                    long cursor = from;
                    while (true) {
                        List<JsonNode> page = eventLog.after(work, cursor, 2_000);
                        for (JsonNode item : page) broker.send(client, TopicBroker.evt(topic, item));
                        if (page.size() < 2_000) break;
                        cursor = page.getLast().get("seq").asLong();
                    }
                    broker.subscribe(client, topic);
                } finally {
                    lock.unlock();
                }
            });
            return;
        }
        broker.send(client, err(id, new ApiException("unknown_topic", 400, "unknown topic " + topic)));
    }

    private static ObjectNode err(String id, ApiException e) {
        ObjectNode f = Json.obj().put("v", 1).put("t", "err");
        if (id != null) f.put("id", id);
        f.set("data", e.toJson(id));
        return f;
    }

    @Override
    public void handleTransportError(WebSocketSession ws, Throwable exception) {
        log.debug("socket {} transport error: {}", ws.getId(), exception.toString());
    }
}
