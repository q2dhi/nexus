# Nexus MDM Proguard Rules

# Device Admin Receiver — required by Android framework
-keep public class * extends android.app.admin.DeviceAdminReceiver
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keepclassmembers class * extends android.app.admin.DeviceAdminReceiver {
    public void on*(...);
}

# Accessibility Service — loaded by system via reflection
-keep public class com.nexus.mdm.agent.remote.NexusAccessibilityService {
    public *;
}

# OEM Providers — instantiated via reflection in OemProviderFactory
-keep class com.nexus.mdm.agent.oem.** { *; }
-keep interface com.nexus.mdm.agent.oem.OemProvider { *; }
-keep class com.nexus.mdm.agent.oem.DeviceCapabilities { *; }

# CommandDispatcher — uses method dispatch patterns
-keep class com.nexus.mdm.agent.remote.CommandDispatcher { *; }

# Screen Capture Manager — framework callback
-keep class com.nexus.mdm.agent.remote.ScreenCaptureManager { *; }

# Silent Installer status receiver — broadcast callback
-keep class com.nexus.mdm.agent.installer.InstallStatusReceiver { *; }

# Security / Crypto utilities
-keep class com.nexus.mdm.agent.util.CryptoUtils { *; }
-keep class com.nexus.mdm.agent.config.SecureConfigStore { *; }

# JSON serialization classes (used for telemetry snapshots)
-keep class com.nexus.mdm.agent.telemetry.TelemetryEngine$* { *; }

# Keep annotation metadata
-keepattributes *Annotation*
-keepclassmembers class * {
    @androidx.annotation.Keep *;
}

# Kotlin coroutines
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# AndroidX Security Crypto
-keep class androidx.security.crypto.** { *; }
-dontwarn com.google.crypto.tink.**
