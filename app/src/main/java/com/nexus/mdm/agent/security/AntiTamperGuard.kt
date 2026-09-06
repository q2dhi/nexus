package com.nexus.mdm.agent.security

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.telephony.TelephonyManager
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Enterprise Anti-Tamper & SIM-Swap Security Guard.
 * Monitors hardware interfaces (SIM card presence, carrier changes, hardware tampering).
 * In the event of unauthorized tampering, sounds an emergency audio siren,
 * enforces lockdown, and flags the incident to the central Web Admin.
 */
class AntiTamperGuard(
    private val context: Context,
    private val onTamperDetected: (reason: String) -> Unit
) {

    private val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
    private val configStore = SecureConfigStore(context)
    private val isAlarmPlaying = AtomicBoolean(false)
    private var alarmJob: Job? = null
    private var receiver: BroadcastReceiver? = null

    companion object {
        private const val PREF_SAVED_SIM_OPERATOR = "cfg_enrolled_sim_op"
        var isBreached: Boolean = false
            private set
        var lastBreachReason: String = ""
            private set
    }

    fun startMonitoring() {
        try {
            saveBaselineSimState()
        } catch (_: Throwable) {}

        val filter = IntentFilter().apply {
            addAction("android.intent.action.SIM_STATE_CHANGED")
            addAction("android.telephony.action.SIM_CARD_STATE_CHANGED")
        }

        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                try {
                    checkSimIntegrity()
                } catch (_: Throwable) {}
            }
        }

        try {
            androidx.core.content.ContextCompat.registerReceiver(
                context,
                receiver!!,
                filter,
                androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
            )
            AppLogger.i("AntiTamper", "Anti-tamper hardware sentinel initialized.")
        } catch (e: Exception) {
            AppLogger.w("AntiTamper", "Failed to register SIM state receiver: ${e.message}")
        }
    }

    fun stopMonitoring() {
        receiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
            receiver = null
        }
        disarmAlarm()
    }

    fun checkSimIntegrity() {
        try {
            val tm = telephonyManager ?: return
            val hasPhonePermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.READ_PHONE_STATE
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            val state = try { tm.simState } catch (_: Throwable) { return }

            when (state) {
                TelephonyManager.SIM_STATE_ABSENT -> {
                    val prefs = context.getSharedPreferences("nexus_sim_guard", Context.MODE_PRIVATE)
                    val baselineOp = prefs.getString(PREF_SAVED_SIM_OPERATOR, null)
                    // Only trigger alarm if a SIM card was previously enrolled and was physically removed!
                    if (!baselineOp.isNullOrEmpty()) {
                        triggerTamperAlarm("SIM Card Removed! (Expected: $baselineOp)")
                    }
                }
                TelephonyManager.SIM_STATE_READY -> {
                    if (!hasPhonePermission) return
                    val currentOp = try { tm.simOperator.orEmpty() } catch (_: Throwable) { "" }
                    val prefs = context.getSharedPreferences("nexus_sim_guard", Context.MODE_PRIVATE)
                    val baselineOp = prefs.getString(PREF_SAVED_SIM_OPERATOR, null)

                    if (baselineOp.isNullOrEmpty() && currentOp.isNotEmpty()) {
                        prefs.edit().putString(PREF_SAVED_SIM_OPERATOR, currentOp).apply()
                    } else if (!baselineOp.isNullOrEmpty() && currentOp.isNotEmpty() && baselineOp != currentOp) {
                        triggerTamperAlarm("Unauthorized SIM Swap Detected! Expected: $baselineOp, Found: $currentOp")
                    }
                }
            }
        } catch (t: Throwable) {
            AppLogger.w("AntiTamper", "checkSimIntegrity safely caught: ${t.message}")
        }
    }

    fun triggerTamperAlarm(reason: String) {
        if (isBreached) return
        isBreached = true
        lastBreachReason = reason

        AppLogger.securityAudit("TAMPER_BREACH", "EMERGENCY: $reason")

        try {
            startSirenLoop()
        } catch (e: Exception) {
            AppLogger.w("AntiTamper", "Failed starting siren: ${e.message}")
        }

        try {
            onTamperDetected(reason)
        } catch (e: Exception) {
            AppLogger.e("AntiTamper", "Error executing onTamperDetected callback", e)
        }
    }

    fun disarmAlarm() {
        isBreached = false
        lastBreachReason = ""
        isAlarmPlaying.set(false)
        alarmJob?.cancel()
        alarmJob = null
        AppLogger.securityAudit("TAMPER_DISARMED", "Security siren disarmed by administrator.")
    }

    private fun saveBaselineSimState() {
        try {
            val tm = telephonyManager ?: return
            val hasPhonePermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.READ_PHONE_STATE
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!hasPhonePermission) return

            val prefs = context.getSharedPreferences("nexus_sim_guard", Context.MODE_PRIVATE)
            if (!prefs.contains(PREF_SAVED_SIM_OPERATOR)) {
                val op = try { tm.simOperator.orEmpty() } catch (_: Throwable) { "" }
                if (op.isNotEmpty()) {
                    prefs.edit().putString(PREF_SAVED_SIM_OPERATOR, op).apply()
                }
            }
        } catch (t: Throwable) {
            AppLogger.w("AntiTamper", "saveBaselineSimState safely caught: ${t.message}")
        }
    }

    /**
     * Synthesizes an emergency alternating frequency warble siren using AudioTrack.
     * Does not require external audio files and works at maximum volume.
     */
    private fun startSirenLoop() {
        if (isAlarmPlaying.getAndSet(true)) return

        alarmJob = CoroutineScope(Dispatchers.Default).launch {
            val sampleRate = 44100
            val minBufferSize = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )

            val audioTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(minBufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()

            try {
                audioTrack.play()
                val durationMs = 250
                val numSamples = (sampleRate * (durationMs / 1000.0)).toInt()
                val lowFreq = 800.0
                val highFreq = 1600.0
                var toggle = false

                while (isAlarmPlaying.get() && isActive) {
                    val freq = if (toggle) highFreq else lowFreq
                    toggle = !toggle

                    val buffer = ShortArray(numSamples)
                    for (i in 0 until numSamples) {
                        val angle = 2.0 * Math.PI * i / (sampleRate / freq)
                        buffer[i] = (Math.sin(angle) * Short.MAX_VALUE * 0.8).toInt().toShort()
                    }

                    audioTrack.write(buffer, 0, buffer.size)
                }
            } catch (e: Exception) {
                AppLogger.w("AntiTamper", "Siren playback: ${e.message}")
            } finally {
                try {
                    audioTrack.stop()
                    audioTrack.release()
                } catch (_: Exception) {}
            }
        }
    }
}
