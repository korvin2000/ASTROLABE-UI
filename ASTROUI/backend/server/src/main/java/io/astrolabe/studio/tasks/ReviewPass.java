package io.astrolabe.studio.tasks;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.astrolabe.studio.bridge.Verification;
import io.astrolabe.studio.changes.ChangesService;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.models.ModelService;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.support.Json;

import net.ai.gate.chat.Conversation;
import net.ai.gate.chat.options.ChatOptions;
import net.ai.gate.error.LlmException;
import net.ai.gate.model.Model;
import net.ai.gate.model.ReasoningLevel;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The review pass (Studio 2 §7.3 order 4, finding F-5; phase 0 B1): a task without tests is accepted through a
 * `check:` item that the host's reviewer assesses. The reviewer only verifies and reports honestly — it sees the
 * request, what the user said and the change, and answers `approve`, `revise` (a concrete defect in the shown change)
 * or `cannot_verify` (what it would need is not visible to it). What to do with an unverified result is the acceptance
 * decision's business (B2), never the reviewer's: a failed or unreadable review is `null`, an unverified result for
 * the core, with its cause recorded for the task (B6).
 */
@Service
public class ReviewPass implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(ReviewPass.class);
    private static final int MAX_DIFF_CHARS = 60_000;
    /** D2: a verdict is one short JSON object; low reasoning keeps it fast. */
    private static final int MAX_OUTPUT_TOKENS = 600;
    static final String PARTIAL = "only part of the change was shown to the reviewer";

    static final String SYSTEM = Verification.REVIEW_MARKER + "\n"
        + "You check one finished change against the user's request. You see the request, what the user said during the\n"
        + "task, and the change as a diff. You cannot run anything and you see no other files.\n"
        + "Answer with exactly one verdict:\n"
        + "- \"approve\": the change does what was asked and you see no defect in the shown change.\n"
        + "- \"revise\": you found a concrete defect IN THE SHOWN CHANGE that breaks what was asked. Every finding names the\n"
        + "  file and line and says what is wrong. Missing information is never a defect.\n"
        + "- \"cannot_verify\": you cannot tell, because something you would need is not visible to you: program output,\n"
        + "  other files, a running application, an action that leaves no trace in files, the environment. Say what is missing.\n"
        + "Judge only what the diff shows. Do not demand tests or proof of actions such as opening a browser.\n"
        + "If the request needed no change to the files and nothing was changed, that is \"approve\".\n"
        + "Between \"revise\" and \"cannot_verify\" choose \"cannot_verify\".\n"
        + "Reply with one JSON object and nothing else:\n"
        + "{\"verdict\":\"approve\"|\"revise\"|\"cannot_verify\",\"summary\":\"one sentence\",\n"
        + " \"findings\":[{\"severity\":\"blocker\"|\"major\"|\"minor\",\"location\":\"path:line\",\"issue\":\"what is wrong\"}],\n"
        + " \"missing\":\"what could not be checked\"}";

    private final TransportService transport;
    private final ChangesService changes;
    private final DecisionService decisions;
    private final JdbcTemplate jdbc;
    private final io.astrolabe.studio.runtime.HostService hosts;
    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("review-pass-", 0).factory());

    public ReviewPass(TransportService transport, ChangesService changes, @Lazy DecisionService decisions, JdbcTemplate jdbc,
                      io.astrolabe.studio.runtime.HostService hosts) {
        this.hosts = hosts;
        this.transport = transport;
        this.changes = changes;
        this.decisions = decisions;
        this.jdbc = jdbc;
    }

    public CompletableFuture<String> review(String workId, JsonNode request) {
        return CompletableFuture.supplyAsync(() -> {
            Assessed assessed;
            try {
                assessed = assess(workId, request);
            } catch (RuntimeException e) {
                // B6: the cause goes to the task and the export, not only to the console.
                assessed = new Assessed(null, null, failure(e));
                log.warn("review pass for {} gave no verdict: {}", workId, assessed.failure());
            }
            assessed = forCore(request, assessed);
            decisions.recordReview(workId, request, assessed.verdict(), assessed.notes(), assessed.failure());
            return assessed.verdict() == null ? null : Json.write(assessed.verdict());
        }, executor);
    }

    /** What the review pass produced: the core's verdict (or null), the notes for the task, the cause of a missing verdict. */
    record Assessed(ObjectNode verdict, ObjectNode notes, String failure) { }

    static final String UNAVAILABLE = "review unavailable";

    /**
     * WD-17 (WF-9): this reviewer cannot read files or run anything, so it never blocks. Its "cannot tell" is no review
     * at all — the core gets no verdict (the result is unverified and goes to the acceptance decision) instead of an
     * insufficient-evidence verdict, which declines like a rejection. A person's review (C11) keeps the verdict: there it
     * is only information on the user's card.
     */
    static Assessed forCore(JsonNode request, Assessed assessed) {
        if (assessed.verdict() == null || !"InsufficientEvidence".equals(Json.text(assessed.verdict(), "outcome"))) return assessed;
        if (request.path("humanOnly").asBoolean(false)) return assessed;
        return new Assessed(null, assessed.notes(), UNAVAILABLE + ": " + Json.text(assessed.verdict(), "missingCriterion", "the reviewer could not tell"));
    }

    private Assessed assess(String workId, JsonNode request) {
        List<java.util.Map<String, Object>> rows = jdbc.queryForList("SELECT project_id, model_ref, request_text FROM campaign_index WHERE work_id = ?", workId);
        if (rows.isEmpty()) return new Assessed(null, null, "the run is not known to the Studio");
        String projectId = (String) rows.getFirst().get("project_id");
        ModelService.Ref ref = ModelService.Ref.parse((String) rows.getFirst().get("model_ref"));
        String asked = (String) rows.getFirst().get("request_text");
        if (ref == null || asked == null) return new Assessed(null, null, "the run has no model or no request");
        String change = evidence(projectId, workId, request);
        String earlier = earlier(projectId, workId);
        boolean partial = change.length() > MAX_DIFF_CHARS || earlier.length() > MAX_DIFF_CHARS;
        String diff = change.isBlank() ? "(no file was changed)" : cut(change);
        // D1: only the contract's criteria; the core's architecture rubric and its diff-limit lines are not the user's.
        StringBuilder criteria = new StringBuilder();
        for (JsonNode c : Json.each(request.get("criteria"))) criteria.append("- ").append(c.asString()).append('\n');
        String said = said(workId);
        String user = "Request:\n" + asked.strip() + "\n\n" + (said.isEmpty() ? "" : "During the task:\n" + said + "\n")
            + "Criteria:\n" + (criteria.isEmpty() ? "- " + Verification.REVIEW_TEXT + "\n" : criteria)
            + (earlier.isBlank() ? "" : "\nChanges of earlier runs of this task, already in the project (unified diff):\n" + cut(earlier) + "\n")
            + "\nChange of this run (unified diff):\n" + diff;

        Model model = transport.llm().models().require(ref.provider(), ref.model());
        // D2: low reasoning and a short output cap; `strict` stays off (Codex drops the cap with a warning).
        ChatOptions.Builder options = ChatOptions.builder().maxTokens(MAX_OUTPUT_TOKENS).tag("studio.purpose", "review").tag("astrolabe.work", workId);
        ReasoningLevel low = ReasoningLevel.LOW.nearest(model.reasoningLevels());
        if (low != null) options.reasoning(low);
        String reply = transport.llm().complete(model, Conversation.builder().system(SYSTEM).user(user).build(), options.build()).text();
        JsonNode parsed = parse(reply);
        if (parsed == null) return new Assessed(null, null, "the reviewer's reply was not a verdict: " + cutLine(reply, 200));
        return verdict(request, parsed, "studio:review-pass(" + ref.text() + ")", partial);
    }

    /**
     * B1: the reviewer's answer as the core's verdict. `approve` approves — unless the reviewer saw only part of the
     * change; `revise` with a blocker or major finding that names a place and an issue rejects; `revise` with minor
     * findings only approves, the findings becoming notes; anything else cannot be verified (`InsufficientEvidence`).
     */
    static Assessed verdict(JsonNode request, JsonNode parsed, String signedBy, boolean partial) {
        String answer = Json.text(parsed, "verdict", "").toLowerCase(Locale.ROOT).replace('-', '_').strip();
        String summary = Json.text(parsed, "summary", "");
        List<ObjectNode> substantive = new ArrayList<>();
        List<ObjectNode> minor = new ArrayList<>();
        boolean unplaced = false;
        for (JsonNode f : Json.each(parsed.get("findings"))) {
            String issue = Json.text(f, "issue", "").strip();
            String location = Json.text(f, "location", "").strip();
            String severity = Json.text(f, "severity", "").toLowerCase(Locale.ROOT).strip();
            if (issue.isEmpty()) continue;
            ObjectNode finding = Json.obj();
            finding.put("severity", switch (severity) {
                case "blocker" -> "Blocker";
                case "major" -> "Major";
                default -> "Minor";
            });
            finding.put("location", location.isEmpty() ? "change" : location);
            finding.put("issue", issue);
            finding.put("kind", "Correctness");
            boolean serious = severity.equals("blocker") || severity.equals("major");
            if (serious && !location.isEmpty()) substantive.add(finding);
            else if (serious) unplaced = true;
            else minor.add(finding);
        }
        ObjectNode verdict = Json.obj();
        verdict.put("requestId", Json.text(request, "id"));
        verdict.put("contractRevision", request.path("contractRevision").asInt());
        verdict.set("reviewedCandidate", request.get("candidate"));
        verdict.put("confidence", 0.7);
        verdict.put("signedBy", signedBy);
        // D-397: the review pass is a model; its approval is agent evidence, never independent verification.
        verdict.put("reviewer", "model");
        ArrayNode findings = verdict.putArray("findings");
        String missing = null;
        switch (answer) {
            case "approve" -> {
                verdict.put("outcome", partial ? "InsufficientEvidence" : "Approve");
                if (partial) missing = PARTIAL;
            }
            case "revise" -> {
                if (!substantive.isEmpty()) {
                    verdict.put("outcome", "Revise");
                    substantive.forEach(findings::add);
                    minor.forEach(findings::add);
                } else if (!minor.isEmpty() && !unplaced) {
                    // Minor findings only: approved, the findings are notes for the user.
                    verdict.put("outcome", partial ? "InsufficientEvidence" : "Approve");
                    if (partial) missing = PARTIAL;
                } else {
                    verdict.put("outcome", "InsufficientEvidence");
                    missing = "the reviewer asked for changes without naming a defect in the change: " + (summary.isBlank() ? "no reason given" : summary);
                }
            }
            default -> {
                if (!substantive.isEmpty()) {
                    // A concrete defect it located in the shown change stays a rejection, whatever else it could not see.
                    verdict.put("outcome", "Revise");
                    substantive.forEach(findings::add);
                    minor.forEach(findings::add);
                } else {
                    verdict.put("outcome", "InsufficientEvidence");
                    String said = Json.text(parsed, "missing", "").strip();
                    missing = !said.isEmpty() ? said : !summary.isBlank() ? summary : "the reviewer could not verify the change";
                }
            }
        }
        if (missing != null) verdict.put("missingCriterion", missing);
        ObjectNode notes = Json.obj().put("summary", summary);
        if (!minor.isEmpty() && !"Revise".equals(Json.text(verdict, "outcome"))) {
            ArrayNode n = notes.putArray("notes");
            minor.forEach(n::add);
        }
        return new Assessed(verdict, notes, null);
    }

    /** B6: the cause of a missing verdict — class, error code, HTTP status, message. */
    static String failure(Throwable e) {
        Throwable t = e;
        while ((t instanceof java.util.concurrent.CompletionException || t instanceof java.util.concurrent.ExecutionException) && t.getCause() != null) t = t.getCause();
        StringBuilder out = new StringBuilder(t.getClass().getSimpleName());
        if (t instanceof LlmException x) {
            out.append(" · ").append(x.code());
            x.httpStatus().ifPresent(s -> out.append(" · http ").append(s));
            x.providerCode().ifPresent(c -> out.append(" · ").append(c));
        }
        if (t.getMessage() != null) out.append(": ").append(cutLine(t.getMessage(), 300));
        return out.toString();
    }

    private static String cut(String diff) {
        return diff.length() > MAX_DIFF_CHARS ? diff.substring(0, MAX_DIFF_CHARS) + "\n… cut at " + MAX_DIFF_CHARS + " characters" : diff;
    }

    private static String cutLine(String text, int max) {
        String one = text == null ? "" : text.strip().replaceAll("\\s+", " ");
        return one.length() > max ? one.substring(0, max) + "…" : one;
    }

    /**
     * What the runs of the same task changed before this run: a run that was retried or continued finds their work
     * in the project and may have nothing left to change.
     */
    private String earlier(String projectId, String workId) {
        try {
            List<String> works = jdbc.queryForList(
                "SELECT work_id FROM campaign_index WHERE task_id = (SELECT coalesce(task_id, work_id) FROM campaign_index WHERE work_id = ?) ORDER BY created_at, rowid",
                String.class, workId);
            int at = works.indexOf(workId);
            if (at <= 0) return "";
            return changes.taskDiff(projectId, works.subList(0, at), null, false).path("diff").asString("");
        } catch (RuntimeException e) {
            log.debug("earlier changes of the task of {} not read: {}", workId, e.toString());
            return "";
        }
    }

    /**
     * What the user decided while the task worked, oldest first: the answers to the agent's questions and the
     * actions allowed or denied. Without them a reviewer takes a choice of the user for a liberty of the agent.
     */
    private String said(String workId) {
        StringBuilder out = new StringBuilder();
        List<JsonNode> all = new java.util.ArrayList<>();
        decisions.list("resolved", workId, 200).forEach(all::add);
        for (JsonNode d : all.reversed()) {
            JsonNode reply = d.path("reply");
            ObjectNode card = DecisionService.cardOf(d);
            switch (Json.text(card, "kind", "")) {
                case "question" -> {
                    String answer = Json.text(reply, "text");
                    if (answer == null || answer.isBlank()) continue;
                    out.append("- The agent asked: ").append(Json.text(card, "text", "").strip()).append("\n  The user answered: ").append(answer.strip()).append('\n');
                }
                case "approval" -> {
                    if (!reply.has("approved")) continue;
                    out.append("- The user ").append(reply.path("approved").asBoolean() ? "allowed" : "did not allow").append(" this command: ")
                        .append(Json.text(card, "command", "")).append('\n');
                }
                default -> { }
            }
        }
        return out.toString();
    }

    /**
     * The change the reviewer sees: the diff the core published for this review (state before the task to the
     * candidate under review), else the diff of the recorded snapshots.
     */
    private String evidence(String projectId, String workId, JsonNode request) {
        String ref = Json.text(request, "diffRef");
        if (ref != null && ref.matches("[0-9a-f]{64}")) {
            try {
                JsonNode meta = Json.parse(hosts.host().blobMeta(projectId, ref));
                if ("DIFF".equals(Json.text(meta, "kind")) && !meta.path("recovery").asBoolean(false)) {
                    return new String(hosts.host().blobBytes(projectId, ref), java.nio.charset.StandardCharsets.UTF_8);
                }
            } catch (RuntimeException e) {
                log.debug("review evidence {} of {} not read: {}", ref, workId, e.toString());
            }
        }
        return changes.diff(projectId, workId, null, null, null, true).path("diff").asString("");
    }

    /** The first JSON object in [text]; models sometimes wrap it in a code fence or a sentence. */
    static JsonNode parse(String text) {
        if (text == null) return null;
        int from = text.indexOf('{');
        int to = text.lastIndexOf('}');
        if (from < 0 || to <= from) return null;
        try {
            JsonNode node = Json.parse(text.substring(from, to + 1));
            return node.isObject() && node.has("verdict") ? node : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    @Override
    public void destroy() { executor.shutdownNow(); }
}
