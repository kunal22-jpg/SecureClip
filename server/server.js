console.log("---------------------------------------------------");
console.log("⚡ SERVER: FINAL (WITH CLEAR ROOM, WINNING LINE & DRAW LOGIC) ⚡");
console.log("---------------------------------------------------");

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const fs = require('fs');
const https = require('https'); 

const app = express();
app.use(cors());
app.use(express.text()); 
app.use(express.json());

let clips = []; 
let roomNames = {}; 
let activeUsers = {}; 
let games = {}; 

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage: storage });

// --- ROUTES ---

app.post('/api/room-check', (req, res) => {
  const { room, name } = req.body;
  if (name) roomNames[room] = name;
  res.json({ name: roomNames[room] || null });
});

app.get('/api/clips', (req, res) => {
  const { room, userId } = req.query; 

  if (room && userId) {
    if (!activeUsers[room]) activeUsers[room] = {};
    activeUsers[room][userId] = Date.now();
  }

  let memberCount = 0;
  const now = Date.now();
  if (activeUsers[room]) {
    for (const id in activeUsers[room]) {
       if (now - activeUsers[room][id] > 5000) {
         delete activeUsers[room][id];
       } else {
         memberCount++;
       }
    }
  }

  const roomClips = clips.filter(c => c.room === room);
  
  res.json({
    clips: roomClips.reverse(),
    members: memberCount
  });
});

app.post('/api/leave', (req, res) => {
    const { room, userId } = req.query;
    if (room && userId && activeUsers[room] && activeUsers[room][userId]) {
        delete activeUsers[room][userId];
    }
    res.sendStatus(200);
});

// 🔥 NEW ROUTE: CLEAR ALL DATA IN ROOM
app.delete('/api/room/clear', (req, res) => {
    const { room } = req.query;
    
    if (!room) return res.status(400).json({ error: "Room ID required" });

    // 1. Delete all clips in this room
    const initialCount = clips.length;
    clips = clips.filter(c => c.room !== room);

    // 2. Delete all games in this room
    for (const gameId in games) {
        if (games[gameId].room === room) {
            delete games[gameId];
        }
    }

    console.log(`🧹 Room ${room} cleared. Removed ${initialCount - clips.length} clips.`);
    res.json({ message: "Room cleared successfully" });
});

app.get('/api/proxy-image', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('No URL provided');
    https.get(url, (response) => {
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Access-Control-Allow-Origin', '*'); 
        response.pipe(res);
    }).on('error', (err) => res.status(500).send(err.message));
});

app.post('/api/clips', upload.single('file'), async (req, res) => {
  try {
    const { text, room } = req.body;
    let fileData = null;

    if (req.file) {
      let uploadResourceType = 'auto';
      if (req.file.mimetype.startsWith('audio')) uploadResourceType = 'video'; 

      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: uploadResourceType, 
        folder: 'universal-clipboard',
        use_filename: true,
        unique_filename: false
      });

      fs.unlinkSync(req.file.path);

      let finalType = 'file';
      if (uploadResult.resource_type === 'image') finalType = 'image';
      else if (uploadResult.resource_type === 'video') {
        if (req.file.mimetype.startsWith('audio') || uploadResult.format === 'mp3' || uploadResult.format === 'wav') {
            finalType = 'audio';
        } else {
            finalType = 'video';
        }
      }

      fileData = {
        url: uploadResult.secure_url,
        type: finalType,
        publicId: uploadResult.public_id
      };
    }

    if (!text && !fileData) return res.status(400).json({ error: 'Empty clip' });

    const newClip = {
      _id: Date.now().toString(),
      text,
      fileUrl: fileData ? fileData.url : null,
      fileType: fileData ? fileData.type : null,
      fileName: req.file ? req.file.originalname : null,
      room,
      createdAt: new Date().toISOString()
    };

    clips.push(newClip);
    if (clips.length > 50) clips.shift(); 

    res.json(newClip);

  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).send(e.message);
  }
});

app.delete('/api/clips/:id', (req, res) => {
  clips = clips.filter(c => c._id !== req.params.id);
  res.json({ message: 'Deleted' });
});

// --- 🎮 MULTIPLAYER TIC-TAC-TOE ROUTES ---

app.get('/api/games/list', (req, res) => {
    const { room } = req.query;
    const roomGames = Object.values(games)
        .filter(g => g.room === room)
        .filter(g => !g.winner && !g.isDraw) // Hide finished games
        .map(g => ({
            id: g.id,
            players: g.players,
            winner: g.winner
        }));
    res.json(roomGames);
});

app.post('/api/games/create', (req, res) => {
    const { room, userId, userName } = req.body;
    const gameId = Date.now().toString();
    
    games[gameId] = {
        id: gameId,
        room: room,
        board: Array(9).fill(null),
        turn: 'X', 
        winner: null,
        winningLine: null, // 🔥 NEW: Track winning line for animation
        isDraw: false,
        players: [{ id: userId, name: userName, symbol: 'X' }]
    };
    
    res.json({ gameId });
});

app.post('/api/games/join', (req, res) => {
    const { gameId, userId, userName } = req.body;
    const game = games[gameId];
    
    if (!game) return res.status(404).json({ error: "Game not found" });
    const existing = game.players.find(p => p.id === userId);
    if (existing) return res.json({ message: "Rejoined" });
    if (game.players.length >= 2) return res.status(400).json({ error: "Game is full!" });

    game.players.push({ id: userId, name: userName, symbol: 'O' });
    res.json({ message: "Joined", symbol: 'O' });
});

app.get('/api/games/:gameId', (req, res) => {
    const { gameId } = req.params;
    const game = games[gameId];
    if (!game) return res.status(404).send("Game not found");
    res.json(game);
});

app.post('/api/games/:gameId/move', (req, res) => {
    const { gameId } = req.params;
    const { index, userId } = req.body;
    
    const game = games[gameId];
    if (!game) return res.status(404).send("No game");
    if (game.winner || game.isDraw || game.board[index]) return res.json(game); 

    const player = game.players.find(p => p.id === userId);
    if (!player) return res.status(403).send("Spectators cannot play");
    if (player.symbol !== game.turn) return res.json(game); 

    game.board[index] = player.symbol;
    
    // 🔥 WINNER CHECK + LINE DETECTION
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    
    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
            game.winner = game.board[a];
            game.winningLine = lines[i]; // 🔥 SAVE THE WINNING LINE (e.g. [0,1,2])
            break;
        }
    }

    if (!game.winner && game.board.every(Boolean)) {
        game.isDraw = true;
    }

    if (!game.winner && !game.isDraw) {
        game.turn = game.turn === 'X' ? 'O' : 'X';
    }

    res.json(game);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
