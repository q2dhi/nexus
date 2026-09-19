package com.nexus.mdm.agent.admin

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PersistableBundle
import android.os.UserHandle
import com.nexus.mdm.agent.remote.MdmCloudSyncService
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Nexus Enterprise Device Administration Receiver.
 * Receives broadcast actions from the Android system for Device Owner provisioning,
 * policy lifecycle changes, and lock task mode transitions.
 */
class NexusAdminReceiver : DeviceAdminReceiver() {

    companion object {
        fun getComponentName(context: Context): ComponentName {
            return ComponentName(context.applicationContext, NexusAdminReceiver::class.java)
        }
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        AppLogger.securityAudit(
            "PROVISIONING_COMPLETE",
            "Device Owner provisioning completed successfully via Android Enterprise."
        )

        // Use goAsync() to extend BroadcastReceiver lifetime beyond default ANR limit
        val pendingResult = goAsync()

        // Perform all heavy work on a background dispatcher
        CoroutineScope(Dispatchers.IO + SupervisorJob()).launch {
            try {
                performPostProvisioningSetup(context, intent)
            } catch (e: Exception) {
                AppLogger.e("AdminReceiver", "Post-provisioning setup error: ${e.message}", e)
            } finally {
                try {
                    pendingResult.finish()
                } catch (_: Exception) {}
            }
        }
    }

    /**
     * Performs all post-provisioning setup work on a background thread.
     */
    private fun performPostProvisioningSetup(context: Context, intent: Intent) {
        val policyHelper = PolicyManagerHelper(context)
        val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)

        // Read QR Provisioning Admin Extras Bundle
        try {
            val extrasBundle = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(
                        DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                        PersistableBundle::class.java
                    )
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra<PersistableBundle>(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
                }
            } catch (_: Exception) { null }

            if (extrasBundle != null) {
                applyPersistableBundleExtras(extrasBundle, configStore)
            } else {
                val standardExtras = try {
                    intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
                        ?: intent.extras?.getBundle("android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE")
                } catch (_: Exception) { null }

                if (standardExtras != null) {
                    applyStandardBundleExtras(standardExtras, intent, configStore)
                }
            }
        } catch (e: Exception) {
            AppLogger.e("AdminReceiver", "Error reading QR provisioning admin extras bundle", e)
        }

        // 1. Whitelist LockTask packages FIRST before setting Kiosk or Launcher
        try {
            policyHelper.dpm.setLockTaskPackages(
                policyHelper.adminComponent,
                arrayOf(context.packageName)
            )
            AppLogger.i("AdminReceiver", "Default LockTask package whitelisted: ${context.packageName}")
        } catch (e: Exception) {
            AppLogger.e("AdminReceiver", "Failed to whitelist default LockTask packages", e)
        }

        // 2. Enforce baseline security posture and assign persistent Home Launcher
        try {
            policyHelper.applyBaselineSecurityPolicies()
            configStore.isKioskEnabled = true
            policyHelper.setAsDefaultHomeLauncher()
        } catch (e: Exception) {
            AppLogger.e("AdminReceiver", "Error applying baseline policies", e)
        }

        // 3. Start Cloud Sync Service & send initial registration heartbeat
        try {
            MdmCloudSyncService.start(context)
        } catch (_: Exception) {}
        try {
            MdmCloudSyncService.performSyncNow(context)
        } catch (_: Exception) {}

        AppLogger.i("AdminReceiver", "Post-provisioning setup completed successfully.")
    }

    private fun applyPersistableBundleExtras(
        extrasBundle: PersistableBundle,
        configStore: com.nexus.mdm.agent.config.SecureConfigStore
    ) {
        val serverUrl = extrasBundle.getString("server_url")
        val deviceTag = extrasBundle.getString("device_tag")
            ?: extrasBundle.getString("device_name")
            ?: extrasBundle.getString("android.app.extra.PROVISIONING_DEVICE_TAG")
        val companyCode = extrasBundle.getString("company_code")
        val branchId = extrasBundle.getString("branch_id")
        val branchName = extrasBundle.getString("branch_name")
        val branchCode = extrasBundle.getString("branch_code")

        if (!serverUrl.isNullOrBlank()) {
            configStore.serverUrl = serverUrl
            AppLogger.i("AdminReceiver", "Configured server URL from QR: $serverUrl")
        }
        if (!deviceTag.isNullOrBlank()) {
            configStore.deviceTag = deviceTag
            AppLogger.i("AdminReceiver", "Configured device tag from QR: $deviceTag")
        }
        if (!companyCode.isNullOrBlank()) {
            configStore.companyCode = companyCode
            AppLogger.i("AdminReceiver", "Configured company code from QR: $companyCode")
        }
        if (!branchId.isNullOrBlank()) {
            configStore.branchId = branchId
            configStore.branchName = branchName ?: ""
            configStore.branchCode = branchCode ?: ""
            AppLogger.i("AdminReceiver", "Configured branch from QR: $branchName ($branchId)")
        }
    }

    private fun applyStandardBundleExtras(
        standardExtras: android.os.Bundle,
        intent: Intent,
        configStore: com.nexus.mdm.agent.config.SecureConfigStore
    ) {
        val serverUrl = standardExtras.getString("server_url")
        val deviceTag = standardExtras.getString("device_tag")
            ?: standardExtras.getString("device_name")
            ?: standardExtras.getString("android.app.extra.PROVISIONING_DEVICE_TAG")
            ?: intent.getStringExtra("android.app.extra.PROVISIONING_DEVICE_TAG")
        val companyCode = standardExtras.getString("company_code")
        val branchId = standardExtras.getString("branch_id")
        val branchName = standardExtras.getString("branch_name")
        val branchCode = standardExtras.getString("branch_code")

        if (!serverUrl.isNullOrBlank()) configStore.serverUrl = serverUrl
        if (!deviceTag.isNullOrBlank()) configStore.deviceTag = deviceTag
        if (!companyCode.isNullOrBlank()) configStore.companyCode = companyCode
        if (!branchId.isNullOrBlank()) {
            configStore.branchId = branchId
            configStore.branchName = branchName ?: ""
            configStore.branchCode = branchCode ?: ""
            AppLogger.i("AdminReceiver", "Configured branch from QR: $branchName ($branchId)")
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        AppLogger.securityAudit("ADMIN_ENABLED", "Nexus Device Administration enabled.")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        AppLogger.w("AdminReceiver", "Admin deactivation requested! Tamper risk alert.")
        return "Warning: Deactivating Nexus DPC will disable enterprise security controls, kiosk lockdown, and managed application compliance."
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        AppLogger.securityAudit("ADMIN_DISABLED", "Nexus Device Administration was deactivated.")
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        super.onLockTaskModeEntering(context, intent, pkg)
        AppLogger.securityAudit("LOCK_TASK_ENTER", "Device entered LockTask (Kiosk) mode for package: $pkg")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        super.onLockTaskModeExiting(context, intent)
        AppLogger.securityAudit("LOCK_TASK_EXIT", "Device exited LockTask mode.")
    }

    override fun onSecurityLogsAvailable(context: Context, intent: Intent) {
        super.onSecurityLogsAvailable(context, intent)
        AppLogger.i("AdminReceiver", "New system security logs available for batch retrieval.")
    }

    override fun onUserAdded(context: Context, intent: Intent, newUser: UserHandle) {
        super.onUserAdded(context, intent, newUser)
        AppLogger.securityAudit("USER_ADDED", "New system user created: ${newUser.hashCode()}")
    }

    override fun onUserRemoved(context: Context, intent: Intent, removedUser: UserHandle) {
        super.onUserRemoved(context, intent, removedUser)
        AppLogger.securityAudit("USER_REMOVED", "System user removed: ${removedUser.hashCode()}")
    }
}
