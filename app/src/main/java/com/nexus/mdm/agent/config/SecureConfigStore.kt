package com.nexus.mdm.agent.config

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.UserManager
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.nexus.mdm.agent.util.AppLogger
import com.nexus.mdm.agent.util.CryptoUtils

/**
 * Enterprise Encrypted Configuration Store.
 * Protects administrative secrets, custom maintenance PIN hashes, and MDM tokens
 * using hardware-backed AES-256 GCM encryption via AndroidX Security Crypto.
 *
 * Includes robust recovery for corrupted keystore (common after factory reset on
 * Honeywell/Zebra devices) and Direct Boot guard to prevent crashes when the
 * credential-encrypted storage is not yet available.
 */
class SecureConfigStore(context: Context) {

    companion object {
        private const val PREFS_FILE_NAME = "nexus_secure_config"
        private const val PREFS_FALLBACK_NAME = "nexus_secure_config_fallback"
        private const val KEY_SERVER_URL = "cfg_server_url"
        private const val KEY_AUTH_TOKEN = "cfg_auth_token"
        private const val KEY_DEVICE_TAG = "cfg_device_tag"
        private const val KEY_PIN_HASH = "cfg_pin_hash"
        private const val KEY_PIN_SALT = "cfg_pin_salt"
        private const val KEY_WHITELISTED_PACKAGES = "cfg_whitelisted_packages"
        private const val KEY_KIOSK_ENABLED = "cfg_kiosk_enabled"
        private const val KEY_COMPANY_CODE = "cfg_company_code"
        private const val KEY_BRANCH_ID = "cfg_branch_id"
        private const val KEY_BRANCH_NAME = "cfg_branch_name"
        private const val KEY_BRANCH_CODE = "cfg_branch_code"
        private const val KEY_SUBSCRIPTION_ACTIVE = "cfg_subscription_active"
        private const val KEY_ENROLLMENT_KEY = "cfg_enrollment_key"

        private const val DEFAULT_SALT = "NEXUS_MDM_SALT_2026"
        private const val DEFAULT_PIN = "849201"
        private const val DEFAULT_ENROLLMENT_KEY = "ENROLL-NEXUS-2026-KEY"

        /** Maximum retry attempts for EncryptedSharedPreferences initialization */
        private const val MAX_INIT_RETRIES = 2
    }

    private val sharedPreferences: SharedPreferences = createSecurePreferences(context)

    /**
     * Creates EncryptedSharedPreferences with robust error recovery.
     * On failure:
     * 1. First retry: delete corrupted prefs file and re-create
     * 2. Second retry: fall back to standard MODE_PRIVATE SharedPreferences
     *
     * This handles the common Android Keystore corruption scenario that occurs
     * on Honeywell CT47/CT45 devices after factory reset + QR provisioning.
     */
    private fun createSecurePreferences(context: Context): SharedPreferences {
        // Guard: Direct Boot — credential-encrypted storage is unavailable before first unlock
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val userManager = context.getSystemService(Context.USER_SERVICE) as? UserManager
            if (userManager != null && !userManager.isUserUnlocked) {
                AppLogger.w("SecureConfig", "Device is in Direct Boot mode — using device-encrypted fallback")
                return context.createDeviceProtectedStorageContext()
                    .getSharedPreferences(PREFS_FALLBACK_NAME, Context.MODE_PRIVATE)
            }
        }

        for (attempt in 0..MAX_INIT_RETRIES) {
            try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()

                return EncryptedSharedPreferences.create(
                    context,
                    PREFS_FILE_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (e: Exception) {
                AppLogger.w(
                    "SecureConfig",
                    "EncryptedSharedPreferences init failed (attempt ${attempt + 1}/${MAX_INIT_RETRIES + 1}): ${e.message}"
                )

                if (attempt < MAX_INIT_RETRIES) {
                    // Delete the corrupted preferences file and retry
                    try {
                        val prefsFile = java.io.File(
                            context.applicationInfo.dataDir,
                            "shared_prefs/$PREFS_FILE_NAME.xml"
                        )
                        if (prefsFile.exists()) {
                            prefsFile.delete()
                            AppLogger.i("SecureConfig", "Deleted corrupted prefs file, retrying...")
                        }
                    } catch (deleteEx: Exception) {
                        AppLogger.w("SecureConfig", "Failed to delete corrupted prefs: ${deleteEx.message}")
                    }
                }
            }
        }

        // Final fallback: standard SharedPreferences (unencrypted but functional)
        AppLogger.w("SecureConfig", "All encrypted prefs attempts failed — using unencrypted MODE_PRIVATE fallback")
        return context.getSharedPreferences(PREFS_FALLBACK_NAME, Context.MODE_PRIVATE)
    }

    init {
        // Initialize default salted PIN if not set
        try {
            if (!sharedPreferences.contains(KEY_PIN_HASH)) {
                val defaultHash = CryptoUtils.hashSha256(DEFAULT_PIN, DEFAULT_SALT)
                sharedPreferences.edit()
                    .putString(KEY_PIN_SALT, DEFAULT_SALT)
                    .putString(KEY_PIN_HASH, defaultHash)
                    .apply()
            }
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed to initialize default PIN: ${e.message}")
        }
    }

    var serverUrl: String
        get() = safeGetString(KEY_SERVER_URL, "http://192.168.0.101:3000")
        set(value) = safePutString(KEY_SERVER_URL, value)

    var authToken: String
        get() = safeGetString(KEY_AUTH_TOKEN, "")
        set(value) = safePutString(KEY_AUTH_TOKEN, value)

    var deviceTag: String
        get() = safeGetString(KEY_DEVICE_TAG, "NEXUS-DEVICE-01")
        set(value) = safePutString(KEY_DEVICE_TAG, value)

    var companyCode: String
        get() = safeGetString(KEY_COMPANY_CODE, "NEXUS-DEFAULT")
        set(value) = safePutString(KEY_COMPANY_CODE, value)

    var branchId: String
        get() = safeGetString(KEY_BRANCH_ID, "")
        set(value) = safePutString(KEY_BRANCH_ID, value)

    var branchName: String
        get() = safeGetString(KEY_BRANCH_NAME, "")
        set(value) = safePutString(KEY_BRANCH_NAME, value)

    var branchCode: String
        get() = safeGetString(KEY_BRANCH_CODE, "")
        set(value) = safePutString(KEY_BRANCH_CODE, value)

    var isSubscriptionActive: Boolean
        get() = safeGetBoolean(KEY_SUBSCRIPTION_ACTIVE, true)
        set(value) = safePutBoolean(KEY_SUBSCRIPTION_ACTIVE, value)

    var whitelistedPackages: Set<String>
        get() = try {
            sharedPreferences.getStringSet(KEY_WHITELISTED_PACKAGES, emptySet()) ?: emptySet()
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed reading whitelistedPackages: ${e.message}")
            emptySet()
        }
        set(value) = try {
            sharedPreferences.edit().putStringSet(KEY_WHITELISTED_PACKAGES, value).apply()
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed writing whitelistedPackages: ${e.message}")
        }

    var enrollmentKey: String
        get() = safeGetString(KEY_ENROLLMENT_KEY, DEFAULT_ENROLLMENT_KEY)
        set(value) = safePutString(KEY_ENROLLMENT_KEY, value)

    var isKioskEnabled: Boolean
        get() = safeGetBoolean(KEY_KIOSK_ENABLED, false)
        set(value) = safePutBoolean(KEY_KIOSK_ENABLED, value)

    fun verifyPin(enteredPin: String): Boolean {
        return try {
            val salt = safeGetString(KEY_PIN_SALT, DEFAULT_SALT)
            val expectedHash = safeGetString(KEY_PIN_HASH, "")
            if (expectedHash.isEmpty()) return false
            val computed = CryptoUtils.hashSha256(enteredPin, salt)
            CryptoUtils.slowEquals(computed, expectedHash)
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "PIN verification error: ${e.message}")
            false
        }
    }

    fun updatePin(newPin: String): Boolean {
        if (newPin.length < 4) return false
        return try {
            val newSalt = CryptoUtils.generateSecureNonce(8)
            val newHash = CryptoUtils.hashSha256(newPin, newSalt)
            sharedPreferences.edit()
                .putString(KEY_PIN_SALT, newSalt)
                .putString(KEY_PIN_HASH, newHash)
                .apply()
            AppLogger.securityAudit("PIN_UPDATED", "Technician maintenance PIN updated successfully.")
            true
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed to update PIN: ${e.message}")
            false
        }
    }

    // --- Safe accessor helpers that prevent crashes from corrupt SharedPreferences ---

    private fun safeGetString(key: String, default: String): String {
        return try {
            sharedPreferences.getString(key, default) ?: default
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed reading key '$key': ${e.message}")
            default
        }
    }

    private fun safePutString(key: String, value: String) {
        try {
            sharedPreferences.edit().putString(key, value).apply()
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed writing key '$key': ${e.message}")
        }
    }

    private fun safeGetBoolean(key: String, default: Boolean): Boolean {
        return try {
            sharedPreferences.getBoolean(key, default)
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed reading boolean '$key': ${e.message}")
            default
        }
    }

    private fun safePutBoolean(key: String, value: Boolean) {
        try {
            sharedPreferences.edit().putBoolean(key, value).apply()
        } catch (e: Exception) {
            AppLogger.w("SecureConfig", "Failed writing boolean '$key': ${e.message}")
        }
    }
}
