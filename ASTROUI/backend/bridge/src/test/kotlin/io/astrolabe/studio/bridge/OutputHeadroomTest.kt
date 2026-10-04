package io.astrolabe.studio.bridge

import io.astrolabe.Config
import io.astrolabe.ProfileRoles
import io.astrolabe.studio.bridge.fixture.FixtureBrain
import kotlin.test.Test
import kotlin.test.assertEquals

/** The output reserve of a request (finding F-8): the Studio's run takes the core's rule (`RunSpec.outputHeadroom`). */
class OutputHeadroomTest {
    private fun headroom(context: Int, output: Int, wanted: Int?): Int {
        val base = FixtureBrain.profiles().first { it.id == FixtureBrain.MAIN_PROFILE }
        val profile = base.copy(capabilities = base.capabilities.copy(contextLimitTokens = context, outputLimitTokens = output))
        val config = Config(profiles = mapOf(profile.id to profile), profileRoles = ProfileRoles(profile.id, null, null))
        return RunSpecs.of(StartSpec("x", 1, maxOutputTokens = wanted), config, profile).outputHeadroom(profile)
    }

    @Test
    fun `a limit within a quarter of the window stays`() {
        assertEquals(4_096, headroom(32_768, 4_096, null))
        assertEquals(32_000, headroom(128_000, 32_000, null))
    }

    @Test
    fun `a limit near the whole window is narrowed to a quarter of it`() {
        assertEquals(327_680, headroom(1_310_720, 1_310_720, null))
        assertEquals(50_000, headroom(200_000, 64_000, null))
    }

    @Test
    fun `the narrowing of the user stays, within the limits`() {
        assertEquals(2_000, headroom(128_000, 32_000, 2_000))
        assertEquals(32_000, headroom(128_000, 32_000, 90_000))
        assertEquals(1, headroom(2, 1, null))
    }
}
