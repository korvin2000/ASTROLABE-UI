package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.ProfileRoles
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.ai.gate.Llm
import net.ai.gate.auth.Environment
import net.ai.gate.chat.AssistantMessage
import net.ai.gate.chat.StopReason
import net.ai.gate.chat.content.ToolCall
import net.ai.gate.metadata.Usage
import net.ai.gate.model.Capability
import net.ai.gate.model.Modality
import net.ai.gate.model.Model
import net.ai.gate.spi.protocol.ApiRequest
import net.ai.gate.testing.FakeProvider
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * WF-1 and WF-10 (plan §7.2, W5) through the bridge on the real core with a scripted fake model: a start opens its
 * campaign once (WD-04), and a run whose job died of an error continues in place — Continue reopens the same work, once,
 * and it completes (WD-26). Guards count `phase.counted` opens on the bus, never time.
 */
class StudioWorkflowScenarioTest {
    @TempDir
    lateinit var dir: Path

    private class Ended(val outcome: String?, val reason: String?, val failure: Throwable?)

    /** A Python project: `pyproject.toml` and a `tests/` folder make `python -m unittest` its declared suite; [manifest] false leaves none. */
    private fun repo(name: String, manifest: Boolean): Path {
        val root = Files.createDirectories(dir.resolve("repos").resolve(name))
        Files.writeString(root.resolve("README.md"), "# $name\n")
        Files.writeString(root.resolve(".gitignore"), "__pycache__/\n*.pyc\n")
        if (manifest) {
            Files.writeString(root.resolve("pyproject.toml"), "[project]\nname = \"$name\"\nversion = \"0.1.0\"\n")
            Files.createDirectories(root.resolve("tests"))
            Files.writeString(
                root.resolve("tests/test_hello.py"),
                """
                import os
                import unittest


                class HelloTest(unittest.TestCase):
                    def test_greeting(self):
                        path = os.path.join(os.path.dirname(__file__), "..", "hello.txt")
                        with open(path, encoding="utf-8") as f:
                            self.assertEqual("Hello, world!", f.read().strip())
                """.trimIndent() + "\n",
            )
        }
        git(root, "init", "-q")
        git(root, "add", "-A")
        git(root, "-c", "user.name=Studio Test", "-c", "user.email=test@astrolabe.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "initial")
        return root
    }

    private fun git(root: Path, vararg args: String) {
        val process = ProcessBuilder(listOf("git") + args).directory(root.toFile()).redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader().readText()
        check(process.waitFor(60, TimeUnit.SECONDS) && process.exitValue() == 0) { "git ${args.joinToString(" ")} failed: $output" }
    }

    /** Creates `hello.txt`, runs the acceptance, reports; review cells answer without findings. */
    private fun brain(): FakeProvider {
        fun model(id: String, context: Long, output: Long) = Model.builder(FixtureBrain.PROVIDER, id).name(id).input(Modality.TEXT).output(Modality.TEXT)
            .contextWindow(context).maxOutputTokens(output)
            .supports(Capability.STREAMING, Capability.TOOLS, Capability.PARALLEL_TOOLS, Capability.STRUCTURED_OUTPUT).build()
        val fake = FakeProvider.create(FixtureBrain.PROVIDER, model("astro-demo", 128_000, 8_192), model("astro-demo-helper", 64_000, 4_096))
        fun answer(request: ApiRequest): AssistantMessage {
            fake.respond(::answer)
            val system = request.conversation().system().orElse("")
            val role = Regex("""astrolabe · role (\w+)""").find(system)?.groupValues?.get(1) ?: "implementing"
            val turn = request.conversation().messages().count { it is AssistantMessage }
            val builder = AssistantMessage.builder(request.model().ref(), "fake-chat")
            val calls: List<Pair<String, String>> = if (role != "implementing") emptyList() else when (turn) {
                0 -> listOf("edit" to """{"ops":[{"create":"hello.txt","content":"Hello, world!\n"}],"why":"create the requested file"}""")
                1 -> listOf("verify" to """{"what":"acceptance"}""")
                else -> emptyList()
            }
            builder.text(
                when {
                    role == "review" -> "Reviewed the change against the request: hello.txt exists with the greeting. No findings."
                    calls.isEmpty() -> "hello.txt is created with the greeting."
                    else -> "Working on it."
                },
            )
            calls.forEachIndexed { i, (name, args) -> builder.add(ToolCall.of("call_${turn}_${i + 1}", name, args)) }
            return builder.stopReason(if (calls.isEmpty()) StopReason.STOP else StopReason.TOOL_USE)
                .usage(Usage.builder().input(100).output(20).cacheRead(0).cacheWrite(0).build()).build()
        }
        repeat(8) { fake.respond(::answer) }
        return fake
    }

    /** The host's answers; [review] is what the host's review pass returns for a `check:` item. */
    private fun authority(review: (String) -> CompletableFuture<String?>) = object : AuthorityPort {
        override fun ask(workId: String, questionJson: String) = CompletableFuture.completedFuture<String?>(null)
        override fun approve(workId: String, requestJson: String): CompletableFuture<String> = CompletableFuture.failedFuture(IllegalStateException("no approval expected"))
        override fun resolve(workId: String, proposalJson: String): CompletableFuture<String> = CompletableFuture.failedFuture(IllegalStateException("no proposal expected"))
        override fun decide(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
        override fun review(workId: String, requestJson: String) = review(requestJson)
    }

    private fun approve(requestJson: String): CompletableFuture<String?> {
        val r = ConfigSupport.obj(requestJson)
        return CompletableFuture.completedFuture(
            """{"requestId":${r["id"]},"contractRevision":${r["contractRevision"]},"reviewedCandidate":${r["candidate"]},"outcome":"Approve","confidence":0.8,"signedBy":"studio:review-pass"}""",
        )
    }

    private class Session(val host: StudioHost, val llm: Llm, val configJson: String, val opens: MutableList<String>) {
        /** `phase.counted` opens of [workId] seen on the bus so far. */
        fun opens(workId: String): Int = opens.count { it == workId }
    }

    private fun <T> session(name: String, manifest: Boolean, body: (Session) -> T): T {
        val repo = repo(name, manifest)
        val config = Config(
            stateRoot = dir.resolve("state-$name").toString(),
            profiles = FixtureBrain.profiles().associateBy { it.id },
            profileRoles = ProfileRoles(FixtureBrain.MAIN_PROFILE, null),
        )
        val configJson = ConfigSupport.encode(config)
        val opens = CopyOnWriteArrayList<String>()
        Llm.builder().provider(brain().provider()).environment(Environment.none()).catalog { it.offline() }.build().use { llm ->
            StudioHost().use { host ->
                host.subscribe { work, _, kind, json ->
                    if (kind == "phase.counted" && ConfigSupport.obj(json)["event"]?.jsonObject?.get("counted")?.jsonPrimitive?.content == "open") opens += work
                }.use {
                    host.openProject("p1", repo, configJson, llm)
                    return body(Session(host, llm, configJson, opens))
                }
            }
        }
    }

    private fun spec() = StartSpec("Create hello.txt containing the text Hello, world!", 400_000, verificationSetup = true, protectedPaths = emptyList())

    private fun start(s: Session, port: AuthorityPort): Pair<CampaignRef, Ended> {
        val latch = CountDownLatch(1)
        var ended = Ended(null, null, null)
        val ref = s.host.start("p1", null, spec(), s.configJson, s.llm, port, { _, _, _, _ -> }, AutonomousPolicyOptions()) { _, o, r, _, f ->
            ended = Ended(o, r, f); latch.countDown()
        }
        assertTrue(latch.await(180, TimeUnit.SECONDS), "run ended")
        return ref to ended
    }

    private fun resume(s: Session, workId: String, port: AuthorityPort): Pair<CampaignRef, Ended> {
        val latch = CountDownLatch(1)
        var ended = Ended(null, null, null)
        val ref = s.host.resume("p1", workId, spec(), s.configJson, s.llm, port, { _, _, _, _ -> }, AutonomousPolicyOptions()) { _, o, r, _, f ->
            ended = Ended(o, r, f); latch.countDown()
        }
        assertTrue(latch.await(180, TimeUnit.SECONDS), "resumed run ended")
        return ref to ended
    }

    @Test
    fun `a start opens its campaign once, with the host notes and the protected files`() {
        session("wf1-start", manifest = true) { s ->
            val (ref, ended) = start(s, authority(::approve))
            assertEquals(1, s.opens(ref.workId), "WF-1: a start opened the campaign ${s.opens(ref.workId)} times")
            assertEquals("tests", ref.verification?.kind)
            assertEquals("python -m unittest discover -s tests", ref.verification?.commandText)
            println("WF-1 start: outcome=${ended.outcome} reason=${ended.reason}")
        }
    }

    @Test
    fun `Continue after a run died of an error reopens the same work once and it completes`() {
        session("wf10-failed", manifest = false) { s ->
            // The host's review pass fails in transport: the error ends the run job, the campaign stays open in the core.
            val (ref, failed) = start(s, authority { CompletableFuture.failedFuture(IllegalStateException("review transport down")) })
            assertNull(failed.outcome, "the run died of its error: ${failed.reason}")
            assertTrue(failed.failure != null, "the run ended on an error")
            val before = s.opens(ref.workId)
            val (again, ended) = resume(s, ref.workId, authority(::approve))
            assertEquals(ref.workId, again.workId, "WF-10: Continue reopened another work")
            assertEquals(1, s.opens(ref.workId) - before, "WF-1: Continue opened the campaign ${s.opens(ref.workId) - before} times")
            assertEquals("completed", ended.outcome, ended.reason)
            val campaigns = ConfigSupport.parse(s.host.campaigns("p1")) as JsonArray
            assertEquals(1, campaigns.size, "one work for the task: $campaigns")
        }
    }
}
