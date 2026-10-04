---
card: workspace
title: Workspace overview — system, repos, build, authority
scope: whole workspace C:\work.astrolab
repo: ASTROLABE @ 0fc8de9 · llm-transport-sdk @ 0912d8a · root @ 2aea5d9 (all main)
verified: 2026-09-30
read-when: first orientation; how the three repos fit; which source wins; build/run entry points
---
# Workspace overview

## What this is
A coding-agent product built in one owner's workspace (all dates 2026):
- **ASTROLABE** — Kotlin/JVM SDK for a coding-agent *harness*: the host opens a project, starts a *campaign*; the
  controller runs model sessions (*cells*) that act only through typed tools; a verifier (not the model) decides
  acceptance; all state is durable in SQLite. Core philosophy: authority outside the model, evidence-based acceptance,
  deterministic policies, bounded context, optional layers off by default. Spec-first (`ASTROLABE/docs/**`),
  then implemented through phases P0–P6 against a fake provider.
- **AI Gate** (`llm-transport-sdk`) — Java 26 library `net.ai.gate`: one facade over OpenAI Responses/Chat,
  Anthropic Messages, Gemini, incl. ChatGPT-subscription ("Codex") OAuth, catalog, events, fakes.
- **ASTROLABE Studio** (`ASTROUI`) — local web app (Spring Boot + Kotlin bridge + Angular) where a user connects a
  model, opens a project folder, gives a task, answers the agent's questions, reviews and commits changes.

## Runtime chain
```
Angular UI ──REST /api/v1 + socket /api/v1/ws──▶ Spring Boot server (127.0.0.1:8740)
   └▶ bridge StudioHost ──▶ ASTROLABE Controller.open/run ──▶ Cell ──▶ tools / Verifier / Resolver
          ▲ Authority (ask, approve, review, decide) ◀── DecisionService      │ model calls
          └──────────────────────────────────────────────  ProviderAdapter ◀──┘
                                                       = AiGateAdapter (:provider-ai-gate) ──▶ net.ai.gate.Llm ──▶ providers
```
State: Studio `studio.db` + credentials in `%LOCALAPPDATA%\AstrolabeStudio`; ASTROLABE `state.sqlite` per project in
its own OS state dir (not in the project repo); change snapshots as git refs `refs/astrolabe/...` in the project.

## Repositories
| Dir | Git | Language / build | Card |
|---|---|---|---|
| `ASTROLABE/` | nested repo, 524 commits since 09-20 | Kotlin 2.4.20, Gradle 9.7.1, JDK 26; modules `provider-api`, `core`, `eval`, `index-treesitter`, `provider-ai-gate` | `core-code`, `core-docs` |
| `llm-transport-sdk/` | nested repo since 09-26 | Java 26 JPMS module, `llm/` (+ `llm/kotlin`) | `sdk` |
| `ASTROUI/`, root `*.md` | root repo since 09-28 | Spring Boot 4.1 (Java), Kotlin bridge, Angular 22 | `studio`, `root-docs` |
| `ideas/` | untracked | research corpus with own map | `ideas` |
| `diags/`, `devtools/` | untracked | Studio data export; JDK 26 + Gradle binaries | `root-docs` |

Build graph (Gradle composite): `ASTROUI/settings.gradle.kts` → `includeBuild("../ASTROLABE")` →
`includeBuild("../llm-transport-sdk/llm")` + `:provider-ai-gate` (only if that checkout exists). Nested repos are
separate git histories; commit in each with `git -C <dir>`.

## Authority and precedence
1. Code of each repo (and its ABI dumps `ASTROLABE/*/api/*.api`).
2. Per-repo canonical docs: ASTROLABE `CLAUDE.md` (workflow), `TODO.md` (status, decisions `D-nn`), `docs/**` (spec);
   SDK `llm/README.md`, `llm/CHANGELOG.md`, `package-info.java`; Studio `ASTROUI/README.md`, `ASTROUI/docs/*.md`.
3. Current owner specs at the root: `ASTROLABE_UI_V2_SIMPLE.md` (Studio), `next-goal.md` + `phase0-report.md`
   (phase 0), `FABLE_ANALYZE_AND_IDEAS.md` (proposed next steps, not yet decided).
4. Everything else at the root and in `ideas/` is historical input (card `root-docs` says which).
Owner rule since phase 0: fix a problem in the repo that owns it (core or SDK), not with a Studio workaround.

## Timeline (why things look the way they do)
- 09-20 ASTROLABE 1.0.1 spec (merge of drafts A/B/C) → TODO plan; P0–P6 implemented by 09-26 (185 tasks).
- 09-24/28 implementation audit (`findings.md`, 142 fixes); 09-24 research corpus `ideas/`.
- 09-26/28 AI Gate SDK designed and built; 09-28 integration analyses → `:provider-ai-gate` (D-326–D-336).
- 09-29 Studio V1 from `ASTROLABE_UI_BEST_MIX.md`, judged too complex → V2 "Simple by default" frontend rewrite.
- 09-29/30 live tests (`diags/`, `goal-reasearch.md`) → diagnosis `final_analyze.md` → phase 0 (`next-goal.md`):
  acceptance rule in the core (every obligation passed/failed/unverified; the user decides unverified), D-337–D-356;
  Codex SSE fix in the SDK; Studio acceptance UI. Report: `phase0-report.md`.

## Commands (details in each card)
- Env: `export JAVA_HOME=/c/work.astrolab/devtools/jdk-26.0.2.1+1` (ASTROLABE CLAUDE.md names a `~/.gradle/jdks` path).
- Core focused test: `./gradlew :core:test --tests 'io.astrolabe.<pkg>.<Class>Test'` in `ASTROLABE/`; gate `build`.
- SDK: `./gradlew build` in `llm-transport-sdk/llm/`; `liveTest` is opt-in and billable.
- Studio: `./gradlew studio` then `java -jar backend/server/build/libs/astrolabe-studio.jar` in `ASTROUI/`;
  `npm test`, `npm run e2e` in `ASTROUI/frontend`.

## Cross-repo pitfalls
- Root `.gitignore` hides the nested repos, `ideas/`, `diags/`, `devtools/` from `rg`/Grep run at the root.
- The same ID prefix means different things per document (`S-nn`, `A-nn`, `F-nn`, `D-nn`, `§n`); qualify by file.
- `D-nn` numbering exists in both ASTROLABE (`TODO.md › ## 3`) and Studio (`ASTROUI/docs/decisions.md`: `D-n`, `D2-n`).
- Several root docs and `phase0-progress.md`/`diags/` contain account ids or local paths: never paste them into prompts.

## Freshness
- `ASTROUI/settings.gradle.kts`
- `ASTROLABE/settings.gradle.kts`
- `ASTROLABE/CONTINUE-TASK.md`
- `ASTROUI/README.md`
- `.gitignore`
