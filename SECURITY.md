# NEXUS MDM — Enterprise Security & Compliance Policy
**Document Classification:** Zero-Trust Enterprise Security  
**Version:** 2.0.0

---

## 1. Zero-Trust Security Model

Nexus MDM is engineered according to Zero-Trust and Defense-in-Depth principles:
* **Server-Side Authorization:** All permission checks (`devices.read`, `devices.write`, `devices.command`, `policies.write`) are validated on the backend. Frontend controls are purely visual conveniences.
* **Strict Tenant & Branch Isolation:** Cross-tenant IDOR vectors are mitigated through session-bound context checks. Branch administrators cannot modify global enterprise policies or disengage Kiosk mode.

---

## 2. Cryptographic Architecture

### 2.1 Hardware-Backed Key Storage
* Administrative secrets, custom PIN hashes, and server tokens are stored in Android's `EncryptedSharedPreferences` backed by `MasterKey` with AES-256 GCM encryption.
* Field technician escape PINs are verified using constant-time comparisons (`CryptoUtils.slowEquals`) against Salted SHA-256 hashes to prevent timing attacks.

### 2.2 Provisioning Security
* Android Enterprise QR Code enrollments include the `android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM` matching the SHA-256 fingerprint of the signing certificate.
* Prevents unauthorized or rogue APK injection during factory reset provisioning.

---

## 3. Anti-Tamper & Integrity Audits

The agent continuously performs zero-trust integrity audits:
* Checks for `su` binaries across 8 critical system paths (`/system/bin/su`, `/system/xbin/su`, `/data/local/su`, etc.).
* Inspects `Build.TAGS` for custom ROM indicators (`test-keys`).
* Monitors unauthorized attempts to disable Device Administrator or bypass Kiosk mode.
* When tampering is detected, the agent triggers `AntiTamperGuard`, captures location, sounds an audible siren, and reports the breach to the Web Admin console.

---

## 4. Secrets & Git Repository Hygiene

* No production passwords, private keys, JWT secrets, or unhashed PINs are checked into version control.
* Default test configurations use environment variable overrides in production environments.
