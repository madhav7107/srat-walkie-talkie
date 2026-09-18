// Professional Tactical Walkie-Talkie Client
(() => {
  // DOM Elements - Screens
  const loginScreen = document.getElementById('loginScreen');
  const radioScreen = document.getElementById('radioScreen');

  // Login Screen Elements
  const stationsRow = document.getElementById('stationsRow');
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
  const masterShiftBar = document.getElementById('masterShiftBar');
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
  const lockMicIcon = document.getElementById('lockMicIcon');
  const btnMuteSpeaker = document.getElementById('btnMuteSpeaker');
  const muteIcon = document.getElementById('muteIcon');
  const muteLabel = document.getElementById('muteLabel');
  const volumeSlider = document.getElementById('volumeSlider');
  const volValText = document.getElementById('volValText');
  const bgKeepAliveAudio = document.getElementById('bgKeepAliveAudio');
  const btnInstallPwa = document.getElementById('btnInstallPwa');

  // Settings & Roster Elements
  const btnOwnerSettings = document.getElementById('btnOwnerSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnDoneSettings = document.getElementById('btnDoneSettings');
  const settingsStaffList = document.getElementById('settingsStaffList');
  const newStaffNameInput = document.getElementById('newStaffNameInput');
  const newStaffPinInput = document.getElementById('newStaffPinInput');
  const btnAddStaff = document.getElementById('btnAddStaff');
  const newOwnerPinInput = document.getElementById('newOwnerPinInput');
  const btnSaveNewPin = document.getElementById('btnSaveNewPin');
  const rosterDots = document.querySelector('.roster-dots');

  // Microphone Help Modal Elements
  const micModal = document.getElementById('micModal');
  const btnRequestMicAgain = document.getElementById('btnRequestMicAgain');
  const btnCloseMicModal = document.getElementById('btnCloseMicModal');

  function showMicModal() {
    if (micModal) micModal.style.display = 'flex';
  }

  function hideMicModal() {
    if (micModal) micModal.style.display = 'none';
  }

  if (btnCloseMicModal) {
    btnCloseMicModal.addEventListener('click', hideMicModal);
  }

  if (btnRequestMicAgain) {
    btnRequestMicAgain.addEventListener('click', async () => {
      hideMicModal();
      initAudio();
      try {
        await requestMicrophone();
        alert('✅ Microphone ready! You can now hold the button to talk.');
      } catch (e) {
        alert('❌ Microphone is still blocked. Please tap the 🔒 lock icon next to the URL in Chrome, tap Permissions -> Microphone -> Allow, then reload.');
        showMicModal();
      }
    });
  }

  // Owner Channel Switcher Elements
  const ownerChannelBar = document.getElementById('ownerChannelBar');
  const btnChAll = document.getElementById('btnChAll');
  const btnChOwners = document.getElementById('btnChOwners');
  const tacticalLcd = document.getElementById('tacticalLcd');
  const lcdChannelLabel = document.getElementById('lcdChannelLabel');

  // Application State
  let currentSelectedSlot = 'station_1';
  let myRole = 'user';
  let mySlot = 'station_1';
  let myName = 'Nimeeshbhai';
  let currentChannel = 'all';
  let isShiftActive = true;
  let isTransmitting = false;
  let isMicLocked = false;
  let isSpeakerMuted = false;
  let ws = null;
  let reconnectTimer = null;
  let wakeLock = null;
  let isLoggedIn = false;

  // Slots and Active Presence
  // Unified 5 Equal Personal Stations
  let availableStations = [
    { id: 'station_1', name: 'Nimeeshbhai' },
    { id: 'station_2', name: 'Kalpeshbhai' },
    { id: 'station_3', name: 'Madhav' },
    { id: 'station_4', name: 'Sagarbhai' },
    { id: 'station_5', name: 'Devraj' }
  ];
  let currentActiveSlots = {};
  let currentSpeakerSlot = '';

  function getStationName(slotId) {
    const st = availableStations.find(s => s.id === slotId);
    return st ? st.name : slotId;
  }

  // Web Audio Contexts & Speech Processing Pipeline
  let audioCtx = null;
  let micStream = null;
  let micSource = null;
  let scriptProcessor = null;
  let speakerGainNode = null;
  let voiceCompressor = null;
  let voiceBoostGain = null;
  let voiceHighpassFilter = null;
  let voicePresenceFilter = null;
  let nextPlayTime = 0;
  let liveStreamDest = null;
  let currentSpeakerName = '';
  let currentSpeakerRole = 'staff';

  // ========================================================================
  // LOGIN SCREEN LOGIC
  // ========================================================================

  function updatePinPlaceholder() {
    const name = getStationName(currentSelectedSlot);
    if (loginPinInput) {
      loginPinInput.placeholder = `Enter PIN for ${name}`;
    }
  }

  function renderStationPills() {
    if (!stationsRow) return;
    stationsRow.innerHTML = '';
    availableStations.forEach((slot, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-pill' + (currentSelectedSlot === slot.id ? ' active' : '');
      btn.dataset.slot = slot.id;
      const num = (idx + 1).toString().padStart(2, '0');
      btn.innerHTML = `
        <span class="slot-num">${num}</span>
        <span class="slot-name">${slot.name}</span>
      `;
      btn.addEventListener('click', () => {
        currentSelectedSlot = slot.id;
        selectSlotPill(slot.id);
        updatePinPlaceholder();
      });
      stationsRow.appendChild(btn);
    });
  }

  function selectSlotPill(slot) {
    document.querySelectorAll('.slot-pill').forEach(p => p.classList.remove('active'));
    const target = document.querySelector(`.slot-pill[data-slot="${slot}"]`);
    if (target) target.classList.add('active');
  }

  // Initial pill click listeners in HTML
  if (stationsRow) {
    stationsRow.querySelectorAll('.slot-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const slot = pill.dataset.slot;
        currentSelectedSlot = slot;
        selectSlotPill(slot);
        updatePinPlaceholder();
      });
    });
  }

  // Submit Login
  btnEnterRadio.addEventListener('click', () => {
    const pin = loginPinInput.value.trim();
    const targetName = getStationName(currentSelectedSlot);
    if (!pin) {
      alert(`Please enter the Security PIN for ${targetName}.`);
      loginPinInput.focus();
      return;
    }

    mySlot = currentSelectedSlot;
    myName = targetName;
    myRole = 'user';

    // Warm up audio and prime microphone permission without locking mic or interrupting Spotify
    initAudio();
    warmUpMicrophonePermission().catch(err => {
      console.log('Login mic request info:', err);
    });

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    } else {
      sendClaimSlot(pin);
    }
  });

  // Switch to Radio Screen
  function switchToRadioScreen() {
    loginScreen.style.display = 'none';
    radioScreen.style.display = 'block';

    const isOwner = myRole === 'owner' || ['station_1', 'station_2', 'station_3'].includes(mySlot);
    badgeIcon.textContent = isOwner ? '👑' : '📦';
    badgeText.textContent = `${isOwner ? 'OWNER' : 'STAFF'}: ${myName.toUpperCase()}`;

    if (btnMasterShift) btnMasterShift.style.display = isOwner ? 'block' : 'none';
    if (staffShiftStatus) staffShiftStatus.style.display = isOwner ? 'none' : 'block';
    if (btnOwnerSettings) btnOwnerSettings.style.display = isOwner ? 'block' : 'none';
    if (ownerChannelBar) ownerChannelBar.style.display = isOwner ? 'flex' : 'none';
    if (masterShiftBar) masterShiftBar.style.display = 'flex';
    if (lcdChannelLabel) lcdChannelLabel.textContent = currentChannel === 'owners' ? 'CH-02 [🔒 OWNERS PRIVATE]' : 'CH-01 [WAREHOUSE + OFFICE]';

    if (btnLockMic) {
      btnLockMic.removeAttribute('disabled');
      btnLockMic.disabled = false;
    }

    if (isShiftActive) {
      lcdSpeakerRole.textContent = currentChannel === 'owners' ? 'STANDBY (Owner Private)' : 'STANDBY (Channel Open)';
      lcdSpeakerRole.style.color = currentChannel === 'owners' ? '#ffd54f' : '#00a152';
      if (pttButton) pttButton.classList.remove('shift-locked');
      if (btnLockMic) btnLockMic.classList.remove('shift-locked');
    } else {
      lcdSpeakerRole.textContent = 'STANDBY (Shift Stopped)';
      lcdSpeakerRole.style.color = '#ffd54f';
      if (!isOwner) {
        if (pttButton) pttButton.classList.add('shift-locked');
        if (btnLockMic) btnLockMic.classList.add('shift-locked');
      }
    }

    initAudio();
    enableBackgroundAudio();
    requestWakeLock();
  }

  function setChannel(ch) {
    const isOwner = myRole === 'owner' || ['station_1', 'station_2', 'station_3'].includes(mySlot);
    if (!isOwner) return;

    currentChannel = ch;
    if (btnChAll) btnChAll.classList.toggle('active', ch === 'all');
    if (btnChOwners) btnChOwners.classList.toggle('active', ch === 'owners');

    if (ch === 'owners') {
      if (tacticalLcd) tacticalLcd.classList.add('channel-private');
      if (lcdChannelLabel) lcdChannelLabel.textContent = 'CH-02 [🔒 OWNERS PRIVATE]';
      if (!isTransmitting) {
        lcdSpeakerName.textContent = 'NOBODY SPEAKING';
        lcdSpeakerRole.textContent = 'STANDBY (Owner Private)';
        lcdSpeakerRole.style.color = '#ffd54f';
      }
    } else {
      if (tacticalLcd) tacticalLcd.classList.remove('channel-private');
      if (lcdChannelLabel) lcdChannelLabel.textContent = 'CH-01 [WAREHOUSE + OFFICE]';
      if (!isTransmitting) {
        lcdSpeakerName.textContent = 'NOBODY SPEAKING';
        lcdSpeakerRole.textContent = isShiftActive ? 'STANDBY (Channel Open)' : 'STANDBY (Shift Stopped)';
        lcdSpeakerRole.style.color = isShiftActive ? '#00a152' : '#ffd54f';
      }
    }
  }

  if (btnChAll) {
    btnChAll.addEventListener('click', () => setChannel('all'));
  }
  if (btnChOwners) {
    btnChOwners.addEventListener('click', () => setChannel('owners'));
  }

  // Logout / Switch User
  btnLogout.addEventListener('click', () => {
    isLoggedIn = false;
    localStorage.removeItem('walkie_logged_in');
    if (isShiftActive) stopShiftLocally();
    if (ws) {
      ws.close();
      ws = null;
    }
    radioScreen.style.display = 'none';
    loginScreen.style.display = 'block';
    connectWebSocket();
  });

  // Check saved session on startup
  if (localStorage.getItem('walkie_app_ver') !== 'v12') {
    localStorage.removeItem('walkie_logged_in');
    localStorage.removeItem('walkie_role');
    localStorage.removeItem('walkie_slot');
    localStorage.removeItem('walkie_name');
    localStorage.setItem('walkie_app_ver', 'v12');
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => caches.delete(k));
      });
    }
  }

  const savedLogin = localStorage.getItem('walkie_logged_in');
  if (savedLogin === 'true') {
    isLoggedIn = true;
    mySlot = localStorage.getItem('walkie_slot') || 'station_1';
    myName = localStorage.getItem('walkie_name') || getStationName(mySlot);
    currentSelectedSlot = mySlot;

    switchToRadioScreen();
    connectWebSocket();
  } else {
    isLoggedIn = false;
    currentSelectedSlot = 'station_1';
    selectSlotPill('station_1');
    updatePinPlaceholder();
    connectWebSocket();
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
      if (isLoggedIn) {
        sendClaimSlot();
      }
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

  function sendClaimSlot(overridePin) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pin = overridePin || localStorage.getItem('walkie_pin') || '';
    ws.send(JSON.stringify({
      type: 'claim_slot',
      slot: mySlot,
      name: myName,
      pin: pin
    }));
  }

  function handleSignaling(msg) {
    if (msg.type === 'initial_state') {
      if (Array.isArray(msg.stations)) {
        availableStations = msg.stations;
        renderStationPills();
      }
      currentActiveSlots = msg.activeSlots || {};
      renderRoster();
      updatePinPlaceholder();
      syncShiftState(msg.globalShiftActive, msg.globalShiftOwner);
    } else if (msg.type === 'stations_updated') {
      if (Array.isArray(msg.stations)) {
        availableStations = msg.stations;
        renderStationPills();
        renderRoster();
        if (settingsModal && settingsModal.style.display === 'flex') {
          renderSettingsStaffList();
        }
      }
    } else if (msg.type === 'slot_confirmed') {
      mySlot = msg.slot;
      myName = msg.name;
      myRole = msg.role || (['station_1', 'station_2', 'station_3'].includes(mySlot) ? 'owner' : 'staff');
      isLoggedIn = true;

      localStorage.setItem('walkie_logged_in', 'true');
      localStorage.setItem('walkie_slot', mySlot);
      localStorage.setItem('walkie_name', myName);
      localStorage.setItem('walkie_role', myRole);
      if (loginPinInput.value) {
        localStorage.setItem('walkie_pin', loginPinInput.value.trim());
      }

      switchToRadioScreen();

      if (Array.isArray(msg.stations)) {
        availableStations = msg.stations;
        renderStationPills();
      }

      renderRoster();
      syncShiftState(msg.globalShiftActive, msg.globalShiftOwner);
    } else if (msg.type === 'slot_error') {
      alert(msg.message);
      isLoggedIn = false;
      localStorage.removeItem('walkie_logged_in');
      radioScreen.style.display = 'none';
      loginScreen.style.display = 'block';
      if (loginPinInput) {
        loginPinInput.value = '';
        loginPinInput.focus();
      }
    } else if (msg.type === 'slot_evicted') {
      alert(msg.message || 'Your station has been removed by the Owners.');
      btnLogout.click();
    } else if (msg.type === 'pin_change_success') {
      alert(msg.message || 'Security PIN updated successfully!');
      if (newOwnerPinInput) newOwnerPinInput.value = '';
    } else if (msg.type === 'settings_error') {
      alert('Settings Notice: ' + (msg.message || 'Action failed'));
    } else if (msg.type === 'shift_status') {
      syncShiftState(msg.active, msg.ownerName);
    } else if (msg.type === 'shift_blocked') {
      alert(msg.message);
      if (isTransmitting) stopTransmitting();
    } else if (msg.type === 'presence') {
      currentActiveSlots = msg.activeSlots || {};
      renderRoster();
      if (settingsModal && settingsModal.style.display === 'flex') {
        renderSettingsStaffList();
      }
    } else if (msg.type === 'talk_start') {
      nextPlayTime = 0; // Immediate zero-latency playback start
      currentSpeakerName = msg.senderName || 'Station';
      currentSpeakerSlot = msg.senderSlot || '';
      currentSpeakerRole = msg.senderRole || (['station_1', 'station_2', 'station_3'].includes(msg.senderSlot) ? 'owner' : 'staff');
      const isOwnerSpeaker = (currentSpeakerRole === 'owner');

      // Ensure audio context and background player are alive
      if (!audioCtx) initAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      // 🔊 OWNER VOICE BOOST OVER BLUETOOTH & MUSIC:
      if (isOwnerSpeaker) {
        // Boost owner voice by 2.4x (+8 dB) through DynamicsCompressor & 2.8kHz Presence Filter
        if (voiceBoostGain && audioCtx) {
          voiceBoostGain.gain.setValueAtTime(2.4, audioCtx.currentTime);
        }
        // Play priority alert chime (880Hz -> 1320Hz)
        playOwnerPriorityAlertTone();

        // Signal Android to duck/lower background music (Spotify) during owner speech
        if (bgKeepAliveAudio) {
          bgKeepAliveAudio.currentTime = 0;
          bgKeepAliveAudio.play().catch(() => {});
        }
      } else {
        // Normal staff voice
        if (voiceBoostGain && audioCtx) {
          voiceBoostGain.gain.setValueAtTime(1.1, audioCtx.currentTime);
        }
        playRemoteSquelch();
      }

      antennaLed.className = 'antenna-tip tx';
      speakerRing.className = 'speaker-state-ring rx';

      const isIncomingPrivate = msg.channel === 'owners';
      if (isIncomingPrivate) {
        if (tacticalLcd) tacticalLcd.classList.add('channel-private');
        lcdSpeakerName.textContent = msg.senderName.toUpperCase();
        lcdSpeakerRole.textContent = `🔒 [OWNER PRIVATE] 🔊 BOOST ACTIVE...`;
        lcdSpeakerRole.style.color = '#ffd54f';
      } else if (isOwnerSpeaker) {
        if (tacticalLcd) tacticalLcd.classList.remove('channel-private');
        lcdSpeakerName.textContent = msg.senderName.toUpperCase();
        lcdSpeakerRole.textContent = `🎙️ 👑 OWNER (🔊 HIGH LOUD & CLEAR)...`;
        lcdSpeakerRole.style.color = '#00e676';
      } else {
        if (tacticalLcd) tacticalLcd.classList.remove('channel-private');
        lcdSpeakerName.textContent = msg.senderName.toUpperCase();
        lcdSpeakerRole.textContent = `🎙️ 📦 STAFF TRANSMITTING...`;
        lcdSpeakerRole.style.color = '#00e676';
      }

      // Vibrate mobile device (in pocket)
      if (navigator.vibrate) navigator.vibrate([150, 80, 150]);

      // Pop-up mobile system notification if app is in background or phone locked
      showBackgroundSpeakerNotification(msg.senderName, isOwnerSpeaker ? '👑 Owner (Priority Voice)' : '📦 Staff');
      updateMediaSession();
      updatePersistentNotification();

      renderRoster();
    } else if (msg.type === 'talk_stop') {
      currentSpeakerName = '';
      currentSpeakerSlot = '';

      // Reset voice boost to normal
      if (voiceBoostGain && audioCtx) {
        voiceBoostGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
      }
      // Immediately stop audio tag so Android releases focus and restores Spotify song volume!
      if (bgKeepAliveAudio && !bgKeepAliveAudio.paused) {
        bgKeepAliveAudio.pause();
        bgKeepAliveAudio.currentTime = 0;
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }

      // Remote speaker ended -> Roger Beep
      playRogerBeep();
      antennaLed.className = 'antenna-tip';
      speakerRing.className = 'speaker-state-ring';

      if (currentChannel === 'owners') {
        if (tacticalLcd) tacticalLcd.classList.add('channel-private');
        lcdSpeakerName.textContent = 'NOBODY SPEAKING';
        lcdSpeakerRole.textContent = 'STANDBY (Owner Private)';
        lcdSpeakerRole.style.color = '#ffd54f';
      } else {
        if (tacticalLcd) tacticalLcd.classList.remove('channel-private');
        lcdSpeakerName.textContent = 'NOBODY SPEAKING';
        lcdSpeakerRole.textContent = isShiftActive ? 'STANDBY (Channel Open)' : 'STANDBY (Shift Stopped)';
        lcdSpeakerRole.style.color = isShiftActive ? '#00a152' : '#ffd54f';
      }

      renderRoster();
      clearVUMeter();
      updateMediaSession();
      updatePersistentNotification();
    }
  }

  function renderRoster() {
    if (!rosterDots) return;
    let html = '';
    let count = 0;

    availableStations.forEach(slot => {
      const isOnline = !!currentActiveSlots[slot.id];
      if (isOnline) count++;
      const isTalking = currentSpeakerSlot === slot.id;
      const tag = slot.name.charAt(0).toUpperCase();
      const isOwner = slot.role === 'owner' || ['station_1', 'station_2', 'station_3'].includes(slot.id);
      html += `<div class="roster-item ${isOnline ? 'online' : ''} ${isTalking ? 'talking' : ''} ${isOwner ? 'owner-dot' : ''}" id="roster_${slot.id}" title="${isOnline ? `${currentActiveSlots[slot.id].name} (${isOwner ? 'Owner' : 'Staff'})` : `${slot.name} (${isOwner ? 'Owner' : 'Staff'})`}"><span>${tag}</span></div>`;
    });

    rosterDots.innerHTML = html;
    counterText.textContent = `${count} / ${availableStations.length} ONLINE`;
  }

  // ========================================================================
  // OWNER SETTINGS PANEL LOGIC
  // ========================================================================

  function renderSettingsStaffList() {
    if (!settingsStaffList) return;
    settingsStaffList.innerHTML = '';

    availableStations.forEach((slot, idx) => {
      const item = document.createElement('div');
      item.className = 'staff-manager-item';

      const activeInfo = currentActiveSlots[slot.id];
      const isOnline = !!activeInfo;
      const statusClass = isOnline ? 'online' : 'offline';
      const statusText = isOnline ? `ONLINE (${activeInfo.name})` : 'OFFLINE';
      const isOwnerSlot = slot.role === 'owner' || ['station_1', 'station_2', 'station_3'].includes(slot.id);
      const roleBadge = isOwnerSlot ? '👑 OWNER' : '📦 STAFF';
      const pinDisplay = slot.pin ? ` • PIN: <b style="color:#fff;">${slot.pin}</b>` : '';

      item.innerHTML = `
        <div class="staff-info-col" style="flex: 1;">
          <div class="staff-main-name">
            <span class="staff-num-tag">#${idx + 1}</span>
            <strong>${slot.name}</strong> <span style="font-size:11px;color:${isOwnerSlot ? '#ffd54f' : '#81c784'};font-weight:700;">[${roleBadge}]</span>
            <span style="font-size:11px;color:#a0aec0;margin-left:6px;">${pinDisplay}</span>
          </div>
          <div class="staff-status-badge ${statusClass}">
            <span class="status-dot"></span>
            <span>${statusText}</span>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="btn-edit-pin" data-slot="${slot.id}" data-name="${slot.name}" title="Change PIN" style="background:#2a364f; border:1px solid #3d4d6b; color:#fff; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:12px;">
            🔑 PIN
          </button>
          ${!isOwnerSlot ? `
            <button type="button" class="btn-remove-staff" data-slot="${slot.id}" data-name="${slot.name}" title="Remove Person" style="background:#4a1e1e; border:1px solid #7f2323; color:#ff5252; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:12px;">
              🗑️
            </button>
          ` : ''}
        </div>
      `;

      const editPinBtn = item.querySelector('.btn-edit-pin');
      if (editPinBtn) {
        editPinBtn.addEventListener('click', () => {
          const newPin = prompt(`Enter new 4-8 digit Security PIN for ${slot.name}:`, slot.pin || '');
          if (newPin && newPin.trim().length >= 4) {
            ws.send(JSON.stringify({
              type: 'change_pin',
              stationId: slot.id,
              newPin: newPin.trim()
            }));
          } else if (newPin !== null) {
            alert('Security PIN must be at least 4 digits.');
          }
        });
      }

      const removeBtn = item.querySelector('.btn-remove-staff');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          const confirmed = confirm(`Are you sure you want to remove ${slot.name}? Any worker currently connected will be logged out.`);
          if (confirmed) {
            ws.send(JSON.stringify({
              type: 'remove_station',
              stationId: slot.id
            }));
          }
        });
      }

      settingsStaffList.appendChild(item);
    });
  }

  // Settings Modal open/close listeners
  if (btnOwnerSettings) {
    btnOwnerSettings.addEventListener('click', () => {
      renderSettingsStaffList();
      if (newStaffNameInput) newStaffNameInput.value = '';
      if (newStaffPinInput) newStaffPinInput.value = '';
      if (newOwnerPinInput) newOwnerPinInput.value = '';
      settingsModal.style.display = 'flex';
    });
  }

  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
  }

  if (btnDoneSettings) {
    btnDoneSettings.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
  }

  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
      }
    });
  }

  if (btnAddStaff) {
    btnAddStaff.addEventListener('click', () => {
      const name = newStaffNameInput ? newStaffNameInput.value.trim() : '';
      const pin = newStaffPinInput ? newStaffPinInput.value.trim() : '';
      if (!name) {
        alert('Please enter person name (e.g. Ramesh).');
        if (newStaffNameInput) newStaffNameInput.focus();
        return;
      }
      if (!pin || pin.length < 4) {
        alert('Please enter a 4-8 digit Security PIN.');
        if (newStaffPinInput) newStaffPinInput.focus();
        return;
      }
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server.');
        return;
      }
      ws.send(JSON.stringify({
        type: 'add_station',
        name: name,
        pin: pin
      }));
      if (newStaffNameInput) newStaffNameInput.value = '';
      if (newStaffPinInput) newStaffPinInput.value = '';
    });
  }

  if (btnSaveNewPin) {
    btnSaveNewPin.addEventListener('click', () => {
      const newPin = newOwnerPinInput.value.trim();
      if (!newPin || newPin.length < 4) {
        alert('Security PIN must be at least 4 digits.');
        newOwnerPinInput.focus();
        return;
      }
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server.');
        return;
      }
      ws.send(JSON.stringify({
        type: 'change_pin',
        stationId: mySlot,
        newPin: newPin
      }));
      newOwnerPinInput.value = '';
    });
  }

  // ========================================================================
  // MASTER SHIFT SYNCHRONIZATION
  // ========================================================================

  async function syncShiftState(active, ownerName) {
    isShiftActive = active !== false;

    if (isShiftActive) {
      if (shiftStateLed) shiftStateLed.className = 'shift-state-indicator active';
      if (shiftTitle) shiftTitle.textContent = 'SHIFT LIVE // RECORDING';
      if (shiftSub) shiftSub.textContent = 'Started by Owners • Broadcasting Open';

      if (btnMasterShift) {
        btnMasterShift.classList.remove('start');
        btnMasterShift.classList.add('stop');
        btnMasterShift.textContent = 'STOP SHIFT';
      }
      if (staffShiftStatus) {
        staffShiftStatus.className = 'staff-shift-status active';
        staffShiftStatus.textContent = 'ONLINE';
      }

      if (pttButton) pttButton.classList.remove('shift-locked');
      if (btnLockMic) btnLockMic.classList.remove('shift-locked');

      initAudio();
      enableBackgroundAudio();
      requestWakeLock();
    } else {
      if (isTransmitting) stopTransmitting();

      if (shiftStateLed) shiftStateLed.className = 'shift-state-indicator';
      if (shiftTitle) shiftTitle.textContent = 'SHIFT STOPPED';
      if (shiftSub) shiftSub.textContent = 'Ended by Owners • Standby';

      if (btnMasterShift) {
        btnMasterShift.classList.remove('stop');
        btnMasterShift.classList.add('start');
        btnMasterShift.textContent = 'START SHIFT';
      }
      if (staffShiftStatus) {
        staffShiftStatus.className = 'staff-shift-status off';
        staffShiftStatus.textContent = 'LOCKED';
      }

      const isOwner = myRole === 'owner' || ['station_1', 'station_2', 'station_3'].includes(mySlot);
      if (!isOwner) {
        if (pttButton) pttButton.classList.add('shift-locked');
        if (btnLockMic) btnLockMic.classList.add('shift-locked');
      }
    }
  }

  function stopShiftLocally() {
    if (isMicLocked) {
      isMicLocked = false;
      if (btnLockMic) {
        btnLockMic.classList.remove('active');
        if (lockMicLabel) lockMicLabel.textContent = 'HANDS-FREE (OFF)';
        if (lockMicIcon) lockMicIcon.textContent = '🎙️';
      }
    }
    if (isTransmitting) stopTransmitting();
    closeMicrophone();
    disableBackgroundAudio();
    releaseWakeLock();
  }

  if (btnMasterShift) {
    btnMasterShift.addEventListener('click', () => {
      const isOwner = myRole === 'owner' || ['station_1', 'station_2', 'station_3'].includes(mySlot);
      if (!isOwner) {
        alert('Only Owners (Nimeeshbhai, Kalpeshbhai, Madhav) can control the shift.');
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
  }

  // ========================================================================
  // AUDIO PIPELINE (16kHz PCM & JITTER BUFFER)
  // ========================================================================

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass({ sampleRate: 16000 });

      // Master Speaker Gain
      speakerGainNode = audioCtx.createGain();
      speakerGainNode.gain.value = volumeSlider.value / 100;

      // Dynamics Compressor & Speech Clarifier (Studio broadcast clarity & anti-clipping)
      voiceCompressor = audioCtx.createDynamicsCompressor();
      voiceCompressor.threshold.setValueAtTime(-15, audioCtx.currentTime);
      voiceCompressor.knee.setValueAtTime(6, audioCtx.currentTime);
      voiceCompressor.ratio.setValueAtTime(10, audioCtx.currentTime);
      voiceCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      voiceCompressor.release.setValueAtTime(0.15, audioCtx.currentTime);

      // Highpass Filter (Cut low rumble below 160Hz for clean speech over background music)
      voiceHighpassFilter = audioCtx.createBiquadFilter();
      voiceHighpassFilter.type = 'highpass';
      voiceHighpassFilter.frequency.setValueAtTime(160, audioCtx.currentTime);

      // Presence Boost Filter (+5dB boost at 2.8kHz so speech punches through songs on Bluetooth)
      voicePresenceFilter = audioCtx.createBiquadFilter();
      voicePresenceFilter.type = 'peaking';
      voicePresenceFilter.frequency.setValueAtTime(2800, audioCtx.currentTime);
      voicePresenceFilter.gain.setValueAtTime(5.0, audioCtx.currentTime);
      voicePresenceFilter.Q.setValueAtTime(1.2, audioCtx.currentTime);

      // Voice Boost Node: 1.0x normal, 2.4x (+8dB boost) when Owners speak
      voiceBoostGain = audioCtx.createGain();
      voiceBoostGain.gain.value = 1.0;

      // Connect Voice Processing Chain:
      // source -> voiceBoostGain -> voiceHighpassFilter -> voicePresenceFilter -> voiceCompressor -> speakerGainNode -> destination
      voiceBoostGain.connect(voiceHighpassFilter);
      voiceHighpassFilter.connect(voicePresenceFilter);
      voicePresenceFilter.connect(voiceCompressor);
      voiceCompressor.connect(speakerGainNode);
      speakerGainNode.connect(audioCtx.destination);

      if (bgKeepAliveAudio) {
        bgKeepAliveAudio.src = 'silent.wav';
        bgKeepAliveAudio.volume = 0.05;
        bgKeepAliveAudio.pause();
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  // Prime microphone permission once on user gesture without holding mic stream open
  async function warmUpMicrophonePermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      // CRITICAL: Stop tracks immediately so Bluetooth does NOT switch to call mode,
      // allowing Spotify and background music to play 100% uninterrupted!
      tempStream.getTracks().forEach(track => track.stop());
      console.log('✅ Microphone permission primed and freed for Spotify playback.');
    } catch (err) {
      console.log('Mic prime check:', err);
    }
  }

  async function requestMicrophone() {
    if (micStream) return micStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone not supported or HTTPS required.');
    }

    try {
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
    } catch (err) {
      console.warn('Microphone permission request failed:', err);
      throw err;
    }

    if (!audioCtx) initAudio();

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
    // Use muted gain sink to prevent mic audio echo loopback into local speakers/earphones
    const micSinkGain = audioCtx.createGain();
    micSinkGain.gain.value = 0;
    scriptProcessor.connect(micSinkGain);
    micSinkGain.connect(audioCtx.destination);
    return micStream;
  }

  function closeMicrophone() {
    if (scriptProcessor) {
      try { scriptProcessor.disconnect(); } catch (e) {}
      scriptProcessor = null;
    }
    if (micSource) {
      try { micSource.disconnect(); } catch (e) {}
      micSource = null;
    }
    if (micStream) {
      try {
        micStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      micStream = null;
    }
  }

  function playAudioChunk(arrayBuffer) {
    if (!audioCtx) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
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
    if (voiceBoostGain) {
      source.connect(voiceBoostGain);
    } else {
      source.connect(speakerGainNode);
    }

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

  let activePointerId = null;

  // Modern Pointer Events for rock-solid touch and holding on mobile
  pttButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (isMicLocked) {
      // If mic was locked in Hands-Free mode, tapping the large PTT button releases it instantly
      isMicLocked = false;
      if (btnLockMic) {
        btnLockMic.classList.remove('active');
        if (lockMicLabel) lockMicLabel.textContent = 'HANDS-FREE (OFF)';
        if (lockMicIcon) lockMicIcon.textContent = '🎙️';
      }
      stopTransmitting();
      return;
    }
    activePointerId = e.pointerId;
    try {
      pttButton.setPointerCapture(e.pointerId);
    } catch (err) {}
    startTransmitting(e);
  });

  pttButton.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (activePointerId !== null) {
      try {
        if (pttButton.hasPointerCapture(activePointerId)) {
          pttButton.releasePointerCapture(activePointerId);
        }
      } catch (err) {}
      activePointerId = null;
    }
    if (!isMicLocked) stopTransmitting();
  });

  pttButton.addEventListener('pointercancel', (e) => {
    e.preventDefault();
    if (activePointerId !== null) {
      try {
        if (pttButton.hasPointerCapture(activePointerId)) {
          pttButton.releasePointerCapture(activePointerId);
        }
      } catch (err) {}
      activePointerId = null;
    }
    if (!isMicLocked) stopTransmitting();
  });

  // Prevent mobile long-press context menus
  pttButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  async function startTransmitting(e) {
    if (e && e.cancelable) e.preventDefault();

    const isOwner = myRole === 'owner' || ['station_1', 'station_2', 'station_3'].includes(mySlot);
    if (!isShiftActive) {
      if (isOwner) {
        const wantStart = confirm('⚠️ SHIFT IS CURRENTLY STOPPED.\n\nTap OK to START SHIFT and open broadcast for all stations.');
        if (wantStart && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'set_shift', active: true }));
        }
      } else {
        alert('⚠️ SHIFT IS STOPPED!\n\nOwners need to start the shift before staff can speak.\nPlease ask the Owners to start the shift.');
      }
      return;
    }

    if (isTransmitting) return;

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    if (!micStream) {
      try {
        await requestMicrophone();
      } catch (err) {
        console.error('Mic error:', err);
        showMicModal();
        return;
      }
    }

    if (!micStream) {
      showMicModal();
      return;
    }

    isTransmitting = true;
    pttButton.classList.add('transmitting');
    antennaLed.className = 'antenna-tip tx';
    speakerRing.className = 'speaker-state-ring tx';
    pttStatusText.textContent = 'TRANSMITTING...';

    const isPrivate = (isOwner && currentChannel === 'owners');

    lcdSpeakerName.textContent = myName.toUpperCase();
    if (isPrivate) {
      lcdSpeakerRole.textContent = '🎙️ TRANSMITTING [🔒 OWNERS PRIVATE]...';
      lcdSpeakerRole.style.color = '#ffd54f';
    } else {
      lcdSpeakerRole.textContent = '🎙️ YOU ARE TRANSMITTING...';
      lcdSpeakerRole.style.color = '#ff1744';
    }

    if (navigator.vibrate) navigator.vibrate([40]);
    playTxKeyClick();

    updateMediaSession();
    updatePersistentNotification();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'talk_start',
        channel: isPrivate ? 'owners' : 'all'
      }));
    }
  }

  function stopTransmitting() {
    if (!isTransmitting) return;

    isTransmitting = false;
    closeMicrophone();
    if (isMicLocked) {
      isMicLocked = false;
      if (btnLockMic) {
        btnLockMic.classList.remove('active');
        if (lockMicLabel) lockMicLabel.textContent = 'HANDS-FREE (OFF)';
        if (lockMicIcon) lockMicIcon.textContent = '🎙️';
      }
    }
    pttButton.classList.remove('transmitting');
    antennaLed.className = 'antenna-tip';
    speakerRing.className = 'speaker-state-ring';
    pttStatusText.textContent = 'HOLD TO TALK';

    if (currentChannel === 'owners') {
      lcdSpeakerName.textContent = 'NOBODY SPEAKING';
      lcdSpeakerRole.textContent = 'STANDBY (Owner Private)';
      lcdSpeakerRole.style.color = '#ffd54f';
    } else {
      lcdSpeakerName.textContent = 'NOBODY SPEAKING';
      lcdSpeakerRole.textContent = isShiftActive ? 'STANDBY (Channel Open)' : 'STANDBY (Shift Stopped)';
      lcdSpeakerRole.style.color = isShiftActive ? '#00a152' : '#ffd54f';
    }
    clearVUMeter();

    if (navigator.vibrate) navigator.vibrate([20]);
    playRogerBeep();

    updateMediaSession();
    updatePersistentNotification();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'talk_stop',
        channel: currentChannel
      }));
    }
  }

  // Hands-Free Lock Mic
  btnLockMic.addEventListener('click', async () => {
    const isOwner = myRole === 'owner' || ['station_1', 'station_2', 'station_3'].includes(mySlot);
    if (!isShiftActive) {
      if (isOwner) {
        const wantStart = confirm('⚠️ SHIFT IS CURRENTLY STOPPED.\n\nTap OK to START SHIFT and open broadcast for all stations.');
        if (wantStart && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'set_shift', active: true }));
        }
      } else {
        alert('⚠️ SHIFT IS STOPPED!\n\nOwners need to start the shift before staff can speak.\nPlease ask the Owners to start the shift.');
      }
      return;
    }

    if (!isMicLocked) {
      isMicLocked = true;
      btnLockMic.classList.add('active');
      if (lockMicLabel) lockMicLabel.textContent = 'HANDS-FREE (ON)';
      if (lockMicIcon) lockMicIcon.textContent = '🔴';
      try {
        await startTransmitting();
        if (!isTransmitting) {
          isMicLocked = false;
          btnLockMic.classList.remove('active');
          if (lockMicLabel) lockMicLabel.textContent = 'HANDS-FREE (OFF)';
          if (lockMicIcon) lockMicIcon.textContent = '🎙️';
        }
      } catch (err) {
        isMicLocked = false;
        btnLockMic.classList.remove('active');
        if (lockMicLabel) lockMicLabel.textContent = 'HANDS-FREE (OFF)';
        if (lockMicIcon) lockMicIcon.textContent = '🎙️';
      }
    } else {
      isMicLocked = false;
      btnLockMic.classList.remove('active');
      if (lockMicLabel) lockMicLabel.textContent = 'HANDS-FREE (OFF)';
      if (lockMicIcon) lockMicIcon.textContent = '🎙️';
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

  function playOwnerPriorityAlertTone() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.07);
    gain2.gain.setValueAtTime(0.28, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.07);
    osc2.stop(now + 0.15);
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
    updatePersistentNotification();
  }

  function disableBackgroundAudio() {
    if (bgKeepAliveAudio && !bgKeepAliveAudio.paused) bgKeepAliveAudio.pause();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
    updatePersistentNotification();
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !isShiftActive) return;

    // In idle standby, do NOT override Spotify or music players
    if (!isTransmitting && !currentSpeakerName) {
      navigator.mediaSession.playbackState = 'none';
      return;
    }

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
