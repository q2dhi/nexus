package com.nexus.mdm.agent.ui

import android.app.Dialog
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText
import com.nexus.mdm.agent.R
import com.nexus.mdm.agent.admin.PolicyManagerHelper
import com.nexus.mdm.agent.config.SecureConfigStore
import com.nexus.mdm.agent.kiosk.AppWhitelistManager
import com.nexus.mdm.agent.kiosk.KioskManager
import com.nexus.mdm.agent.remote.MdmCloudSyncService
import com.nexus.mdm.agent.security.PeripheralPolicyManager
import com.nexus.mdm.agent.util.AppLogger
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Nexus Enterprise Dedicated OS & Minimalist Management Console.
 * Seamlessly transitions between an unbreakable multi-app Kiosk Launcher
 * and an ultra-clean Light Minimalist administrative controller.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var policyHelper: PolicyManagerHelper
    private lateinit var kioskManager: KioskManager
    private lateinit var whitelistManager: AppWhitelistManager
    private lateinit var configStore: SecureConfigStore
    private lateinit var peripheralManager: PeripheralPolicyManager

    // Top-level View Containers
    private lateinit var layoutKioskSurface: View
    private lateinit var layoutAdminConsole: View
    private lateinit var layoutLoadingScreen: View

    // Kiosk Surface UI
    private lateinit var tvKioskClock: TextView
    private lateinit var tvKioskAmPm: TextView
    private lateinit var tvKioskDate: TextView
    private lateinit var tvKioskSubtitle: TextView
    private lateinit var rvKioskApps: RecyclerView

    // Loading Screen UI
    private lateinit var pbLoadingApp: ProgressBar
    private lateinit var tvLoadingStatus: TextView

    // 5-Press Back Button Counter
    private var backPressCount = 0
    private var lastBackPressTime = 0L
    private val BACK_PRESS_TIMEOUT_MS = 2500L

    // Admin Console UI
    private lateinit var tvDeviceOwnerBadge: TextView
    private lateinit var tvHomeLauncherBadge: TextView
    private lateinit var btnSetDefaultHome: Button
    private lateinit var btnActivateAdmin: Button
    private lateinit var tvCloudStatusBadge: TextView
    private lateinit var btnEnterKioskMode: Button
    private lateinit var rvWhitelistSelector: RecyclerView
    private lateinit var btnSaveWhitelist: Button
    private lateinit var etServerUrl: TextInputEditText
    private lateinit var etDeviceTag: TextInputEditText
    private var etCompanyCode: TextInputEditText? = null
    private lateinit var btnConnectServer: Button
    private lateinit var switchCameraAdmin: SwitchMaterial
    private lateinit var switchScreenCaptureAdmin: SwitchMaterial
    private lateinit var switchCellularOnlyAdmin: SwitchMaterial
    private lateinit var btnChangePassword: Button

    private val selectedWhitelist = mutableSetOf<String>()
    private var allInstalledApps = listOf<AppWhitelistManager.AppItem>()
    private var isLaunchingWhitelistedApp = false
    private lateinit var antiTamperGuard: com.nexus.mdm.agent.security.AntiTamperGuard
    private var tamperDialog: Dialog? = null
    private var subscriptionLockDialog: Dialog? = null
    private var securityActionDialog: Dialog? = null

    private val homeRoleLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { _ ->
        refreshBadges()
        if (isCurrentDefaultHome()) {
            Toast.makeText(this, "تم تعيين Nexus كمشغل رئيسي للجهاز.", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        @Volatile
        var instance: MainActivity? = null
            private set
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        try {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            window.statusBarColor = ContextCompat.getColor(this, R.color.nexus_royal_blue)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            setContentView(R.layout.activity_main)

            policyHelper = PolicyManagerHelper(this)
            kioskManager = KioskManager(this)
            whitelistManager = AppWhitelistManager(this)
            configStore = SecureConfigStore(this)
            peripheralManager = PeripheralPolicyManager(this, policyHelper)

            initViews()
            setupBackNavigation()
            setupListeners()
            loadInstalledApps()
            startClockUpdates()
            handleIncomingIntent(intent)

            // Start Cloud Sync Service
            MdmCloudSyncService.start(this)

            if (policyHelper.isDeviceOwner()) {
                policyHelper.setAsDefaultHomeLauncher()
                try {
                    val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                    val admin = com.nexus.mdm.agent.admin.NexusAdminReceiver.getComponentName(this)
                    val enterprisePerms = listOf(
                        android.Manifest.permission.ACCESS_FINE_LOCATION,
                        android.Manifest.permission.ACCESS_COARSE_LOCATION,
                        android.Manifest.permission.ACCESS_BACKGROUND_LOCATION,
                        android.Manifest.permission.READ_PHONE_STATE
                    )
                    for (p in enterprisePerms) {
                        try {
                            dpm.setPermissionGrantState(admin, packageName, p, android.app.admin.DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
                        } catch (_: Exception) {}
                    }
                } catch (_: Exception) {}
            }

            try {
                antiTamperGuard = com.nexus.mdm.agent.security.AntiTamperGuard(this) { reason ->
                    showTamperLockoutDialog(reason)
                }
                antiTamperGuard.startMonitoring()
            } catch (e: Exception) {
                AppLogger.w("MainActivity", "AntiTamperGuard init warning: ${e.message}")
            }

            // Activate appropriate view based on kiosk state
            if (configStore.isKioskEnabled) {
                activateKioskView()
            } else {
                activateAdminView()
            }
            showLoadingScreen(900)
        } catch (t: Throwable) {
            AppLogger.e("MainActivity", "Guarded startup error in onCreate: ${t.message}", t)
        }
    }

    override fun onResume() {
        super.onResume()
        isLaunchingWhitelistedApp = false
        refreshBadges()
        if (configStore.isKioskEnabled) {
            if (policyHelper.isDeviceOwner()) {
                policyHelper.setAsDefaultHomeLauncher()
                policyHelper.setStatusBarDisabled(true)
            }
            applyKioskWindowFlags()
            if (!kioskManager.isKioskActive()) {
                kioskManager.startKiosk(this)
            }
        } else {
            if (policyHelper.isDeviceOwner()) {
                policyHelper.clearDefaultHomeLauncher()
                policyHelper.setStatusBarDisabled(false)
            }
            clearKioskWindowFlags()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (configStore.isKioskEnabled) {
            applyKioskWindowFlags()
            if (!hasFocus) {
                // Instantly collapse notification panel / quick settings pull-down
                collapseStatusBar()
            }
            if (policyHelper.isDeviceOwner()) {
                policyHelper.setStatusBarDisabled(true)
            }
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // If the user attempts to press Home or Recents to escape Kiosk:
        if (configStore.isKioskEnabled && !isLaunchingWhitelistedApp) {
            reclaimKioskForeground()
        }
    }

    override fun onStop() {
        super.onStop()
        if (configStore.isKioskEnabled && !isLaunchingWhitelistedApp) {
            reclaimKioskForeground()
        }
    }

    private fun reclaimKioskForeground() {
        try {
            val bringBack = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            startActivity(bringBack)
        } catch (_: Exception) {}
    }

    @android.annotation.SuppressLint("MissingPermission", "WrongConstant")
    private fun collapseStatusBar() {
        try {
            @Suppress("DEPRECATION")
            val closeDialog = Intent(Intent.ACTION_CLOSE_SYSTEM_DIALOGS)
            sendBroadcast(closeDialog)
        } catch (_: Exception) {}

        try {
            val statusBarService = getSystemService("statusbar")
            val statusBarManager = Class.forName("android.app.StatusBarManager")
            try {
                val collapse = statusBarManager.getMethod("collapsePanels")
                collapse.invoke(statusBarService)
            } catch (_: Exception) {
                val collapseLegacy = statusBarManager.getMethod("collapse")
                collapseLegacy.invoke(statusBarService)
            }
        } catch (_: Exception) {}
    }

    @android.annotation.SuppressLint("InternalInsetResource", "DiscouragedApi")
    private fun getStatusBarHeight(): Int {
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 90
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (configStore.isKioskEnabled && ev.y < (getStatusBarHeight() + 30)) {
            collapseStatusBar()
        }
        return super.dispatchTouchEvent(ev)
    }

    private fun applyKioskWindowFlags() {
        // Keep status bar and navigation bars VISIBLE at all times
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
        window.statusBarColor = ContextCompat.getColor(this, R.color.nexus_royal_blue)
        window.navigationBarColor = ContextCompat.getColor(this, R.color.nexus_bg_light)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_DEFAULT
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
        }
    }

    private fun clearKioskWindowFlags() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
        window.statusBarColor = ContextCompat.getColor(this, R.color.nexus_royal_blue)
        window.navigationBarColor = ContextCompat.getColor(this, R.color.nexus_bg_light)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_VISIBLE
            or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        }
    }

    private fun isCurrentDefaultHome(): Boolean {
        val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolveInfo = packageManager.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)
        if (resolveInfo?.activityInfo?.packageName == packageName) {
            return true
        }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            roleManager?.isRoleHeld(RoleManager.ROLE_HOME) == true
        } else {
            false
        }
    }

    private fun ensureDefaultHomeLauncher() {
        if (isCurrentDefaultHome()) {
            Toast.makeText(this, "Nexus مُعيّن بالفعل كمشغل رئيسي للجهاز.", Toast.LENGTH_SHORT).show()
            refreshBadges()
            return
        }

        // 1. If Device Owner, permanently and silently set Nexus as default launcher without ANY dialog
        if (policyHelper.isDeviceOwner()) {
            val ok = policyHelper.setAsDefaultHomeLauncher()
            if (ok) {
                refreshBadges()
                Toast.makeText(this, "تم تعيين Nexus تلقائياً كمشغل رئيسي للجهاز.", Toast.LENGTH_SHORT).show()
                return
            }
        }

        // 2. Try official RoleManager (Android 10+) only if not Device Owner
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                try {
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME)
                    homeRoleLauncher.launch(intent)
                    return
                } catch (e: Exception) {
                    AppLogger.w("MainActivity", "RoleManager request failed: ${e.message}")
                }
            }
        }

        // 3. Direct Fallback to Default Apps / Home Settings
        try {
            val intent = Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            Toast.makeText(this, "يرجى تعيين Nexus DPC كـ تطبيق الشاشة الرئيسية الافتراضي", Toast.LENGTH_LONG).show()
        } catch (_: Exception) {
            try {
                val intent = Intent(Settings.ACTION_HOME_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(intent)
            } catch (_: Exception) {
                try {
                    val intent = Intent(Settings.ACTION_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    startActivity(intent)
                } catch (_: Exception) {}
            }
        }
    }

    private fun showLoadingScreen(durationMs: Long = 900) {
        layoutLoadingScreen.visibility = View.VISIBLE
        layoutLoadingScreen.alpha = 1f
        lifecycleScope.launch {
            delay(durationMs)
            layoutLoadingScreen.animate()
                .alpha(0f)
                .setDuration(300)
                .withEndAction {
                    layoutLoadingScreen.visibility = View.GONE
                    layoutLoadingScreen.alpha = 1f
                }
        }
    }

    private fun initViews() {
        layoutKioskSurface = findViewById(R.id.layoutKioskSurface)
        layoutAdminConsole = findViewById(R.id.layoutAdminConsole)
        layoutLoadingScreen = findViewById(R.id.layoutLoadingScreen)
        pbLoadingApp = findViewById(R.id.pbLoadingApp)
        tvLoadingStatus = findViewById(R.id.tvLoadingStatus)

        // Kiosk Mode Views
        tvKioskClock = findViewById(R.id.tvKioskClock)
        tvKioskAmPm = findViewById(R.id.tvKioskAmPm)
        tvKioskDate = findViewById(R.id.tvKioskDate)
        tvKioskSubtitle = findViewById(R.id.tvKioskSubtitle)
        rvKioskApps = findViewById(R.id.rvKioskApps)
        rvKioskApps.layoutManager = GridLayoutManager(this, 3)

        // Admin Console Views
        tvDeviceOwnerBadge = findViewById(R.id.tvDeviceOwnerBadge)
        tvHomeLauncherBadge = findViewById(R.id.tvHomeLauncherBadge)
        btnSetDefaultHome = findViewById(R.id.btnSetDefaultHome)
        btnActivateAdmin = findViewById(R.id.btnActivateAdmin)
        tvCloudStatusBadge = findViewById(R.id.tvCloudStatusBadge)
        btnEnterKioskMode = findViewById(R.id.btnEnterKioskMode)
        rvWhitelistSelector = findViewById(R.id.rvWhitelistSelector)
        rvWhitelistSelector.layoutManager = LinearLayoutManager(this)
        btnSaveWhitelist = findViewById(R.id.btnSaveWhitelist)
        etServerUrl = findViewById(R.id.etServerUrl)
        etDeviceTag = findViewById(R.id.etDeviceTag)
        etCompanyCode = findViewById(R.id.etCompanyCode)
        btnConnectServer = findViewById(R.id.btnConnectServer)
        switchCameraAdmin = findViewById(R.id.switchCameraAdmin)
        switchScreenCaptureAdmin = findViewById(R.id.switchScreenCaptureAdmin)
        switchCellularOnlyAdmin = findViewById(R.id.switchCellularOnlyAdmin)
        btnChangePassword = findViewById(R.id.btnChangePassword)

        etServerUrl.setText(configStore.serverUrl)
        etDeviceTag.setText(configStore.deviceTag)
        etCompanyCode?.setText(configStore.companyCode)

        btnSetDefaultHome.setOnClickListener {
            ensureDefaultHomeLauncher()
        }

        btnActivateAdmin.setOnClickListener {
            val intent = Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, policyHelper.adminComponent)
                putExtra(android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Nexus DPC requires Device Administrator privileges to execute remote screen locking and enterprise security policies.")
            }
            startActivity(intent)
        }

        // On-screen Enterprise Bottom Navigation Bar
        findViewById<View>(R.id.btnKioskNavBack)?.setOnClickListener {
            handleKioskBackPress()
        }

        findViewById<View>(R.id.btnKioskNavHome)?.setOnClickListener {
            rvKioskApps.smoothScrollToPosition(0)
            updateKioskGrid()
        }

        findViewById<View>(R.id.btnKioskNavAdmin)?.setOnClickListener {
            showKioskSecurityActionDialog()
        }

        findViewById<View>(R.id.btnAdminNavHome)?.setOnClickListener {
            activateKioskView()
        }

        findViewById<View>(R.id.btnAdminNavExitAndroid)?.setOnClickListener {
            exitKioskToAndroid()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.hasExtra("EXTRA_KIOSK_STATE_CHANGE")) {
            val enable = intent.getBooleanExtra("EXTRA_KIOSK_STATE_CHANGE", false)
            if (enable) {
                configStore.isKioskEnabled = true
                kioskManager.startKiosk(this)
                activateKioskView()
            } else {
                exitKioskToAndroid()
            }
        }
        if (intent.getBooleanExtra("EXTRA_REMOTE_LOCK", false)) {
            if (policyHelper.isAdminActive()) {
                policyHelper.dpm.lockNow()
            } else {
                activateKioskView()
            }
        }
        if (intent.getBooleanExtra("EXTRA_WHITELIST_UPDATED", false)) {
            val newPkg = intent.getStringExtra("EXTRA_NEW_INSTALLED_PKG")
            if (!newPkg.isNullOrEmpty() && newPkg != "Unknown Package") {
                val currentSet = whitelistManager.getWhitelistedPackages().toMutableSet()
                currentSet.add(newPkg)
                whitelistManager.saveWhitelistedPackages(currentSet)
                if (policyHelper.isDeviceOwner()) {
                    whitelistManager.syncWithDevicePolicyManager(policyHelper.dpm, policyHelper.adminComponent)
                }
                selectedWhitelist.clear()
                selectedWhitelist.addAll(currentSet)
            }
            loadInstalledApps()
            Toast.makeText(this, "تم تحديث وتفعيل تطبيقات الكشك بنجاح!", Toast.LENGTH_SHORT).show()
        }
        if (intent.getBooleanExtra("EXTRA_START_SCREEN_STREAM", false)) {
            val serverUrl = intent.getStringExtra("EXTRA_SERVER_URL") ?: configStore.serverUrl
            val deviceId = intent.getStringExtra("EXTRA_DEVICE_ID") ?: "DEVICE"
            com.nexus.mdm.agent.remote.ScreenCaptureManager.startStream(this, serverUrl, deviceId)
        }
        if (intent.hasExtra("EXTRA_TRIGGER_TAMPER")) {
            val reason = intent.getStringExtra("EXTRA_TRIGGER_TAMPER") ?: "Security breach detected"
            antiTamperGuard.triggerTamperAlarm(reason)
        }
        if (intent.getBooleanExtra("EXTRA_DISARM_TAMPER", false)) {
            antiTamperGuard.disarmAlarm()
            tamperDialog?.dismiss()
            tamperDialog = null
            Toast.makeText(this, "تم إيقاف الإنذار الأمني بنجاح.", Toast.LENGTH_SHORT).show()
        }
        if (intent.hasExtra("EXTRA_SUBSCRIPTION_STATE")) {
            val isSubActive = intent.getBooleanExtra("EXTRA_SUBSCRIPTION_STATE", true)
            val subMsg = intent.getStringExtra("EXTRA_SUBSCRIPTION_MESSAGE") ?: ""
            val compName = intent.getStringExtra("EXTRA_COMPANY_NAME") ?: ""
            if (!isSubActive) {
                showSubscriptionLockDialog(subMsg, compName)
            } else {
                dismissSubscriptionLockDialog()
            }
        }
        if (intent.hasExtra("EXTRA_DEVICE_RENAMED")) {
            val newName = intent.getStringExtra("EXTRA_DEVICE_RENAMED") ?: ""
            if (newName.isNotEmpty()) {
                configStore.deviceTag = newName
                etDeviceTag.setText(newName)
                Toast.makeText(this, "تم تحديث اسم الجهاز إلى: $newName", Toast.LENGTH_SHORT).show()
            }
        }
        if (intent.hasExtra("EXTRA_DEVICE_TAG")) {
            val tag = intent.getStringExtra("EXTRA_DEVICE_TAG")
            if (!tag.isNullOrBlank()) {
                configStore.deviceTag = tag
                etDeviceTag.setText(tag)
            }
        }
        if (intent.hasExtra("EXTRA_COMPANY_CODE")) {
            val code = intent.getStringExtra("EXTRA_COMPANY_CODE")
            if (!code.isNullOrBlank()) {
                configStore.companyCode = code
            }
        }
        if (intent.hasExtra("EXTRA_SYNC_TIME")) {
            Toast.makeText(this, "تمت مزامنة الوقت والتاريخ مع السيرفر بنجاح!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
        super.onDestroy()
        if (::antiTamperGuard.isInitialized) {
            antiTamperGuard.stopMonitoring()
        }
        com.nexus.mdm.agent.remote.ScreenCaptureManager.stopStream()
        securityActionDialog?.dismiss()
        securityActionDialog = null
    }

    private fun showTamperLockoutDialog(reason: String) {
        if (isFinishing || isDestroyed) return
        if (tamperDialog?.isShowing == true) return

        try {
            val dialog = Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
            val layout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setBackgroundColor(Color.parseColor("#991B1B"))
                setPadding(48, 48, 48, 48)
            }

            val tvIcon = TextView(this).apply {
                text = "[!]"
                textSize = 36f
                setTextColor(Color.WHITE)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
            }

            val tvTitle = TextView(this).apply {
                text = "خرق أمني: رصد تلاعب بالجهاز!"
                textSize = 24f
                setTextColor(Color.WHITE)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setPadding(0, 16, 0, 8)
            }

            val tvReason = TextView(this).apply {
                text = "$reason\n\nتم إطلاق صفارة الإنذار وقفل الهاتف وإبلاغ الإدارة المركزية فوراً."
                textSize = 15f
                setTextColor(Color.parseColor("#FEE2E2"))
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, 32)
            }

            val etPin = TextInputEditText(this).apply {
                hint = "أدخل رمز المشرف لتعطيل الإنذار"
                inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
                setTextColor(Color.WHITE)
                setHintTextColor(Color.parseColor("#FCA5A5"))
                gravity = Gravity.CENTER
                setBackgroundColor(Color.parseColor("#7F1D1D"))
                setPadding(24, 24, 24, 24)
            }

            val btnDisarm = Button(this).apply {
                text = "تعطيل الإنذار وفك القفل"
                setBackgroundColor(Color.WHITE)
                setTextColor(Color.parseColor("#991B1B"))
                typeface = Typeface.DEFAULT_BOLD
                setOnClickListener {
                    val entered = etPin.text?.toString().orEmpty().trim()
                    if (configStore.verifyPin(entered)) {
                        antiTamperGuard.disarmAlarm()
                        dialog.dismiss()
                        tamperDialog = null
                        Toast.makeText(this@MainActivity, "تم تعطيل الإنذار بنجاح.", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "رمز المشرف غير صحيح!", Toast.LENGTH_SHORT).show()
                        etPin.setText("")
                    }
                }
            }

            layout.addView(tvIcon)
            layout.addView(tvTitle)
            layout.addView(tvReason)
            layout.addView(etPin)
            val spacer = View(this).apply { layoutParams = LinearLayout.LayoutParams(1, 24) }
            layout.addView(spacer)
            layout.addView(btnDisarm)

            dialog.setContentView(layout)
            dialog.setCancelable(false)
            tamperDialog = dialog
            dialog.show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing tamper lockout dialog", e)
        }
    }

    private fun showSubscriptionLockDialog(message: String, companyName: String) {
        if (isFinishing || isDestroyed) return
        if (subscriptionLockDialog?.isShowing == true) return

        try {
            val dialog = Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
            val layout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setBackgroundColor(Color.parseColor("#0F172A"))
                setPadding(48, 48, 48, 48)
            }

            val tvIcon = TextView(this).apply {
                text = "[LOCKED]"
                textSize = 28f
                setTextColor(Color.parseColor("#F87171"))
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
            }

            val tvTitle = TextView(this).apply {
                text = "تطبيق Nexus DPC معطّل"
                textSize = 24f
                setTextColor(Color.parseColor("#F87171"))
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setPadding(0, 16, 0, 8)
            }

            val tvReason = TextView(this).apply {
                val cName = if (companyName.isNotBlank()) companyName else configStore.companyCode
                val statusDesc = if (message.isNotBlank()) message else "الاشتراك غير مفعّل أو انتهت فترة الصلاحية من قِبل المطور."
                text = "$statusDesc\n\nالشركة المشتركة: $cName\nكود الشركة: ${configStore.companyCode}\nوسم / اسم الجهاز: ${configStore.deviceTag}\n\nيرجى التواصل مع المطور لتفعيل الاشتراك."
                textSize = 14f
                setTextColor(Color.parseColor("#CBD5E1"))
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, 32)
            }

            val btnCheck = Button(this).apply {
                text = "فحص حالة التفعيل الآن (Check Activation)"
                setBackgroundColor(Color.parseColor("#0284C7"))
                setTextColor(Color.WHITE)
                typeface = Typeface.DEFAULT_BOLD
                setOnClickListener {
                    Toast.makeText(this@MainActivity, "جاري فحص الاتصال والتفعيل مع السيرفر...", Toast.LENGTH_SHORT).show()
                    MdmCloudSyncService.start(this@MainActivity)
                }
            }

            layout.addView(tvIcon)
            layout.addView(tvTitle)
            layout.addView(tvReason)
            layout.addView(btnCheck)

            dialog.setContentView(layout)
            dialog.setCancelable(false)
            subscriptionLockDialog = dialog
            dialog.show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing subscription lock dialog", e)
        }
    }

    private fun dismissSubscriptionLockDialog() {
        subscriptionLockDialog?.dismiss()
        subscriptionLockDialog = null
    }

    private fun showRenameDeviceDialog() {
        if (isFinishing || isDestroyed) return
        try {
            val input = TextInputEditText(this).apply {
                setText(configStore.deviceTag)
                hint = "أدخل اسم الجهاز الجديد (مثال: كاشير 1)"
                setPadding(32, 32, 32, 32)
            }
            android.app.AlertDialog.Builder(this)
                .setTitle("تسمية الجهاز (Device Name)")
                .setView(input)
                .setPositiveButton("حفظ") { _, _ ->
                    val newName = input.text?.toString().orEmpty().trim()
                    if (newName.isNotEmpty()) {
                        configStore.deviceTag = newName
                        etDeviceTag.setText(newName)
                        Toast.makeText(this, "تم حفظ اسم الجهاز: $newName", Toast.LENGTH_SHORT).show()
                    }
                }
                .setNegativeButton("إلغاء", null)
                .show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing rename device dialog", e)
        }
    }

    private fun handleKioskBackPress() {
        val now = System.currentTimeMillis()
        if (now - lastBackPressTime > BACK_PRESS_TIMEOUT_MS) {
            backPressCount = 1
        } else {
            backPressCount++
        }
        lastBackPressTime = now

        if (backPressCount >= 5) {
            backPressCount = 0
            showKioskSecurityActionDialog()
        } else if (backPressCount in 2..4) {
            val remaining = 5 - backPressCount
            Toast.makeText(this, "اضغط $remaining مرات إضافية لفتح خيارات المسؤول", Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (configStore.isKioskEnabled) {
                    handleKioskBackPress()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Handle Honeywell Enterprise hardware scan buttons (CT47, CT45, CT40, EDA52, CK65)
        if (event.keyCode in listOf(241, 242, 243, 244, 293, 294, KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_R1)) {
            AppLogger.d("MainActivity", "Honeywell hardware scanner trigger key: ${event.keyCode}")
            return super.dispatchKeyEvent(event)
        }

        if (configStore.isKioskEnabled && event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                handleKioskBackPress()
                return true
            }
            if (event.action == KeyEvent.ACTION_UP) {
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun showKioskSecurityActionDialog() {
        if (isFinishing || isDestroyed) return
        if (securityActionDialog?.isShowing == true) return

        try {
            val dialog = Dialog(this, R.style.Theme_NexusDPC)
            val view = LayoutInflater.from(this).inflate(R.layout.dialog_kiosk_security_menu, null)
            dialog.setContentView(view)

            val btnExitToAndroid = view.findViewById<View>(R.id.btnSecurityExitToAndroid)
            val btnAdminPin = view.findViewById<View>(R.id.btnSecurityAdminPin)
            val btnWifi = view.findViewById<View>(R.id.btnSecurityWifiSettings)
            val btnReboot = view.findViewById<View>(R.id.btnSecurityReboot)
            val btnCancel = view.findViewById<Button>(R.id.btnSecurityCancel)

            btnExitToAndroid?.setOnClickListener {
                dialog.dismiss()
                showAdminPasswordDialog(
                    title = "الخروج إلى نظام أندرويد",
                    subtitle = "أدخل رمز المشرف / الأدمن للخروج من وضع الكشك والعودة لواجهة أندرويد.",
                    actionButtonText = "تأكيد الخروج للأندرويد"
                ) {
                    exitKioskToAndroid()
                }
            }

            btnAdminPin.setOnClickListener {
                dialog.dismiss()
                showAdminPasswordDialog(
                    title = "لوحة تحكم المشرف",
                    subtitle = "أدخل رمز المشرف لفتح لوحة تحكم وإعدادات الجهاز.",
                    actionButtonText = "فتح لوحة التحكم"
                ) {
                    showAdminActionMenu()
                }
            }

            btnWifi?.setOnClickListener {
                dialog.dismiss()
                showAdminPasswordDialog(
                    title = "إعدادات الواي فاي والشبكة",
                    subtitle = "أدخل رمز المشرف لفتح إعدادات شبكة الجهاز.",
                    actionButtonText = "فتح الإعدادات"
                ) {
                    try {
                        val wifiIntent = Intent(android.provider.Settings.ACTION_WIFI_SETTINGS).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        startActivity(wifiIntent)
                    } catch (_: Exception) {
                        try {
                            val settingsIntent = Intent(android.provider.Settings.ACTION_SETTINGS).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            startActivity(settingsIntent)
                        } catch (e2: Exception) {
                            Toast.makeText(this, "تعذر فتح الإعدادات: ${e2.message}", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }

            btnReboot.setOnClickListener {
                dialog.dismiss()
                if (!isFinishing && !isDestroyed) {
                    try {
                        android.app.AlertDialog.Builder(this)
                            .setTitle("إعادة تشغيل الجهاز")
                            .setMessage("هل أنت متأكد من رغبتك في إعادة تشغيل الجهاز فوراً؟")
                            .setPositiveButton("إعادة التشغيل الآن") { _, _ ->
                                if (policyHelper.isDeviceOwner()) {
                                    val rebootSuccess = policyHelper.rebootDevice()
                                    if (!rebootSuccess) {
                                        Toast.makeText(this, "تعذر إعادة تشغيل الجهاز تلقائياً.", Toast.LENGTH_LONG).show()
                                    }
                                } else {
                                    Toast.makeText(this, "تتطلب إعادة التشغيل التلقائي تفعيل صلاحية Device Owner.", Toast.LENGTH_LONG).show()
                                }
                            }
                            .setNegativeButton("إلغاء", null)
                            .show()
                    } catch (e: Exception) {
                        AppLogger.w("MainActivity", "Failed showing reboot alert: ${e.message}")
                    }
                }
            }

            btnCancel.setOnClickListener {
                dialog.dismiss()
            }

            securityActionDialog = dialog
            dialog.show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing security action dialog", e)
        }
    }

    private fun setupListeners() {
        // Multi-tap emergency cryptographic escape hatch on kiosk logo
        findViewById<View>(R.id.ivKioskLogo)?.let { logoView ->
            val escapeHatch = com.nexus.mdm.agent.kiosk.SecurityEscapeHatch(this) {
                kioskManager.launchStockAndroidHome(this)
                clearKioskWindowFlags()
                Toast.makeText(this, "تم الخروج من وضع الكشك بنجاح والعودة لنظام أندرويد.", Toast.LENGTH_SHORT).show()
            }
            escapeHatch.attachTo(logoView)
        }

        // Subtle stealth header hold as secondary administrator access trigger
        findViewById<View>(R.id.layoutKioskHeader)?.setOnLongClickListener {
            showKioskSecurityActionDialog()
            true
        }

        // Enter Kiosk Mode
        btnEnterKioskMode.setOnClickListener {
            whitelistManager.saveWhitelistedPackages(selectedWhitelist)
            if (policyHelper.isDeviceOwner()) {
                whitelistManager.syncWithDevicePolicyManager(policyHelper.dpm, policyHelper.adminComponent)
            }
            kioskManager.startKiosk(this, selectedWhitelist.toList())
            ensureDefaultHomeLauncher()
            activateKioskView()
            Toast.makeText(this, "تم تفعيل وضع الكشك المحكم (${selectedWhitelist.size} تطبيق)", Toast.LENGTH_SHORT).show()
        }

        // Save Whitelist
        btnSaveWhitelist.setOnClickListener {
            whitelistManager.saveWhitelistedPackages(selectedWhitelist)
            if (policyHelper.isDeviceOwner()) {
                whitelistManager.syncWithDevicePolicyManager(policyHelper.dpm, policyHelper.adminComponent)
            }
            Toast.makeText(this, "تم حفظ التطبيقات المسموحة (${selectedWhitelist.size} تطبيق)", Toast.LENGTH_SHORT).show()
            updateKioskGrid()
        }

        // Connect Server
        btnConnectServer.setOnClickListener {
            var url = etServerUrl.text.toString().trim()
            val tag = etDeviceTag.text.toString().trim()
            val comp = etCompanyCode?.text?.toString()?.trim().orEmpty()
            if (url.isNotEmpty()) {
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "http://$url"
                }
                configStore.serverUrl = url
                etServerUrl.setText(url)
            }
            if (tag.isNotEmpty()) configStore.deviceTag = tag
            if (comp.isNotEmpty()) configStore.companyCode = comp
            MdmCloudSyncService.start(this)

            Toast.makeText(this, "جاري اختبار الاتصال بسيرفر الويب...", Toast.LENGTH_SHORT).show()

            lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    val testUrl = java.net.URL("${configStore.serverUrl.trimEnd('/')}/api/devices")
                    val conn = testUrl.openConnection() as java.net.HttpURLConnection
                    conn.connectTimeout = 3000
                    conn.readTimeout = 3000
                    val code = conn.responseCode
                    conn.disconnect()

                    lifecycleScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                        if (code == 200) {
                            tvCloudStatusBadge.text = "Cloud: Connected"
                            tvCloudStatusBadge.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.nexus_green))
                            Toast.makeText(this@MainActivity, "✅ تم الاتصال بنجاح! سيظهر الجهاز الآن في لوحة الويب.", Toast.LENGTH_LONG).show()
                        } else {
                            tvCloudStatusBadge.text = "Cloud: HTTP $code"
                            tvCloudStatusBadge.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.nexus_amber))
                            Toast.makeText(this@MainActivity, "استجاب السيرفر برمز: $code", Toast.LENGTH_SHORT).show()
                        }
                    }
                } catch (e: Exception) {
                    lifecycleScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                        tvCloudStatusBadge.text = "Cloud: Offline"
                        tvCloudStatusBadge.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.nexus_red))
                        Toast.makeText(this@MainActivity, "تعذر الوصول للسيرفر: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        // Camera Switch
        switchCameraAdmin.setOnCheckedChangeListener { _, isChecked ->
            peripheralManager.setCameraEnabled(isChecked)
        }

        // Screen Capture Switch
        switchScreenCaptureAdmin.setOnCheckedChangeListener { _, isChecked ->
            peripheralManager.setScreenCaptureEnabled(isChecked)
        }

        // Cellular Only / Disable Wi-Fi Switch
        switchCellularOnlyAdmin.setOnCheckedChangeListener { _, isChecked ->
            val ok = peripheralManager.enforceCellularOnly(isChecked)
            val msg = if (isChecked) {
                if (ok) "تم إيقاف الواي فاي وحصر الشبكة على بيانات الهاتف (4G/5G)." else "تعذر تطبيق قفل الشبكة."
            } else {
                "تمت إتاحة شبكات الواي فاي مجدداً."
            }
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }

        // Change Password
        btnChangePassword.setOnClickListener {
            showChangePasswordDialog()
        }
    }

    private fun loadInstalledApps() {
        lifecycleScope.launch {
            try {
                allInstalledApps = whitelistManager.getInstalledLaunchableApps()
                selectedWhitelist.clear()
                var currentWhitelisted = whitelistManager.getWhitelistedPackages()
                if (currentWhitelisted.isEmpty()) {
                    val defaults = allInstalledApps.filter { item ->
                        AppWhitelistManager.DEFAULT_ENTERPRISE_APPS.contains(item.packageName) ||
                        item.packageName.contains("calculator", ignoreCase = true) ||
                        item.packageName.contains("chrome", ignoreCase = true) ||
                        item.packageName.contains("camera", ignoreCase = true)
                    }.map { it.packageName }.toSet()
                    if (defaults.isNotEmpty()) {
                        whitelistManager.saveWhitelistedPackages(defaults)
                        currentWhitelisted = defaults
                    }
                }
                selectedWhitelist.addAll(currentWhitelisted)

                val adapter = WhitelistSelectorAdapter(allInstalledApps) { item, isChecked ->
                    if (isChecked) selectedWhitelist.add(item.packageName) else selectedWhitelist.remove(item.packageName)
                    updateKioskGrid()
                }
                rvWhitelistSelector.adapter = adapter
                updateKioskGrid()
            } catch (t: Throwable) {
                AppLogger.e("MainActivity", "Error in loadInstalledApps: ${t.message}", t)
            }
        }
    }

    private fun updateKioskGrid() {
        val whitelistedApps = allInstalledApps.filter { selectedWhitelist.contains(it.packageName) }
        val kioskAdapter = KioskAppsAdapter(whitelistedApps) { app ->
            isLaunchingWhitelistedApp = true
            val ok = kioskManager.launchWhitelistedApp(this, app.packageName)
            if (!ok) {
                isLaunchingWhitelistedApp = false
                Toast.makeText(this, "تعذر تشغيل التطبيق: ${app.appName}", Toast.LENGTH_SHORT).show()
            }
        }
        rvKioskApps.adapter = kioskAdapter
    }

    private fun activateKioskView() {
        layoutKioskSurface.visibility = View.VISIBLE
        layoutAdminConsole.visibility = View.GONE
        applyKioskWindowFlags()
        if (policyHelper.isDeviceOwner()) {
            policyHelper.setStatusBarDisabled(true)
        }
        if (!kioskManager.isKioskActive()) {
            kioskManager.startKiosk(this)
        }
        updateKioskGrid()
    }

    private fun exitKioskToAndroid() {
        try {
            isLaunchingWhitelistedApp = true
            configStore.isKioskEnabled = false

            // 1. Release LockTask
            kioskManager.stopKiosk(this)

            // 2. Clear default persistent launcher and restore status bar
            if (policyHelper.isDeviceOwner()) {
                policyHelper.clearDefaultHomeLauncher()
                policyHelper.setStatusBarDisabled(false)
            }

            // 3. Clear window flags and switch UI to Admin Console
            clearKioskWindowFlags()
            layoutKioskSurface.visibility = View.GONE
            layoutAdminConsole.visibility = View.VISIBLE
            refreshBadges()

            Toast.makeText(this, "تم الخروج من وضع الكشك بنجاح والعودة لنظام أندرويد.", Toast.LENGTH_SHORT).show()

            // 4. Launch Stock Android Home Launcher
            kioskManager.launchStockAndroidHome(this)
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed exiting kiosk to Android", e)
            Toast.makeText(this, "حدث خطأ أثناء الخروج: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun activateAdminView() {
        layoutKioskSurface.visibility = View.GONE
        layoutAdminConsole.visibility = View.VISIBLE
        clearKioskWindowFlags()
        if (policyHelper.isDeviceOwner()) {
            policyHelper.clearDefaultHomeLauncher()
            policyHelper.setStatusBarDisabled(false)
        }
        refreshBadges()
    }

    private fun showAdminActionMenu() {
        if (isFinishing || isDestroyed) return
        try {
            val options = arrayOf(
                "الخروج إلى نظام أندرويد (Exit to Android OS)",
                "إعدادات السيرفر وكود الشركة (Server & Company Setup)",
                "تسمية / تعديل اسم الجهاز (Rename Device)",
                "لوحة تحكم المسؤول المتقدمة (Admin Console)",
                "فتح إعدادات أندرويد وشبكة الواي فاي (Android & Wi-Fi Settings)",
                "تفعيل خيارات المطورين وتصحيح USB (Enable Developer / USB Debugging)",
                "إعادة ضبط المصنع للجهاز (Factory Reset Device)",
                "تعيين Nexus كمشغل رئيسي (Set as Default Home)",
                "تفعيل خدمة التحكم السحابي باللمس (Enable Cloud Remote Control)",
                "إلغاء (Cancel)"
            )
            android.app.AlertDialog.Builder(this)
                .setTitle("Nexus MDM - خيارات المسؤول (Admin Options)")
                .setItems(options) { dialog, which ->
                    when (which) {
                        0 -> {
                            exitKioskToAndroid()
                        }
                        1 -> {
                            showServerSettingsDialog()
                        }
                        2 -> {
                            showRenameDeviceDialog()
                        }
                        3 -> {
                            layoutKioskSurface.visibility = View.GONE
                            layoutAdminConsole.visibility = View.VISIBLE
                            clearKioskWindowFlags()
                            refreshBadges()
                        }
                        4 -> {
                            kioskManager.stopKiosk(this)
                            clearKioskWindowFlags()
                            try {
                                val settings = Intent(android.provider.Settings.ACTION_SETTINGS).apply {
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                }
                                startActivity(settings)
                            } catch (_: Exception) {
                                try {
                                    val wifiSettings = Intent(android.provider.Settings.ACTION_WIFI_SETTINGS).apply {
                                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                    }
                                    startActivity(wifiSettings)
                                } catch (e2: Exception) {
                                    Toast.makeText(this, "تعذر فتح الإعدادات: ${e2.message}", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                        5 -> {
                            try {
                                if (policyHelper.isDeviceOwner()) {
                                    policyHelper.dpm.clearUserRestriction(policyHelper.adminComponent, android.os.UserManager.DISALLOW_DEBUGGING_FEATURES)
                                    policyHelper.dpm.setGlobalSetting(policyHelper.adminComponent, android.provider.Settings.Global.ADB_ENABLED, "1")
                                }
                                val devIntent = Intent(android.provider.Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).apply {
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                }
                                startActivity(devIntent)
                                Toast.makeText(this, "تم تفعيل تصحيح USB وفتح خيارات المطورين.", Toast.LENGTH_SHORT).show()
                            } catch (e: Exception) {
                                Toast.makeText(this, "تعذر فتح خيارات المطورين: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                        6 -> {
                            android.app.AlertDialog.Builder(this)
                                .setTitle("تحذير: إعادة ضبط المصنع")
                                .setMessage("هل أنت متأكد من رغبتك في مسح كافة بيانات الجهاز والعودة لحالة المصنع؟")
                                .setPositiveButton("نعم، فرمت الجهاز") { _, _ ->
                                    try {
                                        if (policyHelper.isDeviceOwner()) {
                                            policyHelper.dpm.wipeData(0)
                                        } else {
                                            Toast.makeText(this, "يتطلب صلاحية مالك الجهاز (Device Owner)", Toast.LENGTH_SHORT).show()
                                        }
                                    } catch (e: Exception) {
                                        Toast.makeText(this, "فشل الفورمات: ${e.message}", Toast.LENGTH_SHORT).show()
                                    }
                                }
                                .setNegativeButton("إلغاء", null)
                                .show()
                        }
                        7 -> {
                            ensureDefaultHomeLauncher()
                        }
                        8 -> {
                            val isAccActive = com.nexus.mdm.agent.remote.NexusAccessibilityService.isServiceActive()
                            if (isAccActive) {
                                Toast.makeText(this, "خدمة التحكم السحابي باللمس مفعلة ونشطة بالفعل!", Toast.LENGTH_SHORT).show()
                            } else {
                                try {
                                    val intent = Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                    }
                                    startActivity(intent)
                                    Toast.makeText(this, "يرجى تفعيل خدمة Nexus Remote Cloud Control للتحكم باللمس عن بعد.", Toast.LENGTH_LONG).show()
                                } catch (_: Exception) {
                                    Toast.makeText(this, "تعذر فتح إعدادات إمكانية الوصول.", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                        9 -> {
                            dialog.dismiss()
                        }
                    }
                }
                .show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing admin action menu", e)
        }
    }

    private fun showServerSettingsDialog() {
        if (isFinishing || isDestroyed) return
        try {
            val dialog = Dialog(this, R.style.Theme_NexusDPC)
            val view = LayoutInflater.from(this).inflate(R.layout.dialog_server_settings, null)
            dialog.setContentView(view)

            val etUrl = view.findViewById<TextInputEditText>(R.id.etDialogServerUrl)
            val etComp = view.findViewById<TextInputEditText>(R.id.etDialogCompanyCode)
            val etTag = view.findViewById<TextInputEditText>(R.id.etDialogDeviceTag)
            val btnCancel = view.findViewById<Button>(R.id.btnCancelServerSettings)
            val btnSave = view.findViewById<Button>(R.id.btnSaveServerSettings)

            etUrl.setText(configStore.serverUrl)
            etComp.setText(configStore.companyCode)
            etTag.setText(configStore.deviceTag)

            btnCancel.setOnClickListener { dialog.dismiss() }

            btnSave.setOnClickListener {
                var url = etUrl.text?.toString().orEmpty().trim()
                val comp = etComp.text?.toString().orEmpty().trim()
                val tag = etTag.text?.toString().orEmpty().trim()

                if (url.isNotEmpty()) {
                    if (!url.startsWith("http://") && !url.startsWith("https://")) {
                        url = "http://$url"
                    }
                    configStore.serverUrl = url
                    etServerUrl.setText(url)
                }
                if (comp.isNotEmpty()) {
                    configStore.companyCode = comp
                    etCompanyCode?.setText(comp)
                }
                if (tag.isNotEmpty()) {
                    configStore.deviceTag = tag
                    etDeviceTag.setText(tag)
                }

                MdmCloudSyncService.start(this)
                Toast.makeText(this, "تم الحفظ! جاري فحص الاتصال بالسيرفر...", Toast.LENGTH_SHORT).show()

                lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                    try {
                        val testUrl = java.net.URL("${configStore.serverUrl.trimEnd('/')}/api/devices")
                        val conn = testUrl.openConnection() as java.net.HttpURLConnection
                        conn.connectTimeout = 3500
                        conn.readTimeout = 3500
                        val code = conn.responseCode
                        conn.disconnect()

                        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                            if (code == 200) {
                                tvCloudStatusBadge.text = "Cloud: Connected"
                                tvCloudStatusBadge.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.nexus_green))
                                Toast.makeText(this@MainActivity, "تم الاتصال بنجاح وسيبدأ الجهاز بالظهور في لوحة الويب.", Toast.LENGTH_LONG).show()
                                dialog.dismiss()
                            } else {
                                Toast.makeText(this@MainActivity, "استجاب السيرفر برمز HTTP: $code", Toast.LENGTH_LONG).show()
                            }
                        }
                    } catch (e: Exception) {
                        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                            Toast.makeText(this@MainActivity, "تعذر الاتصال بالسيرفر: ${e.message}\nتأكد من اتصال الجهاز بالشبكة وصحة العنوان.", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }

            dialog.show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing server settings dialog", e)
        }
    }

    private fun refreshBadges() {
        val isOwner = policyHelper.isDeviceOwner()
        val isAdmin = policyHelper.isAdminActive()
        if (isOwner) {
            tvDeviceOwnerBadge.text = "Device Owner: Active"
            tvDeviceOwnerBadge.setTextColor(ContextCompat.getColor(this, R.color.nexus_green))
            btnActivateAdmin.visibility = View.GONE
        } else if (isAdmin) {
            tvDeviceOwnerBadge.text = "Device Admin: Active"
            tvDeviceOwnerBadge.setTextColor(ContextCompat.getColor(this, R.color.nexus_green))
            btnActivateAdmin.visibility = View.GONE
        } else {
            tvDeviceOwnerBadge.text = "Device Admin: Inactive"
            tvDeviceOwnerBadge.setTextColor(ContextCompat.getColor(this, R.color.nexus_amber))
            btnActivateAdmin.visibility = View.VISIBLE
        }

        if (isCurrentDefaultHome()) {
            tvHomeLauncherBadge.text = "Home Launcher: Locked (Default)"
            tvHomeLauncherBadge.setTextColor(ContextCompat.getColor(this, R.color.nexus_green))
            btnSetDefaultHome.visibility = View.GONE
        } else {
            tvHomeLauncherBadge.text = "Home Launcher: Not Default"
            tvHomeLauncherBadge.setTextColor(ContextCompat.getColor(this, R.color.nexus_amber))
            btnSetDefaultHome.visibility = View.VISIBLE
        }

        tvCloudStatusBadge.text = "Sync: Ready"
    }

    private fun startClockUpdates() {
        val timeFormat = SimpleDateFormat("hh:mm", Locale.getDefault())
        val amPmFormat = SimpleDateFormat("a", Locale.getDefault())
        val dateFormat = SimpleDateFormat("EEEE، d MMMM yyyy", Locale("ar"))
        val fallbackDateFormat = SimpleDateFormat("EEEE, MMMM d, yyyy", Locale.getDefault())

        lifecycleScope.launch {
            while (isActive) {
                val now = Date()
                tvKioskClock.text = timeFormat.format(now)
                tvKioskAmPm.text = amPmFormat.format(now).uppercase()
                
                try {
                    tvKioskDate.text = dateFormat.format(now)
                } catch (_: Exception) {
                    tvKioskDate.text = fallbackDateFormat.format(now)
                }

                val tag = configStore.deviceTag.trim()
                if (tag.isNotEmpty()) {
                    tvKioskSubtitle.text = tag
                }

                delay(1000)
            }
        }
    }

    private fun showAdminPasswordDialog(
        title: String = "التحقق من هوية المسؤول",
        subtitle: String = "أدخل رمز المشرف للمتابعة والوصول للإعدادات.",
        actionButtonText: String = "تأكيد",
        onSuccess: () -> Unit = { showAdminActionMenu() }
    ) {
        if (isFinishing || isDestroyed) return
        try {
            val dialog = Dialog(this, R.style.Theme_NexusDPC)
            val view = LayoutInflater.from(this).inflate(R.layout.dialog_admin_password, null)
            dialog.setContentView(view)

            val tvTitle = view.findViewById<TextView>(R.id.tvAdminPasswordTitle)
            val tvSubtitle = view.findViewById<TextView>(R.id.tvAdminPasswordSubtitle)
            val etPassword = view.findViewById<TextInputEditText>(R.id.etAdminPassword)
            val btnCancel = view.findViewById<Button>(R.id.btnCancelPassword)
            val btnConfirm = view.findViewById<Button>(R.id.btnConfirmPassword)

            tvTitle?.text = title
            tvSubtitle?.text = subtitle
            btnConfirm.text = actionButtonText

            btnCancel.setOnClickListener { dialog.dismiss() }
            btnConfirm.setOnClickListener {
                val entered = etPassword.text?.toString().orEmpty().trim()
                if (configStore.verifyPin(entered)) {
                    dialog.dismiss()
                    onSuccess()
                } else {
                    Toast.makeText(this, "رمز الأدمن غير صحيح.", Toast.LENGTH_SHORT).show()
                    etPassword.setText("")
                }
            }

            dialog.show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing admin password dialog", e)
        }
    }

    private fun showChangePasswordDialog() {
        if (isFinishing || isDestroyed) return
        try {
            val dialog = Dialog(this, R.style.Theme_NexusDPC)
            val view = LayoutInflater.from(this).inflate(R.layout.dialog_change_password, null)
            dialog.setContentView(view)

            val etNewPin = view.findViewById<TextInputEditText>(R.id.etNewPin)
            val btnCancel = view.findViewById<Button>(R.id.btnCancelChangePin)
            val btnSave = view.findViewById<Button>(R.id.btnSaveNewPin)

            btnCancel.setOnClickListener { dialog.dismiss() }
            btnSave.setOnClickListener {
                val pin = etNewPin.text?.toString().orEmpty().trim()
                if (pin.length in 4..8) {
                    configStore.updatePin(pin)
                    dialog.dismiss()
                    Toast.makeText(this, "تم تحديث رمز الأدمن بنجاح.", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "يجب أن يتكون الرمز من 4 إلى 8 أرقام.", Toast.LENGTH_SHORT).show()
                }
            }

            dialog.show()
        } catch (e: Exception) {
            AppLogger.e("MainActivity", "Failed showing change password dialog", e)
        }
    }

    fun dispatchWindowTap(xRatio: Float, yRatio: Float) {
        runOnUiThread {
            try {
                val decor = window?.decorView ?: return@runOnUiThread
                val w = decor.width.toFloat()
                val h = decor.height.toFloat()
                if (w <= 0f || h <= 0f) return@runOnUiThread

                val pxX = (xRatio * w).coerceIn(0f, w)
                val pxY = (yRatio * h).coerceIn(0f, h)

                val now = android.os.SystemClock.uptimeMillis()
                val down = android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, pxX, pxY, 0)
                val up = android.view.MotionEvent.obtain(now, now + 50, android.view.MotionEvent.ACTION_UP, pxX, pxY, 0)

                decor.dispatchTouchEvent(down)
                decor.dispatchTouchEvent(up)
                down.recycle()
                up.recycle()
                com.nexus.mdm.agent.util.AppLogger.i("MainActivity", "Direct in-app tap injected at ($pxX, $pxY)")
            } catch (e: Exception) {
                com.nexus.mdm.agent.util.AppLogger.w("MainActivity", "Error injecting in-app tap: ${e.message}")
            }
        }
    }
}
