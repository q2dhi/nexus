package com.nexus.mdm.agent.provisioning

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.remote.MdmCloudSyncService
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Android Enterprise Provisioning Activity.
 * Handles modern Android Enterprise (Android 10, 11, 12, 13, 14+) setup wizard callbacks:
 * 1. ACTION_GET_PROVISIONING_MODE: Returns PROVISIONING_MODE_FULLY_MANAGED_DEVICE to Setup Wizard.
 * 2. ACTION_ADMIN_POLICY_COMPLIANCE: Enforces baseline policies and returns RESULT_OK to Setup Wizard.
 *
 * Extends android.app.Activity (NOT AppCompatActivity) to guarantee zero theme incompatibilities
 * with Theme.Translucent.NoTitleBar and guarantee instant RESULT_OK return without hanging SetupWizard.
 */
class ProvisioningActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
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
        } catch (t: Throwable) {
            AppLogger.e("ProvisioningActivity", "Unexpected error in ProvisioningActivity: ${t.message}", t)
            setResult(Activity.RESULT_OK)
            finish()
        }
    }

    private fun handleGetProvisioningMode() {
        val allowedModes = intent?.getIntegerArrayListExtra(
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

        // Read admin extras bundle safely
        try {
            var serverUrl: String? = null
            var deviceTag: String? = null
            var companyCode: String? = null
            var branchId: String? = null
            var branchName: String? = null
            var branchCode: String? = null
            var enrollmentKey: String? = null

            // 1. Try PersistableBundle
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
                    serverUrl = extrasBundle.getString("server_url")
                    deviceTag = extrasBundle.getString("device_tag")
                        ?: extrasBundle.getString("device_name")
                        ?: extrasBundle.getString("android.app.extra.PROVISIONING_DEVICE_TAG")
                    companyCode = extrasBundle.getString("company_code")
                    branchId = extrasBundle.getString("branch_id") ?: extrasBundle.getString("branchId")
                    branchName = extrasBundle.getString("branch_name") ?: extrasBundle.getString("branch")
                    branchCode = extrasBundle.getString("branch_code") ?: extrasBundle.getString("branchCode")
                    enrollmentKey = extrasBundle.getString("enrollment_key")
                        ?: extrasBundle.getString("enrollmentKey")
                        ?: extrasBundle.getString("key")
                }
            } catch (_: Exception) {}

            // 2. Try standard Bundle fallback
            if (serverUrl == null && deviceTag == null) {
                val standardExtras = intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
                    ?: intent.extras?.getBundle(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
                if (standardExtras != null) {
                    serverUrl = standardExtras.getString("server_url")
                    deviceTag = standardExtras.getString("device_tag")
                        ?: standardExtras.getString("device_name")
                        ?: standardExtras.getString("android.app.extra.PROVISIONING_DEVICE_TAG")
                    companyCode = standardExtras.getString("company_code")
                    branchId = standardExtras.getString("branch_id") ?: standardExtras.getString("branchId")
                    branchName = standardExtras.getString("branch_name") ?: standardExtras.getString("branch")
                    branchCode = standardExtras.getString("branch_code") ?: standardExtras.getString("branchCode")
                    enrollmentKey = standardExtras.getString("enrollment_key")
                        ?: standardExtras.getString("enrollmentKey")
                        ?: standardExtras.getString("key")
                }
            }

            if (deviceTag.isNullOrBlank()) {
                deviceTag = intent.getStringExtra("android.app.extra.PROVISIONING_DEVICE_TAG")
            }

            if (!serverUrl.isNullOrBlank()) configStore.serverUrl = serverUrl
            if (!deviceTag.isNullOrBlank()) configStore.deviceTag = deviceTag
            if (!companyCode.isNullOrBlank()) configStore.companyCode = companyCode
            if (!enrollmentKey.isNullOrBlank()) configStore.enrollmentKey = enrollmentKey
            if (!branchId.isNullOrBlank()) {
                configStore.branchId = branchId
                configStore.branchName = branchName ?: ""
                configStore.branchCode = branchCode ?: ""
            }
        } catch (e: Exception) {
            AppLogger.e("ProvisioningActivity", "Error reading extras bundle in compliance activity", e)
        }

        // Apply baseline security policies and set home launcher
        try {
            configStore.isKioskEnabled = true
            val policyHelper = PolicyManagerHelper(this)
            policyHelper.applyBaselineSecurityPolicies()
            policyHelper.setAsDefaultHomeLauncher()
        } catch (e: Exception) {
            AppLogger.e("ProvisioningActivity", "Error applying baseline policies", e)
        }

        // Start Cloud Sync Service
        try {
            MdmCloudSyncService.start(this)
        } catch (_: Exception) {}

        // Always signal RESULT_OK to Setup Wizard so "Getting ready for work setup" screen completes immediately
        setResult(Activity.RESULT_OK)
        finish()
    }
}
