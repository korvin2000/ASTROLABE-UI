# ASTROLABE Studio

A local web app for the ASTROLABE coding agent: connect a model, open a project folder, describe a task, answer the
agent's questions, review and commit its changes. Specification: `../ASTROLABE_UI_V2_SIMPLE.md` (Studio 2); the
screens follow `../ASTROLABE_UI_V2_MOCKUP.html`.

- `backend/bridge` — Kotlin bridge over ASTROLABE's public `Controller` and the AI Gate SDK.
- `backend/server` — Spring Boot 4.1 host on JDK 26: REST (`/api/v1`), the ASTRO-WS/1 socket, accounts and sign-in,
  models, tasks, decisions, changes, settings, the Studio database and the local session.
- `frontend` — Angular 22 application (standalone components, signals, zoneless).

ASTROLABE (`../ASTROLABE`) and the AI Gate SDK (`../llm-transport-sdk/llm`, via ASTROLABE's build) are included
builds. Since phase 0 (2026-09-30, `../next-goal.md`) they are changed where the right fix is theirs — the acceptance
rule lives in the core, the Codex transport fix in the SDK — instead of being worked around in the Studio. What the
Studio needs from them is recorded in `docs/decisions.md`.

## Requirements

- JDK 26 (`../devtools/jdk-26.0.2.1+1`; `gradle.properties` points the toolchain there). Gradle itself runs on it too.
- Node 24 and npm (for the frontend build; Gradle calls `npm`).
- git on `PATH`.

## Run the packaged Studio

```bash
export JAVA_HOME=../devtools/jdk-26.0.2.1+1
./gradlew studio
java -jar backend/server/build/libs/astrolabe-studio.jar
```

The server binds `127.0.0.1:8740` and prints a one-time launch link (`/launch?t=…`); the current link is also in
`launch-url.txt` in the data folder. Opening it sets the session cookie; without it the app shows a notice.

The first run asks for two things: a model (sign in with ChatGPT, an API key, a local server, or "Run the demo") and
a project folder. After that the app opens on a new task.

| Variable | Default | Meaning |
|---|---|---|
| `STUDIO_PORT` | `8740` | HTTP port (loopback only) |
| `STUDIO_DATA_DIR` | `%LOCALAPPDATA%\AstrolabeStudio` / `~/.local/share/astrolabe-studio` | Studio database, saved keys, launch link, demo project |
| `STUDIO_SECURITY` | `true` | Launch-token session, Host/Origin checks, CSRF header |
| `STUDIO_FIXTURES` | `false` | Start with demo mode on (demo mode is also a setting: Settings › Advanced) |
| `STUDIO_FIXTURE_LATENCY` | `700` | Latency of the demo model (ms) |
| `STUDIO_ENV_KEYS` | `true` | Offer provider API keys found in environment variables |
| `STUDIO_OPEN_BROWSER` | `false` | Open the launch link at start |

ASTROLABE keeps each project's state outside the repository (its own state root).

## Screens

Five routes: `/welcome` (first run), `/new` (new task), `/t/<task>` (the task: conversation, message box, side panel
with Changes, Progress and Output), `/settings/<section>`, and `/`, which opens the last task. The Progress tab shows
the Flow: seven fixed nodes and the messages between them, drawn by the app itself.

Texts live in `frontend/src/app/i18n/catalog.en.ts` and `catalog.ru.ts`; the language follows the browser.

## Develop

Backend (security off so the Angular dev server can call it):

```bash
STUDIO_SECURITY=false ./gradlew :backend:server:bootRun -Pstudio.skipFrontend=true
```

Frontend with live reload on <http://localhost:4200> (proxies `/api` and the socket to 8740):

```bash
cd frontend && npm ci && npm start
```

Stop `ng serve` before `./gradlew studio` on Windows: a running dev server locks files that `npm ci` must replace.

## Tests

```bash
./gradlew :backend:bridge:test
cd frontend && npm test
cd frontend && npm run e2e
```

- Bridge tests: both demo tasks end to end through ASTROLABE's controller and the AI Gate adapter, the verification
  setup (a project without tests, a saved test command, the review verdict), the output reserve.
- `npm test` (vitest): replays of recorded task logs through the timeline and the Flow model (demo runs and live
  runs), Flow layout and routes at every size from 440 × 440, the vocabulary test (no internal term in the catalogs
  and templates), catalog completeness in English and Russian, the small rules of the task view.
- `npm run e2e`: scenario A-1 in a headless Chrome or Edge against the packaged jar with an empty data folder and the
  demo model (`e2e/a1.mjs`; build the jar first). `E2E_URL` uses a Studio that runs already; `E2E_BROWSER` names the
  browser; `E2E_SHOTS` is a folder for screenshots.

## Known limits

Details and the upstream proposals are in `docs/decisions.md`.

- Commands that need the network, install packages or change git refs are refused by the agent's core before an
  approval can be asked (finding F-10). Approval cards appear for protected files and destructive commands.
- The last step of the ChatGPT sign-in and of the sign-in by code needs the account owner; both were checked up to
  the point where the browser or the code is awaited.
- Saved keys use the SDK's owner-only file store, not an OS vault.
- macOS is not supported by ASTROLABE's process layer; the first run says so.
