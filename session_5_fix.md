You are the orchestrator of session 5 of the ASTROLABE 2.0 implementation.
Plan: `C:\work.astrolab\ASTROLABE-2-PLAN.md` (written in Russian). Working directory: `C:\work.astrolab\ASTROLABE`.
Session 4 put the direct protocol into the core, switched off by default. Session 5 makes it safe to switch on,
selectable from Studio, and measures it against the structured protocol and a plain loop. Write your reports to me
in Russian.

**Precondition (owner decision №30, 2026-10-05).** Sessions 4A and 4B (wave W, workflow stabilization) come before
this one. If `Gate P8.W` is not ticked in `TODO.md`, stop and report: this session does not start before it.

## 1. Read, in this order, and only what is named

- `ASTROLABE/CLAUDE.md` and `CONTINUE-TASK.md` (loaded automatically).
- `C:\work.astrolab\session_4_results.md`: §2 (what the first live run showed), §4 (open tails by owner), §6 (process
  lessons). Spend per line: `C:\work.astrolab\plan2\reports\SESSION-4.md`.
- The plan:
  - the header paragraph "Имена": `S0`–`S3` are execution shapes only; plan sessions are "сессия N";
  - §4.3 and §4.3a item 1 (the direct protocol);
  - §6: wave B rows B5, B6; wave D rows D4, D5, C18; wave E row E1;
  - §7: the row of session 5 and the hot-file owners; §7.2 (workflow invariants WF-1…WF-15 and the rule that
    protects them) — binding for every line of this session;
  - §8 in full — §8.4 (targeted tests) and §8.8 (economy rules) are binding;
  - §9 in full (what to measure, the task sets, the comparison design, the decisions);
  - §11 №9a and №20–28; §14; §16; the §17 rows dated 2026-10-04 and 2026-10-05; appendix A.6.
- `TODO.md`, only the tasks of this session:
  `rg -n '^#### P8\.(D\.[457]|C\.1[78]|B\.6|E\.1) |Gate P8\.D' TODO.md`.
- The direct specification as amended in session 4: `docs/reference/kernel-contract.md`, Appendix A-D.
- The live runner: `eval-live/README.md`.
- For C18: `C:\work.astrolab\CODEX-REVIEW-VERDICT.md`, the paragraph "Найдены и конкретные разрывы между модулями".
- The code map `C:\work.astrolab\.llm-memory\find.md` lags behind sessions 3–4: where it disagrees with the code,
  the code is right.

## 2. Restore the state (plan §8.7)

Run `git status`, `git log -5` and `git worktree list` in `ASTROLABE`, `C:\work.astrolab` and
`C:\work.astrolab\llm-transport-sdk`; check the `v2/*` branches and `C:\work.astrolab\plan2\reports`.

Known in advance:
- Sessions 4A and 4B are merged and pushed (tags `v2-wave-WA`, `v2-wave-W`); take the commits and the open tails
  from `CONTINUE-TASK.md` and `C:\work.astrolab\session_4b_results.md`. They changed `campaign/Controller.kt`,
  `cell/Cell.kt`, `workspace/` and Studio `TaskService.java`: the cards of D7, C18 and D4 are written against that
  code, not against the code of session 4.
- Moved out of this session by wave W: item 3 of C18 (carry settings) went to W9, item 3 of C17 (Node reporters) to
  W8. B6 builds its "real repository" scenarios on the fixture of W0 (`real-dirty-repo`).
- Kept branches, do not merge: `v2/BL`, `v2/B4`, `v2/B4a3`, `v2/C10x`.
- Read the fast CI result (compile + ABI) of the session-4 push before the first merge. The full suite did not run
  in session 4 and does not run in this session either.

Report in 5–10 lines.

## 3. Work of this session, in this order

1. **D7 (P8.D.7) first** — the residue of the integration review of direct: recovery of an orphaned handoff record
   before the transitions that move the state number, and fact retention by the cell's protocol. Direct must not be
   switched on anywhere before D7 is merged.
2. **C18 (P8.C.18)** — the gaps between modules found by the review verdicts, with the settings reachability test.
   It changes the bytes of the structured `look` schema, so it goes **before D4**.
3. **D4 (P8.D.4)** — golden `[S]` per protocol, at most 15 direct fixtures, the protocol choice in Studio. Take its
   tails from `CONTINUE-TASK.md` ("Tails", the D4 line).
4. Before D5: **C17 item 1 (P8.C.17)** — the overall cap on the output of one `verify`; the `summary.csv` overwrite
   by the second arm; a re-pricing "what if" in the offline auditor (plan §9.1, D-421).
5. **D5 (P8.D.5)** — the paired benchmark of three arms: structured, direct, `loop`. Screening first, then
   confirmation; the long tasks join when B6 is ready. Outcome: the default protocol per model class.
6. In parallel, outside the hot files: **E1 (P8.E.1)** — the binding key and the binding statistics table;
   **B6 (P8.B.6)** — the long tasks: 3 for debugging and 4–6 closed ones, at least one on Node.
7. **Gate P8.D** when D7, D4 and D5 are done: L2 with compile-all and ABI, push `main`, then the tag `v2-wave-D`.
   The tag starts the full suite on CI; do not wait for it.

C17 items 2 and 3 are not needed before D5: do them only if the session has room.

## 4. How to run the lines — economy rules (plan §8.8)

Session 4 spent about 5.9 M tokens on eleven lines under these rules. Keep to them.

- **You stay thin.** Do not write or read code yourself. Everything that can be stated in a card goes to a separate
  task or a background sub-agent in a worktree. Keep in your context only cards, line reports (40 lines at most),
  `git diff --stat` and review summaries.
- **Cards.** Before starting a line, write its card `C:\work.astrolab\plan2\WP-<id>.md` by plan §8.3; every line
  also reads `C:\work.astrolab\plan2\COMMON.md`. Size the estimates from the session-4 actuals: a line took
  230–520 K tokens; the card estimates were 3–5 times too high.
- **Who implements.** Programming: Opus (t3/t4, or a spawn task for a large package). Exact-spec trivia: t2.
  Running tests, builds and benchmark runs, log summaries: t1 or a background command; only the summary comes back.
- **Who reviews.** One independent reviewer per line, given the diff and the card. My instruction from session 4
  still holds: reviews go to Codex. Fable reviews only the D5 decision.
- **One integration review.** D7, C18 and D4 touch the same files as the session-4 direct lines. After they are
  merged, ask Codex for one review of the merged `main`; session 4 found its worst defects only that way.
- **Targeted tests only (plan §8.4).** A card names the tests of the changed classes and of their direct consumers.
  L1 runs once, when the change is complete. A failed test: fix the cause and rerun only the failed class. At most
  three edit → test cycles per line, then the line reports `БЛОКЕР`. L2 once at merge, together with
  `./gradlew assemble testClasses checkKotlinAbi`. Never run the full suite and never wait for CI.
- **No review loops.** One review round and one fix round; a second review only for P1 findings. If a fix brings a
  new P1, narrow the package or move the rest to a new task instead of fixing a third time.
- **The WF suite at every merge (plan §7.2, §8.4).** `./gradlew :core:test --tests 'io.astrolabe.workflow.*'` and
  the Studio `*WorkflowScenario*` tests run at L2 whatever packages the line touched. No line disables, loosens or
  deletes a WF guard. A review finding that cannot be fixed without breaking an invariant is not fixed: the line
  reports `БЛОКЕР` with both sides and the owner decides. A line that touches a file named in
  `docs/reference/workflow-invariants.md` lists the affected invariants in its card.
- **Codex runs in the background.** Start every Codex review asynchronously and continue other lines meanwhile.
- **Nothing beyond the card.** No side refactoring, extra fixtures or cleanup.
- **Account for the spend.** Each line report states its edit → test cycles, review rounds and token use. Write the
  per-line table to `C:\work.astrolab\plan2\reports\SESSION-5.md`.
- One owner per hot file (plan §7).

| Line | Implements | Reviews |
|---|---|---|
| D7 | Opus (t4) | Codex |
| C18 | Opus (t3) | Codex |
| D4, core and the Studio step | Opus (t3) | Codex |
| C17 item 1, B5 tails | Opus (t3) | Codex |
| E1 | Opus (task); the estimators — Codex in write mode | Codex |
| B6 | t2 sub-agents | each acceptance is run three ways by a background command: fails on the base, fails on the wrong patch, passes on the reference |
| D5 | background runs, t1 for the summary | Codex for the statistics, Fable for the decision |

## 5. Live runs (D5)

- Cheap models only: `z-ai/glm-5.3-flash`, `xiaomi/mimo-v2.6-flash` or `deepseek/deepseek-v4.1-flash`, two model
  families, not all at the same time, within plan §8.5. No third, stronger model unless I approve it.
- Do not run long tasks with a strong lead model at all (owner decision №21): I run those myself through Studio.
- Judge by flows first — requests, uncached input, cache read, output — and by money over the price profiles of
  D-421 (plan §9.1). The `loop` arm is a yardstick, not a candidate to replace the core.
- Direct is the reworked structured protocol on the same core, and it is optimised before anything else is
  considered (owner decision №29, plan §14). Where direct loses to `loop`, the D5 report must give a ranked list
  of what to optimise in direct — extra requests, uncached input, the fixed part of the first request, reasoning
  volume — and must not propose replacing it.
- The runner needs `--credentials` with the Studio store, and `JAVA_HOME` set inside the background command; in
  session 4 the first two launches failed on these.

## Rules

- If the plan disagrees with the code, the code is right: record the correction in plan §17 and in the handoff.
- Only you assign D-IDs.
- Push to `main` is allowed after the checks of §8.4 pass.
- End of session: the checklist of plan §8.7, the handoff, and `C:\work.astrolab\session_5_results.md` with the
  findings, in the form of `session_4_results.md`.

## Done when

- D7, C18 and D4 are merged, and the integration review of the merged `main` has no open P1.
- The WF suite is green on the merged `main`, and the live counters of `real-dirty-repo` are not worse than the
  baseline in `plan2/reports/SESSION-4A.md`.
- D5 has a report with the per-task intervals and a decision on the default protocol per model class, or an honest
  "not proven".
- E1 and B6 are merged, or their state is fixed in `v2/*` branches with reports.
- Gate P8.D is ticked and the tag `v2-wave-D` is pushed, or the reason it is not is written in the handoff.
- `TODO.md` P8, `CONTINUE-TASK.md`, plan §17 and `plan2/reports/SESSION-5.md` are up to date.
