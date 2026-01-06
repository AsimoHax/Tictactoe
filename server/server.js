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


const rooms = {}; // { [roomId]: { players: [{id,name,symbol,socketId,clientId}], spectators: Map<clientId,socketId>, clientSockets: Map<clientId, Set<socketId>>, board, xIsNext, started, winner } }

function makeRoomIfMissing(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { players: [], spectators: new Map(), clientSockets: new Map(), board: Array(9).fill(""), xIsNext: true, started: false, winner: null };
  }
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("join-room", ({ roomId, userName, clientId }) => {
    makeRoomIfMissing(roomId);
    const room = rooms[roomId];
    const cid = clientId || socket.id;

    // track this socket under the client's socket set
    let sset = room.clientSockets.get(cid);
    if (!sset) {
      sset = new Set();
      room.clientSockets.set(cid, sset);
    }
    sset.add(socket.id);

    // If the client already is a player, treat as reconnect: update socketId
    const existingPlayer = room.players.find(p => p.clientId === cid);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      console.log(`Room ${roomId}: ${existingPlayer.name} reconnected (client ${cid}) -> socket ${socket.id}`);
      socket.data.role = "player";
      socket.data.symbol = existingPlayer.symbol;
      socket.join(roomId);
    } else if (room.players.length < 2) {
      // Add as new player
      const symbol = room.players.length === 0 ? "X" : "O";
      const player = { id: socket.id, clientId: cid, name: userName || `Player-${cid.slice(0,4)}`, symbol, socketId: socket.id };
      room.players.push(player);
      console.log(`Room ${roomId}: ${player.name} joined as ${symbol} (client ${cid}, socket ${socket.id})`);
      if (room.players.length === 2) {
        const names = room.players.map(p => `${p.name}(${p.symbol})`).join(', ');
        console.log(`Room ${roomId}: Second player joined — players: ${names}`);
      }
      socket.data.role = "player";
      socket.data.symbol = symbol;
      socket.join(roomId);
      room.started = room.players.length === 2; // start automatically when 2 players
    } else {
      // Add as spectator keyed by clientId (store name with socket id)
      const spectatorName = userName || `Spectator-${cid.slice(0,4)}`;
      console.log(`Room ${roomId}: ${spectatorName} joined as spectator (client ${cid}, socket ${socket.id})`);
      room.spectators.set(cid, { socketId: socket.id, name: spectatorName });
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
    // find clientId for this socket
    const cid = findClientIdForSocket(room, socket.id) || socket.id;
    if (room.players.length < 2 && room.spectators.has(cid)) {
      const symbol = room.players.length === 0 ? "X" : "O";
      const promotedName = `Player-${cid.slice(0,4)}`;
      room.players.push({ id: socket.id, clientId: cid, name: promotedName, symbol, socketId: socket.id });
      console.log(`Room ${roomId}: ${promotedName} promoted to player as ${symbol} (client ${cid}, socket ${socket.id})`);
      room.spectators.delete(cid);
      socket.data.role = "player";
      socket.data.symbol = symbol;
      room.started = room.players.length === 2;
      io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
    } else {
      socket.emit("promote-failed", { reason: "no-slot" });
    }
  });

  // chat messages broadcast to room
  socket.on("chat", ({ roomId, name, text, clientId }) => {
    if (!roomId || !text) return;
    const room = rooms[roomId];
    if (!room) return;
    // Prefer server-known name (player or spectator) over client-provided name
    let fromName = null;
    if (clientId) {
      const player = room.players.find(p => p.clientId === clientId);
      if (player) fromName = player.name;
      else {
        const spect = room.spectators.get(clientId);
        if (spect && spect.name) fromName = spect.name;
      }
    }
    if (!fromName) fromName = name || `User-${socket.id.slice(0,4)}`;
    console.log(`Room ${roomId}: chat from ${fromName}: ${text}`);
    io.to(roomId).emit("chat", { from: fromName, text, clientId });
  });

  socket.on("leave-room", ({ roomId }) => {
    leaveRoom(socket, roomId);
  });

  socket.on("disconnect", () => {
    // find any room and remove this socket; only remove client entry when last socket for that client disconnects
    Object.keys(rooms).forEach(roomId => leaveRoom(socket, roomId));
    console.log("socket disconnected", socket.id);
  });

  function leaveRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return;
    // find clientId for this socket
    const cid = findClientIdForSocket(room, socket.id) || socket.id;

    // remove this socket from client's socket set
    const sset = room.clientSockets.get(cid);
    if (sset) {
      sset.delete(socket.id);
      if (sset.size === 0) {
        room.clientSockets.delete(cid);
        // fully disconnected client: remove from players or spectators
        const playerIdx = room.players.findIndex(p => p.clientId === cid);
        if (playerIdx >= 0) {
          const removed = room.players.splice(playerIdx, 1)[0];
          console.log(`Room ${roomId}: ${removed.name} (client ${cid}) fully disconnected`);
          // if game started and other player exists => other player wins
            if (room.started && room.players.length === 1) {
              if (!room.winner) {
                room.winner = room.players[0].symbol;
                room.started = false;
                io.to(roomId).emit("game-over", { winner: room.winner, reason: "player-left" });
              } else {
                console.log(`Room ${roomId}: game-over already emitted (winner ${room.winner})`);
              }
            }
        }
        if (room.spectators.has(cid)) {
          room.spectators.delete(cid);
          console.log(`Room ${roomId}: spectator (client ${cid}) fully disconnected`);
        }
      } else {
        // other sockets for this client still connected; do not remove player/spectator
        console.log(`Room ${roomId}: socket ${socket.id} disconnected but client ${cid} still has ${sset.size} sockets`);
      }
    } else {
      // fallback: try to remove by socketId for legacy entries
      const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIdx >= 0) {
        const removed = room.players.splice(playerIdx, 1)[0];
        if (room.started && room.players.length === 1) {
          room.winner = room.players[0].symbol;
          room.started = false;
          io.to(roomId).emit("game-over", { winner: room.winner, reason: "player-left" });
        }
      }
      // remove spectator by matching socket id
      for (const [spectatorCid, sid] of room.spectators.entries()) {
        if (sid === socket.id) {
          room.spectators.delete(spectatorCid);
          break;
        }
      }
    }

    socket.leave(roomId);
    // remove room if empty
    if (room.players.length + room.spectators.size === 0) {
      delete rooms[roomId];
    } else {
      io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
    }
  }

  function findClientIdForSocket(room, socketId) {
    for (const [cid, sset] of room.clientSockets.entries()) {
      if (sset.has(socketId)) return cid;
    }
    return null;
  }
});

function sanitizeRoom(room) {
  return {
    players: room.players.map(p => ({ name: p.name, symbol: p.symbol, clientId: p.clientId })),
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