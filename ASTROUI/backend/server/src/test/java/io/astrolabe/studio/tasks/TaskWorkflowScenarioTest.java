package io.astrolabe.studio.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import io.astrolabe.RunSpec;
import io.astrolabe.studio.accounts.AccountService;
import io.astrolabe.studio.bridge.AutonomousPolicyOptions;
import io.astrolabe.studio.bridge.CampaignRef;
import io.astrolabe.studio.bridge.ConfigSupport;
import io.astrolabe.studio.bridge.SavedChecks;
import io.astrolabe.studio.bridge.StartSpec;
import io.astrolabe.studio.bridge.StudioHost;
import io.astrolabe.studio.bridge.fixture.FixtureBrain;
import io.astrolabe.studio.campaigns.CampaignService;
import io.astrolabe.studio.campaigns.CampaignService.TaskRun;
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

import net.ai.gate.Llm;
import net.ai.gate.auth.Environment;
import net.ai.gate.chat.AssistantMessage;
import net.ai.gate.chat.StopReason;
import net.ai.gate.chat.content.ToolCall;
import net.ai.gate.metadata.Usage;
import net.ai.gate.model.Capability;
import net.ai.gate.model.Modality;
import net.ai.gate.model.Model;
import net.ai.gate.spi.protocol.ApiRequest;
import net.ai.gate.testing.FakeProvider;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The Studio's workflow invariants (plan §7.2, W5). WF-6 and WF-9 run the real core with a scripted fake model and the
 * Studio's own decision service as the host authority; WF-8, WF-10 and WF-11 drive the task service, whose routing they
 * guard. Guards count — opens, checks, model requests, runs — never time.
 */
class TaskWorkflowScenarioTest {
    @TempDir
    Path dir;
    private JdbcTemplate jdbc;
    private SingleConnectionDataSource ds;
    private final HostService hosts = mock(HostService.class);
    private DecisionService decisions;
    private TaskService tasks;

    @BeforeEach
    void setUp() {
        ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        jdbc = new JdbcTemplate(ds);
        StudioDb.migrate(jdbc);
        decisions = new DecisionService(jdbc, new TopicBroker(), hosts);
        decisions.wire((w, i) -> { }, w -> "p1");
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        if (tasks != null) {
            tasks.destroy();
            Thread.sleep(200);   // a background launch stops on the mocks; let it finish before the database closes
        }
        ds.destroy();
    }

    // ------------------------------------------------------------------------------------------------ real core

    /** Creates `hello.txt`, runs the acceptance, reports; review cells answer without findings. Counts its requests. */
    private static final class Brain {
        final FakeProvider fake;

        Brain() {
            fake = FakeProvider.create(FixtureBrain.PROVIDER, model("astro-demo", 128_000, 8_192), model("astro-demo-helper", 64_000, 4_096));
            for (int i = 0; i < 8; i++) fake.respond(this::answer);
        }

        private static Model model(String id, long context, long output) {
            return Model.builder(FixtureBrain.PROVIDER, id).name(id).input(Modality.TEXT).output(Modality.TEXT).contextWindow(context).maxOutputTokens(output)
                .supports(Capability.STREAMING, Capability.TOOLS, Capability.PARALLEL_TOOLS, Capability.STRUCTURED_OUTPUT).build();
        }

        private AssistantMessage answer(ApiRequest request) {
            fake.respond(this::answer);
            String system = request.conversation().system().orElse("");
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("astrolabe · role (\\w+)").matcher(system);
            String role = m.find() ? m.group(1) : "implementing";
            long turn = request.conversation().messages().stream().filter(x -> x instanceof AssistantMessage).count();
            AssistantMessage.Builder b = AssistantMessage.builder(request.model().ref(), "fake-chat");
            ToolCall call = !role.equals("implementing") ? null
                : turn == 0 ? ToolCall.of("call_0_1", "edit", "{\"ops\":[{\"create\":\"hello.txt\",\"content\":\"Hello, world!\\n\"}],\"why\":\"create the requested file\"}")
                : turn == 1 ? ToolCall.of("call_1_1", "verify", "{\"what\":\"acceptance\"}")
                : null;
            b.text(role.equals("review") ? "Reviewed the change against the request: hello.txt exists with the greeting. No findings."
                : call == null ? "hello.txt is created with the greeting." : "Working on it.");
            if (call != null) b.add(call);
            return b.stopReason(call == null ? StopReason.STOP : StopReason.TOOL_USE)
                .usage(Usage.builder().input(100).output(20).cacheRead(0).cacheWrite(0).build()).build();
        }

        int requests() { return fake.sends(); }
    }

    private record Ended(String outcome, String reason, String code) { }

    /** One project without any manifest, so its task is accepted through a `check:` item the host's reviewer assesses. */
    private final class Core implements AutoCloseable {
        final Brain brain = new Brain();
        final StudioHost host = new StudioHost();
        final Llm llm = Llm.builder().provider(brain.fake.provider()).environment(Environment.none()).catalog(c -> c.offline()).build();
        final String configJson;

        Core(String name) throws Exception {
            Path repo = Files.createDirectories(dir.resolve("repos").resolve(name));
            Files.writeString(repo.resolve("README.md"), "# " + name + "\n");
            git(repo, "init", "-q");
            git(repo, "add", "-A");
            git(repo, "-c", "user.name=Studio Test", "-c", "user.email=test@astrolabe.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "initial");
            StringBuilder profiles = new StringBuilder();
            for (var p : FixtureBrain.profiles()) profiles.append(profiles.isEmpty() ? "" : ",").append('"').append(p.getId()).append("\":").append(ConfigSupport.profileJson(p));
            String json = "{\"stateRoot\":\"" + dir.resolve("state-" + name).toString().replace('\\', '/') + "\",\"profiles\":{" + profiles
                + "},\"profileRoles\":{\"main\":\"" + FixtureBrain.MAIN_PROFILE + "\",\"helper\":null}}";
            configJson = ConfigSupport.encode(ConfigSupport.decode(json));
            when(hosts.host()).thenReturn(host);
            host.openProject("p1", repo, configJson, llm);
        }

        private StartSpec spec() {
            return new StartSpec("Create hello.txt containing the text Hello, world!", 400_000L, null, null, false, RunSpec.MAX_CELLS, RunSpec.LEASE_MINUTES,
                RunSpec.EFFORT.name(), null, true, new SavedChecks(), true);
        }

        Ended start(AtomicReference<String> work) throws InterruptedException {
            CountDownLatch latch = new CountDownLatch(1);
            AtomicReference<Ended> ended = new AtomicReference<>();
            CampaignRef ref = host.start("p1", null, spec(), configJson, llm, decisions, decisions, new AutonomousPolicyOptions(false, null),
                (w, o, r, c, f) -> { ended.set(new Ended(o, r != null ? r : String.valueOf(f), c)); latch.countDown(); });
            work.set(ref.getWorkId());
            assertTrue(latch.await(180, TimeUnit.SECONDS), "run ended");
            return ended.get();
        }

        Ended resume(String workId) throws InterruptedException {
            CountDownLatch latch = new CountDownLatch(1);
            AtomicReference<Ended> ended = new AtomicReference<>();
            host.resume("p1", workId, spec(), configJson, llm, decisions, decisions, new AutonomousPolicyOptions(false, null),
                (w, o, r, c, f) -> { ended.set(new Ended(o, r != null ? r : String.valueOf(f), c)); latch.countDown(); });
            assertTrue(latch.await(180, TimeUnit.SECONDS), "resumed run ended");
            return ended.get();
        }

        /** The receipts the core holds for [workId]: a check that ran adds one. */
        int receipts(String workId) { return Json.parse(host.receiptRows("p1", workId)).size(); }

        @Override
        public void close() throws Exception {
            host.close();
            llm.close();
        }
    }

    private static void git(Path root, String... args) throws Exception {
        List<String> command = new java.util.ArrayList<>(List.of("git"));
        command.addAll(List.of(args));
        Process p = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes());
        if (!p.waitFor(60, TimeUnit.SECONDS) || p.exitValue() != 0) throw new IllegalStateException("git " + String.join(" ", args) + " failed: " + out);
    }

    /** WF-6 (Studio): the user's Accept is kept under the request's key, applied when the core asks again, and nothing runs after it. */
    @Test
    void anAcceptKeptByItsKeyEndsTheTaskWithNoCheckAndNoModelCallAfterIt() throws Exception {
        decisions.policy(w -> new DecisionService.HostPolicy("ask", List.of()), (w, r) -> CompletableFuture.completedFuture(null));
        try (Core core = new Core("wf6")) {
            AtomicReference<String> work = new AtomicReference<>();
            Ended waiting = core.start(work);
            assertEquals("waiting_for_input", waiting.outcome(), waiting.reason());
            assertEquals("acceptance_decision", waiting.code());
            ObjectNode card = decisions.openAcceptance(work.get());
            assertNotNull(card, "the request waits as a card");
            String key = Json.text(card.get("request"), "key");
            assertTrue(key != null && key.startsWith("dk-"), "the request carries its DecisionKey: " + card.get("request"));

            int receipts = core.receipts(work.get());
            int requests = core.brain.requests();
            assertTrue(decisions.answerAcceptance(card, "accept", "the user confirmed the task is done", "local"));
            Ended done = core.resume(work.get());
            assertEquals("completed", done.outcome(), done.reason());
            assertEquals(receipts, core.receipts(work.get()), "WF-6: a check ran after the user's accept");
            assertEquals(requests, core.brain.requests(), "WF-6: the model was called after the user's accept");
        }
    }

    /** WF-6 (Studio): a reissued question — another request id, the same key — gets the answer already given. */
    @Test
    void aStoredDecisionIsFoundByItsKeyWhateverTheRequestId() {
        decisions.policy(w -> new DecisionService.HostPolicy("ask", List.of()), (w, r) -> CompletableFuture.completedFuture(null));
        String first = request("decide-1", "dk-1");
        assertNull(decisions.decide("W-1", first).join(), "ask: the first request waits for the user");
        assertTrue(decisions.answerAcceptance(decisions.openAcceptance("W-1"), "accept", "accepted by the user", "local"));
        JsonNode again = Json.parse(decisions.decide("W-1", request("decide-2", "dk-1")).join());
        assertEquals("Accept", Json.text(again, "kind"));
        assertEquals("decide-2", Json.text(again, "requestId"), "the decision answers the request as reissued");
        assertNull(decisions.decide("W-1", request("decide-3", "dk-2")).join(), "another key is another question");
    }

    private static String request(String id, String key) {
        return "{\"id\":\"" + id + "\",\"key\":\"" + key + "\",\"contractRevision\":2,\"ids\":{\"work\":\"W-1\",\"attempt\":\"a1\"},\"incrementId\":\"I1\","
            + "\"candidate\":\"" + "ab".repeat(32) + "\",\"code\":\"acceptance_decision\",\"items\":[{\"obligation\":\"AC-1\",\"kind\":\"Check\",\"status\":\"Unverified\",\"reason\":\"no trace in files\"}]}";
    }

    /** WF-9 (Studio): the tool-less review pass cannot tell — the result is unverified, not rejected; `auto` accepts it, no rework round. */
    @Test
    void aReviewerWithoutToolsThatCannotTellNeverBlocks() throws Exception {
        decisions.policy(w -> new DecisionService.HostPolicy("auto", List.of()), (w, request) -> {
            JsonNode said = Json.parse("{\"verdict\":\"cannot_verify\",\"summary\":\"the page cannot be seen\",\"findings\":[],\"missing\":\"whether the page opens\"}");
            ReviewPass.Assessed assessed = ReviewPass.forCore(request, ReviewPass.verdict(request, said, "studio:review-pass(test)", false));
            return CompletableFuture.completedFuture(assessed.verdict() == null ? null : Json.write(assessed.verdict()));
        });
        try (Core core = new Core("wf9")) {
            AtomicReference<String> work = new AtomicReference<>();
            Ended ended = core.start(work);
            assertEquals("completed", ended.outcome(), "WF-9: a reviewer that cannot read blocked the result: " + ended.reason() + " (" + ended.code() + ")");
            assertEquals(0, decisions.list(null, work.get(), 50).findValues("status").stream().filter(s -> "open".equals(s.asString())).count(), "no card waits");
        }
    }

    /** The mapping itself: "cannot tell" is no verdict for the core; for a person's review it stays information. */
    @Test
    void cannotTellIsNoVerdictExceptOnAPersonsCard() {
        JsonNode said = Json.parse("{\"verdict\":\"cannot_verify\",\"summary\":\"s\",\"missing\":\"whether the page opens\"}");
        JsonNode request = Json.parse("{\"id\":\"r-1\",\"contractRevision\":2,\"candidate\":\"" + "ab".repeat(32) + "\"}");
        ReviewPass.Assessed core = ReviewPass.forCore(request, ReviewPass.verdict(request, said, "studio:review-pass(t)", false));
        assertNull(core.verdict());
        assertTrue(core.failure().startsWith(ReviewPass.UNAVAILABLE), core.failure());
        JsonNode person = Json.parse("{\"id\":\"r-1\",\"contractRevision\":2,\"humanOnly\":true,\"candidate\":\"" + "ab".repeat(32) + "\"}");
        assertEquals("InsufficientEvidence", Json.text(ReviewPass.forCore(person, ReviewPass.verdict(person, said, "studio:review-pass(t)", false)).verdict(), "outcome"));
    }

    // ------------------------------------------------------------------------------------------------ task routing

    private final StudioHost host = mock(StudioHost.class);
    private final CampaignService campaigns = mock(CampaignService.class);
    private final ProjectService projects = mock(ProjectService.class);
    private final AccountService accounts = mock(AccountService.class);

    private void taskService() {
        when(hosts.host()).thenReturn(host);
        when(campaigns.taskOf(anyString())).thenReturn("W-1");
        when(accounts.list()).thenReturn(Json.arr());
        when(host.contractRevision(any(), any())).thenReturn(2);
        decisions.policy(w -> new DecisionService.HostPolicy("ask", List.of()), (w, r) -> CompletableFuture.completedFuture(null));
        tasks = new TaskService(jdbc, hosts, campaigns, projects, mock(ProjectSettings.class), mock(SettingsService.class), mock(Preferences.class),
            accounts, mock(ModelService.class), decisions, mock(EventPipeline.class), new TopicBroker(), mock(ChangesService.class), mock(StatsService.class),
            mock(ReviewPass.class));
    }

    private void run(String work, String requestText, String status, String outcome, String stopCode, String reasonJson, String at) {
        jdbc.update("INSERT INTO campaign_index (work_id, project_id, title, status, outcome, created_at, updated_at, task_id, model_ref, effort, task_mode, request_text, stop_code, reason_json) " +
                "VALUES (?,'p1','open a page',?,?,?,?,'W-1','demo/model','medium','ask',?,?,?)",
            work, status, outcome, at, at, requestText, stopCode, reasonJson);
    }

    /** WF-8: text typed while the acceptance card is open is attached to it; only Accept or Rework decides, and Rework carries it. */
    @Test
    void freeTextOnAnOpenAcceptanceCardDecidesNothing() {
        taskService();
        run("W-1", "open the page in a browser", "stored", "waiting_for_input", "acceptance_decision", null, "2026-10-05T10:00:00Z");
        decisions.decide("W-1", request("decide-1", "dk-1")).join();
        var result = tasks.message("W-1", "the header is still blue", null, null, null, null);
        assertEquals("attached", Json.text(result, "effect"), "WF-8: a message on the card became a decision");
        assertEquals(0, jdbc.queryForList("SELECT * FROM acceptance_decision").size(), "WF-8: the text was recorded as a decision");
        verify(projects, never()).open(any());
        var task = tasks.task("W-1", false);
        assertEquals("needs_you", Json.text(task, "state"));
        var card = task.path("pending").get(0);
        assertEquals("the header is still blue", Json.text(card, "note"));

        tasks.card("W-1", Json.text(card, "id"), Json.obj().put("decision", "rework"));
        var stored = jdbc.queryForList("SELECT kind, text FROM acceptance_decision WHERE decision_key = 'dk-1'");
        assertEquals("rework", stored.getFirst().get("kind"));
        assertEquals("the header is still blue", stored.getFirst().get("text"), "Rework carries the attached text");
        verify(projects, times(1)).open("p1");
    }

    /** WF-10: Continue after a run died of an error reopens the same work; no follow-up run is started. */
    @Test
    void continueAfterAFailureContinuesTheSameWork() {
        taskService();
        run("W-1", "open the page in a browser", "stored", null, null, "{\"code\":\"agent_error\",\"params\":{},\"detail\":\"IllegalStateException: boom\"}", "2026-10-05T10:00:00Z");
        assertEquals("failed", Json.text(tasks.task("W-1", false), "state"));
        tasks.resume("W-1", null, null, null);
        verify(campaigns, never()).register(any());
        // The continued launch is a reopen of W-1: a failed reopen keeps the run and only sets its reason (a new run would be marked open_failed).
        verify(campaigns, timeout(5_000)).setReason(eq("W-1"), any());
        verify(campaigns, never()).markOpenFailed(anyString(), any());
        assertEquals(1, tasks.runs("W-1").size(), "WF-10: Continue started another run");
    }

    /** WF-11: each run's request carries every message of the task word for word, in order, the original first and uncut. */
    @Test
    void everyRunsRequestCarriesEveryUserMessageWordForWord() {
        taskService();
        String original = "Open the page in a browser and check the header.\nIt must be green on every page: " + "home, about, contact, ".repeat(30) + "and the footer.";
        run("W-1", original, "stored", "failed", null, null, "2026-10-05T10:00:00Z");
        when(host.isOpen("p1")).thenReturn(true);
        when(host.requests("p1", "W-1")).thenReturn(Json.write(Json.arr()
            .add(Json.obj().put("id", "U1").put("seq", 0).set("body", Json.obj().put("id", "U1").put("at", "2026-10-05T10:00:00Z").put("text", original)))
            .add(Json.obj().put("id", "U2").put("seq", 1).set("body", Json.obj().put("id", "U2").put("at", "2026-10-05T10:01:00Z").put("text", "also the logo")))));
        jdbc.update("INSERT INTO acceptance_decision (request_id, work_id, candidate, contract_revision, kind, text, by_authority, created_at) VALUES "
            + "('d-1','W-1','\"c\"',2,'rework','the logo is too small','user:local','2026-10-05T10:02:00Z'),"
            + "('d-2','W-1','\"c\"',2,'accept','the user confirmed the task is done','user:local','2026-10-05T10:02:30Z')");
        jdbc.update("INSERT INTO decision (id, kind, project_id, work_id, request_json, status, reply_json, created_at, answered_at) VALUES "
            + "('q-1','question','p1','W-1','{\"text\":\"which green?\"}','answered','{\"text\":\"#00aa00\"}','2026-10-05T10:02:50Z','2026-10-05T10:03:00Z')");

        ArgumentCaptor<TaskRun> started = ArgumentCaptor.forClass(TaskRun.class);
        tasks.message("W-1", "second ask", null, null, null, null);
        verify(campaigns).register(started.capture());
        String second = started.getValue().requestText();
        assertOrdered(second, original, "also the logo", "the logo is too small", "#00aa00", "second ask");
        assertTrue(second.contains("Run 1: \"" + original + "\""), "WF-11: the original is the first message, uncut");
        assertTrue(second.contains("still stands"), "an unfinished run's requests still stand: " + second);
        assertTrue(!second.contains("the user confirmed the task is done"), "a button's default reason is not the user's words");
        assertTrue(!second.contains("paused"), "WD-25: a failure is not told as a pause: " + second);

        run("W-2", second, "stored", "completed", null, null, "2026-10-05T11:00:00Z");
        tasks.message("W-1", "third ask", null, null, null, null);
        verify(campaigns, times(2)).register(started.capture());
        String third = started.getValue().requestText();
        assertOrdered(third, original, "also the logo", "the logo is too small", "#00aa00", "second ask", "third ask");
        assertTrue(third.contains("Run 2: \"second ask\""), "one line per run, without the earlier recap: " + third);
        assertEquals(1, third.split(java.util.regex.Pattern.quote("[End of context]"), -1).length - 1, "the recap is not nested");
    }

    private static void assertOrdered(String text, String... parts) {
        int at = -1;
        for (String part : parts) {
            int next = text.indexOf(part, at + 1);
            assertTrue(next > at, "WF-11: \"" + part + "\" missing or out of order in:\n" + text);
            at = next;
        }
    }
}
