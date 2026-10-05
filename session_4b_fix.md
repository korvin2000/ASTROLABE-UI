You are the orchestrator of session 4B of the ASTROLABE 2.0 implementation: workflow stabilization, part 2 — "the task
is understood and remembered" (wave W, lines W6–W10, gate P8.W).
Plan: `C:\work.astrolab\ASTROLABE-2-PLAN.md` (written in Russian). Working directory: `C:\work.astrolab\ASTROLABE`.
Session 4A (W0–W5, gate P8.W-A, tag `v2-wave-WA`) is merged and pushed: a task on an ordinary dirty repository now opens
fast, survives a failure and terminates. This session makes the task keep its goal and its knowledge: the objective is
the original request plus amendments, a message always reaches a model, the goal is accepted apart from sniffed test
suites, context crosses cell boundaries, reopens and follow-ups. Write your reports to me in Russian.

## 0. Budget mode and stages

Economy rules of plan §8.8 are binding; the session runs in two stages. A relaunch with this same prompt continues
from the `TODO.md` statuses and the handoff; it never redoes merged lines.

- **Stage 1:** W6 (specification) ∥ W10 (independent, provider side). The W6 draft → one Codex review → the owner's
  decisions (§3 item 1). Merge W10 if it is ready. Rewrite the handoff with "stage 2 is next", write the stage table to
  `plan2/reports/SESSION-4B.md`, then stop — unless the owner answers the W6 questions in this session, in which case
  continue with stage 2.
- **Stage 2:** W7, then W8 ∥ W9, the integration review, gate P8.W, `session_4b_results.md`.
- At most two implementing lines at a time.
- Read the plan limits (`get_usage`) before each line and after each merge; put the numbers into the stage table.
  When "Weekly · all models" is above 95 % used, or the 5-hour limit above 85 %: start nothing new, let the running
  line reach a commit, push its branch, write the handoff and stop.

## 1. Read, in this order, and only what is named

- `ASTROLABE/CLAUDE.md` and `CONTINUE-TASK.md` (loaded automatically).
- `C:\work.astrolab\session_4a_results.md` §2–§4 (counters, the c1–c16 answer, the tails with owners).
- `C:\work.astrolab\plan2\reports\SESSION-4A.md`: only the section «Шлюз P8.W-A — живые прогоны» (the live baseline).
- The plan: §6 wave W rows W6–W10; §7 the row of session 4B, the hot-file owners (the 2026-10-05 amendment), §7.2
  (WF-12…WF-15); §8.3, §8.4, §8.8; §11 №31, №33, №34, №35; the §17 rows dated 2026-10-05 and 2026-10-06.
- `C:\work.astrolab\ASTROLABE-DIAGNOSTICS-2026-10-05.md`: only the rows WD-13, WD-19…WD-24, WD-27…WD-29, WD-31 and
  appendix 3 (how context is carried today).
- `TODO.md`, only this session's tasks: `rg -n '^#### P8\.W\.([6-9]|10) |Gate P8\.W:' TODO.md`; decisions
  `rg -n '^\| D-4(2[6-9]|3[01]) ' TODO.md`.
- The code map `C:\work.astrolab\.llm-memory\find.md` lags behind: where it disagrees with the code, the code is right.

## 2. Restore the state (plan §8.7)

Run `git status`, `git log -5` and `git worktree list` in `ASTROLABE`, `C:\work.astrolab` and
`C:\work.astrolab\llm-transport-sdk`; check the `v2/*` branches and `C:\work.astrolab\plan2\reports`.
Known in advance: core `main` = the 4A end commit (gate ticked), root `main` = the 4A docs commit; kept branches, never
merge: `v2/BL`, `v2/B4`, `v2/B4a3`, `v2/C10x`. Read with the GitHub REST API (no `gh`; never print tokens or remote URLs):
the **full suite on tag `v2-wave-WA`** (run 37389888135) and the fast check of the last `main` push. A failure of the
full suite is fixed first, with targeted tests, by a small line before any new line (re-run once only the known flaky
tests named in `CLAUDE.md`).

Report in 5–10 lines, then start.

## 3. Work of this session, in this order

Every implementing line starts by reproducing its defect as a failing scenario test of the WF suite and ends with that
test green. A fix without its WF test is not done.

1. **W6 (P8.W.6) — the task workflow specification.** Draft by t6 (Fable, `--effort xhigh`; the plan's choice for a
   design task), in `docs/runtime/` and `docs/state/contracts.md`: the task intent and history (owner №31: one Studio
   task is one continuous core work while it can be continued), message kinds (continuation, steering, amendment,
   decision) and how an amendment reconciles closed increments, goal acceptance apart from sniffed suites, what crosses
   a cell boundary, a reopen and a follow-up (owner №33, №34). It also decides, for the 4A tails it owns: "declare as an
   output of this task" (D-429), nested generated directories such as `tests/__pycache__` (today identity, they raise
   integrity flags). One Codex review of the draft, then **the owner's decisions**: put at most six questions, each with
   the orchestrator's recommendation first, in one `AskUserQuestion` batch; record the answers as `D-nn` and in plan §11.
   No W7–W9 code before these decisions.
2. **W10 (P8.W.10)** in parallel with W6 — prompt cache of `openai-codex` on a reopen (WD-31): compare the wire request
   of a first open and of a reopen (cache key, session headers) offline from recorded requests; fix the adapter or the
   SDK if the cause is ours, otherwise record "provider side" with the evidence. Repositories: `provider-ai-gate` in the
   core and `C:\work.astrolab\llm-transport-sdk` (its own branch `v2/W10`, merged by you).
3. **W7 (P8.W.7)** after W6 — the task model and message kinds (WD-13, WD-24): the objective is the original request
   plus amendments, a message to a work whose increments are all closed opens work and reaches a model (WF-13), a
   confirmation is not an amendment. 4A tails it owns: an exception inside a cell ends the run final `failed`, so
   Studio can only follow up (WF-10 is guarded only for resumable stops); a project with no declared checks still opens
   twice (a core `CampaignPolicy` hook, WF-1). Owner of `campaign/Controller.kt` and Studio `TaskService.java`.
4. **W8 (P8.W.8)** after W7 — goal acceptance apart from tests (WD-19…WD-23, P8.C.17 item 3): WF-12 and the negative
   scenario "unrelated suites green, requested behaviour absent" does not close as verified. 4A tail it owns: compile
   and routing reserve the full model output for a review cell (`Controller.kt`, `context/Compiler.kt:112`) — only if
   it touches the same path; otherwise it stays a tail.
5. **W9 (P8.W.9)** after W6, in parallel with W8 on disjoint files — context carry (WD-27…WD-29, P8.C.18 item 3):
   WF-14 and WF-15. 4A tails it owns: the follow-up recap carries the full history without a context budget; live, the
   open and the finish read each untracked file about twice (atlas parse, two fresh stamps) and a reopen re-reads the
   tree — W9 bounds the re-reads only where the carry makes them redundant, never by trusting metadata at an
   acceptance boundary (D-374, D-427). Owner of `cell/Cell.kt` and, after W7, `campaign/Controller.kt` (W8 then
   requests the minimal `Controller.kt` edit from W9 or waits — one writer per hot file).
6. **One integration review** of the merged `main` (core + Studio) by Codex, with one question: walk WF-1…WF-15 and the
   stop states c1–c16 against the merged code and name every cross-line P1. P1 findings go into one fix line (as WR in
   4A); there is no second review.
7. **Gate P8.W** — the guards of WF-1…WF-15 green; L2 with compile-all and ABI; the Studio `*WorkflowScenario*` suite;
   live runs of `real-dirty-repo` on a cheap model in `auto` and in `ask` (`eval-live --mode`), plus one run of a
   follow-up task if `eval-live` can express it (`reopen`), all reaching a terminal state; counters against the 4A
   live baseline in `plan2/reports/SESSION-4B.md`. Push `main` in both repositories, then the tag `v2-wave-W` (it starts
   the full suite on CI; do not wait for it). The owner then repeats `play5` in Studio (checklist in the results file).

What stays out: wave H, D7, C18 (except its item 3 inside W9), D4, D5, E1, B6, C17 (except its item 3 inside W8),
memory between tasks beyond owner №33, transcript persistence (owner №34). A line that needs one of them reports
`БЛОКЕР`.

## 4. The rule that keeps the fixes (plan §7.2, owner №36)

- The WF suite (`./gradlew :core:test --tests 'io.astrolabe.workflow.*'`; Studio `--tests '*WorkflowScenario*'`) runs
  at every merge, whatever the line touched. It is at 171 s of tests on Windows (limit 180 s): **the first line that
  adds a scenario cuts the suite's time first** without weakening a guard (largest: `DirtyRepoScenarioTest` 84 s,
  `ReviewScenarioTest` 27 s, `FinalizationScenarioTest` 24 s, `OutputPolicyScenarioTest` 23 s).
- Guards count events (git processes, reads, objects, opens, finish attempts, model requests), never seconds.
- No line disables, loosens or deletes a guard. A review finding that cannot be fixed without breaking an invariant is
  not fixed: `БЛОКЕР` with both sides; the owner decides. A test that asserted a defect may be changed — the report
  says which and why.
- New guards WF-12…WF-15 get their rows in `docs/reference/workflow-invariants.md` (you write the registry at merge).

## 5. How to run the lines — economy rules (plan §8.8)

- **You stay thin.** Do not write or read code yourself. Keep in your context only cards, line reports (≤ 40 lines),
  `git diff --stat`, test summaries and review summaries. Run merges and checks as quiet background commands and read
  only totals from the JUnit XML.
- **Cards.** Before a line, write `C:\work.astrolab\plan2\WP-<id>.md` by plan §8.3: goal, owned files and files not to
  touch, the WD numbers with `path:line` copied from the diagnostics (the line does not re-investigate), the 4A tails it
  owns, L1 and L2 test lists, done and fail criteria, report format. Every line also reads `plan2/COMMON.md`.
  **A card that changes `campaign/Controller.kt` names `io.astrolabe.campaign.*` in its L2** (4A lesson: a W3 regression
  in `S3CampaignTest` passed a line L2 without it).
- **Who implements.** Lines are background Opus sub-agents in worktrees: t4 for W7, W8, W9; t3 or t4 for W10 and fix
  lines; t6 (Fable xhigh) only for the W6 draft. Tests, builds, live runs and log summaries: background commands or t1.
- **Who reviews.** One Codex review per line: `codex:codex-rescue` with `--model gpt-6.1-sol --effort xhigh`, read-only,
  in the background, given the card and the diff (W6: the draft). After the fix round there is no second review;
  verification is by tests. Fix rounds go back to the same line agent (resume it), which keeps its context.
- **Hard problems (owner's fallback):** an algorithmic, mathematical or hard-to-implement point, a root cause unknown
  after two hypotheses, or a line stuck at `БЛОКЕР` on a technical point → consult Fable 5.1 (`t6`, xhigh) or Codex
  `--model gpt-6-astra --effort high`; treat the answer as evidence and verify it against the code.
- **Targeted tests only (plan §8.4).** L1 once, when the change is complete. At most three edit → test cycles per line,
  then `БЛОКЕР`. At merge, once: the WF suite + the touched packages + `./gradlew assemble testClasses checkKotlinAbi
  -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`; for Studio lines the Studio WF suite with
  `-Pstudio.astrolabeBuild=<core checkout> -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`, built
  against a separate detached core checkout (`git worktree add --detach .claude/worktrees/studio-core main`) that you
  move to the new `main` after each core merge. Never run the full suite and never wait for CI.
- **One owner per hot file** (plan §7): `campaign/Controller.kt` W7 → W9, `cell/Cell.kt` W9, `TaskService.java` W7.
  When a line needs another owner's file, it writes the minimal diff into its report and you sequence the edit.
- **Account for the spend.** Each row of the stage table: executor, reviewer, diff size, edit → test cycles, review
  rounds, sub-agent tokens, limits before → after, outcome.
- If a line's branch push is refused by permissions, do not push it for the line — tell me; its commits reach `origin`
  through your merge.

| Line | Implements | Reviews |
|---|---|---|
| W6 | Fable (t6, xhigh), draft | Codex, then the owner's decisions |
| W7 | Opus (t4) | Codex |
| W8 | Opus (t4) | Codex |
| W9 | Opus (t4) | Codex |
| W10 | Opus (t3/t4) | Codex |
| Integration fix line | Opus (t4) | — (tests) |
| Gate live runs | background command, t1 for the summary | — |

## 6. Constraints the lines must keep

- Candidate identity stays content-based (D-374, D-427, D-429); `DecisionKey` v3 binds candidate, contract revision,
  obligations and pinned inputs outside identity (D-428, WR) — a change to its encoding bumps its version.
- A person's or policy's decision stays final for an unchanged candidate (WF-6); a real source edit between a check and
  a decision still voids it; a red final suite still fails the campaign.
- A sniffed suite is regression evidence, never "independently verified" on its own (W8); the goal item stated by the
  model is judged, not trusted.
- Carried context is data, not instructions; cached prompt regions get no wall-clock and no reordering (WF-15).
- Windows and Linux are equal targets; tests are offline on the fake adapter; Studio's paths may be long — keep test
  temp names short (a 4A `eval-live` test hit the 260-character limit).

## 7. Live runs

- Cheap models only: `deepseek/deepseek-v4.1-flash`, `z-ai/glm-5.3-flash` or `xiaomi/mimo-v2.6-flash`, within plan §8.5.
- `eval-live` from a fresh install directory per code state:
  `./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=… -PbenchDir=C:/work.astrolab/bench/<new dir>`, then
  `<dir>/bin/eval-live run --models … --tasks real-dirty-repo --mode auto|ask --out <dir>/results-<mode>
  --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" --repeats 1 --seed 1`. Export `JAVA_HOME` inside the
  background command, use absolute paths, run the modes one after the other, and keep `--temp` at its default.
- The live run proves the session; the WF suite keeps it. A live failure the suite did not catch becomes a new scenario
  before it is fixed.

## Rules

- If the plan or the diagnostics disagree with the code, the code is right: record the correction in plan §17 and in
  the handoff.
- Only you assign D-IDs and write `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`, `audit/SESSION-HISTORY.md`, plan
  §11/§17 and the WF registry.
- Merge into `main` only yourself, `--no-ff`; regenerate ABI dumps on a conflict, never edit them by hand.
- Push to `main` is allowed after the checks of §5 pass.
- End of session: the checklist of plan §8.7, the handoff (≤ 40 lines), `actual_state.md` (≤ 60 lines), and
  `C:\work.astrolab\session_4b_results.md` in the form of `session_4a_results.md`: counters before/after against the 4A
  baseline, the integration review per invariant and stop state, the owner's W6 decisions, the open tails for session 5,
  and a checklist of at most eight steps by which the owner repeats `play5` in Studio (now including a follow-up and a
  message to a finished task).

## Done when

A stage-1 launch is done when W6 is reviewed, its owner questions are asked (and, if answered, recorded as D-IDs), W10
is merged or `БЛОКЕР` with the reason, `main` is pushed and the handoff names stage 2 as next.
The session as a whole is done when, shown by command output in the last report:

- P8.W.6–P8.W.10 are `DONE` or `BLOCKED` with the reason in their `Log:`;
- the integration review of the merged `main` has no open P1; the guards of WF-1…WF-15 are green and registered;
- the live runs reach a terminal state without `agent_error` and the counters are recorded against the 4A baseline;
- Gate P8.W is ticked with the run link and the tag `v2-wave-W` is pushed, or the reason is in the handoff;
- `main` of both repositories (and of the SDK, if W10 changed it) is pushed;
- `TODO.md` P8, `CONTINUE-TASK.md` (naming session 5 as next), `actual_state.md`, plan §11/§17,
  `plan2/reports/SESSION-4B.md` and `session_4b_results.md` are up to date.
