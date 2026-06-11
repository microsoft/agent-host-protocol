import com.vanniktech.maven.publish.JavadocJar
import com.vanniktech.maven.publish.KotlinJvm
import com.vanniktech.maven.publish.SourcesJar
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.maven.publish)
}

// `project.group` / `project.version` are also derived from `GROUP` and
// `VERSION_NAME` in `gradle.properties` by the Vanniktech plugin (which
// applies them to the publication coordinates). We mirror them onto the
// project itself so that standard tasks like `./gradlew properties -q` can
// surface the version — which `clients/kotlin/pipeline.yml` (ADO) uses
// to validate the `kotlin/v*` git tag against the source-of-truth version.
group = providers.gradleProperty("GROUP").get()
version = providers.gradleProperty("VERSION_NAME").get()

// Build with JDK 17 but emit Java 8-compatible bytecode so the artifact works
// for Android consumers without forcing core library desugaring or AGP 8.x+.
kotlin {
    jvmToolchain(17)
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

java {
    targetCompatibility = JavaVersion.VERSION_1_8
    sourceCompatibility = JavaVersion.VERSION_1_8
}

dependencies {
    api(libs.kotlinx.serialization.json)

    testImplementation(libs.kotlin.test)
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = false
    }
    // Pass the absolute path of the shared reducer test fixtures to the JVM
    // running the tests so `FixtureDrivenReducerTest` can load them without
    // depending on the current working directory (which varies between
    // Gradle CLI, IDE runners, and CI).
    systemProperty(
        "ahp.reducerFixturesDir",
        rootProject.projectDir
            .resolve("../../types/test-cases/reducers")
            .canonicalPath,
    )
    // Same wiring for the shared round-trip corpus consumed by
    // `RoundTripCorpusTest` — the language-agnostic wire-fidelity
    // fixtures shared with the .NET / Swift / Rust clients.
    systemProperty(
        "ahp.roundTripFixturesDir",
        rootProject.projectDir
            .resolve("../../types/test-cases/round-trips")
            .canonicalPath,
    )
}

mavenPublishing {
    // `automaticRelease = true` makes `publishAndReleaseToMavenCentral` close
    // and promote the staging deployment in one step (no manual Sonatype UI).
    // The plugin only targets the Sonatype Central Portal in 0.36+, so the
    // `SonatypeHost` parameter has been removed from the public API.
    publishToMavenCentral(automaticRelease = true)

    // The ADO pipeline (`clients/kotlin/pipeline.yml`) hands a staged
    // Maven layout to ESRP, which performs PGP signing on the server
    // side. Local-signing is only meaningful for direct
    // `publishAndReleaseToMavenCentral` runs, which we no longer use
    // for releases. Gate local signing on a Gradle property so the
    // pipeline can opt out without supplying PGP keys.
    if (providers.gradleProperty("ahp.signPublications").orElse("true").get().toBoolean()) {
        signAllPublications()
    }

    configure(
        KotlinJvm(
            // No real Javadoc for now (KDoc is on the source jar). Maven
            // Central requires a `-javadoc` jar even when empty.
            javadocJar = JavadocJar.Empty(),
            sourcesJar = SourcesJar.Sources(),
        ),
    )

    // `name`, `description`, `url`, `inceptionYear`, license, SCM, developers,
    // and issueManagement are all populated automatically by the plugin from
    // the `POM_*` keys in `gradle.properties` — we don't repeat them here
    // (doing so causes duplicate <license>/<developer> entries in the POM).
}

// Local filesystem Maven repository used by the ADO publish pipeline
// (`clients/kotlin/pipeline.yml`). Running
// `./gradlew publishAllPublicationsToStagingRepository` lays out a
// standard Maven repository under `build/maven-staging/`
// (`<groupId-with-slashes>/<artifactId>/<version>/...`) that ESRP then
// uploads to Maven Central via `contenttype: maven`. Signing (PGP) is
// performed by ESRP, so the staged artifacts do not need `.asc` files.
publishing {
    repositories {
        maven {
            name = "Staging"
            url = uri(layout.buildDirectory.dir("maven-staging"))
        }
    }
}


