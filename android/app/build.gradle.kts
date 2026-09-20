plugins {
    id("com.android.application")
}

android {
    namespace = "com.nexora.ai"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nexora.ai"
        minSdk = 23
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0"
    }

    signingConfigs {
        create("release") {
            storeFile =
                file(
                    System.getProperty("user.home") +
                    "/.android/debug.keystore"
                )
            storePassword = "android"
            keyAlias = "AndroidDebugKey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig =
                signingConfigs.getByName("release")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

dependencies {
}
