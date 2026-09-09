# NEXUS MDM — Honeywell Enterprise Hardware Integration Guide
**Focus Platform:** Honeywell Mobility Edge & ScanPal Enterprise Computers  
**Version:** 2.0.0 (Honeywell-First Architecture)

---

## 1. Supported Honeywell Devices & Compatibility Matrix

| Model | Platform / Architecture | Scanner Engine | Kiosk Support | OEMConfig | Recommended OS |
|---|---|---|---|---|---|
| **Honeywell CT47** | Mobility Edge Gen 3 (QCM4490) | FlexRange XLR / N6803 | Fully Supported (DO LockTask) | `com.honeywell.oemconfig` | Android 12 / 13 / 14 |
| **Honeywell CT45 / CT45 XP** | Mobility Edge Gen 3 (QCS4290) | FlexRange / N6703 | Fully Supported (DO LockTask) | `com.honeywell.oemconfig` | Android 11 / 12 / 13 |
| **Honeywell CT40 / CT40 XP** | Mobility Edge Gen 1/2 (SD660) | N6703 / N3601 | Fully Supported (DO LockTask) | `com.honeywell.uemconnect` | Android 10 / 11 |
| **Honeywell CK65** | Mobility Edge Gen 1/2 (SD660) | EX20 Near/Far / N6703 | Fully Supported (DO LockTask) | `com.honeywell.uemconnect` | Android 9 / 10 / 11 |
| **Honeywell CT60 / CT60 XP** | Mobility Edge Gen 1/2 (SD660) | N6703 / N6803 | Fully Supported (DO LockTask) | `com.honeywell.uemconnect` | Android 9 / 10 / 11 |
| **Honeywell EDA52 / EDA51** | ScanPal Enterprise (SM6115) | N6603 / N6703 | Fully Supported (DO LockTask) | `com.honeywell.oemconfig` | Android 11 / 12 |

---

## 2. Integrated Barcode Scanner Subsystem

### 2.1 Intent Broadcast Configuration
Nexus MDM configures and listens to Honeywell's hardware decoding engine:
* **Action:** `com.honeywell.decode.intent.action.EDIT_DATA`
* **Data Extra:** `"data"` (Decoded string content)
* **Symbology Extra:** `"codeId"` (Identifier for QR, Code 128, EAN13, DataMatrix, PDF417)
* **Timestamp Extra:** System epoch time in milliseconds

### 2.2 Physical Scanner Trigger Keys
Honeywell devices feature dedicated physical scan buttons that emit standard Android KeyEvents:
* **Keycodes:** `241`, `242`, `243`, `244`, `293`, `294`
* **Button Aliases:** `KEYCODE_BUTTON_L1`, `KEYCODE_BUTTON_R1`
* **Pass-Through Handling:** Nexus MDM routes these keycodes directly to active scanning components without interrupting Kiosk lock integrity.

---

## 3. Honeywell OEMConfig & UEMConnect Integration

Nexus MDM applies Managed Configurations to Honeywell OEM packages (`com.honeywell.oemconfig` / `com.honeywell.uemconnect`):
* **Key Remapping:** Assigning physical scan buttons or custom function keys.
* **Display & Touch:** Glove mode, stylus mode, and display timeout lockdown.
* **Power Management:** Battery health threshold alerts and aggressive sleep optimization for warehouse shifts.
* **Wi-Fi Roaming:** Fast BSS Transition (802.11r) and CCX roaming configurations for seamless coverage.

---

## 4. Kiosk Mode & Launcher Teardown Sequence

On Honeywell devices, exiting Kiosk mode executes a strict 5-step sequence:
1. `activity.stopLockTask()` — Releases Android LockTask confinement.
2. `dpm.setLockTaskPackages(adminComponent, arrayOf())` — Clears package locks so all Honeywell system utilities can run.
3. `dpm.clearPackagePersistentPreferredActivities(adminComponent, packageName)` — Disengages Nexus as forced Home.
4. `dpm.setStatusBarDisabled(adminComponent, false)` — Restores Honeywell top notification tray.
5. Launch cascade targeting `com.honeywell.enterprise.launcher` ➔ `com.android.launcher3` ➔ Android System Settings.
