package io.astrolabe.studio.projects;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import io.astrolabe.store.ProjectLockHeld;
import io.astrolabe.studio.bridge.RepoInspect;
import io.astrolabe.studio.bridge.StudioHost;
import io.astrolabe.studio.bridge.fixture.FixtureRepos;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.ErrorHandling;
import io.astrolabe.studio.support.Git;
import io.astrolabe.studio.support.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The projects registry (§19): canonical paths (symlink, junction and case aliases deduplicated), repository
 * validation, opening through the bridge (which takes ASTROLABE's project lock), health and rules-file binding.
 */
@Service
public class ProjectService {
    private static final Logger log = LoggerFactory.getLogger(ProjectService.class);

    public record ProjectRow(String id, String path, String name, boolean demo, String stateRoot, String addedAt, String openedAt, boolean pinned, boolean archived) { }

    private final JdbcTemplate jdbc;
    private final HostService hosts;
    private final TransportService transport;
    private final SettingsService settings;
    private final TopicBroker broker;

    public ProjectService(JdbcTemplate jdbc, HostService hosts, TransportService transport, SettingsService settings, TopicBroker broker) {
        this.jdbc = jdbc;
        this.hosts = hosts;
        this.transport = transport;
        this.settings = settings;
        this.broker = broker;
    }

    private StudioHost host() { return hosts.host(); }

    public List<ProjectRow> rows() {
        return jdbc.query("SELECT * FROM project WHERE archived = 0 ORDER BY pinned DESC, name", (rs, i) -> new ProjectRow(
            rs.getString("id"), rs.getString("path"), rs.getString("name"), rs.getInt("demo") != 0, rs.getString("state_root"),
            rs.getString("added_at"), rs.getString("opened_at"), rs.getInt("pinned") != 0, rs.getInt("archived") != 0));
    }

    public Optional<ProjectRow> row(String id) { return rows().stream().filter(r -> r.id().equals(id)).findFirst(); }

    public ProjectRow require(String id) { return row(id).orElseThrow(() -> ApiException.notFound("no project " + id)); }

    /** Validates and registers a repository path (§19.1); returns the existing row for an alias of a known path. */
    public ProjectRow add(String rawPath, boolean demo) {
        if (rawPath == null || rawPath.isBlank()) throw ApiException.invalid("a repository path is required");
        Path path;
        try {
            path = Path.of(rawPath.trim()).toRealPath();
        } catch (IOException | java.nio.file.InvalidPathException e) {
            throw ApiException.invalid("not an existing directory: " + rawPath);
        }
        if (!Files.isDirectory(path)) throw ApiException.invalid("not a directory: " + path);
        Git.Result top = Git.run(path, "rev-parse", "--show-toplevel");
        if (!top.ok()) throw new ApiException("unsupported_repository", 422, "not a git working tree: " + top.out().trim());
        Path root;
        try {
            root = Path.of(top.out().trim()).toRealPath();
        } catch (IOException e) {
            throw ApiException.invalid("cannot resolve the repository root: " + e.getMessage());
        }
        if (!sameFile(root, path)) throw new ApiException("unsupported_repository", 422, "the path is inside a repository; add its root: " + root);
        if (Files.exists(root.resolve(".gitmodules"))) throw new ApiException("unsupported_repository", 422, "repositories with submodules are not supported by ASTROLABE (DirtyState refusal)");
        String canonical = canonical(root);
        for (ProjectRow r : rows()) if (canonical(Path.of(r.path())).equals(canonical)) return r;
        String id = "p-" + shortHash(canonical);
        String name = root.getFileName() == null ? root.toString() : root.getFileName().toString();
        jdbc.update("INSERT OR IGNORE INTO project (id, path, name, demo, added_at) VALUES (?,?,?,?,?)", id, root.toString(), name, demo ? 1 : 0, Json.now());
        jdbc.update("UPDATE project SET archived = 0 WHERE id = ?", id);
        broker.publishApp("project.changed", Json.obj().put("projectId", id).put("change", "added"));
        return require(id);
    }

    /** Opens the project through the bridge; a lock held by another process is reported with its holder (R-SHL-02). */
    public void open(String id) {
        ProjectRow row = require(id);
        if (host().isOpen(id)) return;
        Path root = Path.of(row.path());
        if (!Files.isDirectory(root)) throw new ApiException("unsupported_repository", 422, "the repository is gone: " + root);
        try {
            var info = host().openProject(id, root, settings.projectOpenConfigJson(id), transport.llm());
            jdbc.update("UPDATE project SET opened_at = ?, state_root = ?, repo_identity = ? WHERE id = ?", Json.now(), info.getStateRoot(), info.getRepoIdentity(), id);
            transport.registerRoot(root);
            broker.publishApp("project.changed", Json.obj().put("projectId", id).put("change", "opened"));
        } catch (ProjectLockHeld e) {
            throw ErrorHandling.translate(e);
        }
    }

    public boolean isOpen(String id) { return host().isOpen(id); }

    public void close(String id) {
        host().closeProject(id);
        broker.publishApp("project.changed", Json.obj().put("projectId", id).put("change", "closed"));
    }

    /** Forgets the project in the Studio; never deletes its state root or evidence (§19.2). */
    public void remove(String id) {
        if (host().runningWork(id) != null) throw ApiException.conflict("campaign_active", "close refused while a campaign runs");
        if (host().isOpen(id)) host().closeProject(id);
        jdbc.update("UPDATE project SET archived = 1 WHERE id = ?", id);
        broker.publishApp("project.changed", Json.obj().put("projectId", id).put("change", "removed"));
    }

    /** Opens every registered project at start; failures (a lock held elsewhere) are logged, not fatal. */
    public void openAll() {
        for (ProjectRow r : rows()) {
            try {
                open(r.id());
            } catch (RuntimeException e) {
                log.warn("project {} not opened: {}", r.name(), e.getMessage());
            }
        }
    }

    /** The demo repository of fixture mode, created and registered on first start (§24.3). */
    public ProjectRow ensureDemo() {
        Path parent = transport.dataDir().resolve("fixtures");
        Path root = FixtureRepos.demoShop(parent, false);
        ProjectRow row = add(root.toString(), true);
        jdbc.update("UPDATE project SET demo = 1 WHERE id = ?", row.id());
        transport.registerRoot(root);
        return require(row.id());
    }

    /** Restores the demo repository's files in place (a Studio fixture, never a user repository); history is kept. */
    public ProjectRow resetDemo() {
        ProjectRow demo = rows().stream().filter(ProjectRow::demo).findFirst().orElseThrow(() -> ApiException.notFound("no demo project"));
        if (host().runningWork(demo.id()) != null) throw ApiException.conflict("campaign_active", "a campaign runs in the demo project");
        FixtureRepos.demoShop(Path.of(demo.path()).getParent(), true);
        broker.publishApp("project.changed", Json.obj().put("projectId", demo.id()).put("change", "reset"));
        return demo;
    }

    // ------------------------------------------------------------------------------------------------ DTOs

    public ObjectNode dto(ProjectRow r) {
        ObjectNode o = Json.obj();
        o.put("id", r.id());
        o.put("name", r.name());
        o.put("path", r.path());
        o.put("demo", r.demo());
        o.put("pinned", r.pinned());
        o.put("addedAt", r.addedAt());
        if (r.openedAt() != null) o.put("openedAt", r.openedAt());
        boolean open = host().isOpen(r.id());
        o.put("open", open);
        if (open) {
            o.put("stateRoot", host().stateRoot(r.id()).toString());
            String running = host().runningWork(r.id());
            if (running != null) o.put("runningWork", running);
        }
        Path root = Path.of(r.path());
        Git.Result branch = Git.run(root, 10, "rev-parse", "--abbrev-ref", "HEAD");
        if (branch.ok()) o.put("branch", branch.out().trim());
        o.put("exists", Files.isDirectory(root));
        return o;
    }

    public ArrayNode list() {
        ArrayNode a = Json.arr();
        for (ProjectRow r : rows()) a.add(dto(r));
        return a;
    }

    /** Repository health (§19.2 W-06): git, dirty summary, state root, lock, sniffed commands, rules status. */
    public ObjectNode health(String id) {
        ProjectRow r = require(id);
        Path root = Path.of(r.path());
        ObjectNode o = dto(r);
        Git.Result version = Git.run(root, 10, "version");
        o.put("git", version.ok() ? version.out().trim().replace("git version ", "") : "unavailable");
        Git.Result head = Git.run(root, 10, "rev-parse", "HEAD");
        if (head.ok()) o.put("baseCommit", head.out().trim());
        Git.Result status = Git.run(root, 20, "status", "--porcelain=v2", "--untracked-files=normal");
        int modified = 0, untracked = 0;
        List<String> changed = new ArrayList<>();
        if (status.ok()) {
            for (String line : status.out().split("\n")) {
                if (line.startsWith("1 ") || line.startsWith("2 ")) {
                    modified++;
                    changed.add(line.substring(line.lastIndexOf(' ') + 1));
                } else if (line.startsWith("? ")) {
                    untracked++;
                    changed.add(line.substring(2));
                }
            }
        }
        ObjectNode dirty = o.putObject("dirty");
        dirty.put("modified", modified);
        dirty.put("untracked", untracked);
        ArrayNode paths = dirty.putArray("paths");
        changed.stream().limit(50).forEach(paths::add);
        if (host().isOpen(id)) {
            o.set("repo", Json.parse(host().repoInspection(id)));
            JsonNode binding = settings.rulesBinding(id);
            String rules = RepoInspect.rulesStatus(root, Json.text(binding, "path"), Json.text(binding, "digest"), Json.text(binding, "provenance"));
            ObjectNode rulesNode = o.putObject("rules");
            rulesNode.put("status", rules);
            if (binding != null && !binding.isNull()) rulesNode.set("binding", binding);
            o.set("storeCounts", Json.parse(host().storeCounts(id)));
            // §13.1: the lease holder is `controller:<pid>`; another process's live lease refuses the next open.
            String self = "controller:" + ProcessHandle.current().pid();
            ArrayNode leases = o.putArray("leases");
            for (JsonNode l : Json.parse(host().leases(id))) {
                ObjectNode lease = leases.addObject();
                lease.put("workspace", Json.text(l, "workspaceId"));
                lease.put("holder", Json.text(l, "holder"));
                lease.put("expiry", Json.text(l, "expiry"));
                lease.put("ours", self.equals(Json.text(l, "holder")));
                String expiry = Json.text(l, "expiry");
                lease.put("live", expiry != null && java.time.Instant.parse(expiry).isAfter(java.time.Instant.now()));
            }
        }
        return o;
    }

    /** Files for `@path` mentions (tracked files, filtered). */
    public ArrayNode files(String id, String query, int limit) {
        ProjectRow r = require(id);
        Git.Result files = Git.run(Path.of(r.path()), 20, "ls-files");
        ArrayNode a = Json.arr();
        if (!files.ok()) return a;
        String q = query == null ? "" : query.toLowerCase();
        int n = 0;
        for (String f : files.out().split("\n")) {
            if (f.isBlank()) continue;
            if (!q.isEmpty() && !f.toLowerCase().contains(q)) continue;
            a.add(f);
            if (++n >= limit) break;
        }
        return a;
    }

    public Path root(String id) { return Path.of(require(id).path()); }

    private static boolean sameFile(Path a, Path b) {
        try {
            return Files.isSameFile(a, b);
        } catch (IOException e) {
            return a.equals(b);
        }
    }

    private static String canonical(Path p) {
        String s = p.toAbsolutePath().normalize().toString();
        return System.getProperty("os.name", "").toLowerCase().contains("win") ? s.toLowerCase() : s;
    }

    private static String shortHash(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d, 0, 5);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
