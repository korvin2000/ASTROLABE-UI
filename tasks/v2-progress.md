# Studio 2 (ASTROLABE_UI_V2_SIMPLE.md) — working notes (untracked)

Goal: implement `new_goal.md` → spec `ASTROLABE_UI_V2_SIMPLE.md`, mockup `ASTROLABE_UI_V2_MOCKUP.html`.
Repo root is `C:\work.astrolab` (NOT `C:\work\astrolab`). Code: `ASTROUI/`. Nothing is committed since b01e09c
(commit only on request).

## Environment
- JDK 26: `devtools/jdk-26.0.2.1+1`; Node 24.18, npm 12; Gradle wrapper in `ASTROUI/`.
- Data dir: `%LOCALAPPDATA%\AstrolabeStudio` (studio.db, credentials.json — never print secrets).
- Backend dev: `STUDIO_SECURITY=false ./gradlew :backend:server:bootRun -Pstudio.skipFrontend=true` (port 8740).
- Frontend dev: `cd ASTROUI/frontend && npm start` (4200, proxies to 8740). Tests: `npm test`, `npm run e2e`.
- Bridge tests: `./gradlew :backend:bridge:test`. Full jar: `./gradlew studio` (stop running jars first on Windows).

## Owner instructions (2026-09-29)
- Test against real servers, not the demo or stand-ins. No local model server exists on this machine.
- Cheap live model: OpenRouter `z-ai/glm-5.3-flash` (about USD 0.01 per small task).

## Scratch tooling (session scratchpad)
- `verify-lib.mjs` (own backend + headless browser), `verify.mjs` / `verify2.mjs` (UI mechanics with the demo model),
  `verify-live.mjs` (acceptance scenarios on OpenRouter through a tunnel; the saved key is copied as a file, never read),
  `debug-live.mjs`, `debug-order.mjs`, `debug-review.mjs`.

## Done
- Phases 0–4 of spec section 14: backend, frontend rewrite (5 routes), Flow, settings (19), both catalogs, tests.
- Unit tests: frontend 110 (vitest), bridge (fixture tasks, verification setup, output reserve).
- e2e `frontend/e2e/a1.mjs` (A-1 with the demo model, packaged jar).
- Live on OpenRouter GLM-5.3-Flash: A-1, A-2 (after the key), A-4, A-6, A-9, A-12, A-13, A-15, A-16, A-17 (see
  `ASTROUI/docs/progress.md` for the table).

## Decisions and findings (details in `ASTROUI/docs/decisions.md`)
- D2-1..D2-21, F-4..F-12. The ones that cost time:
  - F-8 output reserve near the whole window → budget negative → capped at a quarter of the window.
  - F-9 `state(patch)` forms are not named by the core → note in every request.
  - F-10 network / package install / git refs are refused by the ceiling before an approval → A-5 as written cannot pass.
  - F-12 edits of protected files are refused, only commands on them ask.
  - Review pass must know the user's answers (D2-15).
  - Reload race: live subscription before history → runs out of order (fixed in `TaskStore.onListed`).
  - `SpaFallback` had the routes of the first Studio → `/t/<id>` gave 404 on reload.

## Dead ends
- A stand-in local server (fake Ollama) proves only the UI path; the owner wants real servers. A-3 stays unverified.
- Typing the real key into the UI is not something the agent may do; A-2's paste step and A-7's "replace the key,
  Retry" need the owner.

## Not verified
- S-2 / A-14 last leg (ChatGPT sign-in, sign-in by code): needs the owner.
- A-3 (local model): no local server on this machine.
- A-5 for a package installation: blocked by F-10.
- F-7 (models that fill optional tool fields with empty values): upstream.

## Next
- Owner: sign in with ChatGPT once (S-2), run one task on it (S-3 for that provider).
- Upstream proposals F-1, F-4..F-12 to ASTROLABE / the SDK.
