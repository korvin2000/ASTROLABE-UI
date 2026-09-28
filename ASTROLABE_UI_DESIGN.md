# ASTROLABE Workbench — UI specification and implementation plan

**Version:** 1.0 · **Date:** 2026-09-28 · **Status:** proposed design, grounded in the inspected source  
**Brief:** [ui_goals.md](ui_goals.md)  
**Deliverable:** a self-contained product concept, screen and interaction prototype, backend/frontend specification, implementation sequence, and ready-to-use implementation request.

This document specifies the Web UI and desktop experience to build. The prototype is a set of wireframes and reproducible interaction scenarios in section 7; it is not a running application. No live provider calls, credential changes, or SDK modifications were made for this design.

## Contents

1. [Product direction and scope](#1-product-direction-and-scope)
2. [Architecture findings and integration gaps](#2-architecture-findings-and-integration-gaps)
3. [Domain model and ownership](#3-domain-model-and-ownership)
4. [Navigation and entry points](#4-navigation-and-entry-points)
5. [Primary workflows](#5-primary-workflows)
6. [Screens and interaction rules](#6-screens-and-interaction-rules)
7. [Visual design and prototype](#7-visual-design-and-prototype)
8. [Configuration specification](#8-configuration-specification)
9. [Provider connections and authentication](#9-provider-connections-and-authentication)
10. [Backend architecture](#10-backend-architecture)
11. [WebSocket protocol](#11-websocket-protocol)
12. [REST resources and DTOs](#12-rest-resources-and-dtos)
13. [Angular implementation](#13-angular-implementation)
14. [Security, durability, and operational behavior](#14-security-durability-and-operational-behavior)
15. [Implementation plan](#15-implementation-plan)
16. [Acceptance and verification](#16-acceptance-and-verification)
17. [Implementation request](#17-implementation-request)
18. [Sources and requirement coverage](#18-sources-and-requirement-coverage)

## 1. Product direction and scope

### 1.1 The product

**ASTROLABE Workbench is a compact workspace for directing a coding campaign and inspecting the evidence behind its progress.** The familiar conversation is the default working surface. A dedicated Agent Overview exposes the campaign controller, current increment, active cells, tool activity, verification, and recovery.

At any point, the user should be able to answer:

1. What objective and constraints is the agent following?
2. What is working now, on which files, using which role and model?
3. What has been verified against the current candidate?
4. What needs my attention, and what will my response authorize?
5. What has this work consumed, including helpers and unsuccessful attempts?

The defining interaction is **select an activity → inspect its scope and evidence → act through the owning runtime component**. A check links to its receipt; a claim links to supporting observations; a changed file links to its preimage and current version; a blocked task links to the exact question or prerequisite.

### 1.2 Design decisions

| Decision | Why it fits ASTROLABE |
|---|---|
| One project sidebar and one main workspace | Preserves space for conversation, code, and dense technical details. |
| Conversation and Agent Overview are sibling views | Workflow inspection can use the whole workspace without a permanent third panel. |
| Progress is accepted requirements at a named candidate | Cell count, elapsed time, token use, and a model's completion statement do not prove completion. |
| Show the selected S0–S3 shape and its reason | The deterministic controller chooses the orchestration shape; a decorative agent graph would misrepresent execution. |
| Settings show effective value, source, and activation boundary | Attempt configuration is frozen. Saving a profile must not imply that a running cell changed model. |
| Use a small number of semantic colors | Developer attention should go to exceptions, active work, and verification gaps. |
| Keep advanced mechanisms discoverable in inspectors and settings | Context compilation, coherence, routing, and KB provenance are essential but need not occupy every screen. |
| Follow one fact across views using stable IDs | Conversation, graph, diff, logs, and receipts must describe the same operation. |

### 1.3 Scope and delivery levels

The complete target includes all the workflows in this document. Delivery is staged:

- **Prototype:** deterministic fixtures, complete navigation and state interactions, visibly marked “Demo data.”
- **Connected baseline:** real campaigns, current evidence, approvals, amendments, cancellation, provider setup, complete supported configuration, and recovery controls where qualified.
- **Advanced capabilities:** S3 worktree visualization, KB administration, optional integrations, publication beyond patch, and desktop packaging. Features appear as available only when their backend capabilities and tests exist.

Initial deployment is a **single-user local Java host on Windows or Linux**, serving Angular from the same origin. A browser is sufficient. A desktop package uses the same UI and backend contracts. Remote hosting is a separate deployment mode with explicit identity and filesystem boundaries. macOS runtime support is unqualified in the current core and must not be advertised as supported. [A02][A05]

### 1.4 Meaning of “configure everything”

Every supported public setting must have a documented UI location or an explicit explanation of why it is host-managed. This includes low-level settings in an Advanced section. It does **not** mean exposing arbitrary executable callbacks as JSON, allowing invented roles, or switching off mandatory correctness controls.

The backend publishes a versioned settings catalog with availability and validation metadata. Unavailable settings remain discoverable with an explanation such as “Requires a language-service adapter.” They must never be presented as working toggles.

## 2. Architecture findings and integration gaps

### 2.1 Inspection baseline

| Repository | Inspected HEAD | Finding |
|---|---|---|
| ASTROLABE | `dba6344d6fe787adec0b1cb580dd5d2e8e7dd353` | Kotlin/JVM core, Java facade, durable storage, controller, tools, verification, routing, delegation, and optional layers exist. |
| llm-transport-sdk | `d8dc26ad1204906bda48e8f5bcb5e64a08ab7885` | Java SDK named AI Gate, package `net.ai.gate`; real transport, stream, auth, catalog, and diagnostics APIs exist. |

Both working trees were clean during inspection. The root ASTROLABE README still calls the repository architecture-only; that is stale as an inventory. Source code and `actual_state.md` establish implemented P0–P6 functionality, while live transport and host work remain outside that completion claim. This design does not reinterpret fixture validation as live qualification. [A01][A02]

The architecture map links to the current subsystem documents. Its immutable `sources/` files are historical inputs, not the implementation authority. The existing integration analysis was used as supporting context and checked against the public APIs. [A01][I01]

### 2.2 What makes this UI specific to ASTROLABE

| Architecture property | UI consequence |
|---|---|
| A durable campaign and bounded cell have different lifetimes | Sidebar sessions resolve to campaigns; attempts and cell lineages appear inside a session. Rebuilds do not create a new user objective. |
| The controller owns contract, graph, ledger, and scheduling | Graph nodes are observed execution. Users propose changes through commands; dragging a node cannot rewrite the plan. |
| The verifier accepts completion | “Completed” requires the final supported state and finish receipt. Assistant prose cannot set the badge. |
| Result packets cross cell boundaries | Overview edges represent packets, checks, dependency relations, or actual dispatch; they do not imply agents share one conversation. |
| Four identities and workspace-qualified versions | Inspectors retain work, attempt, candidate, and context IDs plus workspace and generation qualifiers. |
| Five coherence horizons | Staleness is visible for reads, STATE claims, checks, notes, and delegated results. Historical evidence remains inspectable. |
| Context uses `[S][R][K][T][A]` | Context inspector separates compiled input, transcript, and volatile anchor, with rebuild history and coverage limitations. |
| Roles configure one runtime | The role editor exposes bounded configuration of declared roles, rather than an unrestricted agent builder. |
| Quality floors constrain routing | A cheap model selection can be refused; UI explains the floor and eligible alternatives instead of silently downgrading. |
| All children and retries spend the originating budget | Usage totals include probes, reviews, repair, extraction, retries, and integration. |
| Publication uses separate permission stages | Patch complete, committed, pushed, merged, and deployed are distinct outcomes and controls. |

These consequences follow the ownership, lifecycle, role, context, and evidence contracts. [A03][A04][A06][A11][A12]

### 2.3 Existing callable entry points

| Existing entry point | What the host can do now | Important limitation |
|---|---|---|
| `AstrolabeJava(Config, JavaProviderAdapter, JavaAuthority, ...)` | Supply configuration, transport adapter, authority, and optional layers. | The AI Gate adapter is still a separate integration task. |
| `open(Path)` | Acquire a project, store, and project lock. | Host must own and close the project; closing it during a campaign is invalid. |
| `campaign(project, request, policy, publication)` | Start a new campaign and obtain a future for its handle. | Public facade allocates a new work ID and first attempt; one active campaign per project. |
| `JavaCampaignHandle.await / isDone / cancel` | Observe terminal outcome and request cancellation. | Cancellation settles effects and usage; it is not a reversible pause. |
| `JavaCampaignHandle.amend(text)` | Add a user amendment visible to the running cell on a later turn. | No expected-revision or command-deduplication parameter; no structured requirement transformation through this signature. |
| `AstrolabeJava.subscribe(EventSink)` | Receive all runtime events. | References and metadata, not a durable token stream. Subscribe before starting work. |
| `JavaCampaignHandle.subscribe(EventSink)` | Receive events filtered to a work ID. | Filtering shared bus events does not create contiguous per-work sequence numbers. |
| `Project.views / handle.views` | Read contract, ledger, register, workset, checks, usage, receipts, and finish packet. | Typed wrappers contain `StoredRow` bodies; no complete UI DTO, cross-view public atomic snapshot, or full list/search API. |
| `JavaAuthority.ask / approve / resolve / review` | Await typed host responses through futures. | Pending items need host persistence, user ownership, revision checks, timeouts, and restart reconciliation. |
| `Controller.open` with existing IDs | Lower-level reopen and reconciliation, including resumable outcomes. | No equivalent public Java resume command; avoid duplicating the controller in Spring. |
| `Llm.models / auth / stream / addListener / preview / test / describe` | Catalog, provider connection, stream, telemetry, and diagnostics. | SDK stream and auth messages must be bridged and redacted for this UI. |

Sources: [A07][A08][A09][A10][A13][S01][S02][S03].

The Java-specific methods and authority futures are defined in [AstrolabeJava][A21] and [JavaAuthority][A22]. In particular, `Contracts.amendByUser` appends a request and increments the revision; its default transformation is identity. `Contract.objective` returns the latest request text. Therefore an incremental message such as “also keep anonymous access” cannot by itself be treated as a fully rebuilt contract. G08 must preserve applicable prior obligations, derive a proposed structured change, and record the user's authorized amendment without silently dropping the original objective. [A24][A32]

### 2.4 Important implementation details

- `Events` retains **256** recent events and buffers **4096** per subscriber by default. Slow subscribers lose their oldest pending entries. It is an in-memory notification bus. The `AtomicLong` belongs to the bus instance shared by the facade, despite comments describing a per-campaign sequence. Do not persist that number as a globally durable UI cursor. [A09]
- `AgentEvent` contains model-request/response notifications but no text-delta event. `ChatEvent.TextDelta` exists in AI Gate. Streaming requires a bridge tied to the ASTROLABE invocation identity. [A08][S03]
- `Project.kb` currently returns `EmptyKb`; the controller opens the campaign KB separately. A “Knowledge” page must use a supported read facade over the actual store, not this convenience property. [A07][A13]
- Declared role names are `implementing, plan, probe, review, qa, writer, repair, extractor`. Unknown role names fail `Config.violations()`. Overrides cannot widen the default tool mask or permission, change the packet kind, or re-grant denied note kinds. Persona text allows at most three lines. [A05][A06]
- `Confined` requires an external isolation backend. `TrustedLocal` is the working default and has no process sandbox. A label cannot supply confinement. [A14]
- Background processes are owned by the harness; the core does not supply detached jobs that survive host exit. After a crash, recovery can report `lost`. [A05]
- `CampaignOutcome` has `completed, waiting_for_process, waiting_for_input, blocked_external, budget_exhausted, cancelled, failed`. Cell `partial` or `replan` is not a campaign completion state. [A15]
- Settings and prices are frozen per attempt. Transport catalog refresh and configuration editing must not silently alter the active attempt. [A16]

### 2.5 Required additions and owners

All names prefixed `Host` or `Ui` below are **proposed**, not existing APIs.

| Gap | Required contract | Owner / dependency |
|---|---|---|
| G01 Live LLM integration | AI Gate `JavaProviderAdapter` plus estimator/admission, native history, caching, cancellation settlement, and usage mapping | Transport adapter + core integration, as detailed in [I01] |
| G02 Java recovery and controlled starts | Java facade operations for start with durable command identity, reopen by work/attempt ID, and start a new authorized attempt | Core; reuse `Controller` |
| G03 Complete read projections | `HostSnapshot` in one read transaction with revision; campaign enumeration; transcript/artifact, context, process, KB, routing and integration projections | Core read API + host DTO mapper |
| G04 Reliable UI delivery | Host outbox, replay, subscription cursor, snapshots, and explicit loss/resync semantics | Spring host; core durable change revision/read support |
| G05 Human interaction persistence | Pending question/approval/review store, single-use resolution, and recovery binding to current core requests | Spring authority bridge + core recovery support |
| G06 Token presentation | One consumer of AI Gate stream, safe deltas, canonical final-message linkage, bounded buffers | Transport adapter + host |
| G07 Idempotent core mutations | Stable command IDs and expected revisions at core mutation boundaries, with durable result lookup | Core; especially amendment, start, publication and new attempt |
| G08 Explicit user operations | Structured initial contract, check request, process cancellation, guarded revert, post-run publication and curator actions through owner APIs | Core facade additions; no direct SQL writes |
| G09 Complete configuration binding | Explicit binding for supported nested policies and host SPI registrations; capability availability metadata | Host + narrowly scoped core configuration additions |
| G10 Desktop integration | Local launcher, project picker, external browser auth, packaged runtime, lifecycle notifications | Desktop host; same web contracts |

G02 does not make every terminal outcome resumable. Current core resumes external waits and reconciles interrupted activity. Completed/cancelled/budget-exhausted/failed runs require an explicitly supported new-attempt or follow-up path with preserved history and budget accounting.

## 3. Domain model and ownership

### 3.1 Vocabulary presented to users

| UI term | Runtime meaning | Lifetime |
|---|---|---|
| Project | Canonical repository + host project metadata + core store reference | Across sessions |
| Session / campaign | One logical objective, `work_id` | Across attempts and reconnects |
| Attempt | Execution under a frozen harness/profile configuration, `attempt_id` | Until its recorded outcome |
| Candidate | Exact artifact state and environment, `candidate_id` | Changes with relevant workspace state |
| Cell | Bounded execution of an increment or delegated role, `context_id` | Until its result packet |
| Increment | A unit in the requirement graph with acceptance and write scope | May span continuation cells |
| Check receipt | Immutable evidence about a check, candidate, scope, and environment | Retained with validity computed separately |
| Pending action | A question, effect approval, amendment proposal, or human review | Until resolved, superseded, or expired |
| Workspace | Primary repository or isolated worktree with its own identity | Qualified for all file/coverage references |

“Session” is a navigation label, not a second authority model. Renaming or archiving a session changes host metadata only. Deleting history or repository data is a separate operation.

### 3.2 State ownership

```mermaid
flowchart LR
    UI[Angular workspace] <-->|WebSocket commands and updates| HOST[Java Spring Boot host]
    UI <-->|REST snapshots and artifacts| HOST
    HOST -->|Java facade and authority bridge| CORE[ASTROLABE controller]
    CORE --> COMP[Context compiler]
    COMP --> CELL[Bounded cell runtime]
    CELL --> TOOLS[Tools and workspace]
    TOOLS --> VERIFY[Verifier and receipts]
    VERIFY --> CORE
    CORE --> STORE[Core SQLite and blobs]
    CELL --> BRIDGE[AI Gate provider adapter]
    BRIDGE --> SDK[AI Gate transport and auth]
    HOST --> HSTORE[Host metadata and delivery outbox]
```

Core owns requirements, acceptance, ledger, workspace mutation, verification validity, accounting, and KB admission. Host owns authenticated users, projects, UI metadata, command tracking, delivery, and pending interaction presentation. Angular owns selection, layout, drafts, and rendering.

The host database stores references and rebuildable projections of core facts. It never updates core tables. SDK listeners are diagnostics; core accounting is the authority for campaign totals.

### 3.3 Read model rules

- Every campaign DTO carries `projectId, workId, attemptId, contractRevision, candidateId` when known.
- Cell-specific DTOs additionally carry `contextId, generation, workspaceId`. Unknown values are `null` with a reason, not synthetic IDs.
- Separate `phase`, `outcome`, `connectionStatus`, and `publicationStage`. A disconnected client can still have a running campaign.
- Keep `recordedOutcome` separate from `currentValidity`. A passing receipt can be stale now.
- `allowedActions` is computed by the backend, includes disabled reasons, and is revalidated on every command.
- Requirement progress is `acceptedCurrent / requiredCurrent` for a named contract revision and candidate. Show “0 requirements defined” instead of 0% or 100% when the denominator is zero.
- Budget usage, elapsed time, and context occupancy have their own units and labels; none is a completion percentage.
- Display source freshness: live, last synchronized, historical, or unavailable.

## 4. Navigation and entry points

### 4.1 Application structure

**Sidebar, top to bottom:**

1. ASTROLABE wordmark, collapse control, connection indicator.
2. Project switcher and “Open project.”
3. “New session” button and session search.
4. Sessions grouped by Active, Recent, and Archived; each row has title, status icon, and relative update time.
5. Project Knowledge and Activity links.
6. Settings and provider connection summary.

**Session workspace:** breadcrumb and campaign title; status and compact counters; tabs **Conversation / Agent Overview / Changes / Checks**. Contract, Context, Processes, Usage, and History are available through a single “Inspect” menu. A selected inspector expands inline or replaces the content area; it does not add a permanent column.

### 4.2 Routes

| Route | Entry / purpose |
|---|---|
| `/welcome` | Connect to host, choose theme, connect provider, open project |
| `/projects` | Recent projects; open/register repository on the host |
| `/p/:projectId` | Project summary and sessions |
| `/p/:projectId/new` | New request, scope, acceptance, budget, and profile |
| `/p/:projectId/s/:workId/conversation` | Default workspace |
| `/p/:projectId/s/:workId/overview` | Live execution and requirement graph |
| `/p/:projectId/s/:workId/changes` | Candidate diff and file history |
| `/p/:projectId/s/:workId/checks` | Current verification and historical receipts |
| `/p/:projectId/knowledge` | Notes, skills, provenance, admission queue |
| `/p/:projectId/activity` | Campaigns, processes, recovery, and history |
| `/settings/:section` | Appearance, connections, profiles, roles, policies, integrations, advanced |
| `/connections/:connectionId/auth/:flowId` | Private authentication interaction |

Use query parameters `attempt, context, candidate, inspect, ref` for durable deep links. Reloading a deep link loads its snapshot before subscribing. References remain authorized by project; possessing an ID is insufficient.

### 4.3 Entry-point behavior

- **Local open:** native picker where packaged; browser uses a server-side directory chooser within configured roots or a pasted host path. A browser upload is not a writable repository mount.
- **Remote open:** clearly label “Repository on <host>”; select an authorized server workspace. Do not imply that a browser-local folder can be executed by the remote server.
- **Reopen session:** attach to a running handle or load history. Resuming is a separate visible command when allowed.
- **Notification:** opens the exact pending item with its original project/work/revision.
- **CLI handoff, proposed:** launcher accepts a canonical project path and optional work ID, registers through the same host, then opens a local app route. It must not start a second controller.
- **External editor:** validated file/line links use the configured editor handler after user action; unavailable handlers offer Copy path.

## 5. Primary workflows

### 5.1 First useful run

1. Launch host; open Workbench; backend reports platform, SDK versions, integration availability, and authenticated session.
2. Open an existing repository. Show canonical path, branch, dirty-file count, project-lock status, detected commands, and execution mode.
3. Connect a provider or select an existing connection. Test configuration, connectivity, and model access using the SDK diagnostic contract; show stage-level results and limitations.
4. Select a qualified model profile. Display effective routing, token/cost limits, price date, and any unknown capabilities.
5. Enter the task. Expand “Task controls” only when needed: scope, protected paths, constraints/exclusions, acceptance, budget, expected resume, publication ceiling, rules binding.
6. Review the concise start summary; click **Start campaign**. Start is disabled with actionable errors if transport, model, project lock, budget, or settings are invalid.
7. The backend commits the command identity, opens the campaign, and returns its IDs. The UI clears the draft only once creation is durably confirmed.

The current facade accepts request text plus campaign policy, rather than a structured contract. Structured controls depend on G08; until implemented, the connected UI must clearly identify which controls are supported and must not hide structured settings in prompt prose as a substitute for enforcement.

### 5.2 Directing an active campaign

The composer has explicit modes:

- **Amend objective**: updates authoritative user instruction. Show a preview against current contract and require an expected revision. Preserve the original request in history.
- **Answer pending question**: bound to a question ID and revision; choices and free text; distinguish factual response from a requirement change.
- **Draft follow-up**: saved without dispatch while the current work continues; after completion, creates a new work item with links to relevant artifacts.

Do not send arbitrary “chat” directly to AI Gate outside the campaign; that would create an untracked second coding loop. Rich attachments are versioned file references or sanitized text artifacts with scope/provenance, admitted into core context through a supported host API.

For a short incremental amendment, the preview shows the resulting full objective and a diff of requirements, acceptance, scope and authority. The user confirms that concrete revision before dispatch. Preserve the short original message as provenance. Text-only amendment and structured amendment are distinguished in the backend capability contract; neither can claim the other's enforcement.

During an active run, the composer shows “Applies on next turn” for an amendment. An immediate **Stop** command cancels through the campaign handle. After acceptance of the command, show **Stopping · settling effects and usage** until the core reaches a terminal outcome.

### 5.3 Questions, permissions, and human review

Pending actions appear inline above the composer and increment an attention counter in the sidebar. Each displays:

- requesting role and current task;
- exact question or action, effect class, arguments, working directory, paths and expected effect;
- applicable contract revision and candidate;
- choices or Allow once / Deny, with an optional reason;
- whether the answer changes requirements or authority.

A D-class approval is scoped to that request and revision. “Always allow” is not an incidental button; persistent policy changes go through settings/contract authorization. Human review displays the evidence packet and allows Accept, Reject, or Insufficient evidence using the runtime verdict vocabulary. A review does not rewrite test results.

Browser disconnect keeps a valid pending item available. An explicit timeout resolves through policy into a supported blocked/denied outcome; it never counts as consent. Reconnect shows the current item. A stale response gets a revision conflict and a refreshed preview.

### 5.4 Completion and publication

Completion presents a compact receipt summary: objective, accepted requirements, current checks, remaining gaps, candidate, changed files, cost completeness, and highest publication stage.

- **Review changes** is always available when artifacts exist.
- **Export patch** produces a candidate-bound artifact.
- **Commit / Push / Merge / Deploy** appear only when supported, within the contract ceiling, and authorized for their exact stage and target.
- Changing workspace contents invalidates the publication preview and requires revalidation.
- Deployment requires a supplied host deployer. Do not render a functional deployment switch merely because `Stage.Deploy` exists.

The current facade accepts publication at campaign start and exposes results afterward. Interactive post-run publication is G08. The planned UI must not bypass it with ad hoc Git commands. [A17]

### 5.5 Reconnect, recover, and change profile

**Reconnect** restores display from snapshot plus stream replay; it never restarts the campaign.

**Resume** asks core to reopen eligible existing work, reconcile pending effects, inspect external changes, and recover checkpoints. A lost process is shown as lost, not silently relaunched.

**New attempt** uses the same logical work when supported, a new attempt ID, and a newly frozen policy. The UI shows prior outcomes and accumulated cost. Budget changes require an explicit authorized amendment; a model change cannot reset expenditure.

Profile edits made while running show “Saved for future attempts.” Provide a deliberate “Stop and prepare new attempt” flow when G02/G07 support it. Do not label cancellation as Pause or promise that an in-flight model call can resume.

## 6. Screens and interaction rules

### 6.1 Conversation

Use a chronological, selectable transcript with stable message anchors:

- User requests and authorized amendments retain their original text.
- Agent responses use readable Markdown with sanitized links and code blocks.
- Each turn begins with a short observable intent/status line when supplied: “Tracing the cache invalidation callers.”
- Consecutive read/search operations collapse to a row such as “Inspected 4 files · 2 searches.” Expanding lists each operation, scope, output completeness, and artifact link.
- Edits show paths, additions/deletions, candidate transition, and a diff link.
- Checks show absolute current status as well as the latest delta: “24 passed, 1 failed · 1 new failure.”
- Rebuilds, routing changes, recovery, and delegation appear as concise boundary rows.
- Interrupted output is marked Partial; it cannot masquerade as the final assistant response.

Do not auto-scroll when the user has scrolled away from the bottom. Show “12 new events · Jump to live.” Preserve text selection, expanded rows, and scroll position when updates arrive. Virtualize or page old activity while retaining accessible navigation and search.

### 6.2 Agent Overview

The top strip contains:

`Shape S2 · Increment 2 of 4 selected · implementing · main-profile · Verify · Turn 8/40`

Under it: **2/5 requirements accepted at candidate c42**, elapsed time, budget used/reserved, and current attention item. “2 of 4” is the selected increment index, not a guarantee that the plan is fixed.

Two modes share one selection:

1. **Execution** — the default, focused on what is running.
2. **Requirements** — dependency graph with increment scope, acceptance, blockers, and evidence.

Execution view uses stable left-to-right lanes:

`Contract → Select increment → Compile → Active cell → Verify → Accept`

The active cell expands in place to show `model → tool batch → observation`. Probe and review cells branch only when dispatched. The KB/context source is a small attachment, not an always-expanded constellation. Recovery returns to an appropriate boundary; finalization is visibly separate from increment acceptance.

| Shape | Graph behavior |
|---|---|
| S0 | Compact single-cell path; keep verification and lifecycle nodes. |
| S1 | Increment sequence, plan cell, continuation cells, and compile boundaries. |
| S2 | Explicit probe/review branches, returned packets, routing/refusal and recovery edges. |
| S3 | Writer lanes by workspace and scope; completed packets enter one integration queue; combined-candidate checks precede acceptance. |

**Nodes:** label, role/function, status word/icon, scope summary, duration, and profile if model-backed. Deterministic controller/compiler/verifier nodes do not get a model avatar. Each live node retains its ID across rerenders. Selecting one opens details below the graph: inputs, outputs, scope, event trail, receipts, and limitations.

**Edges:** typed as dependency, dispatch, tool result, packet return, verification, or integration. Animate an edge only on an observed transition. An active node may have a subtle indicator; do not fabricate continuous “information exchange.”

**High-level reasoning progress:** show declared intent, recorded hypotheses and their evidence state, decisions with rationale, rejected alternatives, and verified outcomes when those records exist. Do not claim to reveal private chain-of-thought or infer thoughts from token timing. Provider-exposed reasoning content is optional, capability-dependent, collapsed, and governed by the adapter's display policy; opaque reasoning/signature artifacts remain server-side.

**Graph controls:** Fit, Follow active, selected lineage, time range, and list view. Default shows current increment and immediate dependencies; expand completed groups. Disable Follow active when the user pans or selects history. S3 exposes “3 active cells” instead of suggesting one active agent.

### 6.3 Contract and requirements

An inspector shows verbatim objective and amendment history; constraints and exclusions; write/protected scopes; acceptance items `run / check / review`; dependencies; ledger status; and source authority.

Each acceptance item displays its own obligation version and current evidence. A proposed weakening has a before/after comparison and the obligations it would retire. A model proposal never becomes a user amendment merely because it appeared in conversation.

### 6.4 Changes

Main view: compact file list and diff content within the same workspace. Offer unified and side-by-side diff where width allows. Show pre-existing dirty changes separately from campaign changes using the core's baseline snapshot.

Per file show workspace, candidate, content version, origin (agent edit / command / external), and applicable checks. Large files load by bounded chunks; binary/non-UTF-8 files show metadata and the core limitation.

User actions: inspect, copy path, open in editor, export patch, request guarded revert. A revert preview names the expected current version, target edit/snapshot, affected files, and preserved user changes. Revalidate before applying through core; a conflict opens a comparison. Browser editing is a later optional capability requiring the same versioned edit path; the baseline diff is read-only.

### 6.5 Checks and evidence

Default table columns: Check, Scope, Outcome, Current validity, Candidate, Counts, Duration, Last updated.

Filters: Required, Failed, Stale, Running, All. An empty run that discovered no tests must be distinct from a passing suite. Show pre-existing failures only with linked baseline evidence. Refactor mode exposes `red_ok_until` and its expiry; temporary red does not remove final acceptance.

Receipt detail includes command/argv, cwd, environment, verifier/check definition versions, contract revision, input closure, before/after stamps, parsed counts, raw-output reference, redaction/capture limits, and any reuse proof. Retain older results; do not repaint an old receipt green for the new tree.

### 6.6 Context and knowledge

**Context inspector** is read-only:

- `S` system/role and tool schema identity;
- `R` repository orientation, rules binding, project knowledge;
- `K` increment contract slice, notes, seeds, skill modules and carry-forward;
- `T` transcript residency, stubs, retained history;
- `A` current anchor/register summary and gauge, only if a supported runtime projection exposes it.

Show context occupancy, output headroom, estimator version/confidence, compile manifest, known/unseen regions, current file versions, and rebuild reason/generation. The volatile anchor is not an existing persisted artifact; historical views must say “not captured” rather than fabricate it.

**Knowledge** has Notes, Skills, and Admission tabs. Search by kind, scope, freshness, source, and status. Detail shows anchors, evidence refs, confidence, provenance, validity dependencies, supersession, and role visibility. A user edit creates a proposal through the curator; it does not write a Markdown export or promote a claim directly. Stale notes stay inspectable but are not represented as eligible live context.

Skills promotion, dense retrieval, behavior maps, and calibration data expose their availability and measured status. Configuration experiments and evaluation-only arms are not everyday task presets.

### 6.7 Processes

Accessible from an active-process counter and Activity. List process handle, campaign/cell, command, cwd, effect class, status, start time, timeout, output cursor, capture completeness, and exit code.

Selecting a process opens a bounded log viewer with stdout/stderr labels, Follow output, Copy, Download redacted log, and Cancel if authorized. User cancellation is an explicit handle-specific core command, not an arbitrary shell kill. Network disconnect leaves the process running; backend exit follows core process ownership rules.

A process can be `running, exited, cancelled, timed out, lost, unknown` according to its projection. Preserve the raw status when the core vocabulary differs. “No new output” is not a terminal status.

### 6.8 Usage and routing

Overview totals: exact known cost or “Known cost … · usage incomplete,” tokens, elapsed/tool time, invocation count, and remaining/reserved budget. Expand by attempt → role → invocation and by phase.

Keep these quantities separate:

1. model-visible context occupancy;
2. estimated admission/reservation;
3. provider-reported billable dimensions;
4. priced cost using a dated price table.

Price uncached input, cache reads, each cache-write class, and output once each. Do not add diagnostic total-input or reasoning-in-output a second time. Do not sum currencies without an explicit dated conversion policy. Cost per accepted task is undefined at zero accepted tasks. [A18]

Routing inspector shows function, required tier, selected profile/effort, price/calibration date, risk floor, excluded alternatives and refusal reason where captured. Missing traces display “Not captured in this runtime version”; a profile switch is recorded, not silently animated.

### 6.9 State and error treatments

| Situation | Main presentation | Available next action |
|---|---|---|
| No project | Short explanation and Open project | Register repository |
| No qualified model | Setup checklist with exact failing capability | Connect / configure profile |
| Project busy | Existing work and lock owner if known | Open active session |
| Waiting for input | Inline pending item, attention badge | Answer / deny / cancel |
| Waiting for process | Handle, command, latest output time | Inspect / permitted cancel |
| Blocked external | Reason and reconciliation status | Resolve prerequisite, then supported resume |
| Budget exhausted | Consumption, reserves, unfinished obligations | Authorized budget/new-attempt flow |
| Routing refused | Unsatisfied floor, unavailable/unaffordable profiles | Configure eligible profile or revise task |
| Provider error | Retry state, delay, response category, known/unknown outcome | Inspect; retry only if policy permits |
| Cancelling | Settlement progress and active effects | Inspect; no second start until settled |
| Disconnected | Last synchronized time; current state marked stale | Reconnect; preserve drafts |
| Backend restarted | Recovering snapshot and command outcomes | Inspect unknown effects before resuming |
| Unsupported capability | Named missing adapter or gate | Configure prerequisite |
| Completed | Final receipt and publication stage | Review / export / authorized publication |

## 7. Visual design and prototype

### 7.1 Visual direction

Use a quiet graphite and warm-neutral interface with restrained teal as the action/active accent. Flat surfaces, clear typography, hairline dividers, and compact aligned rows should carry hierarchy. Avoid decorative gradients, glowing nodes, glass effects, giant metrics, and nested cards. The ASTROLABE mark can be a simple geometric instrument symbol; the workspace is the visual focus.

| Token | Dark | Light |
|---|---|---|
| App background | `#111416` | `#F5F6F4` |
| Sidebar | `#15191C` | `#ECEFEC` |
| Main surface | `#1B2024` | `#FFFFFF` |
| Hover / selected-neutral | `#252C31` | `#E6EBE8` |
| Decorative divider | `#353E44` | `#CCD4CE` |
| Primary text | `#E9EDEA` | `#202925` |
| Secondary text | `#A7B2AC` | `#526158` |
| Accent / focus | `#78C7B0` | `#176B55` |
| Success text | `#9ACCAE` | `#28613C` |
| Attention text | `#E0BC7A` | `#77501B` |
| Failure text | `#E6A1A1` | `#973B3B` |

These are initial design tokens, to be contrast-tested in implementation. Controls need a separately validated border/focus contrast; a decorative divider is not an adequate focus indicator. All status meaning also uses words and icons.

- Typography: system UI font stack; 14px body, 13px dense rows, 12px metadata minimum, 18–20px workspace headings. Monospace stack for code, IDs, and numeric details.
- Spacing: 4px base; 8/12px row gaps, 16px section padding, 24px major separation.
- Sidebar: 240px default, resizable 208–320px; collapsed rail 52px.
- Header: 48px; tabs: 40px; dense rows: 32–36px; interactive controls at least 32px high with sufficient spacing.
- Composer: 3 lines initially, grows to 8; a compact metadata row for mode/profile/budget; remains visible using layout grid and `min-height: 0`.
- Corners: 6px controls, 8px popovers; no oversized pill containers.
- Motion: 120–180ms feedback transitions; graph activity restrained and event-driven. Honor `prefers-reduced-motion` with static active markers.

### 7.2 Responsive behavior

- **1440×900:** full sidebar; conversation width capped near 960px and centered within the main region; graph/diff can use available width.
- **1280×720 / 1366×768:** full core workflow fits; details collapsed, composer visible, no body-level horizontal scroll.
- **900–1199px:** sidebar collapsed by default; side-by-side diffs switch to unified.
- **Below 900px:** project/session navigation is an overlay; Overview defaults to an ordered activity list with an optional scrollable graph. Inspectors occupy the workspace.
- **390px mobile:** monitoring, approval, conversation and unified diff remain usable; writing code is not the optimization target.
- **200% zoom:** reflow like a narrow viewport; actions remain reachable without clipped text.

### 7.3 Prototype A — active campaign, conversation

```text
┌───────────────────────┬───────────────────────────────────────────────────────┐
│ ◉ ASTROLABE        ‹  │ payments / Fix stale cache             Running   Stop │
│ payments          ▾  │ S2 · Implementing · main · 2/5 accepted @ c42          │
│ + New session         ├───────────────────────────────────────────────────────┤
│ Search sessions       │ Conversation   Agent Overview   Changes 3   Checks 4 │
│                       ├───────────────────────────────────────────────────────┤
│ ACTIVE                │ YOU                                                   │
│ ● Fix stale cache     │ Fix invalidation after account preferences change.   │
│                       │                                                       │
│ RECENT                │ IMPLEMENTING · Increment 2 · Turn 8                   │
│ ✓ Add retry policy    │ The write path updates the record but keeps the      │
│ ◷ Trace slow query    │ earlier cache key. I’m checking both callers.         │
│                       │                                                       │
│                       │ ▸ Inspected 4 files · 2 searches                     │
│                       │ ▸ Changed cache.ts +18 −6 · candidate c42            │
│                       │ ▾ verify.tests  Running · 12s                        │
│                       │   cache.spec.ts · 24 passed · 1 failed               │
│                       │   Receipt pending · Open process                     │
│                       │                                                       │
│ Knowledge             ├───────────────────────────────────────────────────────┤
│ Activity       1      │ Amend objective ▾       Applies on next turn          │
│                       │ Also preserve behavior for anonymous accounts.       │
│ Settings              │ Attach context           Draft saved      Send ↑     │
│ ● Local host          │ 41k tokens · known $0.42 · 1 process · Inspect ▾      │
└───────────────────────┴───────────────────────────────────────────────────────┘
```

All names, costs, counts, and IDs in the prototype are fictional fixtures. The failed test counts are provisional output until a receipt is recorded; the UI must not preemptively claim verification.

### 7.4 Prototype B — Agent Overview, S2

```text
┌───────────────────────┬───────────────────────────────────────────────────────┐
│ Projects / sessions   │ Fix stale cache                         Running Stop │
│                       │ Conversation  [Agent Overview]  Changes 3  Checks 4  │
│                       ├───────────────────────────────────────────────────────┤
│                       │ Execution  |  Requirements           Follow active ● │
│                       │ 2/5 accepted @ c42 · S2 · Turn 8/40 · Reserve intact │
│                       │                                                       │
│                       │ Contract ── Select I2 ── Compile ── Implementing     │
│                       │    v1          ✓            ✓             ●           │
│                       │                                          │            │
│                       │                         Probe ✓ ─packet───┤            │
│                       │                                          ▼            │
│                       │                                      Verify ●         │
│                       │                                          │            │
│                       │                                     Review queued     │
│                       │                                          │            │
│                       │                                     Accept pending    │
│                       ├───────────────────────────────────────────────────────┤
│                       │ SELECTED: Verify · I2                                 │
│                       │ cache.spec.ts · current candidate c42 · 12s           │
│                       │ Input scope: src/cache/**, account update callers     │
│                       │ 24 passed · 1 failed · receipt pending               │
│                       │ Open output     View changed files     Show evidence │
│                       ├───────────────────────────────────────────────────────┤
│                       │ Amend objective…                             Send ↑  │
└───────────────────────┴───────────────────────────────────────────────────────┘
```

The graph renders real dispatched nodes; “Review queued” requires an actual required review obligation. In an S0 fixture, remove unused branches and retain the compact lifecycle.

### 7.5 Prototype C — approval with concrete effect

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ ACTION NEEDED · implementing · I2 · contract v3                              │
│ Install the test dependency                                                 │
│                                                                             │
│ Command       npm install --save-dev example-test-helper                     │
│ Directory     payments/                                                     │
│ Effect        D · network access + package installation                      │
│ Expected      package.json and lockfile may change                           │
│ Reason        Required to run the agreed integration check                   │
│                                                                             │
│ Approval applies to this request under contract v3.                         │
│ Optional reason…                                      Deny   Allow once     │
└───────────────────────────────────────────────────────────────────────────────┘
```

Fixture only; it does not recommend this dependency. On a revision change, replace the buttons with “Request superseded · Review current request.” The stale button must not remain actionable after refresh.

### 7.6 Prototype D — settings with effective configuration

```text
┌──────────────────────┬────────────────────────────────────────────────────────┐
│ Settings             │ Roles / implementing                                  │
│ Appearance           │ Project: payments · Override inherited settings       │
│ Connections          │                                                        │
│ Model profiles       │ Profile prior      High                  SDK default   │
│ Roles                │ Permission         Local commit ▾       Override      │
│ Execution            │ Effective ceiling  Patch                Task contract │
│ Verification         │ Tool operations    38 allowed / 2 masked    Inspect    │
│ Context & knowledge  │ Persona            2 of 3 lines                       │
│ Integrations         │ Policy text        roles/project-payments/1            │
│ Advanced             │                                                        │
│                      │ Effective operations = role ∩ shape ∩ authorization   │
│                      │ Active attempt a1 uses the previous snapshot.         │
│                      │ Saved changes apply to future attempts.               │
│                      │                           Reset override   Save        │
└──────────────────────┴────────────────────────────────────────────────────────┘
```

Counts are illustrative. Production values must come from the backend's effective role projection. Restrictions on role fields remain those in section 8.

### 7.7 Reproducible prototype scenarios

Implement the later clickable prototype with these fixtures, each switchable from a clearly separate demo control:

| Fixture | Interaction sequence | Required result |
|---|---|---|
| P01 Local correction, S0 | Start → inspect edit → check passes → finish | Compact graph; finish receipt; patch stage |
| P02 Investigation, S2 | Open Overview → select probe → inspect packet → review | Fresh role contexts and packet edges; requirement links |
| P03 Approval | Receive action → deny; reset → allow once | One resolution per request; transcript records outcome |
| P04 Stale evidence | Passing receipt → external file change | Receipt stays historically passed; current validity becomes stale |
| P05 Disconnect | Drop socket during run → type draft → reconnect | Draft preserved; snapshot/replay; no second campaign |
| P06 Cancellation | Stop during model/tool activity | Stopping → settlement → cancelled; no fake success |
| P07 Incomplete usage | Invocation ends without a billed dimension | Known subtotal and unknown marker; no $0 substitution |
| P08 Settings | Change main profile during run → save → inspect active attempt | Active snapshot unchanged; new value marked future |
| P09 S3 | Two writers finish → candidate moves → integration rejects one | Workspace-qualified lanes; revalidation before merge |
| P10 Superseded answer | Open approval v1 → amend to v2 → submit v1 response | Conflict; no authorization effect |
| P11 Recovery | Restart host with an unknown process effect | Honest unknown/lost state; no automatic repeat |
| P12 Layout/accessibility | Dark/light; reduced motion; keyboard-only; 720px height | Reachable composer, focus, legible data and list alternative |

### 7.8 Accessibility and keyboard behavior

Use semantic landmarks, buttons, headings, tables and labeled fields. Dialogs move and trap focus, close with Escape, and return focus to the trigger. Tooltips supplement visible labels. Live announcements summarize significant state changes and pending actions; never announce every token.

Default shortcuts: `Ctrl/Cmd+K` command palette, `Ctrl/Cmd+Enter` submit, `Escape` close current overlay, configurable shortcut to focus composer. Use multiline Enter by default to avoid accidental submission. Do not override browser refresh, tab management, or common text-editing shortcuts. All graph details and commands are reachable through the list view.

## 8. Configuration specification

### 8.1 Scopes and activation

Resolve values as **SDK defaults → host defaults → project overrides → explicit task overrides**, then validate and freeze the attempt. This is the proposed host merge policy; ASTROLABE currently consumes one resolved `Config`.

- Scalars replace; lists replace as a unit; maps merge by declared key. A separate Reset override removes an override. Explicit `null` is allowed only for schema-nullable fields; it is not synonymous with inherit.
- `Config.defaults` and top-level fields can overlap. Resolve `mode, executionMode, dClass, ceiling, profileRoles` once and serialize the effective top-level values; avoid two contradictory form controls.
- Save uses an expected configuration revision and reports field-specific errors.
- Show **effective value / inherited from / applies when / supported by** for each setting.
- UI preferences apply immediately. Core, role, routing, provider endpoint and model-call settings apply to a new attempt. Host bind address, state-root migration, and transport infrastructure may require restart.
- Credentials rotate through the credential store. Rotation changes auth material, not provider identity or the frozen model policy. Expose revoked/expired credentials as failures; do not switch identities silently.
- Task budget or authority amendments require dedicated validated core operations. They are not general mutable settings.

Each settings descriptor contains `key, type, label, group, unit, default, enum/range, secret, nullable, scope, activation, sourceSymbol, availability, unavailableReason`. Validate using core `Config.violations()` and SDK builders; frontend constraints are only early feedback. A schema coverage test must account for every serializable public field of `Config, Defaults, Flags, ShapePolicy, ProfileRoles, Role, Profile` and their supported nested value types.

### 8.2 Main settings pages

| Page | Fields and behavior | Source / activation |
|---|---|---|
| Appearance | System/dark/light, font size, comfortable/compact density, sidebar width, motion, diff mode, follow-output preference | Host/UI; immediate |
| Notifications | Pending questions, terminal outcomes, failures, desktop notifications after user permission | Host/UI; immediate |
| Connections | Provider preset/custom endpoint, protocol, auth method, credential status/source, permitted headers, diagnostics | AI Gate; new runtime/attempt as applicable |
| Profiles | ID, provider, model, wire API, options, capability evidence, limits, price table/date/currency, latency, calibration outcomes | `Config.profiles` + adapter configuration |
| Routing | Main/helper/escalation profile IDs; tier profile lists and calibration date | `profileRoles, tierTable` |
| Roles | Declared role selection; configuration below; defaults/effective comparison | `Config.roles` |
| Execution | Interactive/autonomous; TrustedLocal/confined availability; Ask/Deny D-class policy; publication ceiling | `mode, executionMode, dClass, ceiling` |
| Project/task | Rules binding, write/protected scope, acceptance commands, exclusions, budget, resume expected | `Config.rulesFile`; contract; `CampaignPolicy` |
| Verification | Quality-gate argv/cwd; checker policy, cadence, reserves; refactor obligations | `qualityGates, Defaults`; contract |
| Context & knowledge | Residency bounds, seed/injection limits, note admission, KB mode, optional retriever | `Defaults, Flags, OptionalLayers` |
| Integrations | MCP mounts, outline index, dense retriever, generated tool registry; adapter health | `OptionalLayers`; host Java SPI implementations |
| Advanced | Full validated values, import/export redacted config, snapshot diff, policy availability | No raw executable code or secret export |
| Storage & diagnostics | State-root location, export/retention policy, logs, runtime/SDK versions, graceful shutdown | Host-managed; migration/restart where required |

Default profile-role IDs are `main="main", helper="helper", escalation=null`. With a populated profile map, referenced IDs must exist; choosing “No helper” explicitly sets nullable helper rather than leaving a dangling default.

### 8.3 Role editor

Expose each current `Role` field:

| Field | Control / constraint |
|---|---|
| `name` | Read-only declared identity; no arbitrary new runtime duties |
| `contextView` | Advanced supported context-part selection; explain required role inputs |
| `noteScope` | Note kinds allowed in role context |
| `skillFilter` | Admitted skill IDs/tags, including `*` where supported |
| `toolMask.allowed` | Operation checklist, only narrowing the default role mask |
| `permission` | Stage ceiling, at or below role default; effective contract ceiling shown beside it |
| `tierPrior` | Supported tier; display routing floors and effective selection separately |
| `duties` | Versioned policy text; protected operational duties cannot be removed by UI presets |
| `askBack` | Boolean subject to role/core validation |
| `packetKind` | Read-only; override cannot change it |
| `personaLines` | Zero to three concise lines; inline validation |
| `policyTextVersion` | Host-generated version on saved text changes; included in snapshot |
| `deniedNoteKinds` | May retain/add restrictions; cannot remove default denied kinds |

Advanced fields are exposed only when core validation and runtime behavior support them. Preserve the role kernel and required role texts. Editing “review” must not give it the proposer's transcript or permission to accept its own implementation. Curator admission remains deterministic ownership; “extractor” does not become a second admission authority. [A06]

### 8.4 Complete current Defaults inventory

Values below are the inspected source defaults, not performance recommendations. Every numeric UI field names its unit. Cross-field validation is required, including reserve sums, profile limits, and shape thresholds. [A19]

| Group | Fields = default |
|---|---|
| Cell bounds | `turnsPerCell=40`; `turnNudgeFraction=0.80`; `campaignCells=12` |
| Context pressure/residency | `alpha=0.65`; `k=8` eviction batch; `m=6` retained rebuild turns; `rMaxTokens=16000`; `anchorMaxTokens=2500`; `immediateStubTokens=800` |
| Tool view budgets | `lookBudgetTokens=1500`; `runBudgetTokens=1200` |
| Register/digest/patch | `registerCapTokens=1200`; `digestCapTokens=150`; `patchCapTokens=400` |
| Fact/note limits | `factLineMaxChars=240`; `noteBodyMaxTokens=120`; `noteSummaryMaxChars=200` |
| Context inputs | `seedsMaxTokens=4000`; `injectionMaxNotes=8`; `injectionMaxTokens=1500`; `focusNotesMaxTokens=300`; `focusZoomMaxTokens=300`; `touchedInAnchor=10` |
| Verification scheduling | `checkerTimeBoxSeconds=20`; `theta=40` risk threshold; `fullSuiteCadence=5`; `flakyIsolatedReruns=1` |
| Reserves | `reserveVerification=0.15`; `reserveRecoveryAndPersist=0.05`; `campaignRecoveryReserve=0.10` |
| Stall/recovery | `stallTurns=3`; `loopIdentical=2`; `repeatedSignatureRepairs=2`; `doomLoopSameCalls=3`; `repairCalls=2`; `attemptsPerIncrement=2` |
| Probe | `probeTurns=15`; `probeTokens=40000`; `probeTier=Medium` |
| Review | `reviewLookMax=10`; `reviewIncrementTokens=30000`; `reviewCampaignTokens=60000`; `reviewTier=High`; `reviewRoutineTier=Medium` |
| Delegation | `writerDepth=1`; `probeDepth=2`; `parallelCells=3` |
| Knowledge | `admissionConfidenceMax=0.6` |
| Commands | `runTimeoutSeconds=120` |
| Default policies | `mode=Interactive`; `executionMode=TrustedLocal`; `dClass=Ask`; `ceiling=Patch`; `profileRoles` as above |
| Shape policy | `shapePolicy.smallMaxFiles=3`; `smallMaxRequirements=1`; `largeMinFiles=11`; `largeMinRequirements=4`; `s3Enabled=false`; `slackFactor=1.5` |

Never equate `alpha` (context pressure) with overall task progress. All reserves remain positive and cell reserves must leave room for work. Integer positivity/nonnegativity and fraction constraints come from `Defaults.violations()`; the host additionally rejects non-finite values.

### 8.5 Optional flags and integration prerequisites

All Boolean flags below default to `false`; `kbInjection` defaults to `Off`. Show enabled, installed, qualified, and active-for-this-attempt as separate facts.

| Flag | Purpose / prerequisite |
|---|---|
| `precompile` | Boundary context preparation; needs its runtime path and evaluation evidence |
| `calibrationPrior` | Prior sizing/recovery information in context |
| `treeSitterIndex` | Supplied `OutlineIndex`, e.g. optional `index-treesitter` module |
| `languageService` | Qualified language-service host adapter; flag alone is insufficient |
| `denseRetrieval` | Supplied `Retriever`; show lexical fallback |
| `generatedTools` | Supplied `ToolRegistry` frozen at boundary |
| `skillsPromotion` | Controlled promotion path with independent evidence |
| `asyncChecker` | Qualified watcher/checker integration |
| `qaCell` | Isolated QA driver/product entry points |
| `l4Gates` | Measurement contract and instrumentation |
| `s3Writers` | Worktrees, ownership, stable interfaces, budget slack, S3 shape policy and qualification |
| `otelExport` | Host telemetry exporter and redaction |
| `worthTestEstimate` | Advisory delegation economics; not dispatch authority |
| `kbInjection` | `Off / Frozen / Live`; does not remove mandatory in-scope contract knowledge |

`OptionalLayers` currently takes `outlines, dense, tools, mounts`. Other flags may have lower-level seams without facade wiring; G09 must determine supported bindings individually. Do not treat every flag as an installed host integration.

### 8.6 Policies, authority, and settings limits

- **Rules file:** canonical project-relative path, approved content digest, provenance, changed-content reapproval. Discovery alone does not authorize repository instructions.
- **Redaction:** `patterns(kind, regex), envAllowlist, maxBytes=262144`, with preview against synthetic examples and validation. Export patterns/policy without captured secrets.
- **Quality gates:** command as argv list plus optional cwd; display executable and arguments clearly. No inferred weakening when a command fails.
- **Campaign budget:** tokens, optional decimal money/currency, `resumeExpected`. Show the public facade's fallback budget calculation if no explicit policy is supplied: main profile context limit × `campaignCells`. Prefer an explicit displayed policy in the UI.
- **Mandatory controls:** `reserve, testIntegrityGuard, deltaPlusAbsolute, floors, lifecycleControls` are read-only enabled. Research arms cannot be enabled through production settings.
- **MCP mounts:** server, tool descriptors and schemas, local approvals, effect overrides, capabilities; show the frozen catalog and changed-descriptor diff. Remote “read only” hints are not authorization. MCP transport is a separate integration from AI Gate.
- **Publication:** ceiling plus concrete requested stage/remote/branch/deployer; reaching a ceiling does not grant every action.
- **State root:** migration requires idle projects, checked resolved paths, backup/restore validation, and backend restart. Never edit a path while a store is open.

Lower-level `RoutingPolicy` supports function tables, configured effort, authorized/available profile sets, pins, quality floor, attempt policies and limits. `EffectPolicyConfig` supports command classification lists, temporary path prefixes, install policy and path-case behavior. These are **not all current top-level Config knobs**. Catalog them as host-managed or unavailable pending G09; expose only bindings actually consumed by the facade. Path-case semantics must follow the host filesystem.

### 8.7 AI Gate settings coverage

| Area | Exposed settings / treatment |
|---|---|
| Provider | ID, display name, preset, base URL, available/default wire API, permitted headers, compatibility settings, default call options, declared models |
| Authentication | Supported method, credential-store namespace, connection status/source, login/logout/revoke; secret fields are write-only |
| Generation | `temperature, topP, topK, maxTokens, stop, seed, reasoning` where model/protocol descriptors support them |
| Tool/output options | `toolChoice, parallelToolCalls, output, strict` are adapter-owned or restricted; cannot override core tool masking, packet or output requirements |
| History/cache | `reasoningHandoff, cacheRetention, sessionId, responseCache`; only qualified adapter mappings enabled; session identity host-generated |
| Deadlines | Connect, stream idle, total; inherited call → provider → runtime. Source defaults 10s / 5min / 10min; local preset defaults can differ |
| Retry | SDK retry limit/backoff parameters and explicit unknown-outcome behavior; separate from core recovery attempts |
| Catalog | Offline mode, background refresh, interval, feeds/live listings, snapshot path, custom model provenance |
| Network | Proxy, HTTP version, trust store/client certificate refs, user-agent suffix; secret material server-side |
| Diagnostics | Redacted request preview, `describe`, connection report, event listener health; raw wire logging disabled by default |
| Per-call metadata | Correlation tags, listeners, cancellation token; host-owned, not editable arbitrary callbacks |
| Expert extension | Provider options via typed schema; payload transforms/transport/SSLContext callbacks require host code, not UI-uploaded scripts |

SDK `FieldDescriptor` supports `TEXT, SECRET, URL, INTEGER, DECIMAL, BOOLEAN, CHOICE, DURATION, JSON` with labels, groups, units, ranges and choices. Reuse it for provider/model forms, supplemented by adapter constraints and host activation metadata. Unsupported fields remain disabled with reasons. “Inherit” differs from explicit false, empty list, or zero. [S04][S05]

### 8.8 Nested profile and host policy fields

The complete inventory also includes these nested values; human-friendly labels must retain their source keys in Advanced details.

| Source type | Fields / binding |
|---|---|
| `Config` storage | `stateRoot`: nullable host filesystem location; null selects the core OS state directory. Host-managed with an idle migration/restart flow |
| `Profile` | `id, provider, model, capabilities, priceTable, config, latency, stratumOutcomes` |
| `Profile.capabilities` | `toolSchemaValidation, parallelToolCalls, streaming, outputLimitTokens, contextLimitTokens, nativeCompaction, continuation, cancellation, hostedExecution, caching, usageFields, schemaDialects` |
| `CacheCapability` | `breakpoints, maxBreakpoints, minimumTokens, writeClasses` |
| `PriceTable` | `date, currency, perMillion`; retain exact decimal rates and dimension IDs |
| `StratumOutcome` | `stratum, trials, accepted`; calibration evidence is imported with provenance, not an unchecked confidence slider |
| `TierTable` | `version, calibrationDate, profiles`; tiers `Low, Medium, High, ExtraHigh`; `Deterministic` never selects a model |
| `RulesBinding` | `path, digest, provenance`; approved bytes and authority are explicit |
| `CampaignPolicy` | `tokens, cost, resumeExpected`; explicit task summary before start |
| `Scope` / `Authorization` | `writePaths, protectedPaths`; `ladderCeiling, dClass, capabilitySet, dClassAllowlist` through structured contract APIs |
| `AutonomousPolicy` | `acceptNonWeakening=false`, optional `reviewer`; neither accepts weakening nor creates an actual reviewer implementation |
| `EffectPolicyConfig` | `privilegeCommands, networkCommands, packageInstallCommands, gitRefMutations, destructiveFileCommands, writingCommands, scriptInterpreters, tmpPrefixes, packageInstallIsDClass, caseInsensitivePaths`; host-managed until explicitly bound |

Capability edits declare configuration; they do not prove a remote endpoint supports it. The profile editor separates catalog claims, administrator declarations, and dated conformance evidence. Unknown capabilities stay unknown and cannot qualify a required feature. Limits must satisfy output ≤ context, and actual admission includes output headroom and the estimator margin.

`Model.parameters()` currently supplies a useful subset of forms (maxTokens, available reasoning levels, temperature, topP, cacheRetention). It is not exhaustive and does not prove every supplied sampling parameter works with every model. Supplement it with adapter-specific availability and typed SDK option descriptors. No unsupported parameter should be accepted and silently discarded.

Advanced SDK retry fields are `maxAttempts=3`, `retryOnStatus={408,409,429,503,529}`, `initialBackoff=500ms`, `backoffMultiplier=2`, `maxBackoff=8s`, `maxRetryAfter=60s` in the inspected defaults. The SDK limits retries after visible streaming and ambiguous post-send failures; customizing statuses must not disable the core unknown-outcome policy. [S14]

## 9. Provider connections and authentication

### 9.1 Separate connection, model, and profile

- A **connection** identifies one configured provider endpoint, protocol family, and credential scope.
- A **model** is a catalog or explicit model entry under that connection, with capability provenance and freshness.
- An **ASTROLABE profile** binds that model to validated harness capabilities, call settings, dated prices, and routing evidence.

Connections with the same vendor can have different accounts/endpoints; use distinct provider IDs. A valid key, a catalog entry, and a qualified coding-agent profile are three different readiness checks.

### 9.2 Connection wizard

1. Choose a shipped SDK preset or a custom compatible endpoint.
2. Enter endpoint-specific fields and select an explicit wire API.
3. Choose a supported auth method using `Auth.methods(providerId)`.
4. Complete authentication through the appropriate interaction below.
5. Run `Llm.test(model)`; show configuration, network, auth, and model-access results, including skipped/unsupported stages. Label it a connection diagnostic, not proof of successful agent execution.
6. Select/create a profile and run offline adapter conformance checks. Any billable live smoke test is a separately labeled user action.

The SDK supplies presets for OpenAI, Anthropic, Google, several compatible gateways, and local servers such as Ollama/LM Studio/vLLM. Populate the UI from the actual installed SDK/preset registry; do not hard-code claims that every endpoint supports every capability. Its Codex subscription preset is an SDK-specific route with distinct qualification and output-limit concerns in the integration analysis. Do not infer other vendor subscription support from OAuth machinery. [S06][I01]

### 9.3 Authentication interactions

| Mode | UI | Backend behavior |
|---|---|---|
| API key | Password field, source label, Save and test | `Auth.save` with typed credential; never echo secret |
| Environment / supplied token | “Provided by host” with status | Host-controlled source; never return environment values |
| Browser OAuth | Open sign-in action, waiting state, Cancel | SDK login + `AuthInteraction`/`RedirectInteraction`; flow bound to initiating user |
| Device code | Verification URL, short code, expiry, copy control | Private interaction channel; SDK owns polling |
| Additional prompt | Text, secret text, or choice from `AuthPrompt` | Typed response only to the waiting login thread |
| Expired / revoked | Reconnect action and specific auth error | No silent fallback to another account/key |

Run blocking login and prompt waits on dedicated workers/virtual threads, never a servlet or WebSocket callback thread. `AuthNotice` goes only to its flow owner. `RedirectInteraction.complete(callbackUri)` is invoked only after validating session ownership; preserve SDK OAuth validation of state and PKCE. A provider that requires a registered loopback callback may not support an arbitrary remote redirect: capability-gate the flow instead of substituting an unregistered callback.

Keep flow IDs, cancellation, expiry, and completion state in the host. After backend restart, unfinished SDK login calls are expired and offered a fresh login; do not claim to restore an in-memory OAuth stack. Logout removes local credentials; Revoke additionally invokes remote revocation when available. Ask whether to stop affected active calls as part of the concrete action.

### 9.4 Credential storage

AI Gate exposes `CredentialStore` with memory/file implementations and scoped views; the existence of a file store is not an encryption guarantee. For the local product, supply an OS-protected or encrypted credential-store adapter with its unlock policy. For remote mode, require a host secret store and user-scoped `Llm.withCredentials`; use `Environment.none()` to avoid cross-user environment-key fallback.

Secrets do not enter URLs, browser local storage, exported settings, transcripts, general WebSocket replay, analytics, error text, or logs. Secret entry uses a private HTTPS/loopback POST; the response returns only status/credential reference. Auth notices and device codes use a private, bounded, non-replayed channel and expire with the flow.

## 10. Backend architecture

### 10.1 Stack and packaging

Use **Angular 22.2.0**, verified as the npm `latest` release on 2026-09-28, and **Java 26 + Spring Boot 4.1.1**, the stable version shown by the inspected Spring documentation. Recheck stable versions when scaffolding, pin all selected versions, and record the date. No prerelease is required. Angular 22 is active; its Node/TypeScript compatibility must follow the selected CLI package and the official version table. Choose a supported Node 24 release at or above the required minimum. [Angular releases](https://angular.dev/reference/releases), [Angular compatibility](https://angular.dev/reference/versions), [Angular package metadata](https://registry.npmjs.org/@angular/core/latest), [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html).

Both inspected libraries target JDK 26, so a Java 21 host cannot simply load them. Keep Kotlin inside ASTROLABE and the adapter where needed; author the Spring backend in Java as requested. Spring Boot's documented Gradle 9.x support fits the current builds; prove dependency/bytecode compatibility in the first implementation slice.

Proposed new application layout:

```text
ASTROLABE-UI/
  backend/                 Java Spring Boot application
  frontend/                Angular application
  contracts/               Versioned OpenAPI + WebSocket JSON schemas
  fixtures/                Safe deterministic UI/protocol fixtures
  desktop/                 Launcher/packaging, introduced in the final phase
```

Keep the third-party SDK as a pinned dependency or explicit Gradle composite during development. Put the provider adapter in an optional module with no reverse dependency from `provider-api` to core. Do not copy either library's source into the UI application.

### 10.2 Host components

| Component | Responsibilities |
|---|---|
| `Projects` | Canonical path registration, root authorization, locks, host metadata |
| `CampaignHost` | Runtime/project ownership, active handles, serial command dispatch, start/reopen/stop |
| `HostAuthority` | JavaAuthority implementation, pending interactions, policy and human resolutions |
| `Projections` | Core read facade → stable, redacted DTOs; candidate validity and action availability |
| `EventBridge` | Fast SDK callback capture, projection refresh, durable UI outbox, delivery |
| `Commands` | Validation, authorization, idempotency, preconditions and durable operation result |
| `Connections` | AI Gate runtimes, catalog/auth flows, diagnostic jobs, credential scopes |
| `Artifacts` | Authorized, bounded content retrieval; diff/log/download shaping |

These are application boundaries, not a request for microservices. Use one JVM and explicit SQL. The host needs its own small SQLite database for metadata, command records, pending interactions, and UI delivery. Core databases/blobs remain canonical for agent state.

Maintain one opened project owner and one active campaign per canonical repository. One runtime per project/config snapshot is a practical starting point because `Config` is fixed at construction; reuse/ref-count AI Gate resources under their documented ownership rules. Different projects may run concurrently subject to a host quota. A second tab shares the same host; it never opens another SDK project lock.

### 10.3 Threading and shutdown

- WebSocket callbacks parse, authenticate, validate, enqueue, and return.
- A bounded queue serializes commands affecting a given work/project. Lifecycle/approval commands must not wait behind expensive diff generation.
- SDK `EventSink` callbacks only copy bounded metadata into the bridge queue. Blocking persistence or network sends in callbacks risks event loss.
- Blocking SDK auth, catalog and stream operations use bounded worker admission; virtual threads do not remove the need for queue limits.
- Serialize outbound sends per WebSocket session; Spring documents this requirement and provides `ConcurrentWebSocketSessionDecorator` as one option. [Spring WebSocket API](https://docs.spring.io/spring-framework/reference/web/websocket/server.html)
- On shutdown: stop admission; request cancellation; await recorded settlement within a configured deadline; mark unresolved operations for reconciliation; close subscriptions/runtimes; then close projects/stores and borrowed resources according to ownership. Do not close a project while its campaign still uses it.

### 10.4 Durable facts and delivery

The host outbox is a **delivery record**, not a second ledger. It stores safe normalized UI events and references. A received runtime notification prompts a read of authoritative core state; it does not itself prove that every referenced artifact is ready.

G03 adds a public atomic read snapshot and a durable core change revision. Individual current `Views` methods do not provide a cross-view transaction to external Java hosts. A host must not construct a supposedly atomic snapshot by independently querying contract, ledger, checks, and budget.

A database transaction is not a filesystem snapshot. Include `observedAt`, the reconciled candidate, and workspace observation status; external changes may occur afterward. Mutating or publishing commands revalidate workspace/version preconditions through core. Background observation refreshes the display without claiming the UI has locked out external editors.

The bridge stores its projection and corresponding outbox event in one host transaction. Core commits and host commits are separate:

1. Read core at revision R.
2. Update host projection and outbox in one transaction.
3. Deliver the committed event.
4. On a bus gap, restart, or periodic reconciliation, compare core revision and rebuild from a new snapshot.

This can restore authoritative state even if transient notifications were missed. Missing live animation/token history is reported as a presentation gap. A host outbox alone cannot recover an event never captured from the core bus. Do not claim exactly-once delivery across the two databases.

### 10.5 Adapter responsibility

Only the adapter consumes `ChatStream`. It fans out safe presentation deltas while independently building the final native response for core. Deltas carry invocation/part IDs and offsets; they are not tool dispatch instructions.

Before the UI marks an assistant message final, link it to the persisted canonical response/journal reference. Replace provisional text with canonical text on finalization or reconnect. Complete tool calls go through core journaling, validation, permissions, and dispatch; partial tool-call JSON never executes.

Cancellation uses a separate terminal reconciliation path. Cancelling an SDK future is not evidence that billing or server computation stopped. Preserve late usage and output for accounting without executing late calls. Keep errors, refusals, truncation, and unknown outcomes distinct. [A20][S03][I01]

## 11. WebSocket protocol

### 11.1 Transport choice

Use a **plain JSON WebSocket** at `/api/v1/ws` with subprotocol `astrolabe.ui.v1`. Spring's raw WebSocket handler and the browser WebSocket API are sufficient. The first version does not need a broker or STOMP; add those only for a demonstrated deployment need.

WebSocket is the primary path for live updates, commands, command results, human interactions, and authentication progress. REST supplies bootstrap/snapshots, paged resources, private secret submissions, and large artifacts.

All frames use a discriminated `type` and negotiated protocol version. IDs and cursors are strings; Java `long` sequence values must not lose precision in JavaScript. Timestamps are UTC ISO 8601. Decimal money uses strings plus currency and completeness.

### 11.2 Session handshake and subscriptions

1. Browser obtains an authenticated same-origin session and bootstrap via REST.
2. Host validates Origin, session and authorization during upgrade.
3. Host sends `hello`: protocol/schema versions, connection ID, server epoch, heartbeat/limits, capabilities.
4. Client subscribes to authorized `project:{id}`, `work:{id}`, or its private `user` stream with the last cursor.
5. Server either replays after that cursor or sends `resync.required`.

Each delivery stream has its own contiguous host cursor, scoped to a stable authorization audience. An outbox row is committed before cursor publication. If filtering would hide rows from one user, use a separate authorized stream or require resync; do not interpret intentionally filtered shared-bus gaps as packet loss.

Example subscribe and domain event:

```json
{
  "v": 1,
  "type": "subscribe",
  "requestId": "req-1",
  "stream": "work:w-123",
  "after": "481"
}
```

```json
{
  "v": 1,
  "type": "event",
  "stream": "work:w-123",
  "seq": "482",
  "eventId": "evt-482",
  "at": "2026-09-28T10:30:00Z",
  "source": "core",
  "name": "check.finished",
  "ids": {
    "projectId": "p-1",
    "workId": "w-123",
    "attemptId": "a1",
    "candidateId": "c42",
    "contextId": "ctx-8",
    "workspaceId": "ws-main",
    "generation": 0
  },
  "contractRevision": 3,
  "projectionRevision": "77",
  "payload": {
    "checkId": "CHK-cache",
    "receiptRef": "receipt-17",
    "outcome": "passed",
    "currentValidity": "current"
  }
}
```

IDs in examples are readable stand-ins; real candidate IDs must use the core's exact typed serialization. `sourceSeq`, if retained for diagnostics, is scoped by core bus instance/epoch and is not `seq`.

### 11.3 Commands and results

```json
{
  "v": 1,
  "type": "command",
  "commandId": "2fd89b14-0764-4e12-94d7-0d35b272e0cd",
  "name": "interaction.answer",
  "target": { "projectId": "p-1", "workId": "w-123", "attemptId": "a1" },
  "expected": { "contractRevision": 3, "interactionRevision": 1 },
  "payload": {
    "interactionId": "q-8",
    "text": "Anonymous users retain the previous behavior.",
    "chosenOption": null,
    "changesRequirements": false
  }
}
```

Response: `command.result` with `commandId, status, operationId, result?, error?`. Status is `accepted | running | succeeded | rejected | unknown`. “Accepted” means durably queued, not executed or completed. The durable terminal result is available after reconnect and via REST.

| Command | Essential payload/preconditions | Runtime path |
|---|---|---|
| `campaign.start` | Draft ID/revision, resolved config revision, explicit policy, project idle | Existing campaign + G02/G07/G08 |
| `campaign.cancel` | Work/attempt, reason | Handle.cancel; settlement observed |
| `campaign.amend` | Full proposed user instruction, reason, expected contract revision | G07 revision-aware amendment |
| `campaign.resume` | Work/attempt, expected state revision, reconciliation acknowledgment if needed | G02 core reopen |
| `campaign.newAttempt` | Work, source attempt, approved config/budget revision | G02/G07; accumulated accounting |
| `interaction.answer` | Question ID/revision, text/option, requirement-change flag | JavaAuthority ask future |
| `interaction.decide` | Request ID/revision, approved, reason | JavaAuthority approve future |
| `interaction.resolveAmendment` | Proposal/revision, accepted/rejected, reason | JavaAuthority resolve future |
| `interaction.review` | Review request, verdict, evidence refs, candidate and revision | JavaAuthority review future |
| `check.request` | Check IDs, candidate, contract revision | G08 scheduler owner |
| `process.cancel` | Handle, workspace, expected process version | G08 runner owner |
| `workspace.revert` | Preview ID, current candidate, target edit/snapshot | G08 guarded edit owner |
| `publication.request` | Candidate-bound preview, requested stage and exact targets | G08 controller/publisher |
| `knowledge.propose` | Kind, content, scope, anchors, evidence refs | G08 curator queue |
| `settings.save` | Scope, expected config revision, typed changes | Host validation/freeze policy |
| `session.update` | Work ID, expected metadata revision, title and/or archived | Host metadata only; never deletes core evidence |
| `draft.save` | Draft ID, expected revision, structured request/controls | Host draft validation; no agent dispatch |
| `connection.update` | Connection ID/revision, secret-free definition | Rebuild future runtime configuration; active attempt remains frozen |
| `connection.logout / connection.revoke` | Connection, expected revision, affected-call disposition | SDK auth operations; report local removal versus remote revocation |
| `auth.start / auth.cancel` | Connection, method, flow ID as applicable | SDK login/cancel on private stream |

Unknown commands are rejected. Capability-gated commands return `UNSUPPORTED_CAPABILITY` with prerequisites, never a placeholder success.

### 11.4 Idempotency and concurrency

- Generate one `commandId` per user intent and reuse it for retries of that intent.
- Atomically claim `(principalId, commandId)` with a unique constraint and canonical payload hash. Same key/different payload returns `IDEMPOTENCY_CONFLICT`.
- Duplicate pending command returns its existing operation state; completed duplicate returns the same result.
- Commands are ordered per project/work and validated against current revision immediately before mutation. Two tabs resolving the same interaction cannot both win.
- Persist intent before a consequential effect. Core-owned mutation and its command receipt must share the appropriate core transaction/intent journal through G07. A host SQL transaction cannot make an external Git operation or model call atomic.
- If a crash leaves execution uncertain, reconcile against core command/intent records. Until resolved, return `unknown` and forbid automatic repeat.
- Retain command identity tombstones with campaign history. If history is purged, old keys are explicitly expired and rejected, not silently reused.
- Cancelling is idempotent; cancelling one HTTP/WebSocket request must not accidentally cancel the campaign await future.

### 11.5 Reconnect and resynchronization

1. Client detects heartbeat timeout or socket loss; marks live data stale and freezes graph animation.
2. Retry with jittered exponential backoff, initially 0.5s and capped at 15s; stop on explicit authentication failure.
3. Reconnect and replay from the last **applied** durable cursor. Deduplicate by stream/sequence/event ID.
4. If cursor expired, epoch changed incompatibly, or projection is invalid: obtain a complete snapshot with `stream, cursor, projectionRevision`.
5. Snapshot and its cursor come from one host transaction; events after its cursor are buffered/replayed. Replace state atomically, then apply newer events.
6. Read command statuses by command ID for unconfirmed actions. Do not replay unknown mutations blindly.
7. Restore selected IDs, expanded inspectors, scroll anchors, and drafts where those IDs still exist.

Server snapshot refresh is reconciled with the core revision as described in section 10.4. The browser must not implement receipt validity itself to “catch up.”

### 11.6 Event mapping

| Existing core events | UI projection |
|---|---|
| `campaign.opened / shape_selected / increment_selected / increment_closed / finished` | Header, graph, session status, final receipt |
| `contract.amended / amendment_proposed / amendment_resolved` | Contract timeline, composer notices, pending proposal |
| `cell.started / turn_started / model_requested / model_responded / ended` | Active role, turn, invocation, packets |
| `cell.tool_called / tool_resulted` | Tool groups and result artifact references |
| `cell.gate_fired / register_patched / workset_changed / rebuilt` | High-level progress, context inspector, coherence notices |
| `edit.applied / rejected / reverted / transformed` | Changes and candidate refresh |
| `run.started / output / finished / reconciled` | Process list and cursor-based output retrieval |
| `check.scheduled / started / finished / stale` | Verification table and validity refresh |
| `ask.question / answered; blocked; warning` | Attention state; authority callback supplies full pending item |
| `budget.reserved / reconciled / exhausted` | Consumption/reserve display |
| `routing.decided` | Function/tier/profile explanation |
| `delegation.dispatched / collected / rejected` | Child cells, returned packets, integration state |
| `recovery.classified / repaired / escalated` | Recovery branch and failure explanation |
| `kb.proposed / admitted / invalidated` | KB status and freshness |
| `span.started / ended` | Durations/phase diagnostics; avoid double-counting nested cost |

Proposed host events include `projection.changed, interaction.pending/resolved/superseded, command.result, connection.status, auth.notice, settings.saved, resync.required`. Proposed adapter presentation events include `model.text.delta / model.text.final / model.text.interrupted`. These names are the new UI protocol, not claims about existing `AgentEvent` variants.

### 11.7 Flow control

Initial configurable limits: 64KiB command/event frames, 256KiB prompt via bounded REST draft upload if needed, 100 subscriptions/socket, 1MiB or 1000 queued durable delivery messages/socket, heartbeat every 20s with 60s timeout. Validate exact limits in load tests.

Coalesce presentation text updates at roughly 30–50ms; never coalesce distinct approvals, terminal results, or receipt transitions. Token deltas use a separate ephemeral sequence/part offset, so dropping them does not create a false durable-stream gap. On overflow, mark the partial message incomplete and recover the canonical artifact. Slow durable consumers get `resync.required` and a clean reconnect.

Logs and diffs use artifact cursors/chunks rather than unlimited WebSocket bodies. A UI client cannot backpressure the coding loop indefinitely. Unknown additive event variants trigger a safe refresh/compatibility notice; an unsupported protocol major requires upgrade.

## 12. REST resources and DTOs

### 12.1 Common contract

All routes are under `/api/v1` and require the authenticated host session except the minimal health/liveness route. Return JSON DTOs, not Kotlin serialized internals or database rows.

List envelope: `{items: T[], nextCursor: string|null}`, default 50, maximum 200. Cursors bind to sort/filter and stable ID ordering. For mutable lists, include snapshot revision or explicit best-effort pagination semantics.

Errors follow one shape:

```json
{
  "code": "REVISION_CONFLICT",
  "message": "This approval belongs to contract revision 3; revision 4 is current.",
  "requestId": "req-17",
  "retryable": false,
  "fieldErrors": [],
  "currentRevision": 4,
  "detailsRef": null
}
```

Use 400 malformed input; 401 expired session; 403 forbidden; 404 absent/inaccessible resource; 409 revision/project-lock/idempotency conflict; 410 expired cursor/flow; 413 excessive payload; 422 valid JSON with invalid settings/capability request; 429 rate limit; 503 unavailable runtime. Match the same `code` in WebSocket errors. Include no secret, stack trace, or unredacted command output.

### 12.2 Resource inventory

| Method/path | Input | Result / purpose |
|---|---|---|
| `GET /bootstrap` | Session | `BootstrapDto`: host/platform/runtime versions, capabilities, settings schema revision, session/CSRF data |
| `GET /projects` | Cursor/filter | `Page<ProjectDto>` |
| `POST /projects` | `{path, displayName?}` + idempotency key | Registered `ProjectDto` after canonicalization/authorization |
| `GET /projects/{p}` | Project ID | Lock, branch, dirty summary, capabilities |
| `GET /projects/{p}/campaigns` | Cursor/status/query | `Page<CampaignSummaryDto>` |
| `POST /projects/{p}/drafts` | `CampaignDraftInput` + idempotency key | Draft ID/revision, resolved preview, validation issues |
| `GET /campaigns/{w}/snapshot` | Optional attempt; authorized project binding | `CampaignSnapshotDto` with cursor/revision |
| `GET /campaigns/{w}/timeline` | Attempt/cursor/filter | `Page<TimelineItemDto>` |
| `GET /campaigns/{w}/contract` | Optional historical revision | `ContractDto` and amendment history |
| `GET /campaigns/{w}/checks` | Candidate/filter/cursor | `Page<CheckDto>` with computed validity |
| `GET /campaigns/{w}/changes` | Candidate/workspace/cursor | `Page<ChangedFileDto>` plus baseline |
| `GET /campaigns/{w}/processes` | Cursor/status | `Page<ProcessDto>` |
| `GET /campaigns/{w}/usage` | Attempt/group filters | `UsageDto` with completeness and provenance |
| `GET /campaigns/{w}/cells/{c}` | Context/generation | `CellDto`, manifest, packet and context refs |
| `GET /campaigns/{w}/interactions` | Pending/history cursor | `Page<InteractionDto>` scoped to user rights |
| `GET /projects/{p}/knowledge` | Query/kind/status/cursor | `Page<KnowledgeDto>` |
| `GET /artifacts/{id}` | Offset/limit or bounded byte range | Authorized redacted content/metadata; no arbitrary filesystem path |
| `POST /campaigns/{w}/previews` | `{kind, target, expectedCandidate}`; kind is `revert` or `publication` | Immutable preview ref, affected scope, expiry |
| `GET /settings/schema` | Scope/runtime version | Field and availability descriptors |
| `GET /settings` | Scope/project | Effective values, overrides, revision, provenance |
| `GET /connections` | Cursor | `Page<ConnectionDto>`, safe auth state |
| `POST /connections` | Secret-free provider definition + key | Connection ID/revision and validation |
| `GET /connections/{id}/models` | Query/cursor | `Page<ModelDto>` with descriptor/provenance |
| `POST /connections/{id}/credentials` | Typed secret input + private request key | Auth status only; never credential body |
| `POST /connections/{id}/diagnostics` | Model ref + key | Operation ID; results stream + REST lookup |
| `POST /auth/flows/{id}/answers` | Prompt ID and private response | Accepted/expired status; redacted audit |
| `GET /auth/callback/{flowId}` | Provider redirect query | Validated session-bound SDK callback, then safe app redirect |
| `GET /operations/{commandId}` | Owner-bound command ID | Durable operation status/result |
| `POST /commands` | Same typed command envelope + key | Optional HTTP fallback using the identical dispatcher |

Every state-changing POST uses the common command/idempotency contract. Credential/auth POSTs retain only safe result metadata and a protected keyed request digest, never a replayable plaintext request body. OAuth callback state is single-use. No generic “execute shell” REST endpoint is provided.

### 12.3 Core DTO definitions

These are minimum required fields; publish machine-readable schemas in the first implementation phase.

| DTO | Fields |
|---|---|
| `ProjectDto` | id, displayName, canonicalRoot display, hostId, branch, dirtySummary, lockState, capabilities |
| `CampaignDraftInput` | requestText, contextRefs, constraints, exclusions, scope, acceptance proposals, configRevision, policy, publication intent |
| `CampaignSummaryDto` | project/work IDs, title, currentAttempt, phase/outcome, accepted/required counts, attentionCount, updatedAt |
| `CampaignSnapshotDto` | stream/cursor/projectionRevision/coreRevision, IDs, contract, graph, cells, checks summary, budget, processes, pending items, allowedActions, capture gaps |
| `ContractDto` | original requests, current objective, revision, requirements, constraints/exclusions, acceptance and obligation versions, scope, authority, amendments |
| `TimelineItemDto` | stable ID, type, IDs, timestamp, source, summary, canonical artifact refs, partial/completeness flags |
| `CellDto` | context/generation/workspace, role, increment, profile, phase/status, turn/bounds, input/output refs, parent/child refs |
| `CheckDto` | check ID, acceptance IDs, receipt ID, recorded outcome, current validity/reason, stamps/environment, parsed counts, closure/reuse refs, capture limits |
| `ChangedFileDto` | workspace/path, baseline/current versions, origin, added/deleted counts or unknown, diff artifact, candidate |
| `ProcessDto` | action/handle, IDs, redacted argv/cwd, effect class, status, output cursor, deadline, exit, completeness, allowedActions |
| `InteractionDto` | ID/type/revision, requester, IDs, contract/candidate preconditions, typed question/action/evidence payload, expiry/status, allowed responses |
| `UsageDto` | by-invocation billable dimensions, unknown dimensions, price date/currency, decimal known subtotal, reservations, total completeness, elapsed/tool durations |
| `KnowledgeDto` | note ID/version/kind, scope/status/freshness, summary, anchors, provenance, evidence, supersession and module refs |
| `ConnectionDto` | ID/preset/endpoint, protocol, credential status/source label, available methods, last diagnostic, qualification |
| `ModelDto` | provider/model/API, limits, supported/unsupported/unknown capabilities, reasoning levels, field descriptors, catalog source/date |

Unknown enum values must be handled without crashing older clients. However, unknown authority or completion values fail closed: render “Unsupported state” and refresh capabilities rather than enabling an action.

## 13. Angular implementation

### 13.1 Structure

Use standalone components and route-level lazy loading. Organize by product responsibility:

```text
app/
  shell/             navigation, theme, command palette, connection banner
  projects/          project chooser, project activity
  campaign/          workspace, conversation, composer, contract
  overview/          execution graph, requirement graph, activity list
  changes/           diff, file list, revert preview
  checks/            receipt table, evidence inspector
  knowledge/         note search, provenance, proposal workflow
  settings/          connections, profiles, roles, policies, descriptors
  auth/              private authentication flow
  data/              generated DTOs, REST client, socket, projection reducers
  shared/            small accessible controls, status, code/log rendering
```

Use Angular signals for local/derived UI state and a small injected campaign store. Use RxJS for socket lifecycle, batching, retries and cancellation. Prefer typed reactive forms for configuration editors and dynamic descriptors. These are implementation choices supported by Angular's [signals](https://angular.dev/guide/signals) and [reactive forms](https://angular.dev/guide/forms/reactive-forms) APIs.

One normalized store owns each active snapshot. Components cannot each create independent WebSocket connections or derive contradictory completion state. Keep draft/layout state separate from authoritative campaign state.

### 13.2 Rendering and graph

- Track lists by stable IDs; update affected records only.
- Lazy-load diff/highlighting and graph detail code.
- Render a bounded graph with HTML/SVG and predictable lanes first; measure before adding a graph-layout dependency.
- Cap visible history, group completed cells, and use paged/virtualized lists for logs and timelines.
- Preserve accessibility tree semantics; SVG graph nodes need the equivalent ordered list and keyboard selection.
- Sanitize Markdown and render tool output as text. No script-capable HTML from the repository, model or provider.
- Keep application-wide shared controls small. Avoid building a generic schema designer or workflow editor.

### 13.3 Offline and draft behavior

Persist drafts by host/project/work/mode, with a visible retention preference. Default to memory/session storage for sensitive request text; opt-in durable local drafts must support Clear drafts. Never persist credentials or raw auth notices there.

Read-only cached presentation can remain visible offline with a timestamp. Mutating actions are disabled while disconnected except saving a local draft. If an action was already submitted, show its pending/unknown operation status until the host confirms it; do not offer an apparently fresh duplicate.

### 13.4 Performance targets

These are proposed acceptance targets, not measured results:

- At 1280×720, composer and primary campaign controls visible without page scrolling.
- Selection, tab change, and local form feedback within 100ms at p95 on the documented reference machine.
- Under a fixture producing 100 small events/s for 60s, main interactions remain responsive and projection converges to the final snapshot.
- Render fewer than 200 timeline/log rows at once; load older content on demand.
- No unbounded memory growth during a 30-minute stream fixture.
- Reconnect restores a 10k-event history from snapshot/replay without rendering every historical delta.

Measure with fixtures, not billable provider load. Revisit numerical targets only through a documented requirement change.

## 14. Security, durability, and operational behavior

### 14.1 Local and remote trust boundaries

Local host binds to loopback by default and validates Host/Origin to prevent unrelated websites from driving the agent. First launch uses a short-lived pairing secret delivered by the launcher, then exchanges it for an HttpOnly session; do not leave bearer credentials in URLs. State-changing REST requests require CSRF protection. WebSocket upgrade and commands require the same authenticated principal and exact permitted origin.

Remote deployment requires TLS, an established identity mechanism, project-level authorization, protected credential stores, and explicit repository roots. It is a separate capability, not enabled by changing bind address to `0.0.0.0`.

Provider endpoints, catalog URLs, and MCP servers can cause server-side network access. Validate schemes, destinations, redirect behavior, and configured allowlists; allow loopback local-model endpoints only where the host policy explicitly supports them. Reject credential-bearing custom headers. Secret redaction precedes persistence/export.

### 14.2 Files, tools, and authority

All file reads, diffs, and mutation requests resolve through canonical project/workspace identities and core path policies. Check traversal, symlinks/junctions, case aliases, and user baseline protection on Windows and Linux. Artifact IDs are not filesystem paths.

Keep trusted rules separate from repository/model/tool text. A knowledge note or streamed assistant sentence cannot grant a permission. Approval binding includes user, pending request, work, attempt, revision, and where relevant candidate, target and expiry.

Stopping a campaign must prevent new tool dispatch and publication while settling prior effects. Error dialogs must not offer an unsafe “Retry anyway” for an unknown external effect.

### 14.3 Recovery and multi-tab behavior

The host serializes competing mutations. A tab is a viewer, not the owner of a campaign. Closing a tab leaves the host campaign running; the desktop launcher explicitly states whether closing its window leaves the host running and provides Quit and stop tasks.

On restart, discover projects and command intents, reopen only under authorized policy, reconcile core state, reconstitute pending items from supported core recovery paths, and invalidate expired UI/auth requests. Do not complete an old JavaAuthority future from a reconstructed row; that future no longer exists. Rebind via the recovered runtime request or present a supported blocked state.

### 14.4 Retention, exports, and diagnostics

Default host durable event replay retention: 7 days, configurable; snapshot fallback is always required. Core evidence retention is governed separately and cannot be shortened by clearing the UI event cache. Archive hides sessions; it does not delete their evidence or workspaces.

Exports contain redacted contract, config fingerprint, IDs, requirement/check summaries, provenance, and chosen artifacts. Exclude credentials and opaque native provider state by default. Exporting more sensitive artifacts requires an explicit scoped action.

Expose host queue depth, dropped event counts, resync count, command age, pending interactions, active handles, transport status, and projection revision lag. Log correlation IDs and error categories. Avoid duplicate accounting through SDK and core listeners.

### 14.5 Desktop delivery

First ship the browser-served application and a local launcher with a packaged Java 26 runtime. Validate that packaging includes SQLite and any FFM/native requirements on Windows and Linux. The launcher handles a single backend instance, secure pairing, project-open requests, crash logs, and graceful quit.

A dedicated embedded webview shell is a later packaging choice after proving file picker, OAuth external-browser callbacks, updates, accessibility, and process lifecycle. It must load the same Angular bundle and call the same backend. Do not introduce Electron/Tauri or another shell into the first functional slice solely for window chrome.

## 15. Implementation plan

### 15.1 Implementation rules

This section is the authoritative plan. [tasks/plan.md](tasks/plan.md) is its execution index; [tasks/todo.md](tasks/todo.md) tracks implementation tasks, initially unchecked. Completing this specification does not mark application implementation tasks complete.

Implement small vertical slices with a visible outcome, deterministic fixture, and focused verification. Keep proposed APIs marked until they exist. If the external transport integration changes before UI work starts, re-inspect the actual adapter and replace the corresponding assumptions; do not implement a second adapter.

The module/file names below are proposed locations. Existing source conventions continue to govern changes within either library. New dependencies are pinned and justified in the application build. Do not mutate unrelated library code or their completed historical task records as part of creating the UI.

### 15.2 Dependencies

```mermaid
flowchart TD
    T01[T01 Compatibility proof] --> T02[T02 DTO and protocol contracts]
    T02 --> T03[T03 Shell and fixture store]
    T03 --> T04[T04 Workspace prototype]
    T04 --> T05[T05 Overview and evidence prototype]
    T02 --> T06[T06 Local host session and project ownership]
    T06 --> T07[T07 Core read projections]
    T07 --> T08[T08 Snapshot and replay bridge]
    T06 --> T09[T09 Idempotent lifecycle facade]
    T06 --> T10[T10 Provider connection and auth]
    T10 --> T11[T11 Qualified transport integration]
    T09 --> T12[T12 Connected campaign]
    T11 --> T12
    T08 --> T12
    T05 --> T12
    T12 --> T13[T13 Human interactions]
    T13 --> T14[T14 Amendments and configuration]
    T12 --> T15[T15 Streaming and process output]
    T12 --> T16[T16 Changes and checks]
    T14 --> T17[T17 Recovery and new attempts]
    T15 --> T17
    T16 --> T17
    T14 --> T18[T18 Advanced roles and integrations]
    T17 --> T19[T19 Knowledge and economics]
    T18 --> T20[T20 S3 and publication]
    T16 --> T20
    T19 --> T21[T21 Reliability and accessibility gate]
    T20 --> T21
    T21 --> T22[T22 Desktop packaging]
```

### 15.3 Phase A — contracts and reviewable prototype

#### T01 — Prove version and library compatibility

**Depends:** none. **Scope:** M; backend build, frontend package manifest, one Java consumer smoke test.

- Pin supported Angular/CLI/Node/TypeScript and Spring/Java/Gradle versions; record resolution date.
- Compile a Java consumer of the actual ASTROLABE facade and AI Gate dependency without provider calls.
- Identify the integrated adapter artifact if already available; otherwise preserve G01 as explicit work.

**Verify:** Java compile/classpath test and Angular production build. No credentials or network-dependent tests.

#### T02 — Publish schemas and fixtures

**Depends:** T01. **Scope:** M; `contracts/openapi.yaml`, WebSocket schemas, DTO generator configuration, fixture validator.

- Define every active command/resource in sections 11–12, including failure and unknown states.
- Generate TypeScript/Java transport types or validate handwritten records against one schema source.
- Encode P01–P12 fixtures; schemas reject unscoped commands and inconsistent revisions.

**Verify:** schema validation, JSON round trips, unknown-event compatibility tests; exact decimal and 64-bit cursor preservation.

#### T03 — Implement the responsive shell

**Depends:** T02. **Scope:** M; frontend shell/routes/theme and project/session fixture store.

- Project/session navigation, route reload, search, dark/light theme and collapsed sidebar work.
- No-project, no-model, busy-project and disconnected states have concrete actions.
- At 1280×720 the composer region and navigation remain usable.

**Verify:** production build and keyboard/layout browser checks on desktop/narrow layouts.

#### T04 — Implement conversation and attention prototype

**Depends:** T03. **Scope:** M; conversation, composer, pending-action components.

- Render grouped tools, edits, checks, boundaries and partial output with stable IDs.
- Composer modes preserve separate drafts; simulated answer/deny/amend commands update fixture state.
- Superseded approval and cancellation settlement are visible.

**Verify:** P01, P03, P06, P10; reload/draft and scroll-anchor checks.

#### T05 — Implement Overview and evidence prototype

**Depends:** T04. **Scope:** M; Overview, inspector, fixture check/diff projections.

- S0/S2/S3 fixtures show distinct actual execution shapes with a list alternative.
- Select node → evidence → diff/check works through stable references.
- Stale evidence, unknown usage and reduced motion are represented correctly.

**Verify:** P02, P04, P07, P09, P12; visual review at 1440×900, 1280×720, and 390×844.

**Checkpoint A:** the prototype is fully navigable and labeled Demo data. Review the core workflow before expanding visual detail. A demo cannot be advertised as an integrated agent.

### 15.4 Phase B — a real observable campaign

#### T06 — Establish local host session and project ownership

**Depends:** T02. **Scope:** M; backend application/bootstrap, Projects, host persistence, session filter.

- Loopback session/pairing and Origin/CSRF checks work; unauthorized sockets fail.
- Canonical repository registration deduplicates path aliases and reports the existing project lock.
- A host owns and releases Project resources in the correct order.

**Verify:** local integration tests for paths/locks/session; Windows and Linux project lifecycle tests.

#### T07 — Add supported core read projections

**Depends:** T06. **Scope:** core/read-API work, split into contract/ledger snapshot then artifact/process/KB projections.

- Public atomic snapshot carries a durable revision and all necessary identity qualifiers.
- Current receipt validity is returned by its owner; StoredRow bodies are mapped to typed DTOs.
- Artifact reads are bounded, authorized, and redacted; missing capture is explicit.

**Verify:** concurrent amendment/check snapshot consistency, per-attempt filtering, stale receipt and cross-project artifact denial tests. Compile Java consumers after public API changes.

#### T08 — Implement replay and reconnect

**Depends:** T07. **Scope:** M; EventBridge, host outbox, socket endpoint, Angular socket/store.

- Subscribe, replay, deduplication, snapshot replacement and cursor expiry work.
- Event-bus gaps and host restart reconcile from authoritative state.
- Slow clients cannot stall campaigns or lose an approval silently.

**Verify:** disconnect between snapshot and subscribe; dropped callback; outbox overflow; core commit before host crash; two-tab audience isolation.

#### T09 — Add idempotent lifecycle commands

**Depends:** T06. **Scope:** core facade and host dispatcher, split into start/cancel then dedup/preconditions.

- Start uses stable command/work identity; one active campaign per project.
- Core mutation receipts and host command results reconcile after crash.
- Cancel settles to the actual outcome; duplicate start cannot create duplicate work.

**Verify:** retry same key/body; same key/different body; concurrent start; crash before and after dispatch; repeated cancel during settlement.

#### T10 — Implement provider connections and auth

**Depends:** T06. **Scope:** M per slice; Connections, private auth flow, credential adapter, Angular forms.

- API-key/environment status, supported OAuth/device-code flows and cancellation use AI Gate APIs.
- Credential source/status and staged diagnostics are accurate; secrets remain private.
- Model forms use FieldDescriptor and represent unknown capabilities.

**Verify:** SDK fake provider and local OAuth issuer; prompt expiry; wrong-session callback; revoked credential; redacted export and log tests.

#### T11 — Qualify the ASTROLABE transport adapter

**Depends:** T10; external G01 integration. **Scope:** adapter/core task, subdivided according to [I01].

- Request/tool/history translation, context admission, caching policy and typed output preserve core semantics.
- Cancellation and errors preserve terminal usage and reject execution of partial/late calls.
- One configured provider/model/API profile passes offline conformance before broadening provider support.

**Verify:** provider-api adapter fixtures for pairing, truncation, unknown usage, unknown history, unsupported caching, cancellation and explicit profile routing. Opt-in live smoke is reported separately.

#### T12 — Connect the first campaign end to end

**Depends:** T05, T08, T09, T11. **Scope:** M; CampaignHost, main frontend store, start flow.

- Start request → contract → cell → edit/check → finish is driven by real backend state.
- One tab can reconnect or a second tab attach without restarting work.
- Completion comes from core outcome/receipt; model text cannot manufacture it.

**Verify:** deterministic fake-provider repository fixture over real HTTP/WebSocket; one intentionally failing acceptance run and one successful run.

**Checkpoint B:** real offline end-to-end campaign, consistent replay, current candidate-bound evidence, and honest failure/cancellation. Live provider integration remains separately qualified.

### 15.5 Phase C — daily use and recovery

#### T13 — Complete human interaction lifecycle

**Depends:** T12. **Scope:** M; HostAuthority, pending-action persistence, attention UI.

- Question, D-class decision, amendment resolution and human review have typed forms.
- Resolve exactly one current request; stale or cross-user replies fail.
- Disconnect/restart/expiry has an explicit blocked or rebound path.

**Verify:** P03/P10 plus delayed reply after cancellation, simultaneous answers from two tabs, restart while awaiting authority.

#### T14 — Bind amendments and all supported settings

**Depends:** T13. **Scope:** separate M slices for contract controls, settings schema, roles/profiles.

- Structured start/amendment data uses core authority APIs, not prompt-only enforcement.
- Every current configuration field appears in the catalog as editable, read-only, host-managed or unavailable with reason.
- Precedence, null/inherit, validation and frozen-attempt comparison work.

**Verify:** settings coverage against source types; round-trip defaults; invalid reserves/missing profiles; role mask widening rejected; active attempt fingerprint unchanged after Save.

#### T15 — Add streaming and process inspection

**Depends:** T12. **Scope:** M; adapter delta bridge, transcript finalization, process/log endpoint and viewer.

- One SDK stream consumer; partial text and final artifacts reconcile.
- Process output follows cursors with truncation/redaction labels.
- Handle cancellation uses the runner and settles honestly.

**Verify:** interleaved parts, dropped deltas, overflow, partial JSON, cancellation during stream, lost process, bounded log retrieval.

#### T16 — Complete changes and verification actions

**Depends:** T12. **Scope:** M slices; diff/check UI plus G08 operation facade.

- Pre-existing edits, agent changes and external changes retain provenance.
- Check request and guarded revert validate candidate/version and preserve user work.
- Baseline, zero-test, stale, closure-reuse and refactor-red cases display correctly.

**Verify:** dirty-tree/revert fixture, external edit between preview/apply, unrelated edit reuse, related edit invalidation, no-tests case.

#### T17 — Implement recovery and authorized new attempts

**Depends:** T14–T16. **Scope:** core facade/recovery plus UI history, split by outcome.

- Eligible waits resume existing work after reconciliation.
- Cancelled/failed/exhausted cases offer only supported new-attempt/follow-up actions.
- Configuration changes, prior cost and unknown effects remain visible across attempts.

**Verify:** host restart during run and finalization, orphaned process, unknown effect, new profile boundary, no budget reset or duplicated command.

**Checkpoint C:** everyday workflow is complete: configure → start → inspect → intervene → verify → recover. Required capabilities without a working owner API block release of that action.

### 15.6 Phase D — advanced architecture and delivery

#### T18 — Wire optional host integrations

**Depends:** T14. **Scope:** one M slice per integration.

- Bind only actual Java SPI implementations and show availability/health/qualification.
- Freeze MCP/generated-tool catalogs and role policies at attempt boundaries.
- S3/QA/LSP/telemetry flags cannot claim functionality when their host prerequisite is absent.

**Verify:** missing adapter refusal, lexical/index fallback, changed MCP schema reapproval, mask/ceiling enforcement. Qualify each added integration independently.

#### T19 — Complete knowledge and economics

**Depends:** T17. **Scope:** separate M slices for knowledge and usage projections.

- Actual KB records and curator proposal/admission lifecycle are accessible.
- Context provenance and stale/unseen distinctions remain intact.
- Usage includes all children/attempts without double-counting or treating missing dimensions as zero.

**Verify:** stale-note exclusion, unauthorized admission refusal, mixed known/unknown billing dimensions, currency separation, zero accepted-task denominator.

#### T20 — Complete S3 and staged publication

**Depends:** T16, T18. **Scope:** separate M slices for S3 visualization and post-run publication.

- Writer lanes, ownership, packet staleness, queue and combined checks match core execution.
- Candidate-bound publication previews call the controller/publisher in stage order.
- Stop/revision/candidate changes fence publication; missing deployer is explicit.

**Verify:** disjoint writers, changed read dependency, integration failure, dirty user branch protection, stage-specific denial, cancellation before push. Use fake/local remotes only.

#### T21 — Pass product reliability and accessibility gate

**Depends:** T19, T20. **Scope:** M per failed concern; browser and backend integration tests.

- All section 16 acceptance scenarios pass in real browser tests against the fake-provider host.
- Dark/light, keyboard, reduced motion, screen-reader labeling and narrow layout pass review.
- Backpressure, prolonged sessions, multiple tabs, secret redaction and recovery meet their contracts.

**Verify:** focused suites plus production builds; browser console/network inspection; documented reference-machine performance run.

#### T22 — Package desktop delivery

**Depends:** T21. **Scope:** M per platform; launcher, runtime packaging and smoke tests.

- Signed/versioned package strategy and local runtime assets documented; single-instance lifecycle works.
- Native project opening and external auth browser return to the same session.
- Quit settles active tasks or records an explicit recoverable interruption.

**Verify:** clean-machine install/start/update/quit smoke on Windows and Linux, including offline UI load and project-path spaces/non-ASCII characters.

**Final checkpoint:** all claimed capabilities are implemented and tested; unsupported optional integrations have clear explanations; no mocked success states remain in connected mode.

### 15.7 Risk register

| Risk | Consequence | Resolution |
|---|---|---|
| Treating public Views as a full host API | Inconsistent snapshots and improvised SQL coupling | T07 before connected evidence claims |
| Treating bus replay as durable history | Missing transitions after restart or slow client | T08 snapshot/outbox/reconciliation |
| UI retries around an uncertain core mutation | Duplicate effects or duplicated campaigns | T09 core command identity and reconciliation |
| Huge generic settings form | Unusable defaults and ineffective controls | Main pages + complete Advanced catalog with ownership metadata |
| Overpromising live reasoning or streaming | Misleading graph and incomplete protocol handling | Observable records; adapter bridge and canonical final message |
| Enabling every optional mechanism | Complexity, cost, and unmeasured behavior | Preserve default-off flags and capability qualification |
| Extending user-facing controls beyond the facade | Host reimplements the scheduler or verifier | G02/G03/G07/G08 additive owner APIs |
| Desktop shell chosen before lifecycle proof | Packaging complexity obscures runtime gaps | Local browser/launcher first |

Remaining implementation choices are narrow: exact credential-store backend per platform, packaged launcher technology, eventual remote identity provider, and optional graph/diff renderer after measurement. The local single-user product and all core UI behaviors do not depend on choosing a remote identity provider.

## 16. Acceptance and verification

### 16.1 Product acceptance scenarios

| ID | Required observable result | Owning tasks |
|---|---|---|
| AC01 | Open a canonical project, see branch/dirty state, and prevent a second controller on the same repo | T06, T09 |
| AC02 | Connect through supported auth; distinguish credential, model-access and agent-profile readiness | T10, T11 |
| AC03 | Start from an explicit objective, acceptance/scope and budget; retain authoritative original text | T12, T14 |
| AC04 | S0 and S2 show different execution structures; required lifecycle/verification remains visible in S0 | T05, T12 |
| AC05 | Progress changes only with supported requirement/candidate evidence | T07, T12 |
| AC06 | Trace a graph node to its tools, result packet, changed file and receipt | T05, T16 |
| AC07 | Answer/deny/review exactly one current pending item; stale reply cannot authorize an effect | T13 |
| AC08 | Amendments retain history and invalidate/recompile affected authority/context through core | T14 |
| AC09 | A saved setting shows its effective source and activation boundary; active snapshot is unchanged | T14 |
| AC10 | Every inspected configurable field has a UI/catalog disposition and validation | T14, T18 |
| AC11 | Unsupported roles, widened tool masks and disabled mandatory controls are rejected | T14 |
| AC12 | Partial streamed calls are never dispatched; canonical response replaces provisional text | T11, T15 |
| AC13 | Stop shows settlement before cancellation and prevents new dispatch/publication | T09, T15 |
| AC14 | A passed check becomes stale after a relevant edit; zero discovered tests is not success | T16 |
| AC15 | Revert refuses changed preimages and preserves pre-existing user edits | T16 |
| AC16 | Process status distinguishes running, no output, terminal, lost and unknown; logs are bounded | T15, T17 |
| AC17 | Reconnect/double submit cannot create duplicate campaigns or approvals | T08, T09, T13 |
| AC18 | Snapshot/cursor race, bus drop and backend restart converge to authoritative state | T07, T08, T17 |
| AC19 | Resume preserves identity/evidence; new attempts preserve prior outcomes and accumulated cost | T17 |
| AC20 | KB claims show provenance/freshness and admission ownership; unseen remains unseen | T19 |
| AC21 | Usage includes helpers/retries and marks unknown billing dimensions without false exact totals | T19 |
| AC22 | S3 has scoped writers, one integrator, stale-packet handling and combined verification | T20 |
| AC23 | Publication reports actual stage and requires current evidence and stage-specific authorization | T20 |
| AC24 | Unauthorized project/artifact access and credential leakage through replay/export/logs fail | T06, T10, T21 |
| AC25 | Compact two-pane workspace works in both themes, keyboard-only, reduced motion, 200% zoom | T03, T21 |
| AC26 | Each protocol error and unsupported capability has a useful explanation and recovery action | T02, T21 |
| AC27 | Windows/Linux launcher lifecycle follows actual process ownership; no hidden detached execution | T22 |

### 16.2 Test strategy

1. **Pure contracts:** serialization, descriptor coverage, configuration merge, event reducers, unknown variants, decimal/cursor round trips.
2. **Core owner APIs:** revision checks, idempotent receipts, atomic snapshot, approval/recovery, candidate-bound mutation. Use existing fake provider and fixtures.
3. **Host integration:** real Spring HTTP/WebSocket + temporary stores/repos; multiple viewers; restart at controlled effect boundaries; expired cursors and slow clients.
4. **Browser:** use the available browser tooling; if unavailable, use Playwright. Exercise product behavior against the host with deterministic fake provider. Capture screenshots for layout and inspect console/network failures.
5. **Platform:** Windows and Linux path, process, credential-store and packaging smoke. Do not claim macOS support based only on browser rendering.
6. **Live provider:** optional, separately authorized test with explicit cost/credential requirements; record the exact provider/model/API configuration and date. Offline tests remain the normal CI path.

Proposed application commands once scaffolded:

```text
# backend directory, Windows
.\gradlew.bat test
.\gradlew.bat bootJar

# frontend directory
npm ci
npm run build
npm run test:ci
npm run e2e
```

Define these frontend scripts during T01/T02; they do not exist in the current workspace. Use each library's existing focused tests and Java consumer compilation when changing its API. Run its required ABI checks before publishing updated library artifacts.

### 16.3 Specification verification performed

This document was checked against the actual facade, events, authority interfaces, configuration/defaults/roles, controller lifecycle, tool families, provider contracts, AI Gate stream/auth/model-form APIs, and current official stack documentation. Local links and coverage of the current Defaults and Flags fields are validated as part of this documentation task.

Validation results: local file links and internal heading anchors resolve across all three deliverables; source-reference definitions and JSON examples validate; Markdown fences and table columns are consistent; all 22 task IDs appear in the checklist. A source-field inventory check found no missing names in the inspected configuration groups, and all 46 numeric `Defaults` values match the source. Both library working trees remain unchanged.

Application builds, browser tests, visual contrast checks, and live provider tests are future implementation gates. The wireframes are design artifacts and fixture specifications; they are not evidence that those gates passed.

## 17. Implementation request

The following request can be given to an implementation agent with this document and the two library repositories.

```text
Implement ASTROLABE Workbench using ASTROLABE_UI_DESIGN.md v1.0 as the
product specification and acceptance contract.

Goal:
Build the compact Angular Web UI and Java Spring Boot host described in
the document, including the two-pane conversation workspace, Agent Overview,
current candidate-bound evidence, settings, provider authentication,
human interactions, process inspection, usage, recovery and staged publication.

Source authority:
Read ASTROLABE/SOTA-BEST-MIXED-AGENT.md and the relevant linked subsystem
contracts. Inspect the actual code in ASTROLABE and llm-transport-sdk.
Do not implement from the immutable historical sources/ documents.
Recheck repository instructions and current integration state first.
The source revisions in section 2 are the design baseline, not a guarantee
that the checkout is unchanged.

Stack:
Use the latest stable Angular at implementation time and a supported stable
Spring Boot on Java 26, pinned with compatible CLI/Node/TypeScript versions.
The design verified Angular 22.2.0 and Spring Boot 4.1.1 on 2026-09-28.
Use WebSocket as the primary live/command transport and REST for snapshots,
artifacts, paged resources and private credential entry.

Implementation:
Execute T01-T22 in dependency order with the checkpoints and focused
verification in section 15. Start with a Java compatibility proof, transport
schemas, and the fixture-backed shell. Mark fixture mode as Demo data.
Maintain tasks/todo.md as work is verified.

Preserve ownership:
The controller owns scheduling, contract and ledger; verifier owns acceptance;
runner owns tool outcomes; curator owns KB admission; core owns accounting.
The UI and host submit commands and render projections.
Do not add a second model loop or mutate core SQL/Markdown exports.

Integrate correctly:
Reuse AstrolabeJava, JavaAuthority, Events/Views and the AI Gate APIs.
Implement the explicitly identified G01-G10 gaps through supported owner APIs.
Do not claim resume, atomic snapshots, token events, complete settings binding,
or post-run publication already exist in the current Java facade.
If the AI Gate adapter now exists, reuse and qualify it instead of replacing it.

Required semantics:
Frozen attempt configuration; stable identities; bounded streams;
single-use revision-bound approvals; idempotent command intents;
snapshot/replay convergence; explicit unknown effects and usage;
guarded edits; current receipt validity; cancellation settlement.
Never execute partial/late streamed tool calls or let assistant text
mark work complete. Preserve required correctness controls and quality floors.

Design:
Follow section 7 tokens, dimensions, responsive rules, wireframes and
P01-P12 scenarios. Keep details expandable and avoid a permanent third panel.
Animate only observed workflow activity. High-level progress uses observable
intent, claims, decisions, tool/check status and evidence, without inventing
private reasoning.

Configuration:
Expose every supported field with source, scope, units, validation,
availability and activation timing. Unsupported integrations need a named
prerequisite. Roles remain bounded configurations of the declared runtime roles.
Credentials and opaque provider state stay server-side.

Completion:
Pass AC01-AC27 for every capability claimed by the release.
Record build/test/browser/platform evidence and exact remaining unsupported
capabilities. Keep offline tests deterministic; report opt-in live tests
separately. Deliver runnable instructions and verified screenshots.
Do not replace missing runtime behavior with mock success in connected mode.
```

## 18. Sources and requirement coverage

### 18.1 Local source register

Source links are relative to this document. Symbols, rather than unstable line numbers, identify the inspected contracts.

| Ref | Source / relevant symbols |
|---|---|
| A01 | [Architecture entry map][A01] — current subsystem authority and preserved commitments |
| A02 | [Implemented-state snapshot][A02] — P0–P6 status and P7 limits |
| A03 | [Components and identities][A03] — controller ownership and four identities |
| A04 | [Campaign/cell lifecycle][A04] — compile/run/verify/accept and packet boundaries |
| A05 | [Config.kt][A05] — Config, Flags, RulesBinding, platform and process limitations |
| A06 | [Role.kt][A06] — Role, Roles.defaults, effectiveOps and packet restrictions |
| A07 | [Astrolabe.kt][A07] — project/handle lifecycle, campaign start, amendments, EmptyKb |
| A08 | [AgentEvent.kt][A08] — actual event variants, phase tags and EventRecord |
| A09 | [Events.kt][A09] — sequence implementation, replay/buffers, loss semantics |
| A10 | [Views.kt][A10] — current public read projections and transaction scope |
| A11 | [Context layout][A11] — S/R/K/T/A and volatile anchor |
| A12 | [Evidence/coherence][A12] — five horizons, candidate-bound receipts |
| A13 | [Controller.kt][A13] — CampaignRequest/Policy, open/run/publish and reconciliation |
| A14 | [ExecutionMode.kt][A14] — TrustedLocal versus required external confinement |
| A15 | [Lifecycle.kt][A15] — CampaignOutcome, CampaignPhase and supported transitions |
| A16 | [AttemptConfig.kt][A16] — frozen snapshots and mandatory Controls |
| A17 | [Publications.kt][A17] — PublicationRequest, stages and publication fencing |
| A18 | [Usage.kt][A18] — billable dimensions, unknown money, dated pricing |
| A19 | [Defaults.kt][A19] — complete default values, ProfileRoles and ShapePolicy |
| A20 | [ProviderAdapter.kt][A20] — validation, invocation lifecycle and terminal reconciliation |
| A21 | [AstrolabeJava.kt][A21] — Java constructor, futures, handles and subscriptions |
| A22 | [JavaAuthority.kt][A22] — asynchronous inbound host SPI |
| A23 | [OptionalLayers.kt][A23] — currently supplied optional facade layers |
| A24 | [Contract.kt][A24] — scope, acceptance, constraints, amendments, increment statuses |
| A25 | [Mount.kt][A25] — MCP catalog, tool descriptors, effects and authority |
| A26 | [Authority.kt][A26] — question/answer/decision/resolution and stale reply contract |
| A27 | [Router.kt][A27] — floors, affordability, RoutingPolicy and refusal |
| A28 | [Capabilities.kt][A28] — Profile and explicit provider capabilities |
| A29 | [ToolFamily.kt][A29] — seven families, operation masks and effects |
| A30 | [Redaction.kt][A30] — pattern/env/capture policy |
| A31 | [EffectPolicy.kt][A31] — lower-level command policy configuration |
| A32 | [Contracts.kt][A32] — current append/revision amendment behavior and proposal resolution |
| S01 | [Llm.java][S01] — runtime, catalog/auth, streams, diagnostics, scoped credentials |
| S02 | [Auth.java][S02] — status/methods/login/save/logout/revoke |
| S03 | [ChatEvent.java][S03] — deltas, part ends, aggregate Done |
| S04 | [FieldDescriptor.java][S04] — shared auth/model form metadata |
| S05 | [ChatOptions.java][S05] — option inheritance, generation/history/cache and host callbacks |
| S06 | [Providers.java][S06] — installed SDK provider/preset factories |
| S07 | [ChatStream.java][S07] — single consumer, partial/result and cancellation |
| S08 | [AuthInteraction.java][S08] — blocking prompts/private notices |
| S09 | [RedirectInteraction.java][S09] — host-owned callback completion |
| S10 | [CredentialStore.java][S10] — store SPI, memory/file/scoped forms |
| S11 | [Provider.java][S11] — secret-free provider definition and builders |
| S12 | [Model.java][S12] — catalog identity, limits, capabilities, parameter descriptors |
| S13 | [TimeoutPolicy.java][S13] — deadline defaults and inheritance |
| S14 | [RetryPolicy.java][S14] — transport retry configuration |
| S15 | [HttpOptions.java][S15] — HTTP/TLS/proxy/wire diagnostics |
| S16 | [CatalogOptions.java][S16] — offline/feed/live-listing controls |
| I01 | [Existing integration analysis][I01] — proposed bridge, admission, accounting, gaps |

Architecture companion documents informing the UI are [roles and shapes](ASTROLABE/docs/architecture/roles-shapes.md), [principles](ASTROLABE/docs/architecture/principles.md), [verification](ASTROLABE/docs/verification/scheduler.md), [acceptance](ASTROLABE/docs/verification/acceptance-review.md), [workspace editing](ASTROLABE/docs/runtime/workspace-editing.md), [security](ASTROLABE/docs/platform/security.md), and [routing](ASTROLABE/docs/operations/routing.md). Where design intent and exposed facade differ, section 2 records the gap.

### 18.2 Brief-to-spec traceability

| Requirement from ui_goals.md | Covered by |
|---|---|
| Understand architecture/philosophy/current implementation | Sections 2–3; source register; explicit integration gaps |
| Self-contained structured specification and implementation prompt | Sections 1–18; section 17 handoff |
| Backend requirements, APIs, entry points | Sections 9–12, 14; G01–G10 |
| Angular + Java Spring Boot, WebSocket primary | Sections 10–13; version evidence |
| Project selection and main coding workflow | Sections 4–6 |
| Roles, agents, configurable settings | Section 8 complete source inventory and activation rules |
| LLM connections/auth/multiple models | Sections 8.7 and 9 |
| Statistics/background processes | Sections 6.7–6.8; protocol and DTOs |
| Animated Agent Overview with high-level progress | Section 6.2; prototypes B/P02/P09 |
| Familiar sidebar/workspace with persistent composer | Sections 4, 6.1, 7.3 |
| Compact restrained modern design, dark/light | Section 7 tokens/layout/accessibility |
| Prototype description and implementation plan | Section 7 wireframes/scenarios; sections 15–17 |
| Assume future ASTROLABE + transport integration | G01, section 10.5 and T11; no claim integration already exists |

[A01]: ASTROLABE/SOTA-BEST-MIXED-AGENT.md
[A02]: ASTROLABE/actual_state.md
[A03]: ASTROLABE/docs/architecture/components.md
[A04]: ASTROLABE/docs/architecture/lifecycle.md
[A05]: ASTROLABE/core/src/main/kotlin/io/astrolabe/Config.kt
[A06]: ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Role.kt
[A07]: ASTROLABE/core/src/main/kotlin/io/astrolabe/Astrolabe.kt
[A08]: ASTROLABE/core/src/main/kotlin/io/astrolabe/event/AgentEvent.kt
[A09]: ASTROLABE/core/src/main/kotlin/io/astrolabe/event/Events.kt
[A10]: ASTROLABE/core/src/main/kotlin/io/astrolabe/event/Views.kt
[A11]: ASTROLABE/docs/runtime/context-layout.md
[A12]: ASTROLABE/docs/state/evidence-coherence.md
[A13]: ASTROLABE/core/src/main/kotlin/io/astrolabe/campaign/Controller.kt
[A14]: ASTROLABE/core/src/main/kotlin/io/astrolabe/auth/ExecutionMode.kt
[A15]: ASTROLABE/core/src/main/kotlin/io/astrolabe/campaign/Lifecycle.kt
[A16]: ASTROLABE/core/src/main/kotlin/io/astrolabe/AttemptConfig.kt
[A17]: ASTROLABE/core/src/main/kotlin/io/astrolabe/campaign/Publications.kt
[A18]: ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Usage.kt
[A19]: ASTROLABE/core/src/main/kotlin/io/astrolabe/Defaults.kt
[A20]: ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/ProviderAdapter.kt
[A21]: ASTROLABE/core/src/main/kotlin/io/astrolabe/java/AstrolabeJava.kt
[A22]: ASTROLABE/core/src/main/kotlin/io/astrolabe/java/JavaAuthority.kt
[A23]: ASTROLABE/core/src/main/kotlin/io/astrolabe/campaign/OptionalLayers.kt
[A24]: ASTROLABE/core/src/main/kotlin/io/astrolabe/contract/Contract.kt
[A25]: ASTROLABE/core/src/main/kotlin/io/astrolabe/tool/Mount.kt
[A26]: ASTROLABE/core/src/main/kotlin/io/astrolabe/event/Authority.kt
[A27]: ASTROLABE/core/src/main/kotlin/io/astrolabe/route/Router.kt
[A28]: ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Capabilities.kt
[A29]: ASTROLABE/core/src/main/kotlin/io/astrolabe/tool/ToolFamily.kt
[A30]: ASTROLABE/core/src/main/kotlin/io/astrolabe/auth/Redaction.kt
[A31]: ASTROLABE/core/src/main/kotlin/io/astrolabe/auth/EffectPolicy.kt
[A32]: ASTROLABE/core/src/main/kotlin/io/astrolabe/contract/Contracts.kt
[S01]: llm-transport-sdk/llm/src/main/java/net/ai/gate/Llm.java
[S02]: llm-transport-sdk/llm/src/main/java/net/ai/gate/auth/Auth.java
[S03]: llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/stream/ChatEvent.java
[S04]: llm-transport-sdk/llm/src/main/java/net/ai/gate/config/FieldDescriptor.java
[S05]: llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/options/ChatOptions.java
[S06]: llm-transport-sdk/llm/src/main/java/net/ai/gate/providers/Providers.java
[S07]: llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/stream/ChatStream.java
[S08]: llm-transport-sdk/llm/src/main/java/net/ai/gate/auth/interaction/AuthInteraction.java
[S09]: llm-transport-sdk/llm/src/main/java/net/ai/gate/auth/interaction/RedirectInteraction.java
[S10]: llm-transport-sdk/llm/src/main/java/net/ai/gate/auth/CredentialStore.java
[S11]: llm-transport-sdk/llm/src/main/java/net/ai/gate/Provider.java
[S12]: llm-transport-sdk/llm/src/main/java/net/ai/gate/model/Model.java
[S13]: llm-transport-sdk/llm/src/main/java/net/ai/gate/config/TimeoutPolicy.java
[S14]: llm-transport-sdk/llm/src/main/java/net/ai/gate/config/RetryPolicy.java
[S15]: llm-transport-sdk/llm/src/main/java/net/ai/gate/config/HttpOptions.java
[S16]: llm-transport-sdk/llm/src/main/java/net/ai/gate/catalog/CatalogOptions.java
[I01]: TRASPORT_INTEGRATION_ANALYZE_01.md
