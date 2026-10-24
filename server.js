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

const staticOptions = {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use(express.static(__dirname, staticOptions));

const configPath = path.join(__dirname, 'staff_config.json');
function loadConfig() {
  const defaultCfg = {
    appName: "KWT",
    appTitle: "KWT - Kotecha Family Walkie-Talkie",
    familyPin: "6880",
    members: [
      { id: "mem_1", name: "Mansukhbhai", icon: "👨‍🦳", relation: "વડીલ" },
      { id: "mem_2", name: "Sudhaben", icon: "👵", relation: "વડીલ" },
      { id: "mem_3", name: "Nimeeshbhai", icon: "👨", relation: "પરિવાર" },
      { id: "mem_4", name: "Umangben", icon: "👩", relation: "પરિવાર" },
      { id: "mem_5", "name": "Kalpeshbhai", "icon": "👨", "relation": "પરિવાર" },
      { id: "mem_6", "name": "Kajalben", "icon": "👩", "relation": "પરિવાર" },
      { id: "mem_7", "name": "Madhav", "icon": "👦", "relation": "પરિવાર" }
    ]
  };
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {}
  return defaultCfg;
}

let serverConfig = loadConfig();

app.get('/api/config', (req, res) => {
  res.json({
    appName: serverConfig.appName || "KWT",
    appTitle: serverConfig.appTitle || "KWT - Kotecha Family Walkie-Talkie",
    members: serverConfig.members
  });
});

async function getSslOptions() {
  const certDir = path.join(__dirname, 'ssl');
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }

  console.log('Generating SSL Certificate for secure LAN mobile mic access...');
  const attrs = [{ name: 'commonName', value: 'kwt-family.local' }];
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
        if (!iface.address.startsWith('169.254.')) {
          ips.unshift({ name, ip: iface.address });
        } else {
          ips.push({ name, ip: iface.address });
        }
      }
    }
  }
  return ips;
}

let isFamilyLineActive = true;
let lineLockedBy = 'Madhav';
const clients = new Map(); // ws -> { slot, name, isTalking }

function getActiveSlots() {
  const slots = {};
  for (const client of clients.values()) {
    if (client.slot) {
      slots[client.slot] = { name: client.name };
    }
  }
  return slots;
}

function broadcastPresence() {
  const msg = JSON.stringify({
    type: 'presence',
    count: clients.size,
    activeSlots: getActiveSlots()
  });
  for (const [ws] of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function broadcastToOthers(senderWs, obj) {
  const str = JSON.stringify(obj);
  for (const [ws] of clients) {
    if (ws !== senderWs && ws.readyState === 1) ws.send(str);
  }
}

function setupWebSocketServer(wss) {
  wss.on('connection', (ws) => {
    const clientData = {
      slot: null,
      name: 'Connecting...',
      isTalking: false
    };
    clients.set(ws, clientData);

    ws.send(JSON.stringify({
      type: 'initial_state',
      activeSlots: getActiveSlots(),
      members: serverConfig.members,
      lineActive: isFamilyLineActive
    }));

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Broadcast raw PCM voice packets only when line is active
        if (!isFamilyLineActive) return;
        for (const [clientWs] of clients) {
          if (clientWs !== ws && clientWs.readyState === 1) {
            clientWs.send(data, { binary: true });
          }
        }
      } else {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'set_line_state') {
            if (clientData.slot === 'mem_7') { // Madhav is Master Admin
              isFamilyLineActive = !!msg.active;
              lineLockedBy = clientData.name || 'Madhav';
              console.log(`[Master Switch] Madhav changed line active status to: ${isFamilyLineActive}`);
              const statusMsg = JSON.stringify({
                type: 'line_status',
                active: isFamilyLineActive,
                lockedBy: lineLockedBy
              });
              for (const [cWs] of clients) {
                if (cWs.readyState === 1) cWs.send(statusMsg);
              }
            } else {
              ws.send(JSON.stringify({
                type: 'slot_error',
                message: 'માત્ર માધવ પાસે જ લાઈન ચાલુ/બંધ કરવાનો અધિકાર છે!'
              }));
            }
            return;
          } else           if (msg.type === 'claim_slot') {
            const memberId = (msg.slot || '').toString().trim();
            const enteredPin = (msg.pin || '').toString().trim();
            const expectedPin = (memberId === 'mem_7') ? '2007' : '6880';

            if (enteredPin !== expectedPin) {
              const errMsg = (memberId === 'mem_7')
                ? 'Incorrect Security PIN! Please try again.'
                : 'Incorrect Security PIN! Please try again.';
              ws.send(JSON.stringify({
                type: 'slot_error',
                message: errMsg
              }));
              return;
            }

            clientData.slot = msg.slot;
            clientData.name = msg.name || 'Family Member';

            ws.send(JSON.stringify({
              type: 'slot_confirmed',
              slot: clientData.slot,
              name: clientData.name,
              members: serverConfig.members,
              lineActive: isFamilyLineActive
            }));

            console.log(`[Family Joined] ${clientData.name} (${clientData.slot}) is Online!`);
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

          } else if (msg.type === 'family_bell') {
            console.log(`[Bell Triggered] ${clientData.name} triggered ${msg.bellType}`);
            for (const [clientWs] of clients) {
              if (clientWs.readyState === 1) {
                clientWs.send(JSON.stringify({
                  type: 'family_bell',
                  bellType: msg.bellType, // 'chai' or 'urgent'
                  senderName: clientData.name
                }));
              }
            }
          }
        } catch (e) {
          console.error('Signaling error:', e);
        }
      }
    });

    ws.on('close', () => {
      if (clientData.name) {
        console.log(`[Disconnected] ${clientData.name}`);
      }
      clients.delete(ws);
      broadcastPresence();
    });

    ws.on('error', () => {
      clients.delete(ws);
      broadcastPresence();
    });
  });

  setInterval(() => {
    for (const [ws] of clients) {
      if (!ws.isAlive) {
        clients.delete(ws);
        ws.terminate();
        broadcastPresence();
      } else {
        ws.isAlive = false;
        try { ws.ping(); } catch (e) {}
      }
    }
  }, 10000);
}

async function startServer() {
  const httpServer = http.createServer(app);
  const wssHttp = new WebSocketServer({ server: httpServer, path: '/ws' });
  setupWebSocketServer(wssHttp);

  if (isCloud) {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log('\n======================================================');
      console.log('       📻 KWT - KOTECHA FAMILY WALKIE-TALKIE LIVE!     ');
      console.log('======================================================');
      console.log(`🌐 Server running on Port ${PORT}`);
      console.log('✔ Family voice channel 24/7 active.');
      console.log('======================================================\n');
    });
    return;
  }

  const sslOptions = await getSslOptions();
  const httpsServer = https.createServer(sslOptions, app);
  const wssHttps = new WebSocketServer({ server: httpsServer, path: '/ws' });
  setupWebSocketServer(wssHttps);

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', async () => {
      console.log('\n======================================================');
      console.log('       📻 KWT - KOTECHA FAMILY WALKIE-TALKIE LIVE!     ');
      console.log('======================================================');
      
      const localIps = getLocalIps();
      console.log('🌐 LAN Wi-Fi Links for Family Phones:');
      for (const item of localIps) {
        console.log(`   👉 https://${item.ip}:${HTTPS_PORT}`);
      }

      console.log(`\n💻 LAPTOP ACCESS: http://localhost:${HTTP_PORT}`);
      console.log('======================================================\n');

      try {
        require('child_process').exec(`start http://localhost:${HTTP_PORT}`);
      } catch (e) {}
    });
  });
}

startServer().catch(err => {
  console.error('Server startup error:', err);
});
