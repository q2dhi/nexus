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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Enterprise Android Enterprise Provisioning Activity.
 * Handles modern Android Enterprise (Android 10, 11, 12, 13, 14+) setup wizard callbacks:
 * 1. ACTION_GET_PROVISIONING_MODE: Returns PROVISIONING_MODE_FULLY_MANAGED_DEVICE to Setup Wizard.
 * 2. ACTION_ADMIN_POLICY_COMPLIANCE: Enforces baseline policies and returns RESULT_OK to Setup Wizard.
 *
 * CRITICAL FIX: Returns RESULT_OK to Setup Wizard IMMEDIATELY to prevent ANR on the
 * "Getting ready for work setup..." screen. All heavy work (policy enforcement,
 * cloud sync, home launcher set) is deferred to a background coroutine.
 *
 * Extends android.app.Activity (NOT AppCompatActivity) to guarantee zero theme incompatibilities
 * with Theme.Translucent.NoTitleBar and guarantee instant RESULT_OK return without hanging SetupWizard.
 */
class ProvisioningActivity : Activity() {

    /** Guard flag to prevent re-execution on configuration change / process restart */
    private var hasProcessedIntent = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Guard against duplicate processing if Activity is re-created
        if (savedInstanceState?.getBoolean("PROCESSED", false) == true) {
            hasProcessedIntent = true
            setResult(Activity.RESULT_OK)
            finish()
            return
        }

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

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean("PROCESSED", hasProcessedIntent)
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
        hasProcessedIntent = true
        AppLogger.i("ProvisioningActivity", "Processing Admin Policy Compliance...")

        // 1. Extract provisioning extras synchronously (fast string reads)
        val extras = extractProvisioningExtras()

        // 2. Defer ALL heavy work to a background coroutine
        val appContext = applicationContext
        CoroutineScope(Dispatchers.IO + SupervisorJob()).launch {
            try {
                applyPostProvisioningPolicies(appContext, extras)
            } catch (e: Exception) {
                AppLogger.e("ProvisioningActivity", "Post-provisioning background work failed: ${e.message}", e)
            }
        }

        // 3. CRITICAL: Return RESULT_OK and finish immediately so Setup Wizard completes
        // and transfers the foreground to the newly assigned Home Activity without ANR
        setResult(Activity.RESULT_OK)
        finish()
    }

    /**
     * Extracts provisioning extras from the intent bundle.
     */
    private fun extractProvisioningExtras(): ProvisioningExtras {
        var serverUrl: String? = null
        var deviceTag: String? = null
        var companyCode: String? = null
        var branchId: String? = null
        var branchName: String? = null
        var branchCode: String? = null
        var enrollmentKey: String? = null

        try {
            // 1. Try PersistableBundle
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

            // 2. Try standard Bundle fallback
            if (serverUrl == null && deviceTag == null) {
                val standardExtras = try {
                    intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
                        ?: intent.extras?.getBundle(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
                } catch (_: Exception) { null }

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
        } catch (e: Exception) {
            AppLogger.e("ProvisioningActivity", "Error reading extras bundle", e)
        }

        return ProvisioningExtras(serverUrl, deviceTag, companyCode, branchId, branchName, branchCode, enrollmentKey)
    }

    /**
     * Applies all post-provisioning policies on a background thread.
     */
    private fun applyPostProvisioningPolicies(context: android.content.Context, extras: ProvisioningExtras) {
        try {
            val configStore = SecureConfigStore(context)
            if (!extras.serverUrl.isNullOrBlank()) configStore.serverUrl = extras.serverUrl
            if (!extras.deviceTag.isNullOrBlank()) configStore.deviceTag = extras.deviceTag
            if (!extras.companyCode.isNullOrBlank()) configStore.companyCode = extras.companyCode
            if (!extras.enrollmentKey.isNullOrBlank()) configStore.enrollmentKey = extras.enrollmentKey
            if (!extras.branchId.isNullOrBlank()) {
                configStore.branchId = extras.branchId
                configStore.branchName = extras.branchName ?: ""
                configStore.branchCode = extras.branchCode ?: ""
            }

            configStore.isKioskEnabled = true
            val policyHelper = PolicyManagerHelper(context)

            // Whitelist LockTask packages FIRST
            try {
                policyHelper.dpm.setLockTaskPackages(
                    policyHelper.adminComponent,
                    arrayOf(context.packageName)
                )
            } catch (_: Exception) {}

            // Apply baseline security policies
            policyHelper.applyBaselineSecurityPolicies()

            // Establish persistent preferred home launcher
            policyHelper.setAsDefaultHomeLauncher()

            AppLogger.i("ProvisioningActivity", "Post-provisioning policies applied successfully")
        } catch (e: Exception) {
            AppLogger.e("ProvisioningActivity", "Error applying post-provisioning policies: ${e.message}", e)
        }

        // Start Cloud Sync Service
        try {
            MdmCloudSyncService.start(context)
        } catch (_: Exception) {}
    }

    private data class ProvisioningExtras(
        val serverUrl: String?,
        val deviceTag: String?,
        val companyCode: String?,
        val branchId: String?,
        val branchName: String?,
        val branchCode: String?,
        val enrollmentKey: String?
    )
}
