package io.astrolabe.studio.bridge

import io.astrolabe.BalanceProfile
import io.astrolabe.Config
import io.astrolabe.ConfigViolation
import io.astrolabe.InvalidConfig
import io.astrolabe.Mode
import io.astrolabe.RunSpec
import io.astrolabe.budget.Tokens
import io.astrolabe.campaign.CampaignPolicy
import io.astrolabe.provider.Effort
import io.astrolabe.provider.Money
import io.astrolabe.provider.Profile
import java.math.BigDecimal

/**
 * A Studio run is the core's [RunSpec] (P8.B.7, core D-415): its defaults with the user's choices on top. The Studio
 * keeps no second copy of a launch number — the settings' and [StartSpec]'s defaults are [RunSpec]'s own constants.
 */
public object RunSpecs {
    /** The core mode of a Studio task mode: `auto` is [Mode.Autonomous], any other [Mode.Interactive]. */
    @JvmStatic
    public fun mode(taskMode: String?): Mode = if (taskMode == "auto") Mode.Autonomous else Mode.Interactive

    /**
     * The configuration of a Studio task: [configJson] — the settings layers with the task's one profile [profileId] —
     * with the run fields of [RunSpec.defaults]: that profile for every function, the task's mode, D-class actions asked,
     * unknown outcomes reconciled automatically. Everything else, instructions included, stays the settings'.
     */
    @JvmStatic
    public fun taskConfigJson(configJson: String, profileId: String, taskMode: String?): String {
        val config = ConfigSupport.decodeOrInvalid(configJson)
        val profile = config.profiles[profileId]
            ?: throw InvalidConfig(listOf(ConfigViolation("profileRoles.main", "profile '$profileId' is not configured")))
        val run = RunSpec.defaults(profile, config.stateRoot, mode(taskMode)).config
        return ConfigSupport.encode(
            config.copy(profileRoles = run.profileRoles, mode = run.mode, dClass = run.dClass, unknownOutcomeReconciliation = run.unknownOutcomeReconciliation),
        )
    }

    /**
     * The run [spec] asks for with [config] on its [main] profile: [RunSpec.defaults] for that profile, the config's mode
     * and state root, with the user's choices of [spec] on top.
     */
    internal fun of(spec: StartSpec, config: Config, main: Profile): RunSpec {
        val defaults = RunSpec.defaults(main, config.stateRoot, config.mode)
        return defaults.copy(
            config = config,
            policy = policy(spec, defaults.policy),
            // A setting of 0 has always been read as the least value: it never fails a start (RunSpec requires ≥ 1).
            maxCells = spec.maxCells.coerceAtLeast(1),
            leaseMinutes = spec.leaseMinutes.coerceAtLeast(1),
            effort = Effort.entries.firstOrNull { it.name == spec.effort } ?: defaults.effort,
            effortExplicit = spec.effortExplicit,
            maxOutputTokens = spec.maxOutputTokens?.coerceAtLeast(1),
        )
    }

    /**
     * The one point the run's limits and approach meet the core's C3 API (D-401). Named limits — raised ones included —
     * replace the stored ones (all fields null is [io.astrolabe.budget.TaskLimits.NONE]); `null` keeps what is stored with
     * the campaign. The approach is frozen with the attempt by the core.
     */
    internal fun policy(spec: StartSpec, defaults: CampaignPolicy): CampaignPolicy {
        val cost = if (spec.costCurrency != null && spec.costAmount != null) Money(spec.costCurrency, BigDecimal(spec.costAmount)) else null
        val limits = spec.limits?.let { l ->
            io.astrolabe.budget.TaskLimits(l.moneyUsd?.let { Money("USD", BigDecimal(it)) }, l.minutes, l.requests)
        }
        val balance = BalanceProfile.entries.firstOrNull { it.wire == spec.preset } ?: defaults.balance
        return defaults.copy(tokens = Tokens(spec.tokens), cost = cost, resumeExpected = spec.resumeExpected, limits = limits, balance = balance)
    }
}
