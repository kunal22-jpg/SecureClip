console.log("---------------------------------------------------");
console.log("⚡ SERVER: FINAL AUTO-DETECT (BEST FOR GIF/STICKER) ⚡");
console.log("---------------------------------------------------");

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

let clips = []; 
let roomNames = {}; 

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
  const { room } = req.query;
  const roomClips = clips.filter(c => c.room === room);
  res.json(roomClips.reverse());
});

// 🔥 POST CLIP - THE "AUTO DETECT" FIX
app.post('/api/clips', upload.single('file'), async (req, res) => {
  try {
    const { text, room } = req.body;
    let fileData = null;

    if (req.file) {
      console.log(`[DEBUG] Uploading: ${req.file.originalname} (${req.file.mimetype})`);

      // 1. Determine Upload Strategy
      // Audio needs 'video' resource_type in Cloudinary to play correctly
      // Everything else (Images, GIFs, Stickers, Videos) can be 'auto'
      let uploadResourceType = 'auto';
      
      if (req.file.mimetype.startsWith('audio')) {
        uploadResourceType = 'video'; 
      }

      // 2. Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: uploadResourceType, 
        folder: 'universal-clipboard',
        use_filename: true,
        unique_filename: false
      });

      fs.unlinkSync(req.file.path);

      // 3. Determine Final Type from Cloudinary Response
      let finalType = 'file'; // Default

      // If Cloudinary says it's an image (JPG, PNG, GIF, WEBP)
      if (uploadResult.resource_type === 'image') {
        finalType = 'image';
      } 
      // If Cloudinary says it's a video (MP4, AVI) OR if we uploaded Audio
      else if (uploadResult.resource_type === 'video') {
        // Distinguish between Audio and Video based on extension or mimetype
        if (req.file.mimetype.startsWith('audio') || uploadResult.format === 'mp3' || uploadResult.format === 'wav') {
            finalType = 'audio';
        } else {
            finalType = 'video';
        }
      }

      console.log(`[DEBUG] Cloudinary detected: ${uploadResult.resource_type} -> App Saved as: ${finalType}`);

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
    console.error("Upload Error:", e);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).send(e.message);
  }
});

app.delete('/api/clips/:id', (req, res) => {
  clips = clips.filter(c => c._id !== req.params.id);
  res.json({ message: 'Deleted' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
