package io.astrolabe.studio.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;

import io.astrolabe.studio.accounts.AccountService;
import io.astrolabe.studio.bridge.StudioHost;
import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.changes.ChangesService;
import io.astrolabe.studio.db.StudioDb;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.models.ModelService;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.settings.Preferences;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.stats.StatsService;
import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/**
 * Phase 0 B3 and C1–C2 at the task level: a waiting run shows the core's decision card; "done" and "rework" store the
 * user's word and resume the run once; a repeated answer, Continue while the run opens, and a message sent while it
 * opens start nothing new.
 */
class TaskAcceptanceTest {
    @TempDir
    Path dir;
    private JdbcTemplate jdbc;
    private SingleConnectionDataSource ds;
    private final HostService hosts = mock(HostService.class);
    private final StudioHost host = mock(StudioHost.class);
    private final CampaignService campaigns = mock(CampaignService.class);
    private final ProjectService projects = mock(ProjectService.class);
    private final AccountService accounts = mock(AccountService.class);
    private final ModelService models = mock(ModelService.class);
    private final ReviewPass reviewPass = mock(ReviewPass.class);
    private DecisionService decisions;
    private TaskService tasks;

    @BeforeEach
    void setUp() {
        ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        jdbc = new JdbcTemplate(ds);
        StudioDb.migrate(jdbc);
        when(hosts.host()).thenReturn(host);
        when(campaigns.taskOf(anyString())).thenReturn("W-1");
        when(accounts.list()).thenReturn(Json.arr());
        when(host.contractRevision(any(), any())).thenReturn(2);
        when(reviewPass.review(anyString(), any())).thenReturn(java.util.concurrent.CompletableFuture.completedFuture(null));
        decisions = new DecisionService(jdbc, new TopicBroker(), hosts);
        tasks = new TaskService(jdbc, hosts, campaigns, projects, mock(ProjectSettings.class), mock(SettingsService.class), mock(Preferences.class),
            accounts, models, decisions, mock(EventPipeline.class), new TopicBroker(), mock(ChangesService.class), mock(StatsService.class), reviewPass);
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        tasks.destroy();
        Thread.sleep(200);   // a resumed run's background launch stops on the mocks; let it finish before the database closes
        ds.destroy();
    }

    private void run(String status, String outcome, String stopCode) {
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, outcome, created_at, updated_at, task_id, model_ref, effort, task_mode, request_text, stop_code) " +
                "VALUES ('W-1','p1','open a page',?,?,'2026-09-30T10:00:00Z','2026-09-30T10:00:00Z','W-1','demo/model','medium','ask','open the page in a browser',?)",
            status, outcome, stopCode);
    }

    private String waitingCard() {
        run("stored", "waiting_for_input", "acceptance_decision");
        decisions.decide("W-1", "{\"id\":\"decide-1\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\"},\"incrementId\":\"I1\",\"candidate\":{\"digest\":\"ab\"},"
            + "\"code\":\"acceptance_decision\",\"items\":[{\"obligation\":\"AC-1\",\"kind\":\"Check\",\"status\":\"Unverified\",\"reason\":\"a browser action leaves no trace in files\"}]}").join();
        var task = tasks.task("W-1", false);
        assertEquals("needs_you", Json.text(task, "state"));
        assertEquals("acceptance_decision", Json.text(task.path("reason"), "code"));
        var card = task.path("pending").get(0);
        assertEquals("acceptance", Json.text(card, "kind"));
        return Json.text(card, "id");
    }

    @Test
    void doneStoresTheUsersWordAndResumesTheRunOnce() {
        String card = waitingCard();
        tasks.card("W-1", card, Json.obj().put("decision", "done"));
        tasks.card("W-1", card, Json.obj().put("decision", "done"));
        verify(projects, times(1)).open("p1");
        var stored = jdbc.queryForList("SELECT kind, by_authority FROM acceptance_decision WHERE request_id = 'decide-1'");
        assertEquals(1, stored.size());
        assertEquals("accept", stored.getFirst().get("kind"));
        assertEquals("user:local", stored.getFirst().get("by_authority"));
    }

    @Test
    void aMessageOnTheCardIsReworkWithItsText() {
        waitingCard();
        var result = tasks.message("W-1", "the page does not open, fix the path", null, null, null, null);
        assertEquals("rework", Json.text(result, "effect"));
        verify(host, never()).amend(anyString(), anyString(), anyString());
        var stored = jdbc.queryForList("SELECT kind, text FROM acceptance_decision WHERE request_id = 'decide-1'");
        assertEquals("rework", stored.getFirst().get("kind"));
        assertEquals("the page does not open, fix the path", stored.getFirst().get("text"));
        verify(projects, times(1)).open("p1");
    }

    @Test
    void continueDoesNothingWhileTheRunOpens() {
        run("opening", null, null);
        tasks.resume("W-1", null, null, null);
        tasks.resume("W-1", null, null, null);
        verify(projects, never()).open(any());
    }

    @Test
    void aMessageSentWhileTheRunOpensIsQueuedNotARun() {
        run("opening", null, null);
        var result = tasks.message("W-1", "what are you doing? it's implemented", null, null, null, null);
        assertEquals("queued", Json.text(result, "effect"));
        verify(host, never()).amend(anyString(), anyString(), anyString());
        verify(projects, never()).open(any());
    }

    private String recapOfCompleted(String receipt) {
        run("stored", "completed", null);
        when(host.isOpen("p1")).thenReturn(receipt != null);
        when(host.finishReceipt("p1", "W-1")).thenReturn(receipt);
        String recap = tasks.recap(tasks.runs("W-1"));
        assertTrue(recap.length() <= 1_500, recap);
        return recap;
    }

    /** The recorded follow-up (diags W-uyorz7p4tivk7xvm7iaq): twelve `.gradle` cache files were named, no source file. */
    @Test
    void theRecapNamesSourcesNotBuildOutputOrAVendoredTool() {
        List<String> paths = new java.util.ArrayList<>(List.of(
            ".gradle/9.7.1/checksums/checksums.lock", ".gradle/9.7.1/fileHashes/fileHashes.bin", ".idea/misc.xml", "AGENTS.md", "build.gradle.kts",
            "build/reports/tests/test/index.html", "node_modules/react/index.js", "public/app/main.mjs", "src/main/java/notes/ApiController.java",
            "src/main/java/notes/NoteStore.java", "src/main/java/notes/WebConfig.java", "src/test/java/notes/ApiTests.java", "src/main/resources/application.properties"));
        for (int i = 0; i < 1_000; i++) paths.add("devtools/jdk/lib/file" + i);
        String files = TaskService.changedFiles(paths);
        assertEquals("AGENTS.md, build.gradle.kts, devtools/jdk/lib/file0, devtools/jdk/lib/file1, devtools/jdk/lib/file10, devtools/jdk/lib/file100, public/app/main.mjs, "
            + "src/main/java/notes/ApiController.java, src/main/java/notes/NoteStore.java, src/main/java/notes/WebConfig.java, src/main/resources/application.properties, "
            + "src/test/java/notes/ApiTests.java and 996 more",
            TaskService.changedFiles(paths.stream().sorted().toList()));
        assertTrue(!files.contains(".gradle/") && !files.contains(".idea/") && !files.contains("build/") && !files.contains("node_modules/"), files);
        assertEquals("", TaskService.changedFiles(List.of(".gradle/x.lock", "build/a.class")));
    }

    @Test
    void theRecapCallsAPolicyAcceptedRunNotVerified() {
        String recap = recapOfCompleted("{\"acceptance\":[{\"id\":\"AC-1\",\"provenance\":\"accepted\",\"decider\":\"policy\"}]}");
        assertTrue(recap.contains("Outcome: finished, not verified (accepted by the auto policy without a passing check)."), recap);
        assertEquals("unverified", Json.text(tasks.task("W-1", false), "verified"));
    }

    @Test
    void theRecapCallsARunWithoutAReceiptNotVerified() {
        String recap = recapOfCompleted(null);
        assertTrue(recap.contains("Outcome: finished, not verified (no passing check recorded)."), recap);
        assertTrue(!recap.contains("finished and verified"), recap);
    }

    @Test
    void theRecapCallsAReviewedRunVerified() {
        String recap = recapOfCompleted("{\"acceptance\":[{\"id\":\"AC-1\",\"provenance\":\"reviewed\"}]}");
        assertTrue(recap.contains("Outcome: finished and verified."), recap);
    }

    @Test
    void theRecapSaysWhoVerifiedTheRun() {
        String recap = recapOfCompleted("{\"provenanceClass\":\"agent_test\",\"acceptanceSurfaceModelApproved\":[],\"acceptance\":[{\"id\":\"AC-1\",\"provenance\":\"reviewed\",\"verifiedBy\":\"T2\"}]}");
        assertTrue(recap.contains("Outcome: finished; verified only by the agent's own test."), recap);
        var provenance = tasks.task("W-1", false).path("provenance");
        assertEquals("agent_test", Json.text(provenance, "class"));
        assertTrue(provenance.path("judge").asBoolean());
    }

    @Test
    void aRunThatEndedOtherwiseShowsNoCard() {
        String card = waitingCard();
        assertNotNull(card);
        jdbc.update("UPDATE campaign_index SET outcome = 'completed', stop_code = NULL WHERE work_id = 'W-1'");
        var task = tasks.task("W-1", false);
        assertEquals(0, task.path("pending").size());
        assertTrue(List.of("done", "working").contains(Json.text(task, "state")), Json.text(task, "state"));
        assertNull(task.get("reason"));
    }

    private static final String CANDIDATE = "ab".repeat(32);

    @Test
    void aTestChangeWaitingForThePersonNeedsYouAndDoneIsTheUsersApproval() {
        run("stored", "waiting_for_input", "integrity_review");
        decisions.decide("W-1", "{\"id\":\"decide-1\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\"},\"incrementId\":\"I1\",\"candidate\":\"" + CANDIDATE + "\","
            + "\"code\":\"integrity_review\",\"items\":[{\"obligation\":\"integrity:src/test/PriceTest.java\",\"kind\":\"Integrity\",\"status\":\"Unverified\","
            + "\"reason\":\"integrity:src/test/PriceTest.java: acceptance surface src/test/PriceTest.java touches CHK-test — integrity change needs a human review\",\"humanOnly\":true}]}").join();
        var task = tasks.task("W-1", false);
        assertEquals("needs_you", Json.text(task, "state"), "a test change waiting for the user is not an error");
        assertEquals("integrity_review", Json.text(task.path("reason"), "code"));
        var card = task.path("pending").get(0);
        assertEquals("acceptance", Json.text(card, "kind"));
        assertEquals("integrity", Json.text(card, "variant"));
        tasks.card("W-1", Json.text(card, "id"), Json.obj().put("decision", "done"));
        var stored = jdbc.queryForList("SELECT kind, text FROM acceptance_decision WHERE request_id = 'decide-1'");
        assertEquals("accept", stored.getFirst().get("kind"));
        assertEquals("the user approved the change to the tests", stored.getFirst().get("text"));
        verify(projects, times(1)).open("p1");
    }

    @Test
    void approveOnAReviewCardAnswersWithThePersonsVerdict() {
        run("stored", null, null);
        var answer = decisions.review("W-1", "{\"id\":\"review-1\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\"},\"scope\":\"Increment\","
            + "\"candidate\":\"" + CANDIDATE + "\",\"packetRef\":\"blob-1\",\"criteria\":[],\"originalObligations\":[\"src/test/PriceTest.java: assertTrue(price < 10)\"],\"humanOnly\":true}");
        var card = tasks.task("W-1", false).path("pending").get(0);
        assertEquals("review", Json.text(card, "kind"));
        assertEquals("src/test/PriceTest.java", Json.text(card.path("items").get(0), "path"));
        try {
            tasks.card("W-1", Json.text(card, "id"), Json.obj().put("decision", "accept"));
            org.junit.jupiter.api.Assertions.fail("a review card is not a suggestion");
        } catch (io.astrolabe.studio.support.ApiException expected) { /* the review card takes approve or reject only */ }
        tasks.card("W-1", Json.text(card, "id"), Json.obj().put("decision", "approve"));
        var verdict = Json.parse(answer.join());
        assertEquals("Approve", Json.text(verdict, "outcome"));
        assertEquals("human", Json.text(verdict, "reviewer"));
        assertEquals(0, tasks.task("W-1", false).path("pending").size());
    }
}
