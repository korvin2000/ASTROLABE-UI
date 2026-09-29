# ASTROLABE Studio

A local web workspace for the ASTROLABE coding agent: start campaigns, answer its questions and approvals, and
inspect contracts, plans, changes, evidence and context as they happen. Specification: `../ASTROLABE_UI_BEST_MIX.md`.

- `backend/bridge` — Kotlin bridge over ASTROLABE's public `Controller` and the AI Gate SDK (no business logic).
- `backend/server` — Spring Boot 4.1 host on JDK 26: REST (`/api/v1`), the ASTRO-WS/1 socket, commands,
  decisions, settings, providers, the Studio database and the local session.
- `frontend` — Angular 22 application (standalone components, signals, zoneless).

ASTROLABE (`../ASTROLABE`) and the AI Gate SDK (`../llm-transport-sdk/llm`, via ASTROLABE's build) are included
builds; neither is modified.

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
`launch-url.txt` in the data directory. Opening it sets the session cookie; without it the UI shows a sign-in notice.

With no provider connected, campaigns run on the scripted demo model through the real AI Gate adapter and are
labelled **Demo data**. A demo repository (`demo-shop`) is created on first start; *New campaign* offers two
scripted demos (a local fix, and an interactive one with a question and an approval).

| Variable | Default | Meaning |
|---|---|---|
| `STUDIO_PORT` | `8740` | HTTP port (loopback only) |
| `STUDIO_DATA_DIR` | `%LOCALAPPDATA%\AstrolabeStudio` / `~/.local/share/astrolabe-studio` | Studio database, credentials, launch link, demo repository |
| `STUDIO_SECURITY` | `true` | Launch-token session, Host/Origin checks, CSRF header |
| `STUDIO_FIXTURES` | `true` | Register the scripted demo provider |
| `STUDIO_FIXTURE_LATENCY` | `700` | Demo model latency (ms) |
| `STUDIO_ENV_KEYS` | `true` | Read provider API keys from environment variables (OD-06) |
| `STUDIO_OPEN_BROWSER` | `false` | Open the launch link at start |

ASTROLABE keeps each project's state outside the repository (its own state root, shown on the project page).

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
./gradlew :backend:bridge:test --tests "*FixtureCampaignTest*" --tests "*InteractiveFixtureTest*"
cd frontend && npx vitest run
```

The bridge tests run both demo campaigns end to end through ASTROLABE's controller and the AI Gate adapter. The
frontend test replays a recorded campaign event log (`frontend/src/testing`) through the reducer.

## Known limits

Shown in the UI where they apply; details in `docs/decisions.md`.

- OAuth sign-in relay is not wired (API keys and keyless local servers work).
- Knowledge curation actions (admit / reject / supersede) need the upstream knowledge bridge (G-10).
- Credentials use the SDK's owner-only file store, not an OS vault (G-27).
- A workspace lease taken before a restart or crash keeps the workspace until it expires (8 h by default, OD-03);
  the project page and the start preflight show the holder and expiry.
- Publication needs the campaign's live handle: after a restart a finished campaign can no longer be published (G-22).
- macOS is not supported by ASTROLABE's process layer.
