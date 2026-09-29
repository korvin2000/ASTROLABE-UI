# ASTROLABE Studio — Web & Desktop UI for the ASTROLABE Coding-Agent Harness

**Concept · Specification · Prototype · Backend & Frontend Design · Implementation Plan · Kickoff Prompt**

| Field | Value |
|---|---|
| Document | `ASTROLABE_UI_OPUS.md` |
| Version / date | 1.0 · 2026-09-29 |
| Status | Proposed specification. Design complete; no Studio code exists yet |
| Product name | **ASTROLABE Studio** (short: *Studio*) |
| Stack | Angular (latest stable, v22 line) · Spring Boot 4.x on JDK 26 (Java) · ASTROLABE core (Kotlin, in-process) · AI Gate `net.ai.gate:ai-gate` (llm-transport-sdk) |
| Transport | WebSocket first (typed envelope protocol), REST for queries, settings and scripting |
| Baseline analysed | ASTROLABE `main` (P0–P6 185/185 done) **including the implemented AI Gate adapter module `:provider-ai-gate`** (D-326–D-336; offline test suite present and passing) · llm-transport-sdk `0.1.0-SNAPSHOT` |
| Audience | Product owner, UX designers, backend and frontend engineers, implementing LLM agents |

---

## 0. How to use this document

### 0.1 Purpose

This document is self-contained. It explains what ASTROLABE is from a UI perspective, defines a UI that exploits ASTROLABE's specific architecture, specifies the backend that hosts ASTROLABE, and gives an ordered, verifiable implementation plan. [Appendix D](#appendix-d--implementation-kickoff-prompt) is the prompt that starts implementation.

### 0.2 Normative language and identifiers

- **MUST / MUST NOT / SHOULD / MAY** are used as in RFC 2119. Anything not marked is explanatory.
- ASTROLABE code identifiers are in `code font` (for example `CampaignOutcome.WaitingForInput`). UI labels are in "quotes".
- *Studio* means this product: the Angular frontend plus the Spring Boot backend.

| Prefix | Meaning | Defined in |
|---|---|---|
| `P-nn` | Distinctive ASTROLABE property that shapes the UI | §2.3 |
| `G-nn` | Integration gap between ASTROLABE / AI Gate and what the Studio needs | §2.7 |
| `R-<AREA>-nn` | Functional requirement for a UI or backend area (e.g. `R-OVR-04`, `R-BE-01`) | §6–§26 |
| `W-nn` | Wireframe (W-01 shell, W-02 Overview, W-03 Plan, W-04 Changes, W-05 Settings, W-06 Connect, W-07 Project home) | §6–§21; storyboard §7.7 |
| `T-nn` | Implementation task | §36 |
| `AS-nn` | Acceptance scenario | §37 |

Area codes: `SHL` shell · `THR` thread · `CMP` composer · `OVR` overview · `PLN` plan & contract · `CHG` changes · `EVD` evidence · `CTX` context inspector · `DEC` decisions · `ACT` activity · `KB` knowledge · `STA` statistics · `SET` settings · `PRV` providers · `PRJ` projects · `NAV` palette, keys and notifications · `BE` backend.

### 0.3 Reading routes

| Reader | Read |
|---|---|
| Product owner | §1, §2.3, §3, §7, §10, §38 |
| UX / visual designer | §3–§25 |
| Backend engineer | §2, §26–§32, Appendix A, Appendix B |
| Frontend engineer | §5–§25, §28, §30, §33–§35, Appendix A |
| Implementing LLM agent | Appendix D first, then the sections it routes to |

### 0.4 Honesty rules for this document

- Every ASTROLABE or AI Gate API named here was read in source (paths in Appendix E). Where the Studio needs something the libraries do not offer, it is recorded as a gap `G-nn` with an interim approach; the document never presents a proposed API as existing.
- Numbers such as budgets and thresholds are ASTROLABE's declared defaults (`Defaults.kt`), not recommendations.

---

## 1. Executive summary

### 1.1 What the Studio is

ASTROLABE is not a chat agent. It is a **deterministic campaign controller** that turns a user request into a **versioned Task Contract**, plans a **requirement graph of increments**, executes each increment in a **bounded cell** (one model loop with a role), and accepts work **only on evidence**: receipts bound to a workspace stamp. Humans hold explicit, typed authority: they answer questions, approve dangerous effects, resolve contract amendments and sign reviews.

ASTROLABE Studio is the desktop-class UI for that system. It keeps the familiar layout of Claude Code Desktop or Codex Desktop — a left sidebar for projects and sessions, a main workspace with the conversation, tool calls and code changes, and a persistent composer at the bottom — and adds what those tools do not have, because ASTROLABE provides the data for it:

1. **The contract and evidence spine.** Every status the UI shows is derived from the contract, the ledger and receipts, never from model prose. "Done" appears only when the verifier accepted it. Stale, unknown and inconclusive are shown as themselves.
2. **The Agent Overview ("Orrery").** A calm, animated live view of the harness: the campaign rail (contract → pre-scan → shape → plan → increments → finish), a flow diagram of the real ASTROLABE components exchanging messages as events arrive, a turn ring showing the phase of the current turn, and the agent's **working register (STATE)** rendered as its high-level reasoning: plan cursor, hypotheses turning into verified facts, dead ends, decisions and the next action.
3. **The authority inbox ("Needs you").** Questions, D-class approvals, amendment decisions, human reviews, knowledge admission, unknown-outcome reconciliation and provider logins are typed decision cards, bound to a contract revision, with the consequences of each answer stated.

### 1.2 Key decisions

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Session model | A sidebar "session" is an ASTROLABE **campaign** (`work_id`); messages after the first are **amendments** or **answers**, never free chat | Matches P-02; avoids a chat illusion the harness does not implement |
| 2 | Live data | ASTROLABE event bus **plus** journal tailing, merged by the backend into one ordered stream per campaign | Events are content-free and several declared events are not emitted (G-03) |
| 3 | How the backend drives ASTROLABE | The raw `Controller` through a thin **host bridge** module (Kotlin, Java-facing API); the `Astrolabe` facade is not enough | The facade cannot resume, set leases, resolve model amendments, reconcile intents or administer the KB (G-01, G-02, G-05, G-10, G-11) |
| 4 | Reasoning display | Render the STATE register and gates; show provider reasoning only as an opaque token count | ASTROLABE does not serialize private reasoning (P-06) |
| 5 | Streaming text | Turn-level rendering with content-free progress meters in v1; optional ephemeral text preview behind a flag later | D-51: the journal is the single record of model output (G-09) |
| 6 | Visual language | Calm "instrument" aesthetic: neutral graphite/paper surfaces, one accent, semantic status colours used as small marks, dense layout, motion only for real events | Requirement: modern, not colourful, not bloated |
| 7 | Settings | Layered (Studio → project → campaign) and **frozen per attempt**; validated live with `Config.violations()` and `AiGateAdapter.violations()` | P-10: config changes act only at attempt boundaries |
| 8 | Deployment | Local-first: backend bound to `127.0.0.1` with a per-launch token; installable PWA; optional desktop shell later | Single-user tool with repository and credential access |

### 1.3 Non-goals for v1

- No display of hidden chain-of-thought; no invented "thinking" text.
- No editing of ASTROLABE behaviour the library does not expose; such items are shown read-only and linked to their gap.
- No remote multi-user server mode (the architecture keeps it possible, §31.6).
- No evaluation-lab UI for research arms (`eval` module); mandatory `Controls` are never exposed.
- No token-by-token model text in v1 (G-09).

### 1.4 Delivery at a glance

| Phase | Outcome |
|---|---|
| A — Foundations | Host bridge, event/journal normalizer, WebSocket protocol, app shell, fixture-driven prototype of Thread and Overview |
| B — First real campaign | Providers and credentials, project opening, start/cancel/amend/resume, decisions inbox, thread from live data |
| C — Evidence and control | Plan & Contract, Evidence, Changes, Context inspector, settings binding with validation, reconciliation |
| D — Depth | Knowledge, Statistics, publication, S2/S3 visuals, replay, desktop packaging, accessibility and performance gates |

Details and acceptance criteria: §36–§37.

---

## 2. ASTROLABE through the UI lens

### 2.1 Architecture on one screen

```text
            YOU — authority: request · amendments · answers · approvals · reviews · publication grants
                                               │
┌──────────────────────────── CAMPAIGN CLOCK — Controller (deterministic, resumable) ───────────────────────────┐
│ contract ▶ impact pre-scan ▶ shape S0–S3 ▶ plan cell (S1+) ▶ requirement graph ▶ ready frontier ▶ increment ▶ │
│ [ compile ▶ CELL ▶ verify ▶ (review) ▶ (integrate, S3) ▶ accept ] ▶ ledger ▶ next … ▶ finish receipt          │
│ owns: contract · graph · ledger · budgets · lease · cancellation · authorization · reconciliation · resume    │
└───────────────┬────────────────────────────────────────────────────────────────────────────▲──────────────────┘
                │ compiled context [S][R][K]                                                  │ Result Packet
┌───────────────▼──────────────────── CELL CLOCK — one role, one increment, ≤ 40 turns ────────┴──────────────────┐
│ turn = model ▶ Read (look, kb) ▶ one Edit batch ▶ Execute (run, verify) ▶ Metadata (state, task, kb.propose)    │
│        ▶ end-of-turn checker ▶ gates and nudges ▶ checkpoint (shadow-ref snapshot)                              │
│ state: STATE register · Workset KNOWN / NOT SEEN · transcript [T] · anchor [A] · gauge line                     │
│ exit: done (a proposal until the exit gate accepts) · blocked · partial · failed · cancelled                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  Tools ▸ workspace (CAS edits, transforms, shadow ref) ▸ verification scheduler (checks, receipts @ stamp)
        ▸ evidence store (SQLite + blobs) ▸ knowledge base (notes, admission queue, curator)
  Router (function → tier → profile) · Delegation (probe · review · QA · writer) · Recovery ladder
```

**Roles** are configurations of the one cell runtime: `plan`, `implementing`, `probe`, `review`, `qa`, `writer`, `repair`, `extractor`. **Shapes** decide which machinery is active: S0 one implementing cell; S1 adds the plan cell and multi-increment campaigns; S2 adds probes, reviews, routing escalation and recovery; S3 adds parallel writers in worktrees with an integrator (off by default).

### 2.2 Vocabulary: ASTROLABE term → Studio label

The Studio uses ASTROLABE's vocabulary so logs, docs and UI agree. Every term has a glossary tooltip (Appendix C).

| ASTROLABE term | Studio label | Shown as |
|---|---|---|
| Campaign / `work_id` (`W-…`) | "Campaign" | Sidebar session; header title; mono chip `W-0042` |
| Attempt / `attempt_id` (`a1`) | "Attempt" | Chip in header |
| Candidate / stamp (`candidate_id`) | "Stamp" | Short hash chip `s58·c02e` with tooltip (base commit, tracked delta, untracked manifest, environment) |
| Cell / `context_id` | "Cell" + role | Section in Thread; node in Overview |
| Increment | "Increment" | Node in the plan graph; rail chip `I2` |
| Requirement / acceptance item | "Requirement R1" / "Acceptance AC-1 (run · check · review)" | Contract view, acceptance matrix |
| Ledger | "Ledger" | Requirement status column |
| Receipt | "Receipt" | Evidence rows, links from checks |
| STATE register | "Working register" (short "STATE") | Reasoning panel |
| Workset | "Workset (known / not seen)" | Context inspector |
| Gate / nudge | "Gate" / "Nudge" | One-line markers in Thread; badges in Overview |
| Result Packet / finish receipt | "Cell result" / "Finish receipt" | Summary cards |
| Authority request | "Decision" | Needs-you inbox cards |

### 2.3 Distinctive properties and their UI consequences

| ID | ASTROLABE property | UI consequence |
|---|---|---|
| P-01 | **Two clocks**: a long, resumable campaign and bounded cells | Two zoom levels everywhere: campaign rail + cell loop; Thread grouped by cell; sessions are campaigns |
| P-02 | **The contract is user-authoritative and versioned**; the model may only add acceptance or *propose* changes; replies bind a `contractRevision` | Composer semantics "Start campaign / Amend contract / Answer"; contract versions and origins visible; stale replies rejected in the UI before sending |
| P-03 | **Completion is evidence-gated**: the exit gate refuses "done" without current receipts; the verifier, not the model, accepts | Status comes only from ledger, receipts and events; model text never flips a status; refused completions are shown with exactly what is missing |
| P-04 | **Honest vocabulary**: unknown ≠ zero, stale ≠ green, partial ≠ failed, blocked-with-question is a success path, `inconclusive` ≠ passed | A status system with distinct shapes and words for current / stale / unknown / not run / inconclusive; money shown as "unknown" rather than 0 |
| P-05 | **Four identities** (`work`, `attempt`, `candidate`, `context`) plus execution generation | IDs as mono chips; deep links by id; "stale-for-integration" and "superseded" markers |
| P-06 | **Externalized reasoning**: the STATE register (plan with cursor, facts `h`/`v`/`x`, dead ends, decisions with probes, open items, focus, amendments, next); private reasoning is not serialized | "Reasoning" is the register, animated on change (hypothesis → verified, refuted, dead end); provider reasoning is an opaque metric |
| P-07 | **Roles are configurations**, never security boundaries; host overrides may only reword or narrow (D-38) | Roles editor shows the effective role and permits only allowed changes, validated live |
| P-08 | **Shapes S0–S3 are policy-selected** with logged inputs; required controls exist in every shape | Shape badge with the reason; shape-specific UI (no probe panels in S0/S1; worktrees only in S3) |
| P-09 | **Deterministic/semantic boundary**: scheduling, budgets, permissions, stamps, check currency and acceptance are never model decisions | Overview draws deterministic components (controller, compiler, router, verifier) differently from model-driven cells |
| P-10 | **Frozen attempt configuration** (invariant 12, `AttemptConfig.freeze`, fingerprint) | Settings apply to the next campaign; running campaigns show their frozen config and fingerprint; a banner explains pending changes |
| P-11 | **Typed human authority** (`ask`, `approve`, `resolve`, `review`) awaited inside the cell, no timeout; lease 1 h, not renewed | Needs-you inbox, lease countdown, explicit "decline" that ends the cell blocked, notifications |
| P-12 | **Economics discipline**: usage by cache class, four quantities, cost per accepted task, missing usage recorded as missing | Statistics by cache class, warm/cold split, "unknown" cost segments, no cache-hit vanity metric |
| P-13 | **Safety labels**: effect classes R/W/D, permission ladder, `trusted-local` vs `confined`, rules-file binding, redaction, instruction-shaped content flags | Persistent execution-mode chip; D-class cards show argv, cwd, expected effect and reason; flagged tool output marked |
| P-14 | **Workspace safety**: shadow ref per mutating turn, initial dirty-state record, never `reset`/`clean`; changes attributed agent / by-run / pre-existing | Changes view with attribution and a turn slider; pre-existing user changes shown apart and never offered for revert |
| P-15 | **Content-free events; journal is the only record of model output** (D-51) | Turn-level rendering; progress meters (characters, output tokens, retries) while the model works |
| P-16 | **One campaign per project** (ProjectLock, single writer); resumable outcomes `waiting_for_input`, `blocked_external` (and `waiting_for_process`, declared but not produced today) | Project lock state in the sidebar; "Resume" for resumable outcomes; Studio-side queue for the next campaign |
| P-17 | **Knowledge with admission and provenance**; notes are data, never instructions | Knowledge inbox with lint findings and evidence; provenance on every note |
| P-18 | **Research arms are not production** (`Controls`, `eval`) | Never exposed in Settings |

### 2.4 The host integration surface that exists today

| Concern | API (read in source) | Notes for the Studio |
|---|---|---|
| Facade | `Astrolabe(config, adapter, authority, clock, idGen, layers, deployer, estimators, ownsAdapter)`; `open(repo): Project`; `suspend campaign(project, request, policy?, publication?): CampaignHandle`; Java: `AstrolabeJava`, `JavaCampaignHandle` (`await`, `cancel`, `amend`, `subscribe`) | Always mints a new work id; one `Authority` per instance; no lease or `maxCells` control |
| Full driving | `Controller(config, clock, idGen, events, env, faults, spans, leaseDuration = 1h, precompiles, router, extraction, layers, estimators)`; `open(project, CampaignRequest(work, attempt, text), CampaignPolicy(tokens, cost?, resumeExpected))`; `suspend run(c, CellModel, Authority, SyntaxCheck, maxCells = 12)`; `suspend publish(c, run, PublicationRequest, Authority, Deployer?)` | Resume = `open` again with the same ids; per-run `Authority` |
| Opened campaign | `OpenedCampaign`: `ids`, `contract`, `state`, `stop`, `cancellation.cancel(reason)`, `contracts.amendByUser/propose/resolve(…, apply)`, `intents`, `reconciliation`, `lease`, `journal`, `kb`, `attempt` | The handle the bridge keeps per running campaign |
| Human authority | `Authority` / `JavaAuthority`: `ask(Question): Answer?`, `approve(DClassRequest): Decision`, `resolve(AmendmentProposal): Resolution`, `review(ReviewRequest): Verdict?`; `Replies.check(replyRevision, currentRevision)` (overloads per reply type) | No timeout; `null` ⇒ the cell ends blocked |
| Events | `Events(clock, replay = 256, bufferCapacity = 4096)`; `subscribe(EventSink): Subscription(active, dropped)`; `EventRecord(seq, at, event)`; `AgentEvent` sealed hierarchy with wire names (`cell.tool_called`, …), `Phase`, span ids | Drop-oldest per subscriber; gaps repaired from reads |
| Read models | `Views(store)`: `contract`, `ledger`, `register(context)`, `workset(context)`, `checks`, `budget`, `receipts`, `finishReceipt` | Pure `SELECT`s under one DB lock shared with the running campaign |
| Journal | `Journal(store, clock)`: `events(JournalScope(work, context?, kinds?))`, `search(query, scope, limit)`, `lastSeq(work)`; kinds `call · result · edit-intent · edit-outcome · check · nudge · boundary · intent · reconcile` | `call` rows carry model output items as JSON payload |
| Store | `Store.db.query(sql, params)` (public); tables listed in §27.3; layout under `<stateRoot>/astrolabe/projects/<repo-digest>/` | No list-campaigns API (G-07) |
| Blobs | `BlobStore.get/exists/path`; kinds `OUTPUT, PREIMAGE, POSTIMAGE, DIFF, LOG, PACKET, MODULE` | Studio serves only non-recovery kinds (§31.4) |
| Accounting | `Accounting(store, clock).calls(work)`, `totals(work, accepted, currency)`; `Economics.report(…)`; `CallAccount` rows in `usage` | Remaining budget derived by the Studio |
| Spans | `Spans(idGen, events).snapshot(work)`, `analyze(work, TraceLimits)` | In memory for the running process only; the Studio persists `span.*` items and rebuilds past timelines from its event log (G-19) |
| Knowledge | `Notes.all/get/revisions`, `Queue.pending/all/entry/batch`, `Curator.admit/admitWith/supersede/deprecate/rollback/recheck/prune/promote/regenerate` | Host-driven (G-10) |
| Intents | `IntentJournal.reconcile(intentId, evidence)` | Must precede reopen (G-11) |
| Configuration | `Config`, `Defaults`, `ShapePolicy`, `ProfileRoles`, `Flags`, `Role`/`Roles`, `TierTable`, `RedactionConfig`, `RulesBinding`, `qualityGates`, `stateRoot`; `Config.violations()`; `AttemptConfig.freeze(config)` + `fingerprint` | Everything is a host-built data class; no config-file layer |
| Optional layers | `OptionalLayers(outlines, dense, tools, mounts)` | Read only while the matching flag is on |
| Publication | `PublicationRequest(through, remote, mergeTarget, deployTarget, knownRemotes, message)`; `Deployer.deploy(DeployRequest)`; `Stage { Patch, LocalCommit, Push, Merge, Deploy }` | Each stage is a separate `approve` |
| Provider adapter (implemented) | `AiGateAdapter(llm, profiles, ownsLlm)` (an `ObservableAdapter`); `adapter.estimators(HeuristicEstimator())`; `AiGateAdapter.violations(llm, profiles)`, `warnings()`; `AiGateProfiles.draft(…)`, `qualify(…)` (billable) | Existing module `:provider-ai-gate` with its test suite (§2.6.1); the Studio wires it, it does not build an adapter |
| LLM transport | `Llm.builder()…build()`; `llm.auth()` (`status`, `methods`, `login`, `save`, `logout`, `revoke`); `llm.models()` (`all`, `available`, `refresh`); `llm.test(model, …)`; `llm.features(model)`; `llm.addListener(LlmListener)`; `ProvidersConfig.read/validate/write` | Detailed in §2.6 and §20 |

### 2.5 Live signals

#### 2.5.1 Events actually emitted (verified by emission sites)

| Group | Wire names | Studio use |
|---|---|---|
| Campaign | `campaign.opened`, `campaign.shape_selected` (shape, `inputsRef`), `campaign.increment_selected`, `campaign.increment_closed` (status), `campaign.finished` (outcome, `finishReceiptRef`) | Campaign rail, sidebar status, Thread boundaries |
| Contract | `contract.amended` (version, by), `contract.amendment_proposed` (proposalId, weakening), `contract.amendment_resolved` | Contract view refresh; decision cards |
| Cell | `cell.started` (incrementId, role), `cell.turn_started` (turn, turnsMax), `cell.model_requested` (invocationId, estimatedTokens, profileId, anchorTokens), `cell.model_progress` (stage `started`/`output`/`retrying`, textChars, outputTokens, attempt), `cell.model_responded` (stop, usage), `cell.tool_called` (opId, family, op, phase), `cell.tool_resulted` (opId, resultAlias, header), `cell.gate_fired` (gate, text), `cell.register_patched` (version, ops), `cell.workset_changed` (known, dropped), `cell.rebuilt` (reason, generation), `cell.ended` (status, manifestRef) | Thread turns, Overview flow and turn ring, Reasoning refresh, Context inspector |
| Human | `ask.question`, `ask.answered`, `blocked` (reason, questionId) | Needs-you, status |
| Recovery | `run.reconciled` (actionId, outcome) | Reconciliation panel |
| Delegation | `delegation.dispatched` (handle, kind, `delegatedCost`), `delegation.collected`, `delegation.rejected` | Child agents in Overview and Thread |
| Knowledge | `kb.proposed` (controller); `kb.admitted`, `kb.invalidated` (only from a `Curator` built with the event bus — the Studio builds it so) | Knowledge inbox badges |
| Other | `warning` (kind, text), `span.started`, `span.ended` (status, exclusive cost, duration) | Banners; timeline |

`tool_called.phase` maps the dispatcher's turn phase: Read → `Locate`, Edit → `Edit`, Execute → `Verify`, Metadata → `Understand`. This drives the turn ring (§10.5).

#### 2.5.2 Declared but not emitted today

`edit.applied/rejected/reverted/transformed`, `run.started/output/finished`, `check.scheduled/stale` (and `check.started/finished` in controller-driven campaigns), `routing.decided`, `recovery.classified/repaired/escalated`, `budget.reconciled`, and in controller-driven campaigns also `budget.reserved`/`budget.exhausted` (only a `CellBudget` built with an event bus emits them; the controller builds it without one). The Studio derives equivalents from the journal and tables (G-03, Appendix A) and MUST switch to the real events when they appear, without UI changes.

#### 2.5.3 Journal and tables as detail sources

| Source | Gives the UI |
|---|---|
| `journal` `call` rows | Model output per turn: message text, native tool calls, reasoning references (opaque), stop reason, late evidence |
| `journal` `result` rows | Tool result summary line + refs (result alias, blob digests) |
| `journal` `edit-intent` / `edit-outcome` | Edit ids, paths, preimage digests, outcomes |
| `journal` `check` rows | Receipt id, check id, outcome (end-of-turn checker and acceptance runs) |
| `journal` `nudge` / `boundary` | Gates, completion refusals, turn checkpoints (`turn N status · stamp · STATE vN · open intents`), pre-scan, shape, KB injection, full-suite runs, publication steps, rebuilds |
| `journal` `intent` / `reconcile` | Intent lifecycle and reconciliation |
| Tables `campaigns`, `cells`, `turns`, `increments`, `ledger`, `receipts`, `usage`, `routing_log`, `packets`, `manifests`, `register_versions`, `handles`, `note_queue` | Lists, history, plan, evidence, economics, context, processes, knowledge |
| `PACKET` blob referenced by `campaign.finished.finishReceiptRef`; `exports/<work>/finish-receipt.json` | Finish receipt (G-04) |

### 2.6 The LLM transport layer (AI Gate) as the UI sees it

- **Runtime.** One `Llm` per Studio backend, built with `Llm.builder()`: providers, a `CredentialStore`, catalog options, HTTP options, listeners. Thread-safe, `AutoCloseable`. ASTROLABE uses it through `AiGateAdapter(llm, profiles)`.
- **Providers.** Presets for `openai`, `openai-codex` (ChatGPT subscription, OAuth), `anthropic`, `google`, `openrouter` (key or OAuth PKCE), `deepseek`, `xai`, `qwen`, `mistral`, `groq`, and local `ollama`, `lm-studio`, `vllm`; factories for LiteLLM, Azure OpenAI and custom OpenAI- or Anthropic-compatible endpoints. Secret-free JSON config `ai-gate.providers/1` (`ProvidersConfig`). Form descriptors (`FieldDescriptor` kinds TEXT, SECRET, URL, INTEGER, DECIMAL, BOOLEAN, CHOICE, DURATION, JSON) let the UI render provider forms generically.
- **Authentication.** `ApiKeyCredential` or `OAuthCredential`. `auth().status(provider)` → `NOT_CONFIGURED | CONFIGURED | EXPIRING | EXPIRED | REFRESH_FAILED`. `auth().login(provider, type, AuthInteraction, cancel)` runs PKCE (loopback or redirect) or device-code flows and emits `AuthPrompt` (`Text`, `SecretText`, `Select`, `Code`) and `AuthNotice` (`OpenUrl`, `DeviceCode`, `Info`, `Progress`) to an interaction the Studio implements. Refresh is automatic. No OS keychain store ships: the Studio implements `CredentialStore` (§31.3). Not supported: Claude subscription OAuth, Google OAuth, Copilot.
- **Catalog.** `llm.models()` merges bundled, models.dev feed, live listings and custom models; `Model` carries limits, modalities, reasoning levels, capabilities (`SUPPORTED/UNSUPPORTED/UNKNOWN`), prices per million tokens (catalog prices, not invoices).
- **Checks.** `llm.test(model)` runs `CONFIGURATION → NETWORK → AUTHENTICATION → MODEL_ACCESS` without billing; `INFERENCE, USAGE, TOOLS, CACHE` probes are opt-in and billable. `AiGateProfiles.draft` builds an ASTROLABE `Profile` from the catalog; `AiGateProfiles.qualify` (billable) narrows it to observed behaviour.
- **Telemetry.** `LlmListener` receives content-free `RequestEvent` (`Started`, `Retrying`, `FirstOutput`, `Progress`, `Finished` with usage, cost, latency, time-to-first-output, attempts, warnings, provider request id), `CredentialEvent` (`Refreshed`, `RefreshFailed`) and `CatalogEvent`. ASTROLABE tags calls with `astrolabe.profile` and `astrolabe.invocation`, which lets the Studio join provider telemetry to ASTROLABE invocations.
- **Limits the UI must respect.** No client-side rate limiter or quota API (only response-header rate limits and `rate_limited`/`quota_exhausted` errors); Codex login needs loopback port 1455 on the machine running the backend; ASTROLABE profiles must keep `continuation`, `nativeCompaction` and `hostedExecution` false; the catalog should be frozen (`offline()` or `snapshotFile`) for stable limits.

#### 2.6.1 Status of the AI Gate adapter — present, not future work

Earlier planning material described the AI Gate integration as a later step. That is no longer true, and this document treats it as existing code:

| Item | State in the analysed baseline |
|---|---|
| Module | `:provider-ai-gate` (`io.astrolabe.provider.aigate`): `AiGateAdapter`, `AiGateInvocation`, `ProfileBinding`, `AiGateProfiles`, `AiGateEstimator`, `RequestTranslator`, `ResponseTranslator`, `JsonBridge`. Built from the sibling SDK checkout as a composite build (`settings.gradle.kts`, D-332); skipped only when that checkout is absent |
| Core seams it uses | `ObservableAdapter` → `cell.model_progress`, `EstimatorFactory`, `ProviderError.ContextOverflow/Authentication/Timeout`, `Astrolabe(…, estimators, ownsAdapter)`, `AstrolabeJava` constructor taking a provider-module adapter |
| Offline tests (present) | `AiGateAdapterTest`, `AnthropicProtocolTest`, `ResponsesProtocolTest`, `TranslationTest`, `QualificationTest`, `CampaignThroughGateTest` (a whole campaign through the real adapter), and the shared helper `GateTestKit`; the adapter acceptance fixtures AX-01…AX-10 live in the first three (interrupted streams, broken tool pairing, output-limit stops, foreign reasoning, cancellation with late output, usage normalization without double counting) |
| Live tests (present, not yet run) | `LiveSmokeTest`, run only by the opt-in, billable `./gradlew :provider-ai-gate:liveTest` with provider keys from the environment; never part of `check` |

Consequences for the Studio: the backend **wires** `AiGateAdapter` (§26.6) and never re-implements transport; no task in §36 builds an adapter; "live behaviour unverified until `liveTest` or `AiGateProfiles.qualify` has run against the user's provider" is shown as a qualification state on each profile (§20.5), not as missing functionality.

### 2.7 Integration gaps

Priority: **P0** blocks the v1 experience (an interim approach is mandatory); **P1** degrades it; **P2** limits advanced features.

| ID | Need | Evidence | Studio interim | Proposed upstream change | Pri |
|---|---|---|---|---|---|
| G-01 | Resume a resumable campaign | `Astrolabe.campaign` always mints a new work id; resume = `Controller.open` with the same ids | Host bridge calls `Controller.open` + `run` for the existing ids | `AstrolabeJava.resume(project, workId)` | P0 |
| G-02 | Human waits longer than the lease | Lease 1 h, acquired at `open`, never renewed; expiry ⇒ `blocked_external` at next dispatch, publication fenced | Bridge constructs `Controller(leaseDuration = settings)` (default 8 h in Studio); UI countdown; auto-resume after a late answer | Lease renewal while awaiting `Authority`; facade parameter | P0 |
| G-03 | Edit, run, check, routing, recovery and budget events | Declared, not emitted in controller-driven campaigns (`CellBudget.of(…)` is built without events) | Normalizer derives items from journal rows, `receipts` and `routing_log`; budget from `usage` + contract budget; exhaustion from the campaign outcome and the reserve gate | Pass the event bus to `Edit`, `Run`, `Checker`, `Router`, `Recoveries`, `CellBudget` | P1 |
| G-04 | Result packets and finish receipt as records | `cell.ended.packetRef` is null; `ResultPacket` not persisted; `Views.finishReceipt` empty in production | Parse the cell-end `boundary` summary; read the finish receipt from the `PACKET` blob referenced by `campaign.finished.finishReceiptRef`, falling back to `exports/<work>/finish-receipt.json` | Persist packets (`packets.kind = result / finish_receipt`) and set refs | P1 |
| G-05 | Resolve model-proposed amendments | No controller path; host must call `Contracts.resolve(work, id, authority, apply)` with an `apply` function | Bridge exposes resolve with a typed `ContractPatch` built in the UI | Typed `ContractPatch` in `Contracts` and the facade | P0 |
| G-06 | Structured campaign input (acceptance, constraints, exclusions, scope, ceiling) | `CampaignRequest(work, attempt, text)` only | Composer fields rendered into a canonical "request annex" inside the verbatim request, labelled *hints*; config-level fields via runtime selection | `CampaignSpec` accepted by `open` | P1 |
| G-07 | List campaigns, cells, turns | No API | Read-only SQL through `Store.db`, cached and event-invalidated | `Views.campaigns()`, `Views.cells(work)` | P0 |
| G-08 | Tail the journal efficiently | `Journal.events(scope)` returns all rows | SQL `seq > ? LIMIT ?` | `Journal.after(work, seq, limit)` | P0 |
| G-09 | Live model text | Progress is content-free by design (D-51) | Progress meters; full text at turn end | Optional adapter-local, ephemeral `TextDeltaListener` (never persisted, off by default) | P2 |
| G-10 | Knowledge administration | `Project.kb` is `EmptyKb`; admission is host-driven via `Curator` | Bridge instantiates `Notes`, `Queue` and `Curator(store, estimator, idGen, clock, resolver, redaction, events)` with the shared event bus | `ProjectKb` facade | P1 |
| G-11 | Unknown-outcome reconciliation | `IntentJournal.reconcile` must happen before reopen or the lease fence refuses | Wizard; the bridge calls `SqliteIntentJournal(store, clock).reconcile(…)` on the open project (no campaign needed), then resumes | Facade method | P0 |
| G-12 | New attempt on the same work | `open` refuses attempt `a2` ("a new attempt is P2") | "New campaign from W-…" (seeded request, links) | Attempts API | P2 |
| G-13 | Knobs not on `Config` | `EffectPolicyConfig`, `ProtectedPaths`, `FunctionTable`, `InjectionWeights`, capability host sets, measurement commands, sniffed-command overrides, `maxCells` via facade, lease | Shown read-only with "not configurable yet"; `maxCells` and lease set by the bridge | Thread them through `Config` | P1 |
| G-14 | Confined execution | No backend registered; `Confined` is refused | Option disabled with explanation | Container/bwrap backend | P2 |
| G-15 | MCP tools | `OptionalLayers.mounts` accepts a `Catalog`, but no `McpClient` reaches `Run` in the controller path | MCP settings marked "declared, not callable" | Wire `McpClient` into the controller | P2 |
| G-16 | Per-campaign config and authority | Config is per `Astrolabe`/`Controller`; facade has one `Authority` | Runtime registry keyed by config fingerprint; one multiplexing `AuthorityBridge` per run | — | P0 (Studio design) |
| G-17 | Concurrent reads | One JDBC connection and one lock per store | Event-driven incremental reads, caching, no polling loops | Read-only secondary connection (WAL) | P1 |
| G-18 | Process logs and handle control | `handles` table and log files exist; no host API | Read-only log tail from `logs/`; cancel through campaign cancel | `Handles` facade (poll, cancel) | P1 |
| G-19 | Statistics producers | Many `CampaignMetrics`/`ProjectMetrics` fields are null; calibration log, generated-tool registry and `Spans` are in memory | Studio computes from `usage`, persisted `span.*` items and the journal; shows "not measured" | Producers and persistence | P2 |
| G-20 | Revert from the UI | `ShadowRef.restore` exists; no safe host API while a campaign runs | v1: "Ask the agent to revert" (an amendment naming the edit or turn); restore only when idle, later | `Project.restore(work, turn)` with dirty-state guards | P2 |
| G-21 | Typed `resolve` kinds | Plan acceptance, KB admission and model amendments all arrive as `AmendmentProposal`, distinguishable only by text (`reason` = "plan proposal …" / "knowledge admission") | Bridge classifies by `reason` prefix and by known ids | A `kind` field on `AmendmentProposal` | P1 |
| G-22 | Publish after the run ended | `publish(c, run, …)` needs the live `OpenedCampaign` and its `S0Run` with a finish receipt; a later `open` does not rebuild them; lease fencing applies | Bridge keeps a finished campaign's handle open for a *publication window* that ends when the user publishes or dismisses, the backend restarts, or the lease expires — after lease expiry that campaign cannot be published in v1; the Publication panel shows the countdown; the composer also accepts a publication request at start | Publish from a persisted finish receipt | P1 |
| G-23 | `Defaults` fields the runtime does not read | No reads in `core/src/main` outside `Defaults.kt` for `probeTurns`, `probeTier`, `reviewTier`, `reviewRoutineTier`, `reviewLookMax`, `reviewCampaignTokens`, `runTimeoutSeconds`, `flakyIsolatedReruns`, `injectionMaxNotes`, `injectionMaxTokens`, `noteBodyMaxTokens`, `noteSummaryMaxChars`, `seedsMaxTokens`, `factLineMaxChars`, `campaignRecoveryReserve`, `admissionConfidenceMax`, `m` (modules use their own constants, e.g. `AdmissionPolicy.AUTO_ADMIT_MAX_CONFIDENCE`) | Shown read-only as "declared, not wired" — editing them would change the fingerprint but not behaviour | Wire them, or drop them from `Defaults` | P1 |
| G-24 | Role overrides beyond wording | `Config.violations` accepts a narrowed tool mask, a lowered permission and extra denied note kinds, but the runtime applies only `personaLines`, `duties` and `policyTextVersion` (`RoleTexts.worded`) | Roles editor offers wording only; everything else is read-only | Apply validated narrowing at runtime | P2 |

### 2.8 Architecture decision: the Studio host bridge

The Spring Boot backend embeds ASTROLABE in-process. Because the facade lacks resume, lease control, amendment resolution, reconciliation and KB administration, the backend drives the raw `Controller` through **`studio-astrolabe-bridge`**, a small Kotlin module compiled into the backend. It exposes a plain Java interface (`CompletableFuture`, no `suspend`, no `Flow`) and contains no UI logic. When the upstream facade gains the proposed methods, the bridge shrinks to delegation; nothing above it changes. The alternative — contributing the facade methods to ASTROLABE first — is preferred long-term and tracked as upstream items for G-01, G-02, G-05, G-10 and G-11.

---

## 3. Product principles

| # | Principle | What it means in the UI |
|---|---|---|
| 1 | **Evidence over narration** | Statuses come from the ledger, receipts and events. Model prose is commentary and is rendered as such. A requirement is "verified" only when the ledger says so |
| 2 | **The contract is the spine** | Every item in the UI can point back to a request (`U1`), requirement (`R1`) or acceptance item (`AC-1`). The composer edits the contract; it does not "chat" |
| 3 | **Honest states** | Unknown is never zero, stale is never green, partial is not failure, a blocked question is a normal stop. Each state has its own glyph and word (§23.3) |
| 4 | **Authority is explicit** | Every human decision is a typed card stating the consequence of each option and the contract revision it answers. Autonomous-policy decisions are logged visibly, never hidden |
| 5 | **Calm density** | Compact rows, quiet surfaces, one accent, motion only for real events. Details open on demand (expand, inspector drawer); no permanent secondary panels by default |
| 6 | **One stable mental map** | Fixed node positions in the Overview, fixed sidebar order, the same status glyphs in every view |
| 7 | **Linkable and replayable** | Every item has an id and a deep link. Any campaign can be replayed from the Studio event log |
| 8 | **Local-first and safe** | Secrets never reach the browser. Recovery material (preimages, native replay) is never served. `trusted-local` is labelled "no sandbox" |
| 9 | **Keyboard-first** | Command palette, single-key actions in decision cards, predictable focus |
| 10 | **Config you can see** | The UI always says which frozen configuration a campaign runs with and when a settings change will take effect |

---

## 4. Users, jobs and core scenarios

### 4.1 Personas

| Persona | Context | Needs most |
|---|---|---|
| **Builder** | Developer running campaigns on their repositories daily | Fast start, a clear sense of progress, quick answers and approvals, trustworthy diffs |
| **Reviewer** | Lead or teammate judging whether a campaign's result is acceptable | Acceptance evidence, reviews, test-integrity flags, change attribution, publication control |
| **Operator** | Person who configures providers, profiles, budgets, roles and policies | Settings with validation, cost and routing statistics, provider health, knowledge hygiene |

### 4.2 Jobs to be done

1. Start a campaign on a repository with the right models, budget and autonomy.
2. Understand, at a glance, what the agent is doing now, why, and what comes next.
3. Answer questions and approve or deny consequential actions quickly and safely.
4. Decide whether the work is really done, from evidence.
5. Inspect, export and publish the changes.
6. Recover from interruptions: resume, reconcile, or restart from a finished campaign.
7. Keep spending under control and understand where tokens went.
8. Connect providers, create and qualify model profiles, tune policies and roles.
9. Curate what the agent learns.

### 4.3 Core scenarios

| ID | Scenario | Main views |
|---|---|---|
| S-01 | First run: connect a provider, add a repository, accept suggested profiles, start an S0 campaign | Providers, Projects, Composer, Thread |
| S-02 | Interactive S2 campaign: plan review, a question, a D-class approval, a human review, finish | Thread, Needs you, Plan, Evidence |
| S-03 | Watch a long campaign on a second monitor | Overview (pop-out) |
| S-04 | Campaign stops `waiting_for_input` overnight; answer next morning; resume | Needs you, Resume |
| S-05 | Backend crash mid-run; reopen; reconcile unknown outcomes; resume | Reconcile wizard, Activity |
| S-06 | Judge the result: acceptance matrix, receipts, test-integrity flags, campaign review, finish receipt | Evidence, Changes |
| S-07 | Publish to a local commit and push, with per-stage approvals | Changes → Publication |
| S-08 | Curate knowledge candidates after a campaign | Knowledge inbox |
| S-09 | Operator adds a second provider, drafts and qualifies a profile, assigns tiers | Providers, Settings → Models & routing |
| S-10 | Investigate cost: tokens by cache class, expensive cells, retries | Statistics, Context inspector |

---

## 5. Information architecture

### 5.1 Object model

```text
Studio
├── Providers & accounts (AI Gate providers, credentials, catalog)          global
├── Profiles & routing (ASTROLABE Profile, ProfileRoles, TierTable)         global, overridable per project
├── Settings layers (Studio defaults → project overrides → frozen per attempt)
└── Projects (git repositories; one ASTROLABE state root each)
    ├── Repository health (git, dirty state, sniffed commands, rules file, lock)
    ├── Knowledge base (notes, admission queue, skills, behaviour maps)       per repository
    └── Campaigns (work_id)                                                   one running at a time
        └── Attempt (a1)                                                      frozen AttemptConfig + fingerprint
            ├── Contract (versions v1…vN: requests, requirements, acceptance, constraints, scope, budget, authorization)
            ├── Requirement graph (increments) + ledger
            ├── Cells (context_id, role, increment)  ── Turns ── model output · tool calls · edits · checks · gates
            ├── Children (probe / review / qa / writer / repair cells)
            ├── Evidence (receipts, reviews, baseline, finish receipt)
            ├── Changes (shadow-ref snapshots per turn, attribution)
            ├── Decisions (questions, approvals, amendments, reviews)
            └── Economics (usage per invocation, spans)
```

### 5.2 Navigation map

| Level | Element | Content |
|---|---|---|
| Global | Sidebar | Projects → campaigns; Library (Knowledge, Statistics, Settings); footer: Needs you, Activity, provider status |
| Campaign | Tabs | Thread · Overview · Plan · Changes · Evidence · Context |
| Any | Inspector drawer | Details of any selected item, with its own back stack |
| Any | Overlays | Command palette, decision focus mode, provider login, confirmation dialogs |

### 5.3 Routes and deep links

| Route | View |
|---|---|
| `/` | Last opened campaign, else project list |
| `/p/:projectId` | Project home |
| `/p/:projectId/c/:workId` | Campaign, Thread tab |
| `/p/:projectId/c/:workId/{overview\|plan\|changes\|evidence\|context}` | Campaign tabs |
| `/p/:projectId/knowledge[/:noteId]` | Knowledge |
| `/stats?scope=campaign:W-…\|project:…\|all` | Statistics |
| `/inbox` | All pending decisions |
| `/activity` | Processes, children, runtimes, background jobs |
| `/settings/:section` · `/providers[/:providerId]` | Settings and providers |

Query parameters select items: `?cell=<contextId>&turn=14&item=<itemId>`; `?seq=<n>` opens the Overview in replay at that position. Links copied from the UI MUST use these forms.

---

## 6. Application shell and layout

### 6.1 Regions

| Region | Size | Behaviour |
|---|---|---|
| Sidebar | 264 px (resizable 220–360); collapses to a 56 px icon rail | Always present on ≥ 1024 px; overlay below |
| Header | 48 px | Breadcrumb, identity chips, campaign menu |
| Mission strip | 40 px (one line); 64 px when it wraps | Live summary of the campaign; every element is a link |
| Tab bar | 36 px | Campaign views |
| Content | Remaining | Scrolls independently |
| Composer | 88 px minimum, grows to 40 % of the viewport | Floats over the bottom of Thread; docked in other tabs |
| Inspector drawer | 480 px (resizable 380–960) | Overlays content from the right; `Esc` closes; pin turns it into a docked panel (user choice, remembered per tab) |
| Toasts | Bottom-right above the composer | Max 3 stacked; decisions never appear only as toasts |

Breakpoints: **wide** ≥ 1600 px (optional split view: Thread 55 % + Overview 45 %); **standard** 1280–1599; **compact** 1024–1279 (sidebar starts as a rail); **tablet** 768–1023 (sidebar overlay, tabs become a menu); **narrow** < 768 (monitoring and decisions only: Overview summary, Needs you, Thread read-only).

### 6.2 Main window — W-01

```text
┌──────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ ◈ ASTROLABE        ⌘K    │ payments-api ▸ Idempotency keys for POST /payments   W-0042 · a1   S2 ⓘ  Interactive  │
│ + New campaign           │                                                     trusted-local ⚠  ceiling Patch ⋯  │
│──────────────────────────│───────────────────────────────────────────────────────────────────────────────────────│
│ PROJECTS                 │ ● Running · Verify │ I2 · 1/4 verified │ implementing · main · high │ turn 14/40 │    │
│ ▾ payments-api    ● ⎇main│ ctx ▮▮▮▮▯▯ 38% │ types ✓ tests ✗ full ◌ │ 412K / 2.5M tok · $3.10 +? │ ⚑ 1 needs you  │
│    ● Idempotency keys 2m │───────────────────────────────────────────────────────────────────────────────────────│
│    ✓ Retry backoff   1d  │  Thread   Overview   Plan   Changes 4   Evidence •   Context              ⌕  ≡ ▾      │
│    ◐ Refactor router 3d  │───────────────────────────────────────────────────────────────────────────────────────│
│ ▸ web-client             │                                                                                       │
│ ▸ infra-scripts   🔒     │  U1 · You · 10:02                                                                     │
│                          │  Add idempotency-key handling to POST /payments; public API unchanged.                │
│ LIBRARY                  │                                                                                       │
│   ✦ Knowledge        3   │  ─── Opened · snapshot 0 (2 pre-existing changes) · shape S2 — review: item ───       │
│   ▤ Statistics           │                                                                                       │
│   ⚙ Settings             │  ▣ plan · cell-1 · main · 9 turns · done                                     ⌄        │
│                          │    4 increments · 3 acceptance proposals → 2 accepted, 1 rejected                     │
│                          │                                                                                       │
│                          │  ▣ implementing · cell-8 · I2 "thread ctx through handlers" · turn 14/40     ⌃        │
│                          │    13 ▸ look refs handle_user → 6 refs · complete · tier 1                            │
│                          │    14 ▾ "Signature changed; running the accept check."                                │
│                          │       ✎ edit  src/handlers/user.py  +2 −1  c02e→d1e7  syntax ✓               ⤢        │
│                          │       ▶ run   pytest -q -k ctx  W  ✗ 11 passed · 1 failed  2.1 s  #42        ⤢        │
│                          │               FAILED test_cli_ctx — TypeError: handle_cli() missing 'ctx'             │
│                          │       ≡ STATE v15 · +fact v · Next: edit src/cli/main.py handle_cli                   │
│                          │       ⚑ impact · handle_user signature changed; 3 references not inspected            │
│                          │       ⟨ ctx 38% · reserve ok · types ✓ · tests(k ctx) ✗ · known 5 / 2.6K ⟩            │
│──────────────────────────│  ╭───────────────────────────────────────────────────────────────────────────────╮    │
│ ⚑ Needs you          1   │  │ Amend ▾ │ Describe a change to the request…                                   │    │
│ ◷ Activity           2   │  │ ⓘ Becomes U3 and contract v4; the running cell sees it next turn   @  #  ⌘⏎ ■ │    │
│ ● anthropic  ○ openai ↗  │  ╰───────────────────────────────────────────────────────────────────────────────╯    │
└──────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Sidebar

- **Top:** app mark, command palette button (`⌘K`/`Ctrl+K`), "New campaign" (opens the composer in *New campaign* intent for the selected project).
- **Projects:** name, current branch, and one state indicator: `●` a campaign runs, `🔒` locked by another process, `⚠` repository problem. Expanding a project lists campaigns by last activity (pinned first), each with a status glyph (§23.3), a title (first line of `U1`, renamable as Studio metadata) and relative time. "All campaigns" opens the project home.
- **Library:** Knowledge (badge = candidates waiting), Statistics, Settings.
- **Footer:** Needs you (count, ochre when > 0), Activity (running items), provider dots (connected, expiring, login required) with hover details.

R-SHL-01 The sidebar MUST reflect campaign status changes within 500 ms of the corresponding event.
R-SHL-02 A project whose lock is held by another process MUST show the holder (`pid`, start time, harness version from `ProjectLockHeld`) and offer read-only history only if the backend can open it read-only (G-17); otherwise it shows "locked" with no stale data.

### 6.4 Header and mission strip

- **Header:** breadcrumb; `W-…` and `a1` chips (click copies); shape badge (tooltip: selector inputs from `campaign.shape_selected.inputsRef` and the journal line "open: shape …"); mode chip (Interactive/Autonomous); execution-mode chip (`trusted-local ⚠` tooltip: "No sandbox. Effect classes are labels verified after the fact."); ceiling chip; menu (Copy link, Rename, Pin, Export, Open state folder, New campaign from this, Archive).
- **Mission strip** (only for a live or recently ended campaign): status and current phase; increment progress; active role, profile and tier; turn counter; context gauge with the α marker; check summary; budget (tokens and money, "+?" when some usage is unknown); lease countdown when a decision is pending; Needs-you count. Each element opens the view that explains it (Overview, Plan, Context, Evidence, Statistics, Needs you).

R-SHL-03 The strip MUST never display a value it cannot source; missing values render as "—" with a tooltip naming the missing source.

### 6.5 Tabs

Thread (§8) · Overview (§10) · Plan (§11) · Changes (§12, badge = changed files) · Evidence (§13, dot when a required item is red or stale) · Context (§14). Shortcuts `Alt+1…6`. The Overview can also be popped out into its own window (`Shift+Alt+2`) for a second monitor.

### 6.6 Inspector drawer

One generic container for details: tool result, diff of one file, receipt and log, note, invocation, increment, decision history. It keeps a back stack (`Backspace`/`Alt+←`), shows the item id and a deep-link button, and never blocks the composer. Pinning docks it (content reflows) — a user choice, never the default.

---

## 7. The main workflow

### 7.1 End-to-end journey

| Stage | ASTROLABE (source of truth) | The user sees | User can |
|---|---|---|---|
| 0. First run | — | Onboarding checklist: connect a provider, add a repository, confirm profiles (main + helper) | Skip any step; everything is reachable later |
| 1. Open project | `Store.open` takes the ProjectLock; atlas and sniffed commands available | Project home: repository health, sniffed commands, rules-file status, campaigns, knowledge summary | Bind the rules file; start a campaign |
| 2. Compose | — | Composer in *New campaign* intent with options and a preflight line (config valid, provider ready, lock free, N pre-existing changes will be recorded) | Write the request; set mode, budget, ceiling, publication; add hints |
| 3. Open | `Controller.open`: attempt freeze, snapshot 0, contract derivation, reconciliation, lease, shape selection | "Opening…" progress with those steps; then `campaign.opened` and `campaign.shape_selected` boundaries | Cancel before the first dispatch |
| 4. Plan (S1+) | Plan cell; in interactive mode each acceptance proposal is a `resolve` call | Plan cell section in Thread; increments appear in Plan; a **Plan review** decision card | Accept or reject each proposed acceptance item |
| 5. Execute | `campaign.increment_selected` → cells → turns | Thread fills turn by turn; Overview animates; mission strip updates | Watch, amend, answer, approve |
| 6. Verify | Checker, acceptance runs, exit gate, verifier | Check lines, receipts, "completion refused: …" lines, `campaign.increment_closed` | Inspect evidence |
| 7. Review (S2+) | Review cells; `authority.review` for human paths | Review verdict cards; Human review decisions | Sign a verdict |
| 8. Finish | Full suite and quality gates at one stable stamp; campaign review; finish receipt | Finish card with outcome, requirement statuses, not-verified items, attribution, budget | Resume (if resumable), publish, curate knowledge, start next |
| 9. Publish | `publish` walks stages; each is `authority.approve` | Publication panel: ladder, per-stage approvals and results | Approve stages; see `highest authorized stage` |
| 10. Learn | Candidates in `note_queue`; host-driven `Curator.admitWith` | Knowledge inbox | Admit, reject, supersede, roll back |

### 7.2 Campaign display status

The Studio derives one display status from the store (`campaigns.phase`, `campaigns.outcome`), the runtime registry (is a live run attached?) and pending decisions.

```text
 compose ─start─▶ OPENING ──▶ RUNNING(phase) ⇄ NEEDS YOU (overlay: pending decision, lease countdown)
                    │            │
                    │            ├──▶ FINISHING ──▶ COMPLETED
                    │            ├──▶ WAITING FOR INPUT ──resume──▶ OPENING      (resumable)
                    │            ├──▶ BLOCKED (external) ──resume──▶ OPENING     (resumable)
                    │            ├──▶ BUDGET EXHAUSTED   (final → "New campaign from this")
                    │            ├──▶ CANCELLED (final)        FAILED (final)
                    └─error──▶ OPEN FAILED (config, lock, reconciliation, lease fence) — reason shown, fix, retry
 RUNNING ── backend stopped ──▶ INTERRUPTED ──resume──▶ OPENING   (the running cell is recorded Lost, then Resumed)
```

| Display status | Derived from | Glyph |
|---|---|---|
| Opening | Bridge `open` in progress | `◌` rotating |
| Running · *phase* | `phase = Running` + live run; phase from the latest event's `Phase` | `●` accent, soft pulse |
| Needs you | Running + ≥ 1 pending decision | `⚑` ochre overlay |
| Finishing | `phase = Finishing` | `●` accent |
| Completed | `outcome = completed` | `✓` green |
| Waiting for input | `waiting_for_input` | `◐` ochre |
| Waiting for process | `waiting_for_process` (resumable; not produced by the controller today) | `◐` ochre |
| Blocked | `blocked_external` | `⏸` ochre |
| Budget exhausted | `budget_exhausted` | `◔` ochre |
| Cancelled / Failed | `cancelled` / `failed` | `⊘` grey / `✕` red |
| Interrupted | `phase ∈ {Running, Finishing}` without a live run | `⏸` grey |
| Locked | `ProjectLockHeld` | `🔒` grey |

R-CMP-06 `Cancelled` is final in ASTROLABE (not resumable). The cancel confirmation MUST say so and MUST suggest declining a pending question instead when the goal is to pause (declining ends the cell blocked and the campaign `waiting_for_input`, which is resumable). ASTROLABE has no pause or step API.

### 7.3 Interactive versus autonomous

| Situation | Interactive | Autonomous (`AutonomousAuthority` semantics, mirrored by the Studio policy) |
|---|---|---|
| `task.ask` question | Decision card; the cell waits | No answerer: the cell ends blocked → `waiting_for_input`; Studio notifies |
| D-class effect | Approval card | Denied unless the contract allowlists it; a "decided by policy" line is logged |
| Model amendment | Decision card (G-05) | Weakening: rejected; non-weakening: pending unless `acceptNonWeakening` |
| Plan acceptance proposals | Plan review card | Frozen as `model`-origin items without asking |
| Test-integrity flag | Per `integrityApproval` (default `Autonomous`: review cell first, human fallback) | Same |
| Knowledge admission | Candidates wait in the inbox | Policy auto-admits only evidence-backed, scoped `LES`/`PIT` with confidence ≤ 0.6; others wait |
| Publication beyond Patch | Approval per stage | Only when the autonomous predicate holds (low blast radius, easy reversibility, S2+ judge approval, allowlisted stage, no human anchors) |

R-THR-01 In autonomous campaigns every policy decision MUST appear in the Thread as a muted "policy" line with the rule that decided it.

### 7.4 What each shape shows

| UI element | S0 | S1 | S2 | S3 |
|---|---|---|---|---|
| Plan cell section, Plan graph with multiple increments | — | ✓ | ✓ | ✓ |
| Plan review decisions (interactive) | — | ✓ | ✓ | ✓ |
| Probe / review / QA children in Thread and Overview | — | — | ✓ | ✓ |
| Increment and campaign review verdicts | — | — | ✓ | ✓ |
| Worktree lanes, ownership map, integrator and merge queue | — | — | — | ✓ |
| Knowledge proposals during the run | extraction at finish | ✓ | ✓ | ✓ |

Hidden elements are absent, not greyed. The shape badge tooltip explains why the shape was chosen and what it enables.

### 7.5 Resume, reconciliation and lease

1. **Resumable outcome** (`waiting_for_input`, `blocked_external`) or **Interrupted**: the header shows "Resume". The Studio first checks unknown outcomes. If `unknownOutcomeReconciliation = Host` and open intents exist, the **Reconcile** wizard (§15.7) runs before resume (G-11). Resume calls the bridge (`Controller.open` with the same ids, then `run`). A factual answer given while stopped is recorded; an answer that changes requirements is an amendment, which unblocks blocked increments on open.
2. **Lease.** While a decision is pending the lease keeps running. The mission strip shows "lease 23 min". If the lease expires, the next dispatch stops the campaign `blocked_external` (resumable), and a finished campaign can no longer be published once its lease has expired (G-22). The Studio sets the bridge's `leaseDuration` from settings (default 8 h, G-02). A late answer that arrives after the campaign stopped is recorded; the Studio then offers "Resume with this answer" or, with `runtime.autoResumeOnLateAnswer` on, resumes immediately.
3. **Final outcomes** (`completed`, `cancelled`, `failed`, `budget_exhausted`): no resume. "New campaign from this" pre-fills the composer with the original requests, links the new campaign to the old one (Studio metadata) and, in the request annex, lists the unfinished requirements (G-12).

### 7.6 Opening failures

| Failure | Detected by | UI |
|---|---|---|
| Invalid configuration | `InvalidConfig(violations)` / `Config.violations()` / `AiGateAdapter.violations` | Inline list with links to the offending settings fields |
| Project locked | `ProjectLockHeld(lockFile, holder)` | Holder pid, start time, harness version; "Retry" |
| Lease held or expired, unreconciled intents | `GrantRefused` / `LeaseHeld` | Explanation and the Reconcile wizard |
| Provider not authenticated | `auth().status` before start; `ProviderError.Authentication` during the run | "Log in to <provider>" decision; the campaign is blocked on the host, never retried as transport |
| Unsupported repository | `DirtyState` refusals (submodules, sparse checkout), non-root path | Reason and documentation link |

### 7.7 Prototype storyboard (scenario S-02, interactive S2)

The storyboard is the prototype's script: fixture mode (T-05) replays it with a scripted provider through the real adapter, and T-07/T-08 must reproduce every frame from live data.

| Frame | Moment | What the user sees (wireframe) |
|---|---|---|
| F1 | Project home | Repository health, sniffed commands, rules file "untrusted" → bound after review (W-07) |
| F2 | Compose | *New campaign* intent, Interactive, budget 2.5M tokens, ceiling Patch, one `review:` hint; preflight green (§9.2) |
| F3 | Opening | Step list; then boundary "snapshot 0 · 2 pre-existing changes · shape S2 — review: item" (W-01) |
| F4 | Plan | Plan cell section; Plan tab graph fills with four increments; **Plan review** card with three proposals — user accepts two, rejects one (W-03, §15.6) |
| F5 | Execution | Implementing cell on I1; Overview: COMPILER→CELL, ring cycling Model→Read→Edit→Execute→Metadata; Reasoning shows plan cursor and a hypothesis becoming verified (W-02) |
| F6 | Evidence | I1 closes: rail chip ✓, ledger R1 verified, acceptance AC-1 current at the stamp (§13.2) |
| F7 | Effect approval | `pip install …` D-class card with consequences and lease countdown; user approves once (§15.2) |
| F8 | Question | Probe satellite returns; implementing cell asks Q-7 with two options; user answers without changing requirements (§15.3) |
| F9 | Refused completion | Exit gate line "completion refused · AC-4 red"; next turn fixes it; increment closes |
| F10 | Review and finish | Review cell verdict *approve*; campaign review; finish card `completed` with not-verified list and attribution; Changes shows A/R/U files (W-04) |
| F11 | Learn and publish | Knowledge inbox: one LES candidate admitted; "Request publication → Local commit" approval (§12.4) |

---

## 8. The Thread

### 8.1 Purpose

The Thread is the chronological, readable record of one campaign: what the user asked, what each cell did turn by turn, what was verified, and what needs the user. It replaces the "chat" of other tools but reads like one.

### 8.2 Composition

```text
Campaign head      U1 (verbatim request) · annex hints (if any) · opening boundary (snapshot 0, reconciliation, pre-scan, shape)
Cell section ×N    in dispatch order; children nested under the delegation item that created them
  Turn ×M          collapsed rows; the live turn expanded
Boundaries         increment selected/closed · rebuilds · full-suite runs · campaign review · publication
Decisions          inline cards at the point they were requested (also in Needs you)
Amendments         U2, U3… as authority bubbles where they were issued
Finish             finish receipt card
```

### 8.3 Item catalogue

| Item | Source (Appendix A has the full mapping) | Collapsed | Expanded / drawer |
|---|---|---|---|
| Request / amendment `U*` | `Views.contract(work).requests`; `contract.amended` | Authority bubble: author, time, contract version | Diff of contract before/after |
| Opening boundary | `campaign.opened`, journal `boundary` "open: …", `run.reconciled` | One line: snapshot 0, external changes, unknown outcomes, shape | Pre-scan log, reconciliation list |
| Shape selected | `campaign.shape_selected` + journal "open: shape …" | `shape S2 — reason` | Selector inputs |
| Increment selected / closed | `campaign.increment_selected/closed`, `Views.ledger` | `▸ I2 "title"` · `✓ I2 verified (R2)` | Increment drawer |
| Cell section header | `cell.started` (role, increment), `cell.model_requested.profileId`, `cell.ended` | Role icon · role · `cell id` · increment · profile/tier · turns · status | Cell drawer: packet summary, manifest, register history |
| Turn row | `cell.turn_started` … journal `boundary` "turn N status · stamp · STATE vN" | `14 ▸` model gist · tool chips · duration · output tokens | Full turn (§8.5) |
| Model output | journal `call` payload (`Message`, `NativeCall`, `ReasoningRef`) | First line | Markdown text, tool calls with arguments, reasoning chip ("reasoning · opaque · 1.2K tok") |
| Tool call | `cell.tool_called` / `cell.tool_resulted` + journal `result` (refs) | Family icon · op · target · status · class · stamp | Parsed envelope, full captured output from referenced blobs |
| Edit | journal `edit-intent` / `edit-outcome` | Paths · diffstat · versions · syntax | Unified diff; preimage refs (never content); flags |
| Check / receipt | journal `check` (receipt id), `receipts` table | `types ✓ 14 files @d1e7` | Receipt drawer with log |
| Register patch | `cell.register_patched` + `Views.register(context)` | `≡ STATE v15 · +fact v · Next: …` | Register diff (previous → current) |
| Gate / nudge | `cell.gate_fired`, journal `nudge` | `⚑ impact · …` | Rule explanation and suggested action |
| Rebuild | `cell.rebuilt` (reason, generation) | `↻ rebuilt · pressure · generation 2` | Manifest of the new projection |
| Delegation | `delegation.dispatched/collected/rejected` | `⇢ probe "question" · 6/15 turns` | Child cell section (nested), packet |
| Recovery | journal `boundary` from `Recoveries` / `Escalations` (G-03) | `⟲ repair: diagnosis …` | Capsule and outcome |
| Budget | `usage` rows and the contract budget; exhaustion from the campaign outcome or the reserve gate (`budget.*` events once emitted, G-03) | Only exhaustion is a line | Budget drawer |
| Knowledge | `kb.proposed/admitted/invalidated` | `✦ LES-231 proposed` | Note drawer |
| Warning | `warning` | Muted line with kind | Text |
| Decision | Authority bridge (§15) | Decision card | Card + history |
| Finish | `campaign.finished` + finish receipt | Finish card | Evidence tab |

### 8.4 Cell section

```text
▣ implementing · cell-8 · I2 "thread ctx through handlers" · main (high) · turn 14/40 · ● running      ⌃  ⋯
  13 ▸ look refs handle_user → 6 refs · complete · tier 1                                   0.4 s
  14 ▾ …expanded live turn…
▣ review · cell-9 · I2 · main (high) · 4 turns · ✓ approve (confidence 0.8)                           ⌄
```

- Roles have monochrome icons (plan ◇, implementing ▣, probe ⌕, review ⚖, qa ▷, writer ✎, repair ⟲, extractor ✦).
- A completed cell collapses to its header plus a one-line result ("done · 3 files · AC-4 ✓ · 2 receipts · 41K tok"); the current cell stays expanded; the user's expand/collapse choice sticks.

### 8.5 Turn anatomy

- **Collapsed row:** turn number · first line of model text (or "tool calls only") · chips for each tool call in execution order (`look×3`, `edit`, `run ✗`, `state`) · wall time · output tokens.
- **Live turn:** while the model works, a progress line replaces the gist: "main · generating · 1,204 chars · 312 out · 3.4 s" from `cell.model_progress`; "retrying (attempt 2)" when the transport retries. The turn fills when the journal `call` row arrives.
- **Expanded:** model text (Markdown), then the turn's operations grouped by ASTROLABE's execution phases **Read → Edit → Execute → Metadata** (the order the dispatcher ran them, regardless of emission order), then the end-of-turn checker line, gates, and the gauge line.

### 8.6 Tool cards

| Family | Collapsed | Expanded |
|---|---|---|
| `look` (tree, outline, read, find, def, refs, importers, impact, recall, bmap, catalog) | `⌕ read src/router.py:80-96 @a9f1 · 17 lines` / `⌕ find "dispatch" · 12 hits · complete` | Captured output (code rendered with line numbers and version), `complete`/`truncated`/`tier` flags, recall pointer |
| `edit` (anchored, create, delete, rename, revert, transform) | `✎ src/handlers/user.py +2 −1 · c02e→d1e7 · syntax ✓` | Diff; per-file syntax; `touched_outside_scope`; test-integrity kinds; transform receipt (files changed, match count vs expected, inventory, representative and unusual sites) |
| `run` (run, poll, cancel; also `mcp:` and `tool:` programs) | `▶ pytest -q -k ctx · W · ✗ 11 passed 1 failed · 2.1 s` | Argv, cwd, effect class and reclassification, status vocabulary, counts, stamp before/after, changed paths, background handle, full log (ANSI) |
| `verify` (check, tests, acceptance, baseline, review) | `✓ acceptance AC-4 · green @s8` | Receipts, applicability, closure, reuse proof |
| `state` (patch, blocked, retrieval_miss) | `≡ STATE v15 · 3 ops` | Ops list and the register diff |
| `task` (ask, delegate, collect, propose) | `? ask Q-7` · `⇢ delegate probe` · `⇠ collect` · `✚ propose increment_split` | Question and answer, packet, proposal |
| `kb` (search, get, propose, skill) | `✦ search "idempotency" · 3 notes` | Hits with stale labels; note preview |

Envelope flags are rendered on every card: `truncated`, `effects unknown`, `redaction applied`, **`⚠ instruction-shaped content`** (never executed, shown with the cues), `stale @version`.

R-THR-02 A tool card MUST show the result status from the envelope/receipt, never from the model's commentary.
R-THR-03 Output from `look` and `run` MUST be loaded lazily from referenced blobs of kinds `OUTPUT`, `LOG` or `DIFF` only.

### 8.7 Gates and nudges

| Gate | Line (example) | Severity |
|---|---|---|
| Exit (hard) | `⛔ completion refused · AC-4 red @s8 · AC-3 review unsigned · step 3 undisposed` | high |
| Entry | `⚑ entry · no accept: on the plan step — state acceptance or ask one question` | medium |
| Pressure | `⚑ pressure · 66% ≥ α 65% — folding into register, rebuild` | medium |
| Stall | `⚑ stall · 3 turns without progress — re-read plan, zoom out, run the decision probe` | medium |
| Loop | `⚑ loop · identical call twice` | medium |
| Impact | `⚑ impact · Router.dispatch signature changed; 6 references not inspected` | medium |
| Contract touch | `⚑ contract payments-api@7 touched — ADR required in the main line` | high |
| Repeated failure | `⚑ same failure twice — change hypothesis, record dead end or request alternative attempt` | medium |
| Scope | `⚑ scope · edit outside I2 write scope (allowed once)` | medium |
| Test integrity | `⚑ acceptance surface · skip-marker added in tests/test_pay.py — justification required` | high |
| Reserve | `⚑ reserve reached — verify and report; no new edits` | high |
| Turn budget | `⚑ 80% of turns — reach a coherent boundary` | low |

### 8.8 Filters, search and navigation

- Filters: All · Conversation (requests, amendments, model text) · Tools · Checks · Decisions · Problems (red, refused, warnings) · a role filter.
- Search (`Ctrl+F`): loaded items client-side; "Search whole campaign" calls the backend (`Journal.search`, shows `complete`).
- Jump: `[` / `]` previous/next cell; `J`/`K` next/previous turn; `G` then `L` jumps to live; "↓ Live" pill when scrolled up during a run.
- Every item has "Copy link" and "Open in drawer".

### 8.9 Performance

R-THR-04 The Thread MUST stay responsive (≥ 55 fps scroll, < 100 ms expand) for campaigns with 20,000 items, using windowed rendering with variable heights and lazy loading of item bodies.
R-THR-05 Live updates MUST be batched per animation frame; at most one layout pass per frame.

---

## 9. The Composer

### 9.1 Intents

The composer always shows what the text will become. The intent follows context and can be switched when more than one applies.

| Intent | Available when | Backend action | Label under the field |
|---|---|---|---|
| **New campaign** | No campaign runs in the project, or the user chose "New campaign" | `campaign.start` → bridge `open` + `run` | "Starts campaign W-… in payments-api (mode, budget, ceiling)" |
| **Amend** | A campaign is live or resumable | `campaign.amend` → `contracts.amendByUser(work, text)` | "Becomes U3 and contract v4; the running cell sees it next turn" |
| **Answer Q-7** | A question is pending for this campaign | `decision.reply` with `Answer(questionId, contractRevision, text, chosenOption, changesRequirements)` | "Answers Q-7 (contract v3). Changes requirements: off — recorded as evidence" |
| **Resume** | Campaign is resumable or interrupted | `campaign.resume` (optionally with a preceding amendment) | "Resumes W-0042 at contract v4" |

Disabled state, with the reason, when the project is locked or the campaign is final.

### 9.2 Anatomy

```text
╭─────────────────────────────────────────────────────────────────────────────────────────────╮
│ New campaign ▾ │ Add idempotency-key handling to POST /payments; public API unchanged.      │
│                │ @src/pay/  #CON-payments-api                                               │
│ Interactive ▾  Budget 2.5M tok · $20 ▾  Ceiling Patch ▾  Publish: none ▾   + Hints ▾        │
│ ⓘ Snapshot 0 will record 2 pre-existing changes · profiles ok · lock free        ⌘⏎ Start   │
╰─────────────────────────────────────────────────────────────────────────────────────────────╯
```

- **Mentions:** `@path` from the project atlas file list; `#R1`, `#AC-2`, `#rcpt-19`, `#57`, `#CON-…` references rendered as chips and inserted as plain text (the request is stored verbatim).
- **Options (New campaign):** mode; budget (`CampaignPolicy.tokens`, optional `cost`); ceiling; publication request (`through`, `remote`, `mergeTarget`, `message`); "resume expected". Mode and ceiling are configuration-level: the backend selects or creates the runtime for that configuration (§26.4).
- **Hints (G-06):** acceptance items (`run`/`check`/`review`), constraints, exclusions, write scope, protected paths. They are appended to the request as a clearly delimited annex that the plan cell reads; the UI labels them "hints — the harness decides". In interactive S1+ campaigns, the plan cell's acceptance proposals come back as Plan review decisions, which is where hints become contract items.

```text
<request text>

--- astrolabe-studio annex v1 · hints, not contract items ---
acceptance:
  - run: pytest tests/payments -q
  - check: no public signature change in src/api/
  - review: retry semantics cannot duplicate side effects
constraints: [do not change the refund flow]
exclusions: [refund flow, billing UI]
scope: {write: [src/pay/, tests/payments/], protected: [migrations/]}
```

### 9.3 Behaviour

R-CMP-01 `Ctrl/⌘+Enter` submits; `Enter` inserts a newline (configurable). Drafts persist per campaign and intent.
R-CMP-02 Amend and Answer MUST show the contract revision they bind to; if the revision changes before submission, the composer shows "Contract moved to v5 — review" and blocks until the user confirms (mirrors `Replies.check`).
R-CMP-03 Slash commands run UI actions and are never sent as text: `/new`, `/amend`, `/answer`, `/resume`, `/cancel`, `/publish`, `/reconcile`, `/overview`, `/evidence`, `/kb`, `/settings`, `/stats`.
R-CMP-04 The stop button (■) cancels the campaign after a confirmation stating that cancellation is final and effects already made remain (§7.2).
R-CMP-05 Preflight runs as the user types (debounced): configuration validity, provider authentication, lock state and dirty-state preview; blocking problems disable Start and link to the fix.
See §7.2 for R-CMP-06 (cancellation semantics).

---

## 10. Agent Overview — the Orrery

### 10.1 Purpose

The Overview answers five questions in three seconds: **Where is the campaign? Which agent is active and what is it doing this turn? Why — what is its current plan and hypothesis? What is blocked or waiting for me? Is it healthy — context, reserve, checks, budget?**

It is ASTROLABE-specific: it draws the harness's real components and moves only when real events arrive. An orrery is a mechanical model of moving bodies around a centre; here the centre is the active cell and the bodies are the controller, compiler, verifier, stores and the human.

Design rules:

1. Only events move things. An idle campaign is still.
2. The topology is fixed: nodes never jump. Users learn the map once.
3. One accent marks the active path. Status colours appear only as small marks.
4. Deterministic machinery (controller, compiler, router, verifier) is drawn as squared, outlined blocks; model-driven cells as rounded capsules with a turn ring; stores with a double top rule; the human as a circle (P-09).
5. Every animated element is clickable and opens the item that caused it.

### 10.2 Layout — W-02

```text
┌─ Overview · W-0042 · a1 · contract v3 · S2 ──────────────────────────────────────────── ● Live ▾  ⤢ pop out ──┐
│ OPEN ✓ ─ PRE-SCAN ✓ ─ SHAPE S2 ✓ ─ PLAN ✓ ─ ✓I1 ─ ●I2 ─ ○I3 ─ ○I4 ─ FINISHING ○ ─ FINISH ○ ─ PUBLISH –        │
├──────────────────────────────────────────────────────────────────────┬────────────────────────────────────────┤
│                                  ( YOU )  ⚑1                         │ ACTIVE AGENT                           │
│                                     ┆                                │ ▣ implementing · cell-8                │
│   ┌────────┐       ┌────────────┐   ┆   ┌────────────┐               │   I2 "thread ctx through handlers"     │
│   │ ROUTER │──────▶│ CONTROLLER │───┼──▶│  COMPILER  │               │   main · claude-… · high · effort M    │
│   └────────┘       └─────┬──────┘   ┆   └─────┬──────┘               │   turn 14 / 40  ▰▰▰▰▱▱▱▱▱▱             │
│                    ▲     │ result   ┆         │ [S][R][K]            │   now  ▶ run pytest -q -k ctx · 2.1 s  │
│   ╭──────╮         │     ▼          ┆         ▼                      │ CONTEXT  S R K ▮▮▮ T ▮▮▮▮ A ▮ │α 38%   │
│   │  KB  │◀───────▶╭─────────────────────────────────╮  ◀──▶ ╭───────╮│ RESERVE  verify ok · persist ok       │
│   ╰──────╯         │  ◖ Model ◗ Read ◖ Edit ◗ Exec ◖ │       │ MODEL ││ CHECKS types ✓  tests(k ctx) ✗  full ◌│
│                    │   CELL · implementing · t14      │       │ main  ││ BUDGET   412K / 2.5M tok · $3.10 +?  │
│                    ╰──┬──────────┬──────────────┬─────╯       ╰───────╯│ GATES    ⚑ impact (1 in this cell)   │
│                       │ look     │ edit         │ run / verify         │ WAITING  —                           │
│                  ╭────▼───╮ ╭────▼──────╮ ┌─────▼──────┐   ╭──────────╮│ CHILDREN                             │
│                  │ ATLAS  │ │ WORKSPACE │ │  VERIFIER  │──▶│ EVIDENCE ││ ⌕ probe-3 "does CLI build handlers?" │
│                  ╰────────╯ ╰───────────╯ └────────────┘   ╰──────────╯│   6 / 15 turns · ● running           │
│        ◌ probe-3 (satellite)                          turn history ▁▃▅▂▇▃▅▆▂▃▅▇ │                             │
├───────────────────────────────────────────────┬──────────────────────┴────────────────────────────────────────┤
│ REASONING · STATE v15 · 1,020 / 1,200 tok      │ ACTIVITY                                        filter ▾     │
│ Plan   ✓1 locate dispatch                 #12  │ 12:04:31  run   pytest -q -k ctx         ✗ 11/1     2.1 s    │
│        ▶2 pass ctx into handlers   AC-4 → R2   │ 12:04:29  edit  src/handlers/user.py     +2 −1               │
│        ○3 update 3 call sites        after 2   │ 12:04:20  look  refs handle_user          6 refs             │
│        ✕4 rename Router — out of scope (C1)    │ 12:04:02  model main · 3 calls · 1.8K out                    │
│ Facts  ✓ Router.dispatch(req, ctx)  @a9f1 #17  │ 12:03:40  check types(touched) ✓ 14 files @c02e              │
│        ◇ handlers are keyword-only  ⚠ in Next  │ 12:03:12  gate  impact · 3 references not inspected          │
│        ✕ popleft is atomic (refuted #31)       │ …                                                            │
│ Decide D1 ctx explicit, not contextvar         │                                                              │
│ Open   Q1 does CLI build handlers? (trip: src/cli/)                                                           │
│ Next   edit src/cli/main.py handle_cli signature, then run accept                                             │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Responsive behaviour: on standard widths Reasoning and Activity share one tabbed area; on narrow widths the flow canvas is replaced by the Active-agent card, the rail and Reasoning.

### 10.3 Campaign rail

| Stage | Source | States |
|---|---|---|
| OPEN | bridge open steps, `campaign.opened` | pending · active · done · failed |
| PRE-SCAN | journal `boundary` "open: impact …" | done |
| SHAPE | `campaign.shape_selected` | done (shows S0–S3) |
| PLAN (S1+) | plan cell `cell.started/ended`, `packets.kind = plan` | active · done · refused |
| Increments | `CampaignState.graph` (`campaigns.body`), `campaign.increment_selected/closed`, `Views.ledger` | `○` pending · `●` in progress · `✓` verified · `⏸` blocked · `⊘` cancelled (struck) · `↺` regression obligation; frontier outlined |
| FINISHING | `phase = Finishing`, journal "full suite (…)", campaign review packet | active · done · not certified |
| FINISH | `campaign.finished(outcome)` | outcome glyph |
| PUBLISH | journal `boundary` publication rows, `PublicationRun` | per stage |

Long campaigns compress verified chips (`✓×6`). Hover shows title, acceptance ids, cells and sizing; click opens the increment in the Plan drawer.

### 10.4 Flow canvas: nodes and edges

Nodes (fixed positions on a 12 × 8 grid, SVG `viewBox 0 0 1200 640`):

| Node | Shape | Represents | Live label |
|---|---|---|---|
| YOU | circle | Human authority | pending decision count; lease countdown when waiting |
| CONTROLLER | squared | Campaign controller | phase · increment |
| ROUTER | squared | Function → tier → profile | last profile and tier |
| COMPILER | squared | Context compiler | `[K]` tokens of the last compile; rebuild reason |
| CELL | capsule + ring | Active main-line cell | role · increment · turn |
| MODEL | capsule (external) | Provider profile | profile · output tokens · retries |
| ATLAS | store | Repository navigation (`look`) | reads this turn; stale drops |
| WORKSPACE | store | Workspace and shadow ref | current stamp (short) |
| VERIFIER | squared | Verification scheduler and exit gate | last check outcome |
| EVIDENCE | store | Receipts, journal, ledger | receipts count |
| KB | store | Knowledge base and curator | injected / proposed notes |
| Satellites | small capsules | Child cells (probe, review, QA, writer, repair) | kind · turns · status |
| INTEGRATOR (S3 only) | squared | Integrator and merge queue | queue length |

Edges: YOU⇄CONTROLLER (amendments, resolutions, publication grants), CELL⇢YOU (in-cell questions and approvals, dashed while pending), ROUTER→CONTROLLER, CONTROLLER→COMPILER→CELL, CELL⇄MODEL, CELL⇄ATLAS, CELL→WORKSPACE, WORKSPACE→VERIFIER (stamp moved), CELL⇄VERIFIER, VERIFIER→EVIDENCE, CELL⇄KB, KB→COMPILER (injection), CELL→CONTROLLER (cell result), CONTROLLER→EVIDENCE (ledger), CELL⇄satellites, satellites→INTEGRATOR→WORKSPACE (S3).

### 10.5 Event → motion mapping (summary; Appendix A is complete)

| Event / derived item | Motion |
|---|---|
| `campaign.increment_selected` | CONTROLLER→COMPILER particle "I2"; rail chip becomes active |
| `cell.started` | COMPILER→CELL particle "[K] 4.1K"; CELL relabels; ring resets |
| `cell.turn_started` | turn counter advances; ring arms "Model" |
| `cell.model_requested` | ROUTER flashes the profile; CELL→MODEL particle |
| `cell.model_progress` (`output`) | MODEL→CELL edge shimmer with a live character/token counter |
| `cell.model_progress` (`retrying`) | MODEL gets an ochre ring and "retry n" |
| `cell.model_responded` | MODEL→CELL particle; usage tick in the Active-agent card |
| `cell.tool_called` (look / edit / run·verify / state·task·kb) | particle CELL→ATLAS / →WORKSPACE / →VERIFIER / ring "Metadata"; ring segment Read / Edit / Execute / Metadata lights |
| `cell.tool_resulted` | return particle; green when the parsed status is passed/ok, red when failed/refused/denied, neutral otherwise |
| journal `check` row | VERIFIER→EVIDENCE particle with the receipt id |
| `cell.gate_fired` | flag badge on CELL (exit gate: also on VERIFIER) |
| `cell.register_patched` | Reasoning lines that changed highlight |
| `cell.workset_changed` | ATLAS shows "−n stale" |
| `cell.rebuilt` | CELL ring folds and re-forms; COMPILER→CELL particle "rebuild · reason" |
| `cell.ended` | CELL→CONTROLLER particle "done / partial / blocked"; ring completes |
| `campaign.increment_closed` | CONTROLLER→EVIDENCE "ledger R2 ✓"; rail chip ✓ |
| `delegation.dispatched / collected / rejected` | satellite appears / returns a particle / turns red and fades |
| `ask.question`, pending `approve`/`review` | CELL⇢YOU dashed ochre; YOU pulses; Active-agent card "Waiting for you" |
| `ask.answered`, decision replied | YOU→CELL particle |
| `contract.amended` | YOU→CONTROLLER particle "U3 · v4" |
| `kb.proposed` / `kb.admitted` | CELL→KB "LES-231?" / KB check flash |
| Budget exhaustion (outcome or reserve gate; `budget.exhausted` once emitted), `warning` | red / ochre mark on the related node |
| `campaign.finished` | all nodes settle; rail FINISH shows the outcome |

### 10.6 Turn ring

The CELL capsule carries a ring of five segments in ASTROLABE's turn order: **Model → Read → Edit → Execute → Metadata**. The dispatcher's phase on `cell.tool_called` (`Locate`, `Edit`, `Verify`, `Understand`) selects the segment. Segments that ran this turn stay softly filled, so the ring shows the *shape* of the turn (reading, changing, verifying). Two thin arcs frame it: the outer arc is turns used (`turn/turnsMax`, nudge mark at 80 %), the inner arc is context use against the α threshold. At turn end the ring is pushed into a **turn-history strip** (last 12 turns as small bars), which shows the cell's rhythm at a glance.

### 10.7 Active-agent card

Role, cell id, increment title; profile, model, tier, effort; turn counter; current operation and elapsed time; context stack `[S][R][K][T][A]` against α (sizes from the cell manifest, `cell.model_requested.estimatedTokens` and `anchorTokens`); reserve state (from the gauge line); latest outcome per check; campaign budget (tokens, money with unknown share); gates fired in this cell; waiting-for (decision and lease countdown); children with kind, question, turns and status.

### 10.8 Reasoning panel (the working register)

Source: `Views.register(contextId).latest` refreshed on `cell.register_patched`; history from `register_versions`.

| Register section | Rendering |
|---|---|
| Constraints (inferred) | Muted chips |
| Plan | `✓` done (evidence link), `▶` cursor, `○` pending (with `after:`), `✕` cancelled with reason; `accept:` chips link to acceptance items |
| Facts | `◇` hypothesis (`h`), `✓` verified (`v`, evidence `#id`, anchor `path:line@version`), `✕` refuted (`x`); `stale @c02e` tag rendered by the harness |
| Dead ends | Text · scope · reopen condition |
| Decisions | `D1` text · because · rejected · probe |
| Open | Question · trip condition · needs |
| Focus / Amendments / Next | Focus directory · pending amendment proposals · the single Next line, emphasised |

Transitions: new lines fade in (180 ms); a hypothesis that becomes verified morphs its glyph with a brief underline; a refuted fact is struck through; the cursor glides between steps. No simulated typing. A size meter shows the register against its 1,200-token cap. A version slider rewinds the register ("how did its thinking evolve"). Provider reasoning, when present, appears only as "reasoning · opaque · n tokens" (P-06).

### 10.9 Activity ticker

The last 50 normalized items (time, kind, target, result, duration), filterable, each linked to the Thread item.

### 10.10 Replay

Every normalized item the Studio stores has a campaign sequence number (§27). Replay runs the same pure reducer from the nearest snapshot to the chosen position, so a replay looks exactly like the live view did. Controls: scrubber with markers (cells, gates, decisions, failures), speeds 1×/4×/16×, "next decision / gate / failure", "Live".

### 10.11 Motion specification

| Element | Specification |
|---|---|
| Particle | 6 px dot, travel 700 ms ease-in-out; ≤ 6 concurrent per edge; excess coalesced into an edge counter "×12" within 100 ms windows |
| Node activation | 160 ms in; decays over 1,200 ms |
| Waiting pulse | 1.6 s period, ±30 % opacity; only on YOU and a waiting MODEL |
| Ring segment | 180 ms |
| Rail chip | 200 ms crossfade |
| Motion setting | Full · Calm (particles only on MODEL and VERIFIER edges, no glow) · Off |
| Reduced motion (`prefers-reduced-motion`) | Behaves as Off: static edge highlight for 1 s, instant state changes |

### 10.12 Requirements

R-OVR-01 Every visual change MUST be caused by an event or derived item; no idle animation.
R-OVR-02 Node positions MUST be fixed; satellites use reserved slots (max 3 visible + "+n").
R-OVR-03 The reducer MUST be pure and shared by live and replay modes; a replayed position MUST render identically to the live render at that sequence number.
R-OVR-04 Clicking any node, edge label, particle, ring segment or register line MUST open the causing item.
R-OVR-05 The animation loop MUST run outside Angular change detection (`requestAnimationFrame`) and stay ≤ 3 % CPU idle and ≤ 15 % at 50 events/s on a mid-range laptop.
R-OVR-06 The Overview MUST work in a separate window with its own WebSocket session on the same topic; selection is synchronized across windows through `BroadcastChannel`.
R-OVR-07 When no campaign is live, the Overview shows the last campaign's final state with its outcome and a Replay action.
R-OVR-08 Colour is never the only carrier of state: every state also has a glyph or text.

---

## 11. Plan & Contract

### 11.1 Layout — W-03

```text
┌─ Plan ─ Contract v3 ▾ (compare v2) ──────────────────────────────┬─ Requirement graph ─ group by requirement ☐ ─ fit ⤢ ───┐
│ REQUESTS                                                         │                                                        │
│ U1 10:02 You  Add idempotency-key handling to POST /payments…    │   ┌──────────────┐     ┌──────────────┐                │
│ U2 11:40 You  Also cover the retry path.                         │   │✓ I1 store key│────▶│● I2 thread   │──┐             │
│ REQUIREMENTS                                                     │   │ AC-1 · 1 cell│     │ ctx · AC-4   │  │             │
│ R1 ✓ key stored and checked per merchant      AC-1 AC-4   U1     │   └──────────────┘     │ 2 cells · 31t│  ▼             │
│ R2 ● retry path cannot duplicate effects      AC-3        U2     │                        └──────────────┘ ┌────────────┐ │
│ ACCEPTANCE                                                       │   ┌──────────────┐                      │○ I4 retry  │ │
│ AC-1 ▶ run    pytest tests/payments -q    user   rcpt-19 @s57 ✓  │   │○ I3 3 call   │─────────────────────▶│ AC-3 review│ │
│ AC-2 ☑ check  no public signature change  user   #44 accepted    │   │ sites · AC-1 │                      └────────────┘ │
│ AC-3 ⚖ review retry semantics…            user   unsigned        │   └──────────────┘   frontier: I3 (outlined)           │
│ AC-4 ▶ run    pytest -k idempot   model·strengthens R1  stale ◌  │                                                        │
│ CONSTRAINTS   C1 do not change the refund flow (user) · C2 …     │ LEDGER  R1 verified · rcpt-19 · stamp valid            │
│ EXCLUSIONS    refund flow · billing UI                           │         R2 in progress                                 │
│ SCOPE         write src/pay/ tests/payments/ · protected …       │                                                        │
│ BUDGET        2.5M tok (412K used) · 12 cells · 40 turns         │                                                        │
│ AUTHORIZATION ceiling Patch · D-class ask · local-test-only      │                                                        │
│ AMENDMENTS    AM-3 pending · model · weakening ⚠   [Review]      │                                                        │
└──────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### 11.2 Contract panel

Data: `Views.contract(work)` (contract versions, requests, requirements, acceptance, constraints, amendments) and `Views.ledger(work)`.

- **Versions:** selector over `contracts`; "compare" shows a structured diff (added/removed/changed items, who amended and why).
- **Requirements:** id, text, ledger status, acceptance ids, dependencies, authority reference (`U*`).
- **Acceptance:** kind icon (▶ `run` · ☑ `check` · ⚖ `review`), criterion, **origin chip** (`user` · `harness` · `model · strengthens R1` · `amended@v3`), obligation version, and the evidence state: `run` → last receipt, stamp and currency; `check` → evidence reference and assessment; `review` → signer or "unsigned".
- **Constraints and exclusions** with their authority; **scope** (write and protected paths, plus the built-in protected lists read-only); **budget** with spent and remaining (derived: contract budget minus priced usage); **authorization** (ceiling, D-class policy, capability set, allowlist); **risk** (blast radius, reversibility, contract touch); **contracts touched** (CON notes).
- **Amendments:** pending (proposer, cell, change, reason, **weakening** flag) and resolved history.

R-PLN-01 Requirement status MUST come from the ledger only; the model's register ticks never change it.
R-PLN-02 A weakening proposal MUST be visually distinct and MUST require an explicit typed confirmation to accept.

### 11.3 Requirement graph

- Layered left-to-right layout (ELK) of increments; card: id, title, status glyph, acceptance chips, cells and turns, write-scope size. Edges are `depends_on`. The **ready frontier** is outlined; regression obligations carry `↺`; cancelled increments are dashed with their reason.
- Selecting an increment opens the drawer: requirements, acceptance with receipts, write scope, expected files, risk, `produces` (artifact or resolved uncertainty), cells (links), sizing (turns, continuations, rebuilds), refactor-mode marker (`red_ok_until`).
- Plan artifacts from the plan packet (`packets.kind = plan`): decision packets, ADR candidates, shape suggestion.
- S3: ownership map (paths → increment) and serialized claims.

### 11.4 Resolving amendments (G-05)

Three kinds of `resolve` arrive through the bridge (G-21 classification):

| Kind | Recognised by | UI |
|---|---|---|
| Plan acceptance proposal | `reason` starts with "plan proposal" | Plan review card: one row per proposed item (`add acceptance AC-x for R1: criterion`), Accept / Reject, "Accept all remaining" |
| Knowledge admission | `reason` = "knowledge admission" (initiated by the Studio's own `Curator.admitWith` call) | Knowledge inbox row |
| Contract amendment | anything else (`task.propose(amendment)` by a cell, or a user proposal) | Amendment card with a **ContractPatch editor** |

The ContractPatch editor offers typed edits matching the proposal: change a `run` command or scope, change `check`/`review` text, remove an item (weakening), add a constraint or exclusion, change write/protected paths, change budget numbers. It previews the contract diff `vN → vN+1`. "Accept" sends the patch; the bridge applies it as the `apply` function of `Contracts.resolve`. "Reject" and "Leave pending" need no patch.

---

## 12. Changes

### 12.1 Sources

| Data | Source |
|---|---|
| Snapshots per mutating turn | Shadow ref `refs/astrolabe/<work>/<attempt>/<workspace>/head` (`ShadowRef.records()`: turn, commit, manifest, stamp); turn 0 is the initial dirty state |
| Diffs | Read-only `git diff` between snapshot commits (never touching user refs, index or stash) |
| Attribution | Finish receipt `changes` split (`agent`, `by_run`, `pre_existing_user_changes`, unattributed) when available; during the run: journal `edit-outcome` paths (agent), `run` changed paths (by run), snapshot 0 entries (pre-existing) |
| Edit history | journal `edit-intent` / `edit-outcome` with edit aliases, `why`, preimage digests (never contents) |
| Transforms | Transform diff receipts (files, hunks, match count vs expected, inventory, sites, diff blob) |
| Flags | Test-integrity kinds, scope warnings, rejected edits to protected paths |

### 12.2 Layout — W-04

```text
┌─ Changes · compare  turn 0 (snapshot 0) ◀────────●──────▶ turn 38 (current)   unified ▾   agent ☑ run ☑ pre-existing ☐    ┐
│ FILES (6)                         │ src/handlers/user.py                                        A · +2 −1 · c02e→d1e7     │
│ A  src/handlers/user.py   +2 −1   │  40   def handle_user(req):                                                           │
│ A  src/cli/main.py        +5 −2   │  40 + def handle_user(req, ctx):                                                      │
│ A  tests/payments/test_…  +31     │  41       user = load(req.user_id)                                                    │
│ R  src/pay/schema.py      +1 −1   │  …                                                                                    │
│    (by run #39 ruff format)       │ ─ edits touching this file ─────────────────────────────────────────────────────────  │
│ U  README.md              +3      │  #41 turn 14 "accept ctx" · I2 · syntax ✓                                             │
│    pre-existing · untouched       │ ─ flags ────────────────────────────────────────────────────────────────────────────  │
│ ⚑ tests/payments/test_retry.py    │  none                                                                                 │
│    skip-marker added (justified)  │                                                                                       │
├───────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────┤
│ PUBLICATION  Patch ✓ ─ Local commit ○ ─ Push ○ ─ Merge – ─ Deploy –      ceiling: Patch   highest authorized: Patch       │
│ [Export .patch]  [Request publication…]  (needs ceiling ≥ Local commit — Settings › Autonomy; applies to new campaigns)   │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- File list with attribution letters: **A** agent, **R** by run (formatter, generator), **U** pre-existing user change, **?** unattributed; diffstat; flags.
- Diff viewer: unified or split, syntax-highlighted, word-level highlights, large-file virtualization.
- **Turn slider** compares any two snapshots (default 0 ↔ current). Selecting a Thread edit jumps here with that turn pair.
- Per-file "edits touching this file" list with links to the Thread.

### 12.3 Revert (G-20)

ASTROLABE reverts through its own guarded operations (`edit(revert: "#id" | "turn:N")`). While a campaign is live the Studio offers **"Ask the agent to revert"**, which pre-fills an amendment ("Revert edit #41 in src/handlers/user.py because …"). A direct restore from the Studio is out of scope until an idle-only, dirty-state-guarded host API exists. Pre-existing user changes are never offered for revert (P-14).

### 12.4 Publication

- The ladder shows each stage, the configured ceiling, the **highest authorized stage** reached, and refusals with their reason (`AboveStageCeiling`, `UnverifiedCandidate`, `StageOutOfOrder`, `UserBranch`, human anchors: `interface-contract`, `data-migration`, `production-deploy`, `new-network-access`, `ceiling-elevation`).
- "Request publication…" opens the `PublicationRequest` form: `through` (Local commit · Push · Merge · Deploy), `remote`, `mergeTarget`, `deployTarget`, commit message. Each stage then arrives as an approval decision (§15.5). Local commit writes `refs/heads/astrolabe/<work>/<attempt>` — never the user's branch.
- "Export .patch" produces a patch from snapshot 0 to the final snapshot, agent changes only by default.
- Deploy needs a host `Deployer`; the Studio ships none in v1, so the Deploy stage is shown as unavailable (ASTROLABE refuses it without one).
- After a campaign finishes, the panel shows the publication window with the lease countdown (G-22); once the lease has expired it explains that this campaign can no longer be published and offers "New campaign from this".

R-CHG-01 The Studio MUST never run a git command that writes to refs, index, stash or the working tree; all git access from the backend is read-only (§31.5).
R-CHG-02 The label "delivered" MUST NOT appear for a patch; the UI uses "highest authorized stage".

---

## 13. Evidence

### 13.1 Layout

Segmented views: **Acceptance** · **Checks** · **Receipts** · **Reviews** · **Integrity** · **Finish receipt**.

### 13.2 Acceptance

Requirements with their acceptance items (compact matrix toggle for many items):

```text
R1 ✓ verified  key stored and checked per merchant                                   ledger: rcpt-19 · stamp valid
   AC-1 ▶ pytest tests/payments -q         user                green  rcpt-19 @s57 · current ✓
   AC-4 ▶ pytest -k idempot                model·strengthens   green  rcpt-22 @s55 · stale ◌ (closure moved)
R2 ● in progress  retry path cannot duplicate side effects
   AC-3 ⚖ retry semantics cannot duplicate side effects   user   unsigned → review cell requested
```

- `run` items: outcome, stamp, **currency** (`current` / `stale` / `unknown`), receipt link.
- `check` items: evidence reference and whether its assessment was accepted.
- `review` items: signer and verdict, or "unsigned".
- Regression obligations flagged; pre-existing failures that match the baseline marked "pre-existing (unchanged)".

### 13.3 Checks by layer

| Layer | Shown |
|---|---|
| L0 syntax, types, lint | End-of-turn checker lines with Δ and absolute counts and stamp |
| L1 unit / blast / acceptance runs | Test counts, failing tests, receipts |
| L2 integration, full suite, quality gates, combined-tree (S3) | Receipts; "final gates need a stable stamp" failures list the moved paths |
| L3 product use (QA cell) | Receipts and cases with artifacts |
| L4 measurement | Measurement artifacts (workload, environment, variability) |
| L5 independent review | Verdicts |

A stamp timeline (s0 … sN) shows, per check, a dot per receipt so staleness is visible over time.

### 13.4 Receipts

Table: receipt id, check, outcome (`passed · failed · timeout · infra_error · inconclusive · not_run · unavailable · denied · unknown_outcome`), parsed counts, stamp before/after, verifier version, environment, input closure, reuse proof. Drawer: command, cwd, limits, tested inputs stability, raw log (ANSI viewer with search), shaped view.

### 13.5 Reviews

Verdict cards for increment and campaign scope: outcome (`approve · revise · reject · insufficient_evidence · escalate`), confidence, signer (judge cell or human), findings (severity, `path:line@hash`, issue, suggested fix, kind), coverage (files, ranges, unread), contract violations, missing criterion. Findings link into the diff.

### 13.6 Integrity

Test-integrity flags: path, surface, kind (`deleted-test`, `weakened-assertion`, `skip-marker`, `snapshot-update`, `check-config`, `acceptance-command`, `unclassified-weakening-risk`, `additions-only`), the worker's justification, the **original obligation** beside the change, and the resolving verdict. Scope-guard refusals and warnings.

### 13.7 Finish receipt

Rendered from the `PACKET` blob referenced by `campaign.finished.finishReceiptRef`, falling back to `exports/<work>/finish-receipt.json` (G-04): requirements with status and blockers; acceptance with kind, status, stamp, currency and logs; changes split by source; acceptance surface modified with reasons; checks run with verifier version and environment; **not verified**; dead ends, decisions, ADR candidates, open items, pending amendments; routing decisions; budget by cache class and helper share; memory candidates; **highest authorized stage**.

R-EVD-01 A green mark MUST mean "current receipt at the current stamp" (or a recorded reuse proof). Historical green on a moved stamp is shown as stale.
R-EVD-02 `inconclusive`, `not_run` and `unavailable` MUST never be rendered as passed.

---

## 14. Context Inspector

Developer X-ray of what the model saw. Default target: the current cell; any cell can be selected.

| Panel | Source | Shows |
|---|---|---|
| Context stack | cell manifest (`manifests` via `cell.ended.manifestRef`), `cell.model_requested` (`estimatedTokens`, `anchorTokens`), profile context limit | `[S][R][K][T][A]` bar per request with α threshold and cache breakpoints |
| Manifest | `manifests` row | Selected items with reasons, omissions with reasons, budget arithmetic, boundary reason, pre-compilation hit/miss |
| Knowledge injected | journal `boundary` "kb injected: …" and injection logs | Notes, scores, mandatory vs ranked |
| Workset | `Views.workset(context)` | Exported `(path, range, version)`; KNOWN vs NOT SEEN; stale drops from `cell.workset_changed` |
| Register history | `register_versions` | Version list and diffs |
| Rebuilds | `cell.rebuilt` | Reason (pressure, resume, role switch, alternative attempt), generation |
| Invocations | `usage` rows + Studio provider telemetry (§26.7) | Per call: profile, uncached input, cache read, cache write (5 m / 1 h), output, money (or unknown), warm/cold, latency, time to first output, retries, warnings, provider request id |

R-CTX-01 The inspector MUST label all sizes as estimates or provider-reported, per their source.

---

## 15. Decisions — "Needs you"

### 15.1 Decision kinds

| Kind | ASTROLABE source | Reply | If unanswered |
|---|---|---|---|
| Question | `Authority.ask(Question)` from `task.ask` or `reassessBlocked` | `Answer(questionId, contractRevision, text, chosenOption?, changesRequirements)` or decline (`null`) | Cell waits (lease keeps running); decline ⇒ blocked ⇒ `waiting_for_input` |
| Effect approval (D-class) | `Authority.approve(DClassRequest)` from `Run` | `Decision(requestId, contractRevision, approved, reason)` | Cell waits; deny ⇒ refused with reason |
| Publication stage | `Authority.approve` with action `publish.<stage>` | `Decision` | Stage not published |
| Plan acceptance | `Authority.resolve` (reason "plan proposal …") | `Resolution(Accepted \| Rejected \| Pending)` | Stays pending |
| Contract amendment | `Contracts.resolve` via the bridge | `Resolution` + ContractPatch when accepted | Stays pending |
| Human review | `Authority.review(ReviewRequest)` (integrity flag, `review:` item, campaign review fallback) | `Verdict` or `null` | Review unavailable ⇒ cell/campaign blocked |
| Knowledge admission | Studio-initiated `Curator.admitWith` → `resolve` | `Resolution` per queue entry | Stays queued |
| Reconcile unknown outcomes | Studio-initiated before resume (`IntentJournal.reconcile`) | Evidence text per intent | Resume stays fenced |
| Rules file binding | Studio-initiated from discovery | Bind (path, digest, provenance) or ignore | File remains data |
| Provider login | `auth().status`, `ProviderError.Authentication`, `CredentialEvent.RefreshFailed` | Login flow (§20.2) | Campaign blocked on the host |

### 15.2 Card anatomy

```text
╭─ ⚑ Effect approval · D-class ──────────────────────────── W-0042 · I2 · cell-8 · contract v3 · 4 min ago ──╮
│ pip install requests==2.32.3                                                    cwd: ./  class D           │
│ Why the agent wants it: "tests need requests for the retry fixture"                                        │
│ Classified D because: package install (packageInstallIsDClass) · network                                   │
│ Contract allowlist: not allowlisted                                                                        │
│ If you approve: the command runs once, under trusted-local (no sandbox).                                   │
│ If you deny: the call is refused with your reason; the cell continues.                                     │
│ If you wait: the cell stays paused; lease expires in 52 min, then the campaign stops (resumable).          │
│ Reason (optional) ____________________________________________                                             │
│                                           [D] Deny     [A] Approve once        ⋯ add to contract allowlist │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

Every card states: kind, campaign/increment/cell, **contract revision**, age, **consequences of each option**, lease countdown, keyboard shortcuts. "Add to contract allowlist" is a separate, explicit amendment — never a side effect of approving once.

### 15.3 Question card

Question text (Markdown), options as buttons (`1`–`9`), free-text answer, and the **"This changes requirements"** switch, explained inline: *off* = recorded as evidence, no new contract version; *on* = becomes an amendment (new version, new `U*`).

### 15.4 Human review card

Opens a focused review surface: criteria and rubric, original obligations beside the change, diff (`diffRef`), receipts. The verdict form: outcome, findings (severity, location picked from the diff as `path:line@hash`, issue, suggested fix, kind), confidence, missing criterion (required for `insufficient_evidence`), signer (Studio user identity). The Studio validates the `Verdict` invariants before sending.

### 15.5 Publication stage card

Stage, target ref or remote, commit, whether the autonomous predicate held and, if not, the unmet clauses and human anchors.

### 15.6 Plan review card

All acceptance proposals of one plan (`add acceptance AC-x for R1: …`) as rows with Accept / Reject; "Accept all remaining" answers the following proposals of the same plan as they arrive (the SDK asks sequentially).

### 15.7 Reconcile wizard

Lists intents left `unknown` (action, argv, class, recorded time, what the Studio observed: stamp diff, handle status). For each, the user records evidence: "effects observed — …", "did not happen — …". Only then does Resume run. Automatic reconciliation (`UnknownOutcomeReconciliation.Automatic`) shows what the controller closed itself.

### 15.8 Inbox

`/inbox` and the sidebar "Needs you" list all pending decisions, grouped by project and campaign, oldest first, with filters by kind. Bulk actions only for plan proposals and knowledge admissions.

R-DEC-01 A reply MUST carry the request id and the contract revision it answers; if the revision moved, the card becomes "superseded" and cannot be sent (mirrors `Replies.check`).
R-DEC-02 Pending decisions MUST survive browser reloads and appear on every connected client; the first valid reply wins and the others update.
R-DEC-03 A decision MUST also raise an OS notification when the window is not focused (setting; default on).
R-DEC-04 In autonomous mode, policy outcomes are listed in the inbox history as "decided by policy" with the rule.
R-DEC-05 The backend records every decision and reply in its audit log (§27).

---

## 16. Activity

Drawer (`/activity`, sidebar footer) listing everything running or queued:

| Group | Items | Source |
|---|---|---|
| Campaigns | Live campaigns across projects, status, elapsed | Runtime registry |
| Processes | Background handles: argv, effect class, status (`running · exited(code) · deadline_exceeded · cancelled · lost`), elapsed, log tail | `handles` table, `logs/` (G-18) |
| Children | Probe / review / QA / writer cells: kind, question or packet, turns, status | `delegation.*`, `cell.*` |
| Provider calls | In-flight requests: provider, model, elapsed, retries, first output | Studio `LlmListener` |
| Studio jobs | Catalog refresh, qualification runs, exports, admission batches | Backend job registry |

A process opens a live log viewer (ANSI, follow mode, search). Cancelling an individual process is not available from the host (G-18); the drawer offers "Cancel campaign" instead.

---

## 17. Knowledge

Per project (the KB lives in the project's state root). Host-driven through the bridge (G-10).

### 17.1 Views

| View | Content | Source |
|---|---|---|
| **Inbox** | Candidates waiting: kind, summary, body, scope, anchors (with resolution state), evidence refs, confidence, origin (work, cell, extractor), lint findings (`Duplicate`, `EvidenceMissing`, `EvidenceUnresolvable`, `AnchorUnresolvable`, `ScopeUnbounded`, `Contradiction`, `Secret`, `OneOffGeneralization`) | `Queue.pending()`, `QueueEntry` |
| **Notes** | Browse by kind (`ADR`, `CON`, `LES`, `PIT`, `BMAP`, `NEG`, `SKILL`, `STATUS`, `CAL`) and status (`candidate`, `admitted`, `stale`, `superseded`, `deprecated`, `rejected`); usage (injected, cited, last cited); revisions; supersession chain; validity (depends on, last validated, invalidation trigger) | `Notes.all/get/revisions`, `note_usage` |
| **Skills** | Trigger (paths, terms), prerequisites, steps, modules (applies to, mandatory), invariants, token budget, rendered view per role | SKILL notes + module blobs |
| **Behaviour maps** | Subsystem → behaviours → entry points, implementation, tests; locator status `Current / Changed / Unresolved` | BMAP notes |
| **Batches** | Admission batches (admitted, rejected with findings, waiting) with Rollback | `Queue.batch`, `Curator.rollback` |
| **Health** | Candidates, admitted, rejected, waiting, injections, admission rate, cited rate, stale injections, repeated mistakes, locator validity, index freshness | `KbHealth` |

### 17.2 Actions

| Action | Call | Guard |
|---|---|---|
| Admit / Reject selected | `Curator.admitWith(ids, authority, contractRevision)` with the user's decisions pre-collected | Lint findings reject automatically; ADR admission is signed by the user |
| Policy admission (autonomous campaigns) | `Curator.admit(ids, AdmissionMode.Autonomous)`, run by the Studio after each autonomous campaign | Admits only what the policy allows (§7.3); everything else stays in the inbox |
| Supersede with an edited copy | `Curator.supersede(oldId, replacement, ids, by)` | Admitted bodies are never edited in place |
| Deprecate | `Curator.deprecate(id, ids)` | — |
| Roll back a batch | `Curator.rollback(batchId, ids)` | Refused when later revisions conflict |
| Recheck validity | `Curator.recheck(ids, version, stamp, deps)` | — |
| Prune (preview first) | `Curator.prune(ids, minInjected = 5, floor = 0.25)` | `CON`/`ADR` never decay |
| Promote to a check | `Curator.promote(ids, minCited = 3)` | Produces a *proposed task*, never a commit |
| Regenerate index | `Curator.regenerate()` | — |

R-KB-01 Knowledge is data: the UI MUST NOT present notes as instructions or allow a note to change settings or authority.
R-KB-02 Injection mode (`Flags.kbInjection`: Off / Frozen / Live) is shown on the Knowledge page with a link to its setting and its evaluation status.

---

## 18. Statistics and economics

Scopes: campaign · project · all projects; time range. Every number states its coverage ("priced 118 of 121 calls; 3 unknown").

| Panel | Metric | Source |
|---|---|---|
| Spend | Tokens by cache class (`uncached_input`, `cache_read`, `cache_write_5m`, `cache_write_1h`, `output`, others) stacked; money with an "unknown" hatched segment; warm vs cold money | `usage` / `Accounting.calls`, `totals` |
| Outcome economics | Cost per accepted task; first-attempt increment pass rate; verified / blocked / cancelled increments | `Accounting.totals`, `CampaignMetrics`, ledger |
| Cells | Turns, continuations per increment, rebuilds per cell, boundary reasons, pre-compilation hits (when enabled), `[A]` tokens | events, `sizing`, `CellMetrics` |
| Verification | Checks by layer, outcomes, inconclusive and flaky reruns, full-suite runs | receipts, journal |
| Recovery | Failure classes, repairs, escalations, alternative attempts | journal `boundary` rows (G-03) |
| Routing | Profile per function and tier over time, refusals | `routing_log`, `cell.model_requested` |
| Interventions | Questions, approvals, amendments, reviews with time-to-answer | Studio decision log |
| Timeline | Spans by phase with exclusive cost; critical path vs summed worker time; concurrency bands | Persisted `span.started/ended` items (all campaigns); `Spans.analyze` for live campaigns; `otel-spans.json` when `otelExport` is on |
| Provider health | Latency, time to first output, retries, error codes, rate-limit headers, warnings | Studio `LlmListener` telemetry |
| Knowledge | KB health figures | `KbHealth` |

R-STA-01 Missing values MUST render as "not measured" or "unknown", never as 0 (P-04, P-12).
R-STA-02 Cache-hit rate MAY be shown only as a diagnostic next to cost per accepted task, never as a goal.
R-STA-03 Worker time and wall time MUST be shown separately; parallel durations are not added to latency.

---

## 19. Settings

### 19.1 Principles

- **Layers:** *Studio defaults* → *project overrides* → *campaign options* (chosen in the composer: mode, ceiling, budget, publication) → **frozen at the attempt boundary** (`AttemptConfig.freeze`, fingerprint).
- **Provenance:** every field shows where its effective value comes from (`SDK default` · `Studio` · `Project` · `Campaign`) and offers "reset to inherited".
- **Validation:** every edit is validated by the backend with ASTROLABE's own validators (`Config.violations()`, a dry-run `AttemptConfig.freeze`, `AiGateAdapter.violations(llm, profiles)`) plus Studio rules; violations appear inline at the field path (`ConfigViolation.field`, for example `profileRoles.main`, `roles.plan`, `shapePolicy.largeMinFiles`).
- **Effect:** "Applies to new campaigns and new attempts. Running: W-0042 uses frozen configuration `fp 3a9c…`." A running campaign's effective configuration is viewable read-only.
- **Honesty:** knobs that exist in ASTROLABE but are not reachable through `Config` are shown read-only with their defaults and a link to G-13; `Defaults` fields the runtime does not read are shown read-only as "declared, not wired" (G-23). Mandatory `Controls` are never shown (P-18).

### 19.2 Layout — W-05

```text
┌─ Settings ────────────────────────────── scope: [ Studio defaults ▾ ]  ( Project: payments-api )   ⌕ search settings  ┐
│ General                  │ AUTONOMY & SAFETY                                                                          │
│ Providers & accounts     │ Mode                     ( Interactive ▾ )              SDK default · Interactive          │
│ Models & routing         │ D-class effects          ( Ask ▾ )                       Studio                            │
│ Roles                    │ Test-integrity approval  ( Autonomous ▾ )  ⓘ review cell first, human fallback             │
│ Autonomy & safety      ◀ │ Unknown outcomes         ( Host ▾ )        ⓘ you reconcile before resume                   │
│ Budgets & limits         │ Publication ceiling      ( Patch ▾ )                                                       │
│ Shape policy             │ Execution mode           ( Trusted-local ▾ )  Confined: unavailable — no backend (G-14)    │
│ Verification             │ Rules file               AGENTS.md  ✓ bound (digest 91c2…, user:alex)   [Rebind] [Unbind]  │
│ Knowledge                │ Redaction patterns       9 built-in · 1 custom            [Edit]                           │
│ Optional layers          │ Protected paths          .git · .github · migrations · lockfiles   read-only (G-13)        │
│ Tools & MCP              │ ─────────────────────────────────────────────────────────────────────────────────────────  │
│ Storage                  │ ⚠ Applies to new campaigns. W-0042 runs with frozen config fp 3a9c… [View]                 │
│ Studio runtime           │                                                           [Discard]  [Validate]  [Apply]   │
│ Advanced                 │                                                                                            │
└──────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 19.3 Sections (complete field list in Appendix B)

| Section | Contents | Backing object |
|---|---|---|
| General | Theme (system/dark/light), density (compact by default, or comfortable), motion, language (EN/RU), fonts, diff style, time format, composer send key, notifications | Studio |
| Providers & accounts | §20 | AI Gate |
| Models & routing | Profiles (§20.5), profile roles (`main`, `helper`, `escalation`), tier table (`version`, `calibrationDate`, profiles per `Low/Medium/High/ExtraHigh`), main-model effort (`CellModel.effort`: Minimal/Low/Medium/High) and output narrowing (`maxOutputTokens`), read-only: function table (`routing-11.1-v1`, G-13) and probe/review tiers (declared, not wired: G-23) | `Config.profiles`, `profileRoles`, `tierTable`, `Defaults.probeTier/reviewTier/reviewRoutineTier`, `CellModel` |
| Roles | The eight declared roles with their full configuration; allowed edits only (§19.4) | `Config.roles` |
| Autonomy & safety | Mode, D-class policy, integrity approval, unknown-outcome reconciliation, ceiling, autonomous policy (`acceptNonWeakening`), execution mode, rules-file binding, redaction; read-only: protected paths, effect-policy lists, capability sets, human anchors | `Config`, `AutonomousPolicy`, `RulesBinding`, `RedactionConfig` |
| Budgets & limits | Campaign, cell, context, guards, delegation, timeouts (grouped `Defaults`), default campaign budget; fields the runtime does not read are read-only (G-23) | `Defaults`, `CampaignPolicy` |
| Shape policy | Size thresholds, S3 enablement, slack factor | `Defaults.shapePolicy` |
| Verification | Quality gates (commands), checker time boxes, θ, full-suite cadence; flaky reruns read-only (G-23) | `Config.qualityGates`, `Defaults` |
| Knowledge | Injection mode; note caps and admission confidence read-only (G-23) | `Flags.kbInjection`, `Defaults` |
| Optional layers | Each `Flags` switch with its evaluation status and dependencies (§19.5) | `Flags` |
| Tools & MCP | MCP mounts (declared, not callable: G-15); generated tools (with `Flags.generatedTools`) | `OptionalLayers.mounts`, `ToolRegistry` |
| Storage | State root (`Config.stateRoot`), exports folder, Studio data folder, event-log retention, blob size limit | `Config`, Studio |
| Studio runtime | Lease duration (default 8 h, G-02), `maxCells` per run, auto-resume after a late answer, decision reminders, publication window (G-22), max concurrent campaigns | Bridge |
| Advanced | Import/export YAML, effective configuration viewer, fingerprint preview, reset | — |

### 19.4 Roles editor

Shows each role's context view, note scope, skill filter, tool mask, permission, tier prior, duties, ask-back, output packet, persona lines and text version (`policyTextVersion#digest`).

| Editable (applied at runtime by `RoleTexts.worded`) | Read-only |
|---|---|
| Persona lines (≤ 3), duties, policy text version | Context view, note scope, skill filter, tool mask, permission, tier prior, ask-back, output packet, denied note kinds |

`Config.violations` rejects adding or renaming roles, widening a mask, raising a permission, changing the packet and wording that claims completion, grants authority or sets a control aside (`RoleTexts.violations`). It *accepts* a narrowed mask, a lowered permission and extra denied note kinds, but the runtime ignores them (G-24), so the editor does not offer them.

**What "customizing agents" means in ASTROLABE**

| Aspect | Where | Effect |
|---|---|---|
| Which model serves each function | Profiles, profile roles (main, helper, escalation), tier table | The router picks per function and tier; floors are never lowered |
| How the main model works | `CellModel.effort`, output narrowing, profile `gate` options | Per campaign |
| Role wording | Roles editor | Persona lines and duties in the role text |
| Budgets of delegated agents | `probeTokens`, `reviewIncrementTokens`, `parallelCells`, `probeDepth`, `writerDepth`, `repairCalls` (others read-only, G-23) | Child cell budgets and limits |
| Which agents exist | Shape policy, `qaCell`, `s3Writers` | Probes and reviews (S2), QA cells, parallel writers (S3) |
| Autonomy | Mode, D-class policy, integrity approval, ceiling | Who answers and what needs approval |

The editor shows a diff against the SDK default and warns that rewording changes the attempt fingerprint. A banner states: "A role is a configuration, not a security boundary; the executor enforces capability regardless."

### 19.5 Optional layers

| Flag | Effect | Needs | Status label |
|---|---|---|---|
| `precompile` | Next increment's `[K]` built during slow checks | — | Off until evaluated |
| `calibrationPrior` | Per-repository sizing prior for the plan cell | — | Off until evaluated |
| `treeSitterIndex` | Tier-1 outline index for impact and pre-scan | `index-treesitter` module (bundled by the Studio) | Off until evaluated |
| `languageService` | Tier-2 language service | Host service | Off until evaluated |
| `denseRetrieval` | Embedding-based KB search candidates | An embedding provider (none configured) | Unavailable |
| `generatedTools` | Project/global generated tools | Registry | Off until evaluated |
| `skillsPromotion` | Promotion proposals for skills | — | Off until evaluated |
| `asyncChecker` | Async watcher feedback | Host `Watcher` | Unavailable |
| `qaCell` | L3 product-use QA cells | — | Off until evaluated |
| `l4Gates` | Measurement gates | Measurement commands (not on `Config`, G-13) | Unavailable |
| `s3Writers` | Parallel writers (with `shapePolicy.s3Enabled`) | Both switches | Off until evaluated |
| `otelExport` | `otel-spans.json` export | — | Available |
| `worthTestEstimate` | Delegation worth estimate on dispatch events | — | Off until evaluated |
| `kbInjection` | Off / Frozen / Live note injection | — | Off until evaluated |

Each switch explains what it changes in the UI (for example `s3Writers` enables worktree lanes in the Overview). Status labels: **Available** — supported and switchable; **Off until evaluated** — switchable, but ASTROLABE ships it off until its evaluation gate passes; **Unavailable** — the Studio cannot supply its dependency, so the switch is disabled with the reason.

### 19.6 Presets

| Preset | Sets |
|---|---|
| Cautious | Interactive · D-class Ask · integrity approval Human · ceiling Patch · unknown outcomes Host |
| Balanced (SDK defaults) | Interactive · D-class Ask · integrity approval Autonomous · ceiling Patch · unknown outcomes Host |
| Autonomous | Autonomous · D-class Ask (degrades to deny unless allowlisted) · integrity approval Autonomous · `acceptNonWeakening` off · unknown outcomes Automatic · ceiling Patch |

Applying a preset shows the diff first.

### 19.7 Import and export

`astrolabe-studio.yaml` (schema `astrolabe-studio.settings/1`) holds Studio and project layers: profile definitions, routing, roles overrides, defaults, flags, policies, quality gates, redaction additions, provider configuration in AI Gate's secret-free `ai-gate.providers/1` form. Secrets are never exported. Import validates fully before applying and shows the diff.

---

## 20. Providers, accounts and models

### 20.1 Provider list

Presets and custom providers with: auth state (`not configured`, `configured`, `expiring`, `expired`, `refresh failed`), credential source (for example stored, environment or keyless), account (from the credential), models available, last connection test, last error. Actions: Connect, Test, Log out, Revoke (remote only where configured), Edit, Remove.

### 20.2 Connect wizard — W-06

```text
┌─ Connect a provider ──────────────────────────────────────────────────────────────────────────┐
│ 1 Provider ─── 2 Sign-in ─── 3 Test ─── 4 Profiles                                            │
│                                                                                               │
│ OpenAI · ChatGPT subscription (openai-codex)                                                  │
│ Method   ◉ Browser sign-in   ○ Device code                                                    │
│ ⚠ Unofficial, revocable access. Needs port 1455 free on the machine running the Studio        │
│   backend. Models have no per-token prices (costs will show as unknown).                      │
│                                                                                               │
│ [Open sign-in page ↗]      waiting for callback… 4:12 left                  [Cancel]          │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **API key:** a form generated from AI Gate `FieldDescriptor`s (`SECRET` fields masked, never echoed back), with the provider's "Get a key" link; saved with `auth().save(provider, ApiKeyCredential)`.
- **OAuth:** the backend runs `auth().login(provider, OAUTH, interaction, cancelToken)` on a worker thread; the Studio's `AuthInteraction` relays `AuthNotice.OpenUrl` (button), `AuthNotice.DeviceCode` (large code, copy button, verification link, expiry countdown), `AuthNotice.Progress/Info`, and `AuthPrompt.Select` (browser/device), `AuthPrompt.Code` (paste), `Text`, `SecretText` over the `auth:{sessionId}` topic. Cancel triggers the `CancelToken`.
- **Keyless local servers** (`ollama`, `lm-studio`, `vllm`): base URL and a connectivity test.
- **Custom endpoints:** OpenAI-compatible or Anthropic-compatible with base URL, headers and compat flags from descriptors.
- **Several accounts** for one vendor use distinct provider ids (for example `openai-work`), because one credential exists per provider id.

### 20.3 Connection test

Runs `llm.test(model)` steps `CONFIGURATION → NETWORK → AUTHENTICATION → MODEL_ACCESS` (not billed) and shows each step's status (`PASSED`, `FAILED`, `SKIPPED`, `NOT_SUPPORTED`), latency and message. Billable probes (`INFERENCE`, `USAGE`, `TOOLS`, `CACHE`) are opt-in behind a confirmation that states they cost money.

### 20.4 Model catalog

Filter by provider, capability, modality, context size, reasoning levels and price. Each model shows limits, capabilities (`supported / unsupported / unknown`), reasoning levels, prices per million tokens with their source ("catalog — models.dev, not an invoice") and source kind (`BUNDLED`, `CATALOG`, `FEED`, `LIVE`, `CUSTOM`, `UNLISTED`). "Refresh catalog" calls `models().refresh(...)`. The Studio keeps the catalog frozen for campaign use (`offline()` or `snapshotFile`) and shows the snapshot date.

### 20.5 Profiles

- **Create from model:** `AiGateProfiles.draft(llm, provider, model, id, priceDate)` produces a reviewable ASTROLABE `Profile` (limits, dated prices, `gate` block).
- **Editor:** id; provider/model; capabilities (read-only from draft or qualification); price table (date, currency, price per billing dimension); latency class; `gate` block: `api`, `options` (timeouts, retry, `cacheRetention`, `sessionId`, headers), `reasoningHandoff` (`reject`/`drop`), `outputCap`, `catalogCheck` (`fail`/`warn`/`off`), `prefixRetention` (`short`/`long`), `tokenCount` (`local`/`endpoint`), `effort` (`map`/`off`). Validation with `AiGateAdapter.violations`; warnings from `warnings()`.
- **Qualify:** `AiGateProfiles.qualify(llm, profile, cache, timeout)` — billable; confirmation first; result shows problems and notes and the narrowed usage fields and caching; "Freeze qualified profile" saves it.
- **Qualification state** per profile: `draft` · `validated` (no violations) · `qualified <date>` · `stale` (catalog or SDK changed since). Live behaviour of the implemented adapter is treated as unverified for a provider until qualification or the opt-in `liveTest` has run against it (§2.6.1).

### 20.6 Transport settings

HTTP version, proxy, trust store, client certificate (mTLS), user-agent suffix, wire log (`OFF`/`HEADERS`/`BODIES`, with a warning for bodies), insecure TLS (danger zone, visibly flagged), default timeouts (`connect`, `streamIdle`, `total`) and retry policy (`maxAttempts`, statuses, backoff), catalog behaviour (refresh interval, feeds on/off, offline, snapshot file).

### 20.7 Health

Per provider: recent requests (latency, time to first output, retries, error codes, warnings), last rate-limit headers when present, credential events. `RefreshFailed` or `invalid_credentials` creates a "Provider login" decision (§15.1). There is no quota API; quota problems appear only as `quota_exhausted` errors.

R-PRV-01 Secrets MUST never be sent to the frontend after entry; the UI shows only fingerprints (`Secret.fingerprint()`).
R-PRV-02 Billable actions (probes, qualification) MUST require explicit confirmation naming the provider and model.

---

## 21. Projects and repositories

### 21.1 Adding a project

Path input with server-side validation (desktop shell: native folder picker). Checks: git working-tree root; git version; repository identity (`RepoIdentity`); state root location (outside the worktree); unsupported layouts (submodules, sparse checkout); platform support (Windows and Linux only — ASTROLABE's process layer refuses other systems, so macOS is refused with that reason); lock state.

### 21.2 Project home — W-07

```text
┌─ payments-api · ~/src/payments-api · ⎇ main @ 4e1a9c2 · 2 modified · 1 untracked ────────────── [Start campaign] ┐
│ HEALTH   git 2.49 ✓ · state root ~/.local/state/astrolabe/projects/7c1e… (84 MB) · lock: free                    │
│ RULES    AGENTS.md  untrusted (discovered)  [Review & bind]      CLAUDE.md not present                           │
│ COMMANDS (sniffed, declared-not-inferred)                                                                        │
│   .           pyproject.toml   test: python -m pytest -q   lint: python -m ruff check .   typecheck: mypy .      │
│   web/        package.json     test: npm test              build: npm run build           typecheck: npx tsc …   │
│ KNOWLEDGE 42 admitted · 3 waiting · health ✓                                                                     │
│ CAMPAIGNS                                                                                                        │
│   ● W-0042 Idempotency keys for POST /payments      S2  running · I2      2 min                                  │
│   ✓ W-0041 Retry backoff                            S1  completed          1 d   · Patch                         │
│   ◐ W-0039 Refactor router                          S2  waiting for input  3 d   [Resume]                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Sniffed commands are read-only (no override API, G-13); "Use as acceptance hint" copies a command into the composer's hints.
- Rules file: discovered candidates (`.astrolabe/rules.md`, `AGENTS.md`, `CLAUDE.md`) are data until bound; "Review & bind" shows the bytes and digest and creates `RulesBinding(path, digest, "user:<name>")` in project settings; a changed file shows "changed since approval".
- **Campaign queue (Studio feature):** requests can be queued to start when the current campaign ends (one campaign per project).
- Remove project: forgets it in the Studio; never deletes the state root (offered separately with a confirmation).

---

## 22. Command palette, keyboard and notifications

### 22.1 Command palette (`Ctrl/⌘+K`)

Fuzzy search over actions (start, amend, resume, cancel, publish, reconcile, toggle theme, pop out Overview), navigation (projects, campaigns, tabs, settings fields), and entities by id (`W-…`, `R1`, `AC-3`, `rcpt-…`, `#57`, note ids, file paths from the atlas). Recent items first.

### 22.2 Keyboard map

| Keys | Action |
|---|---|
| `Ctrl/⌘+K` | Command palette |
| `Alt+N` (browser) · `Ctrl/⌘+N` (desktop shell) | New campaign |
| `Ctrl/⌘+Enter` | Submit composer |
| `Alt+1…6` | Thread · Overview · Plan · Changes · Evidence · Context |
| `Shift+Alt+2` | Pop out Overview |
| `Ctrl/⌘+I` | Needs-you inbox |
| `Ctrl/⌘+.` | Activity drawer |
| `J` / `K` | Next / previous turn |
| `[` / `]` | Previous / next cell |
| `G L` | Jump to live |
| `Enter` / `Esc` | Open item in drawer / close drawer |
| `A` / `D` / `1…9` | Approve / deny / choose option in a focused decision card |
| `Ctrl/⌘+Shift+.` | Cancel campaign (confirmation) |
| `?` | Shortcut sheet |

### 22.3 Notifications

| Event | In-app | OS notification (default) |
|---|---|---|
| New decision | Badge + inline card | On |
| Lease below 10 minutes with a pending decision | Banner | On |
| Campaign finished (any outcome) | Toast + sidebar | On |
| Provider login required | Decision card | On |
| Warning events | Thread line | Off |

Notifications never contain secrets or code; clicking focuses the exact item.

---

## 23. Visual design system

### 23.1 Direction: "instrument"

Precise, calm and modern — the look of a well-made measuring instrument rather than a dashboard. Neutral graphite (dark) or paper (light) surfaces, hairline borders, dense typography, one accent, semantic colours used as small marks. Contemporary developer tools (Linear, Zed, Raycast, Warp) are the reference for restraint; ASTROLABE's identity comes from three quiet touches only:

1. **App mark:** an astrolabe *rete* — a circle, eight ticks and a pointer.
2. **Plate grid:** faint concentric circles (≈3 % opacity) behind the Overview's flow canvas.
3. **Meridian line:** a 2 px accent line marking the active item in lists and the active path in the Overview.

Not allowed: gradients on data, glow on static elements, colourful role coding, emoji as status, decorative animation, saturated fills for large areas.

### 23.2 Colour tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg-canvas` | `#0B0D10` | `#F6F7F9` | App background |
| `--bg-sidebar` | `#0F1115` | `#EFF1F4` | Sidebar |
| `--bg-surface` | `#14171C` | `#FFFFFF` | Cards, panels, composer |
| `--bg-raised` | `#1A1E25` | `#FFFFFF` + shadow | Drawers, popovers |
| `--bg-hover` | `#1F242C` | `#F0F2F5` | Hover rows |
| `--bg-active` | `#252B35` | `#E7EAEF` | Selected rows |
| `--border-subtle` | `#222730` | `#E6E9EE` | Dividers |
| `--border-default` | `#2C323D` | `#D9DDE4` | Inputs, cards |
| `--border-strong` | `#3A4250` | `#C3C9D2` | Focus-adjacent, emphasis |
| `--text-primary` | `#E6E9EE` | `#161A20` | Body |
| `--text-secondary` | `#A7AFBC` | `#4B5361` | Meta |
| `--text-tertiary` | `#737C8B` | `#7A8392` | Non-essential hints only |
| `--text-disabled` | `#4E5562` | `#A9B0BB` | Disabled |
| `--code-bg` | `#0F1216` | `#F7F8FA` | Code, logs |
| `--accent` ("meridian") | `#8FA3F5` | `#3B55C9` | Active, running, focus, primary action |
| `--accent-subtle` | `rgba(143,163,245,.12)` | `rgba(59,85,201,.08)` | Selected, live backgrounds |
| `--success` | `#5DBB8A` | `#1F8A55` | Verified, passed, current |
| `--danger` | `#E27D72` | `#C23B30` | Failed, refused |
| `--attention` | `#D9A94E` | `#A06A0E` | Needs you, waiting, stale, warnings |
| `--neutral-mark` | `#737C8B` | `#7A8392` | Pending, unknown, not run, cancelled |
| `--diff-add-bg` / `--diff-del-bg` | `rgba(93,187,138,.10)` / `rgba(226,125,114,.10)` | `rgba(31,138,85,.08)` / `rgba(194,59,48,.08)` | Diff lines (word level ×2.2 alpha) |

Phase families (timeline only, saturation ≤ 40 %): Think (Understand, Locate, Retrieve, Plan) `#7F8FB8`/`#5A6A99` · Act (Edit, Integrate) `#6FA9A0`/`#3E7F76` · Check (Verify, Review) `#9DB07A`/`#6A7E45` · Maintain (Recover, Compact, Delegate) `#A98FB5`/`#7A5F88`.

Contrast: primary and secondary text ≥ 4.5 : 1 on every surface; tertiary ≥ 3 : 1 and never the only carrier of information. T-24 verifies this with automated checks.

### 23.3 Status system

Status glyphs are custom 12 px SVG components with a consistent 1.5 px stroke (never emoji), always paired with a word in tooltips and accessible names.

| State | Glyph | Colour | Word |
|---|---|---|---|
| Running / active | `●` (soft pulse only while live) | accent | running |
| Verified / passed / completed | `✓` | success | verified · passed · completed |
| Current (receipt at current stamp) | solid mark | as outcome | current |
| Stale (stamp or closure moved) | dashed ring `◌` | attention | stale |
| Unknown | `?` in ring | neutral | unknown |
| Failed | `✕` | danger | failed |
| Refused (gate, policy) | `⛔` | danger | refused |
| Needs you | `⚑` | attention | needs you |
| Waiting for input | `◐` | attention | waiting |
| Blocked (external) | `⏸` | attention | blocked |
| Budget exhausted | `◔` | attention | budget exhausted |
| Inconclusive | `≈` | neutral | inconclusive |
| Not run / unavailable | `–` | neutral | not run · unavailable |
| Pending | `○` | neutral | pending |
| Cancelled | `⊘` | neutral | cancelled |
| Hypothesis / verified fact / refuted fact | `◇` / `✓` / struck `✕` | neutral / success / neutral | hypothesis · verified · refuted |

### 23.4 Typography

| Role | Font | Size / line height | Weight |
|---|---|---|---|
| Micro label (section labels, uppercase, +0.04 em) | Inter | 11 / 16 | 500 |
| Meta | Inter | 12 / 18 | 400 |
| UI body (default) | Inter | 13 / 20 | 400 |
| Prose (requests, model text) | Inter | 14 / 22 | 400 |
| Section title | Inter | 16 / 24 | 600 |
| Page title | Inter | 20 / 28 | 600 |
| Ids, paths, commands | JetBrains Mono | 12.5 / 18 | 400 |
| Code and logs | JetBrains Mono | 13 / 20 | 400 |

Numbers use tabular figures (`font-variant-numeric: tabular-nums`). Token counts are abbreviated (`1.2K`, `2.5M`) with exact values in tooltips.

### 23.5 Space, radius, elevation, motion

| Token group | Values |
|---|---|
| Spacing (4 px grid) | `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 |
| Row height | compact 28 · comfortable 32 |
| Card padding | compact 12 · comfortable 16 |
| Prose width | Thread text column ≤ 860 px; tool cards and diffs up to 1,100 px |
| Radius | `--radius-xs` 3 (chips) · `-sm` 5 (inputs, buttons) · `-md` 8 (cards) · `-lg` 12 (drawers, dialogs, composer) |
| Elevation (dark) | Lightness steps + 1 px border; overlays `0 12px 32px rgba(0,0,0,.45)` |
| Elevation (light) | `sm 0 1px 2px rgba(16,24,40,.06)` · `md 0 4px 12px rgba(16,24,40,.08)` · `lg 0 12px 32px rgba(16,24,40,.12)` |
| Translucency | Only command palette and drawer header: 88 % surface + `backdrop-filter: blur(12px)` |
| Motion | `--dur-fast` 120 ms · `--dur-base` 180 ms · `--dur-slow` 280 ms · `--ease-standard cubic-bezier(.2,0,0,1)` · `--ease-exit cubic-bezier(.4,0,1,1)`; no bounce; skeleton shimmer 1.2 s |

### 23.6 Iconography

Lucide icons, 1.5 px stroke, 16 px (14 px in dense rows). Tool families: look `search`, edit `pencil`, run `terminal`, verify `shield-check`, state `list-checks`, task `split`, kb `book-open`. Roles use a small custom monochrome set (plan ◇, implementing ▣, probe ⌕, review ⚖, qa ▷, writer ✎, repair ⟲, extractor ✦).

### 23.7 Component inventory ("Sextant UI")

Buttons (primary, secondary, ghost, danger; sm/md) · IconButton · Chip (id, status, origin, file) · Badge · StatusGlyph · Tooltip · Menu/Popover · Tabs · SegmentedControl · Input, TextArea, Select, Combobox, Switch, Checkbox, Radio, Slider · Dense Table (sortable, virtualized) · Tree · Card · KeyValue list · Banner · Toast · Dialog · Drawer (with back stack) · Skeleton · EmptyState · Kbd hint · Markdown · CodeView · DiffView · LogView (ANSI) · Meter (linear, segmented) · Ring (turn/context) · StackBar (context segments) · Sparkline · Timeline (spans) · DAG Graph · FlowCanvas · DecisionCard · VerdictForm · ContractPatchEditor.

### 23.8 Data visualization rules

Thin marks, no 3D, no gradients, direct labels, units always shown, legends minimal; **unknown values drawn as a hatched segment**; money shown as "≥ $3.10" when some calls are unpriced; time axes in local time with UTC in tooltips.

### 23.9 Token source (excerpt)

```css
:root {
  --font-ui: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 280ms;
  --ease-standard: cubic-bezier(.2, 0, 0, 1);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg-canvas: #0B0D10; --bg-surface: #14171C; --border-default: #2C323D;
  --text-primary: #E6E9EE; --text-secondary: #A7AFBC;
  --accent: #8FA3F5; --success: #5DBB8A; --danger: #E27D72; --attention: #D9A94E;
}
:root[data-theme="light"] {
  color-scheme: light;
  --bg-canvas: #F6F7F9; --bg-surface: #FFFFFF; --border-default: #D9DDE4;
  --text-primary: #161A20; --text-secondary: #4B5361;
  --accent: #3B55C9; --success: #1F8A55; --danger: #C23B30; --attention: #A06A0E;
}
```

Theme switching is instant, follows the OS by default, and never flashes on load (theme resolved before first paint). Code highlighting uses two matching low-saturation themes ("Astro Night", "Astro Day").

---

## 24. States catalogue

| Situation | Where | Presentation |
|---|---|---|
| No provider connected | App start, composer | Onboarding card "Connect a provider"; Start disabled with reason |
| No project | Sidebar, home | Empty state with "Add repository" |
| No campaigns in project | Project home | Short explanation of campaigns + composer focus |
| Campaign opening | Header, Thread, Overview rail | Step list (attempt freeze, snapshot 0, contract, reconciliation, lease, shape) with elapsed time |
| Loading lists or bodies | Any | Skeleton rows; a spinner only with text and only after 300 ms |
| WebSocket disconnected | Global | Top banner "Reconnecting… (live updates paused)", exponential backoff, then automatic resynchronization; views stay readable |
| Event gap detected | Campaign | Inline "Resynchronizing from the store…" then normal |
| Project locked by another process | Sidebar, project | Holder details; no stale data presented as live |
| Provider authentication failed | Needs you, header | Login decision; campaign blocked on the host |
| Invalid configuration | Composer, Settings | Violations list with links |
| Not measured / unknown | Statistics, strip | "unknown" / "not measured" text, hatched bars |
| Blob too large or recovery-only | Drawers | "Not available in the UI" with the reason (§31.4) |
| Campaign interrupted (backend restart) | Sidebar, header | Grey status, Resume action, reconciliation if needed |
| Narrow window | All | §6.1 breakpoints; decisions remain fully usable |

---

## 25. Accessibility and internationalization

- **Standard:** WCAG 2.2 AA.
- **Keyboard:** every action reachable without a pointer; visible focus (2 px accent ring, 2 px offset); focus returns to the invoking element when drawers and dialogs close; roving tabindex in trees, tables and the flow canvas (arrow keys move between nodes).
- **Screen readers:** semantic roles (`tree`, `grid`, `tablist`, `dialog`, `log`); the Activity ticker is an ARIA `log`; the Overview has a text summary region ("Implementing cell-8 is running pytest -q -k ctx; 1 decision waiting"); status changes announced politely; new decisions announced assertively.
- **Colour independence:** every state has a glyph and a word; diffs also use `+`/`−` gutters.
- **Motion:** `prefers-reduced-motion` honoured; Motion setting Off disables all non-essential animation.
- **Zoom and targets:** usable at 200 % zoom; minimum target 24 × 24 px; forced-colors mode supported.
- **Internationalization:** all strings externalized; English first, Russian second; ASTROLABE terms (Campaign, Increment, Cell, Receipt, Stamp, STATE) stay in English in both locales with localized tooltips; numbers, dates and money via `Intl`; right-to-left not in scope.

---

## 26. Backend architecture (Spring Boot, Java)

### 26.1 Overview

```text
Browser / desktop shell (Angular)
   │  WebSocket  /ws   (ASTRO-WS/1, §28)          REST  /api/**  (§29)
   ▼
studio-server — Spring Boot 4.x on JDK 26, bound to 127.0.0.1:<port>
 ├─ web ........ WsGateway · REST controllers · LaunchTokenFilter · OriginGuard · problem+json errors
 ├─ services ... ProjectService · CampaignService · DecisionService · SettingsService · ProviderService
 │               KnowledgeService · StatsService · ChangesService · ActivityService · NotificationService · ExportService
 ├─ live ....... EventIngest (EventSink) ─▶ Normalizer ◀─ JournalTailer ─▶ EventLog (workbench.db) ─▶ TopicBroker ─▶ sessions
 ├─ host ....... RuntimeRegistry · ProjectRegistry · LiveCampaigns · AuthorityBridge (JavaAuthority) · LeaseMonitor
 ├─ bridge ..... studio-astrolabe-bridge (Kotlin): Controller · OpenedCampaign · Contracts · IntentJournal · Curator/Queue/Notes
 │               Views · Journal · BlobStore · ShadowRef · Accounting · Spans · Config assembly
 ├─ transport .. AI Gate Llm runtime · StudioCredentialStore · AuthInteractionRelay · LlmTelemetryListener · AiGateAdapter (existing)
 └─ storage .... workbench.db (SQLite + Flyway) · OS credential vault · Studio data directory
ASTROLABE state roots (one per repository: state.sqlite, blobs, exports, logs) — owned and written only by ASTROLABE
```

### 26.2 Modules

| Module | Language | Depends on | Responsibility |
|---|---|---|---|
| `studio-protocol` | Java 26 records | — | Wire DTOs and command/topic definitions; generates JSON Schema and TypeScript types (§30) |
| `studio-astrolabe-bridge` | Kotlin (ASTROLABE's toolchain: Kotlin 2.4, JDK 26) | `astrolabe:core`, `provider-api`, `provider-ai-gate`, `index-treesitter`, `net.ai.gate:ai-gate` | Implements the Java interface `AstrolabeHost` (§26.3); converts `suspend`/`Flow` to `CompletableFuture`/callbacks; no business logic |
| `studio-server` | Java 26, Spring Boot 4.x | protocol, bridge | Web, services, persistence, security |
| `studio-web` | TypeScript, Angular | protocol (generated types) | Frontend; production build served by `studio-server` |
| `studio-desktop` (phase D) | Tauri 2 shell + jlink/jpackage runtime | server | Native window, tray, notifications, folder picker |

Build: one Gradle build that includes ASTROLABE (`../ASTROLABE`) and the SDK (`../llm-transport-sdk/llm`) as included builds, the same pattern ASTROLABE uses for the SDK (D-332); pinned versions; `--enable-native-access=ALL-UNNAMED` on the server JVM (ASTROLABE's process layer uses FFM).

### 26.3 The host bridge interface

Java-facing, implemented in Kotlin. All potentially blocking calls return `CompletableFuture` and run off the caller's thread.

```java
public interface AstrolabeHost extends AutoCloseable {
  // projects (Store.open takes the ProjectLock; one per repository)
  ProjectInfo openProject(Path repo, String projectConfigJson); // via Astrolabe.open; throws ProjectLocked(holder)
  void closeProject(String projectId);
  RepoHealth repoHealth(String projectId);                      // git, dirty state preview, sniffed commands, rules candidates

  // campaigns
  CompletableFuture<CampaignRef> start(String projectId, StartSpec spec, JavaAuthority authority);   // open + run in background
  CompletableFuture<CampaignRef> resume(String projectId, String workId, JavaAuthority authority);   // G-01: open(same ids) + run
  void cancel(String workId, String reason);                    // cancellation token: FINAL outcome
  ContractJson amend(String workId, String text);               // contracts.amendByUser
  CompletableFuture<ContractJson> resolveAmendment(String workId, String amendmentId,
                                                   ResolutionReply reply, ContractPatch patch);      // G-05
  void reconcileIntent(String projectId, String intentId, String evidence);                         // G-11
  CompletableFuture<PublicationResultJson> publish(String workId, PublicationSpec spec, JavaAuthority a); // G-22

  // reads (read-only; G-07, G-08)
  List<CampaignRow> campaigns(String projectId);
  ViewsJson views(String projectId, String workId, Set<ViewKind> kinds);
  RegisterJson register(String projectId, String contextId);
  JournalPage journalAfter(String projectId, String workId, long afterSeq, int limit);
  JournalHits journalSearch(String projectId, String workId, String query, int limit);
  BlobResult blob(String projectId, String digest, Set<String> allowedKinds, long maxBytes);
  List<SnapshotRecordJson> snapshots(String projectId, String workId);
  AccountingJson accounting(String projectId, String workId);
  TraceJson spans(String workId);                              // live campaigns only (in-memory Spans); history comes from the event log
  FinishReceiptJson finishReceipt(String projectId, String workId);                                 // G-04
  List<HandleJson> handles(String projectId);                                                       // G-18

  // knowledge (G-10)
  KnowledgePort knowledge(String projectId);

  // configuration
  ConfigCheck validate(String effectiveConfigJson, List<String> profileIds);   // Config.violations + freeze dry-run + AiGateAdapter.violations
  String fingerprint(String effectiveConfigJson);                              // AttemptConfig fingerprint

  // events
  AutoCloseable subscribe(EventSink sink);   // one shared Events bus; records carry ids.work
}
```

**Obtaining a `Project`.** `Project` has an internal constructor, so the bridge obtains one only through `Astrolabe.open(repo)`. For each open project it keeps one `Astrolabe` built with the *project-layer* configuration (its `stateRoot` and git deadline decide where and how the store opens), the shared `AiGateAdapter`, and a placeholder `AutonomousAuthority()` that is never consulted. Campaigns then run through `Controller.open(project, …)`, which shares that store and lock, and `run(…, Authorities.fromJava(authorityBridge), …)`. The bridge never calls `Controller.open(repo: Path, …)`, which would open a second store and contend for the same `ProjectLock`. `stateRoot` is therefore project-scoped; changing it closes and reopens the project.

Commands on live campaigns (`cancel`, `amend`, `resolveAmendment`, `publish`, `spans`) are keyed by `workId` through the live-campaign registry; reads take `projectId` + `workId`.

`StartSpec` = request text (with optional annex, §9.2), effective configuration JSON, `CampaignPolicy` (tokens, cost, resumeExpected), optional `PublicationRequest`, main-model effort and output narrowing, `maxCells`, lease duration.

### 26.4 Runtime registry and configuration per campaign

- A campaign's configuration is the merge of Studio, project and campaign layers (§19.1). The registry keys runtimes by the **attempt-config fingerprint** of that configuration.
- ASTROLABE `Config` is `@Serializable`: the Studio stores settings in the same JSON shape and the bridge decodes it with kotlinx.serialization, so no field mapping code is duplicated in Java.
- Per campaign the bridge constructs `Controller(config, clock, idGen, events = sharedBus, spans = sharedSpans, leaseDuration, layers, estimators)` and a `CellModel(adapter, mainProfile, estimator, effort, maxOutputTokens)`.
- One AI Gate `Llm` runtime serves the whole Studio; one `AiGateAdapter` serves all profiles: known profiles are passed at construction so problems surface early, and a profile first seen later is compiled on first use; it is closed during shutdown (§26.13).
- `OptionalLayers`: `outlines` = tree-sitter index when `treeSitterIndex` is on; `dense` = none until an embedding provider exists; `tools` = generated-tool registry when enabled; `mounts` = declared MCP catalog (not callable, G-15).

### 26.5 Campaign supervisor

| Step | Action |
|---|---|
| Preflight | Validate configuration; `auth().status` for every profile's provider; lock state; dirty-state preview |
| Open | `Controller.open(project, CampaignRequest(work, a1, text), policy)` on a virtual thread (it blocks on git, atlas, SQLite, reconciliation) |
| Register | `LiveCampaigns.put(work, opened)`; update `campaign_index`; emit Studio item `studio.opened` with reconciliation results |
| Run | `run(opened, cellModel, authorityBridge, syntax, maxCells)` in the bridge's coroutine scope |
| End | Persist outcome; emit `studio.run_ended`; keep the handle for the publication window (G-22) when a finish receipt exists, else close |
| Resume | Reconcile unknown outcomes if required (§15.7) → `open` with the same ids → `run` |

R-BE-01 On backend shutdown the Studio MUST stop campaigns by cancelling their coroutine jobs (state stays `Running`; the next open records the cell `Lost` and resumes), **never** through the cancellation token, which makes the outcome final (`Cancelled`).
R-BE-02 Only one campaign per project may run; `start` on a busy project returns `campaign_active` (the Studio queue may hold the request).

### 26.6 Provider wiring (the existing AI Gate adapter)

```java
Llm.Builder builder = Llm.builder()
    .discoverProviders();                                 // presets
customProviders.forEach(builder::provider);               // from ProvidersConfig.read(json, presets), secret-free
Llm llm = builder
    .credentials(studioCredentialStore)                   // §31.3
    .environment(settings.useEnvironmentKeys() ? Environment.system() : Environment.none())
    .catalog(c -> c.snapshotFile(dataDir.resolve("catalog-snapshot.json")))   // frozen limits for campaigns
    .listener(llmTelemetryListener)                       // §26.7
    .http(h -> applyHttpSettings(h))
    .build();

AiGateAdapter adapter = new AiGateAdapter(llm, profiles, /* ownsLlm */ false);   // io.astrolabe.provider.aigate
EstimatorFactory estimators = adapter.estimators(new HeuristicEstimator());
```

(`Environment.system()` and `Environment.none()` are the SDK's factories; `none()` keeps operator environment keys from authenticating anything, which the Studio uses when "use environment API keys" is off.) Profile problems are reported by `AiGateAdapter.violations(llm, profiles)` before any campaign starts; `adapter.warnings()` appears in Settings.

### 26.7 Provider telemetry

`LlmTelemetryListener` receives `RequestEvent` (`Started`, `Retrying`, `FirstOutput`, `Progress`, `Finished`), `CredentialEvent` and `CatalogEvent`. It must return quickly: it copies data into a bounded queue processed on a virtual thread. `Finished` rows go to `llm_request` (joined to ASTROLABE invocations through the `astrolabe.invocation` tag); `RefreshFailed(loginRequired)` creates a provider-login decision; `CatalogEvent` refreshes catalog views.

### 26.8 Authority bridge

- One `AuthorityBridge` (a `JavaAuthority`) per running campaign.
- Each call creates a `decision` row (kind, work, cell from `ids.context`, contract revision, request JSON), publishes `decision.requested` on `app` and `campaign:{work}`, and returns a `CompletableFuture` held in memory.
- Replies (`decision.reply`) are validated: pending, same request id, `Replies.check(replyRevision, currentRevision)` against the current contract revision (`superseded` otherwise); then the future completes.
- Decline: `ask`/`review` complete with `null`; `approve` completes with `approved = false` and the user's reason; `resolve` completes `Pending` or `Rejected` as chosen.
- `resolve` classification (G-21): `reason` starting with "plan proposal" ⇒ plan acceptance; "knowledge admission" ⇒ KB admission; otherwise contract amendment.
- Autonomous campaigns wrap `AutonomousAuthority(AutonomousPolicy(acceptNonWeakening, reviewer))` and record each outcome as a `policy` decision.
- `LeaseMonitor` computes lease expiry from `OpenedCampaign.lease` and publishes countdowns for campaigns with pending decisions.
- If the campaign ends while a decision is pending (cancel, lease fence), the decision becomes `expired`; a late answer is recorded and, per `runtime.autoResumeOnLateAnswer`, either offered as "Resume with this answer" (default) or used to resume immediately.

R-BE-03 The bridge MUST never complete an authority future on the event-bus dispatcher thread or block that thread.

### 26.9 Event ingestion, journal tailing and normalization

```text
Events bus ──EventSink──▶ per-campaign serial executor ──▶ Normalizer ──▶ EventLog.append(seq++) ──▶ TopicBroker
                                              ▲
JournalTailer (debounced 150 ms after relevant events; every 2 s while live) ── journalAfter(work, lastJournalSeq, 500)
```

- **Agent events** are stored verbatim (their kotlinx JSON, including the `@SerialName` type) plus derived hints (for example the parsed envelope header of `cell.tool_resulted`).
- **Journal rows** become items `journal.call`, `journal.result`, `journal.edit_intent`, `journal.edit_outcome`, `journal.check`, `journal.nudge`, `journal.boundary`, `journal.intent`, `journal.reconcile`, with parsed fields (checkpoint text, receipt ids, blob refs).
- **Derived items** fill G-03 until real events exist: `derived.edit` (from edit outcomes), `derived.check` (check rows + `receipts`), `derived.recovery` (recovery/escalation boundaries), `derived.routing` (`cell.model_requested.profileId` + `routing_log`).
- Every item receives a durable per-campaign Studio sequence number; the reducer on the client depends only on this stream (live and replay).
- **Gaps:** a jump in bus `seq` or a growing `Subscription.dropped` marks live campaigns for resynchronization: the tailer re-reads the journal after its last sequence, views are reloaded, and a `studio.resync` item is emitted.
- Model progress events are coalesced to at most one per invocation per 250 ms.

### 26.10 Read services and caching

Views are cached per campaign and invalidated by events (`contract.*` → contract; `campaign.increment_*` → ledger; `cell.register_patched` → register of that context; journal `check` → checks and receipts; `cell.model_responded` → budget). Reads are coalesced to at most one per view per 250 ms because the store has one connection and one lock shared with the running campaign (G-17).

### 26.11 Other services

| Service | Notes |
|---|---|
| SettingsService | Layers, provenance, validation (§19.1) through `AstrolabeHost.validate`; audit of every apply |
| KnowledgeService | Notes, queue, curator operations through `KnowledgePort`; admission via `admitWith` with an authority that returns the user's pre-collected decisions; the `Curator` is built with the shared event bus so `kb.admitted`/`kb.invalidated` are emitted; after autonomous campaigns the Studio runs `Curator.admit(…, AdmissionMode.Autonomous)` |
| ChangesService | Snapshots and diffs through read-only git (§31.5) and the shadow-ref records |
| ActivityService | Handles and log tails (read-only file reads by cursor), provider calls in flight, Studio jobs |
| StatsService | Aggregations over `usage`, spans, journal, decisions, `llm_request` |
| ExportService | Finish receipt, patch, campaign bundle (event log + views JSON), ASTROLABE `Export.write` for derived views |
| NotificationService | In-app notifications; OS notifications through the frontend Notification API or the desktop shell |

### 26.12 Threading

- Spring MVC and WebSocket handlers on virtual threads (`spring.threads.virtual.enabled=true`).
- Bridge coroutines on `Dispatchers.Default`; blocking ASTROLABE calls (open, git, SQLite reads) on virtual threads.
- A serial executor per campaign preserves normalization order.
- Nothing blocks the ASTROLABE event-bus dispatcher or AI Gate listener threads.

### 26.13 Shutdown order

Stop accepting commands → notify clients → cancel campaign **jobs** (resumable) → wait up to `providerTerminalWaitSeconds` → close opened campaigns and projects → close adapters → close the `Llm` runtime → close `workbench.db`.

---

## 27. Backend persistence

### 27.1 Studio database (`workbench.db`, SQLite, Flyway migrations)

| Table | Key | Purpose |
|---|---|---|
| `project` | `id` | Path, name, repository digest, state root, added/opened times, pinned, archived |
| `campaign_index` | `work_id` | Mirror for listing across projects: project, title/alias, created/updated, display status, outcome, shape, mode, parent work (for "new campaign from"), last Studio and journal sequence, pinned, archived |
| `event_log` | `(work_id, seq)` | Normalized item stream: source (`bus`, `journal`, `studio`, `derived`), type, cell, turn, time, JSON payload |
| `reducer_snapshot` | `(work_id, seq)` | Overview/Thread reducer state every 500 items (replay) |
| `decision` | `id` | Kind, project, work, cell, contract revision, request JSON, status (`pending`, `answered`, `declined`, `superseded`, `expired`, `policy`), reply JSON, times, actor, lease expiry |
| `settings_layer` / `settings_history` | `(scope, version)` | Studio and project layers as JSON documents in `Config` shape plus Studio-only keys |
| `provider` | `id` | Secret-free provider configuration (`ai-gate.providers/1` entry) |
| `profile` | `id` | ASTROLABE `Profile` JSON, state (`draft`, `validated`, `qualified`, `stale`), qualification report |
| `llm_request` | `request_id` | Provider telemetry joined to invocations (30-day retention) |
| `job` | `id` | Background jobs and progress |
| `notification` | `id` | In-app notifications |
| `command_dedupe` | `idem` | Idempotency keys (24 h) |
| `campaign_queue` | `id` | Queued campaign requests per project |
| `audit` | `id` | Actor, action, target, details for settings, decisions, publication, credential changes |

### 27.2 Files

Studio data directory (OS user data location): `workbench.db`, `catalog-snapshot.json`, `logs/`, `exports/`. Secrets are not stored in files (§31.3).

### 27.3 ASTROLABE store tables read by the Studio (read-only)

`campaigns`, `attempts`, `contracts`, `requests`, `requirements`, `acceptance`, `constraints`, `amendments`, `increments`, `ledger`, `sizing`, `leases`, `cells`, `turns`, `manifests`, `register_versions`, `workset_exports`, `journal`, `receipts`, `intents`, `handles`, `usage`, `routing_log`, `packets`, `notes`, `note_queue`, `note_usage`, `note_revisions`, `blobs`. Writes to ASTROLABE state happen only through ASTROLABE APIs (`amendByUser`, `Contracts.resolve`, `IntentJournal.reconcile`, `Curator`), never through SQL.

---

## 28. WebSocket protocol — ASTRO-WS/1

### 28.1 Connection

- Endpoint `ws://127.0.0.1:<port>/ws`, subprotocol `astro-ws.v1`. Authentication is the HttpOnly session cookie issued at launch (§31.1), sent automatically with the upgrade request; the server also requires `Origin` and `Host` to equal the Studio origin (DNS-rebinding protection).
- Heartbeat: `ping`/`pong` every 15 s; the client reconnects with exponential backoff (0.5 s → 10 s, jitter) and resumes subscriptions with `sinceSeq`.

### 28.2 Envelope

```json
{ "v": 1, "t": "evt", "topic": "campaign:W-0042", "seq": 1289, "at": "2026-09-29T12:04:31.120Z",
  "kind": "cell.tool_resulted",
  "data": { "ids": { "work": "W-0042", "attempt": "a1", "context": "cell-8" }, "opId": 3,
            "resultAlias": "#42", "header": "⟦result #42 tool=run class=W … stamp=s8 …⟧",
            "parsed": { "tool": "run", "class": "W", "status": "failed", "stamp": "s8" } } }
```

| Field | Meaning |
|---|---|
| `v` | Protocol major version |
| `t` | `hello` · `welcome` · `sub` · `subbed` · `unsub` · `evt` · `snapshot` · `resync` · `cmd` · `ack` · `err` · `ping` · `pong` |
| `id` | Client-chosen id for `sub`/`cmd`, echoed in `subbed`/`ack`/`err` |
| `topic`, `seq` | Per-topic ordering; durable for `campaign:*` topics |
| `kind`, `data` | Item type and payload |

### 28.3 Handshake

```json
→ { "v":1, "t":"hello", "data": { "clientId":"c-7f3a", "protocols":[1],
      "resume": [ { "topic":"campaign:W-0042", "sinceSeq":1270 }, { "topic":"app", "sinceSeq":88 } ] } }
← { "v":1, "t":"welcome", "data": { "sessionId":"s-19c2", "server":"1.0.0", "astrolabe":"0.1.0",
      "aiGate":"0.1.0-SNAPSHOT", "heartbeatMs":15000,
      "capabilities": { "textPreview": false, "confined": false, "mcp": false, "resume": true } } }
```

### 28.4 Topics

| Topic | Content | Replay |
|---|---|---|
| `app` | Decisions requested/resolved (all projects), notifications, provider health, runtime status, project list changes, jobs | Last 500 items |
| `project:{projectId}` | Campaign index changes, lock state, knowledge queue counts, campaign queue | Last 500 items |
| `campaign:{workId}` | The normalized campaign stream (§26.9) | Full (durable event log) |
| `process:{projectId}:{handleId}` | Log chunks with byte cursors | From a cursor |
| `auth:{sessionId}` | Provider login prompts and notices | None (live only) |
| `stats:{scope}` | Aggregates recomputed at most once per second while live | Latest value |

`sub { topic, sinceSeq?, snapshot? }` → `subbed { topic, headSeq }` → replayed `evt`s (`sinceSeq+1 … head`) → live `evt`s. When `sinceSeq` is older than retention, or `snapshot: true`, the server sends `snapshot { topic, seq, data }` first.

### 28.5 Commands

`cmd { id, name, args, idem }` → `ack { id, result }` or `err { id, code, message, details }`. `idem` makes retries safe (24 h).

| Command | Args | Result |
|---|---|---|
| `project.open` / `project.close` | `projectId` | `ProjectInfo` |
| `campaign.start` | `projectId`, `request`, `annex?`, `options` (mode, ceiling, budget, publication, effort, maxCells) | `{ workId }` after open |
| `campaign.resume` | `workId`, `amendment?` | `{ workId }` |
| `campaign.cancel` | `workId`, `reason` | `{}` |
| `campaign.amend` | `workId`, `text`, `expectedRevision` | `{ version }` |
| `decision.reply` | `decisionId`, `reply` (Answer / Decision / Resolution / Verdict / evidence), `expectedRevision` | `{ status }` |
| `decision.decline` | `decisionId`, `reason?` | `{ status }` |
| `amendment.resolve` | `workId`, `amendmentId`, `outcome`, `patch?` | `{ version }` |
| `intent.reconcile` | `projectId`, `intentId`, `evidence` | `{}` |
| `publication.request` | `workId`, `through`, `remote?`, `mergeTarget?`, `deployTarget?`, `message?` | `{ jobId }` |
| `kb.admit` / `kb.reject` / `kb.supersede` / `kb.deprecate` / `kb.rollback` | `projectId`, ids, payloads | batch result |
| `provider.login.start` | `providerId`, `method` | `{ sessionId }` (then `auth:{sessionId}`) |
| `provider.login.respond` / `provider.login.cancel` | `sessionId`, `promptId`, `value` | `{}` |
| `provider.test` | `providerId`, `modelId`, `billable?` | `ConnectionReport` |
| `profile.qualify` | `profileId`, `confirmBillable: true` | `{ jobId }` |

### 28.6 Delivery guarantees

- Per-topic order; at-least-once delivery; the client de-duplicates by `seq`.
- A client detecting a gap re-subscribes with its last `seq`.
- The server sends `resync { topic, reason }` when it had to drop a slow session's queue (> 2,000 messages or 8 MB) or when the backend resynchronized from the store; the client then reloads through REST.
- Unknown `kind`s are rendered as generic lines, never dropped (forward compatibility with events ASTROLABE starts emitting later).

### 28.7 Error codes

`unauthorized` · `forbidden_origin` · `unknown_topic` · `invalid_args` · `conflict_revision` (stale contract revision) · `project_locked` · `campaign_active` · `not_resumable` · `lease_fenced` · `unreconciled_intents` · `config_invalid` (with violations) · `provider_auth_required` · `billable_not_confirmed` · `not_supported` (with the gap id) · `internal`.

### 28.8 Example

```text
→ cmd  {id:"c1", name:"campaign.amend", args:{workId:"W-0042", text:"Also cover the retry path.", expectedRevision:3}, idem:"8f2…"}
← ack  {id:"c1", result:{version:4}}
← evt  campaign:W-0042 #1301 contract.amended {version:4, by:"user"}
← evt  campaign:W-0042 #1302 cell.turn_started {turn:15, turnsMax:40}
← evt  campaign:W-0042 #1303 cell.model_requested {invocationId:"inv-88", estimatedTokens:21870, profileId:"main", anchorTokens:1460}
← evt  campaign:W-0042 #1304 cell.model_progress {stage:"output", textChars:640, outputTokens:171}
← evt  campaign:W-0042 #1311 journal.call {turn:15, text:"…", items:[…]}
← evt  app #95 decision.requested {id:"dreq-12", kind:"approve", workId:"W-0042", revision:4, …}
```

---

## 29. REST API

Base path `/api/v1`; OpenAPI 3.1 generated by springdoc; errors as RFC 9457 `application/problem+json` with `code` (same values as §28.7), `violations[]` and `gap` where relevant. Mutating endpoints mirror WebSocket commands (same idempotency header `Idempotency-Key`) so scripts and tests can drive the Studio without a socket.

| Group | Method and path | Purpose |
|---|---|---|
| System | `GET /health` · `GET /version` · `GET /capabilities` | Liveness; versions (Studio, ASTROLABE, AI Gate); capability flags (resume, text preview, confined, MCP) |
| Projects | `GET /projects` · `POST /projects {path}` · `GET/DELETE /projects/{pid}` · `POST /projects/{pid}/open` · `POST /projects/{pid}/close` | Registry and lifecycle |
| | `GET /projects/{pid}/health` · `GET /projects/{pid}/files?q=` · `GET /projects/{pid}/rules` · `POST /projects/{pid}/rules/bind` | Repository health, atlas file search for mentions, rules-file candidates and binding |
| Campaigns | `GET /projects/{pid}/campaigns` · `POST /projects/{pid}/campaigns` (start) · `GET /campaigns/{work}` | List (G-07), start, display status |
| | `POST /campaigns/{work}/resume` · `/cancel` · `/amend` · `/amendments/{id}/resolve` · `/publication` | Lifecycle commands |
| | `GET /campaigns/{work}/contract?version=` · `/ledger` · `/graph` · `/cells` · `/cells/{ctx}` · `/register/{ctx}?version=` · `/workset/{ctx}` | Contract, plan, cells, register, workset |
| | `GET /campaigns/{work}/checks` · `/receipts` · `/receipts/{id}` · `/finish-receipt` · `/reviews` · `/integrity` | Evidence |
| | `GET /campaigns/{work}/journal?after=&limit=&kinds=&cell=` · `/journal/search?q=` · `/events?after=&limit=` | Journal pages (G-08), search, Studio event log |
| | `GET /campaigns/{work}/snapshots` · `/diff?from=&to=&path=` · `/changes` · `/patch?from=&to=&agentOnly=` | Changes |
| | `GET /campaigns/{work}/accounting` · `/spans` · `/export` | Economics, trace, campaign bundle |
| Blobs | `GET /projects/{pid}/blobs/{digest}?range=` | Allowed kinds only, size-capped, ranged (§31.4) |
| Decisions | `GET /decisions?status=&project=&work=` · `GET /decisions/{id}` · `POST /decisions/{id}/reply` · `POST /decisions/{id}/decline` | Inbox |
| Intents | `GET /projects/{pid}/intents?status=unknown` · `POST /projects/{pid}/intents/{id}/reconcile` | Reconciliation (G-11) |
| Knowledge | `GET /projects/{pid}/kb/notes?kind=&status=&q=` · `GET …/notes/{id}` · `GET …/queue` · `GET …/batches` · `GET …/health` | Browse |
| | `POST …/kb/admit` · `/reject` · `/supersede` · `/deprecate` · `/rollback` · `/recheck` · `/prune?dryRun=` · `/promote` · `/regenerate` | Curate |
| Settings | `GET /settings?scope=` · `PUT /settings?scope=` · `POST /settings/validate` · `GET /settings/effective?project=&work=` · `GET /settings/schema` · `GET /settings/presets` · `POST /settings/import` · `GET /settings/export` | Layers, validation, effective and frozen views, form schema |
| Providers | `GET /providers` · `GET /providers/presets` · `POST /providers` · `PUT/DELETE /providers/{id}` · `GET /providers/{id}/fields` | Provider configuration (secret-free) |
| | `GET /providers/{id}/auth` · `POST /providers/{id}/credentials` (write-only) · `POST /providers/{id}/logout` · `POST /providers/{id}/revoke` · `POST /providers/{id}/test` · `GET /providers/{id}/health` · `GET /oauth/callback/{session}` | Authentication, tests, health, OAuth redirect completion |
| Models & profiles | `GET /models?provider=&capability=&q=` · `POST /models/refresh` · `GET /profiles` · `POST /profiles/draft` · `PUT/DELETE /profiles/{id}` · `POST /profiles/{id}/validate` · `POST /profiles/{id}/qualify` | Catalog and ASTROLABE profiles |
| Statistics | `GET /stats?scope=&from=&to=` | Aggregates (§18) |
| Activity | `GET /activity` · `GET /projects/{pid}/handles` · `GET /projects/{pid}/handles/{h}/log?cursor=` | Processes and jobs |
| Jobs, notifications | `GET /jobs` · `GET /jobs/{id}` · `GET /notifications` · `POST /notifications/{id}/read` | Background work and notices |

---

## 30. Shared DTO catalogue

Java records in `studio-protocol` are the source; TypeScript types are generated (JSON Schema → TS) and never hand-edited. Key shapes:

```ts
// Envelope of every item in a campaign stream (WS evt.data and REST /events)
export interface StudioItem {
  seq: number;                      // durable per-campaign Studio sequence
  at: string;                       // ISO time
  source: 'bus' | 'journal' | 'derived' | 'studio';
  kind: string;                     // 'cell.tool_called' | 'journal.call' | 'derived.check' | 'studio.opened' | …
  ids: { work: string; attempt: string; candidate?: string | null; context?: string | null };
  cell?: string; turn?: number;
  phase?: Phase;                    // ASTROLABE Phase for bus events
  span?: string | null; parent?: string | null;
  data: unknown;                    // verbatim ASTROLABE JSON for bus/journal; typed for derived/studio kinds
}
export type Phase = 'Understand' | 'Locate' | 'Edit' | 'Verify' | 'Recover' | 'Retrieve'
                  | 'Compact' | 'Delegate' | 'Plan' | 'Review' | 'Integrate';

export type DisplayStatus =
  | { kind: 'opening' } | { kind: 'running'; phase: Phase } | { kind: 'finishing' }
  | { kind: 'ended'; outcome: 'completed' | 'waiting_for_process' | 'waiting_for_input'
      | 'blocked_external' | 'budget_exhausted' | 'cancelled' | 'failed'; resumable: boolean }
  | { kind: 'interrupted' } | { kind: 'locked'; holder?: LockHolder };

export type Decision =
  | DecisionBase & { kind: 'question'; question: { id: string; text: string; options: string[] } }
  | DecisionBase & { kind: 'effect'; request: { id: string; action: string; argv: string[]; cwd: string | null;
                     expectedEffect: string; reason: string; contractAllowlisted: boolean } }
  | DecisionBase & { kind: 'publication'; stage: 'local-commit' | 'push' | 'merge' | 'deploy'; request: unknown }
  | DecisionBase & { kind: 'plan_acceptance' | 'amendment' | 'kb_admission';
                     proposal: { id: string; by: 'Model' | 'User'; change: string; reason: string; weakening: boolean } }
  | DecisionBase & { kind: 'review'; request: ReviewRequestDto }
  | DecisionBase & { kind: 'reconcile'; intents: UnknownIntentDto[] }
  | DecisionBase & { kind: 'rules_binding'; candidate: { path: string; digest: string } }
  | DecisionBase & { kind: 'provider_login'; providerId: string; reason: string };
export interface DecisionBase {
  id: string; projectId: string; workId?: string; cellId?: string; contractRevision?: number;
  status: 'pending' | 'answered' | 'declined' | 'superseded' | 'expired' | 'policy';
  createdAt: string; leaseExpiresAt?: string;
}

export interface ToolCallView {            // built by the client reducer from tool_called/tool_resulted/journal.result
  opId: number; family: 'look' | 'edit' | 'run' | 'verify' | 'state' | 'task' | 'kb'; op: string;
  turnPhase: 'Read' | 'Edit' | 'Execute' | 'Metadata';
  resultAlias?: string; header?: string;
  parsed?: { tool?: string; effectClass?: 'R' | 'W' | 'D'; status?: string; stamp?: string;
             truncated?: boolean; effects?: 'observed' | 'unknown' | 'none'; flags: string[] };
  refs: string[];                          // result alias + blob digests
}

export type ContractPatch =               // G-05: what an accepted amendment does
  | { op: 'acceptance.update'; id: string; command?: string[]; cwd?: string | null; text?: string; scope?: string }
  | { op: 'acceptance.remove'; id: string; confirmWeakening: true }
  | { op: 'constraint.add'; text: string } | { op: 'exclusion.add'; text: string }
  | { op: 'scope.set'; writePaths: string[]; protectedPaths: string[] }
  | { op: 'budget.set'; tokens?: number; cost?: string; cells?: number; turnsPerCell?: number; attempts?: number };
```

Other DTOs (fields follow the ASTROLABE types named in §2 and Appendix A): `CampaignRow`, `ContractDto` (requests, requirements, acceptance as `run`/`check`/`review` union with `origin`, constraints, exclusions, scope, budget, authorization, risk, amendments), `IncrementDto`, `LedgerEntryDto`, `CellDto` (+ checkpoints), `RegisterDto` (sections of §10.8), `ReceiptDto`, `VerdictDto`, `FinishReceiptDto`, `SnapshotDto`, `FileChangeDto` (attribution), `AccountingDto` (`CallAccount` rows and totals), `TraceDto`, `NoteDto`, `QueueEntryDto`, `SettingsDocument`, `Violation {path, message, source: 'config' | 'attempt' | 'ai-gate' | 'studio'}`, `ProviderDto`, `AuthStatusDto`, `FieldDescriptorDto`, `ModelDto`, `ProfileDto`, `ConnectionReportDto`, `QualificationDto`, `StatsDto`.

---

## 31. Security and privacy

### 31.1 Local session

- The server binds to `127.0.0.1` on a random free port (fixed port optional). Remote binding is not offered in v1.
- At start it creates a 256-bit launch token and opens `http://127.0.0.1:<port>/launch?t=<token>`; `/launch` exchanges it once for an HttpOnly, `SameSite=Strict` session cookie and redirects to `/`. The token is single-use.
- REST mutations require a CSRF header (double-submit token); WebSocket upgrades require matching `Origin` and `Host`; all requests require `Host` ∈ {`127.0.0.1:<port>`, `localhost:<port>`} (DNS-rebinding protection).
- Strict Content Security Policy: `default-src 'self'`; no inline scripts; `connect-src 'self'`; fonts and assets bundled (no third-party requests from the frontend).

### 31.2 Threats and controls

| Threat | Control |
|---|---|
| Malicious web page calling the local server | Origin/Host checks, SameSite cookie, CSRF header, no CORS |
| Other local users | Data directory with owner-only permissions; credentials in the OS vault; single-use launch token |
| Prompt-injected or hostile repository content rendered in the UI | Model text and tool output rendered as sanitized Markdown (DOMPurify) or plain text; no raw HTML; ANSI parsed safely; ASTROLABE's instruction-shape flags displayed |
| Secret leakage | ASTROLABE redacts before persistence; the Studio never logs payloads; provider secrets never leave the backend (§31.3) |
| Exposure of recovery material | Blob allowlist (§31.4) |
| Path traversal | Blobs addressed by digest only; file endpoints limited to the atlas file list; project paths canonicalized |
| Command injection | The backend never runs a shell with user text; git via argv allowlist (§31.5) |
| Supply chain | Pinned dependencies, lockfiles, SBOM (CycloneDX) for server and web, dependency audit in CI |

### 31.3 Credentials

`StudioCredentialStore` implements AI Gate's `CredentialStore` SPI (`update` is its atomic write path). Values (the SDK's credential JSON per provider id) are stored in the OS vault: Windows Credential Manager (DPAPI) or Linux Secret Service (libsecret), via a maintained keyring library or JNA. If no vault is available, an AES-256-GCM encrypted file whose key lives in the vault; never plaintext. REST never returns secrets — only `Secret.fingerprint()`, type, source (stored or environment) and state. "Use API keys from environment variables" (default on for single-user desktop) maps to `Environment.system()`; off maps to `Environment.none()`.

### 31.4 Blob exposure policy

Served: `OUTPUT`, `LOG`, `DIFF`, `PACKET`, `MODULE`. Never served: `PREIMAGE`, `POSTIMAGE`, anything under `blobs/recovery/` or `native/` (recovery and provider replay material). Responses are capped (5 MB, ranged reads for logs).

### 31.5 Git safety

Read-only allowlist: `rev-parse`, `log`, `show`, `diff`, `for-each-ref`, `cat-file`, `ls-files`, `status --porcelain=v2`, always with `--no-optional-locks` and `GIT_OPTIONAL_LOCKS=0`, a deadline (`gitDeadlineSeconds`) and output caps. Never `checkout`, `reset`, `clean`, `stash`, `commit`, `push`, `fetch`, or any ref update: publication happens only through ASTROLABE's publisher.

### 31.6 Future team/server mode (not v1)

TLS, OIDC login (Spring Security), per-user credential scopes (`CredentialStore.scoped` / `Llm.withCredentials`), `Environment.none()`, authorization per project, decision attribution per user. The protocol already carries the actor on every decision and audit row.

### 31.7 Privacy

No telemetry leaves the machine by default; Studio logs exclude prompts, code and tool output; exports are explicit user actions; the audit log is local.

---

## 32. Packaging and operations

| Mode | Description |
|---|---|
| Development | `./gradlew :studio-server:bootRun` (JDK 26) + `ng serve` with a proxy to the backend |
| Local app (v1) | One executable jar serving the Angular build; a launcher opens the browser at `/launch`; installable PWA (shell caching only, no offline data) |
| Desktop (phase D) | Tauri 2 shell running a jlink'd JDK 26 + server sidecar: native window, folder picker, tray status, OS notifications, single-instance, deep links |

- **Platforms:** Windows 10/11 and Linux x64 (ASTROLABE's process layer); macOS shown as unsupported until ASTROLABE supports it. Git required.
- **Configuration:** `studio.yaml` (data directory, port, log level, default lease, event-log retention, blob cap) with `STUDIO_*` environment overrides; the bind address is always loopback in v1.
- **Logging:** JSON logs, rotation, correlation ids (`workId`, `contextId`, `invocationId`, `requestId`); secrets never logged.
- **Self-observability:** Actuator health and Micrometer metrics on loopback only — WebSocket sessions, items/s, queue depths, journal tail lag, store read wait time, decision latency; optional OTel export, off by default.
- **Upgrades:** Flyway migrations for `workbench.db`; the Studio checks ASTROLABE's store schema version (v4 today) and refuses unknown newer versions with a clear message.
- **Backup:** `workbench.db` plus settings export; ASTROLABE state roots are separate and untouched.

---

## 33. Frontend architecture (Angular)

### 33.1 Stack

| Concern | Choice |
|---|---|
| Framework | Angular, latest stable (v22 line at the time of writing; T-01 pins the exact version): standalone components, signals (`signal`, `computed`, `effect`, `linkedSignal`, `resource`/`httpResource`), **zoneless** change detection, OnPush everywhere, built-in control flow, `@defer` |
| State | NgRx SignalStore (`@ngrx/signals`) + pure reducers |
| Components | Own "Sextant UI" library on Angular CDK (overlay, a11y, menu/listbox, portal, drag-drop); no Material theme |
| Code and diffs | CodeMirror 6 (`@codemirror/view`, `@codemirror/merge`, lazily loaded languages); Shiki (lazy) for Markdown code blocks |
| Markdown | `marked` + DOMPurify (Trusted Types policy) |
| Logs | `@xterm/xterm` (read-only, ANSI) |
| Graph layout | `elkjs` in a Web Worker |
| Charts | uPlot for time series; custom SVG for bars, rings, stacks, timelines |
| Virtualization | `@tanstack/angular-virtual` (variable heights) |
| Icons, fonts | `lucide-angular`; Inter and JetBrains Mono self-hosted |
| i18n | Transloco (lazy scopes, ICU) |
| Tooling | TypeScript strict, ESLint, Prettier, Vitest, Playwright, Storybook |

### 33.2 Source layout

```text
studio-web/src/
  app/
    core/        ws-client · api-client (generated) · session · theme · i18n · keyboard · notifications · errors
    protocol/    generated DTO types (never edited by hand)
    state/       app · projects · campaign (one store per open campaign) · decisions · settings · providers · knowledge · stats · activity
    reducers/    pure functions: campaign stream → ThreadModel · OverviewModel · PlanModel · EvidenceModel (shared by live and replay)
    ui/          Sextant UI components
    features/    shell · sidebar · header · mission-strip · composer · inspector · thread · overview · plan · changes
                 evidence · context · decisions · activity · knowledge · stats · settings · providers · projects · palette
    workers/     elk.worker · diff.worker · replay.worker
  styles/        tokens.css · base.css · themes/{dark,light}.css · code-themes/
```

### 33.3 Data flow

1. **Backfill then live:** opening a campaign loads the nearest reducer snapshot and `GET /campaigns/{work}/events?after=…` pages, then subscribes to `campaign:{work}` with `sinceSeq`.
2. **Reducers:** `reduce(model, item) → model` is pure and deterministic. It also emits an *effects queue* (particles, highlights) consumed by the animation layer; effects are ephemeral and regenerated in replay at playback speed.
3. **Lazy bodies:** blob contents, register versions, manifests, diffs and receipts are fetched on demand (`httpResource`) and cached by id.
4. **Decisions:** the decisions store is fed by the `app` topic and is the single source for the inbox, inline cards and badges.
5. **Memory bound:** at most 50,000 items per open campaign in memory; older ranges are paged in on scroll.
6. **Windows:** a popped-out Overview opens its own WebSocket session and subscribes to the same topic; selection sync uses `BroadcastChannel`.

### 33.4 Performance rules

- Zoneless + signals; `track` in every `@for`; no per-frame signal writes (animation state lives in plain objects inside the canvas component).
- ELK layout and large-diff tokenization in workers; `@defer (on viewport)` for diffs, graphs and charts.
- Bundle budgets: initial ≤ 350 KB gzip (shell + Thread); each lazy feature ≤ 250 KB; CodeMirror languages lazy.
- Targets: first usable view < 1.5 s locally; 55–60 fps scrolling; limits of R-THR-04 and R-OVR-05.

### 33.5 Theming and security

`data-theme` and `data-density` on `<html>` resolved before first paint by a tiny external script (CSP-compatible); tokens from §23. DOMPurify for all Markdown; no unsanitized `innerHTML`; Trusted Types enforced; no `eval`-dependent libraries.

---

## 34. Component specifications

| Component | Inputs | Outputs | States and rules |
|---|---|---|---|
| `sx-status-glyph` | `status`, `size`, `label` | — | Glyph + accessible label; colour from token; never colour-only |
| `sx-id-chip` | `value`, `kind` (work, cell, receipt, stamp, note…) | `open` | Mono; click copies; `Enter` opens drawer |
| `app-mission-strip` | campaign summary signal | `navigate(target)` | "—" + tooltip for unsourced values (R-SHL-03); lease countdown when waiting |
| `app-thread` | `workId` | `openItem` | Virtualized; live pill; filters; search (§8.8) |
| `app-cell-section` | `CellModel`, `expanded`, `live` | `toggle`, `openItem` | Collapses to a result line when ended |
| `app-turn-row` | `TurnModel`, `expanded`, `progress` | `toggle` | Live progress line from `model_progress`; ops grouped Read → Edit → Execute → Metadata |
| `app-tool-card` | `ToolCallView` | `openBlob`, `openItem` | Family templates (§8.6); flags; lazy blob body |
| `app-diff-view` | `from`, `to`, `path`, `mode` | `openEdit` | Unified/split; word diff; virtualization for large files |
| `app-flow-canvas` | `OverviewModel`, effects stream, motion setting | `select(node \| edge \| item)` | Fixed layout; particles; reduced-motion; keyboard navigation between nodes |
| `app-turn-ring` | segment states, `turn`, `turnsMax`, `ctxPercent`, `alpha` | `selectSegment` | Five segments; outer turns arc; inner context arc |
| `app-campaign-rail` | stages, increments | `selectIncrement` | Compression of verified chips; frontier outline |
| `app-register-panel` | `RegisterDto`, previous version | `openEvidence`, `selectVersion` | Change highlight; h→v morph; version slider |
| `app-increment-graph` | graph model | `selectIncrement` | ELK worker layout; frontier; cancelled dashed |
| `app-contract-panel` | contract versions | `compare`, `openAmendment` | Origins, currency, weakening highlight |
| `app-acceptance-matrix` | contract + ledger + receipts | `openReceipt` | Grouped list / matrix toggle |
| `app-decision-card` | `Decision` | `reply`, `decline` | Consequence lines; revision guard (superseded state); shortcuts; focus trap in focus mode |
| `app-verdict-form` | `ReviewRequestDto` | `submit(VerdictDto)` | Enforces `Verdict` invariants (confidence 0–1, signer, missing criterion for insufficient evidence) |
| `app-contract-patch-editor` | amendment proposal, current contract | `submit(ContractPatch)` | Typed edits; diff preview; typed confirmation for weakening |
| `app-context-stack` | segment sizes, α, breakpoints | `openManifest` | Estimates vs provider-reported labels |
| `app-settings-field` | schema node, value, provenance, violations | `change`, `reset` | Provenance badge; inline violations; read-only with gap link where not configurable |
| `app-provider-connect` | provider, `FieldDescriptor`s, auth session | `done` | API key form, OAuth notices/prompts, device code, test step |
| `app-log-view` | project, handle or blob, cursor | — | Follow mode, search, ANSI |
| `app-composer` | context (project, campaign, pending question) | `submit(intent, payload)` | Intents (§9.1), mentions, hints annex, preflight, revision guard |

Every component has Storybook stories for: empty, loading, typical, dense, error, dark and light themes, and reduced motion where relevant.

---

## 35. Testing strategy

| Level | Scope | Tooling |
|---|---|---|
| Reducer golden tests | Recorded campaign streams → expected Thread/Overview/Plan models; parsers for envelope headers, checkpoint lines, register bodies | Vitest, fixtures from fixture-mode runs |
| Replay determinism | Live model at seq *n* equals replayed model at seq *n* for sampled *n* | Vitest |
| Components | All Sextant UI and feature components in all states | Angular Testing Library + Vitest; Storybook interaction tests |
| Visual regression | Stories and key screens, both themes, both densities | Playwright screenshots |
| Backend units | Normalizer, journal tailer, authority bridge (revision checks, decline paths, classification), settings validation mapping, credential store, blob policy, git allowlist, idempotency | JUnit Jupiter |
| Bridge integration | Offline open/run/resume/amend/resolve/reconcile/publish against ASTROLABE test fixtures (`FakeProfiles`, `ScriptedModel`, `FakeAdapter`, fixture repositories) and one campaign through the real `AiGateAdapter` with the SDK's fake provider — the same patterns as `CampaignLoopTest` and `CampaignThroughGateTest` | Kotlin tests |
| Protocol | JSON Schemas, generated TypeScript compiled in CI, WebSocket subscribe/replay/gap/resync/idempotency | JUnit + Vitest |
| End to end | Acceptance scenarios §37 against the backend in **fixture mode** | Playwright |
| Performance | 20,000-item campaign; Overview at 50 events/s; memory ceilings | Playwright traces, custom harness |
| Accessibility | axe-core in component and e2e runs; keyboard-only scenarios; token contrast | axe, Playwright |
| Security | Origin/Host/CSRF, blob allowlist, secret non-exposure in all responses, CSP violations | JUnit, Playwright |
| Live (opt-in, billable) | Real providers, only with an explicit flag and keys, mirroring ASTROLABE's `liveTest` | Separate Gradle task; never in CI by default |

**Fixture mode.** `studio.fixture-mode=true` wires a scripted model through the real `AiGateAdapter` using the SDK's `FakeProvider`/`ScriptedReply` (part of the SDK's main artifact) and fixture repositories; ASTROLABE's `core` test fixtures are used only in automated tests, never on the server's runtime classpath, so the complete UI runs without keys or cost. It is the runnable prototype of phase A, the demo mode, and the e2e environment.

---

## 36. Implementation plan

### 36.1 Rules for every task

- Build on the existing libraries: ASTROLABE core and the **implemented** `:provider-ai-gate` adapter. No task re-implements transport, scheduling, verification, authority or accounting.
- Every task ends with its verification passing on Windows and Linux (ASTROLABE's supported platforms).
- A screen is "done" only when it runs on live data from the backend (fixture mode counts), never on hand-written mock JSON.
- A gap (`G-nn`) is handled exactly as §2.7 says; any deviation is recorded in the decision log (`docs/decisions.md` in the Studio repository).
- UI copy follows the honesty rules (P-03, P-04, R-SHL-03, R-EVD-01).

### 36.2 Dependency graph

```text
T-01 ─▶ T-02 ─▶ T-03 ─▶ T-04 ─▶ T-05 ─┬─▶ T-07 ─┐
            └──────────▶ T-06 ────────┴─▶ T-08 ─┴─▶ [Checkpoint A]
[A] ─▶ T-09 ─▶ T-10 ─┐
[A] ─▶ T-11 ─────────┼─▶ T-12 ─▶ T-13 ─▶ [Checkpoint B]
[B] ─▶ T-14 · T-15 · T-16 · T-17 · T-18 · T-19 (parallel) ─▶ [Checkpoint C]
[C] ─▶ T-20 · T-21 · T-22 · T-23 · T-25 (parallel) ─▶ T-24 ─▶ T-26 ─▶ [Release]
T-27 (upstream proposals) runs in parallel from Checkpoint A
```

### 36.3 Phase A — Foundations and runnable prototype

#### T-01 — Toolchain and skeleton
- **Deliver:** Gradle build with `studio-protocol`, `studio-astrolabe-bridge`, `studio-server`, `studio-web`; ASTROLABE and the SDK as included builds; JDK 26 toolchain; `--enable-native-access=ALL-UNNAMED`; Angular workspace; pinned versions (Angular v22.x, Spring Boot 4.x, Kotlin 2.4.20, kotlinx-coroutines 1.11); CI on Windows and Linux.
- **Verify:** clean build and tests green on both platforms; the server starts; `ng build` passes budgets; a bridge test runs one ASTROLABE fixture campaign (`FakeAdapter`, `ScriptedModel`, fixture repository).

#### T-02 — Protocol
- **Deliver:** Java records for envelopes, items, commands, decisions, DTOs (§28, §30); JSON Schema and TypeScript generation; AsyncAPI description of ASTRO-WS/1; error codes.
- **Verify:** generated TypeScript compiles in CI; schema round-trip tests; a protocol change without regeneration fails CI.

#### T-03 — Host bridge v1
- **Deliver:** `AstrolabeHost` methods for projects, start, resume (G-01), cancel, amend, subscribe, views, register, `journalAfter` (G-08), campaigns list (G-07), blobs with kind allowlist, snapshots, accounting, finish receipt from export (G-04), configurable lease (G-02) and `maxCells`.
- **Verify:** Kotlin integration tests: start → complete; question → decline → `waiting_for_input` → amend → resume → complete (pattern of `CampaignLoopTest`); job-cancel shutdown leaves the campaign resumable (R-BE-01); token cancel ends `Cancelled`.

#### T-04 — Live pipeline and WebSocket gateway
- **Deliver:** EventIngest, Normalizer (bus, journal, derived items for G-03), EventLog and reducer snapshots in `workbench.db` (Flyway), TopicBroker, WS handshake/sub/replay/resync/cmd/ack, REST `/events`, idempotency store.
- **Verify:** ordering per topic; replay from any `sinceSeq`; injected bus drop produces `studio.resync` and no lost journal items; duplicate `idem` returns the first result; load test 200 items/s sustained.

#### T-05 — Fixture mode
- **Deliver:** `studio.fixture-mode` wiring a scripted model **through the real `AiGateAdapter`** using the SDK's testing kit (`FakeProvider`, `ScriptedReply`), plus ASTROLABE fixture repositories; scripted scenarios for S-01 and S-02 (question, D-class approval, plan review, review verdict).
- **Verify:** both scenarios run unattended end to end; recorded streams become the golden fixtures for T-07/T-08.

#### T-06 — Shell and design system
- **Deliver:** tokens and themes (§23), Sextant UI core components with Storybook, shell (sidebar, header, mission strip, tabs, inspector drawer, palette), WsClient with reconnect/resume, stores, routing (§5.3), i18n scaffolding.
- **Verify:** stories for all states in both themes; visual baselines; keyboard navigation of the shell; axe clean; AS-15 (reconnect banner and resume with `sinceSeq`, on the T-04 pipeline).

#### T-07 — Thread v1
- **Deliver:** item catalogue (§8.3), cell sections, turns (live progress), tool cards per family with lazy blobs, gates, boundaries, filters, search, virtualization.
- **Verify:** golden reducer tests on fixture streams; R-THR-02..05; 20,000-item performance run.

#### T-08 — Overview v1
- **Deliver:** rail, flow canvas with the full event→motion mapping (Appendix A), turn ring, turn-history strip, Active-agent card, Reasoning panel (register rendering and transitions), Activity ticker, motion settings, pop-out window.
- **Verify:** every mapped event produces its motion (automated DOM assertions); R-OVR-01..08; CPU budget at 50 events/s; replay determinism test; AS-16.

**Checkpoint A:** a navigable Studio in fixture mode showing a real (scripted) campaign in Thread and Overview; replay determinism green.

### 36.4 Phase B — First real campaign

#### T-09 — Providers and credentials
- **Deliver:** AI Gate `Llm` runtime (§26.6), `StudioCredentialStore` on the OS vault (§31.3), provider list, connect wizard (API key via descriptors; OAuth browser and device code through the `AuthInteraction` relay; keyless local servers; custom endpoints), connection test, `LlmTelemetryListener`, provider-login decisions.
- **Verify:** secrets never appear in any response (automated scan); OAuth flows against a fake IdP in tests; `REFRESH_FAILED` produces a decision; AS-20.

#### T-10 — Models and profiles
- **Deliver:** frozen catalog snapshot and browser; `AiGateProfiles.draft`; profile editor with `gate` block; `AiGateAdapter.violations`/`warnings` in the editor; qualification job with billable confirmation; profile roles and tier table.
- **Verify:** invalid profiles show field-level violations; qualification cannot start without confirmation; qualified state recorded; AS-21.

#### T-11 — Projects
- **Deliver:** add/open/close; repository health; sniffed commands; rules-file discovery and binding; lock handling with holder details; campaign list and index; campaign queue.
- **Verify:** lock held by a second process is reported; unsupported repositories are refused with reasons; binding a rules file updates project settings with digest and provenance.

#### T-12 — Composer and lifecycle
- **Deliver:** intents (§9.1), options, hints annex (G-06), preflight, runtime registry by fingerprint, start/amend/cancel/resume, lease setting, shutdown semantics, display status (§7.2).
- **Verify:** AS-01, AS-11, AS-12; amend shows the new contract version in the Thread.

#### T-13 — Decisions
- **Deliver:** `AuthorityBridge` (§26.8), decision persistence, inbox, inline cards (question, effect, publication, plan acceptance), revision guard, decline semantics, lease countdown, OS notifications, autonomous "policy" entries.
- **Verify:** AS-02..AS-07, AS-14.

**Checkpoint B:** a campaign against a real provider (after the user connects one) from the composer to the finish card, with questions and approvals, surviving reloads and backend restarts.

### 36.5 Phase C — Evidence and control

| Task | Deliver | Verify |
|---|---|---|
| T-14 Plan & Contract | Versions and diff, origins, weakening highlight, ELK graph with frontier, ledger, increment drawer | R-PLN-01/02; the contract view shows the origins produced in AS-07 |
| T-15 Evidence | Acceptance, checks by layer, receipts and logs, reviews, integrity, finish receipt | AS-09, AS-10, R-EVD-01/02 |
| T-16 Changes | Snapshots, diffs, attribution, turn slider, export patch, "ask the agent to revert" | AS-22, R-CHG-01/02 |
| T-17 Context inspector | Manifests, context stack, workset, register history, invocations with provider telemetry | R-CTX-01 |
| T-18 Settings | Schema-driven forms, layers and provenance, validation through the bridge, presets, import/export, roles editor (§19.4), flags page (§19.5), read-only G-13 items | AS-18, AS-19 |
| T-19 Amendments, reconciliation, human review | ContractPatch editor + `resolveAmendment` (G-05), reconcile wizard (G-11), verdict form | AS-08, AS-13 |

**Checkpoint C:** configure, run, inspect, intervene, verify and recover entirely from the UI.

### 36.6 Phase D — Depth and delivery

| Task | Deliver | Verify |
|---|---|---|
| T-20 Knowledge | Inbox, notes, skills, behaviour maps, batches, curator operations, health (G-10) | AS-24 |
| T-21 Statistics | Spend by cache class, outcome economics, spans timeline, provider health, interventions | AS-25, R-STA-01..03 |
| T-22 Publication and multi-agent visuals | Publication form, per-stage approvals, publication window (G-22); S2 satellites; S3 worktree lanes and integrator | AS-23 |
| T-23 Activity | Processes and log tails (G-18), provider calls, jobs, campaign queue | Log follow on a long-running background test process |
| T-24 Quality gate | Accessibility (axe, keyboard-only, contrast of all tokens), Russian locale, performance budgets, security tests (Origin/Host/CSRF, CSP, blob policy), SBOM | AS-26, AS-27 |
| T-25 Replay and export | Scrubber with markers and speeds; campaign bundle export | AS-17 |
| T-26 Desktop packaging | Tauri 2 shell + jlink'd JDK 26 runtime; folder picker, tray, notifications, single instance | Installers for Windows and Linux start, connect and run fixture mode |
| T-27 Upstream proposals (parallel) | Proposals or pull requests to ASTROLABE for G-01, G-02, G-03, G-04, G-05, G-07, G-08, G-10, G-11, G-21; bridge switched to the new APIs when merged | Bridge tests still green after the switch |

**Release:** all acceptance scenarios for claimed capabilities pass (§37), including AS-28 (live), run once with the owner's keys and confirmation.

---

## 37. Acceptance scenarios

Each scenario runs in fixture mode unless marked *live*; *live* scenarios run only with the user's keys and explicit confirmation.

| ID | Given / When / Then |
|---|---|
| AS-01 | Given a connected provider and a repository, when the user starts an S0 campaign from the composer, then the Thread shows the opening boundary, one implementing cell with turns and tool cards, and a finish card whose status comes from the ledger (`completed`). |
| AS-02 | When a cell calls `task.ask`, then a Question card appears inline, in the inbox and as an OS notification; answering with "changes requirements" off records evidence (no new contract version) and the cell continues. |
| AS-03 | Answering with "changes requirements" on creates contract v+1 and a new `U*` bubble; the Plan contract view shows the diff. |
| AS-04 | Declining a question ends the cell blocked and the campaign `waiting_for_input`; Resume (optionally with an amendment) continues the same campaign id. |
| AS-05 | A D-class request shows argv, cwd, expected effect, reason and consequences; approve once runs it; deny records the refusal with the user's reason; nothing is added to the allowlist implicitly. |
| AS-06 | If the contract version changes while a card is open, the card becomes "superseded" and cannot be sent. |
| AS-07 | A plan with three acceptance proposals produces a Plan review card; accepting two and rejecting one adds exactly two items with origin `model · strengthens`. |
| AS-08 | Accepting a weakening amendment requires a typed confirmation and a ContractPatch; the resulting contract diff is shown. |
| AS-09 | When the exit gate refuses completion, the Thread shows exactly the missing items; no "done" appears until `campaign.increment_closed`. |
| AS-10 | An edit after a green receipt turns the acceptance item stale; the next run makes it current again. |
| AS-11 | Cancelling shows the finality warning; the outcome becomes `cancelled`; no Resume is offered. |
| AS-12 | Killing the backend mid-run and restarting shows the campaign Interrupted; Resume records the lost cell and continues; the Thread has no duplicate or missing items (sequence continuity). |
| AS-13 | With `unknownOutcomeReconciliation = Host` and an open intent after a crash, Resume is blocked until the reconcile wizard records evidence. |
| AS-14 | With a short test lease, a pending question outlives the lease: the countdown reaches zero, the campaign stops `blocked_external` at the next dispatch, and "Resume with this answer" works. |
| AS-15 | Dropping the WebSocket shows the reconnect banner; reconnecting resumes with `sinceSeq` without gaps; a forced server-side gap produces a resync. |
| AS-16 | At 50 events/s the Overview stays within the CPU budget; each mapped event produces its motion; clicking an animated element opens its Thread item; reduced motion removes particles. |
| AS-17 | Replaying a finished campaign to position *n* renders the same models as the live render at *n*. |
| AS-18 | Invalid settings (for example reserves summing to ≥ 1, a missing `profileRoles.main`) show inline violations and block Apply; a valid change reports "applies to new campaigns" and a new fingerprint while a running campaign keeps its frozen configuration. |
| AS-19 | The roles editor accepts narrowing a tool mask and rewording persona lines, and rejects widening, raising permission, changing the packet and forbidden wording. |
| AS-20 | A device-code login shows the code, verification link and countdown; Cancel stops the login; success updates the provider state. |
| AS-21 | Qualification cannot start without billable confirmation; its result narrows the profile and marks it qualified. |
| AS-22 | Changes show pre-existing user changes as `U` (never revertable), formatter output as `R` and agent edits as `A`; the exported patch excludes `U` by default. |
| AS-23 | Requesting a local commit raises a publication approval; approval writes `refs/heads/astrolabe/<work>/<attempt>` (never the user's branch) and the ladder shows the highest authorized stage. |
| AS-24 | Knowledge candidates show lint findings; admitting one ADR records the user as signer; rolling back the batch returns notes to the queue. |
| AS-25 | Calls without usage appear as "unknown" in cost and tokens, with coverage text; cost per accepted task is shown when defined. |
| AS-26 | Requests with a foreign `Origin` or `Host` are rejected; no REST or WS payload contains a secret (automated scan); recovery blobs are refused. |
| AS-27 | Scenario S-02 can be completed keyboard-only; axe reports no serious violations; the UI works at 200 % zoom. |
| AS-28 *(live)* | With a real provider key, a qualified profile runs an S0 campaign on a fixture repository to `completed`, and usage and cost appear by cache class. |

---

## 38. Risks, open questions and decisions

### 38.1 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| ASTROLABE internals used by the bridge change | Bridge breaks | Thin bridge, integration tests on ASTROLABE fixtures in CI, pinned versions, upstream facade proposals (T-27) |
| Store lock contention (one connection) | Slower campaigns, UI lag | Event-driven, coalesced, cached reads; measured read wait time; G-17 proposal |
| Bus drops under load | Missing live items | Durable journal tailing + resync; UI shows resync explicitly |
| Human waits exceed the lease | Campaign stops `blocked_external` | Configurable lease (G-02), countdown, one-click resume with the late answer |
| Text-based classification of `resolve` calls | Wrong card type | Conservative default (amendment), tests on all three texts, G-21 proposal |
| Provider behaviour not yet verified live | Surprises in real campaigns | Qualification state per profile; opt-in live smoke; clear labels (§2.6.1, §20.5) |
| Codex subscription login constraints | Login fails on remote or busy port 1455 | Device-code option; explicit warnings |
| macOS unsupported by ASTROLABE's process layer | Users on macOS blocked | Stated in the UI and packaging |
| Overview too heavy on low-end machines | Jank | Calm/Off motion modes, CPU budgets in tests |
| UI overstating progress | Loss of trust | Sourcing rules R-SHL-03, R-EVD-01, R-THR-02 enforced by review and tests |
| No OS vault on some Linux systems | Credential storage | Encrypted-file fallback with vault-held key; clear status |

### 38.2 Open questions for the owner

1. Contribute the facade methods (G-01, G-02, G-05, G-10, G-11) upstream before building the Studio, or ship with the bridge first? *Proposed: bridge first, upstream in parallel (T-27).*
2. Default lease for interactive campaigns? *Proposed: 8 h.*
3. Use API keys from environment variables by default? *Proposed: on for single-user desktop.*
4. Pursue an ephemeral live text preview (G-09)? *Proposed: not in v1.*
5. Desktop shell: Tauri 2 (proposed) or Electron?
6. Russian locale in v1 or a follow-up? *Proposed: v1 (T-24).*
7. Team/server mode timing? *Proposed: after v1.*

---

## Appendix A — Event and journal → UI mapping

"Refresh" names the views or stores invalidated (§26.10). Events marked † are declared in `AgentEvent.kt` but not emitted today in controller-driven campaigns (§2.5.2); the Studio handles them when they appear, and the listed derived item stands in until then.

### A.1 Agent events

| Event (wire name) · key fields | Thread | Overview | Refresh / other |
|---|---|---|---|
| `campaign.opened` · requestId | Opening boundary | CONTROLLER active; rail OPEN ✓ | Contract, campaign index, sidebar |
| `campaign.shape_selected` · shape, inputsRef | Shape line with reason | Rail SHAPE; CONTROLLER badge | Header shape badge |
| `campaign.increment_selected` · incrementId | Increment boundary | CONTROLLER→COMPILER "I2"; rail chip active | Ledger, graph |
| `campaign.increment_closed` · incrementId, status | "✓ I2 verified (R2)" | CONTROLLER→EVIDENCE; rail chip ✓ | Ledger, contract (acceptance `last`), evidence |
| `campaign.finished` · outcome, finishReceiptRef | Finish card | All nodes settle; rail FINISH | All views, finish receipt, campaign index; notification |
| `contract.amended` · version, by | `U*` bubble or amendment line | YOU→CONTROLLER "U3 · v4" | Contract; revision check on open decisions |
| `contract.amendment_proposed` · proposalId, weakening | Proposal line | — | Contract amendments; decision if routed |
| `contract.amendment_resolved` · proposalId, outcome | Resolution line | — | Contract; decision closed |
| `cell.started` · incrementId, role | New cell section | COMPILER→CELL; ring reset; CELL relabel | Cells list |
| `cell.turn_started` · turn, turnsMax | New live turn row | Ring arms Model; outer arc | Mission strip turn |
| `cell.model_requested` · invocationId, estimatedTokens, profileId, anchorTokens | Live progress "requesting" | ROUTER flash; CELL→MODEL | Context stack |
| `cell.model_progress` · stage, textChars, outputTokens, attempt | Progress line (coalesced 250 ms) | MODEL shimmer / retry ring | — |
| `cell.model_responded` · invocationId, stop, usage | Turn duration and output tokens | MODEL→CELL | Budget (debounced) |
| `cell.tool_called` · opId, family, op, phase | Pending tool chip | Particle to ATLAS / WORKSPACE / VERIFIER / KB / satellites / YOU; ring segment | Activity ticker |
| `cell.tool_resulted` · opId, resultAlias, header | Chip status from parsed header | Return particle (tone by status) | Activity ticker |
| `cell.gate_fired` · gate, text | Gate line | Flag badge | — |
| `cell.register_patched` · version, ops | `≡ STATE vN` line | Reasoning highlight | Register of that context |
| `cell.workset_changed` · known, dropped | Note inside the expanded turn | ATLAS "−n stale" | Context workset |
| `cell.rebuilt` · reason, generation | Rebuild marker | Ring fold; COMPILER→CELL | Context |
| `cell.ended` · status, packetRef, manifestRef | Cell result line | CELL→CONTROLLER; ring completes | Cells, manifest |
| `ask.question` · questionId | Question marker (card from the authority bridge) | CELL⇢YOU dashed; YOU pulse | Decisions |
| `ask.answered` · questionId, changesRequirements | Answer line | YOU→CELL | Decisions; contract if amended |
| `blocked` · reason, questionId | Blocked line | CELL ochre | Display status |
| `warning` · kind, text | Muted line | ⚠ on related node | — |
| † `budget.reserved` · reservationId, tokens, purpose | — (aggregated) | Budget arc in Active-agent card | Budget meters · stand-in: `usage` rows |
| † `budget.exhausted` · scope | Line | CONTROLLER red mark | Status, notification · stand-in: campaign outcome, reserve gate |
| `run.reconciled` · actionId, outcome | Reconciliation line | — | Activity, reconcile decisions |
| `delegation.dispatched` · handle, kind, delegatedCost | Delegation item | Satellite appears | Activity |
| `delegation.collected` · handle, status | Item update | Particle back to CELL | Activity |
| `delegation.rejected` · handle, reason | Item update (stale-for-integration etc.) | Satellite red, fades | Activity |
| `kb.proposed` · noteId, kind | Knowledge line | CELL→KB | Knowledge queue badge |
| `kb.admitted` · noteId (host-built `Curator` with the bus) | Knowledge line | KB flash | Knowledge |
| `kb.invalidated` · noteId, reason | Knowledge line | — | Knowledge |
| `span.started` / `span.ended` · status, cost, durationNanos | — | — | Statistics timeline |
| † `edit.applied/rejected/reverted/transformed` | Edit card | WORKSPACE stamp | Changes · stand-in: `derived.edit` |
| † `run.started/output/finished` | Run card, log stream | VERIFIER/WORKSPACE | Activity · stand-in: journal `result` + handles |
| † `check.scheduled/started/finished/stale` | Check line | VERIFIER→EVIDENCE | Evidence · stand-in: `derived.check` |
| † `routing.decided` | Routing chip on cell header | ROUTER label | Statistics · stand-in: `derived.routing` |
| † `recovery.classified/repaired/escalated` | Recovery item | CELL ⟲ mark | Statistics · stand-in: `derived.recovery` |
| † `budget.reconciled` | — | — | Budget |

### A.2 Journal kinds

| Kind | Content used | Thread | Other |
|---|---|---|---|
| `call` | Model output items (message text, native calls, reasoning refs), stop, late evidence, terminal notes | Turn body | Invocation drawer |
| `result` | "call id: line" + refs (result alias, blob digests) | Tool card detail | Blob links |
| `edit-intent` | Intended edit | Pending edit | Changes (pending) |
| `edit-outcome` | Edit alias, paths, preimage digests | Edit card | Changes attribution `A`; `derived.edit` |
| `check` | Receipt id, check id, outcome | Check line | Evidence; `derived.check` |
| `nudge` | Gate text, completion refusals | Gate line | — |
| `boundary` | Turn checkpoint ("turn N status · stamp · STATE vN · open intents"), open/pre-scan/shape, KB injection, pre-compilation, full suite, regression obligations, rebuild, recovery and escalation, publication request/outcome, refactor mode, index tier | Boundary lines; turn footer | Overview rail (full suite, publication); `derived.recovery` |
| `intent` | Intent lifecycle | — | Activity, reconciliation |
| `reconcile` | Reconciliation evidence | Reconciliation line | Decisions |

### A.3 Studio and derived items

| Item | Meaning |
|---|---|
| `studio.opened` | Open finished: reconciliation (unknown outcomes, external changes, handles), snapshot 0 summary |
| `studio.run_ended` | `run` returned: outcome, reason |
| `studio.resync` | Stream repaired from the store after a gap |
| `studio.decision_requested` / `studio.decision_resolved` | Placement of decision cards in the Thread |
| `studio.policy_decision` | Autonomous policy outcome with its rule |
| `studio.publication` | Publication job progress and results |
| `derived.edit` / `derived.check` / `derived.recovery` / `derived.routing` | Stand-ins for G-03 |

---

## Appendix B — Settings inventory

Scopes: **S** Studio defaults · **P** project override · **C** per-campaign option (composer). Unless noted, fields belong to ASTROLABE `Config`/`Defaults` and are validated by `Config.violations()`. The Studio edits the top-level `Config` fields for mode, execution mode, D-class, integrity approval, unknown-outcome reconciliation, ceiling and profile roles; their copies inside `Defaults` are left at SDK defaults.

### B.1 Policy and authority

| Key | Type | Default | Scope | Notes |
|---|---|---|---|---|
| `mode` | `Interactive \| Autonomous` | Interactive | S P C | |
| `executionMode` | `TrustedLocal \| Confined` | TrustedLocal | S P | Confined unavailable (G-14) |
| `dClass` | `Ask \| Deny` | Ask | S P | Autonomous: Ask degrades to deny unless allowlisted |
| `integrityApproval` | `Autonomous \| Human` | Autonomous | S P | |
| `unknownOutcomeReconciliation` | `Host \| Automatic` | Host | S P | |
| `ceiling` | `Patch … Deploy` | Patch | S P C | |
| `rulesFile` | `{path, digest, provenance}` | null | P | Set by "Review & bind" |
| `stateRoot` | string? | OS user-state directory | S P | Project-scoped: decides where the project store opens; changing it reopens the project |
| `redaction.patterns` | list `{kind, regex}` | 9 built-in kinds | S P | Unique kinds; no `: = ]`; regex must compile |
| `redaction.envAllowlist` | set | built-in list | S P | Passed to child processes |
| `redaction.maxBytes` | int | 262,144 | S P | Bytes scanned per capture |
| Studio `autonomousPolicy.acceptNonWeakening` | bool | false | S P | `AutonomousPolicy` |
| Studio `autonomousPolicy.reviewer` | string? | null | S P | |

### B.2 Models and routing

| Key | Type | Default | Scope | Notes |
|---|---|---|---|---|
| `profiles` | map id → `Profile` | empty | S P | Editor §20.5; checked with `AiGateAdapter.violations` |
| `profileRoles.main` / `.helper` / `.escalation` | profile id | `main` / `helper` / null | S P | Must exist in `profiles` |
| `tierTable` | `{version, calibrationDate, profiles{Low, Medium, High, ExtraHigh}}` | `UNTIERED` | S P | Ids must exist |
| `defaults.probeTier` · `reviewTier` · `reviewRoutineTier` | `Tier` | Medium · High · Medium | read-only | Declared, not wired (G-23) |
| Studio `mainEffort` (`CellModel.effort`) | `Minimal \| Low \| Medium \| High` | Medium | S P C | Mapped by the profile's `gate.effort` |
| Studio `maxOutputTokens` (`CellModel`) | int | profile output limit | S P C | 1 … limit |
| Profile `gate.*` | `v`, `api`, `options`, `reasoningHandoff`, `outputCap`, `catalogCheck`, `prefixRetention`, `tokenCount`, `effort` | from `AiGateProfiles.draft` | per profile | §20.5 |
| Function table | `routing-11.1-v1` | — | read-only | G-13 |

### B.3 Budgets, limits and guards (`defaults.*`)

| Group | Fields (default) |
|---|---|
| Campaign | `campaignCells` (12) · `attemptsPerIncrement` (2) · `campaignRecoveryReserve` (0.10) · Studio default campaign tokens (main context limit × campaign cells) · Studio default cost cap (none) |
| Cell | `turnsPerCell` (40) · `turnNudgeFraction` (0.80) · `reserveVerification` (0.15) · `reserveRecoveryAndPersist` (0.05) |
| Context | `alpha` (0.65) · `k` (8) · `m` (6) · `rMaxTokens` (16,000) · `anchorMaxTokens` (2,500) · `immediateStubTokens` (800) · `lookBudgetTokens` (1,500) · `runBudgetTokens` (1,200) · `registerCapTokens` (1,200) · `digestCapTokens` (150) · `digestTokensPerRequirement` (8) · `digestCapCeilingTokens` (2,000) · `patchCapTokens` (400) · `factLineMaxChars` (240) · `seedsMaxTokens` (4,000) · `focusNotesMaxTokens` (300) · `focusZoomMaxTokens` (300) · `touchedInAnchor` (10) |
| Guards | `stallTurns` (3) · `loopIdentical` (2) · `repeatedSignatureRepairs` (2) · `doomLoopSameCalls` (3) |
| Delegation | `probeTurns` (15) · `probeTokens` (40,000) · `reviewLookMax` (10) · `reviewIncrementTokens` (30,000) · `reviewCampaignTokens` (60,000) · `repairCalls` (2) · `writerDepth` (1) · `probeDepth` (2) · `parallelCells` (3) |
| Verification | `checkerTimeBoxSeconds` (20) · `checkerFallbackTimeBoxSeconds` (120) · `theta` (40) · `fullSuiteCadence` (5) · `flakyIsolatedReruns` (1) · `qualityGates` (none; P) |
| Knowledge | `noteBodyMaxTokens` (120) · `noteSummaryMaxChars` (200) · `injectionMaxNotes` (8) · `injectionMaxTokens` (1,500) · `admissionConfidenceMax` (0.6; not wired — `AdmissionPolicy` uses its own `AUTO_ADMIT_MAX_CONFIDENCE` = 0.6) |
| Timeouts | `runTimeoutSeconds` (120) · `gitDeadlineSeconds` (600, ≤ 3,600) · `providerTerminalWaitSeconds` (60) |
| Shape policy | `shapePolicy.smallMaxFiles` (3) · `smallMaxRequirements` (1) · `largeMinFiles` (11) · `largeMinRequirements` (4) · `s3Enabled` (false) · `slackFactor` (1.5) |

Declared, not wired (G-23) — shown read-only: `probeTurns`, `probeTier`, `reviewTier`, `reviewRoutineTier`, `reviewLookMax`, `reviewCampaignTokens`, `runTimeoutSeconds`, `flakyIsolatedReruns`, `injectionMaxNotes`, `injectionMaxTokens`, `noteBodyMaxTokens`, `noteSummaryMaxChars`, `seedsMaxTokens`, `factLineMaxChars`, `campaignRecoveryReserve`, `admissionConfidenceMax`, `m`.

Validation (from `Defaults.violations()` and `ShapePolicy.violations()`): counts > 0; `m`, `theta`, `digestTokensPerRequirement`, `flakyIsolatedReruns` ≥ 0; `alpha`, `turnNudgeFraction` and the three reserves in (0, 1); `admissionConfidenceMax` in [0, 1); `reserveVerification + reserveRecoveryAndPersist < 1`; `gitDeadlineSeconds ≤ 3600`; `smallMax* ≥ 1`; `largeMinFiles > smallMaxFiles`; `largeMinRequirements > smallMaxRequirements`; `slackFactor ≥ 1`.

### B.4 Optional layers (`flags.*`)

`precompile` · `calibrationPrior` · `treeSitterIndex` · `languageService` · `denseRetrieval` · `generatedTools` · `skillsPromotion` · `asyncChecker` · `qaCell` · `l4Gates` · `s3Writers` · `otelExport` · `worthTestEstimate` (all false) · `kbInjection` (`Off \| Frozen \| Live`, Off). Scope S P. Dependencies and availability in §19.5.

### B.5 Roles (`roles.<name>`)

Per declared role (`implementing`, `plan`, `probe`, `review`, `qa`, `writer`, `repair`, `extractor`): `personaLines` (≤ 3), `duties`, `policyTextVersion` — the only fields the runtime applies (G-24). Scope S P. Rules §19.4.

### B.6 Campaign options (composer, scope C)

`CampaignPolicy.tokens` · `CampaignPolicy.cost` · `CampaignPolicy.resumeExpected` · `PublicationRequest{through, remote, mergeTarget, deployTarget{name, production}, knownRemotes, message}` · request annex hints (G-06).

### B.7 Studio runtime and host bridge (Studio-only)

| Key | Default | Notes |
|---|---|---|
| `runtime.leaseDuration` | 8 h | Passed to `Controller(leaseDuration)`; ASTROLABE default is 1 h (G-02) |
| `runtime.maxCells` | = `campaignCells` | Passed to `run(maxCells)` |
| `runtime.autoResumeOnLateAnswer` | off | Off: offer "Resume with this answer"; on: resume immediately with the recorded answer |
| `runtime.decisionReminderMinutes` | 15 | Reminder notifications |
| `runtime.publicationWindow` | until published, dismissed, backend restart or lease expiry | G-22 |
| `runtime.maxConcurrentCampaigns` | 3 | Across projects |
| `runtime.eventLogRetentionDays` | 90 after archive | Replay data |
| `runtime.blobMaxBytes` | 5 MB | §31.4 |
| `providers.useEnvironmentKeys` | on | `Environment.system()` vs `none()` |
| `studio.fixtureMode` | off | SDK `FakeProvider` through the real adapter; fixture repositories |

### B.8 AI Gate transport (Studio scope)

HTTP: `httpVersion` (HTTP_2), proxy, trust store, client certificate, `userAgentSuffix`, `wireLog` (OFF), `insecureSkipTlsVerification` (false, danger). Timeouts: `connect` 10 s, `streamIdle` 5 min, `total` 10 min (local models 5 s / 10 min / 30 min). Retry: `maxAttempts` 3, statuses {408, 409, 429, 503, 529}, `initialBackoff` 500 ms, multiplier 2.0, `maxBackoff` 8 s, `maxRetryAfter` 60 s. Catalog: refresh interval 24 h, feeds on, live listings on, offline off, snapshot file in the Studio data directory. Providers: secret-free `ai-gate.providers/1` entries.

### B.9 Read-only in v1 (not reachable through `Config`, G-13)

Effect-policy command lists and `packageInstallIsDClass`; protected paths and names; capability sets (`workspace-local-test-only`, `workspace-read-only`); human anchors; function table; injection weights; measurement commands; sniffed-command overrides; hard-coded constants (calibration `MIN_VERIFIED` 20 and 30 % failure rate, instruction-shape threshold 3, low-blast-radius limit 3 files, duplicate similarity 0.8, KB index caps).

### B.10 Studio UI preferences (scope S, per user)

Theme, density (compact default), motion, language, UI and code fonts, diff style, time format, composer send key, notifications per kind, sound.

---

## Appendix C — Glossary

| Term | Meaning |
|---|---|
| Campaign (`work_id`) | One user objective executed by the controller: contract, graph, ledger, evidence, knowledge slice, workspace state |
| Attempt (`attempt_id`) | One execution under a frozen configuration; `a1` today |
| Candidate / stamp | Identity of workspace contents: base commit, tracked delta, untracked manifest, environment |
| Cell (`context_id`) | One bounded model loop with one role, for one increment |
| Execution generation | Counter that fences superseded work from publishing |
| Increment | Unit of work with executable acceptance or a named evidence kind; the unit of context, verification and checkpoints |
| Requirement / acceptance (`run`, `check`, `review`) | What must hold, and how it is proven: command, evidence claim, or judgement |
| Origin | Who created an acceptance item: `user`, `harness`, `model` (strengthens only), `amended@vN` |
| Amendment / weakening | A contract change; a weakening narrows or removes an obligation and is never auto-accepted |
| Ledger | Harness-derived requirement status; never written by the model |
| Ready frontier | Increments whose dependencies are satisfied |
| Regression obligation | A green item that must stay green; re-run when its inputs move and at the end |
| Shape S0–S3 | Which machinery is active: one cell · campaign · + probes/reviews/routing · + parallel writers |
| Role | A configuration of the cell runtime (plan, implementing, probe, review, qa, writer, repair, extractor) |
| Turn phases | Read → Edit → Execute → Metadata, executed in that order regardless of emission order |
| Envelope / gauge | Harness-owned result header and the status line closing each tool result |
| Gate / nudge | Harness rule that refuses or advises (exit, entry, pressure, stall, loop, impact, scope, integrity, reserve…) |
| STATE (working register) | Model-maintained, harness-validated plan, facts (`h`/`v`/`x`), dead ends, decisions, open items, focus, amendments, next |
| Workset (KNOWN / NOT SEEN) | Exact source ranges the model has seen at their current versions |
| Context layout `[S][R][K][T][A]` | System · repo prime · compiled increment context · transcript · anchor |
| Manifest | Record of what a compiled context contained or omitted, and why |
| Rebuild | Starting a context from validated state (pressure, resume, role switch, alternative attempt) |
| Receipt | Immutable record binding a check to a stamp, environment, counts, log and input closure |
| Currency / applicability | Whether a receipt certifies the current stamp: `current`, `stale`, `unknown` |
| Reuse proof | Evidence that a receipt still applies because its closure did not change |
| Baseline / pre-existing ledger | Failures present at snapshot 0, recorded so they are not blamed on the agent |
| Test-integrity guard | Classifier that flags edits weakening tests or checks |
| Probe / review / QA / writer / repair cell | Read-only research · independent judge · product exercise · parallel implementer (S3) · capsule repair helper |
| Integrator | Single authority merging S3 results after re-verification |
| Effect class R / W / D | Read-only · workspace write · dangerous (outside workspace, network, installs, git refs…) |
| Execution mode | `trusted-local` (no sandbox) or `confined` (external runner; unavailable today) |
| Permission ladder / ceiling | Patch → local commit → push → merge → deploy; each stage a separate grant up to the ceiling |
| Highest authorized stage | The furthest stage actually approved and reached |
| Human anchor | Condition that always requires a human decision for publication |
| Lease | Time-bounded authority of one controller over a workspace |
| Unknown outcome / reconciliation | An action whose effect is unknown after a crash, and its closure with evidence |
| Shadow ref / snapshot 0 | Per-turn snapshots of the workspace under `refs/astrolabe/…`; turn 0 is the initial dirty state |
| KB note kinds | ADR, CON, LES, PIT, BMAP, NEG, SKILL, STATUS, CAL |
| Admission queue / curator | Where candidate notes wait; the only KB publisher |
| Profile / tier | A provider model with validated capabilities and dated prices / a routing class (Low…ExtraHigh) |
| Cache classes | `uncached_input`, `cache_read`, `cache_write_5m`, `cache_write_1h`, `output` |
| AI Gate | The llm-transport-sdk (`net.ai.gate:ai-gate`) and its ASTROLABE adapter `:provider-ai-gate` |
| Qualification | Billable probing that narrows a profile to observed provider behaviour |
| Fixture mode | Studio mode with a scripted provider and fixture repositories |
| Studio item | One entry of the normalized per-campaign stream |
| Decision | A typed request for human authority shown in "Needs you" |

---

## Appendix D — Implementation kickoff prompt

Copy the block below into the implementing agent's first message.

```text
ROLE
You are the lead engineer implementing ASTROLABE Studio: an Angular frontend and a Spring Boot (Java) backend that
hosts the ASTROLABE coding-agent harness (Kotlin) and its implemented AI Gate provider adapter.

INPUTS
- Specification (authoritative for the Studio): ASTROLABE_UI_OPUS.md — read §0–§2, §26–§37 and Appendices A and B
  before writing code; read the UX sections (§5–§25) for each feature you build.
- ASTROLABE sources: ./ASTROLABE (core, provider-api, provider-ai-gate, index-treesitter). The AI Gate adapter
  (:provider-ai-gate, AiGateAdapter + tests) EXISTS; wire it, never re-implement it.
- AI Gate SDK: ./llm-transport-sdk/llm (net.ai.gate:ai-gate, 0.1.0-SNAPSHOT).

GOAL
Deliver the Studio in the order of §36 (T-01 → T-26), each task with its verification passing on Windows and Linux.

HARD CONSTRAINTS
1. Do not modify ASTROLABE or the SDK. Needed changes are written up as upstream proposals (T-27); until they land,
   use the interim approach of the matching gap G-nn in §2.7.
2. Drive ASTROLABE through the host bridge (§2.8, §26.3): raw Controller, per-campaign Authority, configurable
   lease, resume by reopening with the same ids. Never cancel campaigns through the cancellation token on shutdown
   (R-BE-01).
3. Status shown in the UI comes from events, the ledger and receipts only (P-03, P-04, R-SHL-03, R-EVD-01).
   Unknown stays unknown; stale is never green.
4. Security (§31): loopback only; launch-token session; Origin/Host/CSRF checks; secrets only in the OS vault and
   never sent to the browser; never serve PREIMAGE/POSTIMAGE/recovery/native blobs; git access read-only with the
   allowlist.
5. No billable provider call without explicit user confirmation; automated tests use fixture mode (§35).
6. No screen is complete on mock JSON; it must run on backend data (fixture mode counts).
7. Stack: JDK 26, Spring Boot 4.x, Kotlin 2.4.20 for the bridge, Angular latest stable (v22.x) zoneless with
   signals, NgRx SignalStore, CodeMirror 6, elkjs, xterm.js, Vitest, Playwright, Storybook. Pin exact versions in T-01.

WORKING METHOD
- Keep docs/progress.md (done, decisions, dead ends, next) and docs/decisions.md (any deviation from the spec).
- Per task: plan briefly, implement, run the task's verification, update progress, commit.
- Generate TypeScript types from studio-protocol; never hand-edit generated code.
- Write reducer golden tests from recorded fixture-mode streams before building the Thread and Overview.

FIRST STEPS
T-01 skeleton and CI → T-02 protocol → T-03 bridge v1 with ASTROLABE fixture tests → T-04 live pipeline and WebSocket
gateway → T-05 fixture mode through the real AiGateAdapter with the SDK fake provider → T-06 shell and design system →
T-07 Thread → T-08 Overview → Checkpoint A.

ASK THE OWNER ONLY IF BLOCKED
The open questions in §38.2. Otherwise follow the proposed defaults and record them in docs/decisions.md.

REPORT AT EACH CHECKPOINT
What was delivered, verification output (tests, budgets), deviations with reasons, gaps encountered, next tasks.
```

---

## Appendix E — Source traceability

| Area | Sources read |
|---|---|
| Architecture and concepts | `ASTROLABE/SOTA-BEST-MIXED-AGENT.md`; `docs/architecture/{components,lifecycle,roles-shapes}.md`; `docs/state/contracts.md`; `docs/runtime/{tools,gates-termination,context-layout,register-workset,workspace-editing}.md`; `docs/context/compiler.md`; `docs/operations/{delegation,recovery,routing}.md`; `docs/platform/{adapters,security}.md`; `docs/verification/{scheduler,acceptance-review}.md`; `docs/knowledge/{records,learning}.md`; `docs/economics/costs.md`; `docs/reference/{defaults,glossary,rendered-turn}.md`; `actual_state.md`; `CONTINUE-TASK.md` |
| Host API | `core/.../Astrolabe.kt`; `java/AstrolabeJava.kt`, `java/JavaAuthority.kt`; `campaign/Controller.kt` (`open`, `run`, `publish`, `CampaignPolicy`, `OpenedCampaign`); `campaign/{Lifecycle,Controls,Publications,Publisher,Plan,OptionalLayers}.kt`; `contract/{Contract,Contracts}.kt` |
| Events and state | `event/{AgentEvent,Events,Views,Authority,Authorities,Export,DelegatedCost}.kt`; `evidence/Journal.kt`; `tool/Dispatcher.kt`; `cell/Cell.kt` (journaling, progress relay); `store/{Store,Db,Layout,Migrations,BlobStore}.kt` |
| Configuration | `Config.kt`, `Defaults.kt`, `Mode.kt`, `AttemptConfig.kt`, `ConfigSnapshot.kt`; `cell/{Role,RoleTexts,CellContext}.kt`; `route/*`; `auth/*` (incl. `Redaction.kt`); `kb/*`; `verify/*`; `workspace/*`; `telemetry/*`; `atlas/Sniff.kt` |
| Provider seam | `provider-api/.../{ProviderAdapter,Capabilities}.kt` (`ObservableAdapter`, `InvocationProgress`, `ProviderError`) |
| AI Gate adapter (implemented) | `provider-ai-gate/src/main/**`; tests `AiGateAdapterTest`, `AnthropicProtocolTest`, `ResponsesProtocolTest`, `TranslationTest`, `QualificationTest`, `CampaignThroughGateTest`, `GateTestKit`, `LiveSmokeTest`; `provider-ai-gate/build.gradle.kts` (`liveTest`) |
| AI Gate SDK | `llm/src/main/java/net/ai/gate/{Llm,Provider}.java`; `providers/{Providers,ProvidersConfig}.java`; `auth/*` (`Auth`, `Environment`, `CredentialStore`, interaction types); `catalog/*`; `model/*`; `chat/*`; `event/*`; `config/*`; `error/*`; `testing/*` |
| Fixtures | `core/src/testFixtures/kotlin/io/astrolabe/fixtures/*` (`FakeAdapter`, `FakeProfiles`, `ScriptedModel`, `FixtureRepos`, …); SDK `testing/*` (`FakeProvider`, `FakeServer`, `ScriptedReply`, `RecordingListener`) |
