const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Fleet Device Registry & Command Queues
const devices = new Map();
const pendingCommands = new Map(); // deviceId -> Array<Command>
const auditLogs = [];

// Helper to log audit events
function addAuditLog(action, target, details) {
    const entry = {
        timestamp: new Date().toLocaleTimeString(),
        action,
        target,
        details
    };
    auditLogs.unshift(entry);
    if (auditLogs.length > 80) auditLogs.pop();
}

// --------------------------------------------------------------------------
// AGENT API: Device Heartbeat & Command Retrieval
// --------------------------------------------------------------------------
app.post('/api/devices/heartbeat', (req, res) => {
    const data = req.body;
    if (!data || !data.id) {
        return res.status(400).json({ error: 'Missing device id' });
    }

    const deviceId = data.id;
    devices.set(deviceId, {
        ...data,
        lastSeen: Date.now()
    });

    // Check if there are pending commands for this device
    const queue = pendingCommands.get(deviceId) || [];
    const commandsToExecute = [...queue];
    pendingCommands.set(deviceId, []); // Flush queue after delivering

    if (commandsToExecute.length > 0) {
        addAuditLog('COMMANDS_DELIVERED', deviceId, `Delivered ${commandsToExecute.length} commands to agent`);
    }

    res.json({
        status: 'OK',
        commands: commandsToExecute
    });
});

// --------------------------------------------------------------------------
// ADMIN API: Fleet Devices Query
// --------------------------------------------------------------------------
app.get('/api/devices', (req, res) => {
    const now = Date.now();
    const reqBranch = (req.query.branchId || '').trim();
    let deviceList = Array.from(devices.values());
    if (reqBranch && reqBranch !== 'ALL') {
        deviceList = deviceList.filter(dev => String(dev.branchId || '') === reqBranch);
    }
    const result = deviceList.map(dev => ({
        ...dev,
        isOnline: (now - dev.lastSeen) < 25000
    }));
    res.json(result);
});

// --------------------------------------------------------------------------
// ADMIN API: Assign Device to Branch
// --------------------------------------------------------------------------
app.post('/api/tenant/devices/assign-branch', (req, res) => {
    const { deviceId, branchId, branchName, branchCode } = req.body;
    if (!deviceId) {
        return res.status(400).json({ error: 'Missing deviceId' });
    }
    const dev = devices.get(deviceId);
    if (!dev) {
        return res.status(404).json({ error: 'Device not found' });
    }
    if (branchId && branchId !== 'UNASSIGN') {
        dev.branchId = branchId;
        dev.branchName = branchName || 'فرع';
        dev.branchCode = branchCode || '';
        devices.set(deviceId, dev);
        addAuditLog('DEVICE_BRANCH_ASSIGNED', deviceId, `Assigned to branch: ${dev.branchName}`);
    } else {
        delete dev.branchId;
        delete dev.branchName;
        delete dev.branchCode;
        devices.set(deviceId, dev);
        addAuditLog('DEVICE_BRANCH_UNASSIGNED', deviceId, 'Unassigned from branch');
    }
    res.json({ success: true, device: dev });
});

// --------------------------------------------------------------------------
// ADMIN API: Delete Device from Registry
// --------------------------------------------------------------------------
app.post('/api/devices/delete', (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) {
        return res.status(400).json({ error: 'Missing deviceId' });
    }
    if (devices.has(deviceId)) {
        const dev = devices.get(deviceId);
        devices.delete(deviceId);
        pendingCommands.delete(deviceId);
        addAuditLog('DEVICE_DELETED', deviceId, `Deleted device ${dev.name || deviceId}`);
        return res.json({ success: true, message: 'Device deleted successfully' });
    }
    return res.status(404).json({ error: 'Device not found' });
});

// --------------------------------------------------------------------------
// ADMIN API: Push Remote Command to Device
// --------------------------------------------------------------------------
app.post('/api/commands', (req, res) => {
    const { deviceId, command, payload } = req.body;
    if (!deviceId || !command) {
        return res.status(400).json({ error: 'Missing deviceId or command' });
    }

    const cmdObject = {
        command,
        ...(payload || {}),
        timestamp: Date.now()
    };

    if (deviceId === 'ALL') {
        devices.forEach((_, id) => {
            const queue = pendingCommands.get(id) || [];
            queue.push(cmdObject);
            pendingCommands.set(id, queue);
        });
        addAuditLog('BROADCAST_COMMAND', 'ALL_DEVICES', `Dispatched: ${command}`);
    } else {
        const queue = pendingCommands.get(deviceId) || [];
        queue.push(cmdObject);
        pendingCommands.set(deviceId, queue);
        addAuditLog('DISPATCH_COMMAND', deviceId, `Dispatched: ${command}`);
    }

    res.json({ success: true, message: `Command '${command}' queued successfully.` });
});

// --------------------------------------------------------------------------
// ADMIN API: Deploy OTA App Update
// --------------------------------------------------------------------------
app.post('/api/apps/deploy', (req, res) => {
    const { deviceId, apkUrl, packageName, autoWhitelist } = req.body;
    if (!apkUrl) {
        return res.status(400).json({ error: 'APK download URL required' });
    }

    const pkgName = (packageName || 'ota_update_app').trim();
    const installCommand = {
        command: 'INSTALL_APK_FROM_URL',
        url: apkUrl,
        package_name: pkgName,
        timestamp: Date.now()
    };

    const targetIds = deviceId === 'ALL' ? Array.from(devices.keys()) : [deviceId];
    const isValidPkg = pkgName && pkgName !== 'ota_update_app' && pkgName !== 'ota_app';

    targetIds.forEach(id => {
        const queue = pendingCommands.get(id) || [];
        queue.push(installCommand);

        if (autoWhitelist && isValidPkg) {
            const dev = devices.get(id);
            const currentPkgs = (dev && dev.whitelistedApps) ? [...dev.whitelistedApps] : [];
            if (!currentPkgs.includes(pkgName)) {
                currentPkgs.push(pkgName);
                if (dev) dev.whitelistedApps = currentPkgs;
            }
            queue.push({
                command: 'SET_WHITELIST',
                packages: currentPkgs,
                timestamp: Date.now()
            });
        }
        pendingCommands.set(id, queue);
    });

    if (deviceId === 'ALL') {
        addAuditLog('OTA_DEPLOY_BROADCAST', 'ALL_DEVICES', `Deployed APK: ${apkUrl} (Auto-Whitelist: ${!!autoWhitelist})`);
    } else {
        addAuditLog('OTA_DEPLOY', deviceId, `Deployed APK: ${apkUrl} (Auto-Whitelist: ${!!autoWhitelist})`);
    }

    res.json({ success: true, message: 'OTA silent installation command dispatched.' });
});

// --------------------------------------------------------------------------
// ADMIN API: Audit Logs Query
// --------------------------------------------------------------------------
app.get('/api/logs', (req, res) => {
    res.json(auditLogs);
});

// --------------------------------------------------------------------------
// CLOUD REMOTE CONTROL: Touch & Screen Frame Stream
// --------------------------------------------------------------------------
const pendingTouchEvents = new Map();

app.post('/api/devices/:id/screen-frame', (req, res) => {
    const deviceId = req.params.id;
    const actions = pendingTouchEvents.get(deviceId) || [];
    pendingTouchEvents.set(deviceId, []);
    res.json({ status: 'OK', actions });
});

app.post('/api/devices/:id/touch', (req, res) => {
    const deviceId = req.params.id;
    const queue = pendingTouchEvents.get(deviceId) || [];
    if (queue.length < 10) {
        queue.push(req.body);
    }
    pendingTouchEvents.set(deviceId, queue);
    res.json({ success: true, queued: true });
});

// --------------------------------------------------------------------------
// QR PROVISIONING & APK DOWNLOAD
// --------------------------------------------------------------------------
const KNOWN_DEBUG_SIGNATURE_CHECKSUM = '186vU9UaxTohVbAWXcnMNDgnXDp1oPstFMvprK-WVD8';

function resolveAgentApkPath() {
    const candidates = [
        path.join(__dirname, '..', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        path.join(__dirname, 'apk', 'nexus-agent.apk'),
        path.join(__dirname, 'public', 'downloads', 'nexus-agent-latest.apk')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
    }
    return path.join(__dirname, 'apk', 'nexus-agent.apk');
}

app.get('/api/qr-config', (req, res) => {
    const host = req.headers.host || `localhost:${PORT}`;
    const proto = (req.headers['x-forwarded-proto'] || 'http');
    const serverUrl = `${proto}://${host}`;
    const downloadUrl = `${serverUrl}/download/nexus-agent.apk`;

    res.json({
        localIp: host.split(':')[0],
        port: PORT,
        apkChecksum: KNOWN_DEBUG_SIGNATURE_CHECKSUM,
        signatureChecksum: KNOWN_DEBUG_SIGNATURE_CHECKSUM,
        componentName: 'com.nexus.mdm.agent/com.nexus.mdm.agent.admin.NexusAdminReceiver',
        defaultDownloadUrl: downloadUrl,
        defaultServerUrl: serverUrl,
        companies: [{ code: 'NEXUS-DEFAULT', name: 'شركة التقنية المتقدمة (الافتراضية)', status: 'ACTIVE' }]
    });
});

app.get('/download/nexus-agent.apk', (req, res) => {
    const apkPath = resolveAgentApkPath();
    if (fs.existsSync(apkPath)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="nexus-agent.apk"');
        return res.sendFile(apkPath);
    }
    res.status(404).json({ error: 'APK not found' });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` Nexus MDM Web Admin Console is running!`);
    console.log(` Local:   http://localhost:${PORT}`);
    console.log(` Network: http://<YOUR_LOCAL_IP>:${PORT}`);
    console.log(`====================================================`);
});
