# Nexus MDM — Honeywell-First Enterprise Device Management Platform

[![Android](https://img.shields.io/badge/Platform-Android%20Enterprise%20(API%2028--34)-3DDC84.svg?style=flat&logo=android)](https://developer.android.com)
[![Honeywell](https://img.shields.io/badge/OEM-Honeywell%20Mobility%20Edge%20(Primary)-E11A22.svg?style=flat)]()
[![Kotlin](https://img.shields.io/badge/Language-Kotlin%201.9-7F52FF.svg?style=flat&logo=kotlin)](https://kotlinlang.org)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20Multi--Tenant-00C853.svg?style=flat)]()

**Nexus MDM** is a carrier-grade, **Honeywell-First Enterprise Mobile Device Management (MDM/EMM) Platform** engineered for dedicated device management (COSU), high-performance barcode scanning, zero-touch provisioning, and multi-tenant cloud orchestration.

---

## 🍯 Honeywell Enterprise Hardware Integration (Primary OEM)

Nexus MDM treats Honeywell as its primary enterprise tier with native support across the **Honeywell Mobility Edge** ecosystem:

* **Supported Hardware:** Honeywell CT47, CT45, CT45 XP, CT40, CT40 XP, CT60, CK65, EDA52, EDA51, CN80.
* **Integrated Hardware Barcode Scanner:** Intent-based broadcast listener (`com.honeywell.decode.intent.action.EDIT_DATA`) and physical scan trigger keys (Keycodes 241, 242, 243, 244, 293, 294).
* **Honeywell OEMConfig / UEMConnect:** Managed Configurations for advanced peripheral control, keypad remapping, touch/glove modes, and enterprise Wi-Fi roaming.
* **OEM Abstraction Layer:** Extensible architecture supporting `HoneywellProvider` (Primary), `ZebraProvider`, `SamsungProvider`, and `GenericAndroidProvider`.

---

## 🔒 Enterprise Kiosk Engine & Admin Escape Hatch

Nexus MDM implements a deterministic, fail-safe Kiosk State Machine:

```text
NORMAL ──> ENROLLING ──> MANAGED ──> KIOSK ──> ADMIN_AUTH ──> EXIT_KIOSK ──> MANAGED / NORMAL
```

* **Priority 0 Kiosk Exit Fix:** Guaranteed, deterministic release of LockTask mode, clearing of persistent default home preferences, and graceful handoff to the Honeywell Enterprise Launcher or stock AOSP launcher.
* **Salted SHA-256 PIN Security:** Administrative maintenance PINs are protected with dynamic nonces, constant-time verification, and anti-brute force lockouts (5 failed attempts = 60s security lockout).
* **Multi-App Whitelisting:** Seamless containment of authorized business applications inside LockTask mode with suppressed system notification panels.

---

## 💻 Web Admin Console (No AI Slop — Pure Enterprise)

* **Design System:** High-density, professional Slate design tokens (`#0F172A`, `#1E293B`, `#334155`) with Inter & Cairo typography.
* **Device 360 View:** Live gauges for Battery health & temperature, RAM, Storage, Cellular/Wi-Fi, and a dedicated **Honeywell Mobility Edge** hardware tab.
* **Multi-Tenancy & RBAC:** Strict tenant and branch isolation preventing cross-tenant access and restricting branch managers from sensitive actions.
* **Command Lifecycle Engine:** Full tracking of remote commands (`PENDING` ➔ `SENT` ➔ `ACKNOWLEDGED` ➔ `EXECUTING` ➔ `SUCCESS`/`FAILED`).

---

## 📚 Complete Enterprise Documentation

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](file:///Users/hasan/Desktop/nexus-main/ARCHITECTURE.md) | Full architectural topology, layers, and communication flow |
| [ARCHITECTURE_AUDIT.md](file:///Users/hasan/Desktop/nexus-main/ARCHITECTURE_AUDIT.md) | Forensic audit, root cause analysis of legacy issues & fixes |
| [HONEYWELL.md](file:///Users/hasan/Desktop/nexus-main/HONEYWELL.md) | Comprehensive Honeywell Mobility Edge hardware guide |
| [KIOSK.md](file:///Users/hasan/Desktop/nexus-main/KIOSK.md) | Kiosk State Machine, LockTask APIs & escape lifecycle |
| [SECURITY.md](file:///Users/hasan/Desktop/nexus-main/SECURITY.md) | Zero-Trust security model, encryption, and RBAC matrix |
| [API.md](file:///Users/hasan/Desktop/nexus-main/API.md) | REST API specification, schemas, and endpoints |
| [DEPLOYMENT.md](file:///Users/hasan/Desktop/nexus-main/DEPLOYMENT.md) | Production cloud & on-premises deployment instructions |
| [TESTING.md](file:///Users/hasan/Desktop/nexus-main/TESTING.md) | Automated testing matrices & QA verification guidelines |
| [ROADMAP.md](file:///Users/hasan/Desktop/nexus-main/ROADMAP.md) | Milestone tracking and future product development |

---

## 🚀 Quick Start

### 1. Start Web Admin Server
```bash
cd web-admin
python3 server.py
```
Open `http://localhost:3000` in your browser.

### 2. Run Automated Test Suite
```bash
cd web-admin
python3 run_all_tests.py
```

### 3. Build Android Agent APK
```bash
./gradlew assembleDebug
```
Output APK is created at `app/build/outputs/apk/debug/app-debug.apk`.
