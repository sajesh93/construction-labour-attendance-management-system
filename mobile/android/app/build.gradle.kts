plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.clamsapp.clams_mobile"
    // Pinned: plugins (geolocator/sqflite) need compileSdk 36+.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.clamsapp.clams_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 23
        targetSdk = 34
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Bundle the ML Kit barcode model into the app so QR scanning works on
    // devices with missing/old Google Play Services (fixes mobile_scanner
    // genericError / null-object-reference). Adds ~2.5 MB to the APK.
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
}

configurations.all {
    // Remove the Play-Services (unbundled) model that mobile_scanner pulls in,
    // so only the bundled model above is used.
    exclude(group = "com.google.android.gms", module = "play-services-mlkit-barcode-scanning")
}
