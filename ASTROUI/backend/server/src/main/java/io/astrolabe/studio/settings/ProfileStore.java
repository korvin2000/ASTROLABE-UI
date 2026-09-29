package io.astrolabe.studio.settings;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import io.astrolabe.provider.Profile;
import io.astrolabe.studio.bridge.ConfigSupport;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Profiles (§18.5): the demo profiles of fixture mode (always present, labelled Demo) plus the profiles the user
 * drafted, edited or qualified, stored as ASTROLABE `Profile` JSON with a qualification state
 * (`draft · validated · qualified <date> · stale`).
 */
@Component
public class ProfileStore {
    private final JdbcTemplate jdbc;

    public ProfileStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Stored(String id, String json, String state, boolean demo, String qualificationJson, String updatedAt) { }

    public List<Stored> stored() {
        return jdbc.query("SELECT * FROM profile ORDER BY id", (rs, i) -> new Stored(rs.getString("id"), rs.getString("json"), rs.getString("state"),
            rs.getInt("demo") != 0, rs.getString("qualification_json"), rs.getString("updated_at")));
    }

    /** Every runnable profile by id: demo first, then stored (a stored id overrides a demo id). */
    public Map<String, String> profilesJson() {
        Map<String, String> out = new LinkedHashMap<>();
        for (Profile p : FixtureBrain.profiles()) out.put(p.getId(), ConfigSupport.profileJson(p));
        for (Stored s : stored()) out.put(s.id(), s.json());
        return out;
    }

    public boolean isDemo(String id) {
        return FixtureBrain.profiles().stream().anyMatch(p -> p.getId().equals(id)) && stored().stream().noneMatch(s -> s.id().equals(id));
    }

    public void save(String id, String profileJson, String state, String qualificationJson) {
        Profile decoded;
        try {
            decoded = ConfigSupport.decodeProfile(profileJson);
        } catch (RuntimeException e) {
            throw ApiException.invalid("not a valid profile: " + e.getMessage());
        }
        if (!decoded.getId().equals(id)) throw ApiException.invalid("profile id '" + decoded.getId() + "' differs from '" + id + "'");
        jdbc.update("INSERT INTO profile (id, json, state, demo, qualification_json, updated_at) VALUES (?,?,?,0,?,?) " +
                "ON CONFLICT(id) DO UPDATE SET json = excluded.json, state = excluded.state, qualification_json = coalesce(excluded.qualification_json, profile.qualification_json), updated_at = excluded.updated_at",
            id, ConfigSupport.profileJson(decoded), state, qualificationJson, Json.now());
    }

    public void delete(String id) { jdbc.update("DELETE FROM profile WHERE id = ?", id); }

    /** Profile DTOs (§29 `ProfileDto`). */
    public ArrayNode list() {
        ArrayNode a = Json.arr();
        Map<String, Stored> stored = new LinkedHashMap<>();
        for (Stored s : stored()) stored.put(s.id(), s);
        for (Profile p : FixtureBrain.profiles()) {
            if (stored.containsKey(p.getId())) continue;
            ObjectNode o = a.addObject();
            o.put("id", p.getId());
            o.set("profile", Json.parse(ConfigSupport.profileJson(p)));
            o.put("state", "validated");
            o.put("demo", true);
        }
        for (Stored s : stored.values()) {
            ObjectNode o = a.addObject();
            o.put("id", s.id());
            o.set("profile", Json.parse(s.json()));
            o.put("state", s.state());
            o.put("demo", false);
            o.put("updatedAt", s.updatedAt());
            if (s.qualificationJson() != null) o.set("qualification", Json.parse(s.qualificationJson()));
        }
        return a;
    }

    public JsonNode get(String id) {
        for (JsonNode n : list()) if (id.equals(Json.text(n, "id"))) return n;
        throw ApiException.notFound("no profile " + id);
    }
}
