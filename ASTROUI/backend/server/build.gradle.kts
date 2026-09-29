import org.springframework.boot.gradle.plugin.SpringBootPlugin

// studio-server (§25): Spring Boot host on JDK 26 bound to loopback; serves the Angular bundle, REST and ASTRO-WS/1.
plugins {
    java
    id("org.springframework.boot")
}

java {
    toolchain { languageVersion.set(JavaLanguageVersion.of(26)) }
}

dependencies {
    // A platform (not enforced): ASTROLABE's newer Kotlin, coroutines and sqlite-jdbc win conflict resolution.
    implementation(platform(SpringBootPlugin.BOM_COORDINATES))
    implementation(project(":backend:bridge"))
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.xerial:sqlite-jdbc:3.53.4.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.release.set(26)
    options.encoding = "UTF-8"
    options.compilerArgs.addAll(listOf("-parameters"))
}

// §25.2: ASTROLABE's process layer binds through java.lang.foreign.
val nativeAccess = listOf("--enable-native-access=ALL-UNNAMED")

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    jvmArgs(nativeAccess)
}

tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    jvmArgs(nativeAccess)
    workingDir = rootProject.projectDir
    // Pass -Pstudio.args="--studio.fixture-mode=true" etc.
    providers.gradleProperty("studio.args").orNull?.let { args(it.split(" ")) }
}

// The production Angular bundle is served from classpath:/static (§31 "one executable jar").
val frontendDist = project(":frontend").layout.projectDirectory.dir("dist/astrolabe-studio/browser")
val skipFrontend = providers.gradleProperty("studio.skipFrontend").map { it.toBoolean() }.getOrElse(false)

tasks.named<ProcessResources>("processResources") {
    if (!skipFrontend) {
        dependsOn(":frontend:buildFrontend")
        from(frontendDist) { into("static") }
    }
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("astrolabe-studio.jar")
    manifest { attributes("Enable-Native-Access" to "ALL-UNNAMED") }
}
