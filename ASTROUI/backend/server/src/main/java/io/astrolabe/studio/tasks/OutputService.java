package io.astrolabe.studio.tasks;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Output (Studio 2 §8.3): the commands the agent ran in a task, newest first, and the output of one of them. Read
 * from the recorded model output (what was called) and results (how it ended); the text comes from the agent's
 * stored output, which the core has already redacted.
 */
@Service
public class OutputService {
    private static final Pattern RESULT = Pattern.compile("call (\\S+): ⟦result (#\\d+|#-) tool=(\\w+).*?status=(\\w+)⟧");
    private static final int CAP = 512 * 1024;

    private final JdbcTemplate jdbc;
    private final HostService hosts;
    private final ProjectService projects;

    public OutputService(JdbcTemplate jdbc, HostService hosts, ProjectService projects) {
        this.jdbc = jdbc;
        this.hosts = hosts;
        this.projects = projects;
    }

    private record Call(String work, String callId, String tool, JsonNode args, String at) { }

    private record Result(String alias, String status, String at) { }

    public ArrayNode list(List<String> works) {
        List<ObjectNode> out = new ArrayList<>();
        for (String work : works) {
            Map<String, Call> calls = new LinkedHashMap<>();
            Map<String, Result> results = new LinkedHashMap<>();
            jdbc.query("SELECT kind, payload FROM event_log WHERE work_id = ? AND kind IN ('journal.call', 'journal.result') ORDER BY seq", rs -> {
                JsonNode item = Json.parse(rs.getString(2));
                JsonNode data = item.path("data");
                // Tool call ids repeat from cell to cell: the cell makes them unique within a run.
                String cell = Json.text(item, "cell", "");
                if (rs.getString(1).equals("journal.call")) {
                    for (JsonNode part : Json.each(data.get("payload"))) {
                        if (!"tool_call".equals(Json.text(part, "type"))) continue;
                        String tool = Json.text(part, "name", "");
                        if (!tool.equals("run") && !tool.equals("verify")) continue;
                        JsonNode args;
                        try {
                            args = Json.parse(Json.text(part, "argsJson", "{}"));
                        } catch (RuntimeException e) {
                            args = Json.obj();
                        }
                        if (tool.equals("run") && List.of("poll", "cancel").contains(Json.text(args, "op", "run"))) continue;
                        calls.put(cell + "/" + Json.text(part, "id"), new Call(work, Json.text(part, "id"), tool, args, Json.text(item, "at")));
                    }
                } else {
                    Matcher m = RESULT.matcher(Json.text(data, "text", ""));
                    if (m.find()) results.put(cell + "/" + m.group(1), new Result(m.group(2), m.group(4), Json.text(item, "at")));
                }
            }, work);
            for (var e : calls.entrySet()) {
                Call c = e.getValue();
                Result r = results.get(e.getKey());
                ObjectNode o = Json.obj();
                o.put("id", work + ":" + (r == null || r.alias().equals("#-") ? "-" : r.alias().substring(1)) + ":" + e.getKey().hashCode());
                o.put("workId", work);
                o.put("command", command(c));
                o.put("check", c.tool().equals("verify"));
                o.put("at", c.at());
                if (r == null) {
                    o.put("status", "running");
                } else {
                    o.put("status", r.status());
                    if (!r.alias().equals("#-")) o.put("output", Integer.parseInt(r.alias().substring(1)));
                    try {
                        o.put("durationMs", Math.max(0, Duration.between(Instant.parse(c.at()), Instant.parse(r.at())).toMillis()));
                    } catch (RuntimeException ex) {
                        // Without both times the duration is left out.
                    }
                }
                out.add(o);
            }
        }
        ArrayNode a = Json.arr();
        for (int i = out.size() - 1; i >= 0; i--) a.add(out.get(i));
        return a;
    }

    private static String command(Call c) {
        if (c.tool().equals("verify")) return "checks: " + Json.text(c.args(), "what", "acceptance");
        JsonNode argv = c.args().get("argv");
        if (argv != null && argv.isArray() && !argv.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (JsonNode a : argv) {
                String s = a.asString();
                sb.append(sb.isEmpty() ? "" : " ").append(s.chars().anyMatch(Character::isWhitespace) ? "\"" + s + "\"" : s);
            }
            return sb.toString();
        }
        return Json.text(c.args(), "cmd", "");
    }

    /** `GET /tasks/{id}/output/{runId}`: the stored output of one command. */
    public ObjectNode output(List<String> works, String id) {
        String[] parts = id.split(":", 3);
        if (parts.length < 2 || !works.contains(parts[0])) throw ApiException.notFound("no output " + id);
        String work = parts[0];
        ObjectNode o = Json.obj();
        o.put("id", id);
        if (parts[1].equals("-")) {
            o.put("available", false);
            return o;
        }
        String projectId = jdbc.queryForObject("SELECT project_id FROM campaign_index WHERE work_id = ?", String.class, work);
        projects.open(projectId);
        String alias = hosts.host().alias(projectId, work, Long.parseLong(parts[1]));
        if (alias == null) throw ApiException.notFound("no output " + id);
        String blob = Json.text(Json.parse(alias), "contentBlob");
        if (blob == null) {
            o.put("available", false);
            return o;
        }
        JsonNode meta = Json.parse(hosts.host().blobMeta(projectId, blob));
        String kind = Json.text(meta, "kind", "");
        if (meta.path("recovery").asBoolean(false) || !List.of("OUTPUT", "LOG", "DIFF", "PACKET", "MODULE").contains(kind)) {
            o.put("available", false);
            return o;
        }
        byte[] bytes = hosts.host().blobBytes(projectId, blob);
        int cap = Math.min(bytes.length, CAP);
        o.put("available", true);
        o.put("text", new String(bytes, 0, cap, StandardCharsets.UTF_8));
        o.put("truncated", bytes.length > cap);
        return o;
    }
}
