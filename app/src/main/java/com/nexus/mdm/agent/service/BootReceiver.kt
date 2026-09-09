package com.nexus.mdm.agent.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.ui.MainActivity
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Boot & Lifecycle Receiver.
 * Resurrects the persistent DPC service upon device boot or app update,
 * and re-verifies Kiosk and policy constraints.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        AppLogger.securityAudit("BOOT_EVENT", "System lifecycle broadcast received: $action")

        // 1. Immediately spin up MDM Cloud Sync background service & schedule hardware RTC wakeup
        com.nexus.mdm.agent.remote.MdmCloudSyncService.start(context)
        com.nexus.mdm.agent.remote.MdmCloudSyncService.scheduleNextRtcAlarm(context)

        // 2. Re-verify enterprise baseline policies if Device Owner
        val policyHelper = PolicyManagerHelper(context)
        if (policyHelper.isDeviceOwner()) {
            AppLogger.i("BootReceiver", "Verifying baseline enterprise profile on boot.")
            policyHelper.applyBaselineSecurityPolicies()

            // 3. For dedicated COSU kiosks, launch the main console/kiosk surface
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(launchIntent)
        }
    }
}
