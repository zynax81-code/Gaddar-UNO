const socket = typeof io !== 'undefined' ? io() : null;

if (!socket) {
  alert("Socket.io kütüphanesi yüklenemedi! Sayfayı Ctrl+F5 ile yenileyin.");
}

let currentRoomId = null;
let isHost = false;
let pendingCardIndex = null;

// Sesi Web Audio API İle Üretme (Harici dosya gerektirmez)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'draw') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } else if (type === 'play') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } else if (type === 'win') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
}

function getCardDisplayValue(value) {
  switch (value) {
    case 'skip': return '🚫';
    case 'reverse': return '🔄';
    case '+2': return '+2';
    case '+4': return '+4';
    case 'wild': return '🌈';
    default: return value;
  }
}

// SOKET DİNLENİCİLERİ
socket.on('roomList', (rooms) => {
  const listEl = document.getElementById('room-list');
  listEl.innerHTML = '';

  rooms.forEach((room) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><b>${room.name}</b> (${room.playerCount}/${room.maxPlayers}) ${room.hasPassword ? '🔒' : ''}</span>
      <button onclick="joinRoom('${room.id}', ${room.hasPassword})">Katıl</button>
    `;
    listEl.appendChild(li);
  });
});

socket.on('roomJoined', ({ roomId, isHost: hostStatus }) => {
  currentRoomId = roomId;
  isHost = hostStatus;
  
  document.getElementById('lobby-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  if (isHost) {
    document.getElementById('start-btn').classList.remove('hidden');
  }
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});

function updateRoomSettings() {
  const selectEl = document.getElementById('power-cards-select');
  const lowPowerCards = selectEl.value === 'low';
  
  socket.emit('updateSettings', {
    roomId: currentRoomId,
    lowPowerCards: lowPowerCards
  });
}

socket.on('updateGameState', (state) => {
  if (!state) return;

  document.getElementById('display-room-name').innerText = state.roomName;

  const selectEl = document.getElementById('power-cards-select');
  if (selectEl) {
    selectEl.value = state.lowPowerCards ? 'low' : 'normal';
    selectEl.disabled = !(isHost && !state.gameStarted);
  }

  if (isHost && !state.gameStarted) {
    document.getElementById('start-btn').classList.remove('hidden');
  } else {
    document.getElementById('start-btn').classList.add('hidden');
  }

  const playersContainer = document.getElementById('other-players');
  playersContainer.innerHTML = '';
  
  state.players.forEach((p, idx) => {
    if (p.id !== socket.id) {
      const isCurrent = idx === state.currentTurnIndex;
      const badge = document.createElement('div');
      badge.className = `player-badge ${isCurrent ? 'active-turn' : ''}`;
      badge.innerText = `${p.name}\n🃏 ${p.cardCount} Kart`;
      playersContainer.appendChild(badge);
    }
  });

  if (state.gameStarted) {
    const topCardEl = document.getElementById('top-card');
    const cardVal = getCardDisplayValue(state.topCard.value);
    
    topCardEl.className = `uno-card ${state.topCard.color}`;
    topCardEl.innerHTML = `
      <span class="corner top-left">${cardVal}</span>
      <div class="oval">
        <span class="value">${cardVal}</span>
      </div>
      <span class="corner bottom-right">${cardVal}</span>
    `;

    document.getElementById('current-color-indicator').innerText = `Aktif Renk: ${state.currentColor.toUpperCase()}`;
    const activePlayer = state.players[state.currentTurnIndex];
    document.getElementById('turn-indicator').innerText = `Sıra Kimde: ${activePlayer ? activePlayer.name : '-'}`;

    const me = state.players.find(p => p.id === socket.id);
    if (me && me.hand) {
      renderMyHand(me.hand);
    }
  }
});

socket.on('gameOver', ({ winner }) => {
  playSound('win');
  alert(`Oyun Bitti! Kazanan: ${winner}`);
  location.reload();
});

// KULLANICI AKSİYONLARI
function createRoom() {
  const username = document.getElementById('username-input').value.trim();
  const roomName = document.getElementById('room-name-input').value.trim();
  const password = document.getElementById('room-pass-input').value;

  if (!username) return alert('Lütfen kullanıcı adınızı girin!');
  socket.emit('createRoom', { username, roomName, password });
}

function joinRoom(roomId, hasPassword) {
  const username = document.getElementById('username-input').value.trim();
  if (!username) return alert('Lütfen kullanıcı adınızı girin!');

  let password = null;
  if (hasPassword) {
    password = prompt('Lütfen oda şifresini girin:');
    if (password === null) return;
  }

  socket.emit('joinRoom', { roomId, password, username });
}

function startGame() {
  socket.emit('startGame', currentRoomId);
}

function renderMyHand(hand) {
  const handEl = document.getElementById('my-hand');
  handEl.innerHTML = '';

  hand.forEach((card, index) => {
    const cardDiv = document.createElement('div');
    const cardVal = getCardDisplayValue(card.value);
    cardDiv.className = `uno-card ${card.color}`;
    cardDiv.innerHTML = `
      <span class="corner top-left">${cardVal}</span>
      <div class="oval">
        <span class="value">${cardVal}</span>
      </div>
      <span class="corner bottom-right">${cardVal}</span>
    `;
    cardDiv.onclick = () => onCardClick(index, card);
    handEl.appendChild(cardDiv);
  });
}

function onCardClick(index, card) {
  if (card.color === 'black') {
    pendingCardIndex = index;
    document.getElementById('color-modal').classList.remove('hidden');
  } else {
    playSound('play');
    socket.emit('playCard', { roomId: currentRoomId, cardIndex: index });
  }
}

function selectColor(color) {
  document.getElementById('color-modal').classList.add('hidden');
  if (pendingCardIndex !== null) {
    playSound('play');
    socket.emit('playCard', { roomId: currentRoomId, cardIndex: pendingCardIndex, chosenColor: color });
    pendingCardIndex = null;
  }
}

function drawCard() {
  playSound('draw');
  socket.emit('drawCard', currentRoomId);
}