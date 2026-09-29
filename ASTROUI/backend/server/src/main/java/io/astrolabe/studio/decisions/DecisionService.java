package io.astrolabe.studio.decisions;

import java.time.Instant;
import java.util.List;
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
    private volatile java.util.function.Function<String, String> projectOf = w -> null;

    private record Pending(String id, String kind, String workId, CompletableFuture<String> future) { }

    public DecisionService(JdbcTemplate jdbc, TopicBroker broker, HostService hosts) {
        this.jdbc = jdbc;
        this.broker = broker;
        this.hosts = hosts;
        int expired = jdbc.update("UPDATE decision SET status = 'expired', reason = 'campaign interrupted: the backend restarted', answered_at = ? WHERE status = 'pending'", Json.now());
        if (expired > 0) log.info("{} pending decision(s) from the previous run expired (§13.9)", expired);
    }

    /** Wiring from the live pipeline: places decision items in the campaign stream; resolves a work's project. */
    public void wire(BiConsumer<String, ObjectNode> campaignItems, java.util.function.Function<String, String> projectOf) {
        this.campaignItems = campaignItems;
        this.projectOf = projectOf;
    }

    // ------------------------------------------------------------------------------------------------ AuthorityPort

    @Override
    public CompletableFuture<String> ask(String workId, String questionJson) {
        return raise("question", workId, questionJson);
    }

    @Override
    public CompletableFuture<String> approve(String workId, String requestJson) {
        JsonNode request = Json.parse(requestJson);
        String action = Json.text(request, "action", "");
        return raise(action.startsWith("publish.") ? "publication" : "effect", workId, requestJson);
    }

    @Override
    public CompletableFuture<String> resolve(String workId, String proposalJson) {
        JsonNode proposal = Json.parse(proposalJson);
        String reason = Json.text(proposal, "reason", "").toLowerCase();
        // G-21: only the reason text distinguishes the kinds; the conservative default is a contract amendment.
        String kind = reason.startsWith("plan proposal") ? "plan_acceptance" : reason.equals("knowledge admission") ? "kb_admission" : "amendment";
        return raise(kind, workId, proposalJson);
    }

    @Override
    public CompletableFuture<String> review(String workId, String requestJson) {
        return raise("review", workId, requestJson);
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

    private ObjectNode buildReply(String kind, JsonNode request, JsonNode reply, String actor) {
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
        item.set("data", decision);
        return item;
    }
}
