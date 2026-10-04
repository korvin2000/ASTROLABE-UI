Scan and analyze the entire project, then build a compact, hierarchical **LLM-optimized project memory and repository map** whose primary purpose is fast orientation, retrieval, and context-efficient navigation in future sessions.

The result should let a fresh LLM quickly understand:

- what this project is and its core architectural philosophy;
- where the authoritative architecture, design decisions, plans, changes, and implementation documentation live;
- what each important directory/module contains and is responsible for;
- where important concepts, APIs, components, classes, and entry points are implemented;
- which files are canonical and currently relevant;
- where to look for a specific topic without recursively exploring or reading large files.

Design the memory structure yourself before creating it. Prefer a small hierarchical system over one large document. Use an appropriate project-local directory such as `.claude-memory/`, `.llm-memory/`, `.agent/`, or an existing project convention; remain vendor-neutral unless there is a good reason not to. If useful, create a very small root entry point that acts primarily as a map to the deeper memory rather than an encyclopedia.

Optimize everything for **LLM retrieval, readability, low token consumption, and progressive disclosure**. A model should first read a tiny high-level map, then follow increasingly specific references only when needed.

Include concise summaries for important documents, directories, modules, and architectural areas. These summaries should capture meaning, responsibilities, relationships, important decisions, and useful navigation hints without duplicating the source material.

For large documents and source areas, provide stable retrieval anchors where useful: section/heading paths, important symbols, class or function names, distinctive search terms, filenames, or other inexpensive ways to jump directly to the relevant location. Prefer stable semantic anchors over fragile line numbers.

For source code, build a lightweight repository map rather than documenting every file. Focus on significant modules, public APIs, architectural boundaries, major classes/interfaces, important symbols, dependencies, entry points, and non-obvious relationships. Optimize for answering **“where should I look?”** rather than reproducing implementation details.

Add lightweight freshness metadata so future agents can cheaply determine whether an index entry may be stale—for example content hashes/fingerprints, file size, relevant revision information, or another sensible mechanism. Choose the simplest robust approach appropriate for this repository.

Be selective. Exclude or strongly de-prioritize:

- temporary and generated artifacts;
- obsolete proposals and superseded versions;
- completed one-off planning documents whose information is already reflected elsewhere;
- duplicated documentation;
- trivial files and implementation noise;
- historical material with little value for understanding or modifying the current project.

Preserve historical information only when it explains important architectural decisions or prevents future agents from repeating known mistakes.

Treat existing source code and authoritative documentation as the source of truth. Detect conflicting, stale, or ambiguous documentation and distinguish current/canonical information from historical or uncertain information rather than blindly indexing everything.

Before implementation, inspect relevant current best practices for coding-agent memory, repository maps, hierarchical project instructions, and context-efficient retrieval. Use them as inspiration, not as rigid templates. Think specifically about what information **you, as an LLM working in a fresh session**, would want available to understand this repository and locate the right source with the fewest reads and tokens.

The final system should be **small, hierarchical, maintainable, searchable, and high-signal**. Its purpose is not comprehensive documentation; it is a persistent semantic navigation layer that minimizes repeated repository exploration and unnecessary context consumption across future LLM sessions.