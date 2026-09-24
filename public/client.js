const socket = io();

let currentRoomId = null;
let currentRoom = null;
let myHand = [];
let selectedCardId = null;
let selectedAvatar = '🐶';
let prevTurnId = null;

// Audio Context (Web Audio API) Sentezleyici
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
}

function playSound(type) {
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'playCard') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'drawCard') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'turn') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'uno') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.3);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'win') {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.2, now + idx * 0.12);
        g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.2);
        o.start(now + idx * 0.12);
        o.stop(now + idx * 0.12 + 0.2);
      });
    }
  } catch (e) {
    console.log("Ses oynatma hatası:", e);
  }
}

const screens = {
  lobby: document.getElementById('lobby-screen'),
  room: document.getElementById('room-screen'),
  game: document.getElementById('game-screen')
};

const usernameInput = document.getElementById('username-input');
const roomCodeInput = document.getElementById('room-code-input');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const displayRoomId = document.getElementById('display-room-id');
const copyCodeBtn = document.getElementById('copy-code-btn');
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');
const startGameBtn = document.getElementById('start-game-btn');
const waitingMsg = document.getElementById('waiting-msg');
const colorModal = document.getElementById('color-modal');
const playerHandEl = document.getElementById('player-hand');
const discardPileEl = document.getElementById('discard-pile');
const deckPileEl = document.getElementById('deck-pile');
const turnIndicator = document.getElementById('turn-indicator');
const currentColorName = document.getElementById('current-color-name');
const colorCircle = document.getElementById('color-circle');
const opponentsContainer = document.getElementById('opponents-container');
const unoBtn = document.getElementById('uno-btn');
const myAvatarDisplay = document.getElementById('my-avatar-display');
const myNameDisplay = document.getElementById('my-name-display');

// Avatar Seçici
document.querySelectorAll('.avatar-option').forEach(opt => {
  opt.addEventListener('click', (e) => {
    document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    const target = e.target;
    target.classList.add('selected');
    selectedAvatar = target.getAttribute('data-avatar');
  });
});

function switchScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName].classList.add('active');
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

copyCodeBtn.addEventListener('click', () => {
  if (currentRoomId) {
    navigator.clipboard.writeText(currentRoomId);
    showToast("Oda kodu panoya kopyalandı!");
  }
});

createBtn.addEventListener('click', () => {
  initAudio();
  const username = usernameInput.value.trim();
  if (!username) return showToast('Lütfen bir kullanıcı adı girin!');
  socket.emit('createRoom', { username, avatar: selectedAvatar });
});

joinBtn.addEventListener('click', () => {
  initAudio();
  const username = usernameInput.value.trim();
  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!username || !roomId) return showToast('Lütfen isim ve oda kodunu girin!');
  socket.emit('joinRoom', { username, avatar: selectedAvatar, roomId });
});

startGameBtn.addEventListener('click', () => {
  if (currentRoomId) {
    socket.emit('startGame', { roomId: currentRoomId });
  }
});

deckPileEl.addEventListener('click', () => {
  if (currentRoomId && isMyTurn()) {
    socket.emit('drawCard', { roomId: currentRoomId });
  }
});

unoBtn.addEventListener('click', () => {
  if (currentRoomId) {
    socket.emit('sayUno', { roomId: currentRoomId });
  }
});

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const chosenColor = e.target.getAttribute('data-color');
    colorModal.classList.remove('active');
    if (selectedCardId && currentRoomId) {
      playSound('playCard');
      socket.emit('playCard', { roomId: currentRoomId, cardId: selectedCardId, chosenColor });
      selectedCardId = null;
    }
  });
});

socket.on('roomCreated', ({ roomId, room }) => {
  currentRoomId = roomId;
  currentRoom = room;
  displayRoomId.innerText = roomId;
  switchScreen('room');
});

socket.on('joinedSuccess', ({ roomId }) => {
  currentRoomId = roomId;
  displayRoomId.innerText = roomId;
  switchScreen('room');
});

socket.on('errorMsg', (msg) => showToast(msg));

socket.on('gameStarted', () => {
  switchScreen('game');
});

socket.on('soundEffect', (type) => {
  playSound(type);
});

socket.on('gameStateUpdated', ({ room, hand }) => {
  currentRoom = room;
  currentRoomId = room.id;
  myHand = hand || [];

  if (room.state === 'LOBBY') {
    switchScreen('room');
    updateLobbyUI();
  } else if (room.state === 'PLAYING') {
    if (!screens.game.classList.contains('active')) {
      switchScreen('game');
    }

    const activePlayer = room.players[room.currentTurnIndex];
    if (activePlayer && activePlayer.id !== prevTurnId) {
      if (activePlayer.id === socket.id) {
        playSound('turn');
      }
      prevTurnId = activePlayer.id;
    }

    renderGame();
  }
});

socket.on('unoSaid', ({ playerName }) => {
  showToast(`${playerName} UNO dedi! 🔥`);
});

socket.on('gameOver', ({ winner, winnerId }) => {
  if (winnerId === socket.id) {
    playSound('win');
  }
  alert(`Oyun Bitti! Kazanan: ${winner}\nLobide bekleniyorsunuz.`);
});

function updateLobbyUI() {
  playerList.innerHTML = '';
  currentRoom.players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.avatar}</span> <strong>${p.name}</strong> ${p.id === currentRoom.host ? ' (Kurucu)' : ''}`;
    playerList.appendChild(li);
  });
  playerCount.innerText = currentRoom.players.length;

  if (currentRoom.host === socket.id) {
    startGameBtn.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
  } else {
    startGameBtn.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }
}

function isMyTurn() {
  if (!currentRoom) return false;
  const activePlayer = currentRoom.players[currentRoom.currentTurnIndex];
  return activePlayer && activePlayer.id === socket.id;
}

function canPlayCardLocal(card) {
  if (!currentRoom || !currentRoom.topCard) return false;
  if (card.color === 'wild') return true;
  const targetColor = currentRoom.activeColor || currentRoom.topCard.color;
  if (card.color === targetColor) return true;
  if (card.value === currentRoom.topCard.value) return true;
  return false;
}

function renderGame() {
  const activePlayer = currentRoom.players[currentRoom.currentTurnIndex];
  const myTurn = isMyTurn();

  turnIndicator.innerText = myTurn ? "Sıra Sizde!" : `Sıra: ${activePlayer ? activePlayer.name : '-'}`;
  currentColorName.innerText = (currentRoom.activeColor || '-').toUpperCase();
  colorCircle.style.backgroundColor = getHexColor(currentRoom.activeColor);

  const me = currentRoom.players.find(p => p.id === socket.id);
  if (me) {
    myAvatarDisplay.innerText = me.avatar;
    myNameDisplay.innerText = me.name;
  }

  opponentsContainer.innerHTML = '';
  currentRoom.players.forEach(p => {
    if (p.id !== socket.id) {
      const div = document.createElement('div');
      div.className = `opponent-card ${activePlayer && p.id === activePlayer.id ? 'active-turn' : ''}`;
      div.innerHTML = `
        <div class="opponent-avatar">${p.avatar}</div>
        <strong>${p.name}</strong>
        <div>🂠 ${p.cardCount} Kart</div>
      `;
      opponentsContainer.appendChild(div);
    }
  });

  discardPileEl.innerHTML = '';
  if (currentRoom.topCard) {
    discardPileEl.appendChild(createCardElement(currentRoom.topCard));
  }

  playerHandEl.innerHTML = '';
  myHand.forEach(card => {
    const cardEl = createCardElement(card);
    if (myTurn && canPlayCardLocal(card)) {
      cardEl.classList.add('playable');
    }
    cardEl.addEventListener('click', () => handleCardClick(card));
    playerHandEl.appendChild(cardEl);
  });
}

function handleCardClick(card) {
  if (!isMyTurn()) return showToast("Sıra sizde değil!");

  if (card.color === 'wild') {
    selectedCardId = card.id;
    colorModal.classList.add('active');
  } else {
    playSound('playCard');
    socket.emit('playCard', { roomId: currentRoomId, cardId: card.id });
  }
}

function createCardElement(card) {
  const el = document.createElement('div');
  el.className = `uno-card ${card.color}`;

  let symbol = card.value;
  if (card.value === 'skip') symbol = '🚫';
  if (card.value === 'reverse') symbol = '🔄';
  if (card.value === 'draw2') symbol = '+2';
  if (card.value === 'draw4') symbol = '+4';
  if (card.value === 'wild') symbol = '🌈';

  el.innerHTML = `
    <span class="card-corner">${symbol}</span>
    <div class="card-inner">${symbol}</div>
  `;
  return el;
}

function getHexColor(color) {
  switch (color) {
    case 'red': return '#ef4444';
    case 'blue': return '#3b82f6';
    case 'green': return '#10b981';
    case 'yellow': return '#f59e0b';
    default: return '#ffffff';
  }
}