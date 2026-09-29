package io.astrolabe.studio.support;

import java.time.Instant;
import java.util.Iterator;
import java.util.Map;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/** Jackson 3 helpers for the Studio protocol (§27). ASTROLABE JSON from the bridge is passed through as trees. */
public final class Json {
    public static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private Json() { }

    public static ObjectNode obj() { return NODES.objectNode(); }

    public static ArrayNode arr() { return NODES.arrayNode(); }

    public static JsonNode parse(String json) {
        if (json == null || json.isBlank()) return NODES.nullNode();
        return MAPPER.readTree(json);
    }

    public static ObjectNode parseObject(String json) {
        JsonNode node = parse(json);
        if (node instanceof ObjectNode o) return o;
        throw new IllegalArgumentException("expected a JSON object");
    }

    public static String write(Object value) { return MAPPER.writeValueAsString(value); }

    public static JsonNode tree(Object value) { return MAPPER.valueToTree(value); }

    public static String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asString();
    }

    public static String text(JsonNode node, String field, String fallback) {
        String v = text(node, field);
        return v == null ? fallback : v;
    }

    public static long num(JsonNode node, String field, long fallback) {
        if (node == null) return fallback;
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? fallback : v.asLong(fallback);
    }

    public static boolean bool(JsonNode node, String field, boolean fallback) {
        if (node == null) return fallback;
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? fallback : v.asBoolean(fallback);
    }

    public static String now() { return Instant.now().toString(); }

    /**
     * Deep merge (§17.1 merge semantics): objects merge by key, scalars and arrays replace as a unit, and an explicit
     * `{"$inherit": true}` marker removes the override.
     */
    public static JsonNode merge(JsonNode base, JsonNode overlay) {
        if (overlay == null || overlay.isMissingNode()) return base;
        if (!(base instanceof ObjectNode baseObject) || !(overlay instanceof ObjectNode overlayObject)) return overlay.deepCopy();
        ObjectNode result = baseObject.deepCopy();
        for (Map.Entry<String, JsonNode> entry : overlayObject.properties()) {
            JsonNode value = entry.getValue();
            if (value instanceof ObjectNode o && o.has("$inherit")) continue;
            JsonNode current = result.get(entry.getKey());
            result.set(entry.getKey(), current instanceof ObjectNode && value instanceof ObjectNode ? merge(current, value) : value.deepCopy());
        }
        return result;
    }

    /** Dotted paths of every leaf that differs between [a] and [b] (settings diff summaries). */
    public static void diff(String prefix, JsonNode a, JsonNode b, java.util.List<String> out) {
        if (a instanceof ObjectNode ao && b instanceof ObjectNode bo) {
            java.util.Set<String> keys = new java.util.TreeSet<>();
            ao.propertyNames().forEach(keys::add);
            bo.propertyNames().forEach(keys::add);
            for (String k : keys) diff(prefix.isEmpty() ? k : prefix + "." + k, ao.get(k), bo.get(k), out);
            return;
        }
        if (a == null && b == null) return;
        if (a == null || b == null || !a.equals(b)) out.add(prefix);
    }

    public static Iterable<JsonNode> each(JsonNode node) {
        if (node == null || !node.isArray()) return java.util.List.of();
        return () -> {
            Iterator<JsonNode> it = node.iterator();
            return it;
        };
    }
}
