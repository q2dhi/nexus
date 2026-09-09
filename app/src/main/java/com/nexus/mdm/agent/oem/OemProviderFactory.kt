package com.nexus.mdm.agent.oem

import android.os.Build
import com.nexus.mdm.agent.oem.generic.GenericAndroidProvider
import com.nexus.mdm.agent.oem.honeywell.HoneywellProvider
import com.nexus.mdm.agent.oem.samsung.SamsungProvider
import com.nexus.mdm.agent.oem.zebra.ZebraProvider
import com.nexus.mdm.agent.util.AppLogger

object OemProviderFactory {
    private var cachedProvider: OemProvider? = null

    @Synchronized
    fun getProvider(): OemProvider {
        if (cachedProvider != null) return cachedProvider!!

        val mfg = (Build.MANUFACTURER ?: "").lowercase()
        val brand = (Build.BRAND ?: "").lowercase()
        val fingerprint = (Build.FINGERPRINT ?: "").lowercase()

        val provider = when {
            mfg.contains("honeywell") || brand.contains("honeywell") || fingerprint.contains("honeywell") -> {
                AppLogger.i("OemProviderFactory: Binding to Honeywell Enterprise Provider (Primary OEM)")
                HoneywellProvider()
            }
            mfg.contains("zebra") || brand.contains("zebra") || fingerprint.contains("zebra") -> {
                AppLogger.i("OemProviderFactory: Binding to Zebra Provider")
                ZebraProvider()
            }
            mfg.contains("samsung") || brand.contains("samsung") -> {
                AppLogger.i("OemProviderFactory: Binding to Samsung Provider")
                SamsungProvider()
            }
            else -> {
                AppLogger.i("OemProviderFactory: Binding to Generic Android Enterprise Provider")
                GenericAndroidProvider()
            }
        }

        cachedProvider = provider
        return provider
    }
}
