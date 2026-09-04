// ==========================================================================
// Nexus Enterprise MDM - Developer Command Center Client Logic
// White & Royal Blue Professional Edition (Zero Emojis)
// ==========================================================================

let devToken = sessionStorage.getItem('nexus_dev_token');
let allTenantsCache = [];
let allDevicesCache = [];

// Non-blocking toast notification (Clean, no emojis)
function showDevToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `dev-toast toast-${type}`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.25s ease-out';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}

// Check session on load
document.addEventListener('DOMContentLoaded', () => {
    if (devToken) {
        unlockDeveloperConsole();
    } else {
        document.getElementById('devLoginOverlay').style.display = 'flex';
        document.getElementById('devAppContainer').style.display = 'none';
    }
});

// --------------------------------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------------------------------
async function handleDevLogin(event) {
    event.preventDefault();
    const pin = document.getElementById('devPinInput').value.trim();
    const btn = document.getElementById('btnDevLogin');
    const errBox = document.getElementById('loginErrorMsg');

    btn.disabled = true;
    errBox.style.display = 'none';

    try {
        const res = await fetch('/api/developer/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (data.success) {
            devToken = data.token;
            sessionStorage.setItem('nexus_dev_token', devToken);
            unlockDeveloperConsole();
            showDevToast('تم تسجيل الدخول بنجاح إلى بوابة المطور', 'success');
        } else {
            errBox.innerText = data.error || 'رمز دخول المطور غير صحيح.';
            errBox.style.display = 'block';
        }
    } catch (e) {
        errBox.innerText = 'فشل الاتصال بخادم Nexus.';
        errBox.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
}

function handleDevLogout() {
    sessionStorage.removeItem('nexus_dev_token');
    devToken = null;
    location.reload();
}

function unlockDeveloperConsole() {
    document.getElementById('devLoginOverlay').style.display = 'none';
    document.getElementById('devAppContainer').style.display = 'block';
    fetchOverviewKPIs();
    fetchTenantsList();
    fetchDevDevices();
    loadDeveloperSettings();
}

// --------------------------------------------------------------------------
// NAVIGATION
// --------------------------------------------------------------------------
function switchDevTab(tabId, btn) {
    document.querySelectorAll('.dev-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.dev-nav .nav-tab').forEach(el => el.classList.remove('active'));

    const pane = document.getElementById(`devTab-${tabId}`);
    if (pane) pane.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabId === 'tenants') fetchTenantsList();
    if (tabId === 'devices') fetchDevDevices();
    if (tabId === 'ota') loadOtaTab();
}

// --------------------------------------------------------------------------
// OVERVIEW & METRICS
// --------------------------------------------------------------------------
async function fetchOverviewKPIs() {
    try {
        const res = await fetch('/api/developer/overview');
        const data = await res.json();
        if (data) {
            document.getElementById('kpiTotalTenants').innerText = data.totalTenants || 0;
            document.getElementById('kpiActiveSubs').innerText = data.activeSubscriptions || 0;
            document.getElementById('kpiTotalDevices').innerText = data.totalDevices || 0;
            document.getElementById('kpiOnlineDevices').innerText = data.onlineDevices || 0;
        }
    } catch (e) {
        console.error('Failed to fetch overview metrics', e);
    }
}

// --------------------------------------------------------------------------
// TAB 1: TENANTS & SUBSCRIPTION MANAGEMENT
// --------------------------------------------------------------------------
async function fetchTenantsList() {
    try {
        const res = await fetch('/api/developer/tenants');
        const list = await res.json();
        allTenantsCache = list;
        renderTenantsTable(list);
        updateCompanyFilterDropdown(list);
        fetchOverviewKPIs();
    } catch (e) {
        console.error('Failed to fetch tenants', e);
        document.getElementById('tenantsTableBody').innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">فشل تحميل الشركات: ${e.message}</td></tr>`;
    }
}

function renderTenantsTable(tenants) {
    const tbody = document.getElementById('tenantsTableBody');
    if (!tenants || tenants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">لا توجد شركات مسجلة حتى الآن. انقر على "إضافة شركة جديدة" لإنشاء أول حساب.</td></tr>`;
        return;
    }

    let html = '';
    tenants.forEach(t => {
        const sub = t.subscription || {};
        const status = (sub.status || 'INACTIVE').toUpperCase();
        const isValid = t.isSubscriptionValid;

        let badgeClass = 'badge-expired';
        let statusDotClass = 'expired';
        let statusText = 'منتهي الصلاحية';
        if (status === 'ACTIVE' && isValid) {
            badgeClass = 'badge-active';
            statusDotClass = 'active';
            statusText = 'مفعّل ونشط';
        } else if (status === 'SUSPENDED') {
            badgeClass = 'badge-suspended';
            statusDotClass = 'suspended';
            statusText = 'معلّق وموقوف';
        }

        const expiryStr = sub.expiryDate === 'LIFETIME' ? 'اشتراك دائم' : (sub.expiryDate || 'غير محدد');
        const devCount = t.deviceCount || 0;
        const maxDev = sub.maxDevices || 25;
        const isCurrentlyActive = status === 'ACTIVE';

        html += `
            <tr>
                <td>
                    <strong style="color:var(--text-primary); font-size:14.5px;">${escapeHtml(t.name)}</strong><br>
                    <span class="badge-code">${escapeHtml(t.code)}</span>
                </td>
                <td>
                    <div style="font-size:12.5px;">
                        <strong>${escapeHtml(t.contactPerson || 'غير محدد')}</strong><br>
                        <span style="color:var(--text-muted); font-family:monospace;" dir="ltr">${escapeHtml(t.phone || 'لا يوجد')}</span><br>
                        <span style="color:var(--primary-royal); font-size:11.5px; font-family:monospace;" dir="ltr">${escapeHtml(t.email || '')}</span>
                    </div>
                </td>
                <td>
                    <span class="badge ${badgeClass}"><span class="dot ${statusDotClass}"></span> ${statusText}</span><br>
                    <small style="color:var(--text-muted); font-size:11px;">${escapeHtml(sub.planName || 'باقة الأعمال')}</small>
                </td>
                <td>
                    <span style="font-size:12.5px; color:var(--text-primary); font-family:monospace; font-weight:600;">${expiryStr}</span>
                </td>
                <td>
                    <strong style="color:${devCount > maxDev ? 'var(--danger)' : 'var(--primary-royal)'};">${devCount}</strong>
                    <span style="color:var(--text-muted); font-size:12px;">/ ${maxDev} جهاز</span>
                </td>
                <td>
                    <div style="font-size:12.5px;">
                        <strong style="color:var(--primary-royal); font-size:13.5px;">${(t.branches || []).length}</strong>
                        <span style="color:var(--text-muted); font-size:12px;">/ ${sub.maxBranches ?? 5} فرع</span>
                        ${(t.branches && t.branches.length > 0) ? `
                            <div style="margin-top:5px; display:flex; flex-direction:column; gap:3px;">
                                ${t.branches.map(b => `
                                    <div style="background:#F8FAFC; border:1px solid #CBD5E1; padding:2px 6px; font-size:11px;">
                                        <strong style="color:#0F172A;">${escapeHtml(b.name)}</strong>: <span dir="ltr" style="font-family:monospace; color:#1E40AF; font-weight:700;">${escapeHtml(b.number || b.phone || '')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<div style="color:var(--text-muted); font-size:11px; margin-top:2px;">لا توجد فروع مسجلة</div>'}
                    </div>
                </td>
                <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="btn ${isCurrentlyActive ? 'btn-danger-soft' : 'btn-success-soft'} btn-xs" onclick="toggleTenantStatus('${t.id}', '${isCurrentlyActive ? 'SUSPENDED' : 'ACTIVE'}')">
                            ${isCurrentlyActive ? 'تعليق الاشتراك' : 'تفعيل فوري'}
                        </button>
                        <button class="btn btn-secondary btn-xs" onclick="openEditSubscriptionModal('${t.id}')">
                            تعديل الاشتراك
                        </button>
                        <button class="btn btn-outline-primary btn-xs" onclick="openCompanyPortal('${t.code}')">
                            لوحة الشركة
                        </button>
                        <button class="btn btn-danger-soft btn-xs" onclick="confirmDeleteTenant('${t.id}', '${escapeHtml(t.name)}')" title="حذف الشركة">
                            حذف
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Toggle Subscription Status (Quick Activate / Suspend)
async function toggleTenantStatus(tenantId, newStatus) {
    try {
        const res = await fetch('/api/developer/tenants/subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Developer-Token': devToken || ''
            },
            body: JSON.stringify({ tenantId, status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            const statusLabel = newStatus === 'ACTIVE' ? 'تفعيل' : 'تعليق';
            showDevToast(`تم ${statusLabel} اشتراك الشركة بنجاح.`, 'success');
            fetchTenantsList();
        } else {
            showDevToast(data.error || 'فشل تحديث حالة الاشتراك.', 'error');
        }
    } catch (e) {
        showDevToast('خطأ في الاتصال بالخادم.', 'error');
    }
}

// --------------------------------------------------------------------------
// MODAL: ADD TENANT
// --------------------------------------------------------------------------
function openAddTenantModal() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    document.getElementById('tenantExpiryDate').value = d.toISOString().split('T')[0];
    const emailInput = document.getElementById('tenantEmail');
    if (emailInput) emailInput.value = '';
    const passInput = document.getElementById('tenantPassword');
    if (passInput) passInput.value = '123456';
    const branchesInput = document.getElementById('tenantMaxBranches');
    if (branchesInput) branchesInput.value = 5;
    document.getElementById('modalAddTenant').style.display = 'flex';
}

async function submitAddTenant(event) {
    event.preventDefault();
    const name = document.getElementById('tenantName').value.trim();
    const code = document.getElementById('tenantCode').value.trim().toUpperCase();
    const maxDevices = parseInt(document.getElementById('tenantMaxDevices').value) || 25;
    const maxBranches = parseInt(document.getElementById('tenantMaxBranches')?.value) || 5;
    const contactPerson = document.getElementById('tenantContactPerson').value.trim();
    const phone = document.getElementById('tenantPhone').value.trim();
    const email = document.getElementById('tenantEmail') ? document.getElementById('tenantEmail').value.trim().toLowerCase() : '';
    const password = document.getElementById('tenantPassword') ? document.getElementById('tenantPassword').value.trim() : '';
    const planName = document.getElementById('tenantPlanName').value.trim();
    const expiryDate = document.getElementById('tenantExpiryDate').value;

    if (!name || !code) {
        showDevToast('يرجى كتابة اسم الشركة وكود الشركة الفريد.', 'error');
        return;
    }

    if (!email) {
        showDevToast('يرجى إدخال البريد الإلكتروني لتسجيل دخول الشركة.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/developer/tenants', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Developer-Token': devToken || ''
            },
            body: JSON.stringify({
                name, code, email, password, maxDevices, maxBranches, contactPerson, phone, planName, expiryDate
            })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modalAddTenant');
            showDevToast(`تم إنشاء شركة '${name}' بنجاح! بريد الدخول: ${email}`, 'success');
            fetchTenantsList();
        } else {
            showDevToast(data.error || 'فشل إنشاء الشركة.', 'error');
        }
    } catch (e) {
        showDevToast(e.message || 'خطأ في الاتصال بالخادم أثناء حفظ الشركة.', 'error');
    }
}

// --------------------------------------------------------------------------
// MODAL: EDIT SUBSCRIPTION
// --------------------------------------------------------------------------
function openEditSubscriptionModal(tenantId) {
    const tenant = allTenantsCache.find(t => String(t.id) === String(tenantId) || String(t.code) === String(tenantId));
    if (!tenant) {
        console.warn('Tenant not found for id:', tenantId, allTenantsCache);
        showDevToast('تعذر العثور على بيانات الشركة المحددة.', 'error');
        return;
    }

    document.getElementById('editSubTenantId').value = tenant.id;
    document.getElementById('editSubCompanyName').innerText = tenant.name;
    document.getElementById('editSubCompanyCode').innerText = tenant.code;

    const sub = tenant.subscription || {};
    const status = (sub.status || 'ACTIVE').toUpperCase();
    if (status === 'ACTIVE') document.getElementById('statusActive').checked = true;
    else if (status === 'SUSPENDED') document.getElementById('statusSuspended').checked = true;
    else if (status === 'EXPIRED') document.getElementById('statusExpired').checked = true;
    else document.getElementById('statusActive').checked = true;

    document.getElementById('editSubExpiryDate').value = sub.expiryDate && sub.expiryDate !== 'LIFETIME' ? sub.expiryDate : '';
    document.getElementById('editSubMaxDevices').value = sub.maxDevices || 25;
    const branchEl = document.getElementById('editSubMaxBranches');
    if (branchEl) branchEl.value = sub.maxBranches ?? 5;
    document.getElementById('editSubPlanName').value = sub.planName || 'باقة الأعمال';

    const emailInput = document.getElementById('editSubEmail');
    if (emailInput) emailInput.value = tenant.email || '';
    const passInput = document.getElementById('editSubPassword');
    if (passInput) passInput.value = '';

    const modal = document.getElementById('modalEditSubscription');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function setQuickExpiry(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    document.getElementById('editSubExpiryDate').value = d.toISOString().split('T')[0];
}

function setLifetimeExpiry() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 25);
    document.getElementById('editSubExpiryDate').value = d.toISOString().split('T')[0];
}

async function submitEditSubscription(event) {
    event.preventDefault();
    const tenantId = document.getElementById('editSubTenantId').value;
    const status = document.querySelector('input[name="subStatus"]:checked')?.value || 'ACTIVE';
    const expiryDate = document.getElementById('editSubExpiryDate').value;
    const maxDevices = parseInt(document.getElementById('editSubMaxDevices').value) || 25;
    const maxBranches = parseInt(document.getElementById('editSubMaxBranches')?.value) || 5;
    const planName = document.getElementById('editSubPlanName').value.trim();

    const email = document.getElementById('editSubEmail') ? document.getElementById('editSubEmail').value.trim().toLowerCase() : '';
    const password = document.getElementById('editSubPassword') ? document.getElementById('editSubPassword').value.trim() : '';

    try {
        const payload = { tenantId, status, expiryDate, maxDevices, maxBranches, planName };
        if (email) payload.email = email;
        if (password) payload.password = password;

        const res = await fetch('/api/developer/tenants/subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Developer-Token': devToken || ''
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modalEditSubscription');
            showDevToast('تم تحديث اشتراك وبيانات الشركة بنجاح.', 'success');
            fetchTenantsList();
        } else {
            showDevToast(data.error || 'فشل التحديث.', 'error');
        }
    } catch (e) {
        showDevToast('خطأ في الاتصال.', 'error');
    }
}

// --------------------------------------------------------------------------
// DELETE TENANT
// --------------------------------------------------------------------------
async function confirmDeleteTenant(tenantId, name) {
    if (!confirm(`هل أنت متأكد من حذف شركة '${name}' نهائياً؟ سيتم إلغاء كافة صلاحيات أجهزتها.`)) return;

    try {
        const res = await fetch('/api/developer/tenants/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Developer-Token': devToken || ''
            },
            body: JSON.stringify({ tenantId })
        });
        const data = await res.json();
        if (data.success) {
            showDevToast('تم حذف الشركة بنجاح.', 'success');
            fetchTenantsList();
        } else {
            showDevToast(data.error || 'فشل الحذف.', 'error');
        }
    } catch (e) {
        showDevToast('خطأ أثناء الحذف.', 'error');
    }
}

// --------------------------------------------------------------------------
// TAB 2: GLOBAL FLEET DEVICES
// --------------------------------------------------------------------------
async function fetchDevDevices() {
    try {
        const res = await fetch('/api/developer/devices');
        const list = await res.json();
        allDevicesCache = list;
        filterDevDevices();
    } catch (e) {
        console.error('Failed to fetch global devices', e);
    }
}

function updateCompanyFilterDropdown(tenants) {
    const select = document.getElementById('devFilterCompanySelect');
    if (!select) return;
    const currentVal = select.value;
    let html = `<option value="ALL">جميع الشركات المشتركة</option>`;
    tenants.forEach(t => {
        html += `<option value="${t.code}">${escapeHtml(t.name)} (${escapeHtml(t.code)})</option>`;
    });
    select.innerHTML = html;
    if (select.querySelector(`option[value="${currentVal}"]`)) {
        select.value = currentVal;
    }
}

function filterDevDevices() {
    const selectedCompany = document.getElementById('devFilterCompanySelect').value;
    let filtered = allDevicesCache;
    if (selectedCompany !== 'ALL') {
        filtered = allDevicesCache.filter(d => (d.companyCode || '').toUpperCase() === selectedCompany.toUpperCase());
    }
    renderDevDevicesTable(filtered);
}

function renderDevDevicesTable(devices) {
    const tbody = document.getElementById('devDevicesTableBody');
    if (!devices || devices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">لا توجد أجهزة متصلة في هذا النطاق حالياً.</td></tr>`;
        return;
    }

    let html = '';
    devices.forEach(d => {
        const isOnline = d.isOnline;
        const onlineTag = isOnline 
            ? '<span class="badge badge-active"><span class="dot active"></span> متصل</span>' 
            : '<span class="badge" style="background:#F1F5F9; color:#64748B;"><span class="dot offline"></span> غير متصل</span>';

        const batteryColor = (d.battery > 50) ? '#059669' : (d.battery > 20 ? '#D97706' : '#DC2626');

        html += `
            <tr>
                <td>
                    <code style="font-family:monospace; font-size:12px; color:var(--text-secondary);">${escapeHtml(d.id)}</code>
                </td>
                <td>
                    <strong style="color:var(--text-primary); font-size:13.5px;">${escapeHtml(d.name || d.id)}</strong>
                </td>
                <td>
                    <span class="badge-code">${escapeHtml(d.companyCode || 'NEXUS-DEFAULT')}</span>
                </td>
                <td>
                    <strong>${escapeHtml(d.model || 'Unknown')}</strong><br>
                    <small style="color:var(--text-muted);">Android ${escapeHtml(d.os || '')}</small>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <strong style="color:var(--text-primary);">${d.battery || 0}%</strong>
                    </div>
                    <div style="width:60px; height:4px; background:#E2E8F0; border-radius:2px; margin:3px 0;">
                        <div style="width:${d.battery || 0}%; height:100%; background:${batteryColor}; border-radius:2px;"></div>
                    </div>
                </td>
                <td>${onlineTag}</td>
                <td>
                    <span style="font-size:12px; color:var(--text-muted);">${d.lastSeenStr || 'قبل لحظات'}</span>
                </td>
                <td>
                    <button class="btn btn-secondary btn-xs" onclick="openRenameModal('${d.id}', '${escapeHtml(d.name || '')}')">
                        إعادة التسمية
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// --------------------------------------------------------------------------
// MODAL: RENAME DEVICE
// --------------------------------------------------------------------------
function openRenameModal(deviceId, currentName) {
    document.getElementById('renameDeviceId').value = deviceId;
    document.getElementById('renameNewName').value = currentName || '';
    document.getElementById('modalRenameDevice').style.display = 'flex';
}

async function submitDeviceRename(event) {
    event.preventDefault();
    const deviceId = document.getElementById('renameDeviceId').value;
    const newName = document.getElementById('renameNewName').value.trim();
    if (!deviceId || !newName) return;

    try {
        const res = await fetch('/api/devices/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, newName })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modalRenameDevice');
            showDevToast(`تمت إعادة تسمية الجهاز إلى '${newName}' بنجاح.`, 'success');
            fetchDevDevices();
        } else {
            showDevToast(data.error || 'فشل تعديل الاسم.', 'error');
        }
    } catch (e) {
        showDevToast('خطأ في الاتصال.', 'error');
    }
}

// --------------------------------------------------------------------------
// TAB 3: DEVELOPER SETTINGS
// --------------------------------------------------------------------------
async function loadDeveloperSettings() {
    try {
        const res = await fetch('/api/developer/overview');
        const data = await res.json();
        const dev = data.developer || {};
        document.getElementById('devSupportPhone').value = dev.supportPhone || '';
        document.getElementById('devSupportWhatsApp').value = dev.supportWhatsApp || '';
    } catch (e) {
        console.error('Failed to load dev settings', e);
    }
}

async function saveDeveloperSettings(event) {
    event.preventDefault();
    const supportPhone = document.getElementById('devSupportPhone').value.trim();
    const supportWhatsApp = document.getElementById('devSupportWhatsApp').value.trim();
    const newPin = document.getElementById('devMasterPin').value.trim();

    try {
        const res = await fetch('/api/developer/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Developer-Token': devToken || ''
            },
            body: JSON.stringify({
                supportPhone, supportWhatsApp, newPin: newPin || undefined
            })
        });
        const data = await res.json();
        if (data.success) {
            showDevToast('تم حفظ إعدادات المطور بنجاح.', 'success');
            document.getElementById('devMasterPin').value = '';
        } else {
            showDevToast(data.error || 'فشل حفظ الإعدادات.', 'error');
        }
    } catch (e) {
        showDevToast('خطأ في الاتصال بالخادم.', 'error');
    }
}

// --------------------------------------------------------------------------
// TAB 3: OTA DEPLOYMENT MANAGEMENT
// --------------------------------------------------------------------------
async function loadOtaTab() {
    populateOtaTargets();
    if (!document.getElementById('otaApkUrl').value) {
        useServerBuiltInApk();
    }
    fetchOtaHistory();
}

function populateOtaTargets() {
    const select = document.getElementById('otaTargetSelect');
    if (!select) return;

    let html = `<option value="ALL">جميع الأجهزة في كافة الشركات المشتركة (بث عام شامل)</option>`;

    // Add company groups
    if (allTenantsCache && allTenantsCache.length > 0) {
        html += `<optgroup label="بث مخصص حسب الشركة">`;
        allTenantsCache.forEach(t => {
            html += `<option value="COMPANY:${t.code}">كافة أجهزة: ${escapeHtml(t.name)} (${escapeHtml(t.code)})</option>`;
        });
        html += `</optgroup>`;
    }

    // Add individual devices
    if (allDevicesCache && allDevicesCache.length > 0) {
        html += `<optgroup label="أجهزة محددة بالاسم / المعرف">`;
        allDevicesCache.forEach(d => {
            const status = d.isOnline ? '🟢 متصل' : '⚪ غير متصل';
            html += `<option value="DEVICE:${d.id}">${escapeHtml(d.name || d.id)} - [${escapeHtml(d.model || 'Android')}] (${status})</option>`;
        });
        html += `</optgroup>`;
    }

    select.innerHTML = html;
}

function useServerBuiltInApk() {
    const defaultUrl = `${location.protocol}//${location.host}/download/nexus-agent.apk`;
    const input = document.getElementById('otaApkUrl');
    if (input) input.value = defaultUrl;
}

function copyDefaultServerApkUrl() {
    const defaultUrl = `${location.protocol}//${location.host}/download/nexus-agent.apk`;
    navigator.clipboard.writeText(defaultUrl).then(() => {
        showDevToast('تم نسخ رابط تحميل APK السيرفر إلى الحافظة.', 'success');
    }).catch(() => {
        showDevToast(`رابط APK: ${defaultUrl}`, 'info');
    });
}

function setOtaPackage(pkg) {
    const el = document.getElementById('otaPackageName');
    if (el) {
        el.value = pkg;
        el.focus();
    }
}

function toggleOtaSourceMode(mode) {
    const urlGroup = document.getElementById('otaUrlGroup');
    const uploadGroup = document.getElementById('otaUploadGroup');
    if (mode === 'url') {
        urlGroup.style.display = 'block';
        uploadGroup.style.display = 'none';
    } else {
        urlGroup.style.display = 'none';
        uploadGroup.style.display = 'block';
    }
}

async function handleOtaFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.apk')) {
        showDevToast('يرجى اختيار ملف بصيغة .apk فقط.', 'error');
        return;
    }

    const progressDiv = document.getElementById('otaUploadProgress');
    const progressBar = document.getElementById('otaUploadProgressBar');
    const statusText = document.getElementById('otaUploadStatusText');

    progressDiv.style.display = 'block';
    progressBar.style.width = '15%';
    statusText.innerText = `جاري تجهيز ورفع (${file.name}) - ${(file.size / 1024 / 1024).toFixed(2)} ميجابايت...`;

    try {
        progressBar.style.width = '45%';
        const res = await fetch('/api/developer/ota/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                'X-Filename': encodeURIComponent(file.name),
                'X-Developer-Token': devToken || ''
            },
            body: file
        });

        progressBar.style.width = '90%';
        const data = await res.json();

        if (data.success) {
            progressBar.style.width = '100%';
            statusText.innerText = `✅ تم الرفع بنجاح! الرابط جاهز للبث.`;
            document.getElementById('otaApkUrl').value = data.url;
            document.getElementById('otaReleaseChecksum').value = data.sha256;

            // Switch back to URL view with filled input
            document.getElementById('otaModeUrl').checked = true;
            toggleOtaSourceMode('url');

            showDevToast(`تم رفع ${file.name} بنجاح وحساب البصمة.`, 'success');
        } else {
            statusText.innerText = `❌ ${data.error || 'فشل الرفع'}`;
            showDevToast(data.error || 'فشل رفع ملف الـ APK', 'error');
        }
    } catch (e) {
        statusText.innerText = '❌ خطأ أثناء رفع الملف للسيرفر';
        showDevToast('خطأ في الاتصال أثناء رفع الملف.', 'error');
    }
}

async function handleDevOtaSubmit(event) {
    event.preventDefault();
    const targetVal = document.getElementById('otaTargetSelect').value;
    const packageName = document.getElementById('otaPackageName').value.trim() || 'com.nexus.mdm.agent';
    const apkUrl = document.getElementById('otaApkUrl').value.trim();
    const versionNote = document.getElementById('otaVersionNote').value.trim();
    const checksum = document.getElementById('otaReleaseChecksum').value.trim();
    const btn = document.getElementById('btnDevDeployOta');

    if (!apkUrl) {
        showDevToast('يرجى كتابة رابط الـ APK أو رفع الملف أولاً.', 'error');
        return;
    }

    let targetType = 'ALL';
    let targetId = 'ALL';
    if (targetVal.startsWith('COMPANY:')) {
        targetType = 'COMPANY';
        targetId = targetVal.replace('COMPANY:', '');
    } else if (targetVal.startsWith('DEVICE:')) {
        targetType = 'DEVICE';
        targetId = targetVal.replace('DEVICE:', '');
    }

    btn.disabled = true;
    btn.innerHTML = '<span>جاري بث التحديث الصامت...</span>';

    try {
        const res = await fetch('/api/developer/ota/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Developer-Token': devToken || ''
            },
            body: JSON.stringify({
                targetType, targetId, apkUrl, packageName, versionNote, checksum
            })
        });

        const data = await res.json();
        if (data.success) {
            showDevToast(data.message || 'تمت جدولة بث التحديث بنجاح!', 'success');
            fetchOtaHistory();
        } else {
            showDevToast(data.error || 'فشل بث التحديث.', 'error');
        }
    } catch (e) {
        showDevToast('خطأ في الاتصال بالخادم أثناء البث.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>إرسال وبث التحديث الصامت للأجهزة الآن</span>';
    }
}

async function fetchOtaHistory() {
    const tbody = document.getElementById('otaHistoryTableBody');
    if (!tbody) return;

    try {
        const res = await fetch('/api/developer/ota/history');
        const history = await res.json();

        if (!history || history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">لا توجد عمليات بث سابقة حتى الآن.</td></tr>`;
            return;
        }

        let html = '';
        history.forEach(item => {
            let targetBadge = '<span class="badge badge-active">جميع الأجهزة (عام)</span>';
            if (item.targetType === 'COMPANY') {
                targetBadge = `<span class="badge" style="background:#EFF6FF; color:#1E40AF; border:1px solid #BFDBFE;">شركة: ${escapeHtml(item.targetId)}</span>`;
            } else if (item.targetType === 'DEVICE') {
                targetBadge = `<span class="badge" style="background:#F1F5F9; color:#0F172A; border:1px solid #CBD5E1;">جهاز: ${escapeHtml(item.targetId)}</span>`;
            }

            html += `
                <tr>
                    <td style="font-size:12px; font-family:monospace; color:#475569;">${escapeHtml(item.timestamp)}</td>
                    <td>
                        <strong style="color:#0F172A; font-family:monospace; font-size:13px;">${escapeHtml(item.packageName)}</strong>
                    </td>
                    <td>
                        ${targetBadge}
                        <small style="display:block; color:#64748B; font-size:11px;">(${item.targetCount || 0} جهاز)</small>
                    </td>
                    <td>
                        <a href="${escapeHtml(item.apkUrl)}" target="_blank" style="color:#1E40AF; font-size:12px; font-family:monospace; text-decoration:underline;" dir="ltr">
                            ${escapeHtml(item.apkUrl.length > 40 ? item.apkUrl.substring(0, 37) + '...' : item.apkUrl)}
                        </a>
                    </td>
                    <td style="font-size:12px; color:#334155;">${escapeHtml(item.versionNote || '-')}</td>
                    <td>
                        <span class="badge badge-active"><span class="dot active"></span> تم البث</span>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">تعذر جلب سجل التحديثات.</td></tr>`;
    }
}

// --------------------------------------------------------------------------
// UTILITIES
// --------------------------------------------------------------------------
function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.style.display = 'none';
}

function openCompanyPortal(companyCode) {
    window.open(`/?company=${encodeURIComponent(companyCode)}`, '_blank');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}
