package io.astrolabe.studio.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;

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
import io.astrolabe.verify.ScratchPolicy;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/**
 * W3 in the Studio: a task shows the scratch list its attempt froze. Its untracked output never reaches the change list
 * (snapshots under the policy leave it out), and the Studio hides no change of its own.
 */
class TaskScratchTest {
    @TempDir
    Path dir;
    private SingleConnectionDataSource ds;
    private TaskService tasks;

    @AfterEach
    void tearDown() {
        if (tasks != null) tasks.destroy();
        if (ds != null) ds.destroy();
    }

    @Test
    void theTaskShowsItsScratchListAndHidesNoChange() {
        ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        StudioDb.migrate(jdbc);
        HostService hosts = mock(HostService.class);
        StudioHost host = mock(StudioHost.class);
        CampaignService campaigns = mock(CampaignService.class);
        ChangesService changes = mock(ChangesService.class);
        when(hosts.host()).thenReturn(host);
        when(campaigns.taskOf(anyString())).thenReturn("W-1");
        when(host.isOpen("p1")).thenReturn(true);
        when(host.scratchPolicy("p1", "W-1")).thenReturn(ScratchPolicy.BUILT_IN);
        when(changes.taskChanges(eq("p1"), any(), anyBoolean())).thenReturn((tools.jackson.databind.node.ObjectNode) Json.parse(
            "{\"files\":[{\"path\":\"src/App.java\",\"added\":3,\"removed\":1},{\"path\":\"build/kept.txt\",\"kind\":\"D\",\"added\":0,\"removed\":1}]}"));
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, outcome, created_at, updated_at, task_id, model_ref, effort, task_mode, request_text) " +
            "VALUES ('W-1','p1','t','stored','completed','2026-10-05T10:00:00Z','2026-10-05T10:00:00Z','W-1','demo/model','medium','ask','do it')");
        DecisionService decisions = new DecisionService(jdbc, new TopicBroker(), hosts);
        tasks = new TaskService(jdbc, hosts, campaigns, mock(ProjectService.class), mock(ProjectSettings.class), mock(SettingsService.class), mock(Preferences.class),
            mock(AccountService.class), mock(ModelService.class), decisions, mock(EventPipeline.class), new TopicBroker(), changes, mock(StatsService.class), mock(ReviewPass.class));

        var task = tasks.task("W-1", true);
        // A tracked file under an output root (here deleted) is a change like any other: nothing is hidden.
        assertEquals(2, task.path("changes").path("files").asInt(), task.path("changes").toString());
        assertEquals(2, task.path("changes").path("removed").asInt());
        assertTrue(task.path("changes").path("scratch").isMissingNode());
        var roots = task.path("scratch").path("roots");
        assertTrue(roots.size() == ScratchPolicy.DEFAULT_PREFIXES.size() && roots.toString().contains("\"build\""), roots.toString());
        assertEquals(ScratchPolicy.BUILT_IN.getId(), Json.text(task.path("scratch"), "id"));
    }
}
