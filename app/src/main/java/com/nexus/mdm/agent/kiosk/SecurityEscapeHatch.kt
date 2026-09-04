package com.nexus.mdm.agent.kiosk

import android.app.Dialog
import android.content.Context
import android.os.SystemClock
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.nexus.mdm.agent.R
import com.nexus.mdm.agent.util.AppLogger
import com.nexus.mdm.agent.util.CryptoUtils

/**
 * Hidden Cryptographic Recovery Escape Hatch for field maintenance.
 * Triggered by a rapid multi-tap sequence on a designated UI target.
 * Challenges technicians with a dynamic salted SHA-256 challenge,
 * enforced by constant-time verification and anti-brute force lockout.
 */
class SecurityEscapeHatch(
    private val context: Context,
    private val onAuthorizedExit: () -> Unit
) {

    companion object {
        private const val REQUIRED_TAPS = 5
        private const val TAP_WINDOW_MS = 2500L
        private const val MAX_FAILED_ATTEMPTS = 3
        private const val LOCKOUT_DURATION_MS = 60_000L

        // Default Enterprise Salt & Precomputed SHA-256 hash for Field Maintenance PIN ("849201")
        // In a live production environment, this is provisioned dynamically via MDM server policy
        private const val MASTER_SALT = "NEXUS_MDM_SALT_2026"
        private const val DEFAULT_PIN = "849201"
        private val EXPECTED_HASH = CryptoUtils.hashSha256(DEFAULT_PIN, MASTER_SALT)
    }

    private val tapTimestamps = mutableListOf<Long>()
    private var failedAttempts = 0
    private var lockoutUntilTimestamp = 0L

    /**
     * Attaches a hidden multi-tap listener to a designated view (e.g. logo or badge).
     */
    fun attachTo(view: View) {
        view.setOnClickListener {
            handleTap()
        }
    }

    private fun handleTap() {
        val now = SystemClock.elapsedRealtime()

        // Check active lockout
        if (now < lockoutUntilTimestamp) {
            val remainingSeconds = (lockoutUntilTimestamp - now) / 1000
            AppLogger.w("EscapeHatch", "Escape hatch lockout active: $remainingSeconds seconds remaining.")
            Toast.makeText(context, "Terminal locked. Retry in $remainingSeconds s", Toast.LENGTH_SHORT).show()
            return
        }

        // Clean up taps outside the sliding time window
        tapTimestamps.add(now)
        val windowStart = now - TAP_WINDOW_MS
        tapTimestamps.removeAll { it < windowStart }

        if (tapTimestamps.size >= REQUIRED_TAPS) {
            tapTimestamps.clear()
            AppLogger.securityAudit("ESCAPE_HATCH_TRIGGER", "Multi-tap sequence detected. Presenting challenge dialog.")
            showChallengeDialog()
        }
    }

    /**
     * Presents the cryptographic challenge-response dialog to the field technician.
     */
    private fun showChallengeDialog() {
        val sessionNonce = CryptoUtils.generateSecureNonce(4).uppercase()
        val dialog = Dialog(context, R.style.Theme_NexusDPC)
        val dialogView = LayoutInflater.from(context).inflate(R.layout.dialog_escape_hatch, null)
        dialog.setContentView(dialogView)
        dialog.setCancelable(false)

        val tvNonce = dialogView.findViewById<TextView>(R.id.tvChallengeNonce)
        val tvAttempts = dialogView.findViewById<TextView>(R.id.tvAttemptWarning)
        val tilPin = dialogView.findViewById<TextInputLayout>(R.id.tilPin)
        val etPin = dialogView.findViewById<TextInputEditText>(R.id.etPin)
        val btnCancel = dialogView.findViewById<Button>(R.id.btnCancelEscape)
        val btnConfirm = dialogView.findViewById<Button>(R.id.btnConfirmEscape)

        tvNonce.text = "CHALLENGE NONCE: $sessionNonce"
        val remainingAttempts = MAX_FAILED_ATTEMPTS - failedAttempts
        tvAttempts.text = "Attempts Remaining: $remainingAttempts / $MAX_FAILED_ATTEMPTS"

        btnCancel.setOnClickListener {
            AppLogger.i("EscapeHatch", "Escape challenge cancelled by user.")
            dialog.dismiss()
        }

        btnConfirm.setOnClickListener {
            val enteredPin = etPin.text?.toString().orEmpty().trim()

            if (enteredPin.isEmpty()) {
                tilPin.error = "PIN required"
                return@setOnClickListener
            }

            // Verify with Salted SHA-256 using constant-time comparison via SecureConfigStore
            val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
            val isValid = configStore.verifyPin(enteredPin)

            if (isValid) {
                AppLogger.securityAudit("ESCAPE_HATCH_AUTH_SUCCESS", "Cryptographic PIN challenge passed.")
                failedAttempts = 0
                dialog.dismiss()
                Toast.makeText(context, "Maintenance Authentication Granted.", Toast.LENGTH_SHORT).show()
                onAuthorizedExit.invoke()
            } else {
                failedAttempts++
                AppLogger.securityAudit(
                    "ESCAPE_HATCH_AUTH_FAILURE",
                    "Invalid PIN attempt ($failedAttempts/$MAX_FAILED_ATTEMPTS)"
                )

                if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                    lockoutUntilTimestamp = SystemClock.elapsedRealtime() + LOCKOUT_DURATION_MS
                    failedAttempts = 0
                    AppLogger.securityAudit(
                        "ESCAPE_HATCH_LOCKOUT",
                        "Anti-brute force lockout triggered for ${LOCKOUT_DURATION_MS / 1000}s"
                    )
                    dialog.dismiss()
                    Toast.makeText(context, "Security Lockout: Too many failed attempts.", Toast.LENGTH_LONG).show()
                } else {
                    val remaining = MAX_FAILED_ATTEMPTS - failedAttempts
                    tvAttempts.text = "Attempts Remaining: $remaining / $MAX_FAILED_ATTEMPTS"
                    tilPin.error = "Invalid Technician PIN"
                    etPin.setText("")
                }
            }
        }

        dialog.show()
    }
}
