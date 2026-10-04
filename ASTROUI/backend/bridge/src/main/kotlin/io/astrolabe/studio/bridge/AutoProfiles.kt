package io.astrolabe.studio.bridge

import io.astrolabe.provider.Billing
import io.astrolabe.provider.BillingDimension
import io.astrolabe.provider.CacheCapability
import io.astrolabe.provider.Capabilities
import io.astrolabe.provider.PriceTable
import io.astrolabe.provider.Profile
import io.astrolabe.provider.SchemaDialect
import io.astrolabe.provider.aigate.AiGateAdapter
import io.astrolabe.provider.aigate.AiGateProfiles
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import net.ai.gate.Llm
import net.ai.gate.model.Capability
import net.ai.gate.model.SupportLevel
import java.time.LocalDate

/** A profile the Studio made for a chosen model (Studio 2 §6.5, BE-4). */
public data class AutoProfile(
    val id: String,
    val profileJson: String,
    /** True when the catalog had no limits for the model and [AutoProfiles.ESTIMATED_CONTEXT] was assumed. */
    val estimated: Boolean,
    /** What the non-billable validation found; empty when the profile is usable. */
    val violations: List<String>,
)

public object AutoProfiles {
    public const val ESTIMATED_CONTEXT: Int = 32_768
    public const val ESTIMATED_OUTPUT: Int = 4_096

    /** OpenRouter upstreams skipped per model-id prefix: their tool-call parser corrupts nested arguments (measured 2026-09-30). */
    internal val OPENROUTER_UPSTREAM_IGNORES: Map<String, List<String>> = mapOf("z-ai/" to listOf("Together"))

    /** `auto.<provider>.<model>` with every character outside the profile id alphabet replaced. */
    @JvmStatic
    public fun idOf(providerId: String, modelId: String): String =
        ("auto.$providerId." + modelId.replace(Regex("[^A-Za-z0-9._-]"), "_")).take(128)

    /**
     * Drafts the profile of [modelId] from the catalog; a model without limits in the catalog (common for local
     * servers) gets estimated limits. Validation is the adapter's own, without any billable call. [planBilled]: the
     * account is a subscription or a local server, so a model the catalog names no token price for is charged by the
     * plan and a task's money limit does not apply to it; the request and time limits do. Without it a missing price
     * stays an unknown charge. [subscription] (C16, plan §4.3a item 5): the account is a subscription — its model is
     * accounted at the official price of the same model at a paying provider, as nominal spend apart from paid spend;
     * without an official price it has no money accounting.
     */
    @JvmStatic
    @JvmOverloads
    public fun make(llm: Llm, providerId: String, modelId: String, planBilled: Boolean = false, subscription: Boolean = false): AutoProfile {
        val id = idOf(providerId, modelId)
        val today = LocalDate.now()
        var estimated = false
        val drafted = try {
            AiGateProfiles.draft(llm, providerId, modelId, id, today)
        } catch (e: IllegalArgumentException) {
            if (e.message?.contains("no limits") != true) throw e
            estimated = true
            estimate(llm, providerId, modelId, id, today)
        }
        val unpriced = drafted.priceTable.perMillion.isEmpty() && drafted.priceTable.tiers.isEmpty()
        val prices = when {
            subscription -> AiGateProfiles.planPriceTable(llm, providerId, modelId, today) ?: PriceTable(today, "USD", emptyMap(), billing = Billing.Plan)
            planBilled && unpriced -> drafted.priceTable.copy(billing = Billing.Plan)
            else -> drafted.priceTable
        }
        val profile = drafted.copy(priceTable = prices, config = routed(providerId, modelId, drafted.config))
        val violations = try {
            AiGateAdapter.violations(llm, listOf(profile)).map { it.toString() }
        } catch (e: RuntimeException) {
            listOf(e.message ?: e.toString())
        }
        return AutoProfile(id, ConfigSupport.profileJson(profile), estimated, violations)
    }

    /** [config] with `gate.body.provider.ignore` naming the OpenRouter upstreams [OPENROUTER_UPSTREAM_IGNORES] lists for [modelId]. */
    internal fun routed(providerId: String, modelId: String, config: JsonObject): JsonObject {
        if (providerId != "openrouter") return config
        val ignore = OPENROUTER_UPSTREAM_IGNORES.filterKeys { modelId.startsWith(it) }.values.flatten().distinct()
        if (ignore.isEmpty()) return config
        val gate = config["gate"] as? JsonObject ?: JsonObject(emptyMap())
        val body = JsonObject(mapOf("provider" to JsonObject(mapOf("ignore" to JsonArray(ignore.map(::JsonPrimitive))))))
        return JsonObject(config + ("gate" to JsonObject(gate + ("body" to body))))
    }

    private fun estimate(llm: Llm, providerId: String, modelId: String, id: String, date: LocalDate): Profile {
        val model = llm.model(providerId, modelId)
        val features = llm.features(model)
        val reported = features.reportedUsageFields()
        val usage = LinkedHashSet<BillingDimension>()
        if ("input" in reported) usage += BillingDimension.UNCACHED_INPUT
        if ("cache_read" in reported) usage += BillingDimension.CACHE_READ
        if ("output" in reported) usage += BillingDimension.OUTPUT
        val capabilities = Capabilities(
            toolSchemaValidation = model.capabilities().support(Capability.TOOLS) == SupportLevel.SUPPORTED,
            parallelToolCalls = model.capabilities().support(Capability.PARALLEL_TOOLS) == SupportLevel.SUPPORTED,
            streaming = features.streamingSupported(),
            outputLimitTokens = model.maxOutputTokens().orElse(ESTIMATED_OUTPUT.toLong()).coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
            contextLimitTokens = model.contextWindow().orElse(ESTIMATED_CONTEXT.toLong()).coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
            nativeCompaction = false,
            continuation = false,
            cancellation = true,
            hostedExecution = false,
            caching = CacheCapability(false, null, null, emptySet()),
            usageFields = usage,
            schemaDialects = setOf(SchemaDialect.JSON_SCHEMA_2020_12),
        )
        val gate = mapOf("v" to JsonPrimitive(1), "api" to JsonPrimitive(features.api()))
        return Profile(id, providerId, modelId, capabilities, PriceTable(date, "USD", emptyMap()), config = JsonObject(mapOf("gate" to JsonObject(gate))))
    }
}
