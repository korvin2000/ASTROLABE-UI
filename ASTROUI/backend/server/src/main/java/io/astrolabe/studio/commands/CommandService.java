package io.astrolabe.studio.commands;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.providers.ProviderService;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.ErrorHandling;
import io.astrolabe.studio.support.Json;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The command dispatcher (§27.5): one idempotency key per user intent, atomically claimed with the canonical payload
 * hash; a duplicate returns the recorded result; world-changing commands need an explicit confirmation; an uncertain
 * outcome is `unknown` and never repeated automatically. REST `POST /commands` and WebSocket `cmd` share it.
 */
@Service
public class CommandService {
    private static final Set<String> CONFIRM = Set.of("campaign.cancel", "publication.request", "intent.reconcile");

    private final JdbcTemplate jdbc;
    private final CampaignService campaigns;
    private final DecisionService decisions;
    private final ProjectService projects;
    private final SettingsService settings;
    private final ProviderService providers;

    public CommandService(JdbcTemplate jdbc, CampaignService campaigns, DecisionService decisions, ProjectService projects, SettingsService settings, ProviderService providers) {
        this.jdbc = jdbc;
        this.campaigns = campaigns;
        this.decisions = decisions;
        this.projects = projects;
        this.settings = settings;
        this.providers = providers;
        jdbc.update("UPDATE command SET status = 'unknown', updated_at = ? WHERE status IN ('accepted', 'running')", Json.now());
    }

    public record Outcome(String status, JsonNode result, ApiException error) { }

    /** Executes a command envelope `{id, name, target, expected, confirm, args}`; never throws. */
    public Outcome execute(JsonNode envelope, String actor) {
        String id = Json.text(envelope, "id");
        String name = Json.text(envelope, "name");
        if (id == null || id.isBlank() || name == null) return new Outcome("rejected", null, ApiException.invalid("a command needs an id and a name"));
        String hash = hash(envelope);
        List<Outcome> existing = jdbc.query("SELECT payload_hash, status, result_json FROM command WHERE id = ?", (rs, i) -> {
            if (!hash.equals(rs.getString(1))) return new Outcome("rejected", null, new ApiException("idempotency_conflict", 409, "command id " + id + " was used with a different payload"));
            String status = rs.getString(2);
            JsonNode result = rs.getString(3) == null ? null : Json.parse(rs.getString(3));
            if ("rejected".equals(status) && result != null && result.has("code")) {
                return new Outcome(status, null, new ApiException(Json.text(result, "code"), 409, Json.text(result, "message")));
            }
            return new Outcome(status, result, null);
        }, id);
        if (!existing.isEmpty()) return existing.getFirst();
        int claimed = jdbc.update("INSERT OR IGNORE INTO command (id, name, payload_hash, status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            id, name, hash, "running", Json.now(), Json.now());
        if (claimed == 0) return new Outcome("running", null, null);
        try {
            if (CONFIRM.contains(name) && !Json.bool(envelope, "confirm", false)) {
                throw new ApiException("confirmation_required", 422, name + " changes the world and needs an explicit confirmation");
            }
            JsonNode result = dispatch(name, envelope, actor);
            jdbc.update("UPDATE command SET status = 'succeeded', result_json = ?, updated_at = ? WHERE id = ?", result == null ? null : Json.write(result), Json.now(), id);
            return new Outcome("succeeded", result, null);
        } catch (Throwable t) {
            ApiException e = ErrorHandling.translate(t);
            jdbc.update("UPDATE command SET status = 'rejected', result_json = ?, updated_at = ? WHERE id = ?", Json.write(e.toJson(id)), Json.now(), id);
            return new Outcome("rejected", null, e);
        }
    }

    public JsonNode status(String id) {
        List<JsonNode> rows = jdbc.query("SELECT * FROM command WHERE id = ?", (rs, i) -> {
            ObjectNode o = Json.obj();
            o.put("id", rs.getString("id"));
            o.put("name", rs.getString("name"));
            o.put("status", rs.getString("status"));
            if (rs.getString("result_json") != null) o.set("result", Json.parse(rs.getString("result_json")));
            o.put("createdAt", rs.getString("created_at"));
            o.put("updatedAt", rs.getString("updated_at"));
            return o;
        }, id);
        if (rows.isEmpty()) throw ApiException.notFound("no command " + id);
        return rows.getFirst();
    }

    private JsonNode dispatch(String name, JsonNode env, String actor) {
        JsonNode args = env.has("args") ? env.get("args") : Json.obj();
        JsonNode target = env.has("target") ? env.get("target") : Json.obj();
        JsonNode expected = env.has("expected") ? env.get("expected") : Json.obj();
        String work = Json.text(target, "workId", Json.text(args, "workId"));
        String project = Json.text(target, "projectId", Json.text(args, "projectId"));
        Integer revision = expected.hasNonNull("contractRevision") ? expected.get("contractRevision").asInt() : null;
        return switch (name) {
            case "project.add" -> {
                var row = projects.add(Json.text(args, "path"), false);
                projects.open(row.id());
                campaigns.onProjectOpened(row.id());
                yield projects.dto(row);
            }
            case "project.open" -> {
                projects.open(require(project, "projectId"));
                campaigns.onProjectOpened(project);
                yield projects.dto(projects.require(project));
            }
            case "project.close" -> {
                projects.close(require(project, "projectId"));
                yield Json.obj().put("projectId", project).put("open", false);
            }
            case "project.remove" -> {
                projects.remove(require(project, "projectId"));
                yield Json.obj().put("projectId", project).put("removed", true);
            }
            case "project.resetDemo" -> {
                var row = projects.resetDemo();
                campaigns.onProjectOpened(row.id());
                yield projects.dto(row);
            }
            case "campaign.start" -> campaigns.start(require(project, "projectId"), Json.text(args, "request"), Json.text(args, "annex"), args.get("options"), Json.text(args, "parentWork"));
            case "campaign.resume" -> campaigns.resume(require(work, "workId"), Json.text(args, "amendment"));
            case "campaign.cancel" -> campaigns.cancel(require(work, "workId"), Json.text(args, "reason"));
            case "campaign.amend" -> campaigns.amend(require(work, "workId"), Json.text(args, "text"), revision);
            case "amendment.resolve" -> campaigns.resolveAmendment(require(work, "workId"), Json.text(args, "amendmentId"), Json.text(args, "outcome", "Accepted"), Json.text(args, "reason"), args.get("patch"));
            case "decision.reply" -> decisions.reply(Json.text(args, "decisionId"), args.get("reply"), revision, actor);
            case "decision.decline" -> decisions.decline(Json.text(args, "decisionId"), Json.text(args, "reason"), actor);
            case "intent.reconcile" -> campaigns.reconcileIntent(require(project, "projectId"), Json.text(args, "intentId"), Json.text(args, "evidence"));
            case "publication.request" -> campaigns.publish(require(work, "workId"), args);
            case "session.update" -> {
                campaigns.updateSession(require(work, "workId"), Json.text(args, "title"),
                    args.hasNonNull("pinned") ? args.get("pinned").asBoolean() : null, args.hasNonNull("archived") ? args.get("archived").asBoolean() : null);
                yield campaigns.summary(work);
            }
            case "settings.save" -> settings.save(Json.text(args, "scope", SettingsService.STUDIO), (ObjectNode) args.get("layer"),
                expected.path("settingsRevision").asLong(0), actor);
            case "rules.bind" -> settings.bindRules(require(project, "projectId"), Json.text(args, "path"), Json.text(args, "digest"), actor);
            case "rules.unbind" -> settings.bindRules(require(project, "projectId"), null, null, actor);
            case "provider.test" -> providers.test(Json.text(args, "providerId"), Json.text(args, "modelId"));
            case "provider.logout" -> providers.logout(Json.text(args, "providerId"), actor);
            case "profile.draft" -> providers.draft(Json.text(args, "providerId"), Json.text(args, "modelId"), Json.text(args, "profileId"), actor);
            case "profile.qualify" -> providers.qualify(Json.text(args, "profileId"), Json.bool(env, "confirm", false), actor);
            case "profile.freeze" -> providers.freeze(Json.text(args, "profileId"), actor);
            default -> throw new ApiException("invalid_args", 400, "unknown command " + name);
        };
    }

    private static String require(String value, String name) {
        if (value == null || value.isBlank()) throw ApiException.invalid("missing " + name);
        return value;
    }

    private static String hash(JsonNode env) {
        ObjectNode canonical = Json.obj();
        canonical.put("name", Json.text(env, "name"));
        canonical.set("target", env.get("target"));
        canonical.set("expected", env.get("expected"));
        canonical.set("args", env.get("args"));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Json.write(canonical).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
