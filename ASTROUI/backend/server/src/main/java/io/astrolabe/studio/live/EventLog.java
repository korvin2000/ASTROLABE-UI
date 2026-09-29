package io.astrolabe.studio.live;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The durable campaign stream (§3.5, §26.1 `event_log`): every `StudioItem` with a per-campaign Studio sequence,
 * committed before it is published (R-BE-04). It is a delivery record and cache, not a second ledger.
 */
@Component
public class EventLog {
    private final JdbcTemplate jdbc;
    private final Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();
    private final Map<String, Long> heads = new ConcurrentHashMap<>();

    public EventLog(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** The per-campaign lock ordering appends and subscription registration (no item slips between replay and live). */
    public ReentrantLock lock(String work) { return locks.computeIfAbsent(work, k -> new ReentrantLock()); }

    public long head(String work) {
        return heads.computeIfAbsent(work, w -> {
            Long v = jdbc.queryForObject("SELECT coalesce(max(seq), 0) FROM event_log WHERE work_id = ?", Long.class, w);
            return v == null ? 0L : v;
        });
    }

    /** Assigns the next sequence to [item], stores it and returns it (caller publishes). */
    public ObjectNode append(String work, ObjectNode item) {
        ReentrantLock lock = lock(work);
        lock.lock();
        try {
            long seq = head(work) + 1;
            item.put("seq", seq);
            jdbc.update("INSERT INTO event_log (work_id, seq, at, source, kind, cell, turn, payload) VALUES (?,?,?,?,?,?,?,?)",
                work, seq, Json.text(item, "at"), Json.text(item, "source"), Json.text(item, "kind"),
                Json.text(item, "cell"), item.hasNonNull("turn") ? item.get("turn").asInt() : null, Json.write(item));
            heads.put(work, seq);
            return item;
        } finally {
            lock.unlock();
        }
    }

    public List<JsonNode> after(String work, long sinceSeq, int limit) {
        List<JsonNode> items = new ArrayList<>();
        jdbc.query("SELECT payload FROM event_log WHERE work_id = ? AND seq > ? ORDER BY seq LIMIT ?",
            rs -> { items.add(Json.parse(rs.getString(1))); }, work, sinceSeq, limit);
        return items;
    }

    public boolean isEmpty(String work) { return head(work) == 0; }

    public void recordGap(String work, long fromSeq, String reason) {
        jdbc.update("INSERT OR IGNORE INTO gap (work_id, from_seq, at, reason) VALUES (?,?,?,?)", work, fromSeq, Json.now(), reason);
    }

    public long count() {
        Long v = jdbc.queryForObject("SELECT count(*) FROM event_log", Long.class);
        return v == null ? 0 : v;
    }

    public long gaps() {
        Long v = jdbc.queryForObject("SELECT count(*) FROM gap", Long.class);
        return v == null ? 0 : v;
    }
}
