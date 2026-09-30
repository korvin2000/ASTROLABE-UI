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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Spike S-1 (Studio 2 §12.5): in a repository without any manifest the core refuses to open; the bridge amends the
 * contract with a `run:` or a `check:` item and the run starts and completes.
 */
class VerificationSetupTest {
    @TempDir
    lateinit var dir: Path

    private class Ended(val outcome: String?, val reason: String?, val code: String? = null)

    /** A repository without any manifest; [tests] adds a unittest suite that no manifest declares. */
    private fun repo(name: String, tests: Boolean): Path {
        val root = Files.createDirectories(dir.resolve("repos").resolve(name))
        Files.writeString(root.resolve("README.md"), "# $name\n")
        if (tests) {
            Files.writeString(root.resolve(".gitignore"), "__pycache__/\n*.pyc\n")
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

    /** A scripted model: creates `hello.txt`, runs the acceptance, reports. Review cells answer without findings. */
    private fun brain(): FakeProvider {
        val model = Model.builder(FixtureBrain.PROVIDER, "astro-demo").name("spike").input(Modality.TEXT).output(Modality.TEXT)
            .contextWindow(128_000).maxOutputTokens(8_192)
            .supports(Capability.STREAMING, Capability.TOOLS, Capability.PARALLEL_TOOLS, Capability.STRUCTURED_OUTPUT).build()
        val helper = Model.builder(FixtureBrain.PROVIDER, "astro-demo-helper").name("spike helper").input(Modality.TEXT).output(Modality.TEXT)
            .contextWindow(64_000).maxOutputTokens(4_096)
            .supports(Capability.STREAMING, Capability.TOOLS, Capability.PARALLEL_TOOLS, Capability.STRUCTURED_OUTPUT).build()
        val fake = FakeProvider.create(FixtureBrain.PROVIDER, model, helper)
        fun answer(request: ApiRequest): AssistantMessage {
            fake.respond(::answer)
            val system = request.conversation().system().orElse("")
            val role = Regex("""astrolabe · role (\w+)""").find(system)?.groupValues?.get(1) ?: "implementing"
            val turn = request.conversation().messages().count { it is AssistantMessage }
            println("SPIKE role=$role turn=$turn")
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

    private fun run(name: String, saved: SavedChecks, verificationSetup: Boolean = true, hostReview: Boolean = false): Triple<CampaignRef, Ended, String> {
        val repo = repo(name, tests = !saved.isEmpty)
        val config = Config(
            stateRoot = dir.resolve("state-$name").toString(),
            profiles = FixtureBrain.profiles().associateBy { it.id },
            profileRoles = ProfileRoles(FixtureBrain.MAIN_PROFILE, null),
        )
        val configJson = ConfigSupport.encode(config)
        val authority = object : AuthorityPort {
            override fun ask(workId: String, questionJson: String) = CompletableFuture.completedFuture<String?>(null)
            override fun approve(workId: String, requestJson: String): CompletableFuture<String> = CompletableFuture.failedFuture(IllegalStateException("no approval expected"))
            override fun resolve(workId: String, proposalJson: String): CompletableFuture<String> = CompletableFuture.failedFuture(IllegalStateException("no proposal expected"))
            override fun decide(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
            override fun review(workId: String, requestJson: String): CompletableFuture<String?> {
                if (!hostReview) return CompletableFuture.completedFuture(null)
                val r = ConfigSupport.obj(requestJson)
                return CompletableFuture.completedFuture(
                    """{"requestId":${r["id"]},"contractRevision":${r["contractRevision"]},"reviewedCandidate":${r["candidate"]},"outcome":"Approve","confidence":0.8,"signedBy":"studio:review-pass"}""",
                )
            }
        }
        Llm.builder().provider(brain().provider()).environment(Environment.none()).catalog { it.offline() }.build().use { llm ->
            StudioHost().use { host ->
                host.openProject("p1", repo, configJson, llm)
                val latch = CountDownLatch(1)
                var ended = Ended(null, null)
                val ref = host.start(
                    "p1", null,
                    StartSpec("Create hello.txt containing the text Hello, world!", 400_000, verificationSetup = verificationSetup, savedChecks = saved),
                    configJson, llm, authority, { _, _, _, _ -> }, AutonomousPolicyOptions(),
                ) { _, o, r, code, f -> ended = Ended(o, r ?: f?.toString(), code); latch.countDown() }
                assertTrue(latch.await(180, TimeUnit.SECONDS), "run ended")
                val journal = ConfigSupport.parse(host.journalAfter("p1", ref.workId, 0, 2000)) as JsonArray
                journal.forEach { e -> println("J ${e.jsonObject["kind"]} :: ${e.jsonObject["text"]?.jsonPrimitive?.content?.take(200)}") }
                println("S-1 $name: outcome=${ended.outcome} reason=${ended.reason} verification=${ref.verification}")
                return Triple(ref, ended, host.contract("p1", ref.workId))
            }
        }
    }

    @Test
    fun `without setup the core refuses a repository that declares no checks`() {
        val (ref, ended, _) = run("refused", SavedChecks(), verificationSetup = false)
        assertNotNull(ref.stopReason)
        assertTrue(ref.stopReason!!.contains("nothing to accept against"), ref.stopReason)
        assertEquals("waiting_for_input", ended.outcome)
    }

    @Test
    fun `a saved check command becomes a run item and the task completes`() {
        val (ref, ended, contract) = run("run-item", SavedChecks.of("python -m unittest discover -s tests", null, null))
        assertEquals("tests", ref.verification?.kind)
        assertEquals("python -m unittest discover -s tests", ref.verification?.commandText)
        assertEquals(null, ref.stopReason)
        assertTrue(contract.contains("unittest"), contract)
        assertEquals("completed", ended.outcome, ended.reason)
    }

    @Test
    fun `without any command a check item is reviewed by the host and the task completes`() {
        val (ref, ended, _) = run("check-item", SavedChecks(), hostReview = true)
        assertEquals("review", ref.verification?.kind)
        assertEquals(null, ref.stopReason)
        assertEquals("completed", ended.outcome, ended.reason)
    }

    @Test
    fun `a check item without a host verdict waits for the user's decision, never fails (phase 0)`() {
        val (_, ended, _) = run("check-unreviewed", SavedChecks())
        assertEquals("waiting_for_input", ended.outcome, ended.reason)
        assertEquals("acceptance_decision", ended.code)
        assertTrue(ended.reason!!.contains("acceptance needs a decision"), ended.reason)
    }

    @Test
    fun `saved commands are split into argv`() {
        assertEquals(listOf("npm", "run", "test:unit"), Verification.argv("npm run  test:unit"))
        assertEquals(listOf("python", "-m", "pytest", "my tests"), Verification.argv("python -m pytest \"my tests\""))
        assertEquals(emptyList(), Verification.argv("   "))
    }
}
