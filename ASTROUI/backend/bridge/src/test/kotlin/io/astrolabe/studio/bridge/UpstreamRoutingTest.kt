package io.astrolabe.studio.bridge

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

/** OpenRouter upstreams a drafted profile routes around (`gate.body`). */
class UpstreamRoutingTest {
    private val drafted = Json.parseToJsonElement("""{"gate":{"v":1,"api":"openai-chat"}}""") as JsonObject

    @Test
    fun `a z-ai model on OpenRouter ignores the Together upstream`() {
        assertEquals(
            """{"gate":{"v":1,"api":"openai-chat","body":{"provider":{"ignore":["Together"]}}}}""",
            AutoProfiles.routed("openrouter", "z-ai/glm-5.3-flash", drafted).toString(),
        )
    }

    @Test
    fun `other models and other providers keep the drafted config`() {
        assertSame(drafted, AutoProfiles.routed("openrouter", "anthropic/claude-sonnet-4.5", drafted))
        assertSame(drafted, AutoProfiles.routed("zai", "z-ai/glm-5.3-flash", drafted))
    }
}
