// ASTROLABE Studio: Spring Boot host (Java 26) + Kotlin bridge + Angular frontend (spec ASTROLABE_UI_BEST_MIX.md §25.2).
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
    plugins {
        // Same Kotlin as ASTROLABE (gradle/libs.versions.toml): the bridge compiles against its ABI.
        id("org.jetbrains.kotlin.jvm") version "2.4.20"
        id("org.jetbrains.kotlin.plugin.serialization") version "2.4.20"
        id("org.springframework.boot") version "4.1.1"
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
    }
}

rootProject.name = "astrolabe-studio"

// §25.2: ASTROLABE (and, through its own settings, the AI Gate SDK checkout) as included builds; never modified here.
val astrolabeBuild = file(providers.gradleProperty("studio.astrolabeBuild").getOrElse("../ASTROLABE"))
require(astrolabeBuild.resolve("settings.gradle.kts").isFile) { "ASTROLABE checkout not found at $astrolabeBuild (set -Pstudio.astrolabeBuild=<path>)" }
includeBuild(astrolabeBuild)

include(":backend:bridge", ":backend:server", ":frontend")
