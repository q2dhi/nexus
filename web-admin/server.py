import json
import os
import sys
import time
import socket
import hashlib
import base64
import math
import datetime
import io
import threading
import subprocess
from PIL import Image
from datetime import datetime, timedelta, date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('PORT', 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
DATA_DIR = os.path.join(BASE_DIR, 'data')
TENANTS_FILE = os.path.join(DATA_DIR, 'tenants.json')
DEVICES_FILE = os.path.join(DATA_DIR, 'devices_cache.json')

# Ensure directories exist
DOWNLOADS_DIR = os.path.join(PUBLIC_DIR, 'downloads')
OTA_HISTORY_FILE = os.path.join(DATA_DIR, 'ota_history.json')
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# --------------------------------------------------------------------------
# Persistent Tenant & Subscription Storage
# --------------------------------------------------------------------------
DEFAULT_TENANTS = {
    "tenants": [
        {
            "id": "comp_default",
            "name": "شركة التقنية المتقدمة (الافتراضية)",
            "code": "NEXUS-DEFAULT",
            "username": "admin",
            "password": "admin",
            "contactPerson": "مدير النظام",
            "phone": "+964 770 123 4567",
            "createdAt": "2026-09-01T00:00:00Z",
            "subscription": {
                "status": "ACTIVE",
                "startDate": "2026-09-01",
                "expiryDate": "2027-09-01",
                "maxDevices": 50,
                "maxBranches": 5,
                "planName": "باقة المؤسسات المتكاملة"
            },
            "branches": [],
            "allowedScreens": {
                "fleet": True,
                "whitelist": True,
                "qr": True,
                "ota": True,
                "logs": True,
                "screenControl": True,
                "gpsGeofence": True,
                "remoteWipe": True
            }
        },
        {
            "id": "comp_kiosk_pos",
            "name": "سلسلة مطاعم وبقالات بغداد",
            "code": "POS-BAGHDAD",
            "username": "pos_admin",
            "password": "123",
            "contactPerson": "علي الكرخي",
            "phone": "+964 780 987 6543",
            "createdAt": "2026-09-02T10:00:00Z",
            "subscription": {
                "status": "ACTIVE",
                "startDate": "2026-09-01",
                "expiryDate": "2026-12-31",
                "maxDevices": 20,
                "planName": "باقة أجهزة نقاط البيع (POS)"
            },
            "allowedScreens": {
                "fleet": True,
                "whitelist": True,
                "qr": True,
                "ota": False,
                "logs": True,
                "screenControl": True,
                "gpsGeofence": False,
                "remoteWipe": True
            }
        }
    ],
    "developer": {
        "pin": "nexus2026",
        "supportPhone": "+964 770 000 0000",
        "supportWhatsApp": "9647700000000",
        "email": "dev@nexus-mdm.net"
    }
}

def load_tenants_data():
    if not os.path.exists(TENANTS_FILE):
        save_tenants_data(DEFAULT_TENANTS)
        return DEFAULT_TENANTS
    try:
        with open(TENANTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Loading tenants: {e}")
        return DEFAULT_TENANTS

def save_tenants_data(data):
    try:
        with open(TENANTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ERROR] Saving tenants: {e}")

def load_devices_cache():
    if not os.path.exists(DEVICES_FILE):
        return {}
    try:
        with open(DEVICES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_devices_cache(data=None):
    try:
        with open(DEVICES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data if data is not None else devices, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

# In-Memory State
devices = load_devices_cache()
pending_commands = {}  # device_id -> list of commands
latest_frames = {}     # device_id -> { 'frame': base64, 'timestamp': float }
adb_stream_subscribers = {} # device_id -> expire_timestamp
adb_executable_path = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")

def get_connected_adb_serial():
    if not os.path.exists(adb_executable_path):
        return None
    try:
        res = subprocess.run([adb_executable_path, 'devices'], capture_output=True, text=True, timeout=2)
        lines = [l.strip().split()[0] for l in res.stdout.strip().splitlines()[1:] if '\tdevice' in l or ' device' in l]
        if lines:
            return lines[0]
    except Exception:
        pass
    return None

adb_lock = threading.Lock()

def capture_adb_screen_frame(target_serial=None):
    if not os.path.exists(adb_executable_path):
        return None
    if not adb_lock.acquire(blocking=False):
        return None
    try:
        cmd = [adb_executable_path]
        if target_serial:
            cmd.extend(['-s', target_serial])
        cmd.extend(['exec-out', 'screencap', '-p'])
        
        proc = subprocess.run(cmd, capture_output=True, timeout=3.0)
        if proc.returncode != 0 or len(proc.stdout) < 100:
            return None
        
        raw_bytes = proc.stdout
        # Windows ADB CRLF conversion fix:
        if raw_bytes.startswith(b'\x89PNG\r\r\n'):
            raw_bytes = raw_bytes.replace(b'\r\r\n', b'\r\n').replace(b'\r\n', b'\n')
        elif b'\r\n' in raw_bytes[:64]:
            raw_bytes = raw_bytes.replace(b'\r\n', b'\n')

        img = Image.open(io.BytesIO(raw_bytes))
        orig_w, orig_h = img.size
        new_w = 360
        new_h = int(orig_h * (new_w / orig_w))
        resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR).convert('RGB')
        buf = io.BytesIO()
        resized.save(buf, format='JPEG', quality=65)
        return base64.b64encode(buf.getvalue()).decode('ascii')
    except Exception:
        return None
    finally:
        adb_lock.release()

def refresh_screen_frame_async(dev_id):
    def _worker():
        serial = get_connected_adb_serial()
        if serial:
            b64_frame = capture_adb_screen_frame(serial)
            if b64_frame:
                latest_frames[dev_id] = {
                    "frame": b64_frame,
                    "timestamp": time.time()
                }
    t = threading.Thread(target=_worker, daemon=True)
    t.start()

def adb_stream_background_daemon():
    while True:
        try:
            now = time.time()
            active_ids = [did for did, expire in list(adb_stream_subscribers.items()) if expire > now]
            if active_ids:
                serial = get_connected_adb_serial()
                if serial:
                    b64_frame = capture_adb_screen_frame(serial)
                    if b64_frame:
                        for did in active_ids:
                            latest_frames[did] = {
                                "frame": b64_frame,
                                "timestamp": time.time()
                            }
                time.sleep(0.25)
            else:
                time.sleep(0.5)
        except Exception:
            time.sleep(0.5)

# Start background streamer
threading.Thread(target=adb_stream_background_daemon, daemon=True).start()

audit_logs = []
ACTIVE_TENANT_SESSIONS = {}  # token -> session metadata

geofence_config = {
    "enabled": False,
    "center": {"lat": 33.3152, "lng": 44.3661},  # Default Baghdad
    "radiusMeters": 5000
}

def load_ota_history():
    if os.path.exists(OTA_HISTORY_FILE):
        try:
            with open(OTA_HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_ota_history(history):
    try:
        with open(OTA_HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving OTA history: {e}")

def is_subscription_active(tenant):
    if not tenant or 'subscription' not in tenant:
        return False, "الشركة غير موجودة في سجلات المطور."
    sub = tenant['subscription']
    status = sub.get('status', 'INACTIVE').upper()
    if status != 'ACTIVE':
        return False, f"الاشتراك معطل حالياً ({status}). يرجى مراجعة المطور للتفعيل."
    
    expiry_str = sub.get('expiryDate', '')
    if expiry_str and expiry_str != 'LIFETIME':
        try:
            exp_date = datetime.strptime(expiry_str, "%Y-%m-%d")
            if datetime.now() > exp_date:
                return False, f"انتهت صلاحية الاشتراك بتاريخ ({expiry_str}). يرجى تجديد الاشتراك مع المطور."
        except Exception:
            pass
    return True, "الاشتراك نشط ومفعّل."

def haversine_meters(lat1, lon1, lat2, lon2):
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def add_audit_log(action, target, details):
    entry = {
        "timestamp": time.strftime("%H:%M:%S"),
        "action": action,
        "target": target,
        "details": details
    }
    audit_logs.insert(0, entry)
    if len(audit_logs) > 100:
        audit_logs.pop()

class NexusAdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def _send_json(self, status_code, data):
        response_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response_bytes)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Company-Code')
        self.end_headers()
        try:
            self.wfile.write(response_bytes)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
            pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Company-Code')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # ---------------------------------------------------------
        # TENANT API: Company Info & Subscription Check
        # ---------------------------------------------------------
        if path == '/api/tenant/info':
            company_code = qs.get('companyCode', [''])[0].strip().upper()
            session_token = self.headers.get('X-Tenant-Token') or qs.get('token', [''])[0]
            session = ACTIVE_TENANT_SESSIONS.get(session_token) if session_token else None
            if not company_code and session:
                company_code = session.get('code', '')

            tenants_data = load_tenants_data()
            matched = None
            for t in tenants_data.get('tenants', []):
                if t.get('code', '').upper() == company_code:
                    matched = t
                    break
            
            if not matched:
                if not company_code and tenants_data.get('tenants'):
                    matched = tenants_data['tenants'][0]
                else:
                    self._send_json(404, {"error": "Company not found", "active": False})
                    return

            is_active, message = is_subscription_active(matched)
            is_branch = bool(session and session.get('isBranch'))
            tenant_payload = {
                "id": matched.get('id'),
                "name": matched.get('name'),
                "code": matched.get('code'),
                "email": matched.get('email', ''),
                "contactPerson": matched.get('contactPerson', ''),
                "phone": matched.get('phone', ''),
                "subscription": matched.get('subscription'),
                "allowedScreens": matched.get('allowedScreens', {}),
                "isActive": is_active,
                "statusMessage": message,
                "developerContact": tenants_data.get('developer', {}),
                "isBranch": is_branch,
                "canExitKiosk": not is_branch,
                "branchName": session.get('branchName') if is_branch else None,
                "branchNumber": session.get('branchNumber') if is_branch else None,
                "branchId": session.get('branchId') if is_branch else None
            }
            self._send_json(200, {
                "success": True,
                "tenant": tenant_payload
            })
            return

        if path == '/api/tenant/branches':
            session_token = self.headers.get('X-Tenant-Token') or qs.get('token', [''])[0]
            session = ACTIVE_TENANT_SESSIONS.get(session_token)
            if not session:
                self._send_json(401, {"error": "يرجى تسجيل الدخول أولاً."})
                return

            if session.get('isBranch'):
                self._send_json(403, {"error": "غير مصرح لمدراء الفروع بإدارة فروع أخرى."})
                return

            tenants_data = load_tenants_data()
            matched = None
            for t in tenants_data.get('tenants', []):
                if t.get('id') == session.get('tenantId') or t.get('code') == session.get('code'):
                    matched = t
                    break

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            branches = matched.get('branches', [])
            max_branches = int(matched.get('subscription', {}).get('maxBranches', 5))
            self._send_json(200, {
                "success": True,
                "branches": branches,
                "usedBranches": len(branches),
                "maxBranches": max_branches,
                "canAddMore": len(branches) < max_branches
            })
            return

        # ---------------------------------------------------------
        # DEVELOPER API: Overview & Tenants List
        # ---------------------------------------------------------
        if path == '/api/developer/overview':
            tenants_data = load_tenants_data()
            now = time.time()
            all_tenants = tenants_data.get('tenants', [])
            active_subs = 0
            for t in all_tenants:
                act, _ = is_subscription_active(t)
                if act:
                    active_subs += 1
            
            online_devices = sum(1 for d in devices.values() if (now - d.get('lastSeen', 0)) < 25)

            self._send_json(200, {
                "totalTenants": len(all_tenants),
                "activeSubscriptions": active_subs,
                "totalDevices": len(devices),
                "onlineDevices": online_devices,
                "developer": tenants_data.get('developer', {})
            })
            return

        if path == '/api/developer/tenants':
            tenants_data = load_tenants_data()
            now = time.time()
            result = []
            for t in tenants_data.get('tenants', []):
                t_code = t.get('code', '').upper()
                comp_devices = [d for d in devices.values() if str(d.get('companyCode', 'NEXUS-DEFAULT')).upper() == t_code]
                online_count = sum(1 for d in comp_devices if (now - d.get('lastSeen', 0)) < 25)
                act, msg = is_subscription_active(t)
                
                item = dict(t)
                item['deviceCount'] = len(comp_devices)
                item['onlineCount'] = online_count
                item['isSubscriptionValid'] = act
                item['subscriptionMessage'] = msg
                result.append(item)
            self._send_json(200, result)
            return

        if path == '/api/developer/devices':
            now = time.time()
            dev_list = []
            for d in devices.values():
                d_copy = dict(d)
                d_copy['isOnline'] = (now - d.get('lastSeen', 0)) < 25
                dev_list.append(d_copy)
            self._send_json(200, dev_list)
            return

        # ---------------------------------------------------------
        # FLEET DEVICES (With Company Filtering)
        # ---------------------------------------------------------
        if path == '/api/devices':
            now = time.time()
            req_company = qs.get('companyCode', [''])[0].strip().upper()
            # Also check header
            header_company = self.headers.get('X-Company-Code', '').strip().upper()
            if header_company:
                req_company = header_company

            tenants_data = load_tenants_data()
            single_tenant_code = tenants_data['tenants'][0].get('code', '').upper() if len(tenants_data.get('tenants', [])) == 1 else None

            device_list = []
            for d in devices.values():
                d_company = str(d.get('companyCode', 'NEXUS-DEFAULT')).upper()
                if req_company and req_company != 'ALL' and d_company != req_company:
                    if d_company == 'NEXUS-DEFAULT' and single_tenant_code and req_company == single_tenant_code:
                        pass
                    else:
                        continue
                d_copy = dict(d)
                d_copy['isOnline'] = (now - d.get('lastSeen', 0)) < 25
                device_list.append(d_copy)
            self._send_json(200, device_list)
            return

        if path == '/api/logs':
            self._send_json(200, audit_logs)
            return

        if path == '/api/geofence':
            self._send_json(200, geofence_config)
            return

        if path.startswith('/api/devices/') and path.endswith('/screen-frame'):
            parts = path.strip('/').split('/')
            dev_id = parts[2] if len(parts) >= 3 else ''
            if dev_id:
                adb_stream_subscribers[dev_id] = time.time() + 4.0
            
            frame_data = latest_frames.get(dev_id, {})
            now = time.time()
            if not frame_data.get('frame') or (now - frame_data.get('timestamp', 0)) > 1.5:
                serial = get_connected_adb_serial()
                if serial:
                    b64 = capture_adb_screen_frame(serial)
                    if b64:
                        frame_data = {"frame": b64, "timestamp": time.time()}
                        latest_frames[dev_id] = frame_data

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                self.wfile.write(json.dumps(frame_data).encode('utf-8'))
            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
                pass
            return

        if path == '/api/qr-config':
            apk_path = os.path.join(BASE_DIR, 'apk', 'nexus-agent.apk')
            checksum = "RL__IU87QZW8GA66qikKZ-ySIY1r9UnQqxgyHU63bBU"
            if os.path.exists(apk_path):
                try:
                    with open(apk_path, 'rb') as f:
                        h = hashlib.sha256(f.read()).digest()
                    checksum = base64.urlsafe_b64encode(h).decode('ascii').rstrip('=')
                except Exception:
                    pass

            local_ip = "192.168.0.101"
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
                s.close()
            except Exception:
                pass

            tenants_data = load_tenants_data()
            companies_summary = [
                {"code": t.get("code"), "name": t.get("name"), "status": t.get("subscription", {}).get("status", "ACTIVE")}
                for t in tenants_data.get("tenants", [])
            ]

            host = self.headers.get('Host', f"{local_ip}:{PORT}")
            proto = self.headers.get('X-Forwarded-Proto', 'https' if ('onrender.com' in host or self.headers.get('X-Forwarded-Ssl') == 'on') else 'http')
            server_url = f"{proto}://{host}"
            download_url = f"{server_url}/download/nexus-agent.apk"

            self._send_json(200, {
                "localIp": host.split(':')[0],
                "port": PORT,
                "apkChecksum": checksum,
                "componentName": "com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver",
                "defaultDownloadUrl": download_url,
                "defaultServerUrl": server_url,
                "companies": companies_summary
            })
            return

        if path == '/download/nexus-agent.apk':
            apk_path = os.path.join(BASE_DIR, 'apk', 'nexus-agent.apk')
            if not os.path.exists(apk_path):
                alt_path = os.path.join(BASE_DIR, '..', 'app', 'build', 'intermediates', 'apk', 'debug', 'app-debug.apk')
                if os.path.exists(alt_path):
                    apk_path = alt_path

            if os.path.exists(apk_path):
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.android.package-archive')
                self.send_header('Content-Length', str(os.path.getsize(apk_path)))
                self.send_header('Content-Disposition', 'attachment; filename="nexus-agent.apk"')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                try:
                    with open(apk_path, 'rb') as f:
                        self.wfile.write(f.read())
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
                    pass
                return
            else:
                self._send_json(404, {"error": "APK not found. Place nexus-agent.apk in web-admin/apk/"})
                return

        if path == '/api/developer/ota/history':
            history = load_ota_history()
            self._send_json(200, history)
            return

        if path.startswith('/downloads/') and path.endswith('.apk'):
            rel_path = path.lstrip('/')
            full_path = os.path.join(PUBLIC_DIR, rel_path)
            if os.path.exists(full_path):
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.android.package-archive')
                self.send_header('Content-Length', str(os.path.getsize(full_path)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                try:
                    with open(full_path, 'rb') as f:
                        while True:
                            chunk = f.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
                    pass
                return

        # Fallback to static file serving
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ---------------------------------------------------------
        # BINARY APK UPLOAD FOR OTA DEPLOYMENTS
        # ---------------------------------------------------------
        if path == '/api/developer/ota/upload' or path == '/api/ota/upload':
            content_len = int(self.headers.get('Content-Length', 0))
            if content_len <= 0:
                self._send_json(400, {"error": "الملف فارغ أو غير موجود"})
                return

            raw_filename = self.headers.get('X-Filename', 'managed-app.apk')
            import urllib.parse
            import re
            raw_filename = urllib.parse.unquote(raw_filename)
            filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', raw_filename)
            if not filename.endswith('.apk'):
                filename += '.apk'

            target_path = os.path.join(DOWNLOADS_DIR, filename)
            sha256 = hashlib.sha256()

            bytes_left = content_len
            with open(target_path, 'wb') as f:
                while bytes_left > 0:
                    chunk_size = min(bytes_left, 65536)
                    chunk = self.rfile.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    sha256.update(chunk)
                    bytes_left -= len(chunk)

            file_size = os.path.getsize(target_path)
            checksum = sha256.hexdigest()
            host = self.headers.get('Host', f"localhost:{PORT}")
            proto = self.headers.get('X-Forwarded-Proto', 'https' if ('onrender.com' in host or self.headers.get('X-Forwarded-Ssl') == 'on') else 'http')
            apk_url = f"{proto}://{host}/downloads/{filename}"

            add_audit_log('OTA_APK_UPLOAD', 'DEVELOPER', f"Uploaded {filename} ({file_size} bytes)")

            self._send_json(200, {
                "success": True,
                "filename": filename,
                "url": apk_url,
                "relativeUrl": f"/downloads/{filename}",
                "size": file_size,
                "sha256": checksum,
                "message": "تم رفع ملف الـ APK بنجاح وحساب بصمة SHA-256."
            })
            return

        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else '{}'

        try:
            data = json.loads(body)
        except Exception:
            data = {}

        # ---------------------------------------------------------
        # DEVELOPER AUTHENTICATION & MANAGEMENT APIs
        # ---------------------------------------------------------
        if path == '/api/developer/login':
            entered_pin = str(data.get('pin', '')).strip()
            tenants_data = load_tenants_data()
            master_pin = str(tenants_data.get('developer', {}).get('pin', 'nexus2026')).strip()
            if entered_pin == master_pin:
                self._send_json(200, {
                    "success": True,
                    "token": "dev_session_" + str(int(time.time())),
                    "developer": tenants_data.get('developer', {})
                })
            else:
                self._send_json(401, {"success": False, "error": "رمز المطور غير صحيح!"})
            return

        if path == '/api/developer/ota/deploy':
            target_type = data.get('targetType', 'ALL')
            target_id = data.get('targetId', 'ALL')
            apk_url = str(data.get('apkUrl', '')).strip()
            pkg_name = str(data.get('packageName', 'com.nexus.mdm.agent')).strip() or 'com.nexus.mdm.agent'
            version_note = str(data.get('versionNote', '')).strip()
            checksum = str(data.get('checksum', '')).strip()

            if not apk_url:
                self._send_json(400, {"error": "يرجى تحديد رابط ملف الـ APK."})
                return

            if apk_url.startswith('/'):
                host = self.headers.get('Host', f"localhost:{PORT}")
                apk_url = f"http://{host}{apk_url}"

            install_cmd = {
                "command": "INSTALL_APK_FROM_URL",
                "url": apk_url,
                "package_name": pkg_name,
                "timestamp": int(time.time() * 1000),
                "version_note": version_note
            }

            targeted_devices = []
            if target_type == 'ALL':
                for did in list(devices.keys()):
                    pending_commands.setdefault(did, []).append(install_cmd)
                    targeted_devices.append(did)
            elif target_type == 'COMPANY':
                comp_code = str(target_id).upper().strip()
                for did, dinfo in devices.items():
                    if str(dinfo.get('companyCode', '')).upper() == comp_code:
                        pending_commands.setdefault(did, []).append(install_cmd)
                        targeted_devices.append(did)
            elif target_type == 'DEVICE':
                pending_commands.setdefault(str(target_id), []).append(install_cmd)
                targeted_devices.append(str(target_id))

            entry = {
                "id": f"ota_{int(time.time())}",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "targetType": target_type,
                "targetId": target_id,
                "targetCount": len(targeted_devices),
                "packageName": pkg_name,
                "apkUrl": apk_url,
                "versionNote": version_note,
                "checksum": checksum,
                "status": "QUEUED"
            }
            history = load_ota_history()
            history.insert(0, entry)
            save_ota_history(history[:50])

            add_audit_log('OTA_DEPLOY_BROADCAST', str(target_id), f"Target: {target_type}:{target_id}, Pkg: {pkg_name}")

            self._send_json(200, {
                "success": True,
                "message": f"تمت جدولة بث التحديث بنجاح ({len(targeted_devices)} جهاز).",
                "targetCount": len(targeted_devices),
                "apkUrl": apk_url,
                "entry": entry
            })
            return

        # ---------------------------------------------------------
        # TENANT AUTHENTICATION API: Company & Branch Web Admin Login
        # ---------------------------------------------------------
        if path == '/api/tenant/login':
            login_id = (data.get('email') or data.get('username') or data.get('number') or data.get('phone') or '').strip()
            password = (data.get('password') or '').strip()

            if not login_id or not password:
                self._send_json(400, {"success": False, "error": "يرجى إدخال معرّف الدخول وكلمة المرور."})
                return

            tenants_data = load_tenants_data()
            login_lower = login_id.lower()

            # 1. Check parent companies
            matched_parent = None
            for t in tenants_data.get('tenants', []):
                t_email = str(t.get('email', '')).strip().lower()
                t_code = str(t.get('code', '')).strip().upper()
                t_user = str(t.get('username', '')).strip().lower()
                t_phone = str(t.get('phone', '')).strip()
                if login_lower in [t_email, t_user] or login_id.upper() == t_code or (t_phone and login_id == t_phone):
                    if str(t.get('password', '')) == password:
                        matched_parent = t
                        break

            if matched_parent:
                is_active, status_msg = is_subscription_active(matched_parent)
                session_token = f"tenant_{int(time.time())}_{hashlib.md5(f'{matched_parent.get('id')}:{password}'.encode()).hexdigest()[:10]}"
                ACTIVE_TENANT_SESSIONS[session_token] = {
                    "tenantId": matched_parent.get('id'),
                    "code": matched_parent.get('code'),
                    "email": matched_parent.get('email', ''),
                    "name": matched_parent.get('name', ''),
                    "isBranch": False,
                    "canExitKiosk": True,
                    "loginTime": time.time()
                }

                add_audit_log('TENANT_LOGIN', matched_parent.get('code'), f"Parent company '{matched_parent.get('name')}' logged into Web Admin")
                self._send_json(200, {
                    "success": True,
                    "token": session_token,
                    "isBranch": False,
                    "canExitKiosk": True,
                    "subscriptionActive": is_active,
                    "subscriptionMessage": status_msg,
                    "tenant": {
                        "id": matched_parent.get('id'),
                        "name": matched_parent.get('name'),
                        "code": matched_parent.get('code'),
                        "email": matched_parent.get('email', ''),
                        "contactPerson": matched_parent.get('contactPerson', ''),
                        "phone": matched_parent.get('phone', ''),
                        "subscription": matched_parent.get('subscription', {}),
                        "isActive": is_active,
                        "statusMessage": status_msg,
                        "isBranch": False,
                        "canExitKiosk": True
                    }
                })
                return

            # 2. Check branches across all companies
            # Per user request: "بدل بريد الدخول خلي رقم"
            matched_branch = None
            parent_for_branch = None
            for t in tenants_data.get('tenants', []):
                for br in t.get('branches', []):
                    b_num = str(br.get('number', '')).strip()
                    b_phone = str(br.get('phone', '')).strip()
                    b_code = str(br.get('code', '')).strip().upper()
                    if (login_id == b_num or login_id == b_phone or login_id.upper() == b_code) and str(br.get('password', '')) == password:
                        matched_branch = br
                        parent_for_branch = t
                        break
                if matched_branch:
                    break

            if matched_branch and parent_for_branch:
                is_active, status_msg = is_subscription_active(parent_for_branch)
                if not is_active:
                    self._send_json(403, {
                        "success": False,
                        "error": f"تعذر تسجيل الدخول: اشتراك الشركة الأم ({parent_for_branch.get('name')}) غير مفعّل أو منتهي الصلاحية."
                    })
                    return

                session_token = f"branch_{int(time.time())}_{hashlib.md5(f'{matched_branch.get('id')}:{password}'.encode()).hexdigest()[:10]}"
                ACTIVE_TENANT_SESSIONS[session_token] = {
                    "tenantId": parent_for_branch.get('id'),
                    "code": parent_for_branch.get('code'),
                    "isBranch": True,
                    "branchId": matched_branch.get('id'),
                    "branchName": matched_branch.get('name'),
                    "branchNumber": matched_branch.get('number'),
                    "name": f"{parent_for_branch.get('name')} - {matched_branch.get('name')}",
                    "canExitKiosk": False,
                    "loginTime": time.time()
                }

                add_audit_log('BRANCH_LOGIN', parent_for_branch.get('code'), f"Branch '{matched_branch.get('name')}' ({matched_branch.get('number')}) logged into Web Admin")

                self._send_json(200, {
                    "success": True,
                    "token": session_token,
                    "isBranch": True,
                    "canExitKiosk": False,
                    "subscriptionActive": True,
                    "subscriptionMessage": status_msg,
                    "branch": matched_branch,
                    "tenant": {
                        "id": parent_for_branch.get('id'),
                        "name": parent_for_branch.get('name'),
                        "code": parent_for_branch.get('code'),
                        "isBranch": True,
                        "branchName": matched_branch.get('name'),
                        "branchNumber": matched_branch.get('number'),
                        "branchId": matched_branch.get('id'),
                        "canExitKiosk": False,
                        "isActive": True,
                        "subscription": parent_for_branch.get('subscription', {}),
                        "allowedScreens": parent_for_branch.get('allowedScreens', {}),
                        "statusMessage": status_msg
                    }
                })
                return

            self._send_json(401, {"success": False, "error": "بيانات الدخول أو كلمة المرور غير صحيحة."})
            return

        if path == '/api/tenant/logout':
            token = self.headers.get('X-Tenant-Token') or data.get('token')
            if token and token in ACTIVE_TENANT_SESSIONS:
                del ACTIVE_TENANT_SESSIONS[token]
            self._send_json(200, {"success": True, "message": "تم تسجيل الخروج بنجاح."})
            return

        if path == '/api/developer/tenants':
            # Create new company
            name = data.get('name', '').strip()
            code = data.get('code', '').strip().upper()
            email = data.get('email', '').strip().lower()
            password = data.get('password', '').strip() or '123456'
            contact_person = data.get('contactPerson', '').strip()
            phone = data.get('phone', '').strip()
            plan_name = data.get('planName', 'باقة الأعمال')
            expiry_date = data.get('expiryDate', '2027-09-01')
            max_devices = int(data.get('maxDevices', 20))

            if not name or not code:
                self._send_json(400, {"error": "الاسم وكود الشركة مطلوبان."})
                return

            if not email:
                email = f"{code.lower()}@company.com"

            tenants_data = load_tenants_data()
            # Check duplicate code and email
            for t in tenants_data.get('tenants', []):
                if t.get('code', '').upper() == code:
                    self._send_json(400, {"error": f"كود الشركة ({code}) مستخدم مسبقاً."})
                    return
                if email and t.get('email', '').lower() == email:
                    self._send_json(400, {"error": f"البريد الإلكتروني ({email}) مسجل لشركة أخرى مسبقاً."})
                    return

            new_id = f"comp_{int(time.time())}"
            new_tenant = {
                "id": new_id,
                "name": name,
                "code": code,
                "email": email,
                "username": email,
                "password": password,
                "contactPerson": contact_person,
                "phone": phone,
                "createdAt": datetime.now().isoformat(),
                "subscription": {
                    "status": "ACTIVE",
                    "startDate": time.strftime("%Y-%m-%d"),
                    "expiryDate": expiry_date,
                    "maxDevices": max_devices,
                    "maxBranches": int(data.get('maxBranches', 5)),
                    "planName": plan_name
                },
                "branches": [],
                "allowedScreens": {
                    "fleet": True,
                    "whitelist": True,
                    "qr": True,
                    "ota": True,
                    "logs": True,
                    "screenControl": True,
                    "gpsGeofence": True,
                    "remoteWipe": True
                }
            }
            tenants_data.setdefault('tenants', []).append(new_tenant)
            save_tenants_data(tenants_data)
            add_audit_log('TENANT_CREATED', code, f"Created company '{name}' with email {email}")
            self._send_json(200, {"success": True, "tenant": new_tenant})
            return

        if path == '/api/developer/tenants/subscription':
            tenant_id = data.get('tenantId')
            status = data.get('status', 'ACTIVE')
            expiry_date = data.get('expiryDate')
            max_devices = data.get('maxDevices')
            max_branches = data.get('maxBranches')
            plan_name = data.get('planName')
            new_email = data.get('email')
            new_password = data.get('password')

            tenants_data = load_tenants_data()
            matched = None
            for t in tenants_data.get('tenants', []):
                if t.get('id') == tenant_id or t.get('code') == tenant_id or t.get('code') == data.get('code'):
                    matched = t
                    break

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            sub = matched.setdefault('subscription', {})
            if status:
                sub['status'] = status
            if expiry_date:
                sub['expiryDate'] = expiry_date
            elif data.get('extendMonths'):
                new_date = date.today() + timedelta(days=int(data.get('extendMonths')) * 30)
                sub['expiryDate'] = new_date.isoformat()
            if max_devices is not None:
                sub['maxDevices'] = int(max_devices)
            if max_branches is not None:
                sub['maxBranches'] = int(max_branches)
            if plan_name:
                sub['planName'] = plan_name
            if new_email:
                matched['email'] = str(new_email).strip().lower()
                matched['username'] = matched['email']
            if new_password:
                matched['password'] = str(new_password).strip()

            save_tenants_data(tenants_data)
            add_audit_log('SUBSCRIPTION_UPDATED', matched.get('code'), f"Status: {status}, Expiry: {expiry_date}, MaxBranches: {sub.get('maxBranches', 5)}")
            self._send_json(200, {"success": True, "subscription": sub, "tenant": matched})
            return

        if path == '/api/developer/tenants/screens':
            tenant_id = data.get('tenantId')
            screens = data.get('allowedScreens', {})

            tenants_data = load_tenants_data()
            matched = None
            for t in tenants_data.get('tenants', []):
                if t.get('id') == tenant_id or t.get('code') == tenant_id or t.get('code') == data.get('code'):
                    matched = t
                    break

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            matched['allowedScreens'] = screens
            save_tenants_data(tenants_data)
            add_audit_log('SCREENS_PERMISSIONS_UPDATED', matched.get('code'), f"Updated allowed screens: {list(screens.keys())}")
            self._send_json(200, {"success": True, "allowedScreens": screens})
            return

        if path == '/api/developer/tenants/delete':
            tenant_id = data.get('tenantId')
            tenants_data = load_tenants_data()
            original_len = len(tenants_data.get('tenants', []))
            tenants_data['tenants'] = [t for t in tenants_data.get('tenants', []) if t.get('id') != tenant_id]
            if len(tenants_data['tenants']) < original_len:
                save_tenants_data(tenants_data)
                self._send_json(200, {"success": True, "message": "تم حذف الشركة بنجاح."})
            else:
                self._send_json(404, {"error": "الشركة غير موجودة."})
            return

        if path == '/api/developer/config':
            new_pin = data.get('pin')
            new_phone = data.get('supportPhone')
            new_whatsapp = data.get('supportWhatsApp')

            tenants_data = load_tenants_data()
            dev_cfg = tenants_data.setdefault('developer', {})
            if new_pin:
                dev_cfg['pin'] = str(new_pin).strip()
            if new_phone:
                dev_cfg['supportPhone'] = str(new_phone).strip()
            if new_whatsapp:
                dev_cfg['supportWhatsApp'] = str(new_whatsapp).strip()

            save_tenants_data(tenants_data)
            self._send_json(200, {"success": True, "developer": dev_cfg})
            return

        # ---------------------------------------------------------
        # BRANCH MANAGEMENT (Parent Company Web Admin)
        # ---------------------------------------------------------
        if path == '/api/tenant/branches':
            session_token = self.headers.get('X-Tenant-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token)
            if not session:
                self._send_json(401, {"error": "يرجى تسجيل الدخول أولاً."})
                return

            if session.get('isBranch'):
                self._send_json(403, {"error": "غير مصرح لمدراء الفروع بإنشاء فروع جديدة."})
                return

            tenants_data = load_tenants_data()
            matched = None
            for t in tenants_data.get('tenants', []):
                if t.get('id') == session.get('tenantId') or t.get('code') == session.get('code'):
                    matched = t
                    break

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            branches = matched.setdefault('branches', [])
            max_branches = int(matched.get('subscription', {}).get('maxBranches', 5))
            if len(branches) >= max_branches:
                self._send_json(400, {
                    "error": f"تم الوصول إلى الحد الأقصى للفروع المسموح بها لهذه الشركة ({max_branches} فرع). يرجى التواصل مع المطور لترقية الباقة."
                })
                return

            b_name = data.get('name', '').strip()
            b_number = str(data.get('number') or data.get('phone') or '').strip()
            b_password = str(data.get('password', '')).strip()
            b_code = str(data.get('code', '')).strip().upper()

            if not b_name:
                self._send_json(400, {"error": "اسم الفرع مطلوب."})
                return
            if not b_number:
                self._send_json(400, {"error": "رقم الدخول للفرع مطلوب."})
                return
            if not b_password:
                self._send_json(400, {"error": "كلمة المرور مطلوبة."})
                return

            # Check duplicate branch number in this company
            if any(str(b.get('number', '')).strip() == b_number for b in branches):
                self._send_json(400, {"error": f"رقم الدخول ({b_number}) مسجل بالفعل لفرع آخر بشركتكم."})
                return

            new_branch_id = f"br_{int(time.time())}_{len(branches) + 1}"
            new_branch = {
                "id": new_branch_id,
                "name": b_name,
                "number": b_number,
                "code": b_code or f"BR-{len(branches) + 1:02d}",
                "password": b_password,
                "createdAt": datetime.now().isoformat()
            }
            branches.append(new_branch)
            save_tenants_data(tenants_data)
            add_audit_log('BRANCH_CREATED', matched.get('code'), f"Created branch '{b_name}' with number {b_number}")

            self._send_json(200, {
                "success": True,
                "branch": new_branch,
                "usedBranches": len(branches),
                "maxBranches": max_branches
            })
            return

        if path == '/api/tenant/branches/delete':
            session_token = self.headers.get('X-Tenant-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token)
            if not session:
                self._send_json(401, {"error": "يرجى تسجيل الدخول أولاً."})
                return

            if session.get('isBranch'):
                self._send_json(403, {"error": "غير مصرح لمدراء الفروع بحذف الفروع."})
                return

            branch_id = data.get('branchId')
            if not branch_id:
                self._send_json(400, {"error": "Missing branchId"})
                return

            tenants_data = load_tenants_data()
            matched = None
            for t in tenants_data.get('tenants', []):
                if t.get('id') == session.get('tenantId') or t.get('code') == session.get('code'):
                    matched = t
                    break

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            branches = matched.get('branches', [])
            orig_len = len(branches)
            matched['branches'] = [b for b in branches if b.get('id') != branch_id]
            if len(matched['branches']) < orig_len:
                save_tenants_data(tenants_data)
                add_audit_log('BRANCH_DELETED', matched.get('code'), f"Deleted branch id {branch_id}")
                self._send_json(200, {
                    "success": True,
                    "message": "تم حذف الفرع بنجاح.",
                    "usedBranches": len(matched['branches']),
                    "maxBranches": int(matched.get('subscription', {}).get('maxBranches', 5))
                })
            else:
                self._send_json(404, {"error": "الفرع غير موجود."})
            return

        if path == '/api/tenant/branches/update-password':
            session_token = self.headers.get('X-Tenant-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token)

            tenants_data = load_tenants_data()
            matched = None
            if session:
                if session.get('isBranch'):
                    self._send_json(403, {"error": "غير مصرح لمدراء الفروع بتغيير كلمات مرور الفروع الأخرى."})
                    return
                for t in tenants_data.get('tenants', []):
                    if t.get('id') == session.get('tenantId') or t.get('code') == session.get('code'):
                        matched = t
                        break
            elif len(tenants_data.get('tenants', [])) == 1:
                matched = tenants_data['tenants'][0]
            else:
                self._send_json(401, {"error": "يرجى تسجيل الدخول أولاً كشركة رئيسية."})
                return

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            branch_id = data.get('branchId')
            new_password = str(data.get('newPassword', '')).strip()

            if not branch_id or not new_password:
                self._send_json(400, {"error": "معرّف الفرع وكلمة المرور الجديدة مطلوبان."})
                return

            if len(new_password) < 4:
                self._send_json(400, {"error": "يجب أن لا تقل كلمة المرور عن 4 خانات."})
                return

            branch = None
            for b in matched.get('branches', []):
                if b.get('id') == branch_id:
                    branch = b
                    break

            if not branch:
                self._send_json(404, {"error": "الفرع غير موجود."})
                return

            branch['password'] = new_password
            save_tenants_data(tenants_data)
            add_audit_log('BRANCH_PASSWORD_UPDATED', matched.get('code'), f"Updated password for branch '{branch.get('name')}' ({branch.get('number')})")

            self._send_json(200, {
                "success": True,
                "message": f"تم تحديث كلمة مرور الفرع '{branch.get('name')}' بنجاح.",
                "branchId": branch_id
            })
            return

        # ---------------------------------------------------------
        # SCREEN FRAME STREAM
        # ---------------------------------------------------------
        if path.startswith('/api/devices/') and path.endswith('/screen-frame'):
            parts = path.strip('/').split('/')
            dev_id = parts[2] if len(parts) >= 3 else ''
            if dev_id and data.get('frame'):
                latest_frames[dev_id] = {
                    "frame": data.get('frame'),
                    "timestamp": time.time()
                }
            self._send_json(200, {"status": "OK"})
            return

        if path == '/api/geofence':
            if 'enabled' in data:
                geofence_config['enabled'] = bool(data['enabled'])
            if 'radiusMeters' in data:
                geofence_config['radiusMeters'] = int(data['radiusMeters'])
            if 'center' in data and isinstance(data['center'], dict):
                geofence_config['center']['lat'] = float(data['center'].get('lat', geofence_config['center']['lat']))
                geofence_config['center']['lng'] = float(data['center'].get('lng', geofence_config['center']['lng']))
            add_audit_log('GEOFENCE_UPDATED', 'SYSTEM', f"Radius: {geofence_config['radiusMeters']}m, Enabled: {geofence_config['enabled']}")
            self._send_json(200, {"success": True, "geofence": geofence_config})
            return

        # ---------------------------------------------------------
        # AGENT HEARTBEAT & SUBSCRIPTION VERIFICATION
        # ---------------------------------------------------------
        if path == '/api/devices/heartbeat':
            dev_id = data.get('id')
            if not dev_id:
                self._send_json(400, {"error": "Missing device id"})
                return

            data['lastSeen'] = time.time()

            # Associate with company code
            comp_code = str(data.get('companyCode') or data.get('company_code') or 'NEXUS-DEFAULT').strip().upper()
            data['companyCode'] = comp_code

            # Lookup tenant subscription
            tenants_data = load_tenants_data()
            tenant = None
            for t in tenants_data.get('tenants', []):
                if t.get('code', '').upper() == comp_code:
                    tenant = t
                    break

            if not tenant and len(tenants_data.get('tenants', [])) == 1:
                tenant = tenants_data['tenants'][0]
                comp_code = tenant.get('code', '').upper()
                data['companyCode'] = comp_code

            if tenant:
                sub_active, sub_msg = is_subscription_active(tenant)
                comp_name = tenant.get('name', 'Company')
            else:
                # If company does not exist, check if first tenant works or block
                sub_active = False
                sub_msg = f"كود الشركة ({comp_code}) غير مسجل في خادم المطور."
                comp_name = "Unknown"

            data['subscriptionActive'] = sub_active
            data['companyName'] = comp_name

            # Geofence validation
            loc = data.get('location')
            if loc and isinstance(loc, dict) and 'lat' in loc and 'lng' in loc:
                lat = loc['lat']
                lng = loc['lng']
                if geofence_config.get('enabled'):
                    dist = haversine_meters(lat, lng, geofence_config['center']['lat'], geofence_config['center']['lng'])
                    data['geofenceDistanceMeters'] = int(dist)
                    breached = dist > geofence_config['radiusMeters']
                    data['geofenceBreach'] = breached
                    if breached:
                        add_audit_log('GEOFENCE_ALERT', dev_id, f"Device outside perimeter! Distance: {int(dist)}m")

            devices[dev_id] = data
            save_devices_cache()

            # Get and flush pending commands for this device
            cmds = pending_commands.get(dev_id, [])
            pending_commands[dev_id] = []

            if cmds:
                add_audit_log('COMMANDS_DELIVERED', dev_id, f"Delivered {len(cmds)} commands to agent")

            self._send_json(200, {
                "status": "OK",
                "commands": cmds,
                "subscriptionActive": sub_active,
                "subscriptionMessage": sub_msg,
                "companyCode": comp_code,
                "companyName": comp_name,
                "serverTime": int(time.time() * 1000),
                "serverTimeZone": "Asia/Baghdad"
            })
            return

        # ---------------------------------------------------------
        # AUTOMATIC TIME & DATE SYNCHRONIZATION API
        # ---------------------------------------------------------
        if path == '/api/fleet/sync-time':
            dev_id = data.get('deviceId', 'ALL')
            time_zone = data.get('timeZone', 'Asia/Baghdad')
            now_ms = int(time.time() * 1000)

            cmd_obj = {
                "command": "SYNC_TIME",
                "timestamp": now_ms,
                "timeZone": time_zone,
                "payload": {
                    "timestamp": now_ms,
                    "timeZone": time_zone
                }
            }

            queued_count = 0
            if dev_id == 'ALL':
                for did in devices.keys():
                    pending_commands.setdefault(did, []).append(cmd_obj)
                    queued_count += 1
                add_audit_log('TIME_SYNC_FLEET', 'ALL_DEVICES', f"Timestamp: {now_ms}, TZ: {time_zone}")
            else:
                pending_commands.setdefault(dev_id, []).append(cmd_obj)
                queued_count = 1
                add_audit_log('TIME_SYNC_DEVICE', dev_id, f"Timestamp: {now_ms}, TZ: {time_zone}")

            self._send_json(200, {
                "success": True,
                "message": f"تم إرسال أمر مزامنة الوقت والتاريخ بنجاح إلى {queued_count} جهاز.",
                "timestamp": now_ms,
                "timeZone": time_zone,
                "devicesCount": queued_count
            })
            return

        # ---------------------------------------------------------
        # DEVICE RENAME API (Remote Command & Name Update)
        # ---------------------------------------------------------
        if path == '/api/devices/rename':
            dev_id = data.get('deviceId')
            new_name = data.get('newName', '').strip()
            if not dev_id or not new_name:
                self._send_json(400, {"error": "deviceId and newName required"})
                return

            if dev_id in devices:
                devices[dev_id]['name'] = new_name
                save_devices_cache()

            # Queue remote command to sync to device
            cmd_obj = {
                "command": "RENAME_DEVICE",
                "newName": new_name,
                "device_tag": new_name,
                "payload": {"newName": new_name, "device_tag": new_name},
                "timestamp": int(time.time() * 1000)
            }
            pending_commands.setdefault(dev_id, []).append(cmd_obj)
            add_audit_log('DEVICE_RENAMED', dev_id, f"New Name: {new_name}")
            self._send_json(200, {
                "success": True,
                "name": new_name,
                "deviceId": dev_id,
                "message": f"تمت إعادة تسمية الجهاز إلى '{new_name}' بنجاح."
            })
            return

        # ---------------------------------------------------------
        # COMMAND DISPATCH
        # ---------------------------------------------------------
        if path == '/api/commands':
            session_token = self.headers.get('X-Tenant-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token) if session_token else None

            dev_id = data.get('deviceId')
            command = data.get('command')
            raw_payload = data.get('payload')
            payload = raw_payload if isinstance(raw_payload, dict) else {}

            if not dev_id or not command:
                self._send_json(400, {"error": "Missing deviceId or command"})
                return

            # SECURITY ENFORCEMENT: If caller is a Branch Web Admin:
            # Branches CANNOT exit Kiosk mode! (User specified: رمز الأدمن يكون فقط لدى الشركة الرئيسية يعني الافرع ما يقدرون يفكون الكشك)
            if session and session.get('isBranch'):
                if command == 'SET_KIOSK_MODE' and not payload.get('enable', True):
                    self._send_json(403, {
                        "error": "غير مصرح لمدراء الفروع بإلغاء وضع الكشك. هذه الصلاحية محصورة بالإدارة العامة للشركة فقط."
                    })
                    return
                if command in ['WIPE_DEVICE', 'SET_ADMIN_PIN']:
                    self._send_json(403, {
                        "error": "غير مصرح لمدراء الفروع بتنفيذ هذا الإجراء الأمني الحساس."
                    })
                    return

            cmd_obj = dict(payload)
            cmd_obj['command'] = command
            cmd_obj['timestamp'] = int(time.time() * 1000)

            if dev_id == 'ALL':
                for did in devices.keys():
                    pending_commands.setdefault(did, []).append(cmd_obj)
                add_audit_log('BROADCAST_COMMAND', 'ALL_DEVICES', f"Dispatched: {command}")
            else:
                pending_commands.setdefault(dev_id, []).append(cmd_obj)
                add_audit_log('DISPATCH_COMMAND', dev_id, f"Dispatched: {command}")

            if command == 'SET_WHITELIST':
                pkgs = payload.get('packages', [])
                if dev_id == 'ALL':
                    for did in devices:
                        devices[did]['whitelistedApps'] = pkgs
                elif dev_id in devices:
                    devices[dev_id]['whitelistedApps'] = pkgs
                save_devices_cache(devices)

                if os.path.exists(adb_executable_path):
                    try:
                        subprocess.run([
                            adb_executable_path, 'shell', 'am', 'start',
                            '-n', 'com.nexus.mdm.agent/.ui.MainActivity',
                            '--ez', 'EXTRA_WHITELIST_UPDATED', 'true'
                        ], timeout=2)
                    except Exception:
                        pass

            self._send_json(200, {"success": True, "message": f"Command '{command}' queued successfully."})
            return

        if path == '/api/apps/deploy':
            dev_id = data.get('deviceId')
            apk_url = data.get('apkUrl')
            pkg_name = (data.get('packageName') or 'ota_update_app').strip()
            auto_whitelist = bool(data.get('autoWhitelist', False))

            if not apk_url:
                self._send_json(400, {"error": "APK download URL required"})
                return

            install_cmd = {
                "command": "INSTALL_APK_FROM_URL",
                "url": apk_url,
                "package_name": pkg_name,
                "timestamp": int(time.time() * 1000)
            }

            target_device_ids = list(devices.keys()) if dev_id == 'ALL' else ([dev_id] if dev_id in devices else [dev_id])
            is_valid_pkg = bool(pkg_name and pkg_name not in ('ota_update_app', 'ota_app', 'managed_app'))

            for did in target_device_ids:
                pending_commands.setdefault(did, []).append(install_cmd)

                if auto_whitelist and is_valid_pkg:
                    current_pkgs = []
                    if did in devices:
                        current_pkgs = list(devices[did].get('whitelistedApps', []))
                        if pkg_name not in current_pkgs:
                            current_pkgs.append(pkg_name)
                            devices[did]['whitelistedApps'] = current_pkgs
                    else:
                        current_pkgs = [pkg_name]

                    whitelist_cmd = {
                        "command": "SET_WHITELIST",
                        "packages": current_pkgs,
                        "timestamp": int(time.time() * 1000)
                    }
                    pending_commands.setdefault(did, []).append(whitelist_cmd)

            if auto_whitelist and is_valid_pkg:
                save_devices_cache(devices)

            if dev_id == 'ALL':
                add_audit_log('OTA_DEPLOY_BROADCAST', 'ALL_DEVICES', f"Deployed APK: {apk_url} (Auto-Whitelist: {auto_whitelist})")
            else:
                add_audit_log('OTA_DEPLOY', dev_id, f"Deployed APK: {apk_url} (Auto-Whitelist: {auto_whitelist})")

            self._send_json(200, {"success": True, "message": "OTA deployment scheduled"})
            return

        if path.startswith('/api/devices/') and path.endswith('/touch'):
            dev_id = path.split('/')[3]
            action = data.get('action', 'tap')
            adb_path = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
            if os.path.exists(adb_path):
                import subprocess
                try:
                    if action == 'tap':
                        x_ratio = float(data.get('xRatio', 0.5))
                        y_ratio = float(data.get('yRatio', 0.5))
                        px_w = int(data.get('displayWidth', 1440))
                        px_h = int(data.get('displayHeight', 3120))
                        target_x = max(0, min(px_w, int(px_w * x_ratio)))
                        target_y = max(0, min(px_h, int(px_h * y_ratio)))
                        subprocess.run([adb_path, 'shell', 'input', 'tap', str(target_x), str(target_y)], timeout=2)
                    elif action == 'swipe':
                        direction = data.get('direction', 'up')
                        if direction == 'up':
                            subprocess.run([adb_path, 'shell', 'input', 'swipe', '720', '2100', '720', '800', '250'], timeout=2)
                        elif direction == 'down':
                            subprocess.run([adb_path, 'shell', 'input', 'swipe', '720', '800', '720', '2100', '250'], timeout=2)
                        elif direction == 'left':
                            subprocess.run([adb_path, 'shell', 'input', 'swipe', '1200', '1500', '200', '1500', '250'], timeout=2)
                        elif direction == 'right':
                            subprocess.run([adb_path, 'shell', 'input', 'swipe', '200', '1500', '1200', '1500', '250'], timeout=2)
                    elif action == 'key':
                        key_name = data.get('key', 'BACK')
                        key_map = {
                            'BACK': '4',
                            'HOME': '3',
                            'RECENTS': '187',
                            'POWER': '26',
                            'VOLUME_UP': '24',
                            'VOLUME_DOWN': '25'
                        }
                        code = key_map.get(key_name, '4')
                        subprocess.run([adb_path, 'shell', 'input', 'keyevent', code], timeout=2)
                    elif action == 'text':
                        text = str(data.get('text', '')).replace(' ', '%s')
                        if text:
                            subprocess.run([adb_path, 'shell', 'input', 'text', text], timeout=2)

                    refresh_screen_frame_async(dev_id)
                    self._send_json(200, {"success": True, "action": action})
                    return
                except Exception as e:
                    self._send_json(500, {"error": str(e)})
                    return

            self._send_json(200, {"success": True, "message": "Touch received"})
            return

        self._send_json(404, {"error": "Not Found"})

    def log_message(self, format, *args):
        pass

def run():
    server_address = ('0.0.0.0', PORT)
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(server_address, NexusAdminHandler)
    print("====================================================")
    print(f" Nexus MDM Master Server is running!")
    print(f" Company Web Admin:   http://localhost:{PORT}")
    print(f" Developer Console:   http://localhost:{PORT}/developer.html")
    print("====================================================")
    print("Press Ctrl+C to stop the server.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == '__main__':
    run()
