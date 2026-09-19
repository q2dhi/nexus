package com.nexus.mdm.agent.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.UserManager
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.ui.MainActivity
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Enterprise Boot & Lifecycle Receiver.
 * Resurrects the persistent DPC service upon device boot or app update,
 * and re-verifies Kiosk and policy constraints.
 *
 * CRITICAL FIXES:
 * 1. Uses goAsync() + coroutine to prevent ANR (BroadcastReceivers have 10s limit)
 * 2. Checks Direct Boot state before accessing EncryptedSharedPreferences
 * 3. Safe Activity launch from background on Android 10+
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        AppLogger.securityAudit("BOOT_EVENT", "System lifecycle broadcast received: $action")

        // Guard: On LOCKED_BOOT_COMPLETED, credential-encrypted storage is NOT available.
        // EncryptedSharedPreferences will crash. Only start the cloud sync service (which
        // does not access encrypted prefs until its first sync cycle).
        if (action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
            AppLogger.i("BootReceiver", "Direct Boot phase — deferring policy enforcement until user unlock")
            try {
                com.nexus.mdm.agent.remote.MdmCloudSyncService.start(context)
            } catch (_: Exception) {}
            return
        }

        // For BOOT_COMPLETED and MY_PACKAGE_REPLACED: verify credential storage is available
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val userManager = context.getSystemService(Context.USER_SERVICE) as? UserManager
            if (userManager != null && !userManager.isUserUnlocked) {
                AppLogger.i("BootReceiver", "User not yet unlocked — deferring full initialization")
                try {
                    com.nexus.mdm.agent.remote.MdmCloudSyncService.start(context)
                } catch (_: Exception) {}
                return
            }
        }

        // Use goAsync() + coroutine to perform heavy work off main thread
        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO + SupervisorJob()).launch {
            try {
                performBootSetup(context)
            } catch (e: Exception) {
                AppLogger.e("BootReceiver", "Boot setup error: ${e.message}", e)
            } finally {
                try {
                    pendingResult.finish()
                } catch (_: Exception) {}
            }
        }
    }

    /**
     * Performs all boot-time setup work on a background thread.
     */
    private fun performBootSetup(context: Context) {
        // 1. Immediately spin up MDM Cloud Sync background service & schedule hardware RTC wakeup
        try {
            com.nexus.mdm.agent.remote.MdmCloudSyncService.start(context)
            com.nexus.mdm.agent.remote.MdmCloudSyncService.scheduleNextRtcAlarm(context)
        } catch (e: Exception) {
            AppLogger.w("BootReceiver", "Cloud sync start warning: ${e.message}")
        }

        // 2. Re-verify enterprise baseline policies if Device Owner
        val policyHelper = PolicyManagerHelper(context)
        if (policyHelper.isDeviceOwner()) {
            AppLogger.i("BootReceiver", "Verifying baseline enterprise profile on boot.")

            try {
                policyHelper.grantAllEnterprisePermissions(context)
            } catch (e: Exception) {
                AppLogger.w("BootReceiver", "Permission grant warning: ${e.message}")
            }

            try {
                policyHelper.applyBaselineSecurityPolicies()
            } catch (e: Exception) {
                AppLogger.w("BootReceiver", "Baseline policies warning: ${e.message}")
            }

            try {
                val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
                if (configStore.isKioskEnabled) {
                    // Kiosk mode is active: set Nexus as default home and launch kiosk surface
                    policyHelper.setAsDefaultHomeLauncher()
                    launchMainActivitySafely(context)
                    AppLogger.i("BootReceiver", "Kiosk mode active: launching kiosk surface.")
                } else {
                    // Normal mode: clear any home launcher override, let Android stock home run
                    policyHelper.clearDefaultHomeLauncher()
                    AppLogger.i("BootReceiver", "Normal mode: Android stock home screen active.")
                }
            } catch (e: Exception) {
                AppLogger.e("BootReceiver", "Kiosk/home launcher setup error: ${e.message}", e)
            }
        }
    }

    /**
     * Safely launches MainActivity from a background context.
     * Device Owner apps are exempt from Android 10+ background Activity launch restrictions,
     * but we guard against failures on OEM-specific implementations.
     */
    private fun launchMainActivitySafely(context: Context) {
        try {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(launchIntent)
        } catch (e: Exception) {
            AppLogger.w("BootReceiver", "Failed to launch MainActivity from background: ${e.message}")
        }
    }
}
