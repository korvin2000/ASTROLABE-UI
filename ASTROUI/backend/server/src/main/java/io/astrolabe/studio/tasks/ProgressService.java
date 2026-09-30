package io.astrolabe.studio.tasks;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Progress (Studio 2 §8.2.9): the plan as the agent keeps it and the checks that ran, in the user's words. Read from
 * the agent's own records; nothing is inferred from its prose.
 */
@Service
public class ProgressService {
    private static final Logger log = LoggerFactory.getLogger(ProgressService.class);

    private final HostService hosts;
    private final ProjectService projects;

    public ProgressService(HostService hosts, ProjectService projects) {
        this.hosts = hosts;
        this.projects = projects;
    }

    public ObjectNode progress(String projectId, List<String> works) {
        ObjectNode o = Json.obj();
        ArrayNode plan = o.putArray("plan");
        ArrayNode checks = o.putArray("checks");
        try {
            projects.open(projectId);
        } catch (RuntimeException e) {
            o.put("available", false);
            return o;
        }
        o.put("available", true);
        String last = works.getLast();
        try {
            plan(projectId, last, plan);
        } catch (RuntimeException e) {
            log.debug("plan of {}: {}", last, e.toString());
        }
        try {
            checks(projectId, last, checks);
        } catch (RuntimeException e) {
            log.debug("checks of {}: {}", last, e.toString());
        }
        return o;
    }

    /** The plan of the cell that does the work: the last one that is not a reviewer or a helper, else the last. */
    private void plan(String projectId, String work, ArrayNode out) {
        JsonNode cells = Json.parse(hosts.host().cells(projectId, work));
        String context = null;
        for (JsonNode c : cells) {
            String role = c.path("body").path("role").asString(Json.text(c, "role", ""));
            String id = Json.text(c, "contextId");
            if (id == null) continue;
            if (context == null || List.of("implementing", "writer", "repair", "").contains(role)) context = id;
        }
        if (context == null) return;
        JsonNode body = Json.parse(hosts.host().register(projectId, context)).path("latest").path("body");
        boolean current = false;
        for (JsonNode step : Json.each(body.get("plan"))) {
            ObjectNode s = out.addObject();
            s.put("n", step.path("n").asInt());
            s.put("text", Json.text(step, "text", ""));
            String mark = Json.text(step, "mark", "").toLowerCase();
            String state = switch (mark) {
                case "done", "x", "v", "ticked" -> "done";
                case "cancelled", "canceled", "skipped", "-" -> "skipped";
                case ">", "current", "now", "doing", "active" -> "now";
                default -> "todo";
            };
            if (state.equals("now")) current = true;
            s.put("state", state);
        }
        if (!current && hosts.host().isLive(work)) {
            for (JsonNode s : out) {
                if ("todo".equals(Json.text(s, "state"))) {
                    ((ObjectNode) s).put("state", "now");
                    break;
                }
            }
        }
    }

    /** The latest result of every check of the run, with the counts its runner reported. */
    private void checks(String projectId, String work, ArrayNode out) {
        Map<String, JsonNode> latest = new LinkedHashMap<>();
        for (JsonNode row : Json.parse(hosts.host().receiptRows(projectId, work))) {
            String check = Json.text(row, "checkId");
            if (check != null) latest.put(check, row);
        }
        for (JsonNode row : latest.values()) {
            JsonNode body = row.path("body");
            ObjectNode c = out.addObject();
            c.put("at", Json.text(row, "createdAt"));
            c.put("outcome", Json.text(row, "outcome", "").toLowerCase());
            StringBuilder command = new StringBuilder();
            for (JsonNode a : Json.each(body.get("command"))) command.append(command.isEmpty() ? "" : " ").append(a.asString());
            c.put("command", command.toString());
            c.put("acceptance", body.path("acceptanceIds").isArray() && !body.path("acceptanceIds").isEmpty());
            JsonNode parsed = body.get("parsed");
            if (parsed != null && parsed.isObject()) {
                c.put("passed", parsed.path("passed").asInt(0));
                c.put("failed", parsed.path("failed").asInt(0) + parsed.path("errors").asInt(0));
                c.put("skipped", parsed.path("skipped").asInt(0));
            }
        }
    }
}
