package com.nexus.mdm.agent

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.nexus.mdm.agent.util.AppLogger

/**
 * Nexus MDM Agent Application entrypoint.
 * Responsible for initializing system-level channels and baseline security monitoring.
 */
class NexusApp : Application() {

    companion object {
        const val CHANNEL_ID_PERSISTENT = "nexus_persistent_service"
        const val CHANNEL_ID_ALERTS = "nexus_security_alerts"
        lateinit var instance: NexusApp
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        AppLogger.i("NexusApp", "Nexus DPC Agent initializing (API ${Build.VERSION.SDK_INT})")
        setupNotificationChannels()
        setupUncaughtExceptionHandler()
    }

    private fun setupNotificationChannels() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Persistent Service Channel (Low priority to minimize user distraction on dedicated devices)
        val serviceChannel = NotificationChannel(
            CHANNEL_ID_PERSISTENT,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_desc)
            setShowBadge(false)
        }

        // Security Alerts Channel (High priority for critical policy violations)
        val alertChannel = NotificationChannel(
            CHANNEL_ID_ALERTS,
            "Nexus Policy Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "High-priority enterprise policy and tamper notifications"
            enableVibration(true)
        }

        notificationManager.createNotificationChannel(serviceChannel)
        notificationManager.createNotificationChannel(alertChannel)
    }

    private fun setupUncaughtExceptionHandler() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            AppLogger.e("FATAL", "Uncaught exception on thread ${thread.name}", throwable)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }
}
