package com.nexus.mdm.agent.security

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.UserManager
import com.nexus.mdm.agent.admin.NexusAdminReceiver
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Peripheral & Hardware Security Policy Manager.
 * Governs hardware isolation, data leakage prevention, screen capture restrictions,
 * and peripheral interface control.
 */
class PeripheralPolicyManager(
    private val context: Context,
    private val policyHelper: PolicyManagerHelper
) {

    private val dpm: DevicePolicyManager = policyHelper.dpm
    private val adminComponent: ComponentName = NexusAdminReceiver.getComponentName(context)

    /**
     * Controls hardware camera sensor availability across all apps.
     */
    fun setCameraEnabled(enabled: Boolean): Boolean {
        if (!policyHelper.isAdminActive()) {
            AppLogger.w("PeripheralPolicy", "Cannot modify camera policy: Device Admin inactive.")
            return false
        }

        return try {
            dpm.setCameraDisabled(adminComponent, !enabled)
            AppLogger.securityAudit("POLICY_CAMERA", "Camera hardware enabled: $enabled")
            true
        } catch (e: Exception) {
            AppLogger.e("PeripheralPolicy", "Failed to update camera policy", e)
            false
        }
    }

    fun isCameraDisabled(): Boolean {
        return dpm.getCameraDisabled(adminComponent)
    }

    /**
     * Prevents screenshots, screen recording, and secure window leaks across the device.
     */
    fun setScreenCaptureEnabled(enabled: Boolean): Boolean {
        if (!policyHelper.isDeviceOwner() && !policyHelper.isAdminActive()) {
            AppLogger.w("PeripheralPolicy", "Cannot modify screen capture policy: Admin inactive.")
            return false
        }

        return try {
            dpm.setScreenCaptureDisabled(adminComponent, !enabled)
            AppLogger.securityAudit("POLICY_SCREEN_CAPTURE", "Screen capture allowed: $enabled")
            true
        } catch (e: Exception) {
            AppLogger.e("PeripheralPolicy", "Failed to update screen capture policy", e)
            false
        }
    }

    fun isScreenCaptureDisabled(): Boolean {
        return dpm.getScreenCaptureDisabled(adminComponent)
    }

    /**
     * Prevents USB file transfers (MTP / PTP) to block physical data exfiltration.
     */
    fun setUsbDataTransferEnabled(enabled: Boolean): Boolean {
        return updateRestriction(UserManager.DISALLOW_USB_FILE_TRANSFER, !enabled, "USB_TRANSFER")
    }

    /**
     * Prevents users from pairing or configuring Bluetooth peripherals.
     */
    fun setBluetoothConfigEnabled(enabled: Boolean): Boolean {
        return updateRestriction(UserManager.DISALLOW_CONFIG_BLUETOOTH, !enabled, "BLUETOOTH_CONFIG")
    }

    /**
     * Prevents users from modifying Wi-Fi networks or adding unapproved access points.
     */
    fun setWifiConfigEnabled(enabled: Boolean): Boolean {
        return updateRestriction(UserManager.DISALLOW_CONFIG_WIFI, !enabled, "WIFI_CONFIG")
    }

    /**
     * Blocks or allows device factory reset from settings.
     */
    fun setFactoryResetAllowed(allowed: Boolean): Boolean {
        return updateRestriction(UserManager.DISALLOW_FACTORY_RESET, !allowed, "FACTORY_RESET")
    }

    /**
     * Enforces Cellular (Mobile Data) only:
     * - Disables Wi-Fi radio and blocks user from turning Wi-Fi on or configuring it.
     * - Locks Mobile Networks on, preventing the user from disabling cellular data.
     */
    fun enforceCellularOnly(enforce: Boolean): Boolean {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager

            if (enforce) {
                // 1. Shut off Wi-Fi radio
                try {
                    @Suppress("DEPRECATION")
                    wifiManager?.setWifiEnabled(false)
                } catch (e: Exception) {
                    AppLogger.w("PeripheralPolicy", "Direct setWifiEnabled(false): ${e.message}")
                }

                // 2. Add Device Owner restrictions to freeze Wi-Fi off and lock Cellular data on
                if (policyHelper.isDeviceOwner()) {
                    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_WIFI)
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                        dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CHANGE_WIFI_STATE)
                    }
                    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS)
                }

                // 3. Ensure Mobile Data is enabled
                try {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        telephonyManager?.isDataEnabled = true
                    }
                } catch (e: Exception) {
                    AppLogger.w("PeripheralPolicy", "Telephony setDataEnabled(true): ${e.message}")
                }

                AppLogger.securityAudit("POLICY_CELLULAR_ONLY", "Cellular-only policy ENFORCED (Wi-Fi off, Data locked)")
            } else {
                // Relax restrictions
                if (policyHelper.isDeviceOwner()) {
                    dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_WIFI)
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                        dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CHANGE_WIFI_STATE)
                    }
                    dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS)
                }
                AppLogger.securityAudit("POLICY_CELLULAR_ONLY", "Cellular-only policy RELAXED (Wi-Fi allowed)")
            }
            true
        } catch (e: Exception) {
            AppLogger.e("PeripheralPolicy", "Failed to toggle cellular-only policy", e)
            false
        }
    }

    private fun updateRestriction(restrictionKey: String, restrict: Boolean, auditTag: String): Boolean {
        if (!policyHelper.isDeviceOwner()) {
            AppLogger.w("PeripheralPolicy", "Restriction '$restrictionKey' requires Device Owner privileges.")
            return false
        }

        return try {
            if (restrict) {
                dpm.addUserRestriction(adminComponent, restrictionKey)
            } else {
                dpm.clearUserRestriction(adminComponent, restrictionKey)
            }
            AppLogger.securityAudit("POLICY_RESTRICTION", "$auditTag restricted: $restrict")
            true
        } catch (e: Exception) {
            AppLogger.e("PeripheralPolicy", "Failed to update restriction: $restrictionKey", e)
            false
        }
    }
}
