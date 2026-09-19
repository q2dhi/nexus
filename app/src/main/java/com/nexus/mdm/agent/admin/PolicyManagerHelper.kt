package com.nexus.mdm.agent.admin

import android.app.admin.DevicePolicyManager
import android.app.admin.SystemUpdatePolicy
import android.content.ComponentName
import android.content.Context
import android.content.Intent
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
                try {
                    dpm.addUserRestriction(adminComponent, restriction)
                } catch (e: Exception) {
                    AppLogger.w("PolicyManager", "Failed applying restriction $restriction: ${e.message}")
                }
            }

            // 2. Automated Time & Timezone Enforcement
            try {
                dpm.setAutoTimeRequired(adminComponent, true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    dpm.setAutoTimeEnabled(adminComponent, true)
                    dpm.setAutoTimeZoneEnabled(adminComponent, true)
                }
            } catch (e: Exception) {
                AppLogger.w("PolicyManager", "Failed setting auto time: ${e.message}")
            }

            // 3. Automated OS System Update Policy (Immediate Automatic Updates)
            try {
                val updatePolicy = SystemUpdatePolicy.createAutomaticInstallPolicy()
                dpm.setSystemUpdatePolicy(adminComponent, updatePolicy)
            } catch (e: Exception) {
                AppLogger.w("PolicyManager", "Failed setting update policy: ${e.message}")
            }

            // 4. Stay Awake while Charging (for dedicated/COSU continuous operation)
            try {
                dpm.setGlobalSetting(
                    adminComponent,
                    android.provider.Settings.Global.STAY_ON_WHILE_PLUGGED_IN,
                    (android.os.BatteryManager.BATTERY_PLUGGED_AC or
                            android.os.BatteryManager.BATTERY_PLUGGED_USB or
                            android.os.BatteryManager.BATTERY_PLUGGED_WIRELESS).toString()
                )
            } catch (e: Exception) {
                AppLogger.w("PolicyManager", "Failed setting STAY_ON_WHILE_PLUGGED_IN: ${e.message}")
            }

            // 5. Enable Location (GPS) permanently for Google Maps & Navigation
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    dpm.setLocationEnabled(adminComponent, true)
                }
            } catch (e: Exception) {
                AppLogger.w("PolicyManager", "Failed setting setLocationEnabled: ${e.message}")
            }

            // 6. Ensure Google Maps, Play Services, and Hardware Scanner engines are enabled as system apps
            try {
                val essentialSystemPkgs = listOf(
                    "com.google.android.apps.maps",
                    "com.google.android.gms",
                    "com.honeywell.decode",
                    "com.intermec.datacollectionservice",
                    "com.honeywell.tools.cameratool",
                    "com.symbol.datawedge"
                )
                for (pkg in essentialSystemPkgs) {
                    try {
                        dpm.enableSystemApp(adminComponent, pkg)
                        dpm.setApplicationHidden(adminComponent, pkg, false)
                    } catch (_: Exception) {}
                }
            } catch (_: Exception) {}

            // 7. Keep standard Android home screen active unless Kiosk is explicitly engaged
            clearDefaultHomeLauncher()
            setStatusBarDisabled(false)

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

    /**
     * Sets Nexus DPC as the persistent default Home Launcher without showing any system chooser dialog.
     * Requires Device Owner privileges.
     */
    fun setAsDefaultHomeLauncher(): Boolean {
        if (!isDeviceOwner()) {
            AppLogger.w("PolicyManager", "Cannot set persistent home launcher: not Device Owner")
            return false
        }
        return try {
            val filter = android.content.IntentFilter(android.content.Intent.ACTION_MAIN).apply {
                addCategory(android.content.Intent.CATEGORY_HOME)
                addCategory(android.content.Intent.CATEGORY_DEFAULT)
            }
            val activityComponent = ComponentName(context.packageName, com.nexus.mdm.agent.ui.MainActivity::class.java.name)
            dpm.addPersistentPreferredActivity(adminComponent, filter, activityComponent)
            AppLogger.securityAudit("HOME_POLICY", "Persistent preferred Home Activity set to Nexus MainActivity")
            true
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Failed to set persistent preferred Home Activity", e)
            false
        }
    }

    /**
     * Automatically permits and prepares NexusAccessibilityService via Device Owner privileges.
     * Tries multiple privileged vectors: DPM permission grant, Settings.Secure write,
     * shell execution, and Honeywell OEMConfig / Enterprise Provisioner integration.
     */
    fun ensureAccessibilityServiceActive(context: Context): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            // 1. Unrestrict permitted accessibility services under DPM
            try {
                dpm.setPermittedAccessibilityServices(adminComponent, null)
            } catch (e: Exception) {
                AppLogger.w("PolicyManager", "Failed setting permitted accessibility services: ${e.message}")
            }

            // 2. Attempt to grant WRITE_SECURE_SETTINGS via DPM (supported on enterprise / OEM firmwares)
            try {
                dpm.setPermissionGrantState(
                    adminComponent,
                    context.packageName,
                    "android.permission.WRITE_SECURE_SETTINGS",
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                )
            } catch (_: Exception) {}

            val serviceClass = com.nexus.mdm.agent.remote.NexusAccessibilityService::class.java.name
            val expectedService = "${context.packageName}/$serviceClass"

            // 3. Direct Settings.Secure write (succeeds if WRITE_SECURE_SETTINGS is held)
            try {
                val current = android.provider.Settings.Secure.getString(
                    context.contentResolver,
                    android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                ) ?: ""
                val updated = if (current.isEmpty()) expectedService else if (!current.contains(expectedService)) "$current:$expectedService" else current
                android.provider.Settings.Secure.putString(
                    context.contentResolver,
                    android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
                    updated
                )
                android.provider.Settings.Secure.putString(
                    context.contentResolver,
                    android.provider.Settings.Secure.ACCESSIBILITY_ENABLED,
                    "1"
                )
                AppLogger.securityAudit("A11Y_POLICY", "Auto-enabled Accessibility Service via Settings.Secure: $updated")
            } catch (se: SecurityException) {
                AppLogger.d("PolicyManager", "Direct Settings.Secure write restricted: ${se.message}")
            }

            // 4. Shell / su invocation attempt (works on rooted, userdebug, or system shell privileged builds)
            try {
                val cmd = "settings put secure enabled_accessibility_services $expectedService && settings put secure accessibility_enabled 1"
                Runtime.getRuntime().exec(arrayOf("sh", "-c", cmd)).waitFor()
            } catch (_: Exception) {}
            try {
                val cmd = "settings put secure enabled_accessibility_services $expectedService && settings put secure accessibility_enabled 1"
                Runtime.getRuntime().exec(arrayOf("su", "-c", cmd)).waitFor()
            } catch (_: Exception) {}

            // 5. Honeywell Hardware OEM Auto-Activation
            if (android.os.Build.MANUFACTURER.contains("Honeywell", ignoreCase = true)) {
                try {
                    // Send Honeywell Enterprise settings broadcast
                    val hIntent = Intent("com.honeywell.action.SET_ACCESSIBILITY_SERVICE").apply {
                        putExtra("package", context.packageName)
                        putExtra("service", serviceClass)
                        putExtra("enable", true)
                    }
                    context.sendBroadcast(hIntent)

                    // Honeywell OEMConfig / UEMConnect push if installed
                    for (pkg in listOf("com.honeywell.oemconfig", "com.honeywell.uemconnect")) {
                        try {
                            context.packageManager.getPackageInfo(pkg, 0)
                            val bundle = android.os.Bundle().apply {
                                putString("AccessibilityServices", expectedService)
                                putBoolean("AccessibilityEnabled", true)
                            }
                            dpm.setApplicationRestrictions(adminComponent, pkg, bundle)
                            AppLogger.i("PolicyManager", "Pushed Honeywell OEMConfig accessibility bundle to $pkg")
                        } catch (_: Exception) {}
                    }
                } catch (he: Exception) {
                    AppLogger.w("PolicyManager", "Honeywell OEM auto-activation error: ${he.message}")
                }
            }

            com.nexus.mdm.agent.remote.NexusAccessibilityService.isServiceActive()
        } catch (e: Exception) {
            AppLogger.w("PolicyManager", "Could not configure accessibility service: ${e.message}")
            false
        }
    }

    /**
     * Clears the persistent preferred Home Launcher assignment.
     */
    fun clearDefaultHomeLauncher(): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            dpm.clearPackagePersistentPreferredActivities(adminComponent, context.packageName)
            AppLogger.securityAudit("HOME_POLICY", "Cleared persistent preferred Home Activity for ${context.packageName}")
            true
        } catch (e: Exception) {
            AppLogger.e("PolicyManager", "Failed to clear persistent preferred Home Activity", e)
            false
        }
    }
}
