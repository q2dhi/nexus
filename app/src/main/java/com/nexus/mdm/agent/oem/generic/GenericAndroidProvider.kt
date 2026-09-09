package com.nexus.mdm.agent.oem.generic

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import com.nexus.mdm.agent.oem.CapabilityStatus
import com.nexus.mdm.agent.oem.DeviceCapabilities
import com.nexus.mdm.agent.oem.OemProvider
import com.nexus.mdm.agent.util.AppLogger
import org.json.JSONObject

class GenericAndroidProvider : OemProvider {
    override val oemName: String = "GenericAndroid"

    override fun discoverCapabilities(context: Context): DeviceCapabilities {
        val model = Build.MODEL
        val buildNumber = Build.DISPLAY ?: Build.ID
        val securityPatch = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Build.VERSION.SECURITY_PATCH else "N/A"
        val androidVersion = Build.VERSION.SDK_INT

        return DeviceCapabilities(
            oem = Build.MANUFACTURER ?: "Android",
            model = model,
            androidVersion = androidVersion,
            buildNumber = buildNumber,
            securityPatch = securityPatch,
            mobilityEdgeGeneration = null,
            kioskSupported = CapabilityStatus.SUPPORTED,
            scannerSupported = CapabilityStatus.UNSUPPORTED,
            oemConfigSupported = CapabilityStatus.UNSUPPORTED,
            remoteControlSupported = CapabilityStatus.PARTIAL,
            enterpriseBrowserSupported = CapabilityStatus.UNSUPPORTED,
            locationSupported = CapabilityStatus.SUPPORTED,
            silentInstallSupported = CapabilityStatus.SUPPORTED,
            batteryHealthSupported = CapabilityStatus.SUPPORTED,
            rawDetails = mapOf(
                "manufacturer" to Build.MANUFACTURER,
                "brand" to Build.BRAND,
                "hardware" to Build.HARDWARE
            )
        )
    }

    override fun onEnterKiosk(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName,
        whitelistedPackages: List<String>
    ): Boolean = true

    override fun onExitKiosk(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName
    ): Boolean = true

    override fun configureScanner(context: Context, scannerConfig: JSONObject): Boolean {
        AppLogger.w("GenericAndroidProvider: Hardware barcode scanner not supported on generic device")
        return false
    }

    override fun applyOemConfig(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName,
        configBundle: JSONObject
    ): Boolean {
        AppLogger.w("GenericAndroidProvider: OEMConfig not available on generic device")
        return false
    }

    override fun getPreferredLauncherPackages(): List<String> {
        return listOf(
            "com.android.launcher3",
            "com.google.android.apps.nexuslauncher",
            "com.android.launcher",
            "com.sec.android.app.launcher",
            "com.miui.home"
        )
    }

    override fun rebootDevice(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName
    ): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && dpm.isDeviceOwnerApp(adminComponent.packageName)) {
                dpm.reboot(adminComponent)
                true
            } else {
                false
            }
        } catch (e: Exception) {
            AppLogger.e("GenericAndroidProvider: Reboot failed", e)
            false
        }
    }
}
