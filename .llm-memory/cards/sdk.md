---
card: sdk
title: AI Gate LLM transport SDK (llm-transport-sdk)
scope: llm-transport-sdk/
repo: llm-transport-sdk @ 0912d8a (main)
verified: 2026-09-30
read-when: Which SDK type to call or extend? How do OAuth, streaming, events, errors, catalog work? Which doc is live?
---
# AI Gate LLM transport SDK
Java 26 library `net.ai.gate:ai-gate` (one JPMS module `net.ai.gate`, JDK-only at runtime) plus the optional
`net.ai.gate:ai-gate-kotlin` (coroutines/Flow). One synchronous facade over OpenAI (Responses, Chat Completions),
Anthropic Messages and Gemini `generateContent`, with auth/OAuth (incl. ChatGPT subscription "Codex"), model catalog,
retries/deadlines/cancellation, events and a testing kit. It is the transport layer of ASTROLABE (module
`provider-ai-gate`) and of Studio (ASTROUI backend). Status: working, 0.1.0-SNAPSHOT, `@ApiStatus.Experimental` parts.
Abbreviations: `P` = `llm-transport-sdk/llm/src/main/java/net/ai/gate`; `T` = same under `src/test/java/net/ai/gate`.

## Canonical sources
- `P/**`, `llm-transport-sdk/llm/src/main/java/module-info.java` — the code; its `exports` is the public surface
- `P/**/package-info.java` and class Javadoc (`///` Markdown) — per-package contracts, threading, API vs SPI tags
- `llm-transport-sdk/llm/README.md` — status, layout, verified contracts, "Implemented", "Known limits"
- `llm-transport-sdk/llm/CHANGELOG.md` — API additions per release and dated fixes (latest 2026-09-30)
- `llm-transport-sdk/llm/build.gradle.kts`, `settings.gradle.kts`, `gradle.properties` — build, tasks, version
- `llm-transport-sdk/docs/proposals/final-architecture.md` — design intent (~240 KB: read by section only); deviations
  are in `progress_and_session_info.md` (section "Где я отошёл от документа" and each session's "Decisions")
- `T/ArchitectureTest.java`, `T/ModuleBoundaryTest.java` — enforced layering; module-path and class-path consumer

## Map
| Path | Responsibility | Key symbols / anchors |
|---|---|---|
| `P/` | Entry: runtime facade, provider, call handle | `Llm`, `Llm.Builder`, `Provider`, `LlmCall`, `CallOutcome` |
| `P/chat/` | Portable immutable history | `Conversation`, `UserMessage`, `AssistantMessage`, |
| | | `ToolResultMessage`, `StopReason`, `Continuation` |
| `P/chat/content/` | Message parts (sealed) | `Content` (Text, Image, Reasoning…), `ToolCall` |
| `P/chat/options/` | Options: call > provider > runtime | `ChatOptions`, `OutputFormat`, `HistoryPolicy` |
| `P/chat/stream/` | Live reply, sealed events | `ChatStream`, `ChatEvent` (TextDelta, PartEnd, Done…) |
| `P/chat/tool/` | Tools to offer (SDK never runs them) | `FunctionTool`, `ProviderTool`, `ToolChoice` |
| `P/model/`, `P/metadata/` | Model facts; reply facts | `Model`, `Capability`, `Prices`; `Usage`, `Cost`, `Attempt` |
| `P/catalog/` | Merged catalog: bundled > feeds > live | `ModelCatalog`, `CatalogOptions`, `ModelsDevFeed` |
| `P/providers/` | Preset index; secret-free JSON config | `Providers`, `ProvidersConfig` (`ai-gate.providers/1`) |
| `P/config/`, `P/cache/` | Policies, UI form fields; response cache | `RetryPolicy`, `TimeoutPolicy`, `HttpOptions`, |
| | | `FieldDescriptor`, `ResponseCache`, `CacheMode` |
| `P/diagnostics/` | Dry run, connection test | `PreparedCall`, `PreparedRequest`, `ConnectionReport` |
| `P/lifecycle/` | Cancellation tree | `CancelToken`, `Registration` |
| `P/error/` | Unchecked failures: type + code | `LlmException`, `ErrorCode` (+8 subclasses, below) |
| `P/auth/` | Credential chain, stores, login | `Auth`, `Credential`, `CredentialStore`, `ApiKeyAuth` |
| `P/auth/oauth/` | OAuth config, credential, strategy | `OAuthAuth`, `OAuthConfig`, `OAuthCredential` |
| `P/auth/interaction/` | Host-UI hook for all logins | `AuthInteraction`, `AuthPrompt`, `AuthNotice`, |
| | | `RedirectInteraction` |
| `P/event/` | Content-free events for UIs | `LlmListener`, `RequestEvent`, `CredentialEvent` |
| `P/json/` | Own JSON tree, binding, schema | `Json`, `JsonObject`, `JsonSchema`, `JsonMapper` |
| `P/testing/` | Scripted provider, real runtime | `FakeProvider`, `ScriptedReply`, `RecordingListener` |
| `P/spi/protocol/` | Wire-format SPI, pure codecs | `WireApi`, `StreamDecoder`, `ApiCompat`, `ApiFeatures` |
| `P/spi/http/` | Transport SPI, interceptors | `HttpTransport`, `HttpCall`, `WireInterceptor` |
| `P/spi/catalog/`, `P/spi/provider/` | Metadata SPI; bundles, provider APIs | `ModelSource`, `CatalogFeed`; |
| | | `ProviderBundle`, `ProviderApi`, `RawApi` |
| `P/vendors/openai/` | Responses, Chat Completions, Codex, | `OpenAi`, `OpenAiCompatible`, |
| | OpenAI-compatible presets | `OpenAiResponsesCompat`, `OpenAiCompletionsCompat` |
| `P/vendors/anthropic/` | Messages API preset, compat | `Anthropic`, `AnthropicOptions`, `AnthropicCompat` |
| `P/vendors/google/` | Gemini, cached contents | `Gemini`, `Gemini.CACHES`, `GeminiOptions` |
| `P/vendors/*/internal/` | Codecs and bundle per family | `ResponsesCodec`, `CompletionsCodec`, `MessagesCodec`, |
| | | `GenerateContentCodec`, `OpenAiBundle`, `GoogleBundle` |
| `P/internal/core/` | Execution pipeline (not exported) | `DefaultLlm`, `Core`, `Engine`, `Call`, `Resolver`, |
| | | `Handoff`, `Accumulator`, `DefaultChatStream`, `EventHub` |
| `P/internal/http/` | JDK transport, SSE framing, errors | `JdkHttpTransport`, `FrameReader`, `HttpErrors` |
| `P/internal/auth/` | Resolution chain, key strategies | `AuthResolver`, `DefaultAuth`, `KeyAuth` |
| `P/internal/auth/oauth/` | PKCE, device code, refresh, loopback | `StandardOAuth`, `Loopback` |
| `P/internal/auth/store/` | Credential stores | `MemoryStore`, `FileStore`, `ScopedStore` |
| `P/internal/{cache,catalog,json,` | Cassettes, catalog merge, JSON, | `DirectoryCache`, `CatalogService`, |
| `serialization,validation}/` | canonical forms | `ConversationJson`, `ChatOptionsJson` |
| `llm-transport-sdk/llm/src/main/resources/` | ServiceLoader file, models | `META-INF/services/*ProviderBundle`, |
| | | `net/ai/gate/catalog/models.json` |
| `llm-transport-sdk/llm/kotlin/` | `ai-gate-kotlin` adapters | `LlmCoroutines.kt`: `completeSuspending`, `events` |
| `llm-transport-sdk/llm/src/test/` | JUnit 6, ArchUnit, scripted endpoints | `WireScript`, `Fixtures`, `*WireTest` |

## Where to look
| Question | Path + anchor |
|---|---|
| Create a runtime | `Llm.create` / `Llm.of` / `Llm.builder`; impl `P/internal/core/DefaultLlm.java`, `Core.java` |
| Multi-user or tenant runtime | `Llm.withCredentials` (view), `Environment.none()`, `CredentialStore.scoped` |
| Blocking, typed, async call | `Llm.complete` (3 forms), `Llm.completeAsync`; pipeline: `internal/core/package-info` |
| Streaming, token deltas | `Llm.stream` → `ChatStream`/`ChatEvent`; `Accumulator`, `FrameReader`; Flow: `llm/kotlin` |
| Cancel-safe call, the bill | `Llm.start` → `LlmCall.outcome()` → `CallOutcome` (partial, usage, attempts) |
| Events for a progress UI | `Llm.addListener`, `Llm.Builder.listener`; `RequestEvent` (Started, FirstOutput, |
| | Progress, Retrying, Finished); also `CredentialEvent`, `CatalogEvent` |
| Add a provider, config only | `ProvidersConfig` templates `openai-compatible`/`anthropic-compatible`; |
| | `OpenAiCompatible.custom`, `Anthropic.compatible`; dialect flags `OpenAiCompletionsCompat`, `AnthropicCompat` |
| Add a provider, new wire format | implement `WireApi` (smallest: `P/testing/FakeWireApi.java`; helpers `Codecs`), a |
| | `Provider.builder(id, api)` preset, exposed via `ProviderBundle` (`META-INF/services` + module-info `provides`) |
| Add a vendor preset | `P/vendors/<family>/<Family>.java` factory, `internal/<Family>Bundle.java`, `Providers` |
| Add a model to the catalog | host: `Provider.Builder.model` or `ProvidersConfig` `models`; bundled: |
| | `./gradlew updateModelCatalog` (regenerates `models.json`; never by hand); Codex subset: `ModelsDevFeed.CODEX` |
| Catalog merge, refresh | `ModelCatalog`, `CatalogOptions` (`offline`, `noFeeds`, `snapshotFile`, `manualRefresh`) |
| API key / env resolution | `ApiKeyAuth` on the preset; chain order in `internal/auth/AuthResolver.java` Javadoc |
| OAuth browser hook | `AuthInteraction.notify` + `AuthNotice.OpenUrl`; flow `internal/auth/oauth/StandardOAuth.java` |
| OAuth callback, web host | `AuthInteraction.redirect(uri, sendBrowserTo)`; `RedirectInteraction.complete(uri)` |
| Device-code login | `AuthNotice.DeviceCode`; `OAuthConfig.DeviceDialect`; `StandardOAuth.deviceCode` |
| ChatGPT subscription (Codex) | `OpenAi.codex()`, `OpenAiResponsesCompat.streamingOnly`, `ResponsesCodec`, `Loopback` |
| Credential persistence | `CredentialStore.file(path)` (`FileStore`: lock file, owner-only, plain JSON); custom = SPI |
| Error mapping to exceptions | `internal/http/HttpErrors` (`exception`, `QUOTA`); `WireApi.decodeError`; `Codecs` |
| Error classes | `AuthenticationException`, `InvalidRequestException`, `InvalidResponseException`, |
| | `RateLimitedException`, `RequestCancelledException`, `RequestTimeoutException`, `TransportException` |
| Retry, backoff, deadlines | `internal/core/Call` (`send`, `backoff`, `classify`); `RetryPolicy`, `TimeoutPolicy` |
| Test without network or keys | `FakeProvider` (`reply`, `fail`, `stall`, `pacing`), `RecordingListener`, `LlmErrors` |
| Codec test at wire level | `T/vendors/WireScript.java` + `T/vendors/**/*WireTest.java` (e.g. `CodexWireTest`) |
| Real endpoints | `T/LiveSmokeTest.java`, `./gradlew liveTest` (env keys; `AI_GATE_CREDENTIALS` for Codex) |
| Settings forms for a UI | `ChatOptions.fields`, `Provider.fields`, `ApiCompat.fields`, `ProvidersConfig.validate` |
| Dry run, diagnostics | `Llm.preview`, `PreparedRequest.toCurl`, `Llm.test` → `ConnectionReport`, `Llm.describe` |
| History hand-off between models | `internal/core/Handoff.java` (table in Javadoc), `Llm.check`, `HistoryPolicy` |
| Continuation, compaction | `Continuation`, `continueFrom`, `Llm.compact`, `Llm.countTokens`, `Llm.features` |

## Relationships
- Depends on the JDK only (`java.net.http`; optional `java.desktop` browser opening, `jdk.jfr`); annotations are
  `compileOnlyApi`. `ai-gate-kotlin` adds kotlinx-coroutines; Kotlin is test-only in the core.
- ArchUnit-enforced layering: vendors/testing/data use the public API only; `internal` knows no vendor; vendor families
  are independent; codecs are pure (no I/O, credentials, clocks); no public signature mentions an internal type.
- ASTROLABE: `ASTROLABE/settings.gradle.kts` includes this build from `../llm-transport-sdk/llm` when present and adds
  `:provider-ai-gate` (package `io.astrolabe.provider.aigate`: `AiGateAdapter`, `RequestTranslator`,
  `ResponseTranslator`, `AiGateEstimator`, `AiGateInvocation`, `ProfileBinding`, `JsonBridge`). Uses `Llm`, `prepare`,
  `start`, `countTokens`, `ApiFeatures`, `RequestEvent`; tests use `FakeProvider`. Pin: `ai-gate` in
  `ASTROLABE/gradle/libs.versions.toml`.
- Studio: `ASTROUI/backend/bridge/build.gradle.kts` depends on `provider-ai-gate` and `net.ai.gate:ai-gate`
  (0.1.0-SNAPSHOT). `ASTROUI/backend/server/.../runtime/TransportService` builds the `Llm` (`discoverProviders`,
  `CredentialStore.file`, filtered `Environment`, catalog snapshot file, telemetry `listener`, custom providers);
  `accounts/LoginService` builds the `AuthInteraction` for UI logins; `ProviderService`, `ModelService`,
  `AccountService` use `Auth`, `AuthStatus`, `FieldDescriptor`, `Model`, `Capability`, `ConnectionReport`.
- `ai-gate-kotlin` has no consumer in ASTROLABE/ASTROUI build files (grep of `*.kts`, `*.toml`, 2026-09-30).
- Contracts across the boundary: secrets never in events/config (`Secret` redacts; `ProvidersConfig` has no key field);
  unknown facts are absent or `UNKNOWN`, never 0; failures are `LlmException` with `ErrorCode`, `partial()`,
  `outcomeUnknown()`; events are content-free. Local publish for joint work: `./gradlew publishToMavenLocal`.

## Status and conflicts
Evidence: `git -C llm-transport-sdk log --format='%h %ad %s' --date=short -- <file>`. Files under `llm-transport-sdk/`:
| File | Status | Evidence |
|---|---|---|
| `llm/README.md`, `llm/CHANGELOG.md` | canonical, current | README 877a1a6 (09-28); CHANGELOG 0912d8a (09-30) |
| `llm/REVIEW.md` | current for findings 7-8 | 09-27; 1-6 fixed in d8dc26a; 7 (codec buffers), 8 |
| | | (policy deserialization) marked Open; still open in code: (unverified) |
| `progress_and_session_info.md` | current log | Sessions 1-6, last 09-28; early sessions partly Russian |
| `docs/proposals/final-architecture.md` | canonical intent | header: supersedes `-mix` and `v2` |
| `docs/proposals/final-architecture-mix.md` | superseded | by `final-architecture.md`; old package `dev.llmtransport` |
| `docs/proposals/architecture-v2-pi-informed.md` | superseded | delta over `-mix`, "kept as history" |
| `docs/proposals/architecture-proposal-transportsdk.md` | historical | proposal A, input of the merge |
| `docs/proposals/llm-transport-sdk-architecture.md` | historical | proposal B, input of the merge; Java 17 baseline |
| `docs/requirements/detailed-{astra,fable,opus}.md` | historical | 09-26 inputs; README/REVIEW drop reactive, routing |
| `docs/requirements/{requirements-mini,short-gemini}.md` | historical, duplicate | identical blob 3d6d6b37 |
| `goals.md`, `review_goals.md`, `second_phase.md` | historical | original prompts: design, review, phase 2 |
| `step_three.md` | historical | stage-3 prompt (Russian), tasks done per its end; old path `/c/work.ai/` |
| `review_and_fixes.md` | historical | status line "not implemented" is stale; done in Session 2 |
| `review_fixes.md` | superseded | six-fix summary; full text in `llm/REVIEW.md` |
| `LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md` | historical, done | SDK spec S-01..S-17 (372969a); Sessions 5 and 6 |
| `ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md` | historical | ASTROLABE side (A-/G-); coverage (unverified) |
| `examples/`, `examples2/`, `tools/` | reference, vendored | untracked (`.gitignore`); see below |
| `.claude/skills/*`, `.codex/skills/` | authoring guidance | not product code |
- `examples/`: TypeScript pi-ai 0.87.1 and pi-telemetry, the design reference. `examples2/`: unrelated Spring Boot
  "unbi-engine" with its own ChatGPT OAuth code (phase-2 reference, no `net.ai.gate` use). `tools/`: JDK 26, Gradle.
- Duplicates: `ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md`, `LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md` also exist at
  the workspace root (root repo 7fed3e0; SDK 372969a). Content identical: CR-stripped blobs match (`8f704107`,
  `cf0f6ed3`). SDK copies are CRLF (+631/+422 bytes = line counts; raw `--no-filters` `eb542e14`/`9c77fedf`). Later
  mtime (09-28 23:49 vs 16:49) is checkout time, not newer content. Edit neither without syncing; prefer the SDK copy.
- `git log -3`: 0912d8a 09-30 Codex `complete()` fix; 877a1a6 09-28 continuation, compaction, Kotlin artifact (S-14,
  S-16); 372969a 09-28 ASTROLABE compatibility layer (S-01..S-13, S-15, S-17).
- The Codex/Responses fix is in `internal/core/Engine.java` (`Engine.complete`, `Engine.eventStream`, `Sniffed`): the
  backend answers SSE with no `Content-Type`, so a successful untyped body that starts with an SSE field is read as
  events. Regression: `CodexWireTest.completeReadsEventsTheBackendSendsWithoutAContentType`; `stream()` unaffected.

## Pitfalls
- Codex is unofficial: SSE only, no `max_output_tokens` (`ApiFeatures` output cap UNSUPPORTED), plan limits raise
  `RateLimitedException` `quota_exhausted` (not retried), login needs loopback port 1455 free, the Codex CLI login
  (`~/.codex/auth.json`) is not imported, Claude subscriptions are deliberately unsupported.
- `StandardOAuth.login` asks `AuthPrompt.Select` (browser or device) when both exist and the UI is not a
  `RedirectInteraction`: a headless `AuthInteraction` must answer it. The loopback callback pre-empts `AuthPrompt.Code`.
- A stored credential owns its provider: a failed refresh never falls back to an environment key.
- HTTP 500/502 after send surface `outcomeUnknown()` and are not retried: check it before re-billing.
- `strict()` fails billing/limit-changing adaptations (thinking `max_tokens` raise, extra cache markers, `LONG`
  retention); otherwise adaptations become reply `Warning`s and unsupported sampling parameters are dropped.
- Listeners run synchronously on the producing thread: keep them brief. `ChatStream` is single-consumer, one view only.
- Experimental: `start`, `prepare`, `features`, `countTokens`, `compact`, `check`, `providerApi` may change in minor
  versions; `ChatEvent`, `AuthPrompt`, `AuthNotice` are sealed: keep a `default` branch for future variants.
- `models.json` (generated 2026-09-27) holds feed prices, not invoices; feeds refresh them unless `CatalogOptions`
  or `noFeeds()`. Confidential OAuth clients and client-credentials are rejected explicitly, never ignored.
- Build needs JDK 26 and Gradle 9.7 (in `llm-transport-sdk/tools/`); `-Xlint:all -Werror` applies to main code.

## Freshness
- `llm-transport-sdk/llm/README.md`
- `llm-transport-sdk/llm/CHANGELOG.md`
- `llm-transport-sdk/llm/REVIEW.md`
- `llm-transport-sdk/llm/build.gradle.kts`
- `llm-transport-sdk/llm/settings.gradle.kts`
- `llm-transport-sdk/llm/gradle.properties`
- `llm-transport-sdk/llm/src/main/java/`
- `llm-transport-sdk/llm/src/main/resources/META-INF/services/net.ai.gate.spi.provider.ProviderBundle`
- `llm-transport-sdk/llm/kotlin/src/main/kotlin/net/ai/gate/kotlin/LlmCoroutines.kt`
- `llm-transport-sdk/llm/src/test/java/net/ai/gate/ArchitectureTest.java`
- `llm-transport-sdk/llm/src/test/java/net/ai/gate/vendors/openai/CodexWireTest.java`
- `llm-transport-sdk/progress_and_session_info.md`
- `llm-transport-sdk/docs/proposals/final-architecture.md`
- `llm-transport-sdk/LLM_TRANSPORT_SDK_CHANGES_FOR_ASTROLABE.md`
- `llm-transport-sdk/ASTROLABE_CHANGES_FOR_LLM_TRANSPORT_SDK.md`
- `ASTROLABE/settings.gradle.kts`
- `ASTROLABE/provider-ai-gate/src/main/kotlin/io/astrolabe/provider/aigate/AiGateAdapter.kt`
- `ASTROUI/backend/server/src/main/java/io/astrolabe/studio/runtime/TransportService.java`
