package com.nexus.mdm.agent.provisioning

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import com.nexus.mdm.agent.admin.NexusAdminReceiver
import org.json.JSONObject
import java.security.MessageDigest

/**
 * Enterprise Zero-Touch QR Code Provisioning Payload Builder.
 * Constructs the canonical Android Enterprise enrollment JSON schema
 * and extracts the app's cryptographically verified SHA-256 certificate fingerprint.
 */
object ProvisioningPayloadBuilder {

    /**
     * Builds the standard Android Enterprise QR enrollment JSON string.
     */
    fun buildJsonBundle(
        context: Context,
        downloadUrl: String = "https://downloads.nexus-mdm.net/agent/nexus-latest.apk",
        serverUrl: String = "https://api.nexus-mdm.net/v1",
        deviceTag: String = "KIOSK-TERMINAL"
    ): String {
        val componentName = "${context.packageName}/${NexusAdminReceiver::class.java.name}"
        val checksum = getSigningCertSha256Checksum(context) ?: "SHA256_CHECKSUM_PLACEHOLDER"

        val extrasBundle = JSONObject().apply {
            put("server_url", serverUrl)
            put("device_tag", deviceTag)
            put("enrollment_timestamp", System.currentTimeMillis())
        }

        val root = JSONObject().apply {
            put("android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME", componentName)
            put("android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION", downloadUrl)
            put("android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM", checksum)
            put("android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED", true)
            put("android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE", extrasBundle)
        }

        return root.toString(2)
    }

    /**
     * Extracts and computes the URL-safe Base64 SHA-256 fingerprint of this app's signing certificate.
     */
    fun getSigningCertSha256Checksum(context: Context): String? {
        return try {
            val pm = context.packageManager
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                info.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION")
                val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
                @Suppress("DEPRECATION")
                info.signatures
            }

            val cert = signatures?.firstOrNull() ?: return null
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(cert.toByteArray())
            Base64.encodeToString(digest, Base64.NO_WRAP or Base64.URL_SAFE).trim()
        } catch (_: Exception) {
            null
        }
    }
}
