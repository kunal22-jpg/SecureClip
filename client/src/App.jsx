import { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaCopy, FaCheck, FaTrash, FaPaperclip, FaLock, FaSignOutAlt, FaFileAlt, FaDownload, FaImage, FaTimes, FaMusic, FaEye, FaUsers, FaGamepad } from 'react-icons/fa';
import api from './api';
import './App.css';

function App() {
  const [room, setRoom] = useState(() => sessionStorage.getItem('secureclip_room') || null);
  const [displayName, setDisplayName] = useState(() => sessionStorage.getItem('secureclip_name') || '');
  const [clips, setClips] = useState([]);
  const [showClearModal, setShowClearModal] = useState(false);
  
  const [myUserId] = useState(() => {
      let id = sessionStorage.getItem('secureclip_uid');
      if (!id) {
          id = Math.random().toString(36).substr(2, 9);
          sessionStorage.setItem('secureclip_uid', id);
      }
      return id;
  });

  const [memberCount, setMemberCount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // --- GAME STATE ---
  const [showGameModal, setShowGameModal] = useState(false);
  const [activeGameId, setActiveGameId] = useState(null);
  const [lobbyGames, setLobbyGames] = useState([]);
  const [gameState, setGameState] = useState({ 
      board: Array(9).fill(null), 
      turn: 'X', 
      winner: null, 
      winningLine: null, 
      isDraw: false,
      players: [],
      status: 'waiting' 
  });

  const [mode, setMode] = useState('create');
  const [inputName, setInputName] = useState(''); 
  const [inputCode, setInputCode] = useState('');

  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [customFileName, setCustomFileName] = useState(''); 

  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [modalFile, setModalFile] = useState({ url: '', name: '' });
  const [modalInputName, setModalInputName] = useState('');

  const [previewImage, setPreviewImage] = useState(null);

  const inputRef = useRef(null);       
  const renameInputRef = useRef(null);
  const modalInputRef = useRef(null); 
  const abortControllerRef = useRef(null);

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

  const handlePaste = (e) => {
    if (e.clipboardData.files.length > 0) {
        const pastedFile = e.clipboardData.files[0];
        if (pastedFile.type.startsWith('image')) {
            e.preventDefault();
            setFile(pastedFile);
            setCustomFileName("pasted-image.png");
            setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 50);
        }
    }
  };

  useEffect(() => {
      if (activeGameId && (gameState.winner || gameState.isDraw)) {
          const timer = setTimeout(() => {
              setActiveGameId(null);
              setShowGameModal(false);
          }, 15000); 
          return () => clearTimeout(timer);
      }
  }, [gameState.winner, gameState.isDraw, activeGameId]);

  useEffect(() => {
    if (!room) return;
    
    fetchClips();

    const syncGame = async () => {
        if (!showGameModal) return;
        try {
            if (!activeGameId) {
                const res = await api.get(`/games/list?room=${room}`);
                setLobbyGames(res.data);
            } else {
                const res = await api.get(`/games/${activeGameId}`);
                setGameState(res.data);
            }
        } catch (e) { console.error("Game sync error", e); }
    };
    if (showGameModal) syncGame();

    const interval = setInterval(() => {
        fetchClips();
        if (showGameModal) syncGame();
    }, 1000); 

    window.addEventListener('keydown', handleGlobalKeys);

    const handleUnload = () => {
        const baseUrl = api.defaults.baseURL || ''; 
        const leaveUrl = `${baseUrl}/leave?room=${room}&userId=${myUserId}`;
        navigator.sendBeacon(leaveUrl);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleGlobalKeys);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [room, clips, file, text, showModal, previewImage, showGameModal, activeGameId]); 

  const handleGlobalKeys = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        if (showClearModal) { setShowClearModal(false); return; }
        if (showGameModal) { setShowGameModal(false); setActiveGameId(null); return; }
        if (previewImage) { setPreviewImage(null); return; }
        if (showModal) { setShowModal(false); return; }
        if (file) { handleRemoveFile(); setTimeout(() => inputRef.current?.focus(), 10); return; }
    }

    if (e.altKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        setShowGameModal(true);
    }

    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        if (file) { handleRemoveFile(); } else { open(); }
    }

    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (showModal) { setShowModal(false); } 
        else {
            const latestFileClip = clips.find(c => c.fileUrl);
            if (latestFileClip) { openDownloadModal(latestFileClip.fileUrl, latestFileClip.fileName); } 
            else { alert("No file to download!"); }
        }
    }
  };

  const createGame = async () => {
      try {
          const res = await api.post('/games/create', { room, userId: myUserId, userName: displayName });
          setActiveGameId(res.data.gameId);
      } catch (err) { alert("Could not create game"); }
  };

  const joinGame = async (gameId) => {
      try {
          await api.post('/games/join', { gameId, userId: myUserId, userName: displayName });
          setActiveGameId(gameId);
      } catch (err) { alert(err.response?.data?.error || "Game full or unavailable"); }
  };

  const makeMove = async (index) => {
      if (gameState.board[index] || gameState.winner || gameState.isDraw) return;

      const me = gameState.players.find(p => p.id === myUserId);
      if (!me || me.symbol !== gameState.turn) return;

      const newBoard = [...gameState.board];
      newBoard[index] = gameState.turn;

      // Local Optimistic Update
      let localWinner = null;
      let localLine = null;
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (let i = 0; i < lines.length; i++) {
          const [a, b, c] = lines[i];
          if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
              localWinner = newBoard[a];
              localLine = lines[i];
              break;
          }
      }

      setGameState(prev => ({ 
          ...prev, 
          board: newBoard, 
          winner: localWinner || prev.winner,
          winningLine: localLine || prev.winningLine
      }));
      
      await api.post(`/games/${activeGameId}/move`, { index, userId: myUserId });
  };

  const leaveGame = () => {
      setActiveGameId(null);
  };

  const handleCreate = async () => {
    if (!inputName.trim()) return alert("Enter a room name!");
    setIsLoading(true);
    try {
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        await api.post('/room-check', { room: code, name: inputName });
        sessionStorage.setItem('secureclip_room', code);
        sessionStorage.setItem('secureclip_name', inputName);
        setRoom(code);
        setDisplayName(inputName);
    } catch (error) { alert("Connecting to server..."); } finally { setIsLoading(false); }
  };

  const handleJoin = async () => {
    if (inputCode.length !== 5) return alert("Enter valid 5-digit code!");
    setIsLoading(true);
    try {
      const res = await api.post('/room-check', { room: inputCode });
      if (!res.data.name) { alert("❌ Room Not Found!"); return; }
      sessionStorage.setItem('secureclip_room', inputCode);
      sessionStorage.setItem('secureclip_name', res.data.name);
      setDisplayName(res.data.name);
      setRoom(inputCode);
    } catch (err) { alert("Connection Error."); } finally { setIsLoading(false); }
  };

  const handleLogout = () => {
      api.post(`/leave?room=${room}&userId=${myUserId}`);
      sessionStorage.removeItem('secureclip_room');
      sessionStorage.removeItem('secureclip_name');
      setRoom(null);
      setDisplayName('');
      setClips([]);
      setShowGameModal(false); 
  };

  const handleClearRoom = async () => {
      try {
          await api.delete(`/room/clear?room=${room}`);
          setClips([]);
          setActiveGameId(null);
          setShowClearModal(false);
          alert("Room cleared successfully.");
      } catch (err) {
          alert("Failed to clear room.");
      }
  };

  const handleLobbyKeyDown = (e) => {
    if (e.key === 'Enter') { mode === 'create' ? handleCreate() : handleJoin(); }
  };

  const fetchClips = async () => {
    try {
      const res = await api.get(`/clips?room=${room}&userId=${myUserId}`);
      if (res.data.clips) {
          setClips(res.data.clips);
          setMemberCount(res.data.members || 1);
      } else { setClips(res.data); }
    } catch (err) { console.error("Error"); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleRemoveFile = () => {
      if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
      setFile(null); setCustomFileName(''); setUploading(false);
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
        if (err.name !== 'CanceledError') alert("Error posting"); 
    } finally { 
        if (abortControllerRef.current === controller) { setUploading(false); abortControllerRef.current = null; }
    }
  };

  const handleDelete = async (id) => {
    await api.delete(`/clips/${id}`);
    fetchClips();
  };

  const handleCopy = async (txt, id) => {
    try { await navigator.clipboard.writeText(txt); showCheckmark(id); } catch (err) { alert("Copy failed"); }
  };

  const handleCopyImage = async (imgUrl, id) => {
    try {
        const response = await fetch(imgUrl, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error("Direct fetch failed");
        const blob = await response.blob();
        await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
        showCheckmark(id);
    } catch (err) { 
        try {
            const proxyUrl = `/proxy-image?url=${encodeURIComponent(imgUrl)}`;
            const res = await api.get(proxyUrl, { responseType: 'blob' });
            await navigator.clipboard.write([ new ClipboardItem({ [res.data.type]: res.data }) ]);
            showCheckmark(id);
        } catch (finalErr) { alert("Failed to copy. Browser blocked it."); }
    }
  };

  const showCheckmark = (id) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const performDownload = async (fileUrl, fileName) => {
    try {
      const response = await fetch(fileUrl); const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = blobUrl;
      const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
      let finalName = fileName;
      if (extension && !finalName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) finalName = `${finalName}.${extension}`;
      link.download = finalName; document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(blobUrl);
      setShowModal(false); 
    } catch (err) { window.open(fileUrl, '_blank'); setShowModal(false); }
  };

  const openDownloadModal = (url, name) => {
      setModalFile({ url, name: name || 'file' }); setModalInputName(name || 'file');
      setShowModal(true); setTimeout(() => modalInputRef.current?.select(), 50);
  };

  const formatTextWithLinks = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, index) => {
      if (part.match(urlRegex)) return <a key={index} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline', wordBreak: 'break-all' }} onClick={(e) => e.stopPropagation()}>{part}</a>;
      return part;
    });
  };

  const getStatusText = () => {
      if (gameState.winner) return <span>Winner: <span style={{color: gameState.winner === 'X' ? '#6366f1' : '#4ade80'}}>{gameState.winner}</span> 🎉</span>;
      if (gameState.isDraw) return <span style={{color: '#facc15'}}>It's a Draw! 🤝</span>;
      return <span>Turn: <span style={{color: gameState.turn === 'X' ? '#6366f1' : '#4ade80'}}>{gameState.turn}</span></span>;
  };

  return (
    <div className="container">
      {isLoading && (
        <div className="loader-overlay">
          <div className="spinner-box">
            <div className="cube-wrapper"><div className="face face1"></div><div className="face face2"></div><div className="face face3"></div><div className="face face4"></div><div className="face face5"></div><div className="face face6"></div></div>
          </div>
          <div className="boot-text">ESTABLISHING UPLINK...</div>
        </div>
      )}

      {showClearModal && (
        <div className="modal-overlay" onClick={() => setShowClearModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{textAlign:'center', maxWidth:'400px'}}>
            <h3 style={{color:'#ef4444', marginBottom:'15px', fontSize:'1.5rem'}}>⚠️ Danger Zone</h3>
            <p style={{color:'#d1d5db', marginBottom:'25px', lineHeight:'1.6'}}>
              Are you sure you want to <strong>delete ALL clips</strong> in this room?<br/>
              This action <strong>cannot be undone</strong>.
            </p>
            <div style={{display:'flex', gap:'10px'}}>
              <button className="full-btn" onClick={() => setShowClearModal(false)} style={{background:'#3f3f46'}}>
                Cancel
              </button>
              <button className="full-btn" onClick={handleClearRoom} style={{background:'#ef4444'}}>
                Yes, Clear Room
              </button>
            </div>
          </div>
        </div>
      )}

      {showGameModal && (
          <div className="modal-overlay" onClick={() => setShowGameModal(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{textAlign:'center', minWidth:'320px', maxWidth:'400px'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px', alignItems:'center'}}>
                      <h3 style={{margin:0, color:'white', fontSize:'1.5rem'}}>Tic-Tac-Toe</h3>
                      <FaTimes style={{cursor:'pointer', color:'#ef4444'}} onClick={() => { setShowGameModal(false); setActiveGameId(null); }} />
                  </div>

                  {!activeGameId ? (
                      <div className="game-lobby">
                          <button className="full-btn" onClick={createGame} style={{marginBottom:'20px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'}}>
                              + Create New Game
                          </button>
                          <div style={{maxHeight:'200px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'10px'}}>
                              {lobbyGames.length === 0 ? (
                                  <p style={{opacity:0.5, fontStyle:'italic'}}>No active games. Start one!</p>
                              ) : (
                                  lobbyGames.map(g => (
                                      <div key={g.id} style={{background:'rgba(255,255,255,0.05)', padding:'12px', borderRadius:'10px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                          <div style={{textAlign:'left'}}>
                                              <div style={{fontWeight:'bold'}}>Game #{g.id.slice(-4)}</div>
                                              <div style={{fontSize:'0.8rem', opacity:0.7}}>{g.players.length}/2 Players</div>
                                          </div>
                                          <button className="icon-btn" style={{background:'#4ade80', color:'#000', padding:'5px 15px', borderRadius:'6px', fontWeight:'bold', fontSize:'0.9rem'}} onClick={() => joinGame(g.id)}>
                                              JOIN
                                          </button>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>
                  ) : (
                      <div className="game-board-view">
                          <div className="status-bar" style={{marginBottom:'20px', fontSize:'1.2rem', fontWeight:'bold', color: '#e2e8f0'}}>
                              {getStatusText()}
                          </div>

                          <div className="tic-tac-grid" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', background:'rgba(255,255,255,0.05)', padding:'10px', borderRadius:'15px', position:'relative'}}>
                              {/* Strike Line Logic Removed */}
                              
                              {gameState.board.map((cell, idx) => (
                                  <div 
                                    key={idx} 
                                    onClick={() => makeMove(idx)}
                                    style={{
                                        height:'80px', 
                                        background: cell ? (cell === 'X' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(74, 222, 128, 0.15)') : '#27272a',
                                        borderRadius:'8px',
                                        display:'flex', alignItems:'center', justifyContent:'center',
                                        fontSize:'3rem', fontWeight:'900',
                                        cursor: !cell && !gameState.winner && !gameState.isDraw ? 'pointer' : 'default',
                                        color: cell === 'X' ? '#6366f1' : '#4ade80',
                                        transition: 'all 0.2s ease',
                                        position: 'relative',
                                        zIndex: 1
                                    }}
                                  >
                                    {cell}
                                  </div>
                              ))}
                          </div>
                          
                          <button className="full-btn" style={{marginTop:'20px', background:'#3f3f46'}} onClick={leaveGame}>
                              Leave Game
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

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
        <div className="container">
            <header>
                <div className="brand">SecureClip</div>
                
                <div className="room-badge">
                  <FaLock className="lock-icon" />
                  <span className="room-name">{displayName} <span style={{opacity:0.5}}>#{room}</span></span>
                </div>

                <div 
                    className="room-badge" 
                    title="Play Tic-Tac-Toe (Alt+G)" 
                    onClick={() => setShowGameModal(true)} 
                    style={{cursor: 'pointer', padding: '8px 12px'}}
                >
                  <FaGamepad style={{color: '#a855f7', fontSize: '1.2rem'}} />
                </div>

                <div className="room-badge" title="Online Members">
                  <FaUsers className="lock-icon" style={{color: '#4ade80'}} />
                  <span className="room-name">{memberCount}</span>
                </div>

                <FaSignOutAlt className="exit-icon" onClick={handleLogout} title="Exit Room" />
            </header>

            <div {...getRootProps()} className="input-card" style={{ position: 'relative', outline: 'none' }}>
                <input {...getInputProps()} />
                <textarea ref={inputRef} className="text-area" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder="What's on your clipboard?" autoFocus />
                {file && (
                <div style={{ marginBottom:'15px', display:'flex', alignItems:'center', gap:'10px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                    <span style={{fontSize:'1.2rem'}}>📎</span>
                    <input ref={renameInputRef} className="rename-input" value={customFileName} onChange={(e) => setCustomFileName(e.target.value)} onKeyDown={(e) => { if(e.key==='Enter') handleSubmit(); }} placeholder="Rename file..." style={{flex: 1, minWidth: '0'}} />
                    <span style={{cursor:'pointer', marginLeft:'auto', color:'#ef4444', padding:'5px'}} onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }} title={uploading ? "Cancel Upload" : "Remove File (Esc)"}>{uploading ? "■" : "✕"}</span>
                </div>
                )}
                <div className="toolbar">
                <div className="attach-btn" onClick={(e) => { e.stopPropagation(); open(); }}><FaPaperclip /> {file ? 'Change File' : 'Attach File'}</div>
                <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                  <button 
                    className="delete-all-icon-btn" 
                    onClick={() => setShowClearModal(true)}
                    title="Delete all clips in this room"
                  >
                    <FaTrash />
                  </button>
                  <button className="post-btn" onClick={handleSubmit} disabled={uploading}>{uploading ? 'Posting...' : 'Post Clip'}</button>
                </div>
                </div>
            </div>

            <div className="feed">
                {clips.map((clip) => (
                <div key={clip._id} className="clip-card">
                    <div className="clip-meta">
                    <span className="timestamp">{new Date(clip.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <div className="actions">
                        {clip.text && !clip.fileType && (<button className="icon-btn" onClick={() => handleCopy(clip.text, clip._id)}>{copiedId === clip._id ? <FaCheck style={{color:'#4ade80'}} /> : <FaCopy />}</button>)}
                        {clip.fileType === 'image' && (<><button className="icon-btn" title="Copy Image" onClick={() => handleCopyImage(clip.fileUrl, clip._id)}>{copiedId === clip._id ? <FaCheck style={{color:'#4ade80'}} /> : <FaImage />}</button><button className="icon-btn" title="View" onClick={() => setPreviewImage(clip.fileUrl)}><FaEye /></button><button className="icon-btn" title="Download" onClick={() => openDownloadModal(clip.fileUrl, clip.fileName)}><FaDownload /></button></>)}
                        {(clip.fileType === 'video' || clip.fileType === 'audio' || clip.fileType === 'file') && (<button className="icon-btn" title="Download" onClick={() => openDownloadModal(clip.fileUrl, clip.fileName)}><FaDownload /></button>)}
                        <button className="icon-btn delete-btn" onClick={() => handleDelete(clip._id)}><FaTrash /></button>
                    </div>
                    </div>
                    {clip.text && <div className="clip-text">{formatTextWithLinks(clip.text)}</div>}
                    {clip.fileUrl && (
                    <div className="media-box">
                        {clip.fileType === 'audio' && (<div style={{width:'100%', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '10px', display:'flex', alignItems:'center', gap:'12px', border: '1px solid var(--border-color)'}}><div style={{width:'40px', height:'40px', background:'rgba(99, 102, 241, 0.2)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0}}><FaMusic style={{color:'#6366f1', fontSize: '1.2rem'}} /></div><audio controls src={clip.fileUrl} style={{width:'100%', height:'36px', outline:'none'}} /></div>)}
                        {clip.fileType === 'video' && <video controls src={clip.fileUrl} />}
                        {clip.fileType === 'image' && (<div style={{position:'relative', cursor:'zoom-in'}} onClick={() => setPreviewImage(clip.fileUrl)}><img src={clip.fileUrl} alt="Clip" /></div>)}
                        {clip.fileType === 'file' && (<a href="#" onClick={(e) => { e.preventDefault(); openDownloadModal(clip.fileUrl, clip.fileName); }} className="file-pill"><FaFileAlt /> {clip.fileName || "Download File"} </a>)}
                    </div>
                    )}
                </div>
                ))}
            </div>

            {previewImage && (<div className="preview-modal" onClick={() => setPreviewImage(null)}><div className="close-preview">✕</div><img src={previewImage} className="preview-image" alt="Full View" onClick={(e) => e.stopPropagation()} /></div>)}
            {showModal && (<div className="modal-overlay" onClick={() => setShowModal(false)}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h3 style={{color:'white', margin:0}}>Download File</h3><FaTimes style={{cursor:'pointer', color:'#ef4444'}} onClick={() => setShowModal(false)} /></div><input ref={modalInputRef} className="lobby-input" value={modalInputName} onChange={(e) => setModalInputName(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') performDownload(modalFile.url, modalInputName); }} placeholder="Enter file name..." /><button className="full-btn" style={{marginTop:'15px'}} onClick={() => performDownload(modalFile.url, modalInputName)}>Download Now</button></div></div>)}
            <div className="footer">© 2026 kunalzz • SecureClip</div>
        </div>
      )}
    </div>
  );
}

export default App;
