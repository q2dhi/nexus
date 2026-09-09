package com.nexus.mdm.agent.remote

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.nexus.mdm.agent.R
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.installer.SilentInstaller
import com.nexus.mdm.agent.kiosk.AppWhitelistManager
import com.nexus.mdm.agent.kiosk.KioskManager
import com.nexus.mdm.agent.oem.OemProviderFactory
import com.nexus.mdm.agent.security.PeripheralPolicyManager
import com.nexus.mdm.agent.telemetry.TelemetryEngine
import com.nexus.mdm.agent.ui.MainActivity
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
 * Enterprise Background Cloud Synchronization Service (Immortal Foreground Service).
 * Transmits real-time device health, GPS location, hardware metrics, Honeywell capabilities,
 * and processes incoming remote MDM commands 24/7 even when screen is locked or idle.
 */
class MdmCloudSyncService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "nexus_enterprise_sync_channel"
        private const val SYNC_INTERVAL_MS = 60_000L // Transmit location and telemetry every 60 seconds (1 minute)

        fun start(context: Context) {
            try {
                val intent = Intent(context, MdmCloudSyncService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                AppLogger.w("CloudSync", "Failed to start service: ${e.message}")
            }
        }

        fun stop(context: Context) {
            try {
                val intent = Intent(context, MdmCloudSyncService::class.java)
                context.stopService(intent)
            } catch (e: Exception) {
                AppLogger.w("CloudSync", "Failed to stop service: ${e.message}")
            }
        }
    }

    private var serviceJob = Job()
    private var scope = CoroutineScope(Dispatchers.IO + serviceJob)
    private var syncLoopJob: Job? = null

    private lateinit var configStore: SecureConfigStore
    private lateinit var telemetryEngine: TelemetryEngine
    private lateinit var commandDispatcher: CommandDispatcher
    private lateinit var whitelistManager: AppWhitelistManager
    private var screenReceiver: BroadcastReceiver? = null

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

        startForegroundNotification()
        registerScreenStateReceiver()
        startSyncLoop()
        AppLogger.i("CloudSync", "Cloud sync service initialized as Foreground Service. Endpoint: ${configStore.serverUrl}")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundNotification()
        if (syncLoopJob == null || syncLoopJob?.isActive != true) {
            startSyncLoop()
        }
        // Immediately perform an initial sync when command is received
        scope.launch {
            try {
                sendHeartbeatAndPollCommands()
            } catch (_: Exception) {}
        }
        return START_STICKY
    }

    private fun startForegroundNotification() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Nexus MDM Enterprise Sync",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "خدمة إدارة وتأمين الجهاز والمزامنة السحابية الدائمة"
                    setShowBadge(false)
                    lockscreenVisibility = Notification.VISIBILITY_SECRET
                }
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.createNotificationChannel(channel)
            }

            val launchIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Nexus Enterprise MDM")
                .setContentText("إدارة وتأمين الجهاز نشطة ومستمرة")
                .setSmallIcon(R.drawable.ic_launcher_nexus)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build()

            startForeground(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            AppLogger.w("CloudSync", "startForeground warning: ${e.message}")
        }
    }

    private fun registerScreenStateReceiver() {
        if (screenReceiver != null) return
        screenReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    Intent.ACTION_SCREEN_ON,
                    Intent.ACTION_USER_PRESENT -> {
                        AppLogger.i("CloudSync", "Screen turned ON / unlocked. Triggering fast sync.")
                        scope.launch {
                            try {
                                sendHeartbeatAndPollCommands()
                            } catch (_: Exception) {}
                        }
                    }
                    Intent.ACTION_SCREEN_OFF -> {
                        AppLogger.i("CloudSync", "Screen turned OFF. Ensuring background sync remains active.")
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        registerReceiver(screenReceiver, filter)
    }

    private fun startSyncLoop() {
        syncLoopJob?.cancel()
        syncLoopJob = scope.launch {
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

        // Discover dynamic OEM capabilities (Honeywell / Zebra / Android)
        val oemProvider = OemProviderFactory.getProvider()
        val capabilities = oemProvider.discoverCapabilities(this)

        // 1. Send Device Heartbeat
        val snapshot = telemetryEngine.captureSnapshot()
        val heartbeatPayload = JSONObject().apply {
            put("id", deviceId)
            put("name", configStore.deviceTag)
            put("model", snapshot.deviceModel)
            put("oem", oemProvider.oemName)
            put("os", snapshot.androidVersion)
            put("battery", snapshot.battery.percentage)
            put("isCharging", snapshot.battery.isCharging)
            put("temperature", snapshot.battery.temperatureCelsius)
            put("batteryHealth", snapshot.battery.health)
            put("powerSource", snapshot.battery.powerSource)
            put("ramUsedPercent", snapshot.memory.usedPercent)
            put("totalRamMb", snapshot.memory.totalRamMb)
            put("availableRamMb", snapshot.memory.availableRamMb)
            put("storageUsedPercent", snapshot.storage.usedPercent)
            put("totalStorageGb", snapshot.storage.totalStorageGb)
            put("availableStorageGb", snapshot.storage.availableStorageGb)
            put("isKiosk", configStore.isKioskEnabled)
            put("isRooted", snapshot.integrity.isRooted)
            put("integrityScore", snapshot.integrity.integrityScore)
            put("ipAddress", snapshot.network.ipAddress)
            put("connectionType", snapshot.network.connectionType)
            put("wifiSsid", snapshot.network.wifiSsid ?: "")
            put("whitelistedApps", JSONArray(whitelistManager.getWhitelistedPackages()))
            put("companyCode", configStore.companyCode)
            put("capabilities", capabilities.toJson())
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

        // Acquire partial wake lock with safety timeout so network call completes even if CPU tries to sleep
        val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = try {
            powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nexus:heartbeat_sync")?.apply {
                setReferenceCounted(false)
                acquire(8000L)
            }
        } catch (_: Exception) { null }

        try {
            val url = URL("$serverBase/api/devices/heartbeat")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 6000
                readTimeout = 6000
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

                val wasActive = configStore.isSubscriptionActive
                configStore.isSubscriptionActive = subscriptionActive

                // Only notify/launch MainActivity if subscription became inactive or state changed
                if (!subscriptionActive || wasActive != subscriptionActive) {
                    try {
                        val subIntent = Intent(this@MdmCloudSyncService, MainActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            putExtra("EXTRA_SUBSCRIPTION_STATE", subscriptionActive)
                            putExtra("EXTRA_SUBSCRIPTION_MESSAGE", subscriptionMessage)
                            putExtra("EXTRA_COMPANY_NAME", companyName)
                        }
                        startActivity(subIntent)
                    } catch (e: Exception) {
                        AppLogger.w("CloudSync", "Could not start MainActivity for subscription state: ${e.message}")
                    }
                }

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
        } finally {
            try {
                if (wakeLock?.isHeld == true) {
                    wakeLock.release()
                }
            } catch (_: Exception) {}
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        try {
            val restartIntent = Intent(applicationContext, MdmCloudSyncService::class.java)
            val pendingIntent = PendingIntent.getService(
                applicationContext,
                1,
                restartIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            alarmManager?.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 2000, pendingIntent)
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            if (screenReceiver != null) {
                unregisterReceiver(screenReceiver)
                screenReceiver = null
            }
        } catch (_: Exception) {}
        serviceJob.cancel()
        AppLogger.i("CloudSync", "Cloud sync service stopped.")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
