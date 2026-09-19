package com.nexus.mdm.agent.ui

import android.annotation.SuppressLint
import android.app.Dialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.wifi.ScanResult
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.nexus.mdm.agent.R
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.util.AppLogger

/**
 * Dedicated Enterprise Kiosk Settings Application.
 * Runs seamlessly inside LockTask (Kiosk) mode.
 * Provides custom, enterprise-isolated management for:
 * 1. Wi-Fi (Toggle, Status, In-App Network Scanner & Password Connector)
 * 2. Bluetooth (Toggle, Status, Paired Devices List & Discovery)
 * 3. Display Brightness (Live 0-100% slider, presets, auto-brightness)
 */
class KioskSettingsActivity : AppCompatActivity() {

    private lateinit var policyHelper: PolicyManagerHelper

    // Wi-Fi Components
    private var wifiManager: WifiManager? = null
    private lateinit var switchWifi: SwitchCompat
    private lateinit var cardConnectedWifi: LinearLayout
    private lateinit var tvConnectedSsid: TextView
    private lateinit var tvConnectedDetails: TextView
    private lateinit var btnDisconnectWifi: Button
    private lateinit var btnScanWifi: Button
    private lateinit var pbWifiScanning: ProgressBar
    private lateinit var rvWifiNetworks: RecyclerView
    private lateinit var tvEmptyWifi: TextView
    private val wifiScanResults = mutableListOf<ScanResult>()
    private var wifiAdapter: WifiNetworksAdapter? = null

    // Bluetooth Components
    private var btAdapter: BluetoothAdapter? = null
    private lateinit var switchBt: SwitchCompat
    private lateinit var tvBtDeviceName: TextView
    private lateinit var btnScanBt: Button
    private lateinit var pbBtScanning: ProgressBar
    private lateinit var rvBtPaired: RecyclerView
    private lateinit var tvEmptyBt: TextView
    private lateinit var tvDiscoveredHeader: TextView
    private lateinit var rvBtDiscovered: RecyclerView
    private val btPairedList = mutableListOf<BluetoothDevice>()
    private val btDiscoveredList = mutableListOf<BluetoothDevice>()
    private var btPairedAdapter: BluetoothDevicesAdapter? = null
    private var btDiscoveredAdapter: BluetoothDevicesAdapter? = null

    // Brightness Components
    private lateinit var tvBrightnessPercent: TextView
    private lateinit var sbBrightness: SeekBar
    private lateinit var switchAutoBrightness: SwitchCompat

    // Broadcast Receivers
    private var wifiScanReceiver: BroadcastReceiver? = null
    private var btDiscoveryReceiver: BroadcastReceiver? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk_settings)

        policyHelper = PolicyManagerHelper(this)
        // Ensure enterprise permissions are actively granted
        try {
            policyHelper.grantAllEnterprisePermissions(this)
        } catch (_: Exception) {}

        findViewById<ImageButton>(R.id.btnKioskSettingsBack)?.setOnClickListener {
            finish()
        }

        initWifiSection()
        initBluetoothSection()
        initBrightnessSection()
    }

    // =========================================================================
    // 1. WI-FI MANAGEMENT
    // =========================================================================
    private fun initWifiSection() {
        wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        switchWifi = findViewById(R.id.switchSettingsWifi)
        cardConnectedWifi = findViewById(R.id.cardConnectedWifi)
        tvConnectedSsid = findViewById(R.id.tvConnectedWifiSsid)
        tvConnectedDetails = findViewById(R.id.tvConnectedWifiDetails)
        btnDisconnectWifi = findViewById(R.id.btnDisconnectWifi)
        btnScanWifi = findViewById(R.id.btnScanWifi)
        pbWifiScanning = findViewById(R.id.pbWifiScanning)
        rvWifiNetworks = findViewById(R.id.rvWifiNetworks)
        tvEmptyWifi = findViewById(R.id.tvEmptyWifiNetworks)

        rvWifiNetworks.layoutManager = LinearLayoutManager(this)
        wifiAdapter = WifiNetworksAdapter(wifiScanResults) { scanResult ->
            onWifiNetworkClicked(scanResult)
        }
        rvWifiNetworks.adapter = wifiAdapter

        val isWifiOn = wifiManager?.isWifiEnabled == true
        switchWifi.isChecked = isWifiOn
        updateConnectedWifiCard()

        switchWifi.setOnCheckedChangeListener { _, isChecked ->
            toggleWifi(isChecked)
        }

        btnDisconnectWifi.setOnClickListener {
            try {
                @Suppress("DEPRECATION")
                wifiManager?.disconnect()
                updateConnectedWifiCard()
                Toast.makeText(this, "تم قطع الاتصال بالشبكة.", Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {}
        }

        btnScanWifi.setOnClickListener {
            startWifiScan()
        }

        // Wi-Fi Scan Broadcast Receiver
        wifiScanReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION == intent?.action) {
                    pbWifiScanning.visibility = View.GONE
                    loadWifiScanResults()
                }
            }
        }
        registerReceiver(wifiScanReceiver, IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION))

        // Trigger initial scan if Wi-Fi is active
        if (isWifiOn) {
            startWifiScan()
        }
    }

    private fun toggleWifi(enable: Boolean) {
        try {
            @Suppress("DEPRECATION")
            wifiManager?.isWifiEnabled = enable
        } catch (_: Exception) {}

        // Fallback via shell if available
        try {
            val cmd = if (enable) "cmd -w wifi set-wifi-enabled enabled" else "cmd -w wifi set-wifi-enabled disabled"
            Runtime.getRuntime().exec(arrayOf("sh", "-c", cmd))
        } catch (_: Exception) {}

        updateConnectedWifiCard()
        if (enable) {
            startWifiScan()
        } else {
            wifiScanResults.clear()
            wifiAdapter?.notifyDataSetChanged()
            tvEmptyWifi.visibility = View.VISIBLE
            tvEmptyWifi.text = "الواي فاي معطّل حالياً"
        }
    }

    private fun updateConnectedWifiCard() {
        val isWifiOn = wifiManager?.isWifiEnabled == true
        if (!isWifiOn) {
            cardConnectedWifi.visibility = View.GONE
            findViewById<TextView>(R.id.tvSettingsWifiStateSubtitle)?.text = "الواي فاي معطّل"
            return
        }

        findViewById<TextView>(R.id.tvSettingsWifiStateSubtitle)?.text = "الواي فاي مفعّل وجاهز للاتصال"
        val info = wifiManager?.connectionInfo
        val ssid = info?.ssid?.replace("\"", "") ?: ""
        if (ssid.isNotBlank() && ssid != "<unknown ssid>") {
            cardConnectedWifi.visibility = View.VISIBLE
            tvConnectedSsid.text = "متصل بشبكة: $ssid"
            val rssi = info?.rssi ?: 0
            val ip = formatIpAddress(info?.ipAddress ?: 0)
            tvConnectedDetails.text = "IP: $ip • قوة الإشارة: $rssi dBm"
        } else {
            cardConnectedWifi.visibility = View.GONE
        }
    }

    private fun startWifiScan() {
        if (wifiManager?.isWifiEnabled != true) {
            Toast.makeText(this, "يرجى تشغيل الواي فاي أولاً للبحث عن الشبكات.", Toast.LENGTH_SHORT).show()
            return
        }
        pbWifiScanning.visibility = View.VISIBLE
        try {
            @Suppress("DEPRECATION")
            wifiManager?.startScan()
        } catch (e: Exception) {
            pbWifiScanning.visibility = View.GONE
            AppLogger.w("KioskSettings", "startScan error: ${e.message}")
        }
        loadWifiScanResults()
    }

    private fun loadWifiScanResults() {
        try {
            @Suppress("DEPRECATION")
            val results = wifiManager?.scanResults ?: emptyList()
            wifiScanResults.clear()
            val filtered = results
                .filter { it.SSID.isNotBlank() }
                .distinctBy { it.SSID }
                .sortedByDescending { it.level }

            wifiScanResults.addAll(filtered)
            wifiAdapter?.notifyDataSetChanged()

            if (wifiScanResults.isEmpty()) {
                tvEmptyWifi.visibility = View.VISIBLE
                tvEmptyWifi.text = "لم يتم العثور على شبكات قريبة. اضغط تحديث."
            } else {
                tvEmptyWifi.visibility = View.GONE
            }
            updateConnectedWifiCard()
        } catch (_: Exception) {}
    }

    private fun onWifiNetworkClicked(scanResult: ScanResult) {
        val ssid = scanResult.SSID
        val capabilities = scanResult.capabilities ?: ""
        val isSecured = capabilities.contains("WPA") || capabilities.contains("WEP") || capabilities.contains("PSK") || capabilities.contains("EAP")

        if (!isSecured) {
            // Open network, connect directly
            connectToOpenWifi(ssid)
            return
        }

        // Show password input dialog inside Kiosk
        showWifiPasswordDialog(ssid)
    }

    private fun showWifiPasswordDialog(ssid: String) {
        val dialog = Dialog(this, R.style.Theme_NexusDPC)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_kiosk_quick_settings, null)

        // Custom password prompt view
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.bg_neomorph_dialog)
            setPadding(48, 48, 48, 48)
        }

        val tvTitle = TextView(this).apply {
            text = "الاتصال بشبكة: $ssid"
            textSize = 17f
            setTextColor(0xFF0F172A.toInt())
            setTypeface(null, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = 24
            }
        }
        layout.addView(tvTitle)

        val etPassword = EditText(this).apply {
            hint = "أدخل كلمة مرور الشبكة"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setBackgroundResource(R.drawable.bg_neomorph_inset)
            setPadding(32, 32, 32, 32)
            setTextColor(0xFF0F172A.toInt())
            textSize = 14f
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = 32
            }
        }
        layout.addView(etPassword)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }

        val btnCancel = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
            text = "إلغاء"
            setTextColor(0xFF64748B.toInt())
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener { dialog.dismiss() }
        }

        val btnConnect = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
            text = "اتصال بالشبكة"
            setTextColor(0xFF2563EB.toInt())
            setTypeface(null, android.graphics.Typeface.BOLD)
            setBackgroundResource(R.drawable.bg_neomorph_pill)
            backgroundTintList = android.content.res.ColorStateList.valueOf(0xFFEFF6FF.toInt())
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener {
                val pass = etPassword.text.toString()
                if (pass.length < 8) {
                    Toast.makeText(this@KioskSettingsActivity, "كلمة المرور يجب أن تكون 8 أحرف على الأقل.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                connectToSecuredWifi(ssid, pass)
                dialog.dismiss()
            }
        }

        btnRow.addView(btnCancel)
        btnRow.addView(btnConnect)
        layout.addView(btnRow)

        dialog.setContentView(layout)
        dialog.show()
    }

    private fun connectToOpenWifi(ssid: String) {
        Toast.makeText(this, "جاري الاتصال بشبكة $ssid...", Toast.LENGTH_SHORT).show()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val suggestion = WifiNetworkSuggestion.Builder()
                    .setSsid(ssid)
                    .build()
                wifiManager?.addNetworkSuggestions(listOf(suggestion))
            }
            @Suppress("DEPRECATION")
            val conf = WifiConfiguration().apply {
                SSID = "\"$ssid\""
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
            }
            @Suppress("DEPRECATION")
            val netId = wifiManager?.addNetwork(conf) ?: -1
            if (netId != -1) {
                @Suppress("DEPRECATION")
                wifiManager?.disconnect()
                @Suppress("DEPRECATION")
                wifiManager?.enableNetwork(netId, true)
                @Suppress("DEPRECATION")
                wifiManager?.reconnect()
            }
        } catch (_: Exception) {}
        rvWifiNetworks.postDelayed({ updateConnectedWifiCard() }, 2000)
    }

    private fun connectToSecuredWifi(ssid: String, pass: String) {
        Toast.makeText(this, "جاري الاتصال بشبكة $ssid...", Toast.LENGTH_SHORT).show()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val suggestion = WifiNetworkSuggestion.Builder()
                    .setSsid(ssid)
                    .setWpa2Passphrase(pass)
                    .build()
                wifiManager?.addNetworkSuggestions(listOf(suggestion))
            }

            @Suppress("DEPRECATION")
            val conf = WifiConfiguration().apply {
                SSID = "\"$ssid\""
                preSharedKey = "\"$pass\""
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
            }
            @Suppress("DEPRECATION")
            val netId = wifiManager?.addNetwork(conf) ?: -1
            if (netId != -1) {
                @Suppress("DEPRECATION")
                wifiManager?.disconnect()
                @Suppress("DEPRECATION")
                wifiManager?.enableNetwork(netId, true)
                @Suppress("DEPRECATION")
                wifiManager?.reconnect()
            }
        } catch (_: Exception) {}

        // Shell execution fallback for Enterprise Device Owner
        try {
            val cmd = "cmd -w wifi connect-network \"$ssid\" wpa2 \"$pass\""
            Runtime.getRuntime().exec(arrayOf("sh", "-c", cmd))
        } catch (_: Exception) {}

        rvWifiNetworks.postDelayed({ updateConnectedWifiCard() }, 3000)
    }

    private fun formatIpAddress(ip: Int): String {
        return "${ip and 0xFF}.${ip shr 8 and 0xFF}.${ip shr 16 and 0xFF}.${ip shr 24 and 0xFF}"
    }

    // =========================================================================
    // 2. BLUETOOTH MANAGEMENT
    // =========================================================================
    @SuppressLint("MissingPermission")
    private fun initBluetoothSection() {
        btAdapter = BluetoothAdapter.getDefaultAdapter()
        switchBt = findViewById(R.id.switchSettingsBt)
        tvBtDeviceName = findViewById(R.id.tvSettingsBtDeviceName)
        btnScanBt = findViewById(R.id.btnScanBt)
        pbBtScanning = findViewById(R.id.pbBtScanning)
        rvBtPaired = findViewById(R.id.rvBtPairedDevices)
        tvEmptyBt = findViewById(R.id.tvEmptyBtDevices)
        tvDiscoveredHeader = findViewById(R.id.tvDiscoveredHeader)
        rvBtDiscovered = findViewById(R.id.rvBtDiscoveredDevices)

        rvBtPaired.layoutManager = LinearLayoutManager(this)
        btPairedAdapter = BluetoothDevicesAdapter(btPairedList)
        rvBtPaired.adapter = btPairedAdapter

        rvBtDiscovered.layoutManager = LinearLayoutManager(this)
        btDiscoveredAdapter = BluetoothDevicesAdapter(btDiscoveredList)
        rvBtDiscovered.adapter = btDiscoveredAdapter

        if (btAdapter == null) {
            switchBt.isEnabled = false
            findViewById<TextView>(R.id.tvSettingsBtStateSubtitle)?.text = "البلوتوث غير مدعوم على هذا الجهاز"
            return
        }

        val isBtOn = btAdapter?.isEnabled == true
        switchBt.isChecked = isBtOn
        updateBtUI()

        switchBt.setOnCheckedChangeListener { _, isChecked ->
            toggleBluetooth(isChecked)
        }

        btnScanBt.setOnClickListener {
            startBtDiscovery()
        }

        // Bluetooth Discovery Receiver
        btDiscoveryReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                when (intent?.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        }
                        if (device != null && !btDiscoveredList.any { it.address == device.address }) {
                            btDiscoveredList.add(device)
                            btDiscoveredAdapter?.notifyDataSetChanged()
                            tvDiscoveredHeader.visibility = View.VISIBLE
                            rvBtDiscovered.visibility = View.VISIBLE
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                        pbBtScanning.visibility = View.GONE
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        registerReceiver(btDiscoveryReceiver, filter)
    }

    @SuppressLint("MissingPermission")
    private fun toggleBluetooth(enable: Boolean) {
        try {
            if (enable) {
                @Suppress("DEPRECATION")
                btAdapter?.enable()
            } else {
                @Suppress("DEPRECATION")
                btAdapter?.disable()
            }
        } catch (_: Exception) {}

        // Shell fallback
        try {
            val cmd = if (enable) "cmd bluetooth_manager enable" else "cmd bluetooth_manager disable"
            Runtime.getRuntime().exec(arrayOf("sh", "-c", cmd))
        } catch (_: Exception) {}

        rvBtPaired.postDelayed({ updateBtUI() }, 1000)
    }

    @SuppressLint("MissingPermission")
    private fun updateBtUI() {
        val isBtOn = btAdapter?.isEnabled == true
        if (isBtOn) {
            findViewById<TextView>(R.id.tvSettingsBtStateSubtitle)?.text = "البلوتوث مفعّل وجاهز للاقتران"
            tvBtDeviceName.text = "اسم هذا الجهاز: ${btAdapter?.name ?: "Honeywell Enterprise"}"
            loadBtPairedDevices()
        } else {
            findViewById<TextView>(R.id.tvSettingsBtStateSubtitle)?.text = "البلوتوث معطّل"
            tvBtDeviceName.text = "البلوتوث مغلق"
            btPairedList.clear()
            btPairedAdapter?.notifyDataSetChanged()
            tvEmptyBt.visibility = View.VISIBLE
            tvEmptyBt.text = "البلوتوث مغلق حالياً"
        }
    }

    @SuppressLint("MissingPermission")
    private fun loadBtPairedDevices() {
        try {
            val bonded = btAdapter?.bondedDevices ?: emptySet()
            btPairedList.clear()
            btPairedList.addAll(bonded)
            btPairedAdapter?.notifyDataSetChanged()

            if (btPairedList.isEmpty()) {
                tvEmptyBt.visibility = View.VISIBLE
                tvEmptyBt.text = "لا توجد أجهزة بلوتوث مقترنة حالياً"
            } else {
                tvEmptyBt.visibility = View.GONE
            }
        } catch (_: Exception) {}
    }

    @SuppressLint("MissingPermission")
    private fun startBtDiscovery() {
        if (btAdapter?.isEnabled != true) {
            Toast.makeText(this, "يرجى تشغيل البلوتوث أولاً للبحث عن الأجهزة.", Toast.LENGTH_SHORT).show()
            return
        }
        pbBtScanning.visibility = View.VISIBLE
        btDiscoveredList.clear()
        btDiscoveredAdapter?.notifyDataSetChanged()
        try {
            if (btAdapter?.isDiscovering == true) {
                btAdapter?.cancelDiscovery()
            }
            btAdapter?.startDiscovery()
        } catch (e: Exception) {
            pbBtScanning.visibility = View.GONE
            AppLogger.w("KioskSettings", "startDiscovery error: ${e.message}")
        }
    }

    // =========================================================================
    // 3. DISPLAY BRIGHTNESS MANAGEMENT
    // =========================================================================
    private fun initBrightnessSection() {
        tvBrightnessPercent = findViewById(R.id.tvSettingsBrightnessPercent)
        sbBrightness = findViewById(R.id.sbSettingsBrightness)
        switchAutoBrightness = findViewById(R.id.switchAutoBrightness)

        // Read initial system brightness
        val sysBrightness = try {
            Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS)
        } catch (_: Exception) { 180 }

        val initPercent = ((sysBrightness * 100) / 255).coerceIn(5, 100)
        sbBrightness.progress = initPercent
        tvBrightnessPercent.text = "$initPercent%"

        sbBrightness.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                val safePercent = progress.coerceIn(5, 100)
                applyBrightness(safePercent)
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) {}
            override fun onStopTrackingTouch(seekBar: SeekBar?) {}
        })

        findViewById<Button>(R.id.btnBright25)?.setOnClickListener { setBrightnessPreset(25) }
        findViewById<Button>(R.id.btnBright50)?.setOnClickListener { setBrightnessPreset(50) }
        findViewById<Button>(R.id.btnBright75)?.setOnClickListener { setBrightnessPreset(75) }
        findViewById<Button>(R.id.btnBright100)?.setOnClickListener { setBrightnessPreset(100) }

        // Auto-Brightness Switch
        val isAuto = try {
            Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE) == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
        } catch (_: Exception) { false }
        switchAutoBrightness.isChecked = isAuto

        switchAutoBrightness.setOnCheckedChangeListener { _, isChecked ->
            try {
                val mode = if (isChecked) Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC else Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
                Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, mode)
            } catch (_: Exception) {}
        }
    }

    private fun setBrightnessPreset(percent: Int) {
        sbBrightness.progress = percent
        applyBrightness(percent)
    }

    private fun applyBrightness(percent: Int) {
        tvBrightnessPercent.text = "$percent%"
        val floatVal = percent / 100f

        // Apply immediately to current activity window
        val lp = window.attributes
        lp.screenBrightness = floatVal
        window.attributes = lp

        // Persist to system settings
        val sysVal = ((percent * 255) / 100).coerceIn(10, 255)
        try {
            Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, sysVal)
        } catch (_: Exception) {}

        // Shell fallback for Device Owner
        try {
            Runtime.getRuntime().exec(arrayOf("sh", "-c", "settings put system screen_brightness $sysVal"))
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            wifiScanReceiver?.let { unregisterReceiver(it) }
            btDiscoveryReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {}
    }

    // =========================================================================
    // ADAPTERS
    // =========================================================================
    inner class WifiNetworksAdapter(
        private val list: List<ScanResult>,
        private val onClick: (ScanResult) -> Unit
    ) : RecyclerView.Adapter<WifiNetworksAdapter.VH>() {

        inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
            val tvSsid: TextView = itemView.findViewById(R.id.tvWifiSsid)
            val tvSecurity: TextView = itemView.findViewById(R.id.tvWifiSecurity)
            val ivSignal: ImageView = itemView.findViewById(R.id.ivWifiSignal)
            val ivLock: ImageView = itemView.findViewById(R.id.ivWifiLock)
            val tvBadge: TextView = itemView.findViewById(R.id.tvWifiConnectedBadge)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_wifi_network, parent, false)
            return VH(v)
        }

        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = list[position]
            holder.tvSsid.text = item.SSID

            val cap = item.capabilities ?: ""
            val isSecured = cap.contains("WPA") || cap.contains("WEP") || cap.contains("PSK")
            holder.tvSecurity.text = if (isSecured) "شبكة مؤمنة (WPA/WPA2)" else "شبكة مفتوحة (Open)"
            holder.ivLock.visibility = if (isSecured) View.VISIBLE else View.GONE

            val connectedSsid = wifiManager?.connectionInfo?.ssid?.replace("\"", "") ?: ""
            val isCurrent = connectedSsid.isNotBlank() && connectedSsid == item.SSID
            holder.tvBadge.visibility = if (isCurrent) View.VISIBLE else View.GONE

            holder.itemView.setOnClickListener { onClick(item) }
        }

        override fun getItemCount(): Int = list.size
    }

    inner class BluetoothDevicesAdapter(
        private val list: List<BluetoothDevice>
    ) : RecyclerView.Adapter<BluetoothDevicesAdapter.VH>() {

        inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
            val tvName: TextView = itemView.findViewById(R.id.tvBtDeviceName)
            val tvAddress: TextView = itemView.findViewById(R.id.tvBtDeviceAddress)
            val tvStatus: TextView = itemView.findViewById(R.id.tvBtPairStatus)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_bluetooth_device, parent, false)
            return VH(v)
        }

        @SuppressLint("MissingPermission")
        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = list[position]
            val name = try { item.name } catch (_: Exception) { null } ?: "جهاز بلوتوث غير مسمى"
            val addr = item.address ?: "00:00:00:00:00:00"
            holder.tvName.text = name

            val isBonded = item.bondState == BluetoothDevice.BOND_BONDED
            holder.tvAddress.text = "$addr • ${if (isBonded) "مقترن" else "متاح"}"
            holder.tvStatus.text = if (isBonded) "مقترن ✓" else "اقتران"

            holder.itemView.setOnClickListener {
                if (!isBonded) {
                    try {
                        item.createBond()
                        Toast.makeText(this@KioskSettingsActivity, "جاري طلب الاقتران بـ $name...", Toast.LENGTH_SHORT).show()
                    } catch (_: Exception) {}
                }
            }
        }

        override fun getItemCount(): Int = list.size
    }
}
