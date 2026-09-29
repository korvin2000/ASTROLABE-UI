# ASTROLABE Studio 2 — "Simple by default"

UI concept, specification and implementation plan.

| | |
|---|---|
| Status | Proposal v2.0, 2026-09-29 |
| Supersedes | The UI parts (shell, screens, settings, providers) of `ASTROLABE_UI_BEST_MIX.md` and `BEST_CONCEPTS_MIXED.md`. Their protocol parts (ASTRO-WS/1, security, persistence) stay valid as reference. |
| Visual reference | `ASTROLABE_UI_V2_MOCKUP.html` (static mockup of seven screens with light and dark themes; where it differs from this text, this text wins) |
| Code it applies to | `ASTROUI/frontend` (Angular 22), `ASTROUI/backend/server` (Spring Boot), `ASTROUI/backend/bridge` (Kotlin) |
| Requirement ids | `P-n` principle · `UX-n` behaviour · `BE-n` backend work · `FE-n` frontend work · `S-n` spike · `E-n` error · `A-n` acceptance scenario |

---

## 0. Резюме (RU)

- **Вердикт.** Фронтенд (экраны и навигация) переписать с нуля; бэкенд оставить и дополнить «простым» API. Текущие экраны зеркалят архитектуру агента, поэтому их нельзя «упростить правками» — неверна сама информационная архитектура.
- **Почему «ничего не происходит».** Проверено по базе Studio: обе реальные задачи завершились через ~5 мс после открытия, без единого запроса к модели. Ядро ASTROLABE отказывается стартовать, если в репозитории не объявлена команда тестов, а UI прячет причину за свёрнутой иконкой. Это не мелкий баг, а следствие того, что UI напрямую выставляет модель «контракта».
- **OAuth ChatGPT Plus/Pro.** SDK его полностью поддерживает, Studio просто ни разу не вызывает `auth().login`.
- **Удаление gateway.** Провайдеры — фиксированный список из 14 пресетов; единственное действие — «logout», удаления нет вообще.
- **Новая концепция.** Проект → задача (диалог) → изменения. Три решения до первой задачи: подключить аккаунт, выбрать папку, написать запрос. Один выбор модели вместо цепочки «профиль → валидация → квалификация → роль». Около 19 настроек вместо 102, без JSON. Вся внутренняя терминология (campaign, contract, cell, lease, profile, S0, D-class…) убрана из интерфейса.
- **Главный риск.** Ядро ни разу не запускалось на живой модели в проверочных прогонах (`actual_state.md`: live-гейты `UNMEASURED`). Поэтому план начинается с пяти коротких проверок (spikes), и только потом строится UI.

---

## 1. Decision

### 1.1 Verdict

| Layer | Decision | Reason |
|---|---|---|
| Frontend screens, navigation, settings UI, providers UI | **Rewrite from scratch** | The information architecture is the defect. 12 pages, 6 run tabs, an 11-node architecture canvas and about 55 internal terms are built into the components. Re-skinning them costs more than building four simple screens and leaves the complexity in place. |
| Frontend infrastructure (`core/`, `ui/`, design tokens) | **Keep, with fixes** | Generic and solid: socket with resume and de-duplication, API client, sanitised markdown, diff viewer, light/dark tokens. |
| Frontend reducer and stores | **Rework** | Mechanics are reusable. Remove canvas state, stop dropping errors and unknown events, produce a simple timeline. |
| Backend (bridge, command bus, event stream, decisions, changes, security, database) | **Keep and extend** | The expensive parts work and are tested. What is missing is a thin layer that configures things automatically. |
| Backend provider, settings-seeding and start logic | **Change** | OAuth, account removal, automatic model binding, preflight, verification setup and error reporting are absent. |

### 1.2 Evidence

Sources: code audit of `ASTROUI/frontend` and `ASTROUI/backend`, a walk through the running packaged Studio, a read-only copy of the owner's `studio.db`, and the ASTROLABE and SDK sources.

| Owner's complaint | Verified cause | Where |
|---|---|---|
| Cannot sign in with ChatGPT Plus/Pro | The Studio never calls the SDK's `auth().login`. The page for the OAuth-only provider shows an API-key field and the note "login relay is not wired". The SDK itself supports browser (loopback `127.0.0.1:1455`) and device-code login. | `providers.ts:63`; `ProviderService.java:150-165`; SDK `OpenAi.java:36-47`, `Auth.java:20-22` |
| Model selection is unintuitive | Five concepts on two pages, about nine steps: provider → catalog model → "Draft profile" → validate / qualify / freeze → role binding in Settings. The model table lists embedding, image and realtime models. The profile id field keeps a stale default: the owner ended up with a profile named `lm-studio-main` that points to OpenRouter. | `providers.ts:89-124,214`; `settings.ts:140`; `studio.db` `profile` |
| Cannot delete gateways | Providers are a fixed preset list that is always shown. The only action is logout, which deletes a stored credential. Keyless local presets always report "configured". Environment keys and the demo provider survive logout. | `ProviderService.java:61-66,159`; `SystemApi.java:121-124` |
| Started a task, nothing happens | Both real runs ended about 5 ms after opening with **zero model calls**: outcome `waiting_for_input`, reason "G_single(C) has nothing to accept against…". The core derives acceptance only from a declared test command and refuses to start without one. The UI shows this only in a collapsed detail behind an ⓘ icon, and the sidebar keeps saying "started". | `studio.db` `event_log`, `llm_request`; `Controller.kt:492-499`; `Contracts.kt:180-206`; `thread.ts:45-48` |
| Same complaint, first attempt | The first run used the scripted demo model: demo roles are seeded by default and connecting a key changes nothing. | `SettingsService.java:46-57` |
| Same complaint, second cause | The unexplained "Budget" field was set to 1,000 tokens, which would have stopped the run even if it had started. | `campaign_index.options_json` |
| Settings are overloaded, JSON by hand | 14 sections, 102 schema fields (about 19 unwired, about 9 read-only), JSON text areas for the tier table, the profile editor and the settings layer. | `SettingsSchema.java:42-177`; `settings.ts:115,142` |
| "Spaceship cockpit" | About 20 surfaces, a permanent status strip with six segments, header chips with ids, a canvas of ROUTER / CONTROLLER / COMPILER / KB / ATLAS / VERIFIER nodes. | `campaign-view.ts`, `mission-strip.ts`, `flow-canvas.ts` |
| Silent failures | Socket commands have no timeout and are not rejected on close. Run failures end with `outcome = null` and no notification. Unknown event kinds and model errors are dropped by the reducer. | `ws.ts:72-81,130-136`; `CampaignService.java:153,324`; `campaign-model.ts:320-339,615-618` |

### 1.3 Why the alternative concept does not help

`BEST_CONCEPTS_MIXED.md` is only moderately smaller: about 17 surfaces instead of 20, about 150 settings instead of 200, and a provider wizard of seven steps instead of four. It exposes the same concepts (campaign, attempt, candidate, profile, qualification, frozen configuration, S0–S3). Both documents answer the old goal, "show everything ASTROLABE can do". The goal is now the opposite.

### 1.4 What happens to the existing code

| Path | Action |
|---|---|
| `frontend/src/app/core/*` | Keep. Add a command timeout, reject pending commands when the socket closes, check `status` in `Api.command`. |
| `frontend/src/app/ui/*`, `styles.css` tokens | Keep. Raise the base size, remove the density switch (section 11). |
| `features/thread/*`, `decisions/decision-card.ts`, `changes/changes.ts`, `projects/add-project.ts` | Salvage as starting material for the new task view, cards, Changes panel and folder dialog. |
| `features/overview`, `plan`, `evidence`, `context`, `knowledge`, `stats`, `activity`, `diagnostics`, `decisions/inbox.ts`, `providers`, `settings`, `campaign/mission-strip.ts`, `shell/inspector.ts`, `shell/palette.ts`, `home`, `composer/new-campaign.ts` | Delete after the new screens replace them. |
| Backend REST and socket endpoints | Keep all. The new UI uses a subset plus the additions of section 12. |

`ASTROUI/` is currently untracked in git. Commit it before any change so the present state can be restored (`BE-0`).

---

## 2. Principles and complexity budget

| Id | Principle |
|---|---|
| P-1 | **Task first.** The user's model is project → task → changes. The agent's internal model never appears in the default UI. |
| P-2 | **One required setup step:** connect a model. Everything else has a working default chosen automatically. |
| P-3 | **Three levels of disclosure.** L0 is always visible and enough to work. L1 is one click away (expand a step, open the side panel). L2 is Advanced and is never needed to get work done. |
| P-4 | **No dead ends, no silence.** Every state shows what is happening and one primary action. Every failure is a plain sentence with a fix. |
| P-5 | **Plain language.** About 15 product words (section 3). Internal terms and ids are forbidden in default UI text and this is enforced by a test. |
| P-6 | **Familiar layout.** Sidebar with projects and tasks, a centred conversation, a composer at the bottom, a side panel on demand. |
| P-7 | **Calm visuals.** Neutral palette, one accent, generous spacing, no permanent gauges or chip rows. |
| P-8 | **Automatic first, override second.** Detect accounts, pick a model, find check commands, manage locks, recover after restarts. Let the user change the outcome, never require it. |

**Complexity budget.** These are hard limits. A change that exceeds one needs the owner's approval.

| Item | Limit | Today |
|---|---|---|
| Fixed sidebar destinations | 2 (New task, Settings) | 9 |
| Routes | 5 | 15 |
| User decisions before the first task runs | 3 (account, folder, request) | about 10 |
| Composer controls | 4 (project, model, mode, send) | 9 |
| Permanent secondary panels | 0 | 1 strip + tab bar |
| Side panel tabs | 3 | 6 tabs + drawer |
| Settings visible by default | 20 in 5 sections | 102 in 14 sections |
| Raw JSON editing | none | 3 places |
| Internal ids and hashes in default UI | none | many |
| Product vocabulary | 20 words | about 55 terms |

---

## 3. Vocabulary

| The user sees | Internal meaning |
|---|---|
| Project | Repository / workspace root |
| Task | A thread: the first campaign and its follow-up campaigns |
| Message | User request, amendment or answer |
| Step | One tool call |
| Plan | Increments and requirements |
| Checks | Acceptance runs, check receipts, review verdicts |
| Verified | Accepted on evidence at a candidate |
| Question | `ask.question` decision |
| Approval | D-class request |
| Suggestion | Amendment proposed by the agent |
| Changes | Difference between the latest snapshot and snapshot 0 |
| Account | Provider plus credential |
| Model | Profile bound to the main role |
| Effort | Reasoning effort of the main model |
| Mode: Ask / Auto | `Mode.Interactive` + D-class `Ask` / `Mode.Autonomous` |
| Limit | Token or money budget |

**Forbidden in default UI text** (UX-1): campaign, contract, cell, turn, increment, ledger, lease, fence, evidence, receipt, stamp, candidate, workset, manifest, register, shape, S0–S3, D-class, effect class, ceiling, annex, attempt, fingerprint, profile, qualify, freeze, routing, tier, authority, intent, reconcile, gate, nudge, curator, harness, ids such as `W-…` and `cell-…`, gap ids `G-nn`, spec references `§n`. They may appear only in L2 technical views.

**How ASTROLABE's strengths reach the user**

| Strength of the agent | What the user experiences |
|---|---|
| Work is accepted only on evidence | A "Verified" line in the result: which checks ran and passed |
| Snapshots of every changing step | "Undo" always works, for one file or for everything |
| Planned increments | A short plan with progress |
| Capability limits and approval of risky effects | The agent works freely inside the project and asks before anything risky |
| Durable journal and resumable runs | After a restart the task says "Paused" with a "Continue" button |

---

## 4. Layout and navigation

### 4.1 Layout

```
┌───────────────┬──────────────────────────────────────────────┬──────────────────────────┐
│ ASTROLABE     │ shop-api › Fix discount rounding     ◧  ⋯    │ Changes  Progress  Output│
│ [+ New task]  │                                              │                          │
│               │  You                                         │ pricing.py        +12 −3 │
│ shop-api      │  Fix apply_discount so totals never go       │ test_pricing.py    +8    │
│  ● Fix disc…  │  negative.                                   │ ──────────────────────── │
│  ✓ Add CSV…   │                                              │ @@ -14,7 +14,9 @@        │
│ blog          │  ASTROLABE                                   │ - total = price - disc   │
│  ✓ Dark mode  │  I'll read the pricing code and its tests.   │ + total = max(0, …)      │
│               │  ▸ Read 3 files · edited 1 · ran tests ✓     │                          │
│               │                                              │                          │
│               │  ┌ Question ─────────────────────────────┐   │                          │
│               │  │ How should totals be rounded?         │   │                          │
│               │  │ [To cents] [Keep precision] [Other…]  │   │                          │
│               │  └───────────────────────────────────────┘   │                          │
│               │                                              │                          │
│               │  ┌───────────────────────────────────────┐   │                          │
│               │  │ Reply…                                │   │                          │
│ ⚙ Settings    │  │ 📁 shop-api  ◆ Model · Medium  Ask  ↑ │   │                          │
└───────────────┴──┴───────────────────────────────────────┴───┴──────────────────────────┘
   240 px           conversation column, max 760 px              closed by default, 40 %
```

### 4.2 Sidebar (UX-2)

- "New task" button. Shortcut Ctrl+N.
- Projects, each a collapsible group named after its folder. Tasks inside, newest activity first, eight shown, then "Show more".
- One status mark per task: working (animated dot), needs you (amber dot), paused (hollow dot), done (check), stopped (square), failed (red mark).
- When at least one task needs the user, a line "Needs you (n)" appears above the projects and jumps to the oldest one. There is no inbox page.
- Task menu: Rename, Stop, Delete. Project menu: Project settings, Remove from list.
- Footer: Settings. If no model is usable, the footer shows "Connect a model" in the accent colour.
- Collapsible to icons. Width 240 px.

### 4.3 Routes (UX-3)

| Route | Screen |
|---|---|
| `/` | Redirect: last open task, else `/new`, else `/welcome` |
| `/welcome` | First run (section 5) |
| `/new` | New task: empty conversation with the composer in the centre |
| `/t/:taskId` | Task view. Side panel state in the query: `?panel=changes|progress|output&file=…` |
| `/settings/:section?` | Settings (section 9) |

---

## 5. First run

Shown when there is no usable account or no project. One page, no wizard steps (UX-4).

```
                  Welcome to ASTROLABE

  1  Connect a model
     ┌──────────────────────────┐ ┌──────────────────────────┐
     │ Sign in with ChatGPT     │ │ OpenRouter               │
     │ Plus or Pro subscription │ │ Sign in or API key       │
     └──────────────────────────┘ └──────────────────────────┘
     [Anthropic] [OpenAI API] [Google Gemini] [Local model] [More…]

     Found on this computer
     ✓ OPENAI_API_KEY in your environment            [Use it]
     ✓ Ollama is running with 4 models               [Use it]

  2  Open a project folder
     [Choose folder…]        Recent: C:\work\shop-api

     Try it without an account: [Run the demo]
```

Rules:

- UX-5. Step 1 turns into "Connected: ChatGPT Plus · model *name* [Change]" once an account works. Step 2 turns into the folder name. When both are done the app goes to `/new` with the composer focused.
- UX-6. Detection runs when the page opens: environment variables for known providers and probes of local servers (Ollama `127.0.0.1:11434`, LM Studio `:1234`, vLLM `:8000`). A detected source is never used without the user's click.
- UX-7. After a successful connection the app runs the non-billable connection test and selects the recommended model (section 6.4). The user is not asked anything else.
- UX-8. A folder that is not a git repository gets one question: "This folder is not a git repository yet. ASTROLABE uses git to track and undo its changes." [Initialise git] [Choose another folder].
- UX-9. The demo is hidden by default. "Run the demo" enables demo mode, which is labelled as such in every demo task.

**Folder dialog.** A browser cannot give an absolute path, so the dialog is served by the backend: breadcrumb, list of sub-folders only, a git mark on repositories, a path field that accepts a pasted path, recent folders, and "Select this folder".

---

## 6. Accounts and models

### 6.1 Connect dialog (UX-10)

The same dialog serves first run and Settings. Only methods that work are offered.

| Provider | Methods shown | Notes |
|---|---|---|
| ChatGPT (Plus / Pro) | Sign in with browser; "Use a code instead" | SDK preset `openai-codex`, OAuth only. No API-key field. |
| OpenRouter | Sign in; API key | OAuth issues a key. |
| Anthropic, OpenAI API, Google Gemini, DeepSeek, xAI, Mistral, Groq, Qwen | API key, with a "Get a key" link | One field, a "Connect" button. The key is never shown again. |
| Local model | Detected servers; or address | No key. Listed only when reachable. |
| Custom (OpenAI-compatible) | Name, address, optional key | Uses `OpenAiCompatible.custom`. If the server lists no models, one field "Model name". |

After "Connect": test → load models → pick recommended → close. A failure stays in the dialog as one sentence with the fix (section 10).

### 6.2 Sign in with ChatGPT (UX-11)

```
idle → starting → waiting_for_browser ─┬→ finishing → connected
                 └→ waiting_for_code ──┘
        any state → cancelled | timed_out | failed(code)
```

| State | What the user sees |
|---|---|
| starting | Button shows a spinner |
| waiting_for_browser | "Finish signing in in your browser." A link "Open the sign-in page again", "Copy link", "Use a code instead", "Cancel" |
| waiting_for_code | The code in large type with "Copy", the address to open, the time left, "Cancel" |
| finishing | "Signing you in…" |
| connected | "Connected as *account*" and the chosen model |
| failed | One sentence and one action (E-10 to E-13) |

Implementation notes:

- The SDK call blocks, so the backend runs `llm.auth().login("openai-codex", AuthType.OAUTH, interaction, cancelToken)` on a virtual thread. The `AuthInteraction` answers the `Select` prompt with the method the user chose and forwards `OpenUrl` and `DeviceCode` notices to the UI.
- The SDK opens the loopback listener itself on the port of the registered redirect, 1455. If the port is busy (for example a Codex CLI login is open), the backend switches to the code path and says why.
- Pop-up blockers: the UI opens a blank tab in the click handler and sets its address when the URL arrives. The link in the dialog is the fallback.
- Tokens stay on the server. They refresh automatically. If refresh fails, a banner "Your ChatGPT session expired" offers "Sign in again", and running tasks pause with E-2.
- The dialog states: "Uses your ChatGPT subscription. Usage counts against your plan's limits." The SDK marks this backend as not an official third-party API; treat breakage as E-5.

### 6.3 Accounts list (UX-12)

Settings › Models & accounts shows **only connected or detected accounts** as cards. The 14 presets are reachable through "Add account".

| Account source | Card actions |
|---|---|
| Signed in (OAuth) | Sign out |
| API key | Replace key, Remove |
| Environment variable | "From OPENAI_API_KEY" and a switch "Use this key" |
| Local server | Shown while reachable; Hide |
| Custom | Edit, Remove |

"Remove" deletes the credential, the stored test result and the automatic profiles of that provider. If the default model belonged to it, the next recommended model becomes the default, or the footer asks to connect a model. A confirmation names what will stop working.

### 6.4 Model picker (UX-13)

One control, in the composer and in Settings.

```
┌ Model ───────────────────────────────┐
│ 🔍 Search                            │
│ Recommended                          │
│  ◆ Model A      ChatGPT   included   │
│  ◆ Model B      OpenRouter   $$      │
│ All models                           │
│    Model C      OpenRouter   $       │
│    …                                 │
│ ──────────────────────────────────── │
│ Effort   Low  [Medium]  High         │
└──────────────────────────────────────┘
```

- Lists models of connected accounts only. A model qualifies if it has text output and tool calling. Embedding, image, audio, realtime and deprecated models are excluded.
- Each row: name, account, price mark (`included`, `free`, `$`, `$$`, `$$$`, or nothing when unknown), context size on hover.
- "Recommended" comes from `recommended-models.json`: per provider, an ordered list of model id patterns; the first that exists in the live catalog wins. With no match the rule is: tool calling and reasoning, largest context, newest, not a reduced variant (`mini`, `nano`, `flash`) unless nothing else exists. The file ships with the Studio and can be replaced in the data folder. **Its content must be checked against the live catalog when it is written; this document does not rank models.**
- Effort shows only the levels the model supports (SDK `reasoningLevels`). Default Medium.
- The choice is remembered as the default. Changing it while a task runs applies from the next message, and the picker says so.

### 6.5 What the backend does when a model is chosen (BE-4)

1. Profile id `auto.<provider>.<model>`. If missing, create it with `AiGateProfiles.draft`. If the catalog has no limits for the model (common for local models), take them from the server's model listing, else use 32,768 context and 4,096 output and mark the profile "estimated".
2. Run the non-billable validation. A failure becomes an error with a plain sentence.
3. No qualification. It is billable and optional, and lives in Advanced as "Calibrate this model".
4. Bind `profileRoles = { main: id, helper: null, escalation: null }` and leave the tier table untiered. One model serves every function. `helper` must be `null`: its library default is the id `"helper"`, which fails validation when no such profile exists.

---

## 7. Task workflow

### 7.1 Composer (UX-14)

| Control | Values | Default | Internal mapping |
|---|---|---|---|
| Text | "Describe what to build, fix or change…" | — | Request text |
| Project | Known projects, "Open folder…" | Current project | Project |
| Model · Effort | Section 6.4 | Recommended · Medium | Main profile, `effort` |
| Mode | Ask, Auto | Ask | Interactive + D-class Ask; Autonomous |
| Send / Stop | Send becomes Stop while the task works | — | Start, message, cancel |

Enter sends, Shift+Enter adds a line (setting 3). Removed from the composer: budget, ceiling, D-class, "resume expected", hints, the intent selector, demo buttons.

| Mode | Meaning shown in the menu |
|---|---|
| **Ask** | "Works freely inside the project. Asks before risky actions and when something is unclear." |
| **Auto** | "Never interrupts. Skips risky actions you have not allowed before and makes reasonable assumptions." |

### 7.2 Start sequence (UX-15, BE-5)

`task.start` returns a task id at once. The user's message appears in the conversation immediately and is never lost. The steps run on the server; the UI shows one status line.

| # | Step | Automatic handling | If it fails |
|---|---|---|---|
| 1 | Account usable | Refresh an expiring token | E-1, E-2 |
| 2 | Model ready | Section 6.5 | E-6 |
| 3 | Project usable | — | E-7, E-8 |
| 4 | No other task running in the project | — | E-9 |
| 5 | No stale lock | Release a lock whose holder process is gone | E-9b |
| 6 | Open the run | Verification setup (7.3) if the core refuses for lack of acceptance | E-14 |
| 7 | Run | — | Section 10 |

Uncommitted changes of the user are not an error. The conversation notes once: "You have uncommitted changes. They stay separate from mine in Changes."

### 7.3 Verification setup (UX-16, BE-6)

The core starts only when the task has something executable to accept against. The backend supplies it without asking.

| Order | Source | Acceptance added | The user sees |
|---|---|---|---|
| 1 | Check commands saved in Project settings | `run:` those commands | "Checks: `npm test`" |
| 2 | A declared test command (the core's own derivation) | `run:` test | "Checks: `npm test`" |
| 3 | A declared type check, build or lint command, in that order | `run:` the first found | "Checks: `npm run build` (no tests found)" |
| 4 | Nothing declared | `check:` "The change fulfils the request", assessed by the agent's independent review step | "No tests found. I'll double-check the result with a review pass." |

- Mechanism: `Controller.open` uses a stored contract when one exists and returns a refusal when the single-increment plan has no `run:` item and no `check:` item. The bridge reacts to that refusal by amending the contract through `Contracts.amendByUser(work, text, apply)` with the item from the table, then opens again. Commands come from `Sniff.commands` (`PackageCommands.test/build/lint/typecheck`). **S-1 must prove this path before the UI depends on it.**
- The line is an information line in the conversation, not a question. In Ask mode it carries a "Change" link that opens Project settings › Checks.
- A result verified by order 3 or 4 is labelled honestly (section 7.8).

### 7.4 Conversation (UX-17)

| Item | Appearance |
|---|---|
| User message | Plain block, right-aligned name "You" |
| Agent message | Markdown text |
| Activity group | One line summarising consecutive steps: "Read 3 files · edited 1 · ran tests ✓". Open while live, collapsed when finished, expandable |
| Step | Icon, short sentence, result mark, duration. Click opens the side panel at that file or output |
| Status line | Above the composer while working: "Editing `pricing.py`… 0:42". Shows "Thinking…" between steps |
| Plan divider | "Step 2 of 4 · Fix apply_discount". Only when the plan has more than one step |
| Checks card | "Tests passed (24)" or "Tests failed (2 of 24)" with "Show output" |
| Question, Approval, Suggestion | Cards (7.5) |
| Notice | One muted line (verification source, uncommitted changes, model changed) |
| Error card | Section 10 |
| Result card | Section 7.8 |

The full mapping from events to items is Appendix A.

### 7.5 Questions, approvals, suggestions (UX-18)

**Question**

```
┌ Question ───────────────────────────────────────┐
│ How should cart totals be rounded?              │
│ [1 Round to cents]  [2 Keep full precision]     │
│ Or type your answer below.                      │
└─────────────────────────────────────────────────┘
```

Typing in the composer answers the pending question. Keys 1–9 choose an option.

**Approval**

```
┌ Approval needed ────────────────────────────────┐
│ Install packages                                │
│ npm install lodash                              │
│ Needs network access and changes package files. │
│ [Allow once] [Always allow in this project] [Deny] │
└─────────────────────────────────────────────────┘
```

| Effect | Title |
|---|---|
| Package installation | Install packages |
| Network | Access the network |
| Git reference change | Change git history |
| Write outside the workspace | Write outside the project folder |
| Protected path | Change a protected file |
| Destructive delete | Delete files permanently |
| Anything else | Run a risky command |

- "Always allow in this project" stores the command pattern in the project's allow list (Settings › Permissions). **S-6** checks that the core's allow list can be written per project; until then the button is hidden.
- No key is bound to "Allow" by default. Keys 1, 2, 3 choose after the card has focus.

**Suggestion** (the agent proposes to change the goal): "The agent suggests changing the goal: *text*" [Accept] [Decline]. If the change relaxes a requirement the card says "This makes the task easier to pass" and "Accept" needs a second click.

**While a card waits:** the task state is "Needs you", the sidebar shows the amber mark, the browser tab title starts with "(1)", and a desktop notification is sent if enabled.

**Auto mode:** questions are answered by the host with "Use the most reasonable assumption and list your assumptions in the summary." Risky actions outside the allow list are denied, and the result card lists them under "Skipped, needed your approval" with "Allow and continue". Suggestions that relax a requirement are declined. **S-7** checks the question policy against the core.

### 7.6 Follow-ups, Stop, Continue (UX-19, BE-7)

The composer has one action. The backend decides what a message means.

| Situation | What the message does |
|---|---|
| A question is pending | Answers it |
| The task is working | Is added to the task; the agent sees it at its next step. Notice: "The agent will see this at its next step." |
| The task is paused and can continue | Is added, then the task continues |
| The task is done, stopped or failed | Starts a follow-up run in the same task. The backend prepends a short recap of the previous request and result, marked as context |

- **Stop** ends the current run. Changes made so far stay. The task shows "Stopped" and the composer stays usable.
- **Continue** appears on paused tasks and on tasks interrupted by a restart.
- A task is the first run plus its follow-ups, linked by `parent_work`. The task id is the first run's id.

### 7.7 Task states (UX-20)

| State | Mark | Internal source | Primary action |
|---|---|---|---|
| Working | Animated dot | `opening`, `Running`, `Finishing` | Stop |
| Needs you | Amber dot | A pending question, approval, suggestion or review | Answer the card |
| Paused | Hollow dot | `WaitingForInput`, `WaitingForProcess`, `BlockedExternal` without a pending card; `BudgetExhausted`; interrupted by restart | Continue |
| Done | Check | `Completed` | Review changes |
| Stopped | Square | `Cancelled` | Send a follow-up |
| Failed | Red mark | `Failed`, `open_failed`, a run that ended with an error | Retry |

Every Paused and Failed state carries a reason code from section 10. A state without a reason is a defect.

**Watchdog (UX-21).** If a working task produces no event for 90 seconds the status line says "Still working… last activity 2 min ago". After 5 minutes a notice offers "Keep waiting" and "Stop". A start that is not acknowledged within 30 seconds becomes E-15.

### 7.8 Result and landing the changes (UX-22)

```
┌ Done ───────────────────────────────────────────────┐
│ Discounts are now percentages and totals are        │
│ clamped at zero.                                    │
│                                                     │
│ Changes    4 files   +120 −8        [Review changes] │
│ Verified   Tests passed (24)                        │
│ Used       18.4k tokens · $0.04 · 1 min 12 s        │
│                                                     │
│ [Commit…]  [Undo all]                               │
└─────────────────────────────────────────────────────┘
```

| "Verified" line | When |
|---|---|
| "Tests passed (n)" | Order 1 or 2, green |
| "Build passed — no tests in this project" | Order 3, green |
| "Reviewed by a second pass — no tests in this project" | Order 4 |
| "Not verified" and the reason | Checks failed, or the run stopped early |

- The changes are already in the working folder, so "keep" needs no action.
- **Commit…** opens a dialog: message prefilled from the summary, the agent's files ticked, the user's earlier changes listed separately and unticked, the current branch, an option "Create a new branch" with a suggested name. The backend runs an ordinary `git add` and `git commit` for the selected paths as the user's action.
- **Undo all** restores the state before the task for files the agent changed. Files the user edited afterwards are skipped and listed.
- Push and pull requests are out of scope for this version (section 16).

---

## 8. Side panel

Closed by default. Opens on "Review changes", on a click on a step, or with the button in the task header. Resizable, 40 % of the width, at least 420 px. Below 1100 px it covers the conversation.

### 8.1 Changes (UX-23)

- File list with added and removed line counts, grouped by folder when there are more than 12 files.
- Unified diff with word-level marks (existing `ui/diff-view.ts`).
- Per file: Undo. Header: Commit…, Undo all.
- Switch "Show my earlier changes", off by default.
- Live while the task works, refreshed at most once per second.
- Line-ending-only differences are hidden, as today.

### 8.2 Progress (UX-24)

This replaces the architecture canvas. It answers "what is the agent doing" without showing how the agent is built.

```
  ●──────────●──────────◉──────────○──────────○
Understand   Plan      Build      Check     Finish

Now     Editing src/shop/pricing.py
Plan    ✓ 1  Read the pricing logic and its tests
        ◉ 2  Fix apply_discount
        ○ 3  Run the test suite
Helpers 2 working in parallel
Used    18.4k tokens · $0.04 · 1 min 12 s          ▁▁▂ 3 % of limit
```

| Stage | Event phases |
|---|---|
| Understand | `Understand`, `Locate`, `Retrieve` |
| Plan | `Plan` |
| Build | `Edit`, `Delegate`, `Integrate`, `Compact`, `Recover` |
| Check | `Verify`, `Review` |
| Finish | Campaign phase `Finishing`, `Ended` |

The current stage pulses gently; a line travels along the rail when the stage changes. With reduced motion the stage is only highlighted. "Helpers" appears only when the agent delegates. The plan section is hidden when the plan has one step.

### 8.3 Output (UX-25)

List of commands the agent ran, newest first: command, result mark, duration. Selecting one shows its output in a monospace block with "Copy". Check runs are marked "check".

---

## 9. Settings

One page, five sections, a search field. Every setting has one line of help. Nothing requires JSON.

| # | Section | Setting | Values | Default |
|---|---|---|---|---|
| 1 | General | Theme | System, Light, Dark | System |
| 2 | General | Notify me when a task needs me or finishes | On, Off | Asked once while the first task runs |
| 3 | General | Send with | Enter, Ctrl+Enter | Enter |
| 4 | Models & accounts | Accounts | Section 6.3 | — |
| 5 | Models & accounts | Default model | Section 6.4 | Recommended |
| 6 | Models & accounts | Default effort | Low, Medium, High | Medium |
| 7 | Permissions | Default mode | Ask, Auto | Ask |
| 8 | Permissions | Always allowed in this project | List with remove | Empty |
| 9 | Permissions | Protected files | List of paths | Git data, CI configuration, lock files, migrations |
| 10 | Project | Check commands: test, build, lint | One line each, with "Detected from package.json" | Detected |
| 11 | Project | Use project instructions from *file* | On, Off | On when `AGENTS.md`, `CLAUDE.md` or `.astrolabe/rules.md` exists; a one-time notice names the file |
| 12 | Project | Remove project from the list | Button | — |
| 13 | Advanced | Limit per task | Automatic, tokens, money | Automatic |
| 14 | Advanced | Tasks running at the same time | 1–5 | 3 |
| 15 | Advanced | Demo mode | On, Off | Off |
| 16 | Advanced | Calibrate the current model | Button; states the cost: 3–5 short paid requests | — |
| 17 | Advanced | Data folder | Path, "Open" | — |
| 18 | Advanced | Export diagnostics | Button; secrets removed | — |
| 19 | Advanced | Reset settings | Button with confirmation | — |

Advanced is collapsed. Settings 10–12 apply to the project chosen at the top of the section.

An "Expert settings" list of the engine's tunables is optional later work (section 16) and is never required.

**Everything else is automatic.** Appendix B lists the hidden groups and their values.

---

## 10. Errors and empty states

Rules (UX-26):

1. An error is a card in the conversation, or a line in the dialog where it happened.
2. It has one plain sentence, at most two actions, and a "Details" expander with the raw reason and "Copy details".
3. An unknown error uses E-16. A blank or frozen screen is a defect.
4. The backend sends `{ code, params, detail, retryable }`; the text lives in the frontend message catalog.

| Id | Code | Sentence | Actions |
|---|---|---|---|
| E-1 | `account_missing` | "Connect a model to start." | Connect |
| E-2 | `auth_expired` | "Your *account* session expired." | Sign in again · Retry |
| E-3 | `auth_rejected` | "*Account* rejected the key." | Replace key · Retry |
| E-4 | `rate_limited` | "*Account* is limiting requests. Retrying in *n* s." | Retry now · Change model |
| E-4b | `quota_exhausted` | "Your *account* plan has no usage left for now." | Change model |
| E-5 | `provider_unreachable` | "Could not reach *account*." | Retry · Change model |
| E-6 | `model_unavailable` | "*Model* is not available on *account*." | Choose another model |
| E-7 | `project_not_found` | "The folder *path* no longer exists." | Choose folder · Remove project |
| E-8 | `not_a_git_repo` | "This folder is not a git repository yet." | Initialise git |
| E-9 | `project_busy` | "Another task is running in this project." | Open it · Stop it and start this one |
| E-9b | `project_locked` | "This project is still locked by a session that ended unexpectedly." | Unlock and continue |
| E-10 | `login_port_busy` | "Another app is using the sign-in port. Use a code instead." | Use a code |
| E-11 | `login_timeout` | "Sign-in took too long." | Try again |
| E-12 | `login_denied` | "Sign-in was cancelled in the browser." | Try again |
| E-13 | `login_failed` | "Sign-in failed." | Try again · Use a code |
| E-14 | `no_verification` | "I could not find a way to check the result." | Set a check command · Continue with a review pass |
| E-15 | `start_timeout` | "The task did not start." | Retry |
| E-16 | `agent_error` | "Something went wrong inside the agent." | Retry · Copy details |
| E-17 | `limit_reached` | "This task reached its limit of *n*." | Continue with more · Stop |
| E-18 | `command_timeout` | "`cmd` ran longer than allowed and was stopped." | Retry |
| E-19 | `connection_lost` | Banner: "Reconnecting to ASTROLABE…" | — (automatic) |
| E-20 | `context_too_large` | "This request is too large for *model*." | Choose a model with a larger context |

**Empty states**

| Place | Text | Action |
|---|---|---|
| Sidebar without projects | "No projects yet" | Open folder |
| `/new` | Centred composer, three example requests fitted to the project's language | — |
| Changes without changes | "No changes yet" | — |
| Output without commands | "The agent has not run any commands" | — |
| Accounts without accounts | "No model connected" | Add account |

---

## 11. Visual design

| Aspect | Rule |
|---|---|
| Type | Inter 14 px for text, 13 px for secondary text, JetBrains Mono 13 px for code. Line height 1.5. |
| Colour | Neutral greys from the existing tokens. One accent. Status colours only for state marks, diff lines and error cards. |
| Width | Conversation column at most 760 px, centred. |
| Shape | Radius 8 px, 1 px borders, shadows only on menus and dialogs. |
| Motion | 150 ms ease. A slow pulse for "working". Reduced motion is respected. |
| Density | One density. The density switch is removed. |
| Themes | Light and dark through the existing tokens; follows the system by default. |
| Not used | Rows of chips, gauges, upper-case section bars, ids, more than one accent. |
| Accessibility | Contrast 4.5:1 for text. Every action reachable by keyboard. Cards announce themselves to screen readers. Focus moves to a new question or approval card. |

Shortcuts: Ctrl+N new task · Ctrl+Shift+D toggle Changes · Esc close panel or dialog · 1–9 choose an option on a focused card.

---

## 12. Backend changes

### 12.1 Keep

`StudioHost` bridge, `CommandService`, `EventPipeline`, `EventLog`, `TopicBroker`, `StudioSocket` (ASTRO-WS/1), `DecisionService`, `ChangesService`, `ProjectService`, `SettingsService` layering and validation, `LocalSession`, `StudioDb`, `ErrorHandling`.

### 12.2 Work items

| Id | Item | Notes |
|---|---|---|
| BE-0 | Commit the current `ASTROUI/` tree | It is untracked today |
| BE-1 | Accounts API | List, connect, remove, detect. Removal also clears `provider_config` and automatic profiles. Environment keys are used only after the user enables them. Local servers are listed only when reachable. Custom endpoints. Call `TransportService.rebuild()` after every change. |
| BE-2 | OAuth login sessions | Section 6.2. Virtual thread per login, `AuthInteraction` bridge, cancel, time-out, port-busy fallback. |
| BE-3 | Usable models | Capability filter, price mark, `recommended-models.json`, heuristic fallback. |
| BE-4 | Automatic profile and role binding | Section 6.5. Model and effort accepted as task options and merged before the configuration is frozen. |
| BE-5 | `task.start` with preflight | Section 7.2. `tokens` is no longer an input; the limit comes from setting 13 or the automatic value. |
| BE-6 | Verification setup | Section 7.3. |
| BE-7 | `task.message` with intent inference and task threads | Section 7.6. Recap composed by the host, at most 1,500 characters. |
| BE-8 | Normalised errors and states | `studio.error`, `studio.task_state`. A run that ends with an error produces a Failed state, a reason code and a notification. Today `outcome = null` produces none. |
| BE-9 | Demo off by default | Register the demo provider, profiles and project only in demo mode. Stop seeding demo roles in `SettingsService.ensureStudioLayer`. |
| BE-10 | Lock recovery | Release a workspace lock whose holder process no longer exists. Upstream finding F-1 stays open for a stable holder id. |
| BE-11 | Undo | Restore files to the state before the task, for a list of paths or all. |
| BE-12 | Commit | `git add` and `git commit` for selected paths on the current or a new branch. |
| BE-13 | Folder listing | Folders only, local session only. Git initialisation on request. |
| BE-14 | Auto-mode policy | Host answers to questions, denial and listing of risky actions outside the allow list. |
| BE-15 | Set `unknownOutcomeReconciliation = Automatic` | So a crash does not leave a project fenced |
| BE-16 | Diagnostics export | Logs, configuration without secrets, event logs of the last tasks |

### 12.3 New endpoints

All under `/api/v1`, protected by the existing local session. Existing endpoints stay.

| Method and path | Purpose |
|---|---|
| `GET /app` | Accounts, default model, projects, tasks, count of tasks needing the user |
| `GET /accounts` · `POST /accounts` · `DELETE /accounts/{id}` | List, connect (key, environment, local, custom), remove |
| `POST /accounts/detect` | Environment keys and local servers found |
| `POST /accounts/login` · `GET /accounts/login/{id}` · `POST /accounts/login/{id}/cancel` | OAuth login session |
| `GET /models/usable` | Filtered list with `recommended`, `price`, `context`, `efforts` |
| `PUT /preferences` | Default model, effort, mode, theme and the other General settings |
| `GET /fs/folders?path=` · `POST /fs/git-init` | Folder dialog |
| `POST /projects` · `DELETE /projects/{id}` · `GET/PUT /projects/{id}/settings` | Projects and their check commands, instructions switch, allow list, protected files |
| `POST /tasks` | Start: `{ projectId, text, model?, effort?, mode? }` → `{ taskId }` |
| `GET /tasks/{id}` | Task with state, runs, pending cards, change summary, usage |
| `POST /tasks/{id}/messages` | `{ text, questionId? }` |
| `POST /tasks/{id}/stop` · `POST /tasks/{id}/continue` | Stop, continue |
| `POST /tasks/{id}/cards/{cardId}` | `{ decision: allow_once | allow_always | deny | accept | decline, answer? }` |
| `GET /tasks/{id}/changes` · `GET /tasks/{id}/diff?path=` | Served by the existing change services |
| `POST /tasks/{id}/undo` · `POST /tasks/{id}/commit` | Undo, commit |
| `GET /tasks/{id}/output` · `GET /tasks/{id}/output/{runId}` | Commands and their output |
| `POST /diagnostics/export` | Diagnostics archive |

**Task object**

```json
{
  "id": "W-…",
  "projectId": "p-…",
  "title": "Fix discount rounding",
  "state": "working | needs_you | paused | done | stopped | failed",
  "reason": { "code": "limit_reached", "params": {} },
  "verified": "tests | build | review | none",
  "model": { "ref": "openrouter/…", "name": "…", "effort": "medium" },
  "mode": "ask | auto",
  "runs": [ { "workId": "W-…", "startedAt": "…", "endedAt": "…", "outcome": "completed" } ],
  "pending": [ { "id": "…", "kind": "question | approval | suggestion" } ],
  "changes": { "files": 4, "added": 120, "removed": 8 },
  "usage": { "tokens": 18400, "cost": { "amount": "0.04", "currency": "USD" }, "elapsedMs": 72000 },
  "updatedAt": "…"
}
```

### 12.4 Socket

ASTRO-WS/1 is unchanged. The client subscribes to `app` and to `campaign:<workId>` for each run of the open task.

| New item on | Kind | Content |
|---|---|---|
| `app` | `accounts.changed` | — |
| `app` | `auth.login.updated` | `{ loginId, state, url?, userCode?, verificationUri?, expiresAt?, error? }` |
| `app` | `task.updated` | Task object without `runs` |
| `campaign:*` | `studio.task_state` | `{ state, reason? }` |
| `campaign:*` | `studio.error` | `{ code, params, detail, retryable }` |
| `campaign:*` | `studio.verification` | `{ kind, command? }` |
| `campaign:*` | `studio.preflight` | `{ step, status }` |

### 12.5 Spikes

Each is a small test against the real core and SDK. **The UI work of phase 2 starts only after S-1, S-2 and S-3 pass.**

| Id | Question | Pass condition |
|---|---|---|
| S-1 | Does the verification path work? | In a repository without any manifest, open → refusal → amend with a `run:` item → open → the run starts. The same with a `check:` item, and the run completes through the review step. |
| S-2 | Does ChatGPT sign-in work from the server? | Browser path and code path both end in a stored credential; a busy port 1455 falls back to the code path; a refresh succeeds. |
| S-3 | Does one real task complete on a live model? | "Create a hello world program" in an empty repository completes on at least one API-key provider and on ChatGPT sign-in. The core's live gates are `UNMEASURED` today, so failures here are core work, not UI work. |
| S-4 | Can files be restored to the state before the task? | A list of paths is restored; a file edited by the user afterwards is refused and reported. |
| S-5 | Does a follow-up run work with `parentWork` and a recap? | The second run sees the recap as context and does not treat it as a requirement. |
| S-6 | Can the allow list for risky commands be written per project? | An allowed command runs without an approval card in the next task. |
| S-7 | Can the host answer questions in Auto mode? | A question is answered by the host policy and the run continues. |

If S-1 fails for `check:` items, order 4 of section 7.3 becomes E-14 with its two actions until the core supports it.

---

## 13. Frontend architecture

```
src/app/
  core/        keep: ws, api, envelope, format; fix time-outs and status checks
  ui/          keep: icon, markdown, diff-view; add: button, menu, dialog, card, toast
  state/       app.store (slim), task.store (from campaign.store)
  timeline/    reducer: raw events → timeline items; mapping tables; message catalog; tests
  features/
    shell/     sidebar, side-panel host, toasts, banners
    welcome/   first run
    accounts/  connect dialog, sign-in flow, model picker
    task/      task view, composer, cards, activity group, status line
    panel/     changes, progress, output
    settings/  one page
```

| Id | Item |
|---|---|
| FE-1 | Shell, routes, sidebar |
| FE-2 | Welcome, folder dialog |
| FE-3 | Connect dialog, sign-in flow, accounts list |
| FE-4 | Model picker |
| FE-5 | Composer |
| FE-6 | Timeline reducer and items (Appendix A). Unknown event kinds are kept for the technical view and never break the timeline. Errors are always surfaced. |
| FE-7 | Cards: question, approval, suggestion, checks, error, result |
| FE-8 | Side panel: Changes, Progress, Output |
| FE-9 | Settings |
| FE-10 | Commit and Undo dialogs |
| FE-11 | Message catalog in one file per language; English first, Russian next |
| FE-12 | Vocabulary test: scans the catalog and templates for the forbidden terms of section 3 |
| FE-13 | Watchdog, reconnect banner, notifications, tab title |
| FE-14 | Remove the old feature folders listed in section 1.4 |

Conventions: standalone components, signals, zoneless, OnPush, as today. Templates in separate files when longer than 40 lines. No `any` in new code. No user-visible text outside the message catalog.

Tests: timeline reducer replays of recorded event logs (the existing recording plus one real run per provider from S-3); component tests for the composer and the cards; one end-to-end test of scenario A-1 against the demo backend.

---

## 14. Implementation plan

| Phase | Content | Exit condition |
|---|---|---|
| 0 | BE-0. Spikes S-1 to S-7. | S-1, S-2, S-3 pass. Results recorded in `ASTROUI/docs/decisions.md`. |
| 1 | BE-1 to BE-9, BE-15. | With `curl` only: connect an account, list usable models, start a task in an empty repository, watch it work, read a normalised error for a wrong key. |
| 2 | FE-1 to FE-7, FE-11, FE-12. | A-1, A-2, A-4, A-6, A-7 pass in the browser. The old screens are no longer linked. |
| 3 | FE-8 to FE-10, BE-10 to BE-14. | A-3, A-5, A-8, A-9, A-12, A-13 pass. |
| 4 | FE-13, FE-14, BE-16, accessibility, Russian catalog, documentation. | All scenarios pass. The complexity budget of section 2 holds. No forbidden term in default UI. |

---

## 15. Acceptance scenarios

Each starts from an empty data folder unless stated otherwise.

| Id | Scenario | Pass condition |
|---|---|---|
| A-1 | Five-minute test. A person who has never seen the app has a ChatGPT Plus account and a project folder. | Without reading any documentation: signs in, opens the folder, types a request, sees the first step within 10 seconds of the run starting, receives a result with changes. At most three decisions before typing. |
| A-2 | API key | Pasting a valid OpenRouter key leads to a selected model with no further question. |
| A-3 | Local model | With Ollama running, first run lists it under "Found on this computer". One click makes it usable. |
| A-4 | Repository without tests | "Create a hello world Java app" in an empty repository runs and finishes. The result says how it was verified. |
| A-5 | Approval | A task that installs a package shows an approval card. "Always allow in this project" suppresses the card in the next task. |
| A-6 | Question | The agent's question appears as a card. Typing in the composer answers it and the task continues. |
| A-7 | Wrong key | An invalid key produces E-3 in the dialog. After replacing the key the same task runs with "Retry". |
| A-8 | Remove account | The account disappears from the list and the picker. The default model moves to the next recommended model or the footer asks to connect one. |
| A-9 | Restart | Stopping the backend during a task and starting it again shows the task as Paused with "Continue". No lock error appears. |
| A-10 | Vocabulary | The vocabulary test passes. |
| A-11 | Settings | Every setting of section 9 can be changed without typing JSON. |
| A-12 | Follow-up | A message after "Done" continues in the same task and the agent knows what was done before. |
| A-13 | Stop and undo | Stop keeps the changes. "Undo all" restores the files. A file edited by the user afterwards is skipped and named. |
| A-14 | Sign-in with a busy port | With port 1455 occupied, sign-in offers the code path and completes. |
| A-15 | No silent failure | With the network disconnected during a task, an error card appears within 60 seconds. |

---

## 16. Out of scope for this version

| Item | Later as |
|---|---|
| Knowledge base screens, statistics dashboards | Optional pages behind Advanced |
| Editing roles, tier tables, routing functions | Expert settings |
| Expert settings list of engine tunables | Read-mostly list from the existing settings schema |
| Push, merge, pull requests, deploy | Buttons after "Commit" |
| File mentions with `@`, image attachments | Composer additions |
| Queue of tasks per project | Replaces E-9's second action |
| Technical view of raw events | Task menu › "Technical details" |
| Operating-system credential vault | Replaces the file store |
| Desktop shell | Wraps the same web app |
| MCP tools | When the core can call them |

---

## 17. Implementation request

Use this section as the prompt for the implementing agent.

> Implement ASTROLABE Studio 2 as specified in `ASTROLABE_UI_V2_SIMPLE.md`.
>
> 1. Read sections 1 to 4 first. Treat the complexity budget of section 2 and the forbidden vocabulary of section 3 as hard limits.
> 2. Follow the phases of section 14 in order. Do not start phase 2 before spikes S-1, S-2 and S-3 pass. If a spike fails, stop and report the failure with its evidence.
> 3. Keep the backend parts listed in section 12.1 and the frontend parts listed as "keep" in section 1.4. Do not modify `ASTROLABE/` or `llm-transport-sdk/`. Record anything that needs an upstream change in `ASTROUI/docs/decisions.md`.
> 4. Do not add a setting, a screen, a panel or a composer control that this document does not list. If something seems missing, propose it in `decisions.md` and continue with the automatic default.
> 5. Every user-visible string goes into the message catalog. Every error uses a code from section 10.
> 6. Verify each phase with its exit condition from section 14 and each scenario of section 15 in the running application, not only with unit tests. Report what passed, what failed and what was not checked.
> 7. Use `ASTROLABE_UI_V2_MOCKUP.html` for layout, spacing and tone. Where it differs from this document, this document wins.

---

## Appendix A — Event to timeline mapping

| Event | Timeline |
|---|---|
| `campaign.opened` | State Working. Nothing in the conversation. |
| `campaign.shape_selected` | Hidden |
| `campaign.increment_selected` | Plan step becomes current. Plan divider when the plan has more than one step. |
| `campaign.increment_closed` | Plan step done |
| `campaign.finished`, `studio.run_ended` | Result card or error card, by outcome |
| `studio.open_failed` | Error card |
| `studio.verification` | Notice (section 7.3) |
| `studio.error` | Error card |
| `studio.task_state` | Task state and status line |
| `contract.amended` by the user | Already shown as the user's message |
| `contract.amendment_proposed` | Suggestion card |
| `contract.amendment_resolved` | Closes the suggestion card |
| `cell.started` | Status line by role: implementing "Working…", review "Reviewing the result…", probe "Investigating…", QA "Testing…", repair "Fixing a problem…" |
| `cell.turn_started`, `cell.model_requested`, `cell.model_progress` | Status line "Thinking…" with elapsed time |
| `cell.model_responded` | Agent message from its text. An error field becomes an error card. |
| `cell.tool_called`, `cell.tool_resulted` | Step, by tool (next table) |
| `edit.applied`, `edit.transformed` | Step "Edited `path` +a −b", updates Changes |
| `edit.rejected` | Hidden unless the step fails |
| `edit.reverted` | Step "Reverted `path`" |
| `run.started`, `run.output`, `run.finished` | Step "Ran `cmd`" with result and duration; output in the Output tab |
| `check.scheduled`, `check.started` | Status line "Running checks…" |
| `check.finished` | Checks card |
| `check.stale` | Hidden |
| `ask.question` | Question card |
| `ask.answered` | Collapses the card into question and answer |
| `blocked` | State Paused with the reason, or a card if a question id is present |
| `budget.exhausted` | E-17 |
| `budget.reserved`, `budget.reconciled` | Usage numbers |
| `delegation.dispatched` | Step "Started *n* helpers"; "Helpers" in Progress |
| `delegation.collected` | Step "Collected the helpers' results" |
| `delegation.rejected` | Hidden |
| `recovery.classified`, `recovery.repaired` | Status line "Recovering from a problem…" |
| `recovery.escalated` | Error card |
| `routing.decided`, `span.*`, `journal.*`, `cell.register_patched`, `cell.workset_changed`, `cell.gate_fired`, `cell.rebuilt`, `kb.*` | Hidden; kept for the technical view |
| `warning` | Hidden; kept for the technical view |
| Any unknown kind | Hidden; kept for the technical view; never breaks the timeline |

| Tool | Step text |
|---|---|
| `look.tree`, `look.outline`, `look.catalog` | "Explored the project" |
| `look.read` | "Read `path`" |
| `look.find` | "Searched for "*text*"" |
| `look.def`, `look.refs`, `look.importers`, `look.impact` | "Looked up `symbol`" |
| `look.recall`, `look.bmap`, `kb.search`, `kb.get`, `kb.skill` | "Recalled project notes" |
| `edit.anchored`, `edit.transform` | "Edited `path`" |
| `edit.create` · `edit.delete` · `edit.rename` | "Created `path`" · "Deleted `path`" · "Renamed `a` to `b`" |
| `run.run` | "Ran `cmd`" |
| `run.poll` | Merged into its run |
| `run.cancel` | "Stopped `cmd`" |
| `verify.tests`, `verify.check`, `verify.acceptance`, `verify.baseline` | "Ran checks" |
| `verify.review` | "Reviewed the result" |
| `task.ask` | Question card |
| `task.delegate`, `task.collect` | As `delegation.*` |
| `task.propose` | Suggestion card |
| `state.*`, `kb.propose` | Hidden |

## Appendix B — Hidden settings and their automatic values

| Group | Count today | Value |
|---|---|---|
| Budgets and limits | 41 | Library defaults. The task limit comes from setting 13, else main model context × 12. |
| Shape policy | — | Chosen by the core. |
| Verification | — | Section 7.3. |
| Knowledge | — | Library defaults. |
| Optional layers | 13 flags | Off, the library default. |
| Tools and MCP | — | Not available. |
| Roles | 8 | Library defaults. |
| Routing: helper, escalation, tier table, function table | — | One model serves everything; `helper = null`. |
| Publication ceiling | — | `Patch`: changes stay in the working folder. Commit is the user's action. |
| Integrity approval | — | `Autonomous`, the library default. |
| Unknown-outcome reconciliation | — | `Automatic` (BE-15). |
| Execution mode | — | `TrustedLocal`, the only one with a backend. |
| Lease length | — | 480 minutes, with lock recovery (BE-10). |
| State root, redaction, storage | — | Defaults. |
| Profile qualification and freezing | — | Skipped; optional through setting 16. |

## Appendix C — Known risks

| Risk | Handling |
|---|---|
| The core has not been measured against live models | S-3 in phase 0. Failures are reported as core work. |
| ChatGPT sign-in uses a backend that is not an official third-party API | Clear errors (E-2, E-5), a second account type always available |
| Port 1455 conflicts with other tools | Code path fallback (E-10) |
| Credentials are stored in a file that is not encrypted | Stated in Advanced › Data folder; vault is later work |
| macOS is not supported by the core's process layer | Stated on the download page and at start |
| Follow-up runs lose detail of earlier runs | Recap by the host (BE-7); checked by S-5 and A-12 |
