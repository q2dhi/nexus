package com.nexus.mdm.agent.remote

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.view.WindowManager
import com.nexus.mdm.agent.ui.MainActivity
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Device Screen Wake & Remote Lock Controller.
 * Enables waking the screen, dismissing/bypassing keyguard, and controlling
 * device power state remotely from the Web Admin console even when screen is off.
 */
object DeviceWakeManager {

    /**
     * Illuminates and wakes up the device display if it is currently sleeping or screen is off.
     */
    fun wakeUpScreen(context: Context) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
            if (!pm.isInteractive) {
                @Suppress("DEPRECATION")
                val wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                    "nexus:remote_wake"
                )
                wakeLock.acquire(15000L)
                AppLogger.i("DeviceWakeManager", "Screen illuminated and woken up via WakeLock.")
            }
        } catch (e: Exception) {
            AppLogger.w("DeviceWakeManager", "wakeUpScreen exception: ${e.message}")
        }
    }

    /**
     * Wakes the screen and dismisses the lock screen (Keyguard) so the device
     * can be monitored and controlled seamlessly from the remote web stream.
     */
    fun wakeAndUnlock(context: Context) {
        try {
            wakeUpScreen(context)

            // 1. Accessibility Service swipe-up gesture (universal for Android swipe/PIN lock screens)
            val a11y = NexusAccessibilityService.instance
            if (a11y != null) {
                a11y.performSwipe("UP")
            }

            // 2. Request Keyguard dismissal on active Activity if available
            val act = MainActivity.instance
            if (act != null) {
                act.runOnUiThread {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            act.setShowWhenLocked(true)
                            act.setTurnScreenOn(true)
                            val km = act.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
                            km?.requestDismissKeyguard(act, null)
                        } else {
                            @Suppress("DEPRECATION")
                            act.window.addFlags(
                                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            )
                        }
                    } catch (_: Exception) {}
                }
            } else {
                val intent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra("EXTRA_REMOTE_WAKE", true)
                }
                context.startActivity(intent)
            }

            AppLogger.i("DeviceWakeManager", "Remote wake & unlock sequence executed.")
        } catch (e: Exception) {
            AppLogger.w("DeviceWakeManager", "wakeAndUnlock exception: ${e.message}")
        }
    }

    /**
     * Locks the device display remotely.
     */
    fun lockScreen(context: Context) {
        try {
            val a11y = NexusAccessibilityService.instance
            if (a11y != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                a11y.performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN)
            } else {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? android.app.admin.DevicePolicyManager
                dpm?.lockNow()
            }
            AppLogger.i("DeviceWakeManager", "Screen locked remotely.")
        } catch (e: Exception) {
            AppLogger.w("DeviceWakeManager", "lockScreen exception: ${e.message}")
        }
    }
}
