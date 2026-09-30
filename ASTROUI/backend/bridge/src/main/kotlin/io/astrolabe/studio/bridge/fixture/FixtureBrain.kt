package io.astrolabe.studio.bridge.fixture

import io.astrolabe.provider.BillingDimension
import io.astrolabe.provider.CacheCapability
import io.astrolabe.provider.Capabilities
import io.astrolabe.provider.PriceTable
import io.astrolabe.provider.Profile
import io.astrolabe.provider.SchemaDialect
import net.ai.gate.Provider
import net.ai.gate.chat.AssistantMessage
import net.ai.gate.chat.StopReason
import net.ai.gate.chat.ToolResultMessage
import net.ai.gate.chat.UserMessage
import net.ai.gate.chat.content.ToolCall
import net.ai.gate.metadata.Usage
import net.ai.gate.model.Capability
import net.ai.gate.model.Modality
import net.ai.gate.model.Model
import net.ai.gate.model.Prices
import net.ai.gate.spi.protocol.ApiRequest
import net.ai.gate.testing.FakeProvider
import java.math.BigDecimal
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicInteger
import java.util.function.Supplier

/**
 * Fixture mode's scripted model (§24.3): answers every request of provider [PROVIDER] through the SDK's
 * `FakeProvider`, so the real `AiGateAdapter`, the real `Llm`, streaming, usage and the whole ASTROLABE campaign run
 * unchanged — only the wire endpoint is simulated. The script reads the request (role from the `[S]` system text, turn
 * from the transcript, results from tool messages) and plays the demo-shop scenario; it never claims completion
 * itself: the verifier decides. Labelled "Demo data" everywhere it appears.
 */
public class FixtureBrain @JvmOverloads constructor(
    /** Repository roots the script may resolve paths against: the projects of the working demo runs, else every open project. */
    private val roots: Supplier<List<Path>>,
    /** Artificial think time per reply, so live views have something to show. */
    private val latencyMillis: Long = 900,
    tokensPerSecond: Int = 60,
) {
    public val fake: FakeProvider = FakeProvider.create(PROVIDER, demoModel("astro-demo", 128_000, 8_192), demoModel("astro-demo-helper", 64_000, 4_096))
    private val served = AtomicInteger()

    init {
        fake.pacing(tokensPerSecond)
        repeat(QUEUE) { fake.respond(::answer) }
    }

    public fun provider(): Provider = fake.provider()

    /** Requests answered so far. */
    public fun served(): Int = served.get()

    private fun answer(request: ApiRequest): AssistantMessage {
        // Keep the queue topped up: every served reply enqueues its successor.
        fake.respond(::answer)
        served.incrementAndGet()
        if (latencyMillis > 0) Thread.sleep(latencyMillis)
        val system = request.conversation().system().orElse("")
        val role = Regex("""astrolabe · role (\w+)""").find(system)?.groupValues?.get(1) ?: "implementing"
        val messages = request.conversation().messages()
        val turn = messages.count { it is AssistantMessage }
        val results = messages.filterIsInstance<ToolResultMessage>().flatMap { it.results() }.map { it.text() }
        val userText = messages.filterIsInstance<UserMessage>().joinToString("\n") { it.text() }
        if (System.getProperty("studio.fixture.debug") != null) println("BRAIN role=$role turn=$turn results=${results.map { it.take(600) }}")
        val reply = if (system.startsWith(io.astrolabe.studio.bridge.Verification.REVIEW_MARKER)) {
            review(userText)
        } else when (role) {
            "implementing", "writer", "repair" -> implementing(turn, results, userText + "\n" + system)
            "plan" -> Reply("The request is small and local; one increment covers it.", emptyList())
            "review" -> Reply("Reviewed the diff against the acceptance criteria; no findings.", emptyList())
            "probe" -> Reply("apply_discount is called only from cart_total; no other callers.", emptyList())
            else -> Reply("Nothing further for the $role role.", emptyList())
        }
        val builder = AssistantMessage.builder(request.model().ref(), "fake-chat")
        builder.text(reply.text)
        reply.calls.forEachIndexed { i, (name, args) -> builder.add(ToolCall.of("call_${turn}_${i + 1}", name, args)) }
        val input = (system.length + messages.sumOf { it.toString().length }) / 4L
        val output = (reply.text.length + reply.calls.sumOf { it.second.length }) / 4L
        return builder.stopReason(if (reply.calls.isEmpty()) StopReason.STOP else StopReason.TOOL_USE)
            .usage(Usage.builder().input(input.coerceAtLeast(1)).output(output.coerceAtLeast(1)).cacheRead(0).cacheWrite(0).build())
            .build()
    }

    private data class Reply(val text: String, val calls: List<Pair<String, String>>, val reasoning: String? = null)

    /**
     * The demo reviewer (phase 0 B1): a keyword of the task's request picks the verdict, so each branch of the review
     * pass can be exercised without a live model — `[review:revise]`, `[review:minor]`, `[review:cannot]`,
     * `[review:vague]` (revise without a finding), `[review:garbage]` (no verdict); otherwise it approves.
     */
    private fun review(request: String): Reply {
        val json = when {
            "[review:revise]" in request -> """{"verdict":"revise","summary":"The discount is not clamped.","findings":[{"severity":"major","location":"src/pricing.py:12","issue":"a discount above 100% makes the price negative"}]}"""
            "[review:minor]" in request -> """{"verdict":"revise","summary":"Fine apart from naming.","findings":[{"severity":"minor","location":"src/pricing.py:3","issue":"the name pct is terse"}]}"""
            "[review:cannot]" in request -> """{"verdict":"cannot_verify","summary":"The request asks to open a browser.","findings":[],"missing":"whether the page opened in a browser leaves no trace in files"}"""
            "[review:vague]" in request -> """{"verdict":"revise","summary":"Not sure this is right.","findings":[]}"""
            "[review:garbage]" in request -> "I think it is probably fine."
            else -> """{"verdict":"approve","summary":"The change does what was asked.","findings":[]}"""
        }
        return Reply(json, emptyList())
    }

    /**
     * The interactive demo (a request asking to be consulted): a question for the human, a D-class approval for a
     * harmless `git stash list` (a git-ref pattern, so the harness asks), then the edit the answer selects.
     */
    private fun interactive(turn: Int, results: List<String>, context: String, content: ByteArray?, buggy: Boolean): Reply {
        val answered = results.firstOrNull { it.contains("answered (") }
        val alreadyKnown = ROUND_WORDS.any { context.contains(it, ignoreCase = true) } && !context.contains("Ask me", ignoreCase = true)
        val rounding = (answered ?: context).let { it.contains("cents", ignoreCase = true) || it.contains("2 decimals", ignoreCase = true) }
        val runResult = results.lastOrNull { it.contains("tool=run") }
        val runAlias = runResult?.let { Regex("""⟦result (#\d+) tool=run""").find(it)?.groupValues?.get(1) }
        return when (turn) {
            0 -> Reply(
                "Reading the pricing logic and its tests. The request leaves rounding open, so I'm asking before I change behaviour.",
                buildList {
                    add(look("read", PRICING_PATH))
                    add(look("read", TESTS_PATH))
                    add(state(
                        """{"plan.add":{"text":"read pricing.py and the tests that pin it"}}""",
                        """{"plan.add":{"text":"check whether CI workflows under .github pin pricing"}}""",
                        """{"plan.add":{"text":"apply the discount as a percentage, clamp at zero, round as agreed","accept":"AC-1"}}""",
                        """{"plan.add":{"text":"run the tests","accept":"AC-1"}}""",
                        """{"plan.tick":{"n":1,"evidence":"op:1"}}""",
                        """{"plan.cursor":2}""",
                        """{"fact.add":{"kind":"h","text":"the tests do not pin rounding; the user decides"}}""",
                        """{"next":"ask the user how totals are rounded"}""",
                    ))
                    if (!alreadyKnown) add("task" to """{"op":"ask","question":"How should cart totals be rounded after the discount?","options":["Round to cents (2 decimals)","Keep full precision"]}""")
                },
            )
            1 -> Reply(
                (if (answered != null) "Noted: ${if (rounding) "totals round to cents" else "totals keep full precision"}. " else "") +
                    "Before editing I'll look at the history of the CI workflows under `.github`; that path is protected, so I need your approval first.",
                listOf(
                    "run" to """{"argv":["git","log","-1","--oneline","--","${".github"}"],"intent":"see whether CI workflows pin pricing before editing"}""",
                    state(
                        """{"decision.add":{"text":"${if (rounding) "round totals to cents" else "keep full precision"}","because":"the user decided (answer recorded as evidence)","rejected":"${if (rounding) "full precision" else "rounding to cents"}"}}""",
                        """{"next":"read the CI history, then edit apply_discount"}""",
                    ),
                ),
            )
            2 -> {
                val step2 = if (runAlias != null) """{"plan.tick":{"n":2,"evidence":"$runAlias"}}""" else """{"plan.cancel":{"n":2,"reason":"the CI history read was not approved"}}"""
                if (buggy && content != null) Reply(
                    (if (runAlias != null) "No workflow under `.github` pins pricing. " else "Skipping the CI history (not approved). ") +
                        "Applying the discount as a percentage with a floor of zero" + (if (rounding) ", rounded to cents." else ", keeping full precision."),
                    listOf(
                        edit(PRICING_PATH, sha256(content), FixtureRepos.BUGGY_BODY, if (rounding) FixtureRepos.FIXED_BODY_ROUNDED else FixtureRepos.FIXED_BODY),
                        state(step2, """{"plan.cursor":3}""", """{"next":"run the tests"}"""),
                    ),
                ) else Reply(
                    "The fix is already in place; moving on to the tests.",
                    listOf(state(step2, """{"plan.cursor":3}""", """{"next":"run the tests"}""")),
                )
            }
            3 -> Reply(
                "Running the tests on the changed code.",
                listOf(
                    verify("acceptance"),
                    state(
                        """{"plan.tick":{"n":3,"evidence":"op:1"},"if":"green(op:1)"}""",
                        """{"plan.tick":{"n":4,"evidence":"op:1"},"if":"green(op:1)"}""",
                        """{"fact.add":{"kind":"v","text":"the tests pass with the change in place","evidence":"op:1"},"if":"green(op:1)"}""",
                        """{"next":"report completion"}""",
                    ),
                ),
            )
            else -> Reply("The tests pass; the rounding rule you chose is in place.", emptyList())
        }
    }

    /**
     * The demo outside the demo repository: look around, write one file, check, report. The file is the one the
     * request names (a follow-up names another), else `demo-note.md`; an existing file is left alone, and the
     * script says so instead of trying to write it.
     */
    private fun anywhere(turn: Int, results: List<String>, context: String): Reply {
        // The contract names the request as `R1: <text>  accept: …`; a follow-up carries a recap before the new words.
        val request = context.substringAfter("R1: ", context).substringBefore("  accept:").substringAfterLast("[End of context]")
            .lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
        val named = FILE_NAME.findAll(request).map { it.value.trim('`', '"', '\'', '.', ',') }
            .firstOrNull { it.isNotEmpty() && !it.startsWith("/") && ".." !in it && ':' !in it }
        val path = named ?: "demo-note.md"
        val wrote = results.any { it.contains("tool=edit") && it.contains("status=ok") }
        val refused = results.any { it.contains("tool=edit") && !it.contains("status=ok") }
        val root = roots.get().singleOrNull()
        val there = !wrote && !refused && root != null && Files.exists(root.resolve(path))
        return when (turn) {
            0 -> Reply(
                "I'll look at the project first, then make the change.",
                listOf(
                    look("tree", "."),
                    state(
                        """{"plan.add":{"text":"look at the project"}}""",
                        """{"plan.add":{"text":"write ${path.replace("\"", "")}"}}""",
                        """{"plan.tick":{"n":1,"evidence":"op:1"}}""",
                        """{"plan.cursor":2}""",
                        """{"next":"write the file"}""",
                    ),
                ),
            )
            1 -> if (there) Reply(
                "`$path` is there already, so I leave it as it is.",
                listOf(state("""{"plan.cancel":{"n":2,"reason":"the file exists already"}}""", """{"next":"check the result"}""")),
            ) else Reply(
                "Writing `$path`.",
                listOf(
                    "edit" to """{"ops":[{"create":${quote(path)},"content":${quote("Hello from the ASTROLABE demo.\n\nRequest: $request\n")}}],"why":"write the file the request asks for"}""",
                    state("""{"plan.tick":{"n":2,"evidence":"op:1"},"if":"applied(op:1)"}""", """{"next":"check the result"}"""),
                ),
            )
            2 -> Reply("Checking the result.", listOf(verify("acceptance")))
            else -> Reply(
                (if (there) "`$path` exists already; I left it as it is."
                else if (refused) "`$path` was not written: the project does not allow it."
                else "`$path` is written.") +
                    " This is the scripted demo model: it writes one small file and changes nothing else.",
                emptyList(),
            )
        }
    }

    /** The demo-shop scenario: read → plan in STATE → anchored edit → acceptance → report. */
    private fun implementing(turn: Int, results: List<String>, context: String): Reply {
        val root = resolveRoot(PRICING_PATH)
        val pricing = root?.resolve(PRICING_PATH)
        val content = pricing?.takeIf { Files.isRegularFile(it) }?.let { Files.readAllBytes(it) }
        val buggy = content != null && String(content, Charsets.UTF_8).replace("\r\n", "\n").contains(FixtureRepos.BUGGY_BODY)
        // One root: the project of the run is known. Several: the demo-shop script runs only where the prompt shows its files.
        val certain = roots.get().size == 1
        if (content == null || (!certain && !context.contains("pricing.py"))) return anywhere(turn, results, context)
        if (context.contains("Ask me", ignoreCase = true) || context.contains("consult me", ignoreCase = true)) return interactive(turn, results, context, content, buggy)
        return when (turn) {
            0 -> Reply(
                "I'll locate the pricing logic and the tests that pin its behaviour before changing anything.",
                listOf(
                    look("read", PRICING_PATH),
                    look("read", TESTS_PATH),
                    state(
                        """{"plan.add":{"text":"read pricing.py and the tests that pin it"}}""",
                        """{"plan.add":{"text":"apply the discount as a percentage and clamp at zero","accept":"AC-1"}}""",
                        """{"plan.add":{"text":"run the tests","accept":"AC-1"}}""",
                        """{"plan.tick":{"n":1,"evidence":"op:1"}}""",
                        """{"plan.cursor":2}""",
                        """{"fact.add":{"kind":"h","text":"apply_discount subtracts the raw percent instead of a percentage"}}""",
                        """{"focus.set":"src/shop"}""",
                        """{"next":"edit apply_discount in src/shop/pricing.py"}""",
                    ),
                ),
            )
            1 -> if (buggy && content != null) Reply(
                "`apply_discount` subtracts the percent as an absolute amount; the tests expect a percentage with a floor of zero. Editing the function body only; `cart_total` keeps its signature.",
                listOf(
                    edit(PRICING_PATH, sha256(content), FixtureRepos.BUGGY_BODY, FixtureRepos.FIXED_BODY),
                    state(
                        """{"fact.add":{"kind":"v","text":"apply_discount returned total - percent before this edit","evidence":"op:1"}}""",
                        """{"decision.add":{"text":"compute total * (1 - percent / 100) and clamp at 0","because":"the tests pin percentage semantics and a non-negative total","rejected":"clamping inside cart_total only"}}""",
                        """{"next":"run the tests"}""",
                    ),
                ),
            ) else Reply(
                "The percentage fix is already in place; moving straight to the tests.",
                listOf(state("""{"open.add":{"text":"was the fix applied by an earlier task?","needs":"a test run"}}""", """{"next":"run the tests"}""")),
            )
            2 -> Reply(
                "Running the tests on the changed code.",
                listOf(
                    verify("acceptance"),
                    state(
                        """{"plan.tick":{"n":2,"evidence":"op:1"},"if":"green(op:1)"}""",
                        """{"plan.tick":{"n":3,"evidence":"op:1"},"if":"green(op:1)"}""",
                        """{"fact.add":{"kind":"v","text":"the tests pass with the change in place","evidence":"op:1"},"if":"green(op:1)"}""",
                        """{"next":"report completion"}""",
                    ),
                ),
            )
            else -> {
                val red = results.any { it.contains("tool=verify") && (it.contains("status=failed") || it.contains(" fail ") && !it.contains(" 0 fail ")) }
                Reply(
                    if (red) "The tests fail, so this is not done. I report the failure instead of claiming success."
                    else "The tests pass. `apply_discount` now applies a percentage and never returns a negative total; `cart_total` is unchanged.",
                    emptyList(),
                )
            }
        }
    }

    private fun resolveRoot(relative: String): Path? = roots.get().firstOrNull { Files.isRegularFile(it.resolve(relative)) }

    private fun look(what: String, target: String): Pair<String, String> = "look" to """{"what":"$what","target":"$target"}"""

    private fun verify(what: String): Pair<String, String> = "verify" to """{"what":"$what"}"""

    private fun state(vararg ops: String): Pair<String, String> = "state" to """{"op":"patch","patch":[${ops.joinToString(",")}]}"""

    private fun edit(path: String, expect: String, anchor: String, replacement: String): Pair<String, String> =
        "edit" to """{"ops":[{"path":"$path","expect":"$expect","hunks":[{"anchor":${quote(anchor)},"new":${quote(replacement)}}]}],"why":"apply the discount as a percentage and clamp the total at zero"}"""

    public companion object {
        /** Provider id of the fixture endpoint; its profiles are [profiles]. */
        public const val PROVIDER: String = "studio-demo"
        private const val QUEUE = 64
        private const val PRICING_PATH = FixtureRepos.PRICING_PATH
        private const val TESTS_PATH = FixtureRepos.TESTS_PATH
        private val FILE_NAME = Regex("""[`"']?[\w./-]*\w\.[A-Za-z][A-Za-z0-9]{0,7}[`"']?""")
        private val ROUND_WORDS = listOf("Round to cents", "Keep full precision", "full precision", "2 decimals")

        private fun demoModel(id: String, context: Long, output: Long): Model = Model.builder(PROVIDER, id)
            .name(if (id.endsWith("helper")) "Studio demo helper" else "Studio demo model")
            .input(Modality.TEXT).output(Modality.TEXT)
            .contextWindow(context).maxOutputTokens(output)
            .supports(Capability.STREAMING, Capability.TOOLS, Capability.PARALLEL_TOOLS, Capability.STRUCTURED_OUTPUT)
            .prices(Prices.usd().input("3").output("15").build())
            .build()

        private val prices = PriceTable(
            LocalDate.of(2026, 9, 1), "USD",
            mapOf(
                BillingDimension.UNCACHED_INPUT to BigDecimal("3"),
                BillingDimension.CACHE_READ to BigDecimal("0.3"),
                BillingDimension.OUTPUT to BigDecimal("15"),
            ),
        )

        private fun capabilities(context: Int, output: Int) = Capabilities(
            toolSchemaValidation = true, parallelToolCalls = true, streaming = true,
            outputLimitTokens = output, contextLimitTokens = context,
            nativeCompaction = false, continuation = false, cancellation = true, hostedExecution = false,
            caching = CacheCapability(false, null, null, emptySet()),
            usageFields = setOf(BillingDimension.UNCACHED_INPUT, BillingDimension.CACHE_READ, BillingDimension.OUTPUT),
            schemaDialects = setOf(SchemaDialect.JSON_SCHEMA_2020_12),
        )

        public const val MAIN_PROFILE: String = "demo-main"
        public const val HELPER_PROFILE: String = "demo-helper"

        /** The profiles of fixture mode on the demo endpoint; always labelled "Demo" in the UI. */
        @JvmStatic
        public fun profiles(): List<Profile> = listOf(
            Profile(MAIN_PROFILE, PROVIDER, "astro-demo", capabilities(128_000, 8_000), prices),
            Profile(HELPER_PROFILE, PROVIDER, "astro-demo-helper", capabilities(64_000, 4_000), prices),
        )

        internal fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

        internal fun quote(s: String): String = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""
    }
}
