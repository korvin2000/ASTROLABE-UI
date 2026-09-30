package io.astrolabe.studio.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/** Phase 0 B1: the review pass reports honestly — approve, a concrete defect, or what it could not verify. */
class ReviewPassTest {
    private static final JsonNode REQUEST = Json.parse("{\"id\":\"evidence-1\",\"contractRevision\":2,\"candidate\":{\"digest\":\"ab\"}}");

    private static ReviewPass.Assessed verdict(String reply, boolean partial) {
        return ReviewPass.verdict(REQUEST, ReviewPass.parse(reply), "studio:review-pass(demo/model)", partial);
    }

    private static String outcome(ReviewPass.Assessed a) { return Json.text(a.verdict(), "outcome"); }

    @Test
    void approveApprovesAndIsBoundToTheRequest() {
        var a = verdict("{\"verdict\":\"approve\",\"summary\":\"ok\",\"findings\":[]}", false);
        assertEquals("Approve", outcome(a));
        assertEquals("evidence-1", Json.text(a.verdict(), "requestId"));
        assertEquals(2, a.verdict().path("contractRevision").asInt());
        assertEquals("studio:review-pass(demo/model)", Json.text(a.verdict(), "signedBy"));
    }

    @Test
    void anApprovalOfPartOfTheChangeCannotVerifyIt() {
        var a = verdict("{\"verdict\":\"approve\",\"summary\":\"ok\"}", true);
        assertEquals("InsufficientEvidence", outcome(a));
        assertEquals(ReviewPass.PARTIAL, Json.text(a.verdict(), "missingCriterion"));
    }

    @Test
    void aConcreteDefectRejectsWithItsFindings() {
        var a = verdict("{\"verdict\":\"revise\",\"findings\":[{\"severity\":\"major\",\"location\":\"src/a.py:3\",\"issue\":\"negative price\"},"
            + "{\"severity\":\"minor\",\"location\":\"src/a.py:1\",\"issue\":\"terse name\"}]}", false);
        assertEquals("Revise", outcome(a));
        assertEquals(2, a.verdict().path("findings").size());
        assertEquals("Major", Json.text(a.verdict().path("findings").get(0), "severity"));
    }

    @Test
    void minorFindingsOnlyApproveAndBecomeNotes() {
        var a = verdict("{\"verdict\":\"revise\",\"summary\":\"naming\",\"findings\":[{\"severity\":\"minor\",\"location\":\"src/a.py:1\",\"issue\":\"terse name\"}]}", false);
        assertEquals("Approve", outcome(a));
        assertEquals(0, a.verdict().path("findings").size());
        assertEquals("terse name", Json.text(a.notes().path("notes").get(0), "issue"));
    }

    @Test
    void aRejectionWithoutAPlaceOrWithoutFindingsCannotVerify() {
        var unplaced = verdict("{\"verdict\":\"revise\",\"findings\":[{\"severity\":\"major\",\"location\":\"\",\"issue\":\"wrong\"}]}", false);
        assertEquals("InsufficientEvidence", outcome(unplaced));
        var vague = verdict("{\"verdict\":\"revise\",\"summary\":\"not sure\",\"findings\":[]}", false);
        assertEquals("InsufficientEvidence", outcome(vague));
        assertTrue(Json.text(vague.verdict(), "missingCriterion").contains("not sure"));
    }

    @Test
    void cannotVerifySaysWhatIsMissing() {
        var a = verdict("{\"verdict\":\"cannot_verify\",\"summary\":\"browser\",\"missing\":\"whether the page opened\"}", false);
        assertEquals("InsufficientEvidence", outcome(a));
        assertEquals("whether the page opened", Json.text(a.verdict(), "missingCriterion"));
    }

    @Test
    void aReplyThatIsNoVerdictIsNull() {
        assertNull(ReviewPass.parse("I think it is fine."));
        assertNull(ReviewPass.parse("{\"summary\":\"no verdict field\"}"));
    }

    @Test
    void aFailureNamesItsCause() {
        String cause = ReviewPass.failure(new java.util.concurrent.CompletionException(new IllegalStateException("boom")));
        assertEquals("IllegalStateException: boom", cause);
    }
}
