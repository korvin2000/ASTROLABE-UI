package io.astrolabe.studio.tasks;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import io.astrolabe.studio.bridge.RepoInspect;
import io.astrolabe.studio.bridge.SavedChecks;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Project settings (Studio 2 §9, settings 8 to 11): check commands, the instructions switch, what is always allowed
 * and the protected files. Stored in the runtime part of the project's settings layer; nothing here is JSON the user
 * types.
 */
@Service
public class ProjectSettings {
    private static final List<String> INSTRUCTION_FILES = List.of("AGENTS.md", "CLAUDE.md", ".astrolabe/rules.md");
    /** The default protected files, as the core applies them (git data, CI configuration, lock files, migrations). */
    public static final List<String> DEFAULT_PROTECTED = List.of(
        ".git/", ".github/", ".gitlab/", "migrations/", ".gitlab-ci.yml", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml",
        "poetry.lock", "uv.lock", "Pipfile.lock", "Cargo.lock", "gradle.lockfile", "Gemfile.lock", "composer.lock");

    private final SettingsService settings;
    private final ProjectService projects;

    public ProjectSettings(SettingsService settings, ProjectService projects) {
        this.settings = settings;
        this.projects = projects;
    }

    private JsonNode stored(String projectId) {
        JsonNode runtime = settings.layer(SettingsService.projectScope(projectId)).json().path("runtime");
        return runtime.path("project");
    }

    /** Commands the project's manifests declare, at the repository root first. */
    private ObjectNode detected(String projectId) {
        ObjectNode o = Json.obj();
        try {
            JsonNode repo = Json.parse(RepoInspect.of(projects.root(projectId)));
            JsonNode root = null;
            for (JsonNode p : Json.each(repo.get("packages"))) {
                if (root == null || ".".equals(Json.text(p, "dir"))) root = p;
            }
            if (root != null) {
                o.put("manifest", Json.text(root, "manifest"));
                for (String k : List.of("test", "build", "lint", "typecheck")) {
                    JsonNode argv = root.get(k);
                    if (argv != null && argv.isArray()) o.put(k, join(argv));
                }
            }
            ArrayNode files = o.putArray("instructionFiles");
            for (JsonNode c : Json.each(repo.get("rulesCandidates"))) files.add(Json.text(c, "path"));
        } catch (RuntimeException e) {
            o.put("error", e.getMessage());
        }
        return o;
    }

    private static String join(JsonNode argv) {
        StringBuilder sb = new StringBuilder();
        for (JsonNode a : argv) {
            String s = a.asString();
            sb.append(sb.isEmpty() ? "" : " ").append(s.chars().anyMatch(Character::isWhitespace) ? "\"" + s + "\"" : s);
        }
        return sb.toString();
    }

    public ObjectNode get(String projectId) {
        projects.require(projectId);
        JsonNode s = stored(projectId);
        ObjectNode detected = detected(projectId);
        ObjectNode o = Json.obj();
        o.put("projectId", projectId);
        ObjectNode checks = o.putObject("checks");
        for (String k : List.of("test", "build", "lint")) {
            ObjectNode c = checks.putObject(k);
            String saved = Json.text(s.path("checks"), k);
            String found = Json.text(detected, k);
            if (k.equals("build") && found == null) found = Json.text(detected, "typecheck");
            c.put("value", saved != null ? saved : found == null ? "" : found);
            c.put("source", saved != null ? "saved" : found != null ? "detected" : "none");
            if (found != null) c.put("detected", found);
        }
        if (detected.has("manifest")) o.put("manifest", Json.text(detected, "manifest"));
        ObjectNode instructions = o.putObject("instructions");
        String file = instructionFile(detected);
        if (file != null) instructions.put("file", file);
        instructions.put("use", file != null && s.path("useInstructions").asBoolean(true));
        ArrayNode allowed = o.putArray("allowed");
        for (JsonNode a : Json.each(s.get("allowed"))) allowed.add(a.asString());
        ArrayNode protectedFiles = o.putArray("protectedFiles");
        if (s.has("protectedFiles") && s.get("protectedFiles").isArray()) for (JsonNode p : s.get("protectedFiles")) protectedFiles.add(p.asString());
        else DEFAULT_PROTECTED.forEach(protectedFiles::add);
        o.put("protectedDefault", !s.path("protectedFiles").isArray());
        return o;
    }

    private static String instructionFile(JsonNode detected) {
        List<String> found = new ArrayList<>();
        for (JsonNode f : Json.each(detected.get("instructionFiles"))) found.add(f.asString());
        for (String preferred : INSTRUCTION_FILES) if (found.contains(preferred)) return preferred;
        return found.isEmpty() ? null : found.getFirst();
    }

    /** `PUT /projects/{id}/settings`: any of `checks`, `useInstructions`, `allowed`, `protectedFiles`. */
    public ObjectNode put(String projectId, JsonNode body, String actor) {
        projects.require(projectId);
        ObjectNode next = stored(projectId).isObject() ? (ObjectNode) stored(projectId).deepCopy() : Json.obj();
        if (body.has("checks")) {
            ObjectNode checks = Json.obj();
            for (String k : List.of("test", "build", "lint")) {
                String v = Json.text(body.get("checks"), k);
                if (v != null && !v.isBlank()) checks.put(k, v.strip());
            }
            next.set("checks", checks);
        }
        if (body.has("useInstructions")) next.put("useInstructions", body.get("useInstructions").asBoolean(true));
        if (body.has("allowed")) next.set("allowed", strings(body.get("allowed"), 200));
        if (body.has("protectedFiles")) {
            if (body.get("protectedFiles").isNull()) next.remove("protectedFiles");
            else next.set("protectedFiles", strings(body.get("protectedFiles"), 200));
        }
        settings.patchRuntime(SettingsService.projectScope(projectId), replacing(next), actor);
        return get(projectId);
    }

    /** A runtime patch that replaces `project`: the layer merge keeps old keys, so absent ones are written as null. */
    private static ObjectNode replacing(ObjectNode next) {
        ObjectNode patch = Json.obj();
        ObjectNode marker = Json.obj();
        for (String k : List.of("checks", "useInstructions", "allowed", "protectedFiles")) {
            if (next.has(k)) marker.set(k, next.get(k)); else marker.putNull(k);
        }
        if (marker.get("checks") != null && marker.get("checks").isObject()) {
            ObjectNode checks = (ObjectNode) marker.get("checks");
            for (String k : List.of("test", "build", "lint")) if (!checks.has(k)) checks.putNull(k);
        }
        patch.set("project", marker);
        return patch;
    }

    private static ArrayNode strings(JsonNode node, int max) {
        if (node == null || !node.isArray()) throw ApiException.invalid("a list is expected");
        ArrayNode out = Json.arr();
        for (JsonNode n : node) {
            String s = n.asString("").strip();
            if (!s.isEmpty() && out.size() < max) out.add(s);
        }
        return out;
    }

    // ------------------------------------------------------------------------------------------------ for a task

    public SavedChecks savedChecks(String projectId) {
        JsonNode checks = stored(projectId).path("checks");
        return SavedChecks.of(Json.text(checks, "test"), Json.text(checks, "build"), Json.text(checks, "lint"));
    }

    public List<String> allowed(String projectId) {
        List<String> out = new ArrayList<>();
        for (JsonNode a : Json.each(stored(projectId).get("allowed"))) out.add(a.asString());
        return out;
    }

    /** Adds [pattern] to what is always allowed in the project (§7.5 "Always allow in this project"). */
    public void allow(String projectId, String pattern, String actor) {
        List<String> current = allowed(projectId);
        if (pattern == null || pattern.isBlank() || current.contains(pattern.strip())) return;
        ArrayNode next = Json.arr();
        current.forEach(next::add);
        next.add(pattern.strip());
        put(projectId, Json.obj().set("allowed", next), actor);
    }

    /** C4: [command] becomes the project's [slot] check (`test` · `build` · `lint`); the other saved checks stay. */
    public void saveCheck(String projectId, String slot, String command, String actor) {
        ObjectNode checks = Json.obj();
        JsonNode current = stored(projectId).path("checks");
        for (String k : List.of("test", "build", "lint")) if (Json.text(current, k) != null) checks.put(k, Json.text(current, k));
        checks.put(slot, command);
        put(projectId, Json.obj().set("checks", checks), actor);
    }

    /** The protected files when the user changed them, else null (the core's default applies). */
    public List<String> protectedOverride(String projectId) {
        JsonNode p = stored(projectId).get("protectedFiles");
        if (p == null || !p.isArray()) return null;
        List<String> out = new ArrayList<>();
        for (JsonNode n : p) out.add(n.asString());
        return out;
    }

    /** The instructions file to bind for a task (`{path, digest}`), or null when off or absent. */
    public ObjectNode instructions(String projectId) {
        if (!stored(projectId).path("useInstructions").asBoolean(true)) return null;
        Path root = projects.root(projectId);
        JsonNode repo = Json.parse(RepoInspect.of(root));
        String file = instructionFile(Json.obj().set("instructionFiles", names(repo.get("rulesCandidates"))));
        if (file == null) return null;
        for (JsonNode c : Json.each(repo.get("rulesCandidates"))) {
            if (file.equals(Json.text(c, "path"))) return Json.obj().put("path", file).put("digest", Json.text(c, "digest")).put("provenance", "studio:project-instructions");
        }
        return null;
    }

    private static ArrayNode names(JsonNode candidates) {
        ArrayNode a = Json.arr();
        for (JsonNode c : Json.each(candidates)) a.add(Json.text(c, "path"));
        return a;
    }
}
