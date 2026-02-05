import { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaCopy, FaCheck, FaTrash, FaPaperclip, FaLock, FaSignOutAlt, FaFileAlt, FaDownload, FaImage, FaTimes, FaMusic, FaEye } from 'react-icons/fa';
import api from './api';
import './App.css';

function App() {
  const [room, setRoom] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [clips, setClips] = useState([]);
  
  // 🔥 NEW: Loading State for Boot Animation
  const [isLoading, setIsLoading] = useState(false);

  const [mode, setMode] = useState('create');
  const [inputName, setInputName] = useState(''); 
  const [inputCode, setInputCode] = useState('');

  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [customFileName, setCustomFileName] = useState(''); 

  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [modalFile, setModalFile] = useState({ url: '', name: '' });
  const [modalInputName, setModalInputName] = useState('');

  // Image Preview State
  const [previewImage, setPreviewImage] = useState(null);

  // 🔥 KEEP ALIVE: Pings Render every 5 minutes to prevent 15-min timeout
  useEffect(() => {
    const keepAlive = setInterval(() => {
      console.log("💓 Sending Heartbeat to Render...");
      // We send a dummy request to reset the timer
      api.post('/room-check', { room: 'keep-alive' })
         .catch(err => console.log("Heartbeat silent fail")); 
    }, 5 * 60 * 1000); // 5 Minutes

    return () => clearInterval(keepAlive);
  }, []);

  // Refs
  const inputRef = useRef(null);       
  const renameInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const modalInputRef = useRef(null); 
  const abortControllerRef = useRef(null);

  // --- 🔥 UPDATED DROPZONE CONFIG ---
  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop: files => {
      const droppedFile = files[0];
      setFile(droppedFile);
      setCustomFileName(droppedFile.name); 
      setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 50);
    },
    multiple: false,
    noClick: true 
  });

  useEffect(() => {
    if (!room) return;
    fetchClips();
    const interval = setInterval(fetchClips, 3000);
    window.addEventListener('keydown', handleGlobalKeys);
    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleGlobalKeys);
    };
  }, [room, clips, file, text, showModal, previewImage]); 

  const handleGlobalKeys = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        if (previewImage) { setPreviewImage(null); return; }
        if (showModal) { setShowModal(false); return; }
        if (file) { handleRemoveFile(); setTimeout(() => inputRef.current?.focus(), 10); return; }
    }

    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        if (file) {
            handleRemoveFile();
        } else {
            open(); 
        }
    }

    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (showModal) {
            setShowModal(false); 
        } else {
            const latestFileClip = clips.find(c => c.fileUrl);
            if (latestFileClip) {
                openDownloadModal(latestFileClip.fileUrl, latestFileClip.fileName);
            } else {
                alert("No file to download!");
            }
        }
    }
  };

  // 🔥 UPDATED CREATE with Animation
  const handleCreate = async () => {
    if (!inputName.trim()) return alert("Enter a room name!");
    
    setIsLoading(true); // START ANIMATION

    try {
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        await api.post('/room-check', { room: code, name: inputName });
        setRoom(code);
        setDisplayName(inputName);
    } catch (error) {
        console.error("Server wakeup error", error);
        alert("Connecting to server... (It might be waking up)");
    } finally {
        setIsLoading(false); // STOP ANIMATION
    }
  };

  // 🔥 UPDATED JOIN with Animation
  const handleJoin = async () => {
    if (inputCode.length !== 5) return alert("Enter valid 5-digit code!");
    
    setIsLoading(true); // START ANIMATION

    try {
      const res = await api.post('/room-check', { room: inputCode });
      if (!res.data.name) {
        alert("❌ Room Not Found!");
        return; 
      }
      setDisplayName(res.data.name);
      setRoom(inputCode);
    } catch (err) { 
        alert("Connection Error. Server might be waking up."); 
    } finally {
        setIsLoading(false); // STOP ANIMATION
    }
  };

  const handleLobbyKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (mode === 'create') handleCreate();
      else handleJoin();
    }
  };

  const fetchClips = async () => {
    try {
      const res = await api.get(`/clips?room=${room}`);
      setClips(res.data);
    } catch (err) { console.error("Error"); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); 
      handleSubmit(); 
    }
  };

  const handleRemoveFile = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
      setFile(null);
      setCustomFileName('');
      setUploading(false);
  };

  const handleSubmit = async () => {
    if (!text && !file) return;
    setUploading(true);
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const formData = new FormData();
    formData.append('text', text);
    formData.append('room', room);
    if (file) formData.append('file', file, customFileName || file.name); 

    try {
      await api.post('/clips', formData, { 
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: controller.signal 
      });

      if (controller.signal.aborted) return;

      setText(''); setFile(null); setCustomFileName(''); 
      fetchClips();
      setTimeout(() => { inputRef.current?.focus(); }, 10);

    } catch (err) { 
        if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === "ERR_CANCELED") {
            console.log("Upload aborted by user.");
        } else {
            alert("Error posting"); 
        }
    } 
    finally { 
        if (abortControllerRef.current === controller) {
            setUploading(false); 
            abortControllerRef.current = null;
        }
    }
  };

  const handleDelete = async (id) => {
    await api.delete(`/clips/${id}`);
    fetchClips();
  };

  const handleCopy = async (txt, id) => {
    try {
      await navigator.clipboard.writeText(txt);
      showCheckmark(id);
    } catch (err) { alert("Copy failed"); }
  };

  const handleCopyImage = async (imgUrl, id) => {
    try {
        const response = await fetch(imgUrl, { mode: 'cors' });
        const blob = await response.blob();
        await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
        ]);
        showCheckmark(id);
    } catch (err) { 
        console.error("Copy failed:", err);
        alert("Failed to copy image. Browser block or CORS issue.");
    }
  };

  const showCheckmark = (id) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const performDownload = async (fileUrl, fileName) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      
      const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
      let finalName = fileName;
      if (extension && !finalName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
        finalName = `${finalName}.${extension}`;
      }
      
      link.download = finalName; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      
      setShowModal(false); 
    } catch (err) { window.open(fileUrl, '_blank'); setShowModal(false); }
  };

  const openDownloadModal = (url, name) => {
      setModalFile({ url, name: name || 'file' });
      setModalInputName(name || 'file');
      setShowModal(true);
      setTimeout(() => modalInputRef.current?.select(), 50);
  };

  const formatTextWithLinks = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline', wordBreak: 'break-all' }} onClick={(e) => e.stopPropagation()}>
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div className="container">
      {/* 🔥 3D BOOT ANIMATION OVERLAY 🔥 */}
      {isLoading && (
        <div className="loader-overlay">
          <div className="spinner-box">
            <div className="cube-wrapper">
              <div className="face face1"></div>
              <div className="face face2"></div>
              <div className="face face3"></div>
              <div className="face face4"></div>
              <div className="face face5"></div>
              <div className="face face6"></div>
            </div>
          </div>
          <div className="boot-text">ESTABLISHING UPLINK...</div>
        </div>
      )}

      {/* Main App Content - Hidden ONLY if Room is not set yet (Lobby logic handled here) */}
      {!room ? (
        <div className="container">
            <div className="lobby-card">
            <h1 className="lobby-title">SecureClip</h1>
            <div className="tab-switcher" style={{marginTop: '20px'}}>
                <button className={`tab-btn ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>Create Room</button>
                <button className={`tab-btn ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>Join Room</button>
            </div>
            {mode === 'create' ? (
                <>
                <input key="create-input" autoFocus className="lobby-input" placeholder="Name your room (e.g. Kunal's Mac)" value={inputName} onChange={(e) => setInputName(e.target.value)} onKeyDown={handleLobbyKeyDown} />
                <button className="full-btn" onClick={handleCreate}>Generate Code & Enter</button>
                </>
            ) : (
                <>
                <input key="join-input" autoFocus className="lobby-input" placeholder="Enter 5-Digit Code" value={inputCode} onChange={(e) => setInputCode(e.target.value)} maxLength={5} type="number" onKeyDown={handleLobbyKeyDown} />
                <button className="full-btn" onClick={handleJoin}>Connect to Device</button>
                </>
            )}
            </div>
            <div className="footer">© 2026 kunalzz • SecureClip</div>
        </div>
      ) : (
        /* ACTIVE ROOM UI */
        <div className="container">
            <header>
                <div className="brand">SecureClip</div>
                <div className="room-badge">
                <FaLock className="lock-icon" />
                <span className="room-name">{displayName} <span style={{opacity:0.5}}>#{room}</span></span>
                </div>
                <FaSignOutAlt className="exit-icon" onClick={() => setRoom(null)} title="Exit Room" />
            </header>

            <div {...getRootProps()} className="input-card" style={{ position: 'relative', outline: 'none' }}>
                <input {...getInputProps()} />

                <textarea ref={inputRef} className="text-area" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="What's on your clipboard?" autoFocus />
                
                {file && (
                <div style={{ marginBottom:'15px', display:'flex', alignItems:'center', gap:'10px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                    <span style={{fontSize:'1.2rem'}}>📎</span>
                    <input ref={renameInputRef} className="rename-input" value={customFileName} onChange={(e) => setCustomFileName(e.target.value)} onKeyDown={(e) => { if(e.key==='Enter') handleSubmit(); }} placeholder="Rename file..." style={{flex: 1, minWidth: '0'}} />
                    <span 
                        style={{cursor:'pointer', marginLeft:'auto', color:'#ef4444', padding:'5px'}} 
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }} 
                        title={uploading ? "Cancel Upload" : "Remove File (Esc)"}
                    >
                        {uploading ? "■" : "✕"}
                    </span>
                </div>
                )}

                <div className="toolbar">
                <div className="attach-btn" onClick={(e) => { e.stopPropagation(); open(); }}>
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
                        {clip.text && !clip.fileType && (
                            <button className="icon-btn" onClick={() => handleCopy(clip.text, clip._id)}>
                                {copiedId === clip._id ? <FaCheck style={{color:'#4ade80'}} /> : <FaCopy />}
                            </button>
                        )}

                        {clip.fileType === 'image' && (
                            <>
                                <button className="icon-btn" title="Copy Image" onClick={() => handleCopyImage(clip.fileUrl, clip._id)}>
                                    {copiedId === clip._id ? <FaCheck style={{color:'#4ade80'}} /> : <FaImage />}
                                </button>
                                <button className="icon-btn" title="View" onClick={() => setPreviewImage(clip.fileUrl)}>
                                    <FaEye />
                                </button>
                                <button className="icon-btn" title="Download" onClick={() => openDownloadModal(clip.fileUrl, clip.fileName)}>
                                    <FaDownload />
                                </button>
                            </>
                        )}

                        {(clip.fileType === 'video' || clip.fileType === 'audio' || clip.fileType === 'file') && (
                            <button className="icon-btn" title="Download" onClick={() => openDownloadModal(clip.fileUrl, clip.fileName)}>
                                <FaDownload />
                            </button>
                        )}

                        <button className="icon-btn delete-btn" onClick={() => handleDelete(clip._id)}>
                            <FaTrash />
                        </button>
                    </div>
                    </div>
                    
                    {clip.text && <div className="clip-text">{formatTextWithLinks(clip.text)}</div>}
                    
                    {clip.fileUrl && (
                    <div className="media-box">
                        {clip.fileType === 'audio' && (
                            <div style={{width:'100%', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '10px', display:'flex', alignItems:'center', gap:'12px', border: '1px solid var(--border-color)'}}>
                                <div style={{width:'40px', height:'40px', background:'rgba(99, 102, 241, 0.2)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0}}>
                                    <FaMusic style={{color:'#6366f1', fontSize: '1.2rem'}} />
                                </div>
                                <audio controls src={clip.fileUrl} style={{width:'100%', height:'36px', outline:'none'}} />
                            </div>
                        )}
                        {clip.fileType === 'video' && <video controls src={clip.fileUrl} />}
                        {clip.fileType === 'image' && (
                            <div style={{position:'relative', cursor:'zoom-in'}} onClick={() => setPreviewImage(clip.fileUrl)}>
                                <img src={clip.fileUrl} alt="Clip" />
                            </div>
                        )}
                        {clip.fileType === 'file' && (
                        <a href="#" onClick={(e) => { e.preventDefault(); openDownloadModal(clip.fileUrl, clip.fileName); }} className="file-pill">
                            <FaFileAlt /> {clip.fileName || "Download File"} 
                        </a>
                        )}
                    </div>
                    )}
                </div>
                ))}
            </div>

            {previewImage && (
                <div className="preview-modal" onClick={() => setPreviewImage(null)}>
                    <div className="close-preview">✕</div>
                    <img src={previewImage} className="preview-image" alt="Full View" onClick={(e) => e.stopPropagation()} />
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}>
                            <h3 style={{color:'white', margin:0}}>Download File</h3>
                            <FaTimes style={{cursor:'pointer', color:'#ef4444'}} onClick={() => setShowModal(false)} />
                        </div>
                        <input ref={modalInputRef} className="lobby-input" value={modalInputName} onChange={(e) => setModalInputName(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') performDownload(modalFile.url, modalInputName); }} placeholder="Enter file name..." />
                        <button className="full-btn" style={{marginTop:'15px'}} onClick={() => performDownload(modalFile.url, modalInputName)}>Download Now</button>
                    </div>
                </div>
            )}

            <div className="footer">© 2026 kunalzz • SecureClip</div>
        </div>
      )}
    </div>
  );
}

export default App;
