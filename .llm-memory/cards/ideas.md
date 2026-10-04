---
card: ideas
title: Research corpus (ideas/)
scope: ideas/
repo: none (untracked; ignored by the root .gitignore)
verified: 2026-09-30
read-when: comparing ASTROLABE with external harness research; "is idea X already in ASTROLABE?"; research claims
---
# Research corpus (`ideas/`)
A self-contained, documentation-only research corpus (~300k tokens, built 2026-09-24): a snapshot of the ASTROLABE
1.0.1 architecture docs, three external research papers on coding-agent harnesses, two Russian-language critical
analyses, and its own generated navigation map. Input for architecture reviews; not part of any build.

## Canonical sources
- `ideas/_map/README.md` — the corpus's own map: layers, authority, search recipes, research routes. Start here.
- `ideas/AGENTS.md` (= `ideas/CLAUDE.md`, identical) — 10-line entry rules for the corpus.
- For **current** ASTROLABE rules use `ASTROLABE/docs/**`, not the corpus copy (see Status).

## Map
| Path | Responsibility | Key symbols / anchors |
|---|---|---|
| `ideas/_map/` | Generated + hand-kept registers over the corpus | `TOPICS.md` (25 tags: CTX, VERIFY, MULTI…), `CONCEPTS.md`, `NORMS.md` (F01–F12), `IDEAS.md`, `CROSSWALK.md`, `CLAIMS.md`, `REFERENCES.md`, `CATALOG.md` |
| `ideas/_map/data/sections.tsv` | One line per section: `path start end lvl anchor tok heading kw sum facts` | grep only (~100k tokens) |
| `ideas/_map/outline/*.md` | Section line ranges per corpus file | `astrolab.md`, `ideas.md`, `sources.md` |
| `ideas/_map/tools/mapgen.py` | Rebuilds the map | `scan`, `render`, `check` |
| `ideas/ideas/harness-resarch_01.md` | "The Microkernel Harness": trends, formal models M1–M11, reference architecture | IDs `R1-NN`, `M1`–`M11` |
| `ideas/ideas/harness-resarch_02.md` | "An Architecture of Verifiable Progress": corrections, math models, falsification program | IDs `R2-NN`, own `§N.M` |
| `ideas/ideas/merged-mix-of-ideas.md` | Ranked catalogue of 22 mechanisms with falsification tests | `m-01`–`m-22`, `hm-NN` |
| `ideas/astrolabe-analyzis.md` | RU: comparative analysis of ASTROLABE 1.0.1 vs the 3 papers (2026-09-24) | `## 1. Основной вывод`, `## 10. Приоритетный план доработки`, `## 15. Итоговая рекомендация` |
| `ideas/astrolabe-analyzis-opus.md` | RU: second analysis (coverage ≈93% R2 / 76% R1; missing oracle layer m-01…m-07) | `## 0. Итог в одном абзаце`, `## 5. Чего нет…`, `## 11. Первые эксперименты` |
| `ideas/astrolab/` | Snapshot of ASTROLABE docs (README, map, `docs/**`, `audit/`, `sources/`) as of 2026-09-24 | same paths as in `ASTROLABE/` |

## Where to look
- Term / concept → `_map/CONCEPTS.md` (grep the term) → section range in `_map/outline/astrolab.md`.
- Everything on a theme → `_map/TOPICS.md#<tag>`.
- Is research idea X in ASTROLABE? → `_map/CROSSWALK.md`, then verify against `ASTROLABE/docs/**` (current).
- Numbers/claims from papers → `_map/CLAIMS.md` → `_map/REFERENCES.md`.
- Verdict "extend ASTROLABE vs new architecture" → both `astrolabe-analyzis*.md` (conclusion: extend, don't replace).
- Later, broader synthesis of these analyses → root `FABLE_ANALYZE_AND_IDEAS.md` / `final_analyze.md` (card `root-docs`).

## Relationships
- Feeds the workspace-level analyses and goal documents at the root (card `root-docs`).
- Mirrors (does not track) `ASTROLABE/`; line ranges in `_map/` refer to `ideas/astrolab/`, not to `ASTROLABE/`.

## Status and conflicts
- **Stale snapshot:** `ideas/astrolab/docs/**` differs from `ASTROLABE/docs/**` in 10 files (e.g. `runtime/tools.md`,
  `state/contracts.md`, `verification/{scheduler,acceptance-review}.md`), edited in ASTROLABE during phase 0
  (2026-09-30, D-346–D-355). Treat the corpus copy as historical; `ASTROLABE/docs/**` is canonical.
- `ideas/astrolab/README.md` says "architecture documentation only" — true for the snapshot, false for ASTROLABE today
  (P0–P6 implemented).
- The analyses are dated 2026-09-24 and assess the pre-implementation proposal.

## Pitfalls
- File names contain the typo `resarch` (search it spelled that way); `analyzis` likewise.
- ID collisions: `§5.4` in `harness-resarch_02` ≠ ASTROLABE `§5.4`; `M1`–`M11` ≠ baseline mechanisms. Qualify by file.
- `ideas/` is ignored by the root `.gitignore`: no git history, and `rg`/Grep run from the root skip it — pass the
  path explicitly (`rg <pat> ideas`).

## Freshness
- `ideas/_map/README.md`
- `ideas/AGENTS.md`
- `ideas/ideas/`
- `ideas/astrolabe-analyzis.md`
- `ideas/astrolabe-analyzis-opus.md`
- `ideas/astrolab/docs/`
