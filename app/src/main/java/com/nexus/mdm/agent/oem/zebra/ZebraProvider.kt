package com.nexus.mdm.agent.oem.zebra

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import com.nexus.mdm.agent.oem.CapabilityStatus
import com.nexus.mdm.agent.oem.DeviceCapabilities
import com.nexus.mdm.agent.oem.OemProvider
import com.nexus.mdm.agent.util.AppLogger
import org.json.JSONObject

class ZebraProvider : OemProvider {
    override val oemName: String = "Zebra"

    override fun discoverCapabilities(context: Context): DeviceCapabilities {
        return DeviceCapabilities(
            oem = "Zebra",
            model = Build.MODEL,
            androidVersion = Build.VERSION.SDK_INT,
            buildNumber = Build.DISPLAY ?: Build.ID,
            securityPatch = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Build.VERSION.SECURITY_PATCH else "N/A",
            mobilityEdgeGeneration = null,
            kioskSupported = CapabilityStatus.SUPPORTED,
            scannerSupported = CapabilityStatus.SUPPORTED,
            oemConfigSupported = CapabilityStatus.SUPPORTED,
            remoteControlSupported = CapabilityStatus.SUPPORTED,
            enterpriseBrowserSupported = CapabilityStatus.SUPPORTED,
            locationSupported = CapabilityStatus.SUPPORTED,
            silentInstallSupported = CapabilityStatus.SUPPORTED,
            batteryHealthSupported = CapabilityStatus.SUPPORTED,
            rawDetails = mapOf("platform" to "Zebra MX")
        )
    }

    override fun onEnterKiosk(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName, whitelistedPackages: List<String>): Boolean = true
    override fun onExitKiosk(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName): Boolean = true
    override fun configureScanner(context: Context, scannerConfig: JSONObject): Boolean = true
    override fun applyOemConfig(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName, configBundle: JSONObject): Boolean = true
    override fun getPreferredLauncherPackages(): List<String> = listOf("com.symbol.enterprisehome", "com.android.launcher3")
    override fun rebootDevice(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && dpm.isDeviceOwnerApp(adminComponent.packageName)) {
            dpm.reboot(adminComponent)
            true
        } else false
    }
}
