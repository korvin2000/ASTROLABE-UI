# Integrating `llm-transport-sdk` as ASTROLABE's LLM transport layer

**Date:** 2026-09-28
**Question:** Can ASTROLABE (a Kotlin coding agent that currently runs only against fake/scripted models) use `llm-transport-sdk` (Java library "AI Gate", `net.ai.gate`) as a third-party library for real LLM calls, gateway access, credentials and transport? What fits, what is missing, what is incompatible, and what should change in each project?
**Method:** Source reading of both repositories. No code was changed and no live provider was called.

---

## 1. Verdict

**Yes, it can be used, and it is a good fit.** The SDK already provides the parts ASTROLABE deliberately left out: HTTP transport, provider codecs (Anthropic Messages, OpenAI Responses, OpenAI Chat Completions, Gemini), OpenAI-compatible gateway presets, API-key and OAuth credentials, streaming, retries, deadlines, cancellation, usage extraction and a model catalog. ASTROLABE already defines a clean transport seam: `ProviderAdapter`, plus a Java variant `JavaProviderAdapter` with a future-to-coroutine bridge. Neither project has to be ported or rewritten.

**It does not plug in directly, though.** A new adapter module, about 1,000–1,500 lines of Kotlin, must translate between the two models:

| Area | ASTROLABE expects | SDK provides | Result |
|---|---|---|---|
| Request shape | Ordered `S R K T A` segments of flat items, with segment-level cache breakpoints | `Conversation`: system text, tools, turn-structured messages and message-index breakpoints | Adapter translation, without loss |
| Tool schemas | `ToolSchema` in the `json-schema-2020-12` dialect, as kotlinx `JsonObject` | `FunctionTool` built from an arbitrary `JsonSchema` | Adapter translation |
| Invocation | `start()` → `Invocation { await, cancel, terminal }` following the D-51 states | Blocking `complete()`, `stream()`, `completeAsync()` and `CancelToken` | Adapter, with one SDK gap (usage is lost on cancellation or failure) |
| Usage | `BillableUsage` with `cache_write_5m` and `cache_write_1h`, and explicit `unknown` dimensions | `Usage` with a single `cacheWrite` bucket, plus the raw provider usage object | Adapter reads `Usage.raw()`; SDK extension recommended |
| Admission | Exact counts, or counts with a margin, for every request | No token counting API; only an internal `chars/4` estimate | ASTROLABE heuristic plus learned margin works; SDK extension recommended |
| Capabilities | Booleans and limits for breakpoints, dialects, continuation, cancellation and so on | Catalog limits and tri-state capability levels | Declared in the ASTROLABE `Profile`, cross-checked against the SDK catalog |
| Continuation / compaction | `OpaqueContinuation` | Only `previous_response_id` as an OpenAI option, and no compaction | Keep it disabled; SDK extension later |

**Feasibility by scope:**

| Scope | Feasible now? | Needed |
|---|---|---|
| Real calls: text and local function tools, multi-turn coding loop, one or more providers, API-key or OAuth credentials, streaming, retries | **Yes** | Adapter module plus three small ASTROLABE changes (§7) |
| Exact per-provider accounting (5m/1h cache writes, usage when a call is cancelled or interrupted) | Partly (normal completions are exact; cancelled or interrupted calls lose usage) | SDK-1 and SDK-3 (§8) |
| Exact context admission (a tokenizer-exact fit) | No: only a conservative estimate | SDK-5 (§8) |
| Server-side continuation, native compaction, hosted tools | No | SDK-7 (§8) and ASTROLABE P7 work |

With the adapter alone, integration needs no tricks. The workarounds that remain without SDK changes are listed in §8.1. Each is replaced by an ordinary, backward-compatible SDK extension.

---

## 2. The transport seam in ASTROLABE

### 2.1 Where the stubs are

ASTROLABE has **no production adapter**. The only `ProviderAdapter` implementation is a test fixture:

- [FakeAdapter.kt](ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/FakeAdapter.kt) combines scripted replies, a simulated prefix cache, injected faults and D-51 cancellation races.
- [ScriptedModel.kt](ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/ScriptedModel.kt), [FakeProfiles.kt](ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/FakeProfiles.kt) and [FakeTokenizer.kt](ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/FakeTokenizer.kt) support it.
- `TODO.md` §P7 lists the missing pieces explicitly: `astrolabe-provider-openai`, `-anthropic` and `-compat` (HTTP clients, auth, streaming, capability probes, continuation, cancellation, `UsageNormalizer`, retry semantics, and AX-01..10 against recorded fixtures). These plug into `ProviderAdapter`, `UsageNormalizer`, `Capabilities` and `Segment` breakpoints.

**This is exactly the layer the SDK supplies.** Nothing in `core` has to be replaced. Only a production `ProviderAdapter` has to be written.

### 2.2 The contract (module `:provider-api`, no networking)

| Type | File | Role |
|---|---|---|
| `ProviderAdapter` | [ProviderAdapter.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/ProviderAdapter.kt) | `id`, `capabilities(profile)`, `validate(request, estimate)`, `start(request, id): Invocation`, `normalizer` |
| `Invocation` / `Terminal` | same | `await()` returns a `Response` or throws `ProviderError`. After `cancel()` it returns `StopReason.Cancelled` with no tool calls. `terminal()` completes exactly once with late items and usage. The states are `Requested → CancelRequested → ProviderAcknowledged → TerminalReconciled`. |
| `ProviderError` | same | `Transport`, `RateLimit(retryAfter)`, `OutputLimit`, `Refusal`, `ExpiredContinuation`, `InvalidRequest`, `UnsupportedSchema`, `MissingUsage` |
| `Validations.standard` | same | Tool-pairing check, breakpoints versus capability, schema dialect, continuation, unknown history, context and output limits |
| `JavaProviderAdapter` + `ProviderAdapters.fromJava` | [JavaProviderAdapter.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/JavaProviderAdapter.kt) | Futures-based SPI. The bridge never cancels the futures, so accounting completes. |
| `Request` / `Segment` / `Response` | [Request.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Request.kt) | Segments in `S R K T A` order, each with a `breakpoint` flag. Also `tools: List<ToolSchema>`, `profile`, `effort`, `maxOutputTokens`, `mask` and `continuation`. A `Truncated` or `Cancelled` response cannot contain a `ToolCall`. |
| `Item` | [Item.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Item.kt) | Flat items: `Message(role, parts)`, `ToolCall(id, name, argsJson)`, `ToolResult(callId, content, isError)`, `ReasoningRef(providerTag, opaque)`, `UsageItem` and `OpaqueContinuation`. Each item has an optional `native: JsonElement`. |
| `Capabilities` / `Profile` / `PriceTable` | [Capabilities.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Capabilities.kt), [Usage.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Usage.kt) | A `Profile` is `(id, provider, model, capabilities, dated priceTable, config: JsonObject)`. ASTROLABE owns limits and prices per profile. |
| `BillableUsage` / `UsageNormalizer` | [Usage.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Usage.kt) | Per-dimension quantities (`uncached_input`, `cache_read`, `cache_write_5m`, `cache_write_1h`, `output`, …), an explicit `unknown` set and a `native` field |
| `Estimate` / `TokenEstimator` | [Estimate.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Estimate.kt) | Admission estimate. **Any item with `native != null` is counted as unknown history** ([Estimate.kt:92](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Estimate.kt:92)). |

### 2.3 How core calls the model

The cell loop is in [Cell.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Cell.kt):

1. `ToolSchemas.forLineage(adapter, profile, mask)` requires `json-schema-2020-12` in `capabilities.schemaDialects`.
2. `Layout.render` builds S (a System message), R (a User message), K (a User message) and T (pinned User messages plus transcript items), each with `breakpoint = true`. It adds A, a User message with no breakpoint ([Layout.kt:196-227](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Layout.kt:196)). So there are at most **4 breakpoints**, and each one falls on a whole-message boundary.
3. `estimator.estimate(request)` is followed by `adapter.validate(...)` and then `ContextAdmission.check(...)` ([Cell.kt:308-335](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Cell.kt:308)). `UnknownHistory` is always refused ([ContextAdmission.kt:46](ASTROLABE/core/src/main/kotlin/io/astrolabe/context/ContextAdmission.kt:46)).
4. Next come `adapter.start(request, id)` and `await()`. In `finally`, `terminal()` runs under `NonCancellable`. Usage reconciles the budget: when usage is unknown, the conservative estimate is charged. Late items are archived and never executed ([Cell.kt:357-385](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Cell.kt:357)).
5. `ProviderError` makes the cell fail ([Cell.kt:387](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Cell.kt:387)). A `Cancelled` or `Refusal` stop ends the cell. Otherwise the tool calls are validated against the mask and executed locally.
6. `appendNative` keeps `Message`, `ToolCall` and `ReasoningRef` items in the transcript `[T]`. Tool results are then appended as `ToolResult.text(callId, …)`. Residency may later evict or stub these items.

**One adapter serves every profile.** `Controller` routes cells to main, helper or escalation profiles but reuses `model.adapter` ([Controller.kt:1263](ASTROLABE/core/src/main/kotlin/io/astrolabe/campaign/Controller.kt:1263)). So the adapter must dispatch on `request.profile.provider/model`. This matches one SDK `Llm` runtime that holds several providers.

Entry points: `Astrolabe(config, adapter: ProviderAdapter, authority, …)` and `AstrolabeJava(config, adapter: JavaProviderAdapter, …)`. **`Astrolabe.campaign` hard-codes `HeuristicEstimator()`** ([Astrolabe.kt:101](ASTROLABE/core/src/main/kotlin/io/astrolabe/Astrolabe.kt:101)).

> **Note on "authorisation":** ASTROLABE's `auth` package and `Authority` handle *permission for agent effects* (edits, runs, publication). The SDK's `auth` handles *provider credentials* (API keys and OAuth). They are separate concerns and do not conflict. ASTROLABE has no credential handling of its own, so the SDK fills that gap.

---

## 3. What the SDK provides (relevant surface)

It is a pure Java 26 library (`net.ai.gate:ai-gate:0.1.0-SNAPSHOT`, JPMS module `net.ai.gate`). Its only runtime dependency is the JDK. JSpecify nullness annotations are visible to Kotlin at compile time.

| Capability | API | Notes for ASTROLABE |
|---|---|---|
| Runtime | `Llm.builder()…build()`, thread-safe, `AutoCloseable` | Create one per ASTROLABE host process and share it across profiles |
| Providers and gateways | `Providers.anthropic()/openai()/google()/openRouter()/deepSeek()/xai()/qwen()/mistral()/groq()/ollama()/lmStudio()/vllm()`, `OpenAiCompatible.liteLlm/azureOpenAi/custom`, `Provider.builder(id, WireApi)` | Corporate gateways are supported through presets, `anthropic-compatible`/`openai-compatible` templates and `ProvidersConfig` JSON (`ai-gate.providers/1`, secret-free) |
| Wire APIs | `anthropic-messages`, `openai-responses`, `openai-completions`, `google-generate-content` | Covers the two native protocols ASTROLABE §15.1 names, plus the compat fallback |
| Credentials | `ApiKeyAuth` (bearer, header, dynamic `TokenSupplier`), `OAuthAuth` with a locked refresh, `CredentialStore.inMemory()/file()`, `Environment`, `Llm.withCredentials(store)` | Environment keys by default; the file store suits a CLI host |
| Calls | `complete()`, `completeAsync()`, `stream()` → `ChatStream` (`iterator()`, `partial()`, `result()`, `close()`) | Blocking model; completions run on virtual threads |
| Conversation | `Conversation(system, tools, messages, cacheBreakpoints)`; `UserMessage`, `AssistantMessage(model, api, content, stopReason, usage, responseId)`, `ToolResultMessage` | Stateless: a full conversation is sent on every call, just as ASTROLABE rebuilds its `Request` every turn |
| Content | `Text`, `Reasoning(text, signature, redacted, providerData)`, `ToolCall(id, name, argumentsJson)`, `ToolResult`, `Refusal`, `Unknown`, media | Reasoning signatures and OpenAI encrypted reasoning round-trip. Gemini thought signatures are kept as positional reasoning parts. |
| Cross-model handoff | Internal `Handoff`, driven by `AssistantMessage.model()/api()` origin | Same origin replays natively. For another origin, signatures are dropped, readable reasoning becomes `<thinking>` text (`KEEP`) or is dropped (`DROP`), and tool-call IDs are normalized with the results remapped. |
| Tools | `Tool.function(name).description(..).parameters(JsonSchema.of(json)).build()`, `ToolChoice`, `ProviderTool` (hosted) | Arbitrary JSON Schema is passed through; `strict` is off by default |
| Options | `ChatOptions`: `maxTokens`, `reasoning` (`ReasoningLevel`), `reasoningHandoff`, `parallelToolCalls`, `cacheRetention` (NONE/SHORT/LONG), `sessionId` (cache key), `timeouts`, `retry`, `cancel`, `tags`, `strict`, provider options | `strict()` turns soft adaptations into failures. This matches ASTROLABE's "verified, not assumed" rule. |
| Prompt caching | Explicit `cacheBreakpoints` (message indices, `0` = after system and tools), or automatic placement. The Anthropic codec allows ≤ 4 markers ([MessagesCodec.java:211](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/anthropic/internal/MessagesCodec.java:211)); OpenAI uses `prompt_cache_key` and 24h retention. | Maps one-to-one onto ASTROLABE's S/R/K/T breakpoints (§5.3) |
| Usage | `Usage(input, cacheRead, cacheWrite, output, reasoning, total, cost, spent, raw)` in disjoint buckets; absent means "not reported" | `raw()` keeps the provider's usage object, which ASTROLABE's normalizer needs for the 5m/1h split |
| Errors | `LlmException` subclasses with `ErrorCode` (`rate_limited`, `context_overflow`, `stream_interrupted`, `outcome_unknown`, `cancelled`, …), `retryable()`, `outcomeUnknown()`, `retryAfter`, `partial()` | Maps onto `ProviderError` (§5.8) |
| Retries and timeouts | `RetryPolicy` retries only "not processed" failures (pre-send, 408/409/429/503/529); it never retries after stream output or an ambiguous failure. `TimeoutPolicy` sets total and idle deadlines. | Matches ASTROLABE's rule that provider retries belong in the transport |
| Dry run | `Llm.preview(model, conversation, options)` → `PreparedRequest` with the exact wire body plus warnings or rejection, with no network and no credentials | An ideal building block for `validate()` |
| Diagnostics | `Llm.test(model)` (a staged non-billable check of config → network → auth → model access), `describe()`, `LlmListener` events, JFR | Suitable for host start-up checks and telemetry |
| Catalog | `ModelCatalog` (bundled models.dev data plus refresh): `contextWindow`, `maxOutputTokens`, `reasoningLevels`, `Capabilities`, `Prices` | A cross-check for ASTROLABE profiles, not a replacement for them |
| Testing | `testing.FakeProvider/FakeServer/ScriptedReply`, and `Provider.transport(HttpTransport)` for injected transports | Recorded-protocol tests (ASTROLABE AX-01..10) can drive the *real* codecs |

**Build compatibility:** both projects use **JDK 26 toolchains and Kotlin 2.4.20**. ASTROLABE runs on the classpath, where the SDK's `META-INF/services` discovery works. The SDK's `module-info` does not get in the way.

---

## 4. Compatibility matrix (requirement by requirement)

Legend: ✅ available · 🔧 adapter work (no hacks) · ⚠️ works with a limitation or workaround until an SDK change · ❌ missing

| # | ASTROLABE requirement (source) | SDK support | Status |
|---|---|---|---|
| 1 | Real HTTP transport, TLS, gateways, base URLs, headers | `Provider`, `HttpOptions`, JDK transport, presets | ✅ |
| 2 | Credentials (API key, OAuth, per-tenant) | `ApiKeyAuth`, `OAuthAuth`, `CredentialStore`, `withCredentials` | ✅ |
| 3 | Multiple providers and models behind one adapter (routing) | One `Llm` holding many providers; `llm.model(provider, model)` | ✅ |
| 4 | Item model maps onto Anthropic blocks and OpenAI Responses items without loss (§15.1) | `Conversation` with reasoning, signatures and provider data kept | 🔧 regroup flat items into turns (§5.4) |
| 5 | Segment breakpoints S/R/K/T (≤ 4) | Explicit message-index breakpoints | 🔧 index mapping (§5.3) |
| 6 | Per-breakpoint cache class (5m versus 1h) | One `CacheRetention` per call | ⚠️ single TTL per call (SDK-4) |
| 7 | `json-schema-2020-12` tool schemas, masked but never removed | `FunctionTool` with `JsonSchema.of(obj)`; the mask is enforced locally | 🔧 kotlinx → SDK JSON conversion |
| 8 | Effort Minimal/Low/Medium/High | `ReasoningLevel` MINIMAL..HIGH, clamped per model | ✅ |
| 9 | `maxOutputTokens` is honoured exactly (admission reserves it) | `maxTokens`. Anthropic budget thinking **raises** `max_tokens` with only a warning, even under `strict` ([MessagesCodec.java:157](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/anthropic/internal/MessagesCodec.java:157)). | ⚠️ the adapter rejects on the `option_adapted` warning (SDK-8) |
| 10 | Never expose a half-generated tool call (AX-01) | `ChatStream.partial()` and `LlmException.partial()` include **in-progress** tool calls with synthetic IDs or arguments (`Accumulator.Part.content()`) | ⚠️ the adapter strips `ToolCall`s from partials (SDK-2) |
| 11 | Output-limit stop exposes no tool call (AX-03) | `StopReason.LENGTH` | 🔧 the adapter drops tool calls on `LENGTH` |
| 12 | Refusal (AX-04) | `StopReason.REFUSAL/CONTENT_FILTER`, `Content.Refusal`, `output_refused` | 🔧 mapping |
| 13 | Cancellation: `cancel()` → `Cancelled` response; `terminal()` completes exactly once with late output and usage (D-51, AX-08) | `CancelToken` aborts the call, and `RequestCancelledException.partial()` carries the content received. **The usage of a partial is always empty.** `completeAsync().cancel()` discards the eventual result. | ⚠️ implementable. Usage on cancellation becomes "unknown", so ASTROLABE charges its conservative estimate (SDK-1). |
| 14 | Missing usage is recorded as unknown, never zero (AX-09) | `Usage` fields are optional, **but** the Anthropic codec defaults missing cache counters to `0` ([MessagesCodec.java:353](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/anthropic/internal/MessagesCodec.java:353)) | 🔧 normalize from `raw()` (SDK-3 fix) |
| 15 | Cached-token normalization per provider, 5m/1h write classes (AX-10, §15.2) | Disjoint buckets but a single `cacheWrite`; `raw()` available | 🔧 ASTROLABE `UsageNormalizer` works from `raw()` (SDK-3) |
| 16 | Provider errors mapped to three retry semantics | `LlmException` codes, `retryable`, `outcomeUnknown`, internal safe retries | 🔧 mapping (§5.8) |
| 17 | Exact or margin-bounded admission count (I-17) | None; internal `chars/4` only | ⚠️ `HeuristicEstimator` plus `ContextAdmission`'s learned margin (SDK-5) |
| 18 | Capabilities probed, not inferred (§15.1) | Catalog levels and `Llm.test()`, which only checks access | ⚠️ declared in `Profile`; smoke-tested (SDK-6) |
| 19 | Continuation / expired continuation (AX-05) | Only `OpenAiResponsesOptions.previousResponseId/store`, and the codec still sends the full input | ❌ declare `continuation = false` (SDK-7) |
| 20 | Native compaction (AX-06) | None | ❌ declare `nativeCompaction = false` (SDK-7) |
| 21 | Model-family change: explicit handoff, opaque reasoning not replayed (AX-07) | `Handoff` with `ReasoningHandoff.DROP` | ✅ with DROP, or rejected in `validate()` by policy |
| 22 | Hosted tools enter the evidence pipeline | `ProviderTool` exists; ASTROLABE's `Request` has no hosted-tool concept | ❌ out of scope for now (`hostedExecution = false`) |
| 23 | Dated price tables | ASTROLABE owns `PriceTable`; SDK `Prices` has one cache-write price | ✅ (ASTROLABE side) |
| 24 | Recorded protocol fixtures for AX-01..10 | `Provider.transport(HttpTransport)` + real codecs; `FakeProvider` | ✅ |
| 25 | Kotlin/coroutines host, Java hosts too | Blocking Java API; `JavaProviderAdapter` bridge exists | ✅ via a virtual thread per invocation |

Nothing is **fundamentally incompatible**. The genuine mismatches are representational: flat items versus turns, two JSON libraries, one cache-write bucket versus two, and futures versus a terminal-reconciled handle. All of them resolve inside an adapter. The items marked ⚠️ and ❌ are the SDK extensions listed in §8.

---

## 5. How to integrate

### 5.1 Module and build layout

Add one new ASTROLABE module. `core` and `provider-api` stay free of any SDK dependency, which preserves `provider-api`'s rule that it does no networking and never depends on core.

```
ASTROLABE/
  provider-api/        (unchanged)
  core/                (tiny changes, §7)
  provider-gate/       NEW: io.astrolabe.provider.gate — ProviderAdapter over net.ai.gate
```

`settings.gradle.kts`:

```kotlin
includeBuild("../llm-transport-sdk/llm")      // composite build; substitutes net.ai.gate:ai-gate
include(":provider-api", ":core", ":eval", ":index-treesitter", ":provider-gate")
```

`provider-gate/build.gradle.kts`:

```kotlin
plugins { id("astrolabe.kotlin-library") }
description = "ASTROLABE provider adapter over AI Gate (llm-transport-sdk): HTTP, auth, streaming, codecs."
dependencies {
    api(project(":provider-api"))
    api("net.ai.gate:ai-gate:0.1.0-SNAPSHOT")   // group/name come from the SDK build (group = net.ai.gate, rootProject = ai-gate)
    implementation(libs.kotlinx.coroutines.core)
    testImplementation(testFixtures(project(":core")))
    testImplementation(libs.kotlinx.coroutines.test)
}
```

Notes:

- The composite build works as is. The SDK project's `group`/`name` resolve to `net.ai.gate:ai-gate`, and both builds pin Kotlin 2.4.20, so plugin versions do not clash. The SDK's JSpecify and JetBrains annotations are `compileOnlyApi`, so they reach the Kotlin compiler for nullness.
- To consume the SDK as a real third-party artifact instead, add `maven-publish` to the SDK (SDK-11). ASTROLABE then uses `mavenLocal()` or a repository. `FAIL_ON_PROJECT_REPOS` means the repository goes into `settings.gradle.kts`.
- ASTROLABE's convention plugin enables `explicitApi()` and ABI validation, so the new module needs an API dump.

### 5.2 Runtime ownership and configuration

```kotlin
// Host (CLI / service) — once per process
val llm = Llm.builder()
    .apply { ProvidersConfig.read(Files.readString(cfg), Providers.presets()).forEach { provider(it) } } // gateways, secret-free
    .credentials(CredentialStore.file(home.resolve("credentials.json")))          // or inMemory()/env
    .defaults { it.strict() }                                                      // soft adaptations fail, never silently change a request
    .build()
val adapter = GateAdapter(llm)                        // ProviderAdapter
val astrolabe = Astrolabe(config.withProfiles(profiles), adapter, authority)
```

- The **adapter borrows** the `Llm`, and the host closes it after `Astrolabe.close()`.
- **Profiles remain ASTROLABE's source of truth** for limits, capabilities and prices. `Profile.provider` is the SDK provider ID and `Profile.model` is the SDK model ID. `Profile.config` holds adapter settings. A suggested schema:

```json
{ "gate": { "api": "anthropic-messages",       // optional: WireApi id; default = provider default
            "cacheRetention": "short",          // none | short | long
            "sessionId": "astrolabe-{profile}", // OpenAI prompt_cache_key / routing affinity
            "reasoningHandoff": "drop",
            "parallelToolCalls": true,
            "timeouts": { "total": "PT15M", "idle": "PT2M" },
            "retry": { "maxAttempts": 3 } } }
```

- At adapter start-up, **cross-check** each profile against `llm.models()`. Fail or warn when `Profile.capabilities.contextLimitTokens` exceeds the catalog `contextWindow`, or `outputLimitTokens` exceeds `maxOutputTokens`, or when the model's `Capability.TOOLS` is `UNSUPPORTED`. Run `llm.test(model)` as a non-billable connectivity and authentication check.

### 5.3 Request translation: `Request` → `Conversation` + `ChatOptions`

| ASTROLABE | SDK |
|---|---|
| Segment `S` (one `System` message) | `Conversation.system(text)`; breakpoint index `0` (marks the end of tools and system) |
| Segment `R` (one `User` message) | `UserMessage`; breakpoint after it |
| Segment `K` (one `User` message) | `UserMessage`; breakpoint after it |
| Segment `T`: pinned `User` messages + transcript items | Turn-grouped messages (§5.4); breakpoint after the last one |
| Segment `A` (one `User` message, no breakpoint) | Trailing `UserMessage` |
| `segment.breakpoint` | `Conversation.withMessages(messages, breakpoints)`, where each breakpoint is the number of messages emitted before that segment's end. S, R, K and T give exactly 4 markers, which is the Anthropic maximum. |
| `tools: List<ToolSchema>` | `Tool.function(name).description(d).parameters(JsonSchema.of(toGate(jsonSchema))).build()`. `strict` stays off, because ASTROLABE schemas have optional fields. |
| `mask` | Not sent. The schema list stays stable for cache reuse, `[S]` states the enabled ops, and the executor enforces the mask. |
| `effort` | `ChatOptions.reasoning(ReasoningLevel.valueOf(effort.name.uppercase()))` |
| `maxOutputTokens` | `ChatOptions.maxTokens(n)`. `validate()` rejects if the preview raises it (row 9). |
| `profile` | `llm.model(profile.provider, profile.model)`; `api` from `config.gate.api` |
| `continuation` | Must be `null` (capability `false`) |
| JSON | `net.ai.gate.json.Json.parse(kotlinxJson.toString())`, and back with `JsonValue.toJson()` → `Json.parseToJsonElement`. This costs one string round-trip per schema or payload and is cheap enough. Cache the converted tool list per `SchemaSet` digest. |

Anthropic merges consecutive user turns, so R, K, pinned messages, tool results and A may all be sent as separate `UserMessage`s. OpenAI Responses and Gemini accept them as a flat list.

### 5.4 History translation: flat items → SDK turns

Walk the T items in order:

- `Message(User)` → `UserMessage(text parts)`.
- A run of **assistant-side** items (`Message(Assistant)`, `ReasoningRef`, `ToolCall`) → one `AssistantMessage`, with content in the original order. Order matters: Gemini thought signatures are positional, and Anthropic thinking blocks precede `tool_use`.
- A run of `ToolResult`s → one `ToolResultMessage`. `ToolResult.of(call, text)` or `ToolResult.error(call, text)` uses the matching `ToolCall` found by `callId`. `Items.pairs()` already guarantees that the call exists.
- `Message(System)` inside T, or `Opaque` parts → `Validation.Rejected(InvalidRequest)`. Core never produces them today.

**Origin and provenance.** The SDK decides whether to replay natively by comparing `AssistantMessage.model()` and `api()` with the target. ASTROLABE items do not record origin. The clean rule:

- On output, every SDK `Content.Reasoning` becomes `ReasoningRef(providerTag = "<provider>/<model>@<api>", opaque = {text, signature, redacted, providerData}, native = null)`.
- On input, an assistant group takes its origin from the `ReasoningRef` tag inside it. With no reasoning in the group, it uses a neutral origin such as `ModelRef("astrolabe","history")`, `api = "astrolabe"`. For such groups the SDK only normalizes tool-call IDs and remaps the results consistently. Text and tool calls stay lossless.
- **Do not store provenance or the raw reply in `Item.native`**. Any non-null `native` makes the item's size unknown ([Estimate.kt:92](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Estimate.kt:92)), and `ContextAdmission` then refuses the next request. The full native reply is persisted anyway by `Cell.journalOutput`. It can also be returned as `UsageItem.native`, which is never replayed and costs zero in the estimate.

Adjacent assistant turns (for example `EndTurn` text followed by the next turn's text) merge into one `AssistantMessage`. This is equivalent to what the Anthropic API does with consecutive assistant turns, and a flat item list is native for OpenAI Responses. The grouping is also split whenever the origin tag changes.

### 5.5 Response translation: `AssistantMessage` → `Response`

| SDK content | ASTROLABE item |
|---|---|
| `Text` | `Message(Assistant, [Text])` (merge adjacent text parts) |
| `Reasoning` | `ReasoningRef(tag, opaque)` as above |
| `ToolCall` | `ToolCall(id, name, argumentsJson)` |
| `Refusal` | `Message(Assistant, text)` plus `StopReason.Refusal` |
| `Unknown` / generated media | Keep in the journal; not replayed (ASTROLABE has no hosted/media contract yet) |
| `usage` | `Response.usage = normalizer.normalize(raw, profile)` (§5.7) |

| SDK `StopReason` | ASTROLABE `StopReason` | Rule |
|---|---|---|
| `TOOL_USE` (with calls) | `ToolUse` | |
| `STOP` | `EndTurn` (or `ToolUse` if calls are present, since some APIs report stop together with calls) | |
| `LENGTH` | `OutputLimit` | **Drop all `ToolCall`s** (AX-03). Core would otherwise execute them. |
| `REFUSAL`, `CONTENT_FILTER` | `Refusal` | Drop tool calls |
| `ABORTED` | `Cancelled` if `cancel()` was requested, else `Truncated` | Text only |
| `ERROR`, unknown raw value | `Truncated` | Text only, fail-safe |

### 5.6 Invocation and cancellation (the D-51 state machine)

Use `llm.stream(...)`. It surfaces partial text and first-output timing, and the stream is never retried after its first event. Run it on a **virtual thread per invocation** and drive cancellation through a `CancelToken`, **never** by cancelling a `CompletableFuture`. `DefaultLlm.completeAsync` completes a cancelled future with `CancellationException`, and the worker's later result, partial output and facts are discarded ([DefaultLlm.java:84-106](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/DefaultLlm.java:84)).

```kotlin
internal class GateInvocation(
    override val id: InvocationId,
    private val llm: Llm, private val model: Model, private val conversation: Conversation,
    private val options: ChatOptions, private val translate: ResponseTranslator,
) : Invocation {
    private val token = CancelToken.create()
    private val response = CompletableDeferred<Response>()
    private val terminal = CompletableDeferred<Terminal>()
    @Volatile override var state = InvocationState.Requested; private set

    init { Thread.ofVirtual().name("astrolabe-${id.value}").start(::run) }

    private fun run() {
        val result: Terminal = try {
            llm.stream(model, conversation, options.toBuilder().cancel(token).tag("invocation", id.value).build()).use { s ->
                val r = translate.response(s.result())                   // blocks; aggregates; stop mapping, tool-call stripping
                Terminal(id, r, null, emptyList(), r.usage, cancelled = false)
            }
        } catch (e: RequestCancelledException) {
            val late = translate.textOnly(e.partial().orElse(null))      // never a ToolCall
            Terminal(id, Response(emptyList(), StopReason.Cancelled), null, late,
                     translate.usageOrMissing(e.partial().orElse(null)), cancelled = true)
        } catch (e: LlmException) {
            translate.error(id, e)                                       // §5.8; STREAM_INTERRUPTED → Truncated response
        }
        state = InvocationState.ProviderAcknowledged
        result.response?.let(response::complete) ?: response.completeExceptionally(result.error!!)
        terminal.complete(result); state = InvocationState.TerminalReconciled
    }

    override suspend fun await(): Response = try { response.await() } catch (c: CancellationException) { cancel(); throw c }
    override fun cancel() { if (state == InvocationState.Requested) state = InvocationState.CancelRequested; token.cancel() }
    override suspend fun terminal(): Terminal = terminal.await()
}
```

Important details:

- **`terminal()` completes exactly once** on every path. Core awaits it under `NonCancellable`.
- On cancellation, `RequestCancelledException.outcomeUnknown()` tells whether the request had already left, so it may be billed. The SDK does not keep usage for partial replies (§8, SDK-1). The adapter therefore returns `BillableUsage.missing(provenance, expectedDimensions)`, and ASTROLABE charges `max(estimate, admission)` ([Cell.kt:369-376](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Cell.kt:369)). That is correct and conservative, but not exact.
- ASTROLABE's `InvocationId` is sent as a call tag, so SDK events, logs and JFR records correlate with ASTROLABE's journal.
- A `JavaProviderAdapter` implementation is equally possible, since both SDK and adapter would then be Java. For a Kotlin host, implementing `ProviderAdapter` directly avoids an extra bridge.

### 5.7 Usage normalization (`UsageNormalizer`)

ASTROLABE requires per-provider mappings and 5m/1h cache-write classes. The SDK's `Usage` has one `cacheWrite`. **Use `Usage.raw()`**, which holds the provider's own usage object. It is merged across `message_start` and `message_delta` for Anthropic streams.

| Wire API (`usage.raw`) | `uncached_input` | `cache_read` | `cache_write_5m` / `_1h` | `output` | Notes |
|---|---|---|---|---|---|
| `anthropic-messages` | `input_tokens` | `cache_read_input_tokens` | `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`. If only `cache_creation_input_tokens` is present, attribute it to the requested TTL class, or mark the split unknown. | `output_tokens` (thinking included) | Missing fields go into `unknown`, never 0 |
| `openai-responses` | `input_tokens − cached_tokens − cache_write_tokens` | `input_tokens_details.cached_tokens` | `cache_write_tokens` if reported | `output_tokens` (reasoning included; `reasoningIncludedInOutput = true`) | |
| `openai-completions` | `prompt_tokens − cached_tokens` | `prompt_tokens_details.cached_tokens` | n/a | `completion_tokens` | Gateways often omit details: mark `cache_read` unknown |
| `google-generate-content` | `promptTokenCount − cachedContentTokenCount + toolUsePromptTokenCount` | `cachedContentTokenCount` | n/a (explicit caches billed separately) | `candidatesTokenCount + thoughtsTokenCount` | |

Provenance is `UsageProvenance(profile.provider, reply.responseModel ?: profile.model, api)`. When `Usage.spent == false` (a response-cache replay), treat the usage as zero billed. Better still, **do not configure the SDK response cache** for agent runs, because ASTROLABE decides replay itself. Also include `ResponseInfo.attempts` in the journal.

### 5.8 Error mapping (`LlmException` → `ProviderError`)

| SDK code(s) | ASTROLABE | Notes |
|---|---|---|
| `rate_limited`, `quota_exhausted`, `overloaded` | `ProviderError.RateLimit(retryAfterSeconds = details.retryAfter)` | Only after the SDK's own safe retries |
| `context_overflow`, `request_too_large` | `InvalidRequest` today → **new `ProviderError.ContextOverflow`** (§7, A2) | Lets core rebuild instead of failing the cell |
| `invalid_request`, `model_not_found`, `unsupported_feature` | `InvalidRequest`, or `UnsupportedSchema` when the rejection concerns tools or schemas | |
| `invalid_credentials`, `login_required`, `refresh_failed`, `permission_denied`, `credential_store` | `Transport` today → **new `ProviderError.Authentication`** (A2) | This condition should block the campaign, not be retried as a transport error |
| `output_refused` | `Refusal` | |
| `output_truncated` | `OutputLimit` | |
| `stream_interrupted` | **Response `Truncated`**, with text-only partial | AX-01 |
| `cancelled` | Response `Cancelled` plus `Terminal(cancelled = true)` | §5.6 |
| `connect_failed`, `server_error`, `outcome_unknown`, `deadline_exceeded`, `stream_idle_timeout`, `malformed_response` | `Transport` | Record `outcomeUnknown` so usage stays unknown, not zero |

Retry ownership: transport retries stay in the SDK (`RetryPolicy`), and ASTROLABE does not add a second provider-retry loop. Tool failures and verification failures stay in ASTROLABE. This matches the three-semantics rule.

### 5.9 `capabilities()` and `validate()`

`capabilities(profile)` returns `profile.capabilities`, the declared and probed values, after a one-time sanity cross-check against the SDK catalog. Recommended declarations for the first release:
`continuation = false`, `nativeCompaction = false`, `hostedExecution = false`, `cancellation = true` (local abort only), `schemaDialects = {json-schema-2020-12}`, and `caching.maxBreakpoints = 4` for Anthropic. For OpenAI, set `caching.breakpoints = false`, which needs change A3 (§7).

`validate(request, estimate)`:

1. `Validations.standard(request, estimate, capabilities)`.
2. Translate the request and call `llm.preview(model, conversation, options.strict())`. A **rejected** `PreparedRequest` becomes `InvalidRequest`. Selected **warnings** become problems too: `option_adapted` on `max_tokens`, `cache_hint_ignored` (breakpoints the endpoint cannot honour) and `reasoning_dropped` when the policy forbids cross-family reasoning (AX-07). Preview needs no network and no credentials.
3. Reject a `ReasoningRef` whose tag belongs to another model family unless the profile allows handoff. This matches `FakeAdapter`'s AX-07 rule.

### 5.10 Token estimation and admission

The SDK has **no token counting**. Its only estimator is internal and uses `chars/4` ([Resolver.java:74](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/Resolver.java:74)). ASTROLABE's existing path is adequate for a first release:

- The `HeuristicEstimator` (bytes/3.6 plus symbols, 10 % margin) and `ContextAdmission`'s **learned margin**, which widens after a provider rejection or an observed under-estimate, work unchanged. **The adapter must leave `native` null** (§5.4) so that estimates stay known.
- With the rebuild path fixed (A2), a provider-side `context_overflow` feeds `ContextAdmission.rejected()` like a validation overflow does.
- For exact admission, add SDK-5 (`countTokens`) and a `ProfileEstimator` in the adapter. That also needs A1, because the estimator is currently hard-coded.

### 5.11 Testing the adapter

- **Recorded protocol fixtures (AX-01..10):** build `Provider`s from the real presets with `.toBuilder().transport(RecordedTransport(...))`. This `HttpTransport` SPI returns recorded JSON and SSE bytes, so the **real** Anthropic, OpenAI and Gemini codecs run, with no network involved. Required cases: an interrupted tool-call stream, multiple tool-result pairing, a `LENGTH` stop with a pending tool call, a refusal, cancellation with late output, missing usage, cache-token normalization for each provider, and a model-family switch.
- **Loop-level tests:** `net.ai.gate.testing.FakeProvider` with `ScriptedReply` behind a real `Llm`, driving an ASTROLABE cell through the new adapter. This is the same fixture style as `FakeAdapter`, but it exercises the real translation.
- **Live smoke:** an authorized smoke campaign, as ASTROLABE §15.4 requires. The SDK has a `liveTest` task pattern that can be mirrored.

---

## 6. Effort estimate

| Work item | Size |
|---|---|
| `provider-gate` module: request and history translation, response mapping, invocation, error mapping, validate/preview | ~800–1,100 LOC Kotlin |
| Usage normalizers (4 wire APIs) | ~200 LOC |
| Profile config parsing plus catalog cross-check | ~150 LOC |
| Tests: recorded fixtures for AX-01..10, loop tests with `FakeProvider` | ~800+ LOC |
| ASTROLABE core changes A1–A4 (§7) | small, < 150 LOC |
| SDK changes (§8) | See the per-item sizes. None blocks a first integration. |

---

## 7. Changes needed in ASTROLABE (small, contract-level)

| ID | Change | Why |
|---|---|---|
| **A1** | Make the estimator injectable: `Astrolabe(..., estimator: (Profile) -> TokenEstimator = { HeuristicEstimator() })`, or add a `ProviderAdapter.estimator(profile)` with a default. | [Astrolabe.kt:101](ASTROLABE/core/src/main/kotlin/io/astrolabe/Astrolabe.kt:101) hard-codes `HeuristicEstimator()`, so no provider-aware or exact estimator (SDK-5) can reach admission. `Controller` already passes `model.estimator` through ([Controller.kt:1263](ASTROLABE/core/src/main/kotlin/io/astrolabe/campaign/Controller.kt:1263)). |
| **A2** | Add `ProviderError.ContextOverflow` and `ProviderError.Authentication`. In `Cell`, treat `ContextOverflow` like a validation overflow (`contextAdmission.rejected(estimate)`, then rebuild), and treat `Authentication` as blocked. | A real provider can still reject on size after a heuristic admission. Today any `ProviderError` fails the cell ([Cell.kt:387](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Cell.kt:387)). |
| **A3** | Emit segment breakpoints only when `capabilities.caching.breakpoints` is true, or let the adapter ignore them "by policy" as `Segment`'s KDoc already allows. | `Validations.standard` rejects any breakpoint when `caching.breakpoints == false`, while `Layout` always sets them. Providers with automatic caching (OpenAI, Gemini implicit, most gateways) would otherwise be refused, or would have to over-declare breakpoint support. |
| **A4** | Document the provenance convention `ReasoningRef.providerTag = "<provider>/<model>@<api>"`, and state that adapters must not put replay data in `Item.native`, or give `native` metadata an estimate path. | Keeps estimates known (§5.4) while preserving native replay |
| A5 (policy) | Residency or eviction must not remove a `ReasoningRef` that belongs to the **current** tool loop while keeping its `ToolCall`s. | Anthropic extended thinking with tool use and Gemini thought signatures require the reasoning part to be replayed with its tool calls. Older turns are safe to stub. |
| A6 (host) | A host (CLI) that builds the `Llm`, loads `ProvidersConfig` and `CredentialStore`, and passes the adapter and profiles | The P7 "Hosts" item; the SDK supplies all the building blocks |

---

## 8. What to change in `llm-transport-sdk` so ASTROLABE fits without tricks

### 8.1 Is it possible without hacks?

**Yes.** Every gap below is an **additive, backward-compatible** extension that follows the SDK's existing design: sealed events, optional `Usage` fields, `ProviderOptions`, `WireApi` metadata and the `@ApiStatus.Experimental` marker for layer-3 APIs. None of them requires ASTROLABE-specific code in the SDK. They are general coding-agent needs: exact accounting, safe cancellation, admission and cache control.

Until they land, the adapter uses these **documented workarounds**:

| Workaround in the adapter | Replaced by |
|---|---|
| Treat usage of cancelled or interrupted calls as `missing` and charge the estimate | SDK-1 |
| Strip `ToolCall`s from `partial()` because in-progress calls look complete | SDK-2 |
| Parse `Usage.raw()` per wire API for cache-write classes, and ignore the codec's `0` defaults | SDK-3 |
| One cache TTL per call | SDK-4 |
| Heuristic admission only | SDK-5 |
| Hand-declared capabilities | SDK-6 |
| Continuation and compaction disabled | SDK-7 |
| Scan preview warnings for `option_adapted`/`cache_hint_ignored` | SDK-8 |
| Placeholder `ToolCall` lookup to build a `ToolResult` from a call ID | SDK-9 |

### 8.2 Prioritized SDK change list

| ID | Priority | Change | Size |
|---|---|---|---|
| SDK-1 | **High** | Keep usage on partial replies and give callers a terminal-reconciled call handle | M |
| SDK-2 | **High** | Mark incomplete parts in partial replies | S |
| SDK-3 | **High** | Cache-write classes in `Usage` and `Prices`; never default missing counters to 0 | S–M |
| SDK-4 | Medium | Per-breakpoint cache retention and cache constraints metadata | M |
| SDK-5 | Medium | Token counting API | M |
| SDK-6 | Medium | Wire-API feature descriptor and an optional capability probe | M |
| SDK-7 | Medium/Low | First-class server-side continuation (and later compaction) | L |
| SDK-8 | Medium | Make billing- and limit-changing adaptations fail under `strict` | S |
| SDK-9 | Low | `ToolResult` factory from `(callId, toolName)` | XS |
| SDK-10 | Low | Distinguish provider-side cancellation facts | S |
| SDK-11 | Low | Publish the artifact | XS |

### 8.3 SDK-1: usage on partial replies and a terminal-reconciled call handle

**Problem.** A coding agent must account for every call it started, including cancelled and interrupted ones:

- `Accumulator.snapshot()` builds partial replies **without usage** ([Accumulator.java:85](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/Accumulator.java:85)).
- The Anthropic stream decoder keeps `message_start` usage in a local variable and emits it only in `Done` ([MessagesCodec.java:374](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/anthropic/internal/MessagesCodec.java:374)). Input tokens that are known early are therefore lost on interruption or cancellation.
- `completeAsync().cancel()` discards the eventual result.

**Proposal.**

1. Add `ChatEvent.UsageUpdate(Usage soFar)`. Decoders emit it whenever the wire reports usage (Anthropic `message_start`/`message_delta`, OpenAI `response.created`/`in_progress` where available). The `Accumulator` keeps the latest value, and `snapshot()` or `partial()` carries it. `LlmException.partial().usage()` is then populated, with unknown buckets left absent.
2. Add a handle API (experimental):

```java
/// One started call; never loses its outcome. `result()` fails or completes; `cancel()` requests an abort;
/// `outcome()` always completes exactly once, after the call is fully settled.
interface Call {
    String requestId();
    CompletableFuture<AssistantMessage> result();   // cancelling this future does NOT discard outcome()
    void cancel();
    CompletableFuture<CallOutcome> outcome();
}
record CallOutcome(@Nullable AssistantMessage reply, @Nullable LlmException error, AssistantMessage partial,
                   Usage usage, boolean cancelled, boolean outcomeUnknown, int attempts) { }
// Llm: Call start(Model, Conversation, ChatOptions);   // streams internally, returns immediately
```

With this, ASTROLABE's `Invocation` becomes a thin wrapper, and AX-08 and AX-09 become exact.

### 8.4 SDK-2: mark incomplete parts in partial replies

**Problem.** `Accumulator.Part.content()` turns an unfinished tool call into `ToolCall.of("call_unknown", "unknown", partialArgs)`. That value is indistinguishable from a real call. A host that appends `e.partial()` to a conversation (the documented pattern: "appendable") could execute or replay a half-generated call.

**Proposal.** Add `AssistantMessage.incompleteParts()` (indices), or a `Content.Incomplete(Content partial)` wrapper. `partial()` would expose only completed parts in `content()` and the in-progress parts separately. Encoders would never replay incomplete parts.

### 8.5 SDK-3: cache-write classes and truthful counters

**Problem.** Anthropic bills 5-minute and 1-hour cache writes at different rates, and ASTROLABE prices them as separate dimensions (§15.2, I-16). `Usage` has a single `cacheWrite`, and `Prices` a single `cacheWritePerMillion`, so `Usage.cost()` cannot be exact for 1h writes. The Anthropic codec also reports a missing `cache_read_input_tokens`/`cache_creation_input_tokens` as `0` ([MessagesCodec.java:353](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/anthropic/internal/MessagesCodec.java:353)). That contradicts the SDK's own rule that absent means "not reported", and matters for OpenAI-compatible or Anthropic-compatible gateways that strip those fields.

**Proposal.**

- Add `Usage.cacheWrites(): Map<CacheRetention, Long>` (or `cacheWriteShort()`/`cacheWriteLong()`). Keep `cacheWrite()` as their sum.
- Add `Prices.cacheWriteLongPerMillion` and use it in `cost()`.
- Map `cache_creation.ephemeral_5m_input_tokens`/`ephemeral_1h_input_tokens` in the Anthropic codec.
- Use `ifPresent` instead of `orElse(0)` for cache counters in every codec, and do the same audit for the Responses and Gemini `orElse(0)` uses.

### 8.6 SDK-4: per-breakpoint cache retention and cache constraints

**Problem.** Breakpoints are plain message indices, and retention is a single per-call value (`CacheRetention`). A coding agent wants long-lived caching of stable prefixes (`[S][R]`, reused across cells) and short-lived caching of the growing transcript. It also needs to know the endpoint's marker limit (4 for Anthropic) and minimum cacheable size, to plan layout and admission. Finally, `cache_hint_ignored` is a warning even under `strict`.

**Proposal.**

- Add `Conversation.Builder.cacheBreakpoint(CacheRetention)` and `List<CacheBreakpoint> cacheBreakpoints()`, where `record CacheBreakpoint(int index, @Nullable CacheRetention retention)`. Keep the existing int form as a convenience. The Anthropic codec emits `ttl` per marker, respecting Anthropic's rule that longer TTLs must come before shorter ones.
- Add `WireApi.cacheFeatures(Model)`, returning `(explicitMarkers: boolean, maxMarkers, minimumPrefixTokens, retentions: Set<CacheRetention>, automatic: boolean)`. This feeds ASTROLABE's `CacheCapability` directly (see SDK-6).

### 8.7 SDK-5: token counting

**Problem.** ASTROLABE admission wants exact counts or declared margins (I-17). The SDK has only an internal `chars/4`, and a generic heuristic over-reserves on large coding contexts.

**Proposal (experimental, layer 3 or core):**

```java
record TokenCount(long inputTokens, boolean exact, String method) { }   // method: "provider-endpoint" | "local-tokenizer" | "estimate"
TokenCount countTokens(Model model, Conversation conversation, ChatOptions options);   // on Llm
```

Implement it with the provider endpoints: Anthropic `POST /v1/messages/count_tokens` (free), OpenAI `POST /v1/responses/input_tokens`, and Gemini `models/*:countTokens`. The request is encoded exactly as `complete()` would encode it, so tools, system and reasoning items are counted in their wire form. Add an optional `Tokenizer` SPI for local counting (for example, a host-supplied jtokkit, which ASTROLABE already pins in its version catalog), and fall back to the estimate with `exact = false`. ASTROLABE then implements a profile estimator: `exact` when the endpoint answers, and `HeuristicEstimator` with a margin otherwise.

### 8.8 SDK-6: wire-API feature descriptor and optional probe

**Problem.** ASTROLABE's `Capabilities` needs facts the catalog does not hold: explicit versus automatic caching, marker limits, reported usage fields, whether parallel tool calls can be disabled, continuation support, cancellation semantics (local abort only), supported JSON-schema subset or strict mode, and hosted tools. Today the adapter must hard-code these per API. ASTROLABE also forbids inferring capabilities from an API-shaped URL: *probing* is required for gateways.

**Proposal.**

- Add `WireApi.features(Model, ApiCompat)` → an immutable `ApiFeatures` value with the fields above. Codecs know these facts already; `AnthropicCompat.cacheTtl` and `betaHeaders` are examples.
- Extend `Llm.test(model, opts)` with **opt-in, billable** probes:
  - a minimal tool-call round trip (tools supported and IDs returned);
  - a prompt-cache round trip (cache read reported on the second call);
  - a usage-fields check (which counters the endpoint actually returns).
  
  Results go into `ConnectionReport`, and ASTROLABE records them as its profile's probed capabilities.

### 8.9 SDK-7: first-class continuation (later: compaction)

**Problem.** `previous_response_id` and `store` exist only as `OpenAiResponsesOptions`, and the codec still sends the complete `input` ([ResponsesCodec.java:150](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/openai/internal/ResponsesCodec.java:150)). Using it correctly would require the host to trim the conversation itself, which is a trick. Continuation expiry is not a distinct error, and there is no native compaction support.

**Proposal.**

- `AssistantMessage.continuation(): Optional<Continuation>` (provider, API, opaque ID, expiry, effective history tokens where reported).
- `ChatOptions.continueFrom(Continuation)`: the codec sends only the messages after the continued reply.
- A new `ErrorCode.CONTINUATION_EXPIRED`.
- Later, `Llm.compact(model, conversation)`, or compaction as a provider API returning an opaque continuation plus its effective size.

These map onto ASTROLABE's `OpaqueContinuation(effectiveHistoryTokens)` and AX-05/AX-06. This is not needed for a first integration.

### 8.10 SDK-8: `strict` should cover billing- and limit-changing adaptations

**Problem.** Some changes that alter cost or limits are only `warn`, even under `strict()`:

- Budget thinking raises `max_tokens` above the caller's value ([MessagesCodec.java:155-160](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/anthropic/internal/MessagesCodec.java:155)).
- Excess cache markers are dropped.
- An unsupported cache TTL falls back.

ASTROLABE reserves exactly `maxOutputTokens` for admission and budget.

**Proposal.** Classify these as `adapt` (fail under strict). Alternatively, add `ChatOptions.strictCodes(Set<String>)` so a host can choose which warnings are fatal. Also expose the *effective* `max_tokens` in `PreparedRequest`.

### 8.11 SDK-9, SDK-10, SDK-11: small items

- **SDK-9:** add `ToolResult.of(String callId, String toolName, List<Content> parts, boolean isError)`. A host that persists history as items (not SDK objects) currently has to find or rebuild the `ToolCall` object, and `isError` with non-text parts is not constructible.
- **SDK-10:** add `CallOutcome`/`LlmException` facts that separate "cancelled before send", "cancelled after send" (possibly billed, which `outcomeUnknown` already covers) and "provider acknowledged a stop". ASTROLABE's D-51 distinguishes `CancelRequested` from `ProviderAcknowledged`.
- **SDK-11:** add `maven-publish` (group `net.ai.gate`, artifact `ai-gate`, sources and javadoc already configured). ASTROLABE can then consume a versioned binary as a normal third-party dependency instead of a composite build.

### 8.12 What should *not* go into the SDK

These remain ASTROLABE responsibilities:

- the coding loop;
- tool execution and masks;
- context layout and eviction;
- admission policy;
- dated price tables and campaign budgets;
- evidence and journals.

These are agent semantics. The SDK stays a portable transport, and it already follows that rule: "the SDK transports calls; it never executes them".

---

## 9. Recommended implementation sequence

1. **Build wiring:** add the composite build, the `:provider-gate` module and the API dump. Compile against `net.ai.gate`.
2. **Deterministic translation with unit tests:** Request → Conversation, including the breakpoint index mapping, turn grouping, provenance tags and JSON conversion. Also AssistantMessage → Response, covering stop mapping and tool-call stripping.
3. **Invocation and error mapping:** the virtual-thread and `CancelToken` state machine, with tests using `FakeProvider` for cancellation races, late output and interrupted streams.
4. **Usage normalizers** from `Usage.raw()` for the four wire APIs, with recorded fixtures (AX-09, AX-10).
5. **ASTROLABE changes A1–A3**, then run the existing core suites against both `FakeAdapter` and the new adapter backed by `FakeProvider`.
6. **Recorded protocol fixtures** for AX-01..10 through `Provider.transport(HttpTransport)` and the real codecs.
7. **One live profile:** for example `anthropic`/`claude-*` over `anthropic-messages`, with text plus local tools, `strict`, and continuation and compaction off. Run `llm.test` and then an authorized smoke campaign.
8. **Broaden** to OpenAI Responses, OpenAI-compatible gateways (with probed capabilities) and Gemini.
9. **Adopt SDK extensions** as they land: SDK-1/2/3, then 4/5/8, then 6/7. At each step, remove the matching adapter workaround (§8.1) and enable the matching ASTROLABE capability (exact admission, continuation).

---

## 10. Risks and open points

- **Gateway parity:** an OpenAI-compatible gateway may accept the request shape but drop cache fields, usage details or parallel tool calls. Treat every gateway profile as unverified until it has been probed, which ASTROLABE §15.1 already requires. SDK-6 automates the probe.
- **Heuristic admission on dense code** can over- or under-count. The learned margin corrects under-counts after a rejection. A2 makes that recovery a rebuild rather than a failed cell. SDK-5 removes the risk.
- **Cost exactness** for cancelled or interrupted calls, and for Anthropic 1h cache writes, is conservative rather than exact until SDK-1 and SDK-3 land.
- **Reasoning replay:** the provenance tags (§5.4) and eviction policy A5 must be followed. Otherwise Anthropic thinking with tool use, or Gemini function calls, will be rejected by the provider on the next turn.
- **Two JSON stacks:** the kotlinx ↔ `net.ai.gate.json` string round-trip is correct but duplicates work on large requests. Cache the converted tool schemas and the stable S/R/K segments per digest.

---

## 11. Source index

**ASTROLABE**
- Contract: [ProviderAdapter.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/ProviderAdapter.kt), [JavaProviderAdapter.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/JavaProviderAdapter.kt), [Request.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Request.kt), [Item.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Item.kt), [Capabilities.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Capabilities.kt), [Usage.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Usage.kt), [Estimate.kt](ASTROLABE/provider-api/src/main/kotlin/io/astrolabe/provider/Estimate.kt)
- Call path: [Cell.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Cell.kt), [Layout.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/Layout.kt), [ContextAdmission.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/context/ContextAdmission.kt), [ToolSchemas.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/tool/ToolSchemas.kt), [CellContext.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/cell/CellContext.kt), [Astrolabe.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/Astrolabe.kt), [AstrolabeJava.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/java/AstrolabeJava.kt), [HeuristicEstimator.kt](ASTROLABE/core/src/main/kotlin/io/astrolabe/budget/HeuristicEstimator.kt)
- Stubs: [FakeAdapter.kt](ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/FakeAdapter.kt), [ScriptedModel.kt](ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/ScriptedModel.kt), [FakeProfiles.kt](ASTROLABE/core/src/testFixtures/kotlin/io/astrolabe/fixtures/FakeProfiles.kt)
- Spec and plan: [adapters.md §15](ASTROLABE/docs/platform/adapters.md), [TODO.md §P7 and the AX fixture map](ASTROLABE/TODO.md)

**llm-transport-sdk (AI Gate)**
- API: [Llm.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/Llm.java), [Provider.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/Provider.java), [Conversation.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/Conversation.java), [AssistantMessage.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/AssistantMessage.java), [Content.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/content/Content.java), [ChatOptions.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/options/ChatOptions.java), [ChatStream.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/stream/ChatStream.java), [ChatEvent.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/chat/stream/ChatEvent.java), [Usage.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/metadata/Usage.java), [LlmException.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/error/LlmException.java), [ErrorCode.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/error/ErrorCode.java), [CancelToken.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/lifecycle/CancelToken.java), [RetryPolicy.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/config/RetryPolicy.java), [ProvidersConfig.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/providers/ProvidersConfig.java)
- Internals verified: [Engine.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/Engine.java), [DefaultLlm.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/DefaultLlm.java), [DefaultChatStream.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/DefaultChatStream.java), [Accumulator.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/Accumulator.java), [Handoff.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/Handoff.java), [Resolver.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/internal/core/Resolver.java), [MessagesCodec.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/anthropic/internal/MessagesCodec.java), [ResponsesCodec.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/openai/internal/ResponsesCodec.java), [GenerateContentCodec.java](llm-transport-sdk/llm/src/main/java/net/ai/gate/vendors/google/internal/GenerateContentCodec.java)
- Build: [build.gradle.kts](llm-transport-sdk/llm/build.gradle.kts), [module-info.java](llm-transport-sdk/llm/src/main/java/module-info.java)
