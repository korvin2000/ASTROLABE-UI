# Harness efficiency — progress note (session 2026-10-01, untracked)

Status: **done and pushed.** Report: `harness-efficiency-analysis.md`. Decisions D-363–D-375 in `ASTROLABE/TODO.md` §3.
Handoff: `ASTROLABE/CONTINUE-TASK.md`, `ASTROLABE/actual_state.md`, `ASTROLABE/audit/SESSION-HISTORY.md`.

## Pushed
- `ASTROLABE` `main` f68032f (merge of `fix/efficiency`, 13 worktree branches) — full `./gradlew build` green on Windows:
  core 1831, eval 52, provider-api 20, provider-ai-gate 40, index-treesitter 17 tests, 0 failed.
- `llm-transport-sdk` `main` 91d432b — blank tool-call id → `call_<position>`; blank streamed tool name → `unknown`; 248 tests.
- `ASTROLABE-UI` (root) `main` a25f8a5 — Studio `TaskService`, `Guidance`, `SettingsSchema` + the analysis report;
  bridge 12 and server 22 tests green.

## Live runs (isolated Studio, scenario "todo REST app" → "turn it into Angular")
- deepseek-v4.1-flash (branch state before D-373): 24 turns / 4.0 min, then 67 turns / 15.4 min; Angular build passes,
  smoke 41/41, headless browser 18/18. Before: 40 turns / 28 min, broken tree.
- glm-5.3-flash (state before the third review round): first request 17 turns / 163 s, 1 refused call, app written and
  smoke-tested, then the SDK threw on a blank tool-call id → fixed in the SDK. **The repeat run was not executed**: the
  permission system asked for the owner's explicit approval of the extra OpenRouter spend. Events: scratchpad `live1`, `live2`.

## Open
- Owner decision: one more GLM run to confirm the SDK fix and the Angular part on a second model.
- No CI run seen yet for the pushed commits (CI triggers on push to `main`; `gh` is not installed locally).
- Next step in the code: "direct" cell profile (STATE optional) — `ASTROLABE/CONTINUE-TASK.md` § Next.
- Security hygiene: the git remotes of all three repositories embed a GitHub token in the URL.
- Local branches `wt/*`, `fix/efficiency` (ASTROLABE) and `fix/blank-tool-call-id` (SDK) are merged and can be deleted;
  the agent worktree directories of this session were removed.
