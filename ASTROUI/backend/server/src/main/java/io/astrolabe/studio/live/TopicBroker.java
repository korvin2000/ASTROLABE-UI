package io.astrolabe.studio.live;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import io.astrolabe.studio.support.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Delivers frames to WebSocket sessions by topic (§27.4). Sends are serialized per session by Spring's
 * `ConcurrentWebSocketSessionDecorator` (buffered, bounded); a slow client never backpressures the coding loop — an
 * overflow closes that session, which then resumes from its cursor (§27.7, §27.8).
 */
@Component
public class TopicBroker {
    private static final Logger log = LoggerFactory.getLogger(TopicBroker.class);
    public static final String APP = "app";
    private static final int APP_REPLAY = 500;

    public static final class Client {
        final WebSocketSession session;
        final Set<String> topics = ConcurrentHashMap.newKeySet();

        Client(WebSocketSession raw) {
            this.session = new ConcurrentWebSocketSessionDecorator(raw, 10_000, 8 * 1024 * 1024, ConcurrentWebSocketSessionDecorator.OverflowStrategy.TERMINATE);
        }

        public String id() { return session.getId(); }
    }

    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    private final AtomicLong appSeq = new AtomicLong();
    private final ArrayDeque<ObjectNode> appRing = new ArrayDeque<>();
    private final AtomicLong sent = new AtomicLong();
    private final AtomicLong failures = new AtomicLong();

    public Client register(WebSocketSession session) {
        Client c = new Client(session);
        clients.put(session.getId(), c);
        return c;
    }

    public void unregister(String sessionId) { clients.remove(sessionId); }

    public Client client(String sessionId) { return clients.get(sessionId); }

    public Collection<Client> clients() { return clients.values(); }

    public void subscribe(Client c, String topic) { c.topics.add(topic); }

    public void unsubscribe(Client c, String topic) { c.topics.remove(topic); }

    /** Sends one frame to one client. */
    public void send(Client c, JsonNode frame) {
        try {
            c.session.sendMessage(new TextMessage(Json.write(frame)));
            sent.incrementAndGet();
        } catch (IOException | IllegalStateException e) {
            failures.incrementAndGet();
            log.debug("send to {} failed: {}", c.id(), e.toString());
        }
    }

    /** An `evt` frame for [topic] carrying [item] (a StudioItem or app item). */
    public static ObjectNode evt(String topic, JsonNode item) {
        ObjectNode f = Json.obj();
        f.put("v", 1);
        f.put("t", "evt");
        f.put("topic", topic);
        if (item.hasNonNull("seq")) f.set("seq", item.get("seq"));
        f.set("data", item);
        return f;
    }

    public void publish(String topic, JsonNode item) {
        ObjectNode frame = evt(topic, item);
        for (Client c : clients.values()) {
            if (c.topics.contains(topic)) send(c, frame);
        }
    }

    /**
     * Publishes an `app` item (decisions, notifications, campaign index changes, provider health, jobs). The last
     * [APP_REPLAY] items replay on subscribe (§27.4).
     */
    public ObjectNode publishApp(String kind, JsonNode data) {
        ObjectNode item = Json.obj();
        synchronized (appRing) {
            item.put("seq", appSeq.incrementAndGet());
            item.put("at", Json.now());
            item.put("kind", kind);
            item.set("data", data);
            appRing.addLast(item);
            while (appRing.size() > APP_REPLAY) appRing.removeFirst();
        }
        publish(APP, item);
        return item;
    }

    public List<ObjectNode> appAfter(long sinceSeq) {
        synchronized (appRing) {
            List<ObjectNode> out = new ArrayList<>();
            for (ObjectNode n : appRing) if (n.get("seq").asLong() > sinceSeq) out.add(n);
            return out;
        }
    }

    public long appHead() { return appSeq.get(); }

    public long sent() { return sent.get(); }

    public long failures() { return failures.get(); }
}
