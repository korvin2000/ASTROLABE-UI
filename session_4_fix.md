You are the orchestrator of session 4 of the ASTROLABE 2.0 implementation.
Plan: `C:\work.astrolab\ASTROLABE-2-PLAN.md` (written in Russian). Working directory: `C:\work.astrolab\ASTROLABE`.
This is the first session after the plan amendment of 2026-10-04, "role contour". Write your reports to me in Russian.

## 1. Read, in this order, and only what is named

- `ASTROLABE/CLAUDE.md` and `CONTINUE-TASK.md` (loaded automatically).
- The plan:
  - the header paragraph "Имена": `S0`–`S3` are execution shapes only; plan sessions are "сессия N";
  - §0 item 10; §4.3 and §4.3a;
  - §6: wave B rows B5–B7; wave D with Dp3, C15, C16 and the paragraph "Что волна D делает иначе";
  - §7: the row of session 4, the hot-file owners, the paragraph about the cancelled live check;
  - §8 in full; §11 №14–26; §14; §16; the §17 rows dated 2026-10-04.
- `TODO.md`, only the tasks of this session: `rg -n '^#### P8\.(D\.[1236]|B\.[57]|C\.1[56]) ' TODO.md`.
- The direct specification: `docs/reference/kernel-contract.md`, Appendix A-D (A-D.1, A-D.3, A-D.6, A-D.7).
- The code map: `C:\work.astrolab\.llm-memory\find.md`, then `cards/core-code.md`. The map lags behind the hotfix:
  where it disagrees with the code, the code is right.

Why the plan was amended: `C:\work.astrolab\REANALYSE-FABLE.md`, section 10. Read it only if the goal is unclear.

## 2. Restore the state (plan §8.7)

Run `git status`, `git log -5` and `git worktree list` in `ASTROLABE`, `C:\work.astrolab` and
`C:\work.astrolab\llm-transport-sdk`; check the `v2/*` branches and `C:\work.astrolab\plan2\reports`.

Known in advance:
- The plan amendment is on `main` and pushed: root `73d8c13` (plan, `REANALYSE-FABLE.md`), core `60a232f`
  (`TODO.md`, `CONTINUE-TASK.md`).
- The hotfix D-407…D-413 is on `main` and pushed: core `7b402d3`, its Studio half in root `bd3a4ca`. The CI status of
  these pushes is not recorded anywhere: check it before the first merge.

Report in 5–10 lines. Push to `main` only with my permission.

## 3. Work of this session

There is no separate live check of the hotfix (owner decision №26): assume D-407…D-413 work. Order:

1. **Dp3 (P8.D.6)** — amend the direct specification for every shape: a t6 sub-agent, then a Codex review.
   D1 starts only after Dp3 is accepted.
2. **D1 → D2 ∥ D3** (P8.D.1–P8.D.3), following the amended Appendix A-D. Re-check the path:line table A-D.7: the
   hotfix moved `Cell.kt`, `Gates.kt`, `EffectPolicy.kt`.
3. In parallel, outside the hot files:
   - **B7 (P8.B.7) → B5 (P8.B.5)** — the shared `RunSpec`, the `eval-live` arms and the reference arm `loop`;
   - **C16 (P8.C.16)** — the nominal price of subscription models. First find out whether the AI Gate catalog has an
     official price for each subscription model and whether the SDK reports the remaining subscription quota;
   - **C15 (P8.C.15)** — the hotfix tails; the per-turn output budget comes after D1 (shared `Cell.kt`).

If I send a Studio diagnostics export with a failure (`C:\work.astrolab\diags\tasks\`), analyse it with the offline
auditor (B1) and fix it out of turn.

## 4. How to run the lines — economy rules (plan §8.8, owner decision №27)

Session 3 took eight hours and half of the weekly subscription limit: lines re-tested after every edit and reviews
ran in several rounds. Do not repeat that.

- **You stay thin.** Do not write or read code yourself. Everything that can be stated in a card goes to a separate
  task or a sub-agent. Keep in your context only cards, line reports (40 lines at most), `git diff --stat` and
  review summaries. Read large files by the named sections only.
- **Cards.** Before starting a line, write its card `C:\work.astrolab\plan2\WP-<id>.md` by plan §8.3. Every line
  also reads `C:\work.astrolab\plan2\COMMON.md`.
- **Who implements.** Programming: Opus — a spawn task for a large package (cwd by plan §8.2), a t3/t4 sub-agent
  for a small one. Exact-spec trivia: t2. Running tests and builds, log summaries: t1 or a background command;
  only the summary comes back.
- **Who reviews.** One independent reviewer per line, chosen by the line's main risk, given the diff and the card:
  - Fable — complex interlinked logic, protocol, specifications;
  - Opus — programming: an ordinary implementation diff;
  - Codex — math, statistics, analytics, money and limit accounting.
- **No test loops.** L1 runs once, when the line's change is complete, not after every edit. A failed test: fix the
  cause and rerun only the failed class. At most three edit → test cycles per line; do not start a fourth — the
  line reports `БЛОКЕР` with what it tried. L2 once at merge. The full suite is CI only.
- **No review loops.** One review round and one fix round. A second review round only for P1 findings; P2 and P3 go
  to the report as tails. A line may be rewritten once; after a second failure narrow or defer the package.
- **Nothing beyond the card:** no side refactoring, extra fixtures or cleanup that "done when" does not name.
- **Account for the spend.** Each line report states its edit → test cycles, review rounds and token use where it
  is visible. A line at twice its estimate stops, and you tell me. At the end write the per-line spend table to
  `C:\work.astrolab\plan2\reports\SESSION-4.md`.
- One owner per hot file (plan §7).

Lines of this session:

| Line | Implements | Reviews |
|---|---|---|
| Dp3 | Fable (t6) | Codex |
| D1, D2, D3 | Opus, spawn tasks | Fable |
| B7, B5 | Opus, spawn tasks | Opus; the price accounting of B5 — Codex |
| C16 | Opus, spawn task | Codex |
| C15 | t3 sub-agents | Opus |

## 5. Live runs

Cheap models only (z-ai/glm-5.3-flash or xiaomi/mimo-v2.6-flash or deepseek/deepseek-v4.1-flash), not all at the same time and within plan §8.5. Do not run long tasks with a strong lead model at all (owner decision №21):
I run those myself through Studio and send the reports.

## Rules

- If the plan disagrees with the code, the code is right: record the correction in plan §17 and in the handoff.
- Only you assign D-IDs.
- End of session: the checklist of plan §8.7.

## Done when

- Dp3 is accepted after the Codex review.
- D1–D3 are merged, or their state is fixed in `v2/*` branches with reports.
- B7, B5, C15 and C16 are merged or fixed the same way.
- `TODO.md` P8, `CONTINUE-TASK.md` and plan §17 are up to date.
