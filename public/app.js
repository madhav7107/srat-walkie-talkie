// ========================================================================
// KWT - Kotecha Family Walkie-Talkie (Client Core with Madhav Master Admin)
// ========================================================================
(() => {
  // DOM Elements - Screens
  const loginScreen = document.getElementById('loginScreen');
  const radioScreen = document.getElementById('radioScreen');

  // Login Screen Elements
  const memberGrid = document.getElementById('memberGrid');
  const loginPinInput = document.getElementById('loginPinInput');
  const loginError = document.getElementById('loginError');
  const btnEnterRadio = document.getElementById('btnEnterRadio');

  // Radio Screen Elements
  const networkLed = document.getElementById('networkLed');
  const counterText = document.getElementById('counterText');
  const btnSwitchUser = document.getElementById('btnSwitchUser');
  const currentUserNameTag = document.getElementById('currentUserNameTag');
  const rosterGrid = document.getElementById('rosterGrid');
  const lcdScreen = document.getElementById('lcdScreen');
  const lcdMainStatus = document.getElementById('lcdMainStatus');
  const lcdSubStatus = document.getElementById('lcdSubStatus');
  const audioWaveBars = document.getElementById('audioWaveBars');
  const btnChaiBell = document.getElementById('btnChaiBell');
  const btnUrgentAlert = document.getElementById('btnUrgentAlert');
  const btnPttGiant = document.getElementById('btnPttGiant');
  const pttMainLabel = document.getElementById('pttMainLabel');
  const pttSubLabel = document.getElementById('pttSubLabel');
  const pttPulseRing = document.getElementById('pttPulseRing');
  const btnMuteToggle = document.getElementById('btnMuteToggle');
  const muteIcon = document.getElementById('muteIcon');
  const volumeSlider = document.getElementById('volumeSlider');
  const silentAudio = document.getElementById('silentAudio');

  // Master Control (Madhav Exclusive)
  const masterControlBar = document.getElementById('masterControlBar');
  const btnMasterToggle = document.getElementById('btnMasterToggle');
  const masterToggleIcon = document.getElementById('masterToggleIcon');
  const masterToggleText = document.getElementById('masterToggleText');

  // Family Members Definition
  const FAMILY_MEMBERS = [
    { id: "mem_1", name: "Mansukhbhai", icon: "👨‍🦳", relation: "વડીલ" },
    { id: "mem_2", name: "Sudhaben", icon: "👵", relation: "વડીલ" },
    { id: "mem_3", name: "Nimeeshbhai", icon: "👨", relation: "પરિવાર" },
    { id: "mem_4", name: "Umangben", icon: "👩", relation: "પરિવાર" },
    { id: "mem_5", name: "Kalpeshbhai", icon: "👨", relation: "પરિવાર" },
    { id: "mem_6", name: "Kajalben", icon: "👩", relation: "પરિવાર" },
    { id: "mem_7", name: "Madhav", icon: "👦", relation: "પરિવાર" }
  ];

  // State
  let myId = localStorage.getItem('kwt_member_id') || 'mem_7';
  let myName = localStorage.getItem('kwt_member_name') || 'Madhav';
  let myIcon = '👦';
  let isLoggedIn = false;
  let isTransmitting = false;
  let isMuted = false;
  let isLineActive = true; // Controlled by Madhav
  let ws = null;
  let reconnectTimer = null;
  let activeSlots = {};
  let currentSpeakerSlot = null;
  let wakeLock = null;

  // Web Audio Context & Nodes
  let audioCtx = null;
  let micStream = null;
  let micSource = null;
  let scriptProcessor = null;
  let speakerGainNode = null;
  let nextPlayTime = 0;

  // Initialize Member Selection in Login View
  function initLoginSelection() {
    const cards = memberGrid ? memberGrid.querySelectorAll('.member-card') : [];
    cards.forEach(card => {
      const id = card.getAttribute('data-id');
      if (id === myId) {
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        myName = card.getAttribute('data-name');
        const iconSpan = card.querySelector('.member-icon');
        if (iconSpan) myIcon = iconSpan.textContent.trim();
      }

      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        myId = card.getAttribute('data-id');
        myName = card.getAttribute('data-name');
        const iconSpan = card.querySelector('.member-icon');
        if (iconSpan) myIcon = iconSpan.textContent.trim();
        if (loginError) loginError.style.display = 'none';
      });
    });

    const savedPin = localStorage.getItem('kwt_pin');
    if (savedPin && loginPinInput) {
      loginPinInput.value = savedPin;
    }
  }

  // Render Live Roster
  function renderRoster() {
    if (!rosterGrid) return;
    let onlineCount = 0;
    let html = '';

    FAMILY_MEMBERS.forEach(mem => {
      const isOnline = !!activeSlots[mem.id];
      if (isOnline) onlineCount++;
      const isSpeaking = (currentSpeakerSlot === mem.id) || (isTransmitting && mem.id === myId);

      html += `
        <div class="roster-card ${isOnline ? 'online' : 'offline'} ${isSpeaking ? 'speaking' : ''}" id="roster_${mem.id}">
          <div class="roster-avatar">${mem.icon}</div>
          <div class="roster-meta">
            <span class="roster-name">${mem.name}</span>
            <span class="roster-status-lbl">${isSpeaking ? '📢 બોલે છે' : (isOnline ? '🟢 ઓનલાઈન' : '⚪ ઓફલાઈન')}</span>
          </div>
          <span class="status-indicator-dot"></span>
        </div>
      `;
    });

    rosterGrid.innerHTML = html;
    if (counterText) {
      counterText.textContent = `${onlineCount} / ${FAMILY_MEMBERS.length} હાજર`;
    }
  }

  // Master Line Active State Synchronizer
  function updateLineState(active, updatedBy = 'Madhav') {
    isLineActive = active;

    if (!isLineActive) {
      // Locked State
      if (btnPttGiant) btnPttGiant.disabled = true;
      if (btnChaiBell) btnChaiBell.disabled = true;
      if (btnUrgentAlert) btnUrgentAlert.disabled = true;

      if (lcdMainStatus) {
        lcdMainStatus.innerHTML = '⛔ લાઈન બંધ છે (માધવ દ્વારા લૉક)';
      }
      if (lcdSubStatus) {
        lcdSubStatus.textContent = 'માધવ લાઈન ચાલુ કરશે ત્યારે જ વાત થશે';
      }
      if (pttMainLabel) pttMainLabel.textContent = 'લાઈન બંધ છે';
      if (pttSubLabel) pttSubLabel.textContent = 'માધવ દ્વારા લૉક';

      if (masterToggleIcon) masterToggleIcon.textContent = '🔴';
      if (masterToggleText) masterToggleText.textContent = 'લાઈન બંધ છે (ચાલુ કરવા દબાવો)';
      if (btnMasterToggle) btnMasterToggle.className = 'btn-master-toggle line-locked';
      if (lcdScreen) lcdScreen.classList.add('line-off');

      if (isTransmitting) {
        stopTransmitting();
      }
    } else {
      // Active State
      if (btnPttGiant) btnPttGiant.disabled = false;
      if (btnChaiBell) btnChaiBell.disabled = false;
      if (btnUrgentAlert) btnUrgentAlert.disabled = false;

      if (!currentSpeakerSlot) {
        if (lcdMainStatus) lcdMainStatus.innerHTML = '🟢 લાઈન તૈયાર છે (શાંત છે)';
        if (lcdSubStatus) lcdSubStatus.textContent = 'વાત કરવા માટે નીચેનું બટન દબાવી રાખો';
      }
      if (pttMainLabel) pttMainLabel.textContent = 'દબાવી રાખો';
      if (pttSubLabel) pttSubLabel.textContent = 'અને બોલો';

      if (masterToggleIcon) masterToggleIcon.textContent = '🟢';
      if (masterToggleText) masterToggleText.textContent = 'લાઈન ચાલુ છે (બંધ કરવા દબાવો)';
      if (btnMasterToggle) btnMasterToggle.className = 'btn-master-toggle line-active';
      if (lcdScreen) lcdScreen.classList.remove('line-off');
    }
  }

  // Audio Context Initialization
  function initAudio() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass({ sampleRate: 16000 });
      speakerGainNode = audioCtx.createGain();
      speakerGainNode.gain.value = volumeSlider ? parseFloat(volumeSlider.value) : 1.0;
      speakerGainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    if (silentAudio && silentAudio.paused) {
      silentAudio.play().catch(() => {});
    }
    acquireWakeLock();
  }

  // Screen Wake Lock
  async function acquireWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {}
    }
  }

  // Audio Tones & Chimes
  function playBeep(freq, duration, type = 'sine', gain = 0.15) {
    try {
      if (!audioCtx) initAudio();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(g);
      g.connect(speakerGainNode || audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  // Chai Bell
  function playChaiBell() {
    try {
      if (!audioCtx) initAudio();
      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const g1 = audioCtx.createGain();
      osc1.frequency.setValueAtTime(587.33, now);
      g1.gain.setValueAtTime(0.25, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(g1);
      g1.connect(speakerGainNode || audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      const osc2 = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      osc2.frequency.setValueAtTime(440.0, now + 0.4);
      g2.gain.setValueAtTime(0.25, now + 0.4);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc2.connect(g2);
      g2.connect(speakerGainNode || audioCtx.destination);
      osc2.start(now + 0.4);
      osc2.stop(now + 1.2);
    } catch (e) {}
  }

  // Urgent Alert
  function playUrgentAlert() {
    try {
      if (!audioCtx) initAudio();
      let t = audioCtx.currentTime;
      for (let i = 0; i < 4; i++) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 1046, t);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
        osc.connect(g);
        g.connect(speakerGainNode || audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
        t += 0.2;
      }
    } catch (e) {}
  }

  // Microphone Streaming Setup
  async function requestMicrophone() {
    if (micStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone not supported on this browser.');
    }

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    micSource = audioCtx.createMediaStreamSource(micStream);
    const bufferSize = 1024;
    scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

    scriptProcessor.onaudioprocess = (e) => {
      if (!isTransmitting || !isLineActive || !ws || ws.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      ws.send(pcm16.buffer);
    };

    micSource.connect(scriptProcessor);
    scriptProcessor.connect(audioCtx.destination);
  }

  // Audio Playback with Jitter Buffering
  function playAudioChunk(arrayBuffer) {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    const pcm16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
    }

    const audioBuffer = audioCtx.createBuffer(1, float32.length, 16000);
    audioBuffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(speakerGainNode);

    const now = audioCtx.currentTime;
    if (nextPlayTime < now || nextPlayTime > now + 0.05) {
      nextPlayTime = now + 0.005;
    }
    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
  }

  // WebSocket Connection
  function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      if (networkLed) networkLed.className = 'counter-dot connected';
      if (isLoggedIn) {
        sendClaimSlot();
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          handleSignaling(msg);
        } catch (e) {}
      } else if (event.data instanceof ArrayBuffer) {
        if (!isMuted && !isTransmitting && isLineActive) {
          playAudioChunk(event.data);
        }
      }
    };

    ws.onclose = () => {
      if (networkLed) networkLed.className = 'counter-dot';
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
      if (networkLed) networkLed.className = 'counter-dot';
    };
  }

  function sendClaimSlot() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pin = (loginPinInput ? loginPinInput.value : '') || localStorage.getItem('kwt_pin') || '6880';
    ws.send(JSON.stringify({
      type: 'claim_slot',
      slot: myId,
      name: myName,
      pin: pin.trim()
    }));
  }

  function handleSignaling(msg) {
    if (msg.type === 'initial_state' || msg.type === 'presence') {
      activeSlots = msg.activeSlots || {};
      if (typeof msg.lineActive === 'boolean') {
        updateLineState(msg.lineActive);
      }
      renderRoster();
    } else if (msg.type === 'slot_confirmed') {
      isLoggedIn = true;
      activeSlots[myId] = { name: myName };
      if (typeof msg.lineActive === 'boolean') {
        updateLineState(msg.lineActive);
      }
      renderRoster();
      switchToRadioScreen();
    } else if (msg.type === 'slot_error') {
      if (loginError) {
        loginError.textContent = msg.message || 'ખોટો PIN છે!';
        loginError.style.display = 'block';
      }
      switchToLoginScreen();
    } else if (msg.type === 'line_status') {
      updateLineState(msg.active, msg.lockedBy);
    } else if (msg.type === 'talk_start') {
      if (!isLineActive) return;
      currentSpeakerSlot = msg.senderSlot;
      renderRoster();
      if (lcdMainStatus) {
        lcdMainStatus.innerHTML = `📢 <strong>${msg.senderName}</strong> બોલી રહ્યા છે...`;
      }
      if (lcdSubStatus) {
        lcdSubStatus.textContent = 'ધ્યાનથી સાંભળો';
      }
      if (lcdScreen) lcdScreen.classList.add('receiving');
      if (audioWaveBars) audioWaveBars.classList.add('active');
    } else if (msg.type === 'talk_stop') {
      currentSpeakerSlot = null;
      renderRoster();
      if (isLineActive) {
        if (lcdMainStatus) lcdMainStatus.innerHTML = '🟢 લાઈન તૈયાર છે (શાંત છે)';
        if (lcdSubStatus) lcdSubStatus.textContent = 'વાત કરવા માટે નીચેનું બટન દબાવી રાખો';
      }
      if (lcdScreen) lcdScreen.classList.remove('receiving');
      if (audioWaveBars) audioWaveBars.classList.remove('active');
    } else if (msg.type === 'family_bell') {
      if (!isLineActive) return;
      if (msg.bellType === 'chai') {
        playChaiBell();
        if (lcdMainStatus) {
          lcdMainStatus.innerHTML = `☕ <strong>${msg.senderName}</strong>: ચા / જમવાનો સમય!`;
        }
      } else {
        playUrgentAlert();
        if (lcdMainStatus) {
          lcdMainStatus.innerHTML = `🚨 <strong>${msg.senderName}</strong>: ઇમરજન્સી એલર્ટ!`;
        }
      }
      setTimeout(() => {
        if (!currentSpeakerSlot && lcdMainStatus && isLineActive) {
          lcdMainStatus.innerHTML = '🟢 લાઈન તૈયાર છે (શાંત છે)';
        }
      }, 5000);
    }
  }

  // Screen Switchers
  function switchToRadioScreen() {
    if (loginScreen) loginScreen.style.display = 'none';
    if (radioScreen) radioScreen.style.display = 'flex';
    if (currentUserNameTag) {
      const mem = FAMILY_MEMBERS.find(m => m.id === myId);
      currentUserNameTag.textContent = `${mem ? mem.icon : '👦'} ${myName}`;
    }

    // Only Madhav gets Super Admin Master Control
    if (masterControlBar) {
      if (myId === 'mem_7') {
        masterControlBar.style.display = 'flex';
      } else {
        masterControlBar.style.display = 'none';
      }
    }

    updateLineState(isLineActive);
    renderRoster();
  }

  function switchToLoginScreen() {
    isLoggedIn = false;
    if (radioScreen) radioScreen.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
  }

  // PTT Actions
  async function startTransmitting() {
    if (!isLineActive || isTransmitting) return;
    initAudio();

    if (!micStream) {
      try {
        await requestMicrophone();
      } catch (err) {
        alert('માઇક્રોફોનની પરવાનગી જરૂરી છે!');
        return;
      }
    }

    isTransmitting = true;
    if (btnPttGiant) btnPttGiant.classList.add('active');
    if (pttPulseRing) pttPulseRing.classList.add('pulse');
    if (pttMainLabel) pttMainLabel.textContent = 'તમે બોલો છો';
    if (pttSubLabel) pttSubLabel.textContent = 'બધા સાંભળી રહ્યા છે';

    if (lcdMainStatus) {
      lcdMainStatus.innerHTML = `🎙️ <strong>તમે ( ${myName} )</strong> બોલી રહ્યા છો...`;
    }
    if (lcdSubStatus) {
      lcdSubStatus.textContent = 'વાત પૂરી થાય એટલે બટન છોડી દો';
    }
    if (lcdScreen) lcdScreen.classList.add('transmitting');
    if (audioWaveBars) audioWaveBars.classList.add('active');

    playBeep(900, 0.05, 'sine', 0.1);
    if (navigator.vibrate) navigator.vibrate(50);

    renderRoster();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'talk_start' }));
    }
  }

  function stopTransmitting() {
    if (!isTransmitting) return;
    isTransmitting = false;

    if (btnPttGiant) btnPttGiant.classList.remove('active');
    if (pttPulseRing) pttPulseRing.classList.remove('pulse');

    if (isLineActive) {
      if (pttMainLabel) pttMainLabel.textContent = 'દબાવી રાખો';
      if (pttSubLabel) pttSubLabel.textContent = 'અને બોલો';
      if (lcdMainStatus) lcdMainStatus.innerHTML = '🟢 લાઈન તૈયાર છે (શાંત છે)';
      if (lcdSubStatus) lcdSubStatus.textContent = 'વાત કરવા માટે નીચેનું બટન દબાવી રાખો';
    } else {
      if (pttMainLabel) pttMainLabel.textContent = 'લાઈન બંધ છે';
      if (pttSubLabel) pttSubLabel.textContent = 'માધવ દ્વારા લૉક';
    }

    if (lcdScreen) lcdScreen.classList.remove('transmitting');
    if (audioWaveBars) audioWaveBars.classList.remove('active');

    playBeep(450, 0.04, 'sine', 0.08); // Roger click
    renderRoster();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'talk_stop' }));
    }
  }

  // Setup Event Listeners
  function setupListeners() {
    // Master Super Admin Toggle (Madhav only)
    if (btnMasterToggle) {
      btnMasterToggle.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const nextState = !isLineActive;
          ws.send(JSON.stringify({
            type: 'set_line_state',
            active: nextState
          }));
        }
      });
    }

    // Login Submit
    if (btnEnterRadio) {
      btnEnterRadio.addEventListener('click', () => {
        initAudio();
        const pin = (loginPinInput ? loginPinInput.value : '').trim();
        if (pin !== '6880') {
          if (loginError) {
            loginError.textContent = 'ખોટો PIN છે! PIN "6880" નાખો.';
            loginError.style.display = 'block';
          }
          return;
        }

        localStorage.setItem('kwt_member_id', myId);
        localStorage.setItem('kwt_member_name', myName);
        localStorage.setItem('kwt_pin', pin);

        if (loginError) loginError.style.display = 'none';

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectWebSocket();
        } else {
          sendClaimSlot();
        }
      });
    }

    // Switch User Button
    if (btnSwitchUser) {
      btnSwitchUser.addEventListener('click', () => {
        switchToLoginScreen();
      });
    }

    // Quick Family Bells
    if (btnChaiBell) {
      btnChaiBell.addEventListener('click', () => {
        if (!isLineActive) return;
        initAudio();
        playChaiBell();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'family_bell', bellType: 'chai' }));
        }
      });
    }

    if (btnUrgentAlert) {
      btnUrgentAlert.addEventListener('click', () => {
        if (!isLineActive) return;
        initAudio();
        playUrgentAlert();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'family_bell', bellType: 'urgent' }));
        }
      });
    }

    // PTT Giant Button Events
    if (btnPttGiant) {
      btnPttGiant.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        startTransmitting();
      });
      btnPttGiant.addEventListener('pointerup', (e) => {
        e.preventDefault();
        stopTransmitting();
      });
      btnPttGiant.addEventListener('pointerleave', (e) => {
        stopTransmitting();
      });
      btnPttGiant.addEventListener('pointercancel', (e) => {
        stopTransmitting();
      });
    }

    // Keyboard Spacebar PTT Support
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && isLoggedIn && isLineActive && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        startTransmitting();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && isLoggedIn && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        stopTransmitting();
      }
    });

    // Volume Slider & Mute Toggle
    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        if (speakerGainNode) {
          speakerGainNode.gain.value = parseFloat(volumeSlider.value);
        }
      });
    }

    if (btnMuteToggle) {
      btnMuteToggle.addEventListener('click', () => {
        isMuted = !isMuted;
        if (muteIcon) muteIcon.textContent = isMuted ? '🔇' : '🔊';
        if (speakerGainNode) {
          speakerGainNode.gain.value = isMuted ? 0 : parseFloat(volumeSlider.value);
        }
      });
    }
  }

  // Initialization Entry
  initLoginSelection();
  setupListeners();
  connectWebSocket();

  // If already logged in previously, restore session directly
  const savedPin = localStorage.getItem('kwt_pin');
  if (savedPin === '6880' && localStorage.getItem('kwt_member_id')) {
    myId = localStorage.getItem('kwt_member_id');
    myName = localStorage.getItem('kwt_member_name') || 'Madhav';
    isLoggedIn = true;
    switchToRadioScreen();
  }

})();
