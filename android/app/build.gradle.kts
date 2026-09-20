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
        versionCode = 4
        versionName = "0.4.0"
    }

    buildTypes {
        getByName("release") {
            signingConfig =
                signingConfigs.getByName(
                    "debug"
                )
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

dependencies {
}
