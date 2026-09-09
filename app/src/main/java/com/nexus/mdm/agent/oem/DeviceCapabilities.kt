package com.nexus.mdm.agent.oem

import org.json.JSONObject

/**
 * Capability state for individual device features.
 */
enum class CapabilityStatus {
    SUPPORTED,
    PARTIAL,
    RESTRICTED,
    UNSUPPORTED
}

/**
 * Detailed capability matrix discovered dynamically at enrollment/runtime.
 */
data class DeviceCapabilities(
    val oem: String,
    val model: String,
    val androidVersion: Int,
    val buildNumber: String,
    val securityPatch: String,
    val mobilityEdgeGeneration: String?,
    val kioskSupported: CapabilityStatus = CapabilityStatus.SUPPORTED,
    val scannerSupported: CapabilityStatus = CapabilityStatus.UNSUPPORTED,
    val oemConfigSupported: CapabilityStatus = CapabilityStatus.UNSUPPORTED,
    val remoteControlSupported: CapabilityStatus = CapabilityStatus.PARTIAL,
    val enterpriseBrowserSupported: CapabilityStatus = CapabilityStatus.UNSUPPORTED,
    val locationSupported: CapabilityStatus = CapabilityStatus.SUPPORTED,
    val silentInstallSupported: CapabilityStatus = CapabilityStatus.SUPPORTED,
    val batteryHealthSupported: CapabilityStatus = CapabilityStatus.SUPPORTED,
    val rawDetails: Map<String, Any> = emptyMap()
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("oem", oem)
        json.put("model", model)
        json.put("androidVersion", androidVersion)
        json.put("buildNumber", buildNumber)
        json.put("securityPatch", securityPatch)
        json.put("mobilityEdgeGeneration", mobilityEdgeGeneration ?: "N/A")
        json.put("kioskSupported", kioskSupported.name)
        json.put("scannerSupported", scannerSupported.name)
        json.put("oemConfigSupported", oemConfigSupported.name)
        json.put("remoteControlSupported", remoteControlSupported.name)
        json.put("enterpriseBrowserSupported", enterpriseBrowserSupported.name)
        json.put("locationSupported", locationSupported.name)
        json.put("silentInstallSupported", silentInstallSupported.name)
        json.put("batteryHealthSupported", batteryHealthSupported.name)
        
        val detailsObj = JSONObject()
        rawDetails.forEach { (k, v) -> detailsObj.put(k, v) }
        json.put("rawDetails", detailsObj)
        return json
    }
}
