pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
    // Redirect Gradle plugin marker requests to the actual Maven
    // coordinates so plugin resolution works even when the build
    // environment's Maven mirror (e.g. an internal Azure Artifacts feed
    // used by ESRP-backed publish runs) doesn't have the tiny
    // `<plugin-id>.gradle.plugin` redirect POMs synced. The real
    // artifacts live in mavenCentral and are always mirrored.
    resolutionStrategy {
        eachPlugin {
            when (requested.id.id) {
                "org.jetbrains.kotlin.jvm",
                "org.jetbrains.kotlin.plugin.serialization" ->
                    useModule("org.jetbrains.kotlin:kotlin-gradle-plugin:${requested.version}")
                "com.vanniktech.maven.publish" ->
                    useModule("com.vanniktech:gradle-maven-publish-plugin:${requested.version}")
            }
        }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
    }
}

rootProject.name = "agent-host-protocol"
