package com.nexus.mdm.agent.util

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Enterprise cryptographic utility for zero-trust token generation,
 * salted SHA-256/PBKDF2 verification, and constant-time string comparisons.
 */
object CryptoUtils {

    private val secureRandom = SecureRandom()
    private const val PBKDF2_ITERATIONS = 10_000
    private const val KEY_LENGTH_BITS = 256

    /**
     * Generates a cryptographically secure random hexadecimal nonce of specified byte length.
     */
    fun generateSecureNonce(byteLength: Int = 8): String {
        val bytes = ByteArray(byteLength)
        secureRandom.nextBytes(bytes)
        return bytes.toHex()
    }

    /**
     * Hashes an input PIN with a provided salt using SHA-256.
     */
    fun hashSha256(input: String, salt: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(salt.toByteArray(Charsets.UTF_8))
        val hashBytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hashBytes.toHex()
    }

    /**
     * PBKDF2 with HmacSHA256 key derivation function for hardened offline credential verification.
     */
    fun hashPbkdf2(password: CharArray, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH_BITS)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return factory.generateSecret(spec).encoded
    }

    /**
     * Constant-time comparison to protect against side-channel timing attacks.
     */
    fun slowEquals(a: String, b: String): Boolean {
        return MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))
    }

    /**
     * Extension function to convert ByteArray to Hex string.
     */
    fun ByteArray.toHex(): String {
        return joinToString("") { "%02x".format(it) }
    }

    /**
     * Extension function to convert Hex string to ByteArray.
     */
    fun String.hexToByteArray(): ByteArray {
        val len = length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(this[i], 16) shl 4) +
                    Character.digit(this[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }
}
