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
                        // In-app Kiosk fallback
                        MainActivity.instance?.dispatchWindowTap(xRatio, yRatio)
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
                        AppLogger.w("RemoteInput", "Swipe requested but AccessibilityService is not enabled.")
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
                            } else if (key == "BACK") {
                                MainActivity.instance?.onBackPressedDispatcher?.onBackPressed()
                            }
                        }
                    }
                }

                "text" -> {
                    val text = actionObj.optString("text", "")
                    if (accessibilityService != null) {
                        accessibilityService.performTextInput(text)
                    } else {
                        AppLogger.w("RemoteInput", "Text input requested but AccessibilityService is not enabled.")
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
