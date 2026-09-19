package com.nexus.mdm.agent

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

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

        @Volatile
        var currentResumedActivity: android.app.Activity? = null
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        AppLogger.i("NexusApp", "Nexus DPC Agent initializing (API ${Build.VERSION.SDK_INT})")
        setupNotificationChannels()
        setupUncaughtExceptionHandler()

        // Track resumed activity for screen streaming
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: android.app.Activity) {
                currentResumedActivity = activity
            }
            override fun onActivityPaused(activity: android.app.Activity) {
                if (currentResumedActivity === activity) {
                    currentResumedActivity = null
                }
            }
            override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: android.app.Activity) {}
            override fun onActivityStopped(activity: android.app.Activity) {}
            override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: android.app.Activity) {}
        })

        // CRITICAL FIX: Run heavy enterprise setup & shell execution on background thread.
        // Calling grantAllEnterprisePermissions() on the Main Thread causes an immediate ANR
        // due to synchronous Runtime.exec().waitFor() calls (sh and su commands).
        CoroutineScope(Dispatchers.IO + SupervisorJob()).launch {
            try {
                val policyHelper = com.nexus.mdm.agent.admin.PolicyManagerHelper(this@NexusApp)
                if (policyHelper.isDeviceOwner()) {
                    AppLogger.i("NexusApp", "Device Owner detected — granting permissions in background...")
                    policyHelper.grantAllEnterprisePermissions(this@NexusApp)
                    
                    try {
                        com.nexus.mdm.agent.location.LocationTracker.getInstance(this@NexusApp).startTracking()
                    } catch (locEx: Exception) {
                        AppLogger.w("NexusApp", "LocationTracker deferred start warning: ${locEx.message}")
                    }
                } else {
                    AppLogger.i("NexusApp", "Device Owner not yet active — deferring setup")
                }
            } catch (e: Exception) {
                AppLogger.w("NexusApp", "Background setup error: ${e.message}")
            }
        }
    }

    private fun setupNotificationChannels() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val serviceChannel = NotificationChannel(
            CHANNEL_ID_PERSISTENT,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_desc)
            setShowBadge(false)
        }

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
            try {
                AppLogger.e("FATAL", "Uncaught exception on thread ${thread.name}", throwable)
                val crashDumpFile = java.io.File(filesDir, "crash_dump.txt")
                val sw = java.io.StringWriter()
                val pw = java.io.PrintWriter(sw)
                throwable.printStackTrace(pw)
                val dumpContent = "[${java.util.Date()}] Thread: ${thread.name}\n${sw}\n\n"
                crashDumpFile.appendText(dumpContent)
            } catch (_: Throwable) {}
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }
}
