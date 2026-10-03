package io.astrolabe.studio.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

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
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/**
 * ASTROLABE 2.0 C4: the limits and approach of a run — chosen at the start or the user's defaults — reach the core
 * through the start spec; the old token limit migrates; a run stopped at a limit pauses with the limit's code and
 * continues in place only with that limit raised.
 */
class TaskLimitsTest {
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
    private final SettingsService settings = mock(SettingsService.class);
    private final ProjectSettings projectSettings = mock(ProjectSettings.class);
    private final EventPipeline pipeline = mock(EventPipeline.class);
    private Preferences preferences;
    private TaskService tasks;

    @BeforeEach
    void setUp() {
        ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        jdbc = new JdbcTemplate(ds);
        StudioDb.migrate(jdbc);
        preferences = new Preferences(jdbc);
        when(hosts.host()).thenReturn(host);
        when(host.newWorkId()).thenReturn("W-1");
        when(campaigns.taskOf(anyString())).thenReturn("W-1");
        when(accounts.list()).thenReturn(Json.arr());
        when(settings.runtime(any())).thenReturn(SettingsService.RUNTIME_DEFAULTS.deepCopy());
        when(projects.row("p1")).thenReturn(Optional.of(new ProjectService.ProjectRow("p1", dir.toString(), "p", false, null, null, null, false, false)));
        when(models.fitEffort(any(), any())).thenAnswer(i -> i.getArgument(1));
        when(projectSettings.savedChecks(any())).thenReturn(new io.astrolabe.studio.bridge.SavedChecks());
        DecisionService decisions = new DecisionService(jdbc, new TopicBroker(), hosts);
        tasks = new TaskService(jdbc, hosts, campaigns, projects, projectSettings, settings, preferences,
            accounts, models, decisions, pipeline, new TopicBroker(), mock(ChangesService.class), mock(StatsService.class), mock(ReviewPass.class));
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        tasks.destroy();
        Thread.sleep(200);   // the background launch stops on the mocks; let it finish before the database closes
        ds.destroy();
    }

    private void row(String outcome, String stopCode, String limitsJson) {
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, outcome, created_at, updated_at, task_id, model_ref, effort, task_mode, request_text, stop_code, limits_json, preset) " +
                "VALUES ('W-1','p1','fix it','stored',?,'2026-10-03T10:00:00Z','2026-10-03T10:00:00Z','W-1','demo/model','medium','ask','fix the discount',?,?,'thorough')",
            outcome, stopCode, limitsJson);
    }

    private static final ModelService.Bound BOUND = new ModelService.Bound("auto-demo", "demo", "model", false, 200_000);

    @Test
    void theStartsLimitsAndApproachAreKeptWithTheRun() {
        tasks.start("p1", "fix the discount", "demo/model", "medium", "ask", "economy",
            Json.parse("{\"moneyUsd\":\"7.5\",\"minutes\":null,\"requests\":40}"));
        ArgumentCaptor<String> limits = ArgumentCaptor.forClass(String.class);
        verify(campaigns).setBudget(eq("W-1"), limits.capture(), eq("economy"));
        assertEquals(new Limits("7.50", null, 40), Limits.of(limits.getValue(), null));
        assertEquals("economy", preferences.text(Preferences.DEFAULT_PRESET));
    }

    @Test
    void aStartWithoutLimitsTakesTheDefaults() {
        tasks.start("p1", "fix the discount", "demo/model", "medium", "ask");
        ArgumentCaptor<String> limits = ArgumentCaptor.forClass(String.class);
        verify(campaigns).setBudget(eq("W-1"), limits.capture(), eq("balanced"));
        assertEquals(Limits.DEFAULTS, Limits.of(limits.getValue(), null));
        assertEquals(new Limits("50.00", 480, 3000), Limits.DEFAULTS);
    }

    @Test
    void theSpecCarriesTheRunsLimitsAndGuardsAboveThem() {
        row(null, null, "{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":3000}");
        var run = new CampaignService.TaskRun("W-1", "p1", "W-1", null, "fix it", "fix the discount", "demo/model", "medium", "ask", false);
        var spec = tasks.spec(run, "fix the discount", BOUND);
        assertEquals("5.00", spec.getLimits().getMoneyUsd());
        assertEquals(60, spec.getLimits().getMinutes());
        assertEquals(3000, spec.getLimits().getRequests());
        assertEquals("thorough", spec.getPreset());
        assertEquals(200_000L * 10_000, spec.getTokens());
        assertEquals(48, spec.getMaxCells());
        assertNull(spec.getCostAmount());
    }

    @Test
    void clearedLimitsAreNamedAndARunWithoutStoredLimitsNamesNone() {
        // Review P1: the token guard never follows the request limit (the core keeps the first open's budget).
        row(null, null, "{\"moneyUsd\":null,\"minutes\":null,\"requests\":100}");
        var run = new CampaignService.TaskRun("W-1", "p1", "W-1", null, "fix it", "fix the discount", "demo/model", "medium", "ask", false);
        var spec = tasks.spec(run, "fix the discount", BOUND);
        assertNull(spec.getLimits().getMoneyUsd());
        assertEquals(200_000L * 10_000, spec.getTokens());
        // Review P2: a run stored before limits existed keeps whatever the core stores (null), not today's defaults.
        jdbc.update("UPDATE campaign_index SET limits_json = NULL WHERE work_id = 'W-1'");
        assertNull(tasks.spec(run, "fix the discount", BOUND).getLimits());
    }

    @Test
    void limitsAreValidated() {
        assertThrows(ApiException.class, () -> Limits.parse(Json.parse("{\"moneyUsd\":\"0\"}"), null));
        assertThrows(ApiException.class, () -> Limits.parse(Json.parse("{\"moneyUsd\":\"10000.01\"}"), null));
        assertThrows(ApiException.class, () -> Limits.parse(Json.parse("{\"minutes\":0}"), null));
        assertThrows(ApiException.class, () -> Limits.parse(Json.parse("{\"requests\":100001}"), null));
        assertThrows(ApiException.class, () -> Limits.parse(Json.parse("{\"requests\":2.5}"), null));
        assertEquals(Limits.NONE, Limits.parse(Json.parse("{\"moneyUsd\":null,\"minutes\":null,\"requests\":null}"), Limits.DEFAULTS));
        // A partial object keeps the other limits; rounding to nothing is no amount.
        assertEquals(new Limits("9.00", 480, 3000), Limits.parse(Json.parse("{\"moneyUsd\":\"9\"}"), Limits.DEFAULTS));
        assertThrows(ApiException.class, () -> Limits.parse(Json.parse("{\"moneyUsd\":\"0.00001\"}"), null));
        assertEquals(Limits.DEFAULTS, Limits.parse(null, Limits.DEFAULTS));
        assertEquals(new Limits("10000.00", 10_080, 100_000), Limits.parse(Json.parse("{\"moneyUsd\":10000,\"minutes\":10080,\"requests\":100000}"), null));
    }

    @Test
    void aLimitIsRaisedOnlyUpwardsOrAway() {
        Limits old = new Limits("5.00", 60, 300);
        assertTrue(new Limits("10.00", 60, 300).raises(old, "money"));
        assertTrue(new Limits(null, 60, 300).raises(old, "money"));
        assertFalse(new Limits("5", 60, 300).raises(old, "money"));
        assertFalse(new Limits("5.00", 60, 300).raises(old, "minutes"));
        assertTrue(new Limits("5.00", 60, 301).raises(old, "requests"));
    }

    /** The preferences after migrating a database at schema v3 that stored [oldLimit] as the token-era `limit`. */
    private Limits migrated(String name, String oldLimit) {
        SingleConnectionDataSource old = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve(name), true);
        try {
            JdbcTemplate db = new JdbcTemplate(old);
            db.execute("CREATE TABLE schema_version (version INTEGER NOT NULL, applied_at TEXT NOT NULL)");
            for (int i = 0; i < 3; i++) {
                for (String sql : StudioDb.MIGRATIONS.get(i)) db.execute(sql);
                db.update("INSERT INTO schema_version (version, applied_at) VALUES (?, 'x')", i + 1);
            }
            db.update("INSERT INTO preference (key, json, updated_at) VALUES ('limit', ?, 'x')", oldLimit);
            StudioDb.migrate(db);
            assertEquals(List.of(), db.queryForList("SELECT key FROM preference WHERE key = 'limit'"));
            return Limits.parse(new Preferences(db).get(Preferences.TASK_LIMITS), null);
        } finally {
            old.destroy();
        }
    }

    @Test
    void theOldMoneyLimitMigratesAndTokenLimitsTakeTheDefaults() {
        assertEquals(new Limits("7.00", 480, 3000), migrated("money.db", "{\"kind\":\"money\",\"value\":\"7\"}"));
        assertEquals(Limits.DEFAULTS, migrated("tokens.db", "{\"kind\":\"tokens\",\"value\":\"900000\"}"));
        assertEquals(Limits.DEFAULTS, migrated("auto.db", "{\"kind\":\"auto\"}"));
        assertEquals(new Limits("10000.00", 480, 3000), migrated("big.db", "{\"kind\":\"money\",\"value\":\"20000\"}"));
    }

    @Test
    void aRunStoppedAtTheMoneyLimitPausesWithThatLimit() {
        row("budget_exhausted", "task_limit_money", "{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":300}");
        when(host.isOpen("p1")).thenReturn(true);
        when(host.finishReceipt("p1", "W-1")).thenReturn("{\"status\":\"partial\",\"limit\":{\"bestCandidate\":\"c1\",\"workingTree\":false,\"verifiedEarlier\":[\"R-1\"]}}");
        var task = tasks.task("W-1", false);
        assertEquals("paused", Json.text(task, "state"));
        assertEquals("limit_money", Json.text(task.path("reason"), "code"));
        assertEquals("5.00", Json.text(task.path("reason").path("params"), "limit"));
        assertEquals("money", Json.text(task.path("limit"), "kind"));
        assertEquals("earlier", Json.text(task.path("limit"), "best"));
        assertEquals("thorough", Json.text(task, "preset"));
    }

    @Test
    void aRaisedLimitContinuesTheSameRun() {
        row("budget_exhausted", "task_limit_requests", "{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":300}");
        tasks.resume("W-1", null, null, null, Json.parse("{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":600}"));
        ArgumentCaptor<String> limits = ArgumentCaptor.forClass(String.class);
        verify(campaigns).setBudget(eq("W-1"), limits.capture(), eq(null));
        assertEquals(new Limits("5.00", 60, 600), Limits.of(limits.getValue(), null));
        verify(projects).open("p1");
        verify(campaigns, never()).register(any());
    }

    @Test
    void limitsThatDoNotRaiseTheReachedOneAreRefused() {
        row("budget_exhausted", "task_limit_requests", "{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":300}");
        assertThrows(ApiException.class, () -> tasks.resume("W-1", null, null, null, Json.parse("{\"moneyUsd\":\"9.00\",\"minutes\":60,\"requests\":300}")));
        verify(projects, never()).open(any());
    }

    @Test
    void continueWithoutLimitsAfterALimitIsAFollowUp() {
        row("budget_exhausted", "task_limit_minutes", "{\"moneyUsd\":null,\"minutes\":60,\"requests\":null}");
        when(host.newWorkId()).thenReturn("W-2");
        tasks.resume("W-1", null, null, null);
        verify(campaigns).register(any());
        verify(campaigns).setBudget(eq("W-2"), anyString(), eq("thorough"));
    }

    @Test
    void theCellCapContinuesInPlaceAsTheBuiltInLimit() {
        row("budget_exhausted", "cell_cap", null);
        assertEquals("limit_reached", Json.text(tasks.task("W-1", false).path("reason"), "code"));
        tasks.resume("W-1", null, null, null);
        verify(projects).open("p1");
        verify(campaigns, never()).register(any());
    }

    @Test
    void theOfferedCheckBecomesTheProjectsAndNoOtherCommandDoes() {
        row("completed", null, null);
        when(host.isOpen("p1")).thenReturn(true);
        when(host.finishReceipt("p1", "W-1")).thenReturn("{\"outcome\":\"completed\",\"provenanceClass\":\"agent_test\",\"acceptanceSurfaceModelApproved\":[],"
            + "\"checksRun\":[{\"checkId\":\"CHK-model-1a2b\",\"outcome\":\"passed\",\"evidenceKind\":\"Tests\",\"command\":{\"argv\":[\"pytest\",\"-q\"],\"cwd\":null}}]}");
        when(projectSettings.get("p1")).thenReturn((tools.jackson.databind.node.ObjectNode) Json.parse("{\"checks\":{\"test\":{\"source\":\"none\"}}}"));
        assertEquals("pytest -q", Json.text(tasks.task("W-1", true).path("checkOffer"), "command"));
        assertThrows(ApiException.class, () -> tasks.adoptCheck("W-1", "rm -rf ."));
        verify(projectSettings, never()).saveCheck(any(), any(), any(), any());
        tasks.adoptCheck("W-1", "pytest -q");
        verify(projectSettings).saveCheck("p1", "test", "pytest -q", "local");
    }

    private void limitEvent(int seq, String limit, String stage) {
        jdbc.update("INSERT INTO event_log (work_id, seq, at, source, kind, payload) VALUES ('W-1', ?, '2026-10-03T11:00:00Z', 'bus', 'budget.limit_reached', ?)",
            seq, "{\"kind\":\"budget.limit_reached\",\"data\":{\"limit\":\"" + limit + "\",\"stage\":\"" + stage + "\",\"action\":\"raise_limit\"}}");
    }

    @Test
    void aLimitThatStillHoldsAfterARaiseIsTheOneShownAndRaised() {
        // Stopped at money; the reopen with more money found the minutes spent too (core: still reached (minutes)).
        row("budget_exhausted", "task_limit_money", "{\"moneyUsd\":\"10.00\",\"minutes\":60,\"requests\":300}");
        limitEvent(1, "money", "stopped");
        limitEvent(2, "minutes", "reserve");
        limitEvent(3, "minutes", "stopped");
        var task = tasks.task("W-1", false);
        assertEquals("limit_minutes", Json.text(task.path("reason"), "code"));
        assertEquals(60, task.path("reason").path("params").path("limit").asInt());
        assertEquals("minutes", Json.text(task.path("limit"), "kind"));
        // Raising money again is not raising the limit that holds the run.
        assertThrows(ApiException.class, () -> tasks.resume("W-1", null, null, null, Json.parse("{\"moneyUsd\":\"20.00\",\"minutes\":60,\"requests\":300}")));
        tasks.resume("W-1", null, null, null, Json.parse("{\"moneyUsd\":\"10.00\",\"minutes\":120,\"requests\":300}"));
        verify(campaigns).setBudget(eq("W-1"), anyString(), eq(null));
    }

    private static io.astrolabe.studio.bridge.CampaignRef ref(String budgetStop) {
        return new io.astrolabe.studio.bridge.CampaignRef("W-1", "a", null, 1, "f", "{}", budgetStop == null ? null : "budget", null, null, budgetStop);
    }

    private void notices(String code, int times) {
        verify(pipeline, org.mockito.Mockito.times(times)).studioItem(eq("W-1"), eq("studio.notice"),
            org.mockito.ArgumentMatchers.argThat(d -> code.equals(Json.text(d, "code"))));
    }

    @Test
    void theTaskContinuesOnlyWhenTheCoreLeftTheLimitStop() {
        row("budget_exhausted", "task_limit_requests", "{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":300}");
        tasks.resume("W-1", null, null, null, Json.parse("{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":301}"));
        // The reserve still holds (core Reserve, not Within): the open leaves the campaign stopped.
        tasks.reopened("W-1", ref("task_limit_requests"));
        notices("limit_still_reached", 1);
        notices("limit_raised", 0);
        // A second raise that frees it says so once.
        tasks.resume("W-1", null, null, null, Json.parse("{\"moneyUsd\":\"5.00\",\"minutes\":60,\"requests\":600}"));
        tasks.reopened("W-1", ref(null));
        tasks.reopened("W-1", ref(null));
        notices("limit_raised", 1);
    }
}
