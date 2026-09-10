package com.nexus.mdm.agent.installer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Dedicated secure BroadcastReceiver for PackageInstaller session commit callbacks.
 * Receives the OS intent, resolves exact status codes, and emits state updates.
 */
class InstallStatusReceiver : BroadcastReceiver() {

    sealed class InstallResult {
        object Idle : InstallResult()
        data class InProgress(val sessionId: Int) : InstallResult()
        data class Success(val packageName: String) : InstallResult()
        data class Failure(val statusCode: Int, val message: String) : InstallResult()
    }

    companion object {
        const val ACTION_INSTALL_COMMIT = "com.nexus.mdm.agent.ACTION_INSTALL_COMMIT"

        private val _installState = MutableStateFlow<InstallResult>(InstallResult.Idle)
        val installState: StateFlow<InstallResult> = _installState.asStateFlow()

        fun setInProgress(sessionId: Int) {
            _installState.value = InstallResult.InProgress(sessionId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_INSTALL_COMMIT) {
            AppLogger.w("InstallReceiver", "Discarding unexpected broadcast action: ${intent.action}")
            return
        }

        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "No status message provided"
        val extraPkg = intent.getStringExtra(PackageInstaller.EXTRA_PACKAGE_NAME)
        val fallbackPkg = intent.getStringExtra("EXTRA_TARGET_PKG")
        val packageName = if (!extraPkg.isNullOrEmpty() && extraPkg != "Unknown Package") extraPkg else (fallbackPkg ?: "Unknown Package")

        when (status) {
            PackageInstaller.STATUS_SUCCESS -> {
                AppLogger.securityAudit(
                    "SILENT_INSTALL_SUCCESS",
                    "Application installed successfully without user prompt: $packageName"
                )
                _installState.value = InstallResult.Success(packageName)

                // Notify user and refresh Kiosk view
                try {
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        android.widget.Toast.makeText(context, "تم تثبيت التطبيق بنجاح: $packageName", android.widget.Toast.LENGTH_LONG).show()
                    }
                } catch (_: Exception) {}

                // Automatically include the newly installed package in Kiosk whitelist
                try {
                    val refreshIntent = Intent(context, com.nexus.mdm.agent.ui.MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        putExtra("EXTRA_WHITELIST_UPDATED", true)
                        putExtra("EXTRA_NEW_INSTALLED_PKG", packageName)
                    }
                    context.startActivity(refreshIntent)
                } catch (e: Exception) {
                    AppLogger.w("InstallReceiver", "Could not notify MainActivity: ${e.message}")
                }
            }

            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                AppLogger.w(
                    "InstallReceiver",
                    "STATUS_PENDING_USER_ACTION: Launching required user confirmation prompt..."
                )
                val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(confirmIntent)
                }
                _installState.value = InstallResult.Failure(status, "Pending user action required by system.")
            }

            PackageInstaller.STATUS_FAILURE_STORAGE -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Insufficient device storage. $message")
                _installState.value = InstallResult.Failure(status, "Storage failure: $message")
                showErrorToast(context, "فشل التثبيت: المساحة غير كافية ($message)")
            }

            PackageInstaller.STATUS_FAILURE_INVALID -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Invalid APK binary or parse error. $message")
                _installState.value = InstallResult.Failure(status, "Invalid APK: $message")
                showErrorToast(context, "فشل التثبيت: ملف APK غير صالح ($message)")
            }

            PackageInstaller.STATUS_FAILURE_CONFLICT -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Signature or package conflict. $message")
                _installState.value = InstallResult.Failure(status, "Signature/Version conflict: $message")
                showErrorToast(context, "فشل التثبيت: تعارض في التوقيع أو الإصدار ($message)")
            }

            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                AppLogger.e("InstallReceiver", "Silent install blocked by policy or system. $message")
                _installState.value = InstallResult.Failure(status, "Blocked by policy: $message")
                showErrorToast(context, "فشل التثبيت: محظور بسياسة النظام ($message)")
            }

            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Incompatible architecture/ABI. $message")
                _installState.value = InstallResult.Failure(status, "Incompatible ABI: $message")
                showErrorToast(context, "فشل التثبيت: غير متوافق مع معالج الجهاز ($message)")
            }

            else -> {
                AppLogger.e("InstallReceiver", "Silent install failed with status code $status: $message")
                _installState.value = InstallResult.Failure(status, message)
                showErrorToast(context, "فشل تثبيت التطبيق: $message (رمز: $status)")
            }
        }
    }

    private fun showErrorToast(context: Context, text: String) {
        try {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                android.widget.Toast.makeText(context, text, android.widget.Toast.LENGTH_LONG).show()
            }
        } catch (_: Exception) {}
    }
}
