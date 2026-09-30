package io.astrolabe.studio.decisions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.nio.file.Path;
import java.util.List;

import io.astrolabe.studio.db.StudioDb;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import tools.jackson.databind.JsonNode;

/**
 * Phase 0 B2/B3: the host's acceptance decision — `auto` accepts what could not be verified on the policy's word and
 * never a review's rejection; `ask` keeps an open card; the user's answer is stored once for its request and replayed
 * to the core; the card survives a backend restart.
 */
class AcceptanceDecisionsTest {
    @TempDir
    Path dir;
    private JdbcTemplate jdbc;
    private SingleConnectionDataSource ds;
    private final HostService hosts = mock(HostService.class);
    private String mode = "ask";

    @BeforeEach
    void setUp() {
        ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        jdbc = new JdbcTemplate(ds);
        StudioDb.migrate(jdbc);
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() { ds.destroy(); }

    private DecisionService service() {
        var s = new DecisionService(jdbc, new TopicBroker(), hosts);
        s.policy(w -> new DecisionService.HostPolicy(mode, List.of()), (w, r) -> java.util.concurrent.CompletableFuture.completedFuture(null));
        s.wire((w, i) -> { }, w -> "p1");
        return s;
    }

    private static String request(String id, String status) {
        return "{\"id\":\"" + id + "\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\",\"context\":\"cell-1\"},"
            + "\"incrementId\":\"I1\",\"candidate\":{\"digest\":\"ab\"},\"code\":\"" + (status.equals("Failed") ? "review_rejected" : "acceptance_decision") + "\","
            + "\"items\":[{\"obligation\":\"AC-1\",\"kind\":\"Check\",\"status\":\"" + status + "\",\"reason\":\"the reviewer could not open a browser\"}]}";
    }

    @Test
    void autoAcceptsWhatCouldNotBeVerifiedOnThePolicysWord() {
        mode = "auto";
        String reply = service().decide("W-1", request("decide-1", "Unverified")).join();
        JsonNode d = Json.parse(reply);
        assertEquals("Accept", Json.text(d, "kind"));
        assertEquals("Policy", Json.text(d, "decider"));
        assertEquals("decide-1", Json.text(d, "requestId"));
        assertTrue(Json.text(d, "reason").startsWith("not verified: "), Json.text(d, "reason"));
        assertEquals("ab", Json.text(d.path("candidate"), "digest"));
    }

    @Test
    void autoNeverAcceptsAReviewsRejection() {
        mode = "auto";
        var s = service();
        assertNull(s.decide("W-1", request("decide-1", "Failed")).join());
        assertNotNull(s.openAcceptance("W-1"), "the rejection becomes a card for the user");
    }

    @Test
    void askKeepsACardAndTheAnswerIsStoredOnceAndReplayed() {
        var s = service();
        assertNull(s.decide("W-1", request("decide-1", "Unverified")).join());
        var card = s.openAcceptance("W-1");
        assertNotNull(card);
        assertEquals("acceptance", Json.text(DecisionService.cardOf(card), "kind"));
        assertEquals("unverified", Json.text(DecisionService.cardOf(card), "variant"));
        assertTrue(s.answerAcceptance(card, "accept", "the page opens", "local"));
        assertFalse(s.answerAcceptance(card, "rework", "again", "local"), "a second answer to the same card changes nothing");
        assertNull(s.openAcceptance("W-1"));
        JsonNode replay = Json.parse(s.decide("W-1", request("decide-1", "Unverified")).join());
        assertEquals("Accept", Json.text(replay, "kind"));
        assertEquals("User", Json.text(replay, "decider"));
        assertEquals("user:local", Json.text(replay, "by"));
        assertEquals("the page opens", Json.text(replay, "reason"));
        assertNull(s.decide("W-1", request("decide-2", "Unverified")).join(), "another request is a new question");
    }

    @Test
    void aReworkAnswerCarriesTheUsersText() {
        var s = service();
        s.decide("W-1", request("decide-1", "Failed")).join();
        var card = s.openAcceptance("W-1");
        assertEquals("rejected", Json.text(DecisionService.cardOf(card), "variant"));
        assertTrue(s.answerAcceptance(card, "rework", "clamp the discount", "local"));
        JsonNode replay = Json.parse(s.decide("W-1", request("decide-1", "Failed")).join());
        assertEquals("Rework", Json.text(replay, "kind"));
        assertEquals("clamp the discount", Json.text(replay, "reason"));
    }

    @Test
    void theCardSurvivesABackendRestart() {
        service().decide("W-1", request("decide-1", "Unverified")).join();
        var restarted = service();
        var card = restarted.openAcceptance("W-1");
        assertNotNull(card, "an open acceptance card is not a pending future: a restart keeps it");
        assertTrue(restarted.answerAcceptance(card, "accept", null, "local"));
        assertEquals("Accept", Json.text(Json.parse(restarted.decide("W-1", request("decide-1", "Unverified")).join()), "kind"));
    }

    @Test
    void aNewerRequestReplacesTheOpenCard() {
        var s = service();
        s.decide("W-1", request("decide-1", "Unverified")).join();
        s.decide("W-1", request("decide-2", "Unverified")).join();
        assertEquals("decide-2", Json.text(s.openAcceptance("W-1").get("request"), "id"));
        s.closeAcceptance("W-1", "the run ended completed");
        assertNull(s.openAcceptance("W-1"));
    }
}
