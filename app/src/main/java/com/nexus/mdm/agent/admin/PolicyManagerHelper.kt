package com.nexus.mdm.agent.admin

import android.app.admin.DevicePolicyManager
import android.app.admin.SystemUpdatePolicy
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Policy Manager Helper.
 * Encapsulates privileged DevicePolicyManager invocations with zero-trust validation
 * and comprehensive audit logging.
 */
class PolicyManagerHelper(private val context: Context) {

    val dpm: DevicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val adminComponent: ComponentName = NexusAdminReceiver.getComponentName(context)

    /**
     * Verifies if this agent holds full Device Owner privileges on the device.
     */
    fun isDeviceOwner(): Boolean {
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    /**
     * Verifies if the Device Admin component is currently active.
     */
    fun isAdminActive(): Boolean {
        return dpm.isAdminActive(adminComponent)
    }

    /**
     * Enforces the baseline zero-trust security profile upon initial device enrollment.
     */
    fun applyBaselineSecurityPolicies(): Boolean {
        if (!isDeviceOwner()) {
            AppLogger.w("PolicyManager", "Skipping baseline policy enforcement: Agent is NOT Device Owner.")
            return false
        }

        try {
            AppLogger.securityAudit("ENROLLMENT_BASELINE", "Applying baseline enterprise security restrictions")

            // 1. Critical User Restrictions
            val criticalRestrictions = listOf(
                UserManager.DISALLOW_FACTORY_RESET,
                UserManager.DISALLOW_SAFE_BOOT,
                UserManager.DISALLOW_ADD_USER,
                UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA,
                UserManager.DISALLOW_USB_FILE_TRANSFER,
                UserManager.DISALLOW_UNINSTALL_APPS,
                UserManager.DISALLOW_CONFIG_DATE_TIME,
                UserManager.DISALLOW_NETWORK_RESET
            )

            for (restriction in criticalRestrictions) {
                dpm.addUserRestriction(adminComponent, restriction)
            }

            // 2. Automated Time & Timezone Enforcement
            dpm.setAutoTimeRequired(adminComponent, true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                dpm.setAutoTimeEnabled(adminComponent, true)
                dpm.setAutoTimeZoneEnabled(adminComponent, true)
            }

            // 3. Automated OS System Update Policy (Immediate Automatic Updates)
            val updatePolicy = SystemUpdatePolicy.createAutomaticInstallPolicy()
            dpm.setSystemUpdatePolicy(adminComponent, updatePolicy)

            // 4. Stay Awake while Charging (for dedicated/COSU continuous operation)
            dpm.setGlobalSetting(
                adminComponent,
                android.provider.Settings.Global.STAY_ON_WHILE_PLUGGED_IN,
                (android.os.BatteryManager.BATTERY_PLUGGED_AC or
                        android.os.BatteryManager.BATTERY_PLUGGED_USB or
                        android.os.BatteryManager.BATTERY_PLUGGED_WIRELESS).toString()
            )

            AppLogger.i("PolicyManager", "Baseline enterprise security profile applied successfully.")
            return true
        } catch (e: SecurityException) {
            AppLogger.e("PolicyManager", "SecurityException applying baseline policies", e)
            return false
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Unexpected error applying baseline policies", e)
            return false
        }
    }

    /**
     * Clears enterprise baseline user restrictions (e.g. during maintenance or decommissioning).
     */
    fun clearEnterpriseRestrictions(): Boolean {
        if (!isDeviceOwner()) {
            AppLogger.w("PolicyManager", "Cannot clear restrictions: Agent is NOT Device Owner.")
            return false
        }

        return try {
            val restrictions = listOf(
                UserManager.DISALLOW_FACTORY_RESET,
                UserManager.DISALLOW_SAFE_BOOT,
                UserManager.DISALLOW_ADD_USER,
                UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA,
                UserManager.DISALLOW_USB_FILE_TRANSFER,
                UserManager.DISALLOW_UNINSTALL_APPS,
                UserManager.DISALLOW_CONFIG_DATE_TIME,
                UserManager.DISALLOW_NETWORK_RESET
            )

            for (r in restrictions) {
                dpm.clearUserRestriction(adminComponent, r)
            }
            AppLogger.i("PolicyManager", "Baseline user restrictions cleared successfully.")
            true
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Failed to clear restrictions", e)
            false
        }
    }

    /**
     * Enables or disables hardware camera access across all profiles on the device.
     */
    fun setCameraDisabled(disabled: Boolean): Boolean {
        if (!isAdminActive()) return false
        return try {
            dpm.setCameraDisabled(adminComponent, disabled)
            AppLogger.securityAudit("CAMERA_POLICY", "Hardware camera disabled: $disabled")
            true
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Failed to update camera policy", e)
            false
        }
    }

    /**
     * Disables or re-enables the system keyguard.
     */
    fun setKeyguardDisabled(disabled: Boolean): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            dpm.setKeyguardDisabled(adminComponent, disabled)
            AppLogger.i("PolicyManager", "Keyguard disabled set to: $disabled")
            true
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Failed to set keyguard disabled state", e)
            false
        }
    }

    /**
     * Disables or re-enables the system status bar (requires Device Owner).
     */
    fun setStatusBarDisabled(disabled: Boolean): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            dpm.setStatusBarDisabled(adminComponent, disabled)
            AppLogger.i("PolicyManager", "Status bar disabled set to: $disabled")
            true
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Failed to set status bar state", e)
            false
        }
    }

    /**
     * Initiates an enterprise remote device reboot.
     */
    fun rebootDevice(): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            AppLogger.securityAudit("REMOTE_REBOOT", "Triggering device reboot via DPM")
            dpm.reboot(adminComponent)
            true
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Reboot failed", e)
            false
        }
    }
}
