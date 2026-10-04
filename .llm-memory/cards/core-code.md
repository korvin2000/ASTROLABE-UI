---
card: core-code
title: ASTROLABE source-code map (Kotlin modules, build, CI, tests)
scope: ASTROLABE/{core,provider-api,eval,eval-live,index-treesitter,provider-ai-gate,build-logic,gradle,scripts,.github}
repo: ASTROLABE @ 0fc8de9 (main)
verified: 2026-09-30
read-when: where is X implemented in the ASTROLABE Kotlin repo; how modules, store, tests, ABI dumps and CI fit
---
# ASTROLABE source-code map
ASTROLABE is a Kotlin/JVM SDK for a coding-agent harness (campaign -> cell -> tool -> verify) that Kotlin or Java
hosts drive through events and an `Authority` callback; no UI coupling. All P0-P6 tasks are implemented and
fixture-validated offline against a fake provider; live provider gates are UNMEASURED (P7). The one live piece is
the AI Gate adapter (`provider-ai-gate`). Task status is a docs matter (see the ASTROLABE docs card).

`K` = `ASTROLABE/core/src/main/kotlin/io/astrolabe`. Each `K/<pkg>/` has a mirror under `core/src/test/kotlin/...`.

## Canonical sources
- Kotlin source under each module's `src/main`: truth for behaviour. KDoc cites spec sections (`§n.n`), tasks (`P*`)
  and decisions (`D-nn`).
- `ASTROLABE/*/api/*.api` (`core/api/core.api` is ~27k lines: grep, never read): committed public ABI; `check` fails
  on drift (`checkKotlinAbi`). Regenerate with `updateKotlinAbi`; on merge conflict regenerate, never hand-edit.
- `ASTROLABE/settings.gradle.kts`, `gradle/libs.versions.toml`, `build-logic/`: module graph, pinned versions, rules.
- `ASTROLABE/CLAUDE.md`: binding conventions, commands, known-flaky tests (current). `ASTROLABE/actual_state.md`:
  hand-kept snapshot of implemented state and key types per package (current; see conflicts below).
- `ASTROLABE/core/README.md` is NOT an overview: four pure-analytics notes only (atlas `Impact`, telemetry
  `TraceAnalytics`, route `AttemptCost`/`DagSchedule`, workspace `ScopeAlgebra`). `eval/README.md`: eval kernel,
  fixture-runner `report.json` schema, rendered arms table.

## Map: modules (each depends only on the ones named)
| Module | Role | Depends on | Anchor |
|---|---|---|---|
| `provider-api` | provider SPI, item/usage/price model, no network | coroutines, serialization | `ProviderAdapter` |
| `core` | whole harness (271 Kotlin + 1 Java file) | `provider-api` (api), sqlite-jdbc, slf4j | `Astrolabe` |
| `eval` | offline evaluation kernel, fixture runner | `core` (api); core tests at test time | `FixtureRunner` |
| `index-treesitter` | optional tier-1 symbol index (JNI grammars) | `core` (api), tree-sitter-ng | `TreeSitterIndex` |
| `provider-ai-gate` | `ProviderAdapter` over AI Gate; conditional | `provider-api`, `ai-gate` SDK | `AiGateAdapter` |
| `eval-live` | headless live runner + bench tasks (2.0, D-380); conditional like `provider-ai-gate` | `core`, `provider-ai-gate`, `ai-gate` | `Main` (`eval-live run|tasks|check`), `eval-live/tasks/` |
| `build-logic` | included build, plugin `astrolabe.kotlin-library` | Kotlin + serialization plugins | |

- `provider-api` never depends on `core`; `provider-ai-gate` main imports no `core` type (tests do). `core` never
  depends on `index-treesitter`: the host plugs it in (`OptionalLayers`).
- `provider-ai-gate` exists only when `llm-transport-sdk/llm` (sibling repo, composite build; or
  `-Pastrolabe.aiGateBuild=<path>`) is present; else settings logs "provider-ai-gate skipped". Its `.api` dump stays.
- `astrolabe.kotlin-library` (`build-logic/src/main/kotlin/`): JDK 26 toolchain and `--release 26`, `explicitApi()`,
  Kotlin ABI validation, `java-test-fixtures`, JUnit Platform, maven publication.
- Versions only in `gradle/libs.versions.toml` (Kotlin 2.4.20, JUnit 6.1.3, `ai-gate 0.1.0-SNAPSHOT`, ...); Gradle
  wrapper 9.7.1. Tests of `core`/`index-treesitter` need `--enable-native-access=ALL-UNNAMED` (FFM, JNI grammars).

## Map: `core` packages (paths under `K/`)
| Path | Responsibility | Key symbols |
|---|---|---|
| `Astrolabe.kt` | Kotlin host entry; opens `Project`, starts campaigns | `Astrolabe.open/campaign` |
| `Config.kt` `Defaults.kt` | host config, `Flags`, tunable defaults | `Config`, `Flags`, `Defaults` |
| `AttemptConfig.kt` `Mode.kt` | config frozen per attempt; mode enums | `AttemptConfig`, `Controls` |
| `java/` | Java facade: futures/blocking, `Java*` SPI forms | `AstrolabeJava`, `JavaAuthority` |
| `campaign/` | controller, lifecycle state machine, shapes, publication | `Controller`, `Lifecycle` |
| `cell/` | one model session: turn loop, layout, gates, residency | `Cell`, `CellContext`, `Kernel` |
| `tool/` | tool families, args, dispatch, turn partition, mounts | `Dispatcher`, `ToolCalls` |
| `tool/{look,edit,run,verify,state,task,kb}/` | one executor per family | `Look`, `Edit`, `Run`, `StateTool` |
| `verify/` | checks, receipt currency, exit gate, acceptance rule | `Verifier`, `Resolver`, `Scheduler` |
| `context/` | context compiler, admission, carry-forward, manifests | `Compiler`, `CarryForward` |
| `contract/` `graph/` | contract records and derivation; increment DAG | `Contracts`, `RequirementGraph` |
| `register/` `workset/` | STATE register and validator; read coverage | `Register`, `Workset` |
| `evidence/` | journal, receipts, observations, intents, aliases | `Journal`, `Receipts` |
| `workspace/` | file versions, stamps, dirty state, worktrees, scopes | `WorkspacePath`, `Stamper` |
| `os/`, `os/search/` | process ownership (Windows job, Linux subreaper), Git, search | `LocalOs`, `Git`, `Searches` |
| `store/` | SQLite, blob store, schema, project lock, layout | `Store`, `Migrations` |
| `event/` | event bus, `Authority` host callback, read views | `Events`, `Authority`, `Views` |
| `auth/` `budget/` | capabilities, permission ladder, redaction; token budgets | `PermissionLadder`, `CellBudget` |
| `route/` | profile routing, tiers, escalation, cache schedule | `Router`, `TierTable`, `Escalation` |
| `delegate/` | probe/review/QA/writer child cells, judge, integrator | `Delegator`, `Judge`, `Integrator` |
| `recover/` | failure classes, recovery ladder, guards, capsule repair | `Ladder`, `Guards`, `Repair` |
| `kb/` | notes, curator, extractor, skills, retrieval | `StoreKb`, `Curator`, `Extractor` |
| `atlas/` | repo atlas, import graph, outlines, impact, language service | `ImportGraph`, `Impact` |
| `telemetry/` `id/` | spans, accounting, trace analytics; typed ids, digests | `Spans`, `Identities` |
| `core/src/main/java/io/astrolabe/os/` | the only Java file in main | `LinuxSubreaper` |

## Map: other modules
| Path | Responsibility | Key symbols |
|---|---|---|
| `provider-api/.../provider/` | items, request/response, `Profile`, usage, SPI | `Item`, `Request`, `Invocation` |
| `provider-ai-gate/.../aigate/` | adapter, `gate` config block, translators | `AiGateAdapter`, `ProfileBinding` |
| `index-treesitter/.../treesitter/` | grammars, outline, syntax verdict | `TreeSitterIndex`, `Grammar` |
| `eval/.../eval/` | fixture runner, frozen campaigns, arms, integrity | `FixtureRunner`, `CampaignManifests` |
| same | scorecard, paired bound, promotion, workload, trace mining | `Scorecard`, `PromotionReport` |

## Where to look
| Question | Path + anchor |
|---|---|
| Host entry, resource and shutdown rules | `K/Astrolabe.kt` (`Astrolabe`, `Project`, `CampaignHandle`) |
| Java entry / interop | `K/java/AstrolabeJava.kt`; D-07; `core/src/test/java/.../JavaConsumptionSmokeTest.java` |
| How a campaign opens (reconcile, prescan, shape) | `K/campaign/Controller.kt` `Controller.open` |
| Campaign loop (S0 vs S1/S2/S3) | `Controller.runS0`, `Controller.run`; private `runS1`, `plan` |
| S3 parallel writers and integration | `K/campaign/S3Run.kt` (internal); `K/delegate/Writer.kt`, `Integrator.kt` |
| Campaign states, outcomes, transitions | `K/campaign/Lifecycle.kt` (`CampaignOutcome`, `Transition`) |
| Which shape a request gets | `K/campaign/ShapeSelector.kt`; `ImpactPrescan.kt` |
| How a cell turn is executed | `K/cell/Cell.kt` `Cell.run` -> inner `Loop` (class KDoc lists the steps) |
| Kernel text, segments `[S][R][K][T][A]` | `K/cell/Layout.kt` `Kernel`; `RoleTexts.kt`; `Role.kt` |
| Gates, stop rules, eviction, gauge | `K/cell/Gates.kt`, `Residency.kt`, `Gauges.kt` |
| Where tool calls are parsed and dispatched | `K/tool/ToolCall.kt` `ToolCalls.parse`; `Dispatcher.dispatch` |
| Which executor serves a family | `Cell.Loop.executors` in `K/cell/Cell.kt`; `K/tool/ToolFamily.kt` |
| Tool args and exposed schemas; turn phases | `K/tool/Args.kt`, `ToolSchemas.kt`; `Partition.kt` |
| Edit engine; run-output parsing | `K/tool/edit/`; `K/tool/run/*Shaper.kt` (samples in test `resources/shaper/`) |
| Where acceptance/obligations resolve | `K/verify/Resolution.kt` (`Resolver`, `Obligations`) |
| Who accepts a completion | `K/verify/ExitGate.kt` `Verifier`; cell-side twin `K/cell/Gates.kt` |
| Pending decision / review rejection | `K/campaign/Acceptances.kt`; `Controller` `settle`, `decide`, `resumePending` |
| Checks, receipts, closures, blast, integrity guard | `K/verify/` `Scheduler`, `Closures`, `Blast`, `TestIntegrity` |
| Final acceptance and finish receipt | `Controller.stopOrFinish`, `campaignResults`; `K/campaign/FinishReceipt.kt` |
| Publication beyond `patch` | `K/campaign/Publications.kt`, `Publisher.kt`; `K/auth/PermissionLadder.kt` |
| Store schema, migrations, table owners | `K/store/Migrations.kt` (`Migrations.TABLES`; owner table in KDoc) |
| Disk layout, durability, blob ordering | `K/store/Layout.kt`; `BlobStore.kt`; `ProjectLock.kt` |
| Context compile and admission | `K/context/Compiler.kt` `Compiler.compile`; `ContextAdmission.kt` |
| Model call / provider SPI boundary | `Cell.Loop` -> `ctx.model.adapter.start`; `ProviderAdapter` in `provider-api` |
| Routing a cell to a profile/tier | `K/route/Router.kt`; `Controller.route`; `TierTable`, `FunctionTable` |
| Escalation, attempts, recovery | `K/route/Escalation.kt`; `K/recover/Ladder.kt`; `K/campaign/Recoveries.kt` |
| Child cells, review judge, QA | `K/delegate/` (`Delegator`, `ReviewCell`, `Judge`, `QaCell`) |
| KB write, retrieval, skills | `K/kb/Curator.kt`, `Notes.kt`, `Retriever.kt`, `Skill.kt`; `K/tool/kb/KbTool.kt` |
| Flags and optional layers | `K/Config.kt` `Flags`; `K/campaign/OptionalLayers.kt`; arms table in `eval/README.md` |
| Permissions, redaction, rules trust | `K/auth/` (`Capability`, `Redaction`, `RulesTrust`, `EffectPolicy`) |
| Process spawn/kill, git, rg search | `K/os/` (`Os`, `LocalOs`, `WindowsOwner`, `PosixOwner`, `Git`), `os/search/` |
| AI Gate wiring | `provider-ai-gate` `AiGateAdapter`, `ProfileBinding`; `Astrolabe(..., estimators=)` |
| Scoring, promotion, frozen campaigns | `eval/.../Scorecard.kt`, `Promotion.kt`, `Campaigns.kt`, `Integrity.kt` |
| Public ABI of a class | `rg -a '^public .*(class|interface) io/astrolabe/<pkg>/<Name>' core/api/core.api` |

## Spec docs per area (`ASTROLABE/docs/`; KDoc `§` numbers point here)
- `campaign/`, `cell/`: architecture/lifecycle (§3.7), runtime/gates-termination (§5.9), runtime/tools (§5.4),
  runtime/context-layout. `contract/`, `graph/`: state/contracts. `evidence/`, `store/`: state/evidence-coherence.
- `verify/`: verification/scheduler (§8.4), acceptance-review (§8.7), refactoring. `context/`: context/compiler,
  continuity. `register/`, `workset/`: runtime/register-workset. `workspace/`, `tool/edit`: runtime/workspace-editing.
- `atlas/`: repository/navigation. `delegate/`: operations/delegation. `route/`: operations/routing. `recover/`:
  operations/recovery (§13). `auth/`, publication: platform/security (§14). `provider-api`: platform/adapters (§15).
- `kb/`: knowledge/records, learning. `Defaults.kt`: reference/defaults (§17). `eval/`: evaluation/method, fixtures.
- `provider-ai-gate`: KDoc "integration design §n" = root `ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md` (§5.6 `gate`
  block, §9); SDK side `LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md`; decisions D-326..D-336 (card `root-docs`).

## Relationships
- Call chain: host -> `Astrolabe`/`AstrolabeJava` -> `Controller` -> `Cell` -> `Dispatcher` -> executors. The cell's
  model call goes through `ProviderAdapter`; the host `Authority` answers `ask`, `review` and acceptance `decide`.
- One increment (S1+): `run` -> `Compiler.compile` -> `route` -> `runCell` -> `Cell.run` -> `CellExit` -> `verify`
  (`Verifier`/`Resolver` over `Scheduler` receipts) -> `CompletionResult.Accepted` -> `commit` (`Transition.Committed`);
  `Pending` -> `settle` -> `Authority.decide`, stored in `pending_completions`/`acceptance_decisions`, resumed by
  `resumePending`. End: `stopOrFinish` -> `FinishReceipt`, KB `extract`, optional `publish`. S0 is `runS0` (same
  verify/commit). L9: controller commits the ledger, verifier accepts, curator publishes KB, runner sets tool status.
- Persistence: one `state.sqlite` per project under `Config.stateRoot` (or OS user-state dir), WAL + `synchronous=FULL`,
  explicit SQL via `Db`; blobs reach `blobs/<digest>` before the referencing row; `kb/`, `exports/` are derived.
  `Migrations.SCHEMA_VERSION` = 5 (v2 `campaigns`, v3 rebuilt requirements/acceptance/constraints, v4 `note_revisions`,
  v5 `pending_completions` + `acceptance_decisions`). Row: ids, `schema_version`, `created_at`, JSON `body`.
- Provider SPI: `Astrolabe` takes a `ProviderAdapter` + optional `EstimatorFactory`; `provider-api` holds no `core`
  types. Implementations: `AiGateAdapter` and test-only `FakeAdapter`. Java hosts pass a `JavaProviderAdapter`
  (`ProviderAdapters.fromJava`).
- Optional layers, off by default, read only under their frozen `Flags` entry: `precompile`, `calibrationPrior`,
  `treeSitterIndex`, `languageService`, `denseRetrieval`, `generatedTools`, `skillsPromotion`, `asyncChecker`, `qaCell`,
  `l4Gates`, `s3Writers` (+ `ShapePolicy.s3Enabled`), `otelExport`, `worthTestEstimate`, `kbInjection`.
- CI `ci.yml`: push to `main` and PRs; ubuntu + windows, JDK 26, Node 24, ripgrep; fetches the AI Gate SDK beside the
  repo (soft-fail); `./gradlew check` incl. ABI. `process-ownership.yml`: path filter `os/**`, Linux job.
  `scripts/sandbox-gradle.sh`: Linux cloud wrapper (JDK 25 scratch copy).
- Cross-repo: `provider-ai-gate` -> `llm-transport-sdk/llm` (Java, composite build). ASTROUI Studio includes this repo
  as a build; its bridge `StudioHost` drives `Controller` and implements `Authority` (card `studio`).

## Tests
- `core/src/test/kotlin/io/astrolabe/<pkg>/` mirrors main (`verify/ExitGateTest`, `store/MigrationsTest`). End-to-end:
  `campaign/*CampaignTest`, `VerticalSliceTest`; acceptance rule: `campaign/AcceptanceDecisionTest`. One Java test in
  `core/src/test/java/io/astrolabe/java/`. Other modules: `eval/src/test` (`runner-sample` tag excluded),
  `index-treesitter/src/test`, `provider-api/src/test`, `provider-ai-gate/src/test` (`CampaignThroughGateTest`;
  `LiveSmokeTest` only via the billable `liveTest` task, never in `check`).
- Display names carry fixture ids `FX-nn` (runtime), `AX-nn` (adapter), some `IX-nn`; `FixtureRunner` counts only tests
  whose name names an id. Catalog: docs `evaluation/fixtures.md`.
- `core/src/testFixtures` (`io.astrolabe.fixtures`, used by other modules): `FakeAdapter`, `ScriptedModel`, `TempRepo`,
  `FixtureRepos` (python-small, python-failing, ts-small, gradle-small under `resources/fixtures/repos/`, listed in
  hand-written `resources/fixtures/index/*.txt`), `StoreInspector`, `TestKit`, `FixedIdGen`, `FakeClock`.
- Commands and flaky/environmental failures: `ASTROLABE/CLAUDE.md`. Focused run: `:core:test --tests '<class>'`.

## Status and conflicts
- current: actual_state.md (185/185 tasks, schema v5, phase-0 acceptance rule D-337..D-355) agrees with the code;
  newest public vocabulary: `StopCode`, `CampaignOutcome.Answered`. S3 runs only with `shapePolicy.s3Enabled` and
  `flags.s3Writers` (D-183).
- conflicting (minor): actual_state.md files `Flags` and `OptionalLayers` under "root"; they live in `K/Config.kt` and
  `K/campaign/OptionalLayers.kt`.
- stale: `Migrations` class KDoc describes only v1-v2 (code has v1-v5). `Astrolabe.open` KDoc and `Project.kb = EmptyKb`
  call the KB empty until P2.6, but `StoreKb` is built per campaign in `Controller.open`: use the campaign's KB.

## Pitfalls
- Four core files hold a literal NUL byte (`os/Git.kt`, `os/GitTypes.kt`, `workspace/WorkspacePath.kt`,
  `os/search/Search.kt`): plain `rg` says "binary file matches" and skips lines; use `rg -a`.
- `Controller.kt` (~2.3k lines) and `Cell.kt` (~1.25k) are monoliths with private helpers: find with
  `rg -n 'private (suspend )?fun <name>'`, read ranges only.
- `explicitApi()`: public declarations need `public`; several campaign parts are `internal` (`S3Run`, `Recoveries`,
  `Escalations`, `PluggedLayers`). A public API change means regenerating that module's ABI dump.
- `io.astrolabe.java` exposes no `suspend`, `Flow` or `value class`; no public value classes, no Kotlin `Result`.
- One campaign per project at a time; `Astrolabe.close` blocks, so never call it inside a campaign callback.
- Flags and defaults come from the frozen attempt config (`c.attempt.config`); harness changes (incl. `Kernel.VERSION`)
  apply at an attempt boundary (invariant 12).
- A new fixture-repo file needs an entry in `resources/fixtures/index/<repo>.txt` (`FixtureReposIndexTest`).
- Without the SDK sibling checkout `:provider-ai-gate` is absent, not broken.

## Freshness
- `ASTROLABE/actual_state.md`
- `ASTROLABE/CLAUDE.md`
- `ASTROLABE/core/README.md`
- `ASTROLABE/eval/README.md`
- `ASTROLABE/settings.gradle.kts`
- `ASTROLABE/gradle/libs.versions.toml`
- `ASTROLABE/build-logic/src/`
- `ASTROLABE/.github/workflows/`
- `ASTROLABE/core/build.gradle.kts`
- `ASTROLABE/eval/build.gradle.kts`
- `ASTROLABE/index-treesitter/build.gradle.kts`
- `ASTROLABE/provider-ai-gate/build.gradle.kts`
- `ASTROLABE/provider-api/build.gradle.kts`
- `ASTROLABE/provider-api/src/main/`
- `ASTROLABE/provider-ai-gate/src/main/`
- `ASTROLABE/index-treesitter/src/main/`
- `ASTROLABE/eval/src/main/`
- `ASTROLABE/core/src/main/java/io/astrolabe/os/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/Astrolabe.kt`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/Config.kt`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/java/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/campaign/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/tool/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/verify/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/store/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/context/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/delegate/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/kb/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/route/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/workspace/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/os/`
- `ASTROLABE/core/src/main/kotlin/io/astrolabe/atlas/`
- `ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/`
- `ASTROLABE/core/api/core.api`
