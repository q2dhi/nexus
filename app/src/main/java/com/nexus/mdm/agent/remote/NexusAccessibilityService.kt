package com.nexus.mdm.agent.remote

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.util.DisplayMetrics
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.Executors

/**
 * Enterprise Remote Cloud Control Accessibility Engine.
 * Injects precision gestures, taps, swipes, and system navigation events (Back/Home/Recents)
 * dispatched from the Web Admin cloud interface without requiring ADB or USB cables.
 */
class NexusAccessibilityService : AccessibilityService() {

    private val screenshotExecutor = Executors.newSingleThreadExecutor()

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
        try {
            screenshotExecutor.shutdown()
        } catch (_: Exception) {}
        AppLogger.i("AccessibilityService", "Nexus Remote Accessibility Service destroyed.")
        super.onDestroy()
    }

    private val screenshotMutex = kotlinx.coroutines.sync.Mutex()
    @Volatile
    private var lastScreenshotTime = 0L

    /**
     * Captures a system-wide hardware-accelerated screenshot of the device display across all applications.
     * Uses Android 11+ (API 30+) AccessibilityService.takeScreenshot API without any user prompts.
     * Implements strict rate-limit protection to avoid Android's ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT (code 3).
     */
    suspend fun captureScreen(): Bitmap? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return null
        }

        // Only one screenshot in-flight at a time
        if (!screenshotMutex.tryLock()) {
            return null
        }

        return try {
            val now = System.currentTimeMillis()
            val elapsedSinceLast = now - lastScreenshotTime
            if (elapsedSinceLast < 400L) {
                delay(400L - elapsedSinceLast)
            }

            val deferred = CompletableDeferred<Bitmap?>()

            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                screenshotExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshotResult: ScreenshotResult) {
                        lastScreenshotTime = System.currentTimeMillis()
                        try {
                            val hardwareBuffer = screenshotResult.hardwareBuffer
                            val colorSpace = screenshotResult.colorSpace
                            val hwBitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, colorSpace)
                            val softwareBitmap = hwBitmap?.copy(Bitmap.Config.ARGB_8888, false)
                            hwBitmap?.recycle()
                            hardwareBuffer.close()
                            deferred.complete(softwareBitmap)
                        } catch (e: Exception) {
                            AppLogger.w("AccessibilityService", "Error converting screenshot buffer: ${e.message}")
                            deferred.complete(null)
                        }
                    }

                    override fun onFailure(errorCode: Int) {
                        lastScreenshotTime = System.currentTimeMillis()
                        val errorName = when (errorCode) {
                            1 -> "ERROR_TAKE_SCREENSHOT_INTERNAL_ERROR"
                            2 -> "ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS"
                            3 -> "ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT"
                            4 -> "ERROR_TAKE_SCREENSHOT_INVALID_DISPLAY"
                            else -> "UNKNOWN_ERROR_$errorCode"
                        }
                        AppLogger.w("AccessibilityService", "takeScreenshot failed with code: $errorCode ($errorName)")
                        deferred.complete(null)
                    }
                }
            )

            withTimeoutOrNull(1500L) {
                deferred.await()
            }
        } catch (e: Exception) {
            AppLogger.w("AccessibilityService", "Exception requesting system screenshot: ${e.message}")
            null
        } finally {
            screenshotMutex.unlock()
        }
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
     * Injects a precision gesture path between two arbitrary normalized coordinates (0.0 to 1.0).
     */
    fun performGesture(
        startXRatio: Float,
        startYRatio: Float,
        endXRatio: Float,
        endYRatio: Float,
        durationMs: Long = 250L
    ): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false

        val metrics = resources.displayMetrics
        val w = metrics.widthPixels.toFloat()
        val h = metrics.heightPixels.toFloat()

        val pxStartX = (startXRatio * w).coerceIn(0f, w)
        val pxStartY = (startYRatio * h).coerceIn(0f, h)
        val pxEndX = (endXRatio * w).coerceIn(0f, w)
        val pxEndY = (endYRatio * h).coerceIn(0f, h)

        val path = Path().apply {
            moveTo(pxStartX, pxStartY)
            lineTo(pxEndX, pxEndY)
        }
        val safeDuration = durationMs.coerceIn(80L, 1000L)
        val stroke = GestureDescription.StrokeDescription(path, 0L, safeDuration)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        AppLogger.i("AccessibilityService", "Dispatching cloud precision gesture ($pxStartX, $pxStartY -> $pxEndX, $pxEndY) in ${safeDuration}ms")
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

        // For UP swipe, start at bottom (88% height) to ensure lock screen unlocks cleanly past notifications
        val (startX, startY, endX, endY) = when (direction.lowercase()) {
            "up" -> arrayOf(w * 0.5f, h * 0.88f, w * 0.5f, h * 0.18f)
            "down" -> arrayOf(w * 0.5f, h * 0.18f, w * 0.5f, h * 0.85f)
            "left" -> arrayOf(w * 0.85f, h * 0.5f, w * 0.15f, h * 0.5f)
            "right" -> arrayOf(w * 0.15f, h * 0.5f, w * 0.85f, h * 0.5f)
            else -> arrayOf(w * 0.5f, h * 0.88f, w * 0.5f, h * 0.18f)
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
