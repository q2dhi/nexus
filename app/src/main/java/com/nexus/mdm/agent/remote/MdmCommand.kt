package com.nexus.mdm.agent.remote

/**
 * Enterprise MDM Command Schema.
 * Sealed hierarchy representing remote instructions dispatched by an MDM cloud server.
 */
sealed class MdmCommand(val commandType: String) {

    data class LockDevice(val message: String = "Device locked by Enterprise Administrator") :
        MdmCommand("LOCK_DEVICE")

    data class Reboot(val reason: String = "Remote maintenance reboot") :
        MdmCommand("REBOOT")

    data class WipeData(val wipeExternalStorage: Boolean = false) :
        MdmCommand("WIPE_DATA")

    data class SetKioskMode(val enable: Boolean, val targetPackages: List<String> = emptyList()) :
        MdmCommand("SET_KIOSK_MODE")

    data class InstallApkFromUrl(val downloadUrl: String, val packageName: String, val expectedSha256: String? = null) :
        MdmCommand("INSTALL_APK_FROM_URL")

    data class SetPeripheralPolicy(val policyKey: String, val enabled: Boolean) :
        MdmCommand("SET_PERIPHERAL_POLICY")

    data class SyncPolicies(val serverVersion: Int) :
        MdmCommand("SYNC_POLICIES")
}
