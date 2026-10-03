package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import io.astrolabe.studio.bridge.fixture.FixtureRepos
import net.ai.gate.Llm
import net.ai.gate.auth.Environment
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlinx.serialization.json.jsonPrimitive

/** ASTROLABE 2.0 C4: the run's limits reach the core; a request limit stops the run, a raised one continues the same work. */
class TaskLimitsTest {
    @TempDir
    lateinit var dir: Path

    private class Ended {
        val latch = CountDownLatch(1)
        var outcome: String? = null
        var code: String? = null
        var reason: String? = null
    }

    @Test
    fun `a request limit stops the run and a raised one continues the same work`() {
        val repo = FixtureRepos.demoShop(dir.resolve("repos"))
        val brain = FixtureBrain({ listOf(repo) }, latencyMillis = 0, tokensPerSecond = 0)
        val config = Config(
            stateRoot = dir.resolve("state").toString(),
            profiles = FixtureBrain.profiles().associateBy { it.id },
            profileRoles = io.astrolabe.ProfileRoles(FixtureBrain.MAIN_PROFILE, FixtureBrain.HELPER_PROFILE),
        )
        val configJson = ConfigSupport.encode(config)
        val authority = object : AuthorityPort {
            override fun ask(workId: String, questionJson: String) = CompletableFuture.completedFuture<String?>(null)
            override fun approve(workId: String, requestJson: String): CompletableFuture<String> {
                val req = ConfigSupport.obj(requestJson)
                return CompletableFuture.completedFuture("""{"requestId":${req["id"]},"contractRevision":${req["contractRevision"]},"approved":true,"reason":"test"}""")
            }
            override fun resolve(workId: String, proposalJson: String): CompletableFuture<String> {
                val p = ConfigSupport.obj(proposalJson)
                return CompletableFuture.completedFuture("""{"proposalId":${p["id"]},"contractRevision":${p["contractRevision"]},"outcome":"Accepted","byAuthority":"user:test"}""")
            }
            override fun review(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
            override fun decide(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
        }
        Llm.builder().provider(brain.provider()).environment(Environment.none()).catalog { it.offline() }.build().use { llm ->
            StudioHost().use { host ->
                host.openProject("p1", repo, configJson, llm)
                val first = Ended()
                val spec = StartSpec(FixtureRepos.DEMO_REQUEST, 400_000, limits = TaskLimits(requests = 1), preset = "economy")
                val ref = host.start("p1", null, spec, configJson, llm, authority, { _, _, _, _ -> }, AutonomousPolicyOptions()) { _, o, r, c, f ->
                    first.outcome = o; first.code = c; first.reason = r ?: f?.toString(); first.latch.countDown()
                }
                kotlin.test.assertTrue(first.latch.await(180, TimeUnit.SECONDS), "first run ended")
                assertEquals("budget_exhausted", first.outcome, first.reason)
                assertEquals("task_limit_requests", first.code, first.reason)

                // A reopen that does not raise the reached limit leaves the campaign stopped, and the ref says what holds it
                // (C14: the core's LimitHold). With the Studio's notes it is still one open: one journal line, one event.
                val again = Ended()
                val stopped = java.util.concurrent.CopyOnWriteArrayList<String>()
                val busFrom = host.busLastSeq()
                val subscription = host.subscribe { _, seq, kind, record -> if (kind == "budget.limit_reached" && seq > busFrom) stopped += record }
                val stillBefore = stillLines(host, ref.workId)
                val noted = spec.copy(verificationSetup = true)
                val still = host.resume("p1", ref.workId, noted, configJson, llm, authority, { _, _, _, _ -> }, AutonomousPolicyOptions()) { _, o, r, c, f ->
                    again.outcome = o; again.code = c; again.reason = r ?: f?.toString(); again.latch.countDown()
                }
                val hold = ConfigSupport.obj(checkNotNull(still.limitHold) { "the ref names the hold" })
                assertEquals("task_limit_requests", hold["stop"]?.jsonPrimitive?.content)
                kotlin.test.assertTrue(again.latch.await(180, TimeUnit.SECONDS), "unchanged reopen ended")
                assertEquals("budget_exhausted", again.outcome, again.reason)
                assertEquals(1, stillLines(host, ref.workId) - stillBefore, "one 'still reached' line per reopen")
                assertEquals(1, stopped.size, "one budget.limit_reached event per reopen: $stopped")
                subscription.close()

                val servedAtStop = brain.served()
                val second = Ended()
                val raisedRef = host.resume("p1", ref.workId, noted.copy(limits = TaskLimits(requests = 500)), configJson, llm, authority, { _, _, _, _ -> }, AutonomousPolicyOptions()) { _, o, r, c, f ->
                    second.outcome = o; second.code = c; second.reason = r ?: f?.toString(); second.latch.countDown()
                }
                kotlin.test.assertNull(raisedRef.limitHold)
                kotlin.test.assertTrue(second.latch.await(180, TimeUnit.SECONDS), "continued run ended")
                // The fixture brain's script does not replay a stopped cell, so how the continued run ends is the
                // script's; what C4 owns is that the raised limit lets the same work call the model again.
                assertNotEquals("budget_exhausted", second.outcome, second.reason)
                kotlin.test.assertTrue(brain.served() > servedAtStop, "the continued run called the model")
            }
        }
    }

    @Test
    fun `a spec without limits keeps the stored ones and cleared limits remove them`() {
        StudioHost().use { host ->
            kotlin.test.assertNull(host.corePolicy(StartSpec("x", 1)).limits)
            assertEquals(io.astrolabe.budget.TaskLimits.NONE, host.corePolicy(StartSpec("x", 1, limits = TaskLimits())).limits)
            val named = host.corePolicy(StartSpec("x", 1, limits = TaskLimits("7.50", 90, null), preset = "thorough"))
            assertEquals(java.math.BigDecimal("7.50"), named.limits?.maxCost?.amount)
            assertEquals(90, named.limits?.maxMinutes)
            assertEquals(io.astrolabe.BalanceProfile.Thorough, named.balance)
        }
    }

    /** The journal lines of [work] that say a task limit still holds it after an open. */
    private fun stillLines(host: StudioHost, work: String): Int =
        Regex(Regex.escape("limits: still reached")).findAll(host.journalAfter("p1", work, 0, 2_000)).count()

    @Test
    fun `stop codes read as wire words whatever form names them`() {
        // C14: the core writes budget stops as wire words; a state stored before names the constant, read by the core.
        assertEquals("task_limit_money", StopCodes.budgetStop("task_limit_money"))
        assertEquals("task_limit_money", StopCodes.budgetStop("TaskLimitMoney"))
        assertEquals("contract_budget", StopCodes.budgetStop("ContractBudget"))
        assertEquals("cell_cap", StopCodes.budgetStop("cell_cap"))
        assertEquals("something_else", StopCodes.budgetStop("something_else"))
        kotlin.test.assertNull(StopCodes.budgetStop(null))
        // StopCode still crosses by its constant name.
        assertEquals("acceptance_decision", StopCodes.wire("AcceptanceDecision"))
        assertEquals("integrity_review", StopCodes.wire("integrity_review"))
        assertEquals("something_else", StopCodes.wire("something_else"))
        kotlin.test.assertNull(StopCodes.wire(null))
    }

    @Test
    fun `the approach steps a default effort and never the one the user chose`() {
        val brain = FixtureBrain({ emptyList() }, latencyMillis = 0, tokensPerSecond = 0)
        val main = FixtureBrain.profiles().first { it.id == FixtureBrain.MAIN_PROFILE }
        val economy = io.astrolabe.BalanceProfiles.vector(io.astrolabe.BalanceProfile.Economy)
        Llm.builder().provider(brain.provider()).environment(Environment.none()).catalog { it.offline() }.build().use { llm ->
            val adapter = io.astrolabe.provider.aigate.AiGateAdapter(llm, listOf(main), false)
            StudioHost().use { host ->
                val estimator = io.astrolabe.budget.HeuristicEstimator()
                val byApproach = host.cellModel(adapter, main, estimator, StartSpec("x", 1, effort = "Medium"))
                val chosen = host.cellModel(adapter, main, estimator, StartSpec("x", 1, effort = "Medium", effortExplicit = true))
                kotlin.test.assertFalse(byApproach.effortExplicit)
                assertEquals(io.astrolabe.provider.Effort.Low, io.astrolabe.BalanceProfiles.effort(byApproach, economy))
                assertEquals(io.astrolabe.provider.Effort.Medium, io.astrolabe.BalanceProfiles.effort(chosen, economy))
            }
            adapter.close()
        }
    }
}
