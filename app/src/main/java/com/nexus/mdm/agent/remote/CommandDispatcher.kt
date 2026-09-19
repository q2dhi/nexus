package com.nexus.mdm.agent.remote

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.installer.SilentInstaller
import com.nexus.mdm.agent.kiosk.KioskManager
import com.nexus.mdm.agent.security.PeripheralPolicyManager
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Enterprise Remote MDM Command Dispatcher.
 * Ingests JSON instructions, maps them to type-safe MdmCommand models,
 * and orchestrates administrative execution across system subsystems.
 */
class CommandDispatcher(
    private val context: Context,
    private val policyHelper: PolicyManagerHelper,
    private val kioskManager: KioskManager,
    private val silentInstaller: SilentInstaller,
    private val peripheralManager: PeripheralPolicyManager
) {

    /**
     * Parses a raw JSON command string and executes the corresponding action.
     */
    suspend fun dispatchJsonCommand(
        jsonString: String,
        currentActivity: Activity? = null
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject(jsonString)
            val action = json.getString("command")

            AppLogger.securityAudit("REMOTE_CMD_RECEIVED", "Processing remote command: $action")

            when (action.uppercase()) {
                "LOCK_DEVICE" -> {
                    val message = json.optString("message", "Locked by Administrator")
                    executeLockDevice(message)
                }

                "REBOOT" -> {
                    val reason = json.optString("reason", "Remote maintenance")
                    executeReboot(reason)
                }

                "WIPE_DATA", "WIPE_DEVICE" -> {
                    val wipeStorage = json.optBoolean("wipe_external", false)
                    executeWipeData(wipeStorage)
                }

                "SET_KIOSK_MODE" -> {
                    val enable = when {
                        json.has("enable") -> json.getBoolean("enable")
                        json.has("enabled") -> json.getBoolean("enabled")
                        else -> false
                    }
                    executeKioskMode(enable, currentActivity)
                }

                "EXIT_KIOSK", "STOP_KIOSK", "DISABLE_KIOSK" -> {
                    executeKioskMode(false, currentActivity)
                }

                "TOUCH_CLICK", "TAP" -> {
                    val x = json.optDouble("xRatio", json.optDouble("x", 0.5)).toFloat()
                    val y = json.optDouble("yRatio", json.optDouble("y", 0.5)).toFloat()
                    val tapAction = JSONObject().apply {
                        put("action", "tap")
                        put("xRatio", x.toDouble())
                        put("yRatio", y.toDouble())
                    }
                    RemoteInputExecutor.executeAction(context, tapAction)
                    Result.success("Touch click executed at ($x, $y)")
                }

                "SWIPE", "DRAG" -> {
                    val swipeAction = JSONObject().apply {
                        put("action", "swipe")
                        put("startXRatio", json.optDouble("startXRatio", 0.5))
                        put("startYRatio", json.optDouble("startYRatio", 0.8))
                        put("endXRatio", json.optDouble("endXRatio", 0.5))
                        put("endYRatio", json.optDouble("endYRatio", 0.2))
                        put("duration", json.optLong("duration", 300L))
                        put("direction", json.optString("direction", "up"))
                    }
                    RemoteInputExecutor.executeAction(context, swipeAction)
                    Result.success("Swipe gesture executed.")
                }

                "SEND_KEY", "KEY" -> {
                    val keyName = json.optString("key", "BACK")
                    val keyAction = JSONObject().apply {
                        put("action", "key")
                        put("key", keyName)
                    }
                    RemoteInputExecutor.executeAction(context, keyAction)
                    Result.success("Hardware key executed: $keyName")
                }

                "INPUT_TEXT", "TYPE_TEXT" -> {
                    val text = json.optString("text", "")
                    val textAction = JSONObject().apply {
                        put("action", "text")
                        put("text", text)
                    }
                    RemoteInputExecutor.executeAction(context, textAction)
                    Result.success("Text input executed: $text")
                }

                "SHOW_NOTIFICATION", "BROADCAST_MESSAGE", "SEND_MESSAGE" -> {
                    val title = json.optString("title", "رسالة من إدارة النظام")
                    val message = json.optString("message", json.optString("text", "إشعار من الإدارة"))
                    executeShowMessage(title, message)
                }

                "CALL_DEVICE", "INCOMING_CALL", "AUDIO_CALL" -> {
                    val caller = json.optString("caller", "إدارة النظام المركزية")
                    executeIncomingCall(caller)
                }

                "END_CALL", "CANCEL_CALL" -> {
                    executeEndCall()
                }

                "INSTALL_APK_FROM_URL" -> {
                    val downloadUrl = json.getString("url")
                    val pkgName = json.optString("package_name", "managed_app")
                    executeInstallFromUrl(downloadUrl, pkgName)
                }

                "INSTALL_PLAY_STORE_APP" -> {
                    val pkgName = json.optString("package_name", "")
                    if (pkgName.isNotEmpty()) {
                        executeInstallPlayStoreApp(pkgName)
                    } else {
                        Result.failure(IllegalArgumentException("Missing package_name for Google Play app"))
                    }
                }

                "SET_PERIPHERAL_POLICY" -> {
                    val key = json.getString("policy_key")
                    val enabled = json.getBoolean("enabled")
                    executeSetPeripheral(key, enabled)
                }

                "SET_WHITELIST" -> {
                    val pkgsArray = json.optJSONArray("packages")
                    val pkgSet = mutableSetOf<String>()
                    if (pkgsArray != null) {
                        for (i in 0 until pkgsArray.length()) {
                            val p = pkgsArray.getString(i).trim()
                            if (p.isNotEmpty()) pkgSet.add(p)
                        }
                    }
                    executeSetWhitelist(pkgSet)
                }

                "ENFORCE_CELLULAR_ONLY" -> {
                    val enabled = json.optBoolean("enabled", true)
                    val success = peripheralManager.enforceCellularOnly(enabled)
                    if (success) {
                        Result.success("Cellular-only policy enforced: $enabled")
                    } else {
                        Result.failure(RuntimeException("Failed to apply cellular-only policy"))
                    }
                }

                "START_SCREEN_STREAM" -> {
                    val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
                    val androidId = try {
                        android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "DEVICE"
                    } catch (_: Exception) { "DEVICE" }
                    val deviceId = "${android.os.Build.MANUFACTURER}_${android.os.Build.MODEL}_${androidId.takeLast(6)}"

                    // Automatically illuminate and wake screen if sleeping so stream immediately captures active display
                    DeviceWakeManager.wakeUpScreen(context)

                    // Start stream immediately using applicationContext (system-wide capture)
                    ScreenCaptureManager.startStream(context.applicationContext, configStore.serverUrl, deviceId)

                    // Ensure MainActivity is ready if accessibility service is not yet enabled
                    if (NexusAccessibilityService.instance == null && com.nexus.mdm.agent.ui.MainActivity.instance == null) {
                        try {
                            val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                                putExtra("EXTRA_START_SCREEN_STREAM", true)
                                putExtra("EXTRA_SERVER_URL", configStore.serverUrl)
                                putExtra("EXTRA_DEVICE_ID", deviceId)
                            }
                            context.startActivity(intent)
                        } catch (_: Exception) {}
                    }
                    Result.success("Live screen streaming initiated.")
                }

                "STOP_SCREEN_STREAM" -> {
                    ScreenCaptureManager.stopStream()
                    Result.success("Live screen streaming stopped.")
                }

                "OPEN_ACCESSIBILITY_SETTINGS" -> {
                    try {
                        val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            putExtra("EXTRA_OPEN_A11Y_SETTINGS", true)
                        }
                        context.startActivity(intent)
                        Result.success("Accessibility activation screen opened on device.")
                    } catch (e: Exception) {
                        Result.failure(e)
                    }
                }

                "REFRESH_LOCATION", "REFRESH_GPS", "REQUEST_LOCATION" -> {
                    executeRefreshLocation()
                }

                "TEST_TAMPER_ALARM" -> {
                    val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        putExtra("EXTRA_TRIGGER_TAMPER", "Admin initiated test security alert!")
                    }
                    context.startActivity(intent)
                    Result.success("Tamper alarm test triggered.")
                }

                "DISARM_TAMPER_ALARM" -> {
                    val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        putExtra("EXTRA_DISARM_TAMPER", true)
                    }
                    context.startActivity(intent)
                    Result.success("Tamper alarm disarmed remotely.")
                }

                "RENAME_DEVICE", "SET_DEVICE_NAME", "SET_DEVICE_TAG" -> {
                    val newName = json.optString("newName", json.optString("device_tag", "")).trim()
                    if (newName.isNotEmpty()) {
                        val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
                        configStore.deviceTag = newName
                        val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            putExtra("EXTRA_DEVICE_RENAMED", newName)
                        }
                        context.startActivity(intent)
                        Result.success("Device renamed to: $newName")
                    } else {
                        Result.failure(IllegalArgumentException("Missing newName parameter"))
                    }
                }

                "ASSIGN_BRANCH", "SET_BRANCH" -> {
                    val branchId = json.optString("branchId", json.optJSONObject("payload")?.optString("branchId", "") ?: "")
                    val branchName = json.optString("branchName", json.optJSONObject("payload")?.optString("branchName", "") ?: "")
                    val branchCode = json.optString("branchCode", json.optJSONObject("payload")?.optString("branchCode", "") ?: "")
                    val compCode = json.optString("companyCode", json.optJSONObject("payload")?.optString("companyCode", "") ?: "")
                    val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
                    if (branchId.isNotEmpty()) {
                        configStore.branchId = branchId
                        configStore.branchName = branchName
                        configStore.branchCode = branchCode
                    }
                    if (compCode.isNotEmpty()) {
                        configStore.companyCode = compCode
                    }
                    AppLogger.i("CommandDispatcher", "Assigned branch: $branchName ($branchId)")
                    Result.success("Assigned branch: $branchName")
                }

                "UNASSIGN_BRANCH", "CLEAR_BRANCH" -> {
                    val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
                    configStore.branchId = ""
                    configStore.branchName = ""
                    configStore.branchCode = ""
                    AppLogger.i("CommandDispatcher", "Unassigned branch")
                    Result.success("Unassigned branch")
                }

                "SYNC_TIME", "SET_TIME", "SET_DATE_TIME" -> {
                    val timestamp = json.optLong("timestamp", System.currentTimeMillis())
                    val timeZone = json.optString("timeZone", "")
                    executeSyncTime(timestamp, timeZone)
                }

                "CLEAR_APP_DATA" -> {
                    val pkg = json.optString("package_name", json.optString("packageName", "com.google.android.apps.maps"))
                    executeClearAppData(pkg)
                }

                "ENABLE_APP", "UNHIDE_APP" -> {
                    val pkg = json.optString("package_name", json.optString("packageName", "com.google.android.apps.maps"))
                    executeEnableApp(pkg)
                }

                "REPAIR_MAPS", "FIX_MAPS" -> {
                    executeRepairMaps()
                }

                "WAKE_SCREEN", "WAKE_DEVICE" -> {
                    DeviceWakeManager.wakeUpScreen(context)
                    Result.success("Screen woken up successfully.")
                }

                "UNLOCK_SCREEN", "UNLOCK_DEVICE" -> {
                    DeviceWakeManager.wakeAndUnlock(context)
                    Result.success("Screen woken up and keyguard unlocked successfully.")
                }

                "LOCK_SCREEN" -> {
                    DeviceWakeManager.lockScreen(context)
                    Result.success("Screen locked successfully.")
                }

                else -> {
                    val err = "Unknown or unsupported command: $action"
                    AppLogger.w("CommandDispatcher", err)
                    Result.failure(IllegalArgumentException(err))
                }
            }
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to parse/execute command JSON", e)
            Result.failure(e)
        }
    }

    private fun executeLockDevice(message: String): Result<String> {
        return try {
            AppLogger.securityAudit("REMOTE_LOCK", "Executing immediate device lock: $message")
            if (policyHelper.isAdminActive()) {
                policyHelper.dpm.lockNow()
                Result.success("Device locked successfully via hardware DPM.")
            } else {
                // If standard Device Admin is not yet activated by user, wake MainActivity with lock screen
                val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra("EXTRA_REMOTE_LOCK", true)
                }
                context.startActivity(intent)
                Result.success("Device locked via Nexus security surface (Activate Device Admin for hardware lock).")
            }
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to lock device", e)
            Result.failure(e)
        }
    }

    private fun executeReboot(reason: String): Result<String> {
        if (!policyHelper.isDeviceOwner()) {
            val err = "Reboot command requires Device Owner privileges"
            AppLogger.w("CommandDispatcher", err)
            return Result.failure(SecurityException(err))
        }

        val success = policyHelper.rebootDevice()
        return if (success) {
            Result.success("Reboot initiated ($reason)")
        } else {
            Result.failure(RuntimeException("Reboot execution failed"))
        }
    }

    private fun executeWipeData(wipeStorage: Boolean): Result<String> {
        if (!policyHelper.isDeviceOwner()) {
            val err = "Factory wipe requires Device Owner privileges"
            AppLogger.w("CommandDispatcher", err)
            return Result.failure(SecurityException(err))
        }

        return try {
            AppLogger.securityAudit("REMOTE_WIPE", "Factory reset initiated via remote command (storage=$wipeStorage)")
            val flags = if (wipeStorage) 1 else 0
            policyHelper.dpm.wipeData(flags)
            Result.success("Factory wipe command validated and dispatched.")
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Wipe failed", e)
            Result.failure(e)
        }
    }

    private suspend fun executeKioskMode(enable: Boolean, activity: Activity?): Result<String> =
        withContext(Dispatchers.Main) {
            val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
            configStore.isKioskEnabled = enable

            if (activity != null && activity is com.nexus.mdm.agent.ui.MainActivity) {
                activity.handleKioskStateChange(enable)
            } else {
                // Background Service invocation: Wake MainActivity to update UI
                val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra("EXTRA_KIOSK_STATE_CHANGE", enable)
                }
                context.startActivity(intent)
            }
            Result.success("Kiosk state updated to $enable")
        }

    private suspend fun executeInstallFromUrl(downloadUrl: String, pkgName: String): Result<String> =
        withContext(Dispatchers.IO) {
            if (!silentInstaller.canInstallSilently()) {
                val err = "Silent installation requires Device Owner privileges"
                AppLogger.w("CommandDispatcher", err)
                return@withContext Result.failure(SecurityException(err))
            }

            var connection: HttpURLConnection? = null
            var inputStream: InputStream? = null
            var tempApkFile: java.io.File? = null

            try {
                AppLogger.i("CommandDispatcher", "Downloading APK payload from: $downloadUrl")
                var currentUrl = downloadUrl
                var redirectCount = 0
                val maxRedirects = 5

                // Handle HTTP 301/302/307/308 redirects automatically across HTTP/HTTPS
                while (redirectCount < maxRedirects) {
                    val url = URL(currentUrl)
                    connection = url.openConnection() as HttpURLConnection
                    connection.instanceFollowRedirects = true
                    connection.connectTimeout = 20_000
                    connection.readTimeout = 45_000
                    connection.requestMethod = "GET"
                    connection.connect()

                    val code = connection.responseCode
                    if (code in listOf(HttpURLConnection.HTTP_MOVED_PERM, HttpURLConnection.HTTP_MOVED_TEMP, 307, 308)) {
                        val newUrl = connection.getHeaderField("Location")
                        connection.disconnect()
                        if (!newUrl.isNullOrEmpty()) {
                            currentUrl = newUrl
                            redirectCount++
                            continue
                        }
                    }
                    break
                }

                val responseCode = connection?.responseCode ?: -1
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    val err = "HTTP error $responseCode downloading APK from $currentUrl"
                    AppLogger.e("CommandDispatcher", err)
                    return@withContext Result.failure(RuntimeException(err))
                }

                // Download cleanly to cache directory first to guarantee exact file size and prevent partial session corruption
                tempApkFile = java.io.File(context.cacheDir, "ota_download_${System.currentTimeMillis()}.apk")
                inputStream = connection!!.inputStream
                tempApkFile.outputStream().use { fos ->
                    val buffer = ByteArray(64 * 1024)
                    var read: Int
                    while (inputStream.read(buffer).also { read = it } != -1) {
                        fos.write(buffer, 0, read)
                    }
                    fos.flush()
                }

                val exactSize = tempApkFile.length()
                AppLogger.i("CommandDispatcher", "Downloaded APK to cache ($exactSize bytes). Committing to PackageInstaller...")

                val sessionResult = java.io.FileInputStream(tempApkFile).use { fis ->
                    silentInstaller.installStream(
                        inputStream = fis,
                        totalBytes = exactSize,
                        sessionName = pkgName
                    )
                }

                sessionResult.fold(
                    onSuccess = { sessionId ->
                        Result.success("Silent install session committed: Session ID $sessionId")
                    },
                    onFailure = { ex ->
                        Result.failure(ex)
                    }
                )
            } catch (e: Exception) {
                AppLogger.e("CommandDispatcher", "Failed to download and install APK from URL", e)
                Result.failure(e)
            } finally {
                try { inputStream?.close() } catch (_: Exception) {}
                try { connection?.disconnect() } catch (_: Exception) {}
                try { tempApkFile?.delete() } catch (_: Exception) {}
            }
        }

    private fun executeInstallPlayStoreApp(pkgName: String): Result<String> {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkgName")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                setPackage("com.android.vending")
            }
            context.startActivity(intent)
            Result.success("Google Play Store opened for package: $pkgName")
        } catch (_: Exception) {
            try {
                val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkgName")).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(webIntent)
                Result.success("Opened Play Store web fallback for package: $pkgName")
            } catch (e2: Exception) {
                Result.failure(e2)
            }
        }
    }

    private fun executeSetPeripheral(key: String, enabled: Boolean): Result<String> {
        val success = when (key.lowercase()) {
            "camera" -> peripheralManager.setCameraEnabled(enabled)
            "screen_capture", "screenshots" -> peripheralManager.setScreenCaptureEnabled(enabled)
            "usb_transfer", "usb" -> peripheralManager.setUsbDataTransferEnabled(enabled)
            "bluetooth_config", "bluetooth" -> peripheralManager.setBluetoothConfigEnabled(enabled)
            "wifi_config", "wifi" -> peripheralManager.setWifiConfigEnabled(enabled)
            "factory_reset" -> peripheralManager.setFactoryResetAllowed(enabled)
            "cellular_only", "mobile_data_only", "force_cellular" -> peripheralManager.enforceCellularOnly(enabled)
            else -> {
                AppLogger.w("CommandDispatcher", "Unknown peripheral policy key: $key")
                false
            }
        }

        return if (success) {
            Result.success("Policy '$key' updated to: $enabled")
        } else {
            Result.failure(RuntimeException("Failed to apply policy: $key"))
        }
    }

    private suspend fun executeSetWhitelist(packages: Set<String>): Result<String> =
        withContext(Dispatchers.Main) {
            try {
                val whitelistManager = com.nexus.mdm.agent.kiosk.AppWhitelistManager(context)
                whitelistManager.saveWhitelistedPackages(packages)
                if (policyHelper.isDeviceOwner()) {
                    whitelistManager.syncWithDevicePolicyManager(policyHelper.dpm, policyHelper.adminComponent)
                }
                AppLogger.securityAudit("REMOTE_WHITELIST_SET", "Remote whitelist updated with ${packages.size} apps: $packages")

                val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra("EXTRA_WHITELIST_UPDATED", true)
                }
                context.startActivity(intent)
                Result.success("Whitelist updated remotely with ${packages.size} packages.")
            } catch (e: Exception) {
                AppLogger.e("CommandDispatcher", "Failed to set remote whitelist", e)
                Result.failure(e)
            }
        }

    private fun executeSyncTime(timestamp: Long, timeZone: String): Result<String> {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val admin = com.nexus.mdm.agent.admin.NexusAdminReceiver.getComponentName(context)
            var timeSet = false
            var tzSet = false

            if (dpm.isDeviceOwnerApp(context.packageName)) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P && timeZone.isNotEmpty()) {
                    try {
                        tzSet = dpm.setTimeZone(admin, timeZone)
                    } catch (e: Exception) {
                        AppLogger.w("CommandDispatcher", "Failed to set timezone via DPM: ${e.message}")
                    }
                }
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P && timestamp > 0) {
                    try {
                        timeSet = dpm.setTime(admin, timestamp)
                    } catch (e: Exception) {
                        AppLogger.w("CommandDispatcher", "Failed to set time via DPM: ${e.message}")
                    }
                }
            }

            val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("EXTRA_SYNC_TIME", timestamp)
                if (timeZone.isNotEmpty()) putExtra("EXTRA_TIME_ZONE", timeZone)
            }
            context.startActivity(intent)

            AppLogger.i("CommandDispatcher", "Time synchronized: timestamp=$timestamp, tz=$timeZone, timeSet=$timeSet, tzSet=$tzSet")
            Result.success("Time synchronized successfully (timestamp=$timestamp, tz=$timeZone)")
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to execute sync time", e)
            Result.failure(e)
        }
    }

    private fun executeClearAppData(packageName: String): Result<String> {
        if (!policyHelper.isDeviceOwner()) {
            return Result.failure(IllegalStateException("Agent is not Device Owner"))
        }
        return try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                policyHelper.dpm.clearApplicationUserData(
                    policyHelper.adminComponent,
                    packageName,
                    context.mainExecutor
                ) { pkg, succeeded ->
                    AppLogger.i("CommandDispatcher", "clearApplicationUserData callback for $pkg: succeeded=$succeeded")
                }
                Result.success("Application user data clear requested for $packageName")
            } else {
                Result.failure(UnsupportedOperationException("clearApplicationUserData requires Android 9+"))
            }
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to clear app data for $packageName", e)
            Result.failure(e)
        }
    }

    private fun executeEnableApp(packageName: String): Result<String> {
        if (!policyHelper.isDeviceOwner()) {
            return Result.failure(IllegalStateException("Agent is not Device Owner"))
        }
        return try {
            policyHelper.dpm.enableSystemApp(policyHelper.adminComponent, packageName)
            policyHelper.dpm.setApplicationHidden(policyHelper.adminComponent, packageName, false)
            Result.success("App enabled and unhidden: $packageName")
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to enable app $packageName", e)
            Result.failure(e)
        }
    }

    private fun executeRepairMaps(): Result<String> {
        if (!policyHelper.isDeviceOwner()) {
            return Result.failure(IllegalStateException("Agent is not Device Owner"))
        }
        return try {
            val dpm = policyHelper.dpm
            val admin = policyHelper.adminComponent

            // 1. Enable GPS Location globally & remove restrictions
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                try {
                    dpm.setLocationEnabled(admin, true)
                } catch (_: Exception) {}
            }
            try {
                dpm.clearUserRestriction(admin, android.os.UserManager.DISALLOW_SHARE_LOCATION)
                dpm.clearUserRestriction(admin, android.os.UserManager.DISALLOW_CONFIG_LOCATION)
            } catch (_: Exception) {}

            // 2. Unhide & Enable Google Maps and all supporting packages
            val pkgsToEnable = listOf(
                "com.google.android.apps.maps",
                "com.google.android.apps.mapslite",
                "com.google.android.gms",
                "com.google.android.gsf",
                "com.google.android.webview",
                "com.android.chrome"
            )
            for (pkg in pkgsToEnable) {
                try {
                    dpm.setApplicationHidden(admin, pkg, false)
                    dpm.enableSystemApp(admin, pkg)
                } catch (_: Exception) {}
            }

            // 3. Grant runtime permissions (Fine Location, Coarse Location, Camera)
            val locPerms = listOf(
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.ACCESS_COARSE_LOCATION
            )
            for (pkg in listOf("com.google.android.apps.maps", "com.google.android.apps.mapslite", "com.google.android.gms")) {
                for (perm in locPerms) {
                    try {
                        dpm.setPermissionGrantState(admin, pkg, perm, android.app.admin.DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
                    } catch (_: Exception) {}
                }
            }

            // 4. Ensure in LockTask packages
            val currentLockPackages = dpm.getLockTaskPackages(admin).toMutableSet()
            currentLockPackages.addAll(pkgsToEnable)
            dpm.setLockTaskPackages(admin, currentLockPackages.toTypedArray())

            // 5. Clear corrupted SQLite/cache user data for Google Maps
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                try {
                    dpm.clearApplicationUserData(admin, "com.google.android.apps.maps", context.mainExecutor) { _, _ -> }
                } catch (_: Exception) {}
            }

            AppLogger.i("CommandDispatcher", "Google Maps and GMS comprehensively repaired.")
            Result.success("Google Maps and Google Play Services repaired, whitelisted and location unlocked.")
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to repair Google Maps", e)
            Result.failure(e)
        }
    }

    private suspend fun executeRefreshLocation(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val tracker = com.nexus.mdm.agent.location.LocationTracker.getInstance(context)
            tracker.ensureLocationHardwareEnabled()
            tracker.startTracking()
            tracker.requestImmediateFix()
            MdmCloudSyncService.performSyncNow(context)
            Result.success("GPS location refresh triggered successfully.")
        } catch (e: Exception) {
            AppLogger.w("CommandDispatcher", "executeRefreshLocation error: ${e.message}")
            Result.failure(e)
        }
    }

    private fun executeShowMessage(title: String, message: String): Result<String> {
        return try {
            AppLogger.i("CommandDispatcher", "Displaying broadcast message: $title - $message")
            DeviceWakeManager.wakeUpScreen(context)

            // Post notification
            try {
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra("EXTRA_SHOW_MESSAGE", true)
                    putExtra("EXTRA_MESSAGE_TITLE", title)
                    putExtra("EXTRA_MESSAGE_BODY", message)
                }
                val pendingIntent = android.app.PendingIntent.getActivity(
                    context,
                    System.currentTimeMillis().toInt(),
                    intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                )
                val notification = androidx.core.app.NotificationCompat.Builder(context, com.nexus.mdm.agent.NexusApp.CHANNEL_ID_ALERTS)
                    .setSmallIcon(com.nexus.mdm.agent.R.drawable.ic_nexus_shield)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(message))
                    .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
                    .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .build()
                notificationManager.notify(9001, notification)
            } catch (ne: Exception) {
                AppLogger.w("CommandDispatcher", "Notification posting error: ${ne.message}")
            }

            // Launch Activity with alert dialog
            val actIntent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("EXTRA_SHOW_MESSAGE", true)
                putExtra("EXTRA_MESSAGE_TITLE", title)
                putExtra("EXTRA_MESSAGE_BODY", message)
            }
            context.startActivity(actIntent)
            Result.success("Message displayed: $title")
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to show broadcast message", e)
            Result.failure(e)
        }
    }

    private fun executeIncomingCall(callerName: String): Result<String> {
        return try {
            AppLogger.i("CommandDispatcher", "Triggering incoming call alert from: $callerName")
            DeviceWakeManager.wakeAndUnlock(context)

            val actIntent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("EXTRA_INCOMING_CALL", true)
                putExtra("EXTRA_CALLER_NAME", callerName)
            }
            context.startActivity(actIntent)
            Result.success("Incoming call alert triggered from $callerName")
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to trigger incoming call", e)
            Result.failure(e)
        }
    }

    private fun executeEndCall(): Result<String> {
        return try {
            AppLogger.i("CommandDispatcher", "Ending active call session")
            val actIntent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("EXTRA_END_CALL", true)
            }
            context.startActivity(actIntent)
            Result.success("Call ended remotely.")
        } catch (e: Exception) {
            AppLogger.e("CommandDispatcher", "Failed to end call", e)
            Result.failure(e)
        }
    }
}
