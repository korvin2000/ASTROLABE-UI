# ASTROLABE Workbench — execution index

**Status:** specification complete; application implementation has not started.  
**Authoritative specification and plan:** [ASTROLABE_UI_DESIGN.md](../ASTROLABE_UI_DESIGN.md).

The linked document is self-contained: current-source findings, UI concept, four
wireframes, twelve prototype scenarios, full configuration inventory, backend
entry points, WebSocket/REST contracts, frontend design, risks, 22 ordered tasks,
27 acceptance scenarios, and an implementation request.

## Execution sequence

| Phase | Tasks | Reviewable outcome |
|---|---|---|
| A — contracts and prototype | T01–T05 | Typed contracts and a navigable fixture-based prototype |
| B — connected campaign | T06–T12 | Real offline end-to-end campaign with replay and evidence |
| C — daily use and recovery | T13–T17 | Human interaction, complete settings binding, checks and recovery |
| D — advanced and desktop | T18–T22 | Qualified integrations, knowledge, economics, S3/publication and packaging |

Follow the dependency graph and per-task acceptance/verification in
[section 15](../ASTROLABE_UI_DESIGN.md#15-implementation-plan).
Track work in [todo.md](todo.md). Do not mark UI implementation complete merely
because the design document or a mocked screen exists.

## Key boundaries

- Java Spring Boot hosts ASTROLABE; Angular renders projections and submits commands.
- Core owns scheduling, authority, acceptance, tools, accounting and KB admission.
- AI Gate supplies model transport/auth through the separately qualified adapter.
- G01–G10 name actual integration/API gaps; proposed UI methods are not existing SDK APIs.
- The prototype in the specification is a wireframe/storyboard; a runnable prototype is T03–T05.
