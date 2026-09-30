package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.ProfileRoles
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import io.astrolabe.studio.bridge.fixture.FixtureRepos
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.ai.gate.Llm
import net.ai.gate.auth.Environment
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The interactive demo through the bridge: a human question and a D-class approval reach the authority port. */
class InteractiveFixtureTest {
    @TempDir
    lateinit var dir: Path

    @Test
    fun `interactive demo asks, needs one approval and completes with the chosen rounding`() {
        val repo = FixtureRepos.demoShop(dir.resolve("repos"))
        val brain = FixtureBrain({ listOf(repo) }, latencyMillis = 0, tokensPerSecond = 0)
        val config = Config(
            stateRoot = dir.resolve("state").toString(),
            profiles = FixtureBrain.profiles().associateBy { it.id },
            profileRoles = ProfileRoles(FixtureBrain.MAIN_PROFILE, FixtureBrain.HELPER_PROFILE),
        )
        val configJson = ConfigSupport.encode(config)
        val asked = CopyOnWriteArrayList<String>()
        val approvals = CopyOnWriteArrayList<String>()
        Llm.builder().provider(brain.provider()).environment(Environment.none()).catalog { it.offline() }.build().use { llm ->
            StudioHost().use { host ->
                host.openProject("p1", repo, configJson, llm)
                val ended = CountDownLatch(1)
                var outcome: String? = null
                var reason: String? = null
                val authority = object : AuthorityPort {
                    override fun ask(workId: String, questionJson: String): CompletableFuture<String?> {
                        val q = ConfigSupport.obj(questionJson)
                        asked += q["text"]!!.jsonPrimitive.content
                        return CompletableFuture.completedFuture("""{"questionId":${q["id"]},"contractRevision":${q["contractRevision"]},"text":"Round to cents (2 decimals)","chosenOption":0,"changesRequirements":false}""")
                    }
                    override fun approve(workId: String, requestJson: String): CompletableFuture<String> {
                        val r = ConfigSupport.obj(requestJson)
                        approvals += r["argv"].toString()
                        return CompletableFuture.completedFuture("""{"requestId":${r["id"]},"contractRevision":${r["contractRevision"]},"approved":true,"reason":"test"}""")
                    }
                    override fun resolve(workId: String, proposalJson: String): CompletableFuture<String> {
                        val p = ConfigSupport.obj(proposalJson)
                        return CompletableFuture.completedFuture("""{"proposalId":${p["id"]},"contractRevision":${p["contractRevision"]},"outcome":"Accepted","byAuthority":"user:test"}""")
                    }
                    override fun review(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
                    override fun decide(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
                }
                val ref = host.start("p1", null, StartSpec(FixtureRepos.DEMO_INTERACTIVE_REQUEST, 400_000), configJson, llm, authority,
                    { _, _, _, _ -> }, AutonomousPolicyOptions()) { _, o, r, _, f -> outcome = o; reason = r ?: f?.toString(); ended.countDown() }
                assertTrue(ended.await(180, TimeUnit.SECONDS), "campaign ended")
                val journal = ConfigSupport.parse(host.journalAfter("p1", ref.workId, 0, 2000)) as JsonArray
                journal.forEach { e -> println("J#${e.jsonObject["seq"]} t=${e.jsonObject["turn"]} ${e.jsonObject["kind"]} :: ${e.jsonObject["text"]?.jsonPrimitive?.content?.take(200)}") }
                println("ASKED $asked APPROVALS $approvals OUTCOME $outcome / $reason")
                assertEquals(1, asked.size, "one question reached the authority")
                assertEquals(1, approvals.size, "one D-class approval reached the authority")
                assertEquals("completed", outcome, reason)
                assertTrue(Files.readString(repo.resolve("src/shop/pricing.py")).contains("round(max(discounted, 0), 2)"), "the answer chose the edit")
            }
        }
    }
}
