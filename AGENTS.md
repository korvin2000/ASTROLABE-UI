# Workspace: ASTROLABE coding agent + Studio + AI Gate SDK

Three git repositories in one folder, built together:

| Path | Repo | What it is |
|---|---|---|
| `ASTROLABE/` | nested, `korvin2000/ASTROLABE` | Kotlin/JVM coding-agent harness SDK (the core). Has its own `CLAUDE.md` workflow. |
| `llm-transport-sdk/` | nested, `korvin2000/llm-transport-sdk` | AI Gate: Java LLM transport/auth SDK (`net.ai.gate`), module `llm/`. |
| `ASTROUI/` + root docs | root, `korvin2000/ASTROLABE-UI` | ASTROLABE Studio: Kotlin bridge + Spring Boot server + Angular UI. |

Chain: Studio → bridge → ASTROLABE `Controller` → `provider-ai-gate` (`AiGateAdapter`) → AI Gate SDK → model providers.
Gradle composite builds: `ASTROUI` includes `../ASTROLABE`, which includes `../llm-transport-sdk/llm` when present.

**Active program: ASTROLABE 2.0 — `ASTROLABE-2-PLAN.md`, status — phase P8 in `ASTROLABE/TODO.md`** (cards and line
reports in `plan2/`).

## Orientation (progressive: read only the next level you need)
1. `.llm-memory/README.md` — map of the memory: cards per area, lookup table, freshness check.
2. `.llm-memory/find.md` — "where do I look for X?" across all three repos.
3. `.llm-memory/cards/<area>.md` — one area in depth, then the source files it points to.

## Rules that save time
- Work inside a nested repo under its own rules: `ASTROLABE/CLAUDE.md` is binding there (workflow, verification
  tiers, push authority); `TODO.md` is ASTROLABE's progress authority.
- Root `.gitignore` excludes `ASTROLABE/`, `llm-transport-sdk/`, `ideas/`, `diags/`, `devtools/`: `rg`/Grep run from
  the root skip them. Pass the directory explicitly (`rg <pat> ASTROLABE`). Use `git -C <repo>` per repository.
- Many root `*.md` files are large superseded drafts (100–300 KB). Check `.llm-memory/cards/root-docs.md` before
  opening one.
- Source code and each repo's canonical docs outrank the memory. If a card disagrees, trust the source and fix the
  card (`.llm-memory/MAINTAIN.md`). Staleness check: `python .llm-memory/tools/memtool.py check`.
- Toolchain: JDK 26 in `devtools/jdk-26.0.2.1+1`, Gradle 9.7.1 wrappers; Windows and Linux are both targets.
