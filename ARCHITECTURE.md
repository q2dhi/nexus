# NEXUS MDM — Enterprise System Architecture & Engineering Specification
**Target Platform:** Honeywell-First Enterprise Mobile Device Management (MDM/EMM)  
**Version:** 2.0.0 (Enterprise Rebuild)  
**Classification:** Enterprise IT & Carrier-Grade Mobility

---

## 1. High-Level Architectural Topology

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         WEB ADMIN COMMAND CENTER                               │
│  - Multi-Tenant Isolation & Role-Based Access Control (RBAC)                   │
│  - Device Fleet Explorer & Command Dispatch Engine                             │
│  - Geofence & Real-Time Perimeter Enforcement Engine                           │
│  - Honeywell Hardware & Mobility Edge Capability Matrix                        │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │ HTTPS (TLS 1.3) / WebSockets / JSON
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                      NEXUS ANDROID ENTERPRISE AGENT                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                            Nexus MDM Core                                │  │
│  │  - Policy Manager Helper (DPM / Device Owner / AdminReceiver)            │  │
│  │  - Kiosk State Machine (NORMAL → ENROLLING → MANAGED → KIOSK → EXIT)     │  │
│  │  - Hardware Telemetry & Zero-Trust Tamper Guard Subsystem                │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      │                                         │
│                                      ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                         OEM Abstraction Layer                            │  │
│  │       (OemProvider Interface / Dynamic Capability Discovery)             │  │
│  └───────┬───────────────────────────┬──────────────────────────┬───────────┘  │
│          │                           │                          │              │
│          ▼                           ▼                          ▼              │
│  ┌───────────────────────┐   ┌───────────────┐   ┌──────────────────────────┐  │
│  │   HoneywellProvider   │   │ ZebraProvider │   │  GenericAndroidProvider  │  │
│  │  (Primary OEM Engine) │   │  (Zebra MX)   │   │  (AOSP / DO Standard)    │  │
│  └───────┬───────────────┘   └───────────────┘   └──────────────────────────┘  │
│          │                                                                     │
│          ▼                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                     Honeywell Hardware Subsystems                        │  │
│  │  - Mobility Edge Architecture (CT47, CT45, CT40, CT60, CK65, EDA52)      │  │
│  │  - Integrated Barcode Scanner Engine (Broadcast & Keycode Triggers)      │  │
│  │  - Honeywell OEMConfig / UEMConnect Managed Configurations               │  │
│  │  - Honeywell Enterprise Launcher Lockdown & Release Handlers             │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Pillars

### 2.1 Honeywell-First OEM Abstraction
Nexus MDM isolates OEM-specific SDKs, hardware broadcast intents, and proprietary configuration schemas behind the unified `OemProvider` interface. Honeywell is the Tier-1 Primary OEM with first-class support for:
- Mobility Edge platforms (Gen 1 through Gen 3)
- Physical scanner triggers (Keycodes 241, 242, 243, 244, 293, 294)
- Intent-based Barcode Decoder broadcasts (`com.honeywell.decode.intent.action.EDIT_DATA`)
- OEMConfig / UEMConnect Managed Configurations
- Clean LockTask containment without system launcher collision

### 2.2 Kiosk State Machine & Escape Lifecycle
The Kiosk engine operates under a deterministic state machine:
```text
NORMAL ──> ENROLLING ──> MANAGED ──> KIOSK ──> ADMIN_AUTH ──> EXIT_KIOSK ──> MANAGED / NORMAL
```
- LockTask whitelist assignment and release are atomic.
- Persistent preferred home activities are cleared on exit, enabling instant handoff to Honeywell Enterprise Launcher or stock AOSP launcher.

### 2.3 Carrier-Grade Multi-Tenancy & RBAC
- Every tenant's devices, policies, and audit trails are strictly isolated server-side.
- Granular permissions prevent unauthorized actions (e.g. Branch managers are cryptographically restricted from unlocking Kiosk mode or wiping devices).

### 2.4 Offline-First Resilience
- Encrypted local cache for policies and credentials (`EncryptedSharedPreferences` with AES-256 GCM).
- Persistent queue for telemetry snapshots and offline command acknowledgments.
