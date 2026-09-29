# Progress

Status as of 2026-09-29. Deviations and upstream findings: `decisions.md`.

## Done

**Build.** One Gradle build (wrapper 9.7.1, JDK 26 toolchain) with ASTROLABE as an included build; `./gradlew studio`
produces `backend/server/build/libs/astrolabe-studio.jar` with the Angular bundle inside (`classpath:/static`).

**Bridge (`backend/bridge`, Kotlin).** `StudioHost` opens projects through `Astrolabe.open`, starts / resumes
campaigns on the public `Controller` (lease duration, `maxCells`, effort), keeps the live handle for amend, cancel,
amendment resolution, intent reconciliation and publication; one shared `Events` bus; `AuthorityPort` futures for
questions, approvals, amendments and reviews; documented read-only store queries (`StoreReads`); configuration
decode / validate / freeze dry-run (`ConfigSupport`); rules-file and repository inspection; fixture brain on the
SDK's `FakeProvider` through the real `AiGateAdapter`. Tests: both demo campaigns end to end.

**Server (`backend/server`, Spring Boot 4.1).** Studio database (projects, campaign index, durable per-campaign event
log, decisions, commands, settings layers and history, profiles, provider config, telemetry, audit, notifications);
live pipeline (bus + journal tailing + Studio items, ordering per campaign, drop detection → `studio.resync`);
ASTRO-WS/1 (hello/resume, subscribe with replay, commands with running/terminal results, ping); idempotent command
ledger; REST views for every tab; settings schema with availability and gaps; providers, credentials (write-only),
connection test (unbilled steps), model catalog, profiles (draft / validate / qualify / freeze); changes from shadow
refs with attribution; statistics; local session (launch token, HttpOnly cookie, Host and Origin checks, CSRF, CSP).

**Frontend (`frontend`, Angular 22).** Shell (sidebar, command palette, inspector drawer, toasts, OS notifications),
home, project page (health, lease, rules review & bind, sniffed commands), new campaign (options, hints annex,
preflight, demos), campaign view with mission strip and tabs — Thread (cells, turns, tool cards, decision cards,
finish card, composer with answer / amend / resume), Overview (flow canvas driven by events, STATE register,
ticker), Plan (contract versions and compare, requirements, acceptance, amendments, increments, ledger), Changes
(snapshot range, attribution, diffs, publication ladder and request), Evidence, Context (context stack per request,
manifests, workset, register history, invocations) — plus Needs-you inbox, Activity (processes, intents,
reconcile), Knowledge (read-only), Statistics, Providers & models, Settings (schema-driven, scopes, validate /
apply with revision check, presets, roles), Diagnostics. Dark and light themes, density, reduced motion.

**Verified.**
- Bridge tests `FixtureCampaignTest`, `InteractiveFixtureTest` pass.
- Frontend `vitest run`: reducer replay of a recorded interactive campaign (end state, duplicate and stale
  redelivery, reconnect split, ephemeral progress) and envelope parsing — 6 tests pass.
- Packaged jar with security on: health open, API 401 without session, bad / reused launch token 401, cookies
  HttpOnly + SameSite=Strict, CSRF-less POST 403, foreign Host 403, deep links served, CSP without console violations;
  interactive demo run from the UI in that build (question answered, D-class approved, campaign completed, header
  and composer switch to final state).
- Every page checked in the browser against live data (fixture mode), in the dev server and in the packaged jar
  (no horizontal overflow at 1440 px; sidebar rows single-line; thread scroll ends above the composer).
- Lifecycle from the UI in the packaged jar: amend while running (contract v2), cancel (final; pending question
  expired; only "new campaign from this" offered), decline a question (waiting for input, resumable), resume with
  an amendment, answer, approve, complete — the earlier run's finish card stays as it was.
- Lease refusal after a restart: `lease_held` with holder and local expiry; preflight and project page show it.
- Changes on a CRLF working tree (`core.autocrlf=true`): a one-line edit shows as +2/−1 with an `EOL` flag
  (raw: +13/−12); the toggle shows the raw diff.

## Dead ends

- A git-ref D-class example (`git stash list`) in the interactive demo: denied by the S0 capability ceiling before
  approval (see D-6).
- Resetting the demo repository by re-creating it changed its RepoIdentity and orphaned its campaigns; it is now
  restored in place with deterministic commit dates.
- Angular's critical-CSS inlining in the production build: blocked by the Studio CSP, the packaged UI lost its
  global styles (D-11).
- Gradle `npmInstall` declared `node_modules` as its output, so any cache write re-ran `npm ci` (which wipes
  `node_modules`, and fails on Windows while `ng serve` runs); the output is now npm's hidden lockfile.

## Next

1. Generate protocol types (records → JSON Schema / TypeScript) and replace `core/model.ts` (D-1).
2. Cassette replay mode for demos and e2e tests (D-5).
3. OS credential vault (G-27), OAuth relay (D-7).
4. Upstream proposals F-1 (lease holder across restarts) and F-2 (snapshot line endings).
5. Flyway once the Studio schema needs a data migration (D-2).
