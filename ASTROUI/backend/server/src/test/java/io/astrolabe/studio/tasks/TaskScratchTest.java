package io.astrolabe.studio.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

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

/** W3 in the Studio: a task shows the scratch list its attempt froze and counts its changes without that build output. */
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

    private Path repo() throws Exception {
        Path root = Files.createDirectories(dir.resolve("repo"));
        Files.createDirectories(root.resolve("build"));
        Files.createDirectories(root.resolve("src/build"));
        Files.writeString(root.resolve("build/kept.txt"), "tracked\n");
        git(root, "init", "-q");
        git(root, "add", "-A");
        git(root, "-c", "user.name=Studio Test", "-c", "user.email=test@astrolabe.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "initial");
        Files.writeString(root.resolve("build/out.bin"), "output\n");
        Files.writeString(root.resolve("src/build/Gen.java"), "class Gen {}\n");
        return root;
    }

    private static void git(Path root, String... args) throws Exception {
        List<String> command = new java.util.ArrayList<>(List.of("git"));
        command.addAll(List.of(args));
        Process p = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes());
        if (!p.waitFor(60, TimeUnit.SECONDS) || p.exitValue() != 0) throw new IllegalStateException("git " + String.join(" ", args) + " failed: " + out);
    }

    @Test
    void onlyUntrackedFilesUnderAnOutputRootAreScratch() throws Exception {
        Path root = repo();
        Set<String> out = TaskService.scratchOutput(root, ScratchPolicy.BUILT_IN, List.of("build/kept.txt", "build/out.bin", "src/build/Gen.java", "src/App.java"));
        assertEquals(Set.of("build/out.bin"), out, "tracked output and a nested build folder are changes like any other");
        assertEquals(Set.of(), TaskService.scratchOutput(root, ScratchPolicy.NONE, List.of("build/out.bin")), "a policy recorded before W3 excludes nothing");
    }

    @Test
    void theTaskShowsItsScratchListAndCountsChangesWithoutIt() throws Exception {
        Path root = repo();
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
        when(host.repoRoot("p1")).thenReturn(root);
        when(host.scratchPolicy("p1", "W-1")).thenReturn(ScratchPolicy.BUILT_IN);
        when(changes.taskChanges(eq("p1"), any(), anyBoolean())).thenReturn((tools.jackson.databind.node.ObjectNode) Json.parse(
            "{\"files\":[{\"path\":\"src/App.java\",\"added\":3,\"removed\":1},{\"path\":\"build/out.bin\",\"added\":1,\"removed\":0},{\"path\":\"build/kept.txt\",\"added\":1,\"removed\":1}]}"));
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, outcome, created_at, updated_at, task_id, model_ref, effort, task_mode, request_text) " +
            "VALUES ('W-1','p1','t','stored','completed','2026-10-05T10:00:00Z','2026-10-05T10:00:00Z','W-1','demo/model','medium','ask','do it')");
        DecisionService decisions = new DecisionService(jdbc, new TopicBroker(), hosts);
        tasks = new TaskService(jdbc, hosts, campaigns, mock(ProjectService.class), mock(ProjectSettings.class), mock(SettingsService.class), mock(Preferences.class),
            mock(AccountService.class), mock(ModelService.class), decisions, mock(EventPipeline.class), new TopicBroker(), changes, mock(StatsService.class), mock(ReviewPass.class));

        var task = tasks.task("W-1", true);
        assertEquals(2, task.path("changes").path("files").asInt(), task.path("changes").toString());
        assertEquals(4, task.path("changes").path("added").asInt());
        assertEquals(1, task.path("changes").path("scratch").asInt(), "the build output is counted apart");
        var roots = task.path("scratch").path("roots");
        assertTrue(roots.size() == ScratchPolicy.DEFAULT_PREFIXES.size() && roots.toString().contains("\"build\""), roots.toString());
        assertEquals(ScratchPolicy.BUILT_IN.getId(), Json.text(task.path("scratch"), "id"));
    }
}
