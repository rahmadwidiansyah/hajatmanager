import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// workmanager_android 0.9.x targets AGP 9 built-in Kotlin but does not apply
// the Kotlin compiler plugin itself, leaving its FlutterPlugin class out of
// the Android library. Apply it for the federated plugin until upstream
// ships a built-in-Kotlin-compatible release.
subprojects {
    if (name == "workmanager_android") {
        apply(plugin = "org.jetbrains.kotlin.android")
        tasks.withType<KotlinCompile>().configureEach {
            compilerOptions.jvmTarget.set(JvmTarget.JVM_1_8)
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
