package com.nexus.mdm.agent.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserManager
import com.nexus.mdm.agent.admin.NexusAdminReceiver
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Multi-App Kiosk & COSU Controller.
 * Manages dedicated device lockouts, multi-app LockTask whitelisting,
 * status bar suppression, and keyguard elimination.
 */
class KioskManager(private val context: Context) {

    private val dpm: DevicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val activityManager: ActivityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    private val adminComponent: ComponentName = NexusAdminReceiver.getComponentName(context)
    private val configStore = SecureConfigStore(context)
    private val whitelistManager = AppWhitelistManager(context)

    /**
     * Checks if the agent holds Device Owner status required for strict Kiosk enforcement.
     */
    fun isDeviceOwner(): Boolean = dpm.isDeviceOwnerApp(context.packageName)

    /**
     * Checks if the device is currently running in LockTask mode or configured as active Kiosk.
     */
    fun isKioskActive(): Boolean {
        return activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE || configStore.isKioskEnabled
    }

    /**
     * Enforces enterprise Kiosk Mode (COSU) on the provided Activity.
     * Whitelists authorized packages, strips navigation features, suppresses status bar,
     * and activates LockTask.
     */
    fun startKiosk(
        activity: Activity,
        targetPackages: List<String> = emptyList()
    ): Boolean {
        val effectivePackages = if (targetPackages.isNotEmpty()) {
            targetPackages.toMutableSet().apply { add(context.packageName) }
        } else {
            whitelistManager.getWhitelistedPackages().toMutableSet().apply { add(context.packageName) }
        }

        configStore.isKioskEnabled = true

        if (!isDeviceOwner()) {
            AppLogger.w("KioskManager", "Device Owner missing: Managing multi-app kiosk via custom launcher confinement.")
            // Do NOT call activity.startLockTask() on non-Device-Owner devices!
            // Screen pinning locks the OS to MainActivity only and blocks all other apps from opening.
            return true
        }

        return try {
            AppLogger.securityAudit(
                "KIOSK_ENGAGE",
                "Configuring multi-app LockTask (${effectivePackages.size} packages): $effectivePackages"
            )

            // 1. Whitelist packages permitted in LockTask mode
            dpm.setLockTaskPackages(adminComponent, effectivePackages.toTypedArray())

            // 2. Configure LockTask features (Completely suppress Keyguard, Status Bar, Notifications, Quick Settings, Home, Overview)
            dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)

            // 3. Suppress Keyguard and Status Bar
            dpm.setKeyguardDisabled(adminComponent, true)
            dpm.setStatusBarDisabled(adminComponent, true)

            // 4. Dedicated device user restrictions
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CREATE_WINDOWS)

            // 5. Engage LockTask on the Activity
            activity.startLockTask()
            AppLogger.i("KioskManager", "LockTask engaged successfully with multi-app support.")
            true
        } catch (e: SecurityException) {
            AppLogger.e("KioskManager", "SecurityException during Kiosk configuration", e)
            false
        } catch (e: Exception) {
            AppLogger.e("KioskManager", "Unexpected error during Kiosk engagement", e)
            false
        }
    }

    /**
     * Safely releases Kiosk Mode, restores Keyguard and Status Bar, and clears LockTask restrictions.
     */
    fun stopKiosk(activity: Activity): Boolean {
        configStore.isKioskEnabled = false
        return try {
            AppLogger.securityAudit("KIOSK_RELEASE", "Disengaging LockTask Mode")

            // 1. Stop LockTask on Activity
            try {
                activity.stopLockTask()
            } catch (e: Exception) {
                AppLogger.w("KioskManager", "Activity stopLockTask threw: ${e.message}")
            }

            // 2. Restore System UI and Keyguard if Device Owner
            if (isDeviceOwner()) {
                dpm.setKeyguardDisabled(adminComponent, false)
                dpm.setStatusBarDisabled(adminComponent, false)
                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CREATE_WINDOWS)
                // Reset lock task packages to agent only
                dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
            }

            AppLogger.i("KioskManager", "Kiosk Mode disengaged successfully.")
            true
        } catch (e: Exception) {
            AppLogger.e("KioskManager", "Error while stopping Kiosk Mode", e)
            false
        }
    }

    /**
     * Launches an authorized whitelisted application inside the active LockTask container.
     */
    fun launchWhitelistedApp(context: Context, packageName: String): Boolean {
        return try {
            var launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent == null) {
                val filterIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                    setPackage(packageName)
                }
                val resolves = context.packageManager.queryIntentActivities(filterIntent, 0)
                if (resolves.isNotEmpty()) {
                    val act = resolves[0].activityInfo
                    launchIntent = Intent(Intent.ACTION_MAIN).apply {
                        addCategory(Intent.CATEGORY_LAUNCHER)
                        component = ComponentName(act.packageName, act.name)
                    }
                }
            }

            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                context.startActivity(launchIntent)
                AppLogger.i("KioskManager", "Launched whitelisted app: $packageName")
                true
            } else {
                AppLogger.w("KioskManager", "No launchable intent found for: $packageName")
                false
            }
        } catch (e: Exception) {
            AppLogger.e("KioskManager", "Failed to launch app: $packageName", e)
            false
        }
    }
}
