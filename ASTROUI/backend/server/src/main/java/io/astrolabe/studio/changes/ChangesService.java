package io.astrolabe.studio.changes;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Git;
import io.astrolabe.studio.support.Json;

import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Changes (§10): per-turn shadow-ref snapshots (`refs/astrolabe/<work>/<attempt>/<ws>/head`, turn 0 = the initial
 * dirty state) diffed read-only with git (§30.5), attributed from the finish receipt's change split when present,
 * else from journal `edit-outcome` paths (A), everything else the agent's run moved (R) and snapshot-0 changes (U).
 * Pre-image and post-image blobs are never served (§30.4).
 */
@Service
public class ChangesService {
    private static final Pattern TURN = Pattern.compile("astrolabe snapshot turn (\\d+)");
    private static final Pattern EDIT_PATHS = Pattern.compile("([^\\s:]+) @[0-9a-f]{8}→@[0-9a-f]{8}");

    private final HostService hosts;

    public ChangesService(HostService hosts) { this.hosts = hosts; }

    public record Snapshot(int turn, String commit, String at) { }

    /** Snapshot records of [work] (oldest first) from the shadow ref history. */
    public java.util.List<Snapshot> snapshots(Path repo, String work) {
        Git.Result refs = Git.run(repo, "for-each-ref", "--format=%(refname)", "refs/astrolabe/" + work + "/");
        java.util.List<Snapshot> out = new java.util.ArrayList<>();
        if (!refs.ok()) return out;
        String ref = refs.out().lines().filter(l -> l.endsWith("/head")).findFirst().orElse(null);
        if (ref == null) return out;
        Git.Result log = Git.run(repo, "log", "--format=%H%x09%cI%x09%s", "--reverse", ref);
        if (!log.ok()) return out;
        for (String line : log.out().split("\n")) {
            String[] parts = line.split("\t", 3);
            if (parts.length < 3) continue;
            Matcher m = TURN.matcher(parts[2]);
            if (m.find()) out.add(new Snapshot(Integer.parseInt(m.group(1)), parts[0], parts[1]));
        }
        return out;
    }

    public ObjectNode changes(String projectId, String work, Integer fromTurn, Integer toTurn) { return changes(projectId, work, fromTurn, toTurn, true); }

    /**
     * Files changed between two snapshots. With [ignoreEol] the line counts ignore a carriage return at end of line:
     * with `core.autocrlf` on Windows a touched file can be snapshotted with CRLF while snapshot 0 holds LF, which
     * would otherwise show every line as changed. Files whose only difference is line endings are flagged, not hidden.
     */
    public ObjectNode changes(String projectId, String work, Integer fromTurn, Integer toTurn, boolean ignoreEol) {
        Path repo = hosts.host().repoRoot(projectId);
        java.util.List<Snapshot> snaps = snapshots(repo, work);
        ObjectNode o = Json.obj();
        ArrayNode sn = o.putArray("snapshots");
        for (Snapshot s : snaps) sn.addObject().put("turn", s.turn()).put("commit", s.commit()).put("at", s.at());
        if (snaps.isEmpty()) {
            o.put("available", false);
            o.put("reason", "no shadow-ref snapshots yet: the campaign has not recorded a mutating turn");
            o.putArray("files");
            return o;
        }
        Snapshot from = pick(snaps, fromTurn, true);
        Snapshot to = pick(snaps, toTurn, false);
        o.put("available", true);
        o.put("fromTurn", from.turn());
        o.put("toTurn", to.turn());
        o.put("fromCommit", from.commit());
        o.put("toCommit", to.commit());

        Attribution attribution = attribution(projectId, work, repo, snaps.getFirst());
        Map<String, ObjectNode> files = new LinkedHashMap<>();
        Git.Result nameStatus = Git.run(repo, "diff", "--name-status", "--find-renames", from.commit(), to.commit());
        Git.Result numstat = ignoreEol
            ? Git.run(repo, "diff", "--numstat", "--find-renames", "--ignore-cr-at-eol", from.commit(), to.commit())
            : Git.run(repo, "diff", "--numstat", "--find-renames", from.commit(), to.commit());
        Map<String, String> rawCounts = new java.util.HashMap<>();
        if (ignoreEol) {
            Git.Result raw = Git.run(repo, "diff", "--numstat", "--find-renames", from.commit(), to.commit());
            if (raw.ok()) for (String line : raw.out().split("\n")) {
                String[] p = line.split("\t");
                if (p.length >= 3) rawCounts.put(numstatPath(p[p.length - 1]), p[0] + "/" + p[1]);
            }
        }
        o.put("eolIgnored", ignoreEol);
        if (nameStatus.ok()) {
            for (String line : nameStatus.out().split("\n")) {
                if (line.isBlank()) continue;
                String[] p = line.split("\t");
                String kind = p[0].substring(0, 1);
                String path = p[p.length - 1];
                ObjectNode f = Json.obj();
                f.put("path", path);
                f.put("kind", kind.equals("R") ? "M" : kind);
                if (p.length == 3) f.put("renamedFrom", p[1]);
                f.put("attribution", attribution.of(path));
                files.put(path, f);
            }
        }
        if (numstat.ok()) {
            for (String line : numstat.out().split("\n")) {
                String[] p = line.split("\t");
                if (p.length < 3) continue;
                String path = numstatPath(p[p.length - 1]);
                ObjectNode f = files.get(path);
                if (f == null) continue;
                if (p[0].equals("-")) f.put("binary", true);
                else {
                    f.put("added", Integer.parseInt(p[0]));
                    f.put("removed", Integer.parseInt(p[1]));
                    String raw = rawCounts.get(path);
                    if (raw != null && !raw.equals(p[0] + "/" + p[1])) {
                        f.put("eolChanged", true);
                        if (p[0].equals("0") && p[1].equals("0")) f.put("eolOnly", true);
                    }
                }
            }
        }
        ArrayNode fa = o.putArray("files");
        files.values().forEach(fa::add);
        // Pre-existing user changes (U): dirty at snapshot 0, shown for context and never offered for revert.
        ArrayNode pre = o.putArray("preExisting");
        attribution.preExisting.forEach(pre::add);
        o.put("attributionSource", attribution.source);
        return o;
    }

    private static String numstatPath(String path) {
        return path.contains(" => ") ? path.replaceAll(".*=> ?", "").replace("}", "") : path;
    }

    private static Snapshot pick(java.util.List<Snapshot> snaps, Integer turn, boolean first) {
        if (turn == null) return first ? snaps.getFirst() : snaps.getLast();
        Snapshot best = first ? snaps.getFirst() : snaps.getLast();
        for (Snapshot s : snaps) if (s.turn() == turn) return s;
        return best;
    }

    private final class Attribution {
        final Set<String> agent = new HashSet<>();
        final Set<String> byRun = new HashSet<>();
        final Set<String> preExisting = new java.util.TreeSet<>();
        final Set<String> external = new HashSet<>();
        String source = "journal";

        String of(String path) {
            if (agent.contains(path)) return "agent";
            if (external.contains(path)) return "external";
            if (byRun.contains(path)) return "run";
            if (preExisting.contains(path)) return "user";
            return "unknown";
        }
    }

    private Attribution attribution(String projectId, String work, Path repo, Snapshot zero) {
        Attribution a = new Attribution();
        String receipt = hosts.host().finishReceipt(projectId, work);
        if (receipt != null) {
            JsonNode changes = Json.parse(receipt).path("changes");
            if (!changes.isMissingNode()) {
                a.source = "finish receipt";
                for (JsonNode n : Json.each(changes.get("agent"))) a.agent.add(pathOf(n));
                for (JsonNode n : Json.each(changes.get("byRun"))) a.byRun.add(pathOf(n));
                for (JsonNode n : Json.each(changes.get("preExistingUserChanges"))) a.preExisting.add(pathOf(n));
            }
        }
        if (a.agent.isEmpty()) {
            JsonNode journal = Json.parse(hosts.host().journalAfter(projectId, work, 0, 2000));
            for (JsonNode row : journal) {
                String kind = Json.text(row, "kind");
                if ("edit-outcome".equals(kind)) {
                    Matcher m = EDIT_PATHS.matcher(Json.text(row, "text", ""));
                    while (m.find()) a.agent.add(m.group(1));
                    for (JsonNode ref : Json.each(row.get("refs"))) {
                        String r = ref.asString();
                        if (r.contains("/") || r.contains(".")) if (!r.startsWith("#") && !r.contains(":")) a.agent.add(r);
                    }
                }
                if ("reconcile".equals(kind) && Json.text(row, "text", "").contains("(external)")) {
                    for (JsonNode ref : Json.each(row.get("refs"))) a.external.add(ref.asString());
                }
            }
        }
        if (a.preExisting.isEmpty()) {
            Git.Result base = Git.run(repo, "rev-parse", "HEAD");
            if (base.ok()) {
                Git.Result pre = Git.run(repo, "diff", "--name-only", base.out().trim(), zero.commit());
                if (pre.ok()) pre.out().lines().filter(l -> !l.isBlank()).forEach(a.preExisting::add);
            }
        }
        return a;
    }

    private static String pathOf(JsonNode n) {
        if (n.isString()) return n.asString();
        String p = Json.text(n, "path");
        return p == null ? n.toString() : p;
    }

    /** Unified diff text between two snapshots for one path (or all), read-only. */
    public ObjectNode diff(String projectId, String work, Integer fromTurn, Integer toTurn, String path) { return diff(projectId, work, fromTurn, toTurn, path, true); }

    public ObjectNode diff(String projectId, String work, Integer fromTurn, Integer toTurn, String path, boolean ignoreEol) {
        Path repo = hosts.host().repoRoot(projectId);
        java.util.List<Snapshot> snaps = snapshots(repo, work);
        if (snaps.isEmpty()) throw ApiException.notFound("no snapshots for " + work);
        Snapshot from = pick(snaps, fromTurn, true);
        Snapshot to = pick(snaps, toTurn, false);
        java.util.List<String> args = new java.util.ArrayList<>(java.util.List.of("diff", "--find-renames", "-U3"));
        if (ignoreEol) args.add("--ignore-cr-at-eol");
        args.add(from.commit());
        args.add(to.commit());
        if (path != null) { args.add("--"); args.add(path); }
        Git.Result diff = Git.run(repo, args.toArray(String[]::new));
        ObjectNode o = Json.obj();
        o.put("fromTurn", from.turn());
        o.put("toTurn", to.turn());
        if (path != null) o.put("path", path);
        o.put("diff", diff.ok() ? diff.out() : "");
        o.put("eolIgnored", ignoreEol);
        o.put("truncated", diff.truncated());
        return o;
    }

    /** "Export .patch": snapshot 0 → final snapshot, agent paths only by default (§10.4). */
    public String patch(String projectId, String work, boolean agentOnly) {
        ObjectNode changes = changes(projectId, work, null, null);
        if (!changes.path("available").asBoolean(false)) throw ApiException.notFound("nothing to export: no snapshots");
        Path repo = hosts.host().repoRoot(projectId);
        java.util.List<String> args = new java.util.ArrayList<>(java.util.List.of("diff", "--find-renames", changes.get("fromCommit").asString(), changes.get("toCommit").asString(), "--"));
        Map<String, Boolean> include = new HashMap<>();
        for (JsonNode f : changes.get("files")) {
            boolean ok = !agentOnly || "agent".equals(Json.text(f, "attribution"));
            include.put(Json.text(f, "path"), ok);
            if (ok) args.add(Json.text(f, "path"));
        }
        if (agentOnly && include.values().stream().noneMatch(Boolean::booleanValue)) return "";
        Git.Result r = Git.run(repo, args.toArray(String[]::new));
        return r.ok() ? r.out() : "";
    }
}
