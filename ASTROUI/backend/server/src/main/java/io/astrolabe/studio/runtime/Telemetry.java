package io.astrolabe.studio.runtime;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

import io.astrolabe.studio.support.Json;

import net.ai.gate.event.CredentialEvent;
import net.ai.gate.event.LlmEvent;
import net.ai.gate.event.LlmListener;
import net.ai.gate.event.RequestEvent;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import tools.jackson.databind.node.ArrayNode;

/**
 * `LlmTelemetryListener` (§25.7): provider telemetry is diagnostic and never added to campaign totals. The listener
 * returns at once; rows are written on a virtual thread. In-flight calls feed the Activity drawer (§14).
 */
@Component
public class Telemetry implements LlmListener, DisposableBean {
    private final JdbcTemplate jdbc;
    private final ExecutorService writer = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("telemetry").factory());
    private final Map<String, InFlight> inFlight = new ConcurrentHashMap<>();
    private volatile Runnable onChange = () -> { };

    public record InFlight(String requestId, String provider, String model, Instant startedAt, int attempt, Long firstOutputMillis, long outputChars, String invocation) { }

    public Telemetry(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void onChange(Runnable listener) { this.onChange = listener; }

    @Override
    public void onEvent(LlmEvent event) {
        switch (event) {
            case RequestEvent.Started s -> {
                inFlight.put(s.requestId(), new InFlight(s.requestId(), s.providerId(), s.model().modelId(), s.at(), 1, null, 0, s.tags().get("astrolabe.invocation")));
                onChange.run();
            }
            case RequestEvent.FirstOutput f -> inFlight.computeIfPresent(f.requestId(), (k, v) -> new InFlight(v.requestId(), v.provider(), v.model(), v.startedAt(), v.attempt(), f.latency().toMillis(), v.outputChars(), v.invocation()));
            case RequestEvent.Progress p -> inFlight.computeIfPresent(p.requestId(), (k, v) -> new InFlight(v.requestId(), v.provider(), v.model(), v.startedAt(), v.attempt(), v.firstOutputMillis(), p.outputChars(), v.invocation()));
            case RequestEvent.Retrying r -> inFlight.computeIfPresent(r.requestId(), (k, v) -> new InFlight(v.requestId(), v.provider(), v.model(), v.startedAt(), r.attempt(), v.firstOutputMillis(), v.outputChars(), v.invocation()));
            case RequestEvent.Finished f -> {
                inFlight.remove(f.requestId());
                String cost = f.cost().map(Object::toString).orElse(null);
                long in = f.usage().input().orElse(-1);
                long out = f.usage().output().orElse(-1);
                String warnings = f.warnings().isEmpty() ? null : f.warnings().toString();
                Long ttfo = f.timeToFirstOutput().map(Duration::toMillis).orElse(null);
                String invocation = f.tags().get("astrolabe.invocation");
                writer.execute(() -> jdbc.update(
                    "INSERT INTO llm_request (at, provider, model, invocation, outcome, latency_ms, first_output_ms, attempts, input_tokens, output_tokens, cost, warnings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    f.at().toString(), f.providerId(), f.model().modelId(), invocation, String.valueOf(f.outcome()), f.latency().toMillis(), ttfo,
                    f.attempts(), in < 0 ? null : in, out < 0 ? null : out, cost, warnings));
                onChange.run();
            }
            case CredentialEvent c -> onChange.run();
            default -> { }
        }
    }

    public List<InFlight> inFlight() { return List.copyOf(inFlight.values()); }

    public ArrayNode recent(String provider, int limit) {
        ArrayNode rows = Json.arr();
        String sql = provider == null
            ? "SELECT * FROM llm_request ORDER BY id DESC LIMIT ?"
            : "SELECT * FROM llm_request WHERE provider = ? ORDER BY id DESC LIMIT ?";
        Object[] args = provider == null ? new Object[]{limit} : new Object[]{provider, limit};
        jdbc.query(sql, rs -> {
            var o = rows.addObject();
            o.put("at", rs.getString("at"));
            o.put("provider", rs.getString("provider"));
            o.put("model", rs.getString("model"));
            o.put("invocation", rs.getString("invocation"));
            o.put("outcome", rs.getString("outcome"));
            o.put("latencyMs", rs.getLong("latency_ms"));
            long ttfo = rs.getLong("first_output_ms");
            if (!rs.wasNull()) o.put("firstOutputMs", ttfo);
            o.put("attempts", rs.getInt("attempts"));
            long in = rs.getLong("input_tokens");
            if (!rs.wasNull()) o.put("inputTokens", in);
            long out = rs.getLong("output_tokens");
            if (!rs.wasNull()) o.put("outputTokens", out);
            o.put("cost", rs.getString("cost"));
            o.put("warnings", rs.getString("warnings"));
        }, args);
        return rows;
    }

    @Override
    public void destroy() { writer.shutdown(); }
}
