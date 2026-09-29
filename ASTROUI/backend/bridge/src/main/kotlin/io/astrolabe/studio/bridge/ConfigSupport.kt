package io.astrolabe.studio.bridge

import io.astrolabe.AttemptConfig
import io.astrolabe.Config
import io.astrolabe.ConfigViolation
import io.astrolabe.InvalidConfig
import io.astrolabe.cell.Roles
import io.astrolabe.provider.Profile
import io.astrolabe.provider.aigate.AiGateAdapter
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import net.ai.gate.Llm

/**
 * G-32: ASTROLABE has no config loader, so the Studio stores settings as JSON in `Config` shape and the bridge decodes
 * them with kotlinx.serialization. Validation is the libraries' own: `Config.violations()`, a dry-run
 * `AttemptConfig.freeze` and `AiGateAdapter.violations(llm, profiles)` (§17.1).
 */
public object ConfigSupport {
    internal val json: Json = Json {
        encodeDefaults = true
        ignoreUnknownKeys = false
        explicitNulls = true
    }

    /** Pretty output for the effective-configuration viewer. */
    private val pretty: Json = Json(json) { prettyPrint = true }

    @JvmStatic
    public fun encode(config: Config): String = json.encodeToString(Config.serializer(), config)

    @JvmStatic
    public fun decode(configJson: String): Config = json.decodeFromString(Config.serializer(), configJson)

    /** The library defaults as `Config` JSON (the bottom settings layer, Appendix B). */
    @JvmStatic
    public fun libraryDefaultsJson(): String = pretty.encodeToString(Config.serializer(), Config())

    /** The eight declared roles with their full configuration (§17.4). */
    @JvmStatic
    public fun declaredRolesJson(): String = pretty.encodeToString(MapSerializer(String.serializer(), io.astrolabe.cell.Role.serializer()), Roles.defaults)

    @JvmStatic
    public fun profileJson(profile: Profile): String = json.encodeToString(Profile.serializer(), profile)

    @JvmStatic
    public fun decodeProfile(profileJson: String): Profile = json.decodeFromString(Profile.serializer(), profileJson)

    /** Decodes [configJson] into a runnable configuration or throws [InvalidConfig] naming the offending fields. */
    @JvmStatic
    public fun runConfig(configJson: String): RunConfig {
        val config = try {
            decode(configJson)
        } catch (e: SerializationException) {
            throw InvalidConfig(listOf(ConfigViolation("config", e.message?.lineSequence()?.first() ?: "malformed configuration")))
        } catch (e: IllegalArgumentException) {
            throw InvalidConfig(listOf(ConfigViolation("config", e.message ?: "malformed configuration")))
        }
        val violations = config.violations()
        if (violations.isNotEmpty()) throw InvalidConfig(violations)
        return RunConfig(config)
    }

    /**
     * Validates [configJson] as the next attempt would freeze it (§17.1): decode, `Config.violations()`, freeze
     * dry-run (mandatory controls, role texts) and, when [llm] is given, the adapter's profile checks.
     */
    @JvmStatic
    public fun validate(configJson: String, llm: Llm?): ConfigCheck {
        val violations = ArrayList<Triple<String, String, String>>()
        val config = try {
            decode(configJson)
        } catch (e: SerializationException) {
            violations += Triple("config", e.message?.lineSequence()?.first() ?: "malformed configuration", "config")
            null
        } catch (e: IllegalArgumentException) {
            violations += Triple("config", e.message ?: "malformed configuration", "config")
            null
        }
        var fingerprint: String? = null
        val warnings = ArrayList<String>()
        if (config != null) {
            // Defaults.violations() names bare fields ("alpha"); qualify them so they address the Config path.
            val defaultFields = config.defaults.violations().map { it.field }.toSet()
            config.violations().forEach { violations += Triple(if (it.field in defaultFields) "defaults.${it.field}" else it.field, it.message, "config") }
            if (violations.isEmpty()) {
                try {
                    fingerprint = AttemptConfig.freeze(config).fingerprint.hex
                } catch (e: InvalidConfig) {
                    e.violations.forEach { violations += Triple(it.field, it.message, "attempt") }
                }
            }
            if (llm != null && config.profiles.isNotEmpty()) {
                try {
                    AiGateAdapter.violations(llm, config.profiles.values).forEach { v -> violations += Triple(pathOf(v), v.toString(), "ai-gate") }
                } catch (e: RuntimeException) {
                    violations += Triple("profiles", e.message ?: e.toString(), "ai-gate")
                }
                try {
                    AiGateAdapter(llm, config.profiles.values, false).use { adapter -> adapter.warnings().forEach { warnings += it.toString() } }
                } catch (e: RuntimeException) {
                    warnings += (e.message ?: e.toString())
                }
            }
        }
        val array = buildJsonArray {
            violations.forEach { (path, message, source) ->
                add(buildJsonObject { put("path", path); put("message", message); put("source", source) })
            }
        }
        return ConfigCheck(violations.isEmpty(), fingerprint, json.encodeToString(JsonArray.serializer(), array), warnings)
    }

    /** The attempt fingerprint this configuration would freeze to, or null when it cannot freeze. */
    @JvmStatic
    public fun fingerprint(configJson: String): String? = try {
        AttemptConfig.freeze(decode(configJson)).fingerprint.hex
    } catch (e: RuntimeException) {
        null
    }

    private fun pathOf(violation: Any): String {
        if (violation is ConfigViolation) return violation.field
        val text = violation.toString()
        return text.substringBefore(':', "profiles").trim().ifEmpty { "profiles" }
    }

    internal fun parse(text: String): JsonElement = json.parseToJsonElement(text)

    internal fun obj(text: String): JsonObject = parse(text) as JsonObject
}
