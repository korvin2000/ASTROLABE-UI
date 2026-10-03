package io.astrolabe.studio.settings;

import java.util.List;
import java.util.Set;

import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * App preferences (Studio 2 §9): the General, Models and Advanced settings that are not part of the agent's
 * configuration. One row per key; values are JSON. Unknown keys are refused so the list cannot grow unnoticed.
 */
@Component
public class Preferences {
    public static final String THEME = "theme";
    public static final String NOTIFY = "notify";
    public static final String SEND_WITH = "sendWith";
    public static final String LANGUAGE = "language";
    public static final String DEFAULT_MODEL = "defaultModel";
    public static final String DEFAULT_EFFORT = "defaultEffort";
    public static final String DEFAULT_MODE = "defaultMode";
    /** ASTROLABE 2.0 C4: the default limits of a new task's run (money, minutes, requests); they replace the token `limit`. */
    public static final String TASK_LIMITS = "taskLimits";
    /** The approach chosen at the last start (`economy` · `balanced` · `thorough`); no row in the settings, like `lastProject`. */
    public static final String DEFAULT_PRESET = "defaultPreset";
    public static final String MAX_TASKS = "maxTasks";
    public static final String DEMO_MODE = "demoMode";
    /** Environment variables the user allowed, by provider id (§6.3). */
    public static final String ENV_KEYS = "envKeys";
    /** Local servers the user chose to use, by provider id. */
    public static final String LOCAL_SERVERS = "localServers";
    public static final String LAST_PROJECT = "lastProject";
    public static final String FIRST_TASK_DONE = "firstTaskDone";

    private static final Set<String> KEYS = Set.of(THEME, NOTIFY, SEND_WITH, LANGUAGE, DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_MODE, TASK_LIMITS, DEFAULT_PRESET, MAX_TASKS,
        DEMO_MODE, ENV_KEYS, LOCAL_SERVERS, LAST_PROJECT, FIRST_TASK_DONE);

    private final JdbcTemplate jdbc;

    public Preferences(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public static ObjectNode defaults() {
        ObjectNode o = Json.obj();
        o.put(THEME, "system");
        o.putNull(NOTIFY);
        o.put(SEND_WITH, "enter");
        o.put(LANGUAGE, "en");
        o.putNull(DEFAULT_MODEL);
        o.put(DEFAULT_EFFORT, "medium");
        o.put(DEFAULT_MODE, "ask");
        o.set(TASK_LIMITS, io.astrolabe.studio.tasks.Limits.DEFAULTS.json());
        o.put(DEFAULT_PRESET, "balanced");
        o.put(MAX_TASKS, 3);
        o.put(DEMO_MODE, false);
        o.putObject(ENV_KEYS);
        o.putObject(LOCAL_SERVERS);
        o.putNull(LAST_PROJECT);
        o.put(FIRST_TASK_DONE, false);
        return o;
    }

    public ObjectNode all() {
        ObjectNode o = defaults();
        jdbc.query("SELECT key, json FROM preference", rs -> {
            if (KEYS.contains(rs.getString(1))) o.set(rs.getString(1), Json.parse(rs.getString(2)));
        });
        return o;
    }

    public JsonNode get(String key) { return all().get(key); }

    public String text(String key) {
        JsonNode v = get(key);
        return v == null || v.isNull() ? null : v.asString();
    }

    public boolean flag(String key) {
        JsonNode v = get(key);
        return v != null && v.asBoolean(false);
    }

    public void set(String key, JsonNode value) {
        if (!KEYS.contains(key)) throw ApiException.invalid("unknown preference " + key);
        validate(key, value);
        jdbc.update("INSERT INTO preference (key, json, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
            key, value == null ? "null" : Json.write(value), Json.now());
    }

    /** Setting 19: back to the defaults; connected accounts and the project list stay. */
    public void reset() { jdbc.update("DELETE FROM preference WHERE key NOT IN (?, ?, ?)", ENV_KEYS, LOCAL_SERVERS, LAST_PROJECT); }

    private static void validate(String key, JsonNode v) {
        switch (key) {
            case THEME -> oneOf(key, v, List.of("system", "light", "dark"));
            case SEND_WITH -> oneOf(key, v, List.of("enter", "ctrl-enter"));
            case LANGUAGE -> oneOf(key, v, List.of("en", "ru"));
            case DEFAULT_EFFORT -> oneOf(key, v, List.of("low", "medium", "high"));
            case DEFAULT_MODE -> oneOf(key, v, List.of("ask", "auto"));
            case MAX_TASKS -> {
                if (v == null || !v.isIntegralNumber() || v.asInt() < 1 || v.asInt() > 5) throw ApiException.invalid("maxTasks is a number from 1 to 5");
            }
            case TASK_LIMITS -> {
                if (v == null || !v.isObject()) throw ApiException.invalid("taskLimits is an object {moneyUsd, minutes, requests}");
                io.astrolabe.studio.tasks.Limits.parse(v, null);
            }
            case DEFAULT_PRESET -> oneOf(key, v, List.of("economy", "balanced", "thorough"));
            default -> { }
        }
    }

    private static void oneOf(String key, JsonNode v, List<String> allowed) {
        if (v == null || !v.isString() || !allowed.contains(v.asString())) throw ApiException.invalid(key + " is one of " + allowed);
    }
}
