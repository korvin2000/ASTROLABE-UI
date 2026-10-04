---
card: find
title: Where to look — cross-repo lookup table
scope: whole workspace
verified: 2026-09-30
read-when: you know the topic, not the file. Each row gives the first place to open and the card with more detail.
---
# Where to look
Paths are from the workspace root. `K` = `ASTROLABE/core/src/main/kotlin/io/astrolabe`,
`P` = `llm-transport-sdk/llm/src/main/java/net/ai/gate`, `S` = `ASTROUI/backend/server/src/main/java/io/astrolabe/studio`,
`B` = `ASTROUI/backend/bridge/src/main/kotlin/io/astrolabe/studio/bridge`, `A` = `ASTROUI/frontend/src/app`.
Search nested repos by naming them: `rg -a <pat> ASTROLABE` (`-a`: some core files contain NUL bytes).

## Build, run, test
Commands for all three repos: `workspace.md › ## Commands`; core details and flaky tests `ASTROLABE/CLAUDE.md › ## Commands`,
`## Known failures and gotchas`; Studio `ASTROUI/README.md › ## Develop`, `## Tests`; SDK `llm-transport-sdk/llm/README.md`.

## Project state and plans
| Topic | First look | Card |
|---|---|---|
| What is done / what is next in the core | `ASTROLABE/CONTINUE-TASK.md › ## Next`; `ASTROLABE/actual_state.md` | core-docs |
| A core task, its spec and log | `rg -n '^#### P4\.5\.4 ' ASTROLABE/TODO.md`, read to the next `####` | core-docs |
| A core decision `D-nn` | `rg -n '^\| D-64 \|' ASTROLABE/TODO.md \| cut -c1-400` | core-docs |
| A Studio decision `D-n`/`D2-n`/`OD-n`/`F-n` | `ASTROUI/docs/decisions.md`; progress `ASTROUI/docs/progress.md` | studio |
| SDK status, known limits | `llm-transport-sdk/llm/README.md`, `llm/CHANGELOG.md`, `llm/REVIEW.md` | sdk |
| Latest owner goal and its result | `next-goal.md` (RU) → `phase0-report.md` | root-docs |
| Proposed next improvements | `further_development_ideas.md › ## 5. Ranking`, goal and governor `› ## 4.` (RU, 2026-10-02; supersedes `FABLE_ANALYZE_AND_IDEAS.md › ## 7.`) | root-docs |
| Critical supplement and revised priorities | `astra_development_ideas.md › ## 0. Мой вывод`, code findings `› ## 3.`, ranking `› ## 5.`, plan `› ## 9.` (RU, 2026-10-02; proposals, no new live runs) | root-docs |
| Why live tasks looped / failed | `final_analyze.md › ## 3.`; `phase0-report.md › ## Why Luna never finished` | root-docs |

## Core architecture and spec (ASTROLABE)
| Topic | First look | Card |
|---|---|---|
| Architecture in one page; invariants | `ASTROLABE/SOTA-BEST-MIXED-AGENT.md`; `docs/architecture/principles.md` | core-docs |
| Which spec docs for a subsystem | `ASTROLABE/READING-GUIDE.md` table | core-docs |
| Term definition | `ASTROLABE/docs/reference/glossary.md`; `ideas/_map/CONCEPTS.md` | core-docs, ideas |
| Numeric defaults | `ASTROLABE/docs/reference/defaults.md`; code `K/Defaults.kt` | core-code |
| Why a rule exists | `ASTROLABE/REVIEW.md` → `SOURCE-REGISTER.md` → `docs/reference/decisions.md` | core-docs |
| Old `§8.1`-style reference | `ASTROLABE/audit/SECTION-MAP.md` | core-docs |
| Build conventions (explicitApi, no Result, Java forms) | `ASTROLABE/CLAUDE.md › ## Binding conventions`; `TODO.md › ### 2.3` | core-docs |

## Core code (ASTROLABE)
| Topic | First look | Card |
|---|---|---|
| Host entry (Kotlin / Java) | `K/Astrolabe.kt`; `K/java/AstrolabeJava.kt` | core-code |
| Campaign loop, shapes S0–S3 | `K/campaign/Controller.kt` (`open`, `runS0`, `run`); `ShapeSelector.kt` | core-code |
| One model session (cell turn loop) | `K/cell/Cell.kt` `Cell.run`; kernel text `K/cell/Layout.kt` | core-code |
| Tool call parsing and dispatch | `K/tool/ToolCall.kt` `ToolCalls.parse`; `K/tool/Dispatcher.kt` | core-code |
| Acceptance rule (passed/failed/unverified) | `K/verify/Resolution.kt` `Resolver`; `K/campaign/Acceptances.kt` | core-code |
| Who accepts a completion; checks | `K/verify/ExitGate.kt` `Verifier`; `K/verify/Scheduler.kt` | core-code |
| Host callbacks (ask, approve, decide) | `K/event/` `Authority`; events bus `Events` | core-code |
| Store schema and migrations | `K/store/Migrations.kt` (`SCHEMA_VERSION` = 5; per-version tables in core-code › Relationships) | core-code |
| Routing, escalation, recovery | `K/route/Router.kt`, `Escalation.kt`; `K/recover/Ladder.kt` | core-code |
| Knowledge base, skills | `K/kb/` (`StoreKb`, `Curator`, `Retriever`) | core-code |
| Optional layers and flags | `K/Config.kt` `Flags`; `K/campaign/OptionalLayers.kt` | core-code |
| Public ABI of a class | `rg -a 'io/astrolabe/<pkg>/<Name>' ASTROLABE/core/api/core.api` | core-code |
| Test fakes and fixture repos | `ASTROLABE/core/src/testFixtures/` (`FakeAdapter`, `ScriptedModel`, `TempRepo`) | core-code |
| Evaluation / fixture runner | `ASTROLABE/eval/` `FixtureRunner`; `eval/README.md` | core-code |

## Model transport (AI Gate SDK and its adapter)
| Topic | First look | Card |
|---|---|---|
| Core ↔ SDK adapter | `ASTROLABE/provider-ai-gate/src/main/kotlin/io/astrolabe/provider/aigate/` (`AiGateAdapter`, `ProfileBinding`) | core-code, sdk |
| Adapter design (A-/G-/S- items) | root `ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md` (§5.6 `gate` block) | root-docs |
| SDK entry point | `P/Llm.java` (`Llm.builder`, `complete`, `stream`, `start`) | sdk |
| Add a provider, config only (OpenAI/Anthropic-compatible) | `P/providers/ProvidersConfig` templates; `OpenAiCompatible.custom` | sdk |
| Add a provider with a new wire format / vendor preset | `P/spi/protocol/WireApi`; `P/vendors/<family>/`; `ProviderBundle` + `META-INF/services` | sdk |
| OAuth / ChatGPT (Codex) sign-in | `P/auth/interaction/AuthInteraction`; `P/internal/auth/oauth/StandardOAuth.java` | sdk |
| Streaming and UI events | `P/chat/stream/ChatEvent`; `P/event/RequestEvent`, `LlmListener` | sdk |
| Errors | `P/error/LlmException`, `ErrorCode`; mapping `P/internal/http/HttpErrors` | sdk |
| Model catalog | `P/catalog/ModelCatalog`; `llm/src/main/resources/net/ai/gate/catalog/models.json` (generated) | sdk |
| SDK test fakes | `P/testing/FakeProvider` | sdk |

## Studio (ASTROUI)
| Topic | First look | Card |
|---|---|---|
| Studio spec (current) | root `ASTROLABE_UI_V2_SIMPLE.md`; screens `ASTROLABE_UI_V2_MOCKUP.html` | studio, root-docs |
| Socket/REST protocol reference | root `ASTROLABE_UI_BEST_MIX.md › ## 27.`, `## 28.`; code `S/ws/StudioSocket.java` | studio |
| REST endpoints | `S/api/SimpleApi.java`; client `A/core/` (`Api`, `model.ts`) | studio |
| How the Studio drives the core | `B/StudioHost.kt`; authority `S/decisions/DecisionService.java` | studio |
| Answering a card (approval, question, acceptance) | `POST /api/v1/tasks/{id}/cards/{cardId}` → `TaskService.card` → `DecisionService`; UI `A/features/task/cards.ts` | studio |
| Task lifecycle, states | `S/tasks/TaskService.java` (`launch`, `stateOf`, `card`) | studio |
| Event → timeline / Flow | `S/live/EventPipeline.java` → `A/timeline/` `Timeline.apply`; `A/features/panel/flow/` | studio |
| Model accounts, sign-in | `S/accounts/` (`AccountService`, `LoginService`); `S/runtime/TransportService.java` | studio |
| Demo mode | `B/fixture/FixtureBrain.kt`, `FixtureRepos.kt`; `STUDIO_FIXTURES` | studio |
| UI texts (EN/RU) | `A/i18n/catalog.en.ts`, `catalog.ru.ts`; banned terms `A/vocabulary.ts` | studio |
| Studio DB, security | `S/db/StudioDb.java` `MIGRATIONS`; `S/security/LocalSession.java` | studio |

## Research and history
| Topic | First look | Card |
|---|---|---|
| External harness research, idea X in ASTROLABE? | `ideas/_map/README.md` → `CROSSWALK.md` | ideas |
| Studio UI design history | `root-docs` card › B (drafts → BEST_MIX → V2) | root-docs |
| SDK design history | `llm-transport-sdk/docs/proposals/final-architecture.md` (by section) | sdk |
| Session history of the core | `ASTROLABE/audit/SESSION-HISTORY.md`; journals `audit/OUT-OF-ORDER-*.md` | core-docs |

## Do not start from
`ASTROLABE/TODO.md` (680 KB) or `findings.md` (365 KB) whole · `ASTROLABE_UI_{DESIGN,FABLE,OPUS,BEST_MIX}.md`,
`BEST_CONCEPTS_MIXED.md` (superseded, 160–300 KB) · `tasks/` (superseded Workbench plan) · `ideas/astrolab/`
(stale docs snapshot) · `ASTROLABE/sources/` (archived drafts) · `devtools/`, `llm-transport-sdk/{examples,examples2,tools}/`
(vendored).
