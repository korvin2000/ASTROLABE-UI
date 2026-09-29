package io.astrolabe.studio.support;

import java.util.List;

import tools.jackson.databind.JsonNode;

/**
 * A protocol error (§27.9): a stable code, an HTTP status, the harness or SDK message verbatim, and optional
 * structured details (violations, refusal, gap id). Never carries secrets or stack traces.
 */
public class ApiException extends RuntimeException {
    private final String code;
    private final int status;
    private final boolean retryable;
    private final String gap;
    private final List<FieldError> fieldErrors;
    private final Integer currentRevision;
    private final JsonNode details;

    public record FieldError(String path, String message) { }

    public ApiException(String code, int status, String message) {
        this(code, status, message, false, null, List.of(), null, null);
    }

    public ApiException(String code, int status, String message, boolean retryable, String gap, List<FieldError> fieldErrors, Integer currentRevision, JsonNode details) {
        super(message);
        this.code = code;
        this.status = status;
        this.retryable = retryable;
        this.gap = gap;
        this.fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
        this.currentRevision = currentRevision;
        this.details = details;
    }

    public String code() { return code; }
    public int status() { return status; }
    public boolean retryable() { return retryable; }
    public String gap() { return gap; }
    public List<FieldError> fieldErrors() { return fieldErrors; }
    public Integer currentRevision() { return currentRevision; }
    public JsonNode details() { return details; }

    public static ApiException invalid(String message) { return new ApiException("invalid_args", 400, message); }
    public static ApiException notFound(String message) { return new ApiException("not_found", 404, message); }
    public static ApiException conflict(String code, String message) { return new ApiException(code, 409, message); }
    public static ApiException unsupported(String gap, String message) { return new ApiException("not_supported", 422, message, false, gap, List.of(), null, null); }
    public static ApiException superseded(int current, String message) { return new ApiException("superseded", 409, message, false, null, List.of(), current, null); }

    /** The error shape of §27.9 for WebSocket `err`/`result.error` and REST problem bodies. */
    public JsonNode toJson(String requestId) {
        var o = Json.obj();
        o.put("code", code);
        o.put("message", getMessage());
        if (requestId != null) o.put("requestId", requestId);
        o.put("retryable", retryable);
        var fe = o.putArray("fieldErrors");
        for (FieldError f : fieldErrors) fe.addObject().put("path", f.path()).put("message", f.message());
        if (currentRevision != null) o.put("currentRevision", currentRevision);
        if (gap != null) o.put("gap", gap);
        if (details != null) o.set("details", details);
        return o;
    }
}
