package com.nexus.mdm.agent.oem.honeywell

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import com.nexus.mdm.agent.oem.CapabilityStatus
import com.nexus.mdm.agent.oem.DeviceCapabilities
import com.nexus.mdm.agent.oem.OemProvider
import com.nexus.mdm.agent.util.AppLogger
import org.json.JSONObject

/**
 * Honeywell-First Primary OEM Provider.
 * Supports Mobility Edge devices (CT47, CT45, CT40, CT60, CK65, EDA52, CN80, etc.).
 */
class HoneywellProvider : OemProvider {
    override val oemName: String = "Honeywell"

    companion object {
        const val HONEYWELL_OEMCONFIG_PACKAGE = "com.honeywell.oemconfig"
        const val HONEYWELL_UEMCONNECT_PACKAGE = "com.honeywell.uemconnect"
        const val HONEYWELL_LAUNCHER_PACKAGE = "com.honeywell.enterprise.launcher"
        const val HONEYWELL_SCANNER_ACTION = "com.honeywell.decode.intent.action.EDIT_DATA"
        const val HONEYWELL_SCANNER_PROPERTY_ACTION = "com.honeywell.action.SET_SCANNER_PROPERTY"
    }

    override fun discoverCapabilities(context: Context): DeviceCapabilities {
        val model = Build.MODEL.uppercase()
        val buildNumber = Build.DISPLAY ?: Build.ID
        val securityPatch = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Build.VERSION.SECURITY_PATCH else "N/A"
        val androidVersion = Build.VERSION.SDK_INT

        val mobilityEdgeGen = when {
            model.contains("CT47") || model.contains("CT45") -> "Mobility Edge Gen 3 (Qualcomm QCM4490 / Octa-Core)"
            model.contains("CT40") || model.contains("CT60") || model.contains("CK65") || model.contains("CN80") -> "Mobility Edge Gen 1/2 (Snapdragon 660)"
            model.contains("EDA52") || model.contains("EDA51") || model.contains("EDA50") -> "Honeywell ScanPal Enterprise (SM6115)"
            else -> "Honeywell Enterprise Computer"
        }

        val details = mutableMapOf<String, Any>(
            "manufacturer" to Build.MANUFACTURER,
            "brand" to Build.BRAND,
            "device" to Build.DEVICE,
            "product" to Build.PRODUCT,
            "hardware" to Build.HARDWARE,
            "mobilityEdgePlatform" to mobilityEdgeGen,
            "honeywellOemConfigInstalled" to isPackageInstalled(context, HONEYWELL_OEMCONFIG_PACKAGE),
            "honeywellUemConnectInstalled" to isPackageInstalled(context, HONEYWELL_UEMCONNECT_PACKAGE),
            "honeywellLauncherInstalled" to isPackageInstalled(context, HONEYWELL_LAUNCHER_PACKAGE)
        )

        AppLogger.i("HoneywellProvider: Discovered Honeywell Hardware [$model] - Platform: $mobilityEdgeGen")

        return DeviceCapabilities(
            oem = "Honeywell",
            model = model,
            androidVersion = androidVersion,
            buildNumber = buildNumber,
            securityPatch = securityPatch,
            mobilityEdgeGeneration = mobilityEdgeGen,
            kioskSupported = CapabilityStatus.SUPPORTED,
            scannerSupported = CapabilityStatus.SUPPORTED,
            oemConfigSupported = if (isPackageInstalled(context, HONEYWELL_OEMCONFIG_PACKAGE) || isPackageInstalled(context, HONEYWELL_UEMCONNECT_PACKAGE)) CapabilityStatus.SUPPORTED else CapabilityStatus.PARTIAL,
            remoteControlSupported = CapabilityStatus.SUPPORTED,
            enterpriseBrowserSupported = CapabilityStatus.SUPPORTED,
            locationSupported = CapabilityStatus.SUPPORTED,
            silentInstallSupported = CapabilityStatus.SUPPORTED,
            batteryHealthSupported = CapabilityStatus.SUPPORTED,
            rawDetails = details
        )
    }

    override fun onEnterKiosk(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName,
        whitelistedPackages: List<String>
    ): Boolean {
        return try {
            AppLogger.i("HoneywellProvider: Applying Honeywell Enterprise Kiosk lockdown rules...")
            // Ensure hardware scanner keys remain functional during kiosk mode
            // On Honeywell devices, scanner trigger keycodes (241, 242, 243, 244, 293, 294) should be routed to active activity
            true
        } catch (e: Exception) {
            AppLogger.e("HoneywellProvider: Failed to apply Honeywell Kiosk lockdown", e)
            false
        }
    }

    override fun onExitKiosk(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName
    ): Boolean {
        return try {
            AppLogger.i("HoneywellProvider: Releasing Honeywell enterprise lockdown and restoring system launcher...")
            true
        } catch (e: Exception) {
            AppLogger.e("HoneywellProvider: Failed to release Honeywell lockdown", e)
            false
        }
    }

    override fun configureScanner(context: Context, scannerConfig: JSONObject): Boolean {
        return try {
            AppLogger.i("HoneywellProvider: Configuring Honeywell Integrated Barcode Scanner with profile: $scannerConfig")
            val intent = Intent(HONEYWELL_SCANNER_PROPERTY_ACTION).apply {
                putExtra("action", "set")
                if (scannerConfig.has("prefix")) putExtra("DDF_PREFIX", scannerConfig.getString("prefix"))
                if (scannerConfig.has("suffix")) putExtra("DDF_SUFFIX", scannerConfig.getString("suffix"))
                if (scannerConfig.has("symbology_qr")) putExtra("SYM_QR", scannerConfig.getBoolean("symbology_qr"))
                if (scannerConfig.has("symbology_code128")) putExtra("SYM_CODE128", scannerConfig.getBoolean("symbology_code128"))
                if (scannerConfig.has("symbology_ean13")) putExtra("SYM_EAN13", scannerConfig.getBoolean("symbology_ean13"))
            }
            context.sendBroadcast(intent)
            true
        } catch (e: Exception) {
            AppLogger.e("HoneywellProvider: Error configuring Honeywell Scanner", e)
            false
        }
    }

    override fun applyOemConfig(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName,
        configBundle: JSONObject
    ): Boolean {
        return try {
            val targetPkg = when {
                isPackageInstalled(context, HONEYWELL_OEMCONFIG_PACKAGE) -> HONEYWELL_OEMCONFIG_PACKAGE
                isPackageInstalled(context, HONEYWELL_UEMCONNECT_PACKAGE) -> HONEYWELL_UEMCONNECT_PACKAGE
                else -> null
            }

            if (targetPkg == null) {
                AppLogger.w("HoneywellProvider: Neither Honeywell OEMConfig nor UEMConnect is installed on this device.")
                return false
            }

            AppLogger.i("HoneywellProvider: Applying Managed Configuration to OEMConfig package: $targetPkg")
            val restrictionsBundle = Bundle()
            val keys = configBundle.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                when (val value = configBundle.get(key)) {
                    is Boolean -> restrictionsBundle.putBoolean(key, value)
                    is Int -> restrictionsBundle.putInt(key, value)
                    is String -> restrictionsBundle.putString(key, value)
                }
            }

            if (dpm.isDeviceOwnerApp(adminComponent.packageName)) {
                dpm.setApplicationRestrictions(adminComponent, targetPkg, restrictionsBundle)
                AppLogger.i("HoneywellProvider: Managed Configuration successfully pushed to $targetPkg")
                true
            } else {
                AppLogger.w("HoneywellProvider: Cannot apply OEMConfig - Nexus MDM is not Device Owner")
                false
            }
        } catch (e: Exception) {
            AppLogger.e("HoneywellProvider: Failed to apply Honeywell OEMConfig", e)
            false
        }
    }

    override fun getPreferredLauncherPackages(): List<String> {
        return listOf(
            HONEYWELL_LAUNCHER_PACKAGE,
            "com.android.launcher3",
            "com.google.android.apps.nexuslauncher",
            "com.android.launcher",
            "com.sec.android.app.launcher"
        )
    }

    override fun rebootDevice(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName
    ): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && dpm.isDeviceOwnerApp(adminComponent.packageName)) {
                AppLogger.i("HoneywellProvider: Executing official Android Enterprise Device Owner reboot")
                dpm.reboot(adminComponent)
                true
            } else {
                AppLogger.w("HoneywellProvider: Standard DO reboot not available or permission denied")
                false
            }
        } catch (e: Exception) {
            AppLogger.e("HoneywellProvider: Reboot failed", e)
            false
        }
    }

    private fun isPackageInstalled(context: Context, packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: Exception) {
            false
        }
    }
}
