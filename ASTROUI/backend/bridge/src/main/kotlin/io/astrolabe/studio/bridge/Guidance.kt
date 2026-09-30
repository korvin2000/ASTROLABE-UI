package io.astrolabe.studio.bridge

/**
 * What the Studio tells the agent of every task about its working notes (finding F-9). The core's `state` tool takes
 * typed notes, but neither its schema nor its refusal names them; a model that does not guess them right does the
 * work and then cannot record it. The note travels with the request, as the verification setup does.
 */
public object Guidance {
    /** First words of [NOTES]; a contract that has them is not told again. */
    public const val MARK: String = "Working notes:"

    public const val NOTES: String = "Working notes: if the request is a question or a greeting and needs no change to the files, write your answer " +
        "and end the task with the task tool, op \"answer\", {\"text\": your answer}: do not make a plan and do not call other tools without need. " +
        "Otherwise keep your notes with the state tool, op \"patch\". " +
        "Every item of \"patch\" is an object with exactly one of these keys and nothing else: " +
        "\"plan.add\" {\"text\"}, \"plan.tick\" {\"n\", \"evidence\"}, \"plan.cancel\" {\"n\", \"reason\"}, \"plan.cursor\" n, " +
        "\"fact.add\" {\"kind\", \"text\", \"evidence\"} where kind is \"v\" for what a tool result showed (evidence names that result, " +
        "\"op:1\" for the first call of the same turn or an alias such as \"#2\") and \"h\" for an assumption, " +
        "\"decision.add\" {\"text\", \"because\", \"rejected\"}, \"open.add\" {\"text\"}, \"focus.set\" {\"dir\"}, \"next\" \"text\". " +
        "Example: [{\"plan.add\":{\"text\":\"write the file\"}},{\"plan.tick\":{\"n\":1,\"evidence\":\"op:1\"}},{\"next\":\"run the checks\"}]. " +
        "When the work is done and checked, reply with a short summary and no tool call: that proposes completion " +
        "(op \"answer\" is only for a request that changes no file). " +
        "If one part cannot be done here (for example opening a browser), finish the rest and say so in that summary instead of stopping as blocked. " +
        "Commands run without a shell: pass the program and its arguments, not \"sh -c\". " +
        "The user reads what you write in messages: use plain words, say what you changed and how you checked it, " +
        "and leave the ids of requirements, acceptance items and notes out of them."

    /** The machine the commands run on: weak models otherwise assume Linux (`python3`, `ls`, `xdg-open`) and stall. */
    @JvmStatic
    public fun platform(os: String): String = "Commands run on $os without a shell" +
        (if (os.startsWith("Windows")) ": Unix programs such as python3, ls, which or xdg-open may be missing." else ".")

    @JvmStatic
    public fun told(requests: List<String>): Boolean = requests.any { MARK in it }
}
