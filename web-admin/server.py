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
import re
import threading
import subprocess
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
from datetime import datetime, timedelta, date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.parse
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
PACKAGES_FILE = os.path.join(DATA_DIR, 'packages.json')
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

def load_packages_data():
    if os.path.exists(PACKAGES_FILE):
        try:
            with open(PACKAGES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[PACKAGES] Error loading packages: {e}")
    return []

def save_packages_data(packages):
    try:
        with open(PACKAGES_FILE, 'w', encoding='utf-8') as f:
            json.dump(packages, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[PACKAGES] Error saving packages: {e}")

# --------------------------------------------------------------------------
# APK Management & Checksum Extraction Helpers
# --------------------------------------------------------------------------
import struct
import shutil
import zipfile

def extract_apk_package_name(apk_path):
    """Extract real application package name from binary AndroidManifest.xml inside an APK."""
    try:
        with zipfile.ZipFile(apk_path, 'r') as z:
            if 'AndroidManifest.xml' not in z.namelist():
                return None
            data = z.read('AndroidManifest.xml')
        
        pos = 8
        chunk_type, header_size, chunk_size, string_count, style_count, flags, strings_offset, styles_offset = struct.unpack('<HHIIIIII', data[pos:pos+28])
        is_utf8 = bool(flags & (1 << 8))
        offsets = struct.unpack(f'<{string_count}I', data[pos+28:pos+28+string_count*4])
        str_data_start = pos + strings_offset
        strings = []
        for off in offsets:
            cur = str_data_start + off
            if is_utf8:
                u8len = data[cur]
                cur += 1
                if u8len & 0x80: cur += 1
                u8bytes = data[cur]
                cur += 1
                if u8bytes & 0x80: cur += 1
                strings.append(data[cur:cur+u8bytes].decode('utf-8', errors='ignore'))
            else:
                u16len = struct.unpack('<H', data[cur:cur+2])[0]
                cur += 2
                if u16len & 0x8000: cur += 2
                strings.append(data[cur:cur+u16len*2].decode('utf-16le', errors='ignore'))
        
        pos += chunk_size
        if struct.unpack('<H', data[pos:pos+2])[0] == 0x0180:
            res_chunk_size = struct.unpack('<I', data[pos+4:pos+8])[0]
            pos += res_chunk_size

        while pos < len(data):
            tag_type = struct.unpack('<H', data[pos:pos+2])[0]
            c_size = struct.unpack('<I', data[pos+4:pos+8])[0]
            if tag_type == 0x0102: # START_TAG
                name_idx = struct.unpack('<I', data[pos+20:pos+24])[0]
                tag_name = strings[name_idx] if name_idx < len(strings) else ''
                attr_count = struct.unpack('<H', data[pos+28:pos+30])[0]
                attr_pos = pos + 36
                attrs = {}
                for _ in range(attr_count):
                    a_ns, a_name, a_val_str, a_type, a_data = struct.unpack('<IIIIi', data[attr_pos:attr_pos+20])
                    attr_pos += 20
                    a_key = strings[a_name] if a_name < len(strings) else ''
                    a_val = strings[a_val_str] if (a_val_str != 0xFFFFFFFF and a_val_str < len(strings)) else str(a_data)
                    attrs[a_key] = a_val
                if tag_name == 'manifest' and 'package' in attrs:
                    return attrs['package']
            pos += c_size
        return None
    except Exception as e:
        print(f"[APK_PARSE_ERROR] Failed to extract package name from {apk_path}: {e}")
        return None

KNOWN_DEBUG_SIGNATURE_CHECKSUM = "T28h9GQowaWLuSM9v9Rmn8Cqn2o50SYyaDPUcUBtHk4"

def resolve_agent_apk():
    """Locate the freshest agent APK, synchronizing debug build outputs to web-admin/apk/."""
    gradle_apk = os.path.join(BASE_DIR, '..', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    primary_apk = os.path.join(BASE_DIR, 'apk', 'nexus-agent.apk')
    downloads_apk = os.path.join(DOWNLOADS_DIR, 'nexus-agent-latest.apk')
    intermediates_apk = os.path.join(BASE_DIR, '..', 'app', 'build', 'intermediates', 'apk', 'debug', 'app-debug.apk')

    if os.path.exists(gradle_apk) and os.path.getsize(gradle_apk) > 0:
        if not os.path.exists(primary_apk) or os.path.getmtime(gradle_apk) > os.path.getmtime(primary_apk):
            try:
                os.makedirs(os.path.dirname(primary_apk), exist_ok=True)
                shutil.copy2(gradle_apk, primary_apk)
            except Exception:
                pass
        return primary_apk

    for cand in [primary_apk, downloads_apk, intermediates_apk]:
        if os.path.exists(cand) and os.path.getsize(cand) > 0:
            return cand
    return primary_apk

def find_android_sdk_root():
    """Locate Android SDK root across macOS, Linux, and Windows."""
    for env in ('ANDROID_HOME', 'ANDROID_SDK_ROOT'):
        val = os.environ.get(env)
        if val and os.path.isdir(val):
            return val
    mac_sdk = os.path.expanduser('~/Library/Android/sdk')
    if os.path.isdir(mac_sdk):
        return mac_sdk
    linux_sdk = os.path.expanduser('~/Android/Sdk')
    if os.path.isdir(linux_sdk):
        return linux_sdk
    win_sdk = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk')
    if os.path.isdir(win_sdk):
        return win_sdk
    return ''

def get_apk_signature_checksum(apk_path):
    """
    Extracts the SHA-256 fingerprint of the signing certificate from an APK
    in URL-safe Base64 without padding, matching Android Enterprise
    android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM.
    """
    if not apk_path or not os.path.exists(apk_path):
        return KNOWN_DEBUG_SIGNATURE_CHECKSUM

    # 1. Try Android SDK apksigner if available
    sdk_root = find_android_sdk_root()
    if sdk_root:
        build_tools = os.path.join(sdk_root, 'build-tools')
        if os.path.isdir(build_tools):
            for v in sorted(os.listdir(build_tools), reverse=True):
                for apksigner_name in ('apksigner', 'apksigner.bat'):
                    apksigner = os.path.join(build_tools, v, apksigner_name)
                    if os.path.isfile(apksigner) and (os.access(apksigner, os.X_OK) or os.name == 'nt'):
                        try:
                            import re
                            res = subprocess.run([apksigner, 'verify', '--print-certs', apk_path], capture_output=True, text=True, timeout=10)
                            m = re.search(r'certificate SHA-256 digest:\s*([0-9a-fA-F]+)', res.stdout)
                            if m:
                                digest_hex = m.group(1).strip()
                                raw_bytes = bytes.fromhex(digest_hex)
                                return base64.urlsafe_b64encode(raw_bytes).decode('ascii').rstrip('=')
                        except Exception:
                            pass

    # 2. Pure Python parsing of APK Signing Block v2/v3
    try:
        with open(apk_path, 'rb') as f:
            data = f.read()
        eocd_idx = data.rfind(b'\x50\x4b\x05\x06')
        if eocd_idx != -1:
            cd_size, cd_offset = struct.unpack('<II', data[eocd_idx+12:eocd_idx+20])
            magic = data[cd_offset-16:cd_offset]
            if magic == b'APK Sig Block 42':
                block_size = struct.unpack('<Q', data[cd_offset-24:cd_offset-16])[0]
                block_start = cd_offset - 8 - block_size
                pos = block_start + 8
                while pos < cd_offset - 24:
                    length = struct.unpack('<Q', data[pos:pos+8])[0]
                    pos += 8
                    scheme_id = struct.unpack('<I', data[pos:pos+4])[0]
                    val = data[pos+4:pos+length]
                    if scheme_id in (0x7109871a, 0xf05368c0):
                        idx = val.find(b'\x30\x82')
                        if idx != -1:
                            seq_len = struct.unpack('>H', val[idx+2:idx+4])[0] + 4
                            cert = val[idx:idx+seq_len]
                            return base64.urlsafe_b64encode(hashlib.sha256(cert).digest()).decode('ascii').rstrip('=')
                    pos += length
    except Exception:
        pass

    return KNOWN_DEBUG_SIGNATURE_CHECKSUM

def get_apk_file_checksum(apk_path):
    """Computes URL-safe Base64 SHA-256 of the APK file itself (PACKAGE_CHECKSUM)."""
    if not apk_path or not os.path.exists(apk_path):
        return ""
    try:
        with open(apk_path, 'rb') as f:
            h = hashlib.sha256(f.read()).digest()
        return base64.urlsafe_b64encode(h).decode('ascii').rstrip('=')
    except Exception:
        return ""

# --------------------------------------------------------------------------
# Persistent Tenant & Subscription Storage
# --------------------------------------------------------------------------
DEFAULT_TENANTS = {
    "tenants": [],
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

WHITELIST_PACKAGE_FAMILIES = [
    # Camera family: Snapdragon SnapCam (Honeywell CT47/Qualcomm), AOSP Camera2, Google Camera, Honeywell Camera, Samsung Camera
    [
        "org.codeaurora.snapcam",
        "com.android.camera2",
        "com.google.android.GoogleCamera",
        "com.honeywell.camera",
        "com.android.camera",
        "com.sec.android.app.camera"
    ],
    # Calculator family: Google Calculator (Honeywell CT47 GMS), AOSP Calculator2, Samsung Calculator
    [
        "com.google.android.calculator",
        "com.android.calculator2",
        "com.android.calculator",
        "com.sec.android.app.popupcalculator"
    ],
    # File manager family
    [
        "com.android.documentsui",
        "com.google.android.apps.nbu.files",
        "com.honeywell.filebrowser",
        "com.sec.android.app.myfiles"
    ],
    # Honeywell Settings & Tools family
    [
        "com.honeywell.systemsettings",
        "com.honeywell.tools.ezconfig",
        "com.android.settings"
    ],
    # Browser family
    [
        "com.honeywell.enterprisebrowser",
        "com.android.chrome"
    ],
    # Honeywell Barcode Scanning & Tools family
    [
        "com.honeywell.decode",
        "com.honeywell.demos.scandemo",
        "com.honeywell.tools.scanwedge"
    ]
]

def expand_whitelist_aliases(packages):
    if not packages or not isinstance(packages, (list, set, tuple)):
        return []
    result = list(packages)
    for family in WHITELIST_PACKAGE_FAMILIES:
        if any(p in family for p in packages):
            for p in family:
                if p not in result:
                    result.append(p)
    return result

# In-Memory State
devices = load_devices_cache()
pending_commands = {}  # device_id -> list of commands
latest_frames = {}     # device_id -> { 'frame': base64, 'timestamp': float }
pending_touch_events = {} # device_id -> list of touch/gesture/key actions
adb_stream_subscribers = {} # device_id -> expire_timestamp

def find_adb_executable():
    """Locate adb binary across macOS, Linux, and Windows."""
    in_path = shutil.which('adb') or shutil.which('adb.exe')
    if in_path:
        return in_path
    sdk = find_android_sdk_root()
    if sdk:
        for name in ('adb', 'adb.exe'):
            cand = os.path.join(sdk, 'platform-tools', name)
            if os.path.isfile(cand) and (os.access(cand, os.X_OK) or os.name == 'nt'):
                return cand
    return None

def get_connected_adb_serial():
    adb_bin = find_adb_executable()
    if not adb_bin:
        return None
    try:
        res = subprocess.run([adb_bin, 'devices'], capture_output=True, text=True, timeout=2)
        lines = [l.strip().split()[0] for l in res.stdout.strip().splitlines()[1:] if '\tdevice' in l or ' device' in l]
        if lines:
            return lines[0]
    except Exception:
        pass
    return None

adb_lock = threading.Lock()

def capture_adb_screen_frame(target_serial=None):
    adb_bin = find_adb_executable()
    if not adb_bin:
        return None
    if not adb_lock.acquire(blocking=False):
        return None
    try:
        cmd = [adb_bin]
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

        if HAS_PIL:
            img = Image.open(io.BytesIO(raw_bytes))
            orig_w, orig_h = img.size
            new_w = 360
            new_h = int(orig_h * (new_w / orig_w))
            resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR).convert('RGB')
            buf = io.BytesIO()
            resized.save(buf, format='JPEG', quality=65)
            return base64.b64encode(buf.getvalue()).decode('ascii')
        else:
            return base64.b64encode(raw_bytes).decode('ascii')
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

SimpleHTTPRequestHandler.extensions_map.update({
    '.otf': 'font/otf',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
})

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class NexusAdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_HEAD(self):
        """Handle HTTP HEAD requests for APK downloads and endpoints without writing body."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == '/download/nexus-agent.apk':
            apk_path = resolve_agent_apk()
            if os.path.exists(apk_path) and os.path.getsize(apk_path) > 0:
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.android.package-archive')
                self.send_header('Content-Length', str(os.path.getsize(apk_path)))
                self.send_header('Content-Disposition', 'attachment; filename="nexus-agent.apk"')
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        if path.startswith('/downloads/') and path.endswith('.apk'):
            rel_path = path.lstrip('/')
            full_path = os.path.join(PUBLIC_DIR, rel_path)
            if os.path.exists(full_path) and os.path.getsize(full_path) > 0:
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.android.package-archive')
                self.send_header('Content-Length', str(os.path.getsize(full_path)))
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                return

        super().do_HEAD()

    def get_server_url(self):
        host = self.headers.get('Host')
        if not host:
            host = f"{get_local_ip()}:{PORT}"
        proto = self.headers.get('X-Forwarded-Proto', 'https' if ('onrender.com' in host or self.headers.get('X-Forwarded-Ssl') == 'on') else 'http')
        return f"{proto}://{host}"

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
        # ---------------------------------------------------------
        # TENANT API: Company Info & Subscription Check
        # ---------------------------------------------------------
        if path == '/api/tenant/info':
            session_token = self.headers.get('X-Tenant-Token') or qs.get('token', [''])[0]
            session = ACTIVE_TENANT_SESSIONS.get(session_token) if session_token else None
            company_code = qs.get('companyCode', [''])[0].strip().upper()
            if session and session.get('code'):
                company_code = session.get('code', '').strip().upper()

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

        # ENROLLMENT SHORT TOKEN RESOLUTION API (GET)
        # ---------------------------------------------------------
        if path == '/api/enroll/token':
            token_val = qs.get('token', [''])[0].strip().upper()
            if not token_val:
                self._send_json(400, {"success": False, "error": "Missing enrollment token parameter (?token=...)"})
                return

            tenants_data = load_tenants_data()
            matched_branch = None
            matched_tenant = None

            for t in tenants_data.get('tenants', []):
                for br in t.get('branches', []):
                    b_tok = str(br.get('enrollmentToken', '')).strip().upper()
                    b_code = str(br.get('code', '')).strip().upper()
                    b_num = str(br.get('number', '')).strip()
                    if token_val in (b_tok, b_code, b_num):
                        matched_branch = br
                        matched_tenant = t
                        break
                if matched_branch:
                    break

            if not matched_branch:
                self._send_json(404, {"success": False, "error": f"Invalid or expired enrollment token: '{token_val}'"})
                return

            server_url = self.get_server_url()
            self._send_json(200, {
                "success": True,
                "branch": {
                    "id": matched_branch.get('id'),
                    "name": matched_branch.get('name'),
                    "code": matched_branch.get('code'),
                    "number": matched_branch.get('number'),
                    "group": matched_branch.get('group', f"\\Iraq\\{matched_branch.get('name')}"),
                    "enrollmentToken": matched_branch.get('enrollmentToken'),
                    "wifiSsid": matched_branch.get('wifiSsid', ''),
                    "wifiPassword": matched_branch.get('wifiPassword', '')
                },
                "companyCode": matched_tenant.get('code', 'JIB'),
                "companyName": matched_tenant.get('name', 'JIB'),
                "serverUrl": server_url,
                "apkUrl": f"{server_url}/download/nexus-agent.apk",
                "autoInstallPackages": [p for p in load_packages_data() if p.get('autoInstall')]
            })
            return

        if path == '/api/packages':
            self._send_json(200, {
                "success": True,
                "packages": load_packages_data()
            })
            return

        if path == '/api/tenant/branches':
            session_token = self.headers.get('X-Tenant-Token') or qs.get('token', [''])[0]
            session = ACTIVE_TENANT_SESSIONS.get(session_token)
            tenants_data = load_tenants_data()
            matched = None
            if session:
                for t in tenants_data.get('tenants', []):
                    if t.get('id') == session.get('tenantId') or t.get('code') == session.get('code'):
                        matched = t
                        break
            elif len(tenants_data.get('tenants', [])) >= 1:
                matched = tenants_data['tenants'][0]

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            now = time.time()

            if session and session.get('isBranch'):
                # For branch web admin sessions, return their own branch info
                bid = str(session.get('branchId', ''))
                bnum = str(session.get('branchNumber', ''))
                my_branch = None
                for b in matched.get('branches', []):
                    if str(b.get('id', '')) == bid or str(b.get('number', '')) == bnum:
                        my_branch = b
                        break
                enriched = []
                if my_branch:
                    b_copy = dict(my_branch)
                    b_name = str(my_branch.get('name', '')).lower()
                    b_devs = [
                        d for d in devices.values()
                        if str(d.get('branchId', '')) == bid
                        or str(d.get('branchCode', '')).upper() == str(my_branch.get('code', '')).upper()
                        or str(d.get('branchNumber', '')) == bnum
                        or (b_name and str(d.get('branchName', '')).lower() == b_name)
                        or (b_name and str(d.get('branch', '')).lower() == b_name)
                        or (b_name and b_name in str(d.get('group', '')).lower())
                    ]
                    b_copy['devicesCount'] = len(b_devs)
                    b_copy['onlineCount'] = sum(1 for d in b_devs if (now - d.get('lastSeen', 0)) < 120)
                    b_copy['deviceIds'] = [d.get('id') for d in b_devs if d.get('id')]
                    enriched.append(b_copy)

                self._send_json(200, {
                    "success": True,
                    "branches": enriched,
                    "usedBranches": len(enriched),
                    "maxBranches": 1,
                    "canAddMore": False
                })
                return

            branches = matched.get('branches', [])
            max_branches = int(matched.get('subscription', {}).get('maxBranches', 5))
            
            enriched_branches = []
            for b in branches:
                b_copy = dict(b)
                bid = str(b.get('id', ''))
                bcode = str(b.get('code', ''))
                bnum = str(b.get('number', ''))
                b_name = str(b.get('name', '')).lower()
                b_devs = [
                    d for d in devices.values()
                    if str(d.get('branchId', '')) == bid
                    or (bcode and str(d.get('branchCode', '')).upper() == bcode.upper())
                    or (bnum and str(d.get('branchNumber', '')) == bnum)
                    or (b_name and str(d.get('branchName', '')).lower() == b_name)
                    or (b_name and str(d.get('branch', '')).lower() == b_name)
                    or (b_name and b_name in str(d.get('group', '')).lower())
                ]
                b_copy['devicesCount'] = len(b_devs)
                b_copy['onlineCount'] = sum(1 for d in b_devs if (now - d.get('lastSeen', 0)) < 120)
                b_copy['deviceIds'] = [d.get('id') for d in b_devs if d.get('id')]
                enriched_branches.append(b_copy)

            self._send_json(200, {
                "success": True,
                "branches": enriched_branches,
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
                if d.get('agentOnline') is not None:
                    d_copy['isOnline'] = bool(d.get('agentOnline'))
                    if d_copy['isOnline'] and (now - d.get('lastSeen', 0)) >= 120:
                        d_copy['lastSeen'] = now
                else:
                    d_copy['isOnline'] = (now - d.get('lastSeen', 0)) < 120
                dev_list.append(d_copy)
            self._send_json(200, dev_list)
            return

        # ---------------------------------------------------------
        # FLEET DEVICES (With Company Filtering)
        # ---------------------------------------------------------
        if path == '/api/devices':
            now = time.time()
            session_token = self.headers.get('X-Tenant-Token') or qs.get('token', [''])[0]
            session = ACTIVE_TENANT_SESSIONS.get(session_token)

            req_company = qs.get('companyCode', [''])[0].strip().upper()
            header_company = self.headers.get('X-Company-Code', '').strip().upper()
            if header_company:
                req_company = header_company

            # If user has an active session, authoritatively use the session's company code!
            if session and session.get('code'):
                req_company = str(session.get('code', '')).strip().upper()

            req_branch = qs.get('branchId', [''])[0].strip() or qs.get('branch', [''])[0].strip() or qs.get('group', [''])[0].strip()
            # If session is a branch session, authoritatively enforce branch filtering!
            if session and session.get('isBranch'):
                req_branch = str(session.get('branchName') or session.get('branchId') or '').strip()

            tenants_data = load_tenants_data()
            single_tenant_code = tenants_data['tenants'][0].get('code', '').upper() if len(tenants_data.get('tenants', [])) == 1 else None

            # Prepare target branch match identifiers
            target_branch_identifiers = set()
            if req_branch and req_branch != 'ALL':
                target_branch_identifiers.add(req_branch.lower())
            if session and session.get('isBranch'):
                if session.get('branchId'): target_branch_identifiers.add(str(session.get('branchId')).strip().lower())
                if session.get('branchNumber'): target_branch_identifiers.add(str(session.get('branchNumber')).strip().lower())
                if session.get('branchCode'): target_branch_identifiers.add(str(session.get('branchCode')).strip().lower())
                if session.get('branchName'): target_branch_identifiers.add(str(session.get('branchName')).strip().lower())

            device_list = []
            for d in devices.values():
                d_company = str(d.get('companyCode', 'NEXUS-DEFAULT')).upper()
                if req_company and req_company != 'ALL' and d_company != req_company:
                    if d_company in ('NEXUS-DEFAULT', 'JIB') and single_tenant_code and req_company == single_tenant_code:
                        pass
                    else:
                        continue

                if target_branch_identifiers:
                    b_id = str(d.get('branchId', '')).strip().lower()
                    b_code = str(d.get('branchCode', '')).strip().lower()
                    b_num = str(d.get('branchNumber', '')).strip().lower()
                    b_name = str(d.get('branchName', '') or d.get('branch', '')).strip().lower()
                    b_group = str(d.get('group', '')).strip().lower()

                    matched_target = False
                    for target in target_branch_identifiers:
                        if not target:
                            continue
                        if target in (b_id, b_code, b_num, b_name):
                            matched_target = True
                            break
                        if b_group and target in b_group:
                            matched_target = True
                            break
                        if b_name and b_name in target:
                            matched_target = True
                            break
                    if not matched_target:
                        continue

                d_copy = dict(d)
                if d.get('agentOnline') is not None:
                    d_copy['isOnline'] = bool(d.get('agentOnline'))
                    if d_copy['isOnline'] and (now - d.get('lastSeen', 0)) >= 120:
                        d_copy['lastSeen'] = now
                else:
                    d_copy['isOnline'] = (now - d.get('lastSeen', 0)) < 120
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
            apk_path = resolve_agent_apk()
            sig_checksum = get_apk_signature_checksum(apk_path)
            pkg_checksum = get_apk_file_checksum(apk_path)

            local_ip = "192.168.0.104"
            all_ips = []
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
                s.close()
                all_ips.append(local_ip)
            except Exception:
                pass

            try:
                hostname = socket.gethostname()
                for ip in socket.gethostbyname_ex(hostname)[2]:
                    if not ip.startswith('127.') and ip not in all_ips:
                        all_ips.append(ip)
            except Exception:
                pass

            if not all_ips:
                all_ips = [local_ip]

            tenants_data = load_tenants_data()
            companies_summary = [
                {
                    "code": t.get("code"),
                    "name": t.get("name"),
                    "status": t.get("subscription", {}).get("status", "ACTIVE"),
                    "branches": [
                        {
                            "id": b.get("id"),
                            "name": b.get("name"),
                            "code": b.get("code", ""),
                            "number": b.get("number", "")
                        }
                        for b in t.get("branches", [])
                    ]
                }
                for t in tenants_data.get("tenants", [])
            ]

            host = self.headers.get('Host', '')
            host_name = host.split(':')[0] if host else ''
            proto = self.headers.get('X-Forwarded-Proto', 'https' if ('onrender.com' in host or self.headers.get('X-Forwarded-Ssl') == 'on') else 'http')

            is_cloud = os.environ.get('RENDER') == 'true' or 'onrender.com' in host or (
                host_name and host_name not in ('localhost', '127.0.0.1')
                and not host_name.startswith('192.168.')
                and not host_name.startswith('10.')
                and not host_name.startswith('172.')
            )

            if is_cloud and host:
                server_url = f"{proto}://{host}"
                download_url = f"{server_url}/download/nexus-agent.apk"
                active_ip = host_name
            elif host_name and host_name not in ('localhost', '127.0.0.1'):
                active_ip = host_name
                server_url = f"http://{active_ip}:{PORT}"
                download_url = f"{server_url}/download/nexus-agent.apk"
            else:
                active_ip = local_ip
                server_url = f"http://{active_ip}:{PORT}"
                download_url = f"{server_url}/download/nexus-agent.apk"

            lan_download_url = f"http://{local_ip}:{PORT}/download/nexus-agent.apk"
            lan_server_url = f"http://{local_ip}:{PORT}"

            self._send_json(200, {
                "localIp": local_ip,
                "activeIp": active_ip,
                "availableIps": all_ips,
                "port": PORT,
                "apkChecksum": sig_checksum,
                "signatureChecksum": sig_checksum,
                "packageChecksum": pkg_checksum,
                "packageName": "com.nexus.mdm.agent",
                "componentName": "com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver",
                "defaultDownloadUrl": download_url if active_ip != 'localhost' else lan_download_url,
                "defaultServerUrl": server_url if active_ip != 'localhost' else lan_server_url,
                "lanDownloadUrl": lan_download_url,
                "lanServerUrl": lan_server_url,
                "defaultEnrollmentKey": "ENROLL-NEXUS-2026-KEY",
                "companies": companies_summary,
                "autoInstallPackages": [p for p in load_packages_data() if p.get('autoInstall')]
            })
            return

        if path == '/download/nexus-agent.apk':
            apk_path = resolve_agent_apk()

            if os.path.exists(apk_path) and os.path.getsize(apk_path) > 0:
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
        global devices
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
            extracted_pkg = extract_apk_package_name(target_path) or ""
            host = self.headers.get('Host', f"localhost:{PORT}")
            proto = self.headers.get('X-Forwarded-Proto', 'https' if ('onrender.com' in host or self.headers.get('X-Forwarded-Ssl') == 'on') else 'http')
            apk_url = f"{proto}://{host}/downloads/{filename}"

            add_audit_log('OTA_APK_UPLOAD', 'DEVELOPER', f"Uploaded {filename} ({file_size} bytes) - Package: {extracted_pkg or 'unknown'}")

            self._send_json(200, {
                "success": True,
                "filename": filename,
                "url": apk_url,
                "relativeUrl": f"/downloads/{filename}",
                "size": file_size,
                "sha256": checksum,
                "packageName": extracted_pkg,
                "message": "تم رفع ملف الـ APK بنجاح وحساب بصمة SHA-256."
            })
            return

        # ---------------------------------------------------------
        # PACKAGES MANAGEMENT: BINARY APK UPLOAD
        # ---------------------------------------------------------
        if path == '/api/packages/upload':
            content_len = int(self.headers.get('Content-Length', 0))
            if content_len <= 0:
                self._send_json(400, {"success": False, "error": "الملف فارغ أو غير موجود"})
                return

            raw_filename = self.headers.get('X-Filename', 'package.apk')
            raw_filename = urllib.parse.unquote(raw_filename)
            clean_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', raw_filename)
            if not clean_name.endswith('.apk'):
                clean_name += '.apk'

            app_title = urllib.parse.unquote(self.headers.get('X-App-Name', '')).strip()
            auto_install_str = self.headers.get('X-Auto-Install', 'true').strip().lower()
            auto_install = auto_install_str in ('true', '1', 'yes')

            timestamp = int(time.time() * 1000)
            stored_filename = f"pkg_{timestamp}_{clean_name}"
            target_path = os.path.join(DOWNLOADS_DIR, stored_filename)
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
            extracted_pkg = extract_apk_package_name(target_path) or f"com.managed.pkg_{timestamp}"

            host = self.headers.get('Host', f"localhost:{PORT}")
            proto = self.headers.get('X-Forwarded-Proto', 'https' if ('onrender.com' in host or self.headers.get('X-Forwarded-Ssl') == 'on') else 'http')
            apk_url = f"{proto}://{host}/downloads/{stored_filename}"

            new_pkg = {
                "id": f"pkg_{timestamp}",
                "name": app_title or clean_name.replace('.apk', '').replace('_', ' '),
                "packageName": extracted_pkg,
                "version": "1.0",
                "type": "apk",
                "filename": stored_filename,
                "url": apk_url,
                "relativeUrl": f"/downloads/{stored_filename}",
                "size": file_size,
                "checksum": checksum,
                "autoInstall": auto_install,
                "createdAt": timestamp
            }

            packages = load_packages_data()
            packages.insert(0, new_pkg)
            save_packages_data(packages)

            add_audit_log('PACKAGE_APK_ADDED', extracted_pkg, f"Added APK package {new_pkg['name']} ({file_size} bytes, autoInstall={auto_install})")

            self._send_json(200, {
                "success": True,
                "package": new_pkg,
                "message": "Package uploaded and registered successfully."
            })
            return

        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else '{}'

        try:
            data = json.loads(body)
        except Exception:
            data = {}

        # ---------------------------------------------------------
        # PACKAGES MANAGEMENT: JSON APIS
        # ---------------------------------------------------------
        if path == '/api/packages/play-store':
            name = str(data.get('name', '')).strip()
            pkg_name = str(data.get('packageName', '')).strip()
            if not pkg_name:
                self._send_json(400, {"success": False, "error": "Missing package name or Play Store link"})
                return

            if 'id=' in pkg_name:
                match = re.search(r'id=([a-zA-Z0-9_.]+)', pkg_name)
                if match:
                    pkg_name = match.group(1)

            auto_install = bool(data.get('autoInstall', True))
            icon_url = str(data.get('icon', '')).strip()
            timestamp = int(time.time() * 1000)

            new_pkg = {
                "id": f"pkg_{timestamp}",
                "name": name or pkg_name,
                "packageName": pkg_name,
                "version": "Google Play",
                "type": "playstore",
                "url": f"https://play.google.com/store/apps/details?id={pkg_name}",
                "icon": icon_url or "",
                "autoInstall": auto_install,
                "createdAt": timestamp
            }

            packages = load_packages_data()
            packages.insert(0, new_pkg)
            save_packages_data(packages)

            add_audit_log('PACKAGE_PLAYSTORE_ADDED', pkg_name, f"Added Google Play package {new_pkg['name']} (autoInstall={auto_install})")

            self._send_json(200, {
                "success": True,
                "package": new_pkg,
                "message": "Google Play package registered successfully."
            })
            return

        if path == '/api/packages/toggle-auto-install':
            pkg_id = str(data.get('id', '')).strip()
            auto_install = bool(data.get('autoInstall', False))
            packages = load_packages_data()
            updated = False
            for p in packages:
                if p.get('id') == pkg_id:
                    p['autoInstall'] = auto_install
                    updated = True
                    break
            if updated:
                save_packages_data(packages)
                self._send_json(200, {"success": True, "packages": packages})
            else:
                self._send_json(404, {"success": False, "error": "Package not found"})
            return

        if path == '/api/packages/delete':
            pkg_id = str(data.get('id', '')).strip()
            packages = load_packages_data()
            to_remove = None
            for p in packages:
                if p.get('id') == pkg_id:
                    to_remove = p
                    break
            if to_remove:
                packages.remove(to_remove)
                save_packages_data(packages)
                if to_remove.get('type') == 'apk' and to_remove.get('filename'):
                    fp = os.path.join(DOWNLOADS_DIR, to_remove['filename'])
                    if os.path.exists(fp):
                        try:
                            os.remove(fp)
                        except Exception:
                            pass
                self._send_json(200, {"success": True, "packages": packages})
            else:
                self._send_json(404, {"success": False, "error": "Package not found"})
            return

        if path == '/api/packages/deploy-fleet':
            pkg_id = str(data.get('id', '') or data.get('packageId', '')).strip()
            target_device_ids = data.get('deviceIds') or []
            packages = load_packages_data()
            target_pkg = next((p for p in packages if p.get('id') == pkg_id), None)
            if not target_pkg:
                self._send_json(404, {"success": False, "error": "Package not found"})
                return

            devices = load_devices_cache()
            if not target_device_ids:
                target_device_ids = list(devices.keys())

            queued_count = 0
            for d_id in target_device_ids:
                if d_id not in pending_commands:
                    pending_commands[d_id] = []
                if target_pkg.get('type') == 'apk':
                    pending_commands[d_id].append({
                        "action": "INSTALL_APK_FROM_URL",
                        "url": target_pkg.get('url'),
                        "package_name": target_pkg.get('packageName'),
                        "app_name": target_pkg.get('name')
                    })
                else:
                    pending_commands[d_id].append({
                        "action": "INSTALL_PLAY_STORE_APP",
                        "package_name": target_pkg.get('packageName'),
                        "app_name": target_pkg.get('name')
                    })
                queued_count += 1

            self._send_json(200, {
                "success": True,
                "queuedCount": queued_count,
                "message": f"Deployment command queued for {queued_count} devices."
            })
            return

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
            login_id = (data.get('email') or data.get('username') or data.get('branchLogin') or data.get('loginId') or data.get('number') or data.get('phone') or data.get('token') or data.get('code') or '').strip()
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
                parent_id = matched_parent.get('id', '')
                hash_token = hashlib.md5(f"{parent_id}:{password}".encode()).hexdigest()[:10]
                session_token = f"tenant_{int(time.time())}_{hash_token}"
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
            # 2. Check branches across all companies
            matched_branch = None
            parent_for_branch = None
            for t in tenants_data.get('tenants', []):
                for br in t.get('branches', []):
                    b_num = str(br.get('number', '')).strip()
                    b_phone = str(br.get('phone', '')).strip()
                    b_code = str(br.get('code', '')).strip().upper()
                    b_email = str(br.get('email', '')).strip().lower()
                    b_user = str(br.get('username', '')).strip().lower()
                    b_name = str(br.get('name', '')).strip().lower()
                    b_token = str(br.get('enrollmentToken', '')).strip().upper()

                    id_matches = (
                        (login_id == b_num) or
                        (b_phone and login_id == b_phone) or
                        (b_code and login_id.upper() == b_code) or
                        (b_token and login_id.upper() == b_token) or
                        (b_email and login_lower == b_email) or
                        (b_user and login_lower == b_user) or
                        (b_name and login_lower == b_name)
                    )
                    if id_matches and str(br.get('password', '')) == password:
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

                branch_id = matched_branch.get('id', '')
                hash_token = hashlib.md5(f"{branch_id}:{password}".encode()).hexdigest()[:10]
                session_token = f"branch_{int(time.time())}_{hash_token}"
                ACTIVE_TENANT_SESSIONS[session_token] = {
                    "tenantId": parent_for_branch.get('id'),
                    "code": parent_for_branch.get('code'),
                    "isBranch": True,
                    "branchId": matched_branch.get('id'),
                    "branchName": matched_branch.get('name'),
                    "branchNumber": matched_branch.get('number'),
                    "branchCode": matched_branch.get('code'),
                    "group": matched_branch.get('group', f"\\Iraq\\{matched_branch.get('name')}"),
                    "enrollmentToken": matched_branch.get('enrollmentToken'),
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
        # ENROLLMENT SHORT TOKEN RESOLUTION API (POST)
        # ---------------------------------------------------------
        if path == '/api/enroll/token':
            token_val = str(data.get('token') or data.get('enrollmentToken') or '').strip().upper()
            if not token_val:
                self._send_json(400, {"success": False, "error": "Missing 'token' in request body."})
                return

            tenants_data = load_tenants_data()
            matched_branch = None
            matched_tenant = None

            for t in tenants_data.get('tenants', []):
                for br in t.get('branches', []):
                    b_tok = str(br.get('enrollmentToken', '')).strip().upper()
                    b_code = str(br.get('code', '')).strip().upper()
                    b_num = str(br.get('number', '')).strip()
                    if token_val in (b_tok, b_code, b_num):
                        matched_branch = br
                        matched_tenant = t
                        break
                if matched_branch:
                    break

            if not matched_branch:
                self._send_json(404, {"success": False, "error": f"Invalid or expired enrollment token: '{token_val}'"})
                return

            server_url = self.get_server_url()
            self._send_json(200, {
                "success": True,
                "branch": {
                    "id": matched_branch.get('id'),
                    "name": matched_branch.get('name'),
                    "code": matched_branch.get('code'),
                    "number": matched_branch.get('number'),
                    "email": matched_branch.get('email', ''),
                    "group": matched_branch.get('group', f"\\Iraq\\{matched_branch.get('name')}"),
                    "enrollmentToken": matched_branch.get('enrollmentToken'),
                    "wifiSsid": matched_branch.get('wifiSsid', ''),
                    "wifiPassword": matched_branch.get('wifiPassword', '')
                },
                "companyCode": matched_tenant.get('code', 'JIB'),
                "companyName": matched_tenant.get('name', 'JIB'),
                "serverUrl": server_url,
                "apkUrl": f"{server_url}/download/nexus-agent.apk"
            })
            return

        # ---------------------------------------------------------
        # BRANCH MANAGEMENT (Parent Company Web Admin & Super Admin)
        # ---------------------------------------------------------
        if path == '/api/tenant/branches':
            session_token = self.headers.get('X-Tenant-Token')
            dev_token = self.headers.get('X-Developer-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token)
            tenants_data = load_tenants_data()
            matched = None

            if session:
                if session.get('isBranch'):
                    self._send_json(403, {"error": "غير مصرح لمدراء الفروع بإنشاء فروع جديدة."})
                    return
                for t in tenants_data.get('tenants', []):
                    if t.get('id') == session.get('tenantId') or t.get('code') == session.get('code'):
                        matched = t
                        break
            elif dev_token and dev_token in ACTIVE_DEVELOPER_SESSIONS:
                tenant_id = data.get('tenantId') or data.get('companyCode')
                if tenant_id:
                    matched = next((t for t in tenants_data.get('tenants', []) if t.get('id') == tenant_id or t.get('code') == tenant_id), None)
                if not matched and len(tenants_data.get('tenants', [])) >= 1:
                    matched = tenants_data['tenants'][0]
            elif len(tenants_data.get('tenants', [])) >= 1:
                matched = tenants_data['tenants'][0]
            else:
                self._send_json(401, {"error": "يرجى تسجيل الدخول أولاً."})
                return

            if not matched:
                self._send_json(404, {"error": "الشركة غير موجودة."})
                return

            branches = matched.setdefault('branches', [])
            max_branches = int(matched.get('subscription', {}).get('maxBranches', 25))
            if len(branches) >= max_branches:
                self._send_json(400, {
                    "error": f"تم الوصول إلى الحد الأقصى للفروع المسموح بها ({max_branches} فرع). يرجى ترقية الباقة."
                })
                return

            b_name = data.get('name', '').strip()
            b_number = str(data.get('number') or data.get('phone') or '').strip()
            b_password = str(data.get('password', '')).strip()
            b_code = str(data.get('code', '')).strip().upper()
            b_email = str(data.get('email') or data.get('username') or '').strip()
            b_token = str(data.get('enrollmentToken') or data.get('token') or '').strip().upper()
            b_wifi_ssid = str(data.get('wifiSsid') or '').strip()
            b_wifi_pass = str(data.get('wifiPassword') or '').strip()

            if not b_name:
                self._send_json(400, {"error": "اسم الفرع مطلوب."})
                return
            if not b_password:
                self._send_json(400, {"error": "كلمة المرور مطلوبة."})
                return

            clean_name_code = re.sub(r'[^A-Za-z0-9]', '', b_name).upper()
            if not b_code:
                b_code = clean_name_code if clean_name_code else f"BR{len(branches) + 1:02d}"
            if not b_number:
                b_number = str(100 + len(branches) + 1)
            if not b_email:
                b_email = f"it.{clean_name_code.lower() or 'branch'}@jib.iq"
            if not b_token:
                prefix = b_code[:3] if len(b_code) >= 3 else 'BRN'
                b_token = f"JIB-{prefix}-2026"

            # Check duplicate branch number or token
            if any(str(b.get('number', '')).strip() == b_number for b in branches):
                b_number = str(100 + len(branches) + 1)

            new_branch_id = f"br_{int(time.time())}_{len(branches) + 1}"
            new_branch = {
                "id": new_branch_id,
                "name": b_name,
                "number": b_number,
                "code": b_code,
                "email": b_email,
                "username": b_email,
                "password": b_password,
                "enrollmentToken": b_token,
                "group": f"\\Iraq\\{b_name}",
                "wifiSsid": b_wifi_ssid,
                "wifiPassword": b_wifi_pass,
                "createdAt": datetime.now().isoformat()
            }
            branches.append(new_branch)
            save_tenants_data(tenants_data)
            add_audit_log('BRANCH_CREATED', matched.get('code'), f"Created branch '{b_name}' with token {b_token} and login {b_email}")

            self._send_json(200, {
                "success": True,
                "branch": new_branch,
                "usedBranches": len(branches),
                "maxBranches": max_branches
            })
            return

        if path == '/api/tenant/branches/delete':
            session_token = self.headers.get('X-Tenant-Token')
            dev_token = self.headers.get('X-Developer-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token)
            tenants_data = load_tenants_data()
            matched = None

            if session:
                if session.get('isBranch'):
                    self._send_json(403, {"error": "غير مصرح لمدراء الفروع بحذف الفروع."})
                    return
                for t in tenants_data.get('tenants', []):
                    if t.get('id') == session.get('tenantId') or t.get('code') == session.get('code'):
                        matched = t
                        break
            elif dev_token and dev_token in ACTIVE_DEVELOPER_SESSIONS:
                if len(tenants_data.get('tenants', [])) >= 1:
                    matched = tenants_data['tenants'][0]
            elif len(tenants_data.get('tenants', [])) >= 1:
                matched = tenants_data['tenants'][0]
            else:
                self._send_json(401, {"error": "يرجى تسجيل الدخول أولاً."})
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
                devices_changed = False
                for d in devices.values():
                    if str(d.get('branchId', '')) == branch_id:
                        d.pop('branchId', None)
                        d.pop('branchName', None)
                        d.pop('branchCode', None)
                        devices_changed = True
                if devices_changed:
                    save_devices_cache(devices)
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
        # ASSIGN / UNASSIGN DEVICE TO BRANCH
        # ---------------------------------------------------------
        if path == '/api/tenant/devices/assign-branch':
            session_token = self.headers.get('X-Tenant-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token)

            tenants_data = load_tenants_data()
            matched = None
            if session:
                if session.get('isBranch'):
                    self._send_json(403, {"error": "غير مصرح لمدراء الفروع بإعادة تعيين أجهزة الفروع."})
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

            dev_id = str(data.get('deviceId', '')).strip()
            branch_id = str(data.get('branchId', '')).strip()

            if not dev_id:
                self._send_json(400, {"error": "معرّف الجهاز مطلوب (deviceId)."})
                return

            if dev_id not in devices:
                self._send_json(404, {"error": "الجهاز غير موجود في النظام."})
                return

            dev = devices[dev_id]
            dev_company = str(dev.get('companyCode', 'NEXUS-DEFAULT')).upper()
            tenant_code = str(matched.get('code', '')).upper()
            if dev_company != tenant_code and dev_company != 'NEXUS-DEFAULT':
                self._send_json(403, {"error": "هذا الجهاز لا يتبع شركتكم."})
                return

            if branch_id and branch_id != 'UNASSIGN':
                target_branch = None
                for b in matched.get('branches', []):
                    if str(b.get('id', '')) == branch_id:
                        target_branch = b
                        break
                if not target_branch:
                    self._send_json(404, {"error": "الفرع المحدد غير موجود."})
                    return

                dev['branchId'] = target_branch.get('id')
                dev['branchName'] = target_branch.get('name')
                dev['branchCode'] = target_branch.get('code', '')
                dev['branchNumber'] = target_branch.get('number', '')
                dev['companyCode'] = tenant_code
                dev['companyName'] = matched.get('name', '')
                save_devices_cache(devices)

                # Queue command to synchronize branch assignment directly to device
                cmd_obj = {
                    "command": "ASSIGN_BRANCH",
                    "branchId": target_branch.get('id'),
                    "branchName": target_branch.get('name'),
                    "branchCode": target_branch.get('code', ''),
                    "branchNumber": target_branch.get('number', ''),
                    "companyCode": tenant_code,
                    "companyName": matched.get('name', ''),
                    "payload": {
                        "branchId": target_branch.get('id'),
                        "branchName": target_branch.get('name'),
                        "branchCode": target_branch.get('code', ''),
                        "branchNumber": target_branch.get('number', ''),
                        "companyCode": tenant_code,
                        "companyName": matched.get('name', '')
                    },
                    "timestamp": int(time.time() * 1000)
                }
                pending_commands.setdefault(dev_id, []).append(cmd_obj)

                add_audit_log('DEVICE_BRANCH_ASSIGNED', tenant_code, f"تم ربط الجهاز '{dev.get('name', dev_id)}' بالفرع '{target_branch.get('name')}'")
                self._send_json(200, {
                    "success": True,
                    "message": f"تم ربط الجهاز '{dev.get('name', dev_id)}' بالفرع '{target_branch.get('name')}' بنجاح.",
                    "device": dev
                })
            else:
                dev.pop('branchId', None)
                dev.pop('branchName', None)
                dev.pop('branchCode', None)
                dev.pop('branchNumber', None)
                save_devices_cache(devices)

                cmd_obj = {
                    "command": "UNASSIGN_BRANCH",
                    "payload": {},
                    "timestamp": int(time.time() * 1000)
                }
                pending_commands.setdefault(dev_id, []).append(cmd_obj)

                add_audit_log('DEVICE_BRANCH_UNASSIGNED', tenant_code, f"تم فك ارتباط الجهاز '{dev.get('name', dev_id)}' من الفرع")
                self._send_json(200, {
                    "success": True,
                    "message": f"تم فك ارتباط الجهاز '{dev.get('name', dev_id)}' من الفرع وأصبح تابعاً للإدارة العامة.",
                    "device": dev
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
            actions = pending_touch_events.pop(dev_id, [])
            self._send_json(200, {"status": "OK", "actions": actions})
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
            dev_id = data.get('id') or data.get('deviceId')
            if not dev_id:
                self._send_json(400, {"error": "Missing device id"})
                return
            data['id'] = dev_id

            existing_dev = devices.get(dev_id, {})

            data['lastSeen'] = time.time()

            # Associate with company code (preserve existing tenant company if heartbeat sends default/empty)
            comp_code = str(data.get('companyCode') or data.get('company_code') or '').strip().upper()
            if not comp_code or comp_code == 'NEXUS-DEFAULT':
                existing_comp = str(existing_dev.get('companyCode', '')).strip().upper()
                if existing_comp and existing_comp != 'NEXUS-DEFAULT':
                    comp_code = existing_comp
                else:
                    comp_code = 'NEXUS-DEFAULT'
            data['companyCode'] = comp_code

            # Record enrollment key if provided
            enrollment_key = str(data.get('enrollmentKey') or data.get('enrollment_key') or '').strip()
            if enrollment_key:
                data['enrollmentKey'] = enrollment_key
            elif 'enrollmentKey' in existing_dev:
                data['enrollmentKey'] = existing_dev['enrollmentKey']

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
            elif comp_code in ('NEXUS-DEFAULT', '', 'DEFAULT') or not tenants_list:
                sub_active = True
                sub_msg = "الترخيص الافتراضي نشط ومفعّل مدى الحياة."
                comp_name = "شركة التقنية المتقدمة"
            else:
                sub_active = False
                sub_msg = f"كود الشركة ({comp_code}) غير مسجل في خادم المطور."
                comp_name = "Unknown"

            data['subscriptionActive'] = sub_active
            data['companyName'] = comp_name

            # Resolve short enrollment token if provided
            incoming_token = str(data.get('enrollmentToken') or data.get('enrollment_token') or data.get('token') or '').strip().upper()
            if incoming_token:
                for t in tenants_data.get('tenants', []):
                    for b in t.get('branches', []):
                        if incoming_token in (str(b.get('enrollmentToken', '')).upper(), str(b.get('code', '')).upper(), str(b.get('number', ''))):
                            tenant = t
                            data['companyCode'] = t.get('code', 'JIB')
                            data['branchId'] = b.get('id')
                            data['branchName'] = b.get('name')
                            data['branchCode'] = b.get('code')
                            data['branchNumber'] = b.get('number')
                            data['branch'] = b.get('name')
                            data['group'] = b.get('group', f"\\Iraq\\{b.get('name')}")
                            data['enrollmentToken'] = b.get('enrollmentToken')
                            break

            # Resolve incoming branch or preserve existing branch
            incoming_branch_id = data.get('branchId') or data.get('branch_id')
            incoming_branch_name = data.get('branchName') or data.get('branch_name') or data.get('branch')
            incoming_branch_code = data.get('branchCode') or data.get('branch_code')
            incoming_branch_number = data.get('branchNumber') or data.get('branch_number')
            incoming_group = data.get('group')

            if incoming_branch_id:
                data['branchId'] = incoming_branch_id
            if incoming_branch_name:
                data['branchName'] = incoming_branch_name
                data['branch'] = incoming_branch_name
            if incoming_branch_code: data['branchCode'] = incoming_branch_code
            if incoming_branch_number: data['branchNumber'] = incoming_branch_number
            if incoming_group: data['group'] = incoming_group

            # Enrich from tenant branches if tenant is found
            if tenant and (data.get('branchId') or data.get('branchName') or data.get('branch')):
                b_lookup = str(data.get('branchId') or data.get('branchName') or data.get('branch')).strip().lower()
                for b in tenant.get('branches', []):
                    if (str(b.get('id', '')).lower() == b_lookup or 
                        str(b.get('code', '')).lower() == b_lookup or 
                        str(b.get('number', '')).lower() == b_lookup or
                        str(b.get('name', '')).lower() == b_lookup):
                        data['branchId'] = b.get('id')
                        data['branchName'] = b.get('name')
                        data['branch'] = b.get('name')
                        data['branchCode'] = b.get('code', '')
                        data['branchNumber'] = b.get('number', '')
                        data['group'] = b.get('group', f"\\Iraq\\{b.get('name')}")
                        data['enrollmentToken'] = b.get('enrollmentToken', '')
                        break

            # CRITICAL: Preserve all persistent server-assigned fields if not supplied in incoming heartbeat
            preserve_fields = [
                'branchId', 'branchName', 'branchCode', 'branchNumber', 'branch', 'group',
                'enrollmentToken', 'customName', 'notes', 'tags', 'assignedBranch'
            ]
            for field in preserve_fields:
                if field in existing_dev and (field not in data or not data[field]):
                    data[field] = existing_dev[field]

            # Preserve custom name if device was renamed on server
            if existing_dev.get('name') and ('customName' in existing_dev or existing_dev.get('name') != existing_dev.get('model')):
                if not data.get('name') or data.get('name') in ('NEXUS-DEVICE-01', data.get('model')):
                    data['name'] = existing_dev['name']

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

            if 'whitelistedApps' in data and isinstance(data['whitelistedApps'], list):
                data['whitelistedApps'] = expand_whitelist_aliases(data['whitelistedApps'])
            elif 'whitelistedApps' in existing_dev:
                data['whitelistedApps'] = existing_dev['whitelistedApps']

            # Auto-provisioning application packages on initial enrollment/setup
            is_new_enrollment = (not existing_dev) or not existing_dev.get('provisioningPackagesInstalled')
            all_packages = load_packages_data()
            auto_pkgs = [p for p in all_packages if p.get('autoInstall')]

            if is_new_enrollment and auto_pkgs:
                if dev_id not in pending_commands:
                    pending_commands[dev_id] = []
                cur_whitelist = set(data.get('whitelistedApps') or [])
                for p in auto_pkgs:
                    pkg_name = p.get('packageName')
                    if pkg_name:
                        cur_whitelist.add(pkg_name)
                    if p.get('type') == 'apk':
                        pending_commands[dev_id].append({
                            "action": "INSTALL_APK_FROM_URL",
                            "url": p.get('url'),
                            "package_name": pkg_name,
                            "app_name": p.get('name')
                        })
                    else:
                        pending_commands[dev_id].append({
                            "action": "INSTALL_PLAY_STORE_APP",
                            "package_name": pkg_name,
                            "app_name": p.get('name')
                        })
                data['whitelistedApps'] = list(cur_whitelist)
                data['provisioningPackagesInstalled'] = True
                add_audit_log('DEVICE_AUTO_PACKAGES', dev_id, f"Auto-dispatched {len(auto_pkgs)} provisioning package(s) on device setup.")

            devices[dev_id] = data
            save_devices_cache(devices)

            # Get and flush pending commands for this device
            cmds = pending_commands.get(dev_id, [])
            pending_commands[dev_id] = []

            if cmds:
                add_audit_log('COMMANDS_DELIVERED', dev_id, f"Delivered {len(cmds)} commands to agent")

            self._send_json(200, {
                "status": "OK",
                "commands": cmds,
                "autoInstallPackages": auto_pkgs,
                "subscriptionActive": sub_active,
                "subscriptionMessage": sub_msg,
                "companyCode": comp_code,
                "companyName": comp_name,
                "branchId": data.get('branchId', ''),
                "branchName": data.get('branchName', ''),
                "branchCode": data.get('branchCode', ''),
                "branchNumber": data.get('branchNumber', ''),
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
                save_devices_cache(devices)

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
        # DEVICE DELETE API (Remove device from fleet registry)
        # ---------------------------------------------------------
        if path == '/api/devices/delete':
            session_token = self.headers.get('X-Tenant-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token) if session_token else None
            user_branch_id = session.get('branchId') if (session and session.get('isBranch')) else None
            user_branch_name = session.get('branchName') if (session and session.get('isBranch')) else None

            dev_id = data.get('deviceId')
            dev_ids = data.get('deviceIds')
            if not dev_ids and dev_id:
                dev_ids = [dev_id]

            if not dev_ids or not isinstance(dev_ids, list):
                self._send_json(400, {"error": "deviceId or deviceIds list is required"})
                return

            deleted_count = 0
            deleted_ids = []
            for did in dev_ids:
                if did in devices:
                    dev_info = devices.get(did, {})
                    # If branch user, only allow deleting devices within their branch
                    if user_branch_id:
                        d_branch = dev_info.get('branch') or dev_info.get('branchId') or ''
                        d_group = dev_info.get('group') or ''
                        if d_branch and d_branch not in [user_branch_id, user_branch_name] and (user_branch_name and user_branch_name not in d_group):
                            continue

                    devices.pop(did, None)
                    pending_commands.pop(did, None)
                    latest_frames.pop(did, None)
                    pending_touch_events.pop(did, None)
                    deleted_ids.append(did)
                    deleted_count += 1
                    add_audit_log('DEVICE_DELETED', did, f"Deleted device '{dev_info.get('name', did)}' ({did})")

            if deleted_count > 0:
                save_devices_cache(devices)
                self._send_json(200, {
                    "success": True,
                    "deletedCount": deleted_count,
                    "deletedIds": deleted_ids,
                    "message": f"تم حذف {deleted_count} جهاز بنجاح."
                })
            else:
                self._send_json(404, {"error": "لم يتم العثور على الأجهزة المحددة أو ليس لديك صلاحية لحذفها."})
            return

        # ---------------------------------------------------------
        # COMMAND DISPATCH
        # ---------------------------------------------------------
        if path == '/api/commands':
            session_token = self.headers.get('X-Tenant-Token')
            session = ACTIVE_TENANT_SESSIONS.get(session_token) if session_token else None

            dev_id = data.get('deviceId')
            command = data.get('command')
            raw_payload = data.get('payload') or data.get('params') or {}
            payload = dict(raw_payload) if isinstance(raw_payload, dict) else {}
            # Merge any top-level parameter fields passed directly
            for k, v in data.items():
                if k not in ('deviceId', 'command', 'payload', 'params') and k not in payload:
                    payload[k] = v

            if not dev_id or not command:
                self._send_json(400, {"error": "Missing deviceId or command"})
                return

            # Normalize Kiosk exit commands
            is_kiosk_disable = False
            if command in ('EXIT_KIOSK', 'STOP_KIOSK', 'DISABLE_KIOSK'):
                is_kiosk_disable = True
                payload['enable'] = False
                payload['enabled'] = False
                command = 'SET_KIOSK_MODE'
            elif command == 'SET_KIOSK_MODE':
                enable_val = payload.get('enable')
                if enable_val is None:
                    enable_val = payload.get('enabled')
                if enable_val is False:
                    is_kiosk_disable = True
                    payload['enable'] = False
                    payload['enabled'] = False

            # SECURITY ENFORCEMENT: If caller is a Branch Web Admin:
            # Branches CANNOT exit Kiosk mode! (User specified: رمز الأدمن يكون فقط لدى الشركة الرئيسية يعني الافرع ما يقدرون يفكون الكشك)
            if session and session.get('isBranch'):
                bid = str(session.get('branchId', '')).strip()
                bnum = str(session.get('branchNumber', '')).strip()
                branch_identifiers = {x for x in (bid, bnum) if x}

                if dev_id != 'ALL':
                    target_dev = devices.get(dev_id)
                    if not target_dev:
                        self._send_json(404, {"error": "الجهاز غير موجود في النظام."})
                        return
                    d_branch = {str(target_dev.get('branchId', '')).strip(), str(target_dev.get('branchCode', '')).strip(), str(target_dev.get('branchNumber', '')).strip()}
                    if not (branch_identifiers & d_branch):
                        self._send_json(403, {"error": "غير مصرح لمدير الفرع بالتحكم بأجهزة خارج فرعه."})
                        return

                if is_kiosk_disable:
                    self._send_json(403, {
                        "error": "غير مصرح لمدراء الفروع بإلغاء وضع الكشك. هذه الصلاحية محصورة بالإدارة العامة للشركة فقط."
                    })
                    return
                if command in ['WIPE_DEVICE', 'SET_ADMIN_PIN']:
                    self._send_json(403, {
                        "error": "غير مصرح لمدراء الفروع بتنفيذ هذا الإجراء الأمني الحساس."
                    })
                    return

            if command == 'SET_WHITELIST':
                raw_pkgs = payload.get('packages', [])
                expanded_pkgs = expand_whitelist_aliases(raw_pkgs)
                payload['packages'] = expanded_pkgs

            cmd_obj = dict(payload)
            cmd_obj['command'] = command
            cmd_obj['timestamp'] = int(time.time() * 1000)

            # Mirror interactive touch & screen control commands directly into real-time pending_touch_events
            if dev_id != 'ALL':
                if command in ('TOUCH_CLICK', 'TAP'):
                    x_val = float(payload.get('xRatio', payload.get('x', 0.5)))
                    y_val = float(payload.get('yRatio', payload.get('y', 0.5)))
                    pending_touch_events.setdefault(dev_id, []).append({
                        "action": "tap",
                        "xRatio": x_val,
                        "yRatio": y_val
                    })
                elif command in ('SWIPE', 'DRAG'):
                    pending_touch_events.setdefault(dev_id, []).append({
                        "action": "swipe",
                        "startXRatio": float(payload.get('startXRatio', 0.5)),
                        "startYRatio": float(payload.get('startYRatio', 0.8)),
                        "endXRatio": float(payload.get('endXRatio', 0.5)),
                        "endYRatio": float(payload.get('endYRatio', 0.2)),
                        "duration": int(payload.get('duration', 300))
                    })
                elif command in ('SEND_KEY', 'KEY'):
                    pending_touch_events.setdefault(dev_id, []).append({
                        "action": "key",
                        "key": payload.get('key', 'BACK')
                    })
                elif command in ('WAKE_SCREEN', 'WAKE_DEVICE', 'UNLOCK_SCREEN', 'UNLOCK_DEVICE', 'LOCK_SCREEN'):
                    act = 'wake' if 'WAKE' in command else ('unlock' if 'UNLOCK' in command else 'lock')
                    pending_touch_events.setdefault(dev_id, []).append({"action": act})

            if dev_id == 'ALL':
                target_ids = []
                if session and session.get('isBranch'):
                    bid = str(session.get('branchId', '')).strip()
                    bnum = str(session.get('branchNumber', '')).strip()
                    branch_identifiers = {x for x in (bid, bnum) if x}
                    for did, d in devices.items():
                        d_branch = {str(d.get('branchId', '')).strip(), str(d.get('branchCode', '')).strip(), str(d.get('branchNumber', '')).strip()}
                        if branch_identifiers & d_branch:
                            target_ids.append(did)
                else:
                    target_ids = list(devices.keys())

                for did in target_ids:
                    pending_commands.setdefault(did, []).append(cmd_obj)
                add_audit_log('BROADCAST_COMMAND', 'ALL_DEVICES', f"Dispatched: {command} to {len(target_ids)} devices")
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

                adb_bin = find_adb_executable()
                if adb_bin and os.path.exists(adb_bin):
                    try:
                        subprocess.run([
                            adb_bin, 'shell', 'am', 'start',
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
            pkg_name = (data.get('packageName') or '').strip()
            auto_whitelist = bool(data.get('autoWhitelist', False))

            if not apk_url:
                self._send_json(400, {"error": "APK download URL required"})
                return

            # Auto-resolve real package name from local downloaded APK if omitted or generic
            if not pkg_name or pkg_name in ('ota_update_app', 'ota_app', 'managed_app'):
                url_fname = os.path.basename(urllib.parse.urlparse(apk_url).path)
                local_apk = os.path.join(DOWNLOADS_DIR, url_fname)
                if os.path.isfile(local_apk):
                    extracted = extract_apk_package_name(local_apk)
                    if extracted:
                        pkg_name = extracted

            if not pkg_name:
                pkg_name = 'ota_update_app'

            install_cmd = {
                "command": "INSTALL_APK_FROM_URL",
                "url": apk_url,
                "package_name": pkg_name,
                "auto_whitelist": auto_whitelist,
                "timestamp": int(time.time() * 1000)
            }

            target_device_ids = list(devices.keys()) if dev_id == 'ALL' else ([dev_id] if dev_id in devices else [dev_id])
            is_valid_pkg = bool(pkg_name and pkg_name not in ('ota_update_app', 'ota_app', 'managed_app'))

            for did in target_device_ids:
                pending_commands.setdefault(did, []).append(install_cmd)

                if auto_whitelist and is_valid_pkg:
                    if did in devices:
                        current_pkgs = list(devices[did].get('whitelistedApps', []))
                        if current_pkgs:
                            if pkg_name not in current_pkgs:
                                current_pkgs.append(pkg_name)
                                devices[did]['whitelistedApps'] = current_pkgs
                            whitelist_cmd = {
                                "command": "SET_WHITELIST",
                                "packages": current_pkgs,
                                "timestamp": int(time.time() * 1000)
                            }
                            pending_commands.setdefault(did, []).append(whitelist_cmd)
                        else:
                            # If no previous whitelist cache on server, don't overwrite device whitelist;
                            # let device's InstallStatusReceiver auto-add the package safely.
                            devices[did]['whitelistedApps'] = [pkg_name]

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

            # 1. Enqueue action for remote cloud device delivery (via screen-frame)
            queue = pending_touch_events.setdefault(dev_id, [])
            if len(queue) < 10:
                queue.append(data)

            # 1.5 Also mirror high-priority power/screen actions directly into heartbeat command queue
            if action in ('wake', 'wake_screen'):
                cmd_q = pending_commands.setdefault(dev_id, [])
                if not any(c.get('command') == 'WAKE_SCREEN' for c in cmd_q):
                    cmd_q.append({"command": "WAKE_SCREEN"})
            elif action in ('unlock', 'unlock_screen'):
                cmd_q = pending_commands.setdefault(dev_id, [])
                if not any(c.get('command') == 'UNLOCK_SCREEN' for c in cmd_q):
                    cmd_q.append({"command": "UNLOCK_SCREEN"})
            elif action in ('lock', 'lock_screen'):
                cmd_q = pending_commands.setdefault(dev_id, [])
                if not any(c.get('command') == 'LOCK_SCREEN' for c in cmd_q):
                    cmd_q.append({"command": "LOCK_SCREEN"})

            # 2. Local ADB fallback (if device is plugged into local computer)
            adb_path = find_adb_executable()
            if adb_path:
                import subprocess
                try:
                    if action == 'tap':
                        x_ratio = float(data.get('xRatio', 0.5))
                        y_ratio = float(data.get('yRatio', 0.5))
                        if y_ratio >= 0.905:
                            if x_ratio < 0.36:
                                subprocess.run([adb_path, 'shell', 'input', 'keyevent', '4'], timeout=2) # BACK
                            elif x_ratio > 0.64:
                                subprocess.run([adb_path, 'shell', 'input', 'keyevent', '187'], timeout=2) # RECENTS
                            else:
                                subprocess.run([adb_path, 'shell', 'input', 'keyevent', '3'], timeout=2) # HOME
                        else:
                            px_w = int(data.get('displayWidth', 1440))
                            px_h = int(data.get('displayHeight', 3120))
                            target_x = max(0, min(px_w, int(px_w * x_ratio)))
                            target_y = max(0, min(px_h, int(px_h * y_ratio)))
                            subprocess.run([adb_path, 'shell', 'input', 'tap', str(target_x), str(target_y)], timeout=2)
                    elif action in ('swipe', 'drag'):
                        px_w = int(data.get('displayWidth', 1080))
                        px_h = int(data.get('displayHeight', 2340))
                        dur = int(data.get('duration', 250))
                        if 'startXRatio' in data and 'endXRatio' in data:
                            s_x = max(0, min(px_w, int(px_w * float(data['startXRatio']))))
                            s_y = max(0, min(px_h, int(px_h * float(data['startYRatio']))))
                            e_x = max(0, min(px_w, int(px_w * float(data['endXRatio']))))
                            e_y = max(0, min(px_h, int(px_h * float(data['endYRatio']))))
                            subprocess.run([adb_path, 'shell', 'input', 'swipe', str(s_x), str(s_y), str(e_x), str(e_y), str(dur)], timeout=2)
                        else:
                            direction = data.get('direction', 'up')
                            if direction == 'up':
                                subprocess.run([adb_path, 'shell', 'input', 'swipe', str(int(px_w * 0.5)), str(int(px_h * 0.88)), str(int(px_w * 0.5)), str(int(px_h * 0.18)), str(dur)], timeout=2)
                            elif direction == 'down':
                                subprocess.run([adb_path, 'shell', 'input', 'swipe', str(int(px_w * 0.5)), str(int(px_h * 0.18)), str(int(px_w * 0.5)), str(int(px_h * 0.85)), str(dur)], timeout=2)
                            elif direction == 'left':
                                subprocess.run([adb_path, 'shell', 'input', 'swipe', str(int(px_w * 0.85)), str(int(px_h * 0.5)), str(int(px_w * 0.15)), str(int(px_h * 0.5)), str(dur)], timeout=2)
                            elif direction == 'right':
                                subprocess.run([adb_path, 'shell', 'input', 'swipe', str(int(px_w * 0.15)), str(int(px_h * 0.5)), str(int(px_w * 0.85)), str(int(px_h * 0.5)), str(dur)], timeout=2)
                    elif action == 'key':
                        key_name = data.get('key', 'BACK')
                        key_map = {
                            'BACK': '4',
                            'KEYCODE_BACK': '4',
                            'HOME': '3',
                            'KEYCODE_HOME': '3',
                            'RECENTS': '187',
                            'KEYCODE_APP_SWITCH': '187',
                            'SEARCH': '84',
                            'KEYCODE_SEARCH': '84',
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
                except Exception:
                    pass

            self._send_json(200, {"success": True, "action": action, "queued": True})
            return

        self._send_json(404, {"error": "Not Found"})

    def log_message(self, format, *args):
        pass

def run():
    server_address = ('0.0.0.0', PORT)
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(server_address, NexusAdminHandler)
    print("====================================================")
    print(f" JIB MobiControl Master Server is running!")
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
