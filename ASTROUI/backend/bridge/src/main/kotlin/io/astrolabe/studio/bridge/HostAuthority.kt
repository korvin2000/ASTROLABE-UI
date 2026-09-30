package io.astrolabe.studio.bridge

import io.astrolabe.event.AmendmentProposal
import io.astrolabe.event.Answer
import io.astrolabe.event.Authority
import io.astrolabe.event.AutonomousAuthority
import io.astrolabe.event.AutonomousPolicy
import io.astrolabe.event.DClassRequest
import io.astrolabe.event.Decision
import io.astrolabe.event.Question
import io.astrolabe.event.Resolution
import io.astrolabe.verify.AcceptanceDecision
import io.astrolabe.verify.AcceptanceDecisionRequest
import io.astrolabe.verify.ReviewRequest
import io.astrolabe.verify.Verdict
import kotlinx.coroutines.future.await

/** Receives every outcome the autonomous policy decided, so the Studio can show it as a "policy" line (R-THR-01). */
public fun interface PolicyListener {
    public fun onPolicyDecision(workId: String, kind: String, requestJson: String, replyJson: String?)
}

/**
 * The per-campaign authority (§25.8): each call crosses to the host as JSON and suspends on its future, so the
 * bus dispatcher is never blocked (R-BE-03). Replies are decoded as ASTROLABE's own types; the core revalidates the
 * revision with `Replies.check` as well.
 */
internal class PortAuthority(private val workId: String, private val port: AuthorityPort) : Authority {
    private val json = ConfigSupport.json

    override suspend fun ask(question: Question): Answer? {
        val reply = port.ask(workId, json.encodeToString(Question.serializer(), question)).await() ?: return null
        return json.decodeFromString(Answer.serializer(), reply)
    }

    override suspend fun approve(request: DClassRequest): Decision =
        json.decodeFromString(Decision.serializer(), port.approve(workId, json.encodeToString(DClassRequest.serializer(), request)).await())

    override suspend fun resolve(proposal: AmendmentProposal): Resolution =
        json.decodeFromString(Resolution.serializer(), port.resolve(workId, json.encodeToString(AmendmentProposal.serializer(), proposal)).await())

    override suspend fun review(request: ReviewRequest): Verdict? {
        val reply = port.review(workId, json.encodeToString(ReviewRequest.serializer(), request)).await() ?: return null
        return json.decodeFromString(Verdict.serializer(), reply)
    }

    override suspend fun decide(request: AcceptanceDecisionRequest): AcceptanceDecision? {
        val reply = port.decide(workId, json.encodeToString(AcceptanceDecisionRequest.serializer(), request)).await() ?: return null
        return json.decodeFromString(AcceptanceDecision.serializer(), reply)
    }
}

/** `AutonomousAuthority` semantics (§5.3) with every decision reported to the host as a policy record. */
internal class RecordingAutonomousAuthority(
    private val workId: String,
    policy: AutonomousPolicy,
    private val listener: PolicyListener,
) : Authority {
    private val delegate = AutonomousAuthority(policy)
    private val json = ConfigSupport.json

    override suspend fun ask(question: Question): Answer? {
        val answer = delegate.ask(question)
        listener.onPolicyDecision(workId, "question", json.encodeToString(Question.serializer(), question), answer?.let { json.encodeToString(Answer.serializer(), it) })
        return answer
    }

    override suspend fun approve(request: DClassRequest): Decision {
        val decision = delegate.approve(request)
        listener.onPolicyDecision(workId, "effect", json.encodeToString(DClassRequest.serializer(), request), json.encodeToString(Decision.serializer(), decision))
        return decision
    }

    override suspend fun resolve(proposal: AmendmentProposal): Resolution {
        val resolution = delegate.resolve(proposal)
        listener.onPolicyDecision(workId, "amendment", json.encodeToString(AmendmentProposal.serializer(), proposal), json.encodeToString(Resolution.serializer(), resolution))
        return resolution
    }

    override suspend fun review(request: ReviewRequest): Verdict? {
        val verdict = delegate.review(request)
        listener.onPolicyDecision(workId, "review", json.encodeToString(ReviewRequest.serializer(), request), verdict?.let { json.encodeToString(Verdict.serializer(), it) })
        return verdict
    }

    override suspend fun decide(request: AcceptanceDecisionRequest): AcceptanceDecision? {
        val decision = delegate.decide(request)
        listener.onPolicyDecision(workId, "acceptance", json.encodeToString(AcceptanceDecisionRequest.serializer(), request), decision?.let { json.encodeToString(AcceptanceDecision.serializer(), it) })
        return decision
    }
}
