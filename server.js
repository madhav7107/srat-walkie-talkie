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

const isCloud = !!process.env.PORT || !!process.env.RENDER;
if (!isCloud) {
  freePort(3000);
  freePort(3443);
}

const app = express();
const PORT = process.env.PORT || 3000;
const HTTP_PORT = PORT;
const HTTPS_PORT = 3443;

// Serve static assets from public folder
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

let globalShiftActive = false;
let globalShiftOwner = '';
const OWNER_PIN = '1234'; // Default PIN for 3 Owner slots

const clients = new Map(); // ws -> { slot, role, name, isTalking }

function setupWebSocketServer(wss) {
  wss.on('connection', (ws) => {
    const clientData = {
      slot: null,
      role: 'unknown',
      name: 'Connecting...',
      isTalking: false
    };
    clients.set(ws, clientData);

    // Send initial status
    ws.send(JSON.stringify({
      type: 'initial_state',
      globalShiftActive,
      globalShiftOwner,
      activeSlots: getActiveSlots()
    }));

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // High-speed binary voice broadcast to all OTHER clients ONLY IF shift is active
        if (!globalShiftActive) return;
        for (const [clientWs] of clients) {
          if (clientWs !== ws && clientWs.readyState === 1) { // 1 = OPEN
            clientWs.send(data, { binary: true });
          }
        }
      } else {
        // Signaling message (JSON)
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'claim_slot') {
            const requestedSlot = msg.slot; // 'owner_1'|'owner_2'|'owner_3'|'staff_1'|'staff_2'

            // Check if Owner and verify PIN
            if (requestedSlot.startsWith('owner_')) {
              if (msg.pin !== OWNER_PIN) {
                ws.send(JSON.stringify({
                  type: 'slot_error',
                  message: 'Incorrect Owner PIN. Default PIN is 1234.'
                }));
                return;
              }
              clientData.role = 'owner';
            } else if (requestedSlot.startsWith('staff_')) {
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
              globalShiftOwner
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
          } else if (msg.type === 'talk_start') {
            if (!globalShiftActive) return;
            clientData.isTalking = true;
            broadcastToOthers(ws, {
              type: 'talk_start',
              senderName: clientData.name,
              senderRole: clientData.role,
              senderSlot: clientData.slot
            });
          } else if (msg.type === 'talk_stop') {
            clientData.isTalking = false;
            broadcastToOthers(ws, {
              type: 'talk_stop',
              senderName: clientData.name
            });
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
