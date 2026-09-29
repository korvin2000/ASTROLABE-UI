package io.astrolabe.studio.bridge

import io.astrolabe.Astrolabe
import io.astrolabe.store.Migrations

/** Versions of the libraries the bridge was compiled against (§19.3 diagnostics). */
public object Versions {
    @JvmStatic public val astrolabe: String get() = Astrolabe.VERSION
    @JvmStatic public val storeSchema: Int get() = Migrations.SCHEMA_VERSION
    @JvmStatic public val aiGate: String get() = net.ai.gate.Llm::class.java.`package`?.implementationVersion ?: "0.1.0-SNAPSHOT"
}
