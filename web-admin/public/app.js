// ==========================================================================
// Nexus Enterprise MDM - Multi-Tenant Company Console Logic
// Features: Arabic RTL / English i18n, Subscription Gate, QR Device Naming,
// Remote Control, GPS Tracking, and Remote Device Renaming.
// ==========================================================================

let currentModalAction = null;
let openDropdownDeviceId = null;
let activeTrackDeviceId = null;
let deviceMap = null;
let deviceTrackMarker = null;
let deviceGeofenceCircle = null;
let lastDevicesCache = [];
let qrcodeInstance = null;
let lastQrPayload = null;
let touchTimer = null;
let streamInterval = null;

// Multi-Tenant & Subscription State
const urlParams = new URLSearchParams(window.location.search);
let currentCompanyCode = urlParams.get('company') || localStorage.getItem('nexus_company_code') || 'NEXUS-DEFAULT';
localStorage.setItem('nexus_company_code', currentCompanyCode);
let currentTenantData = null;

// Language / i18n State (Default Arabic)
let currentLang = localStorage.getItem('nexus_lang') || 'ar';

const i18n = {
    ar: {
        brandSubtitle: "نظام إدارة الأجهزة المركزية",
        metricOnline: "أجهزة متصلة",
        metricKiosk: "في وضع الكشك",
        tabDevices: "الأسطول المدار",
        tabWhitelist: "تطبيقات الكشك",
        tabQr: "تجهيز الـ QR السريع",
        tabOta: "توزيع التطبيقات OTA",
        tabLogs: "سجلات التدقيق",
        kpiFleet: "الأجهزة المدارة",
        kpiKiosk: "حصار الكشك",
        kpiGps: "تتبع الأقمار الصناعية",
        kpiSecurity: "درع الأمان الفوري",
        thDevice: "معرّف ووسم الجهاز",
        thModel: "الموديل والنظام",
        thBattery: "البطارية",
        thVitals: "الذاكرة والتخزين",
        thIp: "عنوان الشبكة IP",
        thKiosk: "وضع الكشك",
        thStatus: "الحالة",
        thActions: "الإجراءات",
        btnRemoteControl: "التحكم المباشر",
        btnGpsTrack: "تتبع GPS",
        btnActions: "خيارات ▾",
        actRename: "إعادة تسمية الجهاز",
        actLock: "قفل الشاشة فوراً",
        actExitKiosk: "خروج من وضع الكشك",
        actEnterKiosk: "فرض وضع الكشك المحكم",
        actSiren: "إطلاق صفارة الإنذار",
        act4gOnly: "حصر الاتصال بـ 4G (قطع الواي فاي)",
        actAllowWifi: "السماح باتصالات الواي فاي",
        actReboot: "إعادة تشغيل الجهاز",
        actWipe: "فرمتة ومسح الجهاز نهائياً",
        emptyFleet: "لا توجد أجهزة متصلة تابعة لهذه الشركة حالياً.",
        qrTitle: "تجهيز الأجهزة الجديد أو المفرمتة عبر كود الـ QR",
        qrDesc: "تحويل أي جهاز أندرويد مفرمت أو جديد إلى جهاز مخصص للشركة دون إدخال حسابات جوجل.",
        lblQrDeviceTag: "اسم / وسم الجهاز (Device Name / Tag) *",
        descQrDeviceTag: "يتم تثبيت هذا الاسم تلقائياً في الجهاز عند مسح كود الـ QR بعد الفرمتة.",
        lblQrCompany: "الشركة التابعة للجهاز (Assigned Company)",
        descQrCompany: "سيتم ربط الجهاز باشتراك هذه الشركة تلقائياً فور التجهيز.",
        btnRegenQr: "تحديث وتوليد كود الـ QR",
        btnCopyJson: "نسخ حزمة JSON",
        qrStepsTitle: "خطوات تجهيز الهاتف بعد الفرمتة:",
        step1: "قم بتشغيل الهاتف الجديد أو المفرمت حديثاً.",
        step2: "في شاشة الترحيب الأولى (Welcome / مرحباً)، انقر 6 نقرات سريعة في أي مكان على الشاشة.",
        step3: "ستفتح كاميرا الأندرويد المخصصة للتجهيز السريع تلقائياً.",
        step4: "وجّه الكاميرا نحو كود الـ QR المعروض على الشاشة.",
        step5: "سيقوم الهاتف بتحميل النظام تلقائياً، وتثبيت الاسم المحدد، وقفل الكشك!",
        subLockTitle: "اشتراك الشركة غير مفعّل",
        subLockDesc: "عذراً! لوحة تحكم وإدارة أجهزة Nexus معطّلة حالياً لأن اشتراك هذه الشركة غير مفعّل أو انتهت فترة صلاحيته من قِبل المطور.",
        btnWhatsApp: "تواصل مع المطور عبر واتساب لتفعيل الاشتراك",
        btnCall: "الاتصال هاتفياً بالمطور",
        btnRecheck: "إعادة فحص حالة التفعيل الآن",
        toastCopied: "تم نسخ حزمة كود الـ QR بنجاح!",
        langSwitchBtn: "English",
        logoutBtnLabel: "تسجيل الخروج",
        loginCardSubtitle: "بوابة إدارة الأجهزة المركزية والأسطول المؤسسي",
        lblLoginEmail: "البريد الإلكتروني للشركة أو كود الشركة",
        lblLoginPassword: "كلمة المرور",
        loginSubmitBtnLabel: "تسجيل الدخول",
        loginFooterNote: "إذا لم يكن لديك حساب، يرجى التواصل مع مزود الخدمة لإنشاء حساب شركتك وتفعيل الاشتراك.",
        btnSyncTime: "مزامنة الوقت والتاريخ",
        actSyncTime: "مزامنة الوقت والتاريخ"
    },
    en: {
        brandSubtitle: "Enterprise Device Policy Controller",
        metricOnline: "Devices Online",
        metricKiosk: "in Kiosk Mode",
        tabDevices: "Managed Fleet",
        tabWhitelist: "Kiosk App Whitelist",
        tabQr: "Zero-Touch QR Provisioning",
        tabOta: "OTA App Distribution",
        tabLogs: "Live Audit Logs",
        kpiFleet: "Managed Hardware",
        kpiKiosk: "Kiosk Confinement",
        kpiGps: "GPS Sentinel",
        kpiSecurity: "Security Shield",
        thDevice: "Device Name & Identifier",
        thModel: "Model & OS",
        thBattery: "Battery",
        thVitals: "RAM & Storage",
        thIp: "IP Address",
        thKiosk: "Kiosk Mode",
        thStatus: "Status",
        thActions: "Actions",
        btnRemoteControl: "Remote Control",
        btnGpsTrack: "GPS Track",
        btnActions: "Actions ▾",
        actRename: "Rename Device",
        actLock: "Lock Screen",
        actExitKiosk: "Exit Kiosk Mode",
        actEnterKiosk: "Force Kiosk Lockdown",
        actSiren: "Sound Security Siren",
        act4gOnly: "Enforce 4G Data Only",
        actAllowWifi: "Allow Wi-Fi Connections",
        actReboot: "Soft Reboot Device",
        actWipe: "Factory Reset / Wipe Device",
        emptyFleet: "No devices currently connected for this company.",
        qrTitle: "Zero-Touch Android Enterprise QR Provisioning",
        qrDesc: "Instantly turn any fresh or factory-reset Android device into a dedicated Nexus Kiosk appliance without entering Google accounts.",
        lblQrDeviceTag: "Device Name / Tag *",
        descQrDeviceTag: "This custom name will be automatically assigned to the phone upon scanning.",
        lblQrCompany: "Assigned Company",
        descQrCompany: "Device will be bound to this company subscription automatically.",
        btnRegenQr: "Regenerate QR Code",
        btnCopyJson: "Copy JSON Payload",
        qrStepsTitle: "How to Enroll Fresh / Factory Reset Phone:",
        step1: "Turn on new or freshly factory-reset Android device.",
        step2: "At the first Welcome screen, tap 6 times rapidly anywhere on the screen.",
        step3: "The phone's enterprise QR camera will automatically activate.",
        step4: "Point the camera at this QR code on your screen.",
        step5: "The phone will download Nexus, apply the assigned name, and launch Kiosk!",
        subLockTitle: "Company Subscription Inactive",
        subLockDesc: "Nexus MDM console is currently suspended because this company subscription is inactive or expired. Please contact the developer.",
        btnWhatsApp: "Contact Developer via WhatsApp to Activate",
        btnCall: "Call Developer",
        btnRecheck: "Re-check Subscription Status",
        toastCopied: "QR Code Android Enterprise JSON copied to clipboard!",
        langSwitchBtn: "العربية",
        logoutBtnLabel: "Sign Out",
        loginCardSubtitle: "Centralized Enterprise Fleet Management Portal",
        lblLoginEmail: "Company Email or Company Code",
        lblLoginPassword: "Password",
        loginSubmitBtnLabel: "Sign In",
        loginFooterNote: "If you do not have an enterprise account, please contact your service provider.",
        btnSyncTime: "Sync Time & Date",
        actSyncTime: "Sync Time & Date"
    }
};

// --------------------------------------------------------------------------
// TOAST NOTIFICATIONS
// --------------------------------------------------------------------------
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.25s ease-out forwards';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}

// --------------------------------------------------------------------------
// LANGUAGE / I18N SYSTEM
// --------------------------------------------------------------------------
function toggleLanguage() {
    currentLang = (currentLang === 'ar') ? 'en' : 'ar';
    localStorage.setItem('nexus_lang', currentLang);
    applyLanguage();
}

function applyLanguage() {
    const t = i18n[currentLang];
    const isRtl = currentLang === 'ar';

    document.documentElement.lang = currentLang;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    if (isRtl) {
        document.body.classList.add('rtl-mode');
    } else {
        document.body.classList.remove('rtl-mode');
    }

    // Toggle button text (Pure text, no icons)
    const btnLang = document.getElementById('btnLangToggle');
    if (btnLang) {
        btnLang.innerHTML = `<span>${isRtl ? 'English' : 'العربية'}</span>`;
    }

    // Navigation Tabs
    const tabDevices = document.querySelector('.nav-tab[data-tab="devices"]');
    if (tabDevices) tabDevices.innerText = t.tabDevices;

    const tabWhitelist = document.querySelector('.nav-tab[data-tab="whitelist"]');
    if (tabWhitelist) tabWhitelist.innerText = t.tabWhitelist;

    const tabQr = document.querySelector('.nav-tab[data-tab="qr"]');
    if (tabQr) {
        tabQr.innerText = t.tabQr;
    }

    const tabOta = document.querySelector('.nav-tab[data-tab="ota"]');
    if (tabOta) tabOta.innerText = t.tabOta;

    const tabLogs = document.querySelector('.nav-tab[data-tab="logs"]');
    if (tabLogs) tabLogs.innerText = t.tabLogs;

    // QR Tab Labels
    const lblDeviceTag = document.getElementById('lblQrDeviceTag');
    if (lblDeviceTag) lblDeviceTag.innerText = t.lblQrDeviceTag;
    const descDeviceTag = document.getElementById('descQrDeviceTag');
    if (descDeviceTag) descDeviceTag.innerText = t.descQrDeviceTag;

    const lblCompany = document.getElementById('lblQrCompany');
    if (lblCompany) lblCompany.innerText = t.lblQrCompany;

    // Company Login & Header Controls Labels
    const logoutBtn = document.getElementById('logoutBtnLabel');
    if (logoutBtn) logoutBtn.innerText = t.logoutBtnLabel;

    const loginCardSubtitle = document.getElementById('loginCardSubtitle');
    if (loginCardSubtitle) loginCardSubtitle.innerText = t.loginCardSubtitle;

    const lblLoginEmail = document.getElementById('lblLoginEmail');
    if (lblLoginEmail) lblLoginEmail.innerText = t.lblLoginEmail;

    const lblLoginPassword = document.getElementById('lblLoginPassword');
    if (lblLoginPassword) lblLoginPassword.innerText = t.lblLoginPassword;

    const loginSubmitBtnLabel = document.getElementById('loginSubmitBtnLabel');
    if (loginSubmitBtnLabel) loginSubmitBtnLabel.innerText = t.loginSubmitBtnLabel;

    const loginFooterNote = document.getElementById('loginFooterNote');
    if (loginFooterNote) loginFooterNote.innerText = t.loginFooterNote;

    // Fleet Section Header & Actions
    const fleetTitle = document.getElementById('fleetSectionTitle');
    if (fleetTitle) fleetTitle.innerText = isRtl ? 'الأسطول المدار المركزي' : 'Centralized Managed Fleet';

    const fleetDesc = document.getElementById('fleetSectionDesc');
    if (fleetDesc) fleetDesc.innerText = isRtl ? 'الحالة المباشرة، قياسات الأداء اللحظية، والتحكم الإداري الفوري عن بُعد.' : 'Live telemetry vitals, real-time status, and instantaneous remote administration.';

    const btnRefresh = document.getElementById('btnRefreshFleet');
    if (btnRefresh) btnRefresh.innerText = isRtl ? 'تحديث الأسطول' : 'Refresh Fleet';

    const btnSyncTimeLabel = document.getElementById('btnSyncTimeLabel');
    if (btnSyncTimeLabel) btnSyncTimeLabel.innerText = t.btnSyncTime;

    const autoSyncBadge = document.getElementById('autoSyncBadge');
    if (autoSyncBadge) autoSyncBadge.innerText = isRtl ? 'مزامنة حية 3 ثوانٍ' : 'Auto-Sync 3s';

    // KPI Titles
    const kpiFleetTitle = document.getElementById('kpiFleetTitle');
    if (kpiFleetTitle) kpiFleetTitle.innerText = t.kpiFleet;

    const kpiKioskTitle = document.getElementById('kpiKioskTitle');
    if (kpiKioskTitle) kpiKioskTitle.innerText = t.kpiKiosk;

    const kpiGpsTitle = document.getElementById('kpiGpsTitle');
    if (kpiGpsTitle) kpiGpsTitle.innerText = t.kpiGps;

    const kpiSecTitle = document.getElementById('kpiSecTitle');
    if (kpiSecTitle) kpiSecTitle.innerText = t.kpiSecurity;

    // Table Column Headers
    const thColDevice = document.getElementById('thColDevice');
    if (thColDevice) thColDevice.innerText = t.thDevice;

    const thColModel = document.getElementById('thColModel');
    if (thColModel) thColModel.innerText = t.thModel;

    const thColBattery = document.getElementById('thColBattery');
    if (thColBattery) thColBattery.innerText = t.thBattery;

    const thColVitals = document.getElementById('thColVitals');
    if (thColVitals) thColVitals.innerText = t.thVitals;

    const thColIp = document.getElementById('thColIp');
    if (thColIp) thColIp.innerText = t.thIp;

    const thColKiosk = document.getElementById('thColKiosk');
    if (thColKiosk) thColKiosk.innerText = t.thKiosk;

    const thColStatus = document.getElementById('thColStatus');
    if (thColStatus) thColStatus.innerText = t.thStatus;

    const thColActions = document.getElementById('thColActions');
    if (thColActions) thColActions.innerText = t.thActions;

    // Re-render device table and metrics to refresh language
    updateHeaderMetrics(lastDevicesCache);
    renderDeviceTable(lastDevicesCache);
}

// --------------------------------------------------------------------------
// TAB NAVIGATION
// --------------------------------------------------------------------------
function showTab(tabId, btnElement = null) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

    const tabEl = document.getElementById(`tab-${tabId}`);
    if (tabEl) tabEl.classList.add('active');

    const targetBtn = btnElement || document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    } else if (window.event && window.event.target) {
        const closestBtn = window.event.target.closest('.nav-tab');
        if (closestBtn) closestBtn.classList.add('active');
    }

    if (tabId === 'devices') fetchDevices();
    if (tabId === 'logs') fetchLogs();
    if (tabId === 'qr') initQrTab();
    if (tabId === 'branches') fetchBranches();
    if (tabId === 'whitelist') initWhitelistView();
}

// --------------------------------------------------------------------------
// SUBSCRIPTION VERIFICATION GATE
// --------------------------------------------------------------------------
async function checkCurrentCompanySubscription() {
    try {
        const res = await fetch(`/api/tenant/info?companyCode=${encodeURIComponent(currentCompanyCode)}`, {
            headers: { 'X-Tenant-Token': currentTenantToken || '' }
        });
        if (res.status === 401) {
            handleCompanyLogout();
            return false;
        }
        const data = await res.json();

        if (data.success && data.tenant) {
            currentTenantData = data.tenant;
            const t = currentTenantData;

            // Update Header Company Name
            const nameEl = document.getElementById('currentCompanyNameDisplay');
            if (nameEl) {
                if (t.isBranch) {
                    nameEl.innerText = `${t.name} - فرع: ${t.branchName} [ويب فرعي]`;
                } else {
                    nameEl.innerText = `${t.name} (${t.code})`;
                }
            }

            // If user is a branch admin, hide branches management tab!
            const branchTabNav = document.getElementById('tabNavBranches');
            if (branchTabNav) {
                if (t.isBranch) {
                    branchTabNav.style.display = 'none';
                    const tabBranches = document.getElementById('tab-branches');
                    if (tabBranches && tabBranches.classList.contains('active')) {
                        showTab('devices');
                    }
                } else {
                    branchTabNav.style.display = 'inline-block';
                }
            }

            const isSubActive = t.isActive;
            const lockOverlay = document.getElementById('companySubLockOverlay');

            if (!isSubActive) {
                // LOCK SCREEN OUT: Subscription not activated by developer!
                lockOverlay.style.display = 'flex';
                document.getElementById('lockCompanyName').innerText = t.name;
                document.getElementById('lockCompanyCode').innerText = t.code;
                document.getElementById('lockCompanyStatus').innerText = t.subscription?.status || 'معلّق';
                document.getElementById('lockCompanyExpiry').innerText = t.subscription?.expiryDate || 'غير محدد';
                document.getElementById('lockDesc').innerText = t.statusMessage || 'الاشتراك غير مفعّل أو انتهت فترة صلاحيته من قِبل المطور.';

                // Setup WhatsApp contact
                const devContact = t.developerContact || {};
                const whatsapp = devContact.supportWhatsApp || '9647700000000';
                const phone = devContact.supportPhone || '+9647700000000';
                const msg = encodeURIComponent(`مرحباً مطور Nexus، أود تفعيل أو تجديد اشتراك شركتنا: ${t.name} (كود: ${t.code})`);

                document.getElementById('btnWhatsAppDev').href = `https://wa.me/${whatsapp}?text=${msg}`;
                document.getElementById('btnCallDev').href = `tel:${phone}`;
                return false;
            } else {
                // Subscription is ACTIVE!
                lockOverlay.style.display = 'none';
                return true;
            }
        }
    } catch (e) {
        console.error('Subscription verification failed', e);
    }
    return true;
}

function applyScreensPermissions(screens) {
    // No-op: all standard screens are available for subscribed companies
}

// --------------------------------------------------------------------------
// FLEET DEVICES
// --------------------------------------------------------------------------
async function fetchDevices() {
    try {
        const res = await fetch(`/api/devices?companyCode=${encodeURIComponent(currentCompanyCode)}`);
        const devices = await res.json();
        lastDevicesCache = devices;

        const currentOpenDropdown = openDropdownDeviceId ? document.getElementById(`dropdown-${openDropdownDeviceId}`) : null;
        if (currentOpenDropdown && currentOpenDropdown.classList.contains('show')) {
            updateDeviceSelect(devices);
            updateHeaderMetrics(devices);
            if (activeTrackDeviceId) updateDeviceTrackModal(activeTrackDeviceId);
            return;
        }

        renderDeviceTable(devices);
        updateDeviceSelect(devices);
        updateHeaderMetrics(devices);

        if (activeTrackDeviceId) {
            updateDeviceTrackModal(activeTrackDeviceId);
        }
    } catch (e) {
        console.error('Failed to fetch devices', e);
    }
}

function updateHeaderMetrics(devices) {
    const safeDevices = devices || [];
    const t = i18n[currentLang];
    const isRtl = currentLang === 'ar';
    const totalCount = safeDevices.length;
    const onlineCount = safeDevices.filter(d => d.isOnline).length;
    const kioskCount = safeDevices.filter(d => d.isKiosk).length;
    const hasLocation = safeDevices.some(d => d.location && d.location.lat);

    const mOnline = document.getElementById('metricOnline');
    if (mOnline) mOnline.innerText = `${onlineCount} ${t.metricOnline}`;
    const mKiosk = document.getElementById('metricKiosk');
    if (mKiosk) mKiosk.innerText = `${kioskCount} ${t.metricKiosk}`;

    const kpiFleet = document.getElementById('kpiFleetCount');
    if (kpiFleet) kpiFleet.innerText = isRtl ? `${totalCount} نشط` : `${totalCount} Active`;

    const kpiFleetSub = document.getElementById('kpiFleetSub');
    if (kpiFleetSub) {
        const percent = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 100;
        kpiFleetSub.innerText = `${percent}% ${isRtl ? 'متصل' : 'Online'}`;
    }

    const kpiKiosk = document.getElementById('kpiKioskCount');
    if (kpiKiosk) kpiKiosk.innerText = isRtl ? `${kioskCount} مقيد` : `${kioskCount} Locked`;

    const kpiGps = document.getElementById('kpiGpsStatus');
    if (kpiGps) kpiGps.innerText = hasLocation ? (isRtl ? 'إشارة مؤكدة' : 'Signal Locked') : (isRtl ? 'جاهز للرصد' : 'Standby Fix');

    const kpiSec = document.getElementById('kpiSecurityStatus');
    if (kpiSec) kpiSec.innerText = isRtl ? '0 تهديدات' : '0 Threats';
}

function renderDeviceTable(devices) {
    const tbody = document.getElementById('deviceTableBody');
    const t = i18n[currentLang];
    const isRtl = currentLang === 'ar';
    if (!devices || devices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 48px 24px; text-align: center; color: #64748B;">
                    <div style="font-size: 15px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">
                        ${isRtl ? 'لا توجد أجهزة متصلة تابعة لهذه الشركة حالياً' : 'No devices connected for this company yet'}
                    </div>
                    <div style="font-size: 13px; max-width: 520px; margin: 0 auto; line-height: 1.6; color: #64748B;">
                        ${isRtl ? 'لتسجيل هاتف جديد في هذا الأسطول، انتقل إلى تبويب "تجهيز الـ QR السريع" وقم بمسح الكود بكاميرا الهاتف بعد الفرمتة.' : 'To enroll a device into this fleet, navigate to "Zero-Touch QR Provisioning" tab and scan the QR code with the fresh device.'}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const allowScreenControl = true;
    const allowGps = true;
    const allowWipe = true;

    tbody.innerHTML = devices.map(d => {
        const onlineTag = d.isOnline
            ? '<span class="status-tag tag-online"><span class="dot online"></span> Online</span>'
            : '<span class="status-tag tag-offline"><span class="dot" style="background:#94A3B8;"></span> Offline</span>';

        const kioskTag = d.isKiosk
            ? '<span class="status-tag tag-kiosk-active">Locked</span>'
            : '<span class="status-tag tag-kiosk-idle">Unrestricted</span>';

        const batteryColor = (d.battery > 50) ? '#10B981' : (d.battery > 20 ? '#F59E0B' : '#EF4444');

        return `
            <tr>
                <td>
                    <div>
                        <strong style="color:#0F172A; font-size:14px;">${escapeHtml(d.name || d.id)}</strong><br>
                        <small style="color:#64748B; font-family:monospace; font-size:11px;">${escapeHtml(d.id)}</small>
                    </div>
                </td>
                <td>
                    <strong style="color:#1E293B;">${escapeHtml(d.model || 'Unknown')}</strong><br>
                    <small style="color:#64748B;">Android ${escapeHtml(d.os || '')}</small>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <strong style="color:#0F172A;">${d.battery || 0}%</strong>
                        ${d.isCharging ? '<span style="color:#D97706; font-size:11px; font-weight:700;">(Charging)</span>' : ''}
                    </div>
                    <div style="width:70px; height:4px; background:#E2E8F0; margin:4px 0; overflow:hidden;">
                        <div style="width:${d.battery || 0}%; height:100%; background:${batteryColor};"></div>
                    </div>
                    <small style="color:#64748B;">${d.temperature || 0}°C</small>
                </td>
                <td>
                    <div style="font-size:12px; color:#334155;">
                        <span>RAM: <b>${d.ramUsedPercent || 0}%</b></span><br>
                        <span>Disk: <b>${d.storageUsedPercent || 0}%</b></span>
                    </div>
                </td>
                <td>
                    <code style="background:#F1F5F9; padding:3px 6px; font-size:11.5px; color:#334155;">${escapeHtml(d.ipAddress || 'Unknown')}</code>
                </td>
                <td>${kioskTag}</td>
                <td>${onlineTag}</td>
                <td>
                    <div class="actions-cell">
                        ${allowScreenControl ? `
                            <button class="btn-action btn-screen" onclick="openScreenStream('${d.id}', '${escapeHtml(d.name || d.id)}')">
                                <span>${t.btnRemoteControl}</span>
                            </button>
                        ` : ''}

                        ${allowGps ? `
                            <button class="btn-action btn-track" onclick="openDeviceTrackModal('${d.id}', '${escapeHtml(d.name || d.id)}')">
                                <span>${t.btnGpsTrack}</span>
                            </button>
                        ` : ''}

                        <div class="action-dropdown">
                            <button class="btn-action btn-more" onclick="toggleDropdown(event, '${d.id}')">
                                <span>${t.btnActions}</span>
                            </button>
                            <div id="dropdown-${d.id}" class="dropdown-menu">
                                <button class="dropdown-item" onclick="openAdminRenameModal('${d.id}', '${escapeHtml(d.name || '')}')">
                                    <span>${t.actRename}</span>
                                </button>
                                <button class="dropdown-item" onclick="syncFleetTime('${d.id}')">
                                    <span>${t.actSyncTime}</span>
                                </button>

                                <div class="dropdown-divider"></div>
                                <div class="dropdown-group-label">Kiosk & Security</div>

                                <button class="dropdown-item" onclick="promptCommand('${d.id}', 'LOCK_DEVICE', 'Lock Device Screen')">
                                    <span>${t.actLock}</span>
                                </button>
                                 ${d.isKiosk ? (
                currentTenantData?.isBranch ?
                    `<button class="dropdown-item" style="opacity:0.45; cursor:not-allowed;" onclick="showToast('عذراً! إلغاء وضع الكشك محصور بالإدارة العامة للشركة المركزية فقط.', 'error')" title="محظور للفروع">
                                         <span>${t.actExitKiosk} (محظور للفرع)</span>
                                      </button>` :
                    `<button class="dropdown-item" onclick="promptCommand('${d.id}', 'SET_KIOSK_MODE', 'Exit Kiosk Mode', { enable: false })">
                                         <span>${t.actExitKiosk}</span>
                                      </button>`
            ) : `
                                     <button class="dropdown-item" onclick="promptCommand('${d.id}', 'SET_KIOSK_MODE', 'Enter Kiosk Mode', { enable: true })">
                                         <span>${t.actEnterKiosk}</span>
                                     </button>
                                 `}
                                <button class="dropdown-item dropdown-item-warning" onclick="promptCommand('${d.id}', 'TEST_TAMPER_ALARM', 'Trigger Emergency Siren')">
                                    <span>${t.actSiren}</span>
                                </button>

                                <div class="dropdown-divider"></div>
                                <div class="dropdown-group-label">Network Policies</div>
                                <button class="dropdown-item" onclick="promptCommand('${d.id}', 'ENFORCE_CELLULAR_ONLY', 'Enforce 4G Data Only', { enabled: true })">
                                    <span>${t.act4gOnly}</span>
                                </button>
                                <button class="dropdown-item" onclick="promptCommand('${d.id}', 'ENFORCE_CELLULAR_ONLY', 'Allow Wi-Fi Connectivity', { enabled: false })">
                                    <span>${t.actAllowWifi}</span>
                                </button>

                                <div class="dropdown-divider"></div>
                                <div class="dropdown-group-label">System</div>
                                <button class="dropdown-item" onclick="promptCommand('${d.id}', 'REBOOT', 'Reboot Device')">
                                    <span>${t.actReboot}</span>
                                </button>
                                ${allowWipe ? `
                                    <button class="dropdown-item dropdown-item-danger" onclick="promptCommand('${d.id}', 'WIPE_DEVICE', 'Wipe & Factory Reset Device')">
                                        <span>${t.actWipe}</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateDeviceSelect(devices) {
    const selects = [
        document.getElementById('targetDeviceSelect'),
        document.getElementById('whitelistDeviceSelect')
    ];
    selects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        let html = `<option value="ALL">جميع أجهزة الأسطول (All Fleet Devices - Broadcast)</option>`;
        if (devices && Array.isArray(devices)) {
            devices.forEach(d => {
                html += `<option value="${d.id}">${escapeHtml(d.name || d.id)} (${escapeHtml(d.model || 'Android')})</option>`;
            });
        }
        select.innerHTML = html;
        if (devices && (devices.some(d => d.id === currentVal) || currentVal === 'ALL')) {
            select.value = currentVal;
        }
    });
}

// --------------------------------------------------------------------------
// DEVICE RENAMING
// --------------------------------------------------------------------------
function openAdminRenameModal(deviceId, currentName) {
    document.getElementById('adminRenameDeviceId').value = deviceId;
    document.getElementById('adminRenameInput').value = currentName || '';
    document.getElementById('companyRenameModal').style.display = 'flex';
}

function closeRenameModal() {
    document.getElementById('companyRenameModal').style.display = 'none';
}

async function confirmDeviceRename() {
    const deviceId = document.getElementById('adminRenameDeviceId').value;
    const newName = document.getElementById('adminRenameInput').value.trim();
    if (!deviceId || !newName) return;

    try {
        const res = await fetch('/api/devices/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, newName })
        });
        const data = await res.json();
        if (data.success) {
            closeRenameModal();
            showToast(`تمت إعادة تسمية الجهاز إلى '${newName}' بنجاح!`, 'success');
            fetchDevices();
        } else {
            showToast(data.error || 'فشل تغيير اسم الجهاز', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
}

// --------------------------------------------------------------------------
// ZERO-TOUCH QR PROVISIONING (With Device Naming & Company Code)
// --------------------------------------------------------------------------
async function initQrTab() {
    try {
        const res = await fetch('/api/qr-config');
        const cfg = await res.json();
        if (cfg) {
            document.getElementById('qrDownloadUrl').value = cfg.defaultDownloadUrl;
            document.getElementById('qrServerUrl').value = cfg.defaultServerUrl;
            document.getElementById('qrApkChecksum').value = cfg.apkChecksum;

            // Populate Company Selection Dropdown
            const compSelect = document.getElementById('qrCompanySelect');
            if (compSelect && cfg.companies) {
                let optionsHtml = '';
                cfg.companies.forEach(c => {
                    const isSelected = (c.code === currentCompanyCode) ? 'selected' : '';
                    optionsHtml += `<option value="${c.code}" ${isSelected}>${c.name} (${c.code})</option>`;
                });
                compSelect.innerHTML = optionsHtml;
            }
        }
    } catch (e) {
        console.error('Failed to fetch QR config', e);
    }
    generateQrCode();
}

function onQrCompanyChange() {
    generateQrCode();
}

function generateQrCode() {
    const downloadUrl = document.getElementById('qrDownloadUrl').value.trim();
    const serverUrl = document.getElementById('qrServerUrl').value.trim();
    const checksum = document.getElementById('qrApkChecksum').value.trim();
    const wifiSsid = document.getElementById('qrWifiSsid').value.trim();
    const wifiPassword = document.getElementById('qrWifiPassword').value.trim();

    // Read the user-defined device name and selected company code!
    const deviceTagInput = document.getElementById('qrDeviceTag');
    const deviceTag = deviceTagInput ? deviceTagInput.value.trim() || 'POS-TERMINAL-01' : 'POS-TERMINAL-01';

    const companySelect = document.getElementById('qrCompanySelect');
    const companyCode = companySelect ? companySelect.value || currentCompanyCode : currentCompanyCode;

    const payload = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": downloadUrl,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": checksum,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
            "server_url": serverUrl,
            "device_tag": deviceTag,
            "company_code": companyCode
        }
    };

    if (wifiSsid) {
        payload["android.app.extra.PROVISIONING_WIFI_SSID"] = wifiSsid;
        payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = wifiPassword ? "WPA" : "NONE";
        if (wifiPassword) {
            payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = wifiPassword;
        }
    }

    lastQrPayload = payload;
    const jsonStr = JSON.stringify(payload);
    const canvas = document.getElementById('qrcodeCanvas');
    canvas.innerHTML = '';

    try {
        if (typeof QRCode !== 'undefined') {
            qrcodeInstance = new QRCode(canvas, {
                text: jsonStr,
                width: 220,
                height: 220,
                colorDark: "#0F172A",
                colorLight: "#FFFFFF",
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            canvas.innerText = 'QR Library loading... Click Regenerate';
        }
    } catch (e) {
        console.error('QR rendering error', e);
    }
}

function copyQrJson() {
    if (!lastQrPayload) generateQrCode();
    const formatted = JSON.stringify(lastQrPayload, null, 2);
    navigator.clipboard.writeText(formatted).then(() => {
        const t = i18n[currentLang];
        showToast(t.toastCopied, 'success');
    }).catch(() => {
        prompt('Copy this JSON:', formatted);
    });
}

// --------------------------------------------------------------------------
// DROPDOWN MENU MANAGEMENT
// --------------------------------------------------------------------------
function toggleDropdown(event, deviceId) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const button = event ? (event.currentTarget || (event.target ? event.target.closest('button') : null)) : null;
    const dropdown = document.getElementById(`dropdown-${deviceId}`);
    const isAlreadyOpen = dropdown && dropdown.classList.contains('show');

    document.querySelectorAll('.dropdown-menu').forEach(el => {
        el.classList.remove('show');
        el.style.display = 'none';
    });

    if (dropdown && !isAlreadyOpen) {
        if (button) {
            const rect = button.getBoundingClientRect();
            const isRtl = document.body.classList.contains('rtl-mode');
            const menuWidth = 240;
            const menuHeight = 360;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            dropdown.style.position = 'fixed';
            dropdown.style.zIndex = '999999';

            if (spaceBelow < 280 && spaceAbove > spaceBelow) {
                dropdown.style.top = 'auto';
                dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
                dropdown.style.maxHeight = `${Math.min(menuHeight, spaceAbove - 16)}px`;
            } else {
                dropdown.style.top = `${rect.bottom + 4}px`;
                dropdown.style.bottom = 'auto';
                dropdown.style.maxHeight = `${Math.min(menuHeight, spaceBelow - 16)}px`;
            }

            if (isRtl) {
                const rightPos = window.innerWidth - rect.right;
                if (rect.right - menuWidth < 10) {
                    dropdown.style.left = '10px';
                    dropdown.style.right = 'auto';
                } else {
                    dropdown.style.right = `${Math.max(10, rightPos)}px`;
                    dropdown.style.left = 'auto';
                }
            } else {
                if (rect.left + menuWidth > window.innerWidth - 10) {
                    dropdown.style.left = `${window.innerWidth - menuWidth - 10}px`;
                    dropdown.style.right = 'auto';
                } else {
                    dropdown.style.left = `${Math.max(10, rect.left)}px`;
                    dropdown.style.right = 'auto';
                }
            }
        }
        dropdown.classList.add('show');
        dropdown.style.display = 'flex';
        openDropdownDeviceId = deviceId;
    } else {
        openDropdownDeviceId = null;
    }
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.action-dropdown') || e.target.closest('.dropdown-menu')) return;
    document.querySelectorAll('.dropdown-menu').forEach(el => {
        el.classList.remove('show');
        el.style.display = 'none';
    });
    openDropdownDeviceId = null;
});

window.addEventListener('scroll', () => {
    if (openDropdownDeviceId) {
        document.querySelectorAll('.dropdown-menu').forEach(el => {
            el.classList.remove('show');
            el.style.display = 'none';
        });
        openDropdownDeviceId = null;
    }
}, { passive: true });

// --------------------------------------------------------------------------
// KIOSK APP WHITELIST CONTROLLER
// --------------------------------------------------------------------------
let currentWhitelistPackages = [
    "com.sec.android.app.popupcalculator",
    "com.google.android.calculator",
    "com.android.chrome",
    "com.sec.android.app.camera"
];

const PRESET_APP_LABELS = {
    "com.sec.android.app.popupcalculator": "حاسبة سامسونج (Samsung Calc)",
    "com.google.android.calculator": "حاسبة جوجل (Google Calc)",
    "com.android.chrome": "متصفح كروم (Google Chrome)",
    "com.sec.android.app.camera": "كاميرا سامسونج (Camera)",
    "com.google.android.apps.photos": "صور جوجل (Google Photos)",
    "com.whatsapp": "واتساب (WhatsApp)"
};

function initWhitelistView() {
    renderWhitelistTags();
    updateDeviceSelect(lastDevicesCache || []);
}

function onWhitelistDeviceChanged() {
    const select = document.getElementById('whitelistDeviceSelect');
    if (!select) return;
    const devId = select.value;
    if (devId !== 'ALL' && lastDevicesCache) {
        const dev = lastDevicesCache.find(d => d.id === devId);
        if (dev && Array.isArray(dev.whitelistedApps) && dev.whitelistedApps.length > 0) {
            currentWhitelistPackages = [...dev.whitelistedApps];
        }
    }
    renderWhitelistTags();
}

function addPreset(pkg) {
    if (!pkg) return;
    if (!currentWhitelistPackages.includes(pkg)) {
        currentWhitelistPackages.push(pkg);
        renderWhitelistTags();
        showToast(`تمت إضافة ${PRESET_APP_LABELS[pkg] || pkg} إلى قائمة الكشك`, 'info');
    } else {
        showToast('هذا التطبيق موجود بالفعل في القائمة المسموحة', 'warning');
    }
}

function addCustomPackage() {
    const input = document.getElementById('customPackageInput');
    if (!input) return;
    const pkg = input.value.trim();
    if (!pkg) {
        showToast('يرجى كتابة اسم حزمة التطبيق مثل com.android.chrome', 'warning');
        return;
    }
    if (!pkg.includes('.') || pkg.length < 3) {
        showToast('اسم الحزمة يجب أن يحتوي على نقطة مثل com.company.app', 'warning');
        return;
    }
    if (!currentWhitelistPackages.includes(pkg)) {
        currentWhitelistPackages.push(pkg);
        input.value = '';
        renderWhitelistTags();
        showToast(`تمت إضافة ${pkg} بنجاح`, 'info');
    } else {
        showToast('هذا التطبيق مضاف مسبقاً', 'warning');
    }
}

function removeWhitelistTag(pkg) {
    currentWhitelistPackages = currentWhitelistPackages.filter(p => p !== pkg);
    renderWhitelistTags();
}

function clearWhitelistTags() {
    if (confirm('هل أنت متأكد من مسح جميع التطبيقات من القائمة المسموحة؟')) {
        currentWhitelistPackages = [];
        renderWhitelistTags();
    }
}

function renderWhitelistTags() {
    const container = document.getElementById('whitelistTagsContainer');
    if (!container) return;

    if (currentWhitelistPackages.length === 0) {
        container.innerHTML = `
            <div style="width: 100%; padding: 18px; text-align: center; color: #94A3B8; font-size: 13px; border: 1px dashed #CBD5E1; border-radius: 8px;">
                لم يتم تعيين أي تطبيقات حتى الآن. انقر على الحزم السريعة المقترحة أعلاه أو اكتب اسم حزمة تطبيق مخصص.
            </div>
        `;
        return;
    }

    container.innerHTML = currentWhitelistPackages.map(pkg => {
        const label = PRESET_APP_LABELS[pkg] || pkg;
        return `
            <div class="whitelist-tag-chip" style="display: inline-flex; align-items: center; gap: 8px; background: #EFF6FF; border: 1px solid #BFDBFE; color: #1E40AF; padding: 6px 12px; border-radius: 20px; font-size: 12.5px; font-weight: 600; margin: 4px;">
                <span>${escapeHtml(label)}</span>
                <span style="font-family: monospace; font-size: 10.5px; color: #3B82F6; opacity: 0.85;">(${escapeHtml(pkg)})</span>
                <button type="button" onclick="removeWhitelistTag('${escapeHtml(pkg)}')" style="background: none; border: none; color: #DC2626; cursor: pointer; font-size: 16px; line-height: 1; padding: 0 2px;" title="إزالة">&times;</button>
            </div>
        `;
    }).join('');
}

async function deployWhitelist() {
    const select = document.getElementById('whitelistDeviceSelect');
    const deviceId = select ? select.value : 'ALL';
    const statusBox = document.getElementById('whitelistStatusMessage');
    const btn = document.getElementById('btnDeployWhitelist');

    if (currentWhitelistPackages.length === 0) {
        showToast('يرجى إضافة تطبيق واحد على الأقل قبل التوزيع', 'warning');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>جاري النشر والتوزيع...</span>';
    }
    if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.className = 'status-box status-loading';
        statusBox.innerText = 'جاري إرسال وتطبيق حزم التطبيقات المسموحة على أجهزة الكشك...';
    }

    try {
        const res = await fetch('/api/commands', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({
                deviceId: deviceId,
                command: 'SET_WHITELIST',
                payload: {
                    packages: currentWhitelistPackages
                }
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`تم نشر وتفعيل ${currentWhitelistPackages.length} تطبيق بنجاح على أجهزة الكشك!`, 'success');
            if (statusBox) {
                statusBox.className = 'status-box status-success';
                statusBox.innerText = `تم النشر بنجاح! تم حفظ وتفعيل ${currentWhitelistPackages.length} تطبيق على أجهزة الكشك.`;
            }
            if (lastDevicesCache) {
                if (deviceId === 'ALL') {
                    lastDevicesCache.forEach(d => d.whitelistedApps = [...currentWhitelistPackages]);
                } else {
                    const dev = lastDevicesCache.find(d => d.id === deviceId);
                    if (dev) dev.whitelistedApps = [...currentWhitelistPackages];
                }
            }
        } else {
            throw new Error(data.error || 'فشل في نشر قائمة التطبيقات');
        }
    } catch (err) {
        showToast(`خطأ أثناء النشر: ${err.message}`, 'error');
        if (statusBox) {
            statusBox.className = 'status-box status-error';
            statusBox.innerText = `فشل الإرسال: ${err.message}`;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>توزيع وحفظ التطبيقات المسموحة للأجهزة</span>';
        }
    }
}

// --------------------------------------------------------------------------
// GPS LIVE TRACKING & GEOFENCING
// --------------------------------------------------------------------------
const customPulseMarkerIcon = L.divIcon({
    className: '',
    html: '<div style="width:16px; height:16px; background:#1E40AF; border:2px solid #FFFFFF; box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10]
});

async function openDeviceTrackModal(deviceId, deviceName) {
    activeTrackDeviceId = deviceId;
    document.getElementById('trackModalTitle').innerText = `GPS Sentinel: ${deviceName || deviceId}`;
    document.getElementById('trackModal').style.display = 'flex';

    if (!deviceMap) {
        deviceMap = L.map('deviceMap', { zoomControl: true }).setView([33.3152, 44.3661], 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: '© OpenStreetMap © CARTO'
        }).addTo(deviceMap);
    }

    setTimeout(() => {
        if (deviceMap) deviceMap.invalidateSize();
    }, 200);

    try {
        const res = await fetch('/api/geofence');
        const cfg = await res.json();
        if (cfg) {
            document.getElementById('modalGeoEnabled').checked = cfg.enabled;
            document.getElementById('modalGeoRadius').value = cfg.radiusMeters;
        }
    } catch (_) { }

    updateDeviceTrackModal(deviceId);
}

function updateDeviceTrackModal(deviceId) {
    if (!deviceMap || activeTrackDeviceId !== deviceId) return;

    const device = lastDevicesCache.find(d => d.id === deviceId);
    if (!device) return;

    const loc = device.location;
    if (loc && loc.lat && loc.lng) {
        const lat = loc.lat;
        const lng = loc.lng;

        document.getElementById('hudCoords').innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        document.getElementById('hudSpeed').innerText = `${((loc.speed || 0) * 3.6).toFixed(1)} km/h`;
        document.getElementById('hudAccuracy').innerText = `±${(loc.accuracy || 0).toFixed(0)} m`;

        const isBreached = device.geofenceBreach;
        const statusEl = document.getElementById('hudGeofenceStatus');
        if (isBreached) {
            statusEl.innerText = 'OUTSIDE SAFE ZONE';
            statusEl.className = 'hud-val status-breach';
        } else {
            statusEl.innerText = 'INSIDE SAFE ZONE';
            statusEl.className = 'hud-val status-safe';
        }

        if (deviceTrackMarker) {
            deviceTrackMarker.setLatLng([lat, lng]);
        } else {
            deviceTrackMarker = L.marker([lat, lng], { icon: customPulseMarkerIcon }).addTo(deviceMap);
        }

        deviceTrackMarker.bindPopup(`
            <div style="font-family:Cairo,Inter,sans-serif; text-align:center;">
                <strong style="color:#0F172A; font-size:13px;">${escapeHtml(device.name || device.id)}</strong><br>
                <small style="color:#64748B;">${escapeHtml(device.model || '')} • ${device.battery}% Battery</small>
            </div>
        `).openPopup();

        const radius = parseInt(document.getElementById('modalGeoRadius').value) || 3000;
        const isEnabled = document.getElementById('modalGeoEnabled').checked;

        if (deviceGeofenceCircle) {
            deviceMap.removeLayer(deviceGeofenceCircle);
            deviceGeofenceCircle = null;
        }

        if (isEnabled) {
            deviceGeofenceCircle = L.circle([lat, lng], {
                color: '#2563EB',
                fillColor: '#3B82F6',
                fillOpacity: 0.12,
                radius: radius,
                weight: 2
            }).addTo(deviceMap);
        }
        deviceMap.setView([lat, lng], 16);
    }
}

function closeDeviceTrackModal() {
    document.getElementById('trackModal').style.display = 'none';
    activeTrackDeviceId = null;
}

// --------------------------------------------------------------------------
// REMOTE CONTROL STREAM & TOUCH
// --------------------------------------------------------------------------
let activeStreamDeviceId = null;
let isPollingScreen = false;

function openScreenStream(deviceId, deviceName) {
    activeStreamDeviceId = deviceId;
    isPollingScreen = false;
    document.getElementById('screenModalTitle').innerText = `Live Remote: ${deviceName || deviceId}`;
    document.getElementById('screenModal').style.display = 'flex';
    document.getElementById('streamPlaceholder').style.display = 'flex';
    document.getElementById('streamImg').style.display = 'none';

    // Dispatch wake / start stream command
    fetch('/api/commands', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Token': currentTenantToken || ''
        },
        body: JSON.stringify({
            deviceId,
            command: 'START_SCREEN_STREAM',
            payload: { timestamp: Date.now() }
        })
    }).catch(() => { });

    if (streamInterval) clearInterval(streamInterval);
    pollScreenFrame();
    streamInterval = setInterval(pollScreenFrame, 250);
}

async function pollScreenFrame() {
    if (!activeStreamDeviceId || isPollingScreen) return;
    isPollingScreen = true;
    try {
        const res = await fetch(`/api/devices/${encodeURIComponent(activeStreamDeviceId)}/screen-frame?t=${Date.now()}`, {
            headers: { 'X-Tenant-Token': currentTenantToken || '' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.frame) {
                const img = document.getElementById('streamImg');
                img.src = `data:image/jpeg;base64,${data.frame}`;
                img.style.display = 'block';
                const placeholder = document.getElementById('streamPlaceholder');
                if (placeholder) placeholder.style.display = 'none';
            }
        }
    } catch (_) { }
    finally {
        isPollingScreen = false;
    }
}

function closeScreenStream() {
    document.getElementById('screenModal').style.display = 'none';
    if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
    }
    activeStreamDeviceId = null;
    isPollingScreen = false;
}

function handlePhoneScreenClick(event) {
    if (!activeStreamDeviceId) return;
    const container = document.getElementById('phoneScreenContainer');
    const rect = container.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;

    // Show ripple
    const ripple = document.getElementById('touchRipple');
    if (ripple) {
        ripple.style.left = `${(xRatio * 100)}%`;
        ripple.style.top = `${(yRatio * 100)}%`;
        ripple.classList.add('active');
        setTimeout(() => ripple.classList.remove('active'), 250);
    }

    fetch(`/api/devices/${encodeURIComponent(activeStreamDeviceId)}/touch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Token': currentTenantToken || ''
        },
        body: JSON.stringify({
            action: 'tap',
            xRatio: Math.max(0, Math.min(1, xRatio)),
            yRatio: Math.max(0, Math.min(1, yRatio))
        })
    }).then(() => {
        setTimeout(pollScreenFrame, 150);
        setTimeout(pollScreenFrame, 350);
    }).catch(() => { });
}

function sendDeviceKey(key) {
    if (!activeStreamDeviceId) return;
    fetch(`/api/devices/${encodeURIComponent(activeStreamDeviceId)}/touch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Token': currentTenantToken || ''
        },
        body: JSON.stringify({ action: 'key', key })
    }).then(() => {
        setTimeout(pollScreenFrame, 150);
        setTimeout(pollScreenFrame, 350);
    }).catch(() => { });
}

function sendDeviceSwipe(direction) {
    if (!activeStreamDeviceId) return;
    fetch(`/api/devices/${encodeURIComponent(activeStreamDeviceId)}/touch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Token': currentTenantToken || ''
        },
        body: JSON.stringify({ action: 'swipe', direction })
    }).then(() => {
        setTimeout(pollScreenFrame, 200);
        setTimeout(pollScreenFrame, 450);
    }).catch(() => { });
}

function sendRemoteTextInput() {
    if (!activeStreamDeviceId) return;
    const input = document.getElementById('remoteTextInput');
    const text = input.value.trim();
    if (!text) return;
    fetch(`/api/devices/${encodeURIComponent(activeStreamDeviceId)}/touch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Token': currentTenantToken || ''
        },
        body: JSON.stringify({ action: 'text', text })
    }).then(() => {
        input.value = '';
        setTimeout(pollScreenFrame, 150);
        setTimeout(pollScreenFrame, 350);
    }).catch(() => { });
}

// --------------------------------------------------------------------------
// REMOTE COMMANDS
// --------------------------------------------------------------------------
function promptCommand(deviceId, command, title, payload = {}) {
    if (command === 'SET_KIOSK_MODE' && payload && payload.enable === false && currentTenantData?.isBranch) {
        showToast('عذراً! إلغاء وضع الكشك محصور بالإدارة العامة للشركة فقط.', 'error');
        return;
    }
    if (command === 'WIPE_DEVICE' && currentTenantData?.isBranch) {
        showToast('عذراً! إجراء الفرمتة محصور بالإدارة العامة للشركة فقط.', 'error');
        return;
    }
    if (command === 'WIPE_DEVICE') {
        if (!confirm('تحذير: سيتم مسح الهاتف نهائياً وإعادة ضبط المصنع! هل أنت متأكد؟')) return;
    }
    dispatchRemoteCommand(deviceId, command, payload);
}

async function dispatchRemoteCommand(deviceId, command, payload = {}) {
    try {
        const res = await fetch('/api/commands', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ deviceId, command, payload })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`تم إرسال الأمر '${command}' بنجاح!`, 'success');
        } else {
            showToast(data.error || 'فشل إرسال الأمر', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
}

// --------------------------------------------------------------------------
// OTA UPDATES & AUDIT LOGS
// --------------------------------------------------------------------------
async function deployOtaUpdate() {
    const deviceId = document.getElementById('targetDeviceSelect').value;
    const apkUrl = document.getElementById('apkUrlInput').value.trim();
    const packageName = document.getElementById('apkPackageInput').value.trim() || 'ota_app';

    if (!apkUrl) {
        showToast('يرجى اختيار ملف APK لرفعه أو إدخال رابط تحميل مباشر', 'error');
        return;
    }

    const statusBox = document.getElementById('otaStatusMessage');
    if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.className = 'status-box status-loading';
        statusBox.innerText = 'جاري إرسال أمر التثبيت الصامت للأجهزة المستهدفة...';
    }

    try {
        const res = await fetch('/api/apps/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, apkUrl, packageName })
        });
        const data = await res.json();
        if (data.success) {
            showToast('تمت جدولة تثبيت التطبيق بنجاح! ستقوم الأجهزة بتحميله وتثبيته فوراً.', 'success');
            if (statusBox) {
                statusBox.className = 'status-box status-success';
                statusBox.innerText = 'تم إرسال أمر التثبيت بنجاح! ستقوم الأجهزة بتحميل الـ APK وتثبيته فوراً في الخلفية.';
            }
        } else {
            showToast(data.error || 'فشل الجدولة', 'error');
            if (statusBox) {
                statusBox.className = 'status-box status-error';
                statusBox.innerText = data.error || 'فشلت جدولة التثبيت';
            }
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر', 'error');
        if (statusBox) {
            statusBox.className = 'status-box status-error';
            statusBox.innerText = 'خطأ في الاتصال بالسيرفر';
        }
    }
}

function handleOtaFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.apk')) {
        showToast('يرجى اختيار ملف بصيغة APK فقط (.apk)', 'error');
        return;
    }

    const progressWrap = document.getElementById('otaUploadProgressWrap');
    const progressBar = document.getElementById('otaProgressBar');
    const percentLabel = document.getElementById('otaUploadPercent');
    const fileNameLabel = document.getElementById('otaUploadFileName');

    if (progressWrap) progressWrap.style.display = 'block';
    if (fileNameLabel) fileNameLabel.innerText = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    if (progressBar) progressBar.style.width = '0%';
    if (percentLabel) percentLabel.innerText = '0%';

    showToast(`جاري رفع ملف ${file.name}...`, 'info');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ota/upload');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', 'application/vnd.android.package-archive');

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = percent + '%';
            if (percentLabel) percentLabel.innerText = percent + '%';
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) {
                    const urlInput = document.getElementById('apkUrlInput');
                    if (urlInput) urlInput.value = data.url;
                    
                    // Suggest package name if empty
                    const pkgInput = document.getElementById('apkPackageInput');
                    if (pkgInput && !pkgInput.value) {
                        const baseName = file.name.replace(/\.apk$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
                        pkgInput.value = 'app.' + baseName;
                    }

                    if (percentLabel) percentLabel.innerText = 'اكتمل الرفع 100% ✓';
                    showToast(`تم رفع ${file.name} بنجاح! الرابط المباشر جاهز للتوزيع الآن.`, 'success');
                } else {
                    showToast(data.error || 'فشل في معالجة الملف', 'error');
                }
            } catch (e) {
                showToast('خطأ في استجابة السيرفر بعد الرفع', 'error');
            }
        } else {
            showToast('فشل في رفع الملف، رمز الخطأ: ' + xhr.status, 'error');
        }
    };

    xhr.onerror = () => {
        showToast('خطأ في الاتصال أثناء رفع الملف إلى السيرفر', 'error');
    };

    xhr.send(file);
}

async function fetchLogs() {
    try {
        const res = await fetch('/api/logs');
        const logs = await res.json();
        const list = document.getElementById('auditLogsList');
        if (!list) return;
        list.innerHTML = logs.map(l => `
            <li><span style="color:#64748B;">[${escapeHtml(l.timestamp)}]</span> <strong>${escapeHtml(l.action)}</strong> (${escapeHtml(l.target)}): ${escapeHtml(l.details)}</li>
        `).join('');
    } catch (_) { }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

// --------------------------------------------------------------------------
// BRANCH MANAGEMENT (إدارة الويبات الفرعية)
// --------------------------------------------------------------------------
let branchesCache = [];

async function fetchBranches() {
    if (!currentTenantToken) return;
    try {
        const res = await fetch('/api/tenant/branches', {
            headers: { 'X-Tenant-Token': currentTenantToken }
        });
        if (res.status === 403) {
            // Branch account cannot manage branches
            return;
        }
        const data = await res.json();
        if (data.success) {
            branchesCache = data.branches || [];
            const quotaEl = document.getElementById('branchesQuotaDisplay');
            if (quotaEl) quotaEl.innerText = `${data.usedBranches} من أصل ${data.maxBranches} فروع مسموحة`;

            const addBtn = document.getElementById('btnAddBranchBtn');
            if (addBtn) {
                addBtn.disabled = !data.canAddMore;
                addBtn.title = data.canAddMore ? '' : 'تم استهلاك كامل حصة الفروع المسموحة للباقة';
            }

            renderBranchesTable(branchesCache);
        }
    } catch (e) {
        console.error('Failed to fetch branches', e);
    }
}

function renderBranchesTable(branches) {
    const tbody = document.getElementById('branchesTableBody');
    if (!tbody) return;

    if (!branches || branches.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:40px; text-align:center; color:#64748B;">
                    <div style="font-size:15px; font-weight:700; color:#0F172A; margin-bottom:6px;">لم يتم إنشاء ويبات فرعية بعد</div>
                    <div style="font-size:13px; color:#64748B;">انقر على زر "إضافة ويب فرعي جديد" لإنشاء حساب مستقل لمسؤولي فروعك برقم دخول خاص.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = branches.map(b => {
        const branchPwd = b.password || '123456';
        return `
        <tr>
            <td>
                <strong style="color:#0F172A; font-size:14px;">${escapeHtml(b.name)}</strong>
            </td>
            <td>
                <span dir="ltr" style="font-family:monospace; background:#EFF6FF; border:1px solid #BFDBFE; padding:3px 8px; border-radius:4px; color:#1E40AF; font-weight:700; font-size:13px;">
                    ${escapeHtml(b.number || b.phone || '')}
                </span>
            </td>
            <td>
                <span style="font-family:monospace; color:#475569; font-weight:600;">${escapeHtml(b.code || '-')}</span>
            </td>
            <td>
                <div style="display:inline-flex; align-items:center; gap:6px; background:#F8FAFC; border:1px solid #CBD5E1; border-radius:6px; padding:3px 8px;">
                    <span id="branchPwdText_${b.id}" style="font-family:monospace; font-size:13px; font-weight:600; color:#334155; min-width:65px; letter-spacing:1px; user-select:all;">••••••</span>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="toggleBranchPasswordVisibility('${b.id}', '${escapeHtml(branchPwd)}')" title="إظهار / إخفاء كلمة المرور" style="padding:2px 6px; font-size:11px; cursor:pointer;">
                        <span id="branchPwdEye_${b.id}">👁️</span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="copyToClipboard('${escapeHtml(branchPwd)}', 'تم نسخ كلمة مرور الفرع إلى الحافظة!')" title="نسخ كلمة المرور" style="padding:2px 6px; font-size:11px; cursor:pointer;">
                        📋
                    </button>
                </div>
            </td>
            <td>
                <small style="color:#64748B; font-family:monospace;">${escapeHtml((b.createdAt || '').slice(0, 10))}</small>
            </td>
            <td>
                <div style="display:inline-flex; gap:6px; align-items:center;">
                    <button class="btn btn-secondary btn-xs" onclick="openChangeBranchPasswordModal('${b.id}', '${escapeHtml(b.name)}', '${escapeHtml(b.number || '')}', '${escapeHtml(branchPwd)}')" title="تغيير كلمة المرور لهذا الفرع">
                        🔑 تغيير كلمة المرور
                    </button>
                    <button class="btn btn-danger-soft btn-xs" onclick="deleteBranch('${b.id}', '${escapeHtml(b.name)}')">
                        حذف الفرع
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function copyToClipboard(text, successMsg = 'تم النسخ!') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(successMsg, 'success');
        }).catch(() => {
            prompt('انسخ يدوياً:', text);
        });
    } else {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showToast(successMsg, 'success');
    }
}

function toggleBranchPasswordVisibility(branchId, actualPassword) {
    const textEl = document.getElementById(`branchPwdText_${branchId}`);
    const eyeEl = document.getElementById(`branchPwdEye_${branchId}`);
    if (!textEl) return;

    if (textEl.innerText === '••••••') {
        textEl.innerText = actualPassword;
        textEl.style.color = '#1E40AF';
        textEl.style.letterSpacing = 'normal';
        if (eyeEl) eyeEl.innerText = '🔒';
    } else {
        textEl.innerText = '••••••';
        textEl.style.color = '#334155';
        textEl.style.letterSpacing = '1px';
        if (eyeEl) eyeEl.innerText = '👁️';
    }
}

function openChangeBranchPasswordModal(branchId, branchName, branchNumber, currentPassword) {
    const idInput = document.getElementById('changeBranchId');
    const nameDisplay = document.getElementById('changeBranchNameDisplay');
    const numberDisplay = document.getElementById('changeBranchNumberDisplay');
    const pwdInput = document.getElementById('changeBranchPasswordInput');
    const modal = document.getElementById('modalChangeBranchPassword');

    if (idInput) idInput.value = branchId;
    if (nameDisplay) nameDisplay.innerText = branchName;
    if (numberDisplay) numberDisplay.innerText = branchNumber || '-';
    if (pwdInput) {
        pwdInput.value = currentPassword || '';
        pwdInput.type = 'password';
    }
    const eyeIcon = document.getElementById('newPasswordEyeIcon');
    if (eyeIcon) eyeIcon.innerText = '👁️';

    if (modal) modal.style.display = 'flex';
}

function closeChangeBranchPasswordModal() {
    const modal = document.getElementById('modalChangeBranchPassword');
    if (modal) modal.style.display = 'none';
}

function toggleNewPasswordInputVisibility() {
    const pwdInput = document.getElementById('changeBranchPasswordInput');
    const eyeIcon = document.getElementById('newPasswordEyeIcon');
    if (!pwdInput) return;
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        if (eyeIcon) eyeIcon.innerText = '🔒';
    } else {
        pwdInput.type = 'password';
        if (eyeIcon) eyeIcon.innerText = '👁️';
    }
}

async function submitChangeBranchPassword(event) {
    event.preventDefault();
    const branchId = document.getElementById('changeBranchId').value;
    const newPassword = document.getElementById('changeBranchPasswordInput').value.trim();

    if (!branchId || !newPassword) {
        showToast('يرجى إدخال كلمة المرور الجديدة.', 'error');
        return;
    }

    if (newPassword.length < 4) {
        showToast('يجب أن لا تقل كلمة المرور عن 4 خانات.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/tenant/branches/update-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ branchId, newPassword })
        });
        const data = await res.json();
        if (data.success) {
            closeChangeBranchPasswordModal();
            showToast(data.message || 'تم تحديث كلمة مرور الفرع بنجاح!', 'success');
            fetchBranches();
        } else {
            showToast(data.error || 'فشل تحديث كلمة المرور.', 'error');
        }
    } catch (e) {
        showToast('حدث خطأ أثناء الاتصال بالخادم.', 'error');
    }
}

function openAddBranchModal() {
    document.getElementById('branchNameInput').value = '';
    document.getElementById('branchNumberInput').value = '';
    document.getElementById('branchCodeInput').value = '';
    document.getElementById('branchPasswordInput').value = '123456';
    const modal = document.getElementById('modalAddBranch');
    if (modal) modal.style.display = 'flex';
}

function closeAddBranchModal() {
    const modal = document.getElementById('modalAddBranch');
    if (modal) modal.style.display = 'none';
}

async function submitCreateBranch(event) {
    event.preventDefault();
    const name = document.getElementById('branchNameInput').value.trim();
    const number = document.getElementById('branchNumberInput').value.trim();
    const code = document.getElementById('branchCodeInput').value.trim();
    const password = document.getElementById('branchPasswordInput').value.trim();

    if (!name || !number || !password) {
        showToast('يرجى ملء جميع الحقول المطلوبة.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/tenant/branches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ name, number, code, password })
        });
        const data = await res.json();
        if (data.success) {
            closeAddBranchModal();
            showToast(`تم إنشاء الويب الفرعي لـ '${name}' بنجاح! رقم الدخول: ${number}`, 'success');
            fetchBranches();
        } else {
            showToast(data.error || 'فشل إنشاء الفرع.', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر.', 'error');
    }
}

async function deleteBranch(branchId, branchName) {
    if (!confirm(`هل أنت متأكد من حذف حساب الفرع '${branchName}'؟ لن يتمكن مسؤول الفرع من تسجيل الدخول بعد الآن.`)) return;

    try {
        const res = await fetch('/api/tenant/branches/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ branchId })
        });
        const data = await res.json();
        if (data.success) {
            showToast('تم حذف الفرع بنجاح.', 'success');
            fetchBranches();
        } else {
            showToast(data.error || 'فشل حذف الفرع.', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر.', 'error');
    }
}

// --------------------------------------------------------------------------
// COMPANY AUTHENTICATION & LOGIN LIFECYCLE
// --------------------------------------------------------------------------
let currentTenantToken = sessionStorage.getItem('nexus_tenant_token') || localStorage.getItem('nexus_tenant_token');
let deviceFetchIntervalTimer = null;

function showCompanyLoginScreen() {
    const overlay = document.getElementById('companyLoginOverlay');
    const container = document.getElementById('mainAppContainer');
    if (overlay) overlay.style.display = 'flex';
    if (container) container.style.display = 'none';
}

function hideCompanyLoginScreen() {
    const overlay = document.getElementById('companyLoginOverlay');
    const container = document.getElementById('mainAppContainer');
    if (overlay) overlay.style.display = 'none';
    if (container) container.style.display = 'block';
}

async function handleCompanyLogin(event) {
    event.preventDefault();
    const loginId = document.getElementById('companyLoginEmail').value.trim();
    const password = document.getElementById('companyLoginPassword').value.trim();
    const btn = document.getElementById('btnCompanyLoginSubmit');
    const errBox = document.getElementById('companyLoginError');

    btn.disabled = true;
    errBox.style.display = 'none';

    try {
        const res = await fetch('/api/tenant/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: loginId,
                number: loginId,
                phone: loginId,
                username: loginId,
                password: password
            })
        });
        const data = await res.json();
        if (data.success) {
            currentTenantToken = data.token;
            sessionStorage.setItem('nexus_tenant_token', currentTenantToken);
            if (data.tenant && data.tenant.code) {
                currentCompanyCode = data.tenant.code;
                localStorage.setItem('nexus_company_code', currentCompanyCode);
            }
            currentTenantData = data.tenant;
            initAuthenticatedPortal();
            if (data.isBranch) {
                showToast(`مرحباً! تم تسجيل دخول فرع '${data.branch?.name || ''}' بنجاح.`, 'success');
            } else {
                showToast('تم تسجيل الدخول بنجاح إلى لوحة تحكم المؤسسة', 'success');
            }
        } else {
            errBox.innerText = data.error || 'بيانات الدخول أو كلمة المرور غير صحيحة.';
            errBox.style.display = 'block';
        }
    } catch (e) {
        errBox.innerText = 'تعذر الاتصال بخادم Nexus، يرجى المحاولة لاحقاً.';
        errBox.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
}

async function handleCompanyLogout() {
    if (currentTenantToken) {
        try {
            await fetch('/api/tenant/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Token': currentTenantToken
                }
            });
        } catch (_) { }
    }
    sessionStorage.removeItem('nexus_tenant_token');
    localStorage.removeItem('nexus_tenant_token');
    currentTenantToken = null;
    if (deviceFetchIntervalTimer) {
        clearInterval(deviceFetchIntervalTimer);
        deviceFetchIntervalTimer = null;
    }
    showCompanyLoginScreen();
    showToast('تم تسجيل الخروج من لوحة تحكم الشركة.', 'info');
}

async function initAuthenticatedPortal() {
    hideCompanyLoginScreen();
    const isActive = await checkCurrentCompanySubscription();
    if (isActive) {
        fetchDevices();
        if (!deviceFetchIntervalTimer) {
            deviceFetchIntervalTimer = setInterval(fetchDevices, 3000);
        }
        initQrTab();
    }
}

// --------------------------------------------------------------------------
// TIME & DATE FLEET SYNCHRONIZATION
// --------------------------------------------------------------------------
async function syncFleetTime(deviceId = 'ALL') {
    const isRtl = currentLang === 'ar';
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Baghdad';
    const nowMs = Date.now();

    showToast(isRtl ? 'جاري إرسال أمر مزامنة الوقت والتاريخ...' : 'Dispatching time sync command...', 'info');

    try {
        const res = await fetch('/api/fleet/sync-time', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({
                deviceId: deviceId,
                timeZone: userTz,
                timestamp: nowMs
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast(data.message || (isRtl ? 'تمت مزامنة الوقت والتاريخ بنجاح!' : 'Time synchronized successfully!'), 'success');
        } else {
            showToast(data.error || 'Failed to sync time', 'error');
        }
    } catch (e) {
        showToast('Error syncing time: ' + e.message, 'error');
    }
}

// --------------------------------------------------------------------------
// INITIALIZATION
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    applyLanguage();
    if (!currentTenantToken) {
        showCompanyLoginScreen();
    } else {
        initAuthenticatedPortal();
    }
});

