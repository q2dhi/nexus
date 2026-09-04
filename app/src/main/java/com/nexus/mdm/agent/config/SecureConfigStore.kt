package com.nexus.mdm.agent.config

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.nexus.mdm.agent.util.AppLogger
import com.nexus.mdm.agent.util.CryptoUtils

/**
 * Enterprise Encrypted Configuration Store.
 * Protects administrative secrets, custom maintenance PIN hashes, and MDM tokens
 * using hardware-backed AES-256 GCM encryption via AndroidX Security Crypto.
 */
class SecureConfigStore(context: Context) {

    companion object {
        private const val PREFS_FILE_NAME = "nexus_secure_config"
        private const val KEY_SERVER_URL = "cfg_server_url"
        private const val KEY_AUTH_TOKEN = "cfg_auth_token"
        private const val KEY_DEVICE_TAG = "cfg_device_tag"
        private const val KEY_PIN_HASH = "cfg_pin_hash"
        private const val KEY_PIN_SALT = "cfg_pin_salt"
        private const val KEY_WHITELISTED_PACKAGES = "cfg_whitelisted_packages"
        private const val KEY_KIOSK_ENABLED = "cfg_kiosk_enabled"
        private const val KEY_COMPANY_CODE = "cfg_company_code"
        private const val KEY_SUBSCRIPTION_ACTIVE = "cfg_subscription_active"

        private const val DEFAULT_SALT = "NEXUS_MDM_SALT_2026"
        private const val DEFAULT_PIN = "849201"
    }

    private val sharedPreferences: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        AppLogger.w("SecureConfig", "EncryptedSharedPreferences failed, falling back to private prefs: ${e.message}")
        context.getSharedPreferences(PREFS_FILE_NAME, Context.MODE_PRIVATE)
    }

    init {
        // Initialize default salted PIN if not set
        if (!sharedPreferences.contains(KEY_PIN_HASH)) {
            val defaultHash = CryptoUtils.hashSha256(DEFAULT_PIN, DEFAULT_SALT)
            sharedPreferences.edit()
                .putString(KEY_PIN_SALT, DEFAULT_SALT)
                .putString(KEY_PIN_HASH, defaultHash)
                .apply()
        }
    }

    var serverUrl: String
        get() = sharedPreferences.getString(KEY_SERVER_URL, "http://192.168.0.101:3000") ?: "http://192.168.0.101:3000"
        set(value) = sharedPreferences.edit().putString(KEY_SERVER_URL, value).apply()

    var authToken: String
        get() = sharedPreferences.getString(KEY_AUTH_TOKEN, "") ?: ""
        set(value) = sharedPreferences.edit().putString(KEY_AUTH_TOKEN, value).apply()

    var deviceTag: String
        get() = sharedPreferences.getString(KEY_DEVICE_TAG, "NEXUS-DEVICE-01") ?: "NEXUS-DEVICE-01"
        set(value) = sharedPreferences.edit().putString(KEY_DEVICE_TAG, value).apply()

    var companyCode: String
        get() = sharedPreferences.getString(KEY_COMPANY_CODE, "NEXUS-DEFAULT") ?: "NEXUS-DEFAULT"
        set(value) = sharedPreferences.edit().putString(KEY_COMPANY_CODE, value).apply()

    var isSubscriptionActive: Boolean
        get() = sharedPreferences.getBoolean(KEY_SUBSCRIPTION_ACTIVE, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_SUBSCRIPTION_ACTIVE, value).apply()

    var whitelistedPackages: Set<String>
        get() = sharedPreferences.getStringSet(KEY_WHITELISTED_PACKAGES, emptySet()) ?: emptySet()
        set(value) = sharedPreferences.edit().putStringSet(KEY_WHITELISTED_PACKAGES, value).apply()

    var isKioskEnabled: Boolean
        get() = sharedPreferences.getBoolean(KEY_KIOSK_ENABLED, true)
        set(value) = sharedPreferences.edit().putBoolean(KEY_KIOSK_ENABLED, value).apply()

    fun verifyPin(enteredPin: String): Boolean {
        val salt = sharedPreferences.getString(KEY_PIN_SALT, DEFAULT_SALT) ?: DEFAULT_SALT
        val expectedHash = sharedPreferences.getString(KEY_PIN_HASH, "") ?: ""
        val computed = CryptoUtils.hashSha256(enteredPin, salt)
        return CryptoUtils.slowEquals(computed, expectedHash)
    }

    fun updatePin(newPin: String): Boolean {
        if (newPin.length < 4) return false
        val newSalt = CryptoUtils.generateSecureNonce(8)
        val newHash = CryptoUtils.hashSha256(newPin, newSalt)
        sharedPreferences.edit()
            .putString(KEY_PIN_SALT, newSalt)
            .putString(KEY_PIN_HASH, newHash)
            .apply()
        AppLogger.securityAudit("PIN_UPDATED", "Technician maintenance PIN updated successfully.")
        return true
    }
}
