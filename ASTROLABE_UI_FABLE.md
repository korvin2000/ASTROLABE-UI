# ASTROLABE Console — UI concept, specification and implementation plan

**Codename:** Fable UI concept · **Version:** 1.0 · **Date:** 2026-09-29
**Targets:** ASTROLABE core `0.1.0` (Kotlin 2.4.20, JDK 26, store schema v4, P0–P6 `FIXTURE_VALIDATED`, `:provider-ai-gate` present), AI Gate `net.ai.gate:ai-gate 0.1.0-SNAPSHOT`, Angular (latest stable), Spring Boot (latest stable on JDK 26).
**Status:** specification and plan. No Console code exists yet. Everything stated about ASTROLABE and AI Gate was read from the sources listed in Appendix F; statements about the Console itself are design decisions.

---

## 0. How to read this document

This document is written to be consumed by people and by LLM implementers. It is one self-contained specification: the product concept, the verified architecture findings it rests on, the UI and interaction design, the backend and protocol, the frontend, the implementation plan and the implementation request.

### 0.1 Reading routes

| You want to | Read |
|---|---|
| Understand what is being built and why it is ASTROLABE-specific | §1, §3, §6 |
| Verify a claim about ASTROLABE or AI Gate | §2 (facts), Appendix A (events), Appendix B (settings), Appendix F (sources) |
| Implement the backend | §2, §3, §9, §10, Appendix D, Appendix E |
| Implement the frontend | §4, §5, §6, §7, §10, §11, Appendix E |
| Build the prototype | §8 |
| Plan or track the work | §13, §14 |
| Start implementing right now | §14 (the request), then the routes above |

### 0.2 Conventions

- **Identifiers** are stable and referenced across the document: requirements `REQ-nn`, verified facts `F-nn`, integration gaps `GAP-nn`, owner decisions `OD-nn`, screens `SCR-nn`, protocol messages `msg:<name>`, commands `cmd:<name>`, tasks `T-nn`, risks `RISK-nn`.
- **Code names** are quoted exactly as they appear in the sources (`AstrolabeJava`, `cell.tool_resulted`, `Views.register`). Paths are relative to the repository roots `ASTROLABE/` and `llm-transport-sdk/llm/`.
- **"Verified"** means read from the current sources. **"Gap"** means the current sources do not provide it and the plan says who supplies it. **"Decision"** means a Console design choice.
- **Never invent.** Where ASTROLABE does not emit or store something, the Console shows that it is unknown or unavailable. It never synthesises status, cost, or completion.
- **Vocabulary** follows ASTROLABE's own documents (Appendix C). The Console does not rename campaign, contract, increment, cell, receipt or STATE into generic chat terms.

### 0.3 Scope covered by this document

| Area | Covered in |
|---|---|
| Product concept and design principles | §1 |
| Verified architecture findings, gaps, owner decisions | §2 |
| Domain model, state ownership, read-model rules | §3 |
| UX concept: layout, navigation, entry points, main workflow, composer, attention | §4 |
| Every screen, with data sources, interactions and states | §5 |
| Agent Overview and the animated live workflow | §6 |
| Visual design system (dark/light, density, motion, accessibility) | §7 |
| Prototype: wireframes, storyboards, fixtures | §8 |
| Backend (Spring Boot): architecture, host lifecycle, authority bridge, event archive, projections, providers and auth, settings, persistence, security | §9 |
| Protocol: WebSocket messages, commands, REST resources, DTOs, resynchronisation | §10 |
| Frontend (Angular): structure, state, rendering, graph, diff and log viewers, forms, theming, testing, performance | §11 |
| Cross-cutting rules: authority, errors and staleness, reconnect, accessibility, desktop packaging, observability | §12 |
| Implementation plan: phases, tasks, dependencies, acceptance, risks | §13 |
| Implementation request (the prompt to begin work) | §14 |
| Appendices: event catalog, settings inventory, glossary, DTOs, message catalog, source index | A–F |

### 0.4 Traceability to the brief (`ui_goals.md`)

| Brief requirement | Where it is satisfied |
|---|---|
| Self-contained concept + plan + prototype + request | whole document; §8 prototype; §13 plan; §14 request |
| Detailed description of look, function, settings, entry points, interaction with ASTROLABE | §4–§7 (look/function), §5.16–§5.17 and Appendix B (settings), §4.3 (entry points), §2/§9/§10 (interaction) |
| Backend part: requirements, API, entry points; frontend part | §9–§10; §11 |
| Analyse `SOTA-BEST-MIXED-AGENT.md`, ASTROLABE code and `llm-transport-sdk` | §2, Appendices A, B, F |
| UI optimised for ASTROLABE's architecture, not a Claude Code / Codex clone | §1.2, §3, §4.4–§4.6, §6 |
| Angular + Spring Boot/Java, WebSocket-first with REST | §9–§11 |
| Configure everything configurable: roles, agents, profiles, LLMs, authentication | §5.16, §5.17, Appendix B |
| Statistics, background processes, workflow execution | §5.13, §5.10, §6 |
| Two-pane desktop layout, persistent composer, dedicated Agent Overview with animated live workflow | §4.1, §4.5, §6 |
| Compact, developer-oriented, information-dense, expandable details, dark/light, calm palette, not bloated | §4.7, §7 |

---

## Contents

- 0. How to read this document
  - 0.1 Reading routes
  - 0.2 Conventions
  - 0.3 Scope covered by this document
  - 0.4 Traceability to the brief (ui_goals.md)
- 1. Product concept
  - 1.1 One-paragraph statement
  - 1.2 Why this is not a Claude Code / Codex clone
  - 1.3 Design principles
  - 1.4 Non-goals
  - 1.5 Users and primary scenarios
- 2. Architecture findings: what the Console can rely on
  - 2.1 Entry points (host facade)
  - 2.2 The authority contract (human in the loop)
  - 2.3 The outbound event bus
  - 2.4 Read projections (Views)
  - 2.5 Campaign lifecycle and durable records
  - 2.6 The store: schema v4 and files
  - 2.7 Cells, tools, edits, processes, context, verification, workspace
  - 2.8 Configuration surface (summary; full inventory in Appendix B)
  - 2.9 AI Gate transport and the provider layer (implemented, fixture-validated)
  - 2.10 Vocabulary, invariants and roadmap facts that bind the UI
  - 2.11 Delegation and roles
  - 2.12 Recovery and routing
  - 2.13 Knowledge base, telemetry, exports, evaluation
  - 2.14 Gap register (consolidated)
  - 2.15 Owner decisions requested before Phase B
- 3. Domain model, ownership and the read model
  - 3.1 Entities the Console presents
  - 3.2 State ownership rules
  - 3.3 Read model: liveness from the bus, truth from the store
  - 3.4 Timeline item model (the "conversation")
- 4. UX concept
  - 4.1 Layout
  - 4.2 Navigation and routes
  - 4.3 Entry points
  - 4.4 The main workflow
  - 4.5 The composer (modal by state)
  - 4.6 Attention (the authority protocol as a queue)
  - 4.7 Density, expandability and motion rules
  - 4.8 Keyboard model
- 5. Screens
  - 5.1 SCR-01 Start
  - 5.2 SCR-02 Project
  - 5.3 SCR-03 New campaign
  - 5.4 SCR-04 Timeline
  - 5.5 SCR-05 Agent Overview
  - 5.6 SCR-06 Contract & Plan
  - 5.7 SCR-07 Changes
  - 5.8 SCR-08 Checks & Evidence
  - 5.9 SCR-09 Context
  - 5.10 SCR-10 Processes
  - 5.11 SCR-11 Delegations & Recovery
  - 5.12 SCR-12 Knowledge
  - 5.13 SCR-13 Usage & Routing
  - 5.14 SCR-14 Finish & Publication
  - 5.15 SCR-15 Attention
  - 5.16 SCR-16 Settings
  - 5.17 SCR-17 Connections (AI Gate)
  - 5.18 SCR-18 Diagnostics
- 6. Agent Overview: the live workflow
  - 6.1 Purpose and stance
  - 6.2 Layout
  - 6.3 Station catalog (nodes)
  - 6.4 Edges and tokens (animation mapping)
  - 6.5 Lanes for shapes S1–S3
  - 6.6 What "reasoning progress" means here
  - 6.7 Accessibility and fallbacks
  - 6.8 Acceptance criteria
- 7. Visual design system
  - 7.1 Direction
  - 7.2 Colour tokens
  - 7.3 Typography and spacing
  - 7.4 Components (catalog)
  - 7.5 Iconography
  - 7.6 Charts
  - 7.7 Motion
  - 7.8 Accessibility
- 8. Prototype
  - 8.1 Wireframes
  - 8.2 Storyboards
  - 8.3 Fixture-driven runnable prototype
- 9. Backend (Spring Boot, Java 26)
  - 9.1 Role of the backend
  - 9.2 Stack and constraints
  - 9.3 Modules and packages (io.astrolabe.console.*)
  - 9.4 Harness lifecycle
  - 9.5 Read model implementation
  - 9.6 Settings and configuration assembly
  - 9.7 Providers and authentication
  - 9.8 Host-invoked operations
  - 9.9 Console persistence (console.sqlite)
  - 9.10 Security model (local host)
  - 9.11 Backend requirements (numbered)
- 10. Protocol: WebSocket, commands, REST, DTOs
  - 10.1 Transport choice
  - 10.2 Handshake and subscriptions
  - 10.3 Server → client messages
  - 10.4 Client → server commands
  - 10.5 REST resources
  - 10.6 Core DTOs (condensed; full field lists in Appendix D)
  - 10.7 Event → UI mapping (summary; the full table is Appendix A)
  - 10.8 Flow control and limits
- 11. Frontend (Angular)
  - 11.1 Stack
  - 11.2 Structure
  - 11.3 Protocol client and state
  - 11.4 Rendering rules
  - 11.5 Theming and accessibility
  - 11.6 Performance budgets
  - 11.7 Frontend requirements (numbered)
- 12. Cross-cutting rules
  - 12.1 Trust boundaries and deployment
  - 12.2 Authority rules the Console enforces on itself
  - 12.3 Errors, staleness and reconnect
  - 12.4 Observability of the Console itself
  - 12.5 Desktop packaging
- 13. Implementation plan
  - 13.1 Rules of the plan
  - 13.2 Phases and gates
  - 13.3 Tasks
  - 13.4 Dependency graph
  - 13.5 Verification strategy
  - 13.6 Risk register
- 14. Implementation request
- Appendix A. Event catalog (io.astrolabe.event.AgentEvent)
- Appendix B. Settings inventory
  - B.1 Config (top level)
  - B.2 Defaults
  - B.3 Flags and layers
  - B.4 Profile and the gate block
  - B.5 Roles
  - B.6 Campaign start options
  - B.7 Not configurable through Config (read-only in the UI; OD-03)
  - B.8 AI Gate runtime settings (Console-owned providers.json + Llm.Builder)
  - B.9 Console preferences
- Appendix C. Glossary (UI vocabulary)
- Appendix D. DTO definitions
- Appendix E. Message and command catalog (index and examples)
  - E.1 Index
  - E.2 Examples
  - E.3 Error codes
- Appendix F. Source index (what was read)
  - F.1 ASTROLABE entry documents
  - F.2 ASTROLABE architecture documents (ASTROLABE/docs/)
  - F.3 ASTROLABE core sources (ASTROLABE/core/src/main/kotlin/io/astrolabe/)
  - F.4 ASTROLABE provider modules
  - F.5 AI Gate SDK (llm-transport-sdk/llm/)
  - F.6 Integration and prior-work documents
  - F.7 How to re-verify quickly

---

## 1. Product concept

### 1.1 One-paragraph statement

ASTROLABE Console is a desktop-style web application (Angular in the browser or in a packaged desktop shell, Spring Boot on the same machine) that hosts the ASTROLABE coding-agent harness and the AI Gate transport, and gives one developer a compact, information-dense workplace to open repositories, start and steer campaigns, answer the harness when it asks, watch the live workflow of cells, tools, checks and delegates, inspect every durable record the harness produces (contract, ledger, STATE register, receipts, changes, processes, knowledge, usage), and configure everything ASTROLABE and AI Gate expose. It looks like a modern coding-agent desktop (sidebar, workspace, persistent composer) but it is built around what ASTROLABE actually is: a deterministic campaign controller with a contract, evidence and an authority protocol, not a chat loop.

### 1.2 Why this is not a Claude Code / Codex clone

The familiar chat-agent desktop assumes one transcript, one assistant, tool calls interleaved with prose, and "done" when the assistant says so. ASTROLABE's architecture contradicts each of those assumptions, and the Console follows the architecture. The eight differences below drive the design.

| # | ASTROLABE fact (verified in §2) | Consequence for the Console |
|---|---|---|
| D1 | The unit of work is a **campaign** with a versioned **contract** (requests, requirements, acceptance items, constraints, budget, authorization), not a conversation. The user's text becomes contract requests `U-…`; later text becomes amendments that bump the contract version. | The composer is a **contract composer**, not a chat box: it starts a campaign or amends a contract, and it shows the contract revision it targets. The primary "conversation" view is a **campaign timeline** rebuilt from the durable journal, not a transcript. |
| D2 | The model never assigns status. Tool status, hashes, stamps, usage and acceptance are runtime facts; "done" is a receipt about a stamped candidate. | Status badges, green/red, cost and "verified" come only from receipts, ledger and usage rows. The UI has no place where model prose is rendered as a status. |
| D3 | The harness asks the host through one **Authority** interface with four typed requests: `ask` (question), `approve` (D-class effect), `resolve` (amendment proposal), `review` (verdict). Each reply carries the contract revision and late replies are superseded. | A first-class **Attention** queue with four reply forms, revision stamps and supersession handling replaces "permission popups". Interactive versus autonomous is a campaign policy about who answers, mirrored in the UI. |
| D4 | Roles are configurations of one runtime (implementing, plan, probe, review, qa, writer, repair, extractor); shapes S0–S3 add delegation and parallel writers; every child returns a packet, never a conversation. | The **Agent Overview** shows the shape and the roles as a topology with lanes for delegates, not a single "assistant" bubble. Role overrides are editable within the constraints the code enforces. |
| D5 | The model's reasoning artifact is the **STATE register** (plan cursor, facts h/v/x, dead ends, decisions, open items, focus, amendments, next), model-owned and harness-validated, versioned in the store. | "High-level reasoning progress" is the STATE register, live, with its version history. The Console never claims to show chain-of-thought. |
| D6 | Events carry ids and references, never bodies; the SQLite store (journal, checkpoints, receipts, blobs) and `Views` are the truth. Fourteen declared event types are never emitted; edits, runs, checks, routing and recovery are visible through `cell.tool_*` events, the journal and the store. | The backend treats the event bus as a **liveness signal** and the store as the **read model**: it tails the per-work journal for bodies, resolves refs to blobs and re-reads views on each relevant event. The UI can always be rebuilt from the store after a disconnect or a gap. |
| D7 | Verification is a scheduler with receipts, stamps, applicability (current/stale), baseline and test-integrity flags; publication is a permission ladder (`patch → local-commit → push → merge → deploy`) with separate grants and human anchors. | A **Checks & Evidence** screen and a **Finish & Publication** screen replace a "PR" button. Every check shows the stamp it certifies; every stage shows why it was or was not autonomous. |
| D8 | Configuration is frozen per attempt (`AttemptConfig`), validated by `Config.violations()` and `AiGateAdapter.violations()`, and layered: AI Gate providers and credentials, ASTROLABE profiles and routing, roles, authority, defaults, flags. | Settings are grouped by owner (Connections → Profiles → Routing → Roles → Authority → Budgets → Layers) with live validation and a visible "takes effect at the next attempt" rule. |

### 1.3 Design principles

1. **Truth from the store, motion from the bus.** Every number, status and text body on screen is traceable to a store row, a blob or a view. Events only tell the UI what to refresh and what to animate.
2. **Ask the way the harness asks.** Questions, approvals, proposals and reviews are rendered from `Question`, `DClassRequest`, `AmendmentProposal` and `ReviewRequest` exactly, with their revision. Replies are typed, single-use and revision-checked.
3. **Compact by default, expandable on demand.** One sidebar, one workspace, one composer. Details open inline (expanders, drawers, popovers). No permanent third column; no dashboard sprawl.
4. **Calm surface.** A neutral graphite scale, one accent, and the three semantic colours (ok, warning, error). Colour encodes status only. Phases and roles are labelled with text and icons, never with a rainbow.
5. **Nothing fake.** No spinner without a source event, no "thinking…" prose, no invented cost. Unknown usage is shown as unknown, never zero (ASTROLABE L8).
6. **Resumable at any moment.** Reconnect, reload or reopen the app and the same campaign state reappears from the store and the backend's event archive.
7. **Keyboard-first for the developer.** Command palette, focus order, shortcuts for the composer and attention queue, full accessibility of the workflow graph through an equivalent list.
8. **Respect the harness's authority rules.** The Console never writes ASTROLABE tables, never fabricates approvals, never auto-accepts weakening amendments, never calls an unconfined runner a sandbox, and shows the execution mode label everywhere it matters.

### 1.4 Non-goals

- Replacing ASTROLABE's controller, scheduler, curator or accounting with UI logic.
- Multi-user collaboration on one campaign (the harness is single-writer per project; the Console is single-user per host in v1, with a local auth token).
- A cloud service. The Console runs next to the repository; remote access is a later concern (§12.1).
- Streaming model text token by token. The adapter exposes content-free progress only (§2.8); text appears at turn end from the journal.
- Editing repository files in the Console. It shows diffs and can request a harness-supported revert; it is not an editor.

### 1.5 Users and primary scenarios

- **The developer-operator** (single user): opens a repository, writes a request, chooses interactive mode, answers the harness's questions and approvals, watches the overview, inspects changes and checks, accepts the finish receipt, publishes to a branch. (§4.4, §8.2 storyboards S1–S6)
- **The unattended run**: autonomous mode with a budget and an allowlist; the developer returns to a finished, partial or blocked campaign and reads the finish receipt, the ledger and the reasons. (§8.2 S7)
- **The configurator**: connects providers, drafts and qualifies profiles, sets routing tiers, edits role overrides, adjusts defaults and flags, verifies the effective configuration and its violations before starting. (§5.16–§5.17, §8.2 S8–S9)
- **The auditor**: after the fact, walks receipts, stamps, intents, journal entries and usage per invocation, and exports the derived views. (§5.8, §5.13, §8.2 S10)

---
## 2. Architecture findings: what the Console can rely on

Everything in this section was read from the current sources (Appendix F). Facts are numbered `F-nn`; gaps `GAP-nn`; decisions the owner must make `OD-nn`. Later sections cite these ids instead of repeating the evidence.

### 2.1 Entry points (host facade)

**F-01 Kotlin facade.** `io.astrolabe.Astrolabe(config: Config, adapter: ProviderAdapter, authority: Authority, clock, idGen, layers: OptionalLayers, deployer: Deployer?, estimators: EstimatorFactory, ownsAdapter: Boolean)` (`core/src/main/kotlin/io/astrolabe/Astrolabe.kt`). The constructor throws `InvalidConfig` when `config.violations()` is non-empty.
- `open(repo: Path): Project` acquires the project lock and opens the store; the host closes the `Project`.
- `suspend campaign(project, request: String, policy: CampaignPolicy?, publication: PublicationRequest?): CampaignHandle` opens and starts one campaign; **one campaign per project at a time** (S0 single writer); `IllegalStateException` otherwise. A `null` policy budgets `contextLimitTokens(main profile) × defaults.campaignCells` tokens (D-67). If `publication` is given and the campaign finishes, publication runs immediately after the finish.
- `close()` cancels running campaigns and closes the bus; with `ownsAdapter` it waits up to `defaults.providerTerminalWaitSeconds` and closes the adapter. It blocks; never call it from an authority callback (D-328).
- `events: Events` is the bus for every campaign; `Astrolabe.VERSION = "0.1.0"`, `FIRST_ATTEMPT = "a1"`, work ids are `W-<token>`.

**F-02 Project.** `Project(root, git, store: Store, os: LocalOs)` exposes `views: Views`, `kb: Kb` (`EmptyKb` today) and `close()`. `store` and `os` are public, which is how the backend reads blobs, journal, handles and checkpoints (§2.6).

**F-03 Campaign handle.** `CampaignHandle`: `workId`, `done`, `publication: PublicationRun?`, `events: Flow<AgentEvent>` (this campaign only), `suspend await(): CampaignOutcome`, `cancel()` (interrupts the model call, settles the checkpoint, archives effects), `amend(text): Contract` (recorded against the contract at once, `contract.amended` with `by = "user"`, seen by the running cell on its next turn).

**F-04 Java facade.** `io.astrolabe.java.AstrolabeJava` (`core/src/main/kotlin/io/astrolabe/java/AstrolabeJava.kt`): constructors `(config, JavaProviderAdapter, JavaAuthority, clock, layers, deployer)` and `(config, ProviderAdapter, JavaAuthority, estimators, clock, layers, deployer, ownsAdapter)`; `open(repo)`, `campaign(...)`: `CompletableFuture<JavaCampaignHandle>`, `campaignBlocking(...)`, `subscribe(EventSink): Subscription`, `close()`. `JavaCampaignHandle`: `workId()`, `views()`, `isDone()`, `publication()`, `await(): CompletableFuture<CampaignOutcome>` (cancelling the future cancels the campaign), `awaitBlocking()`, `cancel()`, `amend(text)`, `subscribe(sink)`. Futures complete on SDK worker threads; `EventSink` callbacks run on the bus dispatcher and must not block.

**F-05 Controller is public.** `io.astrolabe.campaign.Controller(config, clock, idGen, events, env, faults, spans, leaseDuration, precompiles, router, extraction, layers, estimators)` with `open(project, CampaignRequest(work, attempt, text), CampaignPolicy): OpenedCampaign`, `suspend run(campaign, model: CellModel, authority, syntax, maxCells): S0Run`, `suspend publish(campaign, run, PublicationRequest, authority, deployer): PublicationRun`. `Astrolabe.campaign` is a ~15-line composition over these calls. `OpenedCampaign` exposes `state: CampaignState?`, `stop`, `cancellation`, `contracts`, `intents: IntentJournal`, `journal`, `reconciliation`, `shape`, `attempt: AttemptConfig`, `lease`. "A reopen passes the same ids." (`campaign/Controller.kt`)

**GAP-01 Reopen, resume and further attempts are not in the facade.** `Astrolabe.campaign` always creates a new `WorkId` with attempt `a1`. Reopening an ended-but-resumable campaign (`waiting_for_input`, `blocked_external`, interrupted `Finishing`) requires `Controller.open` with the same `(work, attempt)`; a further attempt of the same work is refused by the controller ("a new attempt is P2"; `Attempts.next` has no caller). **OD-01:** either (a) add `AstrolabeJava.reopen(project, workId, attemptId, policy?)` and a Java form of `IntentJournal.reconcile` to the core facade, or (b) let the Console backend drive `Controller` directly through a thin Kotlin bridge module. §9.3 recommends (b) for v1 with (a) as the preferred long-term seam.

**GAP-02 Publication after the fact.** The facade publishes only when a `PublicationRequest` was passed at start. Publishing a finished campaign later needs `Controller.publish(campaign, run, request, authority, deployer)` with the still-open `OpenedCampaign` and its `S0Run`. Covered by OD-01(b).

**GAP-03 Host reconciliation of unknown outcomes.** With `UnknownOutcomeReconciliation.Host` (the default) only `IntentJournal.reconcile(intentId, evidence)` lifts the workspace fence, and it is reachable only through `OpenedCampaign.intents` (private in `CampaignHandle`). Covered by OD-01.

### 2.2 The authority contract (human in the loop)

**F-06 Interface.** `io.astrolabe.event.Authority` (`core/src/main/kotlin/io/astrolabe/event/Authority.kt`) and its Java form `JavaAuthority` (`java/JavaAuthority.kt`):

| Method | Request type (fields) | Reply type (fields) | No answer |
|---|---|---|---|
| `ask` | `Question(id, contractRevision, ids, text, options: List<String>)` | `Answer(questionId, contractRevision, text, chosenOption: Int?, changesRequirements: Boolean)` | `null` → the cell ends `blocked` (`blocked{reason,questionId}` event) |
| `approve` | `DClassRequest(id, contractRevision, ids, action, argv, cwd?, expectedEffect, reason, contractAllowlisted)` | `Decision(requestId, contractRevision, approved, reason?)` | not allowed; a future completed exceptionally counts as no answer |
| `resolve` | `AmendmentProposal(id, contractRevision, ids, by: Proposer{Model,User}, change, reason, weakening)` | `Resolution(proposalId, contractRevision, outcome: {Accepted,Rejected,Pending}, byAuthority, reason?)` | not allowed |
| `review` | `ReviewRequest(id, contractRevision, ids, scope: Increment\|Campaign, candidate, packetRef, criteria, originalObligations, diffRef, receipts, rubric)` (`verify/Review.kt`) | `Verdict(requestId, contractRevision, reviewedCandidate, outcome: Approve\|Revise\|Reject\|InsufficientEvidence\|Escalate, findings[Finding(severity Blocker\|Major\|Minor\|Nit, location "path:line@hash", issue, suggestedFix?, kind Correctness\|Contract\|Quality\|TestIntegrity)], coverage(filesReviewed, ranges, unread), contractViolations, confidence 0–1, signedBy, missingCriterion)` | `null` → review `Unavailable` → campaign blocked, never skipped |

**F-07 Rules.** Every reply names the pending item and the contract revision; `Replies.check(replyRevision, currentRevision)` yields `Current` or `Superseded`. `AutonomousAuthority(AutonomousPolicy(acceptNonWeakening = false, reviewer = null))` answers questions with `null`, approves only `contractAllowlisted` requests, rejects weakening proposals, leaves non-weakening proposals `Pending` unless `acceptNonWeakening`, and returns no verdict (`AUTHORITY = "policy:autonomous"`). Weakening proposals are never auto-accepted anywhere. Model proposals through `task.propose` are hard-coded `weakening = true`; plan-intake and curator proposals pass `false` (there is no semantic weakening detector).

**F-08 Where authority is invoked.** D-class runs (`Run.authorize`: ceiling → `Executors.require(executionMode)` → explicit `intent` required → `DClassRequest` with `contractAllowlisted` when the command matches `dClassAllowlist` → `approve`); every publication stage above `patch` (`DClassRequest(id "publish-…", action "publish.<stage>")`); `task.ask` from a cell; `reassessBlocked` at reopen (`Question("unblock-…")`; an answer with `changesRequirements` becomes `amendByUser("Resume <inc>: …")`); campaign review and blocking test-integrity flags under `IntegrityApproval.Human` (`review`). Interactive versus autonomous is `Config.mode`; D-class handling is `Config.dClass` (`Ask` ends the turn with a question in interactive mode, `Deny` refuses with a recorded reason; autonomous degrades `Ask` to a denial unless allowlisted).

### 2.3 The outbound event bus

**F-09 Bus semantics.** `Events` (`event/Events.kt`): `emit` never blocks; each `EventRecord(seq, at, event)` gets a bus-assigned monotonic `seq`; every subscriber has its own buffer (`DEFAULT_BUFFER = 4096`, `DROP_OLDEST`) and first receives the last `DEFAULT_REPLAY = 256` records; a slow subscriber loses its **oldest** pending records, counted in `Subscription.dropped`, and sees the loss as a gap in `seq`; a throwing sink is logged and counted in `sinkFailures`. One `Events` instance serves all campaigns of one `Astrolabe`; filter by `event.ids.work`.

**F-10 Event vocabulary.** `AgentEvent` (`event/AgentEvent.kt`) is a sealed hierarchy with common fields `ids: Identities(work, attempt, candidate?, context?)`, `phase: Phase{Understand, Locate, Edit, Verify, Recover, Retrieve, Compact, Delegate, Plan, Review, Integrate}`, `span: SpanId?`, `parent: SpanId?`. Serial names and payloads are listed in Appendix A.

**F-11 Declared versus emitted.** A repository-wide search of `core/src/main` finds **no emitter** for fourteen declared events: `edit.applied`, `edit.rejected`, `edit.reverted`, `edit.transformed`, `run.started`, `run.output`, `run.finished`, `check.scheduled`, `check.stale`, `routing.decided`, `recovery.classified`, `recovery.repaired`, `recovery.escalated` and `budget.reconciled`. `check.started`/`check.finished` are emitted only by `verify/Checker.kt` (end-of-turn checker); `run.reconciled` only at reopen (`Controller.kt`); `budget.reserved/exhausted` only by `CellBudget`; `delegation.*` only by the `Delegator`. Edits, runs, scheduled checks, routing and recovery are observable through `cell.tool_called` / `cell.tool_resulted` (family, op, header with `class=`, `status=`, `stamp=`), `cell.model_requested.profileId`, and through the journal and store (§2.6, §2.12). The Console's read model is designed around this (§3.3, §9.5).

**F-12 Progress events.** `cell.model_progress{invocationId, stage: started|output|retrying, textChars?, outputTokens?, attempt?}` is emitted only when the adapter is an `ObservableAdapter` (the AI Gate adapter is). It is content-free; model text reaches the store at turn end (journal `call` record). Text deltas are not available through core (D-330).

**F-13 Other emitted values worth knowing.** `campaign.increment_closed.status` is always `"verified"`. `cell.ended.status` is the lowercase `CellStatus{completed, blocked, partial, failed, cancelled}`; `packetRef` is always `null`; `manifestRef` is a `manifests` row id. `cell.rebuilt.reason` is free text (overflow, provider size refusal, capacity, or the pressure gate line). `cell.gate_fired.gate` is the gate name (`entry, exit, pressure, stall, loop, register, stale-fact, impact, contract-touch, repeated-failure, scope, acceptance-surface, reserve, turns`) and `text` is the rendered line. `check.finished.outcome` is `Outcome.name.lowercase()` without underscores (`passed, failed, timeout, infraerror, inconclusive, notrun, unavailable, denied, unknownoutcome`). `blocked.reason` is free text; from `TaskTool` it is one of "no answer is available", "the answer names a different question", "the answer is for contract vN, superseded by vM", "the answer is empty". `campaign.shape_selected.inputsRef` is inline text (`contract:v<N> <ShapeInputs.log> · <ImpactPrescan.log>`), not a reference. `warning.kind` includes `config-frozen` and `calibration`. `span.ended.cost` is `"<currency> <amount>"` or `null` (unknown, never zero).

### 2.4 Read projections (`Views`)

**F-14** `io.astrolabe.event.Views(store)` (`event/Views.kt`) is pure `SELECT` with total ordering: `contract(work): ContractView{contracts, requests, requirements, acceptance, constraints, amendments; latestVersion}`, `ledger(work): LedgerView{increments, entries, sizing}`, `register(context): RegisterView{latest, historyCount}`, `workset(context): WorksetView{exports}`, `checks(work): ChecksView{byCheck: Map<checkId, receipts>}`, `budget(work): BudgetView{invocations, usage rows (invocation_id, profile_id, native, normalized)}`, `receipts(work)`, `finishReceipt(work)`. Every row is a `StoredRow` carrying `work_id, attempt_id, candidate_id, context_id, schema_version, created_at, body` plus its key columns. Receipt rows add `receipt_id, check_id, stamp_before, stamp_after, outcome, raw_blob`.

**GAP-04 Views do not cover everything the UI shows.** No view exists for the journal, cell checkpoints and turns, manifests, handles (background processes), worktrees, blobs by digest, packets by kind, routing log, notes or leases. These are reachable through the public store classes (`Store.blobs`, `SqliteHandles`, `SqliteCheckpoints`, `SqliteManifests`, `ShadowRef.records()`, direct `store.db` queries). `Views.finishReceipt` reads `packets.kind = "finish_receipt"`, which nothing writes; the finish receipt is a `PACKET` blob whose digest is `campaign.finished.finishReceiptRef`, also written to `exports/<work>/finish-receipt.json`. `Export.write(views, work, dir, contexts)` (contract, ledger, checks, budget, receipts, finish receipt, register/workset per context, `summary.md`; byte-deterministic) has no caller in core. **OD-02:** accept that the Console backend reads the store directly (read-only, documented queries, §9.5) or add these projections to `Views` in core. The plan assumes direct reads behind one backend module so a later core seam can replace them.

### 2.5 Campaign lifecycle and durable records

**F-15 Phases and outcomes** (`campaign/Lifecycle.kt`): `CampaignPhase{Opened, Running, Finishing, Ended}`; `CampaignOutcome` wire values `completed, waiting_for_process, waiting_for_input, blocked_external, budget_exhausted, cancelled, failed` (resumable: the three waiting/blocked ones; `waiting_for_process` is never produced today). `CampaignState{work, attempt, contractVersion, phase, graph, ledger, cells[CellState(cell, increment, status)], outcome?, reason?, seq}`; saves must extend `seq` by exactly 1 (`StaleCampaignState`). Transitions: `Reconciled, Dispatched, Returned, Interrupted, Lost, Committed, Planned, Unblocked, IncrementCancelled (never applied), Finishing, Finished, Stopped, Resumed`. Cell statuses `Running, Completed, Blocked, Partial, Failed, Cancelled`; `PartialReason{TurnBudget, TokenBudget, Reserve, Pressure, CompletionStalled}`; increment statuses `Pending, InProgress, Verified, Blocked, Cancelled`; requirement statuses `pending, in_progress, verified, blocked`. Stop reasons are free text (examples: "dispatch refused: …", "the campaign's N cells are spent…", "required review of X unavailable", "final full suite red").

**F-16 Reopen sequence** (`Controller.open`): load or freeze `AttemptConfig` (a changed config emits `warning{kind: config-frozen}`), snapshot 0 or drift (external moves become `Touched(note = "external")`), prescan and contract, load `campaigns`, `Resumed` for `Finishing` or resumable `Ended`, `Unblocked` for blocked increments when the contract version grew, every open intent set to `Unknown` with `run.reconciled{outcome: unknown_outcome}`, background handles re-polled ("polled, never relaunched"), automatic reconciliation of replay-safe or workspace-confined intents only under `UnknownOutcomeReconciliation.Automatic` (`run.reconciled{outcome: auto_reconciled}`), a still-running cell marked `Lost`, `Reconciled`, lease acquisition (`LeaseHeld`, `GrantRefused`), then `campaign.opened` and `campaign.shape_selected`.

**F-17 Contract model** (`contract/Contract.kt`, `contract/Contracts.kt`): `Contract{workId, version, attemptId, mode, shape, requests[UserRequest(id "U-…", at, text)], requirements[Requirement(id, text, acceptance, dependsOn, authorityRef, status)], acceptance[Run(id, command(argv, cwd), origin, scope, last, obligationVersion) | Check(id, text, origin, evidenceRef, obligationVersion) | Review(id, text, origin, signedBy, obligationVersion)], constraints[Constraint(id, text, authority)], exclusions, contractsTouched, scope(writePaths, protectedPaths), budget(cells, turnsPerCell, tokens, attempts, reserves, cost?), authorization(ladderCeiling, dClass, capabilitySet, dClassAllowlist), risk?(blastRadius, reversibility Easy|Hard, contractTouch), amendmentsPending[Amendment(id "AM-…", by, cell?, change, reason, weakening, status Pending|Accepted|Rejected, resolvedBy?)]}`; `Origin` = `user | harness | model(strengthens) | amended(version)`. `amendByUser` appends a request and bumps the version; `resolve` accepted bumps it, rejected drops it. One `contracts` row per version; projection tables `requests, requirements, acceptance(kind), constraints, amendments`.

**F-18 Requirement graph and ledger** (`graph/*`): increments with `dependsOn`, `requirementIds`, `accept`, `writeScope`, `expectedFiles`, `status`, `title`, `sizing(turns, continuations, rebuilds, filesTouched)`, `evidence`; ownership map path → increment; validation codes `UnknownRequirement, UncoveredRequirement, …, DependencyCycle, InvalidOwnership`. `readyFrontier` orders Pending/InProgress increments by depth then id; the controller alone writes `increments`, `sizing`, `ledger` in one transaction with `campaigns`.

**F-19 Finish receipt** (`campaign/FinishReceipt.kt`): `FinishReceipt{work, attempt, contractVersion, outcome, status ("completed" | "partial" for budget_exhausted | outcome wire), reason, stamp, requirements[RequirementLine(id, status, blockers)], acceptance[AcceptanceLine(id, kind, status, stamp, currency, logIds)], changes: ChangeSplit(agent, byRun, preExistingUserChanges, unattributed), acceptanceSurfaceModified, checksRun[CheckRun(checkId, receiptId, outcome, verifierVersion, envId)], notVerified, deadEnds, decisions, adrCandidates, openItems, pendingAmendments, routingDecisions (empty today), budget: BudgetLine(byCacheClass, money, helperShare?), memoryCandidates (empty today), highestAuthorizedStage, equivalence?, review: ReviewLine?, qa[QaRunRecord]}`. Acceptance statuses: run `not_run|green|red|missing_evidence`; check `accepted|not_assessed`; review `approved|not_reviewed`.

**F-20 Publication** (`campaign/Publications.kt`, `Publisher.kt`, `auth/Publication.kt`): `Stage{Patch < LocalCommit < Push < Merge < Deploy}` (wire `patch, local-commit, push, merge, deploy`); `PublicationRequest(through, remote?, mergeTarget?, deployTarget: DeployTarget(name, production)?, knownRemotes, message?)`; `PublicationRun(request, results[Published(stage, commit, target, requestId) | Refused(stage, refusal) | Failed(stage, requestId, detail)], receipt)`; harness branch `refs/heads/astrolabe/<work>/<attempt>`; commit = `commit-tree` of the green snapshot with parent `s0.baseCommit`; push is `git push --porcelain`; merge is a non-force push to `refs/heads/<target>`; `Deployer.deploy(DeployRequest(ids, commit, target)): DeployReceipt(deployed, detail)`. `PublicationPolicy.decide`: stage above the ceiling refused (`ceiling-elevation` anchor), `Patch` autonomous, `DClassPolicy.Deny` refuses all, stamp drift → `unverified-candidate`, otherwise `Approval(autonomous, anchors, unmet)` with unmet conditions blast radius > 3 files or unknown, reversibility not `Easy`, S2+ without judge approval at the stamp, stage above `LocalCommit` not allowlisted; human anchors `interface-contract, data-migration, production-deploy, new-network-access, ceiling-elevation`. Refusal wire values: `masked-op, unknown-op, missing-capability, above-stage-ceiling, stage-not-implemented, confinement-unavailable, protected-content, unverified-candidate, stage-out-of-order, not-approved, user-branch`.

**F-21 Identities.** `WorkId` (`W-…`), `AttemptId` (`a1`, `a2`, …; recovery alternatives `att-…` are journal-only), `CandidateId` (stamp digest), `ContextId` (`cell-…`, `s3-…`, `child-…`), `Generation` (rebuild count), `ExecutionGeneration` (lease reassignment). Journal `seq` and result aliases `#n` are per work. Id prefixes seen: `U, AM, plan, split, unblock, finish, cell, s3, child, att, ev, act, intent, handle, log, rcpt, chk, obs, edit, manifest, evidence, snap, review, crev, irev, q, qa, publish, integration, integrate, repair, span, note, inv, cand, batch, dreq`.

### 2.6 The store: schema v4 and files

**F-22 Layout.** `<Config.stateRoot ?: OS user-state dir>/astrolabe/projects/<repo-identity digest>/` holds `state.sqlite`, `blobs/` (`tmp/`, `recovery/`), `exports/`, `indexes/` (atlas cache), `candidates/` (`worktrees/`, `shadow/`), `logs/` (run logs `<actionId>.log` + `.proc.json`), `campaigns/<work>/<attempt>/attempt-config.json`, `controller.lock` (`LockHolder(pid, startedAt, harnessVersion)`). Nothing is written inside the repository (no `.astrolabe/` directory; `.astrolabe/rules.md` is only a *candidate* rules-file path).

**F-23 Tables** (`store/Migrations.kt`; all carry `work_id, attempt_id, candidate_id, context_id, schema_version, created_at, body`): `blobs(digest, bytes, kind, recovery)`, `journal(event_id, seq, turn, kind; unique(work_id, seq))`, `stamps`, `receipts(receipt_id, check_id, stamp_before, stamp_after, outcome, raw_blob)`, `observations(id, action_id, content_blob)`, `claims(id, kind, evidence_state)`, `intents(intent_id, action_id, status)`, `contracts(work_id, version)`, `requests(id, seq)`, `requirements`, `acceptance(kind)`, `constraints`, `amendments(id, status)`, `increments(id, status)`, `ledger(requirement_id, status)`, `sizing(increment_id, cell_id)`, `cells(context_id, increment_id, status)`, `turns(context_id, turn)`, `manifests(id)`, `register_versions(context_id, version)`, `workset_exports(context_id, id)`, `aliases(alias_no, canonical_id, kind, workspace_id)`, `notes`, `notes_fts`, `note_queue`, `note_usage`, `note_revisions`, `routing_log(function, tier, outcome)`, `usage(invocation_id, profile_id, native, normalized)`, `leases(workspace_id, holder, expiry, execution_generation)`, `handles(handle_id, status, log_path, cursor)`, `packets(id, kind)`, `campaigns(work_id, attempt_id, phase, outcome, seq)`, `attempts(work_id, attempt_id, fingerprint)`. `packets.kind` written today: `plan, increment_split, integration, qa-run, increment-review, behaviour-snapshot, campaign-review, fact-retention, preimage:<ws>:<editId>`. `BlobKind{OUTPUT, PREIMAGE, POSTIMAGE, DIFF, LOG, PACKET, MODULE}`; blobs are content-addressed, written before their row, verified on `get`.

**F-24 Journal.** `JournalEvent(eventId, ids, turn, kind, argsDigest, refs, text, payload, at, seq)` with `kind` serial names `call, result, edit-intent, edit-outcome, check, nudge, boundary, intent, reconcile`; `seq` is monotone per work. The journal is the durable, ordered narrative of a campaign: model outputs (`call`: "turn N model output · stop … · K calls · <head>", native output in the payload), tool results (`result`: "call <id>: <header>"), edit preimages (`edit-outcome` payload = `Preimage` records), receipts (`check`), gate lines (`nudge`), checkpoints and packets (`boundary`: "packet <status> · N changes · R receipts · stamp @h"), intents and reconciliations. §3.3 builds the campaign timeline from it.

**F-25 Reference resolution.**

| Ref on an event | Resolves to |
|---|---|
| `campaign.finished.finishReceiptRef` | hex digest of a `PACKET` blob (`store.blobs.get`) and `exports/<work>/finish-receipt.json` |
| `cell.ended.manifestRef` | `manifests` row (`SqliteManifests.get`) |
| `cell.tool_resulted.resultAlias` (`#n`, or `#-` when nothing new was observed) | `aliases` → canonical id → `observations.content_blob` (`OUTPUT`/`LOG` blob); `look(recall, id=#n)` uses the same path |
| `check.finished.receiptRef` (`chk-…`) | the end-of-turn checker's `LastResult` id; a matching `receipts.receipt_id` is not established (GAP-05) |
| `receipts.raw_blob` | `LOG`/`OUTPUT` blob |
| `TransformReceipt.diffRef`, `CampaignReview.diffBlob` | `DIFF` blob (full redacted unified diff) |
| anchored edits | no diff blob; `PREIMAGE` + `POSTIMAGE` blobs and `packets` kind `preimage:<ws>:<editId>`; the Console renders the diff from the two images (§9.5) |

**GAP-05** `check.finished.receiptRef` does not name a `receipts` row; the Console correlates checks to receipts through `Views.checks(work)` (grouped by `check_id`) and journal `check` entries.

### 2.7 Cells, tools, edits, processes, context, verification, workspace

**F-26 Turn loop** (`cell/Cell.kt`): per turn → `cell.turn_started(turn, turnsMax = CellBudget.turns)`; admission (authority, executor, `budget.startTurn`; a refused generation turn with an admitted check turn is a **reserve turn** where `edit` is masked); render `[A]` and `[S][R][K][T]`; `adapter.validate` and `ContextAdmission`; `cell.model_requested`; `cell.model_progress*`; `cell.model_responded(stop, usage)`; journal `call`; `validateCalls` (schema error, rejected partition, edit on reserve turn, masked op, missing required `state` op refuse **all** calls with `⟦not executed: …⟧` and no `tool_called`); `Dispatcher.dispatch` (`cell.tool_called` → `cell.tool_resulted`), each result journaled; reconcile stamp; end-of-turn checker (`check.started/finished`); layer checks; `cell.workset_changed`; eviction; gates (`cell.gate_fired`, at most 2 nudge lines carried to the next `[A]`); checkpoint `CellCheckpoint(turn, status, registerVersion, stamp, knownFiles, knownTokens, openIntents, touched, unresolvedFlags, journalSeq, reason, rebuilds)` into `cells`, `turns`, `workset_exports` plus a `boundary` journal event; then the next decision (pending `state.blocked`/`task.ask` → `Blocked`; no calls with `EndTurn` → completion proposal judged by `RoleCompletion`; second pressure → `Partial`).

**F-27 Tool vocabulary** (`tool/ToolFamily.kt`, `tool/Args.kt`): `look{tree, outline, read, find, def, refs, importers, impact, recall, bmap, catalog}`, `edit{anchored, create, delete, rename, revert, transform}`, `run{run, poll, cancel}`, `verify{check, tests, acceptance, baseline, review}`, `state{patch, blocked, retrieval_miss}`, `task{ask, delegate, collect, propose}`, `kb{search, get, propose, skill}`. Dispatch order inside a turn: reads (4 in parallel, `rMaxTokens`) → one edit batch behind a shadow snapshot → runs/verifies (only if the batch applied fully; `if: green(op:N)|applied(op:N)`) → metadata. Result header: `⟦result <alias> tool=<tool>[ class=R|W|D][ v={path: h4,…}][ stamp=h4] truncated=yes|no effects=observed|unknown|none[ status=<s>][ flags]⟧`; gauge `⟨ctx P% · reserve ok|reached · checks … · known N/tok · STATE vV · turn T/M⟩`. Status values per family: run process `running exited deadline_exceeded cancelled lost` and outcome `passed failed timeout infra_error inconclusive not_run unavailable denied unknown_outcome`; edit `ok rejected partial refused`; look `ok historical denied failed masked not_found refused unavailable unchanged unsupported`; state `ok rejected blocked masked`; task `answered blocked collected denied dispatched failed masked pending proposed rejected`; kb `ok not_found queued refused unsupported masked`.

**F-28 Effects and capabilities** (`auth/EffectPolicy.kt`, `auth/Capability.kt`): `EffectClass{R, W, D}`; D = privilege, network, package install (configurable), git ref mutation, destructive delete outside tmp, paths outside the workspace or under protected paths, unparseable shell; W = redirects, builders/formatters/test runners, script interpreters (effects unknown), unknown executables; R = known read-only forms. Capabilities `workspace-read, workspace-write, run-local, network, package-install, git-refs, outside-workspace, privilege`; built-in sets `workspace-local-test-only`, `workspace-read-only`. `ExecutionMode{TrustedLocal("trusted-local"), Confined("confined")}`; confined without a backend is refused, trusted-local is never substituted (D-11). Redaction replaces matches with `[REDACTED:<kind>]`, caps at `maxBytes`, hides binary captures; `NativeReplay` and `RecoveryPreimage` content is never rewritten and must never be shown.

**F-29 Edits** (`tool/edit/*`): compare-and-swap on `expect` (hex `FileVersion` digest of raw bytes); errors `stale_expect (with diffSinceExpect), anchor, outside_displayed, scope, missing, overlap, exists, unsupported, divergent, unknown, io`; every op preflighted under `Workspace.mutation`; `Preimages.saveThenWrite` stores `PREIMAGE` (in `blobs/recovery/`) and `POSTIMAGE`; result body `edit #n <status> · <why>` then `✓ i kind path @h8→@h8 +a −r · syntax` lines; `revert:#id` (`Diverged` if the file moved on), `revert:turn:N` via the shadow ref `refs/astrolabe/<work>/<attempt>/<ws>/head` (`Restored | Divergent(paths) | Refused`); `transform` runs alone in its turn and stores a `DIFF` blob. Changed files can be enumerated from `CellCheckpoint.touched`, journal `edit-outcome` payloads, `[A]` Touched, `ResultPacket.changes` (memory only).

**F-30 Processes** (`tool/run/*`, `os/*`): `run(bg=true)` persists `Handle(handleId, ids, actionId, alias, argv, shell, cwd, proc, status, cursor, stampBefore, effectClass, effectsUnknown, …)` in `handles`; raw log at `logs/<actionId>.log` (+ `.proc.json`); redacted `LOG` blob (first slice at launch, full log ≤ 8 MiB at terminal); `run(op=poll, handle, since)` → `Poll(newBytes, nextCursorBytes, status, timedOut)`; the cursor is a byte offset in the log file; `timeout` (default `runTimeoutSeconds = 120`) kills the whole tree → `deadline_exceeded`; `run(op=cancel)` reports `unknown_outcome`; ownership by job object (Windows) or subreaper helper (POSIX); `Os.close()` kills everything it owns; on reopen handles are re-polled, never relaunched. No host API lists or kills processes; `SqliteHandles`, `Project.os` (`reattach`, `poll`, `terminate`) are the public building blocks. **GAP-06** (host-level process listing/kill: backend reads `handles` and the log file; kill goes through `Project.os.terminate` as an explicit, journaled-by-the-Console emergency action, §5.10).

**F-31 Context** (`cell/Layout.kt`, `cell/Anchor*`, `register/*`, `workset/*`): regions `[S]` (role text, mask, mode, error policy), `[R]` prime, `[K]` contract slice + pre-existing ledger + sections (`carry-forward`, `seed-N`, notes), `[T]` pinned texts + native items, `[A]` rebuilt every turn (digest, STATE, `── Workset KNOWN/NOT SEEN`, `── Touched`, checks, `── Focus`, `── Notes`, gauge, ≤2 nudges), capped at `anchorMaxTokens = 2500`. STATE `Register(version, cell, increment, incrementTitle, constraints, plan[marks todo|cursor|done|cancelled], facts, deadEnds, decisions, open, focus, amendments, next)` with ops `plan.add/cursor/tick/cancel, fact.add/refute, deadend.add, decision.add, open.add/close, focus.set, amend.propose, next`; `cell.register_patched` fires only on an applied `state.patch`; read with `Views.register(context)` and `register_versions`. Workset entries `(path, range, version, source Look|PostEdit|Seed|Recall|Transform, turn, resultId, tokens, hidden)`; exports per turn in `workset_exports`. Manifests (`notes, seeds, skills, arithmetic, selectedUnits, omissions, estimatedTokens, actualUsage, boundaryReason done|partial|replan|pressure|resume, outcome`). No rendered request or anchor text is persisted (**GAP-07**: the Console reconstructs "what the model sees" from journal, register, workset, manifest and observation blobs; it labels the reconstruction as such).

**F-32 Verification** (`verify/*`): `Check(id, kind{Syntax, Type, Lint, Unit, Integration, Acceptance, Full, Quality, Review, Product}, selector touched|blast|named|all, inputClosure, costClass{Inline, Fast, Slow, Expensive}, trigger{EveryEdit, EndOfTurn, StepBoundary, RiskAboveTheta, IncrementEnd, CampaignEnd, OnDemand}, acceptanceIds, command, parserPolicy, last)`; receipt `Outcome{Passed, Failed, Timeout, InfraError, Inconclusive, NotRun, Unavailable, Denied, UnknownOutcome}`; applicability `Current|Stale|Unknown` (stale reasons "environment moved: …", "closure unknown; … changed", "closure moved: …"); `Receipt{receiptId, ids, checkId, acceptanceIds, command, cwd, shell, stampBefore, stampAfter, envId, verifierVersion, checkDefinitionVersion, contractVersion, outcome, parsed: Counts?, inputClosure, testedInputs, raw, limits, reuseOf, exitCode, at, closureManifest, expectedExitCode}`; baseline on snapshot 0 under `candidates/` (`PreExisting | New | Changed | Ambiguous`); flaky → third receipt `Inconclusive` with `Limit("flaky")`; `TestIntegrityFlag(path, surface, cause, requiredChecks, kind{unclassified-weakening-risk, deleted-test, weakened-assertion, skip-marker, snapshot-update, check-config, acceptance-command, additions-only}, reason, verdict, originalObligation)`; `blocksCompletion` when required checks exist, kind ≠ additions-only and unapproved; under `IntegrityApproval.Human` only `Authority.review` clears it. `Watcher` (async checker), `MeasurementGate` (L4) and `LanguageService` (tier 2) exist behind flags but are **not wired** into the campaign (**GAP-08**; settings must show them as declared, not active).

**F-33 Workspace** (`workspace/*`): `Workspace(id, root, git, protectedPaths)` (writes denied under `.git .github .gitlab migrations` by default); worktrees `<candidates>/worktrees/wt-<inc≤24>-<hash8>` for S3 writers (`Writer`, `Integrator`, `S3Run`), in-memory list only; `Ownership.claim → Granted | Serialized(behind, reason)`; `ScopeAlgebra` results `Disjoint | Overlap(witness) | Unknown(limit)`.

**F-34 Repository understanding** (`atlas/*`): `Atlas(rows[path, bytes, lang, hash8, exports, imports, testsFor])` cached under `indexes/`; `Outline(path, language, entries, namespace, tier{Lexical 0, Syntax 1, LanguageService 2}, complete)`; `ImportGraph` (`importers`, `testsFor`, `hubs`, `unresolved`); tier-1 `index-treesitter` plug-in via `OptionalLayers.outlines` gated by `Flags.treeSitterIndex`; tier-2 `JavaLanguageService` exists but is not wired (GAP-08). MCP mounts: `Mount(server, tools[MountDescriptor(name, description, inputSchema, readOnlyHint?, destructiveHint?)], localApproval, effectClassOverride, capabilities)`, `Catalog` (frozen, digest), invoked as `run(argv=["mcp:<server>/<tool>", "{json}"])` through `McpClient`/`JavaMcpClient`; **GAP-09**: `Controller` builds `Run` without an MCP transport, so mounted calls return `unavailable` until core passes it through. Generated tools `GeneratedTool(name, version, level ephemeral|project|global, script, effects)` via `ToolRegistry` behind `Flags.generatedTools`.

### 2.8 Configuration surface (summary; full inventory in Appendix B)

**F-35 Config.** `Config` (`Config.kt`) is an immutable `@Serializable data class` with defaults for every field: `defaults: Defaults`, `profiles: Map<String, Profile>` (key = `Profile.id`), `profileRoles: ProfileRoles(main = "main", helper = "helper", escalation = null)`, `mode`, `executionMode`, `dClass`, `integrityApproval`, `unknownOutcomeReconciliation`, `ceiling: Stage`, `rulesFile: RulesBinding?`, `redaction: RedactionConfig`, `stateRoot: String?`, `flags: Flags`, `roles: Map<String, Role>`, `qualityGates: List<Command>`, `tierTable: TierTable`. `violations(): List<ConfigViolation(field, message)>`; helpers `withStateRoot/withProfiles/withFlags/withTierTable`, `role(name)`, `mainProfile`. No file loader exists in core: the host builds `Config` in code or decodes JSON with kotlinx.serialization (property names are the JSON names).

**F-36 Freezing.** At the first open of an attempt the controller freezes `AttemptConfig(harnessVersion, config, roleTextVersions, controls = Controls.ALL, production = true)` into `attempts` (and `campaigns/<work>/<attempt>/attempt-config.json`); a different `Config` at reopen emits `warning{config-frozen}` and is ignored for that attempt (invariant 12). Only `profiles[profileRoles.main]`, `defaults.gitDeadlineSeconds` and `stateRoot` are read live by the facade. Changing configuration therefore means **building a new `Astrolabe`/`Controller` for the next campaign**; nothing changes a running campaign.

**F-37 Roles.** `Roles.defaults` = `implementing, plan, probe, review, qa, writer, repair, extractor`; an override (`Config.roles[name]`) must keep the same name, may not widen `toolMask`, re-grant `deniedNoteKinds`, raise `permission` or change `packetKind`, and must pass `RoleTexts.violations` (D-38, D-161). Role fields (from `Role.kt`): `name, contextView, noteScope, skillFilter, toolMask, permission, tierPrior, duties, askBack, packetKind, personaLines, policyTextVersion, deniedNoteKinds`.

**F-38 Flags and layers.** `Flags` (all `false` except `kbInjection: KbInjection = Off` with values `Off, Frozen, Live`): `precompile, calibrationPrior, treeSitterIndex, languageService, denseRetrieval, generatedTools, skillsPromotion, asyncChecker, qaCell, l4Gates, s3Writers, otelExport, worthTestEstimate`. `OptionalLayers(outlines: OutlineIndex?, dense: Retriever?, tools: ToolRegistry?, mounts: Catalog = EMPTY)` is a constructor argument (host plug-ins), resolved per campaign by `PluggedLayers.of(layers, frozen flags)`. S3 needs both `defaults.shapePolicy.s3Enabled` and `flags.s3Writers`.

**F-39 Profiles and routing.** `Profile(id [A-Za-z0-9._-]{1,128}, provider, model, capabilities: Capabilities(toolSchemaValidation, parallelToolCalls, streaming, nativeCompaction, continuation, cancellation, hostedExecution, outputLimitTokens, contextLimitTokens, caching: CacheCapability(breakpoints, maxBreakpoints?, minimumTokens?, writeClasses), usageFields, schemaDialects), priceTable: PriceTable(date, currency, perMillion: Map<BillingDimension, BigDecimal>), config: JsonObject (holds the `gate` block), latency: Fast|Standard|Slow, stratumOutcomes)`. `TierTable(version, calibrationDate?, profiles: Map<Tier{Low, Medium, High, ExtraHigh}, Set<profileId>>)`; when untiered, the main profile serves every tier (D-108). `FunctionTable.DEFAULT` (`routing-11.1-v1`, not configurable): `Plan` High (never below High), `Implementing`/`Continuation` High (never below Medium), `Probe` Medium, `ReviewCritical` High (never below Medium), `ReviewRoutine` Medium, `Qa` Medium, `Curation` Low, `RepairHelper` Low (max 2 attempts), `Deterministic`. `routing.decided{function, tier, profileId, reason}` records each choice; escalation promotes one tier with `EscalationChange{StrongerModel, ProbeEvidence, NarrowerIncrement, DifferentTool, AlternativeAttempt}`.

**F-40 Not configurable through `Config` today** (settings UI must show them read-only): `dClassAllowlist` and host capability sets (built as `Authorization(config.ceiling, config.dClass, "workspace-local-test-only")`), `EffectPolicyConfig`, `FunctionTable`, `RoutingPolicy` knobs, per-role effort, `CacheSchedule.maxDelay`, `Boundary` delimiters, `InstructionShape` weights. **OD-03:** whether to expose `dClassAllowlist` and capability sets as contract/host configuration (a core addition) in v1.

### 2.9 AI Gate transport and the provider layer (implemented, fixture-validated)

**F-41 Module.** `:provider-ai-gate` (`io.astrolabe.provider.aigate`) is present and is the only module depending on `net.ai.gate:ai-gate` (composite build from `../llm-transport-sdk/llm`, `-Pastrolabe.aiGateBuild=<path>`). `AiGateAdapter(llm: Llm, profiles: Collection<Profile>, ownsLlm: Boolean = false) : ObservableAdapter, AutoCloseable`, `ID = "ai-gate"`; `estimators(text: TokenEstimator): EstimatorFactory`; `warnings()`; static `AiGateAdapter.violations(llm, profiles): List<String>` ("for a settings UI and `Config` checks", non-throwing); `close()` cancels in-flight invocations and closes `llm` only if `ownsLlm`. Wiring (KDoc): `val llm = Llm.builder().provider(...).credentials(CredentialStore.file(path)).catalog { it.offline() }.build(); val adapter = AiGateAdapter(llm, config.profiles.values); val astrolabe = Astrolabe(config, adapter, authority, estimators = adapter.estimators(HeuristicEstimator()))`. Offline evidence AX-01..10 passes; `./gradlew :provider-ai-gate:liveTest` (system property `astrolabe.live=true`, env `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, model overrides `ASTROLABE_LIVE_*_MODEL`) is opt-in and billable and has not been run by the owner yet.

**F-42 Profiles ↔ SDK.** `Profile.provider`/`Profile.model` → `llm.model(provider, model)`; credentials come from the `Llm` runtime's `CredentialStore` and `Environment`, never from the profile. The `gate` block (`Profile.config.gate`, `v: 1`): `api` (must equal `llm.features(model).api()`), `options` (ChatOptions JSON, `ai-gate.options/3` by default; `responseCache` must be bypass; `continueFrom` unsupported), `reasoningHandoff reject|drop`, `outputCap enforced|unsupported`, `catalogCheck fail|warn|off`, `prefixRetention short|long`, `tokenCount local|endpoint`, `effort map|off`; unknown members are errors. `AiGateProfiles.draft(llm, providerId, modelId, id, priceDate): Profile` fills limits, usage fields, caching, prices from the catalog "for a person to review and freeze"; `AiGateProfiles.qualify(llm, profile, cache = false, timeout = 2 min): Qualification(profile, report: ConnectionReport, problems, notes)` is billable (3–5 short calls), narrows `usageFields` and withdraws `breakpoints` when the cache probe fails, and is "never applied to a running campaign".

**F-43 SDK surface used by the Console** (`net.ai.gate`, details in §5.17 and §9.7): `Llm.builder()` (`provider`, `discoverProviders`, `credentials`, `environment`, `defaults`, `catalog`, `http`, `listener`, `tokenizer`, `executor`, `clock`), `Llm.create()`, `Providers.presets()` (13 presets: `openai, openai-codex, anthropic, google, openrouter, deepseek, xai, qwen, mistral, groq, ollama, lm-studio, vllm`; templates `OpenAiCompatible.custom`, `Anthropic.compatible`, `liteLlm`, `azureOpenAi`), `Provider.fields(): List<FieldDescriptor(key, label, kind{TEXT, SECRET, URL, INTEGER, DECIMAL, BOOLEAN, CHOICE, DURATION, JSON}, required, defaultValue, help, group, choices, min, max, unit)>`, `ProvidersConfig` (`ai-gate.providers/1`; `validate(json, presets): List<Problem(path, message)>`), `Auth` (`status(providerId): AuthStatus{state NOT_CONFIGURED|CONFIGURED|EXPIRING|EXPIRED|REFRESH_FAILED, type API_KEY|OAUTH, source, expiresAt, account}`, `methods`, `login(providerId, type, AuthInteraction, CancelToken)`, `save`, `logout`, `revoke`), `AuthInteraction` (`prompt(AuthPrompt{Text, SecretText, Select, Code}): String`, `notify(AuthNotice{OpenUrl, DeviceCode, Info, Progress})`), `AuthInteraction.redirect(redirectUri, sendBrowserTo): RedirectInteraction` (`complete(callbackUri)`, `fail`; answers only `Code` prompts), OAuth flows authorization-code + PKCE (loopback listener or external redirect) and device code (public clients only; `openai-codex` and `openrouter` presets), `CredentialStore.file(path)` (`ai-gate.credentials/1`, owner-only permissions, **not encrypted**), `ModelCatalog` (`all`, `available`, `refresh`, `refreshedAt`; sources bundled `models.json`, `models.dev` feed, live listings, custom), `Model` (`contextWindow`, `maxOutputTokens`, `reasoningLevels`, `capabilities`, `prices`, `parameters(): List<FieldDescriptor>`, `source`), `llm.test(model) { timeout; inferenceProbe; usageFields; toolRoundTrip; cacheRoundTrip }: ConnectionReport{ok, steps[Step(kind CONFIGURATION|NETWORK|AUTHENTICATION|MODEL_ACCESS|INFERENCE|USAGE|TOOLS|CACHE, status PASSED|FAILED|SKIPPED|NOT_SUPPORTED, latency, message, error)], firstFailure}`, `llm.preview(...)` → `PreparedRequest` (`toCurl()`, credentials as `$ENV_VAR`), `llm.describe()` (redacted effective configuration), `LlmListener` events `RequestEvent.Started/FirstOutput/Progress(≤ every 250 ms)/Retrying/Finished(outcome COMPLETED|FAILED|CANCELLED, usage, cost, latency, attempts, warnings)`, `CredentialEvent.Refreshed/RefreshFailed`, `CatalogEvent.Refreshed`; error taxonomy `AuthenticationException, InvalidRequestException, InvalidResponseException, ProviderException, RateLimitedException, RequestCancelledException, RequestTimeoutException, TransportException` with `ErrorCode`s; `FakeProvider` with `pacing(tokensPerSecond)` "for UI tests".

**F-44 Provider SPI facts that shape the UI.** `ProviderError{Transport, RateLimit(retryAfterSeconds?), OutputLimit, Refusal, ExpiredContinuation, InvalidRequest, UnsupportedSchema, MissingUsage, ContextOverflow(reportedInputTokens?), Authentication, Timeout(outcomeUnknown)}`; `StopReason{EndTurn, ToolUse, OutputLimit, Refusal, Cancelled, Truncated}`; `BillableUsage{quantities: Map<BillingDimension, Long>, provenance(provider, model, protocol), unknown: Set<BillingDimension>, native, reasoningIncludedInOutput}` with dimensions `uncached_input, cache_read, cache_write_5m, cache_write_1h, output`; `Money(currency, amount, unknown)`. Anthropic and Google presets have no model listing, so `llm.test` reports `AUTHENTICATION = NOT_SUPPORTED` for them unless a billable inference probe is requested. Login progress reaches only the `AuthInteraction`, never events; the Console must poll `auth().status()` after a flow. The SDK is GPL-3.0-only (its `build.gradle.kts`); **OD-04:** licence compatibility of the Console distribution is an owner decision.

### 2.10 Vocabulary, invariants and roadmap facts that bind the UI

**F-45 Ownership (L9).** The controller commits ledger transitions; the verifier accepts; the curator publishes to the KB; the runner assigns tool status; the model proposes. The Console never writes ASTROLABE tables and never derives authority (§12.2).

**F-46 Invariants the UI must reflect** (from `docs/architecture/principles.md` and companions): status, hashes, stamps, usage and process outcomes are runtime facts (§1.3 #4); only receipts mark verified, `done` is a proposal (§4.1, §5.9, §8.7); weakening amendments are never auto-accepted and a pending proposal grants nothing (§4.1, §8.6); never serve stale as current and never delete evidence (§4.4); unknown outcomes are reconciled before any action that could duplicate an effect (§1.3 #6); `completed` is never disguised and `waiting`, `blocked`, `budget_exhausted`, `cancelled` are never shown as completion (§1.3 #11); never call an unconfined runner a sandbox; never report "delivered" for a patch or "verified" for plausible tests (§14.1, §5.9); a check supports only its recorded candidate (§1.3 #5); every child, retry, rebuild, review and verification consumes the originating work's budget (§1.3 #10).

**F-47 Roadmap and evaluation.** P0–P6 are `FIXTURE_VALIDATED`; every live gate is `UNMEASURED` (P7). The Console must present optional layers (S3, QA cell, precompile, KB injection, dense retrieval, generated tools, OTel export) as "off by default, unmeasured", and must not imply benchmark-validated quality. `eval` (`./gradlew :eval:fixtures`) reproduces core's fixtures and reports per `eval/README.md`.

### 2.11 Delegation and roles

**F-48 Delegator** (`delegate/Delegator.kt`, `delegate/TaskPacket.kt`): `ChildKind{Writer("writer"), Probe("probe"), Review("review")}` (QA is not a child kind); `DispatchMode{Sync, Async}`; `Handle(id "child-…", kind, mode, child: ContextId, lease)`; limits `DelegationLimits(treeBudget, writersDepth = 1, probesDepth = 2, maxParallelCells = 3, leaseTimeout = 30 min)` from `Defaults.writerDepth/probeDepth/parallelCells`; refusals `Cancelled, Depth, Shape (writers only in S3; any kind needs S2+), Parallel, Budget` return `task` status `rejected` with **no event**. Events: `delegation.dispatched{handle, kind, delegatedCost}` (worth-test estimate, advisory), `delegation.collected{status: published|failed}`, `delegation.rejected{reason}` for late results (`child cancelled: …`, `parent superseded: …`, `lease of <id> expired at …`, `published under generation N, dispatched under M`, `published for contract vX, dispatched under vY`). `TaskPacket` carries contract excerpts (≤ 4000 chars each), `readScope`, `writeScope` (writers only), `budgetTokens`, `capabilityCeiling`, `executionGeneration`; never a transcript. Increment- and campaign-scope **reviews run through `ReviewCell`, not the Delegator**: they appear as `cell.started{role: "review"}`, a `packets` row of kind `increment-review` (`ReviewRecord{scope, candidate, verdict, unavailable, reused, path[tiers…, "human"], failedRequiredChecks, integrity}`) and journal rows, with no `delegation.*` event.

**F-49 Roles as the runtime sees them** (`cell/Role.kt`, `cell/RoleTexts.kt`, `delegate/*`): `probe` → `InvestigationPacket(findings[claim, kind observed|inferred, evidence refs], searched(scopes, complete, indexCoverage), unresolved, cost)`, budget 15 turns / 40 000 tokens, summary ≤ 400 tokens; `review` (judge) → `Verdict` (F-06), budget `lookCalls(10)+2` turns and 30 000 (increment) / 60 000 (campaign) tokens, tier ladder Medium → … → ExtraHigh → human; `writer` (S3) → `ResultPacket`, own worktree, 40 turns; `qa` → `QaResult(receipts, cases[QaCase(id, entryPoint(cli|http|browser), steps, expected, observed, passed?, artifacts)], unresolved)` stored as `packets` kind `qa-run`, driven by the **host-invoked** `QaDriver` behind `Flags.qaCell`; `extractor` → note candidates through the host `Extraction` interface (`Extraction.NONE` through the facade); `repair` → `RepairProposal{Fixed, Diagnosis, Escalate}` with ≤ 100-token diagnoses; `plan` → graph, acceptance proposals, increments. Persona lines (≤ 3) per role are the only host-editable wording (`RoleTexts.worded`), versioned as `policyTextVersion#<digest8>` and frozen per attempt.

### 2.12 Recovery and routing

**F-50 Recovery** (`recover/*`, `campaign/Recoveries.kt`, `campaign/Escalations.kt`): `FailureClass{TransportRateLimit, InvalidToolArguments, StaleAnchor, BuildEnvironment, BehaviouralTestFailure, MissingRepositoryContract, RepeatedFailedHypothesis, TruncatedModelResponse, UnknownActionOutcome, LostConstraint, AuthorizationDenial, BudgetExhaustion, SupersededUnit}` with handlers `Adapter, Cell, RepairHelper, Probe, RecoveryLadder, Runner, Compiler, Controller`; the controller classifies verified failures as `BuildEnvironment` (last acceptance check `InfraError`/`Unavailable`) or `BehaviouralTestFailure`. `Ladder.recover`: `Reconcile` → `Retry(attempt, backoff)` (≤ 2, transient, safe) → `Repair` (≤ 1) → `Return(handler, reason)`. Guards `doom-loop (3 same calls), tool-errors (8), request-cap (480), no-progress (3), repeated-signature (2)` yield `Pass | Nudge | Trip` (a trip stops the campaign to ask). Capsule repair (`Capsule`, `Repair.repair`, S2+, `RepairHelper` Low tier, ≤ 2 attempts, 6 turns / 12 000 tokens) ends `Fixed | Diagnosed | Escalated(reason: "not available in <shape>" | "budget" | "no affordable helper profile" | "routing" | "the helper escalated" | "no verified fix in N attempts" | "repair spent")`. Alternative attempts after two same-hypothesis failures (`att-<token>`, chosen by receipts, never by claim). **None of `recovery.classified`, `recovery.repaired`, `recovery.escalated` is emitted**; recovery is visible through journal `boundary` rows with payload `type = recovery-failure | recovery-repair | recovery-repair-completed | alternative-attempt | substantive-attempt` (fields `increment, cell, operation, signature, fix, state, class, detail, recovery reconcile|retry|repair|return`, `outcome fixed|diagnosed|escalated`, `attempt, previous, tier, kept`, `hypothesis, change`) and the pinned lines in the next cell.

**F-51 Routing** (`route/*`): `Router.selectProfile` computes `floor = riskFloor(risk, impact)` (blast radius ≥ 3, `Hard` reversibility or contract touch → High; radius 2 → Medium; fan-in ≥ 20 → High, ≥ 5 → Medium), `requested = max(defaultTier, planSuggestion, previousTier, floor)`, calibration may promote one tier, `tier = max(calibrated, neverBelow, floor)`; exclusion reasons `does not serve tier X`, `not pinned`, `not authorized`, `unavailable`, `output headroom N exceeds its M`, `context A+B does not fit L`, `below the calibrated quality floor`, `needs N tokens; M remain after reserves`, `remaining cost unknown`, `cost unknown at its price table`, `costs X CUR; Y remain after reserves`; winner = lowest expected cost, unknown last; `Routed.Selected(function, tier, effort, profile, conservativeTokens, conservativeCost, expectedCost, excluded, trace, featureClass) | Refused(reason "no affordable profile at tier <T> for <F>: …") | Deterministic`. A refusal in plan/S0/S1 stops the campaign as `budget_exhausted`. **`routing.decided` is never emitted**; the routed profile is visible on `cell.model_requested.profileId`, escalations as `substantive-attempt` journal rows and pinned lines (`escalated to <Tier> (<Change>): <reason>`), and `routing_log(function, tier, outcome)` rows. `CalibrationLog` (promote after ≥ 20 verified rows with > 30 % failures) is in memory only.

### 2.13 Knowledge base, telemetry, exports, evaluation

**F-52 KB records** (`kb/*`): `Note(id "<KIND>-<name>", kind{ADR, CON, LES, PIT, BMAP, NEG, SKILL, STATUS, CAL}, status{candidate, admitted, stale, superseded, deprecated, rejected}, summary ≤ 200 chars, body ≤ 120 tokens, scope{global | subsystem:<s> | path glob | task:<family> | roles:<r>}, anchors[NoteAnchor(path, version?, symbol?)], confidence, basis(requirementRefs, evidenceRefs), validity(dependsOn, lastValidated, invalidationTrigger), supersedes, signedBy, origin(work, cell, extractor, admittedBy), usage(injected, cited, lastCited), modules)`; queue entries `QueueEntry(id "q-…", noteId, status queued|admitted|rejected, batch, findings[LintFinding(rule, detail)], decidedBy, reason)`; lint rules `Duplicate, EvidenceMissing, EvidenceUnresolvable, AnchorUnresolvable, ScopeUnbounded, Contradiction, Secret, OneOffGeneralization`; `AdmissionPolicy`: any finding rejects; Interactive waits for the user; Autonomous admits only anchored `LES`/`PIT` with subsystem/task scope and confidence ≤ 0.6; ADR always waits for `Authority.resolve`. `Skill(id, version, trigger(paths, terms), prerequisites, steps, expectedArtifacts, verification, failureExit, freshness, tokenBudget, modules, invariants, authority)` with per-role `SkillView`; `BehaviourMap(subsystem, root, version, origin, behaviours[name, entryPoints, implementation, callers, tests])` with locators `path::symbol@hash` (`Current | Changed | Unresolved`). `Flags.kbInjection` `Off` (ranked advice dropped, mandatory `CON`/`ADR`/`CAL` still compiled), `Frozen`, `Live`; injection ≤ 8 notes / 1500 tokens, journaled per increment. Derived views `kb/index/global.md`, `contracts.md`, `subsystem-<s>.md`, `kb/notes/<id>.md`; SQLite canonical.

**F-53 Host-invoked APIs the controller never calls** (the Console backend is the host that runs them): `Curator(store, estimator, idGen, clock, resolver, redaction, events)` with `admit(ids, AdmissionMode)`, `admitWith(ids, authority, contractRevision)` (each candidate goes through `Authority.resolve` as an `AmendmentProposal`), `rollback(batchId)`, `supersede`, `deprecate`, `recheck`, `prune`, `promote`, `regenerate` (emits `kb.admitted`, `kb.invalidated`; marking `stale` emits nothing); `QaDriver` (behind `Flags.qaCell`); `event.Export.write`; `telemetry.Export(store, config).write(work, acceptedTasks, currency, spans?)` → `usage.json`, `accounting.json`, `otel-spans.json` (with `Flags.otelExport`); `Economics.report/export` → `economics.md`; `KbHealth.of`; `PromotionProposals.export` → `promotion-proposals.json`; `KbExport.appendRaw`. The controller itself writes only `finish-receipt.json`, `kb/notes/STATUS-<work>.md` and store rows. Through the facade `Extraction` stays `Extraction.NONE` and `Spans` is private (only `span.*` events reach the host); the controller opens spans only for `Phase.Plan` (campaign run) and `Phase.Edit` (one per cell).

**F-54 Statistics and where they come from** (`telemetry/*`): `CellMetrics.of(cell, records, …)` from events (tokens by billing dimension, model calls, tool calls, tool seconds, checks by layer, gates fired, rebuilds, turns, boundary reason, anchor tokens); `CampaignMetrics.of(work, records, cost)` (cost per accepted task, first-attempt pass rate, verified/blocked/cancelled, continuations per increment, rebuilds per cell; several fields declared but always `null`: `boundaryCostShare, probes, reviews, escalations, alternativeAttempts`); `Accounting.calls(work)` → `CallAccount(invocationId, ids, profileId, usage, money, priceTableDate, quantities{bytesTransmitted, modelVisibleInput, billedUsage, durableState}, warm, at, fundedTokens, fundedMoney)` from the `usage` table, `Accounting.totals(calls, accepted, currency)`; `Economics.report` (per-cell tokens, live tokens, rebuilds, calls, money, boundary share, anchor share, tokens by cache class, break-even at `DEFAULT_RHO = 0.1`, `liveGate` "UNMEASURED"); `Spans.analyze(work)` / `TraceAnalytics` (inclusive costs, critical path, concurrency bands; `span.started/ended` live); `PrecompileMetrics.report()` (only with `Flags.precompile`); `KbHealth.of` (candidates, admitted, rejected, waiting, admission rate, injections, cited rate, stale injections, repeated mistakes, index freshness, locator validity); `CalibrationStats.aggregate` (per band: completed, failed, cancelled, overruns, turns median; `warning{calibration}`); `Delegator.budget` (tree spend, held, overrun, capacity). Money is `BillableUsage.price(profile.priceTable)`; a missing or unpriced dimension yields `Money.unknown = true`, never zero. Per-profile totals are not built in (group `calls(work)` by `profileId`). `budget.reconciled` is never emitted; `budget.reserved/exhausted` come from `CellBudget` only.

**F-55 Evaluation** (`eval/*`): offline only. `./gradlew :eval:fixtures` runs `io.astrolabe.eval.FixtureRunner` (`--package`, `--class`, `--report FILE`, `--junit-xml DIR`, `--configuration LABEL`, `--param K=V`; exit 0 green / 1 otherwise / 2 usage) and writes `report.json` (`kind "astrolabe.fixture-report/1"`, `configuration`, `counts{tests, passed, failed, skipped}`, `green`, `invariantsZero`, `containerFailures[]`, `invariants[{invariant, tests, violations|null}]` for the seven invariants `ordinary anchored edits to unseen content`, `destructive missteps`, `silent acceptance changes`, `stale bodies served as current`, `unauthorized-stage publications`, `late superseded results merged`, `false-green incidents`, `results[{class, name, status, fixtures[], message}]`); `null` violations means unmeasured. `LiveGates.all()` are `UNMEASURED`; `Scorecard.eligibleScore = 0.60·quality + 0.40·economy`.

### 2.14 Gap register (consolidated)

| Id | Gap | Supplied by |
|---|---|---|
| GAP-01 | Reopen / resume / further attempt not in the facade | OD-01 (core facade addition or Console Kotlin bridge over `Controller`) |
| GAP-02 | Publication after finish not in the facade | OD-01 |
| GAP-03 | Host reconciliation of unknown intents not reachable from the facade | OD-01 |
| GAP-04 | `Views` lack journal, checkpoints, manifests, handles, blobs, packets, routing log, notes; `Export.write` uncalled | OD-02; Console read-only store module (§9.5) |
| GAP-05 | `check.finished.receiptRef` is not a receipt id | Console correlates through `Views.checks` and journal `check` rows |
| GAP-06 | No host API to list or kill background processes | Console reads `handles` + log files; kill via `Project.os.terminate` with explicit confirmation |
| GAP-07 | Rendered context is not persisted | Console reconstructs and labels it |
| GAP-08 | `Watcher`, `MeasurementGate`, `LanguageService` declared but not wired | Settings show "declared, not active"; no UI for their results in v1 |
| GAP-09 | MCP transport not passed to `Run` by the controller | Core change (owner); Console mounts UI is present but marked inactive until fixed |
| GAP-10 | Fourteen declared event types are never emitted: `edit.applied/rejected/reverted/transformed`, `run.started/output/finished`, `check.scheduled/stale`, `routing.decided`, `recovery.classified/repaired/escalated`, `budget.reconciled` | Console derives edits, processes, check scheduling, routing and recovery from `cell.tool_*`, `cell.model_requested.profileId`, journal `boundary` payloads and store rows; Appendix A marks each |
| GAP-11 | No text streaming from the model through core | Console shows content-free progress; optional adapter-local delta listener is a later owner decision (OD-05) |
| GAP-12 | No `Config` loader; no runtime config change | Console owns config files and builds `Config` per campaign start (§9.6) |
| GAP-13 | Allowlists and capability sets not in `Config` | OD-03 |
| GAP-14 | Credential store unencrypted; auth status changes are not events | Console documents the storage, polls `Auth.status` after flows, keeps secrets write-only in the UI |
| GAP-15 | Curator, QA driver, telemetry/economics/KB-health exports and `event.Export` are host-invoked and never run by the controller; `Extraction` cannot be injected through the facade | The Console backend runs them as the host (§9.8); model-driven extraction stays off until a facade seam exists (OD-07) |
| GAP-16 | Delegation refusals, integration outcomes, review-cell reviews and KB staleness produce no events | Console reads `task` tool results, `packets` (`integration`, `increment-review`, `campaign-review`), `note_revisions` and journal rows |

### 2.15 Owner decisions requested before Phase B

| Id | Decision | Recommendation |
|---|---|---|
| OD-01 | Facade additions (`reopen`, `reconcile`, `publish` after finish, `nextAttempt`) versus a Console-side Kotlin bridge over `Controller` | Bridge in v1 (no core change needed to start); propose the facade additions as a small core PR once the bridge stabilises |
| OD-02 | Direct read-only store access from the Console versus new `Views` | Direct access behind one module with documented queries; contribute views later |
| OD-03 | Expose `dClassAllowlist` and capability sets through `Config` | Defer; show read-only in v1 |
| OD-04 | GPL-3.0 licence of AI Gate versus the Console's licence | Owner |
| OD-05 | Adapter-local text-delta listener for the UI (never through core) | Defer; measure demand after v1 |
| OD-06 | Where the Console stores its own state (settings, projects, event archive, pending interactions) | `<stateRoot>/astrolabe/console/console.sqlite` next to the project stores (§9.9) |
| OD-07 | Facade seams for `Extraction`, `McpClient`, `QaHttpLauncher` and a host `Spans` handle | Small core PR after v1; the Console keeps those features visibly inactive until then |

---
## 3. Domain model, ownership and the read model

### 3.1 Entities the Console presents

The Console's domain model is ASTROLABE's, plus a thin layer of Console-owned records (settings, project registry, pending interactions, archived events). Nothing in the ASTROLABE column is created or modified by the Console.

| Entity | Owner | Identity | Source of truth | Console record |
|---|---|---|---|---|
| Host (one running backend with one `Astrolabe`/`Controller` per configuration revision) | Console | host id | backend memory | `host` |
| Project (an opened repository) | ASTROLABE `Project`; registry by Console | repository path → repo identity digest (F-22) | project lock, `state.sqlite` | `projects` |
| Configuration revision (effective `Config` + AI Gate providers + credentials) | Console | `configRevision` (hash of the assembled `Config` JSON, F-35) | Console settings files | `settings_revisions` |
| Campaign (= work + attempt) | Controller | `WorkId`, `AttemptId` | `campaigns`, `contracts`, `attempts` | `campaigns` (registry only) |
| Contract version | Controller | `(work, version)` | `contracts` + projections | — |
| Increment | Controller | `(work, incrementId)` | `increments`, `ledger`, `sizing` | — |
| Cell / context | cell runtime | `ContextId` | `cells`, `turns`, `register_versions`, `workset_exports`, `manifests` | — |
| Turn | cell runtime | `(context, turn)` | `turns`, journal rows with `turn` | — |
| Journal entry | runner/controller | `(work, seq)` | `journal` | — |
| Tool call / result | runner | journal `call`/`result`, alias `#n` | `journal`, `aliases`, `observations`, blobs | — |
| Edit | runner | `editId`, preimage packet | `packets(preimage:*)`, `PREIMAGE`/`POSTIMAGE` blobs, journal `edit-outcome` | — |
| Process (background run) | runner | `handleId` | `handles`, `logs/<actionId>.log`, `LOG` blobs | — |
| Check / receipt | scheduler/verifier | `checkId`, `receiptId` | `receipts`, journal `check` | — |
| Delegation (child cell) | Delegator | handle `child-…`, child `ContextId` | events, `cells`, `packets` | — |
| Review record | review cell / host review | packet id | `packets(increment-review, campaign-review)` | — |
| Recovery record | controller | journal seq | journal `boundary` payloads (F-50) | — |
| Note / skill / behaviour map | curator | note id | `notes`, `note_queue`, `note_revisions`, `note_usage` | — |
| Usage / cost | runner / accounting | `invocationId` | `usage` table, `span.*` events | — |
| Finish receipt | controller | blob digest | `PACKET` blob, `exports/<work>/finish-receipt.json` | — |
| Publication run | publisher | `(work, attempt)` | journal `boundary` (`publication-request/outcome`), git refs | — |
| Pending interaction (question, approval, proposal, review) | Console authority bridge (the harness holds the future) | interaction id = the request id | Console DB (`interactions`) | `interactions` |
| Archived event | Console | `(work, seq)` | Console DB (`events`) | `events` |
| Command | Console | `commandId` (client UUID) | Console DB (`commands`) | `commands` |
| Provider connection / credential | AI Gate | provider id | `providers.json`, `credentials.json` (SDK `CredentialStore.file`) | — |
| Profile | ASTROLABE `Profile` in Console config | profile id | `astrolabe.json` (Console-managed) | — |

### 3.2 State ownership rules

1. **ASTROLABE tables are read-only for the Console.** Every write to a campaign goes through `Astrolabe`/`Controller` calls (`campaign`, `amend`, `cancel`, `publish`, authority replies) or host-invoked APIs designed for hosts (`Curator`, `Export`, `telemetry.Export`, `Economics`). The backend opens `state.sqlite` only through ASTROLABE's `Store` (`Project.store`) to inherit its locking and snapshot semantics (`store.db.snapshot`).
2. **Configuration is Console-owned until it is frozen.** The Console assembles `Config` from its settings files, validates it, and hands it to a new `Astrolabe` instance. From the first open of an attempt the frozen `AttemptConfig` in `attempts` is the truth for that attempt (F-36); the Console shows the frozen snapshot, not the current settings, when displaying a campaign's configuration.
3. **Pending interactions are Console-owned records of harness-owned futures.** The harness waits on the authority future; the Console persists the request so a reload or reconnect can still answer it; a reply is single-use; a reply for a superseded contract revision is rejected before it reaches the harness (`Replies.check`).
4. **The event archive is a cache of the bus, never a second truth.** Gaps are detected by `seq` and repaired from the store (F-09); after a restart the archive is rebuilt from the store's journal where the mapping is deterministic (§9.5) and marked `reconstructed` otherwise.
5. **Usage and cost are shown as recorded**: native and normalized side by side (`usage` table), `unknown` when `Money.unknown` or a missing dimension; totals never sum unknowns into zero.

### 3.3 Read model: liveness from the bus, truth from the store

Because events carry ids and refs only (F-10), fourteen declared events are never emitted (GAP-10) and the journal is the ordered narrative (F-24), the Console's read model has three layers:

| Layer | Source | Latency | Used for |
|---|---|---|---|
| **Live signals** | `EventRecord` stream (F-09) | milliseconds | animation, counters, "what to refresh", progress meters, attention arrival |
| **Narrative** | `journal` rows per work (`seq`, `turn`, `kind`, `text`, `payload`, `refs`) tailed after each event batch | tens of milliseconds | the campaign timeline (model outputs, tool results, edit outcomes, checks, gate lines, packets, intents, reconciliations, recovery, publication) |
| **Projections** | `Views` (F-14) and read-only store queries (GAP-04): contract, ledger, register, workset, checks, receipts, budget, handles, packets, notes, manifests, checkpoints | on demand, re-read on relevant events | every screen's structured content; the snapshot sent on subscribe |

**Refresh matrix (which event invalidates which projection).**

| Event | Projections to re-read | Timeline items to append (from journal since last seq) |
|---|---|---|
| `campaign.opened`, `campaign.shape_selected` | campaign summary, contract | campaign header, shape line |
| `contract.amended`, `contract.amendment_proposed`, `contract.amendment_resolved` | contract view, attention list | request / amendment items |
| `campaign.increment_selected`, `campaign.increment_closed` | ledger view, increments | increment markers |
| `cell.started`, `cell.ended` | cells list, checkpoints, manifest (`manifestRef`) | cell boundary items; packet summary line (`boundary` journal row) |
| `cell.turn_started` | current turn indicator | turn separator |
| `cell.model_requested` / `model_progress` / `model_responded` | usage rows (`Views.budget`) after `responded` | model output item (journal `call`) after `responded` |
| `cell.tool_called` / `cell.tool_resulted` | for `edit.*` ops: changes projection (preimage packets, checkpoint `touched`); for `run` with `bg`: handles; for `verify.*`: checks view; otherwise none | tool result item (journal `result`, observation blob header) |
| `cell.gate_fired` | gate list for the cell | nudge item (journal `nudge`) |
| `cell.register_patched` | register view | STATE change marker |
| `cell.workset_changed`, `cell.rebuilt` | workset view, generation | rebuild marker |
| `check.started` / `check.finished` | checks view, receipts | check item (journal `check`) |
| `ask.question`, `blocked` | attention (question), campaign state | question item |
| `budget.reserved` / `budget.exhausted` | budget gauge | budget marker |
| `delegation.dispatched` / `collected` / `rejected` | delegations list, child cells | delegation items |
| `kb.proposed` / `admitted` / `invalidated` | notes, queue | knowledge items |
| `span.started` / `span.ended` | trace tree, costs | none (span tree is a separate projection) |
| `run.reconciled`, `warning` | reconciliation list, warnings | reconciliation / warning items |
| `campaign.finished` | finish receipt (blob by `finishReceiptRef`), campaign state, publication | finish item |

**Derived projections that exist only in the Console (computed from store rows, documented in §9.5):**
- *Changes*: files touched per cell and per increment with before/after versions (journal `edit-outcome` payloads + checkpoint `touched` + `preimage:*` packets); diffs rendered from `PREIMAGE`/`POSTIMAGE` blobs, `DIFF` blobs for transforms and the campaign diff.
- *Processes*: rows of `handles` joined with the log file size and the latest known `ProcStatus`; live output by tailing `logs/<actionId>.log` from the stored `cursor` (the Console reads the file the runner writes; it never writes it).
- *Recovery and routing*: journal `boundary` payloads of the recovery/attempt types (F-50) and `routing_log` rows.
- *Trace*: the span tree from `span.*` events with exclusive costs; inclusive costs computed in the backend (mirrors `TraceAnalytics`).

### 3.4 Timeline item model (the "conversation")

The campaign timeline is a merge of four ordered sources keyed to one cursor, the journal `seq` of the work (F-24):

1. **Journal rows** (`call`, `result`, `edit-intent`, `edit-outcome`, `check`, `nudge`, `boundary`, `intent`, `reconcile`), each rendered by kind and `payload.type`.
2. **Contract requests and amendments** (`requests` with `seq`, `amendments`), rendered as user items.
3. **Console interactions** (questions, approvals, proposals, reviews and their replies), rendered as attention items, placed at the journal seq at which they were raised.
4. **Campaign markers** (`campaign.*`, `cell.started/ended`, `delegation.*`, `campaign.finished`) rendered as thin separators.

Every item shows: who produced it (user / model / harness / you), the phase tag, the cell (context id, role) and the turn, the alias (`#n`) when it has one, and a link to its evidence (blob, receipt, checkpoint). Items are collapsed by default to one or two lines; expanding loads bodies from blobs on demand. This is the Console's equivalent of a chat transcript; it is derived, ordered, durable and never edited.

---

## 4. UX concept

### 4.1 Layout

A two-pane desktop layout with a persistent composer, as in familiar coding-agent desktops, tuned for density:

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│  Sidebar     │  Header strip: project · campaign · phase/outcome · shape ·  │
│  (248 px,    │  contract vN · budget gauge · attention badge · mode labels  │
│  collapsible │──────────────────────────────────────────────────────────────│
│  to 48 px)   │  Workspace tabs: Timeline · Overview · Contract · Changes ·  │
│              │  Checks · Context · Processes · Delegations · Knowledge ·    │
│  Projects    │  Usage · Finish                                              │
│   ▸ repo A   │──────────────────────────────────────────────────────────────│
│     W-… a1 ● │                                                              │
│     W-… a1   │            Active tab content (scrollable)                   │
│   ▸ repo B   │            with inline expanders and a right-side           │
│              │            detail drawer that opens on demand               │
│  Attention 2 │                                                              │
│  Settings    │──────────────────────────────────────────────────────────────│
│  Connections │  Composer (mode chip · target revision · text · actions)     │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

- **Sidebar**: projects with their campaigns (one active per project, F-01), the attention queue count, settings and connections entries. Collapses to an icon rail.
- **Header strip**: the campaign's identity and state in one line; every item is a link to the tab that explains it.
- **Workspace tabs**: one content area; no permanent secondary panel. Details open inline or in a right-side drawer (max 480 px) that never pushes the content narrower than 640 px.
- **Composer**: always visible, modal by state (§4.5). On screens narrower than 1100 px the sidebar auto-collapses; below 800 px the tabs become a dropdown (tablet fallback; phones are not a target).

### 4.2 Navigation and routes

| Route | Screen | Notes |
|---|---|---|
| `/` | Start (SCR-01) | host status, recent projects, connect provider, open repository |
| `/projects/:projectId` | Project (SCR-02) | campaigns list, repository facts, project settings summary |
| `/projects/:projectId/new` | New campaign (SCR-03) | request, mode, budget, publication, profile set |
| `/c/:workId/timeline` | Timeline (SCR-04) | default campaign tab |
| `/c/:workId/overview` | Agent Overview (SCR-05) | live workflow |
| `/c/:workId/contract` | Contract & Plan (SCR-06) | contract versions, requirements, acceptance, increments, ledger |
| `/c/:workId/changes` | Changes (SCR-07) | files, diffs, transforms, reverts |
| `/c/:workId/checks` | Checks & Evidence (SCR-08) | checks, receipts, stamps, integrity flags, reviews |
| `/c/:workId/context` | Context (SCR-09) | STATE register, workset, manifests, what the model sees |
| `/c/:workId/processes` | Processes (SCR-10) | background handles, logs, intents |
| `/c/:workId/delegations` | Delegations (SCR-11) | probes, reviews, writers, integrations, recovery |
| `/c/:workId/knowledge` | Knowledge (SCR-12) | notes, queue, skills, maps, health (project-scoped; campaign filter) |
| `/c/:workId/usage` | Usage & Routing (SCR-13) | budget, calls, costs, spans, routing, calibration |
| `/c/:workId/finish` | Finish & Publication (SCR-14) | finish receipt, publication ladder, exports |
| `/attention` | Attention (SCR-15) | all pending items across campaigns |
| `/settings/:section` | Settings (SCR-16) | see §5.16 |
| `/connections` | Connections (SCR-17) | AI Gate providers, auth, catalog, profiles drafting |
| `/diagnostics` | Diagnostics (SCR-18) | host, versions, fixtures, logs |

Query parameters: `?cell=<contextId>`, `?turn=<n>`, `?seq=<journalSeq>`, `?ref=<blob|receipt|alias>`, `?inspect=<entity>` deep-link into any tab. Every entity chip in the UI is a link that sets these.

### 4.3 Entry points

| Entry | Behaviour |
|---|---|
| Launch (web) | Backend starts, prints the local URL with a one-time token; the browser opens `/` (§12.1). |
| Launch (desktop shell) | The shell starts the backend, waits for `/api/v1/health`, opens the window on `/`. |
| Open repository | Folder picker (desktop) or path entry (web) → `cmd:project.open` → `Astrolabe.open(repo)`; the project appears in the sidebar with its store facts (repo identity, harness version, schema version, existing campaigns from `campaigns`). |
| Deep link | `/c/:workId/...` opens the project that owns the work (from the Console registry) and subscribes. |
| Command palette (`Ctrl/Cmd+K`) | Open project, new campaign, jump to tab, jump to cell/turn/alias, run settings action, toggle theme. |
| CLI hand-off (optional) | `astrolabe-console open <path>` and `astrolabe-console start <path> --request-file f.md` call the REST API of a running backend or start one. |
| Notifications | Desktop/browser notification for a new attention item, a campaign end, or a lost connection; click focuses the item. |

### 4.4 The main workflow

```
open repository ─▶ compose request ─▶ start campaign ─▶ watch overview / timeline
      │                 │                    │                    │
      │        choose mode, budget,          │          answer / approve / resolve / review
      │        ceiling, publication          │          amend the contract when needed
      ▼                 ▼                    ▼                    ▼
  project facts   contract v1 opened    cells run increments   campaign finishes:
  (store, repo)   shape selected        checks produce receipts completed | partial | blocked | …
                                                                 │
                                       inspect changes/checks ◀──┘──▶ publish stages (grants) ─▶ exports
```

Step by step, with the harness facts each step rests on:
1. **Open** (`cmd:project.open`, F-01/F-02). The Console shows repository identity, existing campaigns (`campaigns` table) and whether one is resumable (`waiting_for_input`, `blocked_external`, interrupted `Finishing`; F-15/F-16).
2. **Compose** (SCR-03). The request text becomes `U-1`; start options map to `Config.mode`, `dClass`, `ceiling`, `CampaignPolicy(tokens, cost, resumeExpected)` and `PublicationRequest` (F-35, Appendix B). The effective configuration and its violations are shown before start.
3. **Start** (`cmd:campaign.start`). `campaign.opened` and `campaign.shape_selected` arrive; the Overview shows the shape topology.
4. **Watch**. The timeline appends journal rows; the Overview animates events; counters and gauges update from projections (§3.3).
5. **Respond** when the harness asks (Attention, §4.6): questions (`ask.question` + `blocked`), D-class approvals, amendment proposals, review requests. Replies carry the contract revision.
6. **Amend** at any time (`cmd:campaign.amend` → `contract.amended`, version +1; the cell sees it next turn; blocked increments are unblocked at reopen, F-16).
7. **Finish**. `campaign.finished{outcome}`; the finish receipt is loaded from its blob (F-19); the ledger, acceptance lines, not-verified list and pending amendments are shown as recorded.
8. **Publish** (SCR-14). If a publication request was given at start it has already run; otherwise the user requests stages (`cmd:campaign.publish`, GAP-02/OD-01). Each stage above `patch` is a separate approval (F-20) and appears in Attention.
9. **Export / audit**. `event.Export.write`, `telemetry.Export`, `Economics.export` on demand (F-53).
10. **Reopen / resume** a resumable campaign (`cmd:campaign.reopen`, GAP-01/OD-01) after answering the question that blocked it; the reopen sequence (F-16) is shown as a checklist while it runs.

### 4.5 The composer (modal by state)

The composer is one control with a mode chip that reflects what the harness can accept right now. It never sends free text to "the assistant".

| Mode | When | Fields | Sends |
|---|---|---|---|
| **Request** | no active campaign in the selected project | text (Markdown allowed, stored verbatim), start options popover | `cmd:campaign.start` |
| **Amend** | campaign running or resumable | text; shows "will create contract v(N+1)" and "the running cell sees it on its next turn" | `cmd:campaign.amend` |
| **Answer** | a `Question` is selected in Attention | option buttons (from `Question.options`) or text; toggle "this changes requirements" (`Answer.changesRequirements`, F-06) | `cmd:attention.answer` |
| **Decide** | a `DClassRequest` is selected | action, argv, cwd, expected effect, reason, allowlist badge; Approve / Deny with optional reason | `cmd:attention.decide` |
| **Resolve** | an `AmendmentProposal` is selected | change, reason, proposer, **weakening** warning; Accept / Reject / Leave pending | `cmd:attention.resolve` |
| **Review** | a `ReviewRequest` is selected | verdict form (§5.15): outcome, findings with severity/kind/location, coverage, confidence, `signedBy` prefilled from the Console identity | `cmd:attention.review` |
| **Reopen** | campaign ended resumable | reason (free text), option to answer the pending question first | `cmd:campaign.reopen` |

Rules: the composer shows the target contract revision; when a newer revision arrives while a reply is being written, the composer marks the reply superseded and asks the user to re-check it (F-07). `Ctrl/Cmd+Enter` sends; `Esc` returns to Request/Amend mode; drafts persist per campaign in the browser only (never sent to the backend).

### 4.6 Attention (the authority protocol as a queue)

Attention is the Console's rendering of the `Authority` interface (F-06). It is a queue, not a modal storm:
- Items arrive as `msg:attention.pending` with the full request object and the campaign context; they appear in the sidebar badge, in the campaign header, and inline in the timeline at the seq where they were raised.
- Selecting an item switches the composer to the matching mode; the item's details render above the composer (argv in a code block, options as buttons, the proposal diff for amendments, the evidence packet summary for reviews).
- Replying is single-use and revision-checked; the backend completes the harness future and records the reply. `msg:attention.resolved` removes the item everywhere; a `superseded` resolution explains why (contract moved, campaign cancelled, lease lost).
- In **Autonomous** mode, items that policy resolves are shown as resolved-by-policy entries (`byAuthority = "policy:autonomous"`, F-07), so the user still sees what was refused or left pending.
- Questions from `task.ask` block the cell (`blocked{questionId}`); the campaign ends `waiting_for_input` if no answer arrives (F-15). The Console makes the consequence explicit: "Answer to continue; if the campaign has ended, your answer reopens it" (reopen path, GAP-01).
- Human anchors on publication (`interface-contract`, `data-migration`, `production-deploy`, `new-network-access`, `ceiling-elevation`; F-20) are shown as labelled reasons on the approval item.

### 4.7 Density, expandability and motion rules

- Base font 13 px, row height 28 px in lists, 8 px grid, 12 px paddings; icons 16 px; monospace for ids, paths, argv, hashes.
- Everything collapsed by default to one or two lines: tool results show the header line; edits show `path @h8→@h8 +a −r`; checks show `check · outcome · stamp`. Expanding fetches bodies lazily (blobs).
- No permanent secondary panels. Drawers and popovers close on `Esc` and on navigation.
- Motion is functional: 150–250 ms transitions, the Overview's token travel 400–600 ms, pulses ≤ 1.2 s; `prefers-reduced-motion` switches to static highlights. No looping spinners without a source event; "waiting" states name what is awaited (a model call, a process handle, an answer).
- Theme: dark and light with the same tokens (§7); follows the OS by default; toggle in the command palette and settings.

### 4.8 Keyboard model

| Keys | Action |
|---|---|
| `Ctrl/Cmd+K` | command palette |
| `Ctrl/Cmd+Enter` | send in the composer |
| `Ctrl/Cmd+1…9` | switch workspace tab |
| `A` (in a campaign, no input focused) | focus the first attention item |
| `J`/`K` | next/previous timeline item; `Enter` expands; `E` opens evidence |
| `G` then `O`/`T`/`C`/`H` | go to Overview / Timeline / Changes / Checks |
| `?` | shortcut sheet |
| `Ctrl/Cmd+Shift+D` | toggle theme |

---
## 5. Screens

Each screen lists its purpose, layout, data sources (facts from §2), interactions (commands from §10), states, and acceptance criteria (`AC`). Wireframes for the four central screens are in §8.1.

### 5.1 SCR-01 Start

- **Purpose:** land the user in a working state in under a minute: host health, provider readiness, a repository to open.
- **Layout:** three compact cards in one column: *Host* (backend version, JDK, ASTROLABE `VERSION`, AI Gate version, state root path, health), *Connections* (per configured provider: `AuthStatus.state`, source, expiry; "Connect a provider" button → SCR-17), *Projects* (recent repositories with last campaign outcome; "Open repository"). Below: "Resumable campaigns" list across projects (F-15).
- **Data:** `GET /api/v1/host`, `GET /api/v1/connections`, `GET /api/v1/projects`.
- **Interactions:** `cmd:project.open`; navigate to SCR-02/03/17.
- **States:** no providers configured (call-to-action, everything else still usable); host degraded (AI Gate build missing → shows "provider-ai-gate absent: the fake adapter is available for prototype mode only").
- **AC-01.1** A project opened here appears in the sidebar with its repo identity digest and existing campaigns from the store. **AC-01.2** Provider states are the SDK's `AuthStatus` values verbatim.

### 5.2 SCR-02 Project

- **Purpose:** the repository's campaigns and facts.
- **Layout:** header (path, repo identity, base commit, dirty state, `controller.lock` holder if any), *Campaigns* table (work, attempt, phase, outcome, contract version, opened at, cells, last activity; row → SCR-04), *Project facts* (rules file candidates `.astrolabe/rules.md`, `AGENTS.md`, `CLAUDE.md` and their trust status `untrusted|missing|unreadable|changed|approved` from `auth/RulesTrust.kt`; discovery never binds a file, only an approved binding `RulesBinding(path, digest, provenance host-config|user:<who>)` is treated as instructions; quality gates; atlas cache presence; worktrees under `candidates/`), *Project settings* summary (state root, frozen config of the last attempt, link to SCR-16).
- **Data:** `campaigns`, `attempts`, `leases` (store), `RulesTrust` discovery, `indexes/`, `candidates/worktrees` listing.
- **Interactions:** New campaign (SCR-03); reopen resumable (`cmd:campaign.reopen`); approve rules file binding (`cmd:project.rules.approve` → settings write, applied at next attempt); close project (`cmd:project.close`, refused while a campaign runs).
- **AC-02.1** A campaign row's phase/outcome equals `campaigns.phase/outcome`. **AC-02.2** A running campaign blocks "New campaign" with the message "project already runs campaign W-…" (F-01).

### 5.3 SCR-03 New campaign

- **Purpose:** compose the request and the start options; show the effective configuration before starting.
- **Layout:** left: request editor (Markdown; the text is stored verbatim as `U-1`); right: *Start options* form:
  - Mode `Interactive | Autonomous`; D-class `Ask | Deny`; ceiling `patch | local-commit | push | merge | deploy`; integrity approval `Autonomous | Human`; unknown-outcome reconciliation `Host | Automatic` (Appendix B).
  - Budget: tokens (default `contextLimitTokens(main) × campaignCells`, F-01), cost cap (currency from the main profile's price table), `resumeExpected` (rules out S0).
  - Publication: through stage, remote, merge target, deploy target (+ production flag), known remotes, message (F-20).
  - Profile set: main profile and tier table summary (read-only here; link to settings).
  - *Effective configuration* panel: the assembled `Config` (collapsed JSON) and its `violations()` plus `AiGateAdapter.violations` (F-35, F-41). Start is disabled while violations exist.
- **Interactions:** `cmd:campaign.start{projectId, request, policy, publication, configRevision}`.
- **States:** violations present; provider not authenticated (start disabled with the exact `AuthStatus`); another campaign running.
- **AC-03.1** Starting yields `campaign.opened` within the request's ack and the timeline shows `U-1` verbatim. **AC-03.2** Every start option maps to the field named in Appendix B, and the frozen `attempt-config.json` written by the controller matches the effective configuration shown.

### 5.4 SCR-04 Timeline

- **Purpose:** the durable narrative of the campaign (§3.4) with the composer below.
- **Layout:** a virtualised list of items grouped by cell → turn. Item kinds and their one-line renderings:
  - *Request/amendment* (user): `U-3 · v3 · "…"`; expand shows the full text and the resulting contract version.
  - *Model output* (journal `call`): `turn 7 · stop tool_use · 3 calls · <head>`; expand shows the native output text (redacted form) and the calls.
  - *Tool result* (journal `result`): the envelope header (`#42 run class=W stamp=@a1b2 status=passed …`); expand shows the body from the observation blob, the gauge, and links (Changes for edits, Processes for bg runs, Checks for verify).
  - *Edit outcome* (journal `edit-outcome`): `edit #n · path @h8→@h8 +a −r`; expand shows the diff rendered from preimage/postimage (§9.5).
  - *Check* (journal `check`): `CHK-… · passed · @stamp · 11 passed, 1 failed`; expand shows the receipt.
  - *Nudge* (journal `nudge`): the gate line with the gate name chip.
  - *Boundary* (journal `boundary`): packets, checkpoints, publication, recovery, kb injection, reconcile: rendered by `payload.type` with a small type chip.
  - *Attention* (Console): the request card and, once replied, the reply with its revision; superseded replies are struck through with the reason.
  - *Markers*: cell started/ended (role, status), increment selected/closed, shape selected, finished (outcome).
- **Filters** (chips): kinds, cell, turn range, phase, "only my interactions", "only evidence". Search across `text`.
- **Data:** journal pages (`GET /api/v1/campaigns/{work}/journal?after=<seq>&limit=`), blobs on expand, interactions, events archive for markers.
- **Interactions:** composer modes (§4.5); jump to alias (`#n`), cell, turn; copy as Markdown (derived export of the visible items).
- **States:** live (tail follows unless the user scrolled up; a "jump to latest" pill appears), reconnecting (items stay, a stale banner shows the last seq), gap repaired (an inline "n events were not received live; timeline rebuilt from the store" marker).
- **AC-04.1** Every item links to a store row or blob; no item exists without one (except Console interactions). **AC-04.2** Reloading the page reproduces the same item order from the journal `seq`. **AC-04.3** Model text is shown only after `cell.model_responded` and only from the journal.

### 5.5 SCR-05 Agent Overview

Specified in §6. Summary: header gauges, plan rail (increments/requirements), the live workflow stage (stations, tokens, lanes), the STATE panel, the turn strip and the detail drawer.

### 5.6 SCR-06 Contract & Plan

- **Purpose:** the contract as the harness holds it, per version, and the plan (requirement graph and ledger).
- **Layout:** version selector (v1…vN; `latestVersion`), then sections: *Requests* (`U-…`, at, text), *Requirements* (id, text, status chip `pending|in_progress|verified|blocked`, dependsOn, authorityRef), *Acceptance* (kind chip `run|check|review`, id, command/text, origin `user|harness|model(strengthens)|amended@vN`, last run/evidence/signed-by, obligation version), *Constraints & exclusions*, *Scope* (write paths, protected paths), *Budget* (cells, turns per cell, tokens, attempts, reserves, cost), *Authorization* (ceiling, dClass, capability set, allowlist), *Risk*, *Amendments* (pending/accepted/rejected with proposer, weakening flag, resolvedBy). Right rail: *Increments* (id, title, status, requirement ids, write scope, sizing: turns/continuations/rebuilds/files touched; dependencies as a small DAG) and *Ledger* (requirement → status, evidence refs, stamp valid).
- **Data:** `Views.contract`, `Views.ledger` (F-14, F-17, F-18), `packets(plan, increment_split)`.
- **Interactions:** amend (composer), resolve a pending amendment (Attention), diff two versions (client-side JSON diff of the projections), copy contract as Markdown.
- **AC-06.1** Statuses come from `ledger`/`requirements` rows, never from model text. **AC-06.2** A weakening proposal is visibly marked and cannot be accepted by a Console default.

### 5.7 SCR-07 Changes

- **Purpose:** what changed in the workspace, by whom (agent edit, run, external), with evidence.
- **Layout:** left: file tree of touched paths grouped by increment → cell (from `CellCheckpoint.touched`, journal `edit-outcome`, `[A]` Touched; F-29), each with kind `A|M|D`, `+a −r`, origin `Edit|Run|External`, before/after `@h8`; right: diff viewer (unified/split, syntax highlighted) rendered from `PREIMAGE`/`POSTIMAGE` blobs for anchored edits, from the `DIFF` blob for transforms, and from `CampaignReview.diffBlob` (s0 → candidate) for "whole campaign" mode. Header shows the current stamp `@h8` and whether the workspace still matches the last green stamp.
- **Interactions:** "Request revert" (creates an amendment text `Revert edit #n` — the Console never reverts files itself; reverts are harness ops `edit(revert:#id | turn:N)` the model performs, and a host-side revert is not in the facade); open file in external editor (desktop shell); copy patch.
- **States:** transform diff missing (`DIFF` blob absent → "not recorded"); file moved externally (`Touched(note = external)`); campaign diff unavailable before the first review.
- **AC-07.1** Every diff is reproducible from blobs by digest. **AC-07.2** External changes are labelled `external` exactly as the store records them.

### 5.8 SCR-08 Checks & Evidence

- **Purpose:** the verification scheduler's state and every receipt.
- **Layout:** *Checks* table (id, kind `Syntax…Product`, selector, trigger, cost class, last outcome, applicability `Current|Stale|Unknown` with the stale reason, last stamp, acceptance ids); *Receipts* (per check, ordered: receipt id, outcome, `stampBefore→stampAfter`, exit code, parsed counts, verifier version, env id, reuse-of, limits, raw log link); *Baseline* (snapshot-0 receipts and the pre-existing ledger `PreExisting|New|Changed|Ambiguous`); *Integrity flags* (path, surface, cause, kind, required checks, verdict, blocksCompletion); *Reviews* (increment/campaign review records: scope, candidate, verdict, path through tiers/human, findings with severity and location, coverage, reused).
- **Data:** `Views.checks`, `Views.receipts` (F-14, F-32), `packets(increment-review, campaign-review, qa-run)`, journal `check` rows, `LOG` blobs.
- **Interactions:** open raw log (blob), copy command, jump to the turn that produced a receipt; "request check" is **not** available (no host API; note shown).
- **AC-08.1** Outcome values are the receipt's `outcome` verbatim; the UI maps `check.finished.outcome` (`infraerror`, `notrun`, `unknownoutcome`) to the same labels as receipt outcomes and says so in a tooltip. **AC-08.2** A stale check is never shown green.

### 5.9 SCR-09 Context

- **Purpose:** what the model currently sees and how it got there (D5, GAP-07).
- **Layout:** cell selector (context id, role, status); *STATE register* (latest version: increment title, constraints, plan with marks `todo|cursor|done|cancelled`, facts `h/v/x`, dead ends, decisions, open, focus, amendments, next; version slider with `historyCount`, diff between versions); *Workset* (KNOWN entries: path, range, version, source, turn, tokens; NOT SEEN summary; stale drops); *Manifest* (notes, seeds, skills, arithmetic, selected units, omissions, estimated vs actual tokens, boundary reason); *Layout reconstruction* (labelled "reconstructed"): `[S]` from `Layout.system` for the role, `[R]` prime text, `[K]` sections, `[T]` recent journal, `[A]` last gauge and nudges; *Generations* (rebuild markers with reasons).
- **Data:** `Views.register`, `Views.workset`, `manifests`, `turns`, journal (F-31).
- **AC-09.1** The register shown equals the latest `register_versions` row for the cell. **AC-09.2** The reconstruction panel is labelled as such and cites the rows it used.

### 5.10 SCR-10 Processes

- **Purpose:** background runs and their logs, plus open intents (GAP-06).
- **Layout:** *Handles* table (handle id, alias, argv, cwd, effect class, status `running|exited|deadline_exceeded|cancelled|lost`, started, cursor bytes, log size, stamp before); selecting a handle opens the log viewer (tail from the stored cursor; the Console reads `logs/<actionId>.log`, redacts with the same `RedactionConfig` patterns before display, and falls back to the `LOG` blob when the file is gone); *Intents* (intent id, action id, argv, expected effect, status `recorded|dispatched|running|observed|committed|unknown`, replay-safe, workspace-confined, reconciliation evidence).
- **Interactions:** `cmd:process.terminate{handleId}` (emergency: confirmation dialog states that the harness will observe `cancelled`/`unknown_outcome`, that effects are not proven stopped, and that the action is logged by the Console); `cmd:intent.reconcile{intentId, evidence}` for `Host` reconciliation (GAP-03/OD-01) with a mandatory evidence text.
- **AC-10.1** Log bytes shown are exactly the file bytes after redaction; the cursor equals `handles.cursor` at load. **AC-10.2** Terminate is never offered for handles of another work or workspace (`Run.ownedHandle`).

### 5.11 SCR-11 Delegations & Recovery

- **Purpose:** children and side-paths of the campaign.
- **Layout:** *Delegations* (handle, kind `probe|review|writer`, mode, child context, dispatched at, lease, delegated cost estimate (advisory), collected status `published|failed`, rejection reason; child cell link → SCR-09 for its register; packet summary: investigation findings / verdict / result packet from the journal `boundary` row and `packets`); *Reviews* (review-cell runs, F-48); *Integration* (S3 rounds: `IntegrationRecord` step, reason, published/rejected, returns-to-main-line); *Recovery* (journal payload types `recovery-failure`, `recovery-repair`, `recovery-repair-completed`, `alternative-attempt`, `substantive-attempt` rendered as a timeline: class, recovery step, guards line, repair outcome, escalation tier/change, hypothesis); *Worktrees* (paths under `candidates/worktrees`, base commit, increment).
- **Data:** events `delegation.*`, `packets`, journal boundaries (F-48, F-50), file system listing.
- **AC-11.1** A refused dispatch (no event) still appears, taken from the `task` tool result `rejected … refused (<limit>)`. **AC-11.2** Recovery items show the failure class and the ladder step verbatim.

### 5.12 SCR-12 Knowledge

- **Purpose:** the project's KB and the curator queue the Console operates as host (F-52, F-53).
- **Layout:** *Queue* (candidate notes with lint findings, decidedBy, batch; actions Admit / Reject / Wait per item and "Admit batch (interactive)" which runs `Curator.admitWith(ids, authority, revision)` so each candidate flows through Attention as an `AmendmentProposal`); *Notes* (filter by kind `ADR CON LES PIT BMAP NEG SKILL STATUS CAL`, status, scope; note detail: summary, body, anchors with locator status, confidence, basis refs, validity, revisions, usage injected/cited); *Skills* (id, version, triggers, modules, per-role view preview); *Behaviour maps* (subsystem, behaviours, locators `Current|Changed|Unresolved`); *Health* (`KbHealth.of` numbers); *Injection log* (per increment: arm, injected, mandatory, tokens, exclusions with reasons; from journal); *Promotion proposals*.
- **Interactions:** `cmd:kb.admit`, `cmd:kb.reject`, `cmd:kb.rollback{batch}`, `cmd:kb.recheck`, `cmd:kb.prune`, `cmd:kb.promote`, `cmd:kb.regenerate` (derived Markdown), `cmd:kb.export.raw`.
- **AC-12.1** No curator action runs while a campaign of the project is running unless the campaign's `kbInjection` is `Off` or `Frozen` (the Console refuses otherwise and explains). **AC-12.2** Admission decisions record `admittedBy` as the Console identity or `policy`.

### 5.13 SCR-13 Usage & Routing

- **Purpose:** money, tokens, calls, spans, routing and calibration, shown as recorded (F-54).
- **Layout:** *Budget gauge* (contract budget: tokens spent / limit, reserves, cost cap; `budget.exhausted` scope if any); *Calls* table (invocation id, cell, profile, native usage, normalized by dimension `uncached_input, cache_read, cache_write_5m, cache_write_1h, output`, money or `unknown`, warm/cold, price table date, at); *Totals* (calls, calls without usage, money by cold/warm, quantities); *Per profile* (grouped client-side); *Spans* (tree with phase, status, exclusive and inclusive cost, duration; critical path); *Routing* (profile per cell from `cell.model_requested`, tier table in force, `routing_log` rows, escalation lines and substantive attempts from the journal); *Economics* (on demand: `Economics.report` numbers; `liveGate` string shown verbatim as "UNMEASURED"); *Calibration* (`CalibrationStats` bands; warnings).
- **Data:** `Views.budget`, `Accounting.calls/totals`, `span.*` archive, `routing_log`, journal.
- **AC-13.1** Unknown money is rendered as `unknown` and excluded from sums with a footnote count. **AC-13.2** Charts use only the tokens in §7.6; no colour beyond the palette.

### 5.14 SCR-14 Finish & Publication

- **Purpose:** the campaign's end state and the permission ladder.
- **Layout:** *Outcome* banner (`completed | partial (budget_exhausted) | waiting_for_input | blocked_external | cancelled | failed` with `reason`); *Finish receipt* (every field of F-19 in sections: requirements, acceptance lines with status/stamp/currency/log ids, changes split agent/by-run/pre-existing/unattributed, checks run, not verified, dead ends, decisions, ADR candidates, open items, pending amendments, budget by cache class, highest authorized stage, review line, QA runs); *Publication ladder* (`patch ✓ · local-commit · push · merge · deploy` with, per stage: policy decision autonomous/anchors/unmet, approval request id, result `Published(commit, target) | Refused(reason) | Failed(detail)`, harness branch name); *Exports* (buttons: contract/ledger/checks/budget/receipts/summary (`Export.write`), usage/accounting/otel (`telemetry.Export`), economics, promotion proposals; each shows the written paths).
- **Interactions:** `cmd:campaign.publish{through, remote, mergeTarget, deployTarget, knownRemotes, message}` (GAP-02) → approvals appear in Attention; `cmd:campaign.export{kinds}`; `cmd:campaign.reopen` when resumable.
- **AC-14.1** The receipt shown is byte-identical to `exports/<work>/finish-receipt.json`. **AC-14.2** A refused stage shows the `RefusalReason` wire value and the anchors verbatim.

### 5.15 SCR-15 Attention

- **Purpose:** every pending interaction across projects (§4.6), with keyboard triage.
- **Layout:** list grouped by campaign; each card: kind chip (`question | approval | proposal | review | publication`), age, contract revision, summary; selecting a card loads its full form into the composer area (this screen has the composer docked at the bottom like any campaign screen). Resolved items remain visible for the session under "Resolved" with `byAuthority` and the reason.
- **AC-15.1** A reply is refused client-side and server-side when `Replies.check` would return `Superseded`. **AC-15.2** After a backend restart, pending items reload from the Console DB and can still be answered if the harness future is alive; otherwise they show "expired: campaign ended <outcome>".

### 5.16 SCR-16 Settings

Scopes are **Harness** (applies to every project), **Project** (overrides for one repository) and **Campaign start options** (SCR-03). The effective configuration is Harness ← Project ← Start, resolved and validated live (`Config.violations()`, `AiGateAdapter.violations`). A banner on every page states: "Changes apply to the next campaign or attempt; a running attempt keeps its frozen configuration (warning `config-frozen`)." Each field shows its default, its current value, its scope of origin and its citation (Appendix B).

| Section | Contents (all fields listed in Appendix B) |
|---|---|
| Appearance | theme (system/dark/light), density (compact/comfortable), font size, reduced motion, notification preferences |
| Connections | link to SCR-17 (providers, credentials, catalog) |
| Profiles | ASTROLABE `Profile` editor: id, provider, model, capabilities (each boolean and limit), caching, usage fields, schema dialects, price table (date, currency, per-million by dimension), latency, `gate` block (`api`, `options`, `reasoningHandoff`, `outputCap`, `catalogCheck`, `prefixRetention`, `tokenCount`, `effort`); actions Draft from catalog (`AiGateProfiles.draft`), Validate (`AiGateAdapter.violations`), Qualify (`AiGateProfiles.qualify`, billable, with the report), Freeze |
| Routing | `profileRoles` (main, helper, escalation), `TierTable` (version, calibration date, tier → profiles), the `FunctionTable.DEFAULT` shown read-only (F-39) |
| Roles | the eight roles; per role: persona lines (≤ 3), and read-only view of `contextView`, `noteScope`, `skillFilter`, `toolMask`, `permission`, `tierPrior`, `duties`, `askBack`, `packetKind`, `deniedNoteKinds`; validation messages from `Config.violations()` (widened mask, raised permission, forbidden wording) |
| Authority & execution | `mode`, `executionMode` (with the D-11 note that trusted-local is never a sandbox), `dClass`, `ceiling`, `integrityApproval`, `unknownOutcomeReconciliation`; rules file binding (candidates `.astrolabe/rules.md`, `AGENTS.md`, `CLAUDE.md`; status; approve → `RulesBinding(path, digest, provenance)`); redaction (patterns kind/regex, env allowlist, maxBytes); read-only: `dClassAllowlist`, capability set, effect policy lists (F-40) |
| Budgets & defaults | grouped `Defaults`: Cells & turns (`turnsPerCell`, `turnNudgeFraction`, `campaignCells`, `attemptsPerIncrement`, `parallelCells`, `writerDepth`, `probeDepth`); Context (`alpha`, `k`, `m`, `rMaxTokens`, `anchorMaxTokens`, `immediateStubTokens`, `lookBudgetTokens`, `runBudgetTokens`, `registerCapTokens`, `digestCapTokens`, `digestTokensPerRequirement`, `digestCapCeilingTokens`, `factLineMaxChars`, `noteBodyMaxTokens`, `noteSummaryMaxChars`, `seedsMaxTokens`, `injectionMaxNotes`, `injectionMaxTokens`, `focusNotesMaxTokens`, `focusZoomMaxTokens`, `touchedInAnchor`); Verification (`checkerTimeBoxSeconds`, `checkerFallbackTimeBoxSeconds`, `theta`, `fullSuiteCadence`, `reserveVerification`, `reserveRecoveryAndPersist`, `campaignRecoveryReserve`, `flakyIsolatedReruns`); Recovery (`stallTurns`, `loopIdentical`, `repeatedSignatureRepairs`, `doomLoopSameCalls`, `repairCalls`); Delegation (`probeTurns`, `probeTokens`, `probeTier`, `reviewLookMax`, `reviewIncrementTokens`, `reviewCampaignTokens`, `reviewTier`, `reviewRoutineTier`, `admissionConfidenceMax`); Timeouts (`runTimeoutSeconds`, `gitDeadlineSeconds`, `providerTerminalWaitSeconds`); Shape policy (`smallMaxFiles`, `smallMaxRequirements`, `largeMinFiles`, `largeMinRequirements`, `s3Enabled`, `slackFactor`). Fields with no reader in core are marked "declared, currently unused" (Appendix B) |
| Layers & flags | each `Flags` entry with its default `false`, its evaluation status "UNMEASURED", and whether the layer is wired (`asyncChecker`, `languageService`, `l4Gates`, `skillsPromotion`, `worthTestEstimate` shown as "declared, not active", GAP-08); `kbInjection Off|Frozen|Live`; host plug-ins: tree-sitter outline index (present when `index-treesitter` is on the classpath), dense retriever (none in v1), generated tools registry (none in v1), MCP mounts (catalog editor with `localApproval` and `effectClassOverride`; marked inactive until GAP-09 is fixed) |
| Quality gates | list of `Command(argv, cwd)`; each becomes a `CHK-quality-gate*` check |
| Storage & diagnostics | `stateRoot`, Console DB path, event archive retention, export directory, log level, "open state directory" |
| Keyboard | shortcut sheet (§4.8) |

- **AC-16.1** Saving produces a new configuration revision; the assembled `Config` JSON is shown and its violations are empty before "Apply to next campaign" is enabled. **AC-16.2** A role override that widens a mask is rejected with the message from `Config.violations()`.

### 5.17 SCR-17 Connections (AI Gate)

- **Purpose:** configure providers and gateways, authenticate, inspect the catalog, test connections, draft profiles (F-43).
- **Layout:** *Providers* list (id, preset, base URL, default API, auth methods, `AuthStatus`); *Add provider* wizard: choose a preset (`Providers.presets()` + templates `openai-compatible`, `anthropic-compatible`, `azure-openai`, `litellm`), fill `Provider.fields()` (rendered from `FieldDescriptor.kind`), save into `providers.json` (`ProvidersConfig.validate` errors shown by path); *Authentication* per provider: API key form (`SECRET` field, write-only, stored through `Auth.save`; source shown as `stored credential` / env var name), OAuth (`Auth.login` with the Console's `AuthInteraction`: `OpenUrl` notices become a "Open browser" button plus copyable URL; `DeviceCode` shows the code and verification URL; `Code` prompt shows a paste box when the loopback callback did not arrive; progress lines; cancel token), `Logout`, `Revoke`; *Catalog*: models per provider (`Model` fields: context window, max output, reasoning levels, capabilities, prices with source and updatedAt, `Model.Source`), refresh (`ModelCatalog.refresh`), offline/feed toggles; *Test*: `llm.test(model)` with optional billable probes (inference, usage fields, tool round trip, cache round trip) rendering `ConnectionReport.steps` (kind, status, latency, message; `NOT_SUPPORTED` explained for Anthropic/Google presets); *Preview*: `llm.preview` for a sample request (`toCurl()` with `$ENV_VAR` placeholders); *Runtime*: `llm.describe()` (redacted) and SDK `RequestEvent` counters.
- **Interactions:** REST only for secrets (§10.5); WebSocket for auth notices/prompts (`msg:auth.notice`, `msg:auth.prompt`).
- **AC-17.1** Secrets never appear in any WebSocket message, log or GET response; the UI shows only `Secret.fingerprint()`. **AC-17.2** After any auth flow the UI re-reads `Auth.status` (no push exists, GAP-14).

### 5.18 SCR-18 Diagnostics

- **Purpose:** host health and evaluation.
- **Layout:** versions (Console, ASTROLABE `VERSION`, schema v4, AI Gate), JDK, state root, Console DB size, event archive stats (records, dropped counts from `Subscription.dropped`, sink failures), backend logs tail (Console's own), *Fixtures*: run `:eval:fixtures` (if the ASTROLABE checkout and Gradle are available) and render `report.json` (counts, green, invariants with `null` shown as "unmeasured", per-test results) (F-55); *Live gates*: `LiveGates.all()` shown as UNMEASURED.
- **AC-18.1** `null` invariant violations render as "unmeasured", never as 0.

---
## 6. Agent Overview: the live workflow

### 6.1 Purpose and stance

The Overview answers, at a glance and in real time: *which shape is running, which increment, which cell and role, which turn, what the model is doing right now, which tools are firing, what the verifier is doing, who is waiting on whom, and what the model's own plan state is*. It does this from ASTROLABE's real signals (F-10, F-12, F-24, F-31) and it never dramatises. It is not a chain-of-thought viewer and not a generic node editor; the topology is fixed by the architecture (controller → compiler → cell → model/tools → workspace → verifier → ledger, with delegates, recovery, knowledge and the human as side stations) and only its activity moves.

### 6.2 Layout

```
┌ Header gauges ─────────────────────────────────────────────────────────────────┐
│ W-9f3k a1 · S2 · Running · contract v3 · inc-2 "wire auth cache" · cell-… impl │
│ turn 7/40 · ctx 41 % · reserve ok · budget 128k/480k · $1.42 (+unknown ×2)     │
└────────────────────────────────────────────────────────────────────────────────┘
┌ Plan rail (200 px) ┐ ┌ Flow stage ─────────────────────────────────────────┐ ┌ STATE (300 px) ┐
│ inc-1 ✓ verified   │ │  [Contract]→[Controller]→[Compiler]→[Cell]⇄[Model]  │ │ plan ▸ 3/6     │
│ inc-2 ▶ in_progress│ │                          │        ╲ [Tools ×7]      │ │ [x] parse hdr  │
│ inc-3 · pending    │ │            [You]◂────────┘          ╲  ↓            │ │ [>] add cache  │
│ inc-4 · blocked    │ │  [Delegates: probe ▸ review]     [Workspace @a1b2]  │ │ [ ] tests      │
│ ── requirements ── │ │  [Recovery]  [KB]  [Routing]        ↓               │ │ facts h2 v5 x1 │
│ R1 verified        │ │                        [Verifier]→[Ledger]          │ │ open 2 · next… │
│ R2 in_progress     │ │                                                     │ │ v14 ◂ slider ▸ │
└────────────────────┘ └─────────────────────────────────────────────────────┘ └────────────────┘
┌ Turn strip ────────────────────────────────────────────────────────────────────┐
│ t1 ▪▪ │ t2 ▪▪▪▪ │ t3 ▪ ✎ │ t4 ▪▪ ✓ │ t5 ▪▪▪ ✗ │ t6 ▪ ⚠ │ t7 ▪▪ ●(live)          │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Header gauges** (from projections): identity, shape (`campaign.shape_selected`), phase/outcome (`campaigns`), contract version, current increment and cell/role (`campaign.increment_selected`, `cell.started`), turn `T/M` (`cell.turn_started`), context pressure and reserve (last gauge line in the journal `result` row or the checkpoint), budget (`Views.budget` + `CampaignPolicy`), money with an explicit `+unknown ×n` count.
- **Plan rail**: increments and requirements from `Views.ledger`/`Views.contract` with status chips; the current increment is highlighted; clicking filters the stage and the timeline.
- **Flow stage**: the fixed station graph (§6.3) with live tokens (§6.4) and lanes (§6.5).
- **STATE panel**: the latest register (`Views.register`; D5) with plan marks, facts, dead ends, decisions, open, focus, amendments, next; a version slider over `register_versions`; "changed this turn" highlighting when `cell.register_patched` arrives.
- **Turn strip**: one block per turn of the current cell; glyphs for tool calls (▪), edits (✎), green/red checks (✓/✗), nudges (⚠), blocked (■); the live turn pulses; clicking scrolls the timeline to the turn.
- **Detail drawer** (right, on demand): the selected station's last events, related journal rows and links.

### 6.3 Station catalog (nodes)

| Station | What it represents | Live text (2 lines max) | Activates on | Detail drawer |
|---|---|---|---|---|
| Contract | the contract and its version | `v3 · 4 req · 6 acc` | `contract.*` | SCR-06 summary, pending amendments |
| Controller | the deterministic campaign clock | `S2 · inc-2 selected` | `campaign.*`, `cell.started/ended` | campaign state, ledger transitions since open, stop reason |
| Compiler | context compilation and rebuilds | `gen 1 · K 3.1k tok` | `cell.started`, `cell.rebuilt`, `cell.workset_changed` | manifest (notes, seeds, omissions, estimated/actual), rebuild reasons |
| Cell | the running cell and role | `implementing · turn 7/40` | `cell.turn_started`, `cell.gate_fired`, `cell.ended` | checkpoint, gates fired this cell, status |
| Model | the profile and the in-flight call | `claude-… · High · streaming 1.2k tok` | `cell.model_requested/progress/responded` | invocation ids, estimate vs usage, stop reasons, retries (`stage = retrying`, attempt) |
| Tools (7 sub-nodes) | `look`, `edit`, `run`, `verify`, `state`, `task`, `kb` | per node: count this cell, last status, last class | `cell.tool_called/resulted` | last results (headers), aliases, links to Changes/Processes/Checks |
| Workspace | the candidate | `@a1b2 · 4 files touched` | `edit` results, checkpoint | touched list, stamp history, worktrees (S3) |
| Verifier | scheduler and checks | `2 running · 5 green · 1 stale` | `check.started/finished`, `verify.*` results | checks with applicability, receipts |
| Ledger | accepted evidence per requirement | `R1 ✓ R2 ▶ R3 ·` | `campaign.increment_closed` | ledger entries, stamp validity |
| You | the authority | `1 question pending` | `ask.question`, `blocked`, attention messages | the pending item; opens the composer |
| Delegates | children by kind | `probe ▸ published · review ▸ running` | `delegation.*`, `cell.started{role}` | handles, leases, packets, child cell links |
| Recovery | ladder and guards | `retry 1/2 · repair spent` | journal recovery payloads (F-50), `cell.gate_fired{repeated-failure, loop, stall}` | recovery timeline |
| KB | knowledge use | `injected 3 · proposed 1` | `kb.*`, injection journal rows | notes, queue |
| Routing | tier/profile decisions | `impl@High · esc 0` | `cell.model_requested.profileId`, escalation rows | routing log, tier table in force |
| Budget | reservations and exhaustion | `128k/480k · reserve ok` | `budget.reserved/exhausted`, usage rows | per-cell partitions (working/verification/recovery) when known |

Rules: a station is **idle** (dim), **active** (accent border and a subtle pulse while an event stream for it is open, e.g. between `model_requested` and `model_responded`), **attention** (amber outline, for You/Recovery/Budget when something waits or is exhausted), **error** (red outline after a failed/rejected/blocked signal until the next successful one). Text inside a station is data, never narrative.

### 6.4 Edges and tokens (animation mapping)

Edges are fixed. A **token** is a 6 px dot that travels along an edge in 400–600 ms when the corresponding event arrives, then fades. Multiple tokens queue at most 4 deep; beyond that the edge shows a count. Reduced motion replaces travel with a one-frame highlight of the edge.

| Event | Edge animated | Token label (on hover) |
|---|---|---|
| `campaign.increment_selected` | Controller → Compiler | increment id |
| `cell.started` | Compiler → Cell | role, context id |
| `cell.model_requested` | Cell → Model | profile, estimated tokens |
| `cell.model_progress{output}` | Model (internal meter fills: `outputTokens` or `textChars`) | — |
| `cell.model_progress{retrying}` | Model (attempt badge increments) | error reason |
| `cell.model_responded` | Model → Cell | stop reason, usage |
| `cell.tool_called` | Cell → Tools/<family> | `family.op`, op id |
| `cell.tool_resulted` | Tools/<family> → Cell (and → Workspace for `edit` with status `ok|partial`; → Verifier for `verify.*`; → You for `task.ask`; → Delegates for `task.delegate`; → KB for `kb.*`) | alias, status, class |
| `check.started` / `check.finished` | Verifier (meter) / Verifier → Ledger when the outcome is `passed` and the check is an acceptance | check id, outcome |
| `cell.gate_fired` | Cell (gate chip flashes; `exit` rejection shows the missing-items count) | gate line |
| `cell.register_patched` | Cell → STATE panel (panel highlights changed sections) | ops count, version |
| `cell.rebuilt` | Cell → Compiler → Cell | reason, generation |
| `cell.ended` | Cell → Controller | status |
| `campaign.increment_closed` | Controller → Ledger | increment id |
| `ask.question` / `blocked` | Cell → You (You turns amber) | question id |
| `contract.amended` | You → Contract → Controller | version, by |
| `delegation.dispatched` / `collected` / `rejected` | Cell → Delegates / Delegates → Cell / Delegates (red flash) | handle, kind, status |
| `budget.reserved` / `exhausted` | Budget (meter) / Budget → Controller (amber) | purpose, scope |
| `kb.proposed` / `admitted` / `invalidated` | Cell → KB / KB (chip) | note id, kind |
| `span.ended` | none (cost rolls into the header) | — |
| `campaign.finished` | Controller → Contract (final state) | outcome |
| `run.reconciled`, `warning` | Controller (chip) | outcome / kind |

Derived signals (no event, from the journal tail): recovery payloads animate Cell → Recovery → Cell; escalation rows animate Routing; a publication outcome animates Ledger → Contract.

### 6.5 Lanes for shapes S1–S3

- **S0/S1**: one cell lane. The Delegates station is present but dim ("not available in S0").
- **S2**: probes and review cells appear as **sub-lanes** under Delegates with their own mini header (kind, role, turn `T/M` from the child's `cell.turn_started`, status) and their own tool counters; their tokens stay in the sub-lane. A child's STATE is available by switching the STATE panel's cell selector.
- **S3**: writers appear as **parallel lanes**, one per handle, each labelled with its worktree (`wt-<inc>-<hash8>`) and increment; the Integrator appears as a station between the lanes and the Ledger with the `IntegrationStep` in progress (`Validate, Freshness, Apply, CombinedCheck, Gates, Publish`) and the round result. A returned unit collapses S3 for the rest of the campaign ("S3 off after a returned unit").

### 6.6 What "reasoning progress" means here

The panel called *STATE* is the only "reasoning" surface, by design (D5). It shows the register the model maintains through validated `state.patch` ops: the plan cursor (`[x]` done, `[>]` cursor, `[ ]` todo, `[-]` cancelled), facts with their kind (h hypothesis, v verified, x refuted) and freshness, dead ends, decisions, open items, focus, pending amendment proposals and the `next` line. It updates on `cell.register_patched` and can be scrubbed through versions. Gate lines (nudges) are shown next to it as "harness feedback to the model". No model prose is summarised or paraphrased anywhere on the Overview.

### 6.7 Accessibility and fallbacks

- The stage has an equivalent **list view** (toggle) with the same stations as rows and the same live text, fully keyboard-navigable and screen-reader friendly; the list is the source of the ARIA live region (polite) that announces state changes at most once per second.
- Colours never carry meaning alone: every state has an icon and text.
- With the WebSocket down, the stage freezes with a "stale since <time>" ribbon; on resync it re-renders from projections without replaying animations.
- Performance budget: ≤ 60 DOM nodes per station, ≤ 200 animated elements at once, rendering in SVG with CSS transforms; events are coalesced to one frame per 50 ms (§11.6).

### 6.8 Acceptance criteria

- **AC-05.1** Every station text is traceable to an event field or a projection; the test fixtures in §8.3 replay a recorded campaign and the stage must reach the recorded end state without desynchronisation.
- **AC-05.2** With `prefers-reduced-motion`, no element moves; state changes remain visible.
- **AC-05.3** A gap in `seq` (simulated by dropping events) leads to a projection refresh and a visible "rebuilt from store" marker, not to a stuck station.
- **AC-05.4** The STATE panel equals `Views.register(context).latest` at every `cell.register_patched`.

---
## 7. Visual design system

### 7.1 Direction

Calm, precise, developer-grade. A graphite neutral scale, one cool accent, three semantic colours. Flat surfaces separated by 1 px borders and slight tonal steps, no gradients, no glow, no large radii. Type is small and crisp; monospace is used wherever an identifier, path, hash, command or number must be read exactly. The same tokens drive dark and light themes; the dark theme is the reference.

### 7.2 Colour tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0F1115` | `#F7F8FA` | app background |
| `--surface` | `#151920` | `#FFFFFF` | panels, sidebar, composer |
| `--surface-2` | `#1B2028` | `#F0F2F5` | raised rows, hover, drawer |
| `--surface-3` | `#222833` | `#E6E9EE` | selected rows, code blocks |
| `--border` | `#2A3140` | `#D9DEE6` | 1 px separators |
| `--border-strong` | `#3A4356` | `#C3CAD5` | focused/active borders |
| `--text` | `#E8ECF2` | `#171B22` | primary text |
| `--text-2` | `#A9B2C0` | `#4F5865` | secondary text |
| `--text-3` | `#737D8C` | `#7D8794` | tertiary, placeholders |
| `--accent` | `#7C9CFF` | `#3B5BDB` | active state, links, focus ring, selection |
| `--accent-bg` | `#1B2440` | `#E7ECFF` | accent tint backgrounds |
| `--ok` | `#3FB950` | `#1A7F37` | passed, verified, admitted |
| `--ok-bg` | `#12291B` | `#DDF4E3` | |
| `--warn` | `#D29922` | `#9A6700` | waiting, stale, pending, partial, unknown cost |
| `--warn-bg` | `#2D2410` | `#FFF3D1` | |
| `--err` | `#F0555A` | `#CF222E` | failed, rejected, blocked, refused |
| `--err-bg` | `#331A1C` | `#FFE1E3` | |
| `--mono-bg` | `#0C0E12` | `#F2F4F7` | code and log viewers |

Rules: status uses `ok/warn/err` only; phases and roles use neutral chips with icons; the accent marks "active/selected/interactive", never a status. Charts use `--accent` for the primary series and the neutral scale for others (§7.6).

### 7.3 Typography and spacing

- UI font: Inter (fallback system UI stack); code font: JetBrains Mono (fallback `ui-monospace`).
- Sizes: 13 px body, 12 px secondary, 11 px labels and chips, 15 px section titles, 18 px page titles. Line height 1.4. Tabular numerals everywhere numbers align.
- Grid 8 px; paddings 12 px; list row 28 px; control height 28 px (compact) / 32 px (comfortable); sidebar 248 px / 48 px; drawer ≤ 480 px; content min width 640 px.
- Radius 6 px (4 px on chips); borders 1 px; shadows only on popovers (dark: none; light: `0 4px 16px rgba(20,24,32,.10)`).

### 7.4 Components (catalog)

| Component | Notes |
|---|---|
| Chip | 11 px, icon + label; variants neutral / accent / ok / warn / err; used for phase, role, kind, status |
| Id chip | monospace, copy on click, link to inspect (`W-…`, `cell-…`, `#42`, `@a1b2`) |
| Gauge line | monospace one-liner mirroring the harness gauge `⟨ctx 41% · reserve ok · …⟩` |
| Meter | thin 4 px bar with label; tokens, budget, output progress |
| Timeline item | 1–2 line row with expander; left rail glyph by kind; hover reveals actions |
| Envelope header | monospace line with parsed chips for `class`, `status`, `stamp`, `truncated` |
| Diff viewer | unified/split, line numbers, hunk headers, `@h8` before/after |
| Log viewer | monospace, virtualised, follow-tail toggle, byte offsets, redaction markers `[REDACTED:kind]` |
| Attention card | kind chip, revision, summary, primary/secondary actions; composer-bound |
| Station | SVG group: rounded rect, title, 2 data lines, state ring |
| Settings field | label, control, default, origin scope, citation link, validation message |
| Command palette | fuzzy list; sections by verb |
| Toast | bottom-right, 4 s, never for events (only for command results and connection state) |

### 7.5 Iconography

Lucide icons at 16 px, 1.5 px stroke. Fixed mapping: contract (file-signature), controller (cpu), compiler (layers), cell (box), model (sparkles — used sparingly), look (search), edit (pencil), run (terminal), verify (check-circle), state (list-checks), task (git-branch), kb (book), workspace (folder-git), verifier (shield-check), ledger (table), you (user), delegates (users), recovery (life-buoy), routing (route), budget (coins), attention (bell), warning (alert-triangle), error (x-circle), ok (check).

### 7.6 Charts

Few and small: budget meter, tokens by dimension (stacked bar, neutral scale + accent for output), cost over turns (line), span tree (indented bars). No pie charts, no 3-D, no gradients. Every chart has a table toggle. Unknown values are drawn as hatched segments with the label `unknown`.

### 7.7 Motion

| Element | Duration | Easing |
|---|---|---|
| hover/focus/expand | 150 ms | ease-out |
| drawer/popover | 200 ms | ease-out |
| token travel | 400–600 ms | ease-in-out |
| station pulse | 1.2 s loop, opacity 0.6→1 | linear |
| meter fill | 250 ms | ease-out |

`prefers-reduced-motion: reduce` disables travel and pulse; state changes use instant highlights.

### 7.8 Accessibility

WCAG 2.2 AA contrast for text and chips in both themes (the tokens above were chosen for ≥ 4.5:1 body text and ≥ 3:1 for large text and UI borders on their surfaces; verify with the contrast check in T-03); visible focus rings (`--accent`, 2 px); full keyboard operation; ARIA roles on lists, tabs, dialogs; live regions for attention arrivals and campaign end; the Overview list-view equivalent; no information by colour alone; text scaling to 150 % without loss.

---
## 8. Prototype

The prototype is (a) the wireframes below, (b) ten storyboards that fix the interaction order, and (c) a runnable fixture-driven prototype (T-04/T-05) that renders recorded campaigns without a live model. Nothing in the prototype invents harness behaviour; every storyboard cites the facts it exercises.

### 8.1 Wireframes

**W1 — Timeline (SCR-04), campaign running, interactive**

```
┌ Sidebar ─────────┐┌ repo-a · W-9f3k a1 · Running · S2 · v3 · inc-2 · turn 7/40 · 128k/480k · $1.42 (+2 unknown) · ⚠1 ┐
│ ▾ repo-a          ││ Timeline ▸ Overview  Contract  Changes  Checks  Context  Processes  Delegations  Knowledge  Usage  Finish │
│   ● W-9f3k a1     │├────────────────────────────────────────────────────────────────────────────────────────────────┤
│   ○ W-2c1d a1 done││ ── cell-7a1 implementing · inc-2 · started 14:02:11 ─────────────────────────────────────── │
│ ▸ repo-b          ││ t6  ◆ turn 6 · stop tool_use · 2 calls                                          [expand]    │
│                   ││ t6  ▪ #38 look(read) src/auth/cache.ts:1-120  ok · v={cache.ts:9c2f}                        │
│ Attention (1)     ││ t6  ✎ #39 edit src/auth/cache.ts @9c2f→@e71a +14 −3 · syntax ok                  Changes ▸  │
│ Connections       ││ t6  ✓ CHK-syntax passed @e71a                                                                │
│ Settings          ││ t6  ⚠ scope: src/util/log.ts outside the increment's write scope — next crossing needs …    │
│                   ││ t7  ◆ turn 7 · requested claude-…@High · est 31.2k · streaming 1.1k tok ▮▮▮▮▮▯▯             │
│                   ││ ── You ──────────────────────────────────────────────────────────────────────────────────── │
│                   ││ ? q-1 (v3) "Should the cache be per-user or global?"  [per-user] [global] [type an answer]  │
├───────────────────┤├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⌘K  ?             ││ [Answer q-1 · v3]  ▢ this changes requirements   ▸ text…                     Ctrl+Enter ⏎     │
└───────────────────┘└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**W2 — Agent Overview (SCR-05), S2 with a probe** — see §6.2 for the full frame; the probe sub-lane sits under *Delegates*:

```
 [Delegates]
   ├─ probe child-k2 · turn 4/15 · look ×6 · published ✓ 14:05:02
   └─ review  (none yet)
```

**W3 — Attention: D-class approval (SCR-15 / composer Decide)**

```
┌ Approval req-…  · contract v3 · raised turn 9 · cell-7a1 ─────────────────────────────┐
│ action    run                                                                          │
│ argv      npm install left-pad                                                         │
│ cwd       /repo-a                                                                      │
│ effect    package-install (D-class)      allowlisted: no                                │
│ reason    "the test runner needs left-pad; see #41"                                     │
│ mode      Interactive · dClass Ask · executionMode trusted-local (not a sandbox)        │
│ [Deny with reason…]                                                        [Approve]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**W4 — Settings: Profiles (SCR-16)**

```
 Profiles                                      Changes apply to the next campaign or attempt (config-frozen).
 ┌ main  anthropic / claude-…  ─────────────────────────────┐ ┌ Validation ───────────────────────────────┐
 │ capabilities   tools ✓ parallel ✓ streaming ✓ …           │ │ Config.violations(): none                  │
 │ limits         context 200000 · output 32000              │ │ AiGateAdapter.violations(): none           │
 │ caching        breakpoints ✓ max 4 · write 5m,1h          │ │ warnings(): catalogCheck=warn: 0            │
 │ usage fields   uncached_input cache_read cache_write_5m … │ │ Qualify (billable, 3–5 calls)   [Run]      │
 │ price table    2026-09-01 USD  in 3.00 · out 15.00 · …     │ │ last qualification: 2026-09-28 qualified   │
 │ gate v1        api anthropic-messages · outputCap enforced│ └────────────────────────────────────────────┘
 │                catalogCheck fail · tokenCount local …     │
 │ [Draft from catalog] [Validate] [Qualify] [Freeze]        │
 └───────────────────────────────────────────────────────────┘
```

### 8.2 Storyboards

Each storyboard lists steps, the messages exchanged (§10) and the facts exercised.

**S1 — First useful run (interactive).** Open repository → `cmd:project.open` → SCR-02 shows no campaigns → New campaign: request "Add a cache to the auth middleware; keep the tests green", mode Interactive, budget default → effective config shows zero violations → `cmd:campaign.start` → `campaign.opened`, `campaign.shape_selected{S1}` → Overview shows the plan cell (`cell.started{role: plan}`) then `inc-1` selected → timeline fills → `campaign.finished{completed}` → Finish shows the receipt with `status = completed`. Facts: F-01, F-15, F-19.

**S2 — Question and answer.** During `inc-2` the cell calls `task.ask` → `ask.question{q-1}` + `blocked` → Attention badge, You station amber → user selects an option, ticks "changes requirements" → `cmd:attention.answer` → backend completes the future → the harness records `amendByUser` (contract v4, `contract.amended{by: user}`) → the cell continues on its next turn. Variant: no answer within the session → campaign ends `waiting_for_input` → the banner offers "Answer and reopen" → `cmd:campaign.reopen` (GAP-01 path) → F-16 checklist runs → `Unblocked`. Facts: F-06, F-08, F-15, F-16.

**S3 — D-class approval and denial.** `run` classified D (`npm install`) → `DClassRequest` → Attention shows argv/cwd/effect/reason and `contractAllowlisted = false` → Deny with reason → the tool result shows `status=denied`, the timeline shows the refusal; the cell records it and continues or asks. Facts: F-08, F-28.

**S4 — Amendment proposal (weakening).** The model proposes narrowing acceptance via `task.propose` → `contract.amendment_proposed{weakening: true}` → the card is marked *weakening*, Accept requires an explicit confirmation naming the obligation; Reject → `contract.amendment_resolved{Rejected}`. In autonomous mode the card appears already resolved by `policy:autonomous`. Facts: F-07.

**S5 — Review verdict by a human.** `IntegrityApproval = Human` and a `deleted-test` flag → `ReviewRequest` → the review form lists the original obligations, the diff (`DIFF` blob), the receipts; the user files `Revise` with one `Major` finding at `src/x.ts:42@e71a` → `cmd:attention.review` → the campaign blocks until the finding is addressed; `Unavailable` (no verdict) is shown as "blocked, never skipped". Facts: F-06, F-32.

**S6 — Finish, publish, export.** `campaign.finished{completed}` → Finish shows acceptance lines green at `@stamp` → user requests publication through `push` with remote `origin` (not in `knownRemotes`) → `cmd:campaign.publish` → stage `local-commit` autonomous? (blast radius 2 files, reversible, S1) → `push` raises `new-network-access` anchor → approval card → Approve → `Published(stage: push, commit, target: refs/heads/astrolabe/W-…/a1)` → exports written; paths listed. Facts: F-20, F-53.

**S7 — Unattended autonomous run.** Mode Autonomous, `dClass Deny`, budget capped; the user leaves; later the campaign shows `budget_exhausted` with `status = partial`; the finish receipt lists `notVerified`; every policy-resolved item is visible under Attention → Resolved. Facts: F-07, F-15, F-19.

**S8 — Connect a provider with OAuth.** Connections → Add `openai-codex` preset → Authenticate → `Auth.login(OAUTH)` with the Console interaction → `msg:auth.notice{OpenUrl}` → "Open browser" → the loopback callback completes the flow (or the user pastes the code in the `Code` prompt) → `Auth.status` re-read → `CONFIGURED` with account. Facts: F-43.

**S9 — Draft, validate, qualify, freeze a profile.** Connections → Catalog → pick `anthropic/claude-…` → Draft profile (`AiGateProfiles.draft`) → the profile editor opens with catalog-derived limits and prices → Validate (`AiGateAdapter.violations`) → Qualify (billable) → report steps `CONFIGURATION … TOOLS PASSED`, `CACHE FAILED` → breakpoints withdrawn with a note → Freeze → new configuration revision → SCR-03 shows it as the main profile for the next campaign. Facts: F-41, F-42.

**S10 — Audit after the fact.** Open a finished campaign → Checks: receipts per check with stamps and raw logs → Usage: calls with native and normalized usage, `unknown` money for two calls → Timeline: jump to `#41` → Processes: the background test server handle, its log tail, exit status → Diagnostics: run fixtures, `report.json` rendered with `unmeasured` invariants. Facts: F-14, F-24, F-30, F-54, F-55.

### 8.3 Fixture-driven runnable prototype

- **Recorded campaigns.** The backend can run ASTROLABE with the core `FakeAdapter` (tests) or the SDK `FakeProvider` (`pacing(tokensPerSecond)`) against a fixture repository (core `testFixtures/resources/fixtures/repos`) and archive the resulting store and event stream as a **cassette**: `state.sqlite` copy + `events.jsonl` + `blobs/`. Cassettes are versioned in the Console repo under `fixtures/campaigns/<name>/`.
- **Replay mode.** `astrolabe-console --replay fixtures/campaigns/s2-probe` serves the cassette through the same WebSocket/REST protocol at a configurable speed (real-time, ×4, step). The frontend cannot tell replay from live; this is the basis for UI tests, demos and the T-04/T-05 prototype.
- **Scenario cassettes to record** (one per storyboard where a fixture can drive it): `s0-complete`, `s1-two-increments`, `s2-probe-review`, `s2-question-blocked`, `s2-dclass-deny`, `s2-weakening-proposal`, `s3-writers-integrate` (flag on), `budget-exhausted`, `cancelled`, `reopen-after-waiting`.
- **Acceptance for the prototype (Phase A):** every screen renders from cassettes with no live provider; the Overview reaches the recorded end state (AC-05.1); the timeline order equals the journal `seq` (AC-04.2).

---
## 9. Backend (Spring Boot, Java 26)

### 9.1 Role of the backend

The backend is the **host** in ASTROLABE's sense: it builds the transport (`Llm`), the adapter (`AiGateAdapter`), the harness (`Astrolabe`/`Controller`), implements the `Authority`, subscribes to events, reads the store, runs host-invoked APIs (curator, exports, accounting), owns configuration files and the Console's own state, and exposes one WebSocket protocol plus REST to the Angular frontend. It runs on the developer's machine next to the repositories.

### 9.2 Stack and constraints

| Item | Choice | Reason |
|---|---|---|
| JDK | 26 (Temurin) | ASTROLABE and AI Gate are compiled for JDK 26 (`options.release = 26`, Kotlin `jvmTarget 26`); FFM native access (`--enable-native-access=ALL-UNNAMED`) is required by `os/*` |
| Framework | Spring Boot latest stable that supports JDK 26 at project start (verify in T-01); Spring MVC + `spring-websocket` (plain `TextWebSocketHandler`), no STOMP/broker | one endpoint, custom envelope with resumable cursors; REST for bootstrap, secrets and large bodies |
| Language | Java for the backend; one small **Kotlin bridge module** (`console-bridge`) for `suspend` APIs of `Controller` (OD-01) | `Controller.run/publish` are `suspend`; `AstrolabeJava` shows the pattern (`scope.future { }`) |
| Build | Gradle (Kotlin DSL) multi-project: `console-backend` (Java), `console-bridge` (Kotlin), `console-web` (Angular, built by the Node plugin into the backend's static resources), `console-desktop` (optional shell) | mirrors ASTROLABE's Gradle conventions; ASTROLABE and AI Gate are consumed as composite builds or Maven local artifacts (`publishToMavenLocal`) |
| Dependencies from ASTROLABE | `io.astrolabe:core`, `provider-api`, `provider-ai-gate`, optional `index-treesitter`; `org.xerial:sqlite-jdbc` (read-only queries through `Project.store`) | |
| Serialization | Jackson for the Console protocol; kotlinx.serialization types from ASTROLABE are converted through their JSON (`Json.encodeToString`) in the bridge, never re-modelled by hand where a serializer exists | |
| Threads | virtual threads for request handling; a dedicated single-threaded **projector** executor per project; the event sink only enqueues | `EventSink` must not block (F-04); `Astrolabe.close()` blocks (F-01) |

### 9.3 Modules and packages (`io.astrolabe.console.*`)

| Package | Responsibility | Key classes |
|---|---|---|
| `host` | lifecycle of `Llm`, `AiGateAdapter`, `Astrolabe`/`Controller` per configuration revision; project registry; campaign runner | `HarnessRuntime`, `ProjectRegistry`, `CampaignRunner`, `ShutdownOrder` |
| `bridge` (Kotlin module `console-bridge`) | Java-friendly wrappers over `Controller.open/run/publish`, `OpenedCampaign.intents.reconcile`, `Attempts.next` | `CampaignBridge`, `PublicationBridge`, `ReconcileBridge` |
| `authority` | `JavaAuthority` implementation backed by the pending-interaction store and the WebSocket | `ConsoleAuthority`, `PendingInteractions`, `ReplyValidator` |
| `events` | `EventSink` → archive → projector notifications | `EventArchive`, `EventPump`, `GapDetector` |
| `readmodel` | `Views` + documented read-only store queries → DTOs; journal tailing; ref resolution; derived projections (changes, processes, recovery, routing, trace) | `Projections`, `JournalTailer`, `RefResolver`, `ChangesProjection`, `ProcessesProjection`, `TraceProjection` |
| `hostops` | host-invoked ASTROLABE APIs: curator, exports, accounting, economics, KB health, fixtures | `CuratorService`, `ExportService`, `AccountingService`, `FixturesService` |
| `providers` | AI Gate runtime: providers config, credentials, auth flows with the Console `AuthInteraction`, catalog, connection tests, profile drafting/qualification | `ConnectionService`, `AuthFlowService`, `CatalogService`, `ProfileService` |
| `settings` | scopes, files, assembly of `Config`, validation, revisions | `SettingsStore`, `ConfigAssembler`, `SettingsValidator` |
| `ws` | protocol handler, sessions, subscriptions, outbox, flow control | `ConsoleSocketHandler`, `Session`, `Outbox`, `Envelope` |
| `api` | REST controllers | `HostController`, `ProjectsController`, `CampaignsController`, `BlobsController`, `SettingsController`, `ConnectionsController`, `StatsController`, `DiagnosticsController` |
| `store` | the Console's own SQLite (`console.sqlite`) | `ConsoleDb`, migrations |
| `security` | local token, origin checks, secret handling | `LocalAuth`, `SecretRedactor` |

### 9.4 Harness lifecycle

1. **Boot.** Load settings (§9.6); build the AI Gate `Llm` (`Llm.builder()` with providers from `providers.json`, `CredentialStore.file(credentials.json)`, `Environment.system()` unless disabled, catalog options, a runtime `LlmListener` for counters); build `AiGateAdapter(llm, profiles)`; build the `Astrolabe` (or `Controller` through the bridge) for the current configuration revision with `ConsoleAuthority`, `OptionalLayers` (tree-sitter outline index when present and flagged; mounts catalog), `estimators = adapter.estimators(HeuristicEstimator())`, `ownsAdapter = false` (the runtime owns the adapter and the `Llm`). If `provider-ai-gate` is absent, boot in **prototype mode** with the fake adapter and a banner.
2. **Configuration revision change.** A new revision does not touch running campaigns (F-36). The runtime builds a new `Astrolabe` lazily for the next `campaign.start`; the previous instance is closed once its campaigns are done (`close()` on a background thread, never from a callback).
3. **Project open/close.** `open(repo)` → `Project`; the registry records path, repo identity, opened at; `close()` is refused while a campaign runs.
4. **Campaign start.** `CampaignRunner` calls the facade (`campaign(project, request, policy, publication)`) or the bridge (`Controller.open` + `run` for reopen); subscribes the project's `EventPump` before starting; stores the handle; awaits completion on a virtual thread; on completion records the outcome and, if a publication request was given, the `PublicationRun`.
5. **Cancel.** `handle.cancel()`; the outcome arrives through `await` (`Cancelled`).
6. **Shutdown** (D-328 order): cancel or wait for campaigns (configurable grace, default `providerTerminalWaitSeconds`) → `Astrolabe.close()` → `AiGateAdapter.close()` → `Llm.close()` → close projects → close the Console DB. The WebSocket announces `msg:connection.status{closing}` first.

### 9.5 Read model implementation

- **EventArchive.** The `EventSink` appends `EventRecord` JSON (kotlinx serializer of `AgentEvent`, F-10) to `console.sqlite` table `events(work, seq, at, type, json)` in batches on the projector thread; the archive is the resume source for `msg:event` with `after` cursors. `Subscription.dropped` and gaps in `seq` are recorded as `gap(work, fromSeq, toSeq)` rows and broadcast as `msg:gap`.
- **JournalTailer.** After each event batch for a work, read `journal` rows with `seq > lastSeq` (`store.db.snapshot`), convert to timeline items (§3.4) and broadcast `msg:timeline.append`. Bodies are not inlined; `refs` and blob digests are.
- **Projections.** Each projection has a `refresh(work)` that runs the `Views` call or a documented `SELECT` and computes a `projectionRevision` (hash of the result); only changed projections are pushed (`msg:projection`). The refresh matrix (§3.3) maps events to projections. All store access is read-only and goes through `Project.store.db` inside `snapshot {}`.
- **Documented store queries (read-only) beyond `Views`:** `journal` by work/seq range/kind/context; `cells`, `turns`, `manifests` by context; `handles` by work; `intents` by work/status; `packets` by work/kind; `notes`, `note_queue`, `note_revisions`, `note_usage` by project; `routing_log` by work; `usage` by work; `leases`; `attempts` by work; `aliases` by work/alias_no. These are the queries `Views` would grow into (OD-02) and live in one class with the SQL as constants.
- **RefResolver.** `blob(digest)` → `store.blobs.get` (verifies the hash; never serves `PREIMAGE` blobs from `blobs/recovery/` to the UI except to render a diff server-side; never serves `NativeReplay`/`RecoveryPreimage` classes as text); `alias(#n)` → `aliases` → `observations.content_blob`; `manifest(id)`; `receiptLog(receiptId)` → `raw_blob`; `finishReceipt(work)` → blob by `finishReceiptRef` or the export file.
- **ChangesProjection.** From journal `edit-outcome` payloads (`Preimage` records: editId, path, versionBefore, preimageDigest, versionAfter) and checkpoint `touched`; diffs computed server-side from `PREIMAGE`/`POSTIMAGE` blobs (java-diff-utils or equivalent) and cached by `(preimageDigest, postimageDigest)`; transforms use their `DIFF` blob.
- **ProcessesProjection.** `handles` rows joined with the log file (`log_path`, size, mtime) and the `.proc.json` sidecar; the live tail reads the file from `cursor` with the Console's redaction (`RedactionConfig` patterns of the frozen attempt config) before sending `msg:process.output`.
- **TraceProjection.** Span tree from archived `span.*` events; inclusive cost aggregation; unknown costs propagate as unknown.
- **Recovery/RoutingProjection.** Journal `boundary` payload types listed in F-50 plus `routing_log`.

### 9.6 Settings and configuration assembly

- Files under `<consoleRoot>` (default `<stateRoot>/astrolabe/console/`): `settings.json` (Console preferences, harness scope: `Config` fields, profiles, tier table, roles, redaction, flags, quality gates), `projects/<repoIdentity>.json` (project scope overrides and start-option defaults), `providers.json` (SDK `ProvidersConfig`, no secrets), `credentials.json` (SDK `CredentialStore.file`, owner-only permissions; never read by the Console for display), `console.sqlite`.
- `ConfigAssembler` merges Harness ← Project ← Start options into one `Config` JSON, decodes it with kotlinx.serialization (bridge), calls `config.violations()` and `AiGateAdapter.violations(llm, profiles)`, and returns the effective JSON, the violation list and a `configRevision` hash. Start is refused while violations exist.
- Every save writes a `settings_revisions` row (revision, at, diff summary). The frozen `attempts` snapshot of a campaign is shown alongside the current settings when they differ.

### 9.7 Providers and authentication

- `ConnectionService` wraps `Llm`: list providers (`describe()` + `ProvidersConfig`), add/update from `Provider.fields()`, validate, remove; `Auth.status/methods/save/logout/revoke`.
- `AuthFlowService` runs `Auth.login` on a virtual thread with a Console `AuthInteraction`: `notify(AuthNotice)` → `msg:auth.notice` (OpenUrl → the UI shows the URL; DeviceCode → code + URI; Progress/Info → lines); `prompt(AuthPrompt)` → `msg:auth.prompt` and blocks until `cmd:auth.answer` arrives (Text/Select/Code; SecretText answers travel over REST `POST /connections/{id}/auth/{flowId}/secret`, never over WebSocket); `CancelToken` on `cmd:auth.cancel`; a 5-minute SDK login timeout. For web hosts without a loopback listener, `AuthInteraction.redirect(redirectUri, sendBrowserTo)` is used and the OAuth callback hits `GET /api/v1/auth/callback` which calls `RedirectInteraction.complete(uri)`.
- `CatalogService`: `ModelCatalog.all/available/refresh`, `Model` DTOs, `ChatOptions.fields(model)`.
- `ProfileService`: `AiGateProfiles.draft`, `AiGateAdapter.violations`, `AiGateProfiles.qualify` (marked billable; requires an explicit confirmation command), `llm.test(model)` with optional probes, `llm.preview` for the sample request.
- Secrets: the UI never receives them; the backend never logs them; `Secret.fingerprint()` only.

### 9.8 Host-invoked operations

`CuratorService` (interactive admission through `ConsoleAuthority`, batch rollback, recheck, prune, promote, regenerate), `ExportService` (`Export.write`, `telemetry.Export.write`, `Economics.export`, `PromotionProposals.export`), `AccountingService` (`Accounting.calls/totals`, per-profile grouping), `FixturesService` (`:eval:fixtures` via Gradle when a checkout is configured; parses `report.json`). Each operation is a command with a durable result (§10.4) and refuses to run concurrently with a running campaign of the same project where the core would race (curator with `kbInjection = Live`).

### 9.9 Console persistence (`console.sqlite`)

| Table | Columns (key) |
|---|---|
| `projects` | `id`, `path`, `repo_identity`, `opened_at`, `last_seen`, `settings_json` |
| `campaigns` | `work_id`, `attempt_id`, `project_id`, `started_at`, `config_revision`, `outcome`, `finished_at`, `publication_json` |
| `events` | `work_id`, `seq`, `at`, `type`, `json` (unique `(work_id, seq)`) |
| `gaps` | `work_id`, `from_seq`, `to_seq`, `at` |
| `interactions` | `id` (request id), `work_id`, `kind` (`question|approval|proposal|review|publication`), `contract_revision`, `raised_seq`, `request_json`, `state` (`pending|answered|superseded|expired`), `reply_json`, `answered_at`, `answered_by` |
| `commands` | `command_id`, `principal`, `name`, `payload_hash`, `state` (`accepted|running|succeeded|rejected|unknown`), `result_json`, `at` |
| `settings_revisions` | `revision`, `at`, `summary`, `config_json` |
| `auth_flows` | `flow_id`, `provider_id`, `state`, `started_at`, `finished_at`, `notices_json` |
| `console_log` | `at`, `level`, `message` (bounded) |

Retention: events per campaign are kept until the campaign row is purged (default never; a settings knob trims archives older than N days for finished campaigns, since the store remains the truth).

### 9.10 Security model (local host)

- Bind to `127.0.0.1` by default; a random bearer token printed at boot and embedded by the desktop shell; the WebSocket upgrade requires the token and an allowed `Origin`; CORS restricted to the served origin.
- Secrets: write-only; redaction on every outbound text (Console patterns = the frozen `RedactionConfig` of the attempt plus Console defaults).
- Commands that change the world (`process.terminate`, `campaign.publish`, `kb.*` admissions, `settings.apply`) require the `confirm: true` flag set by an explicit UI confirmation and are logged in `commands`.
- No remote mode in v1; §12.1 lists what would change (TLS, real auth, per-user credential stores via `Llm.withCredentials`).

### 9.11 Backend requirements (numbered)

- **REQ-B01** Host `Astrolabe`/`Controller` with `ConsoleAuthority`; one campaign per project; refuse concurrent starts with the core's message.
- **REQ-B02** Persist every `EventRecord` per work with its `seq`; serve resumes by cursor; detect and publish gaps.
- **REQ-B03** Tail the journal per work after events; publish timeline items with refs, never bodies.
- **REQ-B04** Serve all `Views` and the documented read-only queries as DTOs with projection revisions.
- **REQ-B05** Resolve refs to blobs, receipts, manifests, aliases; render diffs from preimage/postimage; never expose recovery preimages as text.
- **REQ-B06** Implement `JavaAuthority` with durable pending interactions, single-use replies, `Replies.check` validation, autonomous-policy passthrough.
- **REQ-B07** Assemble, validate and version `Config`; show effective configuration and violations; apply at next campaign.
- **REQ-B08** Manage AI Gate providers, credentials (write-only), auth flows with browser/device/code prompts, catalog, tests, profile draft/validate/qualify.
- **REQ-B09** Run host-invoked ASTROLABE operations (curator, exports, accounting, economics, fixtures) as commands with durable results.
- **REQ-B10** Serve process logs by tailing files from the stored cursor with redaction; support terminate with confirmation.
- **REQ-B11** Provide reopen/resume, post-finish publication and intent reconciliation through the bridge (OD-01).
- **REQ-B12** Implement shutdown in D-328 order; never call blocking harness methods from callbacks.
- **REQ-B13** Replay cassettes through the same protocol for prototype and tests.
- **REQ-B14** Local-only security: loopback bind, token, origin check, secret redaction, confirmation flags.

---
## 10. Protocol: WebSocket, commands, REST, DTOs

### 10.1 Transport choice

- One WebSocket endpoint `GET /ws` (subprotocol `astrolabe-console.v1`), JSON text frames, one connection per browser tab. It carries live events, timeline appends, projection updates, attention items, progress, process output, auth notices/prompts and command results.
- REST under `/api/v1` carries bootstrap reads, paged resources, blobs and files, settings and everything involving secrets. REST is also enough for scripts (§4.3).
- Every frame is an **envelope**: `{"t": "<type>", "id": "<uuid>", "at": "<ISO-8601 UTC>", ...payload}`. Ids and cursors are strings; money is a string with a currency (`"USD 1.42"`) or `null` for unknown; token counts are numbers.

### 10.2 Handshake and subscriptions

1. Client connects with `Authorization: Bearer <token>` (or `?token=` for the desktop shell) and receives `msg:hello`:
   ```json
   {"t":"hello","id":"…","at":"…","console":{"version":"1.0.0","astrolabe":"0.1.0","schema":4,"aiGate":"0.1.0-SNAPSHOT","mode":"live|prototype"},
    "heartbeatSeconds":20,"limits":{"frameBytes":262144,"queuedFrames":2000},"epoch":"<backend start id>"}
   ```
2. Client sends `subscribe` per stream: `{"t":"subscribe","stream":"work:W-9f3k","afterSeq":"481","afterTimelineSeq":"1032"}`; streams are `host` (connection status, settings changed, attention across projects), `project:<id>` (project facts, campaigns list), `work:<workId>` (everything about one campaign).
3. Server replies with `msg:snapshot` for the stream (the current projections, pending interactions, last seqs) and then replays archived `msg:event`/`msg:timeline.append` after the given cursors, then goes live. If `afterSeq` is older than the archive or the `epoch` changed, the server sends the snapshot with `"resync": true` and starts from the current position; the client discards its local state for that stream.
4. `unsubscribe{stream}` stops delivery. `heartbeat` frames flow both ways every 20 s; 60 s silence closes the socket.

### 10.3 Server → client messages

| `t` | Payload | Source |
|---|---|---|
| `hello` | above | — |
| `snapshot` | `stream`, `resync`, `campaign` (CampaignSummaryDto), `projections{contract, ledger, cells, checks, budget, register?, workset?, handles, delegations, recovery, routing, trace, knowledgeQueue}` each with `revision`, `interactions[]`, `lastSeq`, `lastTimelineSeq` | projections |
| `event` | `work`, `seq`, `at`, `event` (the `AgentEvent` JSON, F-10 serial names) | archive/live |
| `gap` | `work`, `fromSeq`, `toSeq`, `reason` (`dropped|restart`) | GapDetector |
| `timeline.append` | `work`, `items[TimelineItemDto]`, `lastTimelineSeq` | JournalTailer |
| `projection` | `work`, `name`, `revision`, `data` | Projections |
| `campaign.state` | `work`, `phase`, `outcome`, `reason`, `contractVersion`, `shape`, `currentIncrement`, `currentCell`, `turn`, `turnsMax` | Projections |
| `progress` | `work`, `context`, `invocationId`, `stage`, `textChars`, `outputTokens`, `attempt` (coalesced to ≤ 10/s) | `cell.model_progress` |
| `attention.pending` | `InteractionDto` | ConsoleAuthority |
| `attention.resolved` | `id`, `state` (`answered|superseded|expired`), `byAuthority`, `reason` | ConsoleAuthority |
| `process.output` | `work`, `handleId`, `fromByte`, `toByte`, `text` (redacted), `status` | ProcessesProjection |
| `command.result` | `commandId`, `state` (`accepted|running|succeeded|rejected|unknown`), `result?`, `error?{code, message, details}` | command dispatcher |
| `connection.status` | `state` (`ready|degraded|closing`), `harness` (`live|prototype`), `providers[{id, authState}]` | host |
| `auth.notice` | `flowId`, `providerId`, `notice{kind: openUrl|deviceCode|info|progress, url?, instructions?, userCode?, verificationUri?, expiresAt?, message?, links?}` | AuthFlowService |
| `auth.prompt` | `flowId`, `promptId`, `kind` (`text|select|code`), `message`, `placeholder?`, `options?[{id, label, description}]` (`secretText` prompts are announced here but answered over REST) | AuthFlowService |
| `settings.changed` | `revision`, `summary`, `violations[]` | SettingsStore |
| `warning` | `work?`, `kind`, `text` | `warning` events and Console warnings |

### 10.4 Client → server commands

`{"t":"command","commandId":"<uuid>","name":"<cmd>","target":{"projectId"?,"work"?},"expected":{"contractRevision"?},"confirm"?:true,"payload":{…}}` → one or more `command.result` frames. Idempotency: the backend stores `(principal, commandId, payloadHash)`; a repeat returns the stored state; a different payload under the same id is `rejected{IDEMPOTENCY_CONFLICT}`. A command whose effect is uncertain after a crash stays `unknown` and is never auto-repeated.

| Command | Payload | Effect | Facts |
|---|---|---|---|
| `project.open` | `path` | `Astrolabe.open` | F-01 |
| `project.close` | `projectId` | `Project.close` (refused while running) | F-02 |
| `campaign.start` | `projectId`, `request`, `policy{tokens, cost?, resumeExpected}`, `publication?{through, remote, mergeTarget, deployTarget{name, production}, knownRemotes, message}`, `configRevision` | facade `campaign(...)` | F-01, F-20 |
| `campaign.cancel` | `work` | `handle.cancel()` | F-03 |
| `campaign.amend` | `work`, `text`, `expected.contractRevision` | `handle.amend(text)`; rejected if the revision moved | F-03 |
| `campaign.reopen` | `work`, `attempt`, `policy?` | bridge `Controller.open` + `run` (same ids) | GAP-01 |
| `campaign.publish` | `work`, `through`, `remote?`, `mergeTarget?`, `deployTarget?`, `knownRemotes`, `message?`, `confirm` | bridge `Controller.publish` | GAP-02 |
| `campaign.export` | `work`, `kinds[views|usage|economics|promotion]` | host-invoked exports | F-53 |
| `attention.answer` | `id`, `contractRevision`, `text`, `chosenOption?`, `changesRequirements` | completes the `ask` future with `Answer` | F-06 |
| `attention.decide` | `id`, `contractRevision`, `approved`, `reason?`, `confirm` (for approvals) | completes `approve` with `Decision` | F-06 |
| `attention.resolve` | `id`, `contractRevision`, `outcome` (`Accepted|Rejected|Pending`), `reason?`, `confirmWeakening?` | completes `resolve` with `Resolution` | F-07 |
| `attention.review` | `id`, `contractRevision`, `verdict{outcome, findings[], coverage, contractViolations, confidence, missingCriterion?}` | completes `review` with `Verdict` (`signedBy` = Console identity) | F-06 |
| `attention.dismiss` | `id` | marks a policy-resolved item as read | — |
| `intent.reconcile` | `work`, `intentId`, `evidence`, `confirm` | bridge `IntentJournal.reconcile` | GAP-03 |
| `process.terminate` | `work`, `handleId`, `confirm` | `Project.os.terminate` (logged) | GAP-06 |
| `kb.admit` / `kb.reject` / `kb.rollback` / `kb.recheck` / `kb.prune` / `kb.promote` / `kb.regenerate` | ids / batch | `Curator` | F-53 |
| `auth.answer` | `flowId`, `promptId`, `value` (non-secret) | unblocks `AuthInteraction.prompt` | F-43 |
| `auth.cancel` | `flowId` | cancels the `CancelToken` | F-43 |
| `settings.apply` | `revision`, `confirm` | makes a saved revision the one used by the next campaign | F-36 |
| `subscribe` / `unsubscribe` / `heartbeat` | as above | — | — |

Errors (`command.result.error.code`): `VALIDATION`, `NOT_FOUND`, `CONFLICT` (revision moved, campaign running), `SUPERSEDED` (`Replies.check`), `REFUSED` (harness refusal, message verbatim), `UNSUPPORTED` (gap not closed, e.g. MCP), `IDEMPOTENCY_CONFLICT`, `INTERNAL`.

### 10.5 REST resources

| Method and path | Returns / does |
|---|---|
| `GET /api/v1/health`, `GET /api/v1/host` | liveness; versions, mode, paths, counters |
| `GET/POST /api/v1/projects`, `GET /api/v1/projects/{id}`, `DELETE …` | registry; open/close |
| `GET /api/v1/projects/{id}/campaigns` | `campaigns` + Console registry rows |
| `GET /api/v1/campaigns/{work}` | CampaignSummaryDto (phase, outcome, reason, shape, contract version, frozen config revision, started/finished) |
| `GET /api/v1/campaigns/{work}/snapshot` | same as `msg:snapshot` (for scripts) |
| `GET /api/v1/campaigns/{work}/events?after=&limit=` | archived events |
| `GET /api/v1/campaigns/{work}/journal?after=&limit=&kinds=&context=&turn=` | timeline items |
| `GET /api/v1/campaigns/{work}/contract?version=`, `/ledger`, `/checks`, `/receipts`, `/budget`, `/finish-receipt`, `/cells`, `/cells/{context}/register?version=`, `/cells/{context}/workset`, `/cells/{context}/manifest`, `/cells/{context}/turns`, `/handles`, `/intents`, `/packets?kind=`, `/delegations`, `/recovery`, `/routing`, `/trace`, `/changes`, `/changes/diff?edit=` | projections |
| `GET /api/v1/campaigns/{work}/handles/{handleId}/log?from=&to=` | redacted log bytes (text) |
| `GET /api/v1/blobs/{digest}` (`?as=text|download`) | blob content with kind checks (no recovery preimages) |
| `GET /api/v1/aliases/{work}/{n}` | alias → observation → blob |
| `GET /api/v1/campaigns/{work}/exports` | list of export files; `POST` triggers (same as `cmd:campaign.export`) |
| `GET/PUT /api/v1/settings/{scope}` (`harness|project:<id>`) | settings JSON; `PUT` creates a revision |
| `GET /api/v1/settings/effective?projectId=&start=…` | assembled `Config` JSON + violations + revision |
| `GET /api/v1/settings/schema` | field metadata for the settings UI (defaults, ranges, citations; generated from Appendix B) |
| `GET/POST/PUT/DELETE /api/v1/connections` | providers (`providers.json`) with `FieldDescriptor` metadata |
| `GET /api/v1/connections/{id}/auth` | `AuthStatus`; `POST …/auth/apikey` (secret, write-only), `POST …/auth/login` (starts a flow → `flowId`), `POST …/auth/{flowId}/secret`, `POST …/auth/logout`, `POST …/auth/revoke`, `GET /api/v1/auth/callback` (OAuth redirect target) |
| `GET /api/v1/catalog?provider=` / `POST /api/v1/catalog/refresh` | models |
| `POST /api/v1/profiles/draft`, `POST /api/v1/profiles/validate`, `POST /api/v1/profiles/qualify` (billable, requires `confirm`), `POST /api/v1/connections/{id}/test` (optional probes, `confirm` when billable), `POST /api/v1/connections/{id}/preview` | profile and connection tools |
| `GET /api/v1/stats/{work}/calls`, `/totals`, `/economics`, `/calibration`, `/kb-health` | statistics |
| `GET /api/v1/knowledge?project=&kind=&status=`, `/knowledge/queue`, `/knowledge/{noteId}`, `/knowledge/skills`, `/knowledge/bmaps` | KB |
| `POST /api/v1/diagnostics/fixtures` / `GET …/fixtures/latest` | `report.json` |
| `POST /api/v1/replay` (prototype mode) | load a cassette |

### 10.6 Core DTOs (condensed; full field lists in Appendix D)

- `CampaignSummaryDto{work, attempt, projectId, phase, outcome, reason, shape, contractVersion, configRevision, startedAt, finishedAt, currentIncrement, currentCell{context, role, status, turn, turnsMax}, budget{tokensSpent, tokensLimit, money, unknownCount}, pendingInteractions}`
- `TimelineItemDto{seq, at, kind (request|amendment|model|tool|edit|check|nudge|boundary|intent|reconcile|attention|marker), context, role, turn, phase, alias?, title, subtitle?, status?, effectClass?, stamp?, refs[{type, id}], payloadType?, expandable}`
- `InteractionDto{id, kind (question|approval|proposal|review|publication), work, context?, contractRevision, raisedSeq, state, request (the harness object verbatim), reply?, byAuthority?, reason?}`
- `ContractDto` (= `ContractView` rows decoded), `LedgerDto`, `IncrementDto`, `CellDto{context, role, status, increment, turns, registerVersion, stamp, touched[], openIntents, rebuilds, manifestRef}`, `RegisterDto`, `WorksetDto`, `CheckDto{id, kind, selector, trigger, costClass, lastOutcome, applicability, staleReason?, lastStamp, acceptanceIds}`, `ReceiptDto` (F-32 fields), `ChangeDto{path, kind, origin, before, after, editId?, cell, increment, added, removed, diffAvailable}`, `HandleDto{handleId, alias, argv, cwd, effectClass, status, startedAt, cursor, logBytes}`, `IntentDto`, `DelegationDto{handle, kind, mode, child, dispatchedAt, lease, delegatedCost?, status?, reason?}`, `RecoveryItemDto{seq, type, class?, step?, outcome?, tier?, change?, hypothesis?, text}`, `CallDto` (F-54 `CallAccount`), `SpanDto{id, parent, phase, status, exclusiveCost, inclusiveCost, durationNanos, ids}`, `NoteDto` (F-52), `QueueEntryDto`, `ProviderDto{id, preset, name, baseUrl, defaultApi, apis, authMethods, authStatus, fields[]}`, `ModelDto`, `ProfileDto` (ASTROLABE `Profile` JSON + validation + qualification summary), `SettingsFieldDto{path, type, default, value, origin, range?, citation, unused?}`, `FixtureReportDto`.

### 10.7 Event → UI mapping (summary; the full table is Appendix A)

Every `AgentEvent` is forwarded verbatim as `msg:event` and additionally triggers: projection refreshes (§3.3), timeline appends (journal tail), `campaign.state` (for `campaign.*`, `cell.started/ended`, `cell.turn_started`), `progress` (for `cell.model_progress`), `attention.pending` (for `ask.question` via the authority bridge, not the event), and the Overview animations (§6.4). Never-emitted events (GAP-10) have no live mapping; their information reaches the UI through timeline items and projections, and the frontend must not wait for them.

### 10.8 Flow control and limits

Frames ≤ 256 KiB (bodies go through REST); per-socket outbox ≤ 2000 frames or 8 MiB, oldest `progress`/`process.output` frames dropped first, then the socket receives `resync` for affected streams; `progress` coalesced to 10/s per invocation; `process.output` chunks ≤ 64 KiB at ≤ 5/s per handle; reconnect with jittered backoff 0.5 s → 15 s.

---

## 11. Frontend (Angular)

### 11.1 Stack

- Angular latest stable at project start (20+): standalone components, signals, zoneless change detection, the built-in control flow, `@defer` for heavy viewers; TypeScript strict; ESLint + Prettier.
- Libraries (all permissive): `@angular/cdk` (virtual scroll, overlay, a11y, drag for the drawer resize), CodeMirror 6 (diff and log viewers, read-only; syntax highlighting), `diff2html` or a small custom unified/split renderer over server-computed diffs, Lucide icons, no CSS framework (hand-written tokens, §7), `d3-shape`/`d3-scale` only for the few charts, no state-management library (signal stores).
- Testing: Vitest (unit), Playwright (e2e against replay cassettes), axe (accessibility), Storybook for components (optional).

### 11.2 Structure

```
console-web/src/app/
  core/            protocol client, session/token, theme, keyboard, notifications
  state/           signal stores: host, projects, campaign(work), attention, settings, connections
  shell/           layout, sidebar, header strip, tabs, composer, command palette, drawer
  features/
    start/ project/ new-campaign/ timeline/ overview/ contract/ changes/ checks/ context/
    processes/ delegations/ knowledge/ usage/ finish/ attention/ settings/ connections/ diagnostics/
  ui/              chips, id-chip, gauge, meter, envelope-header, diff-viewer, log-viewer, station, forms
  model/           DTO types generated from the backend's OpenAPI + message schema (T-02)
```

### 11.3 Protocol client and state

- `ConsoleSocket` (one per tab): connects, authenticates, sends `subscribe` for the streams the current route needs, maintains cursors (`lastSeq`, `lastTimelineSeq`) per stream, reconnects with backoff, and re-subscribes with cursors; on `resync` it clears the stream's store.
- `CampaignStore(work)`: signals for `summary`, each projection (with revision), `timeline` (ordered array keyed by seq, appended and deduplicated), `events` (ring buffer for the Overview, last 2000), `interactions`, `progress` (per invocation), `processOutput` (per handle ring buffer), `gaps`. Projection updates replace by name; timeline appends are inserted by seq.
- Derived signals: `currentCell`, `currentTurn`, `stationStates` (Overview), `attentionCount`, `budgetGauge`.
- Body loading (blob, diff, log) is on demand through REST with an LRU cache keyed by digest.

### 11.4 Rendering rules

- Timeline: CDK virtual scroll with variable heights; expanders load bodies lazily; the list follows the tail unless scrolled up; new-item pill; keyboard navigation (§4.8).
- Overview: one SVG with fixed station coordinates per shape template (S0/S1, S2, S3-with-N-lanes); tokens are `<circle>` elements animated with CSS transforms along precomputed paths; event coalescing to one frame per 50 ms; list-view twin fed by the same `stationStates` signal.
- Diff viewer: server-side computed hunks; split/unified toggle; hash chips before/after; large diffs (> 5000 lines) paginated by file.
- Log viewer: virtualised lines; byte offsets from `fromByte`; redaction markers styled; follow-tail toggle; search.
- Forms (settings, connections): schema-driven from `GET /settings/schema` and `Provider.fields()`; each field shows default, origin scope and citation; validation messages from the backend verbatim.
- Attention: forms per kind; the composer is a shell-level component bound to the `attention` store and the campaign route.

### 11.5 Theming and accessibility

Tokens as CSS custom properties on `:root` with `[data-theme]`; `prefers-color-scheme` default; density class on `body`; focus-visible styling; ARIA on tabs/lists/dialogs; live regions in the shell for attention and campaign end; the Overview list twin; all icons have labels; keyboard shortcuts documented and remappable in settings.

### 11.6 Performance budgets

Initial load ≤ 300 KB gzipped JS for the shell (features lazy-loaded); timeline renders 10 000 items smoothly (virtualised); Overview ≤ 16 ms per frame with 200 animated elements; projection updates ≤ 50 ms to paint; memory bounded by ring buffers (events 2000, process output 1 MB per handle).

### 11.7 Frontend requirements (numbered)

- **REQ-F01** Shell with sidebar, header strip, tabs, composer, command palette, drawer, dark/light.
- **REQ-F02** Protocol client with cursors, resume, gap and resync handling.
- **REQ-F03** Timeline from `TimelineItemDto` with lazy bodies, filters and deep links.
- **REQ-F04** Overview per §6 with list twin and reduced-motion support.
- **REQ-F05** Contract, Changes, Checks, Context, Processes, Delegations, Knowledge, Usage, Finish screens per §5.
- **REQ-F06** Attention queue and composer modes with revision checks.
- **REQ-F07** Settings and Connections forms driven by backend schema and SDK field descriptors; secrets write-only.
- **REQ-F08** Accessibility (WCAG 2.2 AA) and keyboard model.
- **REQ-F09** Replay-driven e2e tests for the ten storyboards.

---

## 12. Cross-cutting rules

### 12.1 Trust boundaries and deployment

- v1 is local: backend and browser on one machine; loopback bind; bearer token; no TLS. The desktop shell (Tauri preferred for size; Electron acceptable) embeds the token and opens the window; it adds folder pickers, "open in editor", notifications and single-instance handling. Web-only use is identical minus those conveniences.
- Remote mode (later): TLS termination, real authentication, `Llm.withCredentials(store)` per user, per-user Console DB rows, and a review of every command's authorization. Not designed here beyond noting the seams.

### 12.2 Authority rules the Console enforces on itself

1. It never writes ASTROLABE tables or files under the project state root except through host-invoked APIs and the export directory.
2. It never answers a harness request without a user action, except by the harness's own autonomous policy.
3. Weakening amendments need an explicit confirmation naming the obligation; the default button is Reject.
4. Approvals for D-class effects and publication stages show action, argv, cwd, expected effect, reason, anchors and the execution mode label; "trusted-local" is never described as isolated.
5. Replies carry the contract revision and are refused when superseded, client- and server-side.
6. Process termination and intent reconciliation are explicit, confirmed, logged and explained as unknown-outcome-producing.
7. Nothing on screen claims completion, verification or delivery beyond the harness's recorded status (F-46).

### 12.3 Errors, staleness and reconnect

- Every error shown carries the harness or SDK message verbatim plus the Console's context; no rewording of refusal reasons.
- Staleness: a stream without heartbeat for 60 s is "stale"; screens keep their data with a ribbon; commands are disabled until reconnected; on resync, timeline and projections rebuild from the store (never from memory).
- Backend restart: pending interactions reload; those whose harness future is gone are shown `expired`; campaigns that were running are shown with their store state (`Lost` cell, resumable outcome) and the reopen action.
- Provider errors during a campaign surface as timeline items (journal) and as `cell.model_progress{retrying}`; the Console never retries provider calls itself (the SDK's `RetryPolicy` is the only retry loop).

### 12.4 Observability of the Console itself

Structured logs (JSON) with `work`, `commandId`, `seq` fields; counters for events received, archived, dropped, gaps, projection refresh times, WebSocket queue depth; a `/diagnostics` view; optional export of Console logs alongside campaign exports for bug reports (secrets redacted).

### 12.5 Desktop packaging

Tauri shell bundling the backend as a sidecar (JDK 26 runtime image via `jlink`), the Angular build as static assets, and the AI Gate/ASTROLABE jars; Windows and Linux first (ASTROLABE's targets), macOS when the harness's OS layer is verified there. Auto-update is out of scope for v1.

---
## 13. Implementation plan

### 13.1 Rules of the plan

1. Phases end with a reviewable, runnable outcome; no phase starts before the previous one's gate passes.
2. Every task names its acceptance (`AC-*` from §5–§6 or its own) and its verification (tests, replay cassettes, manual checks).
3. Facts in §2 are the contract with ASTROLABE; if a task finds them wrong, it fixes §2 first and records the change.
4. Gaps are closed only by the owner listed in §2.14; the Console never works around a gap by writing into ASTROLABE's state.
5. Configuration, protocol and DTOs are generated once and reused (T-02); no hand-written duplicates.
6. Prototype mode (cassettes, fake adapter) is a first-class runtime, kept green forever.

### 13.2 Phases and gates

| Phase | Outcome | Gate |
|---|---|---|
| A — Foundations and prototype (T-01…T-06) | Backend skeleton, protocol, generated types, shell, timeline and overview rendering recorded cassettes | Replay of `s2-probe-review` renders every screen; AC-04.2, AC-05.1, AC-05.2 pass |
| B — Live campaign (T-07…T-13) | Real campaigns with the fake adapter and with AI Gate; authority bridge; settings; connections | Storyboards S1–S3, S8, S9 pass end to end on Windows and Linux |
| C — Daily use (T-14…T-20) | Attention lifecycle complete, changes/checks/context/processes/delegations, reopen, publication, exports, knowledge | Storyboards S4–S7, S10 pass; accessibility audit passes |
| D — Delivery (T-21…T-24) | Desktop shell, diagnostics/fixtures, performance and reliability gate, documentation | Performance budgets met; 24-hour soak with cassettes; release candidate |

### 13.3 Tasks

Each task: goal · deliverables · depends on · acceptance · verification. Sizes: S ≤ 2 days, M ≤ 5, L ≤ 10.

**T-01 Toolchain and compatibility (S).** Prove Spring Boot + JDK 26 + ASTROLABE composite build + AI Gate composite build + Angular toolchain on Windows and Linux; decide artifact strategy (`publishToMavenLocal` vs composite). Deliver: `console/` repo skeleton, `settings.gradle.kts` including `../ASTROLABE` and `../llm-transport-sdk/llm`, CI workflow (both OSes). Acceptance: `./gradlew build` green; a smoke test constructs `AstrolabeJava` with the fake adapter. Verification: CI run.

**T-02 Contracts and generated types (M).** Define the envelope, message and command catalog (§10), REST OpenAPI, DTOs (Appendix D); generate TypeScript types; write the settings schema (Appendix B) as data. Depends: T-01. Acceptance: schema round-trips every `AgentEvent` serial name (F-10) through Jackson and TypeScript; a contract test fails when ASTROLABE's `core.api` changes an event. Verification: unit tests over the ABI dump.

**T-03 Design tokens and shell (M).** Implement §7 tokens (dark/light), the shell (sidebar, header strip, tabs, composer skeleton, drawer, command palette), keyboard model, contrast checks. Depends: T-02. Acceptance: WCAG contrast test passes for every token pair; layout holds at 1100/800 px. Verification: Playwright screenshots; axe.

**T-04 Event archive, journal tailer and replay (L).** Backend `EventArchive`, `JournalTailer`, `Projections` (all `Views` + documented queries), `RefResolver`, cassette recorder/replayer, WebSocket handler with cursors, gaps and resync. Record the cassettes listed in §8.3 with the fake adapter. Depends: T-02. Acceptance: REQ-B02–B05, REQ-B13; replay speed control; gap simulation triggers resync (AC-05.3). Verification: backend integration tests over cassettes.

**T-05 Timeline and Overview on cassettes (L).** Frontend protocol client and stores (§11.3), Timeline (§5.4), Overview (§6) with stations, tokens, lanes, STATE panel, turn strip, list twin. Depends: T-03, T-04. Acceptance: AC-04.1–04.3, AC-05.1–05.4. Verification: Playwright over all cassettes; reduced-motion test.

**T-06 Phase A gate (S).** Demo script through every screen in replay; fix list. Depends: T-05.

**T-07 Harness runtime and project registry (M).** `HarnessRuntime` (Llm, adapter, Astrolabe per revision; prototype fallback), `ProjectRegistry`, `CampaignRunner`, shutdown order (REQ-B01, B12). Depends: T-04. Acceptance: start/cancel/await a fake-adapter campaign; refuse a second campaign with the core message; shutdown never deadlocks (test with a pending authority future). Verification: integration tests.

**T-08 Authority bridge and Attention (L).** `ConsoleAuthority`, `PendingInteractions`, `ReplyValidator` (`Replies.check`), `attention.*` messages and commands, the Attention screen and composer modes Answer/Decide/Resolve/Review (REQ-B06, REQ-F06). Depends: T-07, T-05. Acceptance: S2 (question), S3 (approval), S4 (weakening), S5 (review) on fake-adapter campaigns; superseded replies refused both sides; restart keeps pending items (AC-15.2). Verification: e2e.

**T-09 Settings service and screens (L).** `SettingsStore`, `ConfigAssembler`, `SettingsValidator` (`Config.violations`, `AiGateAdapter.violations`), revisions, effective view, schema-driven forms for every section of §5.16, role override validation (REQ-B07, REQ-F07). Depends: T-07, T-02. Acceptance: AC-16.1, AC-16.2; every field in Appendix B is bound or marked read-only/unused. Verification: unit tests against `Config.violations()` cases; e2e.

**T-10 Connections and auth flows (L).** `ConnectionService`, `AuthFlowService` (browser/device/code prompts, loopback and redirect variants, cancel), `CatalogService`, connection tests and previews, the Connections screen (REQ-B08, §5.17). Depends: T-07. Acceptance: S8 with a fake OAuth server; secrets never in WS frames or logs (AC-17.1); statuses re-read after flows (AC-17.2). Verification: integration tests with `FakeProvider` and a local OAuth stub.

**T-11 Profiles: draft, validate, qualify, freeze (M).** `ProfileService`, profile editor, qualification report rendering (S9). Depends: T-09, T-10. Acceptance: a drafted profile validates; a qualification with a failed cache step withdraws breakpoints and records the note. Verification: fixture-backed tests (recorded frames from `provider-ai-gate` tests).

**T-12 New campaign and live start (M).** SCR-03 with start options, effective configuration, violations; `cmd:campaign.start` through the facade; header strip and campaign state (REQ-F05 part). Depends: T-08, T-09. Acceptance: AC-03.1, AC-03.2; S1 passes with the fake adapter and, when keys are present, with AI Gate (`liveTest`-style opt-in). Verification: e2e; owner-run live check.

**T-13 Phase B gate (S).** Windows + Linux runs of S1–S3, S8, S9. Depends: T-10…T-12.

**T-14 Contract & Plan, Finish (M).** SCR-06 and SCR-14 (receipt from blob/export, publication ladder rendering). Depends: T-12. Acceptance: AC-06.1, AC-06.2, AC-14.1, AC-14.2.

**T-15 Changes and diffs (M).** `ChangesProjection`, server-side diffs from preimage/postimage and `DIFF` blobs, SCR-07. Depends: T-04. Acceptance: AC-07.1, AC-07.2.

**T-16 Checks & Evidence, Context (M).** SCR-08 (checks, receipts, baseline, integrity flags, reviews) and SCR-09 (register history, workset, manifest, reconstruction). Depends: T-04. Acceptance: AC-08.1, AC-08.2, AC-09.1, AC-09.2.

**T-17 Processes and intents (M).** `ProcessesProjection`, log tailing with redaction, `process.terminate`, `intent.reconcile` through the bridge (REQ-B10, REQ-B11 part), SCR-10. Depends: T-07, bridge. Acceptance: AC-10.1, AC-10.2; a reconciled intent lifts the fence on reopen.

**T-18 Reopen, publication after finish, bridge (L).** Kotlin `console-bridge`: `CampaignBridge.reopen`, `PublicationBridge.publish`, `ReconcileBridge`; `cmd:campaign.reopen`, `cmd:campaign.publish`; Finish screen actions (OD-01, GAP-01/02/03). Depends: T-07. Acceptance: S2 variant (reopen after `waiting_for_input`), S6 (publish through push with an anchor approval) on a local bare remote. Verification: integration tests with temp git remotes.

**T-19 Delegations, recovery, usage and routing (M).** SCR-11 and SCR-13 projections (delegation events, packets, journal recovery payloads, `routing_log`, `Accounting`, spans, economics on demand). Depends: T-04. Acceptance: AC-11.1, AC-11.2, AC-13.1, AC-13.2; S7 and S10 pass.

**T-20 Knowledge and host operations (M).** `CuratorService` with interactive admission through Attention, `ExportService`, SCR-12, export buttons on Finish (REQ-B09). Depends: T-08. Acceptance: AC-12.1, AC-12.2; exports byte-identical to core's `Export.write` output.

**T-21 Desktop shell (M).** Tauri sidecar packaging, token hand-off, folder picker, notifications, single instance, Windows/Linux installers. Depends: T-13. Acceptance: installer boots to SCR-01 with the backend healthy.

**T-22 Diagnostics and fixtures (S).** SCR-18, `FixturesService` (`:eval:fixtures`, `report.json`), Console counters. Depends: T-07. Acceptance: AC-18.1.

**T-23 Reliability, performance and accessibility gate (M).** Soak with cassettes at ×4 for 24 h; memory bounds; performance budgets (§11.6); WCAG audit; reconnect/restart chaos tests (kill backend mid-campaign with a fake adapter, verify store-driven recovery views). Depends: T-14…T-22.

**T-24 Documentation and release (S).** User guide (screens, settings, authority rules), operator guide (files, ports, token, exports), developer guide (protocol, projections, cassettes), CHANGELOG, licence notice (OD-04). Depends: T-23.

### 13.4 Dependency graph

```
T-01 → T-02 → T-03 ─┐
             └─→ T-04 → T-05 → T-06 ─┐
T-04 → T-07 → T-08 ──────────────────┼→ T-12 → T-13 → T-14, T-21
T-02 → T-09 ─────────────────────────┘        T-04 → T-15, T-16, T-19
T-07 → T-10 → T-11                            T-07 → T-17, T-18, T-22
T-08 → T-20                                    T-14…T-22 → T-23 → T-24
```

### 13.5 Verification strategy

- **Unit**: DTO mapping against the kotlinx JSON of real ASTROLABE types; `Replies.check` paths; settings validation cases from `Config.violations()`; redaction.
- **Integration (backend)**: fake-adapter campaigns from core `testFixtures`; cassette record/replay determinism; bridge reopen/publish against temp repositories; authority futures with restarts.
- **E2E (frontend)**: Playwright over cassettes for every storyboard; axe on every screen; reduced-motion; keyboard-only run of S1–S3.
- **Live (opt-in, owner)**: one AI Gate campaign per provider with keys from the environment, recorded as a cassette afterwards for regression; never in CI.
- **Cross-platform**: Windows and Linux CI for backend and e2e (ASTROLABE's own targets).

### 13.6 Risk register

| Id | Risk | Mitigation |
|---|---|---|
| RISK-01 | Facade gaps (GAP-01/02/03) make reopen/publish depend on `Controller` internals that may change | isolate in `console-bridge`; contract tests against `core.api`; propose facade seams to the owner |
| RISK-02 | Never-emitted events (GAP-10) tempt the UI to wait for signals that never come | Appendix A marks them; the frontend has no code path keyed on those names except replay of archived events |
| RISK-03 | Event drops under load (`DROP_OLDEST`) | archive on the projector thread with large buffers; gap detection; store-driven rebuild |
| RISK-04 | Blocking the bus or calling `close()` from callbacks | sink only enqueues; shutdown on its own thread; tests with a pending authority future |
| RISK-05 | Secrets leaking through logs, frames or exports | write-only secrets; redaction on outbound text; contract tests grep frames for fingerprints only |
| RISK-06 | Direct store reads racing the harness | `store.db.snapshot`; read-only; no long transactions; projections refreshed after events, not polled tightly |
| RISK-07 | JDK 26 / Spring Boot compatibility surprises | T-01 first; pin versions; keep the backend free of native code beyond ASTROLABE's |
| RISK-08 | Overview becomes decorative | every station text is data-bound; AC-05.1 replay parity; no free-text narration |
| RISK-09 | Configuration freeze confuses users | banner on every settings page; frozen snapshot shown next to current; `config-frozen` warnings surfaced |
| RISK-10 | GPL licence of AI Gate | OD-04 before release |
| RISK-11 | Windows path and process quirks (worktree cleanup, ownership) | follow ASTROLABE's known gotchas; CI on Windows |
| RISK-12 | Timeline size for long campaigns | virtualisation, paging by journal seq, lazy bodies |

---

## 14. Implementation request

Use the following as the opening prompt for the implementing agent or team. It is self-contained together with this document.

> **Task.** Build ASTROLABE Console as specified in `ASTROLABE_UI_FABLE.md`: a Spring Boot (Java 26) backend hosting the ASTROLABE harness (`ASTROLABE/`) and the AI Gate transport (`llm-transport-sdk/llm`), an Angular frontend, a WebSocket-first protocol with REST, and a fixture-driven prototype mode.
>
> **Read first.** §0 (conventions), §2 (verified facts, gaps, owner decisions), §3 (read model), §10 (protocol), then the sections for the task you take. Treat §2 as the contract with ASTROLABE; verify any fact you depend on against the sources in Appendix F before coding, and correct §2 if the code disagrees.
>
> **Repository layout.** Create `console/` beside `ASTROLABE/` and `llm-transport-sdk/` with Gradle projects `console-backend` (Java), `console-bridge` (Kotlin, only for `suspend` seams), `console-web` (Angular), `console-desktop` (Tauri, Phase D), and `fixtures/campaigns/` for cassettes. Include both sibling builds as composite builds as ASTROLABE's `settings.gradle.kts` does (`-Pastrolabe.aiGateBuild`).
>
> **Order of work.** Follow §13.3 from T-01. Do not start Phase B before the Phase A gate (T-06) passes. Keep prototype mode green at all times.
>
> **Rules.**
> 1. Never write to ASTROLABE tables, files under the project state root (except `exports/` through host APIs), or the repository. All mutations go through `AstrolabeJava`, the `console-bridge` wrappers over `Controller`, `JavaAuthority` replies, or host-invoked APIs (`Curator`, `Export`, `telemetry.Export`, `Economics`).
> 2. Never invent state: every number, status or text on screen maps to an event field, a `Views` row, a documented store query, a blob or a Console record. Unknown is shown as unknown.
> 3. Never block the event bus (`EventSink` enqueues only) and never call `Astrolabe.close()` from a callback (D-328).
> 4. Do not code against the fourteen never-emitted event names in GAP-10 except to archive them if they ever appear.
> 5. Secrets are write-only: never in WebSocket frames, logs, exports or GET responses; show `Secret.fingerprint()` only.
> 6. Configuration is immutable per attempt: build a new `Astrolabe` per configuration revision; surface `warning{config-frozen}`.
> 7. Use the vocabulary of Appendix C in code, DTOs and UI copy. No "assistant", "chat", "thinking" labels.
> 8. Replies to the harness carry the contract revision and are validated with `Replies.check` on both sides; weakening amendments require explicit confirmation; the default is Reject.
> 9. Every task ends with its acceptance criteria demonstrated by tests (unit/integration/e2e over cassettes) on Windows and Linux CI; live provider calls are opt-in and never run in CI.
> 10. Record every deviation from this document in `console/DECISIONS.md` with the reason and the section it changes.
>
> **Definition of done for v1.** Storyboards S1–S10 pass on cassettes and, for S1–S3, S8, S9, live with the fake adapter; the Phase D gate (T-23) passes; the owner decisions OD-01…OD-07 are recorded with their outcomes; documentation (T-24) is complete.
>
> **Deliver first.** T-01 and T-02 with a status note listing the exact Spring Boot, Angular and Node versions chosen and any compatibility finding.

---
## Appendix A. Event catalog (`io.astrolabe.event.AgentEvent`)

Source: `core/src/main/kotlin/io/astrolabe/event/AgentEvent.kt`. Every event carries `ids{work, attempt, candidate?, context?}`, `phase`, `span?`, `parent?`. "Emitted" was established by searching `core/src/main` for constructors of each type. UI mapping refers to §3.3 (projections), §5 (screens) and §6.4 (animation).

| Serial name | Payload fields | Default phase | Emitted | UI mapping |
|---|---|---|---|---|
| `campaign.opened` | `requestId` | Understand | yes (Controller.open) | campaign state; header; timeline marker; Overview Controller |
| `campaign.shape_selected` | `shape` (`S0|S1|S2|S3|blocked`), `inputsRef` (inline text) | Plan | yes | shape badge; Overview template switch; timeline marker with the inputs text |
| `campaign.increment_selected` | `incrementId` | Plan | yes | plan rail highlight; Controller → Compiler token |
| `campaign.increment_closed` | `incrementId`, `status` (always `verified`) | Verify | yes | ledger refresh; Controller → Ledger token |
| `campaign.finished` | `outcome` (wire), `finishReceiptRef` (blob digest) | Verify | yes | Finish screen (receipt by ref); campaign state; notification |
| `contract.amended` | `version`, `by` (`user` or authority id) | Understand | yes | contract refresh; timeline user item; You → Contract token |
| `contract.amendment_proposed` | `proposalId`, `weakening` | Understand | yes | contract refresh; attention (via authority) |
| `contract.amendment_resolved` | `proposalId`, `outcome` (`Accepted|Rejected|Pending`) | Understand | yes | contract refresh; attention resolved |
| `cell.started` | `incrementId?`, `role` | Understand | yes | cells projection; Overview Cell/lanes; timeline marker |
| `cell.turn_started` | `turn`, `turnsMax` | Understand | yes | turn strip; header; timeline separator |
| `cell.model_requested` | `invocationId`, `estimatedTokens`, `profileId`, `anchorTokens?` | Understand | yes | Model station active; Routing text (profile) |
| `cell.model_responded` | `invocationId`, `stop` (StopReason), `usage` (BillableUsage?) | Understand | yes | usage refresh; Model → Cell token; timeline model item (after journal tail) |
| `cell.model_progress` | `invocationId`, `stage` (`started|output|retrying`), `textChars?`, `outputTokens?`, `attempt?` | Understand | yes (ObservableAdapter only) | `msg:progress`; Model meter; retry badge |
| `cell.tool_called` | `opId`, `family`, `op` | per family | yes | Cell → Tools token; tool counters |
| `cell.tool_resulted` | `opId`, `resultAlias?` (`#n`/`#-`), `header` | per family | yes | Tools → Cell token; header chips (class/status/stamp); triggers projection refresh by family; timeline tool item |
| `cell.gate_fired` | `gate`, `text` | Verify | yes | gate chip; timeline nudge (journal) |
| `cell.register_patched` | `version`, `ops` | Understand | yes | register refresh; STATE panel highlight |
| `cell.workset_changed` | `known`, `dropped[]` | Locate | yes (every turn) | workset refresh; Compiler text |
| `cell.rebuilt` | `reason` (free text), `generation` | Compact | yes | Compiler animation; generation marker |
| `cell.ended` | `status` (`completed|blocked|partial|failed|cancelled`), `packetRef` (always null), `manifestRef?` | Verify | yes | cells refresh; manifest by ref; Cell → Controller token; timeline marker |
| `edit.applied` | `editId`, `paths[]` | Edit | **no** | — (edits come from `cell.tool_resulted` family `edit` + journal `edit-outcome`) |
| `edit.rejected` | `reason`, `paths[]` | Edit | **no** | — |
| `edit.reverted` | `target`, `outcome` | Edit | **no** | — |
| `edit.transformed` | `diffRef`, `filesChanged` | Edit | **no** | — (transform diffs come from `TransformReceipt.diffRef` in the journal/blobs) |
| `run.started` | `actionId`, `argv[]`, `effectClass` | Verify | **no** | — (runs come from `cell.tool_resulted` family `run` and `handles`) |
| `run.output` | `handle`, `cursor` | Verify | **no** | — (Console tails log files) |
| `run.finished` | `actionId`, `status`, `exitCode?` | Verify | **no** | — |
| `run.reconciled` | `actionId`, `outcome` (`unknown_outcome|auto_reconciled`) | Recover | yes (at reopen) | reconciliation list; Processes intents; Controller chip |
| `check.scheduled` | `checkId`, `trigger` | Verify | **no** | — (checks come from `Views.checks` and journal `check`) |
| `check.started` | `checkId` | Verify | yes (end-of-turn checker) | Verifier meter |
| `check.finished` | `checkId`, `receiptRef`, `outcome` (lowercase, no underscores) | Verify | yes (end-of-turn checker) | checks refresh; Verifier → Ledger token when acceptance passed |
| `check.stale` | `checkId`, `reason` | Verify | **no** | — (applicability from receipts/`LastResult.staleReason`) |
| `ask.question` | `questionId` | Understand | yes | attention (the request object comes via the authority bridge); You station amber |
| `ask.answered` | `questionId`, `changesRequirements` | Understand | yes | attention resolved; timeline |
| `blocked` | `reason`, `questionId?` | Understand | yes (StateTool, TaskTool) | campaign state `waiting_for_input`/`blocked_external` context; Cell error ring |
| `warning` | `kind` (`config-frozen`, `calibration`, …), `text` | Understand | yes | warning chip; timeline; settings banner for `config-frozen` |
| `budget.reserved` | `reservationId`, `tokens`, `purpose` | per call | yes (CellBudget) | Budget meter |
| `budget.reconciled` | `reservationId`, `actualTokens?` | per call | **no** | — (usage rows carry actuals) |
| `budget.exhausted` | `scope` | Recover | yes (CellBudget) | Budget amber; campaign state hint |
| `routing.decided` | `function`, `tier`, `profileId`, `reason` | Plan | **no** | — (profile from `cell.model_requested`; `routing_log`; journal escalation rows) |
| `delegation.dispatched` | `handle`, `kind` (`writer|probe|review`), `delegatedCost?` | Delegate | yes (Delegator) | delegations refresh; Delegates lane; Cell → Delegates token |
| `delegation.collected` | `handle`, `status` (`published|failed`) | Delegate | yes | Delegates → Cell token; status chip |
| `delegation.rejected` | `handle`, `reason` | Integrate | yes | Delegates red flash; reason in Delegations |
| `recovery.classified` | `failureClass`, `fingerprint?` | Recover | **no** | — (journal `recovery-failure` payload) |
| `recovery.repaired` | `capsuleId`, `outcome` | Recover | **no** | — (journal `recovery-repair-completed`) |
| `recovery.escalated` | `to`, `reason` | Recover | **no** | — (journal `substantive-attempt`, pinned escalation lines) |
| `kb.proposed` | `noteId`, `kind` | Retrieve | yes (kb tool, extractor) | knowledge queue refresh; Cell → KB token |
| `kb.admitted` | `noteId` | Retrieve | yes (Curator, host-invoked) | notes refresh |
| `kb.invalidated` | `noteId`, `reason` | Retrieve | yes (Curator recheck/prune) | notes refresh |
| `span.started` | — (phase, span, parent) | any | yes (Plan for the campaign, Edit per cell) | trace projection |
| `span.ended` | `status`, `cost` (`"<currency> <amount>"` or null), `durationNanos?` | any | yes | trace projection; header money |

`EventRecord{seq, at, event}` wraps every event; `seq` is per bus, monotonic; the Console keys its archive by `(work, seq)`.

**Journal kinds used as timeline sources** (`JournalKind` serial names): `call`, `result`, `edit-intent`, `edit-outcome`, `check`, `nudge`, `boundary`, `intent`, `reconcile`. Boundary `payload.type` values seen: `publication-request`, `publication-outcome`, `recovery-failure`, `recovery-repair`, `recovery-repair-completed`, `alternative-attempt`, `substantive-attempt`, checkpoint/packet boundaries, KB injection lines, extraction summaries.

---
## Appendix B. Settings inventory

Scope: **H** harness-wide, **P** per project override, **S** campaign start option, **A** per attempt (frozen). "Live" marks the few fields the facade reads at call time; everything else is frozen into `AttemptConfig` at the first open of an attempt (F-36). "Unused" marks fields with no reader in `core/src/main` (kept editable but labelled). Sources: `Config.kt`, `Defaults.kt`, `Mode.kt`, `auth/*`, `provider-api/…/Capabilities.kt`, `provider-ai-gate/…/ProfileBinding.kt`, `campaign/Publications.kt`, `Controller.kt`.

### B.1 `Config` (top level)

| Field | Type | Default | Validation | Scope | Notes |
|---|---|---|---|---|---|
| `defaults` | `Defaults` | `Defaults()` | `defaults.violations()` | H/P | B.2 |
| `profiles` | `Map<String, Profile>` | `{}` | key = `profile.id` | H/P | B.4; main profile also read live |
| `profileRoles` | `ProfileRoles(main, helper, escalation?)` | `main="main"`, `helper="helper"`, `escalation=null` | when profiles exist, `main` and non-null `helper`/`escalation` must be profile ids (so define a `helper` profile or set `helper` to null) | H/P | helper/escalation are validation-only today |
| `mode` | `Interactive|Autonomous` | `Interactive` | — | H/P/S | copied into the contract |
| `executionMode` | `TrustedLocal|Confined` | `TrustedLocal` | — | H/P/S | `Confined` needs a backend (refused otherwise, D-11) |
| `dClass` | `Ask|Deny` | `Ask` | — | H/P/S | |
| `integrityApproval` | `Autonomous|Human` | `Autonomous` | — | H/P/S | |
| `unknownOutcomeReconciliation` | `Host|Automatic` | `Host` | — | H/P/S | |
| `ceiling` | `Stage` | `Patch` | — | H/P/S | ladder ceiling |
| `rulesFile` | `RulesBinding(path, digest, provenance)?` | null | non-blank path and provenance | P | bind through the rules-trust flow; re-checked on disk at open |
| `redaction` | `RedactionConfig(patterns[kind, regex], envAllowlist, maxBytes)` | defaults from `auth/Redaction.kt` (`private-key-block`, `aws-access-key-id`, `github-token`, `openai-key`, `slack-token`, `jwt`, `bearer-token`, `url-credentials`, `secret-assignment`; env allowlist of 19 names; `maxBytes = 262144`) | `maxBytes > 0`, regexes compile, unique kinds, no `:`/`=`/`]` in kinds | H/P | |
| `stateRoot` | `String?` | null (OS user-state dir) | — | H | live at `open(repo)` |
| `flags` | `Flags` | all false; `kbInjection = Off` | — | H/P | B.3 |
| `roles` | `Map<String, Role>` | `{}` | key = name; name ∈ defaults; no widened mask, re-granted denied kinds, raised permission, changed packet kind; `RoleTexts.violations` | H/P | B.5 |
| `qualityGates` | `List<Command(argv, cwd?)>` | `[]` | argv non-empty, program non-blank | H/P | each becomes `CHK-quality-gate*` |
| `tierTable` | `TierTable(version, calibrationDate?, profiles: Map<Tier, Set<id>>)` | `UNTIERED` | version non-blank; every id configured; `Deterministic` not a key | H/P | untiered → main profile serves every tier |

### B.2 `Defaults`

| Field | Default | Validation | Group | Notes |
|---|---|---|---|---|
| `shapePolicy.smallMaxFiles` / `smallMaxRequirements` | 3 / 1 | ≥ 1 | Shape | |
| `shapePolicy.largeMinFiles` / `largeMinRequirements` | 11 / 4 | > small bounds | Shape | |
| `shapePolicy.s3Enabled` | false | — | Shape | with `flags.s3Writers` |
| `shapePolicy.slackFactor` | 1.5 | ≥ 1 | Shape | D-39 |
| `turnsPerCell` | 40 | > 0 | Cells | soft cell turn limit |
| `turnNudgeFraction` | 0.80 | (0,1) | Cells | turn-budget nudge |
| `campaignCells` | 12 | > 0 | Cells | also sizes the default token budget |
| `attemptsPerIncrement` | 2 | > 0 | Cells | escalation allowance |
| `parallelCells` | 3 | > 0 | Delegation | S3 |
| `writerDepth` / `probeDepth` | 1 / 2 | > 0 | Delegation | |
| `providerTerminalWaitSeconds` | 60 | > 0 | Timeouts | also `Astrolabe.close` wait |
| `alpha` | 0.65 | (0,1) | Context | pressure threshold |
| `k` / `m` | 8 / 6 | > 0 / ≥ 0 | Context | eviction batch / turns kept on rebuild |
| `rMaxTokens` | 16000 | > 0 | Context | reads per turn |
| `anchorMaxTokens` | 2500 | > 0 | Context | `[A]` cap |
| `immediateStubTokens` | 800 | > 0 | Context | |
| `lookBudgetTokens` / `runBudgetTokens` | 1500 / 1200 | > 0 | Context | |
| `registerCapTokens` / `digestCapTokens` / `patchCapTokens` | 1200 / 150 / 400 | > 0 | Context | |
| `digestTokensPerRequirement` / `digestCapCeilingTokens` | 8 / 2000 | ≥ 0 / > 0 | Context | D-270 |
| `factLineMaxChars` / `noteBodyMaxTokens` / `noteSummaryMaxChars` | 240 / 120 / 200 | > 0 | Knowledge | |
| `seedsMaxTokens` | 4000 | — | Context | |
| `injectionMaxNotes` / `injectionMaxTokens` | 8 / 1500 | — | Knowledge | unused (constants used) |
| `focusNotesMaxTokens` / `focusZoomMaxTokens` | 300 / 300 | — | Knowledge | |
| `touchedInAnchor` | 10 | > 0 | Context | |
| `checkerTimeBoxSeconds` / `checkerFallbackTimeBoxSeconds` | 20 / 120 | > 0 | Verification | D-322 |
| `theta` | 40 | ≥ 0 | Verification | risk threshold |
| `fullSuiteCadence` | 5 | > 0 | Verification | |
| `reserveVerification` / `reserveRecoveryAndPersist` | 0.15 / 0.05 | each (0,1), sum < 1 | Verification | |
| `campaignRecoveryReserve` | 0.10 | (0,1) | Verification | unused |
| `flakyIsolatedReruns` | 1 | ≥ 0 | Verification | unused |
| `stallTurns` / `loopIdentical` / `repeatedSignatureRepairs` / `doomLoopSameCalls` | 3 / 2 / 2 / 3 | > 0 | Recovery | |
| `repairCalls` | 2 | > 0 | Recovery | |
| `probeTurns` / `probeTokens` | 15 / 40000 | > 0 | Delegation | tokens used by S3 estimates; turns unused (constant) |
| `probeTier` | Medium | — | Delegation | unused |
| `reviewLookMax` | 10 | > 0 | Delegation | unused |
| `reviewIncrementTokens` / `reviewCampaignTokens` | 30000 / 60000 | > 0 | Delegation | increment tokens used by S3 estimates |
| `reviewTier` / `reviewRoutineTier` | High / Medium | — | Delegation | unused |
| `admissionConfidenceMax` | 0.6 | [0,1) | Knowledge | unused (constant) |
| `runTimeoutSeconds` | 120 | > 0 | Timeouts | process deadline |
| `gitDeadlineSeconds` | 600 | (0, 3600] | Timeouts | live at `open` (D-303) |
| `profileRoles`, `mode`, `executionMode`, `dClass`, `integrityApproval`, `unknownOutcomeReconciliation`, `ceiling` | as B.1 | — | — | defaults for the same-named `Config` fields |

### B.3 `Flags` and layers

| Flag | Default | Consumer | Wired | Console label |
|---|---|---|---|---|
| `precompile` | false | Controller | yes | Pre-compilation (UNMEASURED) |
| `calibrationPrior` | false | `Calibration.planBlock` | yes | Calibration prior in plan block |
| `treeSitterIndex` | false | gates `OptionalLayers.outlines` | yes (needs `index-treesitter`) | Tier-1 outline index |
| `languageService` | false | `atlas/LanguageService.kt` | no (GAP-08) | declared, not active |
| `denseRetrieval` | false | gates `OptionalLayers.dense` | yes (no retriever in v1) | Dense retrieval |
| `generatedTools` | false | gates `OptionalLayers.tools` | yes (no registry in v1) | Generated tools |
| `skillsPromotion` | false | eval only | no | declared, eval only |
| `asyncChecker` | false | `verify/Watcher.kt` | no (GAP-08) | declared, not active |
| `qaCell` | false | `QaCell`, `QaDriver` (host-invoked) | host | QA cell (Console must drive it) |
| `l4Gates` | false | eval only | no | declared, eval only |
| `s3Writers` | false | S3 runtime | yes (with `s3Enabled`) | Parallel writers (S3) |
| `otelExport` | false | `telemetry/Export.kt` | host | OTel span export |
| `worthTestEstimate` | false | eval only | no (main line always estimates) | declared |
| `kbInjection` | `Off` | injection | yes | `Off | Frozen | Live` |

`OptionalLayers(outlines, dense, tools, mounts)` are host plug-ins supplied by the Console at `Astrolabe` construction: outlines (`TreeSitterIndex` when present), dense (none in v1), tools (none in v1), mounts (`Catalog` of `Mount`s from the Console's MCP settings; inactive until GAP-09).

### B.4 `Profile` and the `gate` block

| Field | Type / values | Validation |
|---|---|---|
| `id` | `[A-Za-z0-9._-]{1,128}` | |
| `provider`, `model` | SDK provider id, model id | non-blank; must exist in the SDK runtime (binding) |
| `capabilities.toolSchemaValidation`, `parallelToolCalls`, `streaming`, `nativeCompaction`, `continuation`, `cancellation`, `hostedExecution` | booleans | `nativeCompaction`, `continuation`, `hostedExecution` must be false for the AI Gate adapter |
| `capabilities.outputLimitTokens`, `contextLimitTokens` | ints | `0 < output ≤ context`; ≤ catalog limits per `catalogCheck` |
| `capabilities.caching` | `CacheCapability(breakpoints, maxBreakpoints?, minimumTokens?, writeClasses)` | breakpoints only with explicit-marker APIs; `maxBreakpoints` ≤ API markers |
| `capabilities.usageFields` | set of `uncached_input, cache_read, cache_write_5m, cache_write_1h, output, …` | each must be reported by the API |
| `capabilities.schemaDialects` | `json-schema-2020-12`, `openai-strict`, `anthropic-input-schema` | |
| `priceTable` | `PriceTable(date, currency ISO-4217, perMillion by dimension)` | prices ≥ 0 |
| `latency` | `Fast|Standard|Slow` | |
| `stratumOutcomes` | `[StratumOutcome(stratum, trials, accepted)]` | `accepted ≤ trials` |
| `config.gate.v` | `1` | |
| `config.gate.api` | wire API id (`anthropic-messages`, `openai-responses`, `openai-completions`, `google-generate-content`) | must equal `llm.features(model).api()` |
| `config.gate.options` | ChatOptions JSON (`ai-gate.options/3`) | `responseCache` bypass only; no `continueFrom`; `maxTokens` contradicts `outputCap = unsupported` |
| `config.gate.reasoningHandoff` | `reject|drop` | |
| `config.gate.outputCap` | `enforced|unsupported` | `unsupported` required when the API cannot cap |
| `config.gate.catalogCheck` | `fail|warn|off` | |
| `config.gate.prefixRetention` | `short|long` | |
| `config.gate.tokenCount` | `local|endpoint` | `endpoint` calls the provider |
| `config.gate.effort` | `map|off` | |

### B.5 Roles

Names: `implementing`, `plan`, `probe`, `review`, `qa`, `writer`, `repair`, `extractor`. Editable: `personaLines` (≤ 3, wording only; forbidden wording that marks complete, grants authority or sets a control aside is rejected). Read-only in the UI (shown for transparency): `contextView`, `noteScope`, `skillFilter`, `toolMask`, `permission`, `tierPrior`, `duties`, `askBack`, `packetKind`, `policyTextVersion`, `deniedNoteKinds`. Text versions (`RoleTexts.version`) are frozen per attempt.

### B.6 Campaign start options

| Option | Maps to | Default |
|---|---|---|
| request text | `CampaignRequest.text` (→ `U-1`) | — |
| tokens, cost cap, resume expected | `CampaignPolicy(tokens, cost?, resumeExpected)` | `contextLimitTokens(main) × campaignCells`, none, false |
| mode, dClass, ceiling, integrity approval, reconciliation, execution mode | `Config` fields for the new revision | from H/P |
| publication: through, remote, merge target, deploy target (name, production), known remotes, message | `PublicationRequest` | none (patch only) |
| configuration revision | the assembled `Config` | current |

### B.7 Not configurable through `Config` (read-only in the UI; OD-03)

`Authorization.dClassAllowlist` and `capabilitySet` (`workspace-local-test-only`), `EffectPolicyConfig` lists (`privilegeCommands`, `networkCommands`, `packageInstallCommands`, `gitRefMutations`, `destructiveFileCommands`, `writingCommands`, `scriptInterpreters`, `tmpPrefixes`, `packageInstallIsDClass`, `caseInsensitivePaths`), `FunctionTable.DEFAULT`, `RoutingPolicy` (`qualityFloor`, `pins`, `remainingAttempts`, `limits`), `CacheSchedule.maxDelay = 2`, `Boundary` delimiters, `InstructionShape` weights, `ProbeBudget.DEFAULT`, `ReviewBudget`, `LadderLimits(retries = 2, repairs = 1, backoffBaseMillis = 1000)`, `GuardLimits`.

### B.8 AI Gate runtime settings (Console-owned `providers.json` + `Llm.Builder`)

Providers: preset, `name`, `baseUrl`, `headers`, `models`, `defaults` (ChatOptions), `compat` flags, `x-*` extensions; per provider auth method (API key: `apiKey` secret; OAuth: none stored by the Console). Runtime: `environment` (system or none), `catalog` (`refreshInterval` 24 h, `offline`, `feeds`, `noLiveListings`, `snapshotFile`), `http` (`httpVersion`, `proxy`, `trustStore`, `clientCertificate`, `insecureSkipTlsVerification`, `userAgentSuffix`, `wireLog OFF|HEADERS|BODIES`), `defaults` (ChatOptions), retry (`maxAttempts 3`, `retryOnStatus {408, 409, 429, 503, 529}`, backoff 500 ms ×2 ≤ 8 s, `maxRetryAfter 60 s`), timeouts (connect 10 s, stream idle 5 min, total 10 min; `forLocalModels` 5 s / 10 min / 30 min). Credentials live in `credentials.json` (SDK `CredentialStore.file`).

### B.9 Console preferences

Theme, density, font size, reduced motion, notifications, keyboard map, Console DB path, event archive retention, export directory, log level, replay speed (prototype mode).

---
## Appendix C. Glossary (UI vocabulary)

Terms are ASTROLABE's (`docs/reference/glossary.md` and companions); the Console uses them verbatim in labels.

| Term | Meaning | Source |
|---|---|---|
| Campaign | one harness-owned execution of a task: contract → graph → increments → cells → receipts | §3.1 |
| Work (`W-…`) | the logical objective; survives retries, resumes and model changes | §3.3 |
| Attempt (`a1`, `a2`) | one execution under a frozen harness/profile policy | §3.3, §13.3 |
| Candidate / stamp (`@h8`) | whole-workspace identity: base commit + tracked delta hash + untracked manifest hash + env id | §3.3, §4.3 |
| Context (`cell-…`) | one cell's model-visible lineage; rebuilds advance the generation | §3.3 |
| Generation | rebuild count of a context | §5.8 |
| Contract (`vN`) | requests, requirements, acceptance, constraints, exclusions, scope, budget, authorization, risk; versioned | §4.1 |
| Request (`U-n`) | a verbatim user message appended to the contract | §4.1 |
| Requirement (`R#`) | a harness-tracked obligation with status `pending/in_progress/verified/blocked` | §4.1 |
| Acceptance item (`AC-#`) | `run` (command), `check` (evidence) or `review` (verdict) obligation with an origin | §4.1 |
| Constraint / exclusion (`C#`) | always compiled into `[K]` | §4.1 |
| Amendment (`AM-…`) | a proposed contract change; weakening never auto-accepted | §4.1 |
| Increment (`inc-…`) | a bounded unit with executable acceptance; statuses pending/in_progress/verified/blocked/cancelled | §4.2 |
| Cell | one bounded model loop for one increment, configured by a role | §3.1 |
| Turn (`T/M`) | one model call plus its dispatched ops and checks | §5.4 |
| Role | `implementing, plan, probe, review, qa, writer, repair, extractor`: view × mask × permission × tier prior × duties × packet | §3.4 |
| Shape (S0–S3) | S0 one cell · S1 plan + increments + KB · S2 + probe/review/routing/recovery · S3 + parallel writers | §3.5 |
| STATE / register | the model-owned, harness-validated plan cursor, facts, dead ends, decisions, open, focus, amendments, next | §5.2 |
| Workset (KNOWN / NOT SEEN) | the harness registry of `(path, range, version)` actually shown | §5.3 |
| `[S][R][K][T][A]` | system · repo prime + knowledge · compiled increment context · transcript · volatile anchor | §5.1 |
| Gauge | the one-line status the harness appends to results (`⟨ctx … · turn T/M⟩`) | §5.7 |
| Gate / nudge | harness rules that fire once per condition (entry, exit, pressure, stall, loop, …) | §5.6 |
| Packet | typed output of a cell: Result, Investigation, Verdict, QA receipts, note candidates | §5.9, §10 |
| Receipt | immutable record binding a check to a candidate, environment, counts, raw log | §4.3, §8.4 |
| Check | a scheduled verification with kind, selector, trigger, cost class, applicability | §8.1 |
| Applicability | `current / stale / unknown` of a receipt for the current candidate | §8.4 |
| Baseline | the suite at snapshot 0; sole basis for "pre-existing" | §8.5 |
| Test-integrity flag | a change to the acceptance surface (deleted test, weakened assertion, skip, snapshot, config) needing review | §8.6 |
| Effect class (R/W/D) | read-only / workspace write / outside-workspace, network, git refs, packages, privilege | §4.6 |
| Execution mode | `trusted-local` (no confinement; never a sandbox) or `confined` | §14.1 |
| Permission ladder / stage | `patch → local-commit → push → merge → deploy`, separate grants under a ceiling | §14.2 |
| Human anchor | a publication condition that always needs a human: interface contract, data migration, production deploy, new network access, ceiling elevation | §14.2 |
| Intent | a journal record before a consequential action; statuses recorded/dispatched/running/observed/committed/unknown | §4.3 |
| Unknown outcome | an action whose effect could not be observed; reconciled before anything that could duplicate it | §13.1 |
| Fence / lease | workspace ownership by generation; expiry revokes publication authority | §13.1 |
| Failure class | one of thirteen recovery classes (transport, stale anchor, build environment, behavioural test failure, …) | §13.2 |
| Ladder | reconcile → retry → repair → return | §13.2 |
| Capsule / repair helper | the failure capsule handed to a low-tier helper for ≤ 2 attempts | §13.2 |
| Alternative attempt | a fresh attempt of an increment after two same-hypothesis failures | §13.3 |
| Routing function / tier | `Plan, Implementing, Continuation, Probe, ReviewCritical, ReviewRoutine, Qa, Curation, RepairHelper, Deterministic` × `Low, Medium, High, ExtraHigh` | §11.1 |
| Refusal (routing) | narrow the unit, checkpoint or ask for a changed constraint rather than lower the quality floor | §11.2 |
| Profile | `(provider, model, capabilities, price table, gate config, latency)`; never a vendor label in routing | §11.1 |
| Delegation / child | probe, review or writer cell dispatched with a task packet; returns a packet, never a conversation | §10 |
| Integrator | the single merge authority in S3 (validate, freshness, apply, combined check, gates, publish) | §10.4 |
| Worktree | edit isolation for a writer (`candidates/worktrees/…`); not a security boundary | §10.4 |
| KB note kinds | `ADR CON LES PIT BMAP NEG SKILL STATUS CAL`; statuses `candidate admitted stale superseded deprecated rejected` | §4.5 |
| Curator | the sole KB publisher; adds, supersedes, deprecates; never rewrites a body | §12 |
| Skill / behaviour map | a procedure note (never grants authority) / behaviour → code locators | §12.2, §7.5 |
| Finish receipt | the campaign-level report: requirements, acceptance, changes split, checks, not verified, budget, highest authorized stage | §5.9 |
| Harness branch | `refs/heads/astrolabe/<work>/<attempt>` (publication); shadow ref `refs/astrolabe/<work>/<attempt>/<ws>/head` (checkpoints) | code, §4.6 |
| Exports | derived files under `exports/<work>/` (contract, ledger, checks, budget, receipts, finish receipt, usage, accounting, economics, OTel) | §4, F-53 |
| UNMEASURED | the status of every live gate: fixtures validate runtime contracts, not live quality | evaluation method |

---
## Appendix D. DTO definitions

Notation: `field: type` (`?` optional, `[]` list). Money is `{currency: string, amount: string} | null` (null = unknown). Timestamps are ISO-8601 UTC strings. Where a DTO mirrors an ASTROLABE `@Serializable` type, the backend converts the kotlinx JSON verbatim and the field names are the Kotlin property names (marked *mirror*).

```
CampaignSummaryDto {
  work, attempt, projectId: string
  phase: "Opened"|"Running"|"Finishing"|"Ended"
  outcome?: "completed"|"waiting_for_process"|"waiting_for_input"|"blocked_external"|"budget_exhausted"|"cancelled"|"failed"
  reason?: string
  shape?: "S0"|"S1"|"S2"|"S3"|"blocked"
  contractVersion: number
  configRevision: string
  startedAt, finishedAt?: string
  currentIncrement?: string
  currentCell?: { context, role, status, turn, turnsMax }
  budget: { tokensSpent: number, tokensLimit: number, money: Money, unknownCount: number, reserveOk?: boolean }
  pendingInteractions: number
  resumable: boolean
}

TimelineItemDto {
  seq: number                       // journal seq (Console items: the seq they were raised at, with a sub-index)
  sub?: number
  at: string
  kind: "request"|"amendment"|"model"|"tool"|"edit"|"check"|"nudge"|"boundary"|"intent"|"reconcile"|"attention"|"marker"
  context?, role?: string
  turn?: number
  phase?: string
  alias?: string                     // "#42"
  title: string                      // one line, e.g. the envelope header
  subtitle?: string
  status?: string                    // tool/edit/check status verbatim
  effectClass?: "R"|"W"|"D"
  stamp?: string                     // @h8 or full candidate id
  refs: { type: "blob"|"receipt"|"manifest"|"alias"|"packet"|"interaction"|"checkpoint", id: string }[]
  payloadType?: string               // boundary payload.type
  expandable: boolean
}

InteractionDto {
  id, work: string
  kind: "question"|"approval"|"proposal"|"review"|"publication"
  context?: string
  contractRevision: number
  raisedSeq: number
  state: "pending"|"answered"|"superseded"|"expired"
  request: Question | DClassRequest | AmendmentProposal | ReviewRequest   // mirror (F-06)
  reply?: Answer | Decision | Resolution | Verdict                        // mirror
  byAuthority?: string
  reason?: string
  answeredAt?: string
}

ContractDto  = mirror of ContractView rows decoded: { version, contract: Contract (mirror), requests[], requirements[], acceptance[], constraints[], amendments[] }
LedgerDto    = { increments: Increment[] (mirror), entries: LedgerEntry[] (mirror), sizing: Sizing[] (mirror) }
CellDto      { context, role, status: "running"|"completed"|"blocked"|"partial"|"failed"|"cancelled", increment?, turns: number,
               registerVersion?: number, stamp?: string, touched: TouchedDto[], openIntents: number, rebuilds: number,
               manifestRef?: string, startedSeq, endedSeq?: number, reason?: string }
TouchedDto   { path, kind: "A"|"M"|"D", added, removed: number, from?, to?: string, note?: string, alias?: string }
RegisterDto  = mirror of Register { version, cell, increment, incrementTitle, constraints[], plan[{mark, text}], facts[{kind, text, freshness}],
               deadEnds[], decisions[], open[], focus?, amendments[], next? } + { historyCount: number }
WorksetDto   { exports: [{ id, turn, entries: [{ path, range, version, source, turn, resultId, tokens, hidden }], stale: [{ path, range, version, cause }] }] }
ManifestDto  = mirror of Manifest
CheckDto     { id, kind, selector, trigger, costClass, lastOutcome?, applicability: "Current"|"Stale"|"Unknown", staleReason?, lastStamp?, acceptanceIds[] , lastReceiptId? }
ReceiptDto   = mirror of Receipt (F-32) + { rawBlob: string, alias?: string }
IntegrityFlagDto = mirror of TestIntegrityFlag + { blocksCompletion: boolean }
ReviewRecordDto  = mirror of ReviewRecord (F-48)
ChangeDto    { path, kind: "A"|"M"|"D", origin: "Edit"|"Run"|"External", before?, after?: string, editId?: string,
               context, increment?: string, turn?: number, added?, removed?: number, diffAvailable: boolean, diffKind?: "images"|"transform"|"campaign" }
DiffDto      { path, before?, after?: string, hunks: [{ oldStart, oldLines, newStart, newLines, lines: [{ t: " "|"+"|"-", s: string }] }], truncated: boolean }
HandleDto    { handleId, alias?, argv[], shell?: string, cwd?: string, effectClass, effectsUnknown: boolean,
               status: "running"|"exited"|"deadline_exceeded"|"cancelled"|"lost", startedAt, cursor: number, logBytes?: number, stampBefore?: string, actionId }
IntentDto    = mirror of evidence Intent (§2.6, F-16): { intentId, actionId, argv[], cwd?, expectedEffect, idempotencyKey, status, replaySafe, workspaceConfined, at, reconciliation? }
DelegationDto { handle, kind: "probe"|"review"|"writer", mode: "sync"|"async", child, dispatchedAt, leaseExpiry?, delegatedCost?: DelegatedCost (mirror),
                status?: "published"|"failed", rejectedReason?: string, packetSummary?: string, childCell?: CellDto }
IntegrationDto = mirror of IntegrationRecord
RecoveryItemDto { seq, at, type: "recovery-failure"|"recovery-repair"|"recovery-repair-completed"|"alternative-attempt"|"substantive-attempt",
                  increment?, cell?, failureClass?, recovery?: "reconcile"|"retry"|"repair"|"return", outcome?, attempts?, tier?, profile?, change?, hypothesis?, text }
CallDto      = mirror of CallAccount (F-54): { invocationId, ids, profileId, usage: BillableUsage, money: Money, priceTableDate, quantities, warm, at, fundedTokens, fundedMoney }
TotalsDto    { calls, callsWithoutUsage: number, money, coldMoney, warmMoney: Money, quantities: { [dimension]: number }, costPerAcceptedTask?: Money }
SpanDto      { id, parent?, phase, status: "Open"|"Completed"|"Cancelled", ids, startNanos, endNanos?, exclusiveCost: Money, inclusiveCost: Money, durationNanos?: number, children: SpanDto[] }
RoutingDto   { cells: [{ context, role, profileId, tier?: string }], tierTable: TierTable (mirror), functionTable: FunctionTableRow[] (read-only), log: [{ function, tier, outcome, at }], escalations: RecoveryItemDto[] }
NoteDto      = mirror of Note (F-52) + { revisions?: number, queueEntry?: QueueEntryDto }
QueueEntryDto = mirror of QueueEntry
SkillDto, BehaviourMapDto = mirrors
KbHealthDto  = mirror of KbHealth
FinishReceiptDto = mirror of FinishReceipt (F-19)
PublicationDto { request: PublicationRequest (mirror), results: [{ stage, result: "published"|"refused"|"failed", commit?, target?, requestId?, refusal?, detail? }], reached: string, branch: string }
ProviderDto  { id, preset, name, baseUrl, defaultApi, apis[], authMethods: ("API_KEY"|"OAUTH")[], authStatus: AuthStatusDto, fields: FieldDescriptorDto[], apiKeyUrl?: string, modelSource: boolean }
AuthStatusDto { state: "NOT_CONFIGURED"|"CONFIGURED"|"EXPIRING"|"EXPIRED"|"REFRESH_FAILED", type?: "API_KEY"|"OAUTH", source?: string, expiresAt?: string, account?: string, fingerprint?: string }
FieldDescriptorDto { key, label, kind: "TEXT"|"SECRET"|"URL"|"INTEGER"|"DECIMAL"|"BOOLEAN"|"CHOICE"|"DURATION"|"JSON", required: boolean, defaultValue?: string, help?: string, group?: string, choices?: string[], min?, max?: number, unit?: string }
ModelDto     { providerId, id, name, api, input[], output[], contextWindow?, maxOutputTokens?: number, reasoningLevels[], capabilities: { [capability]: "SUPPORTED"|"UNSUPPORTED"|"UNKNOWN" },
               prices?: { currency, inputPerMillion?, outputPerMillion?, cacheReadPerMillion?, cacheWritePerMillion?, cacheWriteLongPerMillion? }, source: "BUNDLED"|"CATALOG"|"FEED"|"LIVE"|"CUSTOM"|"UNLISTED", updatedAt?, deprecatedAt?: string, parameters: FieldDescriptorDto[] }
ConnectionReportDto { ok: boolean, steps: [{ kind, status, latencyMillis?, message?, error?: { code, message } }], firstFailure?: string }
ProfileDto   { profile: Profile (mirror, F-39), violations: string[], warnings: string[], qualification?: { at, qualified: boolean, problems: string[], notes: string[], report: ConnectionReportDto } }
SettingsFieldDto { path, type, default, value, origin: "harness"|"project"|"start"|"frozen", range?: string, citation: string, unused?: boolean, readOnly?: boolean, validation?: string }
EffectiveConfigDto { revision, config: Config (mirror JSON), violations: [{ field, message }], adapterViolations: string[], adapterWarnings: string[] }
FixtureReportDto = mirror of report.json (F-55)
HostDto      { consoleVersion, astrolabeVersion, schemaVersion, aiGateVersion?, jdk, mode: "live"|"prototype", stateRoot, consoleRoot, counters: { eventsArchived, eventsDropped, gaps, sinkFailures, wsClients } }
ProjectDto   { id, path, repoIdentity, openedAt, lastSeen, baseCommit?, dirty?: boolean, lockHolder?: { pid, startedAt, harnessVersion }, campaigns: CampaignSummaryDto[], rules: { candidates: [{ path, status }], binding?: RulesBinding }, worktrees: string[] }
```

Timeline paging: `GET …/journal?after=<seq>&limit=<n>` returns `{ items: TimelineItemDto[], lastSeq }`; the WebSocket `timeline.append` uses the same item shape.

---
## Appendix E. Message and command catalog (index and examples)

### E.1 Index

| Direction | Type | Section |
|---|---|---|
| S→C | `hello`, `snapshot`, `event`, `gap`, `timeline.append`, `projection`, `campaign.state`, `progress`, `attention.pending`, `attention.resolved`, `process.output`, `command.result`, `connection.status`, `auth.notice`, `auth.prompt`, `settings.changed`, `warning`, `heartbeat` | §10.3 |
| C→S | `subscribe`, `unsubscribe`, `heartbeat`, `command` with names `project.open`, `project.close`, `campaign.start`, `campaign.cancel`, `campaign.amend`, `campaign.reopen`, `campaign.publish`, `campaign.export`, `attention.answer`, `attention.decide`, `attention.resolve`, `attention.review`, `attention.dismiss`, `intent.reconcile`, `process.terminate`, `kb.admit`, `kb.reject`, `kb.rollback`, `kb.recheck`, `kb.prune`, `kb.promote`, `kb.regenerate`, `auth.answer`, `auth.cancel`, `settings.apply` | §10.4 |

### E.2 Examples

`event` (an archived core event, payload verbatim from kotlinx serialization):
```json
{"t":"event","id":"7c…","at":"2026-09-29T14:02:11.318Z","work":"W-9f3k…","seq":482,
 "event":{"type":"cell.tool_resulted","ids":{"work":"W-9f3k…","attempt":"a1","candidate":"…","context":"cell-7a1…"},
          "opId":3,"resultAlias":"#39","header":"⟦result #39 tool=edit class=W v={src/auth/cache.ts: e71a} stamp=e71a truncated=no effects=observed status=ok⟧",
          "phase":"Edit","span":"span-…","parent":"span-…"}}
```

`timeline.append`:
```json
{"t":"timeline.append","id":"…","at":"…","work":"W-9f3k…","lastTimelineSeq":1033,
 "items":[{"seq":1033,"at":"…","kind":"edit","context":"cell-7a1…","role":"implementing","turn":6,"phase":"Edit","alias":"#39",
           "title":"edit #39 ok · src/auth/cache.ts @9c2f→@e71a +14 −3","status":"ok","effectClass":"W","stamp":"e71a",
           "refs":[{"type":"packet","id":"preimage:main:edit-…"},{"type":"alias","id":"#39"}],"expandable":true}]}
```

`attention.pending` (approval):
```json
{"t":"attention.pending","id":"…","at":"…",
 "interaction":{"id":"dreq-…","work":"W-9f3k…","kind":"approval","context":"cell-7a1…","contractRevision":3,"raisedSeq":1040,"state":"pending",
   "request":{"id":"dreq-…","contractRevision":3,"ids":{…},"action":"run","argv":["npm","install","left-pad"],"cwd":"/repo-a",
              "expectedEffect":"package-install","reason":"the test runner needs left-pad; see #41","contractAllowlisted":false}}}
```

`command` (decide) and its result:
```json
{"t":"command","commandId":"0f1e…","name":"attention.decide","target":{"work":"W-9f3k…"},"expected":{"contractRevision":3},"confirm":true,
 "payload":{"id":"dreq-…","contractRevision":3,"approved":false,"reason":"install it in CI, not here"}}
{"t":"command.result","id":"…","at":"…","commandId":"0f1e…","state":"succeeded","result":{"interactionId":"dreq-…","state":"answered"}}
```

`gap` and `snapshot` with resync:
```json
{"t":"gap","id":"…","at":"…","work":"W-9f3k…","fromSeq":612,"toSeq":640,"reason":"dropped"}
{"t":"snapshot","id":"…","at":"…","stream":"work:W-9f3k…","resync":true,"campaign":{…},"projections":{"contract":{"revision":"a1…","data":{…}},"ledger":{…},"cells":{…},"checks":{…},"budget":{…}},
 "interactions":[…],"lastSeq":640,"lastTimelineSeq":1102}
```

`auth.notice` and `auth.prompt`:
```json
{"t":"auth.notice","id":"…","at":"…","flowId":"flow-…","providerId":"openai-codex","notice":{"kind":"openUrl","url":"https://auth.openai.com/…","instructions":"Sign in, then return here."}}
{"t":"auth.prompt","id":"…","at":"…","flowId":"flow-…","promptId":"p1","kind":"code","message":"Paste the code or the redirect URL"}
```

`progress`:
```json
{"t":"progress","id":"…","at":"…","work":"W-9f3k…","context":"cell-7a1…","invocationId":"inv-…","stage":"output","textChars":4210,"outputTokens":1100}
```

### E.3 Error codes

`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `SUPERSEDED`, `REFUSED`, `UNSUPPORTED`, `IDEMPOTENCY_CONFLICT`, `UNAUTHORIZED`, `INTERNAL`. `REFUSED` carries the harness or SDK message verbatim in `message` and structured fields (e.g. `refusal: "unverified-candidate"`, `anchors: [...]`) in `details`.

---
## Appendix F. Source index (what was read)

All paths relative to `C:\work.astrolab\`. Snapshot of 2026-09-29; ASTROLABE local `main` includes the AI Gate transport merge (D-326–D-336).

### F.1 ASTROLABE entry documents
`ASTROLABE/SOTA-BEST-MIXED-AGENT.md`, `README.md`, `READING-GUIDE.md`, `CLAUDE.md`, `CONTINUE-TASK.md`, `actual_state.md`, `settings.gradle.kts`, `gradle/libs.versions.toml`, `.github/workflows/ci.yml`.

### F.2 ASTROLABE architecture documents (`ASTROLABE/docs/`)
`architecture/{overview,principles,components,lifecycle,roles-shapes}.md`, `state/{contracts,evidence-coherence}.md`, `runtime/{context-layout,register-workset,residency-rebuild,tools,workspace-editing,gates-termination}.md`, `context/{compiler,continuity}.md`, `repository/navigation.md`, `verification/{scheduler,acceptance-review,refactoring}.md`, `operations/{delegation,recovery,routing}.md`, `knowledge/{records,learning}.md`, `platform/{adapters,security}.md`, `economics/costs.md`, `reference/{defaults,glossary,kernel-contract,rendered-turn,risks}.md`, `implementation/roadmap.md`, `eval/README.md`.

### F.3 ASTROLABE core sources (`ASTROLABE/core/src/main/kotlin/io/astrolabe/`)
Root: `Astrolabe.kt`, `Config.kt`, `Defaults.kt`, `AttemptConfig.kt`, `ConfigSnapshot.kt`, `Mode.kt`.
`event/`: `AgentEvent.kt`, `Authority.kt`, `Authorities.kt`, `Events.kt`, `Views.kt`, `Export.kt`, `DelegatedCost.kt`.
`java/`: `AstrolabeJava.kt`, `JavaAuthority.kt`, `JavaLanguageService.kt`, `JavaRetriever.kt`, `JavaMcpClient.kt`, `JavaEmbeddingProvider.kt`.
`campaign/`: `Controller.kt`, `Lifecycle.kt`, `ShapeSelector.kt`, `Plan.kt`, `S3Run.kt`, `Recoveries.kt`, `Escalations.kt`, `FinishReceipt.kt`, `Campaigns.kt`, `Proposals.kt`, `CellOrder.kt`, `Publications.kt`, `Publisher.kt`, `Controls.kt`, `Economics.kt`, `Calibration.kt`, `ImpactPrescan.kt`, `OptionalLayers.kt`.
`contract/`, `graph/`, `store/` (incl. `Migrations.kt`, `Layout.kt`), `evidence/`, `id/`, `auth/` (`EffectPolicy.kt`, `Capability.kt`, `PermissionLadder.kt`, `ExecutionMode.kt`, `Publication.kt`, `Redaction.kt`, `RulesTrust.kt`, `InstructionShape.kt`, `Boundary.kt`, `Stage.kt`, `Execution.kt`), `budget/`, `route/`, `cell/` (`Cell.kt`, `CellContext.kt`, `Gates.kt`, `Layout.kt`, `Role.kt`, `RoleTexts.kt`, `ResultPacket.kt`, `Checkpoints.kt`), `tool/` (`ToolFamily.kt`, `Args.kt`, `Envelope.kt`, `ToolSchemas.kt`, `edit/*`, `run/*`, `state/*`, `task/*`, `kb/*`, `Mount`/`Catalog`, `GeneratedTools`), `context/`, `register/`, `workset/`, `workspace/`, `atlas/`, `os/` (incl. `core/src/main/java/io/astrolabe/os/LinuxSubreaper.java`), `verify/` (`Check.kt`, `Scheduler.kt`, `Checker.kt`, `Review.kt`, `Watcher.kt`, `Measurement.kt`, `CampaignReview.kt`), `delegate/` (`Delegator.kt`, `TaskPacket.kt`, `Probe.kt`, `ReviewCell.kt`, `Judge.kt`, `EvidencePacket.kt`, `QaCell.kt`, `QaDriver.kt`, `Writer.kt`, `Integrator.kt`, `WorthTest.kt`), `recover/` (`FailureClass`, `Ladder.kt`, `Guards`, `Capsule`, `Repair`, `Alternative.kt`), `kb/` (`Note.kt`, `StoreKb`, `Queue`, `Curator.kt`, `Admission.kt`, `Extractor`, `Skill`, `SkillViews`, `BehaviourMaps`, `Retriever`, `PromotionProposals`, `NoteHorizon.kt`), `telemetry/` (`Accounting.kt`, `Metrics.kt`, `Spans.kt`, `TraceSnapshot.kt`, `TraceAnalytics.kt`, `Export.kt`, `KbHealth.kt`, `PrecompileMetrics.kt`).

### F.4 ASTROLABE provider modules
`provider-api/src/main/kotlin/io/astrolabe/provider/{ProviderAdapter,JavaProviderAdapter,Capabilities,Request,Item,Usage,Estimate,Serializers}.kt`; `provider-ai-gate/src/main/kotlin/io/astrolabe/provider/aigate/{AiGateAdapter,AiGateEstimator,AiGateInvocation,AiGateProfiles,JsonBridge,ProfileBinding,RequestTranslator,ResponseTranslator}.kt`, `provider-ai-gate/build.gradle.kts`, `provider-ai-gate/src/test/kotlin/…/LiveSmokeTest.kt` (env names only); `index-treesitter/src/main/kotlin/…/TreeSitterIndex.kt`; `eval/src/main/kotlin/io/astrolabe/eval/*` (FixtureRunner, FixtureReport, Scorecard, LiveGates).

### F.5 AI Gate SDK (`llm-transport-sdk/llm/`)
`build.gradle.kts`, `settings.gradle.kts`, `gradle/libs.versions.toml`, `README.md`; `src/main/java/net/ai/gate/`: `Llm.java`, `LlmCall.java`, `CallOutcome.java`, `Provider.java`, `lifecycle/*`, `config/*` (`HttpOptions`, `RetryPolicy`, `TimeoutPolicy`, `FieldDescriptor`), `providers/*` (`Providers`, `ProvidersConfig`), `vendors/{openai,anthropic,google}/**`, `spi/**`, `auth/**` (`Auth`, `AuthStatus`, `AuthType`, `Credential`, `Secret`, `ApiKeyAuth`, `Environment`, `oauth/*`, `interaction/*`), `internal/auth/**` (`AuthResolver`, `oauth/StandardOAuth`, `interaction/WebInteraction`, `store/FileStore`, `CredentialJson`), `catalog/**`, `model/**`, `metadata/**`, `chat/**`, `cache/**`, `event/**`, `diagnostics/**`, `error/**`, `testing/**`, `src/main/resources/META-INF/services/net.ai.gate.spi.provider.ProviderBundle`, `src/main/resources/net/ai/gate/catalog/models.json`.

### F.6 Integration and prior-work documents
`ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md`, `LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md`, `TRASPORT_INTEGRATION_ANALYZE.md`, `ASTROLABE/audit/OUT-OF-ORDER-P7-AIGATE.md`, `ASTROLABE/TODO.md` (rows D-326…D-336), `llm-transport-sdk/{progress_and_session_info,second_phase,step_three}.md`, the previous design `ASTROLABE_UI_DESIGN.md` (structure, gap list G01–G10, protocol decisions; its assumption that the AI Gate adapter is future work is superseded by F-41), `tasks/plan.md`, `tasks/todo.md`, `ui_goals.md`.

### F.7 How to re-verify quickly
- Event names and fields: `ASTROLABE/core/src/main/kotlin/io/astrolabe/event/AgentEvent.kt`; emitters: `rg -n "AgentEvent\.(Edit|Run|Check|Routing|Recovery|Budget)\." ASTROLABE/core/src/main`.
- Public API surface: `ASTROLABE/core/api/core.api`, `provider-api/api/provider-api.api`, `provider-ai-gate/api/provider-ai-gate.api`.
- Store schema: `ASTROLABE/core/src/main/kotlin/io/astrolabe/store/Migrations.kt`.
- Settings: `Config.kt`, `Defaults.kt` and `rg -n "<field>" ASTROLABE/core/src/main` for readers.
- SDK entry: `llm-transport-sdk/llm/src/main/java/net/ai/gate/Llm.java`.
