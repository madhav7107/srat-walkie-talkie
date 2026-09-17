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
      isTalking: false,
      currentChannel: 'all'
    };
    clients.set(ws, clientData);

    // Send initial status with all stations
    ws.send(JSON.stringify({
      type: 'initial_state',
      globalShiftActive: globalShiftActive,
      globalShiftOwner: globalShiftOwner,
      activeSlots: getActiveSlots(),
      stations: (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role }))
    }));

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // High-speed binary voice broadcast directly to all other connected stations
        if (!globalShiftActive && clientData.role !== 'owner') {
          return;
        }
        const isOwnerPrivate = (clientData.role === 'owner' && clientData.currentChannel === 'owners');

        for (const [clientWs, cData] of clients) {
          if (clientWs !== ws && clientWs.readyState === 1) { // 1 = OPEN
            // If private owner channel, ONLY send to other owners! Staff never receives this audio!
            if (isOwnerPrivate && cData.role !== 'owner') {
              continue;
            }
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
            clientData.role = targetStation.role || (['station_1', 'station_2', 'station_3'].includes(requestedSlot) ? 'owner' : 'staff');

            ws.send(JSON.stringify({
              type: 'slot_confirmed',
              slot: clientData.slot,
              name: clientData.name,
              role: clientData.role,
              globalShiftActive: globalShiftActive,
              globalShiftOwner: globalShiftOwner,
              stations: clientData.role === 'owner'
                ? (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role, pin: s.pin }))
                : (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role }))
            }));

            broadcastPresence();
          } else if (msg.type === 'talk_start') {
            if (!globalShiftActive && clientData.role !== 'owner') {
              ws.send(JSON.stringify({
                type: 'shift_blocked',
                message: '⚠️ SHIFT IS STOPPED!\n\nOwners need to start the shift before staff can speak.\nPlease ask the Owners to start the shift.'
              }));
              return;
            }
            clientData.isTalking = true;
            clientData.currentChannel = (clientData.role === 'owner' && msg.channel === 'owners') ? 'owners' : 'all';
            const isOwnerPrivate = (clientData.currentChannel === 'owners');

            for (const [clientWs, cData] of clients) {
              if (clientWs !== ws && clientWs.readyState === 1) {
                // If owner private, only notify other owners!
                if (isOwnerPrivate && cData.role !== 'owner') {
                  continue;
                }
                clientWs.send(JSON.stringify({
                  type: 'talk_start',
                  senderName: clientData.name,
                  senderSlot: clientData.slot,
                  senderRole: clientData.role,
                  channel: clientData.currentChannel
                }));
              }
            }
          } else if (msg.type === 'talk_stop') {
            clientData.isTalking = false;
            const isOwnerPrivate = (clientData.currentChannel === 'owners');
            for (const [clientWs, cData] of clients) {
              if (clientWs !== ws && clientWs.readyState === 1) {
                if (isOwnerPrivate && cData.role !== 'owner') {
                  continue;
                }
                clientWs.send(JSON.stringify({
                  type: 'talk_stop',
                  senderName: clientData.name,
                  senderSlot: clientData.slot,
                  channel: clientData.currentChannel
                }));
              }
            }
          } else if (msg.type === 'set_shift') {
            if (clientData.role !== 'owner') {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Only Owners (Nimeeshbhai, Kalpeshbhai, Madhav) can start or stop the shift.' }));
              return;
            }
            globalShiftActive = !!msg.active;
            globalShiftOwner = 'Owners';
            console.log(`[Shift] Changed by ${clientData.name} -> ${globalShiftActive ? 'ACTIVE' : 'STOPPED'}`);
            broadcastToAll({
              type: 'shift_status',
              active: globalShiftActive,
              ownerName: 'Owners'
            });
          } else if (msg.type === 'add_station') {
            if (clientData.role !== 'owner') {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Only Owners can add new persons.' }));
              return;
            }
            const newName = String(msg.name || '').trim();
            const newPin = String(msg.pin || '').trim();
            if (!newName) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Name cannot be empty.' }));
              return;
            }
            if (!newPin || newPin.length < 4) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Security PIN must be at least 4 digits.' }));
              return;
            }
            const newId = `station_${Date.now()}`;
            serverConfig.stations.push({
              id: newId,
              name: newName,
              pin: newPin,
              role: 'staff'
            });
            saveConfig(serverConfig);
            console.log(`[Station Added] ${newName} (${newId}) added by ${clientData.name}`);
            
            for (const [cWs, cData] of clients) {
              if (cWs.readyState === 1) {
                cWs.send(JSON.stringify({
                  type: 'stations_updated',
                  stations: cData.role === 'owner'
                    ? (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role, pin: s.pin }))
                    : (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role }))
                }));
              }
            }
          } else if (msg.type === 'remove_station') {
            if (clientData.role !== 'owner') {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Only Owners can remove persons.' }));
              return;
            }
            const removeId = msg.stationId;
            if (['station_1', 'station_2', 'station_3'].includes(removeId)) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Cannot remove primary owner stations.' }));
              return;
            }
            const idx = serverConfig.stations.findIndex(s => s.id === removeId);
            if (idx !== -1) {
              const removed = serverConfig.stations.splice(idx, 1)[0];
              saveConfig(serverConfig);
              console.log(`[Station Removed] ${removed.name} removed by ${clientData.name}`);
              for (const [cWs, cData] of clients) {
                if (cData.slot === removeId) {
                  cWs.send(JSON.stringify({ type: 'slot_evicted', message: 'Your station has been removed by the Owners.' }));
                }
              }
              for (const [cWs, cData] of clients) {
                if (cWs.readyState === 1) {
                  cWs.send(JSON.stringify({
                    type: 'stations_updated',
                    stations: cData.role === 'owner'
                      ? (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role, pin: s.pin }))
                      : (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role }))
                  }));
                }
              }
            }
          } else if (msg.type === 'change_pin') {
            const newPin = String(msg.newPin || '').trim();
            const targetId = msg.stationId || clientData.slot;
            if (clientData.role !== 'owner' && clientData.slot !== targetId) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Permission denied.' }));
              return;
            }
            if (!newPin || newPin.length < 4) {
              ws.send(JSON.stringify({ type: 'settings_error', message: 'Security PIN must be at least 4 digits.' }));
              return;
            }

            const targetStation = (serverConfig.stations || []).find(s => s.id === targetId);
            if (targetStation) {
              targetStation.pin = newPin;
              saveConfig(serverConfig);
              console.log(`[Settings] Station ${targetStation.name} PIN updated to ${newPin}`);
              ws.send(JSON.stringify({
                type: 'pin_change_success',
                message: `Security PIN for ${targetStation.name} updated to ${newPin}!`,
                newPin: newPin
              }));
              for (const [cWs, cData] of clients) {
                if (cWs.readyState === 1 && cData.role === 'owner') {
                  cWs.send(JSON.stringify({
                    type: 'stations_updated',
                    stations: (serverConfig.stations || []).map(s => ({ id: s.id, name: s.name, role: s.role, pin: s.pin }))
                  }));
                }
              }
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
