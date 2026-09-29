import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// studio-bridge (§2.12, §25.3): a thin Kotlin host over ASTROLABE's public Controller with a Java-friendly surface
// (CompletableFuture, JSON strings of ASTROLABE's own @Serializable types). No UI logic, no writes to ASTROLABE tables.
plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
    `java-library`
}

java {
    toolchain { languageVersion.set(JavaLanguageVersion.of(26)) }
}

kotlin {
    jvmToolchain(26)
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_26)
        freeCompilerArgs.addAll("-Xjdk-release=26", "-Xjsr305=strict")
    }
}

dependencies {
    api("io.astrolabe:core:0.1.0-SNAPSHOT")
    api("io.astrolabe:provider-api:0.1.0-SNAPSHOT")
    api("io.astrolabe:provider-ai-gate:0.1.0-SNAPSHOT")
    api("net.ai.gate:ai-gate:0.1.0-SNAPSHOT")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-jdk8:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("org.slf4j:slf4j-api:2.0.19")

    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5:2.4.20")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testRuntimeOnly("org.slf4j:slf4j-simple:2.0.19")
}

tasks.withType<JavaCompile>().configureEach {
    options.release.set(26)
    options.encoding = "UTF-8"
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    jvmArgs("--enable-native-access=ALL-UNNAMED")
    systemProperty("studio.fixture.debug", "true")
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
