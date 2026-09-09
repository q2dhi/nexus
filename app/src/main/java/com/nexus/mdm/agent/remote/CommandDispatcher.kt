package com.nexus.mdm.agent.remote

import android.app.Activity
import android.content.Context
import android.content.Intent
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
                    val enable = json.getBoolean("enable")
                    executeKioskMode(enable, currentActivity)
                }

                "INSTALL_APK_FROM_URL" -> {
                    val downloadUrl = json.getString("url")
                    val pkgName = json.optString("package_name", "managed_app")
                    executeInstallFromUrl(downloadUrl, pkgName)
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

                    val intent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        putExtra("EXTRA_START_SCREEN_STREAM", true)
                        putExtra("EXTRA_SERVER_URL", configStore.serverUrl)
                        putExtra("EXTRA_DEVICE_ID", deviceId)
                    }
                    context.startActivity(intent)
                    Result.success("Live screen streaming initiated.")
                }

                "STOP_SCREEN_STREAM" -> {
                    ScreenCaptureManager.stopStream()
                    Result.success("Live screen streaming stopped.")
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

                "SYNC_TIME", "SET_TIME", "SET_DATE_TIME" -> {
                    val timestamp = json.optLong("timestamp", System.currentTimeMillis())
                    val timeZone = json.optString("timeZone", "")
                    executeSyncTime(timestamp, timeZone)
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

            if (activity != null) {
                if (enable) kioskManager.startKiosk(activity) else kioskManager.launchStockAndroidHome(activity)
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

            try {
                AppLogger.i("CommandDispatcher", "Downloading APK payload from: $downloadUrl")
                val url = URL(downloadUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 15_000
                connection.readTimeout = 30_000
                connection.requestMethod = "GET"
                connection.connect()

                val responseCode = connection.responseCode
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    val err = "HTTP error $responseCode downloading APK"
                    AppLogger.e("CommandDispatcher", err)
                    return@withContext Result.failure(RuntimeException(err))
                }

                val contentLength = connection.contentLength.toLong()
                val effectiveSize = if (contentLength > 0) contentLength else 1024 * 1024 * 5
                inputStream = connection.inputStream

                val sessionResult = silentInstaller.installStream(
                    inputStream = inputStream,
                    totalBytes = effectiveSize,
                    sessionName = pkgName
                )

                sessionResult.fold(
                    onSuccess = { sessionId ->
                        Result.success("Silent install session committed: Session ID $sessionId")
                    },
                    onFailure = { ex ->
                        Result.failure(ex)
                    }
                )
            } catch (e: Exception) {
                AppLogger.e("CommandDispatcher", "Failed to stream remote APK from URL", e)
                Result.failure(e)
            } finally {
                inputStream?.close()
                connection?.disconnect()
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
}
