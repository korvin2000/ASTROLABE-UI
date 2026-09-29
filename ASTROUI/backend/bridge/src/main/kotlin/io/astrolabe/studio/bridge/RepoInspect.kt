package io.astrolabe.studio.bridge

import io.astrolabe.RulesBinding
import io.astrolabe.atlas.Atlas
import io.astrolabe.atlas.Sniff
import io.astrolabe.auth.RulesStatus
import io.astrolabe.auth.RulesTrust
import io.astrolabe.id.Digest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.nio.file.Path

/**
 * Repository facts for the project home (§19.2): sniffed commands are *declared, not inferred* (read-only, G-13);
 * rules-file candidates are data until the user binds exact bytes (D-32).
 */
public object RepoInspect {
    @JvmStatic
    public fun of(root: Path): String {
        val atlas = Atlas.build(root)
        val sniffed = Sniff.commands(atlas)
        val trust = RulesTrust(root)
        return buildJsonObject {
            put("files", atlas.rows.size)
            put("packages", JsonArray(sniffed.packages.map { p ->
                buildJsonObject {
                    put("dir", p.dir)
                    put("manifest", p.manifestPath)
                    put("test", p.test?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull)
                    put("build", p.build?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull)
                    put("lint", p.lint?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull)
                    put("typecheck", p.typecheck?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull)
                }
            }))
            put("rulesCandidates", JsonArray(trust.discover().map { c ->
                buildJsonObject { put("path", c.path); put("digest", c.digest.hex); put("sizeBytes", c.sizeBytes) }
            }))
        }.toString()
    }

    /** Trust status of a binding against the bytes on disk (`untrusted|missing|unreadable|changed|approved`). */
    @JvmStatic
    public fun rulesStatus(root: Path, path: String?, digest: String?, provenance: String?): String {
        val binding = if (path.isNullOrBlank() || digest.isNullOrBlank()) null else RulesBinding(path, Digest(digest), provenance ?: "user")
        return when (val status = RulesTrust(root).status(binding)) {
            RulesStatus.Untrusted -> "untrusted"
            RulesStatus.Missing -> "missing"
            is RulesStatus.Unreadable -> "unreadable: ${status.reason}"
            is RulesStatus.ChangedSinceApproval -> "changed"
            is RulesStatus.Approved -> "approved"
        }
    }

    /** Reads a rules candidate's bytes for "Review & bind" (text shown with its digest). */
    @JvmStatic
    public fun rulesCandidate(root: Path, relativePath: String): String? {
        val candidate = RulesTrust(root).candidate(relativePath) ?: return null
        val text = root.resolve(candidate.path).toFile().readText(Charsets.UTF_8)
        return buildJsonObject { put("path", candidate.path); put("digest", candidate.digest.hex); put("sizeBytes", candidate.sizeBytes); put("text", text) }.toString()
    }
}
