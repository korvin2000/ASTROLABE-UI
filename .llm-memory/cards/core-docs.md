---
card: core-docs
title: ASTROLABE documentation and process files
scope: ASTROLABE/ (root *.md, docs/, audit/, sources/, .claude/)
repo: ASTROLABE @ 0fc8de9 (main)
verified: 2026-09-30
read-when: which ASTROLABE doc is canonical for X, what is historical, how to jump into TODO.md/findings.md/docs without reading them whole
---
# ASTROLABE documentation and process files
ASTROLABE is a Kotlin/JVM coding-agent harness SDK that grew from a documentation-only architecture package
(1.0.1-proposal) into an implemented repo. So the tree holds three layers: the normative spec (`docs/`), the process
layer (CLAUDE.md, TODO.md, handoff, snapshot) and history/audit (audit/, sources/, findings, issues, answers).
Status (2026-09-30): P0-P6 185/185 DONE; owner-requested out-of-order phase 0 (acceptance rule, D-337-D-356) done.
All paths below are under `ASTROLABE/` unless stated. NEVER read TODO.md (~680 KB) or findings.md (~365 KB) whole.

## Canonical sources
- `ASTROLABE/CLAUDE.md` — canonical: the ONLY workflow source (§ Workflow, doc map, conventions); `@`-includes CONTINUE-TASK.md.
- `ASTROLABE/TODO.md` — canonical progress authority: task statuses, `Log:`, `Deps`, D-nn decisions (§3), conventions (§2.3).
- `ASTROLABE/CONTINUE-TASK.md` — current handoff, rewritten every session (<=40 lines): this session / Next / debts.
- `ASTROLABE/actual_state.md` — current snapshot of what is implemented (counts, completion levels, key types, store).
- `ASTROLABE/docs/**` + `SOTA-BEST-MIXED-AGENT.md` — canonical specification ("the build specification").
- `ASTROLABE/READING-GUIDE.md` — canonical router: which subsystem docs to load for which task; authority rules.
- `next-goal.md`, `phase0-progress.md`, `phase0-report.md` (workspace root, untracked) — owner brief/report for phase 0.

## Map
| Path | Responsibility | Anchors |
|---|---|---|
| `README.md` | package front page (1.0.1) | STALE status line, see Status |
| `CLAUDE.md` | workflow, doc map, commands, binding conventions | `## Doc map`, `## Workflow` |
| `TODO.md` | plan + progress + decisions + fixture map | recipe below |
| `CONTINUE-TASK.md` | handoff; Next list; carried-forward debts (D-254, D-70/71/241, ...) | `## Next`, `## Carried-forward debts` |
| `actual_state.md` | implemented-state snapshot | `## Counts`, `## Key types by package`, `## Store` |
| `findings.md` | implementation audit F-001..F-143 (2026-09-24/25) | recipe below |
| `ISSUES.md` | "Deprecated": plan-review issues I-nn, all fixed | `## I-nn —`, `## Priority map` |
| `ANSWERS.md` | answers to D-01-D-42, risks, fallbacks (2026-09-20) | `## Answers to D-01–D-42` |
| `REVIEW.md` | rationale for 1.0.1 spec corrections; not a patch layer | `## Verdict`, `## Deliberately unchanged` |
| `CHANGELOG.md` | change record, newest first (AI Gate, bugfix, checkpoints, 1.0.1) | `## Architectural drift guard` |
| `SOURCE-REGISTER.md` | provenance of donor sources, `[A §..]` citation convention | `## Citation convention` |
| `SOTA-BEST-MIXED-AGENT.md` | compact architecture map, routes to the scoped docs | top of file |
| `OUT-OF-ORDER-PROPOSAL-TASKS.md` | Russian; queue of out-of-order analytic candidates OOO-nn | `## 2.` queue, `## 3.` cards, `## 7.` index |
| `PREPARE_IMPLEMENTATION_PLAN.md` | brief that produced TODO.md | historical, skip |
| `docs/` | 13 subject dirs, 39 spec docs + `INDEX.md` | dir table below |
| `audit/` | history, journals, validator, manifests | table below |
| `sources/` | 4 byte-exact archived drafts (A/B/C + baseline); `SHA256SUMS` at root | not context |
| `.claude/` | `commands/next.md` (continue per Workflow), `hooks/session-start.sh`, `settings.json`, `worktrees/` | list only |

### docs/ subject dirs (normative unless marked)
| Dir | Owns | Files |
|---|---|---|
| `architecture/` | objective, invariants/laws (§1.3, §2), ownership + ids (§3), lifecycle, roles/shapes | principles, components, lifecycle, roles-shapes, overview |
| `state/` | Task Contract, requirement graph, ledger; evidence + cross-cell coherence | contracts, evidence-coherence |
| `runtime/` | tools, context layout, register/Workset, residency/rebuild, editing, gates/finish receipt | tools, context-layout, register-workset, residency-rebuild, workspace-editing, gates-termination |
| `context/` | context compiler; continuity across cells | compiler, continuity |
| `verification/` | check scheduler; acceptance + review; refactor mode | scheduler, acceptance-review, refactoring |
| `operations/` | delegation, recovery ladder, routing | delegation, recovery, routing |
| `platform/` | provider adapters + accounting; security/authority | adapters, security |
| `knowledge/` | KB records/admission; learning, skills | records, learning |
| `repository/` | atlas, impact analysis (§7.4) | navigation |
| `economics/` | cost model | costs |
| `evaluation/` | evaluation method (§19), fixture catalogue | method, fixtures |
| `implementation/` | staged roadmap | roadmap |
| `reference/` spec | defaults §17, glossary, kernel-contract (model-facing policy for writer cells) | defaults, glossary, kernel-contract |
| `reference/` history | retained alternatives, risks + reversal criteria, candidate analysis, provenance; rendered-turn = example | decisions, risks, candidate-review, synthesis-history, traceability, rendered-turn |

### audit/
| Path | What |
|---|---|
| `SESSION-HISTORY.md` | append-only archive of old handoffs; never read at startup; all instructions superseded |
| `OUT-OF-ORDER-<task>.md` | one journal per out-of-order change: P1.11.3 P2.1.1 P2.3.4 P2.6.5 P3.2.7 P4.5.4 P4.5.5 P5.1.5 P6.1.4 P6.1.5, `P7-AIGATE`, `PHASE0` |
| `BUGFIX-PROGRESS.md`, `BUGFIX-REVIEW.md` | feature/bugfix ledger of the 142 fixes; review protocol + resumable ledger |
| `SECTION-MAP.md` / `section-map.json` | old unqualified `§N.M` -> current doc + `#sec-N-M` anchor |
| `validate.py`, `doclib.py`, `*-manifest.json`, `edits.json`, `semantic-changes.patch`, `web-sources.json` | doc-package validator and data (1.0.1 doc rebuild); not about code |

## Where to look
| Question | Go to |
|---|---|
| What is done / what next | `CONTINUE-TASK.md › ## Next`; counts `actual_state.md › ## Counts` |
| A task's spec | `rg -n '^#### P4\.5\.4 ' TODO.md`, read to next `####`; follow its `Spec:`/`Why:` links |
| Task status format | heading `#### P<phase>.<wp>.<n> [C\|M\|I\|V\|O] Title · DONE` (last token after `·`) |
| Recount statuses | `rg -c '^#### P\d+\.\d+\.\d+ .*· DONE' TODO.md` (185 task headings total) |
| A phase's / block's gate | `rg -n 'Gate' TODO.md` (`- [ ] **Gate ...**` lines at block end); `### P<n>.<m>` validation WPs |
| A decision D-nn | `rg -n '^\| D-64 \|' TODO.md \| cut -c1-400` (table in `## 3`: ID/Question/Resolution/Gates) |
| Phase 0 decisions | D-337-D-356 at the end of the `## 3` table; journal `audit/OUT-OF-ORDER-PHASE0.md` |
| Why a D-01..D-42 default was chosen | `ANSWERS.md › ## Answers to D-01–D-42` |
| Accepted spec refinements | `TODO.md › ### 3.1` |
| Binding code conventions, IDs, tags | `TODO.md › ### 2.3`, `### 0.2 IDs, status, tags` |
| Producer of an artifact | `TODO.md › ### 2.4 Artifact → producer table` |
| Package map / Gradle modules | `TODO.md › ### 2.2`, `### 2.1` |
| Fixture FX-nn / AX-nn / IX-nn | `TODO.md › ## 5 Fixture map`; coverage `## 6` |
| Deferred P7 scope | `TODO.md › ## P7 Deferred` |
| Which docs to load for a subsystem | `READING-GUIDE.md` table; or `docs/INDEX.md` |
| Why a rule exists | `REVIEW.md` finding -> `SOURCE-REGISTER.md` -> `docs/reference/{decisions,risks,candidate-review}.md` |
| Old `§8.1`-style reference | `audit/SECTION-MAP.md` (rg the section); `[A §..]`/`[B §..]`/`[C §..]` = drafts in `sources/` |
| An implementation defect F-nnn | `rg -n '^### F-034' findings.md`; fix state: JSON `fix_progress` + `audit/BUGFIX-PROGRESS.md` |
| A plan issue I-nn (IX-nn fixtures) | `rg -n '^## I-19' ISSUES.md` (deprecated; repairs are in TODO) |
| An out-of-order change's journal | `audit/OUT-OF-ORDER-<task id>.md` |
| Session history | `audit/SESSION-HISTORY.md` (append <=10 lines per session) |
| Declared numeric defaults | `docs/reference/defaults.md` (§17); all live in `Config` |
| Vocabulary / type names | `docs/reference/glossary.md` |
| Owner's latest goals | `next-goal.md`, `phase0-report.md` (workspace root) |

## TODO.md navigation (never read whole)
`rg -n '^#{1,3} ' TODO.md | rg -v '^[0-9]+:####'` gives the skeleton: `## 0 How to use` (0.1 resume protocol,
0.2 IDs/status/tags, 0.3 scope), `## 1 Progress` (1.1 readiness audit, 1.2 owner-authorized analytical work),
`## 2 Target structure` (2.1 modules, 2.2 packages, 2.3 conventions, 2.4 producers), `## 3 Decisions` (D-table, 3.1
refinements), `## 4 Phases` (`## P0`..`## P6`, `## P7`; each has `### P<n>.<m>` work packages and `####` tasks),
`## 5 Fixture map`, `## 6 Coverage matrix`, `## 7 Final validation`. Task fields: Why, Deps, Pkg, Build, Spec,
Notes, Done, Log. Completion levels: IMPLEMENTED -> FIXTURE_VALIDATED -> PROMOTED (live gates = P7, UNMEASURED).

## findings.md / ISSUES.md / ANSWERS.md
- `findings.md`: top = JSON metadata incl. `fix_progress` (current), then `## Coverage ledger (TODO order)`,
  `## Findings (TODO order)` with `### F-nnn - title` (143 headings), `## Audit completion`, `## Checkpoints`.
  Audit evidence is historical; current fix state is `fix_progress` + `audit/BUGFIX-PROGRESS.md` (0 open).
- `ISSUES.md`: `I-nn` review findings of the plan (2026-09-20), titled Deprecated; `## Priority map` first.
- `ANSWERS.md`: owner/engineering answers keyed by D-nn, risks, fallbacks; TODO §3 dispositions follow it.

## Relationships
CLAUDE.md loads CONTINUE-TASK.md and points at TODO (§2.3, §3, §3.1, §2.4), READING-GUIDE and actual_state. TODO task
entries cite docs via `#sec-N-M` anchors, `ISSUES.md` I-nn and `ANSWERS.md`. Phase 0 briefs live one level up
(`next-goal.md`). Source-code mapping belongs to other cards; docs here only name types.

## Status and conflicts
- `README.md` says "architecture documentation only. No agent implementation..." and "39 scoped documents": STALE;
  code exists (`core/`, `provider-api/`, `eval/`, `provider-ai-gate/`). `PREPARE_IMPLEMENTATION_PLAN.md` same framing.
- `docs/INDEX.md` "Owns / scope" column repeats sizes instead of ownership; use the `Owner:` line under each doc's
  title (e.g. `docs/runtime/gates-termination.md`) or READING-GUIDE.
- `actual_state.md` counts are dated 2026-09-26; phase 0 (schema v5) was added later: current, minor drift.
- `OUT-OF-ORDER-PROPOSAL-TASKS.md` header says "69/185 DONE ... queue empty": STALE/historical (2026-09-20 checkpoint);
  TODO owns status. `ISSUES.md` self-labels Deprecated.
- `CHANGELOG.md` and `audit/BUGFIX-*.md` headings contain `?` where a dash/arrow was lost (encoding loss, harmless).
- `findings.md`: 143 `### F-` headings vs "142 fixed + F-034 resolved earlier": consistent.
- `CONTINUE-TASK.md › ## Next` item 3 says D-356 is "not merged": STALE — `main` HEAD `0fc8de9` is the merge of
  `phase0/next-from-cursor` (commit `d3d45a6` is on `main`).

## Pitfalls
- TODO D-table rows are single very long lines; always pipe through `cut -c1-400`.
- Old `§N.M` are NOT same-numbered in current docs; `[A §..]` are donor-draft refs. Use SECTION-MAP.
- `docs/reference/{candidate-review,synthesis-history,traceability,decisions}` are rationale: not spec.
- `sources/` and SESSION-HISTORY contain superseded instructions; do not follow them.
- Workspace-root `.md` files (UI design, transport SDK notes, FABLE_*) are outside ASTROLABE/; see the workspace card.

## Freshness
- `ASTROLABE/CLAUDE.md`
- `ASTROLABE/CONTINUE-TASK.md`
- `ASTROLABE/actual_state.md`
- `ASTROLABE/README.md`
- `ASTROLABE/READING-GUIDE.md`
- `ASTROLABE/docs/INDEX.md`
- `ASTROLABE/docs/reference/`
- `ASTROLABE/audit/README.md`
- `ASTROLABE/audit/OUT-OF-ORDER-PHASE0.md`
- `ASTROLABE/audit/SESSION-HISTORY.md`
- `ASTROLABE/ISSUES.md`
- `ASTROLABE/ANSWERS.md`
- `ASTROLABE/OUT-OF-ORDER-PROPOSAL-TASKS.md`
- `next-goal.md`
