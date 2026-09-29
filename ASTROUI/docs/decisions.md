# Decisions and deviations

Deviations from `ASTROLABE_UI_BEST_MIX.md`, each with its reason and the section it changes (§34.1 rule 7), plus
the owner-decision defaults applied (§36.2).

## Pinned versions (checked 2026-09-29, §25.2)

| Item | Version |
|---|---|
| JDK | 26.0.2.1+1 (`../devtools`) |
| Gradle wrapper | 9.7.1 |
| Kotlin (bridge, matches ASTROLABE) | 2.4.20; kotlinx-coroutines 1.11.0; kotlinx-serialization 1.11.0 |
| Spring Boot | 4.1.1 (Jackson 3, Tomcat 11); BOM as a non-enforced platform so ASTROLABE's Kotlin, coroutines and sqlite-jdbc win |
| sqlite-jdbc | 3.53.4.0 |
| Angular | 22.2.0 (standalone, signals, zoneless); TypeScript 6.0.3 |
| marked / DOMPurify | 18.0.14 / 3.4.16 |
| @fontsource Inter / JetBrains Mono | 5.3.0 |
| vitest | 5.0.2 |
| Node | 24.18 |

## Owner decisions (defaults applied)

| ID | Applied |
|---|---|
| OD-01 | Kotlin bridge over the public `Controller`; no upstream facade changes |
| OD-02 | Direct read-only store queries, all in `backend/bridge/.../StoreReads.kt` |
| OD-03 | Lease 8 h for Studio campaigns (`runtime.leaseMinutes`, Settings › Studio runtime) |
| OD-05 | No live text preview; `cell.model_progress` shows stage and character counts only |
| OD-06 | API keys from environment variables on (`STUDIO_ENV_KEYS`) |
| OD-07 | Launcher + browser only (executable jar, launch link) |
| OD-08 | No per-process terminate; "Cancel campaign" only |
| OD-09 | D-class allowlist and capability sets read-only in Settings |
| OD-11 | Structured input as a labelled hints annex (`--- astrolabe-studio annex v1 · hints, not contract items ---`) |
| OD-13 | Studio data in the OS user data directory; ASTROLABE state roots stay separate |

## Deviations

| # | Deviation | Reason | Changes |
|---|---|---|---|
| D-1 | No separate `studio-protocol` module and no generated OpenAPI / JSON Schema / TypeScript. Wire DTOs are Jackson trees built in the services; TypeScript types are hand-written in `frontend/src/app/core/model.ts` | Coding-first delivery of a working UI; the ASTROLABE types still cross the bridge through their own kotlinx serializers (never re-modelled). Drift risk is covered by the reducer test replaying a real recorded event log | §25.2, §28, §34.1 rule 4, T-02 |
| D-2 | Studio database migrations are idempotent `CREATE TABLE IF NOT EXISTS` plus a `schema_version` row (`StudioDb`), not Flyway | Small single-user schema; one dependency fewer. Switch to Flyway at the first schema change that needs data migration | §25.2, §26.1, §31 |
| D-3 | Credentials are stored with the SDK's `CredentialStore.file` (owner-only permissions, **not encrypted**) instead of an OS vault; the UI says so (Providers, Diagnostics) | No vault implementation yet (G-27) | §30.3 |
| D-4 | Views are refreshed by the client from stream items (refresh matrix of Appendix A, coalesced 250 ms, budget 1 s) instead of server `studio.view_changed{view, revision}` with ETags | Same effect with fewer moving parts; the durable stream already names every change | §25.10, §32.3 |
| D-5 | Fixture mode has two scripted campaigns (local fix S0; interactive with a question and a D-class approval). Cassette **replay mode** is not implemented; a recorded event log is used as the reducer's golden test input | Scope; fixture mode runs the real controller and adapter, which is the part replay would imitate | §24.3, §24.4 |
| D-6 | The interactive demo's approval is a protected-path read (`git log -1 -- .github`) | The S0 capability set (`workspace-local-test-only`) denies git-ref mutations by ceiling before any approval is asked, so a git-ref D-class example never reaches the human | §24.4 F7 |
| D-7 | OAuth sign-in relay (device code / browser callback) is not wired; API keys (write-only) and keyless local servers work | Needs the desktop shell or a callback listener (OD-07 phase D) | §18, §30.3 |
| D-8 | Knowledge admit / reject / supersede / rollback are not offered; the knowledge views are read-only | Curator actions need the upstream knowledge bridge (G-10) | §15 |
| D-9 | UI strings are inline English, not externalized | Scope; OD-10 (second locale) is after v1 | §23, OD-10 |
| D-10 | Settings validation: `Defaults.violations()` reports bare field names; the bridge qualifies them as `defaults.<field>` so errors land on the right field | ASTROLABE's paths are relative to `Defaults`; the Studio edits the whole `Config` | §17.1 |
| D-11 | The production Angular build disables critical-CSS inlining (`angular.json` → `optimization.styles.inlineCritical: false`) | Inlining loads the global stylesheet as `media="print"` and switches it with an inline `onload` handler, which the Studio's CSP (`script-src 'self'`) blocks — the packaged UI then ran without its global styles | §30.2, §31 |

## Findings about ASTROLABE (upstream proposals, T-27)

| # | Finding | Studio handling | Proposal |
|---|---|---|---|
| F-1 | The workspace lease holder is `controller:<pid>`. After a Studio restart or crash the new process is another holder, so a campaign opened before the restart keeps the workspace until its lease expires (8 h with OD-03); new campaigns and resumes are refused with `LeaseHeld` | `lease_held` error with holder and local expiry; start preflight and the project page show the lease; lease length is a runtime setting | A stable holder id per host instance, or releasing the lease when a run ends without a pending publication |
| F-2 | With `core.autocrlf=true`, snapshot 0 stores touched files normalized (LF) while later snapshots store the edited file raw (CRLF), so a one-line edit diffs as a whole-file rewrite | Changes ignores CR at end of line by default (`--ignore-cr-at-eol`), flags such files `EOL` / `EOL only`, and has a toggle; the exported `.patch` stays byte-exact | Snapshot touched files through the same filters as snapshot 0 |
| F-3 | The run listener runs inside the run job's `finally`, where the job is still active | The bridge marks the live campaign ended before calling the listener, so the final summary is not reported as running | — (host-side fix) |
