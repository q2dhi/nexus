package com.nexus.mdm.agent.remote

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.util.Base64
import android.view.PixelCopy
import com.nexus.mdm.agent.ui.MainActivity
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Enterprise Remote Screen Capture Engine.
 * Captures live screen frames across the entire Android system (all third-party apps,
 * settings, and launcher) via NexusAccessibilityService.takeScreenshot (Android 11+ / API 30+)
 * with fallback to hardware PixelCopy for the Kiosk interface.
 * Streams compressed JPEG frames to the Web Admin live monitor.
 */
object ScreenCaptureManager {

    private val isStreaming = AtomicBoolean(false)
    private var streamJob: Job? = null
    private val pixelCopyThread = android.os.HandlerThread("NexusPixelCopy").apply { start() }
    private val pixelCopyHandler = Handler(pixelCopyThread.looper)
    @Volatile
    private var isViewerActive = true

    fun isCurrentlyStreaming(): Boolean = isStreaming.get()

    fun startStream(context: Context, serverUrl: String, deviceId: String) {
        if (isStreaming.getAndSet(true)) {
            AppLogger.i("ScreenCapture", "Stream already running.")
            return
        }

        AppLogger.securityAudit("SCREEN_STREAM_START", "Remote screen monitoring session started for device $deviceId.")

        val appContext = context.applicationContext
        streamJob = CoroutineScope(Dispatchers.IO).launch {
            var consecutiveNetworkErrors = 0
            while (isStreaming.get() && isActive) {
                try {
                    val frameBase64 = captureFrame()
                    val pushed = pushFrameToServer(appContext, serverUrl, deviceId, frameBase64)
                    if (pushed) {
                        consecutiveNetworkErrors = 0
                    } else {
                        consecutiveNetworkErrors++
                    }
                } catch (e: Exception) {
                    consecutiveNetworkErrors++
                    AppLogger.w("ScreenCapture", "Frame capture/push error: ${e.message}")
                }

                // Dynamic streaming cadence: rapid when active viewer is watching, back off when idle
                val interval = when {
                    consecutiveNetworkErrors > 15 -> 2500L
                    !isViewerActive -> 1800L
                    else -> 380L
                }
                delay(interval)
            }
        }
    }

    fun stopStream() {
        if (isStreaming.getAndSet(false)) {
            streamJob?.cancel()
            streamJob = null
            AppLogger.securityAudit("SCREEN_STREAM_STOP", "Remote screen monitoring session terminated.")
        }
    }

    private suspend fun captureFrame(): String? {
        // Priority 1: System-wide screenshot via Accessibility Service (Captures ALL apps, launcher, settings)
        val a11yService = NexusAccessibilityService.instance
        if (a11yService != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                val bitmap = a11yService.captureScreen()
                if (bitmap != null) {
                    return withContext(Dispatchers.IO) {
                        processAndCompressBitmap(bitmap)
                    }
                }
            } catch (e: Exception) {
                AppLogger.w("ScreenCapture", "Accessibility screenshot failed: ${e.message}")
            }
        }

        // Priority 2: Shell screencap (system-wide screen capture without accessibility dependency)
        try {
            val shellBitmap = captureShellScreencap()
            if (shellBitmap != null) {
                return withContext(Dispatchers.IO) {
                    processAndCompressBitmap(shellBitmap)
                }
            }
        } catch (_: Exception) {}

        // Priority 3: Fallback to PixelCopy on currently active activity (MainActivity or KioskSettingsActivity)
        val activeActivity = com.nexus.mdm.agent.NexusApp.currentResumedActivity ?: MainActivity.instance
        if (activeActivity != null && !activeActivity.isFinishing && !activeActivity.isDestroyed) {
            try {
                val pixelCopyBitmap = capturePixelCopy(activeActivity)
                if (pixelCopyBitmap != null) {
                    return withContext(Dispatchers.IO) {
                        processAndCompressBitmap(pixelCopyBitmap)
                    }
                }
            } catch (e: Exception) {
                AppLogger.w("ScreenCapture", "PixelCopy fallback failed: ${e.message}")
            }

            // Priority 4: Direct decorView software rendering fallback
            try {
                val decorBitmap = captureDecorView(activeActivity)
                if (decorBitmap != null) {
                    return withContext(Dispatchers.IO) {
                        processAndCompressBitmap(decorBitmap)
                    }
                }
            } catch (e: Exception) {
                AppLogger.w("ScreenCapture", "DecorView fallback failed: ${e.message}")
            }
        }

        return null
    }

    private suspend fun captureDecorView(activity: Activity): Bitmap? = withContext(Dispatchers.Main) {
        try {
            val decorView = activity.window?.decorView?.rootView ?: return@withContext null
            val w = decorView.width
            val h = decorView.height
            if (w <= 0 || h <= 0) return@withContext null
            val targetWidth = 360
            val targetHeight = (h * targetWidth) / w
            val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bitmap)
            val scale = targetWidth.toFloat() / w.toFloat()
            canvas.scale(scale, scale)
            decorView.draw(canvas)
            bitmap
        } catch (_: Exception) {
            null
        }
    }

    private suspend fun captureShellScreencap(): Bitmap? = withContext(Dispatchers.IO) {
        try {
            val proc = Runtime.getRuntime().exec(arrayOf("sh", "-c", "screencap -p"))
            val bmp = android.graphics.BitmapFactory.decodeStream(proc.inputStream)
            proc.destroy()
            bmp
        } catch (_: Exception) {
            null
        }
    }

    private fun processAndCompressBitmap(bitmap: Bitmap): String {
        val targetWidth = 360
        val targetHeight = if (bitmap.width > 0) (bitmap.height * targetWidth) / bitmap.width else 640

        val scaledBitmap = if (bitmap.width > targetWidth) {
            try {
                Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true).also {
                    if (it !== bitmap) bitmap.recycle()
                }
            } catch (_: Exception) {
                bitmap
            }
        } else {
            bitmap
        }

        val out = ByteArrayOutputStream()
        scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 65, out)
        val bytes = out.toByteArray()
        scaledBitmap.recycle()
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private suspend fun capturePixelCopy(activity: Activity): Bitmap? {
        val (window, width, height) = withContext(Dispatchers.Main) {
            val w = activity.window ?: return@withContext Triple(null, 0, 0)
            val v = w.decorView.rootView ?: return@withContext Triple(null, 0, 0)
            Triple(w, v.width, v.height)
        }

        if (window == null || width <= 0 || height <= 0) return null

        val targetWidth = 360
        val targetHeight = (height * targetWidth) / width
        val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
        val success = CompletableDeferred<Boolean>()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PixelCopy.request(
                    window,
                    Rect(0, 0, width, height),
                    bitmap,
                    { result ->
                        success.complete(result == PixelCopy.SUCCESS)
                    },
                    pixelCopyHandler
                )
            } else {
                success.complete(false)
            }
        } catch (e: Exception) {
            success.complete(false)
        }

        val completed = try {
            withTimeoutOrNull(450L) {
                success.await()
            } ?: false
        } catch (_: Exception) {
            false
        }

        return if (completed) bitmap else {
            bitmap.recycle()
            null
        }
    }

    private suspend fun pushFrameToServer(
        context: Context,
        serverBaseUrl: String,
        deviceId: String,
        frameBase64: String?
    ): Boolean {
        var base = serverBaseUrl.trimEnd('/')
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            base = "http://$base"
        }

        val url = URL("$base/api/devices/$deviceId/screen-frame")
        var conn: HttpURLConnection? = null

        return try {
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 3000
                readTimeout = 3000
                doOutput = true
            }

            val configStore = com.nexus.mdm.agent.config.SecureConfigStore(context)
            val tag = configStore.deviceTag
            val json = org.json.JSONObject().apply {
                put("deviceId", deviceId)
                if (tag.isNotBlank()) {
                    put("deviceTag", tag)
                    put("deviceName", tag)
                }
                if (frameBase64 != null) {
                    put("frame", frameBase64)
                }
                put("timestamp", System.currentTimeMillis())
            }

            conn.outputStream.use { os ->
                os.write(json.toString().toByteArray(Charsets.UTF_8))
            }

            val code = conn.responseCode
            if (code == HttpURLConnection.HTTP_OK) {
                try {
                    val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                    if (responseText.isNotEmpty()) {
                        val respJson = org.json.JSONObject(responseText)
                        if (respJson.has("hasViewer")) {
                            isViewerActive = respJson.optBoolean("hasViewer", true)
                        }
                        val actionsArray = respJson.optJSONArray("actions")
                        if (actionsArray != null && actionsArray.length() > 0) {
                            for (i in 0 until actionsArray.length()) {
                                val actionObj = actionsArray.getJSONObject(i)
                                RemoteInputExecutor.executeAction(context, actionObj)
                            }
                        }
                    }
                } catch (e: Exception) {
                    AppLogger.w("ScreenCapture", "Error reading frame response: ${e.message}")
                }
                true
            } else {
                AppLogger.w("ScreenCapture", "Push frame response code: $code")
                false
            }
        } catch (e: Exception) {
            false
        } finally {
            conn?.disconnect()
        }
    }
}
