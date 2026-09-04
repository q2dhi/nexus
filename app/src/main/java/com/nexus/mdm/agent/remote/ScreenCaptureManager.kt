package com.nexus.mdm.agent.remote

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.PixelCopy
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Enterprise Remote Screen Capture Engine.
 * Takes low-latency hardware-accelerated snapshots of the device screen (via PixelCopy)
 * and streams compressed JPEG frames to the Web Admin live monitor.
 */
object ScreenCaptureManager {

    private val isStreaming = AtomicBoolean(false)
    private var streamJob: Job? = null
    private val pixelCopyThread = android.os.HandlerThread("NexusPixelCopy").apply { start() }
    private val pixelCopyHandler = Handler(pixelCopyThread.looper)

    fun isCurrentlyStreaming(): Boolean = isStreaming.get()

    fun startStream(activity: Activity, serverUrl: String, deviceId: String) {
        if (isStreaming.getAndSet(true)) {
            AppLogger.i("ScreenCapture", "Stream already running.")
            return
        }

        AppLogger.securityAudit("SCREEN_STREAM_START", "Remote screen monitoring session started.")

        streamJob = CoroutineScope(Dispatchers.IO).launch {
            while (isStreaming.get() && isActive) {
                try {
                    val frameBase64 = captureFrame(activity)
                    if (frameBase64 != null) {
                        pushFrameToServer(serverUrl, deviceId, frameBase64)
                    }
                } catch (e: Exception) {
                    AppLogger.w("ScreenCapture", "Frame capture/push error: ${e.message}")
                }
                delay(350) // ~2.8 FPS (responsive and smooth)
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

    private suspend fun captureFrame(activity: Activity): String? {
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
            withTimeoutOrNull(600L) {
                success.await()
            } ?: false
        } catch (_: Exception) {
            false
        }

        return withContext(Dispatchers.IO) {
            if (completed) {
                val out = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 65, out)
                val bytes = out.toByteArray()
                bitmap.recycle()
                Base64.encodeToString(bytes, Base64.NO_WRAP)
            } else {
                bitmap.recycle()
                null
            }
        }
    }

    private fun pushFrameToServer(serverBaseUrl: String, deviceId: String, frameBase64: String) {
        var base = serverBaseUrl.trimEnd('/')
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            base = "http://$base"
        }

        val url = URL("$base/api/devices/$deviceId/screen-frame")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            connectTimeout = 3000
            readTimeout = 3000
            doOutput = true
        }

        val json = org.json.JSONObject().apply {
            put("deviceId", deviceId)
            put("frame", frameBase64)
            put("timestamp", System.currentTimeMillis())
        }

        conn.outputStream.use { os ->
            os.write(json.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        conn.disconnect()
        if (code != HttpURLConnection.HTTP_OK) {
            AppLogger.w("ScreenCapture", "Push frame response code: $code")
        }
    }
}
