package io.astrolabe.studio.support;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import io.astrolabe.ConfigViolation;
import io.astrolabe.InvalidConfig;
import io.astrolabe.store.ProjectLockHeld;
import io.astrolabe.studio.bridge.CampaignActive;
import io.astrolabe.studio.bridge.LeaseRefusal;
import io.astrolabe.studio.bridge.NotLive;
import io.astrolabe.studio.bridge.Refusals;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Maps failures to `application/problem+json` with the fields of §27.9 (R-BE: messages verbatim, no stack traces). */
@RestControllerAdvice
public class ErrorHandling {
    private static final Logger log = LoggerFactory.getLogger(ErrorHandling.class);
    private static final MediaType PROBLEM = MediaType.parseMediaType("application/problem+json");

    public static ApiException translate(Throwable t) {
        Throwable cause = t;
        while ((cause instanceof java.util.concurrent.CompletionException || cause instanceof java.util.concurrent.ExecutionException) && cause.getCause() != null) cause = cause.getCause();
        return switch (cause) {
            case ApiException e -> e;
            case InvalidConfig e -> {
                List<ApiException.FieldError> fields = e.getViolations().stream().map((ConfigViolation v) -> new ApiException.FieldError(v.getField(), v.getMessage())).toList();
                yield new ApiException("config_invalid", 422, e.getMessage(), false, null, fields, null, null);
            }
            case ProjectLockHeld e -> {
                var d = Json.obj();
                d.put("lockFile", String.valueOf(e.getLockFile()));
                if (e.getHolder() != null) {
                    d.put("pid", e.getHolder().getPid());
                    d.put("startedAt", String.valueOf(e.getHolder().getStartedAt()));
                    d.put("harnessVersion", e.getHolder().getHarnessVersion());
                }
                yield new ApiException("project_locked", 409, e.getMessage(), true, null, List.of(), null, d);
            }
            case CampaignActive e -> new ApiException("campaign_active", 409, e.getMessage(), false, null, List.of(), null, Json.obj().put("workId", e.getWorkId()));
            case NotLive e -> new ApiException("not_resumable", 409, e.getMessage());
            case IllegalArgumentException e -> ApiException.invalid(e.getMessage() == null ? e.toString() : e.getMessage());
            case IllegalStateException e when Refusals.lease(e) != null -> leaseRefused(Refusals.lease(e));
            case IllegalStateException e -> new ApiException("refused", 409, e.getMessage() == null ? e.toString() : e.getMessage());
            default -> {
                log.warn("internal error", cause);
                yield new ApiException("internal", 500, cause.getClass().getSimpleName() + (cause.getMessage() == null ? "" : ": " + cause.getMessage()));
            }
        };
    }

    /**
     * A workspace lease another controller holds (§13.1). ASTROLABE's holder is the controller's pid, so a lease taken
     * before a Studio restart or crash keeps the workspace until it expires (OD-03 sets its length).
     */
    private static ApiException leaseRefused(LeaseRefusal r) {
        Duration left = Duration.between(Instant.now(), r.getExpiry());
        String until = LocalTime.ofInstant(r.getExpiry(), ZoneId.systemDefault()).truncatedTo(ChronoUnit.MINUTES)
            + (left.isNegative() ? "" : " (in " + (left.toHours() > 0 ? left.toHours() + " h " : "") + left.toMinutesPart() + " min)");
        String message = r.getFence() != null
            ? "workspace " + r.getWorkspace() + " is fenced: " + r.getFence() + ". Reconcile the open intents (Activity) before a new controller can take it."
            : "workspace " + r.getWorkspace() + " is still leased to " + r.getHolder() + " until " + until + ". ASTROLABE hands a workspace to another controller only after the lease expires (§13.1); "
                + "a Studio restart or crash does not release it. The lease length for new campaigns is in Settings › Studio runtime.";
        var d = Json.obj();
        d.put("workspace", r.getWorkspace());
        d.put("holder", r.getHolder());
        d.put("expiry", r.getExpiry().toString());
        return new ApiException(r.getFence() != null ? "lease_fenced" : "lease_held", 409, message, true, null, List.of(), null, d);
    }

    @ExceptionHandler(Throwable.class)
    public ResponseEntity<String> handle(Throwable t) {
        ApiException e = translate(t);
        return ResponseEntity.status(e.status()).contentType(PROBLEM).body(Json.write(e.toJson(null)));
    }
}
