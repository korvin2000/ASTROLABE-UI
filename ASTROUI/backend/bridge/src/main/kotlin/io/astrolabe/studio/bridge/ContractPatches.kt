package io.astrolabe.studio.bridge

import io.astrolabe.budget.Tokens
import io.astrolabe.contract.Acceptance
import io.astrolabe.contract.Command
import io.astrolabe.contract.Constraint
import io.astrolabe.contract.Contract
import io.astrolabe.contract.Origin
import io.astrolabe.contract.Scope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * G-05: the typed `ContractPatch` (§29) an accepted amendment applies, used as the `apply` function of
 * `Contracts.resolve`. Only the listed operations exist; a weakening removal needs `confirmWeakening: true`.
 */
internal object ContractPatches {
    fun apply(contract: Contract, patchJson: String?): Contract {
        if (patchJson.isNullOrBlank()) return contract
        val element = ConfigSupport.parse(patchJson)
        val ops = when (element) {
            is JsonArray -> element.map { it as JsonObject }
            is JsonObject -> listOf(element)
            else -> throw IllegalArgumentException("a contract patch is an object or an array of objects")
        }
        return ops.fold(contract) { c, op -> applyOne(c, op) }
    }

    private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.strings(key: String): List<String>? = (this[key] as? JsonArray)?.map { it.jsonPrimitive.content }

    private fun applyOne(c: Contract, op: JsonObject): Contract {
        val next = c.version + 1
        return when (val name = op.str("op")) {
            "acceptance.update" -> {
                val id = requireNotNull(op.str("id")) { "acceptance.update needs an id" }
                c.copy(acceptance = c.acceptance.map { item ->
                    if (item.id != id) item else when (item) {
                        is Acceptance.Run -> item.copy(
                            command = Command(op.strings("command") ?: item.command.argv, if (op.containsKey("cwd")) op.str("cwd") else item.command.cwd),
                            scope = op.str("scope") ?: item.scope,
                            origin = Origin.Amended(next),
                            last = null,
                        )
                        is Acceptance.Check -> item.copy(text = op.str("text") ?: item.text, origin = Origin.Amended(next))
                        is Acceptance.Review -> item.copy(text = op.str("text") ?: item.text, origin = Origin.Amended(next))
                    }
                })
            }
            "acceptance.remove" -> {
                val id = requireNotNull(op.str("id")) { "acceptance.remove needs an id" }
                require((op["confirmWeakening"] as? JsonPrimitive)?.booleanOrNull == true) { "removing $id weakens the contract: confirmWeakening must be true" }
                c.copy(
                    acceptance = c.acceptance.filter { it.id != id },
                    requirements = c.requirements.map { r -> r.copy(acceptance = r.acceptance - id) },
                )
            }
            "constraint.add" -> {
                val text = requireNotNull(op.str("text")) { "constraint.add needs text" }
                val id = "C${c.constraints.size + 1}"
                c.copy(constraints = c.constraints + Constraint(id, text, "user"))
            }
            "exclusion.add" -> c.copy(exclusions = c.exclusions + requireNotNull(op.str("text")) { "exclusion.add needs text" })
            "scope.set" -> c.copy(scope = Scope(op.strings("writePaths") ?: c.scope.writePaths, op.strings("protectedPaths") ?: c.scope.protectedPaths))
            "budget.set" -> {
                val b = c.budget
                c.copy(budget = b.copy(
                    tokens = (op["tokens"] as? JsonPrimitive)?.longOrNull?.let(::Tokens) ?: b.tokens,
                    cells = (op["cells"] as? JsonPrimitive)?.intOrNull ?: b.cells,
                    turnsPerCell = (op["turnsPerCell"] as? JsonPrimitive)?.intOrNull ?: b.turnsPerCell,
                    attempts = (op["attempts"] as? JsonPrimitive)?.intOrNull ?: b.attempts,
                ))
            }
            else -> throw IllegalArgumentException("unknown contract patch op '$name'")
        }
    }

    @Suppress("unused")
    private fun JsonObject.array(key: String): JsonArray? = this[key]?.jsonArray
}
