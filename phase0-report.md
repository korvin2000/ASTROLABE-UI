# Phase 0 report: the acceptance rule in the core and a reliable Studio

Date: 2026-09-30. Goal: `next-goal.md`. Work was done on branch `phase0/acceptance` in all three repositories, then merged into `main` and pushed at the owner's request (the core with `--no-ff`, as its convention requires; the SDK and Studio fast-forward).

## Revisions

| Repository | Base | Phase 0 |
|---|---|---|
| Core `ASTROLABE` | `25c297c` | `8ce842a` (A1–A7), `2baf75b` (A8, A9), `e04a71b` (E1–E7), `7ef5cdd` (D-353–D-355), `2f00716` (answer denial text), `8f17590` (live crash fix), `081dca9` and `48aee12` (session documents) |
| SDK `llm-transport-sdk` | `877a1a6` | `0912d8a`: fix for Codex `complete()`, test, changelog |
| Studio (`C:\work.astrolab`) | `f0b1c3f` | the phase 0 commit: parts B, C and D, host notes, decision cards, tests, docs, this report |

## The owner's two questions (after part E)

A Fable 5.1 and a Codex review were run independently. Both recommended what the owner leaned towards, and both checked every consumer in the code:

1. **Q1: the header of a plain command that exits with 0** (D-353). The header now shows `status=completed` in exactly the case where D-351 already showed "completed, exit code 0" in the body. This applies only to a plain `run`: no check id, no wrapper that hides the exit code, not a mounted tool, and no test counts.
   - This is presentation only. The outcome stays `Inconclusive` and `green` stays false. Receipts, the Scheduler, `if: green(op:N)` and the gauge read the typed outcome, never this word (`Run.kt:550`, `Dispatcher.kt:211`, `Cell.kt:1126`). The only consumer of the header text is `== "running"` (`Cell.kt:477`).
   - Before the change, one result carried two verdicts at once ("completed" and `status=inconclusive`), and weak models re-ran the command.
   - A new `Outcome` value was rejected: it would reach receipts and certification, which contradicts D-50.
2. **Q2: `deadend.add.evidence` and `decision.add.rejected`** (D-354). Both are now optional.
   - The stored records were already nullable (`Register.kt:62,69`), the renderer leaves them out when empty, and existing tests already sent `null`.
   - Evidence on a dead end was never checked for existence, so requiring it only pushed models to invent a reference.
   - The guarantees that matter are kept: a dead end still needs `scope` and `reopen`, and a decision still needs `because`.
   - The ABI gained one synthetic constructor, which is an additive change.

Open follow-ups, each needing an owner decision:
- Should an `evidence` given on a dead end be checked for existence, like `fact.refute` and `open.close` are?
- Non-generic shapers with no counts, such as `pytest --version`, still read `inconclusive`.

## Why Luna never finished (§4.2, §4.3)

1. **The review pass on `openai-codex` always failed. This was the main cause and it is fixed in the SDK.**
   - The live experiments E1–E9 (§4.2) settled it. Every `complete()` call failed with `malformed_response` "Invalid JSON at offset 1", with no HTTP status and after one attempt. `start()` and `stream()` succeeded.
   - A transport spy showed why: every reply was `200` with no `Content-Type`, and the body began `event: response.created`. `Engine.complete` read a body as an event stream only when `Content-Type: text/event-stream` was present, so it parsed the stream as JSON (hypothesis H1).
   - Fix: `Engine.eventStream` recognises a successful body with no content type that begins with an SSE field. Regression test: `CodexWireTest.completeReadsEventsTheBackendSendsWithoutAContentType`, which fails before the fix and passes after. The live E1–E9 runs then all succeeded.
2. **F-7 (empty placeholder fields).** It did not occur on `openai-codex`, where Luna's edits passed. The core now drops these placeholders by an explicit list (E3, D-348).
3. **Protocol friction.** Rejected `state.patch` calls were 43% before phase 0. In the final round they are down to 0–2 per task (see the metrics). The remaining causes are listed under "Not verified".
4. **The greeting that edited `PiCalculator.java`.** S2 now ends as `answered` on both models: one model call, no review, and the file is unchanged (A8, A9, D4).
5. **Luna on Windows** also stopped on `run(cwd: "." or "")`, which the core refused as the workspace root. E7 (D-352) fixed this, and Luna S6 now completes. Both models also assumed Unix programs (`python3`, `ls`, `which xdg-open`). A host note now names the system (D2-27).

Checks run on the model of the task itself: the review pass for a ChatGPT task goes to `openai-codex`, and for an OpenRouter task to `openrouter` (tag `astrolabe.work`, `llm_request.tags`).

## What changed

**Core** (D-337–D-355; journal `audit/OUT-OF-ORDER-PHASE0.md`):
- **One resolver** (`verify/Resolution.kt`). Every run, check, review and integrity obligation resolves to passed, failed or unverified, and the whole resolves to Complete, Rework or Await.
  - An executed red result is never covered by a decision.
  - Gaps owned by the agent go back to the agent while a rework round remains. After the round they become open unverified items.
  - The policy may accept unverified items only. The user may also accept a result the review rejected.
- **Nothing blocks when a check is unavailable.**
  - The cell defers (`CellExit.Completed(pending)`) and the run stops `waiting_for_input` with a stop code (`acceptance_decision` or `review_rejected`).
  - `Authority.decide` (also `JavaAuthority.decide`) is asked for the decision, and decisions are stored per candidate (schema v5: `pending_completions`, `acceptance_decisions`).
  - A resumed run applies the decision with no cell and no model call. A moved tree or contract voids a pending completion.
- **A crash found live and fixed** (`8f17590`). Luna ask S5 ended `failed` with "Failed requirement.". A generic outline name (the first 80 characters of a README prose line) ended in a space and reached `impactLabel` (`ImpactSnapshot.kt:159`) through the risk trigger after an edit. Names are now trimmed after the cut. The cell's failure reason also names the throwing frames, because the live failure had left no stack trace. Regression tests: `RiskTriggerTest`, `OutlineTest`.
- **Provenance per item** (`Tested`, `Reviewed`, `Accepted` by the user or the policy) is recorded in the ledger, the finish receipt and events. Accepted items are listed under `notVerified`, and publication above `patch` is refused for them.
- **Review reuse** covers every record kind, including an unavailable reviewer. The layer scheduler does not rerun an unverified check on the same stamp. Review findings are pinned for the rework continuation.
- **A8:** a new `answered` outcome through `task` op `answer`, allowed only when nothing changed. **A9:** host notes (`CampaignPolicy.hostNotes`) and `Contracts.amendByHost`, so Studio's instructions are no longer the user's words.
- **Part E and follow-ups:**
  - `expect` is resolved from the versions shown.
  - `ops`/`patch` arriving as JSON strings are parsed.
  - Empty placeholder fields are dropped.
  - The forms of `state` ops are named in the schema and in refusals.
  - A patch without `next` keeps the previous one, and a missing cursor goes to the first open step.
  - A plain exit 0 reads `completed`.
  - A `cwd` of `.` or `""` means the root.
  - Two register fields became optional (D-354).
  - Fields placed next to the one op key are merged into it (D-355).
  - The answer denial now says how to propose completion.

**SDK:** `Engine.complete()` reads an untyped SSE body as the event stream. There is a test and an entry in `llm/CHANGELOG.md`.

**Studio:**
- **Decisions and cards:**
  - The bridge answers `decide`: `auto` accepts unverified items on the policy's word but never a rejection; `ask` stops with a card.
  - Card answers are stored per core request and replayed. "Done" costs no model call.
  - The task state and the "Verified" label come from core records (stop code and receipt provenance).
- **Review pass** (B1, B6, D1, D2): it answers approve, revise or cannot_verify, with low reasoning, a 600-token cap and task tags. Failures are recorded with their cause.
- **Reliability** (C1–C3): Continue and Retry do nothing while a run opens or works; a message sent during that time is queued and delivered.
- **Host notes** (A9, D2-25–D2-27): working notes with the patch-item example, an instruction for how to finish, and the machine's system.
- **Other:** `studio.db` v3 (stop code, decisions, request error details); frontend cards and labels in EN and RU; `timeline.ts` null guard (`ng build`).

## Metrics: before and after

Source: `studio.db` of the isolated test instance (`:8741`, separate data folder), counted by `summarize.py`. Tokens include the review pass. Baseline from `final_analyze.md` §2.1.

**Final round (2b: core `2f00716`, Studio final notes), auto mode:**

| Scenario | Baseline: calls / tokens / outcome | GLM-5.3-flash: calls / tokens / outcome | GPT-6 Luna: calls / tokens / outcome |
|---|---|---|---|
| S1 greeting | 11 / 39,572 / stopped by hand | 1 / 4,172 / answered, no review | 1 / 3,272 / answered, no review |
| S2 name, with a foreign file | 23 / 169,210 / stopped, foreign file changed | 1 / 4,233 / answered, file unchanged | 1 / 3,285 / answered, file unchanged |
| S3 hello.py | 9 / 41,234 (glm) · 9 / 33,694 blocked (Luna) | 8 / 39,935 / done, reviewed | 8 / 31,568 / done, reviewed |
| S4 films.md | 14 / 63,692 / waiting | 10 / 67,134 / done, reviewed | 5 / 20,819 / done, reviewed |
| S5 tic-tac-toe + open | 23 / 190,356 / done (glm) | 5 / 32,165 / done, reviewed | 4 / 21,033 / done, "not verified" (the browser opening cannot be confirmed) |
| S6 Java π | 30 / 223,223 / failed | 10 / 58,985 / done, reviewed | 14 / 66,989 / done, reviewed |
| **S1–S6 tokens** | 727,287 | **206,624 (28.4%)** | **146,966 (20.2%)** |

**Ask mode:**

| Run | Result |
|---|---|
| GLM S3 | done, reviewed; 6 calls, 28,899 tokens |
| GLM S5 | acceptance card, answered "done"; done "accepted by you"; 5 calls, 30,461 tokens; 1 user action |
| Luna S3 | done, reviewed; 8 calls, 31,392 tokens |
| Luna S5 | Round 2b: `failed`, a core crash, not a check (see "What changed"). After the fix, two reruns: acceptance card, answered "done"; done "accepted by you"; 8 calls / 54,461 tokens and 7 / 39,597; 1 user action each |

**S11** (double Continue, and a message sent during the transition): both models had 1 run, 0 `project_busy`, and the message was queued and delivered. **S12** (backend restart while a decision is pending): both models — card before and after the restart, “done” → done “accepted by you”, 0 model calls after “done”.

**Targets:**

| Measure | Target | Result |
|---|---|---|
| `blocked`/`failed` because a check was unavailable or incomplete | 0 | 0. Luna S5 (ask) once failed from a core crash, not from a check; it is fixed and passed on rerun. |
| Reviewer calls per unchanged candidate | ≤ 1 | ≤ 1 in every run |
| Model calls after "done" | 0 | 0 (GLM S5 ask; round 1 Luna S5 ask; S12) |
| S1, S2 model calls | ≤ 2 | 1 |
| S3, S4 model calls after part E | ≤ 6 | **not met**: GLM 8 and 10, Luna 8 and 5 (ask: GLM 6, Luna 8). Cause below. |
| Tokens after the agent's first "done" | ≤ 10% | 0–7% |
| S1–S6 total tokens | ≤ 35% of baseline | 28.4% (GLM), 20.2% (Luna) |
| Luna completes S1–S6 | all | all in auto mode |

**Rounds:**

| Round | GLM S1–S6 | Luna S1–S6 | Note |
|---|---|---|---|
| Round 1 (after A–D) | 204,973 (28%) | 190,074 (26%) | Luna S6 paused on `cwd "."` |
| Round 2 (E, shortened notes) | 384,142 | 181,343 | Shortening the notes after E made GLM S3 go from 6 to 17 calls. The notes were restored: a dead end. |

## Invariants I1–I7 and where they are tested

| Invariant | Core | Studio |
|---|---|---|
| I1: nothing blocks when a check is unavailable | `ExitGateTest`, `ControllerTest` (FX-13 → waiting_for_input), `RefactorCampaignTest`, `AcceptanceDecisionTest` (waits) | `TaskAcceptanceTest`, `VerificationSetupTest` |
| I2: "not done" only from findings, red tests or the user | `ExitGateTest`, `AcceptanceDecisionTest` (a red test is never decided) | `ReviewPassTest` (verdict mapping) |
| I3: no recheck of the same candidate | `ReviewCellTest` (reuse), `VerifyTest` (unverified checks settled), `AcceptanceDecisionTest` (rejection reused) | `AcceptanceDecisionsTest` |
| I4: one rework round, then the user decides | `AcceptanceDecisionTest` (rework continuation), `CellTest`/`ResultPacketTest` (Await after the round) | `TaskAcceptanceTest` |
| I5: waiting and "done" cost no model call | `AcceptanceDecisionTest` (accept → 0 calls) | `AcceptanceDecisionsTest`; live runs above |
| I6: every verification stop shows the reason and a choice | `Views.acceptance` | `TaskAcceptanceTest`, frontend `task.spec.ts`/`timeline.spec.ts`, e2e |
| I7: provenance per item | `AcceptanceEvidenceTest`, `RequirementGraphTest`, finish receipt | `TaskAcceptanceTest` (label from receipt provenance) |

Checks on the final code:
- Core: targeted classes only, all green. About 30 classes, listed in the journal, including `AcceptanceDecisionTest` 10, `CellTest` 29, `ControllerTest` 21, `RunTest` 28 and `StateToolTest` 11. `:core:checkKotlinAbi` passes.
- Studio: `:backend:bridge:test` 10, `:backend:server:test` 19, `npm test` 121, `npm run e2e` 27 of 27.
- SDK: `./gradlew test` green.

## Follow-up: Next from the cursor (D-356, core `d3d45a6`, branch `phase0/next-from-cursor`)

If a patch names no `next` and STATE has none yet, Next now becomes the `[>]` step. Before, this was refused. A patch that leaves no open step is still refused. Live, one run each, auto mode:

| Scenario | GLM before → after (calls / tokens) | Luna before → after (calls / tokens) |
|---|---|---|
| S3 | 8 / 39,935 → **6 / 28,854** | 8 / 31,568 → 9 / 36,422 |
| S4 | 10 / 67,134 → **4 / 20,890** | 5 / 20,819 → 6 / 27,041 |

Remaining refusals in these runs:
- `op:1` used as evidence in a turn without a run.
- A fact anchor `version` sent as 4 hex characters (Luna S3).
- A patch that adds and ticks its only step without a `next`.

Luna's single runs vary by ±1–2 calls, so one run is not a trend.

## Not verified, and why

- **Full `./gradlew build` of the core** (§11.4). The owner asked for targeted tests only, because a full build takes about 40 minutes on Windows. It is left for CI.
- **S7–S10 and S13–S16 were not run live.** They are covered by core and server tests (fixture review keywords `[review:…]`, the red-test case, a moved tree voiding a pending decision, repeated card answers). §10 allows this.
- **S3/S4 ≤ 6 calls is not met.** The cause is visible in the traces:
  - The first patch has no `next` while STATE has none yet. E5 (D-350) deliberately keeps this refusal. A possible D-356: take Next from the `[>]` step.
  - Two op keys appear in one item (`{"fact.add":…, "next":…}`).
  - GLM churns on `edit` in S4.
  - A fact anchor `version` still needs the full 64-hex digest.
  - The advisory `entry` and `stall` gates add tokens.

  Each of these is an owner decision about tolerance, so none was added silently.
- **Residuals in the core journal:**
  - A crash between the cell's return and saving the pending completion makes a new cell re-propose. This costs model calls but leaves no wrong state.
  - An explicit model `verify` and the harness's regression or full-suite reruns are not suppressed on the same candidate.
- **F-5** (the core review cell for `check:` items in the simple shape) is out of phase 0 scope.

## Commits

The owner asked for them, so they were made on `phase0/acceptance`, merged into `main` and pushed:
- Core: the commits listed above.
- SDK: `fix(codex): read an untyped SSE body in complete()`.
- Studio: `feat(studio): phase 0 — acceptance decisions, reliable runs, host notes`.
