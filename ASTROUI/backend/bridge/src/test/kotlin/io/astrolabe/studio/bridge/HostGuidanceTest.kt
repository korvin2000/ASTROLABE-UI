package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.ProfileRoles
import io.astrolabe.cell.Protocol
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.ai.gate.Llm
import net.ai.gate.auth.Environment
import net.ai.gate.chat.AssistantMessage
import net.ai.gate.chat.StopReason
import net.ai.gate.chat.UserMessage
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
import java.security.MessageDigest
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Review 5 P1 #3: the Studio's guidance follows the protocol of the frozen attempt's main line — a direct cell is told
 * `state(note)` and `task(finish)`, never the structured `patch`; the structured guidance keeps its bytes (WF-15).
 */
class HostGuidanceTest {
    @TempDir
    lateinit var dir: Path

    @Test
    fun `the structured guidance keeps its bytes`() {
        val bytes = Guidance.NOTES.toByteArray(Charsets.UTF_8)
        assertEquals(1771, Guidance.NOTES.length)
        assertEquals(STRUCTURED_SHA256, MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) })
        assertTrue(Guidance.notes(Protocol.Structured) === Guidance.NOTES)
        assertTrue(Guidance.DIRECT_NOTES.startsWith(Guidance.MARK), "a contract with the direct notes is not told again")
        assertFalse("\"patch\"" in Guidance.DIRECT_NOTES || "no tool call" in Guidance.DIRECT_NOTES, Guidance.DIRECT_NOTES)
    }

    @Test
    fun `a structured start is told the structured notes and opens once`() {
        val (texts, opens) = start("guide-structured", Protocol.Structured)
        assertEquals(1, opens, "WF-1: the start opened the campaign $opens times")
        assertTrue(texts.any { Guidance.NOTES in it }, "the model saw no structured notes")
        assertTrue(texts.none { Guidance.DIRECT_NOTES in it }, "a structured cell was told the direct notes")
    }

    @Test
    fun `a direct start is told the direct notes and opens once`() {
        val (texts, opens) = start("guide-direct", Protocol.Direct)
        assertEquals(1, opens, "WF-1: the start opened the campaign $opens times")
        assertTrue(texts.any { Guidance.DIRECT_NOTES in it }, "the model saw no direct notes")
        assertTrue(texts.none { Guidance.NOTES in it }, "a direct cell was told the structured notes")
    }

    /** A start in a project without a manifest under [protocol]; the texts every model request carried and the opens. */
    private fun start(name: String, protocol: Protocol): Pair<List<String>, Int> {
        val root = Files.createDirectories(dir.resolve("repos").resolve(name))
        Files.writeString(root.resolve("README.md"), "# $name\n")
        git(root, "init", "-q")
        git(root, "add", "-A")
        git(root, "-c", "user.name=Studio Test", "-c", "user.email=test@astrolabe.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "initial")
        val config = Config(
            stateRoot = dir.resolve("state-$name").toString(),
            profiles = FixtureBrain.profiles().associateBy { it.id },
            profileRoles = ProfileRoles(FixtureBrain.MAIN_PROFILE, null),
            protocol = protocol,
        )
        val configJson = ConfigSupport.encode(config)
        val texts = CopyOnWriteArrayList<String>()
        val opens = CopyOnWriteArrayList<String>()
        val port = object : AuthorityPort {
            override fun ask(workId: String, questionJson: String) = CompletableFuture.completedFuture<String?>(null)
            override fun approve(workId: String, requestJson: String): CompletableFuture<String> = CompletableFuture.failedFuture(IllegalStateException("no approval expected"))
            override fun resolve(workId: String, proposalJson: String): CompletableFuture<String> = CompletableFuture.failedFuture(IllegalStateException("no proposal expected"))
            override fun decide(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
            override fun review(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
        }
        Llm.builder().provider(brain(protocol, texts).provider()).environment(Environment.none()).catalog { it.offline() }.build().use { llm ->
            StudioHost().use { host ->
                host.subscribe { work, _, kind, json ->
                    if (kind == "phase.counted" && ConfigSupport.obj(json)["event"]?.jsonObject?.get("counted")?.jsonPrimitive?.content == "open") opens += work
                }.use {
                    host.openProject("p1", root, configJson, llm)
                    val latch = CountDownLatch(1)
                    val ref = host.start(
                        "p1", null, StartSpec("Say what README.md is for.", 400_000, verificationSetup = true, protectedPaths = emptyList()),
                        configJson, llm, port, { _, _, _, _ -> }, AutonomousPolicyOptions(),
                    ) { _, _, _, _, _ -> latch.countDown() }
                    assertTrue(latch.await(180, TimeUnit.SECONDS), "run ended")
                    return texts.toList() to opens.count { it == ref.workId }
                }
            }
        }
    }

    /** Every request's system prompt and user messages go to [texts]; the main line ends its cell as its [protocol] does. */
    private fun brain(protocol: Protocol, texts: MutableList<String>): FakeProvider {
        fun model(id: String, context: Long, output: Long) = Model.builder(FixtureBrain.PROVIDER, id).name(id).input(Modality.TEXT).output(Modality.TEXT)
            .contextWindow(context).maxOutputTokens(output)
            .supports(Capability.STREAMING, Capability.TOOLS, Capability.PARALLEL_TOOLS, Capability.STRUCTURED_OUTPUT).build()
        val fake = FakeProvider.create(FixtureBrain.PROVIDER, model("astro-demo", 128_000, 8_192), model("astro-demo-helper", 64_000, 4_096))
        fun answer(request: ApiRequest): AssistantMessage {
            fake.respond(::answer)
            val conversation = request.conversation()
            texts += (listOf(conversation.system().orElse("")) + conversation.messages().filterIsInstance<UserMessage>().map { it.text() }).joinToString("\n")
            val builder = AssistantMessage.builder(request.model().ref(), "fake-chat").text("README.md describes the project.")
            if (protocol == Protocol.Direct) builder.add(ToolCall.of("call_${texts.size}", "task", """{"op":"finish","text":"README.md describes the project."}"""))
            return builder.stopReason(if (protocol == Protocol.Direct) StopReason.TOOL_USE else StopReason.STOP)
                .usage(Usage.builder().input(100).output(20).cacheRead(0).cacheWrite(0).build()).build()
        }
        repeat(8) { fake.respond(::answer) }
        return fake
    }

    private fun git(root: Path, vararg args: String) {
        val process = ProcessBuilder(listOf("git") + args).directory(root.toFile()).redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader().readText()
        check(process.waitFor(60, TimeUnit.SECONDS) && process.exitValue() == 0) { "git ${args.joinToString(" ")} failed: $output" }
    }

    private companion object {
        /** SHA-256 of [Guidance.NOTES] as it was before the direct variant (Studio `1f5c1ba`); eval-live's copy pins the same. */
        const val STRUCTURED_SHA256: String = "83f55bce69debe25978b0fa9fc0a9e3a3384201fc2de24df431b9278eeff7845"
    }
}
