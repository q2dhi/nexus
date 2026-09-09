# NEXUS MDM — Enterprise Deployment & Operations Guide
**Platforms:** Linux, Docker, Render, macOS, Cloud Bare-Metal  
**Version:** 2.0.0

---

## 1. Cloud Production Deployment (Render / Docker)

Nexus MDM is configured for cloud deployment with continuous integration and automated rollouts.

### 1.1 Render Deployment
1. Connect your GitHub repository to Render (`https://render.com`).
2. Create a Web Service using the included `render.yaml` or Docker environment.
3. Build & Start Commands:
   - **Environment:** Python 3.10+ / Docker
   - **Start Command:** `python web-admin/server.py`
4. Set Environment Variables:
   - `PORT`: `3000` (or injected dynamically by Render/Cloud host)
   - `DEVELOPER_PASSWORD`: Custom master developer secret

---

## 2. Local & On-Premises Server Deployment

```bash
# Clone repository
git clone https://github.com/q2dhi/nexus.git
cd nexus

# Run web-admin portal (Python 3)
cd web-admin
python3 server.py
```
Portal available at: `http://localhost:3000`

---

## 3. Android Enterprise Agent Build & Provisioning

```bash
# Build Android APK via Gradle
./gradlew assembleDebug

# Output APK path:
# app/build/outputs/apk/debug/app-debug.apk
```

### 3.1 QR Code Provisioning Payload
In the Web Admin console, navigate to **QR Code Enrollment** to generate the standard Android Enterprise Device Owner provisioning QR code. Scan the code on any factory-reset Honeywell, Zebra, or Android device to complete zero-touch setup.
