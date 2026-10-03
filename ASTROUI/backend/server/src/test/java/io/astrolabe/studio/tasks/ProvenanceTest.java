package io.astrolabe.studio.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.Test;

/** ASTROLABE 2.0 C4: the outcome label is the core's class; a model judge's approval is a mark beside it, never a class. */
class ProvenanceTest {
    private static Provenance.Label label(String json) { return Provenance.of(Json.parse(json)); }

    @Test
    void theClassIsTheReceiptsOwn() {
        var l = label("{\"provenanceClass\":\"independent\",\"acceptanceSurfaceModelApproved\":[],\"acceptance\":[{\"id\":\"AC-1\",\"provenance\":\"tested\",\"verifiedBy\":\"runtime\"}]}");
        assertEquals("independent", l.cls());
        assertFalse(l.judge());
        assertEquals("agent_test", label("{\"provenanceClass\":\"agent_test\",\"acceptanceSurfaceModelApproved\":[]}").cls());
    }

    @Test
    void aJudgesOrTheHostModelsApprovalIsMarked() {
        var tier = label("{\"provenanceClass\":\"agent_test\",\"acceptanceSurfaceModelApproved\":[],\"acceptance\":[{\"id\":\"AC-2\",\"provenance\":\"reviewed\",\"verifiedBy\":\"T2\"}]}");
        assertEquals("agent_test", tier.cls());
        assertTrue(tier.judge());
        assertTrue(label("{\"provenanceClass\":\"unverified\",\"acceptanceSurfaceModelApproved\":[],\"acceptance\":[{\"id\":\"AC-2\",\"provenance\":\"reviewed\",\"verifiedBy\":\"host_model\"}]}").judge());
        assertTrue(label("{\"provenanceClass\":\"independent\",\"acceptanceSurfaceModelApproved\":[\"tests/test_a.py\"]}").judge());
    }

    @Test
    void aPersonsApprovalIsNotAJudges() {
        var l = label("{\"provenanceClass\":\"independent\",\"acceptanceSurfaceModelApproved\":[],\"acceptance\":[{\"id\":\"AC-2\",\"provenance\":\"reviewed\",\"verifiedBy\":\"human\",\"acceptedBy\":\"user:local\"}]}");
        assertEquals("independent", l.cls());
        assertFalse(l.judge());
    }

    @Test
    void aReceiptWithoutAClassHasNoLabel() {
        assertNull(label("{\"acceptance\":[{\"id\":\"AC-1\",\"provenance\":\"reviewed\"}]}"));
    }

    @Test
    void anOldReceiptClosedOnlyByTheReviewPassIsLowered() {
        String judgeOnly = "{\"provenanceClass\":\"independent\","
            + "\"requirements\":[{\"id\":\"R-1\",\"provenanceClass\":\"independent\",\"acceptance\":[\"AC-1\"],\"agentChecks\":[\"CHK-model-ab\"]}],"
            + "\"acceptance\":[{\"id\":\"AC-1\",\"provenance\":\"reviewed\",\"verifiedBy\":\"human\",\"acceptedBy\":\"studio:review-pass(demo/model)\",\"provenanceClass\":\"independent\"}],"
            + "\"checksRun\":[{\"checkId\":\"CHK-model-ab\",\"outcome\":%s}]}";
        var withTest = label(judgeOnly.formatted("\"passed\""));
        assertEquals("agent_test", withTest.cls());
        assertTrue(withTest.judge());
        assertEquals("unverified", label(judgeOnly.formatted("\"failed\"")).cls());
        // Beside a declared check that passed, the requirement stays independent.
        var both = label("{\"provenanceClass\":\"independent\",\"requirements\":[{\"id\":\"R-1\",\"provenanceClass\":\"independent\",\"acceptance\":[\"AC-1\",\"AC-2\"]}],"
            + "\"acceptance\":[{\"id\":\"AC-1\",\"provenance\":\"reviewed\",\"acceptedBy\":\"studio:review-pass(m)\",\"verifiedBy\":\"human\"},"
            + "{\"id\":\"AC-2\",\"provenance\":\"tested\",\"verifiedBy\":\"runtime\",\"provenanceClass\":\"independent\"}]}");
        assertEquals("independent", both.cls());
        assertTrue(both.judge());
    }

    @Test
    void theBestVerifiedResultOfALimitStop() {
        assertNull(Provenance.best(Json.parse("{\"provenanceClass\":\"unverified\"}")));
        assertEquals("none", Provenance.best(Json.parse("{\"limit\":{\"bestCandidate\":null,\"workingTree\":false}}")));
        assertEquals("current", Provenance.best(Json.parse("{\"limit\":{\"bestCandidate\":\"c1\",\"workingTree\":true}}")));
        assertEquals("earlier", Provenance.best(Json.parse("{\"limit\":{\"bestCandidate\":\"c1\",\"workingTree\":false}}")));
        assertEquals("money", Provenance.limitKind("task_limit_money"));
        assertNull(Provenance.limitKind("cell_cap"));
    }

    private static final String OFFER = "{\"outcome\":\"completed\",\"checksRun\":[{\"checkId\":\"CHK-model-1a2b\",\"outcome\":%s,\"evidenceKind\":%s,"
        + "\"command\":{\"argv\":[\"npm\",\"test\"],\"cwd\":%s}}]}";

    private static String offer(String outcome, String kind, String cwd, String source) {
        return Provenance.checkOffer(Json.parse(OFFER.formatted(outcome, kind, cwd)), source);
    }

    @Test
    void theAgentsPassingTestAtTheRootIsOfferedToAProjectWithoutOne() {
        assertEquals("npm test", offer("\"passed\"", "\"Tests\"", "null", "none"));
        assertEquals("npm test", offer("\"passed\"", "\"tests\"", "\".\"", "none"));
        assertNull(offer("\"failed\"", "\"Tests\"", "null", "none"));
        assertNull(offer("\"passed\"", "\"Build\"", "null", "none"));
        assertNull(offer("\"passed\"", "\"Tests\"", "\"web\"", "none"));
        assertNull(offer("\"passed\"", "\"Tests\"", "null", "detected"));
        assertNull(Provenance.checkOffer(Json.parse("{\"outcome\":\"budget_exhausted\",\"checksRun\":[]}"), "none"));
    }
}
