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

// Fleet Table Filtering, Search & Bulk Actions State
let currentFleetFilter = 'all'; // 'all' | 'online' | 'offline' | 'kiosk' | 'low_battery'
let currentFleetSearchQuery = '';
let selectedFleetDeviceIds = new Set();

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
        tabDevices: "الاجهزة المدارة",
        tabWhitelist: "تطبيقات الكشك",
        tabQr: "تجهيز الـ QR السريع",
        tabOta: "توزيع التطبيقات OTA",
        tabLogs: "سجلات التدقيق",
        kpiFleet: "الأجهزة المدارة",
        kpiKiosk: "قفل الكشك",
        kpiGps: "تتبع الأقمار الصناعية",
        kpiSecurity: "درع الأمان الفوري",
        thDevice: "اسم الجهاز",
        thModel: "الموديل",
        thBattery: "البطارية",
        thVitals: "الذاكرة والتخزين",
        thIp: "عنوان الشبكة IP",
        thKiosk: "وضع الكشك",
        thStatus: "الحالة",
        thActions: "الإجراءات",
        btnRemoteControl: "التحكم المباشر",
        btnGpsTrack: "تتبع GPS",
        btnActions: "خيارات",
        tabBranches: "إدارة الفروع",
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
        lblQrDeviceTag: "اسم / وسم الجهاز (بالعربية أو الإنجليزية) *",
        descQrDeviceTag: "يتم تثبيت هذا الاسم تلقائياً في الجهاز باللغة العربية عند مسح كود الـ QR بعد الفرمتة.",
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
        thDevice: "Device Name",
        thModel: "Model",
        thBattery: "Battery",
        thVitals: "RAM & Storage",
        thIp: "IP Address",
        thKiosk: "Kiosk Mode",
        thStatus: "Status",
        thActions: "Actions",
        btnRemoteControl: "Remote Control",
        btnGpsTrack: "GPS Track",
        btnActions: "Options",
        tabBranches: "Branch Management",
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
        lblQrDeviceTag: "Device Name / Tag (Arabic or English) *",
        descQrDeviceTag: "This custom name (Arabic or English) will be automatically assigned to the phone upon scanning.",
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

    // Toggle button text (preserves SVG icon)
    const langLabel = document.getElementById('langLabel');
    if (langLabel) {
        langLabel.innerText = isRtl ? 'English' : 'العربية';
    } else {
        const btnLang = document.getElementById('btnLangToggle');
        if (btnLang) btnLang.innerText = isRtl ? 'English' : 'العربية';
    }

    // Navigation Tabs (preserves tab SVG icons)
    const updateTabLabel = (selector, text) => {
        const tab = document.querySelector(selector);
        if (!tab) return;
        const label = tab.querySelector('.nav-tab-label');
        if (label) {
            label.innerText = text;
        } else {
            tab.innerText = text;
        }
    };
    updateTabLabel('.nav-tab[data-tab="devices"]', t.tabDevices);
    updateTabLabel('.nav-tab[data-tab="whitelist"]', t.tabWhitelist);
    updateTabLabel('.nav-tab[data-tab="qr"]', t.tabQr);
    updateTabLabel('.nav-tab[data-tab="ota"]', t.tabOta);
    updateTabLabel('#tabNavBranches', t.tabBranches || (isRtl ? 'إدارة الفروع (الويبات الفرعية)' : 'Branch Management'));

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

    const fleetTitle = document.getElementById('fleetSectionTitle');
    if (fleetTitle) fleetTitle.innerText = isRtl ? 'الأجهزة المدارة' : 'Managed Devices';

    const fleetDesc = document.getElementById('fleetSectionDesc');
    if (fleetDesc) fleetDesc.style.display = 'none';

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

            // If user is a branch admin, lock filter and hide branches management tab!
            if (t.isBranch) {
                selectedFleetBranch = t.branchId || '';
                updateFleetBranchFilterDropdown();
            }

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
// --------------------------------------------------------------------------
// FLEET DEVICES
// --------------------------------------------------------------------------
let selectedFleetBranch = 'ALL';

async function fetchDevices() {
    try {
        let branchFilter = selectedFleetBranch;
        if (currentTenantData && currentTenantData.isBranch && currentTenantData.branchId) {
            branchFilter = currentTenantData.branchId;
            selectedFleetBranch = currentTenantData.branchId;
        }

        let url = `/api/devices?companyCode=${encodeURIComponent(currentCompanyCode || '')}`;
        if (branchFilter && branchFilter !== 'ALL') {
            url += `&branchId=${encodeURIComponent(branchFilter)}`;
        }
        const headers = {};
        if (currentTenantToken) headers['X-Tenant-Token'] = currentTenantToken;
        if (currentCompanyCode) headers['X-Company-Code'] = currentCompanyCode;

        const res = await fetch(url, { headers });
        const devices = await res.json();
        lastDevicesCache = Array.isArray(devices) ? devices : [];

        // If Device Action Center is currently open, live-update its content
        if (activeDacDeviceId) {
            const currentDacDevice = (lastDevicesCache || []).find(d => d.id === activeDacDeviceId);
            if (currentDacDevice) updateDacModalContent(currentDacDevice);
        }

        // If Branch Devices Modal is currently open, live-update its content
        const branchModal = document.getElementById('modalBranchDevices');
        if (branchModal && branchModal.style.display !== 'none') {
            const activeBid = document.getElementById('currentActiveBranchId')?.value;
            if (activeBid) {
                populateBranchAssignSelect(activeBid);
                renderBranchDevicesList(activeBid);
            }
        }

        const currentOpenDropdown = openDropdownDeviceId ? document.getElementById(`dropdown-${openDropdownDeviceId}`) : null;
        if (currentOpenDropdown && currentOpenDropdown.classList.contains('show')) {
            updateDeviceSelect(lastDevicesCache);
            updateHeaderMetrics(lastDevicesCache);
            if (activeTrackDeviceId) updateDeviceTrackModal(activeTrackDeviceId);
            return;
        }

        renderDeviceTable(lastDevicesCache);
        updateDeviceSelect(lastDevicesCache);
        updateHeaderMetrics(lastDevicesCache);

        if (activeTrackDeviceId) {
            updateDeviceTrackModal(activeTrackDeviceId);
        }
    } catch (e) {
        console.error('Failed to fetch devices', e);
    }
}

function updateFleetBranchFilterDropdown() {
    const sel = document.getElementById('selectFleetBranchFilter');
    if (!sel) return;

    if (currentTenantData && currentTenantData.isBranch) {
        const bName = currentTenantData.branchName || 'الفرع';
        const bId = currentTenantData.branchId || '';
        sel.innerHTML = `<option value="${escapeHtml(bId)}" selected>${escapeHtml(bName)} (هذا الفرع)</option>`;
        sel.disabled = true;
        selectedFleetBranch = bId;
        return;
    }

    sel.disabled = false;
    const currentVal = sel.value || selectedFleetBranch || 'ALL';
    let html = '<option value="ALL">جميع الأجهزة (كافة الفروع)</option>';
    (branchesCache || []).forEach(b => {
        html += `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)} (${escapeHtml(b.code || b.number || '')})</option>`;
    });
    sel.innerHTML = html;
    sel.value = currentVal;
    if (sel.value !== currentVal) {
        sel.value = 'ALL';
        selectedFleetBranch = 'ALL';
    }
}

function onFleetBranchFilterChange() {
    const sel = document.getElementById('selectFleetBranchFilter');
    if (!sel) return;
    selectedFleetBranch = sel.value;
    fetchDevices();
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

    const sideBadge = document.getElementById('sidebarBadgeDevices');
    if (sideBadge) sideBadge.innerText = totalCount;

    const bOnline = document.getElementById('bubbleOnlineVal');
    if (bOnline) bOnline.innerText = onlineCount;

    const bKiosk = document.getElementById('bubbleKioskVal');
    if (bKiosk) bKiosk.innerText = kioskCount;

    const bOffline = document.getElementById('bubbleOfflineVal');
    if (bOffline) bOffline.innerText = Math.max(0, totalCount - onlineCount);
}

function onDeviceRowClicked(event, deviceId) {
    // Prevent trigger if user clicked an action button, select or dropdown item
    if (event.target.closest('button, select, input, a, .dropdown-menu, .action-dropdown')) {
        return;
    }
    openDeviceActionCenter(deviceId);
}

function handleFleetSearch(query) {
    currentFleetSearchQuery = (query || '').trim().toLowerCase();
    const topInput = document.getElementById('fleetSearchInputTop');
    const tableInput = document.getElementById('fleetSearchInput');
    if (topInput && topInput.value !== (query || '')) topInput.value = query || '';
    if (tableInput && tableInput.value !== (query || '')) tableInput.value = query || '';

    const clearBtnTop = document.getElementById('fleetSearchClearBtnTop');
    const clearBtn = document.getElementById('fleetSearchClearBtn');
    if (clearBtnTop) clearBtnTop.style.display = currentFleetSearchQuery ? 'inline-block' : 'none';
    if (clearBtn) clearBtn.style.display = currentFleetSearchQuery ? 'inline-block' : 'none';

    renderDeviceTable(lastDevicesCache);
}

function clearFleetSearch() {
    const topInput = document.getElementById('fleetSearchInputTop');
    const tableInput = document.getElementById('fleetSearchInput');
    if (topInput) topInput.value = '';
    if (tableInput) tableInput.value = '';
    handleFleetSearch('');
}

function setFleetFilter(filterKey) {
    currentFleetFilter = filterKey;
    const pills = document.querySelectorAll('#fleetFilterPills .filter-pill');
    pills.forEach(pill => {
        if (pill.getAttribute('data-filter') === filterKey) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    renderDeviceTable(lastDevicesCache);
}

function getFilteredFleetDevices(devices) {
    if (!devices || !Array.isArray(devices)) return [];
    return devices.filter(d => {
        // Status Filter
        if (currentFleetFilter === 'online' && !d.isOnline) return false;
        if (currentFleetFilter === 'offline' && d.isOnline) return false;
        if (currentFleetFilter === 'kiosk' && !d.isKiosk) return false;
        if (currentFleetFilter === 'low_battery' && (d.battery || 0) >= 20) return false;

        // Search Query
        if (currentFleetSearchQuery) {
            const name = (d.name || '').toLowerCase();
            const id = (d.id || '').toLowerCase();
            const model = (d.model || '').toLowerCase();
            const os = (d.os || '').toLowerCase();
            const ip = (d.ipAddress || '').toLowerCase();
            const branch = (d.branchName || '').toLowerCase();
            const matches = name.includes(currentFleetSearchQuery) ||
                id.includes(currentFleetSearchQuery) ||
                model.includes(currentFleetSearchQuery) ||
                os.includes(currentFleetSearchQuery) ||
                ip.includes(currentFleetSearchQuery) ||
                branch.includes(currentFleetSearchQuery);
            if (!matches) return false;
        }

        return true;
    });
}

function toggleDeviceSelect(deviceId, checked) {
    if (checked) {
        selectedFleetDeviceIds.add(deviceId);
    } else {
        selectedFleetDeviceIds.delete(deviceId);
    }
    updateBulkActionsBar();
    const row = document.querySelector(`.device-row[data-device-id="${deviceId}"]`);
    if (row) {
        if (checked) row.classList.add('device-row-selected');
        else row.classList.remove('device-row-selected');
    }
}

function toggleSelectAllDevices(checked) {
    const filtered = getFilteredFleetDevices(lastDevicesCache || []);
    if (checked) {
        filtered.forEach(d => selectedFleetDeviceIds.add(d.id));
    } else {
        filtered.forEach(d => selectedFleetDeviceIds.delete(d.id));
    }
    renderDeviceTable(lastDevicesCache);
}

function deselectAllDevices() {
    selectedFleetDeviceIds.clear();
    renderDeviceTable(lastDevicesCache);
}

function updateBulkActionsBar() {
    const dock = document.getElementById('fleetBulkActionsDock');
    const countBadge = document.getElementById('bulkSelectedCount');
    const label = document.getElementById('bulkSelectedLabel');
    const selectAllCheckbox = document.getElementById('selectAllDevicesCheckbox');
    const isRtl = currentLang === 'ar';

    const count = selectedFleetDeviceIds.size;
    if (countBadge) countBadge.innerText = count;
    if (label) label.innerText = isRtl ? (count === 1 ? 'جهاز محدد' : 'أجهزة محددة') : (count === 1 ? 'device selected' : 'devices selected');

    if (dock) {
        if (count > 0) {
            dock.classList.add('show');
        } else {
            dock.classList.remove('show');
        }
    }

    if (selectAllCheckbox) {
        const filtered = getFilteredFleetDevices(lastDevicesCache || []);
        if (filtered.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else {
            const selectedFilteredCount = filtered.filter(d => selectedFleetDeviceIds.has(d.id)).length;
            if (selectedFilteredCount === filtered.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else if (selectedFilteredCount > 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }
        }
    }
}

async function executeBulkCommand(action, label, extraPayload = {}) {
    const ids = Array.from(selectedFleetDeviceIds);
    if (ids.length === 0) {
        showToast(currentLang === 'ar' ? 'يرجى تحديد جهاز واحد على الأقل' : 'Please select at least one device', 'warning');
        return;
    }
    const isRtl = currentLang === 'ar';
    const confirmMsg = isRtl
        ? `هل أنت متأكد من تنفيذ أمر '${label}' على ${ids.length} أجهزة محددة؟`
        : `Are you sure you want to execute '${label}' on ${ids.length} selected devices?`;

    if (!confirm(confirmMsg)) return;

    showToast(isRtl ? `جاري إرسال أمر '${label}' إلى ${ids.length} جهاز...` : `Sending '${label}' to ${ids.length} devices...`, 'info');

    let successCount = 0;
    for (const deviceId of ids) {
        try {
            const res = await fetch('/api/commands/queue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Token': currentTenantToken || ''
                },
                body: JSON.stringify({
                    deviceId,
                    action,
                    payload: extraPayload
                })
            });
            const data = await res.json();
            if (data.success) successCount++;
        } catch (e) {
            console.error('Bulk command error for device', deviceId, e);
        }
    }

    showToast(isRtl ? `تم إرسال أمر '${label}' بنجاح إلى ${successCount} جهاز!` : `Successfully sent '${label}' to ${successCount} devices!`, 'success');
    deselectAllDevices();
    fetchDevices();
}

async function executeBulkDelete() {
    const ids = Array.from(selectedFleetDeviceIds);
    if (ids.length === 0) {
        showToast(currentLang === 'ar' ? 'يرجى تحديد جهاز واحد على الأقل للحذف' : 'Please select at least one device to delete', 'warning');
        return;
    }
    const isRtl = currentLang === 'ar';
    const confirmMsg = isRtl
        ? `هل أنت متأكد تماماً من حذف ${ids.length} جهاز محدد نهائياً من الأسطول والنظام؟\n\nلا يمكن التراجع عن هذا الإجراء.`
        : `Are you sure you want to permanently delete ${ids.length} selected devices from the fleet?`;

    if (!confirm(confirmMsg)) return;

    showToast(isRtl ? `جاري حذف ${ids.length} جهاز...` : `Deleting ${ids.length} devices...`, 'info');

    let successCount = 0;
    for (const deviceId of ids) {
        try {
            const res = await fetch('/api/devices/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Token': currentTenantToken || ''
                },
                body: JSON.stringify({ deviceId })
            });
            const data = await res.json();
            if (data.success) successCount++;
        } catch (e) {
            console.error('Bulk delete error for device', deviceId, e);
        }
    }

    showToast(isRtl ? `تم حذف ${successCount} من أصل ${ids.length} جهاز بنجاح!` : `Successfully deleted ${successCount} devices!`, 'success');
    deselectAllDevices();
    fetchDevices();
}

function renderDeviceTable(devices) {
    const tbody = document.getElementById('deviceTableBody');
    const isRtl = currentLang === 'ar';
    if (!tbody) return;

    const all = devices || [];

    // Update Filter Pill Counts
    const countAll = document.getElementById('countPillAll');
    const countOnline = document.getElementById('countPillOnline');
    const countOffline = document.getElementById('countPillOffline');
    const countKiosk = document.getElementById('countPillKiosk');
    const countBattery = document.getElementById('countPillBattery');

    if (countAll) countAll.innerText = all.length;
    if (countOnline) countOnline.innerText = all.filter(d => d.isOnline).length;
    if (countOffline) countOffline.innerText = all.filter(d => !d.isOnline).length;
    if (countKiosk) countKiosk.innerText = all.filter(d => d.isKiosk).length;
    if (countBattery) countBattery.innerText = all.filter(d => (d.battery || 0) < 20).length;

    // Filter devices
    const filtered = getFilteredFleetDevices(all);

    // Showing Count Label
    const showingCount = document.getElementById('fleetShowingCount');
    if (showingCount) {
        showingCount.innerText = isRtl
            ? `عرض ${filtered.length} من أصل ${all.length} جهاز`
            : `Showing ${filtered.length} of ${all.length} devices`;
    }

    if (all.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding: 48px 24px; text-align: center; color: #64748B;">
                    <div style="font-size: 15px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">
                        ${isRtl ? 'لا توجد أجهزة متصلة تابعة لهذه الشركة حالياً' : 'No devices connected for this company yet'}
                    </div>
                    <div style="font-size: 13px; max-width: 520px; margin: 0 auto; line-height: 1.6; color: #64748B;">
                        ${isRtl ? 'لتسجيل هاتف جديد في هذا الأسطول، انتقل إلى تبويب "تجهيز الـ QR السريع" وقم بمسح الكود بكاميرا الهاتف بعد الفرمتة.' : 'To enroll a device into this fleet, navigate to "Zero-Touch QR Provisioning" tab and scan the QR code with the fresh device.'}
                    </div>
                </td>
            </tr>
        `;
        updateBulkActionsBar();
        return;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding: 36px 20px; text-align: center; color: #64748B;">
                    <div style="font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 4px;">
                        ${isRtl ? 'لم يتم العثور على أجهزة مطابقة لنتائج البحث أو الفلتر' : 'No devices match your search or filter'}
                    </div>
                    <button type="button" onclick="clearFleetSearch(); setFleetFilter('all');" style="margin-top:8px; padding:5px 14px; font-size:12px; font-weight:600; border-radius:6px; background:#F1F5F9; border:1px solid #CBD5E1; color:#1E293B; cursor:pointer;">
                        ${isRtl ? 'إعادة ضبط الفلاتر والبحث' : 'Reset search & filters'}
                    </button>
                </td>
            </tr>
        `;
        updateBulkActionsBar();
        return;
    }

    tbody.innerHTML = filtered.map(d => {
        const isSelected = selectedFleetDeviceIds.has(d.id);
        const onlineTag = d.isOnline
            ? '<span class="status-tag tag-online"><span class="dot online"></span> Online</span>'
            : '<span class="status-tag tag-offline"><span class="dot" style="background:#94A3B8;"></span> Offline</span>';

        const kioskTag = d.isKiosk
            ? '<span class="status-tag tag-kiosk-active">Locked</span>'
            : '<span class="status-tag tag-kiosk-idle">Unrestricted</span>';

        const batteryColor = (d.battery > 50) ? '#10B981' : (d.battery > 20 ? '#F59E0B' : '#EF4444');
        const brand = detectDeviceBrand(d);

        return `
            <tr class="device-row ${isSelected ? 'device-row-selected' : ''}" data-device-id="${d.id}" onclick="openDeviceActionCenter('${d.id}')" title="${isRtl ? 'انقر على الجهاز لفتح لوحة التحكم والإجراءات' : 'Click device to open controls & actions'}">
                <td style="text-align: center;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="fleet-checkbox device-select-checkbox" data-id="${d.id}" ${isSelected ? 'checked' : ''} onchange="toggleDeviceSelect('${d.id}', this.checked); event.stopPropagation();">
                </td>
                <td>
                    <div class="device-cell-brand">
                        <div>
                            <strong style="color:#0F172A; font-size:13.5px;" class="device-name-link">${escapeHtml(d.name || d.id)}</strong>
                            ${d.branchName ? `<div style="margin-top:2px;"><span class="branch-pill-badge" title="الفرع: ${escapeHtml(d.branchName)}">${escapeHtml(d.branchName)}</span></div>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <div style="line-height:1.3;">
                        <strong style="color:#1E293B; font-size:12.5px;">${escapeHtml(d.model || 'Unknown')}</strong>
                    </div>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:5px; line-height:1.2;">
                        <strong style="color:#0F172A; font-size:12px;">${d.battery || 0}%</strong>
                        ${d.isCharging ? '<span class="battery-charging-chip" title="جاري الشحن">شحن</span>' : ''}
                        <small style="color:#64748B; font-size:10.5px; margin-right:4px;">${d.temperature || 0}°C</small>
                    </div>
                    <div style="width:65px; height:3.5px; background:#E2E8F0; margin-top:3px; border-radius:2px; overflow:hidden;">
                        <div style="width:${d.battery || 0}%; height:100%; background:${batteryColor};"></div>
                    </div>
                </td>
                <td>
                    <div style="font-size:11px; color:#475569; line-height:1.3;">
                        <span>RAM: <b>${d.ramUsedPercent || 0}%</b></span><br>
                        <span>Disk: <b>${d.storageUsedPercent || 0}%</b></span>
                    </div>
                </td>
                <td>
                    <code style="background:#F1F5F9; padding:2px 5px; font-size:11px; color:#334155; border-radius:4px;">${escapeHtml(d.ipAddress || 'Unknown')}</code>
                </td>
                <td>${kioskTag}</td>
                <td>${onlineTag}</td>
                <td>
                    <div class="actions-cell">
                        <button type="button" class="btn-action-primary-compact" onclick="openDeviceActionCenter('${d.id}'); event.stopPropagation();" title="${isRtl ? 'عرض لوحة التحكم والإجراءات' : 'Manage Device'}">
                            <span>${isRtl ? 'إدارة وتحكم' : 'Manage'}</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateBulkActionsBar();
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

async function confirmDeleteDevice(deviceId, deviceName) {
    if (!confirm(`هل أنت متأكد تماماً من حذف الجهاز '${deviceName}' (${deviceId}) من النظام؟\n\nسيتم مسح الجهاز وإزالته من لوحة التحكم وقائمة الأجهزة نهائياً.`)) {
        return;
    }
    try {
        const res = await fetch('/api/devices/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ deviceId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`تم حذف الجهاز '${deviceName}' من النظام بنجاح!`, 'success');
            fetchDevices();
        } else {
            showToast(data.error || 'فشل حذف الجهاز', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر أثناء حذف الجهاز', 'error');
    }
}

// --------------------------------------------------------------------------
// ZERO-TOUCH QR PROVISIONING (With Device Naming & Company Code)
// --------------------------------------------------------------------------
let lastQrConfig = null;

function updateQrBranchDropdown() {
    const compSelect = document.getElementById('qrCompanySelect');
    const branchSelect = document.getElementById('qrBranchSelect');
    if (!branchSelect) return;

    const selectedCompCode = compSelect ? compSelect.value : currentCompanyCode;
    const compObj = (lastQrConfig?.companies || []).find(c => c.code === selectedCompCode);
    const branches = compObj?.branches || branchesCache || [];

    if (currentTenantData && currentTenantData.isBranch) {
        branchSelect.innerHTML = `<option value="${escapeHtml(currentTenantData.branchId || '')}" selected>${escapeHtml(currentTenantData.branchName || 'الفرع')}</option>`;
        branchSelect.disabled = true;
        return;
    }

    branchSelect.disabled = false;
    let bHtml = '<option value="">-- بدون تعيين لفرع (الإدارة العامة) --</option>';
    branches.forEach(b => {
        bHtml += `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)} (${escapeHtml(b.code || b.number || '')})</option>`;
    });
    branchSelect.innerHTML = bHtml;
}

async function initQrTab() {
    try {
        const res = await fetch('/api/qr-config');
        const cfg = await res.json();
        if (cfg) {
            lastQrConfig = cfg;
            const origin = window.location.origin;
            const dlInput = document.getElementById('qrDownloadUrl');
            const srvInput = document.getElementById('qrServerUrl');
            const chkInput = document.getElementById('qrApkChecksum');

            if (dlInput && (!dlInput.value || dlInput.value.includes('192.168.0.101'))) {
                dlInput.value = cfg.defaultDownloadUrl || `${origin}/download/nexus-agent.apk`;
            }
            if (srvInput && (!srvInput.value || srvInput.value.includes('192.168.0.101'))) {
                srvInput.value = cfg.defaultServerUrl || origin;
            }
            if (chkInput && cfg.apkChecksum) {
                chkInput.value = cfg.apkChecksum;
            }

            // Populate Company Selection Dropdown
            const compSelect = document.getElementById('qrCompanySelect');
            if (compSelect && cfg.companies) {
                let optionsHtml = '';
                cfg.companies.forEach(c => {
                    const isSelected = (c.code === currentCompanyCode) ? 'selected' : '';
                    optionsHtml += `<option value="${c.code}" ${isSelected}>${c.name} (${c.code})</option>`;
                });
                compSelect.innerHTML = optionsHtml;
                if (currentTenantData && currentTenantData.isBranch) {
                    compSelect.disabled = true;
                }
            }

            updateQrBranchDropdown();
        }
    } catch (e) {
        console.error('Failed to fetch QR config', e);
    }
    generateQrCode();
}

function onQrCompanyChange() {
    updateQrBranchDropdown();
    generateQrCode();
}

function generateQrCode() {
    const dlInput = document.getElementById('qrDownloadUrl');
    const srvInput = document.getElementById('qrServerUrl');
    const chkInput = document.getElementById('qrApkChecksum');
    const wifiSsidInput = document.getElementById('qrWifiSsid');
    const wifiPasswordInput = document.getElementById('qrWifiPassword');

    const downloadUrl = (dlInput ? dlInput.value.trim() : '') || `${window.location.origin}/download/nexus-agent.apk`;
    const serverUrl = (srvInput ? srvInput.value.trim() : '') || window.location.origin;
    const checksum = (chkInput ? chkInput.value.trim() : '') || '186vU9UaxTohVbAWXcnMNDgnXDp1oPstFMvprK-WVD8';
    const wifiSsid = wifiSsidInput ? wifiSsidInput.value.trim() : '';
    const wifiPassword = wifiPasswordInput ? wifiPasswordInput.value.trim() : '';

    // Read the user-defined device name (supporting Arabic or English) and selected company code
    const deviceTagInput = document.getElementById('qrDeviceTag');
    const deviceTag = deviceTagInput ? (deviceTagInput.value.trim() || 'كاشير 1') : 'كاشير 1';

    const companySelect = document.getElementById('qrCompanySelect');
    const companyCode = companySelect ? companySelect.value || currentCompanyCode : currentCompanyCode;

    const branchSelect = document.getElementById('qrBranchSelect');
    const selectedBranchId = branchSelect ? branchSelect.value : '';

    const adminExtras = {
        "server_url": serverUrl,
        "device_tag": deviceTag,
        "device_name": deviceTag,
        "company_code": companyCode
    };

    if (selectedBranchId) {
        let bObj = null;
        if (currentTenantData && currentTenantData.isBranch && currentTenantData.branchId === selectedBranchId) {
            bObj = { id: currentTenantData.branchId, name: currentTenantData.branchName, code: currentTenantData.branchCode || '' };
        } else {
            const compObj = (lastQrConfig?.companies || []).find(c => c.code === companyCode);
            bObj = (compObj?.branches || branchesCache || []).find(b => b.id === selectedBranchId);
        }
        if (bObj) {
            adminExtras["branch_id"] = bObj.id;
            adminExtras["branch_name"] = bObj.name;
            adminExtras["branch_code"] = bObj.code || '';
        }
    }

    const payload = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": downloadUrl,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": checksum,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
        "android.app.extra.PROVISIONING_DEVICE_TAG": deviceTag,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": adminExtras
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
    if (!canvas) return;
    canvas.innerHTML = '';

    try {
        if (typeof QRCode !== 'undefined') {
            qrcodeInstance = new QRCode(canvas, {
                text: jsonStr,
                width: 224,
                height: 224,
                colorDark: "#0F172A",
                colorLight: "#FFFFFF",
                correctLevel: QRCode.CorrectLevel.L
            });
        } else {
            canvas.innerHTML = '<div style="padding: 20px; color: var(--text-muted); font-size: 12px; text-align: center;">جاري تحميل مكتبة الـ QR... انقر لإعادة التوليد</div>';
            setTimeout(generateQrCode, 500);
        }
    } catch (e) {
        console.error('QR rendering error', e);
        canvas.innerHTML = `<div style="padding: 16px; color: #DC2626; font-size: 12px; font-weight: 600; text-align: center;">تعذر توليد كود الـ QR: ${e.message || 'بيانات كبيرة جداً'}</div>`;
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

function setQrDeviceName(name) {
    const input = document.getElementById('qrDeviceTag');
    if (input) {
        input.value = name;
        generateQrCode();
    }
}
window.setQrDeviceName = setQrDeviceName;

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
    "com.honeywell.decode",
    "com.honeywell.demos.scandemo",
    "com.honeywell.systemsettings",
    "org.codeaurora.snapcam",
    "com.android.camera2",
    "com.google.android.calculator",
    "com.android.calculator2",
    "com.google.android.apps.maps",
    "com.android.chrome"
];

const WHITELIST_APP_FAMILIES = [
    ["org.codeaurora.snapcam", "com.android.camera2", "com.google.android.GoogleCamera", "com.honeywell.camera", "com.sec.android.app.camera", "com.android.camera"],
    ["com.google.android.calculator", "com.android.calculator2", "com.android.calculator", "com.sec.android.app.popupcalculator"],
    ["com.android.documentsui", "com.google.android.apps.nbu.files", "com.honeywell.filebrowser", "com.sec.android.app.myfiles"],
    ["com.honeywell.systemsettings", "com.honeywell.tools.ezconfig", "com.android.settings"],
    ["com.honeywell.enterprisebrowser", "com.android.chrome"],
    ["com.honeywell.decode", "com.honeywell.demos.scandemo", "com.honeywell.tools.scanwedge"]
];

function expandWhitelistAliases(pkgs) {
    if (!Array.isArray(pkgs)) return [];
    const result = [...pkgs];
    WHITELIST_APP_FAMILIES.forEach(family => {
        if (family.some(p => pkgs.includes(p))) {
            family.forEach(p => {
                if (!result.includes(p)) result.push(p);
            });
        }
    });
    return result;
}

const PRESET_APP_LABELS = {
    // Honeywell Core Enterprise Apps
    "com.honeywell.decode": "ماسح الباركود (Honeywell Barcode Scanner)",
    "com.honeywell.demos.scandemo": "تطبيق المسح التجريبي (Honeywell ScanDemo)",
    "com.honeywell.tools.scanwedge": "لوحة المسح (Honeywell ScanWedge)",
    "com.honeywell.systemsettings": "إعدادات هني ويل (Honeywell Settings)",
    "com.honeywell.enterprisebrowser": "متصفح هني ويل (Honeywell Enterprise Browser)",
    "com.honeywell.tools.ezconfig": "تكوين الأجهزة (Honeywell EZConfig)",
    "com.honeywell.filebrowser": "مدير ملفات هني ويل (Honeywell File Manager)",

    // Camera Apps
    "org.codeaurora.snapcam": "كاميرا هني ويل سناب (Honeywell SnapCam)",
    "com.android.camera2": "كاميرا النظام (Honeywell/AOSP Camera)",
    "com.google.android.GoogleCamera": "كاميرا أندرويد (Google Camera)",
    "com.honeywell.camera": "كاميرا هني ويل (Honeywell Camera)",
    "com.sec.android.app.camera": "كاميرا سامسونج (Camera)",

    // Calculator Apps
    "com.google.android.calculator": "حاسبة جوجل (Google Calculator)",
    "com.android.calculator2": "حاسبة النظام (Honeywell Calculator)",
    "com.android.calculator": "حاسبة النظام (Calculator)",
    "com.sec.android.app.popupcalculator": "حاسبة سامسونج (Calculator)",

    // Utilities & Productivity
    "com.android.chrome": "متصفح كروم (Google Chrome)",
    "com.android.documentsui": "مدير الملفات (Android Files)",
    "com.google.android.apps.nbu.files": "ملفات جوجل (Files by Google)",
    "com.android.dialer": "هاتف النظام والاتصال (Phone)",
    "com.google.android.dialer": "سجل المكالمات (Google Dialer)",
    "com.google.android.apps.maps": "خرائط جوجل (Google Maps)",
    "com.android.settings": "إعدادات نظام أندرويد (Android Settings)"
};

const QUICK_SUGGESTIONS = [
    {
        id: "hw_scanner",
        title: "ماسح الباركود (Honeywell Scanner)",
        subtitle: "محرك المسح الضوئي لأجهزة Honeywell CT47/CT40",
        packages: ["com.honeywell.decode", "com.honeywell.demos.scandemo", "com.honeywell.tools.scanwedge"],
        primaryPkg: "com.honeywell.decode",
        icon: ""
    },
    {
        id: "hw_settings",
        title: "إعدادات هني ويل (Honeywell Settings)",
        subtitle: "لوحة ضبط العتاد وتهيئة أجهزة Honeywell",
        packages: ["com.honeywell.systemsettings", "com.honeywell.tools.ezconfig", "com.android.settings"],
        primaryPkg: "com.honeywell.systemsettings",
        icon: ""
    },
    {
        id: "hw_browser",
        title: "متصفح الويب (Enterprise Browser)",
        subtitle: "تصفح الأنظمة السحابية وبوابات العمل",
        packages: ["com.honeywell.enterprisebrowser", "com.android.chrome"],
        primaryPkg: "com.honeywell.enterprisebrowser",
        icon: ""
    },
    {
        id: "camera",
        title: "كاميرا النظام (Honeywell Camera)",
        subtitle: "التقاط الصور والمستندات في أجهزة هني ويل (SnapCam/AOSP)",
        packages: ["org.codeaurora.snapcam", "com.android.camera2", "com.google.android.GoogleCamera", "com.honeywell.camera", "com.sec.android.app.camera"],
        primaryPkg: "org.codeaurora.snapcam",
        icon: ""
    },
    {
        id: "calculator",
        title: "الآلة الحاسبة (Honeywell Calc)",
        subtitle: "حاسبة النظام (Google Calculator / AOSP Calc)",
        packages: ["com.google.android.calculator", "com.android.calculator2", "com.android.calculator", "com.sec.android.app.popupcalculator"],
        primaryPkg: "com.google.android.calculator",
        icon: ""
    },
    {
        id: "files",
        title: "مدير الملفات (Honeywell Files)",
        subtitle: "تصفح وإدارة مستندات الجهاز",
        packages: ["com.android.documentsui", "com.honeywell.filebrowser", "com.google.android.apps.nbu.files"],
        primaryPkg: "com.android.documentsui",
        icon: ""
    },
    {
        id: "dialer",
        title: "هاتف النظام والاتصال (Phone)",
        subtitle: "إجراء المكالمات ولوحة الاتصال",
        packages: ["com.android.dialer", "com.google.android.dialer"],
        primaryPkg: "com.android.dialer",
        icon: ""
    },
    {
        id: "maps",
        title: "خرائط وتحديد المواقع (Maps)",
        subtitle: "تطبيق الخرائط والملاحة",
        packages: ["com.google.android.apps.maps"],
        primaryPkg: "com.google.android.apps.maps",
        icon: ""
    }
];

function initWhitelistView() {
    renderQuickSuggestions();
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
    renderQuickSuggestions();
    renderWhitelistTags();
}

function toggleQuickSuggestion(id) {
    const item = QUICK_SUGGESTIONS.find(s => s.id === id);
    if (!item) return;

    const hasAny = item.packages.some(pkg => currentWhitelistPackages.includes(pkg));
    if (hasAny) {
        currentWhitelistPackages = currentWhitelistPackages.filter(pkg => !item.packages.includes(pkg));
        showToast(`تمت إزالة ${item.title} من قائمة الكشك`, 'info');
    } else {
        item.packages.forEach(pkg => {
            if (!currentWhitelistPackages.includes(pkg)) {
                currentWhitelistPackages.push(pkg);
            }
        });
        showToast(`تمت إضافة ${item.title} إلى قائمة الكشك`, 'success');
    }

    renderQuickSuggestions();
    renderWhitelistTags();
}

function renderQuickSuggestions() {
    const grid = document.getElementById('quickSuggestionsGrid');
    if (!grid) return;

    grid.innerHTML = QUICK_SUGGESTIONS.map(s => {
        const isSelected = s.packages.some(pkg => currentWhitelistPackages.includes(pkg));
        return `
            <div class="kiosk-suggestion-card ${isSelected ? 'selected' : ''}" onclick="toggleQuickSuggestion('${s.id}')" title="انقر لتفعيل أو إلغاء تطبيق ${escapeHtml(s.title)}">
                <div class="kiosk-suggestion-info">
                    <span class="kiosk-suggestion-title">${escapeHtml(s.title)}</span>
                    <span class="kiosk-suggestion-sub">${escapeHtml(s.subtitle)}</span>
                </div>
                <div class="kiosk-suggestion-badge">
                    <span>${isSelected ? 'مسموح' : 'إضافة'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function addPreset(pkg) {
    if (!pkg) return;
    if (!currentWhitelistPackages.includes(pkg)) {
        currentWhitelistPackages.push(pkg);
        renderQuickSuggestions();
        renderWhitelistTags();
        showToast(`تمت إضافة ${PRESET_APP_LABELS[pkg] || pkg} إلى قائمة الكشك`, 'info');
    } else {
        showToast('هذا التطبيق موجود بالفعل في القائمة المسموحة', 'warning');
    }
}

function addCustomPackage() {
    const input = document.getElementById('customPackageInput');
    const inputLabel = document.getElementById('customPackageLabelInput');
    if (!input) return;

    const pkg = input.value.trim();
    const label = inputLabel ? inputLabel.value.trim() : '';

    if (!pkg) {
        showToast('يرجى كتابة اسم حزمة التطبيق مثل com.company.pos', 'warning');
        return;
    }
    if (!pkg.includes('.') || pkg.length < 3) {
        showToast('اسم الحزمة يجب أن يحتوي على نقطة مثل com.company.app', 'warning');
        return;
    }

    if (!currentWhitelistPackages.includes(pkg)) {
        currentWhitelistPackages.push(pkg);
        if (label) {
            PRESET_APP_LABELS[pkg] = `${label} (${pkg})`;
        }
        input.value = '';
        if (inputLabel) inputLabel.value = '';
        renderQuickSuggestions();
        renderWhitelistTags();
        showToast(`تمت إضافة ${label || pkg} بنجاح`, 'success');
    } else {
        showToast('هذا التطبيق مضاف مسبقاً في القائمة', 'warning');
    }
}

function removeWhitelistTag(pkg) {
    currentWhitelistPackages = currentWhitelistPackages.filter(p => p !== pkg);
    renderQuickSuggestions();
    renderWhitelistTags();
}

function clearWhitelistTags() {
    if (confirm('هل أنت متأكد من مسح جميع التطبيقات من القائمة المسموحة؟')) {
        currentWhitelistPackages = [];
        renderQuickSuggestions();
        renderWhitelistTags();
        showToast('تم مسح جميع التطبيقات من القائمة', 'info');
    }
}

function renderWhitelistTags() {
    const container = document.getElementById('whitelistTagsContainer');
    const countEl = document.getElementById('kioskSelectedCount');

    if (countEl) {
        countEl.innerText = currentWhitelistPackages.length;
    }

    if (!container) return;

    if (currentWhitelistPackages.length === 0) {
        container.innerHTML = `
            <div style="width: 100%; padding: 18px; text-align: center; color: #94A3B8; font-size: 13px;">
                لم يتم تعيين أي تطبيقات حتى الآن. انقر على الاقتراحات السريعة أعلاه أو أضف تطبيقاً مخصصاً.
            </div>
        `;
        return;
    }

    container.innerHTML = currentWhitelistPackages.map(pkg => {
        const label = PRESET_APP_LABELS[pkg] || pkg;
        return `
            <div class="whitelist-tag-chip">
                <span>${escapeHtml(label)}</span>
                <span class="whitelist-tag-pkg">${escapeHtml(pkg)}</span>
                <button type="button" class="whitelist-tag-del" onclick="removeWhitelistTag('${escapeHtml(pkg)}')" title="إزالة">&times;</button>
            </div>
        `;
    }).join('');
}

async function deployWhitelist() {
    const select = document.getElementById('whitelistDeviceSelect');
    const deviceId = select ? select.value : 'ALL';
    const statusBox = document.getElementById('whitelistStatusMessage');
    const btn = document.getElementById('btnDeployWhitelist');
    const btnTop = document.getElementById('btnDeployWhitelistTop');

    if (currentWhitelistPackages.length === 0) {
        showToast('يرجى إضافة تطبيق واحد على الأقل قبل التوزيع', 'warning');
        return;
    }

    const setButtonsLoading = (loading) => {
        [btn, btnTop].forEach(b => {
            if (!b) return;
            b.disabled = loading;
            if (loading) {
                b.innerHTML = '<span>جاري النشر والتوزيع...</span>';
            } else {
                b.innerHTML = '<span>توزيع وحفظ التطبيقات المسموحة للأجهزة</span>';
            }
        });
    };

    setButtonsLoading(true);
    if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.className = 'status-box status-loading';
        statusBox.innerText = 'جاري إرسال وتطبيق حزم التطبيقات المسموحة على أجهزة الكشك...';
    }

    try {
        const expandedPackages = expandWhitelistAliases(currentWhitelistPackages);
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
                    packages: expandedPackages
                }
            })
        });

        const rawText = await res.text();
        let data = {};
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            data = { error: `خطأ من السيرفر (${res.status}): ${rawText.substring(0, 100) || res.statusText}` };
        }

        if (res.ok && data.success) {
            showToast(`تم نشر وتفعيل ${currentWhitelistPackages.length} تطبيق بنجاح على أجهزة الكشك!`, 'success');
            if (statusBox) {
                statusBox.className = 'status-box status-success';
                statusBox.innerText = `تم النشر بنجاح! تم حفظ وتفعيل ${currentWhitelistPackages.length} تطبيق على أجهزة الكشك.`;
            }
            if (lastDevicesCache) {
                if (deviceId === 'ALL') {
                    lastDevicesCache.forEach(d => d.whitelistedApps = [...expandedPackages]);
                } else {
                    const dev = lastDevicesCache.find(d => d.id === deviceId);
                    if (dev) dev.whitelistedApps = [...expandedPackages];
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
        setButtonsLoading(false);
    }
}

// --------------------------------------------------------------------------
// GPS LIVE TRACKING & GEOFENCING
// --------------------------------------------------------------------------
const customPulseMarkerIcon = L.divIcon({
    className: '',
    html: '<div style="width:20px; height:20px; background:#2563EB; border:3px solid #FFFFFF; border-radius:50%; box-shadow:0 0 12px rgba(37,99,235,0.8), 0 2px 6px rgba(0,0,0,0.3);"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12]
});

async function openDeviceTrackModal(deviceId, deviceName) {
    activeTrackDeviceId = deviceId;
    document.getElementById('trackModalTitle').innerText = `تتبع الموقع الحي (GPS): ${deviceName || deviceId}`;
    document.getElementById('trackModal').style.display = 'flex';

    if (deviceMap) {
        try {
            deviceMap.remove();
        } catch (_) {}
        deviceMap = null;
        deviceTrackMarker = null;
        deviceGeofenceCircle = null;
    }

    deviceMap = L.map('deviceMap', { zoomControl: true }).setView([33.3152, 44.3661], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(deviceMap);

    setTimeout(() => {
        if (deviceMap) deviceMap.invalidateSize();
    }, 200);

    // Proactively send a background GPS ping to request fresh satellite/network fix
    try {
        fetch('/api/commands', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({
                deviceId: deviceId,
                command: 'REFRESH_GPS',
                payload: {}
            })
        }).catch(() => {});
    } catch (_) {}

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
        document.getElementById('hudAccuracy').innerText = `±${(loc.accuracy || 0).toFixed(0)} م`;

        const isBreached = device.geofenceBreach;
        const statusEl = document.getElementById('hudGeofenceStatus');
        if (statusEl) {
            if (isBreached) {
                statusEl.innerText = 'خارج نطاق الأمان';
                statusEl.className = 'hud-val status-breach';
            } else {
                statusEl.innerText = 'داخل نطاق الأمان';
                statusEl.className = 'hud-val status-safe';
            }
        }

        if (deviceTrackMarker) {
            deviceTrackMarker.setLatLng([lat, lng]);
        } else {
            deviceTrackMarker = L.marker([lat, lng], { icon: customPulseMarkerIcon }).addTo(deviceMap);
        }

        deviceTrackMarker.bindPopup(`
            <div style="font-family:Cairo,Inter,sans-serif; text-align:center;">
                <strong style="color:#0F172A; font-size:13px;">${escapeHtml(device.name || device.id)}</strong><br>
                <small style="color:#64748B;">${escapeHtml(device.model || '')} • ${device.battery}% بطارية</small><br>
                <small style="color:#2563EB;">إحداثيات: ${lat.toFixed(5)}, ${lng.toFixed(5)}</small>
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
    } else {
        const hudCoords = document.getElementById('hudCoords');
        if (hudCoords) hudCoords.innerText = 'بانتظار إشارة GPS / الأقمار الصناعية...';
        const hudSpeed = document.getElementById('hudSpeed');
        if (hudSpeed) hudSpeed.innerText = '--';
        const hudAccuracy = document.getElementById('hudAccuracy');
        if (hudAccuracy) hudAccuracy.innerText = '--';
        const statusEl = document.getElementById('hudGeofenceStatus');
        if (statusEl) {
            statusEl.innerText = 'غير محدد بعد';
            statusEl.className = 'hud-val';
        }
    }
}

async function requestGpsPing() {
    if (!activeTrackDeviceId) {
        showToast('يرجى تحديد جهاز متصل أولاً', 'warning');
        return;
    }
    showToast('جاري إرسال أمر التقاط وتحديث إحداثيات GPS إلى الجهاز...', 'info');
    try {
        const res = await fetch('/api/commands', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({
                deviceId: activeTrackDeviceId,
                command: 'REFRESH_GPS',
                payload: {}
            })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('تم إرسال أمر تحديث الإحداثيات بنجاح!', 'success');
            setTimeout(fetchDevices, 1500);
            setTimeout(fetchDevices, 3500);
        } else {
            showToast('فشل إرسال الأمر: ' + (data.error || 'خطأ غير معروف'), 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالخادم: ' + e.message, 'error');
    }
}

function closeDeviceTrackModal() {
    document.getElementById('trackModal').style.display = 'none';
    activeTrackDeviceId = null;
}

function centerOnDeviceLocation() {
    if (!deviceMap || !activeTrackDeviceId) {
        showToast('يرجى تحديد جهاز متصل لعرض موقعه على الخريطة', 'warning');
        return;
    }
    const device = (lastDevicesCache || []).find(d => d.id === activeTrackDeviceId);
    if (device && device.location && device.location.lat && device.location.lng) {
        deviceMap.setView([device.location.lat, device.location.lng], 16);
        if (deviceTrackMarker) deviceTrackMarker.openPopup();
    } else {
        showToast('إحداثيات الجهاز غير متوفرة حالياً', 'warning');
    }
}

function toggleDeviceGeofence(enabled) {
    if (!deviceMap) return;
    if (!enabled) {
        if (deviceGeofenceCircle) {
            deviceMap.removeLayer(deviceGeofenceCircle);
            deviceGeofenceCircle = null;
        }
    } else if (activeTrackDeviceId) {
        const device = (lastDevicesCache || []).find(d => d.id === activeTrackDeviceId);
        if (device && device.location && device.location.lat && device.location.lng) {
            const radius = parseInt(document.getElementById('modalGeoRadius')?.value, 10) || 3000;
            if (deviceGeofenceCircle) {
                deviceMap.removeLayer(deviceGeofenceCircle);
            }
            deviceGeofenceCircle = L.circle([device.location.lat, device.location.lng], {
                color: '#2563EB',
                fillColor: '#3B82F6',
                fillOpacity: 0.12,
                radius: radius,
                weight: 2
            }).addTo(deviceMap);
        }
    }
}

async function saveDeviceGeofence() {
    const enabled = document.getElementById('modalGeoEnabled')?.checked ?? true;
    const radiusMeters = parseInt(document.getElementById('modalGeoRadius')?.value, 10) || 3000;
    let center = null;
    if (activeTrackDeviceId) {
        const dev = (lastDevicesCache || []).find(d => d.id === activeTrackDeviceId);
        if (dev && dev.location && dev.location.lat && dev.location.lng) {
            center = { lat: dev.location.lat, lng: dev.location.lng };
        }
    }
    try {
        const payload = { enabled, radiusMeters };
        if (center) payload.center = center;
        const res = await fetch('/api/geofence', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('تم حفظ إعدادات النطاق الجغرافي (Geofence) بنجاح!', 'success');
            if (activeTrackDeviceId) updateDeviceTrackModal(activeTrackDeviceId);
        } else {
            showToast(data.error || 'فشل حفظ إعدادات النطاق الجغرافي', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر أثناء حفظ النطاق الجغرافي', 'error');
    }
}

function dismissSecurityBanner() {
    const banner = document.getElementById('securityAlertBanner');
    if (banner) {
        banner.style.display = 'none';
    }
}

async function disarmActiveSiren() {
    const compromised = (lastDevicesCache || []).filter(d => d.tamperDetected || d.geofenceBreach);
    if (compromised.length > 0) {
        for (const dev of compromised) {
            await dispatchRemoteCommand(dev.id, 'DISARM_TAMPER');
        }
        showToast('تم إرسال أمر تعطيل الإنذار وفك القفل الأمني لجميع الأجهزة المتأثرة.', 'success');
    } else if (activeTrackDeviceId) {
        await dispatchRemoteCommand(activeTrackDeviceId, 'DISARM_TAMPER');
        showToast('تم إرسال أمر تعطيل الإنذار للجهاز النشط.', 'success');
    } else {
        showToast('تم إيقاف الإنذار بنجاح.', 'info');
    }
    dismissSecurityBanner();
}

function closeModal(modalId = 'commandModal') {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

window.switchTab = showTab;

// --------------------------------------------------------------------------
// REMOTE CONTROL STREAM & TOUCH
// --------------------------------------------------------------------------
let activeStreamDeviceId = null;
let isPollingScreen = false;
let wasDacOpenBeforeStream = false;

function openScreenStream(deviceId, deviceName) {
    activeStreamDeviceId = deviceId;
    isPollingScreen = false;

    // If Device Action Center is open, hide it to prevent double-modal clutter
    const dacModal = document.getElementById('deviceActionCenterModal');
    if (dacModal && (dacModal.classList.contains('show') || dacModal.style.display === 'flex')) {
        wasDacOpenBeforeStream = true;
        dacModal.classList.remove('show');
        dacModal.style.display = 'none';
    } else {
        wasDacOpenBeforeStream = false;
    }

    const titleEl = document.getElementById('screenModalTitle');
    if (titleEl) titleEl.innerText = `التحكم المباشر: ${deviceName || deviceId}`;

    const activeNameEl = document.getElementById('streamActiveDeviceName');
    if (activeNameEl) activeNameEl.innerText = deviceName || deviceId;

    const activeIdEl = document.getElementById('streamActiveDeviceId');
    if (activeIdEl) activeIdEl.innerText = deviceId;

    const dev = (lastDevicesCache || []).find(d => d.id === deviceId);
    const kioskLabel = document.getElementById('streamKioskToggleLabel');
    if (kioskLabel) {
        kioskLabel.innerText = dev?.isKiosk ? 'إلغاء وضع الكشك' : 'تفعيل وضع الكشك';
    }

    const a11yAlert = document.getElementById('streamA11yAlert');
    if (a11yAlert) {
        // If device explicitly reports false, show the alert; if true, hide it
        if (dev && dev.isAccessibilityActive === false) {
            a11yAlert.style.display = 'flex';
        } else {
            a11yAlert.style.display = 'none';
        }
    }

    const screenModal = document.getElementById('screenModal');
    if (screenModal) {
        screenModal.style.display = 'flex';
        screenModal.classList.add('show');
    }

    const placeholder = document.getElementById('streamPlaceholder');
    if (placeholder) placeholder.style.display = 'flex';

    const streamImg = document.getElementById('streamImg');
    if (streamImg) streamImg.style.display = 'none';

    setupPhoneScreenInteractions();

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

    // Proactively illuminate/wake display if screen is currently sleeping
    fetch(`/api/devices/${encodeURIComponent(deviceId)}/touch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Token': currentTenantToken || ''
        },
        body: JSON.stringify({ action: 'wake' })
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
    const screenModal = document.getElementById('screenModal');
    if (screenModal) {
        screenModal.style.display = 'none';
        screenModal.classList.remove('show');
    }
    if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
    }
    const prevDevice = activeStreamDeviceId;
    activeStreamDeviceId = null;
    isPollingScreen = false;

    if (prevDevice) {
        fetch('/api/commands', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({
                deviceId: prevDevice,
                command: 'STOP_SCREEN_STREAM',
                payload: { timestamp: Date.now() }
            })
        }).catch(() => { });
    }

    // If stream was launched from Device Action Center, seamlessly restore it
    if (wasDacOpenBeforeStream && prevDevice) {
        wasDacOpenBeforeStream = false;
        openDeviceActionCenter(prevDevice);
    }
}

async function sendOpenA11ySettingsCommand() {
    if (!activeStreamDeviceId) return;
    try {
        const res = await fetch('/api/commands', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({
                deviceId: activeStreamDeviceId,
                command: 'OPEN_ACCESSIBILITY_SETTINGS',
                payload: { timestamp: Date.now() }
            })
        });
        if (res.ok) {
            showToast('تم إرسال أمر فتح شاشة تفعيل التحكم عن بعد على الهاتف بنجاح.', 'success');
        } else {
            showToast('تعذر إرسال الأمر للجهاز.', 'error');
        }
    } catch (_) {
        showToast('خطأ في الاتصال بالخادم.', 'error');
    }
}

function triggerNavKey(key, event) {
    if (event) {
        try { event.stopPropagation(); } catch (_) { }
        const container = document.getElementById('phoneScreenContainer');
        if (container && event.clientX) {
            const rect = container.getBoundingClientRect();
            const xRatio = (event.clientX - rect.left) / rect.width;
            const yRatio = (event.clientY - rect.top) / rect.height;
            const ripple = document.getElementById('touchRipple');
            if (ripple) {
                ripple.style.left = `${(xRatio * 100)}%`;
                ripple.style.top = `${(yRatio * 100)}%`;
                ripple.classList.add('active');
                setTimeout(() => ripple.classList.remove('active'), 250);
            }
        }
    }
    sendDeviceKey(key);
}
window.triggerNavKey = triggerNavKey;

function setupPhoneScreenInteractions() {
    const container = document.getElementById('phoneScreenContainer');
    if (!container || container.dataset.interactionsReady === 'true') return;
    container.dataset.interactionsReady = 'true';

    let isDown = false;
    let startClientX = 0;
    let startClientY = 0;
    let startTime = 0;
    let activePointerId = null;

    const ripple = document.getElementById('touchRipple');
    const trailSvg = document.getElementById('touchTrailSvg');

    function showRippleAt(clientX, clientY) {
        if (!ripple) return;
        const rect = container.getBoundingClientRect();
        const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
        ripple.style.left = `${xPct}%`;
        ripple.style.top = `${yPct}%`;
        ripple.classList.add('active');
    }

    function hideRipple() {
        if (ripple) ripple.classList.remove('active');
    }

    function renderDragLine(sX, sY, curX, curY) {
        if (!trailSvg) return;
        trailSvg.innerHTML = `
            <defs>
                <linearGradient id="dragTrailGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9"/>
                    <stop offset="100%" stop-color="#ffffff" stop-opacity="0.4"/>
                </linearGradient>
            </defs>
            <line x1="${sX}" y1="${sY}" x2="${curX}" y2="${curY}" stroke="url(#dragTrailGrad)" stroke-width="4" stroke-linecap="round" stroke-dasharray="6,4"/>
            <circle cx="${curX}" cy="${curY}" r="7" fill="#38bdf8" stroke="#ffffff" stroke-width="2.5" />
        `;
    }

    function clearDragLine() {
        if (trailSvg) trailSvg.innerHTML = '';
    }

    container.addEventListener('pointerdown', (e) => {
        if (!activeStreamDeviceId) return;
        // Don't intercept dedicated navigation strip targets
        if (e.target.closest('.stream-nav-touch-strip')) return;

        e.preventDefault();
        isDown = true;
        activePointerId = e.pointerId;
        try { container.setPointerCapture(e.pointerId); } catch (_) {}
        container.classList.add('is-dragging');

        startClientX = e.clientX;
        startClientY = e.clientY;
        startTime = Date.now();

        showRippleAt(startClientX, startClientY);
    });

    container.addEventListener('pointermove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        const sX = startClientX - rect.left;
        const sY = startClientY - rect.top;

        const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
        if (dist > 6) {
            renderDragLine(sX, sY, curX, curY);
            showRippleAt(e.clientX, e.clientY);
        }
    });

    function onPointerEnd(e) {
        if (!isDown) return;
        isDown = false;
        container.classList.remove('is-dragging');
        clearDragLine();
        setTimeout(hideRipple, 200);

        if (activePointerId !== null) {
            try { container.releasePointerCapture(activePointerId); } catch (_) {}
            activePointerId = null;
        }

        if (!activeStreamDeviceId) return;
        const rect = container.getBoundingClientRect();
        const endClientX = e.clientX;
        const endClientY = e.clientY;

        const dx = endClientX - startClientX;
        const dy = endClientY - startClientY;
        const dist = Math.hypot(dx, dy);

        const startXRatio = Math.max(0, Math.min(1, (startClientX - rect.left) / rect.width));
        const startYRatio = Math.max(0, Math.min(1, (startClientY - rect.top) / rect.height));
        const endXRatio = Math.max(0, Math.min(1, (endClientX - rect.left) / rect.width));
        const endYRatio = Math.max(0, Math.min(1, (endClientY - rect.top) / rect.height));
        const duration = Math.min(500, Math.max(120, Date.now() - startTime));

        if (dist < 10) {
            // Precision TAP
            // Android System Navigation Bar Interceptor (bottom 9.5% of the screen)
            if (startYRatio >= 0.905) {
                if (startXRatio < 0.36) {
                    sendDeviceKey('BACK');
                    return;
                } else if (startXRatio > 0.64) {
                    sendDeviceKey('RECENTS');
                    return;
                } else {
                    sendDeviceKey('HOME');
                    return;
                }
            }

            fetch(`/api/devices/${encodeURIComponent(activeStreamDeviceId)}/touch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Token': currentTenantToken || ''
                },
                body: JSON.stringify({
                    action: 'tap',
                    xRatio: startXRatio,
                    yRatio: startYRatio
                })
            }).then(() => {
                setTimeout(pollScreenFrame, 150);
                setTimeout(pollScreenFrame, 350);
            }).catch(() => { });
        } else {
            // SWIPE / DRAG (Unlocking lock screen, scrolling, swiping notifications)
            const primaryDirection = Math.abs(dy) >= Math.abs(dx)
                ? (dy < 0 ? 'up' : 'down')
                : (dx < 0 ? 'left' : 'right');

            fetch(`/api/devices/${encodeURIComponent(activeStreamDeviceId)}/touch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Token': currentTenantToken || ''
                },
                body: JSON.stringify({
                    action: 'swipe',
                    direction: primaryDirection,
                    startXRatio,
                    startYRatio,
                    endXRatio,
                    endYRatio,
                    duration
                })
            }).then(() => {
                setTimeout(pollScreenFrame, 180);
                setTimeout(pollScreenFrame, 380);
                setTimeout(pollScreenFrame, 750);
            }).catch(() => { });
        }
    }

    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);
}

// Fallback compatibility
function handlePhoneScreenClick(event) {
    if (!activeStreamDeviceId) return;
    const container = document.getElementById('phoneScreenContainer');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;

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
    }).catch(() => { });
}
window.handlePhoneScreenClick = handlePhoneScreenClick;
window.setupPhoneScreenInteractions = setupPhoneScreenInteractions;

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

function wakeDevice() {
    if (!activeStreamDeviceId) return;
    const devId = activeStreamDeviceId;
    fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Token': currentTenantToken || '' },
        body: JSON.stringify({ deviceId: devId, command: 'WAKE_SCREEN' })
    }).catch(() => { });
    fetch(`/api/devices/${encodeURIComponent(devId)}/touch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Token': currentTenantToken || '' },
        body: JSON.stringify({ action: 'wake' })
    }).catch(() => { });
    showNotification('تم إرسال إشارة إيقاظ الشاشة للهاتف', 'info');
    setTimeout(pollScreenFrame, 300);
    setTimeout(pollScreenFrame, 800);
}
window.wakeDevice = wakeDevice;

function unlockDevice() {
    if (!activeStreamDeviceId) return;
    const devId = activeStreamDeviceId;
    fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Token': currentTenantToken || '' },
        body: JSON.stringify({ deviceId: devId, command: 'UNLOCK_SCREEN' })
    }).catch(() => { });
    fetch(`/api/devices/${encodeURIComponent(devId)}/touch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Token': currentTenantToken || '' },
        body: JSON.stringify({
            action: 'swipe',
            direction: 'up',
            startXRatio: 0.5,
            startYRatio: 0.88,
            endXRatio: 0.5,
            endYRatio: 0.18,
            duration: 250
        })
    }).catch(() => { });
    showNotification('تم إرسال أمر فتح القفل وتخطي شاشة القفل للهاتف', 'info');
    setTimeout(pollScreenFrame, 300);
    setTimeout(pollScreenFrame, 700);
    setTimeout(pollScreenFrame, 1200);
}
window.unlockDevice = unlockDevice;

function lockDeviceScreen() {
    if (!activeStreamDeviceId) return;
    const devId = activeStreamDeviceId;
    fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Token': currentTenantToken || '' },
        body: JSON.stringify({ deviceId: devId, command: 'LOCK_SCREEN' })
    }).catch(() => { });
    fetch(`/api/devices/${encodeURIComponent(devId)}/touch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Token': currentTenantToken || '' },
        body: JSON.stringify({ action: 'lock' })
    }).catch(() => { });
    showNotification('تم إرسال أمر قفل الشاشة للهاتف', 'info');
    setTimeout(pollScreenFrame, 300);
    setTimeout(pollScreenFrame, 700);
}
window.lockDeviceScreen = lockDeviceScreen;

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

function streamExecuteLock() {
    if (!activeStreamDeviceId) return;
    promptCommand(activeStreamDeviceId, 'LOCK_DEVICE', 'قفل شاشة الجهاز');
}

function streamExecuteKioskToggle() {
    if (!activeStreamDeviceId) return;
    const dev = (lastDevicesCache || []).find(d => d.id === activeStreamDeviceId);
    if (dev?.isKiosk) {
        promptCommand(activeStreamDeviceId, 'SET_KIOSK_MODE', 'Exit Kiosk Mode', { enable: false });
    } else {
        promptCommand(activeStreamDeviceId, 'SET_KIOSK_MODE', 'Enter Kiosk Mode', { enable: true });
    }
}

function streamExecuteReboot() {
    if (!activeStreamDeviceId) return;
    promptCommand(activeStreamDeviceId, 'REBOOT', 'إعادة تشغيل الهاتف');
}

function streamExecuteSiren() {
    if (!activeStreamDeviceId) return;
    promptCommand(activeStreamDeviceId, 'TEST_TAMPER_ALARM', 'إطلاق صفارة الإنذار');
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
    const autoWhitelist = document.getElementById('chkOtaAutoWhitelist') ? document.getElementById('chkOtaAutoWhitelist').checked : true;

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
            body: JSON.stringify({ deviceId, apkUrl, packageName, autoWhitelist })
        });
        const data = await res.json();
        if (data.success) {
            const successMsg = autoWhitelist && packageName && packageName !== 'ota_app'
                ? 'تمت جدولة التثبيت وإضافة التطبيق تلقائياً لشاشة الكشك!'
                : 'تمت جدولة تثبيت التطبيق بنجاح! ستقوم الأجهزة بتحميله وتثبيته فوراً.';
            showToast(successMsg, 'success');
            if (statusBox) {
                statusBox.className = 'status-box status-success';
                statusBox.innerText = successMsg;
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

                    // Populate real package name from server extraction
                    const pkgInput = document.getElementById('apkPackageInput');
                    if (pkgInput) {
                        if (data.packageName) {
                            pkgInput.value = data.packageName;
                        } else if (!pkgInput.value) {
                            pkgInput.placeholder = 'يرجى كتابة معرّف الحزمة مثل com.example.app';
                        }
                    }

                    if (percentLabel) percentLabel.innerText = 'اكتمل الرفع 100%';
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
            updateFleetBranchFilterDropdown();
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
                <td colspan="7" style="padding:40px; text-align:center; color:#64748B;">
                    <div style="font-size:15px; font-weight:700; color:#0F172A; margin-bottom:6px;">لم يتم إنشاء ويبات فرعية بعد</div>
                    <div style="font-size:13px; color:#64748B;">انقر على زر "إضافة ويب فرعي جديد" لإنشاء حساب مستقل لمسؤولي فروعك برقم دخول خاص.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = branches.map(b => {
        const branchPwd = b.password || '123456';
        const dCount = b.devicesCount || 0;
        const oCount = b.onlineCount || 0;
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
                <div style="display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span class="branch-devices-counter-badge" style="background:${dCount > 0 ? '#F0FDF4' : '#F8FAFC'}; border:1px solid ${dCount > 0 ? '#BBF7D0' : '#CBD5E1'}; color:${dCount > 0 ? '#166534' : '#64748B'}; padding:3px 8px; border-radius:4px; font-size:12px; font-weight:700;">
                        ${dCount} أجهزة (${oCount} متصل)
                    </span>
                    <button type="button" class="btn btn-primary-soft btn-xs" onclick="openBranchDevicesModal('${b.id}')" title="استعراض أجهزة الفرع والتحكم بها من ويب الشركة الرئيسي">
                        استعراض وتحكم
                    </button>
                </div>
            </td>
            <td>
                <div style="display:inline-flex; align-items:center; gap:6px; background:#F8FAFC; border:1px solid #CBD5E1; border-radius:6px; padding:3px 8px;">
                    <span id="branchPwdText_${b.id}" style="font-family:monospace; font-size:13px; font-weight:600; color:#334155; min-width:65px; letter-spacing:1px; user-select:all;">••••••</span>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="toggleBranchPasswordVisibility('${b.id}', '${escapeHtml(branchPwd)}')" title="إظهار / إخفاء كلمة المرور" style="padding:2px 8px; font-size:11px; cursor:pointer;">
                        <span id="branchPwdEye_${b.id}">عرض</span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="copyToClipboard('${escapeHtml(branchPwd)}', 'تم نسخ كلمة مرور الفرع إلى الحافظة!')" title="نسخ كلمة المرور" style="padding:2px 8px; font-size:11px; cursor:pointer;">
                        نسخ
                    </button>
                </div>
            </td>
            <td>
                <small style="color:#64748B; font-family:monospace;">${escapeHtml((b.createdAt || '').slice(0, 10))}</small>
            </td>
            <td>
                <div style="display:inline-flex; gap:6px; align-items:center;">
                    <button class="btn btn-secondary btn-xs" onclick="openChangeBranchPasswordModal('${b.id}', '${escapeHtml(b.name)}', '${escapeHtml(b.number || '')}', '${escapeHtml(branchPwd)}')" title="تغيير كلمة المرور لهذا الفرع">
                        تغيير كلمة المرور
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

// --------------------------------------------------------------------------
// BRANCH DEVICES & DIRECT CENTRAL CONTROL (أجهزة وتحكم الفرع المركزي)
// --------------------------------------------------------------------------
let currentActiveBranchId = null;

async function openBranchDevicesModal(branchId) {
    const branch = (branchesCache || []).find(b => b.id === branchId);
    if (!branch) {
        showToast('لم يتم العثور على بيانات الفرع', 'error');
        return;
    }

    currentActiveBranchId = branchId;
    const idInput = document.getElementById('currentActiveBranchId');
    if (idInput) idInput.value = branchId;

    const titleEl = document.getElementById('branchDevicesModalTitle');
    if (titleEl) titleEl.innerText = `أجهزة وتحكم فرع: ${branch.name}`;

    const codeBadge = document.getElementById('branchDevicesModalCodeBadge');
    if (codeBadge) codeBadge.innerText = `كود: ${branch.code || '-'}`;

    const phoneBadge = document.getElementById('branchDevicesModalPhoneBadge');
    if (phoneBadge) phoneBadge.innerText = `معرف الدخول: ${branch.number || '-'}`;

    // Ensure all devices are loaded so unassigned devices can be picked
    if (selectedFleetBranch && selectedFleetBranch !== 'ALL') {
        try {
            const res = await fetch(`/api/devices?companyCode=${encodeURIComponent(currentCompanyCode)}&branchId=ALL`, {
                headers: { 'X-Tenant-Token': currentTenantToken || '' }
            });
            const allDevs = await res.json();
            if (Array.isArray(allDevs)) lastDevicesCache = allDevs;
        } catch (_) {}
    }

    populateBranchAssignSelect(branchId);
    renderBranchDevicesList(branchId);

    const modal = document.getElementById('modalBranchDevices');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

function closeBranchDevicesModal() {
    currentActiveBranchId = null;
    const modal = document.getElementById('modalBranchDevices');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

function populateBranchAssignSelect(currentBranchId) {
    const sel = document.getElementById('branchAssignDeviceSelect');
    if (!sel) return;

    const allDevs = lastDevicesCache || [];
    let html = '<option value="">-- اختر جهازاً لربطه بهذا الفرع --</option>';
    allDevs.forEach(d => {
        const isThisBranch = d.branchId === currentBranchId;
        if (!isThisBranch) {
            const currentBranchLabel = d.branchName ? `(حالياً في: ${d.branchName})` : '(غير مخصص)';
            html += `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || d.id)} - ${escapeHtml(d.model || '')} ${currentBranchLabel}</option>`;
        }
    });
    sel.innerHTML = html;
}

function renderBranchDevicesList(branchId) {
    const allDevs = lastDevicesCache || [];
    const branchDevs = allDevs.filter(d => d.branchId === branchId);

    // Update KPI counters
    const totalCountEl = document.getElementById('branchTotalDevicesCount');
    if (totalCountEl) totalCountEl.innerText = branchDevs.length;

    const onlineCountEl = document.getElementById('branchOnlineDevicesCount');
    if (onlineCountEl) onlineCountEl.innerText = branchDevs.filter(d => d.isOnline).length;

    const kioskCountEl = document.getElementById('branchKioskDevicesCount');
    if (kioskCountEl) kioskCountEl.innerText = branchDevs.filter(d => d.isKiosk).length;

    const tbody = document.getElementById('branchDevicesTableBody');
    if (!tbody) return;

    if (branchDevs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:36px; text-align:center; color:#64748B;">
                    <div style="font-size:14px; font-weight:700; color:#0F172A; margin-bottom:4px;">لا توجد أجهزة مربوطة بهذا الفرع حالياً</div>
                    <div style="font-size:12.5px; color:#64748B;">استخدم القائمة أعلاه لاختيار جهاز من أسطول الشركة وتعيينه لهذا الفرع.</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = branchDevs.map(d => {
        const brand = detectDeviceBrand(d);
        const onlineTag = d.isOnline
            ? '<span class="status-tag tag-online"><span class="dot online"></span> Online</span>'
            : '<span class="status-tag tag-offline"><span class="dot" style="background:#94A3B8;"></span> Offline</span>';
        const kioskTag = d.isKiosk
            ? '<span class="status-tag tag-kiosk-active">Locked (مقيد)</span>'
            : '<span class="status-tag tag-kiosk-idle">Unrestricted (حر)</span>';

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="brand-chip brand-chip-${brand}" style="font-size:9px; padding:2px 5px;">${brand.toUpperCase()}</span>
                        <div>
                            <strong style="color:#0F172A; font-size:13.5px;">${escapeHtml(d.name || d.id)}</strong><br>
                            <small style="color:#64748B; font-family:monospace; font-size:11px;">${escapeHtml(d.id)}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <strong style="color:#1E293B; font-size:12.5px;">${escapeHtml(d.model || 'Android')}</strong><br>
                    <small style="color:#64748B;">v${escapeHtml(d.os || '')}</small>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
                        <strong style="color:#0F172A; font-size:12px;">${d.battery || 0}%</strong>
                        ${d.isCharging ? '<small style="color:#D97706; font-size:10.5px; font-weight:700;">(شحن)</small>' : ''}
                    </div>
                    ${onlineTag}
                </td>
                <td>${kioskTag}</td>
                <td>
                    <code style="background:#F1F5F9; padding:2px 6px; font-size:11px; color:#334155;">${escapeHtml(d.ipAddress || 'Unknown')}</code>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary-soft btn-xs" onclick="openScreenStream('${d.id}', '${escapeHtml(d.name || d.id)}')" title="بث شاشة الجهاز والتحكم باللمس مباشرة">
                            بث وتحكم
                        </button>
                        <button type="button" class="btn btn-secondary btn-xs" onclick="promptCommand('${d.id}', 'LOCK_NOW', 'قفل شاشة الجهاز')" title="قفل شاشة الجهاز فوراً">
                            قفل
                        </button>
                        <button type="button" class="btn btn-secondary btn-xs" onclick="promptCommand('${d.id}', 'SET_KIOSK_MODE', '${d.isKiosk ? 'إلغاء وضع الكشك' : 'تفعيل وضع الكشك'}', { enable: ${!d.isKiosk} })" title="تبديل وضع الكشك">
                            ${d.isKiosk ? 'إلغاء الكشك' : 'تفعيل الكشك'}
                        </button>
                        <button type="button" class="btn btn-secondary btn-xs" onclick="openDeviceTrackModal('${d.id}', '${escapeHtml(d.name || d.id)}')" title="تتبع الموقع الجغرافي">
                            GPS
                        </button>
                        <button type="button" class="btn btn-danger-soft btn-xs" onclick="unassignDeviceFromBranch('${d.id}')" title="فك ارتباط هذا الجهاز من هذا الفرع">
                            فك الارتباط
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function submitAssignDeviceToCurrentBranch() {
    const sel = document.getElementById('branchAssignDeviceSelect');
    if (!sel || !sel.value) {
        showToast('يرجى اختيار جهاز من القائمة أولاً', 'warning');
        return;
    }
    const deviceId = sel.value;
    const branchId = currentActiveBranchId || document.getElementById('currentActiveBranchId')?.value;
    if (!branchId) {
        showToast('حدث خطأ في تحديد الفرع', 'error');
        return;
    }
    await assignDeviceToBranch(deviceId, branchId);
}

async function assignDeviceToBranch(deviceId, branchId) {
    if (!deviceId || !branchId) return;
    try {
        const res = await fetch('/api/tenant/devices/assign-branch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ deviceId, branchId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'تم ربط الجهاز بالفرع بنجاح', 'success');
            await fetchDevices();
            await fetchBranches();
            if (currentActiveBranchId) {
                populateBranchAssignSelect(currentActiveBranchId);
                renderBranchDevicesList(currentActiveBranchId);
            }
        } else {
            showToast(data.error || 'فشل ربط الجهاز بالفرع', 'error');
        }
    } catch (e) {
        console.error('Failed to assign branch', e);
        showToast('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

async function unassignDeviceFromBranch(deviceId) {
    if (!deviceId) return;
    if (!confirm('هل أنت متأكد من فك ارتباط هذا الجهاز من الفرع وإرجاعه للإدارة العامة؟')) return;
    try {
        const res = await fetch('/api/tenant/devices/assign-branch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ deviceId, branchId: 'UNASSIGN' })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'تم فك ارتباط الجهاز بنجاح', 'success');
            await fetchDevices();
            await fetchBranches();
            if (currentActiveBranchId) {
                populateBranchAssignSelect(currentActiveBranchId);
                renderBranchDevicesList(currentActiveBranchId);
            }
        } else {
            showToast(data.error || 'فشل فك ارتباط الجهاز', 'error');
        }
    } catch (e) {
        console.error('Failed to unassign branch', e);
        showToast('حدث خطأ في الاتصال بالخادم', 'error');
    }
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
        if (eyeEl) eyeEl.innerText = 'إخفاء';
    } else {
        textEl.innerText = '••••••';
        textEl.style.color = '#334155';
        textEl.style.letterSpacing = '1px';
        if (eyeEl) eyeEl.innerText = 'عرض';
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
    if (eyeIcon) eyeIcon.innerText = 'عرض';

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
        if (eyeIcon) eyeIcon.innerText = 'إخفاء';
    } else {
        pwdInput.type = 'password';
        if (eyeIcon) eyeIcon.innerText = 'عرض';
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
    if (container) {
        container.style.display = 'flex';
    }
}

function toggleLoginPasswordVisibility() {
    const input = document.getElementById('companyLoginPassword');
    const eyeIcon = document.getElementById('loginEyeIcon');
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        if (eyeIcon) {
            eyeIcon.textContent = 'إخفاء';
        }
    } else {
        input.type = 'password';
        if (eyeIcon) {
            eyeIcon.textContent = 'إظهار';
        }
    }
}

async function handleCompanyLogin(event) {
    event.preventDefault();
    const loginId = document.getElementById('companyLoginEmail').value.trim();
    const password = document.getElementById('companyLoginPassword').value.trim();
    const btn = document.getElementById('btnCompanyLoginSubmit');
    const btnLabel = document.getElementById('loginSubmitBtnLabel');
    const btnSpinner = document.getElementById('loginBtnSpinner');
    const errBox = document.getElementById('companyLoginError');
    const errText = document.getElementById('companyLoginErrorText');
    const card = document.getElementById('companyLoginCard');

    btn.disabled = true;
    if (btnSpinner) btnSpinner.style.display = 'inline-block';
    if (btnLabel) btnLabel.innerText = 'جاري التحقق والاتصال...';
    if (errBox) errBox.style.display = 'none';

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
            const msg = data.error || 'بيانات الدخول أو كلمة المرور غير صحيحة.';
            if (errText) errText.innerText = msg;
            else if (errBox) errBox.innerText = msg;
            if (errBox) errBox.style.display = 'flex';
            if (card) {
                card.classList.remove('shake-error');
                void card.offsetWidth;
                card.classList.add('shake-error');
            }
        }
    } catch (e) {
        const msg = 'تعذر الاتصال بخادم Nexus، يرجى المحاولة لاحقاً.';
        if (errText) errText.innerText = msg;
        else if (errBox) errBox.innerText = msg;
        if (errBox) errBox.style.display = 'flex';
        if (card) {
            card.classList.remove('shake-error');
            void card.offsetWidth;
            card.classList.add('shake-error');
        }
    } finally {
        btn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnLabel) btnLabel.innerText = 'تسجيل الدخول إلى البوابة';
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
// DEVICE ACTIONS & DETAILS CENTER (DAC)
// --------------------------------------------------------------------------
let activeDacDeviceId = null;
let activeDacBrandOverride = 'auto';

function detectDeviceBrand(d) {
    if (!d) return 'honeywell';
    const text = `${d.model || ''} ${d.name || ''} ${d.id || ''} ${d.manufacturer || ''} ${d.brand || ''}`.toLowerCase();
    if (text.includes('honeywell') || text.includes('eda') || text.includes('ct47') || text.includes('ct40') || text.includes('ct60') || text.includes('ct45') || text.includes('ct30') || text.includes('scanpal') || text.includes('dolphin') || text.includes('ck65')) {
        return 'honeywell';
    }
    if (text.includes('samsung') || text.includes('sm-') || text.includes('galaxy') || text.includes('sec_') || text.includes('s24') || text.includes('s23') || text.includes('s22') || text.includes('s21') || text.includes('a54') || text.includes('a34')) {
        return 'samsung';
    }
    if (text.includes('zebra') || text.includes('tc5') || text.includes('tc2') || text.includes('tc7') || text.includes('mc3') || text.includes('mc9')) {
        return 'zebra';
    }
    if (text.includes('sunmi') || text.includes('pos') || text.includes('v2') || text.includes('t2') || text.includes('p2') || text.includes('pax')) {
        return 'pos';
    }
    return 'honeywell';
}

function openDeviceActionCenter(deviceId, forcedBrand = null) {
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === deviceId);
    if (!device) {
        showToast('لم يتم العثور على بيانات الجهاز', 'error');
        return;
    }

    activeDacDeviceId = deviceId;
    if (forcedBrand) {
        activeDacBrandOverride = forcedBrand;
        const brandSel = document.getElementById('dacBrandSelect');
        if (brandSel) brandSel.value = forcedBrand;
    } else {
        activeDacBrandOverride = 'auto';
        const brandSel = document.getElementById('dacBrandSelect');
        if (brandSel) brandSel.value = 'auto';
    }

    const modal = document.getElementById('deviceActionCenterModal');
    if (!modal) return;

    modal.classList.add('show');
    modal.style.display = 'flex';

    updateDacModalContent(device);
}

function closeDeviceActionCenter() {
    activeDacDeviceId = null;
    const modal = document.getElementById('deviceActionCenterModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

function onDacBrandOverride(val) {
    activeDacBrandOverride = val;
    if (activeDacDeviceId) {
        const safeDevices = lastDevicesCache || [];
        const device = safeDevices.find(d => d.id === activeDacDeviceId);
        if (device) {
            updateDacModalContent(device);
        }
    }
}

function renderDacChassis(d) {
    const chassisContainer = document.getElementById('dacDeviceChassis');
    if (!chassisContainer) return;

    const detected = detectDeviceBrand(d);
    const effectiveBrand = (activeDacBrandOverride && activeDacBrandOverride !== 'auto')
        ? activeDacBrandOverride
        : detected;

    const battery = d.battery || 0;
    const isCharging = !!d.isCharging;
    const isKiosk = !!d.isKiosk;
    const deviceName = d.name || d.id || 'Nexus Device';
    const model = d.model || 'Android Terminal';

    // Time string
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Common screen HTML
    const innerScreenHtml = `
        <div class="device-screen-inner">
            <div class="sim-status-bar">
                <span>${timeStr}</span>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span>4G / Wi-Fi</span>
                    <span>${battery}%${isCharging ? ' (شحن)' : ''}</span>
                </div>
            </div>

            <div class="sim-screen-center">
                <div class="sim-device-title" title="${escapeHtml(deviceName)}">${escapeHtml(deviceName)}</div>
                <span class="sim-lock-badge ${isKiosk ? 'sim-lock-active' : 'sim-lock-idle'}">
                    ${isKiosk ? 'وضع الكشك: مقيد' : 'الوضع: غير مقيد'}
                </span>
                <small style="font-size:10px; color:#94A3B8;">${escapeHtml(model)}</small>
            </div>

            <div class="sim-screen-bottom">
                <button class="sim-quick-stream-btn" onclick="dacExecuteStream()">
                    <span>فتح البث المباشر للشاشة</span>
                </button>
            </div>
        </div>
    `;

    let chassisHtml = '';

    if (effectiveBrand === 'honeywell') {
        chassisHtml = `
            <div class="dac-honeywell-chassis">
                <div class="honeywell-phone-frame">
                    <img src="honeywell-device.png" alt="Honeywell Enterprise Device" class="honeywell-chassis-img" draggable="false" />
                    <div class="phone-display-viewport dac-preview-viewport">
                        ${innerScreenHtml}
                    </div>
                </div>
            </div>
        `;
    } else if (effectiveBrand === 'samsung') {
        chassisHtml = `
            <div class="chassis-samsung">
                <div class="samsung-punch-hole" title="Front Camera Infinity-O"></div>
                
                ${innerScreenHtml}

                <div class="samsung-brand-mark">SAMSUNG</div>
            </div>
        `;
    } else if (effectiveBrand === 'zebra') {
        chassisHtml = `
            <div class="chassis-zebra">
                <div class="zebra-scan-bar" title="Zebra Red Laser Window"></div>
                
                ${innerScreenHtml}

                <div style="text-align:center; margin-top:6px; font-weight:800; font-size:11px; color:#F59E0B; letter-spacing:1px;">ZEBRA</div>
            </div>
        `;
    } else if (effectiveBrand === 'pos') {
        chassisHtml = `
            <div class="chassis-pos">
                <div class="pos-printer-head" title="Thermal Receipt Printer">
                    <div class="pos-printer-slot"></div>
                </div>
                
                ${innerScreenHtml}

                <div style="text-align:center; margin-top:6px; font-weight:800; font-size:11px; color:#EA580C; letter-spacing:1px;">SUNMI POS</div>
            </div>
        `;
    } else {
        chassisHtml = `
            <div class="chassis-generic">
                <div style="width:36px; height:4px; background:#475569; border-radius:2px; margin:0 auto 8px auto;"></div>
                
                ${innerScreenHtml}

                <div style="text-align:center; margin-top:6px; font-weight:700; font-size:10px; color:#64748B;">NEXUS ENTERPRISE</div>
            </div>
        `;
    }

    chassisContainer.innerHTML = chassisHtml;
}

function updateDacModalContent(d) {
    if (!d) return;

    const detectedBrand = detectDeviceBrand(d);
    const effectiveBrand = (activeDacBrandOverride && activeDacBrandOverride !== 'auto')
        ? activeDacBrandOverride
        : detectedBrand;

    // Update Brand Badge
    const brandBadge = document.getElementById('dacBrandBadge');
    if (brandBadge) {
        brandBadge.className = `brand-chip brand-chip-${effectiveBrand}`;
        brandBadge.innerText = effectiveBrand.toUpperCase();
    }

    // Title & Subtitle
    const nameEl = document.getElementById('dacDeviceName');
    if (nameEl) nameEl.innerText = d.name || d.id;

    const idEl = document.getElementById('dacDeviceId');
    if (idEl) idEl.innerText = d.id;

    const lastSeenEl = document.getElementById('dacLastSeen');
    if (lastSeenEl) {
        if (d.isOnline) {
            lastSeenEl.innerText = 'متصل ونشط الآن';
            lastSeenEl.style.color = '#10B981';
        } else {
            const diffSec = d.lastSeen ? Math.round(Date.now() / 1000 - d.lastSeen) : null;
            lastSeenEl.innerText = diffSec ? `آخر ظهور منذ ${diffSec > 60 ? Math.round(diffSec / 60) + ' دقيقة' : diffSec + ' ثانية'}` : 'غير متصل';
            lastSeenEl.style.color = '#64748B';
        }
    }

    // Online & Kiosk Tags
    const statusTag = document.getElementById('dacStatusTag');
    if (statusTag) {
        statusTag.className = d.isOnline ? 'status-tag tag-online' : 'status-tag tag-offline';
        statusTag.innerHTML = d.isOnline ? '<span class="dot online"></span> Online' : '<span class="dot" style="background:#94A3B8;"></span> Offline';
    }

    const kioskTag = document.getElementById('dacKioskTag');
    if (kioskTag) {
        kioskTag.className = d.isKiosk ? 'status-tag tag-kiosk-active' : 'status-tag tag-kiosk-idle';
        kioskTag.innerText = d.isKiosk ? 'Locked (مقيد)' : 'Unrestricted (حر)';
    }

    // Specs
    const specModel = document.getElementById('dacSpecModel');
    if (specModel) specModel.innerText = d.model || 'Unknown';

    const specOs = document.getElementById('dacSpecOs');
    if (specOs) specOs.innerText = `Android ${d.os || 'N/A'}`;

    const specCompany = document.getElementById('dacSpecCompany');
    if (specCompany) specCompany.innerText = d.companyName || currentCompanyCode;

    const specBranch = document.getElementById('dacSpecBranch');
    if (specBranch) {
        specBranch.innerText = d.branchName ? `${d.branchName} (${d.branchCode || ''})` : 'الإدارة العامة / غير مخصص';
        specBranch.style.color = d.branchName ? '#1E40AF' : '#64748B';
    }

    const btnChangeBranch = document.getElementById('btnChangeDacBranch');
    if (btnChangeBranch) {
        btnChangeBranch.style.display = (currentTenantData && currentTenantData.isBranch) ? 'none' : 'inline-block';
    }

    // Vitals
    const vBat = document.getElementById('dacVitalBattery');
    if (vBat) vBat.innerText = `${d.battery || 0}%`;

    const vBatBar = document.getElementById('dacVitalBatteryBar');
    if (vBatBar) {
        vBatBar.style.width = `${d.battery || 0}%`;
        vBatBar.style.background = (d.battery > 50) ? '#10B981' : ((d.battery > 20) ? '#F59E0B' : '#EF4444');
    }

    const vCharging = document.getElementById('dacVitalCharging');
    if (vCharging) vCharging.style.display = d.isCharging ? 'inline-block' : 'none';

    const vTemp = document.getElementById('dacVitalTemp');
    if (vTemp) vTemp.innerText = `${d.temperature || 0}°C حرارة`;

    const vRam = document.getElementById('dacVitalRam');
    if (vRam) vRam.innerText = `${d.ramUsedPercent || 0}%`;

    const vRamBar = document.getElementById('dacVitalRamBar');
    if (vRamBar) vRamBar.style.width = `${d.ramUsedPercent || 0}%`;

    const vStorage = document.getElementById('dacVitalStorage');
    if (vStorage) vStorage.innerText = `${d.storageUsedPercent || 0}%`;

    const vStorageBar = document.getElementById('dacVitalStorageBar');
    if (vStorageBar) vStorageBar.style.width = `${d.storageUsedPercent || 0}%`;

    const vIp = document.getElementById('dacVitalIp');
    if (vIp) vIp.innerText = d.ipAddress || 'غير معروف';

    // Kiosk Button text
    const btnKioskText = document.getElementById('dacKioskBtnText');
    const btnKioskSub = document.getElementById('dacKioskBtnSub');
    if (btnKioskText) {
        btnKioskText.innerText = d.isKiosk ? 'إلغاء وضع الكشك' : 'تفعيل وضع الكشك';
        btnKioskSub.innerText = d.isKiosk ? 'تحرير واجهة الهاتف' : 'قفل الهاتف على التطبيقات المسموحة';
    }

    // Whitelisted apps list
    const wlContainer = document.getElementById('dacWhitelistedAppsList');
    if (wlContainer) {
        const apps = d.whitelistedApps || [];
        if (apps.length > 0) {
            wlContainer.innerHTML = apps.map(pkg => {
                const shortName = pkg.split('.').pop() || pkg;
                return `<span class="dac-app-tag" title="${escapeHtml(pkg)}">
                    <strong>${escapeHtml(shortName)}</strong>
                    <small style="opacity:0.75; font-size:9.5px; margin-right:3px;">(${escapeHtml(pkg)})</small>
                </span>`;
            }).join('');
        } else {
            wlContainer.innerHTML = '<span style="font-size:12px; color:#94A3B8;">لم يتم تقييد تطبيقات محددة، الهاتف يعمل بالوضع القياسي.</span>';
        }
    }

    // Footer info
    const fGps = document.getElementById('dacFooterGps');
    if (fGps) {
        if (d.location && d.location.lat) {
            fGps.innerText = `الإحداثيات: ${d.location.lat.toFixed(5)}, ${d.location.lng.toFixed(5)} (دقة ${Math.round(d.location.accuracy || 0)}م)`;
        } else {
            fGps.innerText = 'الإحداثيات: غير متوفرة بعد';
        }
    }

    const fTime = document.getElementById('dacFooterTime');
    if (fTime) {
        fTime.innerText = `آخر مزامنة: ${new Date().toLocaleTimeString('ar-EG')}`;
    }

    const streamBtnSub = document.querySelector('#dacBtnStream small');
    if (streamBtnSub) {
        if (d.isAccessibilityActive === false) {
            streamBtnSub.innerText = 'يتطلب تفعيل الخدمة على الهاتف';
            streamBtnSub.style.color = '#D97706';
            streamBtnSub.style.fontWeight = '700';
        } else {
            streamBtnSub.innerText = 'بث حي وتحكم باللمس لجميع التطبيقات';
            streamBtnSub.style.color = '';
            streamBtnSub.style.fontWeight = 'normal';
        }
    }

    // Render the hardware chassis mockup
    renderDacChassis(d);
}

function dacExecuteStream() {
    if (!activeDacDeviceId) return;
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === activeDacDeviceId);
    const name = device ? (device.name || device.id) : activeDacDeviceId;
    openScreenStream(activeDacDeviceId, name);
}

function dacExecuteGps() {
    if (!activeDacDeviceId) return;
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === activeDacDeviceId);
    const name = device ? (device.name || device.id) : activeDacDeviceId;
    openDeviceTrackModal(activeDacDeviceId, name);
}

function dacExecuteCommand(command, label, payload = {}) {
    if (!activeDacDeviceId) return;
    promptCommand(activeDacDeviceId, command, label, payload);
}

function dacExecuteKioskToggle() {
    if (!activeDacDeviceId) return;
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === activeDacDeviceId);
    if (!device) return;

    if (device.isKiosk) {
        promptCommand(activeDacDeviceId, 'SET_KIOSK_MODE', 'Exit Kiosk Mode', { enable: false });
    } else {
        promptCommand(activeDacDeviceId, 'SET_KIOSK_MODE', 'Enter Kiosk Mode', { enable: true });
    }
}

function dacExecuteSyncTime() {
    if (!activeDacDeviceId) return;
    syncFleetTime(activeDacDeviceId);
}

function dacExecuteRename() {
    if (!activeDacDeviceId) return;
    const devId = activeDacDeviceId;
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === devId);
    closeDeviceActionCenter();
    openAdminRenameModal(devId, device ? (device.name || '') : '');
}

async function dacFixGoogleMaps() {
    if (!activeDacDeviceId) return;
    const devId = activeDacDeviceId;
    try {
        await dispatchRemoteCommand(devId, 'REPAIR_MAPS', {});
        await dispatchRemoteCommand(devId, 'CLEAR_APP_DATA', { package_name: 'com.google.android.apps.maps' });
        await dispatchRemoteCommand(devId, 'ENABLE_APP', { package_name: 'com.google.android.apps.maps' });
        await dispatchRemoteCommand(devId, 'ENABLE_APP', { package_name: 'com.google.android.gms' });
        showNotification('تم إرسال حزمة إصلاح خرائط Google الشاملة وفك حظر خدمات الموقع للجهاز بنجاح', 'success');
    } catch (e) {
        showNotification('فشل إرسال أمر الإصلاح: ' + (e.message || e), 'error');
    }
}

function dacExecuteWipe() {
    if (!activeDacDeviceId) return;
    const devId = activeDacDeviceId;
    closeDeviceActionCenter();
    promptCommand(devId, 'WIPE_DEVICE', 'Remote Factory Wipe');
}

function dacExecuteDeleteDevice() {
    if (!activeDacDeviceId) return;
    const devId = activeDacDeviceId;
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === devId);
    const name = device ? (device.name || device.id) : devId;
    closeDeviceActionCenter();
    confirmDeleteDevice(devId, name);
}

function dacTogglePolicy(policyKey, isEnabled) {
    if (!activeDacDeviceId) return;
    dispatchRemoteCommand(activeDacDeviceId, 'SET_PERIPHERAL_POLICY', {
        policy_key: policyKey,
        enabled: isEnabled
    });
}

function dacGoToWhitelist() {
    if (!activeDacDeviceId) return;
    const devId = activeDacDeviceId;
    closeDeviceActionCenter();
    showTab('whitelist');
    const sel = document.getElementById('whitelistDeviceSelect');
    if (sel) {
        sel.value = devId;
        if (typeof onWhitelistDeviceChanged === 'function') onWhitelistDeviceChanged();
    }
}

// Global modal close handlers
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeDacDeviceId) closeDeviceActionCenter();
    }
});

document.addEventListener('click', (e) => {
    const modal = document.getElementById('deviceActionCenterModal');
    if (modal && modal.style.display === 'flex' && e.target === modal) {
        closeDeviceActionCenter();
    }
});

function promptAssignDacBranch() {
    if (!activeDacDeviceId) return;
    const dev = (lastDevicesCache || []).find(d => d.id === activeDacDeviceId);
    if (!dev) return;

    if (!branchesCache || branchesCache.length === 0) {
        showToast('لم يتم إنشاء فروع في هذه الشركة بعد. يمكنك إنشاء فروع من تبويب "إدارة الفروع".', 'info');
        return;
    }

    let options = ['0: فك الارتباط (إرجاع الجهاز للإدارة العامة)'];
    branchesCache.forEach((b, idx) => {
        options.push(`${idx + 1}: ${b.name} (${b.code || b.number || ''})`);
    });

    const choice = prompt(`تعيين فرع للجهاز "${dev.name || dev.id}":\n\n` + options.join('\n') + `\n\nأدخل رقم الخيار (0 إلى ${branchesCache.length}):`);
    if (choice === null) return;
    const num = parseInt(choice.trim(), 10);
    if (isNaN(num) || num < 0 || num > branchesCache.length) {
        showToast('رقم الخيار غير صالح', 'error');
        return;
    }

    if (num === 0) {
        unassignDeviceFromBranch(dev.id);
    } else {
        const targetBranch = branchesCache[num - 1];
        assignDeviceToBranch(dev.id, targetBranch.id);
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

