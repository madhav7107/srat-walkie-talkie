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

// Serve static assets (support both root directory and public folder with zero stale cache)
const staticOptions = {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(__dirname, staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

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
    stations: [
      { id: 'station_1', name: 'Nimeeshbhai', pin: '3005' },
      { id: 'station_2', name: 'Kalpeshbhai', pin: '1111' },
      { id: 'station_3', name: 'Madhav', pin: '7107' },
      { id: 'station_4', name: 'Sagarbhai', pin: '0954' },
      { id: 'station_5', name: 'Devraj', pin: '1234' }
    ]
  };
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && Array.isArray(parsed.stations) && parsed.stations.length > 0) {
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
    console.error('Error saving stations config:', e);
  }
}

let serverConfig = loadConfig();

let globalShiftActive = true;
let globalShiftOwner = 'System';

const clients = new Map(); // ws -> { slot, role, name, isTalking }

function setupWebSocketServer(wss) {
  wss.on('connection', (ws) => {
    const clientData = {
      slot: null,
      role: 'user',
      name: 'Connecting...',
      isTalking: false
    };
    clients.set(ws, clientData);

    // Send initial status with all stations
    ws.send(JSON.stringify({
      type: 'initial_state',
      globalShiftActive: true,
      globalShiftOwner: 'System',
      activeSlots: getActiveSlots(),
      stations: (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name }))
    }));

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // High-speed binary voice broadcast directly to all other connected stations
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
            const requestedSlot = msg.slot;
            const enteredPin = String(msg.pin || '').trim();

            const targetStation = (serverConfig.stations || []).find(s => s.id === requestedSlot);
            if (!targetStation) {
              ws.send(JSON.stringify({
                type: 'slot_error',
                message: 'Invalid station selection.'
              }));
              return;
            }

            if (enteredPin !== String(targetStation.pin)) {
              ws.send(JSON.stringify({
                type: 'slot_error',
                message: `Incorrect Security PIN for ${targetStation.name}. Please try again.`
              }));
              return;
            }

            clientData.slot = requestedSlot;
            clientData.name = targetStation.name;
            clientData.role = 'user';

            ws.send(JSON.stringify({
              type: 'slot_confirmed',
              slot: clientData.slot,
              name: clientData.name,
              globalShiftActive: true,
              stations: (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name }))
            }));

            broadcastPresence();
          } else if (msg.type === 'talk_start') {
            clientData.isTalking = true;
            broadcastToOthers(ws, {
              type: 'talk_start',
              senderName: clientData.name,
              senderSlot: clientData.slot
            });
          } else if (msg.type === 'talk_stop') {
            clientData.isTalking = false;
            broadcastToOthers(ws, {
              type: 'talk_stop',
              senderName: clientData.name,
              senderSlot: clientData.slot
            });
          } else if (msg.type === 'change_pin') {
            const newPin = String(msg.newPin || '').trim();
            if (!newPin || newPin.length < 4) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Security PIN must be at least 4 digits.' }));
              return;
            }

            const targetStation = (serverConfig.stations || []).find(s => s.id === clientData.slot);
            if (targetStation) {
              targetStation.pin = newPin;
              saveConfig(serverConfig);
              console.log(`[Settings] Station ${clientData.name} updated their Security PIN.`);
              ws.send(JSON.stringify({
                type: 'pin_change_success',
                message: `Security PIN for ${clientData.name} updated successfully!`,
                newPin: newPin
              }));
            }
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
