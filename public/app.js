// Professional Tactical Walkie-Talkie Client
(() => {
  // DOM Elements - Screens
  const loginScreen = document.getElementById('loginScreen');
  const radioScreen = document.getElementById('radioScreen');

  // Login Screen Elements
  const roleBtnOwner = document.getElementById('roleBtnOwner');
  const roleBtnStaff = document.getElementById('roleBtnStaff');
  const ownerSlotsRow = document.getElementById('ownerSlotsRow');
  const staffSlotsRow = document.getElementById('staffSlotsRow');
  const loginNameInput = document.getElementById('loginNameInput');
  const ownerPinSection = document.getElementById('ownerPinSection');
  const loginPinInput = document.getElementById('loginPinInput');
  const btnEnterRadio = document.getElementById('btnEnterRadio');

  // Radio Hardware Elements
  const btnLogout = document.getElementById('btnLogout');
  const stationBadge = document.getElementById('stationBadge');
  const badgeIcon = document.getElementById('badgeIcon');
  const badgeText = document.getElementById('badgeText');
  const networkLed = document.getElementById('networkLed');
  const counterText = document.getElementById('counterText');
  const antennaLed = document.getElementById('antennaLed');

  // Master Shift Elements
  const shiftStateLed = document.getElementById('shiftStateLed');
  const shiftTitle = document.getElementById('shiftTitle');
  const shiftSub = document.getElementById('shiftSub');
  const btnMasterShift = document.getElementById('btnMasterShift');
  const staffShiftStatus = document.getElementById('staffShiftStatus');

  // LCD Elements
  const lcdSpeakerName = document.getElementById('lcdSpeakerName');
  const lcdSpeakerRole = document.getElementById('lcdSpeakerRole');
  const speakerRing = document.getElementById('speakerRing');
  const vuCells = document.querySelectorAll('.vu-cell');

  // PTT & Controls
  const pttButton = document.getElementById('pttButton');
  const pttStatusText = document.getElementById('pttStatusText');
  const btnLockMic = document.getElementById('btnLockMic');
  const lockMicLabel = document.getElementById('lockMicLabel');
  const btnMuteSpeaker = document.getElementById('btnMuteSpeaker');
  const muteIcon = document.getElementById('muteIcon');
  const muteLabel = document.getElementById('muteLabel');
  const volumeSlider = document.getElementById('volumeSlider');
  const volValText = document.getElementById('volValText');
  const bgKeepAliveAudio = document.getElementById('bgKeepAliveAudio');
  const btnInstallPwa = document.getElementById('btnInstallPwa');

  // Application State
  let currentSelectedRole = 'owner'; // 'owner' or 'staff'
  let currentSelectedSlot = 'owner_1';
  let myRole = 'owner';
  let mySlot = 'owner_1';
  let myName = '';
  let isShiftActive = false;
  let isTransmitting = false;
  let isMicLocked = false;
  let isSpeakerMuted = false;
  let ws = null;
  let reconnectTimer = null;
  let wakeLock = null;

  // Web Audio Contexts
  let audioCtx = null;
  let micStream = null;
  let micSource = null;
  let scriptProcessor = null;
  let speakerGainNode = null;
  let nextPlayTime = 0;
  let liveStreamDest = null;
  let currentSpeakerName = '';

  // ========================================================================
  // LOGIN SCREEN LOGIC
  // ========================================================================

  roleBtnOwner.addEventListener('click', () => selectRole('owner'));
  roleBtnStaff.addEventListener('click', () => selectRole('staff'));

  function selectRole(role) {
    currentSelectedRole = role;
    if (role === 'owner') {
      roleBtnOwner.classList.add('active');
      roleBtnStaff.classList.remove('active');
      ownerSlotsRow.style.display = 'flex';
      staffSlotsRow.style.display = 'none';
      ownerPinSection.style.display = 'flex';
      loginPinInput.value = '';
      currentSelectedSlot = 'owner_1';
      selectSlotPill('owner_1');
      if (!loginNameInput.value) loginNameInput.placeholder = 'e.g. Owner 1 / Boss';
    } else {
      roleBtnStaff.classList.add('active');
      roleBtnOwner.classList.remove('active');
      ownerSlotsRow.style.display = 'none';
      staffSlotsRow.style.display = 'flex';
      ownerPinSection.style.display = 'none';
      currentSelectedSlot = 'staff_1';
      selectSlotPill('staff_1');
      if (!loginNameInput.value) loginNameInput.placeholder = 'e.g. Ramesh / Worker 1';
    }
  }

  // Setup Slot Pill clicks
  document.querySelectorAll('.slot-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const slot = pill.dataset.slot;
      currentSelectedSlot = slot;
      selectSlotPill(slot);
    });
  });

  function selectSlotPill(slot) {
    document.querySelectorAll('.slot-pill').forEach(p => p.classList.remove('active'));
    const target = document.querySelector(`.slot-pill[data-slot="${slot}"]`);
    if (target) target.classList.add('active');
  }

  // Submit Login
  btnEnterRadio.addEventListener('click', () => {
    const enteredName = loginNameInput.value.trim();
    if (!enteredName) {
      alert('Please enter your Name or Callsign.');
      loginNameInput.focus();
      return;
    }

    let pin = '';
    if (currentSelectedRole === 'owner') {
      pin = loginPinInput.value.trim();
      if (!pin) {
        alert('Please enter the secret Owner Security PIN.');
        loginPinInput.focus();
        return;
      }
    }

    myName = enteredName;
    mySlot = currentSelectedSlot;
    myRole = currentSelectedRole;

    localStorage.setItem('walkie_logged_in', 'true');
    localStorage.setItem('walkie_slot', mySlot);
    localStorage.setItem('walkie_role', myRole);
    localStorage.setItem('walkie_name', myName);
    if (pin) localStorage.setItem('walkie_pin', pin);

    switchToRadioScreen();
    connectWebSocket();
  });

  // Switch to Radio Screen
  function switchToRadioScreen() {
    loginScreen.style.display = 'none';
    radioScreen.style.display = 'block';

    badgeIcon.textContent = myRole === 'owner' ? '👑' : '📦';
    badgeText.textContent = `${myRole === 'owner' ? 'OWNER' : 'STAFF'} ${mySlot.slice(-1)} (${myName})`;

    if (myRole === 'owner') {
      btnMasterShift.style.display = 'block';
      staffShiftStatus.style.display = 'none';
    } else {
      btnMasterShift.style.display = 'none';
      staffShiftStatus.style.display = 'block';
    }
  }

  // Logout / Switch User
  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('walkie_logged_in');
    if (isShiftActive) stopShiftLocally();
    if (ws) {
      ws.close();
      ws = null;
    }
    radioScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });

  // Check saved session on startup
  const savedLogin = localStorage.getItem('walkie_logged_in');
  if (savedLogin === 'true') {
    mySlot = localStorage.getItem('walkie_slot') || 'owner_1';
    myRole = localStorage.getItem('walkie_role') || 'owner';
    myName = localStorage.getItem('walkie_name') || 'User';
    currentSelectedRole = myRole;
    currentSelectedSlot = mySlot;

    switchToRadioScreen();
    connectWebSocket();
  } else {
    // Populate defaults on login screen
    loginNameInput.value = localStorage.getItem('walkie_name') || '';
    loginPinInput.value = '';
    selectRole('owner');
  }

  // ========================================================================
  // WEBSOCKET & SIGNALING
  // ========================================================================

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      networkLed.className = 'counter-dot connected';
      sendClaimSlot();
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          handleSignaling(msg);
        } catch (e) {
          console.error('Signaling error:', e);
        }
      } else if (event.data instanceof ArrayBuffer) {
        if (!isSpeakerMuted && !isTransmitting && isShiftActive) {
          playAudioChunk(event.data);
        }
      }
    };

    ws.onclose = () => {
      networkLed.className = 'counter-dot';
      reconnectTimer = setTimeout(connectWebSocket, 2500);
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  }

  function sendClaimSlot() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pin = localStorage.getItem('walkie_pin') || '1234';
    ws.send(JSON.stringify({
      type: 'claim_slot',
      slot: mySlot,
      name: myName,
      pin: pin
    }));
  }

  function handleSignaling(msg) {
    if (msg.type === 'slot_confirmed') {
      mySlot = msg.slot;
      myRole = msg.role;
      myName = msg.name;

      badgeIcon.textContent = myRole === 'owner' ? '👑' : '📦';
      badgeText.textContent = `${myRole === 'owner' ? 'OWNER' : 'STAFF'} ${mySlot.slice(-1)} (${myName})`;

      syncShiftState(msg.globalShiftActive, msg.globalShiftOwner);
    } else if (msg.type === 'slot_error') {
      alert(msg.message);
      btnLogout.click();
    } else if (msg.type === 'shift_status') {
      syncShiftState(msg.active, msg.ownerName);
    } else if (msg.type === 'presence') {
      updateRoster(msg.activeSlots || {});
    } else if (msg.type === 'talk_start') {
      nextPlayTime = 0; // Immediate zero-latency playback start
      currentSpeakerName = msg.senderName || 'Station';

      // Ensure audio context and background player are alive
      if (!audioCtx) initAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      if (bgKeepAliveAudio.paused && isShiftActive) {
        bgKeepAliveAudio.play().catch(() => {});
      }

      playRemoteSquelch();
      antennaLed.className = 'antenna-tip tx';
      speakerRing.className = 'speaker-state-ring rx';

      const roleTag = msg.senderRole === 'owner' ? '👑 OWNER' : '📦 STAFF';
      lcdSpeakerName.textContent = msg.senderName.toUpperCase();
      lcdSpeakerRole.textContent = `🎙️ ${roleTag} IS TRANSMITTING...`;
      lcdSpeakerRole.style.color = '#00e676';

      // Vibrate mobile device (in pocket)
      if (navigator.vibrate) navigator.vibrate([150, 80, 150]);

      // Pop-up mobile system notification if app is in background or phone locked
      showBackgroundSpeakerNotification(msg.senderName, msg.senderRole);
      updateMediaSession();
      updatePersistentNotification();

      // Highlight in roster
      if (msg.senderSlot) {
        const item = document.getElementById(`roster_${msg.senderSlot}`);
        if (item) item.classList.add('talking');
      }
    } else if (msg.type === 'talk_stop') {
      currentSpeakerName = '';

      // Remote speaker ended -> Roger Beep
      playRogerBeep();
      antennaLed.className = 'antenna-tip';
      speakerRing.className = 'speaker-state-ring';

      lcdSpeakerName.textContent = 'NOBODY SPEAKING';
      lcdSpeakerRole.textContent = 'STANDBY (Channel Open)';
      lcdSpeakerRole.style.color = '#00a152';

      document.querySelectorAll('.roster-item').forEach(el => el.classList.remove('talking'));
      clearVUMeter();
      updateMediaSession();
      updatePersistentNotification();
    }
  }

  function updateRoster(slots) {
    let count = 0;
    ['owner_1', 'owner_2', 'owner_3', 'staff_1', 'staff_2'].forEach(slot => {
      const el = document.getElementById(`roster_${slot}`);
      if (!el) return;
      if (slots[slot]) {
        count++;
        el.classList.add('online');
        el.title = `${slots[slot].name} (${slots[slot].role})`;
      } else {
        el.classList.remove('online');
        el.title = 'Station Offline';
      }
    });
    counterText.textContent = `${count} / 5 ONLINE`;
  }

  // ========================================================================
  // MASTER SHIFT SYNCHRONIZATION
  // ========================================================================

  async function syncShiftState(active, ownerName) {
    isShiftActive = !!active;

    if (isShiftActive) {
      shiftStateLed.className = 'shift-state-indicator active';
      shiftTitle.textContent = 'SHIFT LIVE // RECORDING';
      shiftSub.textContent = `Started by ${ownerName || 'Owner'} • Broadcasting Open`;

      if (myRole === 'owner') {
        btnMasterShift.classList.remove('start');
        btnMasterShift.classList.add('stop');
        btnMasterShift.textContent = 'STOP SHIFT';
      } else {
        staffShiftStatus.className = 'staff-shift-status active';
        staffShiftStatus.textContent = 'ONLINE';
      }

      pttButton.disabled = false;
      btnLockMic.disabled = false;

      initAudio();
      try {
        await requestMicrophone();
      } catch (e) {
        console.log('Mic request:', e);
      }
      enableBackgroundAudio();
      requestWakeLock();
      playChime(523.25, 659.25, 783.99); // Start chime
    } else {
      stopShiftLocally();

      shiftStateLed.className = 'shift-state-indicator';
      shiftTitle.textContent = 'SHIFT STOPPED';
      shiftSub.textContent = ownerName ? `Ended by ${ownerName} • Standby` : 'Waiting for Owner to start...';

      if (myRole === 'owner') {
        btnMasterShift.classList.remove('stop');
        btnMasterShift.classList.add('start');
        btnMasterShift.textContent = 'START SHIFT';
      } else {
        staffShiftStatus.className = 'staff-shift-status off';
        staffShiftStatus.textContent = 'LOCKED';
      }

      pttButton.disabled = true;
      btnLockMic.disabled = true;

      playChime(783.99, 659.25, 523.25); // Shutdown chime
    }
  }

  function stopShiftLocally() {
    if (isTransmitting) stopTransmitting();
    closeMicrophone();
    disableBackgroundAudio();
    releaseWakeLock();
  }

  // Owner Shift Button Click
  btnMasterShift.addEventListener('click', () => {
    if (myRole !== 'owner') {
      alert('Only verified Owners can control the shift.');
      return;
    }
    const nextState = !isShiftActive;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_shift',
        active: nextState
      }));
    }
  });

  // ========================================================================
  // AUDIO PIPELINE (16kHz PCM & JITTER BUFFER)
  // ========================================================================

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass({ sampleRate: 16000 });
      speakerGainNode = audioCtx.createGain();
      speakerGainNode.gain.value = volumeSlider.value / 100;
      speakerGainNode.connect(audioCtx.destination);

      // Create live media stream destination to eliminate Android scrubber/seekbar dot
      try {
        liveStreamDest = audioCtx.createMediaStreamDestination();
        const carrierOsc = audioCtx.createOscillator();
        const carrierGain = audioCtx.createGain();
        carrierOsc.type = 'sine';
        carrierOsc.frequency.value = 40;
        carrierGain.gain.value = 0.0001; // completely inaudible
        carrierOsc.connect(carrierGain);
        carrierGain.connect(audioCtx.destination);
        carrierGain.connect(liveStreamDest);
        carrierOsc.start();

        // Feed live stream into bgKeepAliveAudio element so Android recognizes live broadcast
        if ('srcObject' in bgKeepAliveAudio) {
          bgKeepAliveAudio.srcObject = liveStreamDest.stream;
          bgKeepAliveAudio.removeAttribute('src');
        } else {
          bgKeepAliveAudio.src = 'silent.wav';
        }
      } catch (e) {
        console.log('Live stream setup fallback:', e);
        bgKeepAliveAudio.src = 'silent.wav';
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  async function requestMicrophone() {
    if (micStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone not supported or HTTPS required.');
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
    // 1024 samples at 16kHz = 64ms latency per packet (ultra-fast transmission)
    const bufferSize = 1024;
    scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

    scriptProcessor.onaudioprocess = (e) => {
      if (!isTransmitting || !isShiftActive || !ws || ws.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        sum += Math.abs(s);
      }

      const avgLevel = sum / inputData.length;
      updateVUMeter(avgLevel * 100);

      ws.send(pcm16.buffer);
    };

    micSource.connect(scriptProcessor);
    scriptProcessor.connect(audioCtx.destination);
  }

  function closeMicrophone() {
    if (scriptProcessor) {
      scriptProcessor.disconnect();
      scriptProcessor = null;
    }
    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
  }

  function playAudioChunk(arrayBuffer) {
    if (!audioCtx) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    if (bgKeepAliveAudio.paused && isShiftActive) {
      bgKeepAliveAudio.play().catch(() => {});
    }

    const pcm16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(pcm16.length);
    let sum = 0;

    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      sum += Math.abs(float32[i]);
    }

    const avg = sum / pcm16.length;
    updateVUMeter(avg * 100);

    const audioBuffer = audioCtx.createBuffer(1, float32.length, 16000);
    audioBuffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(speakerGainNode);

    const now = audioCtx.currentTime;
    // Strict latency ceiling: if nextPlayTime falls behind OR drifts > 40ms ahead, clamp immediately!
    if (nextPlayTime < now || nextPlayTime > now + 0.04) {
      nextPlayTime = now + 0.005; // 5ms jitter ceiling eliminates audio lag permanently
    }

    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
  }

  // ========================================================================
  // PUSH-TO-TALK LOGIC & AUTHENTIC RADIO SOUNDS
  // ========================================================================

  pttButton.addEventListener('mousedown', startTransmitting);
  pttButton.addEventListener('mouseup', stopTransmitting);
  pttButton.addEventListener('mouseleave', () => { if (!isMicLocked) stopTransmitting(); });

  pttButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startTransmitting();
  }, { passive: false });

  pttButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!isMicLocked) stopTransmitting();
  }, { passive: false });

  async function startTransmitting() {
    if (!isShiftActive || isTransmitting) return;

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!micStream) {
      await requestMicrophone();
    }

    isTransmitting = true;
    pttButton.classList.add('transmitting');
    antennaLed.className = 'antenna-tip tx';
    speakerRing.className = 'speaker-state-ring tx';
    pttStatusText.textContent = 'TRANSMITTING...';

    lcdSpeakerName.textContent = myName.toUpperCase();
    lcdSpeakerRole.textContent = `🎙️ YOU ARE TRANSMITTING (${myRole === 'owner' ? 'OWNER' : 'STAFF'})...`;
    lcdSpeakerRole.style.color = '#ff1744';

    if (navigator.vibrate) navigator.vibrate([40]);
    playTxKeyClick();

    updateMediaSession();
    updatePersistentNotification();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'talk_start'
      }));
    }
  }

  function stopTransmitting() {
    if (!isShiftActive || !isTransmitting) return;

    isTransmitting = false;
    pttButton.classList.remove('transmitting');
    antennaLed.className = 'antenna-tip';
    speakerRing.className = 'speaker-state-ring';
    pttStatusText.textContent = 'HOLD TO TALK';

    lcdSpeakerName.textContent = 'NOBODY SPEAKING';
    lcdSpeakerRole.textContent = 'STANDBY (Channel Open)';
    lcdSpeakerRole.style.color = '#00a152';
    clearVUMeter();

    if (navigator.vibrate) navigator.vibrate([20]);
    playRogerBeep();

    updateMediaSession();
    updatePersistentNotification();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'talk_stop'
      }));
    }
  }

  // Hands-Free Lock Mic
  btnLockMic.addEventListener('click', () => {
    if (!isShiftActive) return;

    isMicLocked = !isMicLocked;
    if (isMicLocked) {
      btnLockMic.classList.add('active');
      lockMicLabel.textContent = 'HANDS-FREE (ON)';
      startTransmitting();
    } else {
      btnLockMic.classList.remove('active');
      lockMicLabel.textContent = 'HANDS-FREE (OFF)';
      stopTransmitting();
    }
  });

  // Mute / Speaker Toggle
  btnMuteSpeaker.addEventListener('click', toggleMute);

  function toggleMute() {
    isSpeakerMuted = !isSpeakerMuted;
    if (isSpeakerMuted) {
      btnMuteSpeaker.classList.add('active');
      muteIcon.textContent = '🔇';
      muteLabel.textContent = 'MUTED';
      if (speakerGainNode) speakerGainNode.gain.value = 0;
      updateMediaSession();
    } else {
      btnMuteSpeaker.classList.remove('active');
      muteIcon.textContent = '🔊';
      muteLabel.textContent = 'SPEAKER ON';
      if (speakerGainNode) speakerGainNode.gain.value = volumeSlider.value / 100;
      updateMediaSession();
    }
  }

  // Volume Slider
  volumeSlider.addEventListener('input', () => {
    volValText.textContent = `${volumeSlider.value}%`;
    if (speakerGainNode && !isSpeakerMuted) {
      speakerGainNode.gain.value = volumeSlider.value / 100;
    }
  });

  // LCD VU Meter Animation
  function updateVUMeter(level) {
    const activeBars = Math.min(vuCells.length, Math.floor((level / 8) * (vuCells.length / 5)));
    vuCells.forEach((bar, index) => {
      if (index < activeBars) {
        const heightPercent = Math.min(100, (index + 1) * 8);
        bar.style.height = `${heightPercent}%`;
        bar.style.background = index > 10 ? '#ff1744' : index > 6 ? '#ffab00' : '#00e676';
      } else {
        bar.style.height = '4px';
        bar.style.background = '#0c1f14';
      }
    });
  }

  function clearVUMeter() {
    vuCells.forEach((bar) => {
      bar.style.height = '4px';
      bar.style.background = '#0c1f14';
    });
  }

  // Realistic Squelch & Roger Beep Sound FX
  function playTxKeyClick() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  }

  function playRemoteSquelch() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
  }

  function playRogerBeep() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  }

  function playChime(f1, f2, f3) {
    if (!audioCtx) return;
    [f1, f2, f3].forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const startTime = audioCtx.currentTime + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.16);
    });
  }

  // Media Session Controls for Notification Bar & Lock Screen
  function enableBackgroundAudio() {
    if (!audioCtx) initAudio();
    bgKeepAliveAudio.play().catch(() => {});
    updateMediaSession();
    updatePersistentNotification();
  }

  function disableBackgroundAudio() {
    bgKeepAliveAudio.pause();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
    updatePersistentNotification();
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !isShiftActive) return;

    let displayTitle = '🟢 STANDBY - Tap ▶ to Talk';
    let displayAlbum = '🎙️ SRAT - WALKIE TALKIE (PTT)';

    if (isTransmitting) {
      displayTitle = '🔴 YOU ARE TRANSMITTING...';
      displayAlbum = 'Tap ⏸ to Stop Speaking';
    } else if (currentSpeakerName) {
      displayTitle = `📢 ${currentSpeakerName.toUpperCase()} IS TALKING`;
      displayAlbum = 'Incoming Voice Stream...';
    } else if (isSpeakerMuted) {
      displayTitle = '🔇 SPEAKER MUTED';
      displayAlbum = 'Tap ▶ to Unmute / Talk';
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayTitle,
      artist: `${myName} • ${myRole === 'owner' ? 'Owner' : 'Staff'} ${mySlot.slice(-1)}`,
      album: displayAlbum,
      artwork: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });

    // When transmitting, playbackState is 'playing' -> Android shows round PAUSE (⏸) button to stop talking.
    // When listening/standby, playbackState is 'paused' -> Android shows round PLAY (▶) button to talk!
    navigator.mediaSession.playbackState = isTransmitting ? 'playing' : 'paused';

    // Clear position state so Android never renders a progress line or moving dot
    if ('setPositionState' in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState(null);
      } catch (e) {}
    }

    // Media action handlers: round button toggles speech!
    navigator.mediaSession.setActionHandler('play', () => {
      if (!isShiftActive) return;
      if (isSpeakerMuted) {
        toggleMute();
      }
      if (!isTransmitting) {
        startTransmitting();
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      if (!isShiftActive) return;
      if (isTransmitting) {
        stopTransmitting();
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      if (isTransmitting) stopTransmitting();
      if (myRole === 'owner' && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'set_shift', active: false }));
      }
    });
  }

  // Persistent Notification in Android Shade with One-Tap PTT Action Button
  function updatePersistentNotification() {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;

    navigator.serviceWorker.ready.then(reg => {
      if (!isShiftActive) {
        reg.getNotifications({ tag: 'walkie-persistent' }).then(notifs => {
          notifs.forEach(n => n.close());
        });
        return;
      }

      const notifTitle = isTransmitting
        ? `🔴 YOU ARE TALKING (${myName})`
        : currentSpeakerName
          ? `📢 ${currentSpeakerName.toUpperCase()} IS SPEAKING`
          : `📻 SRAT - WALKIE TALKIE (${myName})`;

      const notifBody = isTransmitting
        ? 'Tap [⏹️ STOP TALKING] below to release mic'
        : currentSpeakerName
          ? 'Listening to warehouse live stream...'
          : 'Tap [🎙️ TALK] below to speak without opening app';

      reg.showNotification(notifTitle, {
        body: notifBody,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: 'walkie-persistent',
        silent: true,
        renotify: false,
        actions: [
          { action: 'ptt_toggle', title: isTransmitting ? '⏹️ STOP TALKING' : '🎙️ TALK' }
        ]
      }).catch(() => {});
    }).catch(() => {});
  }

  // Wake Lock
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.log('Wake lock:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().then(() => { wakeLock = null; });
    }
  }

  // PWA Install & Service Worker Message Listener
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'TOGGLE_PTT') {
        if (!isShiftActive) return;
        if (!isTransmitting) {
          startTransmitting();
        } else {
          stopTransmitting();
        }
      }
    });
  }

  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstallPwa.style.display = 'block';
  });

  btnInstallPwa.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        btnInstallPwa.style.display = 'none';
      }
      deferredInstallPrompt = null;
    }
  });

  // Mobile Background Speaker Notifications & Visibility Handler
  function showBackgroundSpeakerNotification(senderName, senderRole) {
    if (!document.hidden) return;
    const roleTitle = senderRole === 'owner' ? 'Owner' : 'Godown Staff';
    if ('Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(`🎙️ ${senderName} (${roleTitle}) Speaking...`, {
            body: 'Tap to open Walkie-Talkie and reply',
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: 'walkie-speaker-alert',
            renotify: true,
            vibrate: [200, 100, 200]
          });
        }).catch(() => {});
      } else {
        new Notification(`🎙️ ${senderName} (${roleTitle}) Speaking...`, {
          body: 'Tap to open Walkie-Talkie and reply',
          icon: 'icon-192.png',
          tag: 'walkie-speaker-alert',
          renotify: true
        });
      }
    }
  }

  // Request notification permission when shift activates or enters radio
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }
  btnEnterRadio.addEventListener('click', requestNotificationPermission);
  btnMasterShift.addEventListener('click', requestNotificationPermission);

  // Resume audio and socket on page visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      if (isShiftActive && bgKeepAliveAudio.paused) {
        bgKeepAliveAudio.play().catch(() => {});
      }
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connectWebSocket();
      }
    }
  });

})();
