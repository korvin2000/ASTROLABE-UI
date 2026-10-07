package io.astrolabe.studio.bridge

import io.astrolabe.atlas.PackageCommands
import io.astrolabe.atlas.Sniffed
import io.astrolabe.contract.Acceptance
import io.astrolabe.contract.Command
import io.astrolabe.contract.Contract
import io.astrolabe.contract.EvidencePurpose
import io.astrolabe.contract.Origin

/**
 * Verification setup (Studio 2 §7.3, BE-6): what a task is accepted against when the core derived nothing executable.
 * The core accepts a `run:` item only on parsed test counts (an exit code alone is inconclusive), so only a test
 * command becomes a `run:` item. A build, type check or lint command is handed to the agent as a step to run, and the
 * result is accepted through a `check:` item that the host's review pass assesses.
 */
public data class VerificationSetup @JvmOverloads constructor(
    /** `tests` or `review`: how the result will be labelled (§7.8). */
    val kind: String,
    /** `saved`, `declared` or `none`: where the commands came from. */
    val source: String,
    /** Acceptance commands (`run:` items). */
    val commands: List<List<String>>,
    /** Commands the agent is asked to run before it finishes; they are not acceptance evidence. */
    val hints: List<List<String>> = emptyList(),
) {
    /** The first command as the user reads it, or null when nothing is run. */
    val commandText: String? get() = (commands.firstOrNull() ?: hints.firstOrNull())?.let { Command(it).text }
}

public object Verification {
    public const val REVIEW_TEXT: String = "The change fulfils the request"

    /** First line of the system text of the review pass of the host; the demo model recognises it. */
    public const val REVIEW_MARKER: String = "astrolabe-studio · review pass"

    /** Splits a saved one-line command into argv; quotes group words, nothing is passed to a shell. */
    @JvmStatic
    public fun argv(line: String): List<String> {
        val out = ArrayList<String>()
        val word = StringBuilder()
        var quote: Char? = null
        var open = false
        for (c in line.trim()) {
            when {
                quote != null -> if (c == quote) quote = null else word.append(c)
                c == '"' || c == '\'' -> { quote = c; open = true }
                c.isWhitespace() -> if (word.isNotEmpty() || open) { out += word.toString(); word.clear(); open = false }
                else -> word.append(c)
            }
        }
        if (word.isNotEmpty() || open) out += word.toString()
        return out
    }

    /** The setup for a contract without executable acceptance (§7.3). */
    @JvmStatic
    public fun choose(sniffed: Sniffed, saved: SavedChecks): VerificationSetup {
        val savedHints = listOfNotNull(saved.build, saved.lint)
        if (saved.test != null) return VerificationSetup("tests", "saved", listOf(saved.test), savedHints)
        if (savedHints.isNotEmpty()) return VerificationSetup("review", "saved", emptyList(), savedHints)
        val root = sniffed.packages.firstOrNull { it.dir == PackageCommands.ROOT } ?: sniffed.packages.firstOrNull()
        val declared = root?.let { it.typecheck ?: it.build ?: it.lint }
        if (declared != null) return VerificationSetup("review", "declared", emptyList(), listOf(declared))
        return VerificationSetup("review", "none", emptyList())
    }

    /**
     * T-01 (WF-1): the items of [setup] as the core's `CampaignPolicy.declaredChecks` — the user's saved test commands as
     * `run:` items, or the review item a project without one is accepted through — for a contract stored with them at its
     * first open (the core numbers them). Task-workflow §3.6 (D-434): a saved test command is a user-declared **regression**
     * check, never goal-level evidence; the core lets it replace the sniffed suite of its package.
     */
    internal fun items(setup: VerificationSetup): List<Acceptance> =
        if (setup.commands.isEmpty()) listOf(Acceptance.Check("AC-review", REVIEW_TEXT, Origin.User))
        else setup.commands.mapIndexed { i, argv -> Acceptance.Run("AC-saved-${i + 1}", Command(argv), Origin.User, scope = "all", purpose = EvidencePurpose.Regression) }

    /**
     * How a stored [contract] is verified (task-workflow §3.6, WD-23), read by origin and purpose: `saved` for the user's
     * own `run:` items (the saved command), `declared` when only the sniffed suites are, `review` when nothing runs.
     */
    internal fun of(contract: Contract): VerificationSetup {
        val runs = contract.acceptance.filterIsInstance<Acceptance.Run>()
        if (runs.isEmpty()) return VerificationSetup("review", "none", emptyList())
        val users = runs.filter { it.origin is Origin.User || it.origin is Origin.Amended }
        return if (users.isNotEmpty()) VerificationSetup("tests", "saved", users.map { it.command.argv })
            else VerificationSetup("tests", "declared", runs.map { it.command.argv })
    }

    /** [contract] with the items of [setup] appended and every requirement bound to them. */
    internal fun apply(contract: Contract, setup: VerificationSetup): Contract {
        val version = contract.version + 1
        val taken = contract.acceptance.map { it.id }.toSet()
        var n = contract.acceptance.size
        fun nextId(): String {
            do n++ while ("AC-$n" in taken)
            return "AC-$n"
        }
        val items: List<Acceptance> = if (setup.commands.isEmpty()) {
            listOf(Acceptance.Check(nextId(), REVIEW_TEXT, Origin.Amended(version), obligationVersion = version))
        } else {
            setup.commands.map { Acceptance.Run(nextId(), Command(it), Origin.Amended(version), obligationVersion = version) }
        }
        val ids = items.map { it.id }
        return contract.copy(
            acceptance = contract.acceptance + items,
            requirements = contract.requirements.map { it.copy(acceptance = it.acceptance + ids) },
        )
    }

    /** The request text recorded with the amendment; the agent reads it as the user's words. */
    internal fun text(setup: VerificationSetup): String {
        fun list(commands: List<List<String>>) = commands.joinToString(", ") { "`${Command(it).text}`" }
        val steps = if (setup.hints.isEmpty()) "" else " Run ${list(setup.hints)} before finishing and fix what it reports."
        return if (setup.commands.isEmpty()) {
            "Studio note: this project has no test command.$steps The Studio takes care of accepting the result. When the work is done, write a short summary of what you changed and stop. Do not call verify for acceptance: there is nothing to run."
        } else {
            "Studio note: the result is checked with ${list(setup.commands)}.$steps"
        }
    }
}

/** The project's saved check commands (Settings › Project), each already split into argv. */
public data class SavedChecks @JvmOverloads constructor(
    val test: List<String>? = null,
    val build: List<String>? = null,
    val lint: List<String>? = null,
) {
    val isEmpty: Boolean get() = test == null && build == null && lint == null

    public fun all(): List<List<String>> = listOfNotNull(test, build, lint)

    public companion object {
        @JvmStatic
        public fun of(test: String?, build: String?, lint: String?): SavedChecks = SavedChecks(
            test?.takeIf { it.isNotBlank() }?.let(Verification::argv)?.takeIf { it.isNotEmpty() },
            build?.takeIf { it.isNotBlank() }?.let(Verification::argv)?.takeIf { it.isNotEmpty() },
            lint?.takeIf { it.isNotBlank() }?.let(Verification::argv)?.takeIf { it.isNotEmpty() },
        )
    }
}
