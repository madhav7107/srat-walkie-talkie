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

  // Settings & Roster Elements
  const btnOwnerSettings = document.getElementById('btnOwnerSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnDoneSettings = document.getElementById('btnDoneSettings');
  const settingsStaffList = document.getElementById('settingsStaffList');
  const newStaffNameInput = document.getElementById('newStaffNameInput');
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
  let currentSelectedRole = 'owner'; // 'owner' or 'staff'
  let currentSelectedSlot = 'owner_1';
  let myRole = 'owner';
  let mySlot = 'owner_1';
  let myName = '';
  let currentChannel = 'all'; // 'all' (Broadcast) or 'owners' (Private Owner Channel)
  let isShiftActive = false;
  let isTransmitting = false;
  let isMicLocked = false;
  let isSpeakerMuted = false;
  let ws = null;
  let reconnectTimer = null;
  let wakeLock = null;
  let isLoggedIn = false;

  // Dynamic Staff Stations and Active Presence
  let availableStaffSlots = [
    { id: 'staff_1', label: 'Staff 1', defaultName: 'Staff 1' },
    { id: 'staff_2', label: 'Staff 2', defaultName: 'Staff 2' }
  ];
  let currentActiveSlots = {};
  let currentSpeakerSlot = '';

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
      const firstStaffId = availableStaffSlots.length > 0 ? availableStaffSlots[0].id : 'staff_1';
      currentSelectedSlot = firstStaffId;
      selectSlotPill(firstStaffId);
      if (!loginNameInput.value) loginNameInput.placeholder = 'e.g. Ramesh / Worker';
    }
  }

  // Setup Owner Slot Pill clicks
  ownerSlotsRow.querySelectorAll('.slot-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const slot = pill.dataset.slot;
      currentSelectedSlot = slot;
      selectSlotPill(slot);
    });
  });

  // Dynamic Staff Slot Pills Rendering
  function renderStaffPills() {
    if (!staffSlotsRow) return;
    staffSlotsRow.innerHTML = '';
    availableStaffSlots.forEach((slot, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-pill' + (currentSelectedSlot === slot.id ? ' active' : '');
      btn.dataset.slot = slot.id;
      const num = (idx + 1).toString().padStart(2, '0');
      btn.innerHTML = `
        <span class="slot-num">${num}</span>
        <span class="slot-name">${slot.label}${slot.defaultName && slot.defaultName !== slot.label ? ` (${slot.defaultName})` : ''}</span>
      `;
      btn.addEventListener('click', () => {
        currentSelectedSlot = slot.id;
        selectSlotPill(slot.id);
      });
      staffSlotsRow.appendChild(btn);
    });

    if (currentSelectedRole === 'staff') {
      const exists = availableStaffSlots.some(s => s.id === currentSelectedSlot);
      if (!exists && availableStaffSlots.length > 0) {
        currentSelectedSlot = availableStaffSlots[0].id;
        selectSlotPill(currentSelectedSlot);
      }
    }
  }

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
    isLoggedIn = true;

    localStorage.setItem('walkie_logged_in', 'true');
    localStorage.setItem('walkie_slot', mySlot);
    localStorage.setItem('walkie_role', myRole);
    localStorage.setItem('walkie_name', myName);
    if (pin) localStorage.setItem('walkie_pin', pin);

    switchToRadioScreen();
    // Warm up audio and ask for microphone permission during direct user gesture
    initAudio();
    requestMicrophone().catch(err => {
      console.log('Login mic request info:', err);
    });

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    } else {
      sendClaimSlot();
    }
  });

  // Switch to Radio Screen
  function switchToRadioScreen() {
    loginScreen.style.display = 'none';
    radioScreen.style.display = 'block';

    badgeIcon.textContent = myRole === 'owner' ? '👑' : '📦';
    const slotNum = mySlot.replace(/^[a-z]+_/, '');
    badgeText.textContent = `${myRole === 'owner' ? 'OWNER' : 'STAFF'} ${slotNum} (${myName})`;

    if (myRole === 'owner') {
      btnMasterShift.style.display = 'block';
      staffShiftStatus.style.display = 'none';
      if (btnOwnerSettings) btnOwnerSettings.style.display = 'inline-flex';
      if (ownerChannelBar) ownerChannelBar.style.display = 'flex';
      setChannel(currentChannel);
    } else {
      btnMasterShift.style.display = 'none';
      staffShiftStatus.style.display = 'block';
      if (btnOwnerSettings) btnOwnerSettings.style.display = 'none';
      if (ownerChannelBar) ownerChannelBar.style.display = 'none';
      setChannel('all');
    }
  }

  // Owner Channel Frequency Switching
  function setChannel(channel) {
    currentChannel = (channel === 'owners' && myRole === 'owner') ? 'owners' : 'all';
    if (currentChannel === 'owners') {
      if (btnChOwners) btnChOwners.classList.add('active');
      if (btnChAll) btnChAll.classList.remove('active');
      if (tacticalLcd) tacticalLcd.classList.add('channel-private');
      if (pttButton) pttButton.classList.add('channel-private');
      if (lcdChannelLabel) lcdChannelLabel.textContent = 'CH-02 [OWNER PRIVATE ENCRYPTED]';
      if (!currentSpeakerSlot) {
        lcdSpeakerRole.textContent = 'STANDBY (Owner Private)';
        lcdSpeakerRole.style.color = '#ffd54f';
      }
    } else {
      if (btnChAll) btnChAll.classList.add('active');
      if (btnChOwners) btnChOwners.classList.remove('active');
      if (tacticalLcd) tacticalLcd.classList.remove('channel-private');
      if (pttButton) pttButton.classList.remove('channel-private');
      if (lcdChannelLabel) lcdChannelLabel.textContent = 'CH-01 [WAREHOUSE + OFFICE]';
      if (!currentSpeakerSlot) {
        lcdSpeakerRole.textContent = 'STANDBY (Channel Open)';
        lcdSpeakerRole.style.color = '#00a152';
      }
    }

    if (ws && ws.readyState === WebSocket.OPEN && myRole === 'owner') {
      ws.send(JSON.stringify({
        type: 'set_channel',
        channel: currentChannel
      }));
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
  const savedLogin = localStorage.getItem('walkie_logged_in');
  if (savedLogin === 'true') {
    isLoggedIn = true;
    mySlot = localStorage.getItem('walkie_slot') || 'owner_1';
    myRole = localStorage.getItem('walkie_role') || 'owner';
    myName = localStorage.getItem('walkie_name') || 'User';
    currentSelectedRole = myRole;
    currentSelectedSlot = mySlot;

    switchToRadioScreen();
    connectWebSocket();
  } else {
    isLoggedIn = false;
    loginNameInput.value = localStorage.getItem('walkie_name') || '';
    loginPinInput.value = '';
    selectRole('owner');
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

  function sendClaimSlot() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !isLoggedIn) return;
    const pin = localStorage.getItem('walkie_pin') || '1234';
    ws.send(JSON.stringify({
      type: 'claim_slot',
      slot: mySlot,
      name: myName,
      pin: pin
    }));
  }

  function handleSignaling(msg) {
    if (msg.type === 'initial_state') {
      if (Array.isArray(msg.staffSlots)) {
        availableStaffSlots = msg.staffSlots;
        renderStaffPills();
      }
      currentActiveSlots = msg.activeSlots || {};
      renderRoster();
      syncShiftState(msg.globalShiftActive, msg.globalShiftOwner);
    } else if (msg.type === 'staff_slots_updated') {
      if (Array.isArray(msg.staffSlots)) {
        availableStaffSlots = msg.staffSlots;
        renderStaffPills();
        renderRoster();
        if (settingsModal && settingsModal.style.display === 'flex') {
          renderSettingsStaffList();
        }
      }
    } else if (msg.type === 'slot_confirmed') {
      mySlot = msg.slot;
      myRole = msg.role;
      myName = msg.name;

      if (Array.isArray(msg.staffSlots)) {
        availableStaffSlots = msg.staffSlots;
        renderStaffPills();
      }

      badgeIcon.textContent = myRole === 'owner' ? '👑' : '📦';
      const slotNum = mySlot.replace(/^[a-z]+_/, '');
      badgeText.textContent = `${myRole === 'owner' ? 'OWNER' : 'STAFF'} ${slotNum} (${myName})`;

      renderRoster();
      syncShiftState(msg.globalShiftActive, msg.globalShiftOwner);
    } else if (msg.type === 'slot_error') {
      alert(msg.message);
      btnLogout.click();
    } else if (msg.type === 'slot_evicted') {
      alert(msg.message || 'Your staff station has been removed by the Owner.');
      btnLogout.click();
    } else if (msg.type === 'pin_change_success') {
      localStorage.setItem('walkie_pin', msg.newPin);
      alert('Security PIN updated successfully! Keep your new PIN safe.');
      if (newOwnerPinInput) newOwnerPinInput.value = '';
    } else if (msg.type === 'settings_error') {
      alert('Settings Error: ' + (msg.message || 'Action failed'));
    } else if (msg.type === 'shift_status') {
      syncShiftState(msg.active, msg.ownerName);
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

      const isIncomingPrivate = msg.channel === 'owners';
      if (isIncomingPrivate) {
        if (tacticalLcd) tacticalLcd.classList.add('channel-private');
        lcdSpeakerName.textContent = msg.senderName.toUpperCase();
        lcdSpeakerRole.textContent = `🔒 [OWNER PRIVATE] TRANSMITTING...`;
        lcdSpeakerRole.style.color = '#ffd54f';
      } else {
        if (currentChannel !== 'owners' && tacticalLcd) {
          tacticalLcd.classList.remove('channel-private');
        }
        const roleTag = msg.senderRole === 'owner' ? '👑 OWNER' : '📦 STAFF';
        lcdSpeakerName.textContent = msg.senderName.toUpperCase();
        lcdSpeakerRole.textContent = `🎙️ ${roleTag} IS TRANSMITTING...`;
        lcdSpeakerRole.style.color = '#00e676';
      }

      // Vibrate mobile device (in pocket)
      if (navigator.vibrate) navigator.vibrate([150, 80, 150]);

      // Pop-up mobile system notification if app is in background or phone locked
      showBackgroundSpeakerNotification(msg.senderName, isIncomingPrivate ? 'Owner [PRIVATE]' : msg.senderRole);
      updateMediaSession();
      updatePersistentNotification();

      renderRoster();
    } else if (msg.type === 'talk_stop') {
      currentSpeakerName = '';
      currentSpeakerSlot = '';

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
        lcdSpeakerRole.textContent = 'STANDBY (Channel Open)';
        lcdSpeakerRole.style.color = '#00a152';
      }

      renderRoster();
      clearVUMeter();
      updateMediaSession();
      updatePersistentNotification();
    }
  }

  function renderRoster() {
    if (!rosterDots) return;
    const ownerSlots = [
      { id: 'owner_1', tag: 'O1', label: 'Owner 1' },
      { id: 'owner_2', tag: 'O2', label: 'Owner 2' },
      { id: 'owner_3', tag: 'O3', label: 'Owner 3' }
    ];
    let html = '';
    let count = 0;

    ownerSlots.forEach(slot => {
      const isOnline = !!currentActiveSlots[slot.id];
      if (isOnline) count++;
      const isTalking = currentSpeakerSlot === slot.id;
      html += `<div class="roster-item ${isOnline ? 'online' : ''} ${isTalking ? 'talking' : ''}" id="roster_${slot.id}" title="${isOnline ? `${currentActiveSlots[slot.id].name} (Owner)` : slot.label}"><span>${slot.tag}</span></div>`;
    });

    availableStaffSlots.forEach((slot, idx) => {
      const isOnline = !!currentActiveSlots[slot.id];
      if (isOnline) count++;
      const isTalking = currentSpeakerSlot === slot.id;
      const tag = `S${idx + 1}`;
      html += `<div class="roster-item ${isOnline ? 'online' : ''} ${isTalking ? 'talking' : ''}" id="roster_${slot.id}" title="${isOnline ? `${currentActiveSlots[slot.id].name} (Staff)` : slot.label}"><span>${tag}</span></div>`;
    });

    rosterDots.innerHTML = html;
    const totalStations = ownerSlots.length + availableStaffSlots.length;
    counterText.textContent = `${count} / ${totalStations} ONLINE`;
  }

  // ========================================================================
  // OWNER SETTINGS PANEL LOGIC
  // ========================================================================

  function renderSettingsStaffList() {
    if (!settingsStaffList) return;
    settingsStaffList.innerHTML = '';

    if (availableStaffSlots.length === 0) {
      settingsStaffList.innerHTML = '<div style="color:#a0aec0;font-size:12px;padding:8px 0;">No staff stations configured.</div>';
      return;
    }

    availableStaffSlots.forEach((slot, idx) => {
      const item = document.createElement('div');
      item.className = 'staff-manager-item';

      const activeInfo = currentActiveSlots[slot.id];
      const isOnline = !!activeInfo;
      const statusClass = isOnline ? 'online' : 'offline';
      const statusText = isOnline ? `ONLINE (${activeInfo.name})` : 'OFFLINE';

      item.innerHTML = `
        <div class="staff-info-col">
          <div class="staff-main-name">
            <span class="staff-num-tag">#${idx + 1}</span>
            <strong>${slot.label}</strong> ${slot.defaultName && slot.defaultName !== slot.label ? `<span class="staff-sub-name">(${slot.defaultName})</span>` : ''}
          </div>
          <div class="staff-status-badge ${statusClass}">
            <span class="status-dot"></span>
            <span>${statusText}</span>
          </div>
        </div>
        <button type="button" class="btn-remove-staff" data-slot="${slot.id}" title="Remove Staff Station" ${availableStaffSlots.length <= 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>
          🗑️
        </button>
      `;

      const removeBtn = item.querySelector('.btn-remove-staff');
      removeBtn.addEventListener('click', () => {
        if (availableStaffSlots.length <= 1) {
          alert('At least 1 Godown Staff station must remain in the system.');
          return;
        }
        const confirmed = confirm(`Are you sure you want to remove ${slot.label}? Any staff currently logged in on this station will be disconnected.`);
        if (confirmed) {
          const pin = localStorage.getItem('walkie_pin') || '1234';
          ws.send(JSON.stringify({
            type: 'remove_staff_slot',
            slotId: slot.id,
            pin: pin
          }));
        }
      });

      settingsStaffList.appendChild(item);
    });
  }

  // Settings Modal open/close listeners
  if (btnOwnerSettings) {
    btnOwnerSettings.addEventListener('click', () => {
      renderSettingsStaffList();
      newStaffNameInput.value = '';
      newOwnerPinInput.value = '';
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
      const name = newStaffNameInput.value.trim();
      const pin = localStorage.getItem('walkie_pin') || '1234';
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server.');
        return;
      }
      ws.send(JSON.stringify({
        type: 'add_staff_slot',
        name: name || undefined,
        pin: pin
      }));
      newStaffNameInput.value = '';
    });
  }

  if (btnSaveNewPin) {
    btnSaveNewPin.addEventListener('click', () => {
      const newPin = newOwnerPinInput.value.trim();
      if (!newPin || newPin.length < 4) {
        alert('Security PIN must be at least 4 digits/characters.');
        newOwnerPinInput.focus();
        return;
      }
      const oldPin = localStorage.getItem('walkie_pin') || '1234';
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Not connected to server.');
        return;
      }
      ws.send(JSON.stringify({
        type: 'change_owner_pin',
        oldPin: oldPin,
        newPin: newPin
      }));
    });
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

      pttButton.classList.remove('shift-locked');
      btnLockMic.classList.remove('shift-locked');

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

      pttButton.classList.add('shift-locked');
      btnLockMic.classList.add('shift-locked');

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

  let activePointerId = null;

  // Modern Pointer Events for rock-solid touch and holding on mobile
  pttButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
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

    // If shift is not started, guide user immediately
    if (!isShiftActive) {
      if (myRole === 'owner') {
        const wantStart = confirm('⚠️ SHIFT IS CURRENTLY STOPPED.\n\nTap OK to START SHIFT and open walkie-talkie broadcast.');
        if (wantStart && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'set_shift', active: true }));
        }
      } else {
        alert('⚠️ SHIFT IS STOPPED!\n\nOwner needs to start the shift before staff can speak.\nPlease ask the Owner (Madhav) to tap "START SHIFT".');
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

    const chTag = (currentChannel === 'owners' && myRole === 'owner') ? 'CH-02 PRIVATE' : 'CH-01 ALL';
    lcdSpeakerName.textContent = myName.toUpperCase();
    lcdSpeakerRole.textContent = `🎙️ TRANSMITTING [${chTag}]...`;
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
    if (!isShiftActive) {
      if (myRole === 'owner') {
        const wantStart = confirm('⚠️ SHIFT IS CURRENTLY STOPPED.\n\nTap OK to START SHIFT and open walkie-talkie broadcast.');
        if (wantStart && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'set_shift', active: true }));
        }
      } else {
        alert('⚠️ SHIFT IS STOPPED!\n\nOwner needs to start the shift before staff can speak.');
      }
      return;
    }

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
