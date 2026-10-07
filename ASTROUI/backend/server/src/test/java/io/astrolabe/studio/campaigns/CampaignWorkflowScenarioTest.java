package io.astrolabe.studio.campaigns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicReference;

import io.astrolabe.studio.bridge.CampaignRef;
import io.astrolabe.studio.bridge.RunListener;
import io.astrolabe.studio.bridge.StartSpec;
import io.astrolabe.studio.bridge.StudioHost;
import io.astrolabe.studio.db.StudioDb;
import io.astrolabe.studio.decisions.DecisionService;
import io.astrolabe.studio.live.EventPipeline;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.runtime.TransportService;
import io.astrolabe.studio.settings.SettingsService;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/**
 * WF-10 in the campaign index: a run whose cell failed on an exception is the core's resumable `failed`; its end callback
 * and every later refresh from the core's state keep `cell_failure`, so the task service continues the same work.
 */
class CampaignWorkflowScenarioTest {
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

    @Test
    void aCellFailureKeepsItsStopCodeThroughTheRunEndAndEveryRefresh() {
        HostService hosts = mock(HostService.class);
        StudioHost host = mock(StudioHost.class);
        when(hosts.host()).thenReturn(host);
        when(host.isOpen("p1")).thenReturn(true);
        when(host.campaign("p1", "W-1")).thenReturn("{\"workId\":\"W-1\",\"phase\":\"Implementing\",\"outcome\":\"failed\",\"createdAt\":\"2026-10-05T10:00:00Z\","
            + "\"state\":{\"outcome\":\"Failed\",\"reason\":\"cell failed: IllegalStateException: boom\",\"failedResumably\":true}}");
        CampaignRef ref = mock(CampaignRef.class);
        when(ref.getReconciliationJson()).thenReturn("{}");
        AtomicReference<RunListener> listener = new AtomicReference<>();
        when(host.resume(anyString(), anyString(), any(), anyString(), any(), any(), any(), any(), any())).thenAnswer(inv -> {
            listener.set(inv.getArgument(8));
            return ref;
        });
        CampaignService campaigns = new CampaignService(jdbc, hosts, mock(TransportService.class), mock(SettingsService.class), mock(ProjectService.class),
            mock(DecisionService.class), new TopicBroker(), mock(EventPipeline.class));
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, created_at, updated_at, task_id) VALUES ('W-1','p1','t','opening','2026-10-05T10:00:00Z','2026-10-05T10:00:00Z','W-1')");

        campaigns.open(new CampaignService.TaskRun("W-1", "p1", "W-1", null, "t", "do it", "demo/model", "medium", "ask", false), "{}", mock(StartSpec.class), true);
        listener.get().onEnded("W-1", "failed", "cell failed: IllegalStateException: boom", StudioHost.CELL_FAILURE, null);
        assertEquals(StudioHost.CELL_FAILURE, stopCode(), "WF-10: the run end lost the resumable failure");
        campaigns.refresh("W-1");
        assertEquals(StudioHost.CELL_FAILURE, stopCode(), "WF-10: a refresh from the core's state lost the resumable failure");
    }

    private String stopCode() {
        return jdbc.queryForObject("SELECT stop_code FROM campaign_index WHERE work_id = 'W-1'", String.class);
    }
}
