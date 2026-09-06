package com.nexus.mdm.agent.kiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Multi-App Whitelist Manager.
 * Queries installed user applications, tracks authorized packages for Kiosk mode,
 * and synchronizes the lock-task package policy with DevicePolicyManager.
 */
class AppWhitelistManager(private val context: Context) {

    data class AppItem(
        val packageName: String,
        val appName: String,
        val icon: Drawable,
        var isWhitelisted: Boolean
    )

    private val packageManager: PackageManager = context.packageManager
    private val configStore = SecureConfigStore(context)

    /**
     * Retrieves all user-launchable applications installed on the device.
     */
    fun getInstalledLaunchableApps(): List<AppItem> {
        val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        val resolveInfos = try {
            packageManager.queryIntentActivities(launcherIntent, 0)
        } catch (_: Exception) {
            emptyList()
        }
        val whitelistedSet = configStore.whitelistedPackages

        return resolveInfos
            .filter { it.activityInfo != null && it.activityInfo.packageName != context.packageName }
            .map { resolveInfo ->
                val pkgName = resolveInfo.activityInfo.packageName
                val label = try {
                    resolveInfo.loadLabel(packageManager).toString()
                } catch (_: Exception) {
                    pkgName
                }
                val icon = try {
                    resolveInfo.loadIcon(packageManager)
                } catch (_: Exception) {
                    packageManager.defaultActivityIcon
                }
                AppItem(
                    packageName = pkgName,
                    appName = label,
                    icon = icon,
                    isWhitelisted = whitelistedSet.contains(pkgName)
                )
            }
            .distinctBy { it.packageName }
            .sortedBy { it.appName.lowercase() }
    }

    companion object {
        val DEFAULT_ENTERPRISE_APPS = setOf(
            "com.sec.android.app.popupcalculator",
            "com.google.android.calculator",
            "com.android.chrome",
            "com.sec.android.app.camera",
            "com.google.android.GoogleCamera"
        )
    }

    /**
     * Gets the currently saved set of whitelisted packages for Kiosk mode.
     */
    fun getWhitelistedPackages(): Set<String> {
        return configStore.whitelistedPackages
    }

    /**
     * Saves the updated set of whitelisted packages.
     */
    fun saveWhitelistedPackages(packages: Set<String>) {
        configStore.whitelistedPackages = packages
        AppLogger.securityAudit(
            "WHITELIST_UPDATED",
            "Whitelisted packages updated (${packages.size} apps): ${packages.joinToString()}"
        )
    }

    /**
     * Synchronizes the LockTask package whitelist with DevicePolicyManager.
     */
    fun syncWithDevicePolicyManager(dpm: DevicePolicyManager, admin: ComponentName): Boolean {
        return try {
            val whitelisted = getWhitelistedPackages().toMutableList()
            // Nexus agent itself must always be included in the lock task packages
            if (!whitelisted.contains(context.packageName)) {
                whitelisted.add(context.packageName)
            }

            dpm.setLockTaskPackages(admin, whitelisted.toTypedArray())
            AppLogger.i("WhitelistManager", "DPM LockTask packages synchronized: $whitelisted")
            true
        } catch (e: Exception) {
            AppLogger.e("WhitelistManager", "Failed to sync LockTask packages to DPM", e)
            false
        }
    }
}
