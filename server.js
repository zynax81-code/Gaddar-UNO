const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

function createDeck() {
  const deck = [];
  COLORS.forEach(color => {
    deck.push({ color, value: '0', id: Math.random().toString(36).substring(2, 9) });
    for (let i = 0; i < 2; i++) {
      VALUES.slice(1).forEach(val => {
        deck.push({ color, value: val, id: Math.random().toString(36).substring(2, 9) });
      });
    }
  });
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild', id: Math.random().toString(36).substring(2, 9) });
    deck.push({ color: 'wild', value: 'draw4', id: Math.random().toString(36).substring(2, 9) });
  }
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function canPlayCard(card, topCard, activeColor) {
  if (!topCard) return true;
  if (card.color === 'wild') return true;
  const targetColor = activeColor || topCard.color;
  if (card.color === targetColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function sanitizeRoom(room) {
  return {
    id: room.id,
    host: room.host,
    state: room.state,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cardCount: p.hand.length,
      hasSaidUno: p.hasSaidUno
    })),
    currentTurnIndex: room.currentTurnIndex,
    direction: room.direction,
    activeColor: room.activeColor,
    topCard: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
    winner: room.winner
  };
}

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const publicData = sanitizeRoom(room);

  room.players.forEach(player => {
    io.to(player.id).emit('gameStateUpdated', {
      room: publicData,
      hand: player.hand
    });
  });
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ username, avatar }) => {
    const name = (username || '').trim() || 'Oyuncu';
    const playerAvatar = avatar || '🐶';
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    rooms[roomId] = {
      id: roomId,
      host: socket.id,
      players: [{ id: socket.id, name, avatar: playerAvatar, hand: [], hasSaidUno: false }],
      state: 'LOBBY',
      deck: [],
      discardPile: [],
      currentTurnIndex: 0,
      direction: 1,
      activeColor: null,
      winner: null
    };

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, room: sanitizeRoom(rooms[roomId]) });
    broadcastRoomState(roomId);
  });

  socket.on('joinRoom', ({ username, avatar, roomId }) => {
    const name = (username || '').trim() || 'Oyuncu';
    const playerAvatar = avatar || '🐶';
    const code = (roomId || '').trim().toUpperCase();
    const room = rooms[code];

    if (!room) {
      socket.emit('errorMsg', 'Oda bulunamadı!');
      return;
    }
    if (room.state !== 'LOBBY') {
      socket.emit('errorMsg', 'Oyun devam ediyor, lobide bitmesini bekleyin!');
      return;
    }
    if (room.players.length >= 10) {
      socket.emit('errorMsg', 'Oda dolu!');
      return;
    }

    const exists = room.players.some(p => p.id === socket.id);
    if (!exists) {
      room.players.push({ id: socket.id, name, avatar: playerAvatar, hand: [], hasSaidUno: false });
    }

    socket.join(code);
    socket.emit('joinedSuccess', { roomId: code });
    broadcastRoomState(code);
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) {
      socket.emit('errorMsg', 'Oyunu başlatmak için en az 2 oyuncu gerekli!');
      return;
    }

    room.deck = createDeck();
    room.discardPile = [];
    room.state = 'PLAYING';
    room.direction = 1;
    room.currentTurnIndex = 0;
    room.winner = null;

    room.players.forEach(player => {
      player.hand = room.deck.splice(0, 7);
      player.hasSaidUno = false;
    });

    let topCard = room.deck.pop();
    while (topCard.color === 'wild') {
      room.deck.unshift(topCard);
      topCard = room.deck.pop();
    }
    room.discardPile.push(topCard);
    room.activeColor = topCard.color;

    io.to(roomId).emit('gameStarted');
    broadcastRoomState(roomId);
  });

  socket.on('playCard', ({ roomId, cardId, chosenColor }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'PLAYING') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('errorMsg', 'Sıra sizde değil!');
      return;
    }

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = currentPlayer.hand[cardIndex];
    const topCard = room.discardPile[room.discardPile.length - 1];

    if (!canPlayCard(card, topCard, room.activeColor)) {
      socket.emit('errorMsg', 'Bu kartı oynayamazsınız!');
      return;
    }

    currentPlayer.hand.splice(cardIndex, 1);
    room.discardPile.push(card);

    if (card.color === 'wild') {
      room.activeColor = chosenColor || 'red';
    } else {
      room.activeColor = card.color;
    }

    socket.to(roomId).emit('soundEffect', 'playCard');

    if (currentPlayer.hand.length === 0) {
      room.state = 'LOBBY';
      room.winner = currentPlayer.name;
      room.players.forEach(p => { p.hand = []; p.hasSaidUno = false; });
      io.to(roomId).emit('gameOver', { winner: currentPlayer.name, winnerId: currentPlayer.id });
      broadcastRoomState(roomId);
      return;
    }

    let advanceCount = 1;

    if (card.value === 'reverse') {
      if (room.players.length === 2) {
        advanceCount = 2;
      } else {
        room.direction *= -1;
      }
    } else if (card.value === 'skip') {
      advanceCount = 2;
    } else if (card.value === 'draw2') {
      const nextPlayerIndex = getNextIndex(room.currentTurnIndex, room.direction, room.players.length);
      drawCardsForPlayer(room, nextPlayerIndex, 2);
      advanceCount = 2;
    } else if (card.value === 'draw4') {
      const nextPlayerIndex = getNextIndex(room.currentTurnIndex, room.direction, room.players.length);
      drawCardsForPlayer(room, nextPlayerIndex, 4);
      advanceCount = 2;
    }

    room.currentTurnIndex = getNextIndex(room.currentTurnIndex, room.direction * advanceCount, room.players.length);
    broadcastRoomState(roomId);
  });

  socket.on('drawCard', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'PLAYING') return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('errorMsg', 'Sıra sizde değil!');
      return;
    }

    if (room.deck.length === 0) {
      refillDeck(room);
    }

    if (room.deck.length > 0) {
      const drawn = room.deck.pop();
      currentPlayer.hand.push(drawn);
      currentPlayer.hasSaidUno = false;
      socket.emit('soundEffect', 'drawCard');
    }

    room.currentTurnIndex = getNextIndex(room.currentTurnIndex, room.direction, room.players.length);
    broadcastRoomState(roomId);
  });

  socket.on('sayUno', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player && player.hand.length <= 2) {
      player.hasSaidUno = true;
      io.to(roomId).emit('unoSaid', { playerName: player.name });
      io.to(roomId).emit('soundEffect', 'uno');
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          if (room.host === socket.id) {
            room.host = room.players[0].id;
          }
          if (room.state === 'PLAYING') {
            room.currentTurnIndex = room.currentTurnIndex % room.players.length;
          }
          broadcastRoomState(roomId);
        }
        break;
      }
    }
  });
});

function getNextIndex(current, step, total) {
  let next = (current + step) % total;
  if (next < 0) next += total;
  return next;
}

function drawCardsForPlayer(room, playerIndex, count) {
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) refillDeck(room);
    if (room.deck.length > 0) {
      room.players[playerIndex].hand.push(room.deck.pop());
    }
  }
}

function refillDeck(room) {
  if (room.discardPile.length <= 1) return;
  const top = room.discardPile.pop();
  room.deck = shuffle([...room.discardPile]);
  room.discardPile = [top];
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu ${PORT} portunda aktif!`);
});