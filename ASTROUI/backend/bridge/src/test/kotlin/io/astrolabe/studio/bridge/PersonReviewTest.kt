package io.astrolabe.studio.bridge

import io.astrolabe.id.AttemptId
import io.astrolabe.id.CandidateId
import io.astrolabe.id.Digest
import io.astrolabe.id.Identities
import io.astrolabe.id.WorkId
import io.astrolabe.verify.ReviewRequest
import io.astrolabe.verify.ReviewScope
import io.astrolabe.verify.ReviewerKind
import io.astrolabe.verify.VerdictOutcome
import java.util.concurrent.CompletableFuture
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * ASTROLABE 2.0 C11 (D-404) at the bridge: a review request only a person may answer reaches the Studio with its
 * `humanOnly` mark, the Studio's person's verdict comes back as [ReviewerKind.Human], and the stop that waits for a
 * person reads as its wire word.
 */
class PersonReviewTest {
    private val candidate = CandidateId(Digest("ab".repeat(32)))

    @Test
    fun `a human-only review reaches the host marked and the person's verdict returns as a person's`() = runBlocking {
        var sent: String? = null
        val port = object : AuthorityPort {
            override fun ask(workId: String, questionJson: String) = CompletableFuture.completedFuture<String?>(null)
            override fun approve(workId: String, requestJson: String): CompletableFuture<String> = error("not asked")
            override fun resolve(workId: String, proposalJson: String): CompletableFuture<String> = error("not asked")
            override fun review(workId: String, requestJson: String): CompletableFuture<String?> {
                sent = requestJson
                // The shape the Studio's DecisionService builds for "approve" (personVerdict + buildReply).
                return CompletableFuture.completedFuture(
                    """{"outcome":"Approve","findings":[],"confidence":1.0,"requestId":"review-1","contractRevision":2,""" +
                        """"reviewedCandidate":"${candidate.digest.hex}","signedBy":"user:local","reviewer":"human"}""",
                )
            }
            override fun decide(workId: String, requestJson: String) = CompletableFuture.completedFuture<String?>(null)
        }
        val request = ReviewRequest(
            id = "review-1", contractRevision = 2, ids = Identities(WorkId("W-1"), AttemptId("a1")), scope = ReviewScope.Increment,
            candidate = candidate, packetRef = "blob-1", criteria = emptyList(), humanOnly = true,
        )
        val verdict = PortAuthority("W-1", port).review(request)
        assertTrue(ConfigSupport.obj(checkNotNull(sent))["humanOnly"].toString() == "true", "the host sees that a person must answer")
        assertEquals(VerdictOutcome.Approve, verdict?.outcome)
        assertEquals(ReviewerKind.Human, verdict?.reviewer)
    }

    @Test
    fun `the stop that waits for a person reads as its wire word`() {
        assertEquals("integrity_review", StopCodes.wire("IntegrityReview"))
        assertEquals("integrity_review", StopCodes.wire("integrity_review"))
    }
}
