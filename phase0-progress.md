# Phase 0 progress note (untracked)

Goal: `next-goal.md`. Branch `phase0/acceptance` in all three repos (created 2026-09-30).

## Status
- [x] §4.1 access (2026-09-30): owner gave a temporary OpenRouter key in chat (env var of the test process only, never
  written anywhere), model `z-ai/glm-5.3-flash`; reuse the working Studio's stored OAuth credentials by path (do not read);
  owner may log in again if needed. Owner: targeted tests only, **no full `./gradlew build`** (40 min).
- [ ] A1–A7 core · [ ] B · [ ] C · [ ] D · [ ] live acceptance · [ ] A8 A9 E · [ ] re-acceptance

## Core design (A1–A7), decisions D-337…
Package `io.astrolabe.verify`, new file `Resolution.kt`.

**Types**
- `ResultStatus { Passed, Failed, Unverified }`; `ObligationKind { Run, Check, Review, Integrity, Campaign }`.
- `ObligationResult(obligation, kind, status, detail, evidenceRef?, by?, findings)`.
- `AcceptanceDecision(requestId, contractRevision, candidate, kind: Accept|Rework, decider: User|Policy, by, reason, obligations)`.
- `AcceptanceDecisionRequest(id, contractRevision, ids, incrementId?, candidate, code, items[{obligation, status, reason, findings}], diffRef, receipts, summary)`.
- `Resolution { Complete, Rework, Await }`; `Gap(kind: Failed|Unverified|Other, obligation?, text)`;
  `Resolved(resolution, gaps, results, provenance, receiptIds, evidenceRefs, decision?)`;
  `ItemProvenance(item, how: Tested|Reviewed|Accepted, by, reason?)`.
- `StopCode { AcceptanceDecision, ReviewRejected }` on `CampaignState.stopCode`, `Transition.Stopped.code`, `Disposition.Stop.code`.

**Result mapping (pure, `Obligations`)**
- run: no receipt → U; `certifies` → P; `Current && eligible && red(outcome Failed)` → F; else U (stale, ineligible, Timeout, InfraError, Inconclusive, NotRun, Unavailable, Denied, UnknownOutcome).
- check:/review: verdict approve (right request, contract rev, candidate) → P; not approve with ≥1 Blocker/Major finding → F; anything else (none, InsufficientEvidence, no substantive findings, wrong rev/candidate) → U.
- test-integrity flag on a required check: approving verdict → P; no reason → Other gap (agent justifies); no approval → U.

**Resolver order (one function for cell gate, controller, finish, resume)**
1. Failed Run/Campaign-executed → Rework, never covered by a decision.
2. Other gaps (open plan step, red check without Open, contract/stamp mismatch, impact nudge, unjustified flag) → Rework.
3. Decision Rework (current candidate+contract) → Rework.
4. Failed Check/Review not covered by an Accept decision → Rework; but if a Rework decision for this candidate was already spent → Await (code ReviewRejected).
5. Unverified not covered by Accept → Await (code AcceptanceDecision).
6. Else Complete; provenance per item: Tested / Reviewed / Accepted(decider, by, reason).
An Accept decision covers exactly the obligations its request listed.

**Cell (A3/A5)**: `RoleOutput.resolved`; exit gate emits a Rejection only for Rework. `CompletionDecision.Defer(gaps, code)`
→ `CellExit.Completed(..., pending = PendingAcceptance(code, gaps))`, no more turns. Rework: first refusal → pinned
review block (author + all findings) + gap line; second refusal: review-caused → Defer(ReviewRejected); test/other-caused →
CannotProgress (failed, as before). FX-13 (unavailable runner ⇒ blocked) removed.

**Controller**: `Verifier.accept` → `CompletionResult.Pending(pending, code, gaps)`; disposition → Stop(WaitingForInput, code).
Durable `PendingCompletion` (migration v5 table `pending_completions`, controller-written): increment?, cell, contract version,
base/resulting stamp, patch hash, env, register version, flags, results, gaps, code, status Open|Applied|Void.
Decisions: table `acceptance_decisions` (candidate, contract version, kind, decider, by, reason, obligations, spent).
Router outcome derived from the verifier result, not the cell exit.

**Resume (A4)**: at the start of runS0/runS1 (after open's Resumed→Reconciled, before reassessBlocked/cells/budget):
open pending + increment InProgress + last cell == pending.cell & Completed + same stamp/contract/env + no refusal →
decision = stored ?: `authority.decide(request)`; re-resolve stored results → Complete: Committed, pending Applied, finish
(0 model calls) · Rework: continuation cell with pinned rework text, decision spent · null: Stopped(WaitingForInput, code).
Invalid pending → Void + journal, normal path (cell).

**Reuse (I3)**: `ReviewCell.obtain` reuses any record (approve/decline/unavailable) for same scope/increment/contract/
candidate/criteria/integrity; empty evidenceVersions + equal candidate = Current. Layer selection does not rerun a check
whose current-stamp receipt is Timeout/Unavailable/InfraError/Inconclusive/Denied.

**Provenance (A6)**: `IncrementEvidence.provenance`, `CompletionResult.Accepted.provenance`, finish receipt
`AcceptanceLine.provenance/acceptedBy/reason`, status `accepted`, line in `notVerified`; `IncrementClosed(how)`;
publication above `patch` refused when any item was accepted without verification.

**Campaign (A7)**: stopOrFinish builds Campaign obligations (full suite NotCertified → U, Red → F; campaign review
Unavailable → U, Declined → F-review; refactor snapshot missing → U; run items at final stamp; independent items) and
resolves them with the same resolver; Await → pending (increment = null) + WaitingForInput; resume accept → Finished.

## §4.2 review-pass failure on openai-codex — ROOT CAUSE (2026-09-30, live, SDK 877a1a6 + diag test)
- Facts (LiveCodexDiagnosisTest, temp, `build/codex-diagnosis.txt`): E1/E2/E4/E5/E6/E7 `complete()` → `InvalidResponseException`
  `malformed_response` "Invalid JSON at offset 1", no HTTP status, 1 attempt; E3/E3b/E8/E9 `start()`/`stream()` OK.
  Transport spy: every reply `status=200 content-type=<none>`, body starts `event: response.created\ndata: {...}`.
- Cause (H1, SDK): `Engine.complete` reads events only when `Content-Type` starts `text/event-stream`; Codex sends none.
- Fix: SDK `Engine.eventStream` sniffs an untyped successful body for SSE fields. Regression test in `CodexWireTest`
  (fails before, passes after). Live re-run: all E1–E9 OK. CHANGELOG entry. Diagnosis test to delete before the report.
- Working Studio data dir: `%LOCALAPPDATA%\AstrolabeStudio` (credentials.json, catalog-snapshot.json, studio.db).

## Done so far (2026-09-30)
- Core A1–A7 implemented (Resolution.kt, verifier, cell Defer, controller settle/decide/resume, Acceptances + schema v5,
  ReviewCell reuse, Verify settled-unverified, provenance in ledger/receipt/event, Views.acceptance). D-337–D-343 in TODO.
  Journal audit/OUT-OF-ORDER-PHASE0.md. Specs §3.6/§3.7, §5.6/§5.9, §8.7/§8.8 amended.
- Codex review (thread 01a0f251…): applied — stale red not a red line; FullSuite red only current; policy can't accept
  over a rejection; agent-owned gaps after the round → decider (`open:N`), binding gaps never; re-validate tree after
  decide (Settled.Void); campaign-level accepted items in receipt. Already handled: 1, 2 (applied guard), 3.
  Residual (report): crash between Returned and pending save → a new cell re-proposes (model calls, no wrong state);
  explicit model `verify` and harness regression/full-suite reruns are not suppressed on the same candidate.
- SDK fix for Codex complete() (see §4.2 above).
- Studio: bridge decide port + stop code; server DecisionService.decide/answer/open card, TaskService states/cards/
  label/C1–C3, ReviewPass B1/D1/D2/B6, telemetry B6, studio.db v3; notes B5/D4 text; FixtureBrain review keywords;
  frontend (worker) cards/labels/catalogs/timeline + result-card rework action — npm test 121 pass (ng build pending).
- Server tests written: ReviewPassTest, AcceptanceDecisionsTest, TaskAcceptanceTest (not yet run).

## Live round 1 (after A–D; jar at core 8ce842a, SDK fix, Studio B–D) — instance :8741, data in scratchpad/studio-live
| Model | Mode | Scenario | State | Verified | Model calls | Review calls | Tokens (incl. review) | Seconds | User actions | Runs |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|
| glm-5.3-flash | auto | S1 | done | review | 1 | 1 | 4,244 | 13 | 0 | 1 |
| glm-5.3-flash | auto | S2 | done | review | 1 | 1 | 4,282 | 16 | 0 | 1 |
| glm-5.3-flash | auto | S3 | done | review | 6 | 1 | 26,001 | 26 | 0 | 1 |
| glm-5.3-flash | auto | S4 | done | review | 9 | 1 | 45,233 | 26 | 0 | 1 |
| glm-5.3-flash | auto | S5 | done | unverified | 9 | 1 | 51,258 | 32 | 0 | 1 |
| glm-5.3-flash | auto | S6 | done | review | 12 | 1 | 73,955 | 52 | 0 | 1 |
| gpt-6-luna | auto | S1 | done | review | 1 | 1 | 3,338 | 13 | 0 | 1 |
| gpt-6-luna | auto | S2 | done | review | 1 | 1 | 3,368 | 13 | 0 | 1 |
| gpt-6-luna | auto | S3 | done | review | 6 | 1 | 20,361 | 29 | 0 | 1 |
| gpt-6-luna | auto | S4 | done | review | 7 | 1 | 26,603 | 39 | 0 | 1 |
| gpt-6-luna | auto | S5 | done | unverified | 15 | 1 | 88,554 | 115 | 0 | 1 |
| gpt-6-luna | auto | S6 | paused (blocked) | none | 10 | 0 | 47,850 | 61 | 0 | 1 |
| glm-5.3-flash | ask | S3 | done | review | 5 | 1 | 20,960 | 20 | 0 | 1 |
| glm-5.3-flash | ask | S5 | done | review | 11 | 1 | 82,495 | 55 | 0 | 1 |
| gpt-6-luna | ask | S3 | done | review | 5 | 1 | 16,875 | 26 | 0 | 1 |
| gpt-6-luna | ask | S5 | needs_you | none | 9 | 1 | 59,737 | 61 | 0 | 1 |

Luna S5 ask: agent asked "finish with the caveat?" (answered opt 1) → review cannot_verify → acceptance card → "done" →
Done "user"; 0 model calls and 0 review calls after "done" (I5). Luna S6: paused — run refused cwd "" and "." (root),
model called state(blocked) → fix E7. S11 both models: 1 run, 0 project_busy, message queued and delivered.
Base S1–S6 sum 727,287 tokens; GLM 204,973 (28%), Luna 190,074 (26%).

## Dead ends / notes
- JAVA_HOME: `/c/work.astrolab/devtools/jdk-26.0.2.1+1` exists (next-goal) and `~/.gradle/jdks/eclipse_adoptium-26-amd64-windows.2`.

## Round 2 (2026-09-30, jar with core e04a71b, NOTES shortened) — findings
- Build: `ng build` failed on `timeline.ts:503` (`string|null` into includes) → null guard. Bridge 10, server 19,
  npm 121, e2e 27/27 green.
- GLM S3/S4 17/16 calls (round 1: 6/9): shortened NOTES dropped the item example → flat `{kind,text,evidence}` items
  refused 3×; also `{"plan.tick":1,"evidence":"#3"}` / `{"accept":…,"plan.add":{…}}` refused → NOTES restored (dead end:
  shortening NOTES after E), core D-355 sibling-field merge (worker).
- Luna S5 auto: agent self-`blocked` (`which xdg-open`, `ls` fail on Windows) → waiting_for_input/paused, not blocked.
  Both models assume Unix → host note `Guidance.platform(os.name)`.
- Owner Q1/Q2 (Fable + Codex agree with owner): D-353 header `status=completed` for plain exit 0 (presentation only);
  D-354 `deadend.add.evidence`, `decision.add.rejected` optional. Worker implementing in core.
- Next: rebuild, round 2b S3–S6 both models (+ S12), commit all three repos, ff-merge into main, push (owner asked).

## Final (2026-09-30)
Round 2b + fixes done; report `phase0-report.md`. Core main 8f4037a (merge --no-ff), SDK main 0912d8a, Studio main
0e49755 — all pushed on owner request. Test instance :8741 stopped. Open owner decisions: see report "Not verified".
