package io.astrolabe.studio.bridge

import kotlin.test.Test
import kotlin.test.assertEquals

/** The output reserve of a request (finding F-8). */
class OutputHeadroomTest {
    @Test
    fun `a limit within a quarter of the window stays`() {
        assertEquals(4_096, AutoProfiles.outputHeadroom(32_768, 4_096, null))
        assertEquals(32_000, AutoProfiles.outputHeadroom(128_000, 32_000, null))
    }

    @Test
    fun `a limit near the whole window is narrowed to a quarter of it`() {
        assertEquals(327_680, AutoProfiles.outputHeadroom(1_310_720, 1_310_720, null))
        assertEquals(50_000, AutoProfiles.outputHeadroom(200_000, 64_000, null))
    }

    @Test
    fun `the narrowing of the user stays, within the limits`() {
        assertEquals(2_000, AutoProfiles.outputHeadroom(128_000, 32_000, 2_000))
        assertEquals(32_000, AutoProfiles.outputHeadroom(128_000, 32_000, 90_000))
        assertEquals(1, AutoProfiles.outputHeadroom(2, 1, null))
    }
}
