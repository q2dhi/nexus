# NEXUS MDM — Enterprise Kiosk Engine & Admin Exit Specification
**Document Classification:** Mission-Critical Reliability  
**Target Platform:** Android Enterprise COSU & Dedicated Kiosk Environments

---

## 1. Kiosk State Machine Architecture

Nexus MDM implements a deterministic state machine to govern all dedicated kiosk transitions:

```text
┌──────────────┐
│    NORMAL    │
└──────┬───────┘
       │ Provisioning / Enrollment
       ▼
┌──────────────┐
│  ENROLLING   │
└──────┬───────┘
       │ Policy Sync Completed
       ▼
┌──────────────┐
│   MANAGED    │ ◄─────────────────────────────────────────────┐
└──────┬───────┘                                               │
       │ Apply Kiosk Policy                                    │
       ▼                                                       │
┌──────────────┐                                               │
│    KIOSK     │ ──[ Admin Multi-Tap / Button ]──┐             │
└──────────────┘                                 │             │
       ▲                                         ▼             │
       │ Authentication Failed        ┌──────────────────────┐ │
       └───────────────────────────── │ ADMIN_AUTHENTICATION │ │
                                      └──────────┬───────────┘ │
                                                 │ Valid PIN   │
                                                 ▼             │
                                      ┌──────────────────────┐ │
                                      │      EXIT_KIOSK      │─┘
                                      └──────────────────────┘
```

---

## 2. Priority 0: The Kiosk Exit Fix

### 2.1 The Problem
On Honeywell enterprise devices (CT47, CT45, CT40, CK65), entering the correct Admin PIN previously left the device trapped in Kiosk mode or in a black screen loop.

### 2.2 The Solution (The 5-Step Atomic Teardown)
When an authorized Admin PIN is validated:
```kotlin
// Step 1: Stop LockTask mode on the active Activity
activity.stopLockTask()

// Step 2: Delegate to OEM Provider to release hardware-level restrictions
oemProvider.onExitKiosk(context, dpm, adminComponent)

// Step 3: Clear LockTask whitelist array to allow ALL system packages
dpm.setLockTaskPackages(adminComponent, arrayOf())

// Step 4: Clear persistent default Home launcher preference
dpm.clearPackagePersistentPreferredActivities(adminComponent, context.packageName)

// Step 5: Restore system UI, status bar, and keyguard
dpm.setStatusBarDisabled(adminComponent, false)
dpm.setKeyguardDisabled(adminComponent, false)

// Step 6: Explicitly launch OEM Home Launcher (Honeywell Enterprise Launcher / AOSP)
kioskManager.launchStockAndroidHome(activity)
```

---

## 3. Admin PIN Security & Brute-Force Defense

* **Cryptographic Hashing:** PINs are stored as Salted SHA-256 hashes generated with secure nonces (`SecureRandom`).
* **Anti-Brute Force Lockout:** 
  - 3 failed attempts: Warning issued.
  - 5 failed attempts: 60-second hardware-backed security lockout.
* **Security Audit Events:** Every attempt logs a timestamped event:
  - `KIOSK_EXIT_ATTEMPT`
  - `KIOSK_EXIT_SUCCESS`
  - `KIOSK_EXIT_FAILURE`
  - `KIOSK_EXIT_LOCKOUT`

---

## 4. Boot & Recovery Resilience

If the device reboots, battery drains, or the agent process restarts while Kiosk mode was active:
1. `BootReceiver` triggers upon `ACTION_BOOT_COMPLETED`.
2. Reads cached policy from `SecureConfigStore`.
3. If `isKioskEnabled == true`, transitions directly to `KIOSK` state.
4. Relaunches `MainActivity` in LockTask mode without requiring an active internet connection.
