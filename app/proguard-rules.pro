# Nexus MDM Proguard Rules
-keep public class * extends android.app.admin.DeviceAdminReceiver
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keepclassmembers class * extends android.app.admin.DeviceAdminReceiver {
    public void on*(...);
}
-keepattributes *Annotation*
-keepclassmembers class * {
    @androidx.annotation.Keep *;
}
