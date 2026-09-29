package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import io.astrolabe.studio.bridge.fixture.FixtureRepos
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.ai.gate.Llm
import net.ai.gate.auth.Environment
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** T-03/T-05: a whole campaign through the bridge, the real AiGateAdapter and the fixture brain on the demo repository. */
class FixtureCampaignTest {
    @TempDir
    lateinit var dir: Path

    @Test
    fun `demo campaign completes on evidence through the bridge`() {
        val repo = FixtureRepos.demoShop(dir.resolve("repos"))
        val brain = FixtureBrain({ listOf(repo) }, latencyMillis = 0, tokensPerSecond = 0)
        val config = Config(
            stateRoot = dir.resolve("state").toString(),
            profiles = FixtureBrain.profiles().associateBy { it.id },
            profileRoles = io.astrolabe.ProfileRoles(FixtureBrain.MAIN_PROFILE, FixtureBrain.HELPER_PROFILE),
        )
        val configJson = ConfigSupport.encode(config)
        val kinds = CopyOnWriteArrayList<String>()
        Llm.builder().provider(brain.provider()).environment(Environment.none()).catalog { it.offline() }.build().use { llm ->
            StudioHost().use { host ->
                host.subscribe { _, _, kind, _ -> kinds += kind }.use {
                    host.openProject("p1", repo, configJson, llm)
                    val ended = CountDownLatch(1)
                    var outcome: String? = null
                    var reason: String? = null
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
                    }
                    val ref = host.start(
                        "p1", null, StartSpec(FixtureRepos.DEMO_REQUEST, 400_000), configJson, llm, authority,
                        { _, _, _, _ -> }, AutonomousPolicyOptions(),
                    ) { _, o, r, f -> outcome = o; reason = r ?: f?.toString(); ended.countDown() }
                    assertTrue(ended.await(180, TimeUnit.SECONDS), "campaign ended")
                    val journal = ConfigSupport.parse(host.journalAfter("p1", ref.workId, 0, 2000)) as JsonArray
                    journal.forEach { e ->
                        val o = e.jsonObject
                        println("J#${o["seq"]} t=${o["turn"]} ${o["kind"]} :: ${o["text"]?.jsonPrimitive?.content?.take(220)}")
                    }
                    println("KINDS: ${kinds.distinct()}")
                    println("OUTCOME: $outcome / $reason / brain served ${brain.served()}")
                    println("CAMPAIGNS: " + host.campaigns("p1").take(600))
                    println("FINISH: " + host.finishReceipt("p1", ref.workId)?.take(1500))
                    val cells = ConfigSupport.parse(host.cells("p1", ref.workId)) as JsonArray
                    cells.forEach { c ->
                        val ctx = c.jsonObject["contextId"]!!.jsonPrimitive.content
                        println("CELL $ctx :: " + c.toString().take(600))
                        println("REGISTER $ctx :: " + host.register("p1", ctx).take(2500))
                    }
                    assertEquals("completed", outcome, reason)
                }
            }
        }
    }
}
