package com.nexus.mdm.agent.remote

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import com.nexus.mdm.agent.util.AppLogger

/**
 * Hardware RTC Alarm Receiver.
 * Physically wakes the CPU from deep sleep every minute to guarantee heartbeat and location transmission.
 */
class SyncAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_TRIGGER_SYNC = "com.nexus.mdm.agent.ACTION_TRIGGER_SYNC"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = try {
            pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nexus:rtc_alarm_wakeup")?.apply {
                setReferenceCounted(false)
                acquire(10_000L) // Hold wake lock for at most 10 seconds while network completes
            }
        } catch (_: Exception) { null }

        try {
            AppLogger.i("SyncAlarmReceiver", "RTC Alarm fired! Triggering heartbeat and location sync.")
            MdmCloudSyncService.performSyncNow(context)
        } catch (e: Exception) {
            AppLogger.e("SyncAlarmReceiver", "Failed to trigger sync on RTC alarm", e)
        } finally {
            try {
                if (wakeLock?.isHeld == true) {
                    // Let WakeLock release gracefully after timeout or release here if preferred
                }
            } catch (_: Exception) {}
        }
    }
}
