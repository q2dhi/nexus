# NEXUS MDM — Enterprise Testing & Quality Assurance Suite
**Version:** 2.0.0 (Enterprise Rebuild)

---

## 1. Automated Test Suites

Nexus MDM includes a comprehensive suite of automated unit, integration, and security tests:

1. **Multi-Tenancy & Subscription Enforcement:**
   - Validates Tenant isolation, trial periods, subscription lockouts, and cryptographic auth tokens.
2. **Branch Hierarchy & Role-Based Permissions (RBAC):**
   - Asserts that branch managers cannot exit Kiosk mode, wipe devices, or modify parent tenant policies.
3. **Honeywell Hardware & Capability Matrix:**
   - Discovers Mobility Edge generation, Barcode Scanner broadcasts, and OEMConfig package bindings.
4. **Kiosk 10-Step State Machine Matrix:**
   - Tests `NORMAL`, `ENROLLING`, `MANAGED`, `KIOSK`, `ADMIN_AUTHENTICATION`, and `EXIT_KIOSK` transitions, including anti-brute force lockouts and offline boot recovery.

---

## 2. Running Automated Tests

Run the complete test suite locally:

```bash
cd web-admin
python3 run_all_tests.py
```

---

## 3. Kiosk Test Verification Matrix

| Test Case | Scenario | Expected Behavior | Result |
|---|---|---|---|
| **Test 1** | Enter Kiosk Mode | LockTask engaged, Status bar locked, App grid active | **PASS** |
| **Test 2** | Incorrect Admin PIN | Authentication rejected, attempt counter incremented | **PASS** |
| **Test 3** | Correct Admin PIN | LockTask released, default launcher cleared, OEM home opened | **PASS** |
| **Test 4** | 5 Repeated Failed Attempts | 60-second anti-brute force lockout triggered | **PASS** |
| **Test 5** | Agent Process Restart | Cached policy loaded, Kiosk state immediately restored | **PASS** |
| **Test 6** | Device Hardware Reboot | `BootReceiver` restores Kiosk LockTask without network | **PASS** |
| **Test 7** | Backend Server Offline | Agent continues operating using encrypted local policy | **PASS** |
| **Test 8** | Honeywell Scanner Trigger | Keycodes 241–244, 293–294 and intent `EDIT_DATA` captured | **PASS** |
| **Test 9** | Unauthorized Branch Exit | Server returns HTTP 403 Forbidden | **PASS** |
| **Test 10** | Cross-Tenant Command Dispatch | Request blocked by tenant isolation filter | **PASS** |
