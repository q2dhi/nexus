package com.nexus.mdm.agent.remote

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.util.DisplayMetrics
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Remote Cloud Control Accessibility Engine.
 * Injects precision gestures, taps, swipes, and system navigation events (Back/Home/Recents)
 * dispatched from the Web Admin cloud interface without requiring ADB or USB cables.
 */
class NexusAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: NexusAccessibilityService? = null
            private set

        fun isServiceActive(): Boolean = instance != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        AppLogger.i("AccessibilityService", "Nexus Remote Accessibility Service connected and ready.")
    }

    override fun onDestroy() {
        instance = null
        AppLogger.i("AccessibilityService", "Nexus Remote Accessibility Service destroyed.")
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Passive monitoring
    }

    override fun onInterrupt() {
        AppLogger.w("AccessibilityService", "Nexus Remote Accessibility Service interrupted.")
    }

    /**
     * Injects a tap gesture at the specified normalized screen coordinates (0.0 to 1.0).
     */
    fun performTap(xRatio: Float, yRatio: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false

        val metrics = resources.displayMetrics
        val pxX = (xRatio * metrics.widthPixels).coerceIn(0f, metrics.widthPixels.toFloat())
        val pxY = (yRatio * metrics.heightPixels).coerceIn(0f, metrics.heightPixels.toFloat())

        val path = Path().apply {
            moveTo(pxX, pxY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 50L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        AppLogger.i("AccessibilityService", "Dispatching cloud tap at ($pxX, $pxY)")
        return dispatchGesture(gesture, null, null)
    }

    /**
     * Injects a directional swipe gesture across the screen.
     */
    fun performSwipe(direction: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false

        val metrics = resources.displayMetrics
        val w = metrics.widthPixels.toFloat()
        val h = metrics.heightPixels.toFloat()

        val (startX, startY, endX, endY) = when (direction.lowercase()) {
            "up" -> arrayOf(w * 0.5f, h * 0.75f, w * 0.5f, h * 0.25f)
            "down" -> arrayOf(w * 0.5f, h * 0.25f, w * 0.5f, h * 0.75f)
            "left" -> arrayOf(w * 0.85f, h * 0.5f, w * 0.15f, h * 0.5f)
            "right" -> arrayOf(w * 0.15f, h * 0.5f, w * 0.85f, h * 0.5f)
            else -> arrayOf(w * 0.5f, h * 0.75f, w * 0.5f, h * 0.25f)
        }

        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 250L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        AppLogger.i("AccessibilityService", "Dispatching cloud swipe: $direction ($startX,$startY -> $endX,$endY)")
        return dispatchGesture(gesture, null, null)
    }

    /**
     * Executes standard Android system global actions.
     */
    fun performGlobalKey(key: String): Boolean {
        val action = when (key.uppercase()) {
            "BACK" -> GLOBAL_ACTION_BACK
            "HOME" -> GLOBAL_ACTION_HOME
            "RECENTS" -> GLOBAL_ACTION_RECENTS
            "NOTIFICATIONS" -> GLOBAL_ACTION_NOTIFICATIONS
            "QUICK_SETTINGS" -> GLOBAL_ACTION_QUICK_SETTINGS
            "POWER" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    GLOBAL_ACTION_LOCK_SCREEN
                } else {
                    GLOBAL_ACTION_POWER_DIALOG
                }
            }
            else -> GLOBAL_ACTION_BACK
        }

        AppLogger.i("AccessibilityService", "Executing global key action: $key (action code $action)")
        return performGlobalAction(action)
    }

    /**
     * Injects text into currently focused editable field or via clipboard.
     */
    fun performTextInput(text: String): Boolean {
        if (text.isEmpty()) return false

        try {
            val root = rootInActiveWindow ?: return false
            val focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focusedNode != null && focusedNode.isEditable) {
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                }
                val success = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                if (success) {
                    AppLogger.i("AccessibilityService", "Direct text injected into focused editable node: $text")
                    return true
                }
            }

            // Fallback: Copy to clipboard and execute paste
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.setPrimaryClip(ClipData.newPlainText("NexusRemoteInput", text))
            focusedNode?.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            AppLogger.i("AccessibilityService", "Text pasted via clipboard fallback: $text")
            return true
        } catch (e: Exception) {
            AppLogger.w("AccessibilityService", "Failed to perform text input: ${e.message}")
            return false
        }
    }
}
