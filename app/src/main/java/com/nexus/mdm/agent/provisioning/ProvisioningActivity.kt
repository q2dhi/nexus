package com.nexus.mdm.agent.provisioning

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle
import androidx.appcompat.app.AppCompatActivity
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Android Enterprise Provisioning Activity.
 * Required for modern Android Enterprise (Android 10, 11, 12, 13, 14+):
 * 1. ACTION_GET_PROVISIONING_MODE: Signals PROVISIONING_MODE_FULLY_MANAGED_DEVICE.
 * 2. ACTION_ADMIN_POLICY_COMPLIANCE: Enforces baseline policies and returns RESULT_OK to Setup Wizard.
 */
class ProvisioningActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val action = intent?.action
        AppLogger.i("ProvisioningActivity", "Received provisioning intent action: $action")

        when (action) {
            DevicePolicyManager.ACTION_GET_PROVISIONING_MODE -> {
                handleGetProvisioningMode()
            }
            DevicePolicyManager.ACTION_ADMIN_POLICY_COMPLIANCE -> {
                handleAdminPolicyCompliance()
            }
            else -> {
                setResult(Activity.RESULT_OK)
                finish()
            }
        }
    }

    private fun handleGetProvisioningMode() {
        val allowedModes = intent.getIntegerArrayListExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES
        )
        AppLogger.i("ProvisioningActivity", "Allowed provisioning modes: $allowedModes")

        val selectedMode = if (allowedModes?.contains(DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE) == true) {
            DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        } else {
            allowedModes?.firstOrNull() ?: DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        }

        val resultIntent = Intent().apply {
            putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, selectedMode)
        }
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }

    private fun handleAdminPolicyCompliance() {
        AppLogger.i("ProvisioningActivity", "Processing Admin Policy Compliance...")
        val configStore = SecureConfigStore(this)

        // Read admin extras bundle if passed
        try {
            val extrasBundle = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(
                    DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                    PersistableBundle::class.java
                )
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<PersistableBundle>(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
            }

            if (extrasBundle != null) {
                val serverUrl = extrasBundle.getString("server_url")
                val deviceTag = extrasBundle.getString("device_tag") ?: extrasBundle.getString("device_name")
                val companyCode = extrasBundle.getString("company_code")

                if (!serverUrl.isNullOrBlank()) configStore.serverUrl = serverUrl
                if (!deviceTag.isNullOrBlank()) configStore.deviceTag = deviceTag
                if (!companyCode.isNullOrBlank()) configStore.companyCode = companyCode
            }
        } catch (e: Exception) {
            AppLogger.e("ProvisioningActivity", "Error reading extras bundle in compliance activity", e)
        }

        // Apply baseline security policies
        try {
            val policyHelper = PolicyManagerHelper(this)
            policyHelper.applyBaselineSecurityPolicies()
        } catch (e: Exception) {
            AppLogger.e("ProvisioningActivity", "Error applying baseline policies", e)
        }

        setResult(Activity.RESULT_OK)
        finish()
    }
}
