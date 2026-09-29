package io.astrolabe.studio.bridge

import io.astrolabe.store.Row
import io.astrolabe.store.Store
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * G-07/G-08 interim (OD-02): the documented read-only queries over ASTROLABE's store, all in one place with the SQL
 * as constants. Nothing here writes; every query has a total ORDER BY. Bodies are passed through as recorded.
 */
internal class StoreReads(private val store: Store) {
    private val db get() = store.db

    private fun Row.ids(obj: MutableMap<String, JsonElement>) {
        obj["workId"] = JsonPrimitive(string("work_id"))
        obj["attemptId"] = JsonPrimitive(string("attempt_id"))
        obj["candidateId"] = stringOrNull("candidate_id")?.let(::JsonPrimitive) ?: JsonNull
        obj["contextId"] = stringOrNull("context_id")?.let(::JsonPrimitive) ?: JsonNull
        obj["createdAt"] = JsonPrimitive(string("created_at"))
    }

    private fun rows(sql: String, vararg params: Any?, extra: (Row, MutableMap<String, JsonElement>) -> Unit): JsonArray =
        JsonArray(db.query(sql, *params) { row ->
            val obj = LinkedHashMap<String, JsonElement>()
            row.ids(obj)
            extra(row, obj)
            obj["body"] = row.json("body")
            JsonObject(obj)
        })

    /** One row per campaign attempt, newest first, with its first request as the title. */
    fun campaigns(): JsonArray = JsonArray(db.query(
        "SELECT work_id, attempt_id, phase, outcome, seq, created_at, body FROM campaigns ORDER BY created_at DESC, work_id",
    ) { row ->
        val work = row.string("work_id")
        buildJsonObject {
            put("workId", work)
            put("attemptId", row.string("attempt_id"))
            put("phase", row.string("phase"))
            put("outcome", row.stringOrNull("outcome"))
            put("stateSeq", row.long("seq"))
            put("createdAt", row.string("created_at"))
            put("state", row.json("body"))
        }
    }.map { campaign ->
        val work = (campaign["workId"] as JsonPrimitive).content
        JsonObject(campaign + mapOf(
            "title" to (firstRequest(work) ?: JsonNull),
            "contract" to (latestContractSummary(work) ?: JsonNull),
            "updatedAt" to (lastActivity(work)?.let(::JsonPrimitive) ?: JsonNull),
            "fingerprint" to (fingerprint(work)?.let(::JsonPrimitive) ?: JsonNull),
        ))
    })

    fun campaign(work: String): JsonObject? = db.query(
        "SELECT work_id, attempt_id, phase, outcome, seq, created_at, body FROM campaigns WHERE work_id = ? ORDER BY attempt_id DESC LIMIT 1", work,
    ) { row ->
        buildJsonObject {
            put("workId", row.string("work_id"))
            put("attemptId", row.string("attempt_id"))
            put("phase", row.string("phase"))
            put("outcome", row.stringOrNull("outcome"))
            put("stateSeq", row.long("seq"))
            put("createdAt", row.string("created_at"))
            put("state", row.json("body"))
            put("title", firstRequest(work) ?: JsonNull)
            put("contract", latestContractSummary(work) ?: JsonNull)
            put("updatedAt", lastActivity(work)?.let(::JsonPrimitive) ?: JsonNull)
            put("fingerprint", fingerprint(work)?.let(::JsonPrimitive) ?: JsonNull)
        }
    }.firstOrNull()

    private fun firstRequest(work: String): JsonElement? =
        db.query("SELECT body FROM requests WHERE work_id = ? ORDER BY seq LIMIT 1", work) { it.json("body") }.firstOrNull()
            ?.let { (it as? JsonObject)?.get("text") }

    private fun latestContractSummary(work: String): JsonObject? =
        db.query("SELECT version, body FROM contracts WHERE work_id = ? ORDER BY version DESC LIMIT 1", work) { row ->
            val body = row.json("body") as? JsonObject
            buildJsonObject {
                put("version", row.long("version"))
                put("shape", body?.get("shape") ?: JsonNull)
                put("mode", body?.get("mode") ?: JsonNull)
                put("budget", body?.get("budget") ?: JsonNull)
                put("authorization", body?.get("authorization") ?: JsonNull)
            }
        }.firstOrNull()

    private fun lastActivity(work: String): String? =
        db.query("SELECT max(created_at) AS at FROM journal WHERE work_id = ?", work) { it.stringOrNull("at") }.firstOrNull()

    fun fingerprint(work: String): String? =
        db.query("SELECT fingerprint FROM attempts WHERE work_id = ? ORDER BY attempt_id DESC LIMIT 1", work) { it.string("fingerprint") }.firstOrNull()

    fun attemptConfig(work: String): JsonElement? =
        db.query("SELECT body FROM attempts WHERE work_id = ? ORDER BY attempt_id DESC LIMIT 1", work) { it.json("body") }.firstOrNull()

    fun requests(work: String): JsonArray =
        rows("SELECT id, seq, work_id, attempt_id, candidate_id, context_id, created_at, body FROM requests WHERE work_id = ? ORDER BY seq", work) { row, o ->
            o["id"] = JsonPrimitive(row.string("id")); o["seq"] = JsonPrimitive(row.long("seq"))
        }

    fun contractVersions(work: String): JsonArray =
        rows("SELECT version, work_id, attempt_id, candidate_id, context_id, created_at, body FROM contracts WHERE work_id = ? ORDER BY version", work) { row, o ->
            o["version"] = JsonPrimitive(row.long("version"))
        }

    fun currentContractVersion(work: String): Int? =
        db.query("SELECT max(version) AS v FROM contracts WHERE work_id = ?", work) { it.longOrNull("v")?.toInt() }.firstOrNull()

    fun cells(work: String): JsonArray =
        rows("SELECT context_id, increment_id, status, work_id, attempt_id, candidate_id, created_at, body FROM cells WHERE work_id = ? ORDER BY created_at, context_id", work) { row, o ->
            o["incrementId"] = JsonPrimitive(row.string("increment_id")); o["status"] = JsonPrimitive(row.string("status"))
        }

    fun turns(context: String): JsonArray =
        rows("SELECT turn, work_id, attempt_id, candidate_id, context_id, created_at, body FROM turns WHERE context_id = ? ORDER BY turn", context) { row, o ->
            o["turn"] = JsonPrimitive(row.long("turn"))
        }

    fun manifests(context: String): JsonArray =
        rows("SELECT id, work_id, attempt_id, candidate_id, context_id, created_at, body FROM manifests WHERE context_id = ? ORDER BY created_at, id", context) { row, o ->
            o["id"] = JsonPrimitive(row.string("id"))
        }

    fun manifest(id: String): JsonObject? =
        rows("SELECT id, work_id, attempt_id, candidate_id, context_id, created_at, body FROM manifests WHERE id = ?", id) { row, o ->
            o["id"] = JsonPrimitive(row.string("id"))
        }.firstOrNull() as? JsonObject

    fun registerVersions(context: String): JsonArray =
        rows("SELECT version, work_id, attempt_id, candidate_id, context_id, created_at, body FROM register_versions WHERE context_id = ? ORDER BY version", context) { row, o ->
            o["version"] = JsonPrimitive(row.long("version"))
        }

    fun worksetExports(context: String): JsonArray =
        rows("SELECT id, work_id, attempt_id, candidate_id, context_id, created_at, body FROM workset_exports WHERE context_id = ? ORDER BY id", context) { row, o ->
            o["id"] = JsonPrimitive(row.string("id"))
        }

    /** G-08: journal rows after [afterSeq] for [work]; the bodies are `JournalEvent` JSON with their per-work `seq`. */
    fun journalAfter(work: String, afterSeq: Long, limit: Int): JsonArray = JsonArray(
        db.query("SELECT body FROM journal WHERE work_id = ? AND seq > ? ORDER BY seq LIMIT ?", work, afterSeq, limit) { it.json("body") },
    )

    fun journalLastSeq(work: String): Long =
        db.query("SELECT coalesce(max(seq), 0) AS s FROM journal WHERE work_id = ?", work) { it.long("s") }.first()

    fun usage(work: String): JsonArray =
        rows("SELECT invocation_id, profile_id, native, normalized, work_id, attempt_id, candidate_id, context_id, created_at, body FROM usage WHERE work_id = ? ORDER BY created_at, invocation_id", work) { row, o ->
            o["invocationId"] = JsonPrimitive(row.string("invocation_id")); o["profileId"] = JsonPrimitive(row.string("profile_id"))
            o["native"] = row.json("native"); o["normalized"] = row.json("normalized")
        }

    fun usageAll(): JsonArray =
        rows("SELECT invocation_id, profile_id, native, normalized, work_id, attempt_id, candidate_id, context_id, created_at, body FROM usage ORDER BY created_at, invocation_id") { row, o ->
            o["invocationId"] = JsonPrimitive(row.string("invocation_id")); o["profileId"] = JsonPrimitive(row.string("profile_id"))
            o["native"] = row.json("native"); o["normalized"] = row.json("normalized")
        }

    fun routing(work: String): JsonArray =
        rows("SELECT id, function, tier, outcome, work_id, attempt_id, candidate_id, context_id, created_at, body FROM routing_log WHERE work_id = ? ORDER BY created_at, id", work) { row, o ->
            o["id"] = JsonPrimitive(row.string("id")); o["function"] = JsonPrimitive(row.string("function"))
            o["tier"] = JsonPrimitive(row.string("tier")); o["outcome"] = JsonPrimitive(row.string("outcome"))
        }

    fun handles(): JsonArray =
        rows("SELECT handle_id, status, log_path, cursor, work_id, attempt_id, candidate_id, context_id, created_at, body FROM handles ORDER BY created_at, handle_id") { row, o ->
            o["handleId"] = JsonPrimitive(row.string("handle_id")); o["status"] = JsonPrimitive(row.string("status"))
            o["logPath"] = JsonPrimitive(row.string("log_path")); o["cursor"] = JsonPrimitive(row.long("cursor"))
        }

    fun intents(status: String?): JsonArray =
        if (status == null) rows("SELECT intent_id, action_id, status, work_id, attempt_id, candidate_id, context_id, created_at, body FROM intents ORDER BY created_at, intent_id") { row, o -> intentCols(row, o) }
        else rows("SELECT intent_id, action_id, status, work_id, attempt_id, candidate_id, context_id, created_at, body FROM intents WHERE status = ? ORDER BY created_at, intent_id", status) { row, o -> intentCols(row, o) }

    private fun intentCols(row: Row, o: MutableMap<String, JsonElement>) {
        o["intentId"] = JsonPrimitive(row.string("intent_id")); o["actionId"] = JsonPrimitive(row.string("action_id")); o["status"] = JsonPrimitive(row.string("status"))
    }

    fun packets(work: String, kind: String?): JsonArray =
        if (kind == null) rows("SELECT id, kind, work_id, attempt_id, candidate_id, context_id, created_at, body FROM packets WHERE work_id = ? ORDER BY created_at, id", work) { row, o -> packetCols(row, o) }
        else rows("SELECT id, kind, work_id, attempt_id, candidate_id, context_id, created_at, body FROM packets WHERE work_id = ? AND kind = ? ORDER BY created_at, id", work, kind) { row, o -> packetCols(row, o) }

    private fun packetCols(row: Row, o: MutableMap<String, JsonElement>) {
        o["id"] = JsonPrimitive(row.string("id")); o["kind"] = JsonPrimitive(row.string("kind"))
    }

    fun notes(): JsonArray =
        rows("SELECT note_id, kind, status, summary, anchors, work_id, attempt_id, candidate_id, context_id, created_at, body FROM notes ORDER BY created_at, note_id") { row, o ->
            o["noteId"] = JsonPrimitive(row.string("note_id")); o["kind"] = JsonPrimitive(row.string("kind")); o["status"] = JsonPrimitive(row.string("status"))
            o["summary"] = JsonPrimitive(row.string("summary"))
        }

    fun noteQueue(): JsonArray =
        rows("SELECT id, note_id, status, work_id, attempt_id, candidate_id, context_id, created_at, body FROM note_queue ORDER BY created_at, id") { row, o ->
            o["id"] = JsonPrimitive(row.string("id")); o["noteId"] = JsonPrimitive(row.string("note_id")); o["status"] = JsonPrimitive(row.string("status"))
        }

    fun noteRevisions(noteId: String): JsonArray =
        rows("SELECT note_id, revision, work_id, attempt_id, candidate_id, context_id, created_at, body FROM note_revisions WHERE note_id = ? ORDER BY revision", noteId) { row, o ->
            o["revision"] = JsonPrimitive(row.long("revision"))
        }

    fun noteUsage(): JsonArray =
        rows("SELECT note_id, used_at, work_id, attempt_id, candidate_id, context_id, created_at, body FROM note_usage ORDER BY used_at") { row, o ->
            o["noteId"] = JsonPrimitive(row.string("note_id")); o["usedAt"] = JsonPrimitive(row.string("used_at"))
        }

    fun leases(): JsonArray =
        rows("SELECT workspace_id, holder, expiry, execution_generation, work_id, attempt_id, candidate_id, context_id, created_at, body FROM leases ORDER BY workspace_id") { row, o ->
            o["workspaceId"] = JsonPrimitive(row.string("workspace_id")); o["holder"] = JsonPrimitive(row.string("holder"))
            o["expiry"] = JsonPrimitive(row.string("expiry")); o["executionGeneration"] = JsonPrimitive(row.long("execution_generation"))
        }

    fun aliases(work: String): JsonArray =
        rows("SELECT alias_no, canonical_id, kind, workspace_id, work_id, attempt_id, candidate_id, context_id, created_at, body FROM aliases WHERE work_id = ? ORDER BY alias_no", work) { row, o ->
            o["aliasNo"] = JsonPrimitive(row.long("alias_no")); o["canonicalId"] = JsonPrimitive(row.string("canonical_id")); o["kind"] = JsonPrimitive(row.string("kind"))
        }

    /** `#n` → the observation it names and its content blob (§2.6 reference resolution). */
    fun alias(work: String, n: Long): JsonObject? = db.query(
        "SELECT a.canonical_id, a.kind, o.content_blob, o.action_id, o.body AS obs FROM aliases a LEFT JOIN observations o ON o.id = a.canonical_id WHERE a.work_id = ? AND a.alias_no = ?",
        work, n,
    ) { row ->
        buildJsonObject {
            put("alias", "#$n")
            put("canonicalId", row.string("canonical_id"))
            put("kind", row.string("kind"))
            put("contentBlob", row.stringOrNull("content_blob"))
            put("actionId", row.stringOrNull("action_id"))
            put("observation", row.stringOrNull("obs")?.let { ConfigSupport.parse(it) } ?: JsonNull)
        }
    }.firstOrNull()

    fun blobMeta(digest: String): JsonObject? = db.query("SELECT digest, kind, bytes, recovery, created_at FROM blobs WHERE digest = ?", digest) { row ->
        buildJsonObject {
            put("digest", row.string("digest")); put("kind", row.string("kind")); put("bytes", row.long("bytes"))
            put("recovery", row.long("recovery") != 0L); put("createdAt", row.string("created_at"))
        }
    }.firstOrNull()

    fun receiptsRaw(work: String): JsonArray =
        rows("SELECT receipt_id, check_id, stamp_before, stamp_after, outcome, raw_blob, work_id, attempt_id, candidate_id, context_id, created_at, body FROM receipts WHERE work_id = ? ORDER BY created_at, receipt_id", work) { row, o ->
            o["receiptId"] = JsonPrimitive(row.string("receipt_id")); o["checkId"] = JsonPrimitive(row.string("check_id"))
            o["stampBefore"] = row.stringOrNull("stamp_before")?.let(::JsonPrimitive) ?: JsonNull
            o["stampAfter"] = row.stringOrNull("stamp_after")?.let(::JsonPrimitive) ?: JsonNull
            o["outcome"] = JsonPrimitive(row.string("outcome")); o["rawBlob"] = row.stringOrNull("raw_blob")?.let(::JsonPrimitive) ?: JsonNull
        }

    fun stamps(work: String): JsonArray =
        rows("SELECT stamp_id, base_commit, tracked_delta_hash, untracked_manifest_hash, env_id, at, work_id, attempt_id, candidate_id, context_id, created_at, body FROM stamps WHERE work_id = ? ORDER BY at, stamp_id", work) { row, o ->
            o["stampId"] = JsonPrimitive(row.string("stamp_id")); o["baseCommit"] = JsonPrimitive(row.string("base_commit")); o["at"] = JsonPrimitive(row.string("at"))
        }

    fun claims(work: String): JsonArray =
        rows("SELECT id, kind, evidence_state, work_id, attempt_id, candidate_id, context_id, created_at, body FROM claims WHERE work_id = ? ORDER BY created_at, id", work) { row, o ->
            o["id"] = JsonPrimitive(row.string("id")); o["kind"] = JsonPrimitive(row.string("kind")); o["evidenceState"] = JsonPrimitive(row.string("evidence_state"))
        }

    fun counts(): JsonObject = buildJsonObject {
        for (table in listOf("campaigns", "journal", "receipts", "blobs", "notes", "note_queue", "usage", "handles", "intents")) {
            put(table, db.count("SELECT count(*) FROM $table"))
        }
    }
}
