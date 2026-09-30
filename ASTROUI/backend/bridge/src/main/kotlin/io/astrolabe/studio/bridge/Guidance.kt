package io.astrolabe.studio.bridge

/**
 * What the Studio tells the agent of every task about its working notes (finding F-9). The core's `state` tool takes
 * typed notes, but neither its schema nor its refusal names them; a model that does not guess them right does the
 * work and then cannot record it. The note travels with the request, as the verification setup does.
 */
public object Guidance {
    /** First words of [NOTES]; a contract that has them is not told again. */
    public const val MARK: String = "Working notes:"

    public const val NOTES: String = "Working notes: keep them with the state tool, op \"patch\". " +
        "Every item of \"patch\" is an object with exactly one of these keys and nothing else: " +
        "\"plan.add\" {\"text\"}, \"plan.tick\" {\"n\", \"evidence\"}, \"plan.cancel\" {\"n\", \"reason\"}, \"plan.cursor\" n, " +
        "\"fact.add\" {\"kind\", \"text\", \"evidence\"} where kind is \"v\" for what a tool result showed (evidence names that result, " +
        "\"op:1\" for the first call of the same turn or an alias such as \"#2\") and \"h\" for an assumption, " +
        "\"decision.add\" {\"text\", \"because\", \"rejected\"}, \"open.add\" {\"text\"}, \"focus.set\" {\"dir\"}, \"next\" \"text\". " +
        "Example: [{\"plan.add\":{\"text\":\"write the file\"}},{\"plan.tick\":{\"n\":1,\"evidence\":\"op:1\"}},{\"next\":\"run the checks\"}]. " +
        "Commands run without a shell: pass the program and its arguments, not \"sh -c\". " +
        "The user reads what you write in messages: use plain words, say what you changed and how you checked it, " +
        "and leave the ids of requirements, acceptance items and notes out of them."

    @JvmStatic
    public fun told(requests: List<String>): Boolean = requests.any { MARK in it }
}
