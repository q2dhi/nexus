package com.nexus.mdm.agent.oem.honeywell

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import com.nexus.mdm.agent.util.AppLogger
import org.json.JSONObject

/**
 * Enterprise service handling Honeywell hardware barcode scanner events.
 */
class HoneywellScannerService(private val context: Context) {

    interface OnBarcodeScannedListener {
        fun onBarcodeScanned(barcode: String, symbology: String, timestamp: Long)
    }

    private var scanListener: OnBarcodeScannedListener? = null
    private var isRegistered = false

    private val scannerReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return
            val action = intent.action
            if (action == HoneywellProvider.HONEYWELL_SCANNER_ACTION) {
                val barcode = intent.getStringExtra("data") ?: intent.getStringExtra("barcode_string") ?: ""
                val symbology = intent.getStringExtra("codeId") ?: intent.getStringExtra("symbology") ?: "UNKNOWN"
                val timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis())

                AppLogger.i("HoneywellScanner: Received Barcode [$barcode] Symbology [$symbology]")
                scanListener?.onBarcodeScanned(barcode, symbology, timestamp)
            }
        }
    }

    fun startListening(listener: OnBarcodeScannedListener) {
        if (isRegistered) return
        this.scanListener = listener
        val filter = IntentFilter(HoneywellProvider.HONEYWELL_SCANNER_ACTION)
        try {
            ContextCompat.registerReceiver(context, scannerReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
            isRegistered = true
            AppLogger.i("HoneywellScanner: Registered BroadcastReceiver for ${HoneywellProvider.HONEYWELL_SCANNER_ACTION}")
        } catch (e: Exception) {
            AppLogger.e("HoneywellScanner: Failed to register scanner receiver", e)
        }
    }

    fun stopListening() {
        if (!isRegistered) return
        try {
            context.unregisterReceiver(scannerReceiver)
            isRegistered = false
            AppLogger.i("HoneywellScanner: Unregistered scanner receiver")
        } catch (e: Exception) {
            AppLogger.e("HoneywellScanner: Failed to unregister scanner receiver", e)
        }
    }

    companion object {
        fun isHoneywellScannerKey(keyCode: Int): Boolean {
            // Standard Honeywell physical trigger scan keycodes
            return keyCode in listOf(241, 242, 243, 244, 293, 294)
        }
    }
}
