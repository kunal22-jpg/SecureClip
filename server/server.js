console.log("---------------------------------------------------");
console.log("⚡ SERVER: VOLATILE MEMORY + ROOM NAMES ⚡");
console.log("---------------------------------------------------");

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
app.use(cors());
app.use(express.json());

// --- MEMORY STORAGE ---
let clips = []; 
let roomNames = {}; // <--- NEW: Stores { "58291": "Kunal's Mac" }

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'universal-clipboard', resource_type: 'auto' },
});
const upload = multer({ storage: storage });

// --- NEW ENDPOINT: REGISTER OR GET ROOM NAME ---
app.post('/api/room-check', (req, res) => {
  const { room, name } = req.body;
  
  // If a name is sent (Creator), save it!
  if (name) {
    roomNames[room] = name;
  }

  // Return the saved name (or null if it doesn't exist)
  res.json({ name: roomNames[room] || null });
});

// GET CLIPS
app.get('/api/clips', (req, res) => {
  const { room } = req.query;
  const roomClips = clips.filter(c => c.room === room);
  res.json(roomClips.reverse());
});

// POST CLIP
app.post('/api/clips', upload.single('file'), (req, res) => {
  try {
    const { text, room } = req.body;
    let fileUrl = req.file ? req.file.path : null;
    let fileType = req.file ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') : null;

    if (!text && !fileUrl) return res.status(400).json({ error: 'Empty clip' });

    const newClip = {
      _id: Date.now().toString(),
      text,
      fileUrl,
      fileType,
      room,
      createdAt: new Date().toISOString()
    };

    clips.push(newClip);
    if (clips.length > 50) clips.shift(); 

    res.json(newClip);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// DELETE CLIP
app.delete('/api/clips/:id', (req, res) => {
  clips = clips.filter(c => c._id !== req.params.id);
  res.json({ message: 'Deleted' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));