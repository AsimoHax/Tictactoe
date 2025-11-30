// server.js
const express = require('express');
const firebaseAdmin = require('firebase-admin');
const cors = require('cors');
const WebSocket = require("ws");

const app = express();
const port = process.env.PORT || 5000;

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

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});


const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const userId = req.query.userId; // This can be passed from the client on connection

  // Send an initial welcome message
  ws.send(JSON.stringify({ type: 'welcome', message: 'Welcome to the room!' }));

  // Listen for moves or game actions from the client
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    const { type, roomId, move, playerId } = data;

    if (type === "move") {
      // Update Firestore with the new move
      // Then broadcast updated game state to all clients in the room
      updateGameState(roomId, move, playerId);
    }
  });

  // Function to update the game state in Firestore
  async function updateGameState(roomId, move, playerId) {
    const roomRef = doc(db, "rooms", roomId);
    const roomData = (await getDoc(roomRef)).data();
    
    // Update the game state in Firestore (e.g., board and current player)
    const updatedGameState = applyMove(roomData.gameState, move, playerId);
    await updateDoc(roomRef, { gameState: updatedGameState });
    
    // Send the updated game state to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "gameUpdate", gameState: updatedGameState }));
      }
    });
  }

  // Helper to apply the move and check for a winner
  function applyMove(gameState, move, playerId) {
    const newBoard = [...gameState.board];
    newBoard[move] = playerId;
    return { ...gameState, board: newBoard };
  }
});