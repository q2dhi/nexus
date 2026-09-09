package com.nexus.mdm.agent.oem.samsung

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import com.nexus.mdm.agent.oem.CapabilityStatus
import com.nexus.mdm.agent.oem.DeviceCapabilities
import com.nexus.mdm.agent.oem.OemProvider
import org.json.JSONObject

class SamsungProvider : OemProvider {
    override val oemName: String = "Samsung"

    override fun discoverCapabilities(context: Context): DeviceCapabilities {
        return DeviceCapabilities(
            oem = "Samsung",
            model = Build.MODEL,
            androidVersion = Build.VERSION.SDK_INT,
            buildNumber = Build.DISPLAY ?: Build.ID,
            securityPatch = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Build.VERSION.SECURITY_PATCH else "N/A",
            mobilityEdgeGeneration = null,
            kioskSupported = CapabilityStatus.SUPPORTED,
            scannerSupported = CapabilityStatus.UNSUPPORTED,
            oemConfigSupported = CapabilityStatus.SUPPORTED,
            remoteControlSupported = CapabilityStatus.SUPPORTED,
            enterpriseBrowserSupported = CapabilityStatus.UNSUPPORTED,
            locationSupported = CapabilityStatus.SUPPORTED,
            silentInstallSupported = CapabilityStatus.SUPPORTED,
            batteryHealthSupported = CapabilityStatus.SUPPORTED,
            rawDetails = mapOf("platform" to "Samsung Knox")
        )
    }

    override fun onEnterKiosk(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName, whitelistedPackages: List<String>): Boolean = true
    override fun onExitKiosk(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName): Boolean = true
    override fun configureScanner(context: Context, scannerConfig: JSONObject): Boolean = false
    override fun applyOemConfig(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName, configBundle: JSONObject): Boolean = true
    override fun getPreferredLauncherPackages(): List<String> = listOf("com.sec.android.app.launcher", "com.android.launcher3")
    override fun rebootDevice(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && dpm.isDeviceOwnerApp(adminComponent.packageName)) {
            dpm.reboot(adminComponent)
            true
        } else false
    }
}
