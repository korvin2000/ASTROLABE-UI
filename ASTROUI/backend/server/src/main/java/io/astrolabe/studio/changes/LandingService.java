package io.astrolabe.studio.changes;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Git;
import io.astrolabe.studio.support.Json;
import io.astrolabe.studio.support.StudioError;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Landing the changes (Studio 2 §7.8, BE-11, BE-12): Undo restores files to the state before the task and leaves
 * alone what the user edited afterwards; Commit is an ordinary `git add` and `git commit` of the chosen paths, run as
 * the user's action. These are the only git commands of the Studio that write, and only on the user's click.
 */
@Service
public class LandingService {
    private static final Set<String> WRITES = Set.of("add", "commit", "restore", "switch", "init");

    private final HostService hosts;
    private final ChangesService changes;
    private final JdbcTemplate jdbc;

    public LandingService(HostService hosts, ChangesService changes, JdbcTemplate jdbc) {
        this.hosts = hosts;
        this.changes = changes;
        this.jdbc = jdbc;
    }

    public record Out(int exit, String text, byte[] bytes) {
        public boolean ok() { return exit == 0; }
    }

    /** Runs a git command that writes; the sub-command must be one the Studio uses for landing. */
    public static Out git(Path repo, String... args) {
        if (args.length == 0 || !WRITES.contains(args[0])) throw new IllegalArgumentException("git " + (args.length == 0 ? "" : args[0]) + " is not a landing command");
        return exec(repo, args);
    }

    private static Out exec(Path repo, String... args) {
        List<String> argv = new ArrayList<>(List.of("git", "-c", "core.quotepath=off"));
        argv.addAll(Arrays.asList(args));
        ProcessBuilder pb = new ProcessBuilder(argv).redirectErrorStream(true).directory(repo.toFile());
        pb.environment().put("GIT_TERMINAL_PROMPT", "0");
        try {
            Process process = pb.start();
            process.getOutputStream().close();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = process.getInputStream()) {
                in.transferTo(out);
            }
            if (!process.waitFor(60, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return new Out(-1, "git " + args[0] + " took too long", new byte[0]);
            }
            return new Out(process.exitValue(), out.toString(StandardCharsets.UTF_8), out.toByteArray());
        } catch (IOException e) {
            return new Out(-1, "git is not available: " + e.getMessage(), new byte[0]);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Out(-1, "interrupted", new byte[0]);
        }
    }

    private static byte[] withoutCarriageReturns(byte[] bytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(bytes.length);
        for (int i = 0; i < bytes.length; i++) {
            if (bytes[i] == '\r' && i + 1 < bytes.length && bytes[i + 1] == '\n') continue;
            out.write(bytes[i]);
        }
        return out.toByteArray();
    }

    /** The content of [path] at [commit], or null when the file does not exist there. */
    private static byte[] blob(Path repo, String commit, String path) {
        Out out = exec(repo, "cat-file", "blob", commit + ":" + path);
        return out.ok() ? out.bytes() : null;
    }

    private static Path resolve(Path repo, String relative) {
        Path file = repo.resolve(relative).normalize();
        if (!file.startsWith(repo)) throw ApiException.invalid("not a path of the project: " + relative);
        return file;
    }

    /** True when the file in the working folder still is what the agent left (line endings aside). */
    private static boolean untouched(Path repo, String latest, String path) throws IOException {
        Path file = resolve(repo, path);
        byte[] agent = blob(repo, latest, path);
        if (!Files.exists(file)) return agent == null;
        if (agent == null || !Files.isRegularFile(file)) return false;
        return Arrays.equals(withoutCarriageReturns(Files.readAllBytes(file)), withoutCarriageReturns(agent));
    }

    /**
     * `POST /tasks/{id}/undo`: `{ paths?: [...] }`, all changed files when absent. A file the user edited after the
     * agent is skipped and named. The index is not touched.
     */
    public ObjectNode undo(String projectId, List<String> works, List<String> paths) {
        ChangesService.Range range = changes.range(projectId, works);
        if (range == null) throw ApiException.invalid("the task has no changes to undo");
        Path repo = hosts.host().repoRoot(projectId);
        if (hosts.host().runningWork(projectId) != null) throw StudioError.of(StudioError.PROJECT_BUSY, Json.obj(), "a task is working in this project; stop it before undoing");
        JsonNode changed = changes.taskChanges(projectId, works, false);
        List<String> targets = new ArrayList<>();
        for (JsonNode f : Json.each(changed.get("files"))) {
            String path = Json.text(f, "path");
            if (paths == null || paths.isEmpty() || paths.contains(path)) targets.add(path);
            String renamedFrom = Json.text(f, "renamedFrom");
            if (renamedFrom != null && (paths == null || paths.isEmpty() || paths.contains(path))) targets.add(renamedFrom);
        }
        ObjectNode o = Json.obj();
        ArrayNode restored = o.putArray("restored");
        ArrayNode skipped = o.putArray("skipped");
        for (String path : targets) {
            try {
                if (!untouched(repo, range.to().commit(), path)) {
                    skipped.addObject().put("path", path).put("why", "edited_after");
                    continue;
                }
                byte[] before = blob(repo, range.from().commit(), path);
                Path file = resolve(repo, path);
                if (before == null) {
                    Files.deleteIfExists(file);
                } else {
                    Out out = git(repo, "restore", "--source=" + range.from().commit(), "--worktree", "--", path);
                    if (!out.ok()) {
                        skipped.addObject().put("path", path).put("why", "failed").put("detail", out.text().strip());
                        continue;
                    }
                }
                restored.add(path);
            } catch (IOException | RuntimeException e) {
                skipped.addObject().put("path", path).put("why", "failed").put("detail", String.valueOf(e.getMessage()));
            }
        }
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), "local", "task.undo", works.getFirst(), Json.write(o));
        return o;
    }

    /** What the Commit dialog shows: the branch, a suggested branch name, the files of the agent and the user's own. */
    public ObjectNode commitPlan(String projectId, List<String> works, String title, String summary) {
        Path repo = hosts.host().repoRoot(projectId);
        ObjectNode o = Json.obj();
        Git.Result branch = Git.run(repo, 10, "rev-parse", "--abbrev-ref", "HEAD");
        o.put("branch", branch.ok() ? branch.out().trim() : "");
        o.put("suggestedBranch", "astrolabe/" + slug(title));
        o.put("message", message(title, summary));
        JsonNode changed = changes.taskChanges(projectId, works, false);
        ArrayNode files = o.putArray("files");
        Set<String> agent = new java.util.LinkedHashSet<>();
        for (JsonNode f : Json.each(changed.get("files"))) agent.add(Json.text(f, "path"));
        Set<String> dirty = dirty(repo);
        for (JsonNode f : Json.each(changed.get("files"))) {
            String path = Json.text(f, "path");
            if (!dirty.contains(path)) continue;
            ObjectNode file = files.addObject();
            file.setAll((ObjectNode) f);
            file.put("selected", true);
        }
        ArrayNode mine = o.putArray("earlier");
        for (String path : dirty) if (!agent.contains(path)) mine.addObject().put("path", path).put("selected", false);
        return o;
    }

    private static Set<String> dirty(Path repo) {
        Set<String> out = new java.util.TreeSet<>();
        Git.Result status = Git.run(repo, 20, "status", "--porcelain", "--untracked-files=all", "-z");
        if (!status.ok()) return out;
        String[] entries = status.out().split("\u0000");
        for (int i = 0; i < entries.length; i++) {
            String e = entries[i];
            if (e.length() < 4) continue;
            out.add(e.substring(3));
            // A rename is followed by its old path as a separate entry.
            if (e.charAt(0) == 'R' || e.charAt(0) == 'C') i++;
        }
        return out;
    }

    static String slug(String title) {
        String s = title == null ? "" : title.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (s.length() > 40) s = s.substring(0, 40).replaceAll("-+$", "");
        return s.isEmpty() ? "task" : s;
    }

    static String message(String title, String summary) {
        String subject = title == null ? "Changes by ASTROLABE" : title.strip().lines().findFirst().orElse("Changes by ASTROLABE");
        if (subject.length() > 72) subject = subject.substring(0, 71) + "…";
        return summary == null || summary.isBlank() ? subject : subject + "\n\n" + summary.strip();
    }

    /** `POST /tasks/{id}/commit`: `{ message, paths: [...], branch? }` — `git add` and `git commit` of those paths. */
    public ObjectNode commit(String projectId, List<String> works, String message, List<String> paths, String newBranch) {
        if (message == null || message.isBlank()) throw ApiException.invalid("a commit needs a message");
        if (paths == null || paths.isEmpty()) throw ApiException.invalid("choose at least one file");
        Path repo = hosts.host().repoRoot(projectId);
        if (hosts.host().runningWork(projectId) != null) throw StudioError.of(StudioError.PROJECT_BUSY, Json.obj(), "a task is working in this project; stop it before committing");
        for (String p : paths) resolve(repo, p);
        ObjectNode o = Json.obj();
        if (newBranch != null && !newBranch.isBlank()) {
            if (!newBranch.matches("[A-Za-z0-9._/-]{1,120}") || newBranch.startsWith("-") || newBranch.contains("..")) throw ApiException.invalid("not a branch name: " + newBranch);
            Out created = git(repo, "switch", "-c", newBranch);
            if (!created.ok()) throw new ApiException("commit_failed", 409, created.text().strip());
            o.put("branch", newBranch);
        }
        List<String> add = new ArrayList<>(List.of("add", "-A", "--"));
        add.addAll(paths);
        Out added = git(repo, add.toArray(String[]::new));
        if (!added.ok()) throw new ApiException("commit_failed", 409, added.text().strip());
        List<String> commit = new ArrayList<>(List.of("commit", "-m", message.strip(), "--"));
        commit.addAll(paths);
        Out committed = git(repo, commit.toArray(String[]::new));
        if (!committed.ok()) throw new ApiException("commit_failed", 409, committed.text().strip());
        Git.Result head = Git.run(repo, 10, "rev-parse", "--short", "HEAD");
        o.put("commit", head.ok() ? head.out().trim() : "");
        if (!o.has("branch")) {
            Git.Result branch = Git.run(repo, 10, "rev-parse", "--abbrev-ref", "HEAD");
            o.put("branch", branch.ok() ? branch.out().trim() : "");
        }
        o.put("files", paths.size());
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), "local", "task.commit", works.getFirst(), Json.write(o));
        return o;
    }

    /** `POST /fs/git-init`: a new repository with a first commit, so the folder can be tracked and undone (§5 UX-8). */
    public static void init(Path folder) {
        Out init = git(folder, "init");
        if (!init.ok()) throw new ApiException("git_failed", 409, init.text().strip());
        Out add = git(folder, "add", "-A");
        if (!add.ok()) throw new ApiException("git_failed", 409, add.text().strip());
        Out commit = exec(folder, "commit", "--allow-empty", "-m", "Initial commit");
        if (!commit.ok()) {
            // No git identity is configured on this computer: the first commit is made in the Studio's name.
            commit = exec(folder, "-c", "user.name=ASTROLABE", "-c", "user.email=astrolabe@localhost", "-c", "commit.gpgsign=false",
                "commit", "--allow-empty", "-m", "Initial commit");
        }
        if (!commit.ok()) throw new ApiException("git_failed", 409, commit.text().strip());
    }
}
