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

// Debug route to inspect current in-memory rooms
app.get('/debug/rooms', (req, res) => {
  try {
    const out = {};
    Object.keys(rooms).forEach(rid => {
      out[rid] = sanitizeRoom(rooms[rid]);
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'failed' });
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

// API to close a room in Firestore (called by client when closing a lobby-backed room)
app.post('/api/close-room', async (req, res) => {
  try {
    const { roomId } = req.body || {};
    if (!roomId) return res.status(400).json({ error: 'missing roomId' });
    // delete Firestore document if exists
    try {
      await db.collection('rooms').doc(roomId).delete();
      console.log(`API: deleted firestore room ${roomId}`);
    } catch (e) {
      console.warn('API close-room: delete possibly failed or doc absent', e);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('close-room api failed', e);
    return res.status(500).json({ error: 'failed' });
  }
});

// Note: use server.listen below (we use the HTTP server + socket.io). Removed duplicate app.listen call.


const rooms = {}; // { [roomId]: { players: [{id,name,symbol,socketId,clientId}], spectators: Map<clientId,socketId>, clientSockets: Map<clientId, Set<socketId>>, board, xIsNext, started, winner } }

const fs = require('fs');
const path = require('path');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
// serve uploads statically
app.use('/uploads', express.static(uploadsDir));

function cleanupEmptyRooms() {
  Object.keys(rooms).forEach(roomId => {
    const room = rooms[roomId];
    if (!room) return;
    const playerCount = Array.isArray(room.players) ? room.players.length : 0;
    const spectatorCount = room.spectators ? room.spectators.size : 0;
    if (playerCount + spectatorCount === 0) {
      // clear pending timers
      if (room.pendingDisconnects) {
        for (const t of room.pendingDisconnects.values()) {
          try { clearTimeout(t); } catch (e) {}
        }
        room.pendingDisconnects.clear();
      }
      delete rooms[roomId];
      console.log(`Room ${roomId}: removed empty room during cleanup`);
      // attempt to delete Firestore lobby doc if present
      try { deleteFirestoreRoom(roomId); } catch (e) { console.warn('failed to request firestore delete', e); }
    }
  });
}

async function deleteFirestoreRoom(roomId) {
  try {
    if (!db) return;
    await db.collection('rooms').doc(roomId).delete();
    console.log(`Firestore: deleted room ${roomId}`);
  } catch (e) {
    console.warn(`Firestore: failed to delete room ${roomId}`, e.message || e);
  }
}

function makeRoomIfMissing(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { players: [], spectators: new Map(), clientSockets: new Map(), board: Array(9).fill(""), xIsNext: true, started: false, winner: null, restartReady: new Set(), pendingDisconnects: new Map(), waitingFor: null, terminated: false, tie: false };
  }
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("join-room", ({ roomId, userName, clientId, userPhoto }) => {
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
      // update photo if provided
      if (userPhoto) existingPlayer.photo = userPhoto;
      console.log(`Room ${roomId}: ${existingPlayer.name} reconnected (client ${cid}) -> socket ${socket.id}`);
      socket.data.role = "player";
      socket.data.symbol = existingPlayer.symbol;
      socket.data.clientId = cid;
      // cancel pending disconnect timer if present
      if (room.pendingDisconnects && room.pendingDisconnects.has(cid)) {
        clearTimeout(room.pendingDisconnects.get(cid));
        room.pendingDisconnects.delete(cid);
        room.waitingFor = null;
        console.log(`Room ${roomId}: cancelled pending disconnect for ${cid}`);
      }
      socket.join(roomId);
      // cancel terminated flag when a player successfully reconnects
      room.terminated = false;
    } else if (room.players.length < 2) {
      // Add as new player
      const player = { id: socket.id, clientId: cid, name: userName || `Player-${cid.slice(0,4)}`, symbol: null, socketId: socket.id, photo: userPhoto || null };
      room.players.push(player);
      socket.data.clientId = cid;
      console.log(`Room ${roomId}: ${player.name} joined (client ${cid}, socket ${socket.id})`);
      // normalize symbols after adding
      normalizePlayers(room);
      if (room.players.length === 2) {
        const names = room.players.map(p => `${p.name}(${p.symbol})`).join(', ');
        console.log(`Room ${roomId}: Second player joined — players: ${names}`);
      }
      socket.data.role = "player";
      socket.data.symbol = room.players.find(p => p.clientId === cid)?.symbol || null;
      socket.join(roomId);
        room.started = arePlayersConnected(room); // start only when both players actually connected
      // new join clears any previous termination marker
      room.terminated = false;
    } else {
      // Add as spectator keyed by clientId (store name with socket id)
      const spectatorName = userName || `Spectator-${cid.slice(0,4)}`;
      console.log(`Room ${roomId}: ${spectatorName} joined as spectator (client ${cid}, socket ${socket.id})`);
      room.spectators.set(cid, { socketId: socket.id, name: spectatorName, photo: userPhoto || null });
      socket.data.clientId = cid;
      socket.data.role = "spectator";
      socket.join(roomId);
    }

    // Broadcast room update
    io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
  });

  socket.on("move", ({ roomId, index }) => {
    const room = rooms[roomId];
    if (!room || room.winner) return;
    // do not accept moves if the room is terminated or if there are not two players
    if (room.terminated) {
      console.log(`Room ${roomId}: rejecting move because room is terminated`);
      return;
    }
    if (!room.players || room.players.length < 2) {
      console.log(`Room ${roomId}: rejecting move because not enough players (${(room.players||[]).length})`);
      return;
    }
    // find player by clientId (preferred) or socket id as fallback
    const cid = socket.data?.clientId;
    let player = null;
    if (cid) player = room.players.find(p => p.clientId === cid);
    if (!player) player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    console.log(`Room ${roomId}: received move index=${index} from client=${player.clientId} name=${player.name} symbol=${player.symbol}`);
    // enforce turn
    const isTurn = (room.xIsNext && player.symbol === "X") || (!room.xIsNext && player.symbol === "O");
    if (!isTurn) return;
    if (room.board[index]) return;
    room.board[index] = player.symbol;
    room.xIsNext = !room.xIsNext;
    console.log(`Room ${roomId}: board now ${JSON.stringify(room.board)}`);
    // check winner
    const winnerSymbol = checkWinner(room.board);
    if (winnerSymbol) {
      room.winner = winnerSymbol;
      room.started = false;
      io.to(roomId).emit("game-over", { winner: winnerSymbol, reason: 'win' });
    } else {
      // check tie (board full)
      const isFull = room.board.every(cell => !!cell);
      if (isFull) {
        room.started = false;
        room.tie = true;
        io.to(roomId).emit("game-over", { winner: null, reason: 'tie' });
      }
    }
    io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
  });

  socket.on("surrender", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.winner) return;
    const cid = socket.data?.clientId;
    let player = null;
    if (cid) player = room.players.find(p => p.clientId === cid);
    if (!player) player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const opponent = room.players.find(p => p.clientId !== (player.clientId || socket.id));
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
      // prefer spectator name if present
      const spect = room.spectators.get(cid);
      const promotedName = (spect && spect.name) ? spect.name : `Player-${cid.slice(0,4)}`;
      room.players.push({ id: socket.id, clientId: cid, name: promotedName, symbol: null, socketId: socket.id });
      normalizePlayers(room);
      console.log(`Room ${roomId}: ${promotedName} promoted to player as ${symbol} (client ${cid}, socket ${socket.id})`);
      room.spectators.delete(cid);
      socket.data.role = "player";
      socket.data.symbol = symbol;
      socket.data.clientId = cid;
      room.started = arePlayersConnected(room);
      // clear terminated marker when a new player occupies a slot
      room.terminated = false;
      io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
    } else {
      socket.emit("promote-failed", { reason: "no-slot" });
    }
  });

  // restart coordination: clients call this to signal ready to restart
  socket.on('restart-request', ({ roomId, clientId }) => {
    const room = rooms[roomId];
    if (!room) return;
    // do not accept restart requests if the room was terminated due to long disconnect
    if (room.terminated) {
      console.log(`Room ${roomId}: ignoring restart-request from ${clientId || socket.id} because room is terminated`);
      return;
    }
    const cid = clientId || socket.id;
    room.restartReady.add(cid);
    console.log(`Room ${roomId}: restart requested by ${cid}. readyCount=${room.restartReady.size}`);
    // broadcast room update so clients show 'Waiting...'
    io.to(roomId).emit('room-update', { roomId, room: sanitizeRoom(room) });

    // if two players and both players are ready, reset match
    if (room.players.length === 2) {
      const playerClientIds = room.players.map(p => p.clientId);
      const bothReady = playerClientIds.every(id => room.restartReady.has(id));
      if (bothReady) {
        // reset board and state
        room.board = Array(9).fill('');
        room.xIsNext = true;
        room.winner = null;
        room.tie = false;
        room.started = arePlayersConnected(room); // only mark started if both players currently connected
        room.restartReady.clear();
        console.log(`Room ${roomId}: both players ready — restarting match`);
        // ensure player symbols remain normalized
        normalizePlayers(room);
        io.to(roomId).emit('room-update', { roomId, room: sanitizeRoom(room) });
        io.to(roomId).emit('match-restart', { roomId });
      }
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

  // allow clients to update their avatar/photo while in a room
  socket.on('update-photo', ({ roomId, clientId, photoURL }) => {
    const room = rooms[roomId];
    if (!room) return;
    const cid = clientId || socket.data?.clientId;
    if (!cid) return;
    // update player if exists
    const player = room.players.find(p => p.clientId === cid);
    if (player) {
      player.photo = photoURL || null;
      console.log(`Room ${roomId}: updated photo for player ${player.name}`);
    } else if (room.spectators && room.spectators.has(cid)) {
      const s = room.spectators.get(cid);
      s.photo = photoURL || null;
      room.spectators.set(cid, s);
      console.log(`Room ${roomId}: updated photo for spectator ${s.name}`);
    }
    io.to(roomId).emit('room-update', { roomId, room: sanitizeRoom(room) });
  });

  // upload avatar image as dataUrl (base64) via socket to avoid requiring extra http multipart libs
  socket.on('upload-avatar', async ({ roomId, clientId, dataUrl, filename }) => {
    try {
      if (!dataUrl) return;
      // infer extension from filename or dataUrl
      let ext = 'png';
      if (filename && filename.includes('.')) ext = filename.split('.').pop();
      const matches = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!matches) return;
      const b64 = matches[2];
      const buf = Buffer.from(b64, 'base64');
      const cid = clientId || socket.data?.clientId || 'anon';
      const fname = `${Date.now()}_${cid}.${ext}`;
      const fpath = path.join(uploadsDir, fname);
      fs.writeFileSync(fpath, buf);
      // Build URL pointing to THIS server (use host header which refers to server host:port).
      // Prefer explicit host header; default to localhost and server port.
      const hostHeader = socket.handshake.headers.host || (`localhost:${PORT}`);
      // Assume http by default; if x-forwarded-proto provided, prefer that.
      const proto = socket.handshake.headers['x-forwarded-proto'] || 'http';
      const url = `${proto}://${hostHeader.replace(/\/$/, '')}/uploads/${fname}`;
      // update stored photo for player/spectator
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players.find(p => p.clientId === cid);
      if (player) {
        player.photo = url;
      } else if (room.spectators && room.spectators.has(cid)) {
        const s = room.spectators.get(cid);
        s.photo = url;
        room.spectators.set(cid, s);
      }
      // broadcast updated room
      io.to(roomId).emit('room-update', { roomId, room: sanitizeRoom(room) });
      // notify uploader of final url
      socket.emit('upload-result', { url });
    } catch (e) {
      console.error('upload-avatar failed', e);
    }
  });

  socket.on("leave-room", ({ roomId, clientId }) => {
    console.log(`leave-room received from socket ${socket.id}`, { roomId, clientId, socketClientId: socket.data?.clientId });
    // call leaveRoom for this socket; clientId is informational (we track by socket and client mapping)
    leaveRoom(socket, roomId);
  });

  // allow player 1 (host/first player) to force-close the room
  socket.on('close-room', ({ roomId, clientId }) => {
    try {
      const room = rooms[roomId];
      if (!room) return;
      const callerId = clientId || socket.data?.clientId || findClientIdForSocket(room, socket.id) || socket.id;
      const firstPlayer = room.players && room.players[0];
      if (!firstPlayer || firstPlayer.clientId !== callerId) {
        console.log(`close-room denied for ${callerId} in room ${roomId}: not player1`);
        return;
      }
      console.log(`close-room invoked by player1 ${callerId} for room ${roomId}`);
      // notify clients in room that the room is being closed
      io.to(roomId).emit('room-closed', { roomId, by: callerId });
      // clear pending timers
      if (room.pendingDisconnects) {
        for (const t of room.pendingDisconnects.values()) { try { clearTimeout(t); } catch(e){} }
        room.pendingDisconnects.clear();
      }
      // delete the room
      delete rooms[roomId];
      console.log(`Room ${roomId}: force-closed by ${callerId}`);
      cleanupEmptyRooms();
    } catch (e) { console.error('close-room failed', e); }
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected", socket.id, "clientId:", socket.data?.clientId);
    // find any room and remove this socket; only remove client entry when last socket for that client disconnects
    Object.keys(rooms).forEach(roomId => leaveRoom(socket, roomId));
  });

  function leaveRoom(socket, roomId) {
    const room = rooms[roomId];
    console.log(`leaveRoom called for socket=${socket.id} room=${roomId}`);
    if (!room) {
      console.log(`leaveRoom: room ${roomId} not found`);
      return;
    }
    // find clientId for this socket
    const cid = findClientIdForSocket(room, socket.id) || socket.id;
    console.log(`leaveRoom: resolved clientId=${cid} players=${(room.players||[]).map(p=>p.clientId)} spectators=${room.spectators?Array.from(room.spectators.keys()):[]}`);

    // remove this socket from client's socket set
    const sset = room.clientSockets.get(cid);
    if (sset) {
      sset.delete(socket.id);
      if (sset.size === 0) {
        room.clientSockets.delete(cid);
        // If there are no more connected client sockets in this room, delete the room immediately
        if (room.clientSockets && room.clientSockets.size === 0) {
          // clear pending timers
          if (room.pendingDisconnects) {
            for (const t of room.pendingDisconnects.values()) { try { clearTimeout(t); } catch(e){} }
            room.pendingDisconnects.clear();
          }
          delete rooms[roomId];
          console.log(`Room ${roomId}: deleted because no connected client sockets remain`);
          cleanupEmptyRooms();
          return;
        }
        // fully disconnected client: remove from players or spectators
        const playerIdx = room.players.findIndex(p => p.clientId === cid);
        if (playerIdx >= 0) {
          const removedPlayer = room.players[playerIdx];
          // schedule a pending disconnect timeout instead of immediate removal
          if (!room.pendingDisconnects.has(cid)) {
            room.waitingFor = cid;
            const t = setTimeout(() => {
              // timeout expired: remove player permanently
              const idx = room.players.findIndex(p => p.clientId === cid);
              if (idx >= 0) {
                const removed = room.players.splice(idx, 1)[0];
                console.log(`Room ${roomId}: ${removed.name} (client ${cid}) did not reconnect — removed`);
              }
              room.pendingDisconnects.delete(cid);
              room.waitingFor = null;
              // mark room terminated due to timeout — clients should treat this as ended
              room.terminated = true;
              // clear restart flags and reset room to waiting state
              room.restartReady.clear();
              room.board = Array(9).fill('');
              room.xIsNext = true;
              room.winner = null;
              room.started = false;
              normalizePlayers(room);
              io.to(roomId).emit('room-update', { roomId, room: sanitizeRoom(room) });
              // if room became empty after removal, cleanup
              if ((room.players.length + (room.spectators ? room.spectators.size : 0)) === 0) {
                // clear pending timers for this room (already removed one)
                if (room.pendingDisconnects) {
                  for (const t of room.pendingDisconnects.values()) { try { clearTimeout(t); } catch(e){} }
                  room.pendingDisconnects.clear();
                }
                delete rooms[roomId];
                console.log(`Room ${roomId}: deleted because empty after pending disconnect`);
                cleanupEmptyRooms();
              }
            }, 5000);
            room.pendingDisconnects.set(cid, t);
            console.log(`Room ${roomId}: scheduling pending disconnect for ${cid}`);
            // broadcast room update so remaining players see waiting state
            io.to(roomId).emit('room-update', { roomId, room: sanitizeRoom(room) });
            // Additionally: if fewer than 2 players remain now, clear restart and reset match immediately
            if ((room.players ? room.players.length : 0) < 2) {
              try {
                if (room.restartReady) room.restartReady.clear();
                room.started = false;
                room.board = Array(9).fill('');
                room.winner = null;
                room.tie = false;
                normalizePlayers(room);
                console.log(`Room ${roomId}: fewer than 2 players after disconnect — cleared restartReady and reset match state (pending removal)`);
                io.to(roomId).emit('room-update', { roomId, room: sanitizeRoom(room) });
              } catch (e) { console.error('error resetting room after pending disconnect', e); }
            }
          }
        }
        if (room.spectators.has(cid)) {
          room.spectators.delete(cid);
          console.log(`Room ${roomId}: spectator (client ${cid}) fully disconnected`);
        }
        // remove restart readiness if present
        if (room.restartReady && room.restartReady.has(cid)) {
          room.restartReady.delete(cid);
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
    // remove room if empty (and perform a cleanup sweep)
    if (room.players.length + room.spectators.size === 0) {
      // clear any pending timers for this room
      if (room.pendingDisconnects) {
        for (const t of room.pendingDisconnects.values()) {
          try { clearTimeout(t); } catch (e) {}
        }
        room.pendingDisconnects.clear();
      }
      delete rooms[roomId];
      console.log(`Room ${roomId}: deleted because empty after leave`);
      // perform broader cleanup in case other rooms also became empty
      cleanupEmptyRooms();
    } else {
      // If fewer than two players remain, cancel any pending restart and reset match state
      if ((room.players ? room.players.length : 0) < 2) {
        try {
          if (room.restartReady) room.restartReady.clear();
          room.started = false;
          room.board = Array(9).fill('');
          room.winner = null;
          room.tie = false;
          normalizePlayers(room);
          console.log(`Room ${roomId}: fewer than 2 players — cleared restartReady and reset match state`);
        } catch (e) { console.error('error resetting room after leave', e); }
      }
      io.to(roomId).emit("room-update", { roomId, room: sanitizeRoom(room) });
      // also sweep other rooms that may have become empty
      cleanupEmptyRooms();
    }
  }

  function findClientIdForSocket(room, socketId) {
    for (const [cid, sset] of room.clientSockets.entries()) {
      if (sset.has(socketId)) return cid;
    }
    return null;
  }

  function normalizePlayers(room) {
    if (!room || !Array.isArray(room.players)) return;
    // enforce ordering: players[0] = first joined -> X, players[1] = second -> O
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      const newSymbol = i === 0 ? 'X' : 'O';
      p.symbol = newSymbol;
      // update connected socket state if available
      try {
        const s = io.sockets.sockets.get(p.socketId);
        if (s) s.data.symbol = newSymbol;
      } catch (e) {}
    }
  }

  function arePlayersConnected(room) {
    if (!room || !Array.isArray(room.players) || room.players.length !== 2) return false;
    try {
      return room.players.every(p => {
        const sset = room.clientSockets && room.clientSockets.get(p.clientId);
        return sset && sset.size > 0;
      });
    } catch (e) { return false; }
  }
});

function sanitizeRoom(room) {
    return {
    players: room.players.map(p => ({ name: p.name, symbol: p.symbol, clientId: p.clientId, photo: p.photo || null, disconnected: room.pendingDisconnects && room.pendingDisconnects.has(p.clientId) })),
    spectators: room.spectators ? Array.from(room.spectators.values()).map(s => ({ name: s.name || 'Spectator', photo: s.photo || null })) : 0,
    restartReady: room.restartReady ? Array.from(room.restartReady) : [],
    waitingFor: room.waitingFor || null,
    terminated: !!room.terminated,
    tie: !!room.tie,
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

// periodic cleanup of empty rooms to ensure stale rooms are removed
setInterval(() => {
  try {
    cleanupEmptyRooms();
  } catch (e) { console.error('periodic cleanup failed', e); }
}, 60 * 1000);