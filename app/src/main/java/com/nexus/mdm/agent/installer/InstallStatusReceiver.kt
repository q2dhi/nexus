package com.nexus.mdm.agent.installer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
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
        val packageName = intent.getStringExtra(PackageInstaller.EXTRA_PACKAGE_NAME) ?: "Unknown Package"

        when (status) {
            PackageInstaller.STATUS_SUCCESS -> {
                AppLogger.securityAudit(
                    "SILENT_INSTALL_SUCCESS",
                    "Application installed successfully without user prompt: $packageName"
                )
                _installState.value = InstallResult.Success(packageName)
            }

            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                AppLogger.w(
                    "InstallReceiver",
                    "STATUS_PENDING_USER_ACTION: Device Owner authorization was bypassed or user action required."
                )
                _installState.value = InstallResult.Failure(status, "Pending user action required by system.")
            }

            PackageInstaller.STATUS_FAILURE_STORAGE -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Insufficient device storage. $message")
                _installState.value = InstallResult.Failure(status, "Storage failure: $message")
            }

            PackageInstaller.STATUS_FAILURE_INVALID -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Invalid APK binary or parse error. $message")
                _installState.value = InstallResult.Failure(status, "Invalid APK: $message")
            }

            PackageInstaller.STATUS_FAILURE_CONFLICT -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Signature or package conflict. $message")
                _installState.value = InstallResult.Failure(status, "Signature/Version conflict: $message")
            }

            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                AppLogger.e("InstallReceiver", "Silent install blocked by policy or system. $message")
                _installState.value = InstallResult.Failure(status, "Blocked by policy: $message")
            }

            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> {
                AppLogger.e("InstallReceiver", "Silent install failed: Incompatible architecture/ABI. $message")
                _installState.value = InstallResult.Failure(status, "Incompatible ABI: $message")
            }

            else -> {
                AppLogger.e("InstallReceiver", "Silent install failed with status code $status: $message")
                _installState.value = InstallResult.Failure(status, message)
            }
        }
    }
}
