# .llm-memory — navigation layer for this workspace

A small, hierarchical map for LLM sessions: it says **where to look**, not what the sources say. Read one level at a
time and stop as soon as you know which source file to open. Built 2026-09-30; source code and each repo's canonical
docs win over anything here.

## Levels
| Level | File | ~tokens | Use |
|---|---|---:|---|
| 0 | `../AGENTS.md` (loaded via `../CLAUDE.md`) | 600 | what the workspace is; rules that save time |
| 1 | `workspace.md` | 1.5k | system chain, repos, build graph, authority order, timeline, commands |
| 1 | `find.md` | 1.8k | topic → first file to open → card; "do not start from" list |
| 2 | `cards/<id>.md` | 1–5k | one area in depth (below) |
| – | `MAINTAIN.md` | 0.8k | card format and update procedure; only when editing the memory |

## Cards
| Card | Covers | Read when |
|---|---|---|
| `cards/core-code.md` | `ASTROLABE/` modules, packages, entry points, store, tests, CI | changing or tracing core behaviour |
| `cards/core-docs.md` | `ASTROLABE/` spec (`docs/`), process files (`TODO.md`, handoff), audit history | status, decisions, specs, "why" |
| `cards/sdk.md` | `llm-transport-sdk/` (AI Gate): API, SPI, vendors, OAuth, docs status | model transport, providers, sign-in |
| `cards/studio.md` | `ASTROUI/` bridge, server, Angular app; `tasks/` | Studio UI/backend work |
| `cards/root-docs.md` | root `*.md` specs/analyses, lineage, status; `diags/`, `devtools/` | before opening any large root doc |
| `cards/ideas.md` | `ideas/` research corpus and its own `_map/` | research comparison |

Card sections are fixed: Canonical sources → Map → Where to look → Relationships → Status and conflicts → Pitfalls →
Freshness. Jump to the section you need (`rg -n '^## ' .llm-memory/cards/<id>.md`).

## Conventions
- Status words: **canonical** (authoritative), **current** (true now, changes often), **historical** (explains a
  decision), **superseded** (replaced; the card names by what), **stale** (contradicted by code; evidence given).
- Anchors are heading paths (`TODO.md › ## 3`), symbols (`Controller.run`), IDs (`D-64`) or `rg` patterns — never
  line numbers. Paths are relative to the workspace root; cards define short prefixes (`K/`, `P/`, `S/`, `A/`).
- `(unverified)` marks claims nobody checked against the source.
- Search this folder explicitly: it is hidden, so `rg <pat> .llm-memory` (plain `rg` at the root skips it).

## Freshness
Each card's `## Freshness` lists the files/directories its claims rest on; `manifest.tsv` holds their fingerprints
(git blob SHA-1 prefix + size; directories hash their file list). `repo:` in each card's header gives the commit it
was verified at.
```bash
python .llm-memory/tools/memtool.py check          # lists CHANGED / MISSING entries per card; exit 1 if any
```
A changed entry means: re-check that card's claims about that path before relying on them
(`git -C <repo> log --oneline <commit>..HEAD -- <path>`), then update the card and `memtool.py stamp <card>`.

## Deliberately not indexed
Build output, `node_modules`, `devtools/` and vendored `llm-transport-sdk/{examples,examples2,tools}/`; per-file
detail of tests and fixtures; superseded drafts beyond one register line (see `root-docs`, `sdk`, `core-docs`).
