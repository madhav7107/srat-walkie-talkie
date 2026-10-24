// ========================================================================
// KWT - Kotecha Family Walkie-Talkie (Ultra-Reliable Client Engine)
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
    { id: "mem_1", name: "Mansukhbhai", icon: "👨‍🦳", relation: "Elder" },
    { id: "mem_2", name: "Sudhaben", icon: "👵", relation: "Elder" },
    { id: "mem_3", name: "Nimeeshbhai", icon: "👨", relation: "Family" },
    { id: "mem_4", name: "Umangben", icon: "👩", relation: "Family" },
    { id: "mem_5", name: "Kalpeshbhai", icon: "👨", relation: "Family" },
    { id: "mem_6", name: "Kajalben", icon: "👩", relation: "Family" },
    { id: "mem_7", name: "Madhav", icon: "👦", relation: "Super Admin" }
  ];

  // State
  let myId = localStorage.getItem('kwt_member_id') || 'mem_1';
  let myName = localStorage.getItem('kwt_member_name') || 'Mansukhbhai';
  let isLoggedIn = false;
  let isTransmitting = false;
  let isMuted = false;
  let isLineActive = true;
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
      }

      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        myId = card.getAttribute('data-id');
        myName = card.getAttribute('data-name');
        if (loginError) loginError.style.display = 'none';
        // Do NOT clear user's input if they already typed PIN
      });
    });

    if (loginPinInput) {
      loginPinInput.value = '';
    }
  }

  // Render Live Roster with Compact 1 to 7 Numbered Squares
  function renderRoster() {
    if (!rosterGrid) return;
    let onlineCount = 0;
    let html = '';

    FAMILY_MEMBERS.forEach((mem, index) => {
      const isOnline = !!activeSlots[mem.id];
      if (isOnline) onlineCount++;
      const isSpeaking = (currentSpeakerSlot === mem.id) || (isTransmitting && mem.id === myId);

      const num = index + 1; // 1: Mansukhbhai, 2: Sudhaben, ..., 7: Madhav
      const dotClass = isOnline ? 'online' : 'offline';
      const speakClass = isSpeaking ? 'speaking' : '';
      const tooltip = `${num}. ${mem.name} (${isOnline ? 'Online' : 'Offline'}${isSpeaking ? ' - Speaking' : ''})`;

      html += `
        <div class="roster-square ${speakClass}" id="roster_${mem.id}" title="${tooltip}">
          <span class="sq-num">${num}</span>
          <span class="sq-dot ${dotClass}"></span>
        </div>
      `;
    });

    rosterGrid.innerHTML = html;
    if (counterText) {
      counterText.textContent = `${onlineCount} / ${FAMILY_MEMBERS.length} Online`;
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
        lcdMainStatus.innerHTML = '⛔ Channel Locked by Madhav';
      }
      if (lcdSubStatus) {
        lcdSubStatus.textContent = 'Voice line is disabled. Waiting for Madhav to unlock.';
      }
      if (pttMainLabel) pttMainLabel.textContent = 'LINE LOCKED';
      if (pttSubLabel) pttSubLabel.textContent = 'Locked by Madhav';

      if (masterToggleIcon) masterToggleIcon.textContent = '🔴';
      if (masterToggleText) masterToggleText.textContent = 'LINE IS LOCKED (TAP TO UNLOCK)';
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
        if (lcdMainStatus) lcdMainStatus.innerHTML = '🟢 Channel is Ready & Idle';
        if (lcdSubStatus) lcdSubStatus.textContent = 'Press and hold button below to talk';
      }
      if (pttMainLabel) pttMainLabel.textContent = 'HOLD TO TALK';
      if (pttSubLabel) pttSubLabel.textContent = 'Release to Listen';

      if (masterToggleIcon) masterToggleIcon.textContent = '🟢';
      if (masterToggleText) masterToggleText.textContent = 'LINE IS ACTIVE (TAP TO LOCK)';
      if (btnMasterToggle) btnMasterToggle.className = 'btn-master-toggle line-active';
      if (lcdScreen) lcdScreen.classList.remove('line-off');
    }
  }

  // Ultra-Safe Audio Context Initialization (Works on all mobile DACs)
  
  // Android & iOS Media Session Manager for Uninterrupted Background Voice
  function updateMediaSession() {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "KWT - Family Walkie Talkie",
          artist: "Voice Line Active (Always Connected)",
          album: "Kotecha Family Network",
          artwork: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" }
          ]
        });
        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('play', () => {
          if (silentAudio && silentAudio.paused) silentAudio.play().catch(() => {});
          if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {});
      } catch (e) {}
    }
  }

  function initAudio() {
    try {
      if (!audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          // Standard hardware rate constructor prevents iOS/Android crashes
          audioCtx = new AudioCtxClass();
          speakerGainNode = audioCtx.createGain();
          speakerGainNode.gain.value = volumeSlider ? parseFloat(volumeSlider.value) : 1.0;
          speakerGainNode.connect(audioCtx.destination);
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (err) {
      console.warn('AudioContext init notice:', err);
    }

    try {
      if (silentAudio && silentAudio.paused) {
        silentAudio.play().catch(() => {});
      }
    } catch (e) {}

    acquireWakeLock();
    updateMediaSession();
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
      if (!audioCtx) return;
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
      if (!audioCtx) return;
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
      if (!audioCtx) return;
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
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    if (!audioCtx) initAudio();
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
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    const pcm16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
    }

    const audioBuffer = audioCtx.createBuffer(1, float32.length, audioCtx.sampleRate || 16000);
    audioBuffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(speakerGainNode || audioCtx.destination);

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
      const storedPin = localStorage.getItem('kwt_pin') || '';
      if (isLoggedIn || storedPin) {
        sendClaimSlot(storedPin);
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

  function sendClaimSlot(customPin) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pin = customPin || localStorage.getItem('kwt_pin') || '';
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
        loginError.textContent = msg.message || 'Incorrect Security PIN!';
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
        lcdMainStatus.innerHTML = `📢 <strong>${msg.senderName}</strong> is speaking...`;
      }
      if (lcdSubStatus) {
        lcdSubStatus.textContent = 'Listen carefully';
      }
      if (lcdScreen) lcdScreen.classList.add('receiving');
      if (audioWaveBars) audioWaveBars.classList.add('active');
    } else if (msg.type === 'talk_stop') {
      currentSpeakerSlot = null;
      renderRoster();
      if (isLineActive) {
        if (lcdMainStatus) lcdMainStatus.innerHTML = '🟢 Channel is Ready & Idle';
        if (lcdSubStatus) lcdSubStatus.textContent = 'Press and hold button below to talk';
      }
      if (lcdScreen) lcdScreen.classList.remove('receiving');
      if (audioWaveBars) audioWaveBars.classList.remove('active');
    } else if (msg.type === 'family_bell') {
      if (!isLineActive) return;
      if (msg.bellType === 'chai') {
        playChaiBell();
        if (lcdMainStatus) {
          lcdMainStatus.innerHTML = `☕ <strong>${msg.senderName}</strong>: Tea / Meal Bell!`;
        }
      } else {
        playUrgentAlert();
        if (lcdMainStatus) {
          lcdMainStatus.innerHTML = `🚨 <strong>${msg.senderName}</strong>: Urgent Alert!`;
        }
      }
      setTimeout(() => {
        if (!currentSpeakerSlot && lcdMainStatus && isLineActive) {
          lcdMainStatus.innerHTML = '🟢 Channel is Ready & Idle';
        }
      }, 5000);
    }
  }

  // Instant Screen Switchers
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
    localStorage.removeItem('kwt_pin');
    if (radioScreen) radioScreen.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
    if (loginPinInput) loginPinInput.value = '';
  }

  // PTT Actions
  async function startTransmitting() {
    if (!isLineActive || isTransmitting) return;
    initAudio();

    if (!micStream) {
      try {
        await requestMicrophone();
      } catch (err) {
        alert('Microphone permission required for Walkie-Talkie!');
        return;
      }
    }

    isTransmitting = true;
    if (btnPttGiant) btnPttGiant.classList.add('active');
    if (pttPulseRing) pttPulseRing.classList.add('pulse');
    if (pttMainLabel) pttMainLabel.textContent = 'TRANSMITTING';
    if (pttSubLabel) pttSubLabel.textContent = 'Everyone is listening';

    if (lcdMainStatus) {
      lcdMainStatus.innerHTML = `🎙️ <strong>YOU (${myName})</strong> ARE TRANSMITTING...`;
    }
    if (lcdSubStatus) {
      lcdSubStatus.textContent = 'Release button when finished speaking';
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
      if (pttMainLabel) pttMainLabel.textContent = 'HOLD TO TALK';
      if (pttSubLabel) pttSubLabel.textContent = 'Release to Listen';
      if (lcdMainStatus) lcdMainStatus.innerHTML = '🟢 Channel is Ready & Idle';
      if (lcdSubStatus) lcdSubStatus.textContent = 'Press and hold button below to talk';
    } else {
      if (pttMainLabel) pttMainLabel.textContent = 'LINE LOCKED';
      if (pttSubLabel) pttSubLabel.textContent = 'Locked by Madhav';
    }

    if (lcdScreen) lcdScreen.classList.remove('transmitting');
    if (audioWaveBars) audioWaveBars.classList.remove('active');

    playBeep(450, 0.04, 'sine', 0.08);
    renderRoster();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'talk_stop' }));
    }
  }

  // Instant Verification and Screen Switch Handler
  function attemptLogin() {
    const pin = (loginPinInput ? loginPinInput.value : '').trim();

    if (!pin) {
      if (loginError) {
        loginError.textContent = 'Please enter your Security PIN.';
        loginError.style.display = 'block';
      }
      if (loginPinInput) loginPinInput.focus();
      return;
    }

    // Expected PIN check: Madhav = 2007, All others = 6880
    const expectedPin = (myId === 'mem_7') ? '2007' : '6880';
    if (pin !== expectedPin) {
      if (loginError) {
        loginError.textContent = (myId === 'mem_7')
          ? 'Incorrect Security PIN! Please try again.'
          : 'Incorrect Security PIN! Please try again.';
        loginError.style.display = 'block';
      }
      if (loginPinInput) {
        loginPinInput.value = '';
        loginPinInput.focus();
      }
      return;
    }

    // PIN is 100% correct! Save credentials
    localStorage.setItem('kwt_member_id', myId);
    localStorage.setItem('kwt_member_name', myName);
    localStorage.setItem('kwt_pin', pin);

    if (loginError) loginError.style.display = 'none';

    // Switch screen IMMEDIATELY for instant responsiveness
    isLoggedIn = true;
    switchToRadioScreen();

    // Init Audio safely in user gesture handler
    initAudio();

    // Sync with WebSocket server
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    } else {
      sendClaimSlot(pin);
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

    // Login Submit (Both click and touch supported)
    if (btnEnterRadio) {
      btnEnterRadio.addEventListener('click', attemptLogin);
    }

    // Enter Key on PIN input triggers login
    if (loginPinInput) {
      loginPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          attemptLogin();
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
  
  // Background / Foreground state transitions
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      if (silentAudio && silentAudio.paused) silentAudio.play().catch(() => {});
      if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
    }
  });

  initLoginSelection();
  setupListeners();
  connectWebSocket();

})();
