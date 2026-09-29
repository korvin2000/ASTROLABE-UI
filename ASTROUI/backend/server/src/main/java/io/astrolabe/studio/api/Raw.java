package io.astrolabe.studio.api;

import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import tools.jackson.databind.JsonNode;

/** Pass-through JSON responses: ASTROLABE's own JSON from the bridge is served as recorded, never re-modelled. */
final class Raw {
    private Raw() { }

    static ResponseEntity<String> json(String body) {
        if (body == null) throw ApiException.notFound("not found");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    static ResponseEntity<String> json(JsonNode node) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(Json.write(node));
    }
}
