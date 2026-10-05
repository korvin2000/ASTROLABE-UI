You are the orchestrator of session 4A of the ASTROLABE 2.0 implementation: workflow stabilization, part 1.
Plan: `C:\work.astrolab\ASTROLABE-2-PLAN.md` (written in Russian). Working directory: `C:\work.astrolab\ASTROLABE`.
The owner's runs of 2026-10-05 showed that the parts of the harness work in isolation and do not compose: a task
cannot finish on an ordinary repository, every open costs over a minute, a locked file ends a run, a continued task
loses its request. This session makes a task start fast, survive, and terminate. It changes no concept of acceptance
and no protocol; those belong to session 4B. Write your reports to me in Russian.

## 0. Budget mode and stages (owner, 2026-10-05)

The weekly plan limit is nearly spent until 2026-10-07 15:59 UTC, and extra usage is off: when the limit is reached
the session stops. Run the session in two stages. A relaunch with this same prompt continues from the `TODO.md`
statuses and the handoff; it does not redo merged lines.

- **Stage 1:** W0, then W1 ∥ W2. Merge them with L2 and their WF guards, push `main`, rewrite the handoff with
  "stage 2 is next", write the stage table to `plan2/reports/SESSION-4A.md`, then stop. Do not start W3–W5.
- **Stage 2** (a later launch): W3, W4, W5, the integration review, the gate, `session_4a_results.md`.
- At most two implementing lines at a time. No Fable anywhere in this session: lines are Opus, reviews are Codex in
  the background (Codex does not spend this limit), tests, builds and summaries go through t1 or background commands.
- If a plan-usage tool is available (`get_usage`), read the plan limits before each line and after each merge and
  put the numbers into the stage table. When "Weekly · all models" is above 95 % used, or the 5-hour limit above
  85 %: start nothing new, let the running line reach a commit, push its branch, write the handoff and stop.

## 1. Read, in this order, and only what is named

- `ASTROLABE/CLAUDE.md` and `CONTINUE-TASK.md` (loaded automatically).
- `C:\work.astrolab\ASTROLABE-DIAGNOSTICS-2026-10-05.md` in full: the evidence, the defect list WD-01…WD-31 with
  `path:line`, the stop states c1–c16 (appendix 1), the acceptance pipeline map (appendix 2).
- The plan:
  - the header paragraph "Имена"; §0 item 11;
  - §6 wave W (rows W0–W5 are this session; W6–W10 are session 4B, do not start them);
  - §7: the rows of sessions 4A and 4B, the hot-file owners, and §7.2 (workflow invariants WF-1…WF-15);
  - §8 in full — §8.4 (targeted tests and the WF suite) and §8.8 (economy rules) are binding;
  - §11 №27, №28, №30–36; §16; the §17 rows dated 2026-10-05.
- `TODO.md`, only the tasks of this session: `rg -n '^#### P8\.W\.[0-5] |Gate P8\.W' TODO.md`.
- For W3: `docs/verification/scheduler.md` (§8.4, the artifact rule and closure reuse) and D-45, D-53, D-374 in
  `TODO.md` §3 (`rg -n '^\| D-(45|53|374) ' TODO.md`).
- The code map `C:\work.astrolab\.llm-memory\find.md` lags behind sessions 3–4: where it disagrees with the code,
  the code is right.

## 2. Restore the state (plan §8.7)

Run `git status`, `git log -5` and `git worktree list` in `ASTROLABE`, `C:\work.astrolab` and
`C:\work.astrolab\llm-transport-sdk`; check the `v2/*` branches and `C:\work.astrolab\plan2\reports`.

Known in advance:
- Session 4 is merged and pushed: core `08c6725`, root `937399f`. No line of session 4 is left unmerged.
- The plan, `TODO.md` and `CONTINUE-TASK.md` were amended on 2026-10-05 (C18, F3, then wave W); the root also has new
  untracked files (`ASTROLABE-DIAGNOSTICS-2026-10-05.md`, `session_4a_fix.md`, `session_5_fix.md`). Commit them
  first as a docs-only commit in each repository.
- Kept branches, do not merge: `v2/BL`, `v2/B4`, `v2/B4a3`, `v2/C10x`.
- Read the fast CI result (compile + ABI) of the session-4 push before the first merge.

Report in 5–10 lines.

## 3. Work of this session, in this order

Every fix line starts by reproducing its defect as a failing scenario test of the WF suite and ends with that test
green. A fix without its WF test is not done.

1. **W0 (P8.W.0) first** — the scenario harness on the real composition (`Controller` → cell → dispatcher → tools,
   the fake adapter), the "dirty repository" fixture, permanent phase counters in telemetry, the registry
   `docs/reference/workflow-invariants.md`, the live task `real-dirty-repo` in `eval-live`. Everything else builds on it.
2. **W1 (P8.W.1) and W2 (P8.W.2) in parallel**, disjoint files:
   - W1 — final acceptance terminates (owner of `campaign/Controller.kt` in this session): checks run before the
     candidate is pinned; applicable acceptance receipts come back at open; a pending decision is keyed by candidate,
     contract version and obligations and a stored decision applies to it; a human or policy accept of an unchanged
     candidate is terminal; the same stop is never produced twice without new information.
   - W2 — capture and snapshot cost (`workspace/`, `store/`, `os/Git.kt`): measure the phase split first; one git
     process per snapshot and only for changed entries; one read per file per capture; nothing already stored is
     published again; an unreadable file is a typed, resumable condition, never a failed cell.
3. **W3 (P8.W.3)** after W2 — one declared scratch policy for candidate identity. `ScratchPolicy` already exists
   (`verify/Scheduler.kt`, D-45) and the stamp, the snapshot and the final comparison ignore it. Specification first
   (one page, Codex review before any code), then the code.
4. **W4 (P8.W.4)** after W1 — a reviewer that can block can read: child-cell admission by the child's own budget,
   the review budget reaches the cell, an inadmissible review says so before any model call.
5. **W5 (P8.W.5)** after W1 — the Studio line (root repository): one open per user action; free text on an
   acceptance card decides nothing; the decision lookup by W1's key; a retryable failure continues the same work;
   the follow-up recap carries every user message of the task with the right frame; the tool-less review pass never
   blocks; "evidence unavailable" is not "no passing check"; the active scratch list is shown.
6. **One integration review** of the merged `main` (W1–W5) by Codex, with one question: walk the stop states c1–c16
   of the diagnostics and say for each whether it can still repeat without new information.
7. **Gate P8.W-A** — the guards of WF-1…WF-11 green; L2 with compile-all and ABI; one live run of `real-dirty-repo`
   on a cheap model in `auto` and one in `ask` with scripted answers: both reach a terminal state without
   `agent_error`; the counters go to `plan2/reports/SESSION-4A.md` as the baseline for later sessions. Push `main`,
   then the tag `v2-wave-WA`. The tag starts the full suite on CI; do not wait for it.

What stays out: goal acceptance, message types, context carry, memory between runs, the cache of `openai-codex`
(all session 4B); D7, C18, D4, D5, E1, B6 (session 5). If a line needs one of them to finish, it reports `БЛОКЕР`.

## 4. The rule that keeps the fixes (plan §7.2, owner decision №36)

On 2026-10-01 the content cache (D-364) was switched off at every acceptance boundary by a review fix (D-374) the
same day, and nobody weighed the latency it cost. This session installs the guard against that:

- Each WF invariant has a scenario test in `io.astrolabe.workflow` (Studio: `*WorkflowScenario*`) and a row in the
  registry naming the files that can break it.
- The guards assert counters, never wall-clock time: git processes per boundary, files read per capture, objects
  written per snapshot, opens per user action, finalization attempts, model requests after a user message.
- The WF suite runs at every merge of every later session, whatever packages the line touched. Keep it under three
  minutes on Windows.
- No line may disable, loosen or delete a WF guard. A review finding that cannot be fixed without breaking an
  invariant is not fixed: the line reports `БЛОКЕР` with both sides, and the owner decides.
- W0 writes this rule into `plan2/COMMON.md`; you add it to `ASTROLABE/CLAUDE.md` § Workflow when W0 merges.

## 5. How to run the lines — economy rules (plan §8.8)

- **You stay thin.** Do not write or read code yourself. Keep in your context only cards, line reports (40 lines at
  most), `git diff --stat` and review summaries.
- **Cards.** Before starting a line, write its card `C:\work.astrolab\plan2\WP-<id>.md` by plan §8.3; every line also
  reads `C:\work.astrolab\plan2\COMMON.md`. A card names the WD numbers it closes and copies their `path:line` from the
  diagnostics; the line does not re-investigate what the diagnostics already established.
- **Who implements.** Programming: Opus (t3/t4). Running tests, builds and the live run, log summaries: t1 or a
  background command; only the summary comes back.
- **Who reviews.** One independent reviewer per line, given the diff and the card: Codex, started in the background
  so that other lines continue meanwhile. The W3 specification is reviewed before its code.
- **Targeted tests only (plan §8.4).** L1 once, when the change is complete. At most three edit → test cycles per
  line, then `БЛОКЕР`. L2 once at merge, together with `./gradlew assemble testClasses checkKotlinAbi` and the WF
  suite. Never run the full suite and never wait for CI.
- **No review loops.** One review round and one fix round; a second review only for P1 findings.
- **Nothing beyond the card.** No side refactoring, extra fixtures or cleanup.
- **Account for the spend.** Each line report states its edit → test cycles, review rounds and token use; the table
  goes to `C:\work.astrolab\plan2\reports\SESSION-4A.md`.
- One owner per hot file (plan §7).

| Line | Implements | Reviews |
|---|---|---|
| W0 | Opus (t3) | Codex |
| W1 | Opus (t4) | Codex |
| W2 | Opus (t4) | Codex |
| W3 | Opus (t4); the specification first | Codex: the specification, then the diff |
| W4 | Opus (t3) | Codex |
| W5 | Opus (t3) | Codex |
| Gate live run | background command, t1 for the summary | — |

## 6. Constraints the lines must keep

- Candidate identity stays content-based: SHA-256 of raw bytes, type, mode and membership. No faster hash, no
  metadata-only trust at an acceptance boundary (D-374 holds). W2 removes repeated work, not reads that decide.
- An unreadable or oversized input is never dropped from identity silently: it is a named unresolved condition.
- Scratch is what the declared policy lists, recorded and frozen per attempt. A tracked file under a scratch prefix
  stays in identity. Dependency lockfiles stay inputs. A toolchain directory in the tree (`devtools/`) is not
  scratch: W2 makes it cheap, W3 does not hide it.
- A real source edit between a check and a decision still voids the decision; a red final suite still fails the
  campaign. Each of W1 and W3 carries these two negative scenarios.
- Stamp and manifest encodings keep their versions unless W3's specification changes membership; then the version
  is bumped and recorded.

## 7. Live runs

- Cheap models only: `z-ai/glm-5.3-flash`, `xiaomi/mimo-v2.6-flash` or `deepseek/deepseek-v4.1-flash`, within plan §8.5.
- The runner needs `--credentials` with the Studio store, and `JAVA_HOME` set inside the background command.
- The live run proves the session, the WF suite keeps it. A live failure that the suite did not catch becomes a new
  scenario before it is fixed.

## Rules

- If the plan or the diagnostics disagree with the code, the code is right: record the correction in plan §17 and
  in the handoff.
- Only you assign D-IDs.
- Push to `main` is allowed after the checks of §8.4 pass.
- End of session: the checklist of plan §8.7, the handoff, and `C:\work.astrolab\session_4a_results.md` in the form
  of `session_4_results.md`. It must contain: the before/after counters, the answer of the integration review per
  stop state, the open tails for session 4B, and a checklist of at most eight steps by which the owner repeats the
  `play5` scenario in Studio.

## Done when

A stage-1 launch is done when W0, W1 and W2 are merged, `main` is pushed and the handoff names stage 2 as next.
The session as a whole is done when:

- W0–W5 are merged, and the integration review of the merged `main` has no open P1.
- The guards of WF-1…WF-11 are green and registered; the rule of §4 is in `ASTROLABE/CLAUDE.md` and `plan2/COMMON.md`.
- The live runs in `auto` and `ask` reach a terminal state; the baseline counters are recorded.
- Gate P8.W-A is ticked and the tag `v2-wave-WA` is pushed, or the reason it is not is written in the handoff.
- `TODO.md` P8, `CONTINUE-TASK.md`, plan §17 and `plan2/reports/SESSION-4A.md` are up to date.
