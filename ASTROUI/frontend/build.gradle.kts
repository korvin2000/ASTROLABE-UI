// studio-web (§32): the Angular workspace, built with the system Node/npm through Gradle.
plugins {
    base
}

val isWindows = System.getProperty("os.name").lowercase().contains("windows")
val npm = if (isWindows) "npm.cmd" else "npm"

val npmInstall by tasks.registering(Exec::class) {
    group = "frontend"
    description = "Installs the frontend dependencies (npm ci when a lockfile exists)"
    workingDir = projectDir
    commandLine(npm, if (file("package-lock.json").exists()) "ci" else "install", "--no-audit", "--no-fund")
    inputs.file("package.json")
    inputs.files(fileTree(projectDir) { include("package-lock.json") })
    // npm's hidden lockfile marks a completed install; tracking the whole directory would re-run `npm ci`
    // (which wipes node_modules) whenever a tool cache inside it changes.
    outputs.file("node_modules/.package-lock.json")
}

val buildFrontend by tasks.registering(Exec::class) {
    group = "frontend"
    description = "Production build of the Angular application into dist/"
    dependsOn(npmInstall)
    workingDir = projectDir
    commandLine(npm, "run", "build")
    inputs.dir("src")
    inputs.files("package.json", "angular.json", "tsconfig.json", "tsconfig.app.json")
    outputs.dir("dist")
}

val testFrontend by tasks.registering(Exec::class) {
    group = "verification"
    description = "Runs the frontend unit tests (reducers, parsers)"
    dependsOn(npmInstall)
    workingDir = projectDir
    commandLine(npm, "run", "test")
}

tasks.named("assemble") { dependsOn(buildFrontend) }
tasks.named("clean", Delete::class) { delete("dist") }
