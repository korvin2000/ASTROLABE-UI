package io.astrolabe.studio.api;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

import io.astrolabe.studio.bridge.RepoInspect;
import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Projects, repository health, mentions, rules candidates, intents, handles, knowledge and blobs (§28). */
@RestController
@RequestMapping("/api/v1/projects")
public class ProjectsApi {
    /** §30.4: served kinds only; pre/post images, recovery and native replay material are never served. */
    private static final Set<String> SERVED = Set.of("OUTPUT", "LOG", "DIFF", "PACKET", "MODULE");
    private static final long BLOB_CAP = 5L * 1024 * 1024;

    private final ProjectService projects;
    private final CampaignService campaigns;
    private final HostService hosts;

    public ProjectsApi(ProjectService projects, CampaignService campaigns, HostService hosts) {
        this.projects = projects;
        this.campaigns = campaigns;
        this.hosts = hosts;
    }

    @GetMapping
    public ResponseEntity<String> list() { return Raw.json(projects.list()); }

    @GetMapping("/{pid}/health")
    public ResponseEntity<String> health(@PathVariable String pid) { return Raw.json(projects.health(pid)); }

    @GetMapping("/{pid}/files")
    public ResponseEntity<String> files(@PathVariable String pid, @RequestParam(required = false) String q, @RequestParam(defaultValue = "30") int limit) {
        return Raw.json(projects.files(pid, q, Math.min(limit, 200)));
    }

    @GetMapping("/{pid}/campaigns")
    public ResponseEntity<String> campaigns(@PathVariable String pid) { return Raw.json(campaigns.list(pid, true)); }

    @GetMapping("/{pid}/rules")
    public ResponseEntity<String> rules(@PathVariable String pid, @RequestParam String path) {
        return Raw.json(RepoInspect.rulesCandidate(projects.root(pid), path));
    }

    @GetMapping("/{pid}/intents")
    public ResponseEntity<String> intents(@PathVariable String pid, @RequestParam(required = false) String status) {
        projects.open(pid);
        return Raw.json(hosts.host().intents(pid, status));
    }

    @GetMapping("/{pid}/handles")
    public ResponseEntity<String> handles(@PathVariable String pid) {
        projects.open(pid);
        return Raw.json(hosts.host().handles(pid));
    }

    /** G-18: read-only log tail of a background process from its byte cursor (raw runner log; bounded). */
    @GetMapping("/{pid}/handles/{handle}/log")
    public ResponseEntity<String> handleLog(@PathVariable String pid, @PathVariable String handle, @RequestParam(defaultValue = "0") long cursor) throws java.io.IOException {
        projects.open(pid);
        JsonNode handles = Json.parse(hosts.host().handles(pid));
        for (JsonNode h : handles) {
            if (!handle.equals(Json.text(h, "handleId"))) continue;
            Path log = Path.of(Json.text(h, "logPath"));
            if (!log.isAbsolute()) log = hosts.host().stateRoot(pid).resolve(log);
            Path logs = hosts.host().stateRoot(pid).resolve("logs").normalize();
            if (!log.normalize().startsWith(logs)) throw new ApiException("forbidden", 403, "log path outside the state root");
            ObjectNode o = Json.obj();
            if (!Files.isRegularFile(log)) {
                o.put("available", false);
                o.put("reason", "the runner log is gone; the redacted LOG blob holds the terminal capture");
                return Raw.json(o);
            }
            long size = Files.size(log);
            long from = Math.min(Math.max(cursor, 0), size);
            long len = Math.min(size - from, 64 * 1024);
            byte[] bytes = new byte[(int) len];
            try (var ch = java.nio.channels.FileChannel.open(log)) {
                ch.position(from);
                java.nio.ByteBuffer buf = java.nio.ByteBuffer.wrap(bytes);
                while (buf.hasRemaining() && ch.read(buf) > 0) { }
            }
            o.put("available", true);
            o.put("cursor", from + len);
            o.put("size", size);
            o.put("text", redact(new String(bytes, StandardCharsets.UTF_8)));
            return Raw.json(o);
        }
        throw ApiException.notFound("no handle " + handle);
    }

    /** Conservative redaction of a raw tail before sending (the core redacts its own blobs). */
    static String redact(String text) {
        return text
            .replaceAll("(?i)(api[_-]?key|token|secret|password)(\\s*[=:]\\s*)\\S+", "$1$2[REDACTED:secret-assignment]")
            .replaceAll("sk-[A-Za-z0-9_-]{16,}", "[REDACTED:openai-key]")
            .replaceAll("gh[pousr]_[A-Za-z0-9]{20,}", "[REDACTED:github-token]")
            .replaceAll("(?i)bearer\\s+[A-Za-z0-9._~+/-]+=*", "[REDACTED:bearer-token]");
    }

    @GetMapping("/{pid}/blobs/{digest}")
    public ResponseEntity<String> blob(@PathVariable String pid, @PathVariable String digest) {
        projects.open(pid);
        if (!digest.matches("[0-9a-f]{64}")) throw ApiException.invalid("a blob is addressed by its sha-256 digest");
        String metaJson = hosts.host().blobMeta(pid, digest);
        if (metaJson == null) throw ApiException.notFound("no blob " + digest);
        JsonNode meta = Json.parse(metaJson);
        String kind = Json.text(meta, "kind", "");
        if (meta.path("recovery").asBoolean(false) || !SERVED.contains(kind)) {
            throw new ApiException("forbidden", 403, "blob kind " + kind + " is not served (recovery and pre/post images stay private, §30.4)");
        }
        byte[] bytes = hosts.host().blobBytes(pid, digest);
        ObjectNode o = Json.obj();
        o.put("digest", digest);
        o.put("kind", kind);
        o.put("bytes", bytes.length);
        boolean truncated = bytes.length > BLOB_CAP;
        o.put("truncated", truncated);
        o.put("text", new String(bytes, 0, (int) Math.min(bytes.length, BLOB_CAP), StandardCharsets.UTF_8));
        return Raw.json(o);
    }

    @GetMapping("/{pid}/kb")
    public ResponseEntity<String> knowledge(@PathVariable String pid) {
        projects.open(pid);
        ObjectNode o = Json.obj();
        o.set("notes", Json.parse(hosts.host().notes(pid)));
        o.set("queue", Json.parse(hosts.host().noteQueue(pid)));
        o.set("usage", Json.parse(hosts.host().noteUsage(pid)));
        return Raw.json(o);
    }

    @GetMapping("/{pid}/kb/notes/{noteId}/revisions")
    public ResponseEntity<String> noteRevisions(@PathVariable String pid, @PathVariable String noteId) {
        projects.open(pid);
        return Raw.json(hosts.host().noteRevisions(pid, noteId));
    }

    @GetMapping(value = "/{pid}/leases")
    public ResponseEntity<String> leases(@PathVariable String pid) {
        projects.open(pid);
        return Raw.json(hosts.host().leases(pid));
    }

    @GetMapping(value = "/{pid}/export-state-path", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> statePath(@PathVariable String pid) {
        projects.open(pid);
        ArrayNode a = Json.arr();
        a.add(hosts.host().stateRoot(pid).toString());
        return Raw.json(a);
    }
}
