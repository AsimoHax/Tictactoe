// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const firebaseAdmin = require('firebase-admin');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 5000;

// Initialize Firebase Admin SDK
const serviceAccount = require('./tictactoe.json'); // Path to Firebase Admin SDK key

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: 'https://<your-firebase-project-id>.firebaseio.com'
});

const db = firebaseAdmin.firestore();

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(cors()); // Enable CORS for cross-origin requests

// Sample API Route to get all games
app.get('/api/games', async (req, res) => {
  try {
    const gamesSnapshot = await db.collection('games').get();
    const games = gamesSnapshot.docs.map(doc => doc.data());
    res.json(games);
  } catch (error) {
    console.error('Error getting games:', error);
    res.status(500).json({ error: 'Error fetching games' });
  }
});

// Sample API Route to create a new game
app.post('/api/games', async (req, res) => {
  const { gameId, board, currentPlayer } = req.body;

  if (!gameId || !board || !currentPlayer) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await db.collection('games').doc(gameId).set({
      board,
      currentPlayer
    });
    res.status(201).json({ message: 'Game created successfully' });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Error creating game' });
  }
});

// Note: use server.listen below (we use the HTTP server + socket.io). Removed duplicate app.listen call.


const rooms = {}; // { [roomId]: { players: [{id,name,symbol,socketId}], spectators: Set, board, xIsNext, started, winner } }

function makeRoomIfMissing(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { players: [], spectators: new Set(), board: Array(9).fill(""), xIsNext: true, started: false, winner: null };
  }
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("join-room", ({ roomId, userName }) => {
    makeRoomIfMissing(roomId);
    const room = rooms[roomId];

    // ensure single window => same socket id is the identity for the window
    // Promote to player if slots available; default to spectator if 2 players already
    if (room.players.length < 2) {
      const symbol = room.players.length === 0 ? "X" : "O";
      const player = { id: socket.id, name: userName || `Player-${socket.id.slice(0,4)}`, symbol, socketId: socket.id };
      room.players.push(player);
      socket.data.role = "player";
      socket.data.symbol = symbol;
      socket.join(roomId);
      room.started = room.players.length === 2; // start automatically when 2 players
    } else {
      room.spectators.add(socket.id);
      socket.data.role = "spectator";
      socket.join(roomId);
    }

    // Broadcast room update
    io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
  });

  socket.on("move", ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || room.winner) return;
    // find player symbol by socket id
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    // enforce turn
    const isTurn = (room.xIsNext && player.symbol === "X") || (!room.xIsNext && player.symbol === "O");
    if (!isTurn) return;
    if (room.board[index]) return;
    room.board[index] = player.symbol;
    room.xIsNext = !room.xIsNext;
    // check winner
    const winnerSymbol = checkWinner(room.board);
    if (winnerSymbol) {
      room.winner = winnerSymbol;
      room.started = false;
      io.to(roomId).emit("game-over", { winner: winnerSymbol });
    }
    io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
  });

  socket.on("surrender", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.winner) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const opponent = room.players.find(p => p.socketId !== socket.id);
    if (opponent) {
      room.winner = opponent.symbol;
      room.started = false;
      io.to(roomId).emit("game-over", { winner: room.winner, reason: "surrender", by: player.symbol });
    }
    io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
  });

  socket.on("promote", ({ roomId }) => {
    // spectator requests to become a player — server will add if slot available
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length < 2 && room.spectators.has(socket.id)) {
      const symbol = room.players.length === 0 ? "X" : "O";
      room.players.push({ id: socket.id, name: `Player-${socket.id.slice(0,4)}`, symbol, socketId: socket.id });
      room.spectators.delete(socket.id);
      socket.data.role = "player";
      socket.data.symbol = symbol;
      room.started = room.players.length === 2;
      io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
    } else {
      socket.emit("promote-failed", { reason: "no-slot" });
    }
  });

  socket.on("leave-room", ({ roomId }) => {
    leaveRoom(socket, roomId);
  });

  socket.on("disconnect", () => {
    // find any room and remove socket
    Object.keys(rooms).forEach(roomId => leaveRoom(socket, roomId));
    console.log("socket disconnected", socket.id);
  });

  function leaveRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return;
    // remove from players if present
    const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIdx >= 0) {
      const removed = room.players.splice(playerIdx, 1)[0];
      // if game started and other player exists => other player wins
      if (room.started && room.players.length === 1) {
        room.winner = room.players[0].symbol;
        room.started = false;
        io.to(roomId).emit("game-over", { winner: room.winner, reason: "player-left" });
      }
    }
    // remove from spectators
    if (room.spectators.has(socket.id)) {
      room.spectators.delete(socket.id);
    }
    socket.leave(roomId);
    // remove room if empty
    if (room.players.length + room.spectators.size === 0) {
      delete rooms[roomId];
    } else {
      io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
    }
  }
});

function sanitizeRoom(room) {
  return {
    players: room.players.map(p => ({ name: p.name, symbol: p.symbol })),
    spectators: room.spectators ? room.spectators.size : 0,
    board: room.board,
    xIsNext: room.xIsNext,
    started: room.started,
    winner: room.winner
  };
}

function checkWinner(b) {
  const patterns = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b1,c] of patterns) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
  }
  return null;
}

server.listen(PORT, () => { console.log(`Server listening on http://localhost:${PORT}`); });