package io.astrolabe.studio.campaigns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;

import io.astrolabe.studio.db.StudioDb;
import io.astrolabe.studio.settings.SettingsService;
import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/**
 * ASTROLABE 2.0 C14 (D-405), the campaign API: a resume sends the budget the campaign was launched with, never a
 * placeholder; an effort named in the campaign's options is the user's; a stored state's stop reads in either form.
 */
class CampaignResumeTest {
    @TempDir
    Path dir;
    private SingleConnectionDataSource ds;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        jdbc = new JdbcTemplate(ds);
        StudioDb.migrate(jdbc);
    }

    @AfterEach
    void tearDown() { ds.destroy(); }

    private void opened(int seq, long tokens) {
        jdbc.update("INSERT INTO event_log (work_id, seq, at, source, kind, payload) VALUES ('W-1', ?, '2026-10-03T10:00:00Z', 'studio', 'studio.opened', ?)",
            seq, "{\"kind\":\"studio.opened\",\"data\":{\"tokens\":" + tokens + "}}");
    }

    @Test
    void aResumeSendsTheBudgetTheCampaignWasLaunchedWith() {
        var config = Json.parse("{\"defaults\":{\"campaignCells\":12},\"profileRoles\":{\"main\":\"m\"},\"profiles\":{\"m\":{\"capabilities\":{\"contextLimitTokens\":200000}}}}");
        var runtime = SettingsService.RUNTIME_DEFAULTS.deepCopy();
        opened(1, 2_400_000);
        // A resume before C14 recorded its placeholder of one token: the launch budget is still the one before it.
        opened(2, 1);
        assertEquals(2_400_000L, CampaignService.launchTokens(jdbc, "W-1", null, config, runtime));
        // Nothing recorded: what the start computes — the options' tokens, the runtime default, the context × cells.
        assertEquals(900_000L, CampaignService.launchTokens(jdbc, "W-9", Json.parse("{\"tokens\":900000}"), config, runtime));
        assertEquals(700_000L, CampaignService.launchTokens(jdbc, "W-9", null, config, runtime.put("defaultTokens", 700_000)));
        assertEquals(200_000L * 12, CampaignService.launchTokens(jdbc, "W-9", null, config, SettingsService.RUNTIME_DEFAULTS.deepCopy()));
    }

    @Test
    void anEffortNamedInTheOptionsIsTheUsersAndTheRuntimeDefaultIsNot() {
        var runtime = SettingsService.RUNTIME_DEFAULTS.deepCopy();
        var chosen = CampaignService.legacySpec("x", 10, null, null, false, 48, 480, Json.parse("{\"effort\":\"High\"}"), runtime);
        assertEquals("High", chosen.getEffort());
        assertTrue(chosen.getEffortExplicit());
        var byDefault = CampaignService.legacySpec("x", 10, null, null, false, 48, 480, Json.parse("{\"tokens\":10}"), runtime);
        assertEquals("Medium", byDefault.getEffort());
        assertFalse(byDefault.getEffortExplicit());
        assertNull(byDefault.getLimits());
    }

    @Test
    void aStoredStateNamesItsStopInEitherForm() {
        assertEquals("task_limit_money", CampaignService.stopCodeOf(Json.parse("{\"budgetStop\":\"TaskLimitMoney\"}")));
        assertEquals("contract_budget", CampaignService.stopCodeOf(Json.parse("{\"budgetStop\":\"contract_budget\",\"stopCode\":null}")));
        assertEquals("acceptance_decision", CampaignService.stopCodeOf(Json.parse("{\"stopCode\":\"AcceptanceDecision\",\"budgetStop\":null}")));
        assertNull(CampaignService.stopCodeOf(Json.parse("{}")));
        assertNull(CampaignService.stopCodeOf(null));
    }
}
