package io.astrolabe.studio.tasks;

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
import net.ai.gate.model.Model;

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
 * The review pass (Studio 2 §7.3 order 4, finding F-5). A task without tests is accepted through a `check:` item,
 * which the core lets only the host assess. The host asks the model a second time, as a reviewer that sees the
 * request and the change but not the conversation, and signs the verdict. No verdict means the task stays
 * unaccepted: a review is never skipped.
 */
@Service
public class ReviewPass implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(ReviewPass.class);
    private static final int MAX_DIFF_CHARS = 60_000;

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
            JsonNode verdict = null;
            try {
                verdict = assess(workId, request);
            } catch (RuntimeException e) {
                log.warn("review pass for {} gave no verdict: {}", workId, e.toString());
            }
            decisions.recordReview(workId, request, verdict);
            return verdict == null ? null : Json.write(verdict);
        }, executor);
    }

    private JsonNode assess(String workId, JsonNode request) {
        List<java.util.Map<String, Object>> rows = jdbc.queryForList("SELECT project_id, model_ref, request_text FROM campaign_index WHERE work_id = ?", workId);
        if (rows.isEmpty()) return null;
        String projectId = (String) rows.getFirst().get("project_id");
        ModelService.Ref ref = ModelService.Ref.parse((String) rows.getFirst().get("model_ref"));
        String asked = (String) rows.getFirst().get("request_text");
        if (ref == null || asked == null) return null;
        String diff = cut(evidence(projectId, workId, request));
        if (diff.isBlank()) diff = "(no file was changed)";
        String before = cut(earlier(projectId, workId));
        StringBuilder criteria = new StringBuilder();
        for (JsonNode c : Json.each(request.get("criteria"))) criteria.append("- ").append(c.asString()).append('\n');
        for (JsonNode c : Json.each(request.get("rubric"))) criteria.append("- ").append(c.asString()).append('\n');

        String system = Verification.REVIEW_MARKER + "\n"
            + "You are an independent reviewer of a code change. You did not write it and you do not see the conversation that produced it.\n"
            + "What the user answered or allowed during the task is part of the request.\n"
            + "A task may take several runs. Judge the project as it is after this run: what an earlier run of the same task changed counts.\n"
            + "Decide whether the change fulfils the request. Approve only when it does what was asked and you see no defect that would break it.\n"
            + "Reply with one JSON object and nothing else:\n"
            + "{\"verdict\":\"approve\"|\"revise\",\"confidence\":0.0-1.0,\"summary\":\"one sentence\","
            + "\"findings\":[{\"severity\":\"blocker\"|\"major\"|\"minor\",\"location\":\"path:line\",\"issue\":\"what is wrong\"}]}";
        String said = said(workId);
        String user = "Request:\n" + asked.strip() + "\n\n" + (said.isEmpty() ? "" : "During the task:\n" + said + "\n")
            + "Criteria:\n" + (criteria.isEmpty() ? "- " + Verification.REVIEW_TEXT + "\n" : criteria)
            + (before.isBlank() ? "" : "\nChanges of earlier runs of this task, already in the project (unified diff):\n" + before + "\n")
            + "\nChange of this run (unified diff):\n" + diff;

        Model model = transport.llm().models().require(ref.provider(), ref.model());
        String reply = transport.llm().complete(model, Conversation.builder().system(system).user(user).build()).text();
        JsonNode parsed = parse(reply);
        if (parsed == null) {
            log.warn("review pass for {}: the reply was not a verdict", workId);
            return null;
        }
        boolean approve = "approve".equalsIgnoreCase(Json.text(parsed, "verdict", ""));
        ObjectNode verdict = Json.obj();
        verdict.put("requestId", Json.text(request, "id"));
        verdict.put("contractRevision", request.path("contractRevision").asInt());
        verdict.set("reviewedCandidate", request.get("candidate"));
        verdict.put("outcome", approve ? "Approve" : "Revise");
        ArrayNode findings = verdict.putArray("findings");
        if (!approve) {
            for (JsonNode f : Json.each(parsed.get("findings"))) {
                String issue = Json.text(f, "issue");
                if (issue == null || issue.isBlank()) continue;
                ObjectNode finding = findings.addObject();
                finding.put("severity", switch (Json.text(f, "severity", "major").toLowerCase(Locale.ROOT)) {
                    case "blocker" -> "Blocker";
                    case "minor" -> "Minor";
                    default -> "Major";
                });
                finding.put("location", Json.text(f, "location", "change"));
                finding.put("issue", issue);
                finding.put("kind", "Correctness");
            }
            if (findings.isEmpty()) {
                ObjectNode finding = findings.addObject();
                finding.put("severity", "Major");
                finding.put("location", "change");
                finding.put("issue", Json.text(parsed, "summary", "the reviewer did not approve the change"));
                finding.put("kind", "Correctness");
            }
        }
        double confidence = parsed.path("confidence").asDouble(0.7);
        verdict.put("confidence", Math.max(0, Math.min(1, confidence)));
        verdict.put("signedBy", "studio:review-pass(" + ref.text() + ")");
        verdict.put("summary", Json.text(parsed, "summary", ""));
        // `summary` is for the task's timeline; the core's Verdict has no such field.
        ObjectNode forCore = verdict.deepCopy();
        forCore.remove("summary");
        return forCore;
    }

    private static String cut(String diff) {
        return diff.length() > MAX_DIFF_CHARS ? diff.substring(0, MAX_DIFF_CHARS) + "\n… cut at " + MAX_DIFF_CHARS + " characters" : diff;
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
