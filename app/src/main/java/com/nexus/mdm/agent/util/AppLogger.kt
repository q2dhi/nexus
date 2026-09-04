package com.nexus.mdm.agent.util

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedDeque

/**
 * Enterprise Audit Logging Engine.
 * Formats events with microsecond timestamps and broadcasts updates
 * via StateFlow to the active UI console stream while logging to Logcat.
 */
object AppLogger {

    private const val TAG = "NexusMDM"
    private const val MAX_LOG_ENTRIES = 120
    private val dateFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    private val logQueue = ConcurrentLinkedDeque<String>()
    private val _logsFlow = MutableStateFlow<List<String>>(emptyList())
    val logsFlow: StateFlow<List<String>> = _logsFlow.asStateFlow()

    fun i(tag: String, message: String) {
        val formatted = formatEntry("INFO", tag, message)
        Log.i(TAG, "[$tag] $message")
        appendLog(formatted)
    }

    fun w(tag: String, message: String) {
        val formatted = formatEntry("WARN", tag, message)
        Log.w(TAG, "[$tag] $message")
        appendLog(formatted)
    }

    fun e(tag: String, message: String, throwable: Throwable? = null) {
        val errSuffix = throwable?.let { " - ${it.localizedMessage}" } ?: ""
        val formatted = formatEntry("ERROR", tag, "$message$errSuffix")
        Log.e(TAG, "[$tag] $message", throwable)
        appendLog(formatted)
    }

    fun securityAudit(event: String, details: String) {
        val formatted = formatEntry("AUDIT", event, details)
        Log.i("NexusSecurityAudit", "[$event] $details")
        appendLog(formatted)
    }

    fun clear() {
        logQueue.clear()
        _logsFlow.value = emptyList()
    }

    private fun formatEntry(level: String, tag: String, msg: String): String {
        val timestamp = dateFormat.format(Date())
        return "[$timestamp][$level][$tag] $msg"
    }

    @Synchronized
    private fun appendLog(entry: String) {
        logQueue.addLast(entry)
        while (logQueue.size > MAX_LOG_ENTRIES) {
            logQueue.pollFirst()
        }
        _logsFlow.value = logQueue.toList()
    }
}
