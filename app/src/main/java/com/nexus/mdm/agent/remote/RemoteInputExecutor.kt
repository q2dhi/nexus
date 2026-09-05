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

            when (action) {
                "tap" -> {
                    val xRatio = actionObj.optDouble("xRatio", 0.5).toFloat()
                    val yRatio = actionObj.optDouble("yRatio", 0.5).toFloat()

                    if (accessibilityService != null) {
                        accessibilityService.performTap(xRatio, yRatio)
                    } else {
                        // In-app Kiosk fallback
                        MainActivity.instance?.dispatchWindowTap(xRatio, yRatio)
                    }
                }

                "swipe" -> {
                    val direction = actionObj.optString("direction", "up")
                    if (accessibilityService != null) {
                        accessibilityService.performSwipe(direction)
                    } else {
                        AppLogger.w("RemoteInput", "Swipe requested but AccessibilityService is not enabled.")
                    }
                }

                "key" -> {
                    val key = actionObj.optString("key", "").uppercase()
                    when (key) {
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
