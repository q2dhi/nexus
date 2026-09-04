# Nexus Enterprise DPC (Device Policy Controller)

[![Android](https://img.shields.io/badge/Platform-Android%2014%20(API%2034)-3DDC84.svg?style=flat&logo=android)](https://developer.android.com)
[![Kotlin](https://img.shields.io/badge/Language-Kotlin%201.9-7F52FF.svg?style=flat&logo=kotlin)](https://kotlinlang.org)
[![Enterprise](https://img.shields.io/badge/Android%20Enterprise-Device%20Owner%20%2F%20COSU-0052CC.svg?style=flat)](https://developers.google.com/android/work)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20Local%20Architecture-00C853.svg?style=flat)]()

**Nexus** (`com.nexus.mdm.agent`) is an enterprise-grade Android Device Policy Controller (DPC) engineered for dedicated device management (COSU), zero-touch kiosk enforcement, and unattended silent application deployments.

---

## Architectural & Security Overview

### 1. Zero-Trust Local Architecture
- **Strict Export Policies**: All internal Activities, Services, and Receivers specify `android:exported="false"`. The only exported component is `NexusAdminReceiver`, which is strictly guarded with the system-level `android.permission.BIND_DEVICE_ADMIN` permission.
- **Internal IPC Guard**: Internal broadcasts (`InstallStatusReceiver`) use explicit Intents and require the custom signature permission `com.nexus.mdm.agent.permission.INTERNAL_IPC`.
- **Zero Data Leakage**: Backup extraction is completely suppressed via `android:allowBackup="false"`.

### 2. Enterprise Device Administration (Device Owner)
- **`NexusAdminReceiver`**: Inherits from `DeviceAdminReceiver` and implements `onProfileProvisioningComplete` to immediately initialize enterprise baseline policies upon QR/NFC enrollment.
- **Defensive API Invocations**: `PolicyManagerHelper` guards every privileged call with `dpm.isDeviceOwnerApp()` to prevent `SecurityException` crashes when running in unprovisioned states.
- **Baseline Policy Profile**: Automatically disables factory reset (`DISALLOW_FACTORY_RESET`), safe boot (`DISALLOW_SAFE_BOOT`), USB file transfer (`DISALLOW_USB_FILE_TRANSFER`), physical media mounting (`DISALLOW_MOUNT_PHYSICAL_MEDIA`), and forces automated time and timezone synchronization.

### 3. Kiosk Mode & COSU Locks (Dedicated Device Engine)
- **`KioskManager`**: Binds to `DevicePolicyManager` to whitelist authorized packages via `setLockTaskPackages()` and configure strict features via `setLockTaskFeatures()`.
- **System UI Suppression**: Disables keyguard (`setKeyguardDisabled`) and status bar pull-downs (`setStatusBarDisabled`).
- **Cryptographic Field Escape Hatch (`SecurityEscapeHatch`)**:
  - Activated by a timed 5-tap sequence within 2.5 seconds on the Nexus shield icon.
  - Generates a dynamic challenge session nonce.
  - Verifies technician input using salted SHA-256 with constant-time byte comparison (`slowEquals`) to defeat timing attacks.
  - **Anti-Brute Force**: Enforces a 60-second hardware lockout after 3 consecutive failed attempts.
  - *Default Technician PIN*: `849201` (Salt: `NEXUS_MDM_SALT_2026`).

### 4. Silent Package Installer Engine (No UI Interference)
- **`SilentInstaller`**: Asynchronously streams APK binaries into a `PackageInstaller.Session` using Kotlin coroutines on `Dispatchers.IO`.
- **Android 12+ Optimization**: Declares `setRequireUserAction(USER_ACTION_NOT_REQUIRED)` to instruct the OS that the Device Owner has pre-authorized the installation without user interaction.
- **`InstallStatusReceiver`**: Dedicated broadcast receiver resolving exact status codes (`STATUS_SUCCESS`, `STATUS_FAILURE_STORAGE`, `STATUS_FAILURE_CONFLICT`, `STATUS_FAILURE_INVALID`) and dispatching live audit logs.

### 5. Resilience & Battery Management
- **`NexusKeepAliveService`**: Persistent foreground service with `START_STICKY` lifecycle and Android 14 `foregroundServiceType="systemExempted"`.
- **Doze / Battery Whitelisting**: Automated checks for `PowerManager.isIgnoringBatteryOptimizations()`.
- **Self-Healing Lifecycle**: Monitors `onTaskRemoved()` and re-triggers service resurrection via `AlarmManager` and `BootReceiver`.

---

## Provisioning Guide

### Method A: ADB Command (Development & Testing)
To grant full Device Owner privileges on a factory-reset or clean device via ADB:

```bash
# 1. Build and install the APK
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 2. Assign Device Owner role
adb shell dpm set-device-owner com.nexus.mdm.agent/.admin.NexusAdminReceiver
```

> [!NOTE]
> Ensure no user accounts (Google, email, etc.) exist on the device prior to running the `set-device-owner` command, or Android will reject the request.

---

### Method B: QR Code Provisioning (Zero-Touch Production)
For production deployments, generate a provisioning QR code containing the following JSON bundle:

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.nexus.mdm.agent/.admin.NexusAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://your-mdm-server.com/nexus-agent.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "YOUR_SHA256_CERT_CHECKSUM_IN_BASE64",
  "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "server_url": "https://api.nexus-mdm.net/v1",
    "kiosk_package": "com.nexus.mdm.agent"
  }
}
```

---

## Project Structure

```
NexusDPC/
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/nexus/mdm/agent/
│       │   ├── NexusApp.kt                      # Application lifecycle & notification channels
│       │   ├── admin/
│       │   │   ├── NexusAdminReceiver.kt        # Enterprise DeviceAdminReceiver
│       │   │   └── PolicyManagerHelper.kt       # Privilege-safe DPM wrapper
│       │   ├── kiosk/
│       │   │   ├── KioskManager.kt              # LockTask & COSU engine
│       │   │   └── SecurityEscapeHatch.kt       # Multi-tap salted cryptographic unlock
│       │   ├── installer/
│       │   │   ├── SilentInstaller.kt           # Asynchronous PackageInstaller pipeline
│       │   │   └── InstallStatusReceiver.kt     # Commit status callback receiver
│       │   ├── service/
│       │   │   ├── NexusKeepAliveService.kt     # Persistent START_STICKY foreground service
│       │   │   └── BootReceiver.kt              # Auto-recovery boot receiver
│       │   ├── ui/
│       │   │   └── MainActivity.kt              # Modern MDM agent dashboard & kiosk surface
│       │   └── util/
│       │       ├── CryptoUtils.kt               # Constant-time hashing & nonce generators
│       │       └── AppLogger.kt                 # Enterprise audit event queue & StateFlow
│       └── res/
│           ├── layout/
│           │   ├── activity_main.xml            # Sleek Dark MDM console layout
│           │   └── dialog_escape_hatch.xml      # Field technician PIN challenge dialog
│           ├── values/
│           │   ├── colors.xml                   # Enterprise slate/cyan/green palette
│           │   ├── strings.xml                  # Enterprise strings & descriptions
│           │   └── themes.xml                   # Dark enterprise theme
│           ├── drawable/                        # Vector icons (shield, kiosk, install)
│           └── xml/
│               └── device_admin_policies.xml    # Device Admin policies declaration
├── gradle/wrapper/
│   └── gradle-wrapper.properties
├── build.gradle.kts                             # Root build script
├── settings.gradle.kts                          # Root settings
├── gradle.properties                            # JVM & AndroidX settings
├── gradlew.bat                                  # Windows Gradle wrapper
└── README.md
```
