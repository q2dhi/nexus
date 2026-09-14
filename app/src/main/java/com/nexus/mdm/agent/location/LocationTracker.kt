package com.nexus.mdm.agent.location

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.UserManager
import androidx.core.content.ContextCompat
import com.nexus.mdm.agent.admin.NexusAdminReceiver
import com.nexus.mdm.agent.telemetry.TelemetryEngine
import com.nexus.mdm.agent.util.AppLogger
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Enterprise High-Accuracy GPS & Network Location Tracker.
 * Manages active satellite and cellular/Wi-Fi positioning listeners, persistent coordinate caching,
 * automated Device Owner hardware location activation, and on-demand GPS ping fixes.
 */
class LocationTracker private constructor(private val context: Context) {

    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val isTracking = AtomicBoolean(false)

    @Volatile
    private var lastMemoryLocation: Location? = null

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            onNewLocationReceived(location)
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

        override fun onProviderEnabled(provider: String) {
            AppLogger.i(TAG, "Location provider enabled: $provider")
            startTracking()
        }

        override fun onProviderDisabled(provider: String) {
            AppLogger.w(TAG, "Location provider disabled: $provider")
        }
    }

    /**
     * Ensures location hardware is enabled and grants runtime permissions via DPM if Device Owner.
     */
    fun ensureLocationHardwareEnabled() {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            val admin = NexusAdminReceiver.getComponentName(context)
            if (dpm != null && dpm.isDeviceOwnerApp(context.packageName)) {
                // Ensure DPM permits location sharing and configuration
                try {
                    dpm.clearUserRestriction(admin, UserManager.DISALLOW_SHARE_LOCATION)
                    dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION)
                } catch (_: Exception) {}

                // Turn on system-wide location switch if Android 9+ (API 28+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    try {
                        val isLocOn = locationManager?.isLocationEnabled ?: false
                        if (!isLocOn) {
                            dpm.setLocationEnabled(admin, true)
                            AppLogger.i(TAG, "Device Owner enabled system location switch.")
                        }
                    } catch (e: Exception) {
                        AppLogger.w(TAG, "setLocationEnabled warning: ${e.message}")
                    }
                }

                // Proactively grant location permissions to agent
                val locPerms = listOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
                for (p in locPerms) {
                    try {
                        dpm.setPermissionGrantState(admin, context.packageName, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
                    } catch (_: Exception) {}
                }
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "Error ensuring location hardware: ${e.message}")
        }
    }

    /**
     * Starts listening for continuous GPS and Network location updates.
     */
    fun startTracking() {
        ensureLocationHardwareEnabled()

        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) {
            AppLogger.w(TAG, "Cannot start tracking: Location permissions not granted yet.")
            return
        }

        val lm = locationManager
        if (lm == null) {
            AppLogger.w(TAG, "LocationManager is null on this device.")
            return
        }

        try {
            // 1. GPS Provider (High-accuracy outdoor satellite fix)
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                try {
                    lm.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        UPDATE_INTERVAL_MS,
                        MIN_DISTANCE_METERS,
                        locationListener,
                        Looper.getMainLooper()
                    )
                    AppLogger.i(TAG, "Registered GPS_PROVIDER location updates.")
                } catch (e: Exception) {
                    AppLogger.w(TAG, "Failed requesting GPS_PROVIDER updates: ${e.message}")
                }
            }

            // 2. Network Provider (Wi-Fi and Cellular towers - vital indoors!)
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                try {
                    lm.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        UPDATE_INTERVAL_MS,
                        MIN_DISTANCE_METERS,
                        locationListener,
                        Looper.getMainLooper()
                    )
                    AppLogger.i(TAG, "Registered NETWORK_PROVIDER location updates.")
                } catch (e: Exception) {
                    AppLogger.w(TAG, "Failed requesting NETWORK_PROVIDER updates: ${e.message}")
                }
            }

            // 3. Passive Provider (Piggybacks on Google Maps or other location services)
            if (lm.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
                try {
                    lm.requestLocationUpdates(
                        LocationManager.PASSIVE_PROVIDER,
                        UPDATE_INTERVAL_MS,
                        0f,
                        locationListener,
                        Looper.getMainLooper()
                    )
                } catch (_: Exception) {}
            }

            isTracking.set(true)
            requestImmediateFix()
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error in startTracking: ${e.message}", e)
        }
    }

    /**
     * Requests an immediate location update using Android 11+ getCurrentLocation
     * or queries all location providers.
     */
    fun requestImmediateFix() {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) return
        val lm = locationManager ?: return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val executor = ContextCompat.getMainExecutor(context)
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.getCurrentLocation(LocationManager.GPS_PROVIDER, null, executor) { loc ->
                        if (loc != null) onNewLocationReceived(loc)
                    }
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.getCurrentLocation(LocationManager.NETWORK_PROVIDER, null, executor) { loc ->
                        if (loc != null) onNewLocationReceived(loc)
                    }
                }
            } else {
                val gps = try { lm.getLastKnownLocation(LocationManager.GPS_PROVIDER) } catch (_: Exception) { null }
                val net = try { lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) } catch (_: Exception) { null }
                val passive = try { lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER) } catch (_: Exception) { null }
                val best = listOfNotNull(gps, net, passive).maxByOrNull { it.time }
                if (best != null) onNewLocationReceived(best)
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "requestImmediateFix error: ${e.message}")
        }
    }

    private fun onNewLocationReceived(location: Location) {
        val current = lastMemoryLocation
        if (current == null || isBetterLocation(location, current)) {
            lastMemoryLocation = location
            saveToCache(location)
            AppLogger.d(TAG, "Updated best location: ${location.latitude}, ${location.longitude} (acc: ${location.accuracy}m, provider: ${location.provider})")
        }
    }

    private fun saveToCache(loc: Location) {
        prefs.edit()
            .putString(KEY_LAT, loc.latitude.toString())
            .putString(KEY_LNG, loc.longitude.toString())
            .putFloat(KEY_ACCURACY, loc.accuracy)
            .putFloat(KEY_SPEED, loc.speed)
            .putString(KEY_ALTITUDE, loc.altitude.toString())
            .putLong(KEY_TIMESTAMP, loc.time)
            .putString(KEY_PROVIDER, loc.provider ?: "unknown")
            .apply()
    }

    /**
     * Returns the highest accuracy, freshest location available.
     * Evaluates in-memory location, system provider caches, and persisted disk cache.
     */
    fun getBestLocation(): TelemetryEngine.LocationInfo? {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) {
            return null
        }

        val lm = locationManager
        val gpsLoc = try { lm?.getLastKnownLocation(LocationManager.GPS_PROVIDER) } catch (_: Exception) { null }
        val netLoc = try { lm?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) } catch (_: Exception) { null }
        val passiveLoc = try { lm?.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER) } catch (_: Exception) { null }

        val candidates = listOfNotNull(lastMemoryLocation, gpsLoc, netLoc, passiveLoc)
        val best = candidates.maxByOrNull { it.time }

        if (best != null) {
            onNewLocationReceived(best)
            return TelemetryEngine.LocationInfo(
                latitude = best.latitude,
                longitude = best.longitude,
                accuracy = best.accuracy,
                speed = best.speed,
                altitude = best.altitude,
                timestamp = best.time,
                isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) best.isMock else false
            )
        }

        // Fallback to persisted disk cache if currently no live fix (e.g. indoors or right after reboot)
        val cachedLatStr = prefs.getString(KEY_LAT, null)
        val cachedLngStr = prefs.getString(KEY_LNG, null)
        if (cachedLatStr != null && cachedLngStr != null) {
            val lat = cachedLatStr.toDoubleOrNull()
            val lng = cachedLngStr.toDoubleOrNull()
            if (lat != null && lng != null) {
                val acc = prefs.getFloat(KEY_ACCURACY, 50f)
                val spd = prefs.getFloat(KEY_SPEED, 0f)
                val alt = prefs.getString(KEY_ALTITUDE, "0")?.toDoubleOrNull() ?: 0.0
                val ts = prefs.getLong(KEY_TIMESTAMP, System.currentTimeMillis())
                return TelemetryEngine.LocationInfo(
                    latitude = lat,
                    longitude = lng,
                    accuracy = acc,
                    speed = spd,
                    altitude = alt,
                    timestamp = ts,
                    isMock = false
                )
            }
        }

        // Trigger immediate fix so next heartbeat has coordinates
        requestImmediateFix()
        return null
    }

    private fun isBetterLocation(location: Location, currentBestLocation: Location): Boolean {
        val timeDelta = location.time - currentBestLocation.time
        val isSignificantlyNewer = timeDelta > TWO_MINUTES_MS
        val isSignificantlyOlder = timeDelta < -TWO_MINUTES_MS
        val isNewer = timeDelta > 0

        if (isSignificantlyNewer) return true
        if (isSignificantlyOlder) return false

        val accuracyDelta = (location.accuracy - currentBestLocation.accuracy).toInt()
        val isLessAccurate = accuracyDelta > 0
        val isMoreAccurate = accuracyDelta < 0
        val isSignificantlyLessAccurate = accuracyDelta > 200

        val isFromSameProvider = location.provider == currentBestLocation.provider

        if (isMoreAccurate) return true
        if (isNewer && !isLessAccurate) return true
        if (isNewer && !isSignificantlyLessAccurate && isFromSameProvider) return true

        return false
    }

    companion object {
        private const val TAG = "LocationTracker"
        private const val PREFS_NAME = "nexus_location_cache"
        private const val KEY_LAT = "lat"
        private const val KEY_LNG = "lng"
        private const val KEY_ACCURACY = "accuracy"
        private const val KEY_SPEED = "speed"
        private const val KEY_ALTITUDE = "altitude"
        private const val KEY_TIMESTAMP = "timestamp"
        private const val KEY_PROVIDER = "provider"

        private const val UPDATE_INTERVAL_MS = 15_000L // 15 seconds
        private const val MIN_DISTANCE_METERS = 5f     // 5 meters
        private const val TWO_MINUTES_MS = 120_000L

        @Volatile
        private var instance: LocationTracker? = null

        fun getInstance(context: Context): LocationTracker {
            return instance ?: synchronized(this) {
                instance ?: LocationTracker(context.applicationContext).also { instance = it }
            }
        }
    }
}
