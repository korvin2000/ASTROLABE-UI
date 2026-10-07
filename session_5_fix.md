You are the orchestrator of session 5 of the ASTROLABE 2.0 implementation.
Plan: `C:\work.astrolab\ASTROLABE-2-PLAN.md` (written in Russian). Working directory: `C:\work.astrolab\ASTROLABE`.
Session 4 put the direct protocol into the core, switched off by default. Sessions 4A and 4B (wave W) made an
ordinary task on an ordinary dirty repository open fast, survive a failure, terminate, keep its goal and carry its
knowledge across cells, reopens and follow-ups. Session 5 makes direct safe to switch on, selectable from Studio, and
measures it against the structured protocol and a plain loop. Write your reports to me in Russian.

**Precondition (owner decision №30).** `Gate P8.W` is ticked in `TODO.md` (2026-10-07, tag `v2-wave-W`). If it is
not, stop and report.

## 0. Budget mode

- Economy rules of plan §8.8 are binding. Read the plan limits (`get_usage`) before each line and after each merge;
  put the numbers into the stage table. When "Weekly · all models" is above 95 % used, or the 5-hour limit above
  85 %: start nothing new, let the running lines reach a commit, push their branches, write the handoff and stop.
- At most two implementing lines at a time (a background benchmark run does not count).
- **Owner's working style (2026-10-07), binding:** work optimistically; targeted tests wherever possible; never the
  full suite locally; reviews only after large change sets. Concretely: one Codex review of a specification before
  code (none in this session unless a line writes one), **one Codex integration review of the merged `main`** after
  D7, C18 and D4 instead of a review per line, and Codex for the D5 statistics. A line's own verification is its
  targeted tests. Act like a lazy senior engineer: no step that does not move the goal.

## 1. Read, in this order, and only what is named

- `ASTROLABE/CLAUDE.md` and `CONTINUE-TASK.md` (loaded automatically).
- `C:\work.astrolab\session_4b_results.md` §2–§5 (counters, the review per invariant and stop state, the owner's W6
  decisions, the tail ledger). Live baseline: `C:\work.astrolab\plan2\reports\SESSION-4B.md`, the gate table
  (`bench/wb2`). Tails scheduled into this session: `C:\work.astrolab\plan2\reports\TAILS-4B.md` (rows "перенесён").
- `C:\work.astrolab\session_4_results.md`: §2 (the first live run of direct), §4 (open tails by owner), §6 (process
  lessons).
- The plan:
  - the header paragraph "Имена": `S0`–`S3` are execution shapes only; plan sessions are "сессия N";
  - §4.3 and §4.3a item 1 (the direct protocol);
  - §6: wave B rows B5, B6; wave D rows D4, D5, C18; wave E row E1; wave W row W9 (what C18 item 3 became);
  - §7: the row of session 5 and the hot-file owners; §7.2 (WF-1…WF-15 and the rule that protects them);
  - §8 in full — §8.4 and §8.8 are binding;
  - §9 in full (what to measure, the task sets, the comparison design, the decisions);
  - §11 №9a, №20–29, №37–40; §14; §16; the §17 rows dated 2026-10-05 … 2026-10-07; appendix A.6.
- `TODO.md`, only this session's tasks: `rg -n '^#### P8\.(D\.[457]|C\.1[78]|B\.6|E\.1|W\.11) |Gate P8\.D' TODO.md`;
  decisions of wave W: `rg -n '^\| D-4(2[6-9]|3[0-8]) ' TODO.md`.
- The direct specification as amended in session 4: `docs/reference/kernel-contract.md`, Appendix A-D. The task
  workflow specification of 4B: `docs/runtime/task-workflow.md` (binding wherever a line touches messages, goal
  evidence or carry).
- The live runner: `eval-live/README.md`.
- For C18: `C:\work.astrolab\CODEX-REVIEW-VERDICT.md`, the paragraph "Найдены и конкретные разрывы между модулями".
- The code map `C:\work.astrolab\.llm-memory\find.md` lags behind: where it disagrees with the code, the code is right.

## 2. Restore the state (plan §8.7)

Run `git status`, `git log -5` and `git worktree list` in `ASTROLABE`, `C:\work.astrolab` and
`C:\work.astrolab\llm-transport-sdk`; check the `v2/*` branches and `C:\work.astrolab\plan2\reports`.

Known in advance:
- Core `main` and root `main` = the 4B end commits (gate ticked, tag `v2-wave-W` pushed). Kept branches, never merge:
  `v2/BL`, `v2/B4`, `v2/B4a3`, `v2/C10x`.
- **CI result of the tag `v2-wave-W` (full suite, Linux + Windows) was not awaited.** Read it first. **Owner rule:
  never launch or call git credential manager or `git credential`** (no token extraction for the REST API). Read CI
  through the built-in browser (`mcp__Claude_Browser__*`, the repository's Actions page); if GitHub asks for a login,
  stop and let the owner sign in. A failure of the full suite is fixed first, by a small line with targeted tests,
  before any new line (re-run once only the known flaky tests of `CLAUDE.md`). In 4B the tag `v2-wave-WA` failed on
  four defects that targeted tests had not seen (a Linux-only S0 path, Windows long paths, `.Git` case) — expect
  the same kind.
- Push only with `git -c credential.helper= push …` (both repositories, branches and tags). Never print remote URLs or
  tokens.
- Sub-agents are refused `git -C` on the root repository: **you create a line's Studio worktree**
  (`git worktree add C:/work.astrolab/.claude/worktrees/<ID> -b v2/<ID> main` in `C:\work.astrolab`) and give its path
  in the card. Studio builds against a detached core checkout you keep at the new core `main`
  (`ASTROLABE/.claude/worktrees/studio-core`). Never link the main checkout's `ASTROUI/frontend/node_modules` into a
  worktree (in 4B an npm run emptied the original); a line that touches the frontend runs `npm ci` in its worktree.
- Windows long paths: removing a worktree may fail with "Filename too long" — use
  `Remove-Item -LiteralPath '\\?\<path>' -Recurse -Force`, then `git worktree prune`.
- Wave W changed `campaign/Controller.kt`, `cell/Cell.kt`, `cell/Checkpoints.kt`, `context/`, `contract/`,
  `verify/`, `workspace/`, the store (schema **v6** = W9's `packets` table) and Studio `TaskService.java`: the cards of
  D7, C18 and D4 are written against that code. **Plan correction:** E1's "store v6" becomes **v7** (record it in
  plan §17 when you write the E1 card).
- Done earlier and not redone here: C18 item 3 (carry settings) by W9 (`Defaults.seedFallback`,
  `parentCarryMaxTokens`); C17 item 3 (Node reporters) by W8. B6 builds its "real repository" scenarios on the W0
  fixture (`real-dirty-repo`; `real-dirty-reopen` adds a reopen after three responses).

Report in 5–10 lines.

## 3. Work of this session, in this order

Every line that touches a file named in `docs/reference/workflow-invariants.md` lists the affected invariants in its
card and keeps their guards green.

1. **D7 (P8.D.7) first** — the residue of the integration review of direct: recovery of an orphaned handoff record
   before the transitions that move the state number, and fact retention by the cell's protocol. Direct must not be
   switched on anywhere before D7 is merged. **D7 also owns tail T-56:** the WF suite is at 179.5 s of its 180 s
   (Windows); before adding any scenario D7 merges `AnswerScenarioTest` into `GoalEvidenceScenarioTest` and
   `UnreadableFileScenarioTest` into `MessageKindScenarioTest` (running concurrently, no guard changed), and you
   update the registry rows.
2. **C18 (P8.C.18)** — the gaps between modules found by the review verdicts, with the settings reachability test
   (item 3 is already done by W9: test its reachability, do not redo it). It changes the bytes of the structured
   `look` schema, so it goes **before D4**.
3. **D4 (P8.D.4)** — golden `[S]` per protocol, at most 15 direct fixtures, the protocol choice in Studio. Take its
   tails from `CONTINUE-TASK.md`. WF-15 (append-only prefix, W9) applies to both protocols: a direct golden must not
   reorder or re-render the projected head.
4. **One Codex integration review** of the merged `main` (core + Studio) after D7, C18 and D4, with one question:
   walk WF-1…WF-15 and the direct crash windows against the merged code and name every cross-line P1. P1 findings go
   into one fix line; no second review.
5. Before D5: **C17 (P8.C.17) item 1** — the overall cap on the output of one `verify`; the `summary.csv` overwrite
   by the second arm; a re-pricing "what if" in the offline auditor (plan §9.1, D-421). C17 also carries the 4B tails
   scheduled to it (see its `Tails` line): take the P2 ones (T-31, T-47, T-49, T-50, T-51, T-57) in the same line if
   they fit its cycle limit, otherwise leave them in C17 with a decision (§4a).
6. **D5 (P8.D.5)** — the paired benchmark of three arms: structured, direct, `loop`. Screening first, then
   confirmation; the long tasks join when B6 is ready. Outcome: the default protocol per model class.
7. In parallel, outside the hot files: **E1 (P8.E.1)** — the binding key and the binding statistics table (store
   **v7**), plus tail T-30 (one live check whether `openai-codex` grows its cache with `session_id` /
   `conversation_id` instead of `session-id`; change the SDK header only on evidence — P8.W.10 report);
   **B6 (P8.B.6)** — the long tasks: 3 for debugging and 4–6 closed ones, at least one on Node, plus tails T-12
   (`eval-live` opens twice per start, like the old Studio — one open per start, WF-1) and T-14 (`real-dirty-repo`
   `dir` accepts absolute/UNC paths).
8. **P8.W.11** if the session has room, outside the hot files: `canonicalise` measured (W7 already canonicalises each
   directory once per capture — measure first, close if the drop is there), T-22 (`hash-object` recovery reads), T-59
   (the pre-scan re-reads sources for dynamic imports) and **T-03 live**: `real-dirty-repo` open still counts 3014
   files / 21.02 MB per open at 1500 untracked files (the 20 MB file is read once, the file count is ×2) — find whether
   small files are read twice or counted twice; a live failure the WF suite did not catch first becomes a scenario.
9. **Gate P8.D** when D7, D4 and D5 are done: the WF suite and the Studio `*WorkflowScenario*` suite green, L2 with
   compile-all and ABI, live `real-dirty-repo` in `auto` and `ask` not worse than the 4B gate table, push `main`, then
   the tag `v2-wave-D`. The tag starts the full suite on CI; do not wait for it.

C17 items 2 and 3 are not needed before D5: do them only if the session has room.

## 4. How to run the lines — economy rules (plan §8.8)

Session 4B spent ≈ 4.6 M sub-agent tokens on ten lines (W7 626 K, W8 576 K, W9 689 K and WR2 613 K were the largest).
Keep to these rules.

- **You stay thin.** Do not write or read code yourself. Keep in your context only cards, line reports (≤ 40 lines),
  `git diff --stat`, test summaries and review summaries. Run merges and checks as quiet background commands and read
  only totals from the JUnit XML.
- **Cards.** Before a line, write `C:\work.astrolab\plan2\WP-<id>.md` by plan §8.3: goal, owned files and files not
  to touch, the defect locations with `path:line` (the line does not re-investigate), the tails it owns, L1 and L2
  test lists, done and fail criteria, report format. Every line also reads `plan2/COMMON.md`. **A card that changes
  `campaign/Controller.kt` names `io.astrolabe.campaign.*` in its L2.** A card that runs in parallel with another
  owner of a hot file splits its work: everything else first, the hot-file hunks as a last commit after the other
  line is merged (4B: W8/W9 worked this way without conflicts).
- **Who implements.** Lines are background Opus sub-agents in worktrees: t4 for D7 and E1, t3 for C18, D4, C17 and
  fix lines; exact-spec trivia t2; B6 acceptances t2. Tests, builds, benchmark runs and log summaries: background
  commands or t1. Hard algorithmic, mathematical or stuck points: Fable 5.1 (t6, xhigh) or Codex
  `--model gpt-6-astra --effort high` — treat the answer as evidence.
- **Codex** runs through `codex:codex-rescue` in the background, read-only, `--model gpt-6.1-sol --effort xhigh`. The
  forwarder may start Codex as a background task and return only its id: resume the forwarder and ask it to wait for
  that task and return its output verbatim.
- **Targeted tests only (plan §8.4).** L1 once, when the change is complete. At most three edit → test cycles per
  line, then `БЛОКЕР`. At merge, once: the WF suite + the touched packages +
  `./gradlew assemble testClasses checkKotlinAbi -Pastrolabe.aiGateBuild=C:/work.astrolab/llm-transport-sdk/llm`; for
  Studio lines the Studio `*WorkflowScenario*` suite built against `studio-core`. If `main` did not move since the
  line's branch point, its own L2 counts as the merge check. Never run the full suite and never wait for CI.
- **One owner per hot file** (plan §7): after gate W the chains continue — `campaign/Controller.kt` D7 → D4,
  `cell/Cell.kt` D7 → C18 → D4, `tool/ToolSchemas.kt` C18 → D4, `TaskService.java` D4.
- **Decisions.** A line's open design question that is cheap to reverse: you decide with a safe default and record a
  `D-nn` (4B: D-437, D-438). Ask the owner only when the choice is expensive to reverse.
- **Account for the spend.** Each row of the stage table `plan2/reports/SESSION-5.md`: executor, reviewer, diff size,
  edit → test cycles, review rounds, sub-agent tokens, limits before → after, outcome.

| Line | Implements | Reviews |
|---|---|---|
| D7 | Opus (t4) | integration review |
| C18 | Opus (t3) | integration review |
| D4, core and the Studio step | Opus (t3) | integration review |
| Integration fix line | Opus (t4; Studio half t3) | — (tests) |
| C17 item 1 + P2 tails | Opus (t3) | — (tests) |
| E1 | Opus (t4); the estimators — Codex in write mode | Codex (the estimators' math) |
| B6 | t2 sub-agents | each acceptance run three ways by a background command: fails on the base, fails on the wrong patch, passes on the reference |
| D5 | background runs, t1 for the summary | Codex for the statistics, Fable for the decision |

## 4a. Tail discipline (owner, 2026-10-06) — unchanged from 4B

- **Ledger.** At the start write `plan2/reports/TAILS-5.md`: one row per tail scheduled into this session (the rows of
  `TAILS-4B.md` marked "перенесён" to P8.D.7, P8.C.17, P8.B.6, P8.E.1, P8.W.11) plus the open tails of
  `session_4_results.md` §4 that name a session-5 task. Id `T5-nn`, statement, source, owner line. Record the opening
  count.
- **Owned tails are closed in their line** and covered by a test; a line that cannot close one says why and names the
  smallest fix.
- **No new tail without a decision:** fix now / drop (reason) / schedule (named `TODO.md` task with `Deps`). P1-class
  tails are fixed or become `БЛОКЕР`. Unowned tails go to the owner once, in one `AskUserQuestion` batch of at most
  four questions, your recommendation first; without an answer apply the recommendation and mark it.
- **Count at the end** in `session_5_results.md`: opened with, closed, dropped, scheduled (with tasks), new, open at
  the end — the open count at the end must be lower than at the start, or the results file says why, tail by tail.
- A tail "closed" by a fixture guard counts as closed only if the live run agrees (4B: T-03 passed its fixture guard
  and still showed ×2 live — it was re-scheduled, not counted as closed).

## 5. Live runs

- Cheap models only: `deepseek/deepseek-v4.1-flash`, `z-ai/glm-5.3-flash` or `xiaomi/mimo-v2.6-flash`, two model
  families, not all at the same time, within plan §8.5. No third, stronger model unless I approve it.
- Do not run long tasks with a strong lead model at all (owner decision №21): I run those myself through Studio.
- `eval-live` from a fresh install directory per code state:
  `./gradlew :eval-live:installDist -Pastrolabe.aiGateBuild=… -PbenchDir=C:/work.astrolab/bench/<new dir>`, then
  `<dir>/bin/eval-live run --models … --tasks … --mode auto|ask --out <dir>/results-<…>
  --credentials "$LOCALAPPDATA/AstrolabeStudio/credentials.json" --repeats 1 --seed 1`. Export `JAVA_HOME` inside the
  background command, use absolute paths, run modes one after the other, keep `--temp` at its default.
  `phase.counted` counters come from `result.json` (`phases.byPhase`); `summary.csv` has requests, flows and money.
- D5: judge by flows first — requests, uncached input, cache read, output — and by money over the price profiles of
  D-421 (plan §9.1). The `loop` arm is a yardstick, not a candidate to replace the core. Direct is optimised before
  anything else is considered (owner decision №29, plan §14): where direct loses to `loop`, the D5 report gives a
  ranked list of what to optimise in direct and does not propose replacing it.
- The live run proves the session; the WF suite keeps it. A live failure the suite did not catch first becomes a
  scenario, then is fixed.

## Rules

- If the plan or the diagnostics disagree with the code, the code is right: record the correction in plan §17 and in
  the handoff.
- Only you assign D-IDs (next free: D-439) and write `TODO.md`, `CONTINUE-TASK.md`, `actual_state.md`,
  `audit/SESSION-HISTORY.md`, plan §11/§17 and the WF registry.
- Merge into `main` only yourself, `--no-ff`; regenerate ABI dumps on a conflict, never edit them by hand.
- Push to `main` is allowed after the checks of §4 pass.
- End of session: the checklist of plan §8.7, the handoff (≤ 40 lines), `actual_state.md` (≤ 60 lines), and
  `C:\work.astrolab\session_5_results.md` in the form of `session_4b_results.md`, including the tail ledger counts.

## Done when

- The CI result of `v2-wave-W` is read and any failure fixed first.
- D7, C18 and D4 are merged, and the integration review of the merged `main` has no open P1.
- The WF suite (≤ 180 s) and the Studio `*WorkflowScenario*` suite are green on the merged `main`, and the live
  counters of `real-dirty-repo` are not worse than the 4B gate table.
- D5 has a report with the per-task intervals and a decision on the default protocol per model class, or an honest
  "not proven".
- E1 and B6 are merged, or their state is fixed in `v2/*` branches with reports.
- The tail ledger `plan2/reports/TAILS-5.md` is closed out by §4a.
- Gate P8.D is ticked and the tag `v2-wave-D` is pushed, or the reason it is not is written in the handoff.
- `TODO.md` P8, `CONTINUE-TASK.md`, `actual_state.md`, plan §11/§17, `plan2/reports/SESSION-5.md` and
  `session_5_results.md` are up to date.
