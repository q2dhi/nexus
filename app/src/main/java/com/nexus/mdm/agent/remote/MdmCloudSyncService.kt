package com.nexus.mdm.agent.remote

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.installer.SilentInstaller
import com.nexus.mdm.agent.kiosk.AppWhitelistManager
import com.nexus.mdm.agent.kiosk.KioskManager
import com.nexus.mdm.agent.security.PeripheralPolicyManager
import com.nexus.mdm.agent.telemetry.TelemetryEngine
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Enterprise Background Cloud Synchronization Service.
 * Periodically transmits device health and status to the Web Admin server,
 * polls for pending administrator commands, and orchestrates silent OTA application updates.
 */
class MdmCloudSyncService : Service() {

    companion object {
        private const val SYNC_INTERVAL_MS = 8000L // Poll every 8 seconds

        fun start(context: Context) {
            val intent = Intent(context, MdmCloudSyncService::class.java)
            context.startService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, MdmCloudSyncService::class.java)
            context.stopService(intent)
        }
    }

    private val serviceJob = Job()
    private val scope = CoroutineScope(Dispatchers.IO + serviceJob)

    private lateinit var configStore: SecureConfigStore
    private lateinit var telemetryEngine: TelemetryEngine
    private lateinit var commandDispatcher: CommandDispatcher
    private lateinit var whitelistManager: AppWhitelistManager

    override fun onCreate() {
        super.onCreate()
        configStore = SecureConfigStore(this)
        telemetryEngine = TelemetryEngine(this)
        whitelistManager = AppWhitelistManager(this)

        val policyHelper = PolicyManagerHelper(this)
        val kioskManager = KioskManager(this)
        val silentInstaller = SilentInstaller(this)
        val peripheralManager = PeripheralPolicyManager(this, policyHelper)

        commandDispatcher = CommandDispatcher(this, policyHelper, kioskManager, silentInstaller, peripheralManager)

        startSyncLoop()
        AppLogger.i("CloudSync", "Cloud sync service initialized. Polling endpoint: ${configStore.serverUrl}")
    }

    private fun startSyncLoop() {
        scope.launch {
            while (isActive) {
                try {
                    sendHeartbeatAndPollCommands()
                } catch (e: Exception) {
                    // Ignore connectivity hiccups silently in loop
                }
                delay(SYNC_INTERVAL_MS)
            }
        }
    }

    private fun sendHeartbeatAndPollCommands() {
        var serverBase = configStore.serverUrl.trim()
        if (serverBase.isEmpty()) return
        if (!serverBase.startsWith("http://") && !serverBase.startsWith("https://")) {
            serverBase = "http://$serverBase"
        }
        serverBase = serverBase.trimEnd('/')

        val androidId = try {
            android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "DEVICE"
        } catch (_: Exception) {
            "DEVICE"
        }
        val deviceId = "${Build.MANUFACTURER}_${Build.MODEL}_${androidId.takeLast(6)}"

        // 1. Send Device Heartbeat
        val snapshot = telemetryEngine.captureSnapshot()
        val heartbeatPayload = JSONObject().apply {
            put("id", deviceId)
            put("name", configStore.deviceTag)
            put("model", snapshot.deviceModel)
            put("os", snapshot.androidVersion)
            put("battery", snapshot.battery.percentage)
            put("isCharging", snapshot.battery.isCharging)
            put("temperature", snapshot.battery.temperatureCelsius)
            put("ramUsedPercent", snapshot.memory.usedPercent)
            put("storageUsedPercent", snapshot.storage.usedPercent)
            put("isKiosk", configStore.isKioskEnabled)
            put("isRooted", snapshot.integrity.isRooted)
            put("ipAddress", snapshot.network.ipAddress)
            put("whitelistedApps", JSONArray(whitelistManager.getWhitelistedPackages()))
            put("companyCode", configStore.companyCode)
            if (snapshot.location != null) {
                val locObj = JSONObject().apply {
                    put("lat", snapshot.location.latitude)
                    put("lng", snapshot.location.longitude)
                    put("accuracy", snapshot.location.accuracy)
                    put("speed", snapshot.location.speed)
                    put("altitude", snapshot.location.altitude)
                    put("timestamp", snapshot.location.timestamp)
                    put("isMock", snapshot.location.isMock)
                }
                put("location", locObj)
            }
        }

        try {
            val url = URL("$serverBase/api/devices/heartbeat")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 4000
                readTimeout = 4000
                doOutput = true
            }

            OutputStreamWriter(conn.outputStream).use { it.write(heartbeatPayload.toString()) }
            val code = conn.responseCode

            if (code == HttpURLConnection.HTTP_OK) {
                val response = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()
                AppLogger.i("CloudSync", "Heartbeat SUCCESS to $serverBase")

                val resObj = JSONObject(response)

                // 1. Subscription verification from developer server
                val subscriptionActive = resObj.optBoolean("subscriptionActive", true)
                val subscriptionMessage = resObj.optString("subscriptionMessage", "")
                val companyName = resObj.optString("companyName", "")

                configStore.isSubscriptionActive = subscriptionActive

                val subIntent = Intent(this@MdmCloudSyncService, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra("EXTRA_SUBSCRIPTION_STATE", subscriptionActive)
                    putExtra("EXTRA_SUBSCRIPTION_MESSAGE", subscriptionMessage)
                    putExtra("EXTRA_COMPANY_NAME", companyName)
                }
                startActivity(subIntent)

                // 2. Check for commands array in response
                val commandsArray = resObj.optJSONArray("commands")
                if (commandsArray != null && commandsArray.length() > 0) {
                    for (i in 0 until commandsArray.length()) {
                        val cmdObj = commandsArray.getJSONObject(i)
                        val cmdString = cmdObj.toString()
                        scope.launch {
                            commandDispatcher.dispatchJsonCommand(cmdString)
                        }
                    }
                }
            } else {
                AppLogger.w("CloudSync", "Heartbeat received HTTP code: $code")
                conn.disconnect()
            }
        } catch (e: Exception) {
            AppLogger.w("CloudSync", "Failed connecting to $serverBase: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
        AppLogger.i("CloudSync", "Cloud sync service stopped.")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
