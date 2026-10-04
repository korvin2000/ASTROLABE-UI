---
card: root-docs
title: Root-level documents register
scope: root *.md/*.html files, LICENSE, .gitignore, diags/, devtools/
repo: . (root) @ 2aea5d9 (main)
verified: 2026-09-30
read-when: which top-level doc is current or canonical, what superseded what, how to enter a 100-300 KB doc cheaply
---
# Root-level documents register
The workspace root holds ~21 documents, many 50–300 KB: the transport-integration set (2026-09-28), the Workbench/Studio UI
design drafts (2026-09-29), and the post-live-test analysis and phase 0 set (2026-09-30). Most are dated working
papers. Only a few are live contracts: `ASTROLABE_UI_V2_SIMPLE.md` (+ mockup), `phase0-report.md`, and
`next-goal.md` (phase 0 spec, now executed). Never open these whole: use the anchors below (heading text, `rg -n`).

## Canonical sources
- `ASTROLABE_UI_V2_SIMPLE.md` — canonical Studio spec today (named by `ASTROUI/README.md`); wins over the mockup text.
- `ASTROLABE_UI_V2_MOCKUP.html` — visual reference for V2 (9 screens, light/dark, working Flow view).
- `ASTROLABE-2-PLAN.md` — **active program ASTROLABE 2.0** (canonical; changes only via its §17); `plan2/` holds WP cards
  (`WP-<id>.md`, rules `COMMON.md`) and line reports (`reports/`); status lives in `ASTROLABE/TODO.md` phase P8.
- `phase0-report.md` — what phase 0 changed and measured (`ASTROLABE/CONTINUE-TASK.md` cites it).
- `next-goal.md` — phase 0 spec (executed); its owner rules (clean fix in core, no back-compat) stay in force.
- `ASTROLABE_UI_BEST_MIX.md` — still the reference for the protocol layer only (ASTRO-WS/1, security, persistence).
- Code and code docs beat all of these: `ASTROLABE/SOTA-BEST-MIXED-AGENT.md`, `ASTROUI/`, `ASTROLABE/CONTINUE-TASK.md`.

## Timeline / lineage
```
09-28  transp_integr_request -> TRASPORT_INTEGRATION_ANALYZE (A) + _01 (B) -> 2 x *_CHANGES_FOR_* (A+B reconciled)
       -> implemented: core :provider-ai-gate (D-326..D-336) and SDK extensions (live in ASTROLABE/, llm-transport-sdk/)
09-29  ui_goals (brief) -> UI_DESIGN, UI_FABLE, UI_OPUS (3 parallel drafts)
       -> BEST_CONCEPTS_MIXED ("Workbench" merge) and UI_BEST_MIX ("Studio" merge, OPUS baseline)
       -> Studio V1 built in ASTROUI from BEST_MIX (judged a rough prototype in new_goal.md)
       -> new_goal.md -> UI_V2_SIMPLE + V2_MOCKUP (frontend rewritten from scratch, backend kept)
09-30  goal-reasearch (owner complaints after live tests) -> final_analyze (diagnosis, variants A-E, roadmap)
       -> next-goal (phase 0 spec) -> phase0-progress (scratch log) -> phase0-report (result; merged and pushed)
       -> FABLE_ANALYZE_AND_IDEAS (cheap follow-ups after phase 0) -> create_index (request for this memory)
```

## Map
Status: C canonical, CUR current, H historical, S superseded, REQ request/brief. Git: T tracked, U untracked.
KB are approximate. RU = Russian prose.

### A. Transport integration (2026-09-28; all H: implemented, truth moved into code and changelogs)
| Path | KB | Git | Status | What / how to enter |
|---|---|---|---|---|
| `transp_integr_request.md` | 2 | T | REQ | owner brief for the integration analysis; read whole |
| `TRASPORT_INTEGRATION_ANALYZE.md` | 62 | T | H | analysis A; `## 1. Verdict`, `## 4. Compatibility matrix` |
| `TRASPORT_INTEGRATION_ANALYZE_01.md` | 94 | T | H | B; `## 14. Missing work and ownership`, `## 19. SDK changes` |
| `ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md` | 54 | T | H | ASTROLABE side; IDs `A-nn` core, `G-nn` adapter |
| `LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md` | 34 | T | H | SDK side; IDs `S-nn`; same scheme as above |
"TRASPORT" is the original spelling; use it in `rg` and globs. A and B are reconciled in `## 0. How the two analyses`
of both `*_CHANGES_FOR_*` files, which supersede A and B as the actionable plan. Outcome: core `:provider-ai-gate`.

### B. UI design drafts, Workbench/Studio V1 (2026-09-29)
| Path | KB | Git | Status | What / how to enter |
|---|---|---|---|---|
| `ui_goals.md` | 5 | T | REQ | brief for all V1 drafts (Angular + Spring Boot, WebSocket, Agent Overview) |
| `ASTROLABE_UI_DESIGN.md` | 159 | T | S | "Workbench" v1.0.1; compact baseline of the three drafts |
| `ASTROLABE_UI_FABLE.md` | 262 | T | S | "Console"; `## 2. Architecture findings`, `Appendix A. Event catalog` |
| `ASTROLABE_UI_OPUS.md` | 248 | T | S | "Studio"; `## 2. ASTROLABE through the UI lens`, `## 10. Agent Overview` |
| `BEST_CONCEPTS_MIXED.md` | 176 | T | S | merge of the three (DESIGN baseline); `## 0. Comparative assessment` |
| `ASTROLABE_UI_BEST_MIX.md` | 296 | T | S (UI) / ref (protocol) | merge with OPUS baseline; see below |
- DESIGN, FABLE, OPUS: competing drafts from one brief; they are the inputs of both merges.
- BEST_CONCEPTS_MIXED: "Workbench" merge, sections 0-18, required-work IDs `G01-G10`. Sibling of BEST_MIX.
- BEST_MIX: OPUS baseline + FABLE fact base + DESIGN command/idempotency model (`Appendix E.1`). Basis of ASTROUI V1.
  Anchors: `## 2. ASTROLABE through the UI lens`, `## 27. WebSocket protocol — ASTRO-WS/1`, `## 28. REST API`,
  `## 29. Shared DTO catalogue`, `## 30. Security and privacy`, `## 17. Settings`, `Appendix B — Settings inventory`,
  `Appendix E — Merge provenance and resolved conflicts` (what core really emits vs what drafts claimed).
  IDs: `G-nn` gap/required work (G-01..G-3x), `OD-nn` open decision, `S-nn`, `BE-nn`, `FE-nn`.
- The two merges were made the same day; V2 names both as superseded (UI parts). `new_goal.md`: V1 followed BEST_MIX.

### C. Studio V2 (2026-09-29; current)
| Path | KB | Git | Status | What / how to enter |
|---|---|---|---|---|
| `new_goal.md` | 1 | T | REQ | why V1 was rejected, decision to rewrite the frontend; read whole |
| `ASTROLABE_UI_V2_SIMPLE.md` | 81 | T | C | "Studio 2 — Simple by default" v2.1; RU summary in `## 0. Резюме (RU)` |
| `ASTROLABE_UI_V2_MOCKUP.html` | 61 | T | C (visual) | 9 `.screen` blocks, one `.screen.on`; JS object `Flow` |
- V2 anchors: `## 1. Decision`, `## 4. Layout and navigation`, `## 5. First run`, `## 6. Accounts and models`,
  `## 7. Task workflow`, `## 8. Side panel` (Flow view in 8.2), `## 12. Backend changes`, `## 15. Acceptance scenarios`,
  `## 16. Out of scope`, `## 17. Implementation request`, `Appendix A` (events to timeline), `Appendix D` (Flow).
- IDs: `P-n` principle, `UX-n`, `BE-n`, `FE-n`, `S-n` spike, `E-n` error, `A-n` acceptance scenario.
- Mockup `<title>` is "ASTROLABE Studio 2 — mockup"; screens 4 and 9 hold the working Flow reference.

### D. Live-test analysis and phase 0 (2026-09-30)
| Path | KB | Git | Status | What / how to enter |
|---|---|---|---|---|
| `goal-reasearch.md` | 10 | T | REQ | owner complaints (reviewer as crutch, plan on every query), test models; RU |
| `final_analyze.md` | 112 | U | H/CUR | RU; diagnosis and roadmap; anchors below |
| `next-goal.md` | 78 | U | C (executed) | RU; phase 0 spec; anchors below |
| `phase0-progress.md` | 11 | U | H | English scratch log of phase 0; superseded by the report |
| `phase0-report.md` | 16 | T | C | English; result of phase 0 |
| `FABLE_ANALYZE_AND_IDEAS.md` | 75 | U | H | RU; post-phase-0 improvements; ranking superseded by `further_development_ideas.md` |
| `create_index.md` | 4 | U | REQ | the request that created this `.llm-memory/`; not project content |
- `final_analyze.md` anchors: `## 0. Вердикт на одной странице`, `## 2. Что показывают логи`,
  `## 3. Диагноз: восемь корневых причин` (IDs `RC1`..`RC8`), `## 4. Критика концепции`,
  `## 8. Стратегические варианты` (variants A-E; B "proportional ASTROLABE" recommended),
  `## 9. Целевая архитектура варианта B`, `## 10. Дорожная карта и стоимость` (phase 0 rows `0.1`..),
  `Приложение A. Карта кода`. Also uses `F-nn`.
- `next-goal.md` anchors: `## 2. Правило владельца (главное требование фазы)`, `## 4. Шаг 1. Живая диагностика`,
  `## 5. Часть A. Ядро: правило приёмки` (A1-A7; A8, A9 sit in part E), `## 6. Часть B. Studio поверх ядра`,
  `## 7. Часть C`, `## 8. Часть D. Меньше токенов`, `## 9. Часть E`, `## 10. Живая приёмка`,
  `## 11. Готово, когда`, `## 12. Решения, принятые по умолчанию`, `## 13. Вне объёма`.
  It overrides `final_analyze.md` §10 where they differ (wider scope, stated in its header).
- `phase0-report.md` anchors: `## Revisions`, `## The owner's two questions`, `## Why Luna never finished`,
  `## What changed`, `## Metrics: before and after`, `## Invariants I1–I7 and where they are tested`,
  `## Follow-up: Next from the cursor (D-356`, `## Not verified, and why`. `D-337`.. = core decisions.
- `FABLE_ANALYZE_AND_IDEAS.md` anchors: `## 0. Главное на одной странице`,
  `## 3. Откуда берётся «план на каждый запрос»`, `## 7. Ranking` (`R1`.., `R3a`..), `## 8. План по волнам`,
  `## 9. Решения, которые нужны от владельца`, `## 10. Что должно остаться обязательным`, `## 13. Чего я не проверил`.
  Continues `final_analyze.md` and `next-goal.md` after phase 0 was merged.
- `phase0-progress.md` has transient auth notes; do not quote or reuse them.

### D2. Efficiency and further development (added 2026-10-02; preceding inventory verified 2026-09-30)
| Path | Status | How to enter |
|---|---|---|
| `harness-efficiency-analysis.md` | CUR report, not a universal benchmark | `## 0. Вердикт`, live runs and remaining work; D-363–D-375 |
| `efficiency-progress.md` | H handoff | revisions and limits of the live runs; current core work remains in its handoff |
| `further_development_ideas.md` | CUR proposal, v2 | `## 4.` balance governor; `## 5.` ranking; `## 11.` recorded owner decisions |
| `astra_development_ideas.md` | CUR critical supplement | `## 2.` corrections; `## 3.` code findings; `## 5.` ranking; `## 9.` plan |
The supplement preserves the original analysis; recommendations are not implemented changes or new live evidence.

### E. Other root files
| Path | Status | Notes |
|---|---|---|
| `LICENSE` | C | GNU GPL v3 text; no project-specific content |
| `.gitignore` | C | ignores `/ASTROLABE/`, `/llm-transport-sdk/`, `devtools/`, `diags/`, `ideas/`, `ASTROUI/.idea/` |
So the root git tracks only ASTROUI, these docs and the ignore rules; nested repos and `ideas/` are outside it.

### F. `diags/` (untracked, ignored) and `devtools/` (ignored)
- `diags/` — JSON export of Studio 0.2.0 data from the first live tests (2026-09-29/30); input to
  `goal-reasearch.md` and `final_analyze.md`. Files: `accounts.json`, `audit.json`, `host.json` (versions, JDK),
  `model-requests.json` (60 KB; per call provider, model, outcome, latency, tokens; its `FAILED` `openai-codex` rows
  are the review-pass failure), `preferences.json`, `projects.json`, `settings.json`, `tasks/` (3 `W-*` dirs).
  Holds an account id and local paths: never paste into prompts. Snapshot only; later runs are not in it.
- `devtools/` — toolchain, never index: `jdk-26.0.2.1+1/`, `gradle-9.7.1/`, and `capture-screenshot.mjs`
  (small Node script taking a headless-browser screenshot of the running editor; unrelated to the agent core).

## Where to look
| Question | Go to |
|---|---|
| What is the Studio UI spec now | `ASTROLABE_UI_V2_SIMPLE.md` › `## 1. Decision`, `## 4.`, `## 7.` |
| How each V2 screen looks | `ASTROLABE_UI_V2_MOCKUP.html` (`rg -n 'class="screen'`) |
| WebSocket/REST/DTO protocol of Studio | BEST_MIX › `## 27.`, `## 28.`, `## 29.`; then verify in `ASTROUI/backend` |
| Does the core emit event X | BEST_MIX › `Appendix E.2`; then `rg 'events' ASTROLABE/core/src/main` |
| Why tasks looped / reviewer failed | `final_analyze.md` › `## 3.`; `phase0-report.md` › `## Why Luna never finished` |
| What phase 0 delivered, metrics | `phase0-report.md` › `## What changed`, `## Metrics: before and after` |
| Acceptance rule design (A1-A9) | `next-goal.md` › `## 5.`; code in `ASTROLABE/` package `io.astrolabe.verify` |
| What to improve next, cheaply | `further_development_ideas.md` › `## 5. Ranking`; critical supplement `astra_development_ideas.md` › `## 5.` |
| SDK wiring into the core | `*_CHANGES_FOR_*` (`S-nn`/`A-nn`/`G-nn`); truth in `ASTROLABE/` `:provider-ai-gate` |
| Idea corpus | `ideas/_map/README.md` (other card) |

## Relationships
- V1 drafts feed BEST_MIX; BEST_MIX fed the ASTROUI V1 build; V2 supersedes its UI parts; `ASTROUI/README.md` points
  to V2 and its mockup. `ui_goals.md` and `new_goal.md` are the briefs at each stage.
- `goal-reasearch.md` -> `final_analyze.md` -> `next-goal.md` -> `phase0-report.md`; the report is cited by
  `ASTROLABE/CONTINUE-TASK.md`; `ASTROUI/README.md` cites `next-goal.md` for why the backend may change.
- Phase 0 touched three repos (core, SDK, Studio); `phase0/*` branches were merged into `main` (per the report).

## Status and conflicts
- Duplicates: both `*_CHANGES_FOR_*` files also exist in `llm-transport-sdk/` (committed there in `372969a`,
  "added astrolabe ai coding agent compatibility layer"). Same text: `diff` ignoring CR is empty, line counts equal
  (631 and 422). `git hash-object --no-filters` differs only because the SDK copies are CRLF and the root copies LF.
  Treat as one historical document; the root copy is the one tracked by the root repo, the SDK copy ships with the SDK.
- UI drafts DESIGN/FABLE/OPUS are superseded by the two merges, which V2 supersedes (UI parts). Their claims about
  core events were found false in places (BEST_MIX `Appendix E.2`); trust code over them.
- V2 header: where mockup and text differ, the text wins.
- `final_analyze.md` figures (9 tasks, 207 calls, 1.53 M tokens, 2 of 9 done) are pre-phase-0 and stale as status;
  `phase0-report.md` and `FABLE_ANALYZE_AND_IDEAS.md` (34 post-phase-0 runs) hold later numbers.
- Untracked per `git status`: `FABLE_ANALYZE_AND_IDEAS.md`, `create_index.md`, `final_analyze.md`, `next-goal.md`,
  `phase0-progress.md`. `next-goal.md` is cited by tracked `ASTROUI/README.md` and `ASTROLABE/CONTINUE-TASK.md` yet has
  no git history; `final_analyze.md`, its stated basis, is likewise unversioned.
- Not checked here (unverified): whether the V2 frontend rewrite is fully implemented in `ASTROUI/`.

## Pitfalls
- File names are misspelled (`TRASPORT_*`, `goal-reasearch.md`); do not "fix" them, other files cite them.
- Russian docs (`goal-reasearch`, `final_analyze`, `next-goal`, `FABLE_ANALYZE_AND_IDEAS`, V2 section 0) need RU
  patterns: `rg -n 'Вердикт|Диагноз|Ranking'`. The rest is English.
- Workbench, Studio and Console are names for one product idea across drafts; V1 drafts are not alternatives to V2.
- ID prefixes collide across documents: `S-nn` is an SDK change (CHANGES files) but a spike in V2; `A-nn` is a core
  change there but an acceptance scenario in V2; `D-nn` is a core decision record (in `ASTROLABE/`), not a section.
- BEST_MIX, FABLE and OPUS are 250-300 KB each: grep, never read whole.

## Freshness
- `ASTROLABE_UI_V2_SIMPLE.md`
- `ASTROLABE_UI_V2_MOCKUP.html`
- `ASTROLABE_UI_BEST_MIX.md`
- `BEST_CONCEPTS_MIXED.md`
- `ASTROLABE_UI_DESIGN.md`
- `ASTROLABE_UI_FABLE.md`
- `ASTROLABE_UI_OPUS.md`
- `ui_goals.md`
- `new_goal.md`
- `goal-reasearch.md`
- `final_analyze.md`
- `next-goal.md`
- `phase0-progress.md`
- `phase0-report.md`
- `FABLE_ANALYZE_AND_IDEAS.md`
- `harness-efficiency-analysis.md`
- `efficiency-progress.md`
- `further_development_ideas.md`
- `astra_development_ideas.md`
- `create_index.md`
- `transp_integr_request.md`
- `TRASPORT_INTEGRATION_ANALYZE.md`
- `TRASPORT_INTEGRATION_ANALYZE_01.md`
- `ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md`
- `LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md`
- `llm-transport-sdk/ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md`
- `llm-transport-sdk/LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md`
- `LICENSE`
- `.gitignore`
- `diags/`
