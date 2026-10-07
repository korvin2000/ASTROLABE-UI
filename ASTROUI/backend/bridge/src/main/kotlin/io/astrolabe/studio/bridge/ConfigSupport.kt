package io.astrolabe.studio.bridge

import io.astrolabe.AttemptConfig
import io.astrolabe.Config
import io.astrolabe.ConfigViolation
import io.astrolabe.InvalidConfig
import io.astrolabe.cell.Roles
import io.astrolabe.provider.Profile
import io.astrolabe.provider.aigate.AiGateAdapter
import io.astrolabe.route.Tier
import io.astrolabe.route.TierTable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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

    /** [configJson] — settings in `Config` shape — decoded, the Studio's protocol choice resolved ([StudioProtocol]). */
    @JvmStatic
    public fun decode(configJson: String): Config = decode(configJson, null)

    /** [configJson] decoded with `auto` resolved for the main profile [main] (the config's own when null). */
    internal fun decode(configJson: String, main: String?): Config {
        val element = json.parseToJsonElement(configJson)
        return json.decodeFromJsonElement(Config.serializer(), (element as? JsonObject)?.let { StudioProtocol.resolve(it, main) } ?: element)
    }

    /** The library defaults as `Config` JSON (the bottom settings layer, Appendix B), with the Studio's protocol choice. */
    @JvmStatic
    public fun libraryDefaultsJson(): String =
        pretty.encodeToString(JsonObject.serializer(), JsonObject((json.encodeToJsonElement(Config.serializer(), Config()) as JsonObject) + StudioProtocol.defaults()))

    /** The nine declared roles with their full configuration (§17.4), the direct protocol's `direct` among them (A-D.1). */
    @JvmStatic
    public fun declaredRolesJson(): String = pretty.encodeToString(MapSerializer(String.serializer(), io.astrolabe.cell.Role.serializer()), Roles.defaults)

    @JvmStatic
    public fun profileJson(profile: Profile): String = json.encodeToString(Profile.serializer(), profile)

    @JvmStatic
    public fun decodeProfile(profileJson: String): Profile = json.decodeFromString(Profile.serializer(), profileJson)

    /** [configJson] decoded, not yet validated; a malformed one throws [InvalidConfig]. */
    internal fun decodeOrInvalid(configJson: String, main: String? = null): Config = try {
        decode(configJson, main)
    } catch (e: SerializationException) {
        throw InvalidConfig(listOf(ConfigViolation("config", e.message?.lineSequence()?.first() ?: "malformed configuration")))
    } catch (e: IllegalArgumentException) {
        throw InvalidConfig(listOf(ConfigViolation("config", e.message ?: "malformed configuration")))
    }

    /** Decodes [configJson] into a runnable configuration or throws [InvalidConfig] naming the offending fields. */
    @JvmStatic
    public fun runConfig(configJson: String): RunConfig {
        val config = decodeOrInvalid(configJson)
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

/**
 * P8.D.4: the Studio's choice of the main line's protocol, two settings beside the core's `Config` fields — `protocol`
 * (`auto` | `structured` | `direct`, default `auto`) and `protocolByModelClass` (model class → protocol, read by `auto`).
 * They are resolved into `Config.protocol` before a configuration is decoded, so the core sees only its own field. The
 * model class is the main profile's tier in `Config.tierTable`; a profile without one runs `structured`, and every class
 * runs `structured` by default until D5 decides. H5 extends the table, not this rule.
 */
public object StudioProtocol {
    public const val KEY: String = "protocol"
    public const val TABLE_KEY: String = "protocolByModelClass"
    public const val AUTO: String = "auto"
    private const val STRUCTURED: String = "structured"
    private val PROTOCOLS: List<String> = listOf(STRUCTURED, "direct")

    @JvmField
    public val CHOICES: List<String> = listOf(AUTO) + PROTOCOLS

    /** The classes `auto` reads: the tiers a model profile can serve. */
    @JvmField
    public val MODEL_CLASSES: List<String> = Tier.entries.filter { it.model }.map { it.name }

    @JvmStatic
    public fun defaultTable(): Map<String, String> = MODEL_CLASSES.associateWith { STRUCTURED }

    internal fun defaults(): Map<String, JsonElement> =
        mapOf(KEY to JsonPrimitive(AUTO), TABLE_KEY to JsonObject(defaultTable().mapValues { JsonPrimitive(it.value) }))

    /** The model class of the profile [main] in [tiers]: the lowest model tier that lists it, or null. */
    @JvmStatic
    public fun modelClass(tiers: TierTable, main: String?): String? =
        main?.let { id -> Tier.entries.firstOrNull { it.model && id in tiers.profiles[it].orEmpty() }?.name }

    /**
     * [settings] with the two Studio keys replaced by the resolved `Config.protocol`; unchanged when it has neither.
     * A malformed choice or table throws [IllegalArgumentException] naming the key.
     */
    internal fun resolve(settings: JsonObject, main: String?): JsonObject {
        if (KEY !in settings && TABLE_KEY !in settings) return settings
        val choice = (settings[KEY] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: AUTO
        require(choice in CHOICES) { "$KEY: '$choice' is not one of ${CHOICES.joinToString(", ")}" }
        val table = when (val t = settings[TABLE_KEY]) {
            null, JsonNull -> defaultTable()
            is JsonObject -> t.mapValues { (k, v) ->
                require(k in MODEL_CLASSES) { "$TABLE_KEY: '$k' is not a model class (${MODEL_CLASSES.joinToString(", ")})" }
                (v as? JsonPrimitive)?.takeIf { it.isString && it.content in PROTOCOLS }?.content
                    ?: throw IllegalArgumentException("$TABLE_KEY.$k: '$v' is not one of ${PROTOCOLS.joinToString(", ")}")
            }
            else -> throw IllegalArgumentException("$TABLE_KEY: a table of model class to protocol")
        }
        val rest = settings - KEY - TABLE_KEY
        val protocol = if (choice != AUTO) choice else {
            val id = main ?: ((rest["profileRoles"] as? JsonObject)?.get("main") as? JsonPrimitive)?.takeIf { it.isString }?.content
            val tiers = rest["tierTable"]?.takeIf { it !is JsonNull }?.let { ConfigSupport.json.decodeFromJsonElement(TierTable.serializer(), it) } ?: Config().tierTable
            modelClass(tiers, id)?.let { table[it] } ?: STRUCTURED
        }
        return JsonObject(rest + (KEY to JsonPrimitive(protocol)))
    }
}
