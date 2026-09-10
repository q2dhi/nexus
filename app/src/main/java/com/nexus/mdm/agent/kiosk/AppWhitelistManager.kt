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
                    isWhitelisted = isPackageAllowed(pkgName, whitelistedSet)
                )
            }
            .distinctBy { it.packageName }
            .sortedBy { it.appName.lowercase() }
    }

    companion object {
        val CAMERA_PACKAGES = setOf(
            "org.codeaurora.snapcam",
            "com.android.camera2",
            "com.google.android.GoogleCamera",
            "com.honeywell.camera",
            "com.android.camera",
            "com.sec.android.app.camera"
        )

        val CALCULATOR_PACKAGES = setOf(
            "com.google.android.calculator",
            "com.android.calculator2",
            "com.android.calculator",
            "com.sec.android.app.popupcalculator"
        )

        val FILES_PACKAGES = setOf(
            "com.android.documentsui",
            "com.google.android.apps.nbu.files",
            "com.honeywell.filebrowser",
            "com.sec.android.app.myfiles"
        )

        val SETTINGS_PACKAGES = setOf(
            "com.honeywell.systemsettings",
            "com.honeywell.tools.ezconfig",
            "com.android.settings"
        )

        val BROWSER_PACKAGES = setOf(
            "com.honeywell.enterprisebrowser",
            "com.android.chrome"
        )

        val SCANNER_PACKAGES = setOf(
            "com.honeywell.decode",
            "com.honeywell.demos.scandemo",
            "com.honeywell.tools.scanwedge"
        )

        val MAPS_PACKAGES = setOf(
            "com.google.android.apps.maps",
            "com.google.android.apps.mapslite"
        )

        val SYSTEM_LOCK_TASK_PACKAGES = setOf(
            "com.google.android.gms",                 // Google Play Services (required for Maps, Firebase, SafetyNet, Auth)
            "com.google.android.gsf",                 // Google Services Framework
            "com.google.android.permissioncontroller",// Google Permission Controller
            "com.android.permissioncontroller",       // AOSP Permission Controller
            "com.google.android.packageinstaller",    // Package Installer dialogs
            "com.android.packageinstaller",           // AOSP Package Installer
            "com.android.settings",                   // Android Settings (GPS/Wi-Fi toggle dialogs)
            "com.google.android.location",            // Location services
            "com.google.android.apps.maps",           // Google Maps
            "com.google.android.apps.mapslite",       // Google Maps Lite
            "com.android.systemui",                   // System UI
            "com.android.chrome",                     // Chrome / Custom Tabs
            "com.google.android.webview",             // Webview
            "com.android.webview",                    // AOSP Webview
            "com.android.vending"                     // Google Play Store
        )

        val DEFAULT_ENTERPRISE_APPS = setOf(
            "org.codeaurora.snapcam",
            "com.android.camera2",
            "com.google.android.calculator",
            "com.android.calculator2",
            "com.honeywell.decode",
            "com.honeywell.demos.scandemo",
            "com.honeywell.systemsettings",
            "com.android.chrome",
            "com.google.android.apps.maps"
        )

        /**
         * Checks if an installed package matches the whitelist, supporting device family aliases
         * (e.g. org.codeaurora.snapcam matches Honeywell Camera, com.google.android.calculator matches Calculator).
         */
        fun isPackageAllowed(installedPkg: String, whitelistedPackages: Set<String>): Boolean {
            if (whitelistedPackages.contains(installedPkg)) return true
            if (whitelistedPackages.any { it.equals(installedPkg, ignoreCase = true) }) return true

            // Camera family
            val isCamera = CAMERA_PACKAGES.contains(installedPkg) || installedPkg.contains("camera", ignoreCase = true)
            if (isCamera && whitelistedPackages.any { CAMERA_PACKAGES.contains(it) || it.contains("camera", ignoreCase = true) }) {
                return true
            }

            // Calculator family
            val isCalc = CALCULATOR_PACKAGES.contains(installedPkg) || installedPkg.contains("calculator", ignoreCase = true)
            if (isCalc && whitelistedPackages.any { CALCULATOR_PACKAGES.contains(it) || it.contains("calculator", ignoreCase = true) }) {
                return true
            }

            // Maps family
            val isMaps = MAPS_PACKAGES.contains(installedPkg) || installedPkg.contains("maps", ignoreCase = true)
            if (isMaps && whitelistedPackages.any { MAPS_PACKAGES.contains(it) || it.contains("maps", ignoreCase = true) }) {
                return true
            }

            // Files family
            val isFiles = FILES_PACKAGES.contains(installedPkg)
            if (isFiles && whitelistedPackages.any { FILES_PACKAGES.contains(it) }) {
                return true
            }

            // Settings & Tools
            val isSettings = SETTINGS_PACKAGES.contains(installedPkg)
            if (isSettings && whitelistedPackages.any { SETTINGS_PACKAGES.contains(it) }) {
                return true
            }

            // Browser
            val isBrowser = BROWSER_PACKAGES.contains(installedPkg)
            if (isBrowser && whitelistedPackages.any { BROWSER_PACKAGES.contains(it) }) {
                return true
            }

            // Scanner
            val isScanner = SCANNER_PACKAGES.contains(installedPkg)
            if (isScanner && whitelistedPackages.any { SCANNER_PACKAGES.contains(it) }) {
                return true
            }

            return false
        }
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
            val whitelisted = getWhitelistedPackages().toMutableSet()
            // Nexus agent itself must always be included in the lock task packages
            if (!whitelisted.contains(context.packageName)) {
                whitelisted.add(context.packageName)
            }

            // Always add system & Google support packages so Maps, Play Services, and Permissions dialogs work flawlessly
            whitelisted.addAll(SYSTEM_LOCK_TASK_PACKAGES)

            // Auto-expand LockTask to include any installed app matching alias rules
            val installed = getInstalledLaunchableApps()
            for (app in installed) {
                if (isPackageAllowed(app.packageName, whitelisted)) {
                    whitelisted.add(app.packageName)
                }
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
