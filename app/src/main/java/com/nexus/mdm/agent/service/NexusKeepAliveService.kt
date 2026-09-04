package com.nexus.mdm.agent.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.nexus.mdm.agent.NexusApp
import com.nexus.mdm.agent.R
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.ui.MainActivity
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Resilience & Keep-Alive Foreground Service.
 * Runs continuously to monitor compliance, maintain DPC connectivity,
 * and enforce Kiosk constraints once Device Owner is provisioned.
 */
class NexusKeepAliveService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            val policyHelper = PolicyManagerHelper(context)
            if (!policyHelper.isDeviceOwner()) {
                AppLogger.i("KeepAliveService", "Foreground service deferred: Device Owner is not yet active.")
                return
            }

            try {
                val intent = Intent(context, NexusKeepAliveService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                AppLogger.e("KeepAliveService", "Failed to start KeepAliveService: ${e.message}", e)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        AppLogger.i("KeepAliveService", "Nexus Keep-Alive service created.")
        val started = startPersistentForeground()
        if (started) {
            verifyBatteryOptimizationExemption()
        } else {
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        AppLogger.i("KeepAliveService", "Nexus Keep-Alive service heartbeat active (startId: $startId).")
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        AppLogger.w("KeepAliveService", "Task removed from recents. Verifying keep-alive resilience restart.")

        val policyHelper = PolicyManagerHelper(this)
        if (!policyHelper.isDeviceOwner()) return

        try {
            val restartServiceIntent = Intent(applicationContext, NexusKeepAliveService::class.java).apply {
                setPackage(packageName)
            }
            val restartServicePendingIntent = PendingIntent.getService(
                applicationContext,
                1,
                restartServiceIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )

            val alarmManager = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            alarmManager.set(
                android.app.AlarmManager.ELAPSED_REALTIME,
                android.os.SystemClock.elapsedRealtime() + 1500,
                restartServicePendingIntent
            )
        } catch (e: Exception) {
            AppLogger.w("KeepAliveService", "AlarmManager resurrection skipped: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        AppLogger.i("KeepAliveService", "Keep-Alive service stopped.")
    }

    @SuppressLint("ForegroundServiceType")
    private fun startPersistentForeground(): Boolean {
        return try {
            val launchIntent = Intent(this, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification: Notification = NotificationCompat.Builder(this, NexusApp.CHANNEL_ID_PERSISTENT)
                .setSmallIcon(R.drawable.ic_shield)
                .setContentTitle(getString(R.string.notification_title))
                .setContentText(getString(R.string.notification_text))
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14 (API 34) requires explicit foregroundServiceType
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            true
        } catch (e: SecurityException) {
            AppLogger.w(
                "KeepAliveService",
                "Foreground service permission deferred: Device Owner not yet established (${e.message})"
            )
            false
        } catch (e: Exception) {
            AppLogger.e("KeepAliveService", "startForeground failed unexpectedly: ${e.message}", e)
            false
        }
    }

    /**
     * Checks if the agent is whitelisted from OS Doze and battery optimizations.
     */
    private fun verifyBatteryOptimizationExemption() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val isIgnoring = powerManager.isIgnoringBatteryOptimizations(packageName)

        if (isIgnoring) {
            AppLogger.i("KeepAliveService", "Battery optimization status: EXEMPT (Doze bypass enabled)")
        } else {
            AppLogger.w("KeepAliveService", "Battery optimization status: ACTIVE (Doze throttling risk)")
        }
    }
}
