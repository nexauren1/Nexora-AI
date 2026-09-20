plugins {
    id("com.android.application")
}
android {
    namespace = "com.nexora.ai"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }
    defaultConfig {
        applicationId = "com.nexora.ai"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE_URL", "\"https://red-dawn-ded1.workers.dev\"")
    }
}
dependencies {
}
