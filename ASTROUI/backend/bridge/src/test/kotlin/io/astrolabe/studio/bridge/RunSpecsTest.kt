package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.Mode
import io.astrolabe.ProfileRoles
import io.astrolabe.RunSpec
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import kotlin.test.Test
import kotlin.test.assertEquals

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
}
