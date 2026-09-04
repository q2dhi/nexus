package com.nexus.mdm.agent.admin

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserHandle
import com.nexus.mdm.agent.ui.MainActivity
import com.nexus.mdm.agent.util.AppLogger

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

        val policyHelper = PolicyManagerHelper(context)
        val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)

        // Read QR Provisioning Admin Extras Bundle (Device Name, Company Code, Server URL)
        try {
            val extrasBundle = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(
                    android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                    android.os.PersistableBundle::class.java
                )
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<android.os.PersistableBundle>(android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
            }

            if (extrasBundle != null) {
                val serverUrl = extrasBundle.getString("server_url")
                val deviceTag = extrasBundle.getString("device_tag") ?: extrasBundle.getString("device_name")
                val companyCode = extrasBundle.getString("company_code")

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
            } else {
                val standardExtras = intent.getBundleExtra(android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
                    ?: intent.extras?.getBundle("android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE")
                if (standardExtras != null) {
                    val serverUrl = standardExtras.getString("server_url")
                    val deviceTag = standardExtras.getString("device_tag") ?: standardExtras.getString("device_name")
                    val companyCode = standardExtras.getString("company_code")

                    if (!serverUrl.isNullOrBlank()) configStore.serverUrl = serverUrl
                    if (!deviceTag.isNullOrBlank()) configStore.deviceTag = deviceTag
                    if (!companyCode.isNullOrBlank()) configStore.companyCode = companyCode
                }
            }
        } catch (e: Exception) {
            AppLogger.e("AdminReceiver", "Error reading QR provisioning admin extras bundle", e)
        }

        // 1. Enforce baseline security posture immediately
        policyHelper.applyBaselineSecurityPolicies()

        // 2. Set default lock task packages to include Nexus MDM
        try {
            policyHelper.dpm.setLockTaskPackages(
                policyHelper.adminComponent,
                arrayOf(context.packageName)
            )
            AppLogger.i("AdminReceiver", "Default LockTask package whitelisted: ${context.packageName}")
        } catch (e: Exception) {
            AppLogger.e("AdminReceiver", "Failed to whitelist default LockTask packages", e)
        }

        // 3. Launch Nexus MDM main console to complete device initialization
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("EXTRA_DEVICE_TAG", configStore.deviceTag)
            putExtra("EXTRA_COMPANY_CODE", configStore.companyCode)
        }
        context.startActivity(launchIntent)
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
