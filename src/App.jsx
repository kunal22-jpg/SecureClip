import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaCopy, FaCheck, FaTrash, FaPaperclip, FaLock, FaSignOutAlt, FaFileAlt } from 'react-icons/fa';
import api from './api';
import './App.css';

function App() {
  const [room, setRoom] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [clips, setClips] = useState([]);
  
  const [mode, setMode] = useState('create');
  const [inputName, setInputName] = useState(''); 
  const [inputCode, setInputCode] = useState('');

  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!room) return;
    fetchClips();
    const interval = setInterval(fetchClips, 3000);
    return () => clearInterval(interval);
  }, [room]);

  const handleCreate = async () => {
    if (!inputName.trim()) return alert("Enter a room name!");
    // Generate code
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    
    // Register room on server
    await api.post('/room-check', { room: code, name: inputName });

    setRoom(code);
    setDisplayName(inputName);
  };

  // --- STRICT JOIN LOGIC ---
  const handleJoin = async () => {
    if (inputCode.length !== 5) return alert("Enter valid 5-digit code!");
    
    try {
      // Check if room exists
      const res = await api.post('/room-check', { room: inputCode });
      
      // IF SERVER SAYS NULL -> STOP HERE
      if (!res.data.name) {
        alert("❌ Room Not Found! Ask the creator for the correct code.");
        return; 
      }
      
      // If room exists, let them in
      setDisplayName(res.data.name);
      setRoom(inputCode);
    } catch (err) {
      alert("Connection Error");
    }
  };

  const fetchClips = async () => {
    try {
      const res = await api.get(`/clips?room=${room}`);
      setClips(res.data);
    } catch (err) { console.error("Error"); }
  };

  const handleSubmit = async () => {
    if (!text && !file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('text', text);
    formData.append('room', room);
    if (file) formData.append('file', file);

    try {
      await api.post('/clips', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setText(''); setFile(null);
      fetchClips();
    } catch (err) { alert("Error posting"); } 
    finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    await api.delete(`/clips/${id}`);
    fetchClips();
  };

  const handleCopy = async (txt, id) => {
    try {
      await navigator.clipboard.writeText(txt);
      showCheckmark(id);
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = txt;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showCheckmark(id);
      } catch (err) {
        alert("Copy failed");
      }
      document.body.removeChild(textArea);
    }
  };

  const showCheckmark = (id) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: files => setFile(files[0]),
    multiple: false
  });

  // --- LOBBY VIEW ---
  if (!room) {
    return (
      <div className="container">
        <div className="lobby-card">
          <h1 className="lobby-title">SecureClip</h1>
          
          <div className="tab-switcher" style={{marginTop: '20px'}}>
            <button className={`tab-btn ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>Create Room</button>
            <button className={`tab-btn ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>Join Room</button>
          </div>

          {mode === 'create' ? (
            <>
              <input 
                className="lobby-input" 
                placeholder="Name your room (e.g. Kunal's Mac)" 
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
              />
              <button className="full-btn" onClick={handleCreate}>Generate Code & Enter</button>
            </>
          ) : (
            <>
              <input 
                className="lobby-input" 
                placeholder="Enter 5-Digit Code" 
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                maxLength={5}
                type="number"
              />
              <button className="full-btn" onClick={handleJoin}>Connect to Device</button>
            </>
          )}
        </div>
        <div className="footer">© 2026 kunalzz • SecureClip</div>
      </div>
    );
  }

  // --- ACTIVE ROOM VIEW ---
  return (
    <div className="container">
      <header>
        <div className="brand">SecureClip</div>
        <div className="room-badge">
          <FaLock className="lock-icon" />
          <span className="room-name">{displayName} <span style={{opacity:0.5}}>#{room}</span></span>
        </div>
        <FaSignOutAlt className="exit-icon" onClick={() => setRoom(null)} title="Exit Room" />
      </header>

      <div className="input-card">
        <textarea 
          className="text-area"
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder="What's on your clipboard?" 
        />
        {file && (
          <div style={{marginBottom:'15px', color:'#6366f1', fontSize:'0.9rem', fontWeight:'500'}}>
             📎 {file.name} <span style={{cursor:'pointer', marginLeft:'8px', color:'#ef4444'}} onClick={()=>setFile(null)}>✕</span>
          </div>
        )}
        <div className="toolbar">
          <div {...getRootProps()} className="attach-btn">
            <input {...getInputProps()} />
            <FaPaperclip /> {file ? 'Change File' : 'Attach File'}
          </div>
          <button className="post-btn" onClick={handleSubmit} disabled={uploading}>
            {uploading ? 'Posting...' : 'Post Clip'}
          </button>
        </div>
      </div>

      <div className="feed">
        {clips.map((clip) => (
          <div key={clip._id} className="clip-card">
            <div className="clip-meta">
              <span className="timestamp">{new Date(clip.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              <div className="actions">
                {clip.text && (
                  <button className="icon-btn" onClick={() => handleCopy(clip.text, clip._id)}>
                    {copiedId === clip._id ? <FaCheck style={{color:'#4ade80'}} /> : <FaCopy />}
                  </button>
                )}
                <button className="icon-btn delete-btn" onClick={() => handleDelete(clip._id)}><FaTrash /></button>
              </div>
            </div>
            {clip.text && <div className="clip-text">{clip.text}</div>}
            {clip.fileUrl && (
              <div className="media-box">
                {clip.fileType === 'video' ? <video controls src={clip.fileUrl} /> : 
                 clip.fileType === 'image' ? <img src={clip.fileUrl} alt="Clip" /> : 
                 <a href={clip.fileUrl} target="_blank" className="file-pill"><FaFileAlt /> Download File</a>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="footer">© 2026 kunalzz • SecureClip</div>
    </div>
  );
}

export default App;