import urllib.request
import urllib.parse
import json
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_URL = "http://127.0.0.1:3000"

def request_json(path, method="GET", body=None, headers=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req_headers = {'Content-Type': 'application/json'}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))
    except Exception as e:
        return 0, {"error": str(e)}

def run_tests():
    print("==================================================")
    print("NEXUS MDM - MULTI-TENANT & SUBSCRIPTION TEST SUITE")
    print("==================================================")

    # 1. Developer Login
    print("\n1. Testing Developer Login...")
    status, res = request_json("/api/developer/login", method="POST", body={"pin": "nexus2026"})
    assert status == 200 and res.get("success"), f"Dev login failed: {res}"
    dev_token = res.get("token")
    print(f"   [PASS] Developer authenticated! Token: {dev_token[:15]}...")

    dev_headers = {"X-Developer-Token": dev_token}

    # 2. Developer Overview
    print("\n2. Testing Developer Overview Metrics...")
    status, res = request_json("/api/developer/overview", headers=dev_headers)
    assert status == 200 and 'totalTenants' in res, f"Overview failed: {res}"
    print(f"   [PASS] Total Tenants: {res['totalTenants']}, Active: {res['activeSubscriptions']}, Devices: {res['totalDevices']}")

    # 3. Fetch Tenants
    print("\n3. Testing Fetch Developer Tenants...")
    status, res = request_json("/api/developer/tenants", headers=dev_headers)
    assert status == 200, f"Fetch tenants failed: {res}"
    tenants = res if isinstance(res, list) else res.get("tenants", [])
    assert len(tenants) > 0, "No tenants found"
    default_tenant = next((t for t in tenants if t["code"] == "NEXUS-DEFAULT"), None)
    assert default_tenant is not None, "NEXUS-DEFAULT tenant missing"
    print(f"   [PASS] Found tenant: {default_tenant['name']} ({default_tenant['code']}) - Status: {default_tenant['subscription']['status']}")

    # 4. Suspend Tenant Subscription
    print("\n4. Testing Subscription Suspension...")
    status, res = request_json("/api/developer/tenants/subscription", method="POST", headers=dev_headers, body={
        "code": "NEXUS-DEFAULT",
        "status": "SUSPENDED"
    })
    assert status == 200 and res.get("success"), f"Suspend failed: {res}"
    print(f"   [PASS] Subscription status updated to: {res['subscription']['status']}")

    # 5. Check Tenant Info (Tenant Web Portal check)
    print("\n5. Testing Tenant Web Portal Subscription Gate when SUSPENDED...")
    status, res = request_json("/api/tenant/info?companyCode=NEXUS-DEFAULT")
    assert status == 200 and res.get("success"), f"Tenant info failed: {res}"
    assert res["tenant"]["isActive"] == False, "Tenant should NOT be active when SUSPENDED"
    print(f"   [PASS] Tenant portal gate triggered: isActive={res['tenant']['isActive']}, msg='{res['tenant']['statusMessage']}'")

    # 6. Device Heartbeat under SUSPENDED subscription
    print("\n6. Testing Android Heartbeat under SUSPENDED subscription...")
    status, res = request_json("/api/devices/heartbeat", method="POST", body={
        "id": "TEST_DEVICE_01",
        "name": "POS-TERMINAL-01",
        "model": "Samsung SM-A546B",
        "os": "14",
        "battery": 88,
        "isCharging": False,
        "temperature": 29,
        "ramUsedPercent": 42,
        "storageUsedPercent": 35,
        "isKiosk": True,
        "isRooted": False,
        "ipAddress": "192.168.100.75",
        "companyCode": "NEXUS-DEFAULT"
    })
    assert status == 200, f"Heartbeat failed: {res}"
    assert res.get("subscriptionActive") == False, "subscriptionActive must be FALSE in heartbeat response!"
    print(f"   [PASS] Device heartbeat intercepted: subscriptionActive={res.get('subscriptionActive')}, Alert='{res.get('subscriptionMessage')}'")

    # 7. Reactivate Subscription with Extension
    print("\n7. Testing Subscription Reactivation with Extension (+6 Months)...")
    status, res = request_json("/api/developer/tenants/subscription", method="POST", headers=dev_headers, body={
        "code": "NEXUS-DEFAULT",
        "status": "ACTIVE",
        "extendMonths": 6,
        "maxDevices": 100
    })
    assert status == 200 and res.get("success"), f"Reactivate failed: {res}"
    print(f"   [PASS] Subscription reactivated! Status: {res['subscription']['status']}, Expiry: {res['subscription']['expiryDate']}")

    # 8. Verify Tenant Web Portal & Heartbeat when ACTIVE
    print("\n8. Testing Tenant Portal & Heartbeat when ACTIVE...")
    status, res = request_json("/api/tenant/info?companyCode=NEXUS-DEFAULT")
    assert status == 200 and res["tenant"]["isActive"] == True, "Tenant must be ACTIVE!"
    print(f"   [PASS] Tenant portal gate unlocked: isActive=True")

    status, res = request_json("/api/devices/heartbeat", method="POST", body={
        "id": "TEST_DEVICE_01",
        "name": "POS-TERMINAL-01",
        "model": "Samsung SM-A546B",
        "os": "14",
        "battery": 89,
        "isCharging": False,
        "temperature": 29,
        "ramUsedPercent": 42,
        "storageUsedPercent": 35,
        "isKiosk": True,
        "isRooted": False,
        "ipAddress": "192.168.100.75",
        "companyCode": "NEXUS-DEFAULT"
    })
    assert res.get("subscriptionActive") == True, "Heartbeat subscriptionActive must be TRUE!"
    print(f"   [PASS] Device heartbeat authorized: subscriptionActive=True")

    # 9. Update Allowed Screens for Tenant
    print("\n9. Testing Granular Screen Permissions (developer toggles screens)...")
    status, res = request_json("/api/developer/tenants/screens", method="POST", headers=dev_headers, body={
        "code": "NEXUS-DEFAULT",
        "allowedScreens": {
            "fleet": True,
            "whitelist": True,
            "qr": True,
            "ota": False,
            "logs": False,
            "screenControl": True,
            "gpsGeofence": True,
            "remoteWipe": False
        }
    })
    assert status == 200 and res.get("success"), f"Update screens failed: {res}"
    assert res["allowedScreens"]["ota"] == False and res["allowedScreens"]["remoteWipe"] == False
    print(f"   [PASS] Granular screen permissions saved: OTA={res['allowedScreens']['ota']}, RemoteWipe={res['allowedScreens']['remoteWipe']}")

    # 10. Device Renaming Endpoint & Command Queue
    print("\n10. Testing Device Renaming via API...")
    status, res = request_json("/api/devices/rename", method="POST", body={
        "deviceId": "TEST_DEVICE_01",
        "newName": "كاشير فرع المنصور 01"
    })
    assert status == 200 and res.get("success"), f"Rename failed: {res}"
    print(f"   [PASS] Device renamed to: {res['name']}")

    # Heartbeat again to verify RENAME_DEVICE command is dispatched to the device
    status, res = request_json("/api/devices/heartbeat", method="POST", body={
        "id": "TEST_DEVICE_01",
        "companyCode": "NEXUS-DEFAULT"
    })
    commands = res.get("commands", [])
    rename_cmd = next((c for c in commands if c.get("command") == "RENAME_DEVICE"), None)
    rename_name = rename_cmd.get("newName") or rename_cmd.get("payload", {}).get("newName")
    assert rename_name == "كاشير فرع المنصور 01", f"Unexpected rename value: {rename_cmd}"
    print(f"   [PASS] Device received command: {rename_cmd['command']} -> newName='{rename_name}'")

    # 11. QR Config & Multi-Tenant Enrollment List
    print("\n11. Testing QR Config with Registered Companies...")
    status, res = request_json("/api/qr-config")
    assert status == 200, f"QR config failed: {res}"
    companies = res.get("companies", [])
    assert len(companies) > 0, "QR companies list is empty"
    print(f"   [PASS] QR Config contains {len(companies)} registered companies. Default: {companies[0]['name']}")

    print("\n==================================================")
    print(">>> ALL 11 MULTI-TENANT & SUBSCRIPTION TESTS PASSED! <<<")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
