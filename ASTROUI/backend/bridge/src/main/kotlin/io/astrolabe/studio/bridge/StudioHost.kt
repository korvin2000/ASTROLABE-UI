package io.astrolabe.studio.bridge

import io.astrolabe.Astrolabe
import io.astrolabe.Config
import io.astrolabe.ProfileRoles
import io.astrolabe.Project
import io.astrolabe.auth.Stage
import io.astrolabe.budget.HeuristicEstimator
import io.astrolabe.campaign.CampaignRequest
import io.astrolabe.campaign.Controller
import io.astrolabe.campaign.DeployTarget
import io.astrolabe.campaign.OpenedCampaign
import io.astrolabe.campaign.PublicationRequest
import io.astrolabe.campaign.PublicationRun
import io.astrolabe.campaign.Reconciliation
import io.astrolabe.campaign.S0Run
import io.astrolabe.contract.Contracts
import io.astrolabe.contract.SqliteContractRepository
import io.astrolabe.event.Authority
import io.astrolabe.event.AutonomousAuthority
import io.astrolabe.event.AutonomousPolicy
import io.astrolabe.event.ChecksView
import io.astrolabe.event.ContractView
import io.astrolabe.event.EventRecord
import io.astrolabe.event.EventSink
import io.astrolabe.event.Events
import io.astrolabe.event.LedgerView
import io.astrolabe.event.BudgetView
import io.astrolabe.event.ReceiptView
import io.astrolabe.event.RegisterView
import io.astrolabe.event.WorksetView
import io.astrolabe.evidence.Journal
import io.astrolabe.evidence.JournalEvent
import io.astrolabe.evidence.JournalScope
import io.astrolabe.evidence.SqliteIntentJournal
import io.astrolabe.id.AttemptId
import io.astrolabe.id.ContextId
import io.astrolabe.id.Digest
import io.astrolabe.id.RandomIdGen
import io.astrolabe.id.WorkId
import io.astrolabe.Mode
import io.astrolabe.provider.aigate.AiGateAdapter
import io.astrolabe.telemetry.Spans
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.future.future
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import net.ai.gate.Llm
import org.slf4j.LoggerFactory
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap

/** A live subscription to the shared bus; [dropped] grows when the sink fell behind (a `seq` gap, §2.5). */
public class BusSubscription internal constructor(private val subscription: io.astrolabe.event.Subscription) : AutoCloseable {
    public fun dropped(): Long = subscription.dropped
    public fun active(): Boolean = subscription.active
    override fun close(): Unit = subscription.close()
}

/** Raised when `start` finds the project busy (R-BE-02). */
public class CampaignActive(public val workId: String) : IllegalStateException("project already runs campaign $workId")

/** Raised when a command needs a campaign that is not attached to a live run. */
public class NotLive(public val workId: String) : IllegalStateException("campaign $workId is not attached to a live run in this backend")

/**
 * The host bridge (§2.12, §25.3): drives ASTROLABE's public `Controller` per campaign with the Studio's authority,
 * lease and cell limit; shares one event bus; exposes read-only store queries. It never writes ASTROLABE tables.
 */
public class StudioHost @JvmOverloads public constructor(
    private val clock: Clock = Clock.systemUTC(),
) : AutoCloseable {
    /** The one bus of every campaign this backend runs (§25.3 `subscribe`); records carry `ids.work`. */
    public val events: Events = Events(clock, Events.DEFAULT_REPLAY, 16_384)

    private val idGen = RandomIdGen()
    private val spans = Spans(idGen, events)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + CoroutineName("studio-host"))
    private val projects = ConcurrentHashMap<String, OpenProject>()
    private val live = ConcurrentHashMap<String, LiveCampaign>()
    private val json = ConfigSupport.json

    private class OpenProject(val id: String, val sdk: Astrolabe, val project: Project, val reads: StoreReads)

    private class LiveCampaign(
        val projectId: String,
        val workId: String,
        val opened: OpenedCampaign,
        val controller: Controller,
        val authority: Authority,
        val adapter: AiGateAdapter,
    ) {
        @Volatile var job: Job? = null
        @Volatile var run: S0Run? = null
        @Volatile var publication: PublicationRun? = null
        /** Set before the run listener is told, so summaries built inside that callback no longer report a live run. */
        @Volatile var ended: Boolean = false
        val running: Boolean get() = !ended && job?.isActive == true
    }

    // ------------------------------------------------------------------------------------------------ projects

    /**
     * Opens [repo] through `Astrolabe.open` (the only way to obtain a `Project`), which takes the project lock.
     * [projectConfigJson] supplies `stateRoot` and `defaults.gitDeadlineSeconds`; the placeholder authority is
     * never consulted because campaigns run through their own `Controller` (§25.3).
     */
    public fun openProject(projectId: String, repo: Path, projectConfigJson: String, llm: Llm): ProjectInfo {
        projects[projectId]?.let { return info(it) }
        val layer = ConfigSupport.decode(projectConfigJson)
        val openConfig = Config(defaults = layer.defaults, stateRoot = layer.stateRoot, profileRoles = ProfileRoles(main = "", helper = null))
        val adapter = AiGateAdapter(llm, emptyList(), false)
        val sdk = Astrolabe(openConfig, adapter, AutonomousAuthority(), clock)
        val project = try {
            sdk.open(repo)
        } catch (failure: Throwable) {
            runCatching { sdk.close() }
            throw failure
        }
        val open = OpenProject(projectId, sdk, project, StoreReads(project.store))
        projects[projectId] = open
        return info(open)
    }

    private fun info(p: OpenProject): ProjectInfo = ProjectInfo(
        projectId = p.id,
        root = p.project.root.toString(),
        stateRoot = p.project.store.layout.root.toString(),
        repoIdentity = p.project.store.identity.toString(),
        schemaVersion = io.astrolabe.store.Migrations.SCHEMA_VERSION,
    )

    public fun isOpen(projectId: String): Boolean = projects.containsKey(projectId)

    /** A fresh work id in ASTROLABE's form (`W-<token>`). */
    public fun newWorkId(): String = idGen.next("W")

    /** Sniffed commands (declared, not inferred) and rules-file candidates of an open project (§19.2). */
    public fun repoInspection(projectId: String): String = RepoInspect.of(project(projectId).project.root)

    /** Closes the project and releases its lock; refused while a campaign of it runs. */
    public fun closeProject(projectId: String) {
        val p = projects[projectId] ?: return
        live.values.firstOrNull { it.projectId == projectId && it.running }?.let { throw CampaignActive(it.workId) }
        projects.remove(projectId)
        live.values.removeIf { it.projectId == projectId }
        try {
            p.project.close()
        } finally {
            p.sdk.close()
        }
    }

    private fun project(projectId: String): OpenProject = projects[projectId] ?: throw IllegalStateException("project $projectId is not open")

    /** The work id of the campaign running in [projectId], if any. */
    public fun runningWork(projectId: String): String? = live.values.firstOrNull { it.projectId == projectId && it.running }?.workId

    public fun isLive(workId: String): Boolean = live[workId]?.running == true

    /** Attached = the backend still holds the opened campaign (running, or inside its publication window, G-22). */
    public fun isAttached(workId: String): Boolean = live.containsKey(workId)

    public fun liveWorks(): List<String> = live.values.filter { it.running }.map { it.workId }

    // ------------------------------------------------------------------------------------------------ campaigns

    /** `campaign.start` (§25.5): open (freeze, snapshot 0, contract, reconciliation, lease, shape) then run in the background. */
    public fun start(
        projectId: String,
        workId: String?,
        spec: StartSpec,
        configJson: String,
        llm: Llm,
        authority: AuthorityPort,
        policyListener: PolicyListener,
        autonomousPolicy: AutonomousPolicyOptions,
        listener: RunListener,
    ): CampaignRef {
        val p = project(projectId)
        runningWork(projectId)?.let { throw CampaignActive(it) }
        val config = ConfigSupport.runConfig(configJson).config
        val work = WorkId(workId ?: idGen.next("W"))
        return launch(p, work, spec.requestText, spec, config, llm, authority, policyListener, autonomousPolicy, listener)
    }

    /** `campaign.resume` (G-01): reopen with the same ids, then run; the frozen attempt configuration governs. */
    public fun resume(
        projectId: String,
        workId: String,
        spec: StartSpec,
        configJson: String,
        llm: Llm,
        authority: AuthorityPort,
        policyListener: PolicyListener,
        autonomousPolicy: AutonomousPolicyOptions,
        listener: RunListener,
    ): CampaignRef {
        val p = project(projectId)
        runningWork(projectId)?.let { throw CampaignActive(it) }
        live.remove(workId)?.let { runCatching { it.adapter.close() } }
        val text = (p.reads.requests(workId).firstOrNull() as? JsonObject)?.get("body")?.jsonObject?.get("text")?.jsonPrimitive?.content
            ?: throw IllegalStateException("campaign $workId has no stored request")
        val config = ConfigSupport.runConfig(configJson).config
        return launch(p, WorkId(workId), text, spec.copy(requestText = text), config, llm, authority, policyListener, autonomousPolicy, listener)
    }

    /** What the agent is told about the protected files of the project: the core refuses to edit them and asks before a command touches them. */
    private fun protectedRule(paths: List<String>): String =
        if (paths.isEmpty()) "Project rule: no file of this project is protected."
        else "Project rule: these files are protected: ${paths.joinToString(", ")}. They cannot be edited; a command that touches them needs the user's approval. " +
            "If the task needs a change there, say which change and stop."

    private fun launch(
        p: OpenProject,
        work: WorkId,
        text: String,
        spec: StartSpec,
        config: Config,
        llm: Llm,
        port: AuthorityPort,
        policyListener: PolicyListener,
        autonomous: AutonomousPolicyOptions,
        listener: RunListener,
    ): CampaignRef {
        val adapter = AiGateAdapter(llm, config.profiles.values, false)
        try {
            val estimators = adapter.estimators(HeuristicEstimator())
            val run = RunSpecs.of(spec, config, checkNotNull(config.mainProfile) { "no profile '${config.profileRoles.main}' for the main routing function" })
            val controller = Controller(
                run.config, clock, idGen, events,
                spans = spans,
                leaseDuration = run.leaseDuration,
                estimators = estimators,
            )
            val policy = run.policy
            val request = CampaignRequest(work, AttemptId(Astrolabe.FIRST_ATTEMPT), text)
            // Phase 0 A9 (core D-345): the Studio's instructions are host notes, never the user's words; structural
            // changes to the contract are host amendments that append no request.
            // WD-04 (WF-1): the notes are worked out before the open from what it will find — the stored contract, or the
            // suites a new one is derived from — so one open serves the action.
            val expected = if (spec.verificationSetup) expectedVerification(p, work, spec.savedChecks) else null
            val notes = hostNotes(spec, expected)
            var opened = controller.open(p.project, request, policy.copy(hostNotes = notes))
            val fresh = opened.contract.version == 1
            var verification: VerificationSetup? = null
            var amended = false
            if (spec.verificationSetup) {
                // Studio 2 §7.3: the core refuses a plan with nothing executable to accept against; supply it and open again.
                if (opened.state == null) {
                    val setup = Verification.choose(opened.sniffed, spec.savedChecks)
                    opened.contracts.amendByHost(work, "verification setup (${setup.kind})") { Verification.apply(it, setup) }
                    verification = setup
                    amended = true
                } else {
                    verification = verificationOf(opened, spec.savedChecks)
                }
            }
            val protectedPaths = spec.protectedPaths
            if (protectedPaths != null && fresh && opened.contract.scope.protectedPaths.toSet() != protectedPaths.toSet()) {
                // The write protection reads the current contract, so the opened campaign keeps it without a second open.
                opened.contracts.amendByHost(work, "protected paths") { c ->
                    c.copy(scope = io.astrolabe.contract.Scope(c.scope.writePaths, protectedPaths))
                }
            }
            val actual = hostNotes(spec, verification)
            // A second open only when this one could not run (the contract needed its acceptance first) or found other
            // notes than expected. C14: a campaign this open could not free stays stopped and runs nothing, so the notes
            // change nothing: a second open would only journal and announce the same hold again.
            if ((amended || actual != notes) && opened.limitHold == null) {
                opened = controller.open(p.project, request, policy.copy(hostNotes = actual))
            }
            // The frozen attempt configuration is the truth for this attempt (invariant 12); its main profile is read live.
            val frozen = opened.attempt.config
            val main = config.profiles[frozen.profileRoles.main] ?: frozen.profiles[frozen.profileRoles.main]
                ?: config.mainProfile ?: throw IllegalStateException("no profile '${frozen.profileRoles.main}' for the main routing function")
            val model = run.cellModel(adapter, main, estimators.estimatorFor(main))
            val authority: Authority = if (frozen.mode == Mode.Autonomous && !spec.hostAuthority) {
                RecordingAutonomousAuthority(work.value, AutonomousPolicy(autonomous.acceptNonWeakening, autonomous.reviewer), policyListener, port)
            } else {
                PortAuthority(work.value, port)
            }
            val campaign = LiveCampaign(p.id, work.value, opened, controller, authority, adapter)
            live[work.value] = campaign
            val ref = CampaignRef(
                workId = work.value,
                attemptId = opened.ids.attempt.value,
                shape = (opened.shape as? io.astrolabe.campaign.ShapeDecision.Selected)?.shape?.name,
                contractVersion = opened.contract.version,
                fingerprint = opened.attempt.fingerprint.hex,
                reconciliationJson = reconciliationJson(opened.reconciliation),
                stopReason = opened.stop?.reason,
                verification = verification,
                stopCode = opened.stop?.code?.wire,
                limitHold = opened.limitHold?.let { json.encodeToString(io.astrolabe.campaign.LimitHold.serializer(), it) },
            )
            campaign.job = scope.launch(CoroutineName("campaign-${work.value}")) {
                var outcome: String? = null
                var reason: String? = null
                var code: String? = null
                var failure: Throwable? = null
                try {
                    val result = controller.run(opened, model, authority, maxCells = run.maxCells)
                    campaign.run = result
                    outcome = result.outcome?.wire ?: opened.stop?.outcome?.wire
                    reason = result.state?.reason ?: opened.stop?.reason
                    code = (result.state?.stopCode ?: opened.stop?.code)?.wire ?: result.budgetStop?.wire
                } catch (cancelled: kotlinx.coroutines.CancellationException) {
                    reason = "run job cancelled by the host (resumable)"
                    throw cancelled
                } catch (t: Throwable) {
                    failure = t
                    reason = t.message ?: t.toString()
                } finally {
                    campaign.ended = true
                    try {
                        listener.onEnded(work.value, outcome, reason, code, failure)
                    } catch (t: Throwable) {
                        log.warn("run listener failed for {}: {}", work.value, t.toString())
                    }
                    // Without a finish receipt there is no publication window (G-22): drop the handle now.
                    if (campaign.run?.finish == null) {
                        live.remove(work.value, campaign)
                        runCatching { adapter.close() }
                    }
                }
            }
            return ref
        } catch (failure: Throwable) {
            live.remove(work.value)
            runCatching { adapter.close() }
            throw failure
        }
    }

    /** How an opened contract is verified: by its declared or saved tests, or by a review pass. */
    private fun verificationOf(opened: OpenedCampaign, saved: SavedChecks): VerificationSetup {
        val runs = opened.contract.acceptance.filterIsInstance<io.astrolabe.contract.Acceptance.Run>().map { it.command.argv }
        if (runs.isEmpty()) return VerificationSetup("review", "none", emptyList())
        val declared = runs.any { it in opened.sniffed.packages.mapNotNull { p -> p.test } }
        return VerificationSetup("tests", if (declared) "declared" else "saved", runs)
    }

    /** The host notes of a run (D-345): the Studio's guidance and how the result is checked, and the protected files. */
    private fun hostNotes(spec: StartSpec, verification: VerificationSetup?): List<String> {
        val notes = ArrayList<String>()
        if (verification != null) {
            notes += Guidance.NOTES
            notes += Guidance.platform(System.getProperty("os.name"))
            notes += Verification.text(verification)
        }
        spec.protectedPaths?.let { notes += protectedRule(it) }
        return notes
    }

    /**
     * WF-1: the verification an open of [work] will lead to, as far as its notes depend on it — the stored contract's
     * `run:` items; for a new contract, the suites the repository's manifests declare (what `deriveS0` makes `run:`
     * items of), else the setup a contract without any gets. A wrong guess costs the second open it saves, never a wrong note.
     */
    private fun expectedVerification(p: OpenProject, work: WorkId, saved: SavedChecks): VerificationSetup {
        val stored = Contracts(SqliteContractRepository(p.project.store, clock), idGen, clock).current(work)
        if (stored != null) {
            val runs = stored.acceptance.filterIsInstance<io.astrolabe.contract.Acceptance.Run>().map { it.command.argv }
            return if (runs.isEmpty()) VerificationSetup("review", "none", emptyList()) else VerificationSetup("tests", "declared", runs)
        }
        val sniffed = io.astrolabe.atlas.Sniff.commands(p.project.root, listedPaths(p.project.root))
        val suites = sniffed.packages.mapNotNull { it.test }
        return if (suites.isEmpty()) Verification.choose(sniffed, saved) else VerificationSetup("tests", "declared", suites)
    }

    /** The repository's tracked and unignored files, `/`-separated, by one `git ls-files`; empty when git cannot say. */
    private fun listedPaths(root: Path): Set<String> {
        val out = Files.createTempFile("studio-ls-files", ".bin")
        try {
            val process = ProcessBuilder("git", "ls-files", "-z", "--cached", "--others", "--exclude-standard")
                .directory(root.toFile()).redirectOutput(out.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start()
            if (!process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS)) {
                process.destroyForcibly()
                return emptySet()
            }
            if (process.exitValue() != 0) return emptySet()
            return String(Files.readAllBytes(out), Charsets.UTF_8).split('\u0000').filterTo(HashSet()) { it.isNotEmpty() }
        } catch (e: java.io.IOException) {
            return emptySet()
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            return emptySet()
        } finally {
            runCatching { Files.deleteIfExists(out) }
        }
    }

    private fun reconciliationJson(r: Reconciliation): String = json.encodeToString(JsonObject.serializer(), buildJsonObject {
        put("unknownOutcomes", JsonArray(r.unknownOutcomes.map(::JsonPrimitive)))
        put("external", JsonArray(r.external.map { JsonPrimitive(it.toString()) }))
        put("stamp", r.stamp.toString())
        put("handles", JsonArray(r.handles.map(::JsonPrimitive)))
    })

    /** Cancels through the campaign's token (§3.7, D-26): the outcome becomes final `cancelled` (R-CMP-06). */
    public fun cancel(workId: String, reason: String) {
        val c = live[workId] ?: throw NotLive(workId)
        c.opened.cancellation.cancel(reason.ifBlank { "cancelled by the user" })
    }

    /**
     * A user amendment (§4.1, R-CMP-09): appended to the contract as a new request and version. A live campaign
     * sees it next turn; a stopped one is amended through the project's store so the next open unblocks.
     */
    public fun amend(projectId: String, workId: String, text: String): Int {
        live[workId]?.let { return it.opened.contracts.amendByUser(WorkId(workId), text).version }
        val p = project(projectId)
        val contracts = Contracts(SqliteContractRepository(p.project.store, clock), idGen, clock, events)
        return contracts.amendByUser(WorkId(workId), text).version
    }

    /** The contract revision replies are checked against (`Replies.check`). */
    public fun contractRevision(projectId: String, workId: String): Int? =
        live[workId]?.opened?.contract?.version ?: projects[projectId]?.reads?.currentContractVersion(workId)

    /**
     * G-05: resolves a pending amendment through `Contracts.resolve`; an accepted one applies [patchJson]
     * (a `ContractPatch`, §9.4) as the transformation. [outcome] is `Accepted`, `Rejected` or `Pending`.
     */
    public fun resolveAmendment(projectId: String, workId: String, amendmentId: String, outcome: String, reason: String?, patchJson: String?): CompletableFuture<Int> {
        val p = project(projectId)
        val contracts = live[workId]?.opened?.contracts ?: Contracts(SqliteContractRepository(p.project.store, clock), idGen, clock, events)
        val authority = object : Authority by AutonomousAuthority() {
            override suspend fun resolve(proposal: io.astrolabe.event.AmendmentProposal): io.astrolabe.event.Resolution =
                io.astrolabe.event.Resolution(proposal.id, proposal.contractRevision, io.astrolabe.event.ResolutionOutcome.valueOf(outcome), "user", reason)
        }
        return scope.future {
            contracts.resolve(WorkId(workId), amendmentId, authority) { contract -> ContractPatches.apply(contract, patchJson) }
            contracts.current(WorkId(workId))?.version ?: 0
        }
    }

    /** G-11: records reconciliation evidence for an intent left `unknown`; only then may a resume lift the fence. */
    public fun reconcileIntent(projectId: String, intentId: String, evidence: String) {
        require(evidence.isNotBlank()) { "reconciliation needs evidence" }
        SqliteIntentJournal(project(projectId).project.store, clock).reconcile(intentId, evidence)
    }

    /** G-22: publishes a finished campaign still attached in its publication window; each stage is an approval. */
    public fun publish(workId: String, through: String, remote: String?, mergeTarget: String?, deployName: String?, deployProduction: Boolean, knownRemotes: Set<String>, message: String?): CompletableFuture<String> {
        val c = live[workId] ?: throw NotLive(workId)
        val run = c.run ?: throw IllegalStateException("campaign $workId has not finished")
        requireNotNull(run.finish) { "publication follows a finished campaign: $workId has no finish receipt" }
        val request = PublicationRequest(
            Stage.valueOf(through), remote, mergeTarget,
            deployName?.let { DeployTarget(it, deployProduction) }, knownRemotes, message,
        )
        return scope.future {
            val result = c.controller.publish(c.opened, run, request, c.authority, null)
            c.publication = result
            publicationJson(result)
        }
    }

    /** Leaves the publication window: the opened campaign is dropped (the lease stays until expiry). */
    public fun detach(workId: String) {
        val c = live[workId] ?: return
        if (c.running) return
        live.remove(workId)
        runCatching { c.adapter.close() }
    }

    /**
     * Lock recovery (Studio 2 BE-10, finding F-1): a lease names its holder `controller:<pid>`, so after a restart the
     * workspace stays leased to a process that is gone. This backend holds the project lock, so no other controller can
     * own the store: a live lease of another holder is stale. It is ended through the core's own `Leases.acquire`, in
     * the old holder's name with no duration; the next open then takes the workspace under a new generation.
     * Returns the holders released.
     */
    public fun releaseStaleLeases(projectId: String): List<String> {
        val p = project(projectId)
        if (runningWork(projectId) != null) return emptyList()
        val self = "controller:${p.project.store.holder.pid}"
        val leases = io.astrolabe.campaign.Leases(p.project.store, clock)
        val released = ArrayList<String>()
        for (row in p.reads.leases()) {
            val o = row.jsonObject
            val holder = o["holder"]?.jsonPrimitive?.content ?: continue
            val workspace = o["workspaceId"]?.jsonPrimitive?.content ?: continue
            val lease = leases.current(io.astrolabe.id.WorkspaceId(workspace)) ?: continue
            if (holder == self || !lease.validAt(clock.instant())) continue
            val ids = io.astrolabe.id.Identities(WorkId(o["workId"]!!.jsonPrimitive.content), AttemptId(o["attemptId"]!!.jsonPrimitive.content))
            leases.acquire(lease.workspace, ids, holder, Duration.ZERO)
            released += holder
            log.info("released the stale lease of {} held by {} (its process ended)", workspace, holder)
        }
        return released
    }

    /** Lease expiry of an attached campaign, for the countdown (§25.8 LeaseMonitor). */
    public fun leaseExpiry(workId: String): Instant? = live[workId]?.opened?.lease?.expiry

    // ------------------------------------------------------------------------------------------------ reads

    private fun reads(projectId: String): StoreReads = project(projectId).reads

    public fun campaigns(projectId: String): String = reads(projectId).campaigns().toString()

    public fun campaign(projectId: String, workId: String): String? = reads(projectId).campaign(workId)?.toString()

    public fun contract(projectId: String, workId: String): String =
        json.encodeToString(ContractView.serializer(), project(projectId).project.views.contract(WorkId(workId)))

    public fun contractVersions(projectId: String, workId: String): String = reads(projectId).contractVersions(workId).toString()

    public fun requests(projectId: String, workId: String): String = reads(projectId).requests(workId).toString()

    public fun ledger(projectId: String, workId: String): String =
        json.encodeToString(LedgerView.serializer(), project(projectId).project.views.ledger(WorkId(workId)))

    public fun checks(projectId: String, workId: String): String =
        json.encodeToString(ChecksView.serializer(), project(projectId).project.views.checks(WorkId(workId)))

    public fun budget(projectId: String, workId: String): String =
        json.encodeToString(BudgetView.serializer(), project(projectId).project.views.budget(WorkId(workId)))

    public fun receipts(projectId: String, workId: String): String =
        json.encodeToString(ReceiptView.serializer(), project(projectId).project.views.receipts(WorkId(workId)))

    public fun receiptRows(projectId: String, workId: String): String = reads(projectId).receiptsRaw(workId).toString()

    public fun register(projectId: String, contextId: String): String =
        json.encodeToString(RegisterView.serializer(), project(projectId).project.views.register(ContextId(contextId)))

    public fun registerVersions(projectId: String, contextId: String): String = reads(projectId).registerVersions(contextId).toString()

    public fun workset(projectId: String, contextId: String): String =
        json.encodeToString(WorksetView.serializer(), project(projectId).project.views.workset(ContextId(contextId)))

    public fun cells(projectId: String, workId: String): String = reads(projectId).cells(workId).toString()

    public fun turns(projectId: String, contextId: String): String = reads(projectId).turns(contextId).toString()

    public fun manifests(projectId: String, contextId: String): String = reads(projectId).manifests(contextId).toString()

    public fun manifest(projectId: String, manifestId: String): String? = reads(projectId).manifest(manifestId)?.toString()

    public fun journalAfter(projectId: String, workId: String, afterSeq: Long, limit: Int): String =
        reads(projectId).journalAfter(workId, afterSeq, limit.coerceIn(1, 2_000)).toString()

    public fun journalLastSeq(projectId: String, workId: String): Long = reads(projectId).journalLastSeq(workId)

    public fun journalSearch(projectId: String, workId: String, query: String, limit: Int): String {
        val hits = Journal(project(projectId).project.store, clock).search(query, JournalScope(WorkId(workId)), limit.coerceIn(1, 500))
        return buildJsonObject {
            put("complete", hits.complete)
            put("events", json.encodeToJsonElement(ListSerializer(JournalEvent.serializer()), hits.events))
        }.toString()
    }

    public fun usage(projectId: String, workId: String?): String =
        (if (workId == null) reads(projectId).usageAll() else reads(projectId).usage(workId)).toString()

    public fun routing(projectId: String, workId: String): String = reads(projectId).routing(workId).toString()

    public fun handles(projectId: String): String = reads(projectId).handles().toString()

    public fun intents(projectId: String, status: String?): String = reads(projectId).intents(status).toString()

    public fun packets(projectId: String, workId: String, kind: String?): String = reads(projectId).packets(workId, kind).toString()

    public fun notes(projectId: String): String = reads(projectId).notes().toString()

    public fun noteQueue(projectId: String): String = reads(projectId).noteQueue().toString()

    public fun noteRevisions(projectId: String, noteId: String): String = reads(projectId).noteRevisions(noteId).toString()

    public fun noteUsage(projectId: String): String = reads(projectId).noteUsage().toString()

    public fun leases(projectId: String): String = reads(projectId).leases().toString()

    public fun aliases(projectId: String, workId: String): String = reads(projectId).aliases(workId).toString()

    public fun alias(projectId: String, workId: String, n: Long): String? = reads(projectId).alias(workId, n)?.toString()

    public fun stamps(projectId: String, workId: String): String = reads(projectId).stamps(workId).toString()

    public fun claims(projectId: String, workId: String): String = reads(projectId).claims(workId).toString()

    public fun attemptConfig(projectId: String, workId: String): String? = reads(projectId).attemptConfig(workId)?.toString()

    /**
     * The scratch policy [workId]'s attempt froze (W3, owner №32), as its contract records it: the output roots whose
     * untracked files stay outside the candidate. `null` when it excludes nothing — no contract, or one recorded before W3.
     */
    public fun scratchPolicy(projectId: String, workId: String): io.astrolabe.verify.ScratchPolicy? =
        Contracts(SqliteContractRepository(project(projectId).project.store, clock), idGen, clock).current(WorkId(workId))?.scratch
            ?.takeIf { it.id != null }

    public fun storeCounts(projectId: String): String = reads(projectId).counts().toString()

    /** Blob metadata `{digest, kind, bytes, recovery}`; the server applies the exposure policy (§30.4) before [blobBytes]. */
    public fun blobMeta(projectId: String, digest: String): String? = reads(projectId).blobMeta(digest)?.toString()

    public fun blobBytes(projectId: String, digest: String): ByteArray = project(projectId).project.store.blobs.get(Digest(digest))

    public fun stateRoot(projectId: String): Path = project(projectId).project.store.layout.root

    public fun repoRoot(projectId: String): Path = project(projectId).project.root

    /** G-04: the finish receipt from the exported file (the controller writes it at finish), else `null`. */
    public fun finishReceipt(projectId: String, workId: String): String? {
        val layout = project(projectId).project.store.layout
        val file = layout.exports.resolve(workId).resolve("finish-receipt.json")
        return if (Files.isRegularFile(file)) Files.readString(file) else null
    }

    /** The publication result of an attached campaign, if it published this session. */
    public fun publicationResult(workId: String): String? = live[workId]?.publication?.let(::publicationJson)

    private fun publicationJson(run: PublicationRun): String = buildJsonObject {
        put("through", run.request.through.name)
        put("reached", run.reached.name)
        put("results", JsonArray(run.results.map { r ->
            buildJsonObject {
                put("stage", r.stage.name)
                when (r) {
                    is io.astrolabe.campaign.PublicationResult.Published -> { put("result", "published"); put("commit", r.commit); put("target", r.target); put("requestId", r.requestId) }
                    is io.astrolabe.campaign.PublicationResult.Refused -> { put("result", "refused"); put("refusal", r.refusal.toString()) }
                    is io.astrolabe.campaign.PublicationResult.Failed -> { put("result", "failed"); put("requestId", r.requestId); put("detail", r.detail) }
                }
            }
        }))
        put("receipt", json.encodeToJsonElement(io.astrolabe.campaign.FinishReceipt.serializer(), run.receipt))
    }.toString()

    // ------------------------------------------------------------------------------------------------ bus

    public fun subscribe(sink: RecordSink): BusSubscription {
        val subscription = events.subscribe(EventSink { record: EventRecord ->
            val element = json.encodeToJsonElement(EventRecord.serializer(), record)
            val kind = element.jsonObject["event"]?.jsonObject?.get("type")?.jsonPrimitive?.content ?: "unknown"
            sink.onRecord(record.event.ids.work.value, record.seq, kind, element.toString())
        }, 16_384)
        return BusSubscription(subscription)
    }

    public fun busLastSeq(): Long = events.lastSeq

    public fun busSinkFailures(): Long = events.sinkFailures

    // ------------------------------------------------------------------------------------------------ shutdown

    /**
     * §25.13 / R-BE-01: cancels campaign **jobs** (state stays `Running`, the next open records the cell `Lost` and
     * resumes), never the cancellation token; waits for settlement; then closes projects and the bus.
     */
    override fun close() {
        val jobs = live.values.mapNotNull { it.job }
        scope.cancel("backend stopping")
        runBlocking { withTimeoutOrNull(60_000) { jobs.forEach { it.join() } } }
        live.values.forEach { runCatching { it.adapter.close() } }
        live.clear()
        projects.values.forEach { p ->
            runCatching { p.project.close() }
            runCatching { p.sdk.close() }
        }
        projects.clear()
        events.close()
    }

    private companion object {
        val log = LoggerFactory.getLogger(StudioHost::class.java)
    }
}

/** `AutonomousPolicy` as the Studio configures it (Appendix B.1). */
public data class AutonomousPolicyOptions @JvmOverloads constructor(
    val acceptNonWeakening: Boolean = false,
    val reviewer: String? = null,
)
