package com.nexus.mdm.agent.remote

import android.content.Context
import android.media.AudioManager
import com.nexus.mdm.agent.ui.MainActivity
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Enterprise Remote Input & Touch Action Dispatcher.
 * Coordinates input events received from the Web Admin cloud server via
 * NexusAccessibilityService (system-wide) or MainActivity decorView fallback (Kiosk view).
 */
object RemoteInputExecutor {

    suspend fun executeAction(context: Context, actionObj: JSONObject) = withContext(Dispatchers.Main) {
        try {
            val action = actionObj.optString("action", "").lowercase()
            val accessibilityService = NexusAccessibilityService.instance

            // Automatically wake up display on remote interaction (unless action is explicitly lock)
            if (action != "lock" && action != "lock_screen") {
                DeviceWakeManager.wakeUpScreen(context)
            }

            when (action) {
                "wake", "wake_screen" -> {
                    DeviceWakeManager.wakeUpScreen(context)
                }

                "unlock", "unlock_screen" -> {
                    DeviceWakeManager.wakeAndUnlock(context)
                }

                "lock", "lock_screen" -> {
                    DeviceWakeManager.lockScreen(context)
                }

                "tap" -> {
                    val xRatio = actionObj.optDouble("xRatio", 0.5).toFloat()
                    val yRatio = actionObj.optDouble("yRatio", 0.5).toFloat()

                    // If tap falls within the system navigation bar zone (bottom ~9.5%)
                    if (yRatio >= 0.905f && accessibilityService != null) {
                        when {
                            xRatio < 0.36f -> accessibilityService.performGlobalKey("BACK")
                            xRatio > 0.64f -> accessibilityService.performGlobalKey("RECENTS")
                            else -> accessibilityService.performGlobalKey("HOME")
                        }
                    } else if (accessibilityService != null) {
                        accessibilityService.performTap(xRatio, yRatio)
                    } else {
                        // 1. Try shell injection via system / sh
                        val dm = context.resources.displayMetrics
                        val pxX = (xRatio * dm.widthPixels).toInt()
                        val pxY = (yRatio * dm.heightPixels).toInt()
                        var shellDone = false
                        try {
                            val proc = Runtime.getRuntime().exec(arrayOf("sh", "-c", "input tap $pxX $pxY"))
                            if (proc.waitFor() == 0) shellDone = true
                        } catch (_: Exception) {}

                        // 2. In-app Kiosk fallback
                        if (!shellDone) {
                            MainActivity.instance?.dispatchWindowTap(xRatio, yRatio)
                        }
                    }
                }

                "swipe", "drag" -> {
                    val startXRatio = actionObj.optDouble("startXRatio", -1.0).toFloat()
                    val startYRatio = actionObj.optDouble("startYRatio", -1.0).toFloat()
                    val endXRatio = actionObj.optDouble("endXRatio", -1.0).toFloat()
                    val endYRatio = actionObj.optDouble("endYRatio", -1.0).toFloat()
                    val durationMs = actionObj.optLong("duration", 250L)

                    if (accessibilityService != null) {
                        if (startXRatio in 0.0f..1.0f && startYRatio in 0.0f..1.0f &&
                            endXRatio in 0.0f..1.0f && endYRatio in 0.0f..1.0f) {
                            accessibilityService.performGesture(startXRatio, startYRatio, endXRatio, endYRatio, durationMs)
                        } else {
                            val direction = actionObj.optString("direction", "up")
                            accessibilityService.performSwipe(direction)
                        }
                    } else {
                        // Shell fallback
                        val dm = context.resources.displayMetrics
                        val sX = if (startXRatio >= 0) (startXRatio * dm.widthPixels).toInt() else dm.widthPixels / 2
                        val sY = if (startYRatio >= 0) (startYRatio * dm.heightPixels).toInt() else (dm.heightPixels * 0.8f).toInt()
                        val eX = if (endXRatio >= 0) (endXRatio * dm.widthPixels).toInt() else dm.widthPixels / 2
                        val eY = if (endYRatio >= 0) (endYRatio * dm.heightPixels).toInt() else (dm.heightPixels * 0.2f).toInt()
                        var shellDone = false
                        try {
                            val proc = Runtime.getRuntime().exec(arrayOf("sh", "-c", "input swipe $sX $sY $eX $eY $durationMs"))
                            if (proc.waitFor() == 0) shellDone = true
                        } catch (_: Exception) {}

                        // In-app Kiosk fallback
                        if (!shellDone && startXRatio >= 0 && startYRatio >= 0 && endXRatio >= 0 && endYRatio >= 0) {
                            MainActivity.instance?.dispatchWindowSwipe(startXRatio, startYRatio, endXRatio, endYRatio, durationMs)
                        }
                    }
                }

                "key" -> {
                    val key = actionObj.optString("key", "").uppercase()
                    when (key) {
                        "POWER" -> {
                            val pm = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                            if (pm?.isInteractive == true) {
                                DeviceWakeManager.lockScreen(context)
                            } else {
                                DeviceWakeManager.wakeAndUnlock(context)
                            }
                        }

                        "WAKE" -> {
                            DeviceWakeManager.wakeUpScreen(context)
                        }

                        "UNLOCK" -> {
                            DeviceWakeManager.wakeAndUnlock(context)
                        }

                        "LOCK" -> {
                            DeviceWakeManager.lockScreen(context)
                        }

                        "VOLUME_UP" -> {
                            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                            audioManager?.adjustVolume(AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
                            AppLogger.i("RemoteInput", "Volume adjusted up via cloud command.")
                        }

                        "VOLUME_DOWN" -> {
                            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                            audioManager?.adjustVolume(AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
                            AppLogger.i("RemoteInput", "Volume adjusted down via cloud command.")
                        }

                        else -> {
                            if (accessibilityService != null) {
                                accessibilityService.performGlobalKey(key)
                            } else {
                                val keyCode = when (key) {
                                    "HOME" -> 3
                                    "BACK" -> 4
                                    "RECENTS", "APP_SWITCH" -> 187
                                    "ENTER" -> 66
                                    "TAB" -> 61
                                    "ESCAPE" -> 111
                                    else -> 0
                                }
                                var shellKey = false
                                if (keyCode > 0) {
                                    try {
                                        val proc = Runtime.getRuntime().exec(arrayOf("sh", "-c", "input keyevent $keyCode"))
                                        if (proc.waitFor() == 0) shellKey = true
                                    } catch (_: Exception) {}
                                }
                                if (!shellKey) {
                                    if (key == "BACK") {
                                        MainActivity.instance?.onBackPressedDispatcher?.onBackPressed()
                                    } else if (key == "HOME") {
                                        MainActivity.instance?.handleKioskStateChange(true)
                                    }
                                }
                            }
                        }
                    }
                }

                "text" -> {
                    val text = actionObj.optString("text", "")
                    if (accessibilityService != null) {
                        accessibilityService.performTextInput(text)
                    } else if (text.isNotEmpty()) {
                        try {
                            val escaped = text.replace("\"", "\\\"").replace(" ", "%s")
                            Runtime.getRuntime().exec(arrayOf("sh", "-c", "input text \"$escaped\""))
                        } catch (_: Exception) {}
                    }
                }

                else -> {
                    AppLogger.w("RemoteInput", "Unknown remote action: $action")
                }
            }
            Unit
        } catch (e: Exception) {
            AppLogger.e("RemoteInput", "Failed to execute cloud input action", e)
        }
    }
}
