// Root of the ASTROLABE Studio build. Modules: :backend:bridge (Kotlin), :backend:server (Spring Boot), :frontend (Angular).
allprojects {
    group = "io.astrolabe.studio"
    version = providers.gradleProperty("studio.version").getOrElse("0.1.0")
}

tasks.register("studio") {
    group = "application"
    description = "Builds the Angular bundle and the executable Studio jar"
    dependsOn(":backend:server:bootJar")
}
