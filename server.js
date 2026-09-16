const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
const selfsigned = require('selfsigned');
const QRCode = require('qrcode');
const { execSync } = require('child_process');

// Auto-free ports if previously occupied on Windows
function freePort(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = out.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[1].endsWith(`:${port}`) && parts[3] === 'LISTENING') {
        const pid = parts[4];
        if (pid && pid !== process.pid.toString()) {
          execSync(`taskkill /F /PID ${pid} >nul 2>&1`);
        }
      }
    }
  } catch (e) {}
}

const isCloud = process.platform !== 'win32' || !!process.env.PORT || !!process.env.RENDER || process.env.NODE_ENV === 'production';
if (!isCloud) {
  freePort(3000);
  freePort(3443);
}

const app = express();
const PORT = process.env.PORT || 3000;
const HTTP_PORT = PORT;
const HTTPS_PORT = 3443;

// Serve static assets (support both root directory and public folder)
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

async function getSslOptions() {
  const certDir = path.join(__dirname, 'ssl');
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }

  console.log('Generating SSL Certificate for secure LAN mobile microphone access...');
  const attrs = [{ name: 'commonName', value: 'godown-walkie.local' }];
  const pems = await selfsigned.generate(attrs, { days: 3650 });
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  return { key: pems.private, cert: pems.cert };
}

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Exclude 169.254 (APIPA) if possible
        if (!iface.address.startsWith('169.254.')) {
          ips.unshift({ name, ip: iface.address }); // Priority to real LAN
        } else {
          ips.push({ name, ip: iface.address });
        }
      }
    }
  }
  return ips;
}

const configPath = path.join(__dirname, 'staff_config.json');

function loadConfig() {
  const defaultConfig = {
    ownerPin: '1234',
    staffSlots: [
      { id: 'staff_1', label: 'Staff 1', defaultName: 'Staff 1' },
      { id: 'staff_2', label: 'Staff 2', defaultName: 'Staff 2' }
    ]
  };
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && Array.isArray(parsed.staffSlots) && parsed.staffSlots.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  saveConfig(defaultConfig);
  return defaultConfig;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving staff config:', e);
  }
}

let serverConfig = loadConfig();

let globalShiftActive = false;
let globalShiftOwner = '';

const clients = new Map(); // ws -> { slot, role, name, isTalking }

function setupWebSocketServer(wss) {
  wss.on('connection', (ws) => {
    const clientData = {
      slot: null,
      role: 'unknown',
      name: 'Connecting...',
      channel: 'all', // 'all' (Broadcast) or 'owners' (Private Owner Channel)
      isTalking: false
    };
    clients.set(ws, clientData);

    // Send initial status with current staff slots
    ws.send(JSON.stringify({
      type: 'initial_state',
      globalShiftActive,
      globalShiftOwner,
      activeSlots: getActiveSlots(),
      staffSlots: serverConfig.staffSlots
    }));

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // High-speed binary voice broadcast ONLY IF shift is active
        if (!globalShiftActive) return;
        const isPrivate = clientData.role === 'owner' && clientData.channel === 'owners';
        for (const [clientWs, targetData] of clients) {
          if (clientWs !== ws && clientWs.readyState === 1) { // 1 = OPEN
            if (isPrivate) {
              // Strictly Owners only in private channel
              if (targetData.role === 'owner') {
                clientWs.send(data, { binary: true });
              }
            } else {
              clientWs.send(data, { binary: true });
            }
          }
        }
      } else {
        // Signaling message (JSON)
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'claim_slot') {
            const requestedSlot = msg.slot;

            // Check if Owner and verify PIN against serverConfig
            if (requestedSlot.startsWith('owner_')) {
              if (msg.pin !== serverConfig.ownerPin) {
                ws.send(JSON.stringify({
                  type: 'slot_error',
                  message: 'Incorrect Owner PIN. Please enter the valid Owner PIN.'
                }));
                return;
              }
              clientData.role = 'owner';
            } else if (requestedSlot.startsWith('staff_')) {
              const validStaff = serverConfig.staffSlots.some(s => s.id === requestedSlot);
              if (!validStaff) {
                ws.send(JSON.stringify({
                  type: 'slot_error',
                  message: 'This staff station is no longer active.'
                }));
                return;
              }
              clientData.role = 'staff';
            } else {
              ws.send(JSON.stringify({
                type: 'slot_error',
                message: 'Invalid slot selection.'
              }));
              return;
            }

            clientData.slot = requestedSlot;
            clientData.name = msg.name || (clientData.role === 'owner' ? `Owner ${requestedSlot.slice(-1)}` : `Staff ${requestedSlot.slice(-1)}`);

            ws.send(JSON.stringify({
              type: 'slot_confirmed',
              slot: clientData.slot,
              role: clientData.role,
              name: clientData.name,
              globalShiftActive,
              globalShiftOwner,
              staffSlots: serverConfig.staffSlots
            }));

            broadcastPresence();
          } else if (msg.type === 'set_shift') {
            // Only Owners can start or stop the shift
            if (clientData.role !== 'owner') {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Only Owners have permission to Start or Stop the shift.'
              }));
              return;
            }

            globalShiftActive = !!msg.active;
            globalShiftOwner = clientData.name;

            console.log(`[Shift] ${clientData.name} turned shift ${globalShiftActive ? 'ACTIVE (STARTED)' : 'STOPPED (OFF)'}`);

            // Broadcast shift change to EVERYONE (All Owners and All Staff)
            const shiftMsg = JSON.stringify({
              type: 'shift_status',
              active: globalShiftActive,
              ownerName: globalShiftOwner
            });

            for (const [clientWs] of clients) {
              if (clientWs.readyState === 1) {
                clientWs.send(shiftMsg);
              }
            }
          } else if (msg.type === 'set_channel') {
            // Only Owners can switch to 'owners' private channel
            if (clientData.role === 'owner') {
              clientData.channel = (msg.channel === 'owners') ? 'owners' : 'all';
              console.log(`[Channel] Owner ${clientData.name} switched channel to: ${clientData.channel}`);
              ws.send(JSON.stringify({
                type: 'channel_confirmed',
                channel: clientData.channel
              }));
            }
          } else if (msg.type === 'talk_start') {
            if (!globalShiftActive) return;
            clientData.isTalking = true;
            const isPrivate = clientData.role === 'owner' && clientData.channel === 'owners';
            const payload = {
              type: 'talk_start',
              senderName: clientData.name,
              senderRole: clientData.role,
              senderSlot: clientData.slot,
              channel: clientData.channel || 'all'
            };
            if (isPrivate) {
              // Send talk_start ONLY to other Owners
              for (const [clientWs, targetData] of clients) {
                if (clientWs !== ws && clientWs.readyState === 1 && targetData.role === 'owner') {
                  clientWs.send(JSON.stringify(payload));
                }
              }
            } else {
              broadcastToOthers(ws, payload);
            }
          } else if (msg.type === 'talk_stop') {
            clientData.isTalking = false;
            const isPrivate = clientData.role === 'owner' && clientData.channel === 'owners';
            const payload = {
              type: 'talk_stop',
              senderName: clientData.name,
              channel: clientData.channel || 'all'
            };
            if (isPrivate) {
              // Send talk_stop ONLY to other Owners
              for (const [clientWs, targetData] of clients) {
                if (clientWs !== ws && clientWs.readyState === 1 && targetData.role === 'owner') {
                  clientWs.send(JSON.stringify(payload));
                }
              }
            } else {
              broadcastToOthers(ws, payload);
            }
          } else if (msg.type === 'add_staff_slot') {
            // Strictly Owner-only
            if (clientData.role !== 'owner') {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Unauthorized: Only Owners can manage staff.' }));
              return;
            }

            const staffName = (msg.name || '').trim() || `Staff ${serverConfig.staffSlots.length + 1}`;
            let maxIdNum = 0;
            for (const s of serverConfig.staffSlots) {
              const m = s.id.match(/^staff_(\d+)$/);
              if (m) {
                const n = parseInt(m[1], 10);
                if (n > maxIdNum) maxIdNum = n;
              }
            }
            const nextSlotId = `staff_${maxIdNum + 1}`;
            const newSlot = {
              id: nextSlotId,
              label: `Staff ${maxIdNum + 1}`,
              defaultName: staffName
            };

            serverConfig.staffSlots.push(newSlot);
            saveConfig(serverConfig);

            console.log(`[Settings] Owner ${clientData.name} added staff slot: ${newSlot.id} (${newSlot.defaultName})`);

            broadcastToAll({
              type: 'staff_slots_updated',
              staffSlots: serverConfig.staffSlots
            });
            broadcastPresence();

          } else if (msg.type === 'remove_staff_slot') {
            // Strictly Owner-only
            if (clientData.role !== 'owner') {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Unauthorized: Only Owners can manage staff.' }));
              return;
            }

            const slotToRemove = msg.slotId;
            if (!slotToRemove || serverConfig.staffSlots.length <= 1) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'At least one Staff slot must remain active.' }));
              return;
            }

            serverConfig.staffSlots = serverConfig.staffSlots.filter(s => s.id !== slotToRemove);
            saveConfig(serverConfig);

            console.log(`[Settings] Owner ${clientData.name} removed staff slot: ${slotToRemove}`);

            // Evict any client on that slot
            for (const [cWs, cData] of clients) {
              if (cData.slot === slotToRemove) {
                cWs.send(JSON.stringify({
                  type: 'slot_evicted',
                  message: 'Your staff station was removed by Owner.'
                }));
                cData.slot = null;
                cData.role = 'unknown';
              }
            }

            broadcastToAll({
              type: 'staff_slots_updated',
              staffSlots: serverConfig.staffSlots
            });
            broadcastPresence();

          } else if (msg.type === 'change_owner_pin') {
            // Strictly Owner-only
            if (clientData.role !== 'owner') {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Unauthorized: Only Owners can change PIN.' }));
              return;
            }

            const newPin = String(msg.newPin || '').trim();
            if (!newPin || newPin.length < 4) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Owner PIN must be at least 4 digits.' }));
              return;
            }

            serverConfig.ownerPin = newPin;
            saveConfig(serverConfig);
            console.log(`[Settings] Owner ${clientData.name} updated the Owner Security PIN.`);

            ws.send(JSON.stringify({
              type: 'pin_change_success',
              message: 'Owner Security PIN successfully updated!'
            }));
          }
        } catch (e) {
          console.error('Signaling error:', e);
        }
      }
    });

    ws.on('close', () => {
      if (clientData.isTalking) {
        broadcastToOthers(ws, { type: 'talk_stop', senderName: clientData.name });
      }
      clients.delete(ws);
      broadcastPresence();
    });

    ws.on('error', (err) => {
      console.error('Socket error:', err);
    });
  });

  // Keep background mobile sockets alive with regular pings
  setInterval(() => {
    for (const [ws] of clients) {
      if (ws.readyState === 1) {
        try {
          ws.ping();
        } catch (e) {}
      }
    }
  }, 10000);
}

function getActiveSlots() {
  const slots = {};
  for (const client of clients.values()) {
    if (client.slot) {
      slots[client.slot] = { name: client.name, role: client.role };
    }
  }
  return slots;
}

function broadcastPresence() {
  const presenceMsg = JSON.stringify({
    type: 'presence',
    count: clients.size,
    activeSlots: getActiveSlots()
  });

  for (const [ws] of clients) {
    if (ws.readyState === 1) {
      ws.send(presenceMsg);
    }
  }
}

function broadcastToOthers(senderWs, obj) {
  const str = JSON.stringify(obj);
  for (const [ws] of clients) {
    if (ws !== senderWs && ws.readyState === 1) {
      ws.send(str);
    }
  }
}

function broadcastToAll(obj) {
  const str = JSON.stringify(obj);
  for (const [ws] of clients) {
    if (ws.readyState === 1) {
      ws.send(str);
    }
  }
}

async function startServer() {
  const httpServer = http.createServer(app);
  const wssHttp = new WebSocketServer({ server: httpServer, path: '/ws' });
  setupWebSocketServer(wssHttp);

  if (isCloud) {
    // Cloud Hosting (Render, Railway, Koyeb, Glitch, etc.)
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log('\n======================================================');
      console.log('       📻 SRAT - WALKIE TALKIE CLOUD SERVER LIVE!     ');
      console.log('======================================================');
      console.log(`🌐 Server running on Port ${PORT}`);
      console.log('✔ WebSocket /ws endpoint attached.');
      console.log('✔ 24/7 Mobile & Desktop communication active.');
      console.log('======================================================\n');
    });
    return;
  }

  // Local Dev / Laptop Deployment
  const sslOptions = await getSslOptions();
  const httpsServer = https.createServer(sslOptions, app);
  const wssHttps = new WebSocketServer({ server: httpsServer, path: '/ws' });
  setupWebSocketServer(wssHttps);

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', async () => {
      console.log('\n======================================================');
      console.log('       📻 SRAT - WALKIE TALKIE SERVER STARTED!        ');
      console.log('======================================================');
      console.log('🌐 Generating high-speed mobile link...');

      // Start Cloudflare Tunnel for instant mobile connection (No Wi-Fi limits, No warnings)
      const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');
      if (fs.existsSync(cloudflaredPath)) {
        const { spawn } = require('child_process');
        const tunnel = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${HTTP_PORT}`]);

        let urlFound = false;
        const handleOutput = async (data) => {
          const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (match && !urlFound) {
            urlFound = true;
            const publicUrl = match[0];

            console.log('\n------------------------------------------------------');
            console.log('📱 MOBILE ACCESS LINK:');
            console.log(`👉  ${publicUrl}`);
            console.log('------------------------------------------------------');
            console.log('(Works on Mobile 4G, 5G, or Wi-Fi instantly)\n');

            // Save link inside project folder
            try {
              fs.writeFileSync(path.join(__dirname, 'Mobile-Link.txt'), `SRAT - WALKIE TALKIE Mobile Link:\n${publicUrl}\n`);
            } catch (e) {}

            try {
              const qrAscii = await QRCode.toString(publicUrl, { type: 'terminal', small: true });
              console.log('📷 Scan this QR code with your phone camera:');
              console.log(qrAscii);
            } catch (e) {}

            console.log('💻 LAPTOP ACCESS:');
            console.log(`👉  http://localhost:${HTTP_PORT}`);
            console.log('======================================================\n');

            // Automatically open browser on laptop
            try {
              require('child_process').exec(`start http://localhost:${HTTP_PORT}`);
            } catch (e) {}
          }
        };

        tunnel.stdout.on('data', handleOutput);
        tunnel.stderr.on('data', handleOutput);

        process.on('exit', () => tunnel.kill());
        process.on('SIGINT', () => { tunnel.kill(); process.exit(); });
      } else {
        try {
          require('child_process').exec(`start http://localhost:${HTTP_PORT}`);
        } catch (e) {}
      }
    });
  });
}

startServer().catch(err => {
  console.error('Server startup error:', err);
});
