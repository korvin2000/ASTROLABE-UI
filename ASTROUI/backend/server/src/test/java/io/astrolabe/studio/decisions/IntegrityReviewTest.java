package io.astrolabe.studio.decisions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;

import io.astrolabe.studio.bridge.StudioHost;
import io.astrolabe.studio.db.StudioDb;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.Json;
import io.astrolabe.verify.FindingKind;
import io.astrolabe.verify.ReviewerKind;
import io.astrolabe.verify.Severity;
import io.astrolabe.verify.Verdict;
import io.astrolabe.verify.VerdictOutcome;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * ASTROLABE 2.0 C11 (D-404) in the Studio: under `IntegrityApproval.Human` a test change is the user's to approve. A
 * `humanOnly` review request becomes the user's card in `ask` and `auto` alike — the review pass only adds its verdict
 * as information — and an acceptance request with a `humanOnly` item is never accepted on the policy's word.
 */
class IntegrityReviewTest {
    @TempDir
    Path dir;
    private JdbcTemplate jdbc;
    private SingleConnectionDataSource ds;
    private static final String CANDIDATE = "ab".repeat(32);
    private final HostService hosts = mock(HostService.class);
    private final StudioHost host = mock(StudioHost.class);
    private String mode = "auto";
    private final AtomicInteger passes = new AtomicInteger();
    private CompletableFuture<String> pass = CompletableFuture.completedFuture(modelVerdict("Approve"));

    @BeforeEach
    void setUp() {
        ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        jdbc = new JdbcTemplate(ds);
        StudioDb.migrate(jdbc);
        when(hosts.host()).thenReturn(host);
        when(host.contractRevision(anyString(), anyString())).thenReturn(2);
    }

    @AfterEach
    void tearDown() { ds.destroy(); }

    private DecisionService service() {
        var s = new DecisionService(jdbc, new TopicBroker(), hosts);
        s.policy(w -> new DecisionService.HostPolicy(mode, List.of()), (w, r) -> { passes.incrementAndGet(); return pass; });
        s.wire((w, i) -> { }, w -> "p1");
        return s;
    }

    private static String modelVerdict(String outcome) {
        return "{\"requestId\":\"review-1\",\"contractRevision\":2,\"reviewedCandidate\":\"" + CANDIDATE + "\",\"outcome\":\"" + outcome + "\","
            + "\"findings\":[{\"severity\":\"Minor\",\"location\":\"src/test/PriceTest.java:12\",\"issue\":\"the bound moved from 10 to 100\",\"kind\":\"TestIntegrity\"}],"
            + "\"confidence\":0.7,\"signedBy\":\"studio:review-pass(demo/model)\",\"reviewer\":\"model\"}";
    }

    /** The request of the core's increment review (TestIntegrity.reviewRequest form): the flag line names the path. */
    private static String reviewRequest(boolean humanOnly) {
        return "{\"id\":\"review-1\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\",\"context\":\"cell-1\"},\"scope\":\"Increment\","
            + "\"candidate\":\"" + CANDIDATE + "\",\"packetRef\":\"blob-1\",\"criteria\":[\"prices are never negative\","
            + "\"acceptance surface: src/test/PriceTest.java (test file) modified by edit · unclassified · required: CHK-test, CHK-ci · reason: the old bound was wrong · review: pending\"],"
            + "\"originalObligations\":[\"original src/test/PriceTest.java: assertTrue(price < 10)\"],\"humanOnly\":" + humanOnly + "}";
    }

    private static String decideRequest(String code, boolean humanOnly) {
        return "{\"id\":\"decide-1\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\"},\"incrementId\":\"I1\",\"candidate\":\"" + CANDIDATE + "\","
            + "\"code\":\"" + code + "\",\"items\":[{\"obligation\":\"integrity:src/test/PriceTest.java\",\"kind\":\"Integrity\",\"status\":\"Unverified\","
            + "\"reason\":\"integrity:src/test/PriceTest.java: acceptance surface src/test/PriceTest.java touches CHK-test, CHK-ci — integrity change needs a human review\","
            + "\"findings\":[],\"by\":null,\"humanOnly\":" + humanOnly + "}]}";
    }

    private ObjectNode pendingReview(DecisionService s) {
        var pending = s.list("pending", "W-1", 10);
        assertEquals(1, pending.size(), "one card waits for the user");
        assertEquals("review", Json.text(pending.get(0), "kind"));
        return (ObjectNode) pending.get(0);
    }

    @Test
    void aPersonsReviewIsTheUsersCardInAutoModeAndTheModelsVerdictNeverAnswersIt() {
        var s = service();
        var answer = s.review("W-1", reviewRequest(true));
        assertFalse(answer.isDone(), "the run waits for the user, not for the review pass");
        assertEquals(1, passes.get(), "the review pass runs once, for the card");
        var card = DecisionService.cardOf(pendingReview(s));
        assertEquals("review", Json.text(card, "kind"));
        assertEquals("integrity", Json.text(card, "variant"));
        JsonNode item = card.path("items").get(0);
        assertEquals("src/test/PriceTest.java", Json.text(item, "path"));
        assertEquals(List.of("CHK-test", "CHK-ci"), List.of(item.path("checks").get(0).asString(), item.path("checks").get(1).asString()));
        assertEquals("the old bound was wrong", Json.text(item, "reason"));
        assertEquals("approve", Json.text(card.path("model"), "outcome"));
        assertEquals("the bound moved from 10 to 100", Json.text(card.path("model").path("findings").get(0), "issue"));
    }

    @Test
    void askModeRaisesTheSameCard() {
        mode = "ask";
        var s = service();
        assertFalse(s.review("W-1", reviewRequest(true)).isDone());
        assertEquals("integrity", Json.text(DecisionService.cardOf(pendingReview(s)), "variant"));
    }

    @Test
    void theUsersApprovalAnswersAsAPersonsVerdictTheCoreReads() {
        var s = service();
        var answer = s.review("W-1", reviewRequest(true));
        var row = pendingReview(s);
        s.reply(Json.text(row, "id"), DecisionService.personVerdict(row.get("request"), true, null), null, "local");
        Verdict v = kotlinx.serialization.json.Json.Default.decodeFromString(Verdict.Companion.serializer(), answer.join());
        assertEquals(VerdictOutcome.Approve, v.getOutcome());
        assertEquals(ReviewerKind.Human, v.getReviewer());
        assertEquals("user:local", v.getSignedBy());
        assertEquals("review-1", v.getRequestId());
        assertEquals(2, v.getContractRevision());
    }

    @Test
    void theUsersRejectionIsASubstantiveFindingAtTheChangedTest() {
        var s = service();
        var answer = s.review("W-1", reviewRequest(true));
        var row = pendingReview(s);
        s.reply(Json.text(row, "id"), DecisionService.personVerdict(row.get("request"), false, " keep the old bound "), null, "local");
        Verdict v = kotlinx.serialization.json.Json.Default.decodeFromString(Verdict.Companion.serializer(), answer.join());
        assertEquals(VerdictOutcome.Reject, v.getOutcome());
        assertEquals(ReviewerKind.Human, v.getReviewer());
        assertEquals(1, v.getFindings().size());
        assertEquals(Severity.Major, v.getFindings().getFirst().getSeverity());
        assertEquals(FindingKind.TestIntegrity, v.getFindings().getFirst().getKind());
        assertEquals("src/test/PriceTest.java", v.getFindings().getFirst().getLocation());
        assertEquals("keep the old bound", v.getFindings().getFirst().getIssue());
    }

    @Test
    void aFailedReviewPassStillRaisesTheCardWithoutAModelVerdict() {
        pass = CompletableFuture.failedFuture(new IllegalStateException("no model"));
        var s = service();
        assertFalse(s.review("W-1", reviewRequest(true)).isDone());
        var card = DecisionService.cardOf(pendingReview(s));
        assertFalse(card.has("model"));
    }

    @Test
    void aReviewWithoutHumanOnlyStillGoesToTheReviewPass() {
        var s = service();
        String verdict = s.review("W-1", reviewRequest(false)).join();
        assertEquals("Approve", Json.text(Json.parse(verdict), "outcome"), "autonomous approval is unchanged: the pass answers");
        assertEquals(0, s.pendingCount("W-1"));
    }

    @Test
    void autoNeverAcceptsAHumanOnlyItemOnThePolicysWord() {
        var s = service();
        assertNull(s.decide("W-1", decideRequest("acceptance_decision", true)).join());
        var open = s.openAcceptance("W-1");
        assertNotNull(open, "the item becomes the user's card");
        var card = DecisionService.cardOf(open);
        assertEquals("integrity", Json.text(card, "variant"));
        JsonNode item = card.path("items").get(0);
        assertTrue(item.path("humanOnly").asBoolean());
        assertEquals("src/test/PriceTest.java", Json.text(item, "path"));
        assertEquals("CHK-test", item.path("checks").get(0).asString());
        assertEquals("CHK-ci", item.path("checks").get(1).asString());
    }

    @Test
    void theIntegrityReviewStopCodeAloneKeepsTheCard() {
        var s = service();
        assertNull(s.decide("W-1", decideRequest("integrity_review", false)).join());
        assertEquals("integrity", Json.text(DecisionService.cardOf(s.openAcceptance("W-1")), "variant"));
    }

    @Test
    void theAcceptanceCardCarriesTheModelsVerdictOnTheSameCandidate() {
        var s = service();
        s.review("W-1", reviewRequest(true));
        s.expireForWork("W-1", "the run stopped waiting for a person");
        s.decide("W-1", decideRequest("integrity_review", true)).join();
        var card = DecisionService.cardOf(s.openAcceptance("W-1"));
        assertEquals("approve", Json.text(card.path("model"), "outcome"));
        // The user's answer is the user's decision, which the core accepts for a human-only item.
        assertTrue(s.answerAcceptance(s.openAcceptance("W-1"), "accept", "the user approved the change to the tests", "local"));
        JsonNode replay = Json.parse(s.decide("W-1", decideRequest("integrity_review", true)).join());
        assertEquals("User", Json.text(replay, "decider"));
        assertEquals("Accept", Json.text(replay, "kind"));
    }

    @Test
    void autonomousApprovalStillAcceptsUnverifiedWorkInAuto() {
        var s = service();
        JsonNode d = Json.parse(s.decide("W-1", decideRequest("acceptance_decision", false).replace("integrity:", "check:").replace("\"Integrity\"", "\"Check\"")).join());
        assertEquals("Policy", Json.text(d, "decider"));
    }
}
