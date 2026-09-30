# Progress

Status as of 2026-09-30: Studio 2 (`../ASTROLABE_UI_V2_SIMPLE.md`). Deviations and upstream findings: `decisions.md`.

## Done

**Frontend (`frontend`, Angular 22), written anew.** Five routes: first run, new task, task, settings, and `/` that
opens the last task. Sidebar with projects and tasks, "Needs you", collapse. Task view: conversation (messages,
grouped steps, notices, question / approval / suggestion cards, error and pause cards with at most two actions,
result card with Commit and Undo), message box with project, model and effort, mode, Send / Stop; side panel with
Changes (diff, undo per file, commit), Progress (stage rail, the Flow, plan, usage) and Output. The Flow: seven fixed
nodes, seven lines, messages that travel them, no graph library; it fills the main area on request. Settings: 19
settings in five sections with search. Account dialog: sign-in by browser or code, API key, local and custom servers.
Message catalogs in English and Russian; the language follows the browser. Light and dark themes, reduced motion.
The screens of the first Studio are removed.

**Server (`backend/server`).** Accounts (key, environment key, local, custom, sign-in sessions), usable models and
recommendations, automatic model profiles, preferences, folder listing and git init, tasks (start with preflight,
messages, follow-up runs with a recap, stop, continue, retry, rename, delete), host policy for Ask and Auto mode with
the allow list, review pass, changes of a task, undo, commit, progress and output, diagnostics export, normalised
errors (section 10), one API (`SimpleApi`). The server of the first Studio stays underneath.

**Bridge (`backend/bridge`).** Verification setup for projects without an executable acceptance, automatic profiles,
output reserve, the Studio's note for the agent, stale lease release, demo model that works in any project.

## Verified

Automated, all passing on the final build:

| What | Result |
|---|---|
| `npm test` (vitest) | 110 tests: timeline and Flow replays of recorded runs (demo and live), Flow layout and routes at 10 sizes from 440 × 440, vocabulary, catalogs (English, Russian), small rules |
| `./gradlew :backend:bridge:test` | fixture tasks, verification setup, output reserve |
| `npm run e2e` (A-1, demo model, packaged jar, empty data folder) | 27 checks |
| Packaged jar with security on | 18 checks: 401 without session, launch link once, HttpOnly session cookie, every route served, content security policy, live connection |

In the running application, headless browser, with the demo model (the mechanics of the screens): 122 checks pass —
first run, account dialog, wrong key, folder dialog with git init, follow-up, changes, undo, stop, commit, cards and
their keys, "always allow", Auto mode, all 19 settings, search, reset, Ctrl+Enter, rename, delete, narrow window,
restart, the Flow in both sizes and themes, reduced motion.

Acceptance scenarios (section 15) against a real provider — OpenRouter, model `z-ai/glm-5.3-flash`, the backend's
connections led through a tunnel that the test can cut:

| Id | Result | Evidence |
|---|---|---|
| A-1 | Pass | Three decisions from the connected account to typing; first step 2 s after the run started; result with changes. The sign-in itself: see S-2 |
| A-2 | Pass after the key | With the key saved the account is connected and a model chosen with no further question. Pasting the key is the owner's step |
| A-3 | Not verified | No local model server on this machine. With a stand-in server the path works (listed under "Found on this computer", one click) |
| A-4 | Pass | "Create a hello world Java app" in an empty repository: Done, "Reviewed by a second pass — no tests in this project" |
| A-5 | Partly | Approval card, "Always allow in this project" and no card in the next task: pass, for a command on a protected file. For a package installation: not possible, the core refuses it before an approval (F-10) |
| A-6 | Pass | Question card; the answer typed in the message box; the task went on and used it |
| A-7 | Partly | An invalid key shows "OpenRouter rejected the key." in the dialog and is not kept. "Replace the key, then Retry" needs the owner's key |
| A-8 | Pass | The dialog names the 315 models that leave; account and models are gone; the footer asks to connect a model |
| A-9 | Pass | Backend killed during a task and started again: Paused, "Continue", Done, no lock error |
| A-10 | Pass | Vocabulary test |
| A-11 | Pass | All 19 settings changed in the browser, none by typing JSON |
| A-12 | Pass | The follow-up ran in the same task and named the class of the first run in its README |
| A-13 | Pass | Stop kept the file written so far; "Undo all" removed the task's files and left and named the one the user had edited |
| A-14 | Partly | With port 1455 taken the sign-in offers the code; completing it needs the owner |
| A-15 | Pass | Tunnel cut during a task: "Could not reach OpenRouter." after 2 s, Retry finished the task |
| A-16 | Pass | Real task: Model, Agent, Edit & run, Checks became active, three lines lit at once; question turned You amber; finished task left the nodes Done and Checks green; no motion at rest |
| A-17 | Pass | No overlap and every node inside at panel width and in the main area, 440 px and above; both themes; nothing moves with reduced motion; 60 frames per second |

Live spend on the owner's OpenRouter account: about USD 0.17 on the spike runs and about USD 0.15 on the runs with
`z-ai/glm-5.3-flash`.

## Found and fixed during verification

- A reloaded task page and `/welcome` gave 404 from the packaged server (route list of the first Studio).
- The first demo task of a new user ran the wrong script and failed.
- Local servers showed no model (listings carry no capabilities).
- A model with a very large context window could not start a task (F-8).
- A real model could not record its progress (F-9).
- The review pass refused correct results: it did not know the user's answers, nor what an interrupted run had done.
- After a reload a follow-up run could stand above the first run.
- After a backend restart the open task stayed "Working".
- While a question waited, the header and the sidebar said "Working"; the card stood above the agent's words.
- The side panel could be narrower than the Flow's smallest canvas.
- Effort "Medium" was shown for a model without it.
- A lost connection was reported as an agent error.

## Open

- S-2 and A-14: the last step of the ChatGPT sign-in and of the sign-in by code; S-3 on that account.
- A-3 with a real local server.
- Upstream proposals F-1 and F-4 to F-12.
