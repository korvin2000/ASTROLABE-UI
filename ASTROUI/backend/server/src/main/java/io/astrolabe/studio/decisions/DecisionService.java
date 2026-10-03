package io.astrolabe.studio.decisions;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;

import io.astrolabe.studio.bridge.AuthorityPort;
import io.astrolabe.studio.bridge.PolicyListener;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * "Needs you" (§13, §25.8): every authority call becomes a typed decision row bound to its contract revision and a
 * harness-owned future held in memory. A reply is single-use (atomic claim) and revision-checked (`Replies.check`
 * semantics) before it completes the future; after a backend restart old futures are gone and rows expire (§13.9).
 */
@Service
public class DecisionService implements AuthorityPort, PolicyListener {
    private static final Logger log = LoggerFactory.getLogger(DecisionService.class);

    private final JdbcTemplate jdbc;
    private final TopicBroker broker;
    private final HostService hosts;
    private final Map<String, Pending> pending = new ConcurrentHashMap<>();
    private volatile BiConsumer<String, ObjectNode> campaignItems = (w, i) -> { };
    private volatile java.util.function.Consumer<String> waitingChanged = w -> { };
    private volatile java.util.function.Function<String, String> projectOf = w -> null;
    private volatile java.util.function.Function<String, HostPolicy> policyOf = w -> null;
    private volatile Reviewer reviewer = (w, r) -> CompletableFuture.completedFuture(null);

    /**
     * How the host answers for a task (Studio 2 §7.5, BE-14): in `ask` mode the user decides, except what the project
     * always allows; in `auto` mode nothing interrupts. Null for runs that were not started as tasks.
     */
    public record HostPolicy(String mode, List<String> allowed) {
        public boolean auto() { return "auto".equals(mode); }

        /** A command is allowed when it is a listed pattern or starts with one followed by a space. */
        public boolean allows(String command) {
            if (command == null) return false;
            String c = command.strip();
            for (String pattern : allowed) {
                String p = pattern.strip();
                if (!p.isEmpty() && (c.equals(p) || c.startsWith(p + " "))) return true;
            }
            return false;
        }
    }

    /** The review pass of the host for a `check:` item (finding F-5): a verdict JSON, or null when none can be given. */
    @FunctionalInterface
    public interface Reviewer {
        CompletableFuture<String> review(String workId, JsonNode request);
    }

    public static final String ASSUME = "Use the most reasonable assumption and list your assumptions in the summary.";

    public void policy(java.util.function.Function<String, HostPolicy> policyOf, Reviewer reviewer) {
        this.policyOf = policyOf;
        this.reviewer = reviewer;
    }

    private record Pending(String id, String kind, String workId, CompletableFuture<String> future) { }

    public DecisionService(JdbcTemplate jdbc, TopicBroker broker, HostService hosts) {
        this.jdbc = jdbc;
        this.broker = broker;
        this.hosts = hosts;
        int expired = jdbc.update("UPDATE decision SET status = 'expired', reason = 'campaign interrupted: the backend restarted', answered_at = ? WHERE status = 'pending'", Json.now());
        if (expired > 0) log.info("{} pending decision(s) from the previous run expired (§13.9)", expired);
    }

    /** Called with the run whose waiting decisions changed: a task that waits for the user says so at once. */
    public void onWaitingChanged(java.util.function.Consumer<String> listener) { this.waitingChanged = listener; }

    /** Wiring from the live pipeline: places decision items in the campaign stream; resolves a work's project. */
    public void wire(BiConsumer<String, ObjectNode> campaignItems, java.util.function.Function<String, String> projectOf) {
        this.campaignItems = campaignItems;
        this.projectOf = projectOf;
    }

    // ------------------------------------------------------------------------------------------------ AuthorityPort

    @Override
    public CompletableFuture<String> ask(String workId, String questionJson) {
        HostPolicy policy = policyOf.apply(workId);
        if (policy != null && policy.auto()) {
            JsonNode q = Json.parse(questionJson);
            ObjectNode answer = Json.obj();
            answer.put("questionId", Json.text(q, "id"));
            answer.put("contractRevision", q.path("contractRevision").asInt());
            answer.put("text", ASSUME);
            answer.putNull("chosenOption");
            answer.put("changesRequirements", false);
            return byPolicy("question", workId, questionJson, answer, "answered");
        }
        return raise("question", workId, questionJson);
    }

    @Override
    public CompletableFuture<String> approve(String workId, String requestJson) {
        JsonNode request = Json.parse(requestJson);
        String action = Json.text(request, "action", "");
        String kind = action.startsWith("publish.") ? "publication" : "effect";
        HostPolicy policy = policyOf.apply(workId);
        if (policy != null && kind.equals("effect")) {
            boolean allowed = request.path("contractAllowlisted").asBoolean(false) || policy.allows(commandOf(request));
            if (allowed || policy.auto()) {
                ObjectNode decision = Json.obj();
                decision.put("requestId", Json.text(request, "id"));
                decision.put("contractRevision", request.path("contractRevision").asInt());
                decision.put("approved", allowed);
                decision.put("reason", allowed ? "always allowed in this project" : "auto mode: this action needs your approval");
                return byPolicy(kind, workId, requestJson, decision, allowed ? "allowed" : "skipped");
            }
        }
        return raise(kind, workId, requestJson);
    }

    /** The command of an approval request as the allow list names it: its argv joined by spaces. */
    public static String commandOf(JsonNode request) {
        JsonNode argv = request.get("argv");
        if (argv != null && argv.isArray() && !argv.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (JsonNode a : argv) sb.append(sb.isEmpty() ? "" : " ").append(a.asString());
            return sb.toString();
        }
        return Json.text(request, "action", "");
    }

    @Override
    public CompletableFuture<String> resolve(String workId, String proposalJson) {
        JsonNode proposal = Json.parse(proposalJson);
        String reason = Json.text(proposal, "reason", "").toLowerCase();
        // G-21: only the reason text distinguishes the kinds; the conservative default is a contract amendment.
        String kind = reason.startsWith("plan proposal") ? "plan_acceptance" : reason.equals("knowledge admission") ? "kb_admission" : "amendment";
        HostPolicy policy = policyOf.apply(workId);
        if (policy != null) {
            boolean weakening = proposal.path("weakening").asBoolean(false);
            // A check the agent adds to its own plan only strengthens the task; knowledge stays queued. Neither is a card.
            String outcome = kind.equals("kb_admission") ? "Pending"
                : kind.equals("plan_acceptance") ? (weakening ? "Rejected" : "Accepted")
                : policy.auto() ? (weakening ? "Rejected" : "Accepted")
                : null;
            if (outcome != null) {
                ObjectNode resolution = Json.obj();
                resolution.put("proposalId", Json.text(proposal, "id"));
                resolution.put("contractRevision", proposal.path("contractRevision").asInt());
                resolution.put("outcome", outcome);
                resolution.put("byAuthority", "policy:studio");
                resolution.put("reason", weakening ? "a change that makes the task easier to pass needs the user" : "host policy");
                return byPolicy(kind, workId, proposalJson, resolution, outcome.toLowerCase());
            }
        }
        return raise(kind, workId, proposalJson);
    }

    /**
     * The host's review. A request that says `humanOnly` (C11, D-404: a test-integrity change under
     * `IntegrityApproval.Human`) is the user's card in both modes; the review pass may run first, and its verdict is
     * attached to the card as the person's information (`modelVerdict`) — it never answers the request.
     */
    @Override
    public CompletableFuture<String> review(String workId, String requestJson) {
        JsonNode request = Json.parse(requestJson);
        if (request.path("humanOnly").asBoolean(false)) {
            if (policyOf.apply(workId) == null) return raise("review", workId, requestJson);
            CompletableFuture<String> pass;
            try {
                pass = reviewer.review(workId, request);
            } catch (RuntimeException e) {
                pass = CompletableFuture.failedFuture(e);
            }
            return pass.handle((verdict, e) -> {
                if (e != null) log.warn("review pass for {} (information for a person's review) failed: {}", workId, e.toString());
                return e == null ? verdict : null;
            }).thenCompose(verdict -> raise("review", workId, withModelVerdict(request, verdict)));
        }
        if (policyOf.apply(workId) != null) {
            return reviewer.review(workId, Json.parse(requestJson)).exceptionally(e -> {
                log.warn("review pass for {} failed: {}", workId, e.toString());
                return null;
            });
        }
        return raise("review", workId, requestJson);
    }

    /**
     * The acceptance decision (D-338, phase 0 B2): what to do with a result the core could not verify, or with a change
     * a review rejected after its rework round. A decision the user already made for this very request (a card answered
     * before the run resumed) is returned as the user's. Otherwise, in `auto` mode, unverified work is accepted on the
     * policy's word with its reasons as the label — a rejection by review never is; in `ask` mode, and for a rejection,
     * there is no decision now: the request is kept as an open card and the run stops waiting for the user.
     */
    @Override
    public CompletableFuture<String> decide(String workId, String requestJson) {
        JsonNode request = Json.parse(requestJson);
        String requestId = Json.text(request, "id");
        ObjectNode stored = storedDecision(request);
        if (stored != null) {
            record("acceptance", workId, requestJson, "answered", stored, Json.text(stored, "by"), Json.text(stored, "kind").toLowerCase(Locale.ROOT));
            return CompletableFuture.completedFuture(Json.write(stored));
        }
        HostPolicy policy = policyOf.apply(workId);
        boolean rejected = false;
        boolean person = INTEGRITY_REVIEW.equals(Json.text(request, "code"));
        StringBuilder why = new StringBuilder();
        for (JsonNode item : Json.each(request.get("items"))) {
            if ("Failed".equals(Json.text(item, "status"))) rejected = true;
            if (item.path("humanOnly").asBoolean(false)) person = true;
            why.append(why.isEmpty() ? "" : "; ").append(Json.text(item, "reason", Json.text(item, "obligation", "")));
        }
        // C11 (D-404): a test change only a person may approve is never accepted on the policy's word, in `auto` too.
        if (policy != null && policy.auto() && !rejected && !person) {
            ObjectNode decision = decision(request, "Accept", "Policy", "studio:policy(auto)", "not verified: " + why);
            return byPolicy("acceptance", workId, requestJson, decision, "accepted");
        }
        if (person) {
            JsonNode model = modelVerdictFor(workId, request.get("candidate"));
            if (model != null) requestJson = withModelVerdict(request, Json.write(model));
        }
        // Earlier open requests of this run are replaced by the newest one: one card at a time.
        jdbc.update("UPDATE decision SET status = 'superseded', answered_at = ? WHERE work_id = ? AND kind = 'acceptance' AND status = 'open'", Json.now(), workId);
        String id = "a-" + requestId;
        jdbc.update("INSERT OR REPLACE INTO decision (id, kind, project_id, work_id, cell_id, contract_revision, request_json, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            id, "acceptance", projectOf.apply(workId), workId, request.has("ids") ? Json.text(request.get("ids"), "context") : null,
            request.path("contractRevision").asInt(), requestJson, "open", Json.now());
        campaignItems.accept(workId, studioItem("studio.decision_requested", get(id)));
        waitingChanged.accept(workId);
        return CompletableFuture.completedFuture(null);
    }

    /** The open acceptance request of [workId], shown as a card while its run waits (B3); null when there is none. */
    public ObjectNode openAcceptance(String workId) {
        List<ObjectNode> rows = jdbc.query("SELECT * FROM decision WHERE work_id = ? AND kind = 'acceptance' AND status = 'open' ORDER BY created_at DESC LIMIT 1", (rs, i) -> row(rs), workId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    /**
     * Stores the user's answer to an acceptance card (B3): `accept` or `rework` with [text], bound to the request, its
     * candidate and contract revision. A second answer to the same card changes nothing: false.
     */
    public boolean answerAcceptance(ObjectNode card, String kind, String text, String actor) {
        JsonNode request = card.get("request");
        String requestId = Json.text(request, "id");
        String candidate = Json.write(request.get("candidate"));
        int claimed = jdbc.update("INSERT OR IGNORE INTO acceptance_decision (request_id, work_id, candidate, contract_revision, kind, text, by_authority, created_at) VALUES (?,?,?,?,?,?,?,?)",
            requestId, Json.text(card, "workId"), candidate, request.path("contractRevision").asInt(), kind, text, "user:" + actor, Json.now());
        if (claimed == 0) return false;
        jdbc.update("UPDATE decision SET status = 'answered', reply_json = ?, by_authority = ?, reason = ?, answered_at = ? WHERE id = ? AND status = 'open'",
            Json.write(Json.obj().put("kind", kind).put("text", text)), "user:" + actor, kind, Json.now(), Json.text(card, "id"));
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), actor, "acceptance." + kind, requestId, text);
        ObjectNode dto = get(Json.text(card, "id"));
        broker.publishApp("decision.resolved", dto);
        campaignItems.accept(Json.text(card, "workId"), studioItem("studio.decision_resolved", dto));
        return true;
    }

    /** Closes the open acceptance card of a run that no longer waits for it (it went on, or ended otherwise). */
    public void closeAcceptance(String workId, String reason) {
        jdbc.update("UPDATE decision SET status = 'closed', reason = ?, answered_at = ? WHERE work_id = ? AND kind = 'acceptance' AND status = 'open'", reason, Json.now(), workId);
    }

    /** The core's stop code of a campaign waiting for a person's review of a test change (C11, `StopCode.IntegrityReview`). */
    public static final String INTEGRITY_REVIEW = "integrity_review";

    /** [request] with the review pass's verdict JSON attached as `modelVerdict` (a person's information, C11); as is without one. */
    private static String withModelVerdict(JsonNode request, String verdictJson) {
        if (verdictJson == null || !(request instanceof ObjectNode o)) return Json.write(request);
        ObjectNode copy = o.deepCopy();
        copy.set("modelVerdict", Json.parse(verdictJson));
        return Json.write(copy);
    }

    /** The review pass's verdict on [candidate] attached to a person's review card of [workId]; null when none. */
    private JsonNode modelVerdictFor(String workId, JsonNode candidate) {
        if (candidate == null) return null;
        for (String json : jdbc.queryForList("SELECT request_json FROM decision WHERE work_id = ? AND kind = 'review' AND status <> 'policy' ORDER BY created_at DESC LIMIT 5", String.class, workId)) {
            JsonNode r = Json.parse(json);
            if (r.hasNonNull("modelVerdict") && candidate.equals(r.get("candidate"))) return r.get("modelVerdict");
        }
        return null;
    }

    /**
     * The person's verdict on a test change (C11): `Approve`, or `Reject` with one finding at the changed path in the
     * user's words — a substantive rejection, so the agent reworks it. `buildReply` binds it and marks it a person's.
     */
    public static ObjectNode personVerdict(JsonNode request, boolean approve, String text) {
        ObjectNode v = Json.obj();
        v.put("outcome", approve ? "Approve" : "Reject");
        ArrayNode findings = v.putArray("findings");
        if (!approve) {
            List<String> paths = integrityPaths(request);
            findings.addObject()
                .put("severity", "Major")
                .put("location", paths.isEmpty() ? "test-integrity" : paths.getFirst())
                .put("issue", text != null && !text.isBlank() ? text.strip() : "the user did not approve this change to the tests; keep the required checks as they were")
                .put("kind", "TestIntegrity");
        }
        v.put("confidence", 1.0);
        return v;
    }

    private static final java.util.regex.Pattern FLAG_LINE =
        java.util.regex.Pattern.compile("^acceptance surface: (.+?) \\((test file|check definition|CI config|acceptance command input)\\) modified by (.*)$");
    private static final java.util.regex.Pattern TOUCHES = java.util.regex.Pattern.compile("^integrity:.+?: acceptance surface .+? touches (.*?) — ");

    /**
     * The test changes a person's review is about (C11), each `{path, checks, reason?}`: from the flag lines of the
     * criteria (`acceptance surface: <path> (<surface>) modified by … · required: … · reason: …`) or, without them, the
     * paths of the original obligations (`<path>: <text>`). The core sends no such fields of its own.
     */
    static ArrayNode integrityItems(JsonNode request) {
        ArrayNode out = Json.arr();
        java.util.Set<String> seen = new java.util.LinkedHashSet<>();
        for (JsonNode c : Json.each(request.get("criteria"))) {
            java.util.regex.Matcher m = FLAG_LINE.matcher(c.asString());
            if (!m.matches() || !seen.add(m.group(1))) continue;
            ObjectNode i = out.addObject();
            i.put("path", m.group(1));
            ArrayNode checks = i.putArray("checks");
            for (String part : m.group(3).split(" · ")) {
                if (part.startsWith("required: ")) for (String id : part.substring("required: ".length()).split(", ")) if (!id.isBlank()) checks.add(id.strip());
                if (part.startsWith("reason: ")) i.put("reason", part.substring("reason: ".length()));
            }
        }
        if (!out.isEmpty()) return out;
        for (JsonNode o : Json.each(request.get("originalObligations"))) {
            String line = o.asString();
            if (line.startsWith("original ")) line = line.substring("original ".length());
            int colon = line.indexOf(": ");
            if (colon <= 0) continue;
            String path = line.substring(0, colon);
            // An acceptance definition reads `AC-1 (origin, v2): …`, never a path.
            if (path.contains(" (") || !seen.add(path)) continue;
            out.addObject().put("path", path).putArray("checks");
        }
        return out;
    }

    private static List<String> integrityPaths(JsonNode request) {
        List<String> paths = new java.util.ArrayList<>();
        for (JsonNode i : integrityItems(request)) paths.add(Json.text(i, "path"));
        for (JsonNode i : Json.each(request.get("items"))) {
            String obligation = Json.text(i, "obligation", "");
            if (obligation.startsWith("integrity:")) paths.add(obligation.substring("integrity:".length()));
        }
        return paths;
    }

    /** The model's verdict attached to a person's card: outcome, summary and findings; null when none is attached. */
    private static ObjectNode modelOf(JsonNode request) {
        JsonNode v = request.get("modelVerdict");
        if (v == null || !v.isObject()) return null;
        ObjectNode m = Json.obj();
        m.put("outcome", Json.text(v, "outcome", "").toLowerCase(Locale.ROOT));
        String summary = Json.text(v, "summary");
        if (summary != null && !summary.isBlank()) m.put("summary", summary);
        m.set("findings", findingsOf(v.get("findings")));
        return m;
    }

    private static ArrayNode findingsOf(JsonNode findings) {
        ArrayNode a = Json.arr();
        for (JsonNode f : Json.each(findings)) {
            a.addObject().put("severity", Json.text(f, "severity", "").toLowerCase(Locale.ROOT)).put("location", Json.text(f, "location", "")).put("issue", Json.text(f, "issue", ""));
        }
        return a;
    }

    /** The user's stored answer to exactly this request, as the core's `AcceptanceDecision`; null when none. */
    private ObjectNode storedDecision(JsonNode request) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT kind, text, by_authority, contract_revision FROM acceptance_decision WHERE request_id = ?", Json.text(request, "id"));
        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.getFirst();
        if (((Number) row.get("contract_revision")).intValue() != request.path("contractRevision").asInt()) return null;
        boolean accept = "accept".equals(row.get("kind"));
        String text = (String) row.get("text");
        String reason = text != null && !text.isBlank() ? text : accept ? "accepted by the user" : "the user asked to rework it";
        return decision(request, accept ? "Accept" : "Rework", "User", (String) row.get("by_authority"), reason);
    }

    private static ObjectNode decision(JsonNode request, String kind, String decider, String by, String reason) {
        ObjectNode d = Json.obj();
        d.put("requestId", Json.text(request, "id"));
        d.put("contractRevision", request.path("contractRevision").asInt());
        d.set("candidate", request.get("candidate"));
        d.put("kind", kind);
        d.put("decider", decider);
        d.put("by", by);
        d.put("reason", reason);
        return d;
    }

    /** A row of the host's own answer (a stored user decision replayed to the core): a policy line of the task. */
    private void record(String kind, String workId, String requestJson, String status, ObjectNode reply, String by, String verdict) {
        String id = "p-" + UUID.randomUUID().toString().substring(0, 8);
        JsonNode request = Json.parse(requestJson);
        jdbc.update("INSERT INTO decision (id, kind, project_id, work_id, cell_id, contract_revision, request_json, status, reply_json, by_authority, reason, created_at, answered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            id, kind, projectOf.apply(workId), workId, request.has("ids") ? Json.text(request.get("ids"), "context") : null, request.path("contractRevision").asInt(),
            requestJson, "policy", Json.write(reply), by, verdict, Json.now(), Json.now());
        campaignItems.accept(workId, studioItem("studio.policy_decision", get(id)));
    }

    /** A reply the host policy gave: recorded like a decision and shown in the task as a policy line. */
    private CompletableFuture<String> byPolicy(String kind, String workId, String requestJson, ObjectNode reply, String verdict) {
        String id = "p-" + UUID.randomUUID().toString().substring(0, 8);
        JsonNode request = Json.parse(requestJson);
        Integer revision = request.hasNonNull("contractRevision") ? request.get("contractRevision").asInt() : null;
        String cell = request.has("ids") ? Json.text(request.get("ids"), "context") : null;
        jdbc.update("INSERT INTO decision (id, kind, project_id, work_id, cell_id, contract_revision, request_json, status, reply_json, by_authority, reason, created_at, answered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            id, kind, projectOf.apply(workId), workId, cell, revision, requestJson, "policy", Json.write(reply), "policy:studio", verdict, Json.now(), Json.now());
        ObjectNode dto = get(id);
        campaignItems.accept(workId, studioItem("studio.policy_decision", dto));
        return CompletableFuture.completedFuture(Json.write(reply));
    }

    /** Actions the policy skipped in auto mode because they needed the user (§7.5 "Skipped, needed your approval"). */
    public ArrayNode skipped(String workId) {
        ArrayNode a = Json.arr();
        jdbc.query("SELECT * FROM decision WHERE work_id = ? AND status = 'policy' AND reason = 'skipped' ORDER BY created_at", rs -> { a.add(row(rs)); }, workId);
        return a;
    }

    /**
     * Records the review pass of the host as a policy line of the task: the verdict with the reviewer's summary and
     * notes, or — without a verdict — why none came (B6), so the task and the diagnostics export show the cause.
     */
    public void recordReview(String workId, JsonNode request, JsonNode verdict, JsonNode notes, String failure) {
        String id = "p-" + UUID.randomUUID().toString().substring(0, 8);
        String outcome = verdict == null ? "unavailable" : Json.text(verdict, "outcome", "unavailable").toLowerCase();
        ObjectNode reply = verdict == null ? null : ((ObjectNode) verdict).deepCopy();
        if (reply != null && notes != null) reply.setAll((ObjectNode) notes);
        jdbc.update("INSERT INTO decision (id, kind, project_id, work_id, cell_id, contract_revision, request_json, status, reply_json, by_authority, reason, created_at, answered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            id, "review", projectOf.apply(workId), workId, null, request.path("contractRevision").asInt(), Json.write(request), "policy",
            reply == null ? null : Json.write(reply), "policy:studio", failure == null ? outcome : outcome + ": " + failure, Json.now(), Json.now());
        campaignItems.accept(workId, studioItem("studio.policy_decision", get(id)));
    }

    private CompletableFuture<String> raise(String kind, String workId, String requestJson) {
        JsonNode request = Json.parse(requestJson);
        String id = "d-" + UUID.randomUUID().toString().substring(0, 8);
        Integer revision = request.hasNonNull("contractRevision") ? request.get("contractRevision").asInt() : null;
        String cell = request.has("ids") ? Json.text(request.get("ids"), "context") : null;
        String projectId = projectOf.apply(workId);
        Instant lease = hosts.host().leaseExpiry(workId);
        jdbc.update("INSERT INTO decision (id, kind, project_id, work_id, cell_id, contract_revision, request_json, status, created_at, lease_expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            id, kind, projectId, workId, cell, revision, requestJson, "pending", Json.now(), lease == null ? null : lease.toString());
        CompletableFuture<String> future = new CompletableFuture<>();
        pending.put(id, new Pending(id, kind, workId, future));
        ObjectNode dto = get(id);
        broker.publishApp("decision.requested", dto);
        campaignItems.accept(workId, studioItem("studio.decision_requested", dto));
        waitingChanged.accept(workId);
        log.info("decision {} ({}) raised for {}", id, kind, workId);
        return future;
    }

    @Override
    public void onPolicyDecision(String workId, String kind, String requestJson, String replyJson) {
        String id = "p-" + UUID.randomUUID().toString().substring(0, 8);
        JsonNode request = Json.parse(requestJson);
        Integer revision = request.hasNonNull("contractRevision") ? request.get("contractRevision").asInt() : null;
        String cell = request.has("ids") ? Json.text(request.get("ids"), "context") : null;
        jdbc.update("INSERT INTO decision (id, kind, project_id, work_id, cell_id, contract_revision, request_json, status, reply_json, by_authority, created_at, answered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            id, kind, projectOf.apply(workId), workId, cell, revision, requestJson, "policy", replyJson, "policy:autonomous", Json.now(), Json.now());
        ObjectNode dto = get(id);
        broker.publishApp("decision.resolved", dto);
        campaignItems.accept(workId, studioItem("studio.policy_decision", dto));
    }

    // ------------------------------------------------------------------------------------------------ replies

    /**
     * Completes a pending decision with the user's [reply] (the ASTROLABE reply JSON without ids and revision, which
     * this method fills in). R-DEC-01: a moved contract revision supersedes the card; R-DEC-02: first valid reply wins.
     */
    public ObjectNode reply(String decisionId, JsonNode reply, Integer expectedRevision, String actor) {
        ObjectNode row = get(decisionId);
        if (!"pending".equals(Json.text(row, "status"))) throw ApiException.conflict("conflict_revision", "decision " + decisionId + " is " + Json.text(row, "status"));
        Pending p = pending.get(decisionId);
        if (p == null) throw new ApiException("lease_fenced", 410, "the harness no longer waits for " + decisionId + " (backend restarted or campaign ended)");
        String workId = Json.text(row, "workId");
        Integer requestRevision = row.hasNonNull("contractRevision") ? row.get("contractRevision").asInt() : null;
        Integer current = hosts.host().contractRevision(Json.text(row, "projectId"), workId);
        if (expectedRevision != null && requestRevision != null && !expectedRevision.equals(requestRevision)) {
            throw ApiException.superseded(requestRevision, "the reply names contract v" + expectedRevision + " but the request is bound to v" + requestRevision);
        }
        if (requestRevision != null && current != null && !requestRevision.equals(current)) {
            markSuperseded(decisionId, current);
            throw ApiException.superseded(current, "contract moved to v" + current + " — this card was bound to v" + requestRevision);
        }
        JsonNode request = row.get("request");
        String kind = Json.text(row, "kind");
        ObjectNode payload = buildReply(kind, request, reply, actor);
        String status = switch (kind) {
            case "question" -> "answered";
            case "effect", "publication" -> payload.get("approved").asBoolean() ? "answered" : "declined";
            case "review" -> "answered";
            default -> "Rejected".equals(Json.text(payload, "outcome")) ? "declined" : "answered";
        };
        return complete(decisionId, p, status, payload, actor, Json.text(payload, "reason"));
    }

    /** Declines: `ask`/`review` complete with null (cell ends blocked), `approve` denies, `resolve` rejects (§25.8). */
    public ObjectNode decline(String decisionId, String reason, String actor) {
        ObjectNode row = get(decisionId);
        if (!"pending".equals(Json.text(row, "status"))) throw ApiException.conflict("conflict_revision", "decision " + decisionId + " is " + Json.text(row, "status"));
        Pending p = pending.get(decisionId);
        if (p == null) throw new ApiException("lease_fenced", 410, "the harness no longer waits for " + decisionId);
        String kind = Json.text(row, "kind");
        JsonNode request = row.get("request");
        ObjectNode payload = switch (kind) {
            case "question", "review" -> null;
            case "effect", "publication" -> {
                ObjectNode d = Json.obj();
                d.put("requestId", Json.text(request, "id"));
                d.put("contractRevision", request.get("contractRevision").asInt());
                d.put("approved", false);
                d.put("reason", reason == null || reason.isBlank() ? "declined by " + actor : reason);
                yield d;
            }
            default -> {
                ObjectNode r = Json.obj();
                r.put("proposalId", Json.text(request, "id"));
                r.put("contractRevision", request.get("contractRevision").asInt());
                r.put("outcome", "Rejected");
                r.put("byAuthority", "user:" + actor);
                if (reason != null && !reason.isBlank()) r.put("reason", reason);
                yield r;
            }
        };
        return complete(decisionId, p, "declined", payload, actor, reason);
    }

    ObjectNode buildReply(String kind, JsonNode request, JsonNode reply, String actor) {
        ObjectNode o = Json.obj();
        int revision = request.get("contractRevision").asInt();
        switch (kind) {
            case "question" -> {
                String text = Json.text(reply, "text");
                if (text == null || text.isBlank()) throw ApiException.invalid("an answer needs text");
                o.put("questionId", Json.text(request, "id"));
                o.put("contractRevision", revision);
                o.put("text", text);
                if (reply.hasNonNull("chosenOption")) o.put("chosenOption", reply.get("chosenOption").asInt()); else o.putNull("chosenOption");
                o.put("changesRequirements", Json.bool(reply, "changesRequirements", false));
            }
            case "effect", "publication" -> {
                o.put("requestId", Json.text(request, "id"));
                o.put("contractRevision", revision);
                o.put("approved", Json.bool(reply, "approved", false));
                String reason = Json.text(reply, "reason");
                if (reason != null && !reason.isBlank()) o.put("reason", reason); else o.putNull("reason");
            }
            case "review" -> {
                // A full ASTROLABE Verdict (§13.4); the Studio fills the binding fields and the signer.
                if (!(reply instanceof ObjectNode verdict)) throw ApiException.invalid("a review reply is a Verdict object");
                o.setAll(verdict);
                o.put("requestId", Json.text(request, "id"));
                o.put("contractRevision", revision);
                if (!o.hasNonNull("reviewedCandidate") && request.hasNonNull("candidate")) o.set("reviewedCandidate", request.get("candidate"));
                o.put("signedBy", "user:" + actor);
                // D-397/D-400: only a person's verdict is independent verification; the core reads a verdict without it as a model's.
                o.put("reviewer", "human");
            }
            default -> {
                String outcome = Json.text(reply, "outcome", "Accepted");
                if (!List.of("Accepted", "Rejected", "Pending").contains(outcome)) throw ApiException.invalid("outcome must be Accepted, Rejected or Pending");
                if ("Accepted".equals(outcome) && Json.bool(request, "weakening", false) && !Json.bool(reply, "confirmWeakening", false)) {
                    throw new ApiException("confirmation_required", 422, "accepting a weakening proposal needs an explicit typed confirmation (R-PLN-02)");
                }
                o.put("proposalId", Json.text(request, "id"));
                o.put("contractRevision", revision);
                o.put("outcome", outcome);
                o.put("byAuthority", "user:" + actor);
                String reason = Json.text(reply, "reason");
                if (reason != null && !reason.isBlank()) o.put("reason", reason); else o.putNull("reason");
            }
        }
        return o;
    }

    private ObjectNode complete(String decisionId, Pending p, String status, ObjectNode payload, String actor, String reason) {
        // Atomic claim: exactly one reply wins (R-DEC-02).
        int claimed = jdbc.update("UPDATE decision SET status = ?, reply_json = ?, by_authority = ?, reason = ?, answered_at = ? WHERE id = ? AND status = 'pending'",
            status, payload == null ? null : Json.write(payload), "user:" + actor, reason, Json.now(), decisionId);
        if (claimed == 0) throw ApiException.conflict("conflict_revision", "decision " + decisionId + " was already resolved");
        pending.remove(decisionId);
        jdbc.update("INSERT INTO audit (at, actor, action, target, details) VALUES (?,?,?,?,?)", Json.now(), actor, "decision." + status, decisionId, payload == null ? null : Json.write(payload));
        ObjectNode dto = get(decisionId);
        broker.publishApp("decision.resolved", dto);
        campaignItems.accept(p.workId(), studioItem("studio.decision_resolved", dto));
        waitingChanged.accept(p.workId());
        // Never complete the harness future on the bus dispatcher (R-BE-03): this runs on a command thread.
        p.future().complete(payload == null ? null : Json.write(payload));
        return dto;
    }

    private void markSuperseded(String decisionId, int current) {
        jdbc.update("UPDATE decision SET status = 'superseded', reason = ?, answered_at = ? WHERE id = ? AND status = 'pending'",
            "contract moved to v" + current, Json.now(), decisionId);
        Pending p = pending.remove(decisionId);
        ObjectNode dto = get(decisionId);
        broker.publishApp("decision.resolved", dto);
        if (p != null) {
            campaignItems.accept(p.workId(), studioItem("studio.decision_resolved", dto));
            waitingChanged.accept(p.workId());
            // The harness asked under an older revision: an honest "no answer" (blocked / denied / pending).
            String kind = p.kind();
            JsonNode request = dto.get("request");
            switch (kind) {
                case "question", "review" -> p.future().complete(null);
                case "effect", "publication" -> p.future().complete(Json.write(Json.obj().put("requestId", Json.text(request, "id"))
                    .put("contractRevision", request.get("contractRevision").asInt()).put("approved", false).put("reason", "superseded: contract moved to v" + current)));
                default -> p.future().complete(Json.write(Json.obj().put("proposalId", Json.text(request, "id"))
                    .put("contractRevision", request.get("contractRevision").asInt()).put("outcome", "Pending").put("byAuthority", "studio").put("reason", "superseded")));
            }
        }
    }

    /** A campaign ended (or its run job stopped) while decisions waited: they expire with the outcome (§13.9). */
    public void expireForWork(String workId, String reason) {
        for (Pending p : List.copyOf(pending.values())) {
            if (!p.workId().equals(workId)) continue;
            jdbc.update("UPDATE decision SET status = 'expired', reason = ?, answered_at = ? WHERE id = ? AND status = 'pending'", reason, Json.now(), p.id());
            pending.remove(p.id());
            ObjectNode dto = get(p.id());
            broker.publishApp("decision.resolved", dto);
            campaignItems.accept(workId, studioItem("studio.decision_resolved", dto));
            waitingChanged.accept(workId);
            p.future().cancel(false);
        }
    }

    public int pendingCount(String workId) {
        Integer n = workId == null
            ? jdbc.queryForObject("SELECT count(*) FROM decision WHERE status = 'pending'", Integer.class)
            : jdbc.queryForObject("SELECT count(*) FROM decision WHERE status = 'pending' AND work_id = ?", Integer.class, workId);
        return n == null ? 0 : n;
    }

    // ------------------------------------------------------------------------------------------------ reads

    public ObjectNode get(String id) {
        List<ObjectNode> rows = jdbc.query("SELECT * FROM decision WHERE id = ?", (rs, i) -> row(rs), id);
        if (rows.isEmpty()) throw ApiException.notFound("no decision " + id);
        return rows.getFirst();
    }

    public ArrayNode list(String status, String workId, int limit) {
        StringBuilder sql = new StringBuilder("SELECT * FROM decision WHERE 1=1");
        java.util.List<Object> args = new java.util.ArrayList<>();
        if (status != null && !status.isBlank()) {
            if (status.equals("resolved")) sql.append(" AND status <> 'pending'");
            else { sql.append(" AND status = ?"); args.add(status); }
        }
        if (workId != null) { sql.append(" AND work_id = ?"); args.add(workId); }
        sql.append(" ORDER BY created_at ").append("pending".equals(status) ? "ASC" : "DESC").append(" LIMIT ?");
        args.add(limit);
        ArrayNode a = Json.arr();
        jdbc.query(sql.toString(), rs -> { a.add(row(rs)); }, args.toArray());
        return a;
    }

    private static ObjectNode row(java.sql.ResultSet rs) throws java.sql.SQLException {
        ObjectNode o = Json.obj();
        o.put("id", rs.getString("id"));
        o.put("kind", rs.getString("kind"));
        o.put("projectId", rs.getString("project_id"));
        o.put("workId", rs.getString("work_id"));
        o.put("cellId", rs.getString("cell_id"));
        int rev = rs.getInt("contract_revision");
        if (!rs.wasNull()) o.put("contractRevision", rev);
        o.set("request", Json.parse(rs.getString("request_json")));
        o.put("status", rs.getString("status"));
        String reply = rs.getString("reply_json");
        if (reply != null) o.set("reply", Json.parse(reply));
        o.put("byAuthority", rs.getString("by_authority"));
        o.put("reason", rs.getString("reason"));
        o.put("createdAt", rs.getString("created_at"));
        o.put("answeredAt", rs.getString("answered_at"));
        o.put("leaseExpiresAt", rs.getString("lease_expires_at"));
        return o;
    }

    /** A pending question, approval or suggestion as the UI shows it (§7.5). */
    public static ObjectNode cardOf(JsonNode decision) {
        ObjectNode o = Json.obj();
        JsonNode request = decision.path("request");
        String kind = Json.text(decision, "kind", "");
        o.put("id", Json.text(decision, "id"));
        o.put("workId", Json.text(decision, "workId"));
        o.put("createdAt", Json.text(decision, "createdAt"));
        o.put("status", Json.text(decision, "status"));
        switch (kind) {
            case "question" -> {
                o.put("kind", "question");
                o.put("text", Json.text(request, "text"));
                ArrayNode options = o.putArray("options");
                for (JsonNode op : Json.each(request.get("options"))) options.add(op.asString());
            }
            case "acceptance" -> {
                // B3: "could not verify — is it done?" or "the review found problems"; C11: "approve the test change?".
                o.put("kind", "acceptance");
                String code = Json.text(request, "code");
                boolean person = INTEGRITY_REVIEW.equals(code);
                ArrayNode items = o.putArray("items");
                for (JsonNode item : Json.each(request.get("items"))) {
                    ObjectNode i = items.addObject();
                    i.put("reason", Json.text(item, "reason", ""));
                    i.put("status", Json.text(item, "status", ""));
                    i.set("findings", findingsOf(item.get("findings")));
                    if (item.path("humanOnly").asBoolean(false)) {
                        person = true;
                        i.put("humanOnly", true);
                        String obligation = Json.text(item, "obligation", "");
                        if (obligation.startsWith("integrity:")) i.put("path", obligation.substring("integrity:".length()));
                        ArrayNode checks = i.putArray("checks");
                        java.util.regex.Matcher m = TOUCHES.matcher(Json.text(item, "reason", ""));
                        if (m.find()) for (String id : m.group(1).split(", ")) if (!id.isBlank()) checks.add(id.strip());
                        String by = Json.text(item, "by");
                        if (by != null) i.put("by", by);
                    }
                }
                o.put("variant", "review_rejected".equals(code) ? "rejected" : person ? "integrity" : "unverified");
                ObjectNode model = modelOf(request);
                if (model != null) o.set("model", model);
                o.put("summary", Json.text(request, "summary", ""));
            }
            case "review" -> {
                // C11: a person's review of a test change; the review of a run that is not a task keeps the plain variant.
                o.put("kind", "review");
                o.put("variant", request.path("humanOnly").asBoolean(false) ? "integrity" : "review");
                o.set("items", integrityItems(request));
                ObjectNode model = modelOf(request);
                if (model != null) o.set("model", model);
            }
            case "effect", "publication" -> {
                o.put("kind", "approval");
                String command = commandOf(request);
                o.put("command", command);
                String effect = Json.text(request, "expectedEffect", "");
                o.put("effect", effectOf(effect + " " + Json.text(request, "action", "")));
                o.put("why", Json.text(request, "reason", ""));
                o.put("detail", effect);
                o.put("pattern", patternOf(request));
            }
            default -> {
                o.put("kind", "suggestion");
                o.put("text", Json.text(request, "change"));
                o.put("why", Json.text(request, "reason", ""));
                o.put("relaxes", request.path("weakening").asBoolean(false));
            }
        }
        return o;
    }

    /** The effect of a risky action as a catalog key (§7.5 table). */
    public static String effectOf(String text) {
        String t = text.toLowerCase(java.util.Locale.ROOT);
        if (t.contains("package installation")) return "install";
        if (t.contains("git refs") || t.contains("git-refs") || t.contains("git ref")) return "git";
        if (t.contains("outside the workspace")) return "outside";
        if (t.contains("protected path")) return "protected";
        if (t.contains("destructive delete")) return "delete";
        if (t.contains("network")) return "network";
        return "other";
    }

    /** What "Always allow in this project" stores: the program and its sub-command, without arguments. */
    public static String patternOf(JsonNode request) {
        List<String> argv = new java.util.ArrayList<>();
        for (JsonNode a : Json.each(request.get("argv"))) argv.add(a.asString());
        if (argv.isEmpty()) return Json.text(request, "action", "");
        if (argv.size() > 1 && !argv.get(1).startsWith("-") && argv.get(1).matches("[A-Za-z][A-Za-z0-9:_-]*")) return argv.get(0) + " " + argv.get(1);
        return argv.get(0);
    }

    private static ObjectNode studioItem(String kind, ObjectNode decision) {
        ObjectNode item = Json.obj();
        item.put("at", Json.now());
        item.put("source", "studio");
        item.put("kind", kind);
        ObjectNode ids = item.putObject("ids");
        ids.put("work", Json.text(decision, "workId"));
        if (decision.hasNonNull("cellId")) {
            ids.put("context", Json.text(decision, "cellId"));
            item.put("cell", Json.text(decision, "cellId"));
        }
        ObjectNode data = decision.deepCopy();
        data.set("card", cardOf(decision));
        item.set("data", data);
        return item;
    }
}
