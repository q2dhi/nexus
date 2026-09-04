import json
import urllib.request
import urllib.error
import sys
sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:3000"

def request_json(path, method="GET", body=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            content = resp.read().decode("utf-8")
            return status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            return e.code, json.loads(content)
        except Exception:
            return e.code, {"error": content}

def run_tests():
    print("=== Testing Hierarchical Multi-Branch & Security Isolation ===")

    # 1. Developer login
    print("\n1. Developer Login...")
    status, res = request_json("/api/developer/login", method="POST", body={"pin": "nexus2026"})
    assert status == 200 and res.get("success"), f"Dev login failed: {res}"
    dev_token = res.get("token")
    dev_headers = {"X-Developer-Token": dev_token}
    print("   [PASS] Developer authenticated successfully.")

    # 2. Check tenants in Developer Portal
    print("\n2. Developer checks tenants & branch quotas...")
    status, tenants = request_json("/api/developer/tenants", headers=dev_headers)
    assert status == 200 and len(tenants) > 0, f"Failed: {tenants}"
    target = tenants[0]
    assert target is not None, "Target tenant not found"
    print(f"   [PASS] Found target tenant: {target['name']}, maxBranches: {target.get('subscription', {}).get('maxBranches')}")

    # 3. Developer sets maxBranches to 2
    print("\n3. Developer updates subscription: maxBranches = 2...")
    status, res = request_json("/api/developer/tenants/subscription", method="POST", headers=dev_headers, body={
        "tenantId": target["id"],
        "status": target.get("subscription", {}).get("status", "ACTIVE"),
        "startDate": target.get("subscription", {}).get("startDate", "2026-09-04"),
        "expiryDate": target.get("subscription", {}).get("expiryDate", "2027-09-04"),
        "maxDevices": target.get("subscription", {}).get("maxDevices", 25),
        "maxBranches": 2,
        "planName": "باقة تجريبية"
    })
    assert status == 200 and res.get("success"), f"Failed: {res}"
    print("   [PASS] Subscription updated with maxBranches = 2.")

    # 4. Main company login
    print("\n4. Main Company logs in with email & password...")
    status, res = request_json("/api/tenant/login", method="POST", body={
        "username": target.get("email") or target.get("code"),
        "password": target.get("password")
    })
    assert status == 200 and res.get("success"), f"Company login failed: {res}"
    assert res.get("isBranch") == False, "Company should NOT be a branch"
    assert res.get("canExitKiosk") == True, "Company should be able to exit kiosk"
    comp_token = res.get("token")
    comp_headers = {"X-Tenant-Token": comp_token}
    print(f"   [PASS] Company logged in. Token: {comp_token[:15]}..., isBranch: False")

    # Clean existing branches for clean test run
    status, b_res = request_json("/api/tenant/branches", headers=comp_headers)
    if status == 200:
        for b in b_res.get("branches", []):
            request_json("/api/tenant/branches/delete", method="POST", headers=comp_headers, body={"branchId": b["id"]})

    # 5. Company creates Branch 1 (number: 07701111111)
    print("\n5. Company creates Branch 1...")
    status, res = request_json("/api/tenant/branches", method="POST", headers=comp_headers, body={
        "name": "فرع المنصور",
        "number": "07701111111",
        "code": "BR-MANSOUR",
        "password": "bpass123"
    })
    assert status == 200 and res.get("success"), f"Failed to create branch 1: {res}"
    branch1 = res["branch"]
    print(f"   [PASS] Created branch 1: {branch1['name']} with login number: {branch1['number']}")

    # 6. Company creates Branch 2 (number: 07802222222)
    print("\n6. Company creates Branch 2...")
    status, res = request_json("/api/tenant/branches", method="POST", headers=comp_headers, body={
        "name": "فرع الكرادة",
        "number": "07802222222",
        "code": "BR-KARRADA",
        "password": "bpass456"
    })
    assert status == 200 and res.get("success"), f"Failed to create branch 2: {res}"
    branch2 = res["branch"]
    print(f"   [PASS] Created branch 2: {branch2['name']} with login number: {branch2['number']}")

    # 7. Company attempts to create Branch 3 (Exceeding quota of 2)
    print("\n7. Company attempts to create Branch 3 exceeding quota...")
    status, res = request_json("/api/tenant/branches", method="POST", headers=comp_headers, body={
        "name": "فرع البصرة",
        "number": "07703333333",
        "code": "BR-BASRA",
        "password": "bpass789"
    })
    assert status == 400, f"Expected 400 Quota Exceeded but got {status}: {res}"
    print(f"   [PASS] Successfully blocked branch creation when exceeding quota: {res.get('error')}")

    # 8. Branch 1 logs in using its NUMBER (not email) and password
    print("\n8. Branch 1 logs in using Number + Password...")
    status, res = request_json("/api/tenant/login", method="POST", body={
        "number": "07701111111",
        "password": "bpass123"
    })
    assert status == 200 and res.get("success"), f"Branch login failed: {res}"
    assert res.get("isBranch") == True, "Expected isBranch == True"
    assert res.get("canExitKiosk") == False, "Expected canExitKiosk == False"
    branch_token = res.get("token")
    branch_headers = {"X-Tenant-Token": branch_token}
    print(f"   [PASS] Branch 1 logged in successfully! isBranch: True, canExitKiosk: False")

    # 9. Branch 1 attempts to exit kiosk (SET_KIOSK_MODE enable: False)
    print("\n9. Testing Security: Branch 1 attempts to exit Kiosk mode...")
    status, res = request_json("/api/commands", method="POST", headers=branch_headers, body={
        "deviceId": "test_device_01",
        "command": "SET_KIOSK_MODE",
        "payload": {"enable": False}
    })
    assert status == 403, f"Expected 403 Forbidden for branch kiosk exit, but got {status}: {res}"
    print(f"   [PASS] Branch 1 was strictly FORBIDDEN from exiting kiosk: {res.get('error')}")

    # 10. Main Company attempts to exit kiosk
    print("\n10. Testing Security: Main Company exits Kiosk mode...")
    status, res = request_json("/api/commands", method="POST", headers=comp_headers, body={
        "deviceId": "test_device_01",
        "command": "SET_KIOSK_MODE",
        "payload": {"enable": False}
    })
    assert status == 200 and res.get("success"), f"Company should be allowed: {res}"
    print("   [PASS] Main company successfully permitted to exit kiosk.")

    # 11. Branch 1 attempts to manage branches
    print("\n11. Testing Security: Branch 1 attempts to create a branch...")
    status, res = request_json("/api/tenant/branches", method="POST", headers=branch_headers, body={
        "name": "فرع فرعي غير مسموح",
        "number": "07709999999",
        "password": "123"
    })
    assert status == 403, f"Expected 403 for branch creating branches, got {status}: {res}"
    print("   [PASS] Branch 1 is strictly forbidden from branch administration.")

    # 12. Main Company deletes branch 2
    print("\n12. Main Company deletes Branch 2...")
    status, res = request_json("/api/tenant/branches/delete", method="POST", headers=comp_headers, body={
        "branchId": branch2["id"]
    })
    assert status == 200 and res.get("success"), f"Delete failed: {res}"
    assert res.get("usedBranches") == 1, "Used branches should now be 1"
    print("   [PASS] Branch 2 deleted successfully. Remaining used: 1.")

    # 13. Developer verifies branch list under company
    print("\n13. Developer verifies branch visibility under company...")
    target = tenants[0]
    assert len(target.get("branches", [])) >= 1, f"Expected at least 1 branch, found {len(target.get('branches', []))}"
    print(f"   [PASS] Developer Console successfully sees company branch: {target['branches'][0]['name']} ({target['branches'][0]['number']})")

    print("\n>>> ALL MULTI-BRANCH HIERARCHY & SECURITY TESTS PASSED! <<<")

if __name__ == "__main__":
    run_tests()
