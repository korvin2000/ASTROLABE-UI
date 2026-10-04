---
card: studio
title: ASTROLABE Studio (ASTROUI) and the tasks/ notes
scope: ASTROUI/, tasks/
repo: . (root) @ 2aea5d9 (main)
verified: 2026-09-30
read-when: where is X in the Studio (bridge, server, Angular app); how it drives core and AI Gate; is tasks/ current
---
# ASTROLABE Studio (ASTROUI) and the tasks/ notes
Studio is a local single-user web app over the ASTROLABE coding-agent core: a Kotlin bridge drives the core's public
`Controller` through `AiGateAdapter` over the AI Gate SDK (`Llm`). A Spring Boot 4.1 server (JDK 26, loopback
`127.0.0.1:8740`) serves REST `/api/v1`, the ASTRO-WS/1 socket and the Angular 22 bundle (one jar). Tracked in the root
repo under `ASTROUI/`. Status: **current**, "Studio 2" plus phase 0 (2026-09-30: the core decides acceptance, the
Studio answers it). `tasks/` is stale (see Status and conflicts).

## Canonical sources
- `ASTROUI/backend`, `ASTROUI/frontend/src` — the code; truth for every claim below.
- `ASTROUI/docs/decisions.md` — deviations (D-*, D2-*), owner decisions (OD-*), upstream findings (F-*), versions.
- `ASTROUI/docs/progress.md` — done, verified (tests, acceptance A-*, spikes S-*) and open; phase 0 section last.
- `ASTROUI/README.md` — run/develop/test commands, env variables, routes, known limits.
- `ASTROLABE_UI_V2_SIMPLE.md` (root) — **canonical Studio 2 spec**: §12.3 endpoints, §12.4 socket, §13 frontend,
  Appendix A event->timeline, Appendix D event->Flow. `ASTROLABE_UI_V2_MOCKUP.html` is the visual reference; text wins.
- `ASTROLABE_UI_BEST_MIX.md` (root) — first-Studio spec; still the protocol reference (§25 backend, §26 persistence,
  §27 ASTRO-WS/1, §28 REST, §29 DTOs, §30 security). Its UI parts are superseded by V2_SIMPLE.
- `phase0-report.md`, `next-goal.md` (root; `next-goal.md` untracked) — phase 0 goal and report; see `root-docs` card.

## Map
Bases: `brg/` = `ASTROUI/backend/bridge/src/main/kotlin/io/astrolabe/studio/bridge/`,
`srv/` = `ASTROUI/backend/server/src/main/java/io/astrolabe/studio/`, `app/` = `ASTROUI/frontend/src/app/`.

**Bridge** (`io.astrolabe.studio.bridge`; Kotlin; no UI logic; never writes ASTROLABE tables)
| Path | Responsibility | Key symbols / anchors |
|---|---|---|
| `brg/StudioHost.kt` | Per-campaign `Controller`, event bus, lifecycle, reads | `launch`, `start`, `resume` |
| `brg/HostApi.kt` | Java-facing surface: specs, refs, authority port | `StartSpec`, `AuthorityPort` |
| `brg/HostAuthority.kt` | Core `Authority` <-> JSON <-> host future | `PortAuthority` |
| `brg/StoreReads.kt` | Read-only SQL over ASTROLABE's store (OD-02) | `StoreReads.campaigns` |
| `brg/Verification.kt` | What a task is accepted against without tests | `Verification.choose` |
| `brg/Guidance.kt` | Host notes told to the agent (F-9) | `Guidance.NOTES` |
| `brg/AutoProfiles.kt` | Profile from the catalog for a model; output reserve | `AutoProfiles.make` |
| `brg/ConfigSupport.kt` | `Config` JSON <-> kotlinx; library validation | `ConfigSupport.runConfig` |
| `brg/ContractPatches.kt`, `RepoInspect.kt`, `Versions.kt` | Amendment patches; sniffed commands; versions | |
| `brg/fixture/FixtureBrain.kt` | Scripted demo model on the SDK `FakeProvider` | `PROVIDER`=`studio-demo` |
| `brg/fixture/FixtureRepos.kt` | Demo git repo "demo-shop", its two requests | `FixtureRepos.demoShop` |

**Server** (`io.astrolabe.studio.*`; wire DTOs are Jackson trees, no generated schema: D-1)
| Path | Responsibility | Key symbols / anchors |
|---|---|---|
| `srv/Studio{Application,Startup,Properties}` | Entry; start order; `studio.*` config | `StudioStartup.ready` |
| `srv/api/` | REST; `SimpleApi` = every Studio 2 endpoint | `SimpleApi`, `Raw.json` |
| `srv/ws/StudioSocket` | ASTRO-WS/1 at `/api/v1/ws` | `handleTextMessage` |
| `srv/live/EventPipeline` | Bus -> normalizer -> `event_log` -> topics; journal tail | `ingest`, `studioItem` |
| `srv/live/{EventLog,TopicBroker}` | Durable stream per campaign; session delivery; `app` topic | `publishApp` |
| `srv/tasks/TaskService` | Task = first run + follow-ups: start, messages, state, cards | `launch`, `stateOf`, `card` |
| `srv/tasks/ReviewPass` | Host's second model call that verifies a change | `ReviewPass.review` |
| `srv/tasks/` (others) | Panel data, project settings, diagnostics export | `ProjectSettings`, `OutputService` |
| `srv/decisions/DecisionService` | `AuthorityPort` impl; decision rows; ask/auto policy | `HostPolicy`, `decide` |
| `srv/campaigns/CampaignService` | `campaign_index`, open/resume/cancel, display status | `open`, `TaskRun` |
| `srv/changes/` | `ChangesService` diffs; `LandingService` Undo/Commit (git writers) | `LandingService` |
| `srv/accounts/` | `AccountService` accounts and keys; `LoginService` sign-in | port 1455 (ChatGPT) |
| `srv/models/ModelService` | Usable models, recommendation, effort fit, bind | `bind`, `ensureDefault` |
| `srv/projects/ProjectService` | Project registry, open via bridge, demo repo | `ensureDemo` |
| `srv/settings/` | `Preferences` (Studio 2); `SettingsService`+`SettingsSchema` (old) | `Preferences` |
| `srv/runtime/` | `HostService` owns `StudioHost`; `TransportService` owns `Llm` | `build`, `demoMode` |
| `srv/security/LocalSession` | Launch token, cookie, CSRF, Host/Origin, CSP filter | `CSRF_HEADER` |
| `srv/db/StudioDb` | `studio.db` SQLite (WAL) and migrations | `MIGRATIONS` |
| `srv/support/` | `StudioError` catalog, `ApiException`, `ErrorHandling`, `Git`, `Json` | `StudioError.from` |
| `srv/fs/FolderService` | Folder dialog listing (folders only) | |
| `srv/{providers,stats,commands}/` | Old leftovers: profile qualification, stats, commands | `CommandService` |
| `srv/src/main/resources/` | `application.yml` (env mapping), `recommended-models.json` | `STUDIO_*` |

**Frontend** (Angular 22, standalone, signals, zoneless)
| Path | Responsibility | Key symbols / anchors |
|---|---|---|
| `app/{app,app.routes,app.config}.ts` | Shell; five routes; guards | `home`, `needsSetup` |
| `app/core/` | REST client, socket client, hand-written wire types | `Api`, `StudioSocket`, `model.ts` |
| `app/state/` | `AppStore` (`/app` + `app` topic); `TaskStore` (open task) | `TaskStore.follow` |
| `app/timeline/` | Event -> conversation reducer; tool call -> step, node | `Timeline.apply`, `nodeOf` |
| `app/features/task/` | Task view, composer, cards, acceptance, actions | `cards.ts`, `error-actions.ts` |
| `app/features/panel/` | Side panel: Changes, Progress (rail + Flow), Output | `changes.ts`, `progress.ts` |
| `app/features/panel/flow/` | The Flow: model, layout, routes, motion, SVG stage | `FlowModel`, `LINES` |
| `app/features/settings/` | 19 settings, five sections, search | `SETTINGS` |
| `app/features/{shell,welcome,accounts}/` | Sidebar; first run; connect dialog, model picker | |
| `app/i18n/` | EN/RU catalogs, `I18n`, `translate`, `Text` | `catalog.en.ts` |
| `app/ui/`, `app/vocabulary.ts` | Dialog, diff, markdown, icons; forbidden terms | `parseUnified`, `FORBIDDEN` |
| `ASTROUI/frontend/src/testing/` | Recorded task logs (`*.events.json`) replayed by specs | |
| `ASTROUI/frontend/e2e/` | `a1.mjs` scenario A-1; `driver.mjs` headless Chrome/Edge | |

**Build** (`ASTROUI/`)
| Path | Responsibility | Key symbols / anchors |
|---|---|---|
| `settings.gradle.kts` | Includes `../ASTROLABE`; Kotlin 2.4.20, Boot 4.1.1 | `-Pstudio.astrolabeBuild` |
| `build.gradle.kts` | Task `studio` = `:backend:server:bootJar` | `studio` |
| `backend/server/build.gradle.kts` | `astrolabe-studio.jar`; bundles `dist` as `static/` | `-Pstudio.skipFrontend` |
| `backend/bridge/build.gradle.kts` | `api` deps: core, provider-api, provider-ai-gate, ai-gate | |
| `frontend/{build.gradle.kts,proxy.conf.json}` | Gradle runs npm; dev proxy `/api`(ws), `/launch` -> 8740 | |
| `gradle.properties` | JDK path `../devtools/jdk-26.0.2.1+1`; `studio.version` | |

## Where to look
- Add a REST endpoint: `srv/api/SimpleApi` (`@RequestMapping("/api/v1")`, `Raw.json`), logic in a service, TS type in
  `app/core/model.ts`, call through `Api`. List: `rg -n "@\w+Mapping" ASTROUI/backend/server/src/main/java`.
- Endpoints the UI really calls: `rg "api\.\w+" ASTROUI/frontend/src/app`; all are `SimpleApi` (`/health` only for e2e).
- Socket frames and topics: `StudioSocket.handleTextMessage` (in: hello, sub, unsub, ping, cmd; out: welcome, subbed,
  evt, result, pong, err); spec BEST_MIX §27, V2 §12.4; client `StudioSocket` in `app/core/ws.ts`. Topics: `app`,
  `campaign:<work>`. `app` kinds: `rg 'publishApp\("'`, `AppStore.onApp`. Campaign kinds: bus as-is, `journal.<kind>`,
  `studio.*` (`EventPipeline.studioItem`); reducer switch `Timeline.reduce`.
- Task run -> UI timeline: `TaskService.launch` -> `CampaignService.open` -> `StudioHost.launch` -> bus `Events` ->
  `EventPipeline.ingest` -> `event_log` -> `TopicBroker` -> socket -> `TaskStore.apply` -> `Timeline.apply` +
  `FlowModel.apply`. History: `GET /tasks/{id}/events`. Mapping spec: V2 Appendix A (timeline), D (Flow).
- Task states and reason codes: `TaskService.stateOf`; `StudioError` constants; UI actions `task/error-actions.ts`;
  sentences in both catalogs. Start steps: `TaskService.launch` (account, model, project, busy, lock, open, run).
- Approval, question, acceptance decisions: `DecisionService` (`ask`, `approve`, `decide`, `review`), answered through
  `POST /tasks/{id}/cards/{cardId}` -> `TaskService.card`; UI `task/cards.ts`, `task/acceptance.ts`. Ask/Auto policy:
  `DecisionService.HostPolicy`, `byPolicy`; "always allow": `ProjectSettings.allow` (D2-3, D2-4, D2-22).
- Review pass: `srv/tasks/ReviewPass`, `Verification.REVIEW_MARKER`; demo verdicts by keyword in `FixtureBrain.review`.
  Verification without tests: `Verification.choose`, `StudioHost.verificationOf` (D2-1, F-4, F-5).
- What the agent is told by the host: `Guidance.NOTES`; `CampaignPolicy.hostNotes` in `StudioHost.launch` (D2-25).
- Demo mode: setting 15 (`Preferences.DEMO_MODE`) or `STUDIO_FIXTURES`; `TransportService.build` registers
  `FixtureBrain.provider()`; `ProjectService.ensureDemo`; `FixtureRepos`; tests `FixtureCampaignTest`.
- Texts and i18n: `app/i18n/catalog.en.ts` + `catalog.ru.ts` (`family.name` keys; plurals `.one/.few/.many/.other`),
  `Text{key,params,n}`, `I18n`; language = browser (`language()` in `AppStore`); banned words `app/vocabulary.ts`.
- Flow layout: `flow-layout.ts` (`DESIGN`, `CENTRES`, `MIN_CANVAS`, `COMPACT_BELOW`), `flow-route.ts` (`LINES`),
  `flow-motion.ts`, `flow-model.ts` (events -> node states), `flow-stage.*` (SVG); spec V2 §8.2.
- Changes, Undo, Commit: `ChangesService`, `LandingService`; `panel/changes.ts`, `task/landing-dialogs.ts`; F-2.
- Settings: `features/settings/setting-list.ts`; server `Preferences`, `ProjectSettings`; `/preferences`,
  `/projects/{id}/settings`. Accounts: `AccountService`, `LoginService`, `connect-dialog.ts`. Model: `ModelService`.
- Security: `LocalSession.doFilterInternal`. Schema: `StudioDb.MIGRATIONS`. Why a deviation: `docs/decisions.md`.

**Commands** (`ASTROUI/README.md` › Run, Develop, Tests; `JAVA_HOME` = `devtools/jdk-26.0.2.1+1`, run from `ASTROUI/`)
```
./gradlew studio && java -jar backend/server/build/libs/astrolabe-studio.jar    # packaged; prints /launch?t=...
STUDIO_SECURITY=false ./gradlew :backend:server:bootRun -Pstudio.skipFrontend=true ; (cd frontend && npm start)
./gradlew :backend:bridge:test :backend:server:test ; (cd frontend && npm test ; npm run e2e)    # e2e needs the jar
```
Env: `STUDIO_PORT` 8740, `STUDIO_DATA_DIR`, `STUDIO_SECURITY`, `STUDIO_FIXTURES`, `STUDIO_FIXTURE_LATENCY`,
`STUDIO_ENV_KEYS`, `STUDIO_OPEN_BROWSER`, `STUDIO_DEV_ORIGINS`, `STUDIO_CREDENTIALS` (other credentials file).

**Tests**
- `ASTROUI/backend/bridge/src/test/`: demo tasks through core and adapter (`FixtureCampaignTest`,
  `InteractiveFixtureTest`), `VerificationSetupTest` (S-1, saved checks, review verdict), `OutputHeadroomTest` (F-8).
- `ASTROUI/backend/server/src/test/`: `AcceptanceDecisionsTest`, `ReviewPassTest`, `TaskAcceptanceTest` (phase 0 B1-B3,
  C1-C2). None for REST, socket, security, `StudioDb`, accounts, changes.
- `app/**/*.spec.ts` (vitest): `timeline.spec.ts` (replays of `src/testing`), `flow.spec.ts` (layout at sizes, routes,
  model), `task.spec.ts` (keys, effort, errors, acceptance, steps), `vocabulary.spec.ts` (terms, catalog completeness).
- `ASTROUI/frontend/e2e/a1.mjs`: scenario A-1 on the packaged jar, empty data dir, demo model (`E2E_URL`, `E2E_SHOTS`).

## Relationships
- **To the core:** `StudioHost` builds a `Controller(config, clock, idGen, events, ...)`, calls `controller.open`, then
  `controller.run(opened, model, authority)` in a coroutine job per campaign. Projects open through `Astrolabe.open`
  (takes ASTROLABE's project lock). Host amendments use `amendByHost`; stale leases end via `Leases.acquire(.., ZERO)`.
  Core types cross as kotlinx JSON strings and are passed through untouched (`ConfigSupport.json`).
- **Authority:** the core calls `PortAuthority` -> `DecisionService` (`AuthorityPort`): question, approval, amendment,
  review, acceptance decision. A null answer means "no answer now"; the run waits with a `stopCode`.
- **To AI Gate:** `TransportService` builds the one `net.ai.gate.Llm` (discovered providers, `CredentialStore.file`,
  catalog snapshot, telemetry). It feeds `AiGateAdapter` per campaign and is used directly by `ModelService`,
  `AccountService`, `ReviewPass`. The demo model is the SDK's `FakeProvider`, registered only in demo mode.
- **Phase 0 depends on upstream work:** core D-337..D-356 (`Authority.decide`, `CampaignPolicy.hostNotes`, outcome
  `answered`, `stopCode`) and an SDK fix (untyped SSE body). See the ASTROLABE and SDK cards.
- **Data:** Studio data dir = `STUDIO_DATA_DIR` or `%LOCALAPPDATA%\AstrolabeStudio` / `~/.local/share/astrolabe-studio`:
  `studio.db`, `credentials.json`, `catalog-snapshot.json`, `launch-url.txt`, `fixtures/` (demo repo), `exports/`.
  ASTROLABE keeps each project's state root in its own OS state dir (`ProjectInfo.stateRoot`); change snapshots are git
  shadow refs `refs/astrolabe/...` inside the project repo.
- **Ports:** 8740 server (loopback only); 4200 `ng serve`; 8745 e2e; 1455 ChatGPT sign-in callback (else code path).
- **Build:** `../ASTROLABE` is an included build and includes `../llm-transport-sdk/llm`; both are separate repos.

## Status and conflicts
- **Current:** `ASTROUI/`. Studio 2 screens use only `SimpleApi`, `ws`, `live`, `tasks`, `decisions`, `campaigns`,
  `changes`, `accounts`, `models`, `projects`, `Preferences`, `runtime`, `security`, `db`.
- **Stale first-Studio leftovers (kept, screens deleted):** `CampaignsApi`, `ProjectsApi`, `WorkspaceApi`, `SystemApi`
  (except health), `CommandService` and socket `cmd` frames (handled in `StudioSocket`; the UI never sends them), `ProviderService`,
  `SettingsService`/`SettingsSchema`, `StatsService`.
- **`tasks/plan.md`, `tasks/todo.md`: superseded, do not use.** They call `ASTROLABE_UI_DESIGN.md` authoritative, say
  implementation has not started, all T01-T22 unchecked. Evidence: committed 2026-09-28 (`7fed3e0`), before DESIGN was
  merged into BEST_MIX (09-29) and its UI parts replaced by V2_SIMPLE; Studio code exists since `b01e09c` (09-29), was
  rewritten in `f0b1c3f` and extended in `0e49755` (09-30). The name "Workbench" predates "Studio".
- **`tasks/v2-progress.md`: historical notes** (2026-09-29). Says "(untracked)" and "nothing committed since b01e09c"
  though it was committed in `e3d852b` and three commits followed; 110 tests, D2-1..D2-21 (now 121, D2-1..D2-27). Use
  `ASTROUI/docs/progress.md` and `decisions.md`.
- `decisions.md` D-9 ("UI strings inline English") is superseded by the catalogs (D2-10). D-2 says idempotent
  `CREATE TABLE IF NOT EXISTS`; `StudioDb.MIGRATIONS` is now an ordered versioned list (3 steps, `schema_version`).
- `settings.gradle.kts` comment says ASTROLABE is "never modified here"; README says core and SDK are now changed where
  the fix is theirs (since phase 0). README wins.
- D2-23 says state never comes from reason text; `TaskService.stateOf` still maps some failed/paused reasons by text
  (`failureCode`, "nothing to accept against"); only the waiting/acceptance path uses the core's `stopCode`.
- Cosmetic: socket `welcome.server` 0.1.0, `/app` `host.version` 0.2.0, `studio.version` 0.1.0. `Preferences.LANGUAGE`
  exists server-side (default `en`) but the UI ignores it: the language follows the browser.

## Pitfalls
- `§n` in code comments is ambiguous: backend comments mostly cite BEST_MIX (§25.9); "Studio 2 §n" cites V2_SIMPLE.
- Wire types are hand-written on both sides (D-1): change the server JSON and `app/core/model.ts` together; replay specs
  on `src/testing/*.events.json` are the only drift guard. Re-record logs when event shapes change.
- Task id = work id of the first run; each follow-up is a new campaign (`campaign_index.task_id`/`parent_work`) with its
  own `campaign:<work>` topic. `TaskStore` follows every run and de-duplicates by `seq` (at-least-once delivery).
- Host cards and notices can arrive before the journal names their turn: `Timeline.pushAhead` keeps a waiting card last.
  Reload race: history is fetched, then live; see `TaskStore.onListed` and `follow`.
- Continue and Retry share `POST /tasks/{id}/continue` (`TaskService.resume` picks `continueRun`, `retryStart` or a
  follow-up); it does nothing while a run opens or works (C1).
- Security is on by default: the launch link is single use (a new token is minted on use; `launch-url.txt` has the
  current one). Dev with `ng serve` needs `STUDIO_SECURITY=false`. CSP blocks inline scripts (D-11, `theme-init.js`).
- Commands needing network, installs or git-ref changes are refused by the core before any approval (F-10); cards only
  appear for protected files and destructive commands. Demo mode claims the one demo project for itself (D2-19).
- `ASTROLABE/`, `llm-transport-sdk/`, `devtools/` are git-ignored at the root; `ASTROUI/build`, `frontend/dist` and
  `node_modules` are build output. A `bootRun` comment says `--studio.fixture-mode`; the property is `studio.fixtures`.
- Windows: stop `ng serve` and any running jar before `./gradlew studio` (file locks). macOS is unsupported by the core.
- Test counts in docs (110, 121, 19, 10) drift: run the suites. Live-provider checks in progress.md were scratch
  scripts outside the repo, not reproducible from `e2e/`.

## Freshness
- `ASTROUI/README.md`
- `ASTROUI/docs/decisions.md`
- `ASTROUI/docs/progress.md`
- `ASTROUI/settings.gradle.kts`
- `ASTROUI/build.gradle.kts`
- `ASTROUI/gradle.properties`
- `ASTROUI/backend/bridge/build.gradle.kts`
- `ASTROUI/backend/bridge/src/`
- `ASTROUI/backend/server/build.gradle.kts`
- `ASTROUI/backend/server/src/`
- `ASTROUI/frontend/package.json`
- `ASTROUI/frontend/angular.json`
- `ASTROUI/frontend/build.gradle.kts`
- `ASTROUI/frontend/proxy.conf.json`
- `ASTROUI/frontend/src/`
- `ASTROUI/frontend/e2e/`
- `ASTROLABE_UI_V2_SIMPLE.md`
- `ASTROLABE_UI_V2_MOCKUP.html`
- `tasks/plan.md`
- `tasks/todo.md`
- `tasks/v2-progress.md`
