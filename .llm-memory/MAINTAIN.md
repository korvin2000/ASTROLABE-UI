# Maintaining the memory

Read only when adding or updating a card. Navigation starts at `README.md`.

## Principles
- A card answers "where should I look?", not "what does it say". Summaries state meaning, responsibility,
  relationships and decisions; they never copy source text, signatures or tables.
- Source code and canonical docs are the truth. A card that disagrees with them is stale: fix the card.
- Anchors are stable: heading paths (`TODO.md › ## 3 › D-64`), symbols (`Controller.run`), file names, `rg`
  patterns. Never line numbers.
- Mark status explicitly: **canonical**, **current** (true now, may change), **historical** (explains a decision),
  **superseded** (name what replaced it), **stale/conflicting** (give the evidence). Unverified claims say `(unverified)`.
- Exclude build output, generated files, vendored tools, one-off plans already reflected elsewhere, duplicates.
- Budgets: `README.md` ≤ 80 lines, `workspace.md` ≤ 120, `find.md` ≤ 150, each card ≤ 230 lines. Prose lines ≤ 120 chars (table rows may run longer).
- New area (repo, app, major directory) → new card + a row in `README.md` › Cards and in `find.md`.

## Card format (`cards/<id>.md`)
```
---
card: <id>
title: <title>
scope: <paths covered, relative to the workspace root>
repo: <repo dir> @ <short HEAD> (<branch>)      # git -C <repo> log -1 --format=%h
verified: <YYYY-MM-DD>
read-when: <one line: the questions this card answers>
---
# <Title>
<2–4 sentences: what it is, its role in the system, its status.>

## Canonical sources      precedence order; one line each: path — why it is authoritative
## Map                    table: Path | Responsibility | Key symbols / anchors
## Where to look          question → path + anchor (heading path, symbol or rg pattern)
## Relationships          what it depends on / what depends on it; contracts crossing the boundary
## Status and conflicts   current vs historical/superseded, with evidence; documents that disagree
## Pitfalls               verified, non-obvious traps that cost time
## Freshness
- `path/to/file`          every file or directory (trailing `/`) this card summarizes
```
Freshness paths are relative to the workspace root and are what `tools/memtool.py` fingerprints. List the files
the card's claims rest on (entry points, key docs, package directories); not every file.

## Freshness workflow
```bash
python .llm-memory/tools/memtool.py check            # stale or missing entries per card; exit 1 if any
python .llm-memory/tools/memtool.py check <card>     # one card
python .llm-memory/tools/memtool.py stamp <card>     # after re-verifying a card: record current fingerprints
python .llm-memory/tools/memtool.py stamp --all      # after a full rebuild
```
Fingerprint = git blob SHA-1 of the raw bytes (`git hash-object --no-filters`), first 12 hex, plus size. A directory's
fingerprint hashes the sorted `(relative path, file fingerprint)` list of its files, skipping build/cache dirs, so an
added, removed or edited file changes it. A stale entry means "re-check the claims that rest on this path", not
"the card is wrong".

## Updating after a change
1. `memtool.py check` → the stale cards and paths.
2. Re-read only what changed (`git -C <repo> log --oneline <card's repo commit>..HEAD -- <path>`, `git diff`).
3. Edit the card's affected lines; bump `repo:` and `verified:`; `memtool.py stamp <card>`.
4. If a topic moved, update `find.md`; if a component or repo appeared, update `workspace.md` and `README.md`.
