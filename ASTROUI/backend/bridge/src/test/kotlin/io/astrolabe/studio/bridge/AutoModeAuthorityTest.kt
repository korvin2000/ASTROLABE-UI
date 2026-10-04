package io.astrolabe.studio.bridge

import io.astrolabe.Astrolabe
import io.astrolabe.event.AutonomousPolicy
import io.astrolabe.event.DClassRequest
import io.astrolabe.id.AttemptId
import io.astrolabe.id.Identities
import io.astrolabe.id.WorkId
import kotlinx.coroutines.runBlocking
import java.util.concurrent.CompletableFuture
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * P8.C.15: an autonomous run never refuses a D-class action the contract does not allow-list on the policy's word — it
 * asks the user through the host, as an interactive run does; an allow-listed one is approved by the policy as before.
 */
class AutoModeAuthorityTest {
    private class Port : AuthorityPort {
        val approvals = ArrayList<String>()
        override fun ask(workId: String, questionJson: String) = CompletableFuture.completedFuture<String?>(null)
        override fun approve(workId: String, requestJson: String): CompletableFuture<String> {
            approvals += requestJson
            val req = ConfigSupport.obj(requestJson)
            return CompletableFuture.completedFuture("""{"requestId":${req["id"]},"contractRevision":${req["contractRevision"]},"approved":true,"reason":"the user"}""")
        }
        override fun resolve(workId: String, proposalJson: String): CompletableFuture<String> = CompletableFuture.failedFuture(UnsupportedOperationException())
        override fun review(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
        override fun decide(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
    }

    private fun request(id: String, allowlisted: Boolean) = DClassRequest(
        id, 2, Identities(WorkId("W-test01"), AttemptId(Astrolabe.FIRST_ATTEMPT)), "exec", listOf("npm", "install", "-g", "typescript"), null,
        "installs a tool on this machine", "D-class", contractAllowlisted = allowlisted,
    )

    @Test
    fun `an action outside the allow list goes to the user and an allow-listed one is approved by the policy`() = runBlocking {
        val port = Port()
        val lines = ArrayList<String>()
        val authority = RecordingAutonomousAuthority("W-test01", AutonomousPolicy(), { _, kind, _, _ -> lines += kind }, port)
        val asked = authority.approve(request("effect-1", false))
        assertTrue(asked.approved)
        assertEquals("the user", asked.reason)
        assertEquals(1, port.approvals.size)
        assertTrue(lines.isEmpty(), "no policy line for a decision the user makes")
        val allowed = authority.approve(request("effect-2", true))
        assertTrue(allowed.approved)
        assertEquals(1, port.approvals.size)
        assertEquals(listOf("effect"), lines)
    }
}
