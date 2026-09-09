package com.nexus.mdm.agent.oem

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import org.json.JSONObject

/**
 * Enterprise OEM Provider Interface.
 * Allows vendor-specific hardware, scanner, kiosk lockdown, and OEMConfig extensions
 * without polluting core MDM business logic.
 */
interface OemProvider {
    val oemName: String
    
    /**
     * Discover hardware capabilities dynamically at runtime.
     */
    fun discoverCapabilities(context: Context): DeviceCapabilities
    
    /**
     * Apply OEM-specific restrictions or configurations when entering Kiosk mode.
     */
    fun onEnterKiosk(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName,
        whitelistedPackages: List<String>
    ): Boolean
    
    /**
     * Cleanly release OEM-specific restrictions and restore native launcher state when exiting Kiosk mode.
     */
    fun onExitKiosk(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName
    ): Boolean
    
    /**
     * Configure hardware barcode scanner settings (symbologies, triggers, intents).
     */
    fun configureScanner(context: Context, scannerConfig: JSONObject): Boolean
    
    /**
     * Apply OEMConfig / Managed Configuration to vendor services (e.g. Honeywell UEMConnect).
     */
    fun applyOemConfig(
        context: Context,
        dpm: DevicePolicyManager,
        adminComponent: ComponentName,
        configBundle: JSONObject
    ): Boolean
    
    /**
     * Get list of native launcher packages to prioritize during Kiosk exit handoff.
     */
    fun getPreferredLauncherPackages(): List<String>
    
    /**
     * Reboots device using OEM-specific or Device Owner APIs.
     */
    fun rebootDevice(context: Context, dpm: DevicePolicyManager, adminComponent: ComponentName): Boolean
}
