package io.astrolabe.studio.tasks;

import java.math.BigDecimal;

import io.astrolabe.studio.bridge.TaskLimits;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The user's limits on one run (ASTROLABE 2.0 C4, core D-401): money in US dollars, minutes of active work, requests to
 * the model; a null field is no limit. They count per run: a follow-up run counts from zero, a raised limit continues
 * the same run with what it spent.
 */
public record Limits(String moneyUsd, Integer minutes, Integer requests) {
    /** Owner 2026-10-03: generous defaults — hard tasks run for hours, cost more than $5 and make thousands of requests. */
    public static final Limits DEFAULTS = new Limits("50.00", 480, 3000);
    public static final Limits NONE = new Limits(null, null, null);

    /**
     * [n] as limits: absent or JSON null is [fallback]; an object names all three fields, a missing or null field is no
     * limit. Money is a decimal above 0 and at most 10000; minutes 1…10080; requests 1…100000.
     */
    public static Limits parse(JsonNode n, Limits fallback) {
        if (n == null || n.isNull() || n.isMissingNode()) return fallback;
        if (!n.isObject()) throw ApiException.invalid("limits is an object {moneyUsd, minutes, requests}");
        String money = null;
        JsonNode m = n.get("moneyUsd");
        if (m != null && !m.isNull() && !(m.isString() && m.asString().isBlank())) {
            try {
                BigDecimal v = new BigDecimal(m.isNumber() ? m.decimalValue().toPlainString() : m.asString().strip());
                if (v.signum() <= 0 || v.compareTo(BigDecimal.valueOf(10_000)) > 0) throw new NumberFormatException();
                money = v.setScale(Math.max(2, Math.min(v.scale(), 4)), java.math.RoundingMode.HALF_UP).toPlainString();
            } catch (NumberFormatException | ArithmeticException e) {
                throw ApiException.invalid("limits.moneyUsd is a decimal above 0 and at most 10000");
            }
        }
        return new Limits(money, whole(n, "minutes", 10_080), whole(n, "requests", 100_000));
    }

    private static Integer whole(JsonNode n, String field, int max) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        if (!v.isIntegralNumber() || v.asLong() < 1 || v.asLong() > max) throw ApiException.invalid("limits." + field + " is a whole number from 1 to " + max);
        return v.asInt();
    }

    /** Stored limits ([json] a `limits_json` column or a preference); null or unreadable is [fallback]. */
    public static Limits of(String json, Limits fallback) {
        if (json == null) return fallback;
        try {
            return parse(Json.parse(json), fallback);
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    public ObjectNode json() {
        ObjectNode o = Json.obj();
        if (moneyUsd != null) o.put("moneyUsd", moneyUsd); else o.putNull("moneyUsd");
        if (minutes != null) o.put("minutes", minutes); else o.putNull("minutes");
        if (requests != null) o.put("requests", requests); else o.putNull("requests");
        return o;
    }

    public TaskLimits toBridge() { return new TaskLimits(moneyUsd, minutes, requests); }

    /** The limit of [kind] (`money` · `minutes` · `requests`) as text, or null for no limit. */
    public String value(String kind) {
        return switch (kind) {
            case "money" -> moneyUsd;
            case "minutes" -> minutes == null ? null : minutes.toString();
            case "requests" -> requests == null ? null : requests.toString();
            default -> null;
        };
    }

    /** True when these limits lift [old]'s limit of [kind]: it is gone, or strictly higher. */
    public boolean raises(Limits old, String kind) {
        String now = value(kind);
        String before = old.value(kind);
        if (now == null) return true;
        if (before == null) return false;
        return new BigDecimal(now).compareTo(new BigDecimal(before)) > 0;
    }
}
