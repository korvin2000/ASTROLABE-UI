# WebUI Design for ASTROLABE AI Coding Agent Harness
Think it through, design it, and propose a extremelly well-thought version concept, plan and prototype for ASTROLABE AI Coding Agent Harness
Create a detailed specification and design that will be used as Web UI / Desktop UI for ASTROLABE AI Coding Agent

The concept must be self-contained doc as a implementation plan + prompt/request to begin UI implementation and must include a detailed description of what the UI should look like and how it should function, what settings it should include, what entry points it should have, how it should interact with ASTOLABE, and any other necessary information.
Document should be well-thought and describe: Every concept, including configurable settings, project selection, the main workflow, user interaction, workflow visualization, and more.

## Output md documen requirements
Requirements for the document: It must have a well-thought-out structure grouping by topics and subtopics = very well structured with self-contained instructions, prototype description, description of the concept and ui ideas and it functionality, as well as implementation plan that is well-structured, well-thought-out, and in a format optimized for LLM readability.
it should contain backend part describing backend requirements, API and entry points and frontend part.

## prerequisites 
analyze and understand '\ASTROLABE\SOTA-BEST-MIXED-AGENT.md' architecture
analyze existing ASTROLABE code + llm-transport-sdk to understand UI entry points, possible UI events/hooks, it's workflow, design and phylosophy, implementation, architectural capabilities, and its interaction with the UI
**Important**: A very important point—analyze the architecture, philosophy, and ASTROLABE design in detail - so that, based on its specific features, we can develop not just another clone of ClaudeCode Desktop or Codex Desktop, but a UI optimized for working with ASTROLABE architecture and taking into account its specific features, workflow, configuration options, user interaction, ui hooks, and so on.

## Technology Stack
- llm trasport layer: '\llm-transport-sdk' third-party library
- Core functionality, AI Coding agent: '\ASTROLABE'
- UI : latest Angular version as frontend + SpringBoot and JAVA as backend, that uses and interacts with ASTROLABE coding agent + llm trasport layer
- primarly websockets (+may be additionally REST/RESTfull) should be used as transport layer Frontend <> Backend.

UI layer will be built on top of these projects/libraries, and I need to consider later how to integrate them into the UI, as well as how to configure them, set their parameters, and so on - In other words, the ability to interact with the UI must be expected / supported.


## UI Requirements

The UI must be fully functional and well-designed,intuitive and user-friendly taking into account the ASTROLABE architecture's specific features,specific workflow and coding process, it should allowe users to change its settings, configure everything, and interact with user, and be designed with the typical functionality of coding agents in mind. It should be possible to customize everything that is configurable in ASTROLABE—roles, agents, and so on. Ability to connect and authenticate, use different LLMs, view statistics, background processes, and workflow execution. In other words, every aspect must be functionally well-thought-out, based on the specific features of the ASTORLABE architecture and its current implementation.


## Additional UI Requirements
it should be in line with modern best web design trends a super-modern, stylish, extremely well-designed and user-friendly ui web design for AI coding agent, with typical for desktop code agents layout like in ClaudeCode Desktop or Codex Desktop, but with extra overview (view), showing current ai agent working and animated workflow, process of thinking like for example different nodes using a flow exchanging information with each over. desktop AI coding agent with a familiar two-pane layout: left sidebar for projects, sessions and navigation; main workspace for conversation, code changes, tool calls, with a persistent prompt composer at the bottom. Add a dedicated Agent Overview showing the currently active agent, task/status/progress, and an animated live workflow visualizing its execution flow, current step, tool activity and high-level reasoning progress.
Keep the UI compact, developer-oriented and information-dense, with expandable details rather than permanent secondary panels. Try to refine and rework the standard design as thoroughly and in as much detail as possible, while preserving its functionality—but making it really modern, dark/light mode, user-friendly, and attractive. Limitations - не пёстрое и не броское (не маркое), not bloated, а именно продуманное. too bright and colorful <> good design, main overview should be stylish and practical, but not overengineered and overbloated.