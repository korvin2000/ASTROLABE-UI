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

# Studio 2 (`ASTROLABE_UI_V2_SIMPLE.md`)

Recorded 2026-09-29. The sections above describe the first Studio; its backend parts stay valid where Studio 2 keeps them.

## Spikes (section 12.5)

| Id | Result | Evidence |
|---|---|---|
| S-1 | **Pass**, with findings F-4 and F-5 | `backend/bridge` test `VerificationSetupTest`: a repository without a manifest is refused by the core; the bridge amends the contract and opens again; a `run:` item (unittest suite) completes; a `check:` item completes when the host signs the review verdict and fails without it. |
| S-2 | **Partly checked** | Against the running backend: the browser path reaches `waiting_for_browser` with the sign-in address; with port 1455 occupied the session switches to the code path and reaches `waiting_for_code` with a code and its address; cancel ends the session; the OpenRouter sign-in reaches `waiting_for_browser`. **Not checked:** the last step (the owner signs in, the credential is stored, a refresh succeeds) needs the owner's ChatGPT account. |
| S-3 | **Pass on an API-key provider**, finding F-7 | "Create a hello world program: hello.py" in an empty repository on OpenRouter `anthropic/claude-haiku-4.5`: done, verified by the review pass, 1 file, 24.9k tokens, USD 0.03. On `openai/gpt-6-luna` the task ends Paused: every edit call is refused by the core (F-7). **Not checked:** the same on a ChatGPT sign-in (needs S-2's last step). Repeated on 2026-09-30 with `z-ai/glm-5.3-flash`, after D2-13 and D2-14: the acceptance scenarios in `progress.md` |
| S-4 | **Pass** | Undo of a task with two files: the untouched file is restored (removed), the file the user edited afterwards is skipped and named. |
| S-5 | **Pass with the demo model** | A message after "Done" starts a follow-up run in the same task; its request begins with the recap marked as context; the run acts on the new words only. Not checked on a live model. |
| S-6 | **Pass** (host side) | "Always allow in this project" stores `git log`; the next task runs the command without a card and records "always allowed in this project". |
| S-7 | **Pass** | In Auto mode the host answers the question with the assumption sentence and the run continues; the risky action outside the allow list is denied and listed as skipped. |

## Deviations of Studio 2

| # | Deviation | Reason | Changes |
|---|---|---|---|
| D2-1 | A declared build, type check or lint command is not an acceptance item. It is handed to the agent as a step to run; the task is accepted through the review pass and labelled "Reviewed by a second pass" | F-4: the core accepts a `run:` item only on parsed test counts | section 7.3 order 3, section 7.8 "Build passed" |
| D2-2 | The review pass is a second model call made by the Studio host (the task's model, the request and the core's diff of the candidate, no conversation); the verdict is signed `studio:review-pass(<model>)`. Its tokens are not part of the task's usage numbers | F-5: in the simple shape the core lets only the host assess a `check:` item | section 7.3 order 4 |
| D2-3 | The allow list is applied by the host when the core asks for an approval; the contract is not changed | It needs no contract amendment and works in both modes | section 7.5, S-6 |
| D2-4 | In Auto mode the run still uses the host as authority (the core's `AutonomousAuthority` is not used); the host applies the policy of section 7.5 | The core's policy never answers a question | BE-14 |
| D2-5 | Checks the agent adds to its own plan are accepted by the host without a card; knowledge admission stays queued | They are not decisions a user of Studio 2 can judge; both only strengthen the task | section 7.5 |
| D2-6 | A stale lock is released automatically at start and leaves a notice; the E-9b card appears only when the release fails | Section 7.2 step 5 asks for automatic handling | section 10 E-9b |
| D2-7 | OpenRouter keys are checked against its key endpoint after the SDK's connection test | F-6 | section 6.1 |
| D2-8 | `STUDIO_FIXTURES` now defaults to `false`; demo mode is setting 15 | BE-9 | README |
| D2-9 | Outside the demo repository the demo model writes one small file named in the request | So the demo shows a change in any project | section 5 UX-9 |
| D2-10 | The language follows the browser (Russian for a Russian browser, else English); there is no language setting | The budget of section 2 has no room for it; the catalog has both languages | section 9 |
| D2-11 | Setting 17 shows the data folder and copies its path; it does not open the folder | A page in a browser cannot open a folder | section 9 |
| D2-12 | The protected files of a project reach the agent as a contract amendment at the start of a run | The core takes protected paths from the contract only | section 9 setting 9 |
| D2-13 | A request reserves a quarter of the model's context window for the output at most | F-8 | BE-4 |
| D2-14 | Every task's request carries a note of the Studio for the agent: the forms of its working notes, that commands run without a shell, and that messages are written for the user in plain words | F-9; without it a model that does not guess the forms does the work and cannot record it | section 7.2 |
| D2-15 | The review pass is told what the user answered and allowed during the run, and what earlier runs of the same task changed | Found with a real model: the reviewer took the user's answer for a liberty of the agent, and after "Retry" it refused a run that had nothing left to change because the interrupted run had written the file | section 7.3 order 4 |
| D2-16 | For a local or custom server a listed model counts as usable unless it is known to lack tool calling | Such servers list names without capabilities; the strict rule hid every local model | section 6.4 |
| D2-17 | The effort of a task is fitted to the levels the model has: the same level, else the nearest lower, else the nearest higher | A model with "low" and "high" was shown and started with "Medium" | section 6.4 |
| D2-18 | A task that paused with the agent's own reason (`needs_answer`, `blocked`) shows that reason in the card, not under "Details" | The user has to read it to answer | section 10 |
| D2-19 | While demo tasks work in one project only, the demo model takes that project for its own | The demo chose its script by words of the request; the first demo task of a new user ran the wrong one and failed | section 5 UX-9 |
| D2-20 | After "Undo all" the Changes list keeps the files as the task recorded them | The record of the task is history; the diff says what the task did | section 8.1 |
| D2-21 | A state the server knows without an event (a task cut off by a restart) is told to the conversation and the Flow as if the event had come; after a reconnect the app loads its state again | No event tells a restart | section 7.6 |

## Findings of Studio 2 (upstream proposals)

| # | Finding | Studio handling | Proposal |
|---|---|---|---|
| F-4 | A `run:` acceptance item is green only with parsed test counts; a command that exits 0 without a recognised test summary is `inconclusive` and the task fails | D2-1 | A command kind whose exit status is its result (build, type check, lint) |
| F-5 | In the simple shape a `check:` item is certified only through `Authority.review`; the core's own review cell runs from shape S2 | D2-2 | Let the review cell assess `check:` items in every shape |
| F-6 | The SDK's connection test proves a key through the model listing; OpenRouter's listing is public, so any key passes | D2-7 | A provider-specific authentication probe in the SDK |
| F-7 | Models that fill every optional member of a tool call with an empty value (seen with `openai/gpt-6-luna`: `"delete":"", "transform":{"script":"", …}`) have every `edit` call refused ("needs exactly one form") | None in the Studio: the task ends Paused with the agent's own reason | Treat empty strings, empty lists and all-empty objects of optional members as absent when tool arguments are decoded |
| F-1 | (open, see above) | The host ends a dead holder's lease through `Leases.acquire(…, Duration.ZERO)` in the old holder's name, then opens (BE-10) | A stable holder id, or a release call |
| F-8 | The catalog of some models names an output limit near the whole context window (seen: `z-ai/glm-5.3-flash`, window 1,310,720). The compiler reserves the output limit of every request, the context budget turns negative and the first cell ends `NEEDS_RESCOPING_OR_LARGER_PROFILE` with zero model calls | D2-13 | Cap the reserved output in the core, or let a profile name its reserve |
| F-9 | The schema of `state(patch)` is "a list of objects" and the refusal of an unknown form is the serializer's message ("Serializer for subclass 'fact' is not found in the polymorphic scope of 'Op'"). A model that does not guess `plan.add`, `fact.add`, … retries until it gives up (seen: 12 refused calls, then `waiting_for_input`) | D2-14 | Name the forms in the tool schema and in the refusal |
| F-10 | A contract's capability set is always `workspace-local-test-only` and `Controller` takes no host sets. A command that needs the network, installs a package or changes git refs is refused by the ceiling before `Authority.approve` is asked, so no approval card can appear for it (acceptance scenario A-5 as written). Cards do appear for protected files and destructive commands | The task pauses with the agent's reason in the card (D2-18) | Let the host name the capability set of a contract, so that such commands reach the approval |
| F-11 | A provider call that loses its connection ends the run as `failed` with the text "provider Transport: outcome_unknown: …" and no code | The Studio reads the words and shows "Could not reach <account>" with Retry | A typed failure code on the run's end |
| F-12 | The `edit` tool refuses a protected file outright ("protected by the committed contract"); only a command of the `run` tool that names a protected path asks for approval | Setting 9 says so: the agent does not edit these files and asks before a command touches them; to let the agent edit a file the user removes it from the list | An approval for edits of protected files, as for commands |
