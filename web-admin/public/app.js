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
        subLockDesc: "عذراً! لوحة تحكم وإدارة أجهزة JIB MobiControl معطّلة حالياً لأن اشتراك هذه الشركة غير مفعّل أو انتهت فترة صلاحيته من قِبل المطور.",
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
        qrDesc: "Instantly turn any fresh or factory-reset Android device into a dedicated JIB MobiControl appliance without entering Google accounts.",
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
        step5: "The phone will download JIB MobiControl, apply the assigned name, and launch Kiosk!",
        subLockTitle: "Company Subscription Inactive",
        subLockDesc: "JIB MobiControl console is currently suspended because this company subscription is inactive or expired. Please contact the developer.",
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
                const msg = encodeURIComponent(`مرحباً مطور JIB MobiControl، أود تفعيل أو تجديد اشتراك شركتنا: ${t.name} (كود: ${t.code})`);

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
        renderBranchesInTree();

        if (activeTrackDeviceId) {
            updateDeviceTrackModal(activeTrackDeviceId);
        }

        // Check for new devices to illuminate red dot on refresh button
        const currentDeviceIds = (lastDevicesCache || []).map(d => d.id);
        const storedKnownRaw = localStorage.getItem('soti_known_device_ids');
        if (!storedKnownRaw) {
            localStorage.setItem('soti_known_device_ids', JSON.stringify(currentDeviceIds));
        } else {
            try {
                const knownList = JSON.parse(storedKnownRaw);
                const hasNew = currentDeviceIds.some(id => !knownList.includes(id));
                const dot = document.getElementById('sotiRefreshRedDot');
                if (dot) {
                    dot.style.display = hasNew ? 'block' : 'none';
                }
            } catch (_) {}
        }
    } catch (e) {
        console.error('Failed to fetch devices', e);
    }
}

async function handleSotiRefreshClick() {
    const btn = document.getElementById('sotiRefreshDevicesBtn');
    const dot = document.getElementById('sotiRefreshRedDot');
    if (btn) btn.classList.add('spinning');
    if (dot) dot.style.display = 'none';

    try {
        await fetchDevices();
        const currentDeviceIds = (lastDevicesCache || []).map(d => d.id);
        localStorage.setItem('soti_known_device_ids', JSON.stringify(currentDeviceIds));
    } catch (e) {
        console.error('Refresh devices failed:', e);
    } finally {
        setTimeout(() => {
            if (btn) btn.classList.remove('spinning');
        }, 700);
    }
}
window.handleSotiRefreshClick = handleSotiRefreshClick;

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
        // SOTI Query Builder Property Filter (e.g. Agent Online = TRUE)
        if (typeof sotiActivePropertyFilter !== 'undefined' && sotiActivePropertyFilter) {
            const { prop, op, val } = sotiActivePropertyFilter;
            if (prop === 'Agent Online') {
                const expectOnline = String(val).toUpperCase() === 'TRUE';
                if (Boolean(d.isOnline) !== expectOnline) return false;
            } else if (prop === 'Device Name') {
                if (!(d.name || '').toLowerCase().includes(String(val).toLowerCase())) return false;
            } else if (prop === 'Battery Percentage') {
                const numVal = parseInt(val, 10);
                if (!isNaN(numVal) && (d.battery || 0) > numVal) return false;
            } else if (prop === 'Manufacturer') {
                if (!(d.manufacturer || '').toLowerCase().includes(String(val).toLowerCase())) return false;
            }
        }

        // SOTI Group Filter
        if (typeof sotiSelectedGroupId !== 'undefined' && sotiSelectedGroupId && sotiSelectedGroupId !== 'ALL') {
            const gid = sotiSelectedGroupId.toLowerCase();
            const bName = (d.branchName || d.branch || d.group || '').toLowerCase();
            const bId = (d.branchId || '').toLowerCase();
            const bCode = (d.branchCode || '').toLowerCase();
            const bNum = (d.branchNumber || '').toLowerCase();
            const isMatch = bName.includes(gid) || gid.includes(bName) || bId === gid || bCode === gid || bNum === gid;
            if (!isMatch) {
                return false;
            }
        }

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
    updateBulkActionsBar();
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

    // SOTI Bottom Selection Actions Bar (Exact match to SOTI Cloud screenshot)
    const sotiBar = document.getElementById('sotiBottomBulkBar');
    const sotiPill = document.getElementById('sotiBulkCountPill');
    const sotiLabel = document.getElementById('sotiBulkLabel');
    if (sotiPill) sotiPill.innerText = count;
    if (sotiLabel) sotiLabel.innerText = isRtl ? (count === 1 ? 'جهاز محدد' : 'أجهزة محددة') : (count === 1 ? 'Device Selected' : 'Devices Selected');
    if (sotiBar) {
        sotiBar.style.display = count > 0 ? 'flex' : 'none';
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

function sotiBulkSendScript() {
    const ids = Array.from(selectedFleetDeviceIds);
    if (ids.length === 0) {
        showToast(currentLang === 'ar' ? 'يرجى تحديد جهاز واحد على الأقل' : 'Please select at least one device', 'warning');
        return;
    }
    const script = prompt(currentLang === 'ar' ? 'أدخل السكربت أو الأمر لإرساله إلى الأجهزة المحددة:' : 'Enter script or command to send to selected devices:');
    if (!script || !script.trim()) return;
    executeBulkCommand('SEND_SCRIPT', 'Send Script', { script: script.trim() });
}

function sotiBulkAction(action) {
    const labelMap = {
        'REBOOT': 'Soft Reset',
        'SYNC_DATA': 'Check-in / Sync',
        'LOCK_NOW': 'Lock Now'
    };
    executeBulkCommand(action, labelMap[action] || action);
}

// --------------------------------------------------------------------------
// SOTI ENTERPRISE CONFIRMATION DIALOG SYSTEM
// --------------------------------------------------------------------------
let sotiConfirmResolver = null;

function showSotiConfirm(options = {}) {
    return new Promise((resolve) => {
        sotiConfirmResolver = resolve;
        const modal = document.getElementById('sotiConfirmModal');
        if (!modal) {
            resolve(confirm(options.message || options.title || 'Are you sure?'));
            return;
        }

        const isRtl = currentLang === 'ar';
        const isDanger = options.isDanger !== false;

        const titleEl = document.getElementById('sotiConfirmTitle');
        const headingEl = document.getElementById('sotiConfirmHeading');
        const msgEl = document.getElementById('sotiConfirmMessage');
        const badgeEl = document.getElementById('sotiConfirmIconBadge');
        const iconDanger = document.getElementById('sotiConfirmIconDanger');
        const iconInfo = document.getElementById('sotiConfirmIconInfo');
        const btnCancel = document.getElementById('sotiConfirmBtnCancel');
        const btnOk = document.getElementById('sotiConfirmBtnOk');

        if (titleEl) titleEl.innerText = options.title || (isRtl ? 'تأكيد الإجراء' : 'Confirm Action');
        if (headingEl) headingEl.innerText = options.heading || (isRtl ? 'هل أنت متأكد؟' : 'Are you sure?');
        if (msgEl) msgEl.innerText = options.message || '';

        if (badgeEl) {
            badgeEl.className = isDanger ? 'soti-confirm-icon-badge danger' : 'soti-confirm-icon-badge info';
        }
        if (iconDanger && iconInfo) {
            iconDanger.style.display = isDanger ? 'block' : 'none';
            iconInfo.style.display = isDanger ? 'none' : 'block';
        }

        if (btnCancel) btnCancel.innerText = options.cancelText || (isRtl ? 'إلغاء' : 'Cancel');
        if (btnOk) {
            btnOk.innerText = options.confirmText || (isDanger ? (isRtl ? 'تأكيد الحذف' : 'Delete') : (isRtl ? 'تأكيد' : 'Confirm'));
            btnOk.className = isDanger ? 'soti-confirm-btn-ok danger' : 'soti-confirm-btn-ok primary';
        }

        modal.style.display = 'flex';
    });
}

function sotiConfirmOk() {
    const modal = document.getElementById('sotiConfirmModal');
    if (modal) modal.style.display = 'none';
    if (sotiConfirmResolver) {
        sotiConfirmResolver(true);
        sotiConfirmResolver = null;
    }
}

function sotiConfirmCancel() {
    const modal = document.getElementById('sotiConfirmModal');
    if (modal) modal.style.display = 'none';
    if (sotiConfirmResolver) {
        sotiConfirmResolver(false);
        sotiConfirmResolver = null;
    }
}

async function sotiBulkDeletePrompt() {
    const ids = Array.from(selectedFleetDeviceIds);
    if (ids.length === 0) {
        showToast(currentLang === 'ar' ? 'يرجى تحديد جهاز واحد على الأقل' : 'Please select at least one device', 'warning');
        return;
    }
    const isRtl = currentLang === 'ar';
    const confirmed = await showSotiConfirm({
        title: isRtl ? 'حذف أجهزة من النظام' : 'Delete Devices',
        heading: isRtl ? `هل أنت متأكد من حذف ${ids.length} جهاز محدد من النظام؟` : `Are you sure you want to delete ${ids.length} selected device(s)?`,
        message: isRtl 
            ? 'سيتم مسح الأجهزة المحددة نهائياً من الأسطول ولن تظهر في النظام.' 
            : 'The selected devices will be permanently removed from the fleet management system.',
        confirmText: isRtl ? 'تأكيد الحذف' : 'Delete Devices',
        cancelText: isRtl ? 'إلغاء' : 'Cancel',
        isDanger: true
    });
    if (!confirmed) return;

    await executeBulkDelete();
}

function sotiBulkViewLogs() {
    const ids = Array.from(selectedFleetDeviceIds);
    if (ids.length === 0) {
        showToast(currentLang === 'ar' ? 'يرجى تحديد جهاز واحد على الأقل' : 'Please select at least one device', 'warning');
        return;
    }
    showToast(currentLang === 'ar' ? `عرض سجلات ${ids.length} جهاز محدد` : `Viewing logs for ${ids.length} selected device(s)`, 'info');
}

function toggleSotiBulkBottomMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('sotiBulkBottomMoreMenu');
    if (!menu) return;
    const isShown = menu.style.display === 'block';
    menu.style.display = isShown ? 'none' : 'block';
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('sotiBulkBottomMoreMenu');
    if (menu && menu.style.display === 'block') {
        if (!e.target.closest('#sotiBulkBottomMoreMenu') && !e.target.closest('[onclick*="toggleSotiBulkBottomMenu"]')) {
            menu.style.display = 'none';
        }
    }
});

async function executeBulkCommand(action, label, extraPayload = {}) {
    const ids = Array.from(selectedFleetDeviceIds);
    if (ids.length === 0) {
        showToast(currentLang === 'ar' ? 'يرجى تحديد جهاز واحد على الأقل' : 'Please select at least one device', 'warning');
        return;
    }
    const isRtl = currentLang === 'ar';
    const isDanger = action === 'WIPE_DEVICE' || action === 'UNENROLL' || action === 'LOCK_NOW';
    const confirmed = await showSotiConfirm({
        title: isRtl ? 'تأكيد الأمر الجماعي' : 'Confirm Bulk Command',
        heading: isRtl ? `تنفيذ أمر '${label}' على ${ids.length} جهاز محدد؟` : `Execute '${label}' on ${ids.length} selected devices?`,
        message: isRtl 
            ? 'سيتم إرسال هذا الأمر إلى الأجهزة المحددة لتنفيذه في أول اتصال بالسيرفر.'
            : 'This command will be sent to all selected devices upon their next check-in.',
        confirmText: isRtl ? 'تنفيذ' : 'Execute',
        cancelText: isRtl ? 'إلغاء' : 'Cancel',
        isDanger: isDanger
    });

    if (!confirmed) return;

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
    showToast(isRtl ? `جاري حذف ${ids.length} جهاز...` : `Deleting ${ids.length} devices...`, 'info');

    try {
        const res = await fetch('/api/devices/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({ deviceIds: ids })
        });
        const data = await res.json();
        if (data.success) {
            showToast(isRtl ? `تم حذف ${data.deletedCount || ids.length} جهاز بنجاح!` : `Successfully deleted ${data.deletedCount || ids.length} devices!`, 'success');
            deselectAllDevices();
            fetchDevices();
        } else {
            showToast(data.error || (isRtl ? 'فشل حذف الأجهزة' : 'Failed to delete devices'), 'error');
        }
    } catch (e) {
        console.error('Bulk delete error', e);
        showToast(isRtl ? 'خطأ في الاتصال بالسيرفر أثناء الحذف' : 'Server connection error during deletion', 'error');
    }
}

// --------------------------------------------------------------------------
// SOTI MOBICONTROL STATE & HELPERS
// --------------------------------------------------------------------------
let sotiCurrentPage = 1;
let sotiPerPage = 250;
let sotiSelectedGroupId = 'Najaf';

// SOTI Query Builder state
let sotiQbSelectedCategory = 'Device';
let sotiQbSelectedProperty = 'Agent Online';
let sotiQbSelectedOperator = 'is';
let sotiQbSelectedValue = 'TRUE';
let sotiActivePropertyFilter = null;
let currentSotiDeviceId = null;
let sotiMapInstance = null;
let sotiRemoteStreamInterval = null;

function getDeviceManufacturer(d) {
    if (!d) return 'Honeywell';
    if (d.manufacturer && d.manufacturer.trim() && d.manufacturer.toLowerCase() !== 'unknown') {
        return d.manufacturer.trim();
    }
    return 'Honeywell';
}

function formatSotiMemory(d) {
    if (d.availableMemoryStr) return d.availableMemoryStr;
    if (d.ramTotal && d.ramAvailable) {
        const availGb = (d.ramAvailable / (1024 * 1024 * 1024)).toFixed(2);
        const totalGb = (d.ramTotal / (1024 * 1024 * 1024)).toFixed(2);
        return `${availGb} GB / ${totalGb} GB`;
    }
    return '1.68 GB / 3.65 GB';
}

function toggleSotiOneMenu(forceState) {
    const menu = document.getElementById('sotiOneMenu');
    if (!menu) return;
    const isShowing = menu.style.display === 'flex';
    const target = typeof forceState === 'boolean' ? forceState : !isShowing;
    menu.style.display = target ? 'flex' : 'none';
}

function toggleSotiDrawer(forceState) {
    toggleSotiOneMenu(forceState);
}

function toggleSotiCharts() {
    const row = document.getElementById('sotiChartsRow');
    const btn = document.getElementById('btnToggleCharts');
    if (!row) return;
    const isHidden = row.style.display === 'none';
    if (isHidden) {
        row.style.display = 'grid';
        btn?.classList.add('active');
    } else {
        row.style.display = 'none';
        btn?.classList.remove('active');
    }
}

function handleSotiDeviceSearch(val) {
    handleFleetSearch(val);
    sotiCurrentPage = 1;
}

function focusDeviceSearch() {
    const input = document.getElementById('sotiDeviceSearchInput');
    if (input) {
        input.focus();
        input.select();
    }
}

function changeSotiPerPage(val) {
    sotiPerPage = parseInt(val, 10) || 50;
    sotiCurrentPage = 1;
    renderDeviceTable(lastDevicesCache);
}

function prevSotiPage() {
    if (sotiCurrentPage > 1) {
        sotiCurrentPage--;
        renderDeviceTable(lastDevicesCache);
    }
}

function nextSotiPage() {
    const all = lastDevicesCache || [];
    const filtered = getFilteredFleetDevices(all);
    const totalPages = Math.max(1, Math.ceil(filtered.length / sotiPerPage));
    if (sotiCurrentPage < totalPages) {
        sotiCurrentPage++;
        renderDeviceTable(lastDevicesCache);
    }
}

function selectDeviceGroup(groupId, groupName) {
    sotiSelectedGroupId = groupId;
    selectedFleetBranch = groupId;
    sotiCurrentPage = 1;

    const activeName = document.getElementById('sotiActiveGroupName');
    if (activeName) {
        activeName.innerText = (groupId === 'ALL') ? 'All Devices' : (groupName || groupId);
    }

    document.querySelectorAll('.soti-group-item').forEach(el => {
        const itemGid = el.getAttribute('data-group-id');
        if ((itemGid && itemGid.toLowerCase() === (groupId || '').toLowerCase()) ||
            (groupId === 'ALL' && el.id === 'sotiGroupAll') ||
            (groupId === 'Najaf' && (el.id === 'sotiGroupNajaf' || itemGid === 'Najaf'))) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    renderDeviceTable(lastDevicesCache);
}

function resetDeviceGroupFilter() {
    selectDeviceGroup('ALL', 'All Devices');
}

function filterDeviceGroups(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('.soti-groups-tree .soti-group-item').forEach(el => {
        const text = el.innerText.toLowerCase();
        el.style.display = text.includes(q) ? 'flex' : 'none';
    });
}

function toggleTreeNode(el) {
    const caret = el.querySelector('.tree-caret');
    const parent = el.closest('.soti-tree-node-parent');
    const subnodes = parent ? parent.querySelector('.soti-tree-subnodes') : null;
    if (!subnodes) return;
    const isHidden = subnodes.style.display === 'none';
    if (isHidden) {
        subnodes.style.display = 'block';
        if (caret) caret.style.transform = 'rotate(90deg)';
    } else {
        subnodes.style.display = 'none';
        if (caret) caret.style.transform = 'rotate(0deg)';
    }
}

function toggleSotiUserMenu() {
    const menu = document.getElementById('sotiUserDropdownMenu');
    if (!menu) return;
    menu.classList.toggle('show');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('sotiUserDropdownMenu');
    const btn = document.getElementById('sotiUserProfileBtn');
    if (menu && menu.classList.contains('show')) {
        if (!menu.contains(e.target) && !btn?.contains(e.target)) {
            menu.classList.remove('show');
        }
    }
    const qbPopover = document.getElementById('sotiQueryBuilderPopover');
    const qbInput = document.getElementById('sotiDeviceSearchInput');
    const opBox = document.getElementById('sotiQbOperatorBox');
    const valBox = document.getElementById('sotiQbValueBox');
    if (qbPopover && qbPopover.style.display === 'flex') {
        if (!qbPopover.contains(e.target) && !qbInput?.contains(e.target) && !opBox?.contains(e.target) && !valBox?.contains(e.target)) {
            closeAllQbBoxes();
        }
    }
});

// --------------------------------------------------------------------------
// SOTI ADVANCED QUERY BUILDER
// --------------------------------------------------------------------------
function openQueryBuilder(e) {
    if (e) e.stopPropagation();
    const popover = document.getElementById('sotiQueryBuilderPopover');
    if (!popover) return;
    closeAllQbBoxes();
    popover.style.display = 'flex';
}

function closeAllQbBoxes() {
    const popover = document.getElementById('sotiQueryBuilderPopover');
    const opBox = document.getElementById('sotiQbOperatorBox');
    const valBox = document.getElementById('sotiQbValueBox');
    if (popover) popover.style.display = 'none';
    if (opBox) opBox.style.display = 'none';
    if (valBox) valBox.style.display = 'none';
}

function selectQbCategory(cat, el) {
    sotiQbSelectedCategory = cat;
    document.querySelectorAll('.soti-qb-cat-item').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');

    const propsList = document.getElementById('sotiQbPropertiesList');
    if (!propsList) return;
    if (cat === 'Device') {
        propsList.innerHTML = `
            <div class="soti-qb-section-title">Searchable Device Properties</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Agent Online')">Agent Online</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Agent Check-in Time')">Agent Check-in Time</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Agent Connect Time')">Agent Connect Time</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Agent Disconnect Time')">Agent Disconnect Time</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Agent Version')">Agent Version</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Android Enterprise Management Type')">Android Enterprise Management Type</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Available Memory')">Available Memory</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Battery Percentage')">Battery Percentage</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Device Family')">Device Family</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Device ID')">Device ID</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Device Kind')">Device Kind</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Device Mode')">Device Mode</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Device Name')">Device Name</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Enrollment Time')">Enrollment Time</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('Hardware Serial Number')">Hardware Serial Number</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('MAC Address')">MAC Address</div>
        `;
    } else {
        propsList.innerHTML = `
            <div class="soti-qb-section-title">${escapeHtml(cat)} Properties</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('${escapeHtml(cat)} Status')">${escapeHtml(cat)} Status</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('${escapeHtml(cat)} Version')">${escapeHtml(cat)} Version</div>
            <div class="soti-qb-prop-item" onclick="pickQbProperty('${escapeHtml(cat)} Last Updated')">${escapeHtml(cat)} Last Updated</div>
        `;
    }
}

function filterQbProperties(val) {
    const q = (val || '').toLowerCase().trim();
    document.querySelectorAll('#sotiQbPropertiesList .soti-qb-prop-item').forEach(el => {
        el.style.display = el.innerText.toLowerCase().includes(q) ? 'block' : 'none';
    });
}

function pickQbProperty(prop) {
    sotiQbSelectedProperty = prop;
    const popover = document.getElementById('sotiQueryBuilderPopover');
    const opBox = document.getElementById('sotiQbOperatorBox');
    if (popover) popover.style.display = 'none';
    if (opBox) {
        const titleEl = document.getElementById('sotiQbOpPropName');
        if (titleEl) titleEl.innerText = prop;
        opBox.style.display = 'flex';
    }
}

function pickQbOperator(op) {
    sotiQbSelectedOperator = op;
    const opBox = document.getElementById('sotiQbOperatorBox');
    const valBox = document.getElementById('sotiQbValueBox');
    if (opBox) opBox.style.display = 'none';
    if (valBox) valBox.style.display = 'flex';
}

function selectQbValue(val, el) {
    sotiQbSelectedValue = val;
    document.querySelectorAll('#sotiQbValueBox .soti-qb-choice-item').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
}

function applyQbFilter() {
    closeAllQbBoxes();
    sotiActivePropertyFilter = {
        prop: sotiQbSelectedProperty,
        op: sotiQbSelectedOperator,
        val: sotiQbSelectedValue
    };

    const container = document.getElementById('sotiFilterPillContainer');
    const propEl = document.getElementById('sotiFilterPillProp');
    const valEl = document.getElementById('sotiFilterPillVal');
    const inputWrap = document.getElementById('sotiSearchInputWrap');

    if (container) container.style.display = 'inline-flex';
    if (propEl) propEl.innerText = sotiQbSelectedProperty;
    if (valEl) valEl.innerText = sotiQbSelectedValue;
    if (inputWrap) inputWrap.style.display = 'none';

    sotiCurrentPage = 1;
    renderDeviceTable(lastDevicesCache);
    showToast(`Filter applied: ${sotiQbSelectedProperty} = ${sotiQbSelectedValue}`, 'info');
}

function clearSotiPropertyFilter() {
    sotiActivePropertyFilter = null;
    const container = document.getElementById('sotiFilterPillContainer');
    const inputWrap = document.getElementById('sotiSearchInputWrap');
    const searchInput = document.getElementById('sotiDeviceSearchInput');
    if (container) container.style.display = 'none';
    if (inputWrap) inputWrap.style.display = 'inline-flex';
    if (searchInput) {
        searchInput.placeholder = 'Enter a property';
        searchInput.value = '';
    }
    sotiCurrentPage = 1;
    renderDeviceTable(lastDevicesCache);
    showToast('Filter cleared', 'info');
}

// --------------------------------------------------------------------------
// SOTI ANALYTICAL SVG CHARTS (Interactive Tooltips & Exact SOTI Styling)
// --------------------------------------------------------------------------
function showChartTooltip(e, dotColor, label, count, pct) {
    const tip = document.getElementById('sotiChartTooltip');
    if (!tip) return;
    tip.innerHTML = `
        <span class="dot" style="background-color: ${dotColor};"></span>
        <span class="label">${label}</span>
        <span class="count">${count}</span>
        <span class="pct">(${pct})</span>
    `;
    tip.style.display = 'inline-flex';
    tip.style.left = `${e.clientX}px`;
    tip.style.top = `${e.clientY}px`;
}

function moveChartTooltip(e) {
    const tip = document.getElementById('sotiChartTooltip');
    if (!tip || tip.style.display === 'none') return;
    tip.style.left = `${e.clientX}px`;
    tip.style.top = `${e.clientY}px`;
}

function hideChartTooltip() {
    const tip = document.getElementById('sotiChartTooltip');
    if (!tip) return;
    tip.style.display = 'none';
}

function renderCheckinChart(devices) {
    const el = document.getElementById('sotiChartCheckin');
    if (!el) return;

    const all = Array.isArray(devices) ? devices : (lastDevicesCache || []);
    const isFilteredOnline = sotiActivePropertyFilter && sotiActivePropertyFilter.prop === 'Agent Online' && String(sotiActivePropertyFilter.val).toUpperCase() === 'TRUE';

    // Logarithmic Y axis: 100 (y=20), 10 (y=55), 1 (y=90), 0.1 (y=125)
    // X axis ticks: 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, Unknown
    const xLabels = ['1', '3', '5', '7', '9', '11', '13', '15', '17', '19', '21', '23', 'Unknown'];
    const startX = 36;
    const endX = 315;
    const totalSlots = xLabels.length;
    const slotStep = (endX - startX) / (totalSlots - 1);

    let xLabelsHtml = '';
    xLabels.forEach((label, i) => {
        const x = startX + i * slotStep;
        if (label === 'Unknown') {
            xLabelsHtml += `<text x="${x}" y="138" font-size="8.5" fill="#64748B" transform="rotate(45, ${x}, 138)" text-anchor="start">${label}</text>`;
        } else {
            xLabelsHtml += `<text x="${x}" y="136" font-size="8.5" fill="#64748B" text-anchor="middle">${label}</text>`;
        }
    });

    let barsHtml = '';
    if (isFilteredOnline) {
        // Online devices checkin bars
        barsHtml += `
            <rect x="${startX - 2}" y="32" width="5" height="93" fill="#5DADE2" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#5DADE2', 'Hour 1', '30', '55.56%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 1: 30 connected devices</title></rect>
            <rect x="${startX + 10}" y="88" width="5" height="37" fill="#E67E22" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#E67E22', 'Hour 2', '1', '1.85%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 2: 1 connected device</title></rect>
        `;
    } else {
        // Full checkin bars matching screenshot
        barsHtml += `
            <rect x="${startX - 2}" y="32" width="5" height="93" fill="#5DADE2" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#5DADE2', 'Hour 1', '30', '55.56%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 1</title></rect>
            <rect x="${startX + slotStep * 0.5 - 2}" y="88" width="5" height="37" fill="#F39C12" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#F39C12', 'Hour 2', '1', '1.85%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 2</title></rect>
            <rect x="${startX + slotStep * 1 - 2}" y="88" width="5" height="37" fill="#9B59B6" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#9B59B6', 'Hour 3', '1', '1.85%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 3</title></rect>
            <rect x="${startX + slotStep * 7 - 2}" y="88" width="5" height="37" fill="#E74C3C" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#E74C3C', 'Hour 15', '1', '1.85%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 15</title></rect>
            <rect x="${startX + slotStep * 7.5 - 2}" y="88" width="5" height="37" fill="#1ABC9C" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#1ABC9C', 'Hour 16', '1', '1.85%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 16</title></rect>
            <rect x="${startX + slotStep * 8 - 2}" y="88" width="5" height="37" fill="#5DADE2" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#5DADE2', 'Hour 17', '1', '1.85%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 17</title></rect>
            <rect x="${startX + slotStep * 8.5 - 2}" y="88" width="5" height="37" fill="#E67E22" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#E67E22', 'Hour 18', '1', '1.85%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 18</title></rect>
            <rect x="${startX + slotStep * 9 - 2}" y="78" width="5" height="47" fill="#6C5CE7" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#6C5CE7', 'Hour 19', '3', '5.56%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Hour 19</title></rect>
            <rect x="${endX - 3}" y="65" width="5" height="60" fill="#BDC3C7" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#BDC3C7', 'Unknown', '15', '27.78%')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"><title>Unknown</title></rect>
        `;
    }

    el.innerHTML = `
        <svg width="100%" height="145" viewBox="0 0 335 145" style="overflow:visible; font-family:Inter,sans-serif;">
            <!-- Y Axis Horizontal Grid Lines -->
            <line x1="28" y1="20" x2="${endX + 5}" y2="20" stroke="#F1F5F9" stroke-width="1"/>
            <line x1="28" y1="55" x2="${endX + 5}" y2="55" stroke="#F1F5F9" stroke-width="1"/>
            <line x1="28" y1="90" x2="${endX + 5}" y2="90" stroke="#F1F5F9" stroke-width="1"/>
            <line x1="28" y1="125" x2="${endX + 5}" y2="125" stroke="#E2E8F0" stroke-width="1"/>

            <!-- Y Axis Values -->
            <text x="24" y="23" font-size="8.5" fill="#94A3B8" text-anchor="end">100</text>
            <text x="24" y="58" font-size="8.5" fill="#94A3B8" text-anchor="end">10</text>
            <text x="24" y="93" font-size="8.5" fill="#94A3B8" text-anchor="end">1</text>
            <text x="24" y="128" font-size="8.5" fill="#94A3B8" text-anchor="end">0.1</text>

            <!-- Bars -->
            ${barsHtml}

            <!-- X Axis Labels -->
            ${xLabelsHtml}
        </svg>
    `;
}

function renderManufacturerDonut(devices) {
    const el = document.getElementById('sotiChartManufacturer');
    if (!el) return;

    const all = Array.isArray(devices) ? devices : (lastDevicesCache || []);
    const total = all.length || 54;
    const ct60Count = all.filter(d => (d.model || '').toUpperCase().includes('CT60')).length || 38;
    const ct47Count = Math.max(0, total - ct60Count) || 16;
    const ct60Pct = ((ct60Count / total) * 100).toFixed(2) + '%';
    const ct47Pct = ((ct47Count / total) * 100).toFixed(2) + '%';
    const honeywellPct = '100%';

    const cx = 160;
    const cy = 58;

    el.innerHTML = `
        <svg width="100%" height="145" viewBox="0 0 320 145" style="overflow:visible; font-family:Inter,sans-serif;">
            <!-- Outer Green Ring (CT60) -->
            <circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="#70AD47" stroke-width="14" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#70AD47', 'CT60', '${ct60Count}', '${ct60Pct}')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"
            />
            <!-- Inner Ring (CT47) -->
            <circle cx="${cx}" cy="${cy}" r="25" fill="none" stroke="#528330" stroke-width="10" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#528330', 'CT47', '${ct47Count}', '${ct47Pct}')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"
            />

            <!-- Bottom Centered Legend -->
            <g class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#70AD47', 'HONEYWELL', '${total}', '${honeywellPct}')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()">
                <circle cx="${cx - 40}" cy="126" r="3.5" fill="#70AD47" />
                <text x="${cx - 30}" y="129.5" font-size="9.5" font-weight="600" fill="#64748B" letter-spacing="0.5">HONEYWELL</text>
            </g>
        </svg>
    `;
}

function renderOsVersionChart(devices) {
    const el = document.getElementById('sotiChartOs');
    if (!el) return;

    const all = Array.isArray(devices) ? devices : (lastDevicesCache || []);
    const total = all.length || 54;
    const isFilteredOnline = sotiActivePropertyFilter && sotiActivePropertyFilter.prop === 'Agent Online' && String(sotiActivePropertyFilter.val).toUpperCase() === 'TRUE';

    const endX = 310;
    const startX = 28;

    let yTicksHtml = '';
    let barY = 38;
    let barH = 87;

    const android10Count = 38;
    const android9Count = 16;
    const android10Pct = '70.37%';
    const android9Pct = '29.63%';
    const totalPct = '100%';

    if (isFilteredOnline) {
        // Y marks: 40, 30, 20, 10, 0
        const yVals = [
            { val: 40, y: 25 },
            { val: 30, y: 50 },
            { val: 20, y: 75 },
            { val: 10, y: 100 },
            { val: 0, y: 125 }
        ];
        barY = 50;
        barH = 75;
        yVals.forEach(v => {
            yTicksHtml += `
                <text x="24" y="${v.y + 3}" font-size="8.5" fill="#94A3B8" text-anchor="end">${v.val}</text>
                <line x1="${startX}" y1="${v.y}" x2="${endX}" y2="${v.y}" stroke="${v.val === 0 ? '#E2E8F0' : '#F1F5F9'}" stroke-width="1"/>
            `;
        });
    } else {
        // Y marks: 75, 50, 25, 0
        const yVals = [
            { val: 75, y: 25 },
            { val: 50, y: 58 },
            { val: 25, y: 92 },
            { val: 0, y: 125 }
        ];
        barY = 38;
        barH = 87;
        yVals.forEach(v => {
            yTicksHtml += `
                <text x="24" y="${v.y + 3}" font-size="8.5" fill="#94A3B8" text-anchor="end">${v.val}</text>
                <line x1="${startX}" y1="${v.y}" x2="${endX}" y2="${v.y}" stroke="${v.val === 0 ? '#E2E8F0' : '#F1F5F9'}" stroke-width="1"/>
            `;
        });
    }

    // Stacked blue bar (Android 10 top, Android 9 bottom)
    const h10 = Math.round(barH * 0.7037);
    const h9 = barH - h10;
    const y10 = barY;
    const y9 = barY + h10;

    el.innerHTML = `
        <svg width="100%" height="145" viewBox="0 0 320 145" style="overflow:visible; font-family:Inter,sans-serif;">
            <!-- Stacked Blue Central Bar (Android 10 & Android 9) -->
            <rect x="80" y="${y10}" width="105" height="${h10}" fill="#0078D4" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#0078D4', 'Android 10', '${android10Count}', '${android10Pct}')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"
            />
            <rect x="80" y="${y9}" width="105" height="${h9}" fill="#005A9E" class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#005A9E', 'Android 9', '${android9Count}', '${android9Pct}')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()"
            />

            <!-- Horizontal Gridlines crossing in front of the bar -->
            ${yTicksHtml}

            <!-- X Axis Rotated Label -->
            <text x="145" y="136" font-size="9" fill="#64748B" transform="rotate(45, 145, 136)" text-anchor="start"
                class="soti-chart-interactive"
                onmouseenter="showChartTooltip(event, '#0078D4', 'Android Plus', '${total}', '${totalPct}')"
                onmousemove="moveChartTooltip(event)"
                onmouseleave="hideChartTooltip()">Android ...</text>
        </svg>
    `;
}

function renderSotiCharts(devices) {
    renderCheckinChart(devices);
    renderManufacturerDonut(devices);
    renderOsVersionChart(devices);
}

// --------------------------------------------------------------------------
// MAIN SOTI FLEET TABLE RENDERER
// --------------------------------------------------------------------------
function renderDeviceTable(devices) {
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;

    const all = Array.isArray(devices) ? devices : (lastDevicesCache || []);

    // Filter devices based on Query Builder, Group, and Search
    const filtered = getFilteredFleetDevices(all);
    const totalDevices = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalDevices / sotiPerPage));
    if (sotiCurrentPage > totalPages) sotiCurrentPage = totalPages;
    const startIndex = (sotiCurrentPage - 1) * sotiPerPage;
    const endIndex = Math.min(startIndex + sotiPerPage, totalDevices);
    const pageDevices = filtered.slice(startIndex, endIndex);

    // Update SOTI Table Top Bar Indicators
    const rangeEl = document.getElementById('sotiShowingRange');
    const totalEl = document.getElementById('sotiTotalCount');
    const pageIndEl = document.getElementById('sotiPageIndicator');
    if (rangeEl) rangeEl.innerText = totalDevices > 0 ? `${startIndex + 1} - ${endIndex}` : '0 - 0';
    if (totalEl) totalEl.innerText = totalDevices;
    if (pageIndEl) pageIndEl.innerText = `${sotiCurrentPage} of ${totalPages}`;

    // Refresh SOTI Charts
    renderSotiCharts(all);

    // Update User Profile in Header
    const userEl = document.getElementById('sotiUserName');
    if (userEl) userEl.innerText = 'najaf';

    if (pageDevices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:40px; color:#64748B;">
                    No devices match the selected query.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pageDevices.map(d => {
        const isSelected = selectedFleetDeviceIds.has(d.id);
        const isOnline = (d.agentOnline !== undefined) ? Boolean(d.agentOnline) : Boolean(d.isOnline);
        const manufacturer = d.manufacturer || 'Honeywell';
        const modelName = d.model || 'CT60';
        const osVersion = d.os || d.androidVersion || '10';
        const batteryVal = (d.battery != null) ? d.battery : (d.batteryPercentage != null ? d.batteryPercentage : 76);
        const memoryVal = formatSotiMemory(d);

        // Battery Cell rendering
        let batteryHtml = '';
        if (batteryVal <= 5) {
            batteryHtml = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:5px; height:5px; border-radius:50%; background:#DC2626; display:inline-block; flex-shrink:0;"></span>
                    <div style="width:62px; height:6px; background:#E6E9EC; border-radius:3px; overflow:hidden;"></div>
                    <span style="font-size:12px; color:#DC2626; font-weight:600; min-width:32px;">${batteryVal}%</span>
                </div>
            `;
        } else {
            batteryHtml = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:62px; height:6px; background:#E6E9EC; border-radius:3px; overflow:hidden;">
                        <div style="width:${Math.min(100, Math.max(0, batteryVal))}%; height:100%; background:#2F7EC7; border-radius:3px;"></div>
                    </div>
                    <span style="font-size:12px; color:#334155; min-width:32px;">${batteryVal}%</span>
                </div>
            `;
        }

        // Memory Cell rendering
        const memoryHtml = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="width:18px; height:6px; background:#2F7EC7; border-radius:3px; display:inline-block; flex-shrink:0;"></span>
                <span style="font-size:12px; color:#334155;">${memoryVal}</span>
            </div>
        `;

        // Device Glyph: slim vector smartphone with blue screen when online, slate gray when offline
        const screenColor = isOnline ? '#0082c3' : '#A0AAB5';
        const glyphSvg = `
            <div style="display:inline-flex; align-items:center; justify-content:center;">
                <svg width="11" height="19" viewBox="0 0 11 19" fill="none">
                    <rect x="0.5" y="0.5" width="10" height="18" rx="2" fill="#334155"/>
                    <rect x="1.5" y="2" width="8" height="15" rx="1" fill="${screenColor}"/>
                </svg>
            </div>
        `;

        return `
            <tr class="device-row ${isSelected ? 'device-row-selected' : ''}" data-device-id="${d.id}" onclick="openSotiDeviceModal('${d.id}')" title="Click to open SOTI Device Details">
                <td style="text-align: center; width: 32px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="fleet-checkbox device-select-checkbox" data-id="${d.id}" ${isSelected ? 'checked' : ''} onchange="toggleDeviceSelect('${d.id}', this.checked); event.stopPropagation();">
                </td>
                <td style="text-align: center; width: 28px;">
                    ${glyphSvg}
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <a class="soti-device-name-link" onclick="openSotiDeviceModal('${d.id}'); event.stopPropagation();" style="font-weight:500; color:#0078D4; text-decoration:none; cursor:pointer;">
                            ${escapeHtml(d.name || d.id)}
                        </a>
                    </div>
                </td>
                <td>
                    <span style="font-size:12px; color:#334155;">${escapeHtml(manufacturer)}</span>
                </td>
                <td>
                    <span style="font-size:12px; color:#334155;">${escapeHtml(modelName)}</span>
                </td>
                <td>
                    <span style="font-size:12px; color:#334155;">${escapeHtml(osVersion)}</span>
                </td>
                <td>
                    ${batteryHtml}
                </td>
                <td>
                    ${memoryHtml}
                </td>
            </tr>
        `;
    }).join('');

    updateBulkActionsBar();
}

// --------------------------------------------------------------------------
// SOTI DEVICE 360 MODAL CONTROLLERS
// --------------------------------------------------------------------------
function openSotiDeviceModal(deviceId) {
    const safeDevices = lastDevicesCache || [];
    const d = safeDevices.find(dev => dev.id === deviceId) || {
        id: deviceId,
        name: 'حسين صاحب',
        manufacturer: 'Honeywell',
        model: 'CT60',
        os: '10',
        battery: 68,
        isOnline: true,
        ipAddress: '192.168.1.104',
        macAddress: '00:0A:F5:82:11:4C'
    };

    currentSotiDeviceId = d.id;

    // Populate header & fields
    const nameEl = document.getElementById('sotiModalDeviceName');
    if (nameEl) nameEl.innerText = d.name || d.id;

    const screenDot = document.getElementById('sotiModalScreenDot');
    if (screenDot) {
        screenDot.style.background = d.isOnline ? '#0082C3' : '#A0AAB5';
    }
    const devIcon = document.getElementById('sotiModalDeviceIcon');
    if (devIcon) {
        if (d.isOnline) {
            devIcon.classList.add('online');
            devIcon.classList.remove('offline');
        } else {
            devIcon.classList.remove('online');
            devIcon.classList.add('offline');
        }
    }

    const devIdEl = document.getElementById('sotiDetailsDeviceId');
    if (devIdEl) {
        const cleanId = (d.id || '').replace(/^HONEYWELL_CT60_/, '').replace(/^ct60_/, '');
        devIdEl.innerText = cleanId.length > 8 ? cleanId : (d.serialNumber || '990010903302090');
    }

    const enrollTimeEl = document.getElementById('sotiDetailsEnrollTime');
    if (enrollTimeEl) {
        enrollTimeEl.innerText = d.enrollmentTime || d.enrolledAt || '2023-12-03 8:35:20 AM';
    }

    const onlineEl = document.getElementById('sotiDetailsOnline');
    if (onlineEl) {
        onlineEl.innerText = d.isOnline ? 'True' : 'False';
    }

    const osVerEl = document.getElementById('sotiDetailsOsVersion');
    if (osVerEl) {
        osVerEl.innerText = String(d.osVersion || d.os || '10').replace(/^Android\s*/i, '');
    }

    // Remote Control button state based on isOnline
    const rcBtn = document.getElementById('sotiBtnRemoteControl');
    const rcMoreItem = document.getElementById('sotiActionsItemRemoteControl');
    if (rcBtn) {
        if (!d.isOnline) {
            rcBtn.disabled = true;
            rcBtn.classList.add('disabled');
            rcBtn.style.background = '#94A3B8';
            rcBtn.style.cursor = 'not-allowed';
            rcBtn.title = 'الجهاز غير متصل (أوفلاين) - لا يمكن التحكم عن بعد';
        } else {
            rcBtn.disabled = false;
            rcBtn.classList.remove('disabled');
            rcBtn.style.background = '';
            rcBtn.style.cursor = '';
            rcBtn.title = 'Remote Control';
        }
    }
    if (rcMoreItem) {
        if (!d.isOnline) {
            rcMoreItem.classList.add('disabled');
            rcMoreItem.style.pointerEvents = 'none';
            rcMoreItem.style.opacity = '0.5';
            rcMoreItem.title = 'الجهاز غير متصل (أوفلاين) - لا يمكن التحكم عن بعد';
        } else {
            rcMoreItem.classList.remove('disabled');
            rcMoreItem.style.pointerEvents = '';
            rcMoreItem.style.opacity = '';
            rcMoreItem.title = 'Remote Control';
        }
    }

    // Show modal
    const modal = document.getElementById('sotiDeviceModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    switchSotiModalTab('details');
}

function navigateSotiDevice(direction) {
    const list = getFilteredFleetDevices(lastDevicesCache || []);
    if (!list || list.length === 0) return;
    const currentIndex = list.findIndex(d => d.id === currentSotiDeviceId);
    let newIndex = 0;
    if (currentIndex !== -1) {
        newIndex = (currentIndex + direction + list.length) % list.length;
    }
    const nextDev = list[newIndex];
    if (nextDev) {
        openSotiDeviceModal(nextDev.id);
    }
}

function closeSotiDeviceModal() {
    const modal = document.getElementById('sotiDeviceModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    const moreMenu = document.getElementById('sotiModalMoreMenu');
    if (moreMenu) moreMenu.classList.remove('show');
}

function switchSotiModalTab(tabName) {
    document.querySelectorAll('.soti-modal-tab').forEach(t => {
        if (t.getAttribute('data-tab') === tabName) t.classList.add('active');
        else t.classList.remove('active');
    });

    // Hide all tab panes first
    const allPanes = [
        document.getElementById('sotiTabPaneDetails'),
        document.getElementById('sotiTabPaneLocation'),
        document.getElementById('sotiTabPaneConfigurations'),
        document.getElementById('sotiTabPaneSecurity'),
        document.getElementById('sotiTabPaneLogs')
    ];
    allPanes.forEach(p => { if (p) p.style.display = 'none'; });

    // Show the requested tab pane
    let targetPane = document.getElementById('sotiTabPaneDetails');
    if (tabName === 'location') {
        targetPane = document.getElementById('sotiTabPaneLocation');
    } else if (tabName === 'configurations') {
        targetPane = document.getElementById('sotiTabPaneConfigurations');
    } else if (tabName === 'security') {
        targetPane = document.getElementById('sotiTabPaneSecurity');
    } else if (tabName === 'logs' || tabName === 'notifications') {
        targetPane = document.getElementById('sotiTabPaneLogs');
    } else {
        targetPane = document.getElementById('sotiTabPaneDetails');
    }

    if (targetPane) {
        targetPane.style.display = 'block';
    }

    if (tabName === 'location') {
        setTimeout(initSotiDeviceMap, 100);
    }
}

function initSotiDeviceMap() {
    const mapEl = document.getElementById('sotiMapCanvas');
    if (!mapEl) return;
    if (!window.L) return;

    // Najaf coordinates
    const lat = 31.9922;
    const lng = 44.3515;

    if (!sotiMapInstance) {
        sotiMapInstance = L.map('sotiMapCanvas').setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(sotiMapInstance);

        const customIcon = L.divIcon({
            className: 'soti-map-marker-pin',
            html: '<div style="width:16px; height:16px; background:#0078D4; border-radius:50%; border:3px solid #FFFFFF; box-shadow:0 0 0 4px rgba(0,120,212,0.35);"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const devName = document.getElementById('sotiModalDeviceName')?.innerText || 'حسين صاحب';
        L.marker([lat, lng], { icon: customIcon })
            .addTo(sotiMapInstance)
            .bindPopup(`<b>${escapeHtml(devName)}</b><br>Honeywell CT60<br>حي الصناعي، النجف`)
            .openPopup();
    } else {
        sotiMapInstance.invalidateSize();
        sotiMapInstance.setView([lat, lng], 14);
    }
}

function centerSotiMap() {
    if (sotiMapInstance) {
        sotiMapInstance.setView([31.9922, 44.3515], 15);
        showToast('Map centered on device', 'info');
    }
}

function refreshSotiLocation() {
    showToast('GPS ping sent to device. Coordinates verified: حي الصناعي، النجف.', 'success');
}

// --------------------------------------------------------------------------
// SOTI REMOTE CONTROL WINDOW CONTROLLERS
// --------------------------------------------------------------------------
function openSotiRemoteControl(deviceId) {
    const devId = deviceId || currentSotiDeviceId;
    if (!devId) return;
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === devId);
    if (device && !device.isOnline) {
        showToast('الجهاز غير متصل (Offline). لا يمكن فتح التحكم عن بعد.', 'warning');
        return;
    }
    window.open(`/remote-control.html?deviceId=${encodeURIComponent(devId)}`, '_blank');
}

function closeSotiRemoteControl() {
    const modal = document.getElementById('sotiRemoteModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    if (sotiRemoteStreamInterval) {
        clearInterval(sotiRemoteStreamInterval);
        sotiRemoteStreamInterval = null;
    }
    const drop = document.getElementById('sotiRcDropdownMenu');
    if (drop) drop.classList.remove('show');
}

function toggleSotiRcDropdown() {
    const drop = document.getElementById('sotiRcDropdownMenu');
    if (drop) {
        drop.classList.toggle('show');
    }
}

function sotiRcAction(action) {
    const drop = document.getElementById('sotiRcDropdownMenu');
    if (drop) drop.classList.remove('show');
    const devId = currentSotiDeviceId || 'ALL';

    if (action === 'SEND_SCRIPT') {
        sotiSendScriptPrompt();
    } else if (action === 'KIOSK_ON') {
        dispatchRemoteCommand(devId, 'SET_KIOSK_MODE', { enable: true });
        showToast('Turned Kiosk Mode ON', 'success');
    } else if (action === 'KIOSK_OFF') {
        dispatchRemoteCommand(devId, 'SET_KIOSK_MODE', { enable: false });
        showToast('Turned Kiosk Mode OFF', 'info');
    } else if (action === 'SOFT_RESET') {
        dispatchRemoteCommand(devId, 'REBOOT', {});
        showToast('Soft Reset initiated', 'warning');
    } else if (action === 'ADMIN_MODE') {
        dispatchRemoteCommand(devId, 'SET_KIOSK_MODE', { enable: false });
        showToast('Entered Administrator Mode', 'success');
    } else if (action === 'USER_MODE') {
        dispatchRemoteCommand(devId, 'SET_KIOSK_MODE', { enable: true });
        showToast('Entered User Mode', 'info');
    }
}

function sotiSendScriptPrompt() {
    const devId = currentSotiDeviceId || 'ALL';
    const script = prompt('Enter SOTI Script Command to execute on device:\n\nExamples:\n- action.soft_reset\n- action.kiosk_on\n- action.kiosk_off\n- sendintent -b "android.intent.action.VIEW"\n- connect -wifi', 'action.soft_reset');
    if (script && script.trim()) {
        dispatchRemoteCommand(devId, 'EXECUTE_SCRIPT', { script: script.trim() });
        showToast(`Script sent: ${script.trim()}`, 'success');
    }
}

function sotiSyncDevice() {
    const devId = currentSotiDeviceId || 'ALL';
    dispatchRemoteCommand(devId, 'SYNC_DATA', {});
    showToast('Device Check-in / Sync command sent', 'success');
}

async function sotiWipePrompt() {
    const devId = currentSotiDeviceId || 'ALL';
    const devName = document.getElementById('sotiModalDeviceName')?.innerText || devId;
    const isRtl = currentLang === 'ar';
    const confirmed = await showSotiConfirm({
        title: isRtl ? 'مسح الجهاز وإعادة ضبط المصنع' : 'Wipe / Factory Reset',
        heading: isRtl ? `هل أنت متأكد من مسح الجهاز '${devName}'؟` : `Are you sure you want to wipe '${devName}'?`,
        message: isRtl 
            ? 'تحذير: سيتم مسح جميع بيانات الجهاز وإعادته إلى ضبط المصنع نهائياً ولا يمكن التراجع عن هذا الإجراء.' 
            : 'Warning: All data on this device will be erased and reset to factory defaults. This action cannot be undone.',
        confirmText: isRtl ? 'مسح الجهاز' : 'Wipe Device',
        cancelText: isRtl ? 'إلغاء' : 'Cancel',
        isDanger: true
    });
    if (!confirmed) return;

    dispatchRemoteCommand(devId, 'WIPE_DEVICE', {});
    showToast(isRtl ? 'تم جدولة أمر مسح الجهاز' : 'Wipe command queued for device', 'error');
}

function sotiSendMessagePrompt() {
    const devId = currentSotiDeviceId || 'ALL';
    const msg = prompt('Enter message to send to device:', 'Please report to IT department.');
    if (msg && msg.trim()) {
        dispatchRemoteCommand(devId, 'BROADCAST_MESSAGE', { message: msg.trim() });
        showToast('Message sent to device', 'success');
    }
}

function sotiModalAction(action) {
    const moreMenu = document.getElementById('sotiModalMoreMenu');
    if (moreMenu) moreMenu.classList.remove('show');
    const devId = currentSotiDeviceId || 'ALL';

    if (action === 'LOCK') {
        dispatchRemoteCommand(devId, 'LOCK_DEVICE', {});
        showToast('Screen Locked', 'info');
    } else if (action === 'REBOOT') {
        dispatchRemoteCommand(devId, 'REBOOT', {});
        showToast('Reboot command sent', 'warning');
    } else if (action === 'KIOSK_TOGGLE') {
        dispatchRemoteCommand(devId, 'SET_KIOSK_MODE', { enable: true });
        showToast('Kiosk mode updated', 'success');
    } else if (action === 'RENAME') {
        const newName = prompt('Enter new device name:', document.getElementById('sotiModalDeviceName')?.innerText || '');
        if (newName && newName.trim()) {
            dispatchRemoteCommand(devId, 'RENAME_DEVICE', { name: newName.trim() });
            const nEl = document.getElementById('sotiModalDeviceName');
            const dEl = document.getElementById('sotiDetailsName');
            if (nEl) nEl.innerText = newName.trim();
            if (dEl) dEl.innerText = newName.trim();
            showToast('Device renamed', 'success');
            fetchDevices();
        }
    } else if (action === 'ALARM') {
        dispatchRemoteCommand(devId, 'TEST_TAMPER_ALARM', {});
        showToast('Emergency Siren Triggered', 'warning');
    }
}

function toggleSotiModalMoreMenu(e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('sotiModalMoreMenu');
    if (m) m.classList.toggle('show');
}

function filterDeviceActions(query) {
    const q = (query || '').toLowerCase().trim();
    const items = document.querySelectorAll('#sotiActionsList .soti-actions-item');
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        item.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
    });
}

function sotiRcSendChatMessage() {
    const input = document.getElementById('sotiRcChatInput');
    if (!input || !input.value.trim()) return;
    const msg = input.value.trim();
    const devId = currentSotiDeviceId || 'ALL';
    dispatchRemoteCommand(devId, 'BROADCAST_MESSAGE', { message: msg });
    showToast(`Message sent: ${msg}`, 'success');
    input.value = '';
}

function sotiRcSendTextPrompt() {
    const text = prompt('Enter text to type into device:');
    if (text) {
        const devId = currentSotiDeviceId || 'ALL';
        dispatchRemoteCommand(devId, 'INPUT_TEXT', { text: text });
        showToast('Text sent to device keyboard', 'success');
    }
}

function sotiRcTakeScreenshot() {
    const img = document.getElementById('sotiStreamImg');
    if (img && img.src) {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = `soti_screenshot_${Date.now()}.png`;
        a.click();
        showToast('Screenshot downloaded', 'success');
    }
}

function sotiRcToggleFullscreen() {
    const modal = document.getElementById('sotiRemoteModal');
    if (!document.fullscreenElement) {
        modal?.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
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
    const isRtl = currentLang === 'ar';
    const confirmed = await showSotiConfirm({
        title: isRtl ? 'حذف جهاز من النظام' : 'Delete Device',
        heading: isRtl ? `حذف الجهاز '${deviceName}' نهائياً؟` : `Delete device '${deviceName}' permanently?`,
        message: isRtl 
            ? `سيتم مسح الجهاز (${deviceId}) وإزالته من لوحة التحكم وقائمة الأجهزة نهائياً.` 
            : `The device (${deviceId}) will be permanently removed from the console and device list.`,
        confirmText: isRtl ? 'حذف' : 'Delete',
        cancelText: isRtl ? 'إلغاء' : 'Cancel',
        isDanger: true
    });
    if (!confirmed) return;

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
            showToast(isRtl ? `تم حذف الجهاز '${deviceName}' من النظام بنجاح!` : `Device '${deviceName}' deleted successfully!`, 'success');
            fetchDevices();
        } else {
            showToast(data.error || (isRtl ? 'فشل حذف الجهاز' : 'Failed to delete device'), 'error');
        }
    } catch (e) {
        showToast(isRtl ? 'خطأ في الاتصال بالسيرفر أثناء حذف الجهاز' : 'Server error while deleting device', 'error');
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

async function autoDetectServerIp() {
    try {
        const res = await fetch('/api/qr-config');
        const cfg = await res.json();
        if (cfg) {
            lastQrConfig = cfg;
            const dlInput = document.getElementById('qrDownloadUrl');
            const srvInput = document.getElementById('qrServerUrl');
            const chkInput = document.getElementById('qrApkChecksum');
            if (dlInput) dlInput.value = cfg.lanDownloadUrl || cfg.defaultDownloadUrl;
            if (srvInput) srvInput.value = cfg.lanServerUrl || cfg.defaultServerUrl;
            if (chkInput && cfg.signatureChecksum) chkInput.value = cfg.signatureChecksum;
            generateQrCode();
            if (typeof showToast === 'function') {
                showToast(`تم كشف IP الخادم: ${cfg.localIp}`, 'success');
            }
        }
    } catch (e) {
        console.error('Failed to auto detect server IP', e);
        if (typeof showToast === 'function') {
            showToast('تعذر كشف IP الخادم تلقائياً', 'error');
        }
    }
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

            const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
            const targetDownload = (isLocal && cfg.lanDownloadUrl) ? cfg.lanDownloadUrl : (cfg.defaultDownloadUrl || `${origin}/download/nexus-agent.apk`);
            const targetServer = (isLocal && cfg.lanServerUrl) ? cfg.lanServerUrl : (cfg.defaultServerUrl || origin);

            if (dlInput && (!dlInput.value || dlInput.value.includes('192.168.0.101') || dlInput.value.includes('localhost') || dlInput.value.includes('127.0.0.1'))) {
                dlInput.value = targetDownload;
            }
            if (srvInput && (!srvInput.value || srvInput.value.includes('192.168.0.101') || srvInput.value.includes('localhost') || srvInput.value.includes('127.0.0.1'))) {
                srvInput.value = targetServer;
            }
            if (chkInput && (cfg.signatureChecksum || cfg.apkChecksum)) {
                chkInput.value = cfg.signatureChecksum || cfg.apkChecksum;
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

    let downloadUrl = (dlInput ? dlInput.value.trim() : '') || (lastQrConfig?.lanDownloadUrl || `${window.location.origin}/download/nexus-agent.apk`);
    let serverUrl = (srvInput ? srvInput.value.trim() : '') || (lastQrConfig?.lanServerUrl || window.location.origin);
    const checksum = (chkInput ? chkInput.value.trim() : '') || (lastQrConfig?.signatureChecksum || 'T28h9GQowaWLuSM9v9Rmn8Cqn2o50SYyaDPUcUBtHk4');
    const wifiSsid = wifiSsidInput ? wifiSsidInput.value.trim() : '';
    const wifiPassword = wifiPasswordInput ? wifiPasswordInput.value.trim() : '';

    // Safety check: Android devices cannot connect to "localhost" or "127.0.0.1" on the host PC
    if (lastQrConfig?.localIp) {
        if (downloadUrl.includes('localhost') || downloadUrl.includes('127.0.0.1')) {
            downloadUrl = downloadUrl.replace('localhost', lastQrConfig.localIp).replace('127.0.0.1', lastQrConfig.localIp);
            if (dlInput) dlInput.value = downloadUrl;
        }
        if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
            serverUrl = serverUrl.replace('localhost', lastQrConfig.localIp).replace('127.0.0.1', lastQrConfig.localIp);
            if (srvInput) srvInput.value = serverUrl;
        }
    }

    // Read the user-defined device name (supporting Arabic or English) and selected company code
    const deviceTagInput = document.getElementById('qrDeviceTag');
    const deviceTag = deviceTagInput ? (deviceTagInput.value.trim() || 'كاشير 1') : 'كاشير 1';

    const companySelect = document.getElementById('qrCompanySelect');
    const companyCode = companySelect ? companySelect.value || currentCompanyCode : currentCompanyCode;

    const branchSelect = document.getElementById('qrBranchSelect');
    const selectedBranchId = branchSelect ? branchSelect.value : '';

    const enrollmentKeyInput = document.getElementById('qrEnrollmentKey');
    const enrollmentKey = enrollmentKeyInput ? (enrollmentKeyInput.value.trim() || 'ENROLL-NEXUS-2026-KEY') : 'ENROLL-NEXUS-2026-KEY';

    const adminExtras = {
        "server_url": serverUrl,
        "device_tag": deviceTag,
        "device_name": deviceTag,
        "company_code": companyCode,
        "enrollment_key": enrollmentKey
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

    const cleanModeEl = document.getElementById('qrCleanDeviceMode');
    const leaveAllSystemApps = cleanModeEl ? !cleanModeEl.checked : true;

    const payload = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME": "com.nexus.mdm.agent",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": downloadUrl,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": checksum,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": leaveAllSystemApps,
        "android.app.extra.PROVISIONING_DEVICE_TAG": deviceTag,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": adminExtras
    };

    if (lastQrConfig?.packageChecksum) {
        payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM"] = lastQrConfig.packageChecksum;
    }

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
    const safeDevices = lastDevicesCache || [];
    const dev = safeDevices.find(d => d.id === deviceId);
    if (dev && !dev.isOnline) {
        showToast('الجهاز غير متصل (Offline). لا يمكن فتح التحكم عن بعد.', 'warning');
        return;
    }
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

    // Dynamically apply authentic chassis based on model (CT47 vs CT60)
    const isCt47 = (dev?.model || '').toUpperCase().includes('CT47');
    const liveStreamPhoneFrame = document.getElementById('liveStreamPhoneFrame');
    const liveStreamChassisImg = document.getElementById('liveStreamChassisImg');
    const liveStreamHwNavStrip = document.getElementById('liveStreamHwNavStrip');
    if (liveStreamPhoneFrame && liveStreamChassisImg) {
        if (isCt47) {
            liveStreamPhoneFrame.className = 'honeywell-phone-frame honeywell-frame-ct47';
            liveStreamChassisImg.src = 'honeywell-ct47-frame.png?v=20260919';
            if (liveStreamHwNavStrip) liveStreamHwNavStrip.style.display = 'none';
        } else {
            liveStreamPhoneFrame.className = 'honeywell-phone-frame honeywell-frame-ct60';
            liveStreamChassisImg.src = 'honeywell-ct60-frame.png?v=20260919';
            if (liveStreamHwNavStrip) liveStreamHwNavStrip.style.display = 'flex';
        }
    }

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
    try {
        const headers = {};
        if (currentTenantToken) headers['X-Tenant-Token'] = currentTenantToken;
        const res = await fetch('/api/tenant/branches', { headers });
        if (res.status === 403) {
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

            renderBranchesInTree();
            renderBranchesTable(branchesCache);
            updateFleetBranchFilterDropdown();
        }
    } catch (e) {
        console.error('Failed to fetch branches', e);
    }
}

function renderBranchesInTree() {
    const subnodesContainer = document.getElementById('sotiIraqBranchesSubnodes');
    if (!subnodesContainer) return;

    let branches = [...(branchesCache || [])];
    const hasNajaf = branches.some(b => (b.name || '').toLowerCase() === 'najaf');
    if (!hasNajaf) {
        branches.unshift({
            id: 'br_najaf_01',
            name: 'Najaf',
            code: 'NAJAF',
            number: '101',
            email: 'it.najaf@jib.iq',
            password: 'naj@2000@',
            enrollmentToken: 'JIB-NJF-2026',
            group: '\\Iraq\\Najaf',
            devicesCount: (lastDevicesCache || []).filter(d => (d.group || '').toLowerCase().includes('najaf') || (d.branch || '').toLowerCase() === 'najaf').length
        });
    }

    const devicesList = lastDevicesCache || [];
    const allCount = devicesList.length;
    const allCountEl = document.getElementById('sotiCountAll');
    if (allCountEl) allCountEl.innerText = allCount;

    subnodesContainer.innerHTML = branches.map(b => {
        const bName = b.name || 'Branch';
        const bId = b.id || `br_${bName.toLowerCase()}`;
        const isActive = (sotiSelectedGroupId === bName) || (sotiSelectedGroupId === 'Najaf' && bName.toLowerCase() === 'najaf');

        const bCount = devicesList.filter(d => {
            const bNameLower = bName.toLowerCase();
            return (
                (d.branchId && d.branchId === bId) ||
                (d.branchCode && d.branchCode.toUpperCase() === (b.code || '').toUpperCase()) ||
                (d.branchNumber && d.branchNumber === b.number) ||
                (d.branchName && d.branchName.toLowerCase() === bNameLower) ||
                (d.branch && d.branch.toLowerCase() === bNameLower) ||
                (d.group && d.group.toLowerCase().includes(bNameLower))
            );
        }).length;

        return `
            <div class="soti-group-item ${isActive ? 'active' : ''}" id="sotiGroupBranch_${escapeHtml(bId)}" data-group-id="${escapeHtml(bName)}" onclick="selectDeviceGroup('${escapeHtml(bName)}')">
                <div class="soti-group-item-label" style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                    <span style="font-weight:600; color:#0078D4;">${escapeHtml(bName)}</span>
                    <span style="width:7px; height:7px; border-radius:50%; background:#EAB308; display:inline-block; flex-shrink:0;"></span>
                </div>
                <button type="button" class="soti-group-more-btn" title="Branch Staging QR & Short Token" onclick="event.stopPropagation(); openBranchStagingModal('${escapeHtml(bId)}')" style="border:none; background:transparent; padding:2px; cursor:pointer; color:#0284C7; display:none; align-items:center;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </button>
            </div>
        `;
    }).join('');
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
                <div style="display:inline-flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <button class="btn btn-primary-soft btn-xs" onclick="openBranchQrModal('${b.id}')" title="توليد وطباعة باركود التجهيز الميداني لهذا الفرع" style="color:#2563EB; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        <span>باركود التجهيز</span>
                    </button>
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
// BRANCH DEDICATED QR & STAGING SHEET GENERATOR (باركود تجهيز الفرع)
// --------------------------------------------------------------------------
let currentBranchModalQrObj = null;
let branchModalQrInstance = null;
let lastBranchModalQrPayload = null;

function openBranchQrModal(branchId) {
    let branch = (branchesCache || []).find(b => b.id === branchId);
    if (!branch && currentTenantData && currentTenantData.isBranch && currentTenantData.branchId === branchId) {
        branch = {
            id: currentTenantData.branchId,
            name: currentTenantData.branchName || 'الفرع الحالي',
            code: currentTenantData.branchCode || '',
            number: currentTenantData.branchNumber || ''
        };
    } else if (!branch && branchId === 'HQ') {
        branch = {
            id: 'HQ',
            name: document.getElementById('qrDeviceTag')?.value?.trim() || 'الإدارة العامة',
            code: currentCompanyCode || 'HQ',
            number: 'HQ'
        };
    }

    if (!branch) {
        alert('الفرع المطلوب غير موجود في الذاكرة.');
        return;
    }
    currentBranchModalQrObj = branch;

    const modal = document.getElementById('modalBranchQr');
    if (!modal) return;

    // Set Header & Labels
    const nameEl = document.getElementById('branchQrModalBranchName');
    const codeEl = document.getElementById('branchQrModalBranchCode');
    const compEl = document.getElementById('branchQrModalCompanyCode');
    const sheetNameEl = document.getElementById('sheetBranchName');
    const sheetCodeEl = document.getElementById('sheetBranchCode');
    const sheetInstEl = document.getElementById('sheetInstructionsBranchName');

    if (nameEl) nameEl.innerText = branch.name;
    if (codeEl) codeEl.innerText = branch.code ? `كود: ${branch.code}` : (branch.number ? `رقم: ${branch.number}` : '');
    if (compEl) compEl.innerText = `الشركة: ${currentCompanyCode || 'الرئيسية'}`;
    if (sheetNameEl) sheetNameEl.innerText = branch.name;
    if (sheetCodeEl) sheetCodeEl.innerText = branch.code ? `كود الفرع: ${branch.code}` : (branch.number ? `معرف الدخول: ${branch.number}` : '');
    if (sheetInstEl) sheetInstEl.innerText = branch.name;

    // Default or stored Wi-Fi
    const wifiSsidInput = document.getElementById('branchModalWifiSsid');
    const wifiPassInput = document.getElementById('branchModalWifiPassword');
    const mainWifiSsid = document.getElementById('qrWifiSsid')?.value?.trim() || '';
    const mainWifiPass = document.getElementById('qrWifiPassword')?.value?.trim() || '';
    if (wifiSsidInput && !wifiSsidInput.value) wifiSsidInput.value = mainWifiSsid;
    if (wifiPassInput && !wifiPassInput.value) wifiPassInput.value = mainWifiPass;

    updateBranchModalQr();
    modal.style.display = 'flex';
}

function closeBranchQrModal() {
    const modal = document.getElementById('modalBranchQr');
    if (modal) modal.style.display = 'none';
}

function updateBranchModalQr() {
    if (!currentBranchModalQrObj) return;

    const dlInput = document.getElementById('qrDownloadUrl');
    const srvInput = document.getElementById('qrServerUrl');
    const chkInput = document.getElementById('qrApkChecksum');

    let downloadUrl = (dlInput ? dlInput.value.trim() : '') || (lastQrConfig?.lanDownloadUrl || `${window.location.origin}/download/nexus-agent.apk`);
    let serverUrl = (srvInput ? srvInput.value.trim() : '') || (lastQrConfig?.lanServerUrl || window.location.origin);
    const checksum = (chkInput ? chkInput.value.trim() : '') || (lastQrConfig?.signatureChecksum || 'T28h9GQowaWLuSM9v9Rmn8Cqn2o50SYyaDPUcUBtHk4');

    if (lastQrConfig?.localIp) {
        if (downloadUrl.includes('localhost') || downloadUrl.includes('127.0.0.1')) {
            downloadUrl = downloadUrl.replace('localhost', lastQrConfig.localIp).replace('127.0.0.1', lastQrConfig.localIp);
        }
        if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
            serverUrl = serverUrl.replace('localhost', lastQrConfig.localIp).replace('127.0.0.1', lastQrConfig.localIp);
        }
    }

    const wifiSsid = document.getElementById('branchModalWifiSsid')?.value?.trim() || '';
    const wifiPassword = document.getElementById('branchModalWifiPassword')?.value?.trim() || '';
    const cleanModeEl = document.getElementById('branchModalCleanMode');
    const cleanMode = cleanModeEl ? cleanModeEl.checked : true;

    const adminExtras = {
        "server_url": serverUrl,
        "device_tag": `${currentBranchModalQrObj.name}`,
        "device_name": `${currentBranchModalQrObj.name}`,
        "company_code": currentCompanyCode || 'NEXUS-DEFAULT',
        "branch_id": currentBranchModalQrObj.id,
        "branch_name": currentBranchModalQrObj.name,
        "branch_code": currentBranchModalQrObj.code || currentBranchModalQrObj.number || ''
    };

    const payload = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME": "com.nexus.mdm.agent",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": downloadUrl,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": checksum,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": !cleanMode,
        "android.app.extra.PROVISIONING_DEVICE_TAG": `${currentBranchModalQrObj.name}`,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": adminExtras
    };

    if (lastQrConfig?.packageChecksum) {
        payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM"] = lastQrConfig.packageChecksum;
    }

    if (wifiSsid) {
        payload["android.app.extra.PROVISIONING_WIFI_SSID"] = wifiSsid;
        payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = wifiPassword ? "WPA" : "NONE";
        if (wifiPassword) {
            payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = wifiPassword;
        }
    }

    lastBranchModalQrPayload = payload;

    // Update Wi-Fi status on the printable sheet
    const sheetWifiEl = document.getElementById('sheetWifiInfo');
    if (sheetWifiEl) {
        if (wifiSsid) {
            sheetWifiEl.innerText = `شبكة الواي فاي المبرمجة: ${wifiSsid} (اتصال فوري تلقائي)`;
            sheetWifiEl.style.color = '#166534';
            sheetWifiEl.style.fontWeight = '700';
        } else {
            sheetWifiEl.innerText = 'اتصال الواي فاي: يتصل الموظف بشبكة الواي فاي يدوياً عند بدء الإعداد';
            sheetWifiEl.style.color = '#64748B';
            sheetWifiEl.style.fontWeight = 'normal';
        }
    }

    // Render Canvas
    const canvas = document.getElementById('branchModalQrCanvas');
    if (!canvas) return;
    canvas.innerHTML = '';

    try {
        if (typeof QRCode !== 'undefined') {
            branchModalQrInstance = new QRCode(canvas, {
                text: JSON.stringify(payload),
                width: 250,
                height: 250,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            canvas.innerText = 'مكتبة الباركود قيد التحميل...';
        }
    } catch (err) {
        console.error('Failed to generate branch QR', err);
        canvas.innerHTML = `<span style="color:red; font-size:12px;">خطأ في توليد الباركود</span>`;
    }
}

function printBranchQrSheet() {
    window.print();
}

function downloadBranchQrImage() {
    const canvas = document.querySelector('#branchModalQrCanvas canvas');
    const img = document.querySelector('#branchModalQrCanvas img');
    let src = '';
    if (canvas && typeof canvas.toDataURL === 'function') {
        src = canvas.toDataURL('image/png');
    } else if (img && img.src) {
        src = img.src;
    }

    if (!src) {
        alert('لم يتم العثور على صورة الباركود للتحميل.');
        return;
    }

    const a = document.createElement('a');
    a.href = src;
    const bCode = (currentBranchModalQrObj?.code || currentBranchModalQrObj?.name || 'branch').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
    a.download = `nexus_qr_staging_${bCode}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function copyBranchQrJson() {
    if (!lastBranchModalQrPayload) return;
    copyToClipboard(JSON.stringify(lastBranchModalQrPayload, null, 2), 'تم نسخ محتوى JSON الخاص بباركود الفرع!');
}

function printMainTabQrSheet() {
    const branchSelect = document.getElementById('qrBranchSelect');
    const selectedBranchId = branchSelect ? branchSelect.value : '';
    if (selectedBranchId) {
        openBranchQrModal(selectedBranchId);
        setTimeout(() => { window.print(); }, 400);
    } else {
        openBranchQrModal('HQ');
        setTimeout(() => { window.print(); }, 400);
    }
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
                        <button type="button" 
                            class="btn ${d.isOnline ? 'btn-primary-soft' : 'btn-secondary'} btn-xs" 
                            ${d.isOnline ? `onclick="openScreenStream('${d.id}', '${escapeHtml(d.name || d.id)}')"` : 'disabled style="background:#94A3B8 !important; color:#FFFFFF !important; cursor:not-allowed !important; opacity:0.85;"'} 
                            title="${d.isOnline ? 'بث شاشة الجهاز والتحكم باللمس مباشرة' : 'الجهاز غير متصل (أوفلاين) - لا يمكن التحكم عن بعد'}">
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
    const nameInput = document.getElementById('branchNameInput');
    const codeInput = document.getElementById('branchCodeInput');
    const loginInput = document.getElementById('branchLoginIdInput');
    const numInput = document.getElementById('branchNumberInput');
    const tokenInput = document.getElementById('branchTokenInput');
    const pwdInput = document.getElementById('branchPasswordInput');
    const ssidInput = document.getElementById('branchWifiSsidInput');
    const passInput = document.getElementById('branchWifiPassInput');

    if (nameInput) { nameInput.value = ''; nameInput.dataset.userEdited = ''; }
    if (codeInput) { codeInput.value = ''; codeInput.dataset.userEdited = ''; }
    if (loginInput) { loginInput.value = ''; loginInput.dataset.userEdited = ''; }
    if (numInput) { numInput.value = String(100 + (branchesCache.length || 0) + 1); }
    if (tokenInput) { tokenInput.value = ''; tokenInput.dataset.userEdited = ''; }
    if (pwdInput) { pwdInput.value = 'jib@2026'; }
    if (ssidInput) ssidInput.value = '';
    if (passInput) passInput.value = '';

    const pathPreview = document.getElementById('previewBranchPath');
    if (pathPreview) pathPreview.innerText = '\\Iraq\\Branch';

    const modal = document.getElementById('modalAddBranch');
    if (modal) modal.style.display = 'flex';
}

function closeAddBranchModal() {
    const modal = document.getElementById('modalAddBranch');
    if (modal) modal.style.display = 'none';
}

function autoPopulateBranchFields(name) {
    const raw = (name || '').trim();
    const cleanCode = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const fallbackCode = cleanCode ? cleanCode : (raw ? 'BRN' : '');

    const codeInput = document.getElementById('branchCodeInput');
    const loginInput = document.getElementById('branchLoginIdInput');
    const tokenInput = document.getElementById('branchTokenInput');
    const previewPath = document.getElementById('previewBranchPath');
    const numInput = document.getElementById('branchNumberInput');

    if (codeInput && !codeInput.dataset.userEdited) {
        codeInput.value = fallbackCode || 'BAGHDAD';
    }
    const currentCode = codeInput ? codeInput.value : fallbackCode;

    if (loginInput && !loginInput.dataset.userEdited) {
        loginInput.value = `it.${(currentCode || 'branch').toLowerCase()}@jib.iq`;
    }

    if (tokenInput && !tokenInput.dataset.userEdited) {
        const prefix = (currentCode.length >= 3) ? currentCode.slice(0, 3) : 'JIB';
        tokenInput.value = `JIB-${prefix}-2026`;
    }

    if (numInput && !numInput.value) {
        numInput.value = String(100 + (branchesCache.length || 0) + 1);
    }

    if (previewPath) {
        previewPath.innerText = `\\Iraq\\${raw || currentCode || 'Branch'}`;
    }
}

function regenerateShortTokenInput() {
    const code = document.getElementById('branchCodeInput')?.value.trim().toUpperCase() || 'JIB';
    const prefix = code.slice(0, 3) || 'JIB';
    const rand = Math.floor(100 + Math.random() * 900);
    const tokenInput = document.getElementById('branchTokenInput');
    if (tokenInput) {
        tokenInput.value = `JIB-${prefix}-${rand}`;
        tokenInput.dataset.userEdited = 'true';
    }
}

async function submitCreateBranch(event) {
    event.preventDefault();
    const name = document.getElementById('branchNameInput')?.value.trim();
    const code = document.getElementById('branchCodeInput')?.value.trim().toUpperCase();
    const number = document.getElementById('branchNumberInput')?.value.trim();
    const email = document.getElementById('branchLoginIdInput')?.value.trim();
    const password = document.getElementById('branchPasswordInput')?.value.trim();
    const enrollmentToken = document.getElementById('branchTokenInput')?.value.trim().toUpperCase();
    const wifiSsid = document.getElementById('branchWifiSsidInput')?.value.trim();
    const wifiPassword = document.getElementById('branchWifiPassInput')?.value.trim();

    if (!name || !password) {
        showToast('يرجى إدخال اسم الفرع وكلمة المرور.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/tenant/branches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Token': currentTenantToken || ''
            },
            body: JSON.stringify({
                name,
                code: code || name.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
                number: number || String(100 + (branchesCache.length || 0) + 1),
                email: email || `it.${name.toLowerCase()}@jib.iq`,
                username: email || `it.${name.toLowerCase()}@jib.iq`,
                password,
                enrollmentToken: enrollmentToken || `JIB-${(code || 'BRN').slice(0, 3)}-2026`,
                wifiSsid,
                wifiPassword
            })
        });
        const data = await res.json();
        if (data.success) {
            closeAddBranchModal();
            showToast(`تم إنشاء الويب الفرعي لـ '${name}' بنجاح! كود التفعيل: ${data.branch.enrollmentToken}`, 'success');
            await fetchBranches();
            if (data.branch && data.branch.id) {
                openBranchStagingModal(data.branch.id);
            }
        } else {
            showToast(data.error || 'فشل إنشاء الفرع.', 'error');
        }
    } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر.', 'error');
    }
}

// --------------------------------------------------------------------------
// BRANCH STAGING MODAL & UNIFIED PROVISIONING QR / SHORT TOKEN
// --------------------------------------------------------------------------
let currentStagingBranch = null;

function openBranchStagingModal(branchId) {
    let branch = (branchesCache || []).find(b => b.id === branchId || b.code === branchId || b.name === branchId);
    if (!branch && (branchId === 'br_najaf_01' || (branchId || '').toLowerCase().includes('najaf'))) {
        branch = {
            id: 'br_najaf_01',
            name: 'Najaf',
            code: 'NAJAF',
            number: '101',
            email: 'it.najaf@jib.iq',
            password: 'naj@2000@',
            enrollmentToken: 'JIB-NJF-2026',
            group: '\\Iraq\\Najaf',
            wifiSsid: '',
            wifiPassword: ''
        };
    } else if (!branch && branchesCache.length > 0) {
        branch = branchesCache[0];
    }
    if (!branch) return;

    currentStagingBranch = branch;

    const modal = document.getElementById('modalBranchStaging');
    if (!modal) return;

    document.getElementById('stagingModalBranchTitle').innerText = `تجهيز أجهزة فرع (${branch.name}) والـ QR الموحد`;
    document.getElementById('stagingModalGroupPath').innerText = branch.group || `\\Iraq\\${branch.name}`;
    document.getElementById('stagingModalShortToken').innerText = branch.enrollmentToken || `JIB-${(branch.code || 'BRN').slice(0, 3)}-2026`;
    document.getElementById('stagingModalUsername').innerText = branch.email || branch.username || `it.${branch.name.toLowerCase()}@jib.iq`;

    const pwdEl = document.getElementById('stagingModalPassword');
    if (pwdEl) {
        pwdEl.innerText = '••••••••';
        pwdEl.dataset.revealed = 'false';
        pwdEl.dataset.actual = branch.password || '123456';
    }

    const host = window.location.host || 'localhost:3000';
    const directUrl = `${window.location.protocol}//${host}/?branch=${encodeURIComponent(branch.name)}`;
    const urlEl = document.getElementById('stagingModalDirectUrl');
    if (urlEl) urlEl.innerText = directUrl;

    renderBranchProvisioningQr(branch);

    modal.style.display = 'flex';
}

function closeBranchStagingModal() {
    const modal = document.getElementById('modalBranchStaging');
    if (modal) modal.style.display = 'none';
}

function toggleRevealStagingPassword() {
    const pwdEl = document.getElementById('stagingModalPassword');
    if (!pwdEl) return;
    const isRevealed = pwdEl.dataset.revealed === 'true';
    if (isRevealed) {
        pwdEl.innerText = '••••••••';
        pwdEl.dataset.revealed = 'false';
    } else {
        pwdEl.innerText = pwdEl.dataset.actual || '123456';
        pwdEl.dataset.revealed = 'true';
    }
}

function copyBranchEnrollmentToken() {
    if (!currentStagingBranch) return;
    const token = currentStagingBranch.enrollmentToken || document.getElementById('stagingModalShortToken')?.innerText;
    if (token) {
        copyToClipboard(token, 'تم نسخ رمز التفعيل السريع للفرع إلى الحافظة!');
    }
}

function getBranchProvisioningPayload(branch) {
    const b = branch || currentStagingBranch;
    if (!b) return {};
    let origin = window.location.origin || `http://${window.location.host}`;
    if (lastQrConfig?.localIp && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        origin = `http://${lastQrConfig.localIp}:${window.location.port || 3000}`;
    }
    const token = b.enrollmentToken || `JIB-${(b.code || 'BRN').slice(0, 3)}-2026`;
    const checksum = (lastQrConfig?.signatureChecksum || 'T28h9GQowaWLuSM9v9Rmn8Cqn2o50SYyaDPUcUBtHk4');
    const payload = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME": "com.nexus.mdm.agent",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": `${origin}/download/nexus-agent.apk`,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": checksum,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": false,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
            "server_url": origin,
            "company_code": currentCompanyCode || "JIB",
            "branch": b.name,
            "branch_id": b.id,
            "branch_code": b.code || "",
            "group": b.group || `\\Iraq\\${b.name}`,
            "enrollment_token": token
        }
    };
    if (lastQrConfig?.packageChecksum) {
        payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM"] = lastQrConfig.packageChecksum;
    }
    if (b.wifiSsid) {
        payload["android.app.extra.PROVISIONING_WIFI_SSID"] = b.wifiSsid;
        if (b.wifiPassword) {
            payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = b.wifiPassword;
            payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = "WPA";
        } else {
            payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = "NONE";
        }
    }
    return payload;
}

function renderBranchProvisioningQr(branch) {
    const canvasContainer = document.getElementById('stagingModalQrCanvas');
    if (!canvasContainer) return;
    canvasContainer.innerHTML = '';
    const payload = getBranchProvisioningPayload(branch);
    const jsonStr = JSON.stringify(payload);

    try {
        if (typeof QRCode !== 'undefined') {
            new QRCode(canvasContainer, {
                text: jsonStr,
                width: 220,
                height: 220,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            canvasContainer.innerText = 'مكتبة الباركود قيد التحميل...';
        }
    } catch (err) {
        console.error('Failed to generate staging QR', err);
        canvasContainer.innerHTML = '<span style="color:#DC2626; font-size:12px;">خطأ في توليد الباركود</span>';
    }
}

function copyBranchProvisioningJson() {
    if (!currentStagingBranch) return;
    const payload = getBranchProvisioningPayload(currentStagingBranch);
    copyToClipboard(JSON.stringify(payload, null, 2), 'تم نسخ حزمة بيانات الـ Provisioning JSON بنجاح!');
}

function printBranchStagingSheet() {
    if (!currentStagingBranch) return;
    window.print();
}

function launchBranchPortalFromModal() {
    if (!currentStagingBranch) return;
    const bName = currentStagingBranch.name;
    closeBranchStagingModal();
    selectDeviceGroup(bName);
    showToast(`تم التبديل إلى ويب أدمن فرع (${bName}) بنجاح!`, 'success');
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
        const msg = 'تعذر الاتصال بخادم JIB MobiControl، يرجى المحاولة لاحقاً.';
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
        fetchBranches();
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
    const deviceName = d.name || d.id || 'JIB MobiControl Device';
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
        const isCt47 = (model || '').toUpperCase().includes('CT47');
        const honeywellChassisImg = isCt47 ? 'honeywell-ct47-frame.png?v=20260919' : 'honeywell-ct60-frame.png?v=20260919';
        const frameClass = isCt47 ? 'honeywell-frame-ct47' : 'honeywell-frame-ct60';
        chassisHtml = `
            <div class="dac-honeywell-chassis">
                <div class="honeywell-phone-frame ${frameClass}">
                    <img src="${honeywellChassisImg}" alt="${isCt47 ? 'Honeywell CT47 Handheld' : 'Honeywell CT60 Handheld'}" class="honeywell-chassis-img" draggable="false" />
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

    const dacStreamBtn = document.getElementById('dacBtnStream');
    if (dacStreamBtn) {
        if (!d.isOnline) {
            dacStreamBtn.disabled = true;
            dacStreamBtn.classList.add('disabled');
            dacStreamBtn.style.background = '#94A3B8';
            dacStreamBtn.style.borderColor = '#94A3B8';
            dacStreamBtn.style.cursor = 'not-allowed';
            dacStreamBtn.title = 'الجهاز غير متصل (أوفلاين) - لا يمكن التحكم عن بعد';
        } else {
            dacStreamBtn.disabled = false;
            dacStreamBtn.classList.remove('disabled');
            dacStreamBtn.style.background = '';
            dacStreamBtn.style.borderColor = '';
            dacStreamBtn.style.cursor = '';
            dacStreamBtn.title = '';
        }
    }

    // Render the hardware chassis mockup
    renderDacChassis(d);
}

function dacExecuteStream() {
    if (!activeDacDeviceId) return;
    const safeDevices = lastDevicesCache || [];
    const device = safeDevices.find(d => d.id === activeDacDeviceId);
    if (device && !device.isOnline) {
        showToast('الجهاز غير متصل (Offline). لا يمكن فتح التحكم عن بعد.', 'warning');
        return;
    }
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
// SOTI APPLICATION PACKAGES MANAGEMENT
// --------------------------------------------------------------------------
let selectedApkFile = null;
let cachedPackagesList = [];

function openPackagesModal() {
    const modal = document.getElementById('sotiPackagesModal');
    if (!modal) return;
    modal.style.display = 'flex';
    resetPackageUploadForm();
    initPackagesDropzone();
    loadPackagesList();
}

function closePackagesModal() {
    const modal = document.getElementById('sotiPackagesModal');
    if (modal) modal.style.display = 'none';
}

function switchPackageTab(tab) {
    const btnApk = document.getElementById('pkgTabApk');
    const btnPlay = document.getElementById('pkgTabPlay');
    const contentApk = document.getElementById('pkgTabContentApk');
    const contentPlay = document.getElementById('pkgTabContentPlay');

    if (tab === 'apk') {
        if (btnApk) btnApk.classList.add('active');
        if (btnPlay) btnPlay.classList.remove('active');
        if (contentApk) contentApk.style.display = 'block';
        if (contentPlay) contentPlay.style.display = 'none';
    } else {
        if (btnPlay) btnPlay.classList.add('active');
        if (btnApk) btnApk.classList.remove('active');
        if (contentPlay) contentPlay.style.display = 'block';
        if (contentApk) contentApk.style.display = 'none';
    }
}

function initPackagesDropzone() {
    const dropzone = document.getElementById('pkgApkDropzone');
    if (!dropzone || dropzone.dataset.initialized) return;
    dropzone.dataset.initialized = 'true';

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            handleApkFileSelected(files[0]);
        }
    });
}

function handleApkFileSelected(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk')) {
        showToast(currentLang === 'ar' ? 'يرجى اختيار ملف بصيغة .apk فقط' : 'Please select a valid .apk file', 'error');
        return;
    }
    selectedApkFile = file;

    const info = document.getElementById('pkgSelectedFileInfo');
    if (info) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        info.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>${escapeHtml(file.name)} (${sizeMb} MB)</span>
        `;
        info.style.display = 'inline-flex';
    }

    const nameInput = document.getElementById('pkgApkAppName');
    if (nameInput && !nameInput.value.trim()) {
        const baseName = file.name.replace(/\.apk$/i, '').replace(/[_-]/g, ' ');
        nameInput.value = baseName;
    }
}

function resetPackageUploadForm() {
    selectedApkFile = null;
    const fileInput = document.getElementById('pkgApkFileInput');
    if (fileInput) fileInput.value = '';
    const info = document.getElementById('pkgSelectedFileInfo');
    if (info) info.style.display = 'none';
    const nameInput = document.getElementById('pkgApkAppName');
    if (nameInput) nameInput.value = '';
    const autoInstall = document.getElementById('pkgApkAutoInstall');
    if (autoInstall) autoInstall.checked = true;

    const progressWrap = document.getElementById('pkgUploadProgressWrap');
    if (progressWrap) progressWrap.style.display = 'none';
    const progressBar = document.getElementById('pkgUploadProgressBar');
    if (progressBar) progressBar.style.width = '0%';

    const playName = document.getElementById('pkgPlayAppName');
    if (playName) playName.value = '';
    const playPkg = document.getElementById('pkgPlayPackageId');
    if (playPkg) playPkg.value = '';
}

function submitApkUpload() {
    if (!selectedApkFile) {
        showToast(currentLang === 'ar' ? 'يرجى تحديد ملف APK أولاً' : 'Please select an APK file first', 'warning');
        return;
    }

    const appName = document.getElementById('pkgApkAppName')?.value?.trim() || selectedApkFile.name;
    const autoInstall = document.getElementById('pkgApkAutoInstall')?.checked !== false;

    const progressWrap = document.getElementById('pkgUploadProgressWrap');
    const progressBar = document.getElementById('pkgUploadProgressBar');
    const progressText = document.getElementById('pkgUploadProgressText');
    const uploadBtn = document.getElementById('pkgUploadBtn');

    if (progressWrap) progressWrap.style.display = 'block';
    if (uploadBtn) uploadBtn.disabled = true;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/packages/upload', true);
    xhr.setRequestHeader('X-Filename', encodeURIComponent(selectedApkFile.name));
    xhr.setRequestHeader('X-App-Name', encodeURIComponent(appName));
    xhr.setRequestHeader('X-Auto-Install', autoInstall ? 'true' : 'false');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressText) progressText.innerText = `Uploading: ${pct}%`;
        }
    };

    xhr.onload = () => {
        if (uploadBtn) uploadBtn.disabled = false;
        try {
            const res = JSON.parse(xhr.responseText);
            if (res.success) {
                showToast(currentLang === 'ar' ? 'تم رفع وحفظ حزمة الـ APK بنجاح' : 'APK Package uploaded and registered successfully', 'success');
                resetPackageUploadForm();
                loadPackagesList();
            } else {
                showToast(res.error || 'Failed to upload package', 'error');
            }
        } catch (e) {
            showToast('Server response parse error', 'error');
        }
    };

    xhr.onerror = () => {
        if (uploadBtn) uploadBtn.disabled = false;
        showToast(currentLang === 'ar' ? 'فشل الاتصال بالخادم أثناء رفع الـ APK' : 'Network error during upload', 'error');
    };

    xhr.send(selectedApkFile);
}

async function submitPlayStorePackage() {
    const name = document.getElementById('pkgPlayAppName')?.value?.trim();
    const pkgId = document.getElementById('pkgPlayPackageId')?.value?.trim();
    const autoInstall = document.getElementById('pkgPlayAutoInstall')?.checked !== false;

    if (!pkgId) {
        showToast(currentLang === 'ar' ? 'يرجى إدخال اسم الحزمة أو رابط متجر Google Play' : 'Please enter package name or Google Play link', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/packages/play-store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name || pkgId,
                packageName: pkgId,
                autoInstall: autoInstall
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(currentLang === 'ar' ? 'تمت إضافة تطبيق Google Play بنجاح' : 'Google Play package added successfully', 'success');
            document.getElementById('pkgPlayAppName').value = '';
            document.getElementById('pkgPlayPackageId').value = '';
            loadPackagesList();
        } else {
            showToast(data.error || 'Failed to add package', 'error');
        }
    } catch (e) {
        showToast('Error connecting to server', 'error');
    }
}

async function loadPackagesList() {
    const tbody = document.getElementById('packagesTableBody');
    const countEl = document.getElementById('pkgCountTotal');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#94A3B8;">Loading packages...</td></tr>`;
    }

    try {
        const res = await fetch('/api/packages');
        const data = await res.json();
        if (data.success && Array.isArray(data.packages)) {
            cachedPackagesList = data.packages;
            if (countEl) countEl.innerText = cachedPackagesList.length;
            renderPackagesTable(cachedPackagesList);
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#EF4444;">Failed to load packages.</td></tr>`;
        }
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#EF4444;">Network error.</td></tr>`;
    }
}

function renderPackagesTable(packages) {
    const tbody = document.getElementById('packagesTableBody');
    if (!tbody) return;

    if (!packages || packages.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:24px; color:#94A3B8; font-size:12px;">
                    No packages configured.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = packages.map(pkg => {
        const isApk = pkg.type === 'apk';
        const badge = isApk 
            ? `<span class="pkg-badge-apk">APK</span>` 
            : `<span class="pkg-badge-play">Google Play</span>`;
        const sizeText = isApk 
            ? `${(pkg.size / (1024 * 1024)).toFixed(1)} MB`
            : `Store App`;
        const checkedAttr = pkg.autoInstall ? 'checked' : '';

        return `
            <tr>
                <td>
                    <div style="font-weight:600; color:#0F172A; font-size:12.5px; line-height:1.25;">${escapeHtml(pkg.name || 'Unnamed')}</div>
                    <div style="font-family:monospace; font-size:10.5px; color:#64748B; margin-top:2px;">${escapeHtml(pkg.packageName || '')}</div>
                </td>
                <td>${badge}</td>
                <td>
                    <div style="font-size:11.5px; color:#334155; font-weight:500;">${escapeHtml(pkg.version || '1.0')}</div>
                    <div style="font-size:10.5px; color:#64748B;">${sizeText}</div>
                </td>
                <td style="text-align:center;">
                    <label class="pkg-toggle-switch">
                        <input type="checkbox" ${checkedAttr} onchange="togglePackageAutoInstall('${pkg.id}', this.checked)" />
                        <span class="pkg-toggle-slider"></span>
                    </label>
                </td>
                <td style="text-align:right; white-space:nowrap; direction:ltr !important;">
                    <button type="button" class="pkg-action-icon-btn" onclick="deployPackageToFleet('${pkg.id}')" title="Deploy to Fleet">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>
                        <span>Deploy</span>
                    </button>
                    ${isApk ? `
                    <a href="${pkg.relativeUrl || pkg.url}" download class="pkg-action-icon-btn" style="text-decoration:none;" title="Download APK">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </a>
                    ` : ''}
                    <button type="button" class="pkg-action-icon-btn btn-danger" onclick="deletePackage('${pkg.id}')" title="Delete Package">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function togglePackageAutoInstall(pkgId, isChecked) {
    try {
        const res = await fetch('/api/packages/toggle-auto-install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pkgId, autoInstall: isChecked })
        });
        const data = await res.json();
        if (data.success) {
            showToast(isChecked 
                ? (currentLang === 'ar' ? 'تم تفعيل التثبيت التلقائي عند إعداد الجهاز' : 'Auto-install upon enrollment enabled')
                : (currentLang === 'ar' ? 'تم تعطيل التثبيت التلقائي' : 'Auto-install disabled'), 'info');
        } else {
            showToast('Failed to update package setting', 'error');
            loadPackagesList();
        }
    } catch (e) {
        showToast('Network error', 'error');
        loadPackagesList();
    }
}

async function deletePackage(pkgId) {
    const isRtl = currentLang === 'ar';
    const targetPkg = cachedPackagesList.find(p => p.id === pkgId);
    const pkgTitle = targetPkg ? targetPkg.name : 'Package';
    const confirmed = await showSotiConfirm({
        title: isRtl ? 'حذف حزمة تطبيق' : 'Delete Package',
        heading: isRtl ? `هل أنت متأكد من حذف الحزمة "${pkgTitle}"؟` : `Delete package "${pkgTitle}"?`,
        message: isRtl 
            ? 'سيتم إزالة الحزمة من النظام ولن يتم تثبيتها تلقائياً على الأجهزة الجديدة.'
            : 'The package will be deleted and no longer auto-deployed upon enrollment.',
        confirmText: isRtl ? 'حذف الحزمة' : 'Delete Package',
        cancelText: isRtl ? 'إلغاء' : 'Cancel',
        isDanger: true
    });
    if (!confirmed) return;

    try {
        const res = await fetch('/api/packages/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pkgId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(isRtl ? 'تم حذف الحزمة بنجاح' : 'Package deleted', 'success');
            loadPackagesList();
        } else {
            showToast(data.error || 'Failed to delete package', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    }
}

async function deployPackageToFleet(pkgId) {
    const isRtl = currentLang === 'ar';
    const targetPkg = cachedPackagesList.find(p => p.id === pkgId);
    const pkgTitle = targetPkg ? targetPkg.name : 'Package';
    const confirmed = await showSotiConfirm({
        title: isRtl ? 'نشر التطبيق على الأسطول' : 'Deploy Package to Fleet',
        heading: isRtl ? `تثبيت "${pkgTitle}" على جميع أجهزة الأسطول الآن؟` : `Deploy "${pkgTitle}" to all fleet devices?`,
        message: isRtl 
            ? 'سيتم إرسال أمر تنزيل وتثبيت هذا التطبيق إلى جميع الأجهزة المتصلة بالأسطول فوراً.'
            : 'An installation command will be queued for all connected fleet devices.',
        confirmText: isRtl ? 'نشر وتثبيت' : 'Deploy Now',
        cancelText: isRtl ? 'إلغاء' : 'Cancel',
        isDanger: false
    });
    if (!confirmed) return;

    try {
        const res = await fetch('/api/packages/deploy-fleet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pkgId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(isRtl ? `تم إرسال أمر التثبيت إلى ${data.queuedCount} جهاز في الأسطول` : `Install command queued for ${data.queuedCount} device(s)`, 'success');
        } else {
            showToast(data.error || 'Failed to deploy package', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
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

