package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.Mode
import io.astrolabe.ProfileRoles
import io.astrolabe.InvalidConfig
import io.astrolabe.RunSpec
import io.astrolabe.cell.Protocol
import io.astrolabe.route.Tier
import io.astrolabe.route.TierTable
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** P8.B.7: a Studio start is built from the core's `RunSpec`, never from a second copy of its numbers. */
class RunSpecsTest {
    private val profile = FixtureBrain.profiles().first { it.id == FixtureBrain.MAIN_PROFILE }

    /**
     * The run of a task started with the default settings, as the server builds it: the settings layers are the library
     * defaults with the task's one profile, the limits the user's defaults, the token guard the core's.
     */
    private fun defaultStart(taskMode: String): RunSpec {
        val settings = ConfigSupport.encode(Config(profiles = mapOf(profile.id to profile)))
        val config = ConfigSupport.runConfig(RunSpecs.taskConfigJson(settings, profile.id, taskMode)).config
        val spec = StartSpec("request", RunSpec.tokenGuard(profile.capabilities.contextLimitTokens).value, limits = TaskLimits.DEFAULTS)
        return RunSpecs.of(spec, config, profile)
    }

    @Test
    fun `a start with the default settings is the core's default run of the task's mode`() {
        assertEquals(RunSpec.defaults(profile, null, Mode.Autonomous), defaultStart("auto"))
        assertEquals(RunSpec.defaults(profile, null, Mode.Interactive), defaultStart("ask"))
    }

    @Test
    fun `a setting of zero starts with the least value instead of failing`() {
        val config = Config(profiles = mapOf(profile.id to profile), profileRoles = ProfileRoles(profile.id, null, null))
        val run = RunSpecs.of(StartSpec("x", 1, maxCells = 0, leaseMinutes = 0, maxOutputTokens = 0), config, profile)
        assertEquals(1, run.maxCells)
        assertEquals(1L, run.leaseMinutes)
        assertEquals(1, run.maxOutputTokens)
    }

    /**
     * The settings as the server layers them: the library defaults (the Studio's protocol choice included) under [base],
     * then the Studio keys of [studio] on top.
     */
    private fun layered(base: Config, vararg studio: Pair<String, Any>): String {
        val library = ConfigSupport.obj(ConfigSupport.libraryDefaultsJson())
        val config = ConfigSupport.obj(ConfigSupport.encode(base))
        val keys = studio.associate { (k, v) -> k to if (v is Map<*, *>) JsonObject(v.entries.associate { it.key as String to JsonPrimitive(it.value as String) }) else JsonPrimitive(v as String) }
        return JsonObject(library + config + keys).toString()
    }

    /** The protocol of the run a task on the fixture profile starts with under [settings]. */
    private fun protocolOf(settings: String): Protocol {
        val config = ConfigSupport.runConfig(RunSpecs.taskConfigJson(settings, profile.id, "ask")).config
        return RunSpecs.of(StartSpec("request", 1), config, profile).config.protocol
    }

    @Test
    fun `the Studio protocol is structured by default, an explicit choice reaches the run and auto reads the model class`() {
        val library = ConfigSupport.obj(ConfigSupport.libraryDefaultsJson())
        assertEquals(JsonPrimitive("auto"), library[StudioProtocol.KEY])
        assertEquals(listOf("Low", "Medium", "High", "ExtraHigh"), StudioProtocol.MODEL_CLASSES)
        assertEquals(JsonObject(StudioProtocol.MODEL_CLASSES.associateWith { JsonPrimitive("structured") }), library[StudioProtocol.TABLE_KEY])
        assertTrue("\"direct\"" in ConfigSupport.declaredRolesJson(), "the ninth declared role")

        val untiered = Config(profiles = mapOf(profile.id to profile))
        val high = untiered.copy(tierTable = TierTable(version = "t1", profiles = mapOf(Tier.High to setOf(profile.id))))
        val highDirect = mapOf("High" to "direct")
        assertEquals(Protocol.Structured, protocolOf(layered(high)), "the defaults: auto, every class structured")
        assertEquals(Protocol.Direct, protocolOf(layered(untiered, "protocol" to "direct")), "an explicit choice needs no class")
        assertEquals(Protocol.Structured, protocolOf(layered(high, "protocol" to "structured", "protocolByModelClass" to highDirect)), "the table is read by auto only")
        assertEquals(Protocol.Direct, protocolOf(layered(high, "protocolByModelClass" to highDirect)), "auto: the class of the task's model")
        assertEquals(Protocol.Structured, protocolOf(layered(untiered, "protocolByModelClass" to highDirect)), "auto: a model without a class is structured")
        assertEquals(Protocol.Structured, protocolOf(layered(high, "protocolByModelClass" to mapOf("Low" to "direct"))))
        assertFailsWith<InvalidConfig> { RunSpecs.taskConfigJson(layered(high, "protocol" to "fast"), profile.id, "ask") }
        assertFailsWith<InvalidConfig> { RunSpecs.taskConfigJson(layered(high, "protocolByModelClass" to mapOf("Deterministic" to "direct")), profile.id, "ask") }
    }
}
