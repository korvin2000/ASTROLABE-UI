package io.astrolabe.studio.decisions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import io.astrolabe.studio.bridge.StudioHost;
import io.astrolabe.studio.db.StudioDb;
import io.astrolabe.studio.live.TopicBroker;
import io.astrolabe.studio.runtime.HostService;
import io.astrolabe.studio.support.Json;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import tools.jackson.databind.JsonNode;

/**
 * P8.C.15 in the Studio: in `auto` a D-class action outside the allow list is not refused on the policy's word — it waits
 * for the user on a card, as in `ask`; what the project always allows is still approved without asking.
 */
class AutoModeEffectsTest {
    @TempDir
    Path dir;
    private JdbcTemplate jdbc;
    private SingleConnectionDataSource ds;
    private final HostService hosts = mock(HostService.class);
    private final StudioHost host = mock(StudioHost.class);
    private List<String> allowed = List.of();

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
        s.policy(w -> new DecisionService.HostPolicy("auto", allowed), (w, r) -> CompletableFuture.completedFuture(null));
        s.wire((w, i) -> { }, w -> "p1");
        return s;
    }

    private static String effect(String id) {
        return "{\"id\":\"" + id + "\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\",\"context\":\"cell-1\"},"
            + "\"action\":\"exec\",\"argv\":[\"npm\",\"install\",\"-g\",\"typescript\"],\"cwd\":null,"
            + "\"expectedEffect\":\"installs a tool on this machine\",\"reason\":\"D-class\",\"contractAllowlisted\":false}";
    }

    @Test
    void autoShowsAnActionOutsideTheAllowListOnACardInsteadOfRefusingIt() {
        var s = service();
        CompletableFuture<String> reply = s.approve("W-1", effect("effect-1"));
        assertFalse(reply.isDone(), "the policy neither approves nor refuses it");
        var pending = s.list("pending", "W-1", 10);
        assertEquals(1, pending.size());
        assertEquals("effect", Json.text(pending.get(0), "kind"));
        assertEquals(0, s.skipped("W-1").size());
        s.reply(Json.text(pending.get(0), "id"), Json.obj().put("approved", true), null, "local");
        JsonNode decision = Json.parse(reply.join());
        assertTrue(decision.get("approved").asBoolean());
        assertEquals("effect-1", Json.text(decision, "requestId"));
    }

    @Test
    void autoStillApprovesWhatTheProjectAlwaysAllows() {
        allowed = List.of("npm install -g");
        var s = service();
        JsonNode decision = Json.parse(s.approve("W-1", effect("effect-2")).join());
        assertTrue(decision.get("approved").asBoolean());
        assertEquals(0, s.pendingCount("W-1"));
    }
}
