package io.astrolabe.studio.tasks;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import io.astrolabe.studio.support.Json;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * What the Studio shows of a finish receipt (ASTROLABE 2.0 C4, plan §4.4): who verified the result, whether a model judge
 * approved part of it, and — for a run stopped at a limit — where the best verified result is. Pure functions of the
 * receipt's JSON; the core computes the class (D-397, D-400) and the Studio never recomputes it, except for a receipt
 * written before the core knew a reviewer's kind.
 */
final class Provenance {
    private static final List<String> ORDER = List.of("unverified", "agent_test", "independent");
    private static final String REVIEW_PASS = "studio:review-pass(";

    private Provenance() { }

    /** The class of a receipt (`independent` · `agent_test` · `unverified`) and whether a model judge approved an item. */
    record Label(String cls, boolean judge) {
        ObjectNode json() { return Json.obj().put("class", cls).put("judge", judge); }
    }

    /** [receipt]'s label, or null when it has no provenance class (a receipt older than the class). */
    static Label of(JsonNode receipt) {
        String cls = Json.text(receipt, "provenanceClass");
        if (cls == null || !ORDER.contains(cls)) return null;
        boolean judge = receipt.path("acceptanceSurfaceModelApproved").size() > 0;
        for (JsonNode line : Json.each(receipt.get("acceptance"))) judge |= judged(line);
        // A receipt without the reviewer's kind (before core C1b) took the Studio's review pass for a person: only a
        // requirement closed by a judge alone is lowered, as the core now does itself.
        if (!receipt.has("acceptanceSurfaceModelApproved") && cls.equals("independent")) cls = judgeOnlyLowered(receipt);
        return new Label(cls, judge);
    }

    /** An item a model judge approved: the judge's tier or the host's model in `verifiedBy`, or the Studio's review pass. */
    static boolean judged(JsonNode line) {
        if (!"reviewed".equals(Json.text(line, "provenance"))) return false;
        String by = Json.text(line, "verifiedBy");
        String accepted = Json.text(line, "acceptedBy", "");
        return accepted.startsWith(REVIEW_PASS) || (by != null && !by.equals("runtime") && !by.equals("human"));
    }

    private static String judgeOnlyLowered(JsonNode receipt) {
        Set<String> passed = new HashSet<>();
        for (JsonNode c : Json.each(receipt.get("checksRun"))) if ("passed".equals(Json.text(c, "outcome"))) passed.add(Json.text(c, "checkId"));
        String worst = "independent";
        for (JsonNode req : Json.each(receipt.get("requirements"))) {
            if (!"independent".equals(Json.text(req, "provenanceClass"))) continue;
            Set<String> ids = new HashSet<>();
            for (JsonNode id : Json.each(req.get("acceptance"))) ids.add(id.asString());
            boolean byJudge = false, otherwise = false;
            for (JsonNode line : Json.each(receipt.get("acceptance"))) {
                if (!ids.contains(Json.text(line, "id"))) continue;
                if (judged(line)) byJudge = true;
                else if ("independent".equals(Json.text(line, "provenanceClass"))) otherwise = true;
            }
            if (!byJudge || otherwise) continue;
            boolean agent = false;
            for (JsonNode c : Json.each(req.get("agentChecks"))) agent |= passed.contains(c.asString());
            String cls = agent ? "agent_test" : "unverified";
            if (ORDER.indexOf(cls) < ORDER.indexOf(worst)) worst = cls;
        }
        return worst;
    }

    /**
     * Where the best verified result of a run stopped at a limit is (core `LimitStop`): `current` — the project files;
     * `earlier` — an earlier state, the files hold later unverified changes; `accepted` — the best state was only
     * accepted without a check (I7), nothing is verified; `none` — nothing at all. Null without a limit stop.
     */
    static String best(JsonNode receipt) {
        JsonNode limit = receipt == null ? null : receipt.get("limit");
        if (limit == null || limit.isNull()) return null;
        if (!limit.hasNonNull("bestCandidate")) return "none";
        if (limit.path("verified").size() == 0 && limit.path("verifiedEarlier").size() == 0) return "accepted";
        return limit.path("workingTree").asBoolean(false) ? "current" : "earlier";
    }

    /**
     * C1b/C4: the agent's own test that could become the project's check — a model check (`CHK-model-*`) of tests that
     * passed, run at the project root — when the run completed and the project has no test command ([testSource]
     * `none`: the next task then applies the saved one). Its command as one line, or null.
     */
    static String checkOffer(JsonNode receipt, String testSource) {
        return "none".equals(testSource) ? checkCandidate(receipt) : null;
    }

    /** The agent's test [checkOffer] would offer, before the project is asked whether it has a command of its own. */
    static String checkCandidate(JsonNode receipt) {
        if (receipt == null || !"completed".equals(Json.text(receipt, "outcome"))) return null;
        String offer = null;
        for (JsonNode c : Json.each(receipt.get("checksRun"))) {
            boolean model = Json.text(c, "checkId", "").startsWith("CHK-model-") || "model".equals(Json.text(c.path("checkOrigin"), "type"));
            JsonNode command = c.path("command");
            String cwd = Json.text(command, "cwd");
            if (!model || !"tests".equalsIgnoreCase(Json.text(c, "evidenceKind", "")) || !"passed".equals(Json.text(c, "outcome"))
                || !(cwd == null || cwd.isEmpty() || cwd.equals("."))) continue;
            List<String> argv = new java.util.ArrayList<>();
            for (JsonNode a : Json.each(command.get("argv"))) argv.add(a.asString());
            String line = line(argv);
            if (line != null) offer = line;
        }
        return offer;
    }

    /**
     * [argv] as the one line the project's settings keep, or null when the line would not read back as the same argv
     * (`Verification.argv` takes `'` and `"` as quotes) or holds a character the user could not see — an empty word,
     * a quote, a control or a bidirectional mark. Such a check is not offered: the saved command must be the one that passed.
     */
    static String line(List<String> argv) {
        if (argv.isEmpty() || argv.getFirst().isBlank()) return null;
        List<String> words = new java.util.ArrayList<>();
        for (String a : argv) {
            if (a.isEmpty() || a.indexOf('"') >= 0 || a.indexOf('\'') >= 0) return null;
            for (int i = 0; i < a.length(); i++) {
                int t = Character.getType(a.charAt(i));
                if (t == Character.CONTROL || t == Character.FORMAT || t == Character.LINE_SEPARATOR || t == Character.PARAGRAPH_SEPARATOR) return null;
            }
            words.add(a.chars().anyMatch(Character::isWhitespace) ? "\"" + a + "\"" : a);
        }
        String line = String.join(" ", words);
        return io.astrolabe.studio.bridge.Verification.argv(line).equals(argv) ? line : null;
    }

    /** The kind of a task limit from the core's budget stop code (D-401), or null for any other stop. */
    static String limitKind(String stopCode) {
        if (stopCode == null) return null;
        return switch (stopCode) {
            case "task_limit_money" -> "money";
            case "task_limit_minutes" -> "minutes";
            case "task_limit_requests" -> "requests";
            default -> null;
        };
    }
}
