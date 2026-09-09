# NEXUS MDM — Enterprise REST API & Protocol Specification
**Document Version:** 2.0.0  
**Base URL:** `https://your-domain.com/api` (Local Dev: `http://localhost:3000/api`)

---

## 1. Authentication & Headers

| Header | Description | Required By |
|---|---|---|
| `Content-Type` | `application/json` | All POST/PUT requests |
| `X-Developer-Token` | Developer master management token | Super Admin endpoints (`/api/developer/*`) |
| `X-Tenant-Token` | Tenant / Branch session token | Company Web Admin & Branch endpoints |

---

## 2. Core Device Management Endpoints

### 2.1 Agent Heartbeat & Telemetry Ingestion
* **Endpoint:** `POST /api/devices/heartbeat`
* **Description:** Ingests hardware telemetry, location, Honeywell capabilities, and returns queued remote commands.
* **Request Payload:**
```json
{
  "id": "HONEYWELL_CT47_7A89F1",
  "name": "Warehouse-Scanner-01",
  "model": "Honeywell CT47",
  "oem": "Honeywell",
  "os": "Android 13 (API 33)",
  "battery": 88,
  "isCharging": false,
  "temperature": 28.5,
  "batteryHealth": "Good",
  "powerSource": "Battery",
  "ramUsedPercent": 42,
  "storageUsedPercent": 31,
  "isKiosk": true,
  "isRooted": false,
  "integrityScore": "SECURE (PASSED)",
  "ipAddress": "192.168.1.145",
  "companyCode": "NEXUS-DEFAULT",
  "capabilities": {
    "oem": "Honeywell",
    "model": "CT47",
    "mobilityEdgeGeneration": "Mobility Edge Gen 3 (Qualcomm QCM4490)",
    "kioskSupported": "SUPPORTED",
    "scannerSupported": "SUPPORTED",
    "oemConfigSupported": "SUPPORTED"
  },
  "location": {
    "lat": 33.3152,
    "lng": 44.3661,
    "accuracy": 4.5,
    "speed": 0.0,
    "timestamp": 1725883200000,
    "isMock": false
  }
}
```

---

## 3. Remote Command Engine

### 3.1 Dispatch Command
* **Endpoint:** `POST /api/commands`
* **Supported Commands:**
  - `REBOOT_DEVICE`: Reboots target device via Device Owner API.
  - `SET_KIOSK_MODE`: `{"enable": true/false}`
  - `SET_WHITELIST`: `{"packages": ["com.android.calculator2", "com.google.android.apps.photos"]}`
  - `SET_PERIPHERALS`: `{"cameraDisabled": true, "screenCaptureDisabled": true}`
  - `SYNC_TIME`: `{"timestamp": 1725883200000, "timeZone": "Asia/Baghdad"}`
  - `WIPE_DEVICE`: Factory resets device.
  - `SET_ADMIN_PIN`: Updates technician maintenance PIN.

---

## 4. Multi-Tenant & Branch Endpoints

* `POST /api/developer/login`: Authenticates system developer / super admin.
* `GET /api/tenants`: Returns list of managed companies and subscription states.
* `POST /api/tenants`: Provisions a new enterprise tenant.
* `POST /api/tenants/branches`: Adds an operational branch under a parent tenant.
* `GET /api/devices`: Returns devices bound to caller's tenant/branch.
* `GET /api/audit-logs`: Returns tamper-evident audit logs.
