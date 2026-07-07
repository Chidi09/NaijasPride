pluginManagement {
    val flutterSdkPath =
        run {
            val properties = java.util.Properties()
            file("local.properties").inputStream().use { properties.load(it) }
            val flutterSdkPath = properties.getProperty("flutter.sdk")
            require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
            flutterSdkPath
        }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    // Pinned below AGP 9.0: AGP 9's getDefaultProguardFile('proguard-android.txt')
    // hard-throws instead of warning, which breaks flutter_inappwebview_android's
    // own build.gradle (upstream issue, unfixed as of this pin:
    // https://github.com/pichillilorenzo/flutter_inappwebview/issues/2852).
    // Must also be >= 8.9.1: androidx.browser 1.9.0 / androidx.core 1.17.0
    // (pulled in transitively) require it. 8.10.0 matches gogo_app's proven
    // working pin for this same flutter_inappwebview dependency.
    id("com.android.application") version "8.10.0" apply false
    id("org.jetbrains.kotlin.android") version "2.3.20" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}

include(":app")
