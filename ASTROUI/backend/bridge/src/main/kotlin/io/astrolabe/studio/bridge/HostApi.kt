package io.astrolabe.studio.bridge

import java.util.concurrent.CompletableFuture

/**
 * The Java-facing surface of the bridge (§25.3). Everything ASTROLABE owns crosses as the JSON of its own
 * `@Serializable` types (kotlinx), never re-modelled by hand; the server passes it through to the browser.
 */

/** An opened repository (§19). */
public data class ProjectInfo(
    val projectId: String,
    val root: String,
    val stateRoot: String,
    val repoIdentity: String,
    val schemaVersion: Int,
)

/** What `campaign.start` asks for (§25.3 `StartSpec`, Appendix B.6). */
public data class StartSpec @JvmOverloads constructor(
    val requestText: String,
    val tokens: Long,
    val costCurrency: String? = null,
    val costAmount: String? = null,
    val resumeExpected: Boolean = false,
    val maxCells: Int = 12,
    val leaseMinutes: Long = 480,
    val effort: String = "Medium",
    val maxOutputTokens: Int? = null,
    /** Studio 2 §7.3: supply acceptance when the core refuses to open for lack of it. */
    val verificationSetup: Boolean = false,
    val savedChecks: SavedChecks = SavedChecks(),
    /** Studio 2 §7.5: every authority call goes to the host, in both modes; the host applies the mode's policy. */
    val hostAuthority: Boolean = false,
    /** Studio 2 §9 setting 9: the project's protected files when they differ from the default; null keeps the contract's. */
    val protectedPaths: List<String>? = null,
)

/** A campaign the bridge opened (or reopened) and started. */
public data class CampaignRef(
    val workId: String,
    val attemptId: String,
    val shape: String?,
    val contractVersion: Int,
    val fingerprint: String,
    /** `Reconciliation` of the open: unknown outcomes, external moves, handles, stamp. */
    val reconciliationJson: String,
    /** Why the campaign cannot run (`OpenedCampaign.stop`), or null. */
    val stopReason: String?,
    /** How the result is verified (Studio 2 §7.3); null when the bridge could not tell. */
    val verification: VerificationSetup? = null,
    /** The core's machine-readable reason a stopped campaign waits (D-339): `acceptance_decision` · `review_rejected`. */
    val stopCode: String? = null,
)

/**
 * Called once when a campaign's run returns, fails, or its job is cancelled (host shutdown). [stopCode] is the core's
 * machine-readable reason a `waiting_for_input` campaign waits (D-339): `acceptance_decision` or `review_rejected`.
 */
public fun interface RunListener {
    public fun onEnded(workId: String, outcome: String?, reason: String?, stopCode: String?, failure: Throwable?)
}

/** Receives every bus record, already serialized; must not block (it runs on the bus dispatcher). */
public fun interface RecordSink {
    public fun onRecord(workId: String, busSeq: Long, kind: String, recordJson: String)
}

/**
 * Human authority as the host implements it (§2.4, §25.8). Requests and replies are the JSON of ASTROLABE's
 * `Question`/`Answer`, `DClassRequest`/`Decision`, `AmendmentProposal`/`Resolution`, `ReviewRequest`/`Verdict` and
 * `AcceptanceDecisionRequest`/`AcceptanceDecision`. A `null` answer means "no answer": a question ends the cell
 * blocked, a review is an unverified result, and a missing acceptance decision makes the campaign wait (D-338).
 */
public interface AuthorityPort {
    public fun ask(workId: String, questionJson: String): CompletableFuture<String?>

    public fun approve(workId: String, requestJson: String): CompletableFuture<String>

    public fun resolve(workId: String, proposalJson: String): CompletableFuture<String>

    public fun review(workId: String, requestJson: String): CompletableFuture<String?>

    /** The acceptance decision (D-338): `accept` or `rework` for what could not be verified, or `null` for none now. */
    public fun decide(workId: String, requestJson: String): CompletableFuture<String?>
}

/** Configuration check result (§17.1 validation). */
public data class ConfigCheck(
    val valid: Boolean,
    val fingerprint: String?,
    /** JSON array of `{path, message, source}`. */
    val violationsJson: String,
    val adapterWarnings: List<String>,
)

/** A decoded, normalized configuration ready to run. */
public class RunConfig internal constructor(internal val config: io.astrolabe.Config) {
    public val json: String get() = ConfigSupport.encode(config)
    public val mainProfileId: String get() = config.profileRoles.main
    public val profileIds: Set<String> get() = config.profiles.keys
}

/** A workspace lease that refused an open (§13.1 `LeaseHeld` / `GrantRefused`), flattened for the host's error mapping. */
public data class LeaseRefusal(
    val workspace: String,
    val holder: String,
    val expiry: java.time.Instant,
    /** Set for `GrantRefused`: the previous holder's unreconciled effects fence the workspace even after expiry. */
    val fence: String?,
)

public object Refusals {
    @JvmStatic
    public fun lease(t: Throwable): LeaseRefusal? = when (t) {
        is io.astrolabe.campaign.LeaseHeld -> LeaseRefusal(t.lease.workspace.value, t.lease.holder, t.lease.expiry, null)
        is io.astrolabe.campaign.GrantRefused -> LeaseRefusal(t.previous.workspace.value, t.previous.holder, t.previous.expiry, t.message)
        else -> null
    }
}
