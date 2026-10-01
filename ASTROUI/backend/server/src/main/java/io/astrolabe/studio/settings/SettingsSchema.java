package io.astrolabe.studio.settings;

import java.util.ArrayList;
import java.util.List;

import io.astrolabe.studio.support.Json;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The settings schema (§17.6, Appendix B): one descriptor per field with its type, unit, scope, activation and
 * availability — `editable`, `read-only`, `host-managed`, `unwired` (declared, not read by the runtime, G-23) or
 * `unavailable` (G-14 and friends). Forms are generated from it; defaults come from the library itself.
 */
public final class SettingsSchema {
    private SettingsSchema() { }

    public record Field(String key, String group, String label, String type, String unit, List<String> choices,
                        Double min, Double max, String scope, String activation, String availability, String gap, String help) { }

    private static final List<Field> FIELDS = new ArrayList<>();

    private static void f(String key, String group, String label, String type, String unit, List<String> choices, Double min, Double max,
                          String scope, String activation, String availability, String gap, String help) {
        FIELDS.add(new Field(key, group, label, type, unit, choices, min, max, scope, activation, availability, gap, help));
    }

    private static void num(String key, String group, String label, String unit, double min, String help) {
        f(key, group, label, "int", unit, null, min, null, "S P", "next-attempt", "editable", null, help);
    }

    private static void frac(String key, String group, String label, String help) {
        f(key, group, label, "fraction", null, null, 0.0, 1.0, "S P", "next-attempt", "editable", null, help);
    }

    private static void unwired(String key, String group, String label, String type, String unit) {
        f(key, group, label, type, unit, null, null, null, "S P", "next-attempt", "unwired", "G-23", "Declared in Defaults, not read by the runtime today");
    }

    static {
        // ---- Autonomy & safety -------------------------------------------------------------------------------
        f("config.mode", "autonomy", "Mode", "enum", null, List.of("Interactive", "Autonomous"), null, null, "S P C", "next-attempt", "editable", null,
            "Interactive: you answer questions and approvals. Autonomous: the policy answers; questions end blocked (waiting for input).");
        f("config.dClass", "autonomy", "D-class effects", "enum", null, List.of("Ask", "Deny"), null, null, "S P C", "next-attempt", "editable", null,
            "Privilege, network, package installs, git ref mutation, deletes outside tmp. Autonomous mode: Ask degrades to deny unless allowlisted.");
        f("config.integrityApproval", "autonomy", "Test-integrity approval", "enum", null, List.of("Autonomous", "Human"), null, null, "S P", "next-attempt", "editable", null,
            "Autonomous: a review cell first, human fallback. Never disables the integrity guard.");
        f("config.unknownOutcomeReconciliation", "autonomy", "Unknown outcomes", "enum", null, List.of("Host", "Automatic"), null, null, "S P", "next-attempt", "editable", null,
            "Host: you reconcile effects left unknown by a crash before resume. Automatic covers only replay-safe or workspace-confined intents.");
        f("config.ceiling", "autonomy", "Publication ceiling", "enum", null, List.of("Patch", "LocalCommit", "Push", "Merge", "Deploy"), null, null, "S P C", "next-attempt", "editable", null,
            "Highest stage a campaign may be authorized to reach; every stage above Patch is a separate approval.");
        f("config.executionMode", "autonomy", "Execution mode", "enum", null, List.of("TrustedLocal", "Confined"), null, null, "S P", "next-attempt", "editable", "G-14",
            "Trusted-local is not a sandbox: effect classes are labels verified after the fact. Confined needs a runner backend (none registered).");
        f("runtime.acceptNonWeakening", "autonomy", "Autonomous: accept non-weakening proposals", "bool", null, null, null, null, "S P", "next-attempt", "editable", null,
            "AutonomousPolicy.acceptNonWeakening. Weakening proposals are never auto-accepted.");
        f("runtime.reviewer", "autonomy", "Autonomous: reviewer", "string", null, null, null, null, "S P", "next-attempt", "editable", null, "AutonomousPolicy.reviewer (optional)");
        f("config.redaction.maxBytes", "autonomy", "Redaction scan cap", "int", "bytes", null, 1.0, null, "S P", "next-attempt", "editable", null, "Bytes scanned for secrets before exposure and persistence");
        f("config.redaction.patterns", "autonomy", "Redaction patterns", "json", null, null, null, null, "S P", "next-attempt", "editable", null, "Secret patterns {kind, regex}; built-in kinds cover keys, tokens, JWTs and URL credentials");
        f("readonly.protectedPaths", "autonomy", "Protected paths", "text", null, null, null, null, "S P", "next-attempt", "read-only", "G-13", ".git · .github · .gitlab · migrations — not configurable through Config");
        f("readonly.dClassAllowlist", "autonomy", "D-class allowlist and capability sets", "text", null, null, null, null, "S P", "next-attempt", "read-only", "G-13", "Authorization.dClassAllowlist and capability sets are not on Config (OD-09)");

        // ---- Models & routing --------------------------------------------------------------------------------
        f("config.profileRoles.main", "models", "Main profile", "profile", null, null, null, null, "S P", "next-attempt", "editable", null, "Serves the implementing, plan and continuation functions");
        f("config.profileRoles.helper", "models", "Helper profile", "profile?", null, null, null, null, "S P", "next-attempt", "editable", null, "Cheap helper calls (extraction, repair); none = main serves them");
        f("config.profileRoles.escalation", "models", "Escalation profile", "profile?", null, null, null, null, "S P", "next-attempt", "editable", null, "Used when routing escalates a tier");
        f("runtime.effort", "models", "Main-model effort", "enum", null, List.of("Minimal", "Low", "Medium", "High"), null, null, "S P C", "next-attempt", "editable", null, "Mapped to a reasoning level by the profile's gate.effort");
        f("runtime.maxOutputTokens", "models", "Output narrowing", "int?", "tokens", null, 1.0, null, "S P C", "next-attempt", "editable", null, "Optional cap below the profile's output limit");
        f("config.tierTable", "models", "Tier table", "json", null, null, null, null, "S P", "next-attempt", "editable", null, "Profiles per tier (Low, Medium, High, ExtraHigh) with a calibration date; untiered = main serves every tier");
        unwired("config.defaults.probeTier", "models", "Probe tier", "enum", null);
        unwired("config.defaults.reviewTier", "models", "Review tier", "enum", null);
        unwired("config.defaults.reviewRoutineTier", "models", "Routine review tier", "enum", null);
        f("readonly.functionTable", "models", "Function table", "text", null, null, null, null, "S P", "next-attempt", "read-only", "G-13", "routing-11.1-v1 (FunctionTable.DEFAULT) — not configurable");

        // ---- Budgets & limits --------------------------------------------------------------------------------
        num("config.defaults.campaignCells", "budgets", "Cells per campaign", "cells", 1, "Also sizes the default token budget (main context × cells)");
        num("config.defaults.attemptsPerIncrement", "budgets", "Substantive attempts per increment", "attempts", 1, null);
        num("config.defaults.turnsPerCell", "budgets", "Turns per cell", "turns", 1, null);
        frac("config.defaults.turnNudgeFraction", "budgets", "Turn nudge at", "Fraction of turns after which the turn-budget nudge fires");
        frac("config.defaults.reserveVerification", "budgets", "Verification reserve", "Share of a cell's budget kept for verification");
        frac("config.defaults.reserveRecoveryAndPersist", "budgets", "Recovery and persist reserve", null);
        f("config.defaults.campaignRecoveryReserve", "budgets", "Campaign recovery reserve", "fraction", null, null, 0.0, 1.0, "S P", "next-attempt", "unwired", "G-23", "Declared, not read by the runtime");
        frac("config.defaults.alpha", "budgets", "Context pressure α", "Context occupancy that triggers folding into the register and a rebuild");
        num("config.defaults.k", "budgets", "Eviction batch k", "items", 1, null);
        unwired("config.defaults.m", "budgets", "Turns kept on rebuild m", "int", "turns");
        num("config.defaults.rMaxTokens", "budgets", "Live results max", "tokens", 1, null);
        num("config.defaults.anchorMaxTokens", "budgets", "Anchor [A] max", "tokens", 1, null);
        num("config.defaults.immediateStubTokens", "budgets", "Immediate stub threshold", "tokens", 1, null);
        num("config.defaults.lookBudgetTokens", "budgets", "look budget", "tokens", 1, null);
        num("config.defaults.runBudgetTokens", "budgets", "run budget", "tokens", 1, null);
        num("config.defaults.registerCapTokens", "budgets", "STATE register cap", "tokens", 1, null);
        num("config.defaults.digestCapTokens", "budgets", "Contract digest cap", "tokens", 1, null);
        f("config.defaults.digestTokensPerRequirement", "budgets", "Digest tokens per requirement", "int", "tokens", null, 0.0, null, "S P", "next-attempt", "editable", null, null);
        num("config.defaults.digestCapCeilingTokens", "budgets", "Digest cap ceiling", "tokens", 1, null);
        num("config.defaults.patchCapTokens", "budgets", "STATE patch cap", "tokens", 1, null);
        num("config.defaults.factLineMaxChars", "budgets", "Fact line max", "chars", 1, null);
        unwired("config.defaults.seedsMaxTokens", "budgets", "Workset seeds per cell", "int", "tokens");
        num("config.defaults.focusNotesMaxTokens", "budgets", "Focus notes max", "tokens", 1, null);
        num("config.defaults.focusZoomMaxTokens", "budgets", "Focus zoom max", "tokens", 1, null);
        num("config.defaults.touchedInAnchor", "budgets", "Touched files in [A]", "files", 1, null);
        num("config.defaults.stallTurns", "budgets", "Stall guard", "turns", 1, "Turns without progress before the stall gate");
        num("config.defaults.loopIdentical", "budgets", "Loop guard", "calls", 1, "Identical calls before the loop gate");
        num("config.defaults.repeatedSignatureRepairs", "budgets", "Repeated-failure guard", "repairs", 1, null);
        num("config.defaults.doomLoopSameCalls", "budgets", "Doom-loop guard", "calls", 1, null);
        unwired("config.defaults.probeTurns", "budgets", "Probe turns", "int", "turns");
        num("config.defaults.probeTokens", "budgets", "Probe budget", "tokens", 1, null);
        unwired("config.defaults.reviewLookMax", "budgets", "Review look max", "int", "calls");
        num("config.defaults.reviewIncrementTokens", "budgets", "Increment review budget", "tokens", 1, null);
        unwired("config.defaults.reviewCampaignTokens", "budgets", "Campaign review budget", "int", "tokens");
        num("config.defaults.repairCalls", "budgets", "Repair helper calls", "calls", 1, null);
        num("config.defaults.writerDepth", "budgets", "Writer depth", "levels", 1, null);
        num("config.defaults.probeDepth", "budgets", "Probe depth", "levels", 1, null);
        num("config.defaults.parallelCells", "budgets", "Parallel cells", "cells", 1, null);
        num("config.defaults.runTimeoutSeconds", "budgets", "Run timeout", "s", 1, null);
        f("config.defaults.gitDeadlineSeconds", "budgets", "Git deadline", "int", "s", null, 1.0, 3600.0, "S P", "live", "editable", null, "Read live at project open; ≤ 3600");
        num("config.defaults.providerTerminalWaitSeconds", "budgets", "Provider settlement wait", "s", 1, "Bounded wait for a provider terminal after cancel or shutdown");

        // ---- Shape policy -------------------------------------------------------------------------------------
        num("config.defaults.shapePolicy.smallMaxFiles", "shape", "Small: max files", "files", 1, null);
        num("config.defaults.shapePolicy.smallMaxRequirements", "shape", "Small: max requirements", "requirements", 1, null);
        num("config.defaults.shapePolicy.largeMinFiles", "shape", "Large: min files", "files", 1, "Must exceed small max files");
        num("config.defaults.shapePolicy.largeMinRequirements", "shape", "Large: min requirements", "requirements", 1, null);
        f("config.defaults.shapePolicy.s3Enabled", "shape", "S3 parallel writers", "bool", null, null, null, null, "S P", "next-attempt", "editable", null, "Also needs flags.s3Writers. Off until evaluated");
        f("config.defaults.shapePolicy.slackFactor", "shape", "Slack factor", "number", "×", null, 1.0, null, "S P", "next-attempt", "editable", null, "Measured-slack multiplier over the sequential estimate");

        // ---- Verification -------------------------------------------------------------------------------------
        num("config.defaults.checkerTimeBoxSeconds", "verification", "Checker time box", "s", 1, null);
        num("config.defaults.checkerFallbackTimeBoxSeconds", "verification", "Checker fallback time box", "s", 1, "When a touched-file selector expands to project scope");
        f("config.defaults.theta", "verification", "Risk threshold θ", "int", null, null, 0.0, null, "S P", "next-attempt", "editable", null, "Risk above which slow checks run early");
        num("config.defaults.fullSuiteCadence", "verification", "Full-suite cadence", "increments", 1, null);
        unwired("config.defaults.flakyIsolatedReruns", "verification", "Flaky isolated reruns", "int", "runs");
        f("config.qualityGates", "verification", "Quality gates", "json", null, null, null, null, "P", "next-attempt", "editable", null, "Commands {argv, cwd} run with the full suite; each becomes a CHK-quality-gate check");

        // ---- Knowledge -----------------------------------------------------------------------------------------
        f("config.flags.kbInjection", "knowledge", "Note injection", "enum", null, List.of("Off", "Frozen", "Live"), null, null, "S P", "next-attempt", "editable", null,
            "Off keeps mandatory CON/ADR/CAL compiled in. Off until evaluated; live gates are UNMEASURED");
        unwired("config.defaults.noteBodyMaxTokens", "knowledge", "Note body max", "int", "tokens");
        unwired("config.defaults.noteSummaryMaxChars", "knowledge", "Note summary max", "int", "chars");
        unwired("config.defaults.injectionMaxNotes", "knowledge", "Injection max notes", "int", "notes");
        unwired("config.defaults.injectionMaxTokens", "knowledge", "Injection max tokens", "int", "tokens");
        unwired("config.defaults.admissionConfidenceMax", "knowledge", "Admission confidence max", "fraction", null);

        // ---- Optional layers -----------------------------------------------------------------------------------
        String[][] layers = {
            {"precompile", "Pre-compile the next increment", "editable", "Off until evaluated"},
            {"calibrationPrior", "Per-repository sizing prior", "editable", "Off until evaluated"},
            {"treeSitterIndex", "Tier-1 outline index (tree-sitter)", "editable", "Off until evaluated; needs index-treesitter on the classpath"},
            {"languageService", "Tier-2 language service", "unavailable", "Unavailable: no host language service is wired"},
            {"denseRetrieval", "Dense KB retrieval", "unavailable", "Unavailable: no embedding provider in v1"},
            {"generatedTools", "Generated tools", "unavailable", "Unavailable: no generated-tool registry in v1"},
            {"skillsPromotion", "Skill promotion proposals", "unwired", "Declared, not active (evaluation only)"},
            {"asyncChecker", "Async watcher feedback", "unavailable", "Unavailable: no host Watcher"},
            {"qaCell", "L3 product-use QA cells", "editable", "Off until evaluated; host-driven QaDriver"},
            {"l4Gates", "L4 measurement gates", "unavailable", "Unavailable: measurement commands are not on Config (G-13)"},
            {"s3Writers", "S3 parallel writers", "editable", "Off until evaluated; also needs shapePolicy.s3Enabled"},
            {"otelExport", "OpenTelemetry span export", "editable", "Available: writes otel-spans.json"},
            {"worthTestEstimate", "Delegation worth-test estimate", "unwired", "Declared, not active (advisory)"},
        };
        for (String[] l : layers) {
            f("config.flags." + l[0], "layers", l[1], "bool", null, null, null, null, "S P", "next-attempt", l[2], "unavailable".equals(l[2]) ? "G-13" : null, l[3]);
        }

        // ---- Tools & MCP --------------------------------------------------------------------------------------
        f("readonly.mcp", "tools", "MCP mounts", "text", null, null, null, null, "S P", "next-attempt", "unavailable", "G-15", "Declared, not callable: no McpClient reaches Run in the controller path");

        // ---- Studio runtime -----------------------------------------------------------------------------------
        f("runtime.leaseMinutes", "runtime", "Lease duration", "int", "min", null, 1.0, null, "S P", "next-campaign", "host-managed", null, "Workspace lease while decisions wait (OD-03: 8 h; library default 1 h). Not renewed while waiting (G-02)");
        f("runtime.maxCells", "runtime", "Max cells per run", "int", "cells", null, 1.0, null, "S P C", "next-campaign", "host-managed", null, "Passed to Controller.run(maxCells)");
        f("runtime.defaultTokens", "runtime", "Default campaign budget", "int?", "tokens", null, 1.0, null, "S P C", "next-campaign", "host-managed", null, "Empty = main context limit × cells per campaign");
        f("runtime.autoResumeOnLateAnswer", "runtime", "Auto-resume after a late answer", "bool", null, null, null, null, "S", "immediate", "host-managed", null, "Off: the Studio offers \"Resume with this answer\"");
        f("runtime.decisionReminderMinutes", "runtime", "Decision reminders", "int", "min", null, 1.0, null, "S", "immediate", "host-managed", null, null);
        f("runtime.maxConcurrentCampaigns", "runtime", "Max concurrent campaigns", "int", "campaigns", null, 1.0, null, "S", "immediate", "host-managed", null, "Across projects; one per project always");

        // ---- Storage & diagnostics ----------------------------------------------------------------------------
        f("config.stateRoot", "storage", "ASTROLABE state root", "string?", null, null, null, null, "S P", "project-reopen", "editable", null, "Empty = OS user-state directory. Changing it reopens the project; nothing is migrated");
    }

    /** The schema with each field's library default filled in from [defaults] (`{config, runtime}` shape). */
    public static ArrayNode describe(JsonNode defaults) {
        ArrayNode out = Json.arr();
        for (Field fd : FIELDS) {
            ObjectNode o = out.addObject();
            o.put("key", fd.key());
            o.put("group", fd.group());
            o.put("label", fd.label());
            o.put("type", fd.type());
            if (fd.unit() != null) o.put("unit", fd.unit());
            if (fd.choices() != null) {
                ArrayNode c = o.putArray("choices");
                fd.choices().forEach(c::add);
            }
            if (fd.min() != null) o.put("min", fd.min());
            if (fd.max() != null) o.put("max", fd.max());
            o.put("scope", fd.scope());
            o.put("activation", fd.activation());
            o.put("availability", fd.availability());
            if (fd.gap() != null) o.put("gap", fd.gap());
            if (fd.help() != null) o.put("help", fd.help());
            JsonNode d = at(defaults, fd.key());
            if (d != null) o.set("default", d);
        }
        return out;
    }

    public static List<Field> fields() { return List.copyOf(FIELDS); }

    /** The node at a dotted [key] inside [root], or null. */
    public static JsonNode at(JsonNode root, String key) {
        JsonNode n = root;
        for (String part : key.split("\\.")) {
            if (n == null || !n.isObject()) return null;
            n = n.get(part);
        }
        return n;
    }
}
