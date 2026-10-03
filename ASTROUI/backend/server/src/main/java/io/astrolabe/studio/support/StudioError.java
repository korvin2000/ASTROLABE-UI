package io.astrolabe.studio.support;

import java.util.Locale;

import net.ai.gate.error.LlmException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * A normalised error (Studio 2 §10, BE-8): a code of the catalog, parameters for its sentence, the raw reason for
 * "Details" and whether a retry can help. The sentence itself lives in the frontend message catalog.
 */
public class StudioError extends ApiException {
    public static final String ACCOUNT_MISSING = "account_missing";
    public static final String AUTH_EXPIRED = "auth_expired";
    public static final String AUTH_REJECTED = "auth_rejected";
    public static final String RATE_LIMITED = "rate_limited";
    public static final String QUOTA_EXHAUSTED = "quota_exhausted";
    public static final String PROVIDER_UNREACHABLE = "provider_unreachable";
    public static final String MODEL_UNAVAILABLE = "model_unavailable";
    public static final String PROJECT_NOT_FOUND = "project_not_found";
    public static final String NOT_A_GIT_REPO = "not_a_git_repo";
    public static final String PROJECT_BUSY = "project_busy";
    public static final String PROJECT_LOCKED = "project_locked";
    public static final String LOGIN_PORT_BUSY = "login_port_busy";
    public static final String LOGIN_TIMEOUT = "login_timeout";
    public static final String LOGIN_DENIED = "login_denied";
    public static final String LOGIN_FAILED = "login_failed";
    public static final String NO_VERIFICATION = "no_verification";
    public static final String START_TIMEOUT = "start_timeout";
    public static final String AGENT_ERROR = "agent_error";
    public static final String LIMIT_REACHED = "limit_reached";
    public static final String COMMAND_TIMEOUT = "command_timeout";
    public static final String CONTEXT_TOO_LARGE = "context_too_large";
    /** Not errors of §10 but reasons of a paused or unverified task; they have sentences in the catalog too. */
    public static final String NEEDS_ANSWER = "needs_answer";
    /** Phase 0 B3: the result could not be verified; the user decides whether the task is done. */
    public static final String ACCEPTANCE_DECISION = "acceptance_decision";
    /** Phase 0 B3: the review found problems after the agent's rework round; the user decides. */
    public static final String REVIEW_REJECTED = "review_rejected";
    /** C11 (D-404): the agent changed a test a required check runs; under `human` approval only the user may accept it. */
    public static final String INTEGRITY_REVIEW = "integrity_review";
    public static final String WAITING_FOR_PROCESS = "waiting_for_process";
    public static final String BLOCKED = "blocked";
    public static final String INTERRUPTED = "interrupted";
    public static final String CHECKS_FAILED = "checks_failed";
    public static final String TOO_MANY_TASKS = "too_many_tasks";

    private final ObjectNode params;
    private final String detail;

    public StudioError(String code, int status, ObjectNode params, String detail, boolean retryable) {
        super(code, status, detail == null ? code : detail, retryable, null, java.util.List.of(), null, null);
        this.params = params == null ? Json.obj() : params;
        this.detail = detail;
    }

    public static StudioError of(String code, String detail) { return new StudioError(code, 409, null, detail, retryable(code)); }

    public static StudioError of(String code, ObjectNode params, String detail) { return new StudioError(code, 409, params, detail, retryable(code)); }

    public ObjectNode params() { return params; }

    public String detail() { return detail; }

    /** `{ code, params, detail, retryable }` — the content of `studio.error` and of REST problem bodies. */
    public ObjectNode body() {
        ObjectNode o = Json.obj();
        o.put("code", code());
        o.set("params", params);
        if (detail != null) o.put("detail", detail);
        o.put("retryable", retryable());
        return o;
    }

    @Override
    public JsonNode toJson(String requestId) {
        ObjectNode o = body();
        o.put("message", getMessage());
        if (requestId != null) o.put("requestId", requestId);
        return o;
    }

    private static boolean retryable(String code) {
        return switch (code) {
            case ACCOUNT_MISSING, MODEL_UNAVAILABLE, PROJECT_NOT_FOUND, NOT_A_GIT_REPO, QUOTA_EXHAUSTED, CONTEXT_TOO_LARGE, LOGIN_PORT_BUSY -> false;
            default -> true;
        };
    }

    /** The catalog code of a transport failure. */
    public static String codeOf(LlmException e) {
        return switch (e.code().value()) {
            case "invalid_credentials", "permission_denied" -> AUTH_REJECTED;
            case "login_required", "refresh_failed" -> AUTH_EXPIRED;
            case "rate_limited", "overloaded" -> RATE_LIMITED;
            case "quota_exhausted" -> QUOTA_EXHAUSTED;
            case "connect_failed", "server_error", "stream_interrupted", "deadline_exceeded", "stream_idle_timeout" -> PROVIDER_UNREACHABLE;
            case "model_not_found" -> MODEL_UNAVAILABLE;
            case "context_overflow", "request_too_large" -> CONTEXT_TOO_LARGE;
            default -> AGENT_ERROR;
        };
    }

    /**
     * The catalog code of a failure text from the core or the adapter. The core reports provider failures as text, so
     * this reads the well-known words; anything else is `agent_error` and keeps its text under "Details".
     */
    public static String codeOf(String reason) {
        if (reason == null) return AGENT_ERROR;
        String r = reason.toLowerCase(Locale.ROOT);
        if (r.contains("invalid_credentials") || r.contains("invalid api key") || r.contains("unauthorized") || r.contains(" 401") || r.contains("authentication")) return AUTH_REJECTED;
        if (r.contains("login_required") || r.contains("refresh_failed") || r.contains("token expired")) return AUTH_EXPIRED;
        if (r.contains("quota_exhausted") || r.contains("insufficient_quota") || r.contains("usage limit")) return QUOTA_EXHAUSTED;
        if (r.contains("rate_limited") || r.contains("rate limit") || r.contains(" 429") || r.contains("overloaded")) return RATE_LIMITED;
        if (r.contains("context_overflow") || r.contains("contextoverflow") || r.contains("request_too_large") || r.contains("context length")) return CONTEXT_TOO_LARGE;
        if (r.contains("model_not_found") || r.contains("unlisted_model") || r.contains("no such model")) return MODEL_UNAVAILABLE;
        if (r.contains("connect_failed") || r.contains("connection refused") || r.contains("unknownhost") || r.contains("server_error") || r.contains("stream_interrupted")
            || r.contains("deadline_exceeded") || r.contains("timed out") || r.contains("timeout")
            // The core's words for a call whose connection broke: "provider Transport: outcome_unknown: The connection …".
            || r.contains("provider transport") || r.contains("the connection") || r.contains("connection reset") || r.contains("connection closed")) return PROVIDER_UNREACHABLE;
        if (r.contains("budget") && (r.contains("exhaust") || r.contains("exceed"))) return LIMIT_REACHED;
        return AGENT_ERROR;
    }

    public static StudioError from(Throwable t, ObjectNode params) {
        Throwable cause = t;
        while (cause.getCause() != null && !(cause instanceof LlmException) && !(cause instanceof StudioError)
            && (cause instanceof java.util.concurrent.CompletionException || cause instanceof java.util.concurrent.ExecutionException || cause instanceof RuntimeException r && r.getMessage() == null)) {
            cause = cause.getCause();
        }
        if (cause instanceof StudioError s) return s;
        String text = cause.getClass().getSimpleName() + (cause.getMessage() == null ? "" : ": " + cause.getMessage());
        if (cause instanceof LlmException l) return of(codeOf(l), params, text);
        if (cause instanceof ApiException a) {
            String code = switch (a.code()) {
                case "campaign_active" -> PROJECT_BUSY;
                case "project_locked", "lease_held", "lease_fenced" -> PROJECT_LOCKED;
                case "unsupported_repository" -> a.getMessage() != null && a.getMessage().contains("not a git") ? NOT_A_GIT_REPO : PROJECT_NOT_FOUND;
                case "not_found" -> PROJECT_NOT_FOUND;
                default -> codeOf(a.getMessage());
            };
            return of(code, params, a.getMessage());
        }
        return of(codeOf(text), params, text);
    }
}
