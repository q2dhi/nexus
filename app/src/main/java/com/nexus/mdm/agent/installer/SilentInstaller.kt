package com.nexus.mdm.agent.installer

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream

/**
 * Enterprise Silent Package Installer Engine.
 * Programmatically provisions APK binaries via PackageInstaller.Session without UI prompts.
 * Leverages Device Owner privileges to bypass user confirmation dialogs.
 */
class SilentInstaller(private val context: Context) {

    private val packageInstaller: PackageInstaller = context.packageManager.packageInstaller
    private val dpm: DevicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    /**
     * Verifies if the agent holds Device Owner status required for promptless silent installs.
     */
    fun canInstallSilently(): Boolean {
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    /**
     * Streams an APK file asynchronously into a PackageInstaller session and commits it.
     *
     * @param apkFile Local APK file to be installed.
     * @return Result containing sessionId or failure exception.
     */
    suspend fun installApk(apkFile: File): Result<Int> = withContext(Dispatchers.IO) {
        if (!apkFile.exists() || apkFile.length() == 0L) {
            val err = "APK file does not exist or is empty: ${apkFile.absolutePath}"
            AppLogger.e("SilentInstaller", err)
            return@withContext Result.failure(IllegalArgumentException(err))
        }

        try {
            FileInputStream(apkFile).use { inputStream ->
                installStream(inputStream, apkFile.length(), apkFile.name)
            }
        } catch (e: Exception) {
            AppLogger.e("SilentInstaller", "Failed to open APK file stream", e)
            Result.failure(e)
        }
    }

    /**
     * Streams an APK binary from an InputStream directly into the PackageInstaller pipeline.
     */
    suspend fun installStream(
        inputStream: InputStream,
        totalBytes: Long,
        sessionName: String = "nexus_silent_install"
    ): Result<Int> = withContext(Dispatchers.IO) {
        var sessionId = -1
        var session: PackageInstaller.Session? = null

        try {
            AppLogger.securityAudit(
                "SILENT_INSTALL_START",
                "Initiating PackageInstaller session for: $sessionName ($totalBytes bytes)"
            )

            // 1. Configure session parameters for full install
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setSize(totalBytes)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Instruct OS that Device Owner handles approval; no user prompt required
                    setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
            }

            // 2. Open session
            sessionId = packageInstaller.createSession(params)
            session = packageInstaller.openSession(sessionId)
            InstallStatusReceiver.setInProgress(sessionId)

            // 3. Asynchronously stream APK bytes
            val outputStream: OutputStream = session.openWrite(sessionName, 0, totalBytes)
            val buffer = ByteArray(64 * 1024) // 64 KB streaming buffer
            var bytesRead: Int
            var totalWritten = 0L

            outputStream.use { out ->
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    out.write(buffer, 0, bytesRead)
                    totalWritten += bytesRead
                }
                session.fsync(out)
            }

            AppLogger.i("SilentInstaller", "Stream complete: $totalWritten bytes written to session $sessionId")

            // 4. Create explicit PendingIntent IntentSender for the callback
            val callbackIntent = Intent(context, InstallStatusReceiver::class.java).apply {
                action = InstallStatusReceiver.ACTION_INSTALL_COMMIT
                // Explicit package routing to prevent interception
                setPackage(context.packageName)
            }

            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                sessionId,
                callbackIntent,
                flags
            )

            // 5. Commit session to the OS Package Manager
            session.commit(pendingIntent.intentSender)
            session.close()

            AppLogger.securityAudit(
                "SILENT_INSTALL_COMMITTED",
                "Session $sessionId successfully committed to PackageInstaller."
            )

            Result.success(sessionId)
        } catch (e: Exception) {
            AppLogger.e("SilentInstaller", "Failed to complete silent package installation", e)
            try {
                session?.abandon()
            } catch (abandonEx: Exception) {
                AppLogger.w("SilentInstaller", "Error abandoning session: ${abandonEx.message}")
            }
            Result.failure(e)
        }
    }
}
