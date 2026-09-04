package com.nexus.mdm.agent.telemetry

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Locale
import com.nexus.mdm.agent.util.AppLogger

/**
 * Enterprise Telemetry & Integrity Engine.
 * Collects hardware vitals, memory & storage utilization, network diagnostics,
 * and performs zero-trust root/tamper analysis.
 */
class TelemetryEngine(private val context: Context) {

    data class BatteryInfo(
        val percentage: Int,
        val isCharging: Boolean,
        val temperatureCelsius: Float,
        val health: String,
        val powerSource: String
    )

    data class MemoryInfo(
        val totalRamMb: Long,
        val availableRamMb: Long,
        val usedPercent: Int
    )

    data class StorageInfo(
        val totalStorageGb: Float,
        val availableStorageGb: Float,
        val usedPercent: Int
    )

    data class IntegrityCheck(
        val isRooted: Boolean,
        val rootIndicators: List<String>,
        val isTestKeysBuild: Boolean,
        val integrityScore: String
    )

    data class NetworkInfo(
        val connectionType: String,
        val ipAddress: String,
        val wifiSsid: String?
    )

    data class LocationInfo(
        val latitude: Double,
        val longitude: Double,
        val accuracy: Float,
        val speed: Float,
        val altitude: Double,
        val timestamp: Long,
        val isMock: Boolean
    )

    data class FullTelemetrySnapshot(
        val battery: BatteryInfo,
        val memory: MemoryInfo,
        val storage: StorageInfo,
        val integrity: IntegrityCheck,
        val network: NetworkInfo,
        val location: LocationInfo?,
        val androidVersion: String,
        val deviceModel: String
    )

    fun captureSnapshot(): FullTelemetrySnapshot {
        return FullTelemetrySnapshot(
            battery = getBatteryStatus(),
            memory = getMemoryStatus(),
            storage = getStorageStatus(),
            integrity = performIntegrityAudit(),
            network = getNetworkStatus(),
            location = getLocationStatus(),
            androidVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            deviceModel = "${Build.MANUFACTURER.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.US) else it.toString() }} ${Build.MODEL}"
        )
    }

    fun getLocationStatus(): LocationInfo? {
        return try {
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager ?: return null
            
            val hasFine = androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.ACCESS_FINE_LOCATION
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            val hasCoarse = androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.ACCESS_COARSE_LOCATION
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            if (!hasFine && !hasCoarse) {
                return null
            }

            val gpsLoc = try { locationManager.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER) } catch (_: Exception) { null }
            val netLoc = try { locationManager.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER) } catch (_: Exception) { null }
            val passiveLoc = try { locationManager.getLastKnownLocation(android.location.LocationManager.PASSIVE_PROVIDER) } catch (_: Exception) { null }

            val bestLoc = listOfNotNull(gpsLoc, netLoc, passiveLoc).maxByOrNull { it.time } ?: return null

            LocationInfo(
                latitude = bestLoc.latitude,
                longitude = bestLoc.longitude,
                accuracy = bestLoc.accuracy,
                speed = bestLoc.speed,
                altitude = bestLoc.altitude,
                timestamp = bestLoc.time,
                isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) bestLoc.isMock else false
            )
        } catch (e: Exception) {
            AppLogger.w("TelemetryEngine", "Location acquisition error: ${e.message}")
            null
        }
    }

    private fun getBatteryStatus(): BatteryInfo {
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            context.registerReceiver(null, filter)
        }

        val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (level >= 0 && scale > 0) (level * 100 / scale) else 0

        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        val tempTenths = batteryStatus?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
        val tempC = tempTenths / 10.0f

        val chargePlug = batteryStatus?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        val source = when (chargePlug) {
            BatteryManager.BATTERY_PLUGGED_USB -> "USB"
            BatteryManager.BATTERY_PLUGGED_AC -> "AC Adapter"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
            else -> "Battery"
        }

        val healthCode = batteryStatus?.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN)
        val healthStr = when (healthCode) {
            BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheat"
            BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over Voltage"
            else -> "Normal"
        }

        return BatteryInfo(pct, isCharging, tempC, healthStr, source)
    }

    private fun getMemoryStatus(): MemoryInfo {
        val actManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mem = ActivityManager.MemoryInfo()
        actManager.getMemoryInfo(mem)

        val totalMb = mem.totalMem / (1024 * 1024)
        val availMb = mem.availMem / (1024 * 1024)
        val used = if (totalMb > 0) (((totalMb - availMb) * 100) / totalMb).toInt() else 0

        return MemoryInfo(totalMb, availMb, used)
    }

    private fun getStorageStatus(): StorageInfo {
        val path = Environment.getDataDirectory()
        val stat = StatFs(path.path)
        val blockSize = stat.blockSizeLong
        val totalBlocks = stat.blockCountLong
        val availableBlocks = stat.availableBlocksLong

        val totalGb = (totalBlocks * blockSize).toFloat() / (1024f * 1024f * 1024f)
        val availGb = (availableBlocks * blockSize).toFloat() / (1024f * 1024f * 1024f)
        val usedPercent = if (totalGb > 0) (((totalGb - availGb) * 100) / totalGb).toInt() else 0

        return StorageInfo(totalGb, availGb, usedPercent)
    }

    fun performIntegrityAudit(): IntegrityCheck {
        val indicators = mutableListOf<String>()

        // 1. Check for SU binaries
        val suPaths = arrayOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/data/local/su"
        )
        for (p in suPaths) {
            try {
                if (File(p).exists()) {
                    indicators.add("Binary: $p")
                }
            } catch (_: Exception) {}
        }

        // 2. Check Build Tags
        val isTestKeys = Build.TAGS != null && Build.TAGS.contains("test-keys")
        if (isTestKeys) {
            indicators.add("OS Tag: test-keys (Custom ROM)")
        }

        val isRooted = indicators.isNotEmpty()
        val score = if (isRooted) "COMPROMISED" else "SECURE (PASSED)"

        return IntegrityCheck(
            isRooted = isRooted,
            rootIndicators = indicators,
            isTestKeysBuild = isTestKeys,
            integrityScore = score
        )
    }

    private fun getNetworkStatus(): NetworkInfo {
        return try {
            val connMgr = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val activeNet = connMgr?.activeNetwork
            val caps = connMgr?.getNetworkCapabilities(activeNet)

            val type = when {
                caps == null -> "Disconnected"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular 5G/LTE"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                else -> "Connected"
            }

            val ip = getLocalIpAddress() ?: "127.0.0.1"

            var ssid: String? = null
            if (caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
                try {
                    val wifiMgr = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                    val info = wifiMgr?.connectionInfo
                    ssid = info?.ssid?.replace("\"", "")
                } catch (_: Exception) {}
            }

            NetworkInfo(type, ip, ssid)
        } catch (_: Exception) {
            NetworkInfo("Connected", getLocalIpAddress() ?: "127.0.0.1", null)
        }
    }

    private fun getLocalIpAddress(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val intf = interfaces.nextElement()
                val addresses = intf.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (_: Exception) {}
        return null
    }
}
