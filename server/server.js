// server.js
const express = require('express');
const firebaseAdmin = require('firebase-admin');
const cors = require('cors');

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
