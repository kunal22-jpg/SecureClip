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
  const [showSecretModal, setShowSecretModal] = useState(false);
  
  const [showTerminatedModal, setShowTerminatedModal] = useState(false);
  const isLeavingRef = useRef(false); 
  
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

  const [showGameCenter, setShowGameCenter] = useState(false);
  const [gameTab, setGameTab] = useState('ttt'); 

  const [activeGameId, setActiveGameId] = useState(null);
  const [lobbyGames, setLobbyGames] = useState([]);
  const [gameState, setGameState] = useState({ board: Array(9).fill(null), turn: 'X', winner: null, winningLine: null, isDraw: false, players: [], status: 'waiting' });

  const [activeRpsId, setActiveRpsId] = useState(null);
  const [rpsLobbyGames, setRpsLobbyGames] = useState([]);
  const [rpsGameState, setRpsGameState] = useState({ status: 'waiting', result: null, players: [] });
  const [displayedRpsState, setDisplayedRpsState] = useState({ status: 'waiting', result: null, players: [] });
  const [rpsAnimating, setRpsAnimating] = useState(false);

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

  const SECRET_CODE = "Fhak me"; 
  const SECRET_MESSAGE = "🎉 Congratulations!Chutiye ho tum";
  const SECRET_VIDEO_URL = "https://youtu.be/BRa2-Qnztk0?si=QFd6VK0YKUyv6o_P";

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
    if (text.trim().toLowerCase() === SECRET_CODE.toLowerCase()) {
      setShowSecretModal(true);
      setText(''); 
      const videoWindow = window.open(SECRET_VIDEO_URL, '_blank');
      if (videoWindow) {
        setTimeout(() => { try { videoWindow.blur(); window.focus(); } catch (e) { } }, 100);
      }
    }
  }, [text]);

  useEffect(() => {
    if (!room) return;
    fetchClips();

    const syncGames = async () => {
        if (!showGameCenter) return;
        try {
            if (!activeGameId && !activeRpsId && gameTab === 'ttt') {
                const res = await api.get(`/games/list?room=${room}`);
                setLobbyGames(res.data);
            } else if (activeGameId) {
                try {
                    const res = await api.get(`/games/${activeGameId}`);
                    setGameState(res.data);
                } catch (e) {
                    if (e.response && e.response.status === 404 && !isLeavingRef.current) {
                        setActiveGameId(null);
                        setShowTerminatedModal(true);
                    }
                }
            }

            if (!activeRpsId && !activeGameId && gameTab === 'rps') {
                const res = await api.get(`/rps/list?room=${room}`);
                setRpsLobbyGames(res.data);
            } else if (activeRpsId) {
                try {
                    const res = await api.get(`/rps/${activeRpsId}?userId=${myUserId}`);
                    const newServerState = res.data;
                    
                    if (newServerState.status === 'revealing' && rpsGameState.status !== 'revealing' && !rpsAnimating) {
                        setRpsAnimating(true);
                        setRpsGameState(newServerState);
                        setTimeout(() => {
                            setRpsAnimating(false);
                            setDisplayedRpsState(newServerState);
                        }, 1500); 
                    } else if (!rpsAnimating) {
                        setRpsGameState(newServerState);
                        setDisplayedRpsState(newServerState);
                    }
                } catch (e) {
                    if (e.response && e.response.status === 404 && !isLeavingRef.current) {
                        setActiveRpsId(null);
                        setShowTerminatedModal(true);
                    }
                }
            }
        } catch (e) { console.error("Game sync error", e); }
    };

    if (showGameCenter) syncGames();

    const interval = setInterval(() => {
        fetchClips();
        if (showGameCenter) syncGames();
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
  }, [room, clips, file, text, showModal, previewImage, showGameCenter, gameTab, activeGameId, activeRpsId, rpsGameState.status, rpsAnimating]); 

  const handleCloseGameCenter = () => {
      if (activeGameId) leaveGame();
      if (activeRpsId) leaveRpsGame();
      setShowGameCenter(false);
  };

  const handleGlobalKeys = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        if (showSecretModal) { setShowSecretModal(false); return; }
        if (showClearModal) { setShowClearModal(false); return; }
        if (showTerminatedModal) { setShowTerminatedModal(false); return; }
        if (showGameCenter) { handleCloseGameCenter(); return; }
        if (previewImage) { setPreviewImage(null); return; }
        if (showModal) { setShowModal(false); return; }
        if (file) { handleRemoveFile(); setTimeout(() => inputRef.current?.focus(), 10); return; }
    }
    if (e.altKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); setShowGameCenter(true); }
    if (e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); if (file) { handleRemoveFile(); } else { open(); } }
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (showModal) { setShowModal(false); } 
        else {
            const latestFileClip = clips.find(c => c.fileUrl);
            if (latestFileClip) openDownloadModal(latestFileClip.fileUrl, latestFileClip.fileName); 
            else alert("No file to download!"); 
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

      let localWinner = null;
      let localLine = null;
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (let i = 0; i < lines.length; i++) {
          const [a, b, c] = lines[i];
          if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
              localWinner = newBoard[a]; localLine = lines[i]; break;
          }
      }
      setGameState(prev => ({ ...prev, board: newBoard, winner: localWinner || prev.winner, winningLine: localLine || prev.winningLine }));
      await api.post(`/games/${activeGameId}/move`, { index, userId: myUserId });
  };
  
  const leaveGame = async () => {
      isLeavingRef.current = true;
      try { await api.delete(`/games/${activeGameId}/leave`); } catch(e){}
      setActiveGameId(null);
      setTimeout(() => { isLeavingRef.current = false; }, 1000);
  };

  const createRpsGame = async () => {
      try {
          const res = await api.post('/rps/create', { room, userId: myUserId, userName: displayName });
          setActiveRpsId(res.data.gameId);
      } catch (err) { alert("Could not create RPS game"); }
  };
  const joinRpsGame = async (gameId) => {
      try {
          await api.post('/rps/join', { gameId, userId: myUserId, userName: displayName });
          setActiveRpsId(gameId);
      } catch (err) { alert(err.response?.data?.error || "Game full or unavailable"); }
  };
  const makeRpsMove = async (choice) => {
      if (rpsGameState.status === 'finished' || rpsGameState.status === 'revealing') return;
      const me = rpsGameState.players.find(p => p.id === myUserId);
      if (me?.choice) return; 
      
      const newPlayersState = rpsGameState.players.map(p => p.id === myUserId ? { ...p, choice } : p);
      setRpsGameState(prev => ({ ...prev, players: newPlayersState }));
      setDisplayedRpsState(prev => ({ ...prev, players: newPlayersState }));
      
      await api.post(`/rps/${activeRpsId}/move`, { choice, userId: myUserId });
  };
  const nextRpsRound = async () => {
      const resetState = { ...rpsGameState, status: 'ready', result: null, players: rpsGameState.players.map(p => ({...p, choice: null})) };
      setRpsGameState(resetState);
      setDisplayedRpsState(resetState);
      await api.post(`/rps/${activeRpsId}/next`);
  };
  const leaveRpsGame = async () => {
      isLeavingRef.current = true;
      try { await api.delete(`/rps/${activeRpsId}/leave`); } catch(e){}
      setActiveRpsId(null);
      setRpsAnimating(false);
      setTimeout(() => { isLeavingRef.current = false; }, 1000);
  };

  // 🔥 UPDATED: CREATE ROOM (Wait for API + minimum 2.5s for pencil animation)
  const handleCreate = async () => {
    if (!inputName.trim()) return alert("Enter a room name!");
    setIsLoading(true);
    try {
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        // Promise.all ensures the pencil loader runs for AT LEAST 2500ms
        await Promise.all([
            api.post('/room-check', { room: code, name: inputName }),
            new Promise(resolve => setTimeout(resolve, 2500))
        ]);
        sessionStorage.setItem('secureclip_room', code); 
        sessionStorage.setItem('secureclip_name', inputName);
        setRoom(code); 
        setDisplayName(inputName);
    } catch (error) { 
        alert("Connecting to server..."); 
    } finally { 
        setIsLoading(false); 
    }
  };

  // 🔥 UPDATED: JOIN ROOM (Wait for API + minimum 2.5s for pencil animation)
  const handleJoin = async () => {
    if (inputCode.length !== 5) return alert("Enter valid 5-digit code!");
    setIsLoading(true);
    try {
      // Promise.all ensures the pencil loader runs for AT LEAST 2500ms
      const [res] = await Promise.all([
          api.post('/room-check', { room: inputCode }),
          new Promise(resolve => setTimeout(resolve, 2500))
      ]);
      if (!res.data.name) { alert("❌ Room Not Found!"); return; }
      sessionStorage.setItem('secureclip_room', inputCode); 
      sessionStorage.setItem('secureclip_name', res.data.name);
      setDisplayName(res.data.name); 
      setRoom(inputCode);
    } catch (err) { 
        alert("Connection Error."); 
    } finally { 
        setIsLoading(false); 
    }
  };

  const handleLogout = () => {
      api.post(`/leave?room=${room}&userId=${myUserId}`);
      sessionStorage.removeItem('secureclip_room'); sessionStorage.removeItem('secureclip_name');
      setRoom(null); setDisplayName(''); setClips([]); setShowGameCenter(false);
  };

  const handleClearRoom = async () => {
      try {
          await api.delete(`/room/clear?room=${room}`);
          setClips([]); setActiveGameId(null); setActiveRpsId(null); setShowClearModal(false);
      } catch (err) { alert("Failed to clear room."); }
  };

  const handleLobbyKeyDown = (e) => { if (e.key === 'Enter') { mode === 'create' ? handleCreate() : handleJoin(); } };
  const fetchClips = async () => {
    try {
      const res = await api.get(`/clips?room=${room}&userId=${myUserId}`);
      if (res.data.clips) { setClips(res.data.clips); setMemberCount(res.data.members || 1); } else { setClips(res.data); }
    } catch (err) { console.error("Error"); }
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };
  const handleRemoveFile = () => { if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; } setFile(null); setCustomFileName(''); setUploading(false); };

  const handleSubmit = async () => {
    if (!text && !file) return;
    setUploading(true);
    const controller = new AbortController(); abortControllerRef.current = controller;
    const formData = new FormData(); formData.append('text', text); formData.append('room', room);
    if (file) formData.append('file', file, customFileName || file.name); 
    try {
      await api.post('/clips', formData, { headers: { 'Content-Type': 'multipart/form-data' }, signal: controller.signal });
      if (controller.signal.aborted) return;
      setText(''); setFile(null); setCustomFileName(''); fetchClips(); setTimeout(() => { inputRef.current?.focus(); }, 10);
    } catch (err) { if (err.name !== 'CanceledError') alert("Error posting"); } 
    finally { if (abortControllerRef.current === controller) { setUploading(false); abortControllerRef.current = null; } }
  };

  const handleDelete = async (id) => { await api.delete(`/clips/${id}`); fetchClips(); };
  const handleCopy = async (txt, id) => { try { await navigator.clipboard.writeText(txt); showCheckmark(id); } catch (err) { alert("Copy failed"); } };
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
  const showCheckmark = (id) => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };
  const performDownload = async (fileUrl, fileName) => {
    try {
      const response = await fetch(fileUrl); const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob); const link = document.createElement('a'); link.href = blobUrl;
      const extension = fileName.includes('.') ? fileName.split('.').pop() : ''; let finalName = fileName;
      if (extension && !finalName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) finalName = `${finalName}.${extension}`;
      link.download = finalName; document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(blobUrl);
      setShowModal(false); 
    } catch (err) { window.open(fileUrl, '_blank'); setShowModal(false); }
  };
  const openDownloadModal = (url, name) => { setModalFile({ url, name: name || 'file' }); setModalInputName(name || 'file'); setShowModal(true); setTimeout(() => modalInputRef.current?.select(), 50); };
  const formatTextWithLinks = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, index) => {
      if (part.match(urlRegex)) return <a key={index} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline', wordBreak: 'break-all' }} onClick={(e) => e.stopPropagation()}>{part}</a>;
      return part;
    });
  };

  const getStatusText = () => {
      if (gameState.winner) return <span>Winner: <span style={{color: gameState.winner === 'X' ? '#a855f7' : '#4ade80'}}>{gameState.winner}</span> 🎉</span>;
      if (gameState.isDraw) return <span style={{color: '#facc15'}}>It's a Draw! 🤝</span>;
      return <span>Turn: <span style={{color: gameState.turn === 'X' ? '#a855f7' : '#4ade80'}}>{gameState.turn}</span></span>;
  };

  const meRps = displayedRpsState.players?.find(p => p.id === myUserId);
  const oppRps = displayedRpsState.players?.find(p => p.id !== myUserId);
  const getRpsImg = (c) => {
      if(c === 'R') return "https://codingstella.com/wp-content/uploads/2024/01/download.png";
      if(c === 'P') return "https://codingstella.com/wp-content/uploads/2024/01/download-1.png";
      if(c === 'S') return "https://codingstella.com/wp-content/uploads/2024/01/download-2.png";
      return "https://codingstella.com/wp-content/uploads/2024/01/download.png"; 
  };
  let rpsResultText = "Wait...";
  if (displayedRpsState.status === 'waiting') rpsResultText = "Waiting for Opponent...";
  else if (displayedRpsState.status === 'ready') rpsResultText = meRps?.choice ? "Waiting for Opponent..." : "Make your choice!";
  else if (displayedRpsState.status === 'revealing') {
      if (rpsAnimating) rpsResultText = "Wait...";
      else {
          if (displayedRpsState.result === 'Draw') rpsResultText = "Match Draw!";
          else if (displayedRpsState.result === myUserId) rpsResultText = "You Won!! 🎉";
          else rpsResultText = "Opponent Won 😢";
      }
  }

  let modalTitle = "Game Center";
  if (activeGameId) modalTitle = "Tic-Tac-Toe";
  if (activeRpsId) modalTitle = "Rock Paper Scissors";

  const modalBg = 'var(--card-bg)';
  const modalColor = 'white';

  return (
    <div className="container">
      {isLoading && (
        <div className="loader-overlay">
          <svg className="pencil" viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
              <defs>
                  <clipPath id="pencil-eraser"><rect rx="5" ry="5" width="30" height="30"></rect></clipPath>
              </defs>
              <circle className="pencil__stroke" r="70" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="439.82 439.82" strokeDashoffset="439.82" strokeLinecap="round" transform="rotate(-113,100,100)" />
              <g className="pencil__rotate" transform="translate(100,100)">
                  <g fill="none">
                      <circle className="pencil__body1" r="64" stroke="hsl(223,90%,50%)" strokeWidth="30" strokeDasharray="402.12 402.12" strokeDashoffset="402" transform="rotate(-90)" />
                      <circle className="pencil__body2" r="74" stroke="hsl(223,90%,60%)" strokeWidth="10" strokeDasharray="464.96 464.96" strokeDashoffset="465" transform="rotate(-90)" />
                      <circle className="pencil__body3" r="54" stroke="hsl(223,90%,40%)" strokeWidth="10" strokeDasharray="339.29 339.29" strokeDashoffset="339" transform="rotate(-90)" />
                  </g>
                  <g className="pencil__eraser" transform="rotate(-90) translate(49,0)">
                      <g className="pencil__eraser-skew">
                          <rect fill="hsl(223,90%,70%)" rx="5" ry="5" width="30" height="30" />
                          <rect fill="hsl(223,90%,60%)" width="5" height="30" clipPath="url(#pencil-eraser)" />
                          <rect fill="hsl(223,10%,90%)" width="30" height="20" />
                          <rect fill="hsl(223,10%,70%)" width="15" height="20" />
                          <rect fill="hsl(223,10%,80%)" width="5" height="20" />
                          <rect fill="hsla(223,10%,10%,0.2)" y="6" width="30" height="2" />
                          <rect fill="hsla(223,10%,10%,0.2)" y="13" width="30" height="2" />
                      </g>
                  </g>
                  <g className="pencil__point" transform="rotate(-90) translate(49,-30)">
                      <polygon fill="hsl(33,90%,70%)" points="15 0,30 30,0 30" />
                      <polygon fill="hsl(33,90%,50%)" points="15 0,6 30,0 30" />
                      <polygon fill="hsl(223,10%,10%)" points="15 0,20 10,10 10" />
                  </g>
              </g>
          </svg>
          <div className="boot-text" style={{color: '#a855f7'}}>ESTABLISHING UPLINK...</div>
        </div>
      )}

      {showSecretModal && (
        <div className="modal-overlay" onClick={() => setShowSecretModal(false)}>
          <div className="modal-content secret-modal" onClick={(e) => e.stopPropagation()} style={{textAlign:'center', maxWidth:'500px'}}>
            <div style={{fontSize:'4rem', marginBottom:'20px'}}>🔓</div>
            <h3 style={{color:'#a855f7', marginBottom:'15px', fontSize:'1.8rem', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Secret Unlocked!</h3>
            <p style={{color:'#d1d5db', marginBottom:'25px', lineHeight:'1.8', fontSize:'1.1rem'}}>{SECRET_MESSAGE}</p>
            <button className="full-btn" onClick={() => setShowSecretModal(false)} style={{background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'}}>Awesome! ✨</button>
          </div>
        </div>
      )}

      {showClearModal && (
        <div className="modal-overlay" onClick={() => setShowClearModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{textAlign:'center', maxWidth:'400px'}}>
            <h3 style={{color:'#ef4444', marginBottom:'15px', fontSize:'1.5rem'}}>⚠️ Danger Zone</h3>
            <p style={{color:'#d1d5db', marginBottom:'25px', lineHeight:'1.6'}}>Are you sure you want to <strong>delete ALL clips</strong> in this room?<br/>This action <strong>cannot be undone</strong>.</p>
            <div style={{display:'flex', gap:'10px'}}>
              <button className="full-btn" onClick={() => setShowClearModal(false)} style={{background:'#3f3f46'}}>Cancel</button>
              <button className="full-btn" onClick={handleClearRoom} style={{background:'#ef4444'}}>Yes, Clear Room</button>
            </div>
          </div>
        </div>
      )}

      {showGameCenter && (
          <div className="modal-overlay" onClick={() => handleCloseGameCenter()}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{textAlign:'center', width:'90%', maxWidth:'420px', background: modalBg, color: modalColor, borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px', alignItems:'center'}}>
                      <h3 style={{margin:0, color: 'white', fontSize:'1.6rem', fontWeight:'700'}}>{modalTitle}</h3>
                      <FaTimes style={{cursor:'pointer', color:'#ef4444', fontSize:'1.4rem'}} onClick={() => handleCloseGameCenter()} />
                  </div>

                  {!activeGameId && !activeRpsId && (
                      <div className="tab-switcher" style={{marginTop: '0px', marginBottom: '20px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '12px', display: 'flex'}}>
                          <button onClick={() => setGameTab('ttt')}
                              style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s',
                                  background: gameTab === 'ttt' ? 'var(--accent-color)' : 'transparent', color: gameTab === 'ttt' ? 'white' : 'var(--text-secondary)', border: 'none'
                              }}>Tic-Tac-Toe</button>
                          <button onClick={() => setGameTab('rps')}
                              style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s',
                                  background: gameTab === 'rps' ? 'var(--accent-color)' : 'transparent', color: gameTab === 'rps' ? 'white' : 'var(--text-secondary)', border: 'none'
                              }}>RPS</button>
                      </div>
                  )}

                  {(gameTab === 'ttt' && !activeRpsId) && (
                      <>
                        {!activeGameId ? (
                            <div className="game-lobby">
                                <button className="full-btn" onClick={createGame} style={{marginBottom:'20px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', borderRadius: '12px', fontWeight: 'bold'}}>
                                    + Create Tic-Tac-Toe
                                </button>
                                <div style={{maxHeight:'200px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'10px'}}>
                                    {lobbyGames.length === 0 ? (
                                        <p style={{opacity:0.5, fontStyle:'italic', color:'var(--text-secondary)'}}>No active games. Start one!</p>
                                    ) : (
                                        lobbyGames.map(g => (
                                            <div key={g.id} style={{background:'rgba(255,255,255,0.05)', padding:'16px', borderRadius:'12px', display:'flex', justifyContent:'space-between', alignItems:'center', border: '1px solid var(--border-color)'}}>
                                                <div style={{textAlign:'left'}}>
                                                    <div style={{fontWeight:'bold', color:'white', fontSize:'1.05rem', marginBottom:'4px'}}>Match #{g.id.slice(-4)}</div>
                                                    <div style={{fontSize:'0.85rem', color:'var(--text-secondary)'}}>{g.players.length}/2 Players</div>
                                                </div>
                                                <button style={{background:'#4ade80', color:'#000', padding:'8px 20px', borderRadius:'8px', fontWeight:'bold', fontSize:'0.9rem', border:'none', cursor:'pointer'}} onClick={() => joinGame(g.id)}>JOIN</button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="game-board-view">
                                <div className="status-bar" style={{marginBottom:'20px', fontSize:'1.2rem', fontWeight:'bold', color: 'white'}}>
                                    {getStatusText()}
                                </div>
                                <div className="tic-tac-grid" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', background:'rgba(255,255,255,0.05)', padding:'10px', borderRadius:'15px', border:'1px solid var(--border-color)'}}>
                                    {gameState.board.map((cell, idx) => (
                                        <div key={idx} onClick={() => makeMove(idx)}
                                          style={{ height:'80px', background: cell ? (cell === 'X' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(74, 222, 128, 0.2)') : '#27272a', border: '1px solid var(--border-color)',
                                              borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'3rem', fontWeight:'900',
                                              cursor: !cell && !gameState.winner && !gameState.isDraw ? 'pointer' : 'default', color: cell === 'X' ? '#a855f7' : '#4ade80'
                                          }}>{cell}</div>
                                    ))}
                                </div>
                                <button className="full-btn" style={{marginTop:'20px', background:'#3f3f46', color:'white', fontWeight:'bold'}} onClick={leaveGame}>Leave Match</button>
                            </div>
                        )}
                      </>
                  )}

                  {(gameTab === 'rps' && !activeGameId) && (
                      <>
                        {!activeRpsId ? (
                            <div className="game-lobby">
                                <button className="full-btn" onClick={createRpsGame} style={{marginBottom:'20px', background: 'var(--accent-color)', borderRadius: '12px', fontWeight: 'bold'}}>
                                    + Create RPS Match
                                </button>
                                <div style={{maxHeight:'200px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'10px'}}>
                                    {rpsLobbyGames.length === 0 ? (
                                        <p style={{opacity:0.5, fontStyle:'italic', color:'var(--text-secondary)'}}>No active matches. Start one!</p>
                                    ) : (
                                        rpsLobbyGames.map(g => (
                                            <div key={g.id} style={{background:'rgba(255,255,255,0.05)', padding:'16px', borderRadius:'12px', display:'flex', justifyContent:'space-between', alignItems:'center', border: '1px solid var(--border-color)'}}>
                                                <div style={{textAlign:'left'}}>
                                                    <div style={{fontWeight:'bold', color:'white', fontSize:'1.05rem', marginBottom:'4px'}}>Match #{g.id.slice(-4)}</div>
                                                    <div style={{fontSize:'0.85rem', color:'var(--text-secondary)'}}>{g.players.length}/2 Players</div>
                                                </div>
                                                <button style={{background:'var(--accent-color)', color:'#fff', padding:'8px 20px', borderRadius:'8px', fontWeight:'bold', fontSize:'0.9rem', border:'none', cursor:'pointer'}} onClick={() => joinRpsGame(g.id)}>JOIN</button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className={`rps-arena ${rpsAnimating ? 'start' : ''}`}>
                                <div className="result_field" style={{marginBottom: '2rem'}}>
                                    <div className="result_images">
                                        <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                                            <span className="user_result"><img src={rpsAnimating || displayedRpsState.status !== 'revealing' ? getRpsImg('R') : getRpsImg(meRps?.choice)} alt="User" /></span>
                                            <p style={{fontWeight:'bold', color:'white', marginTop:'10px'}}>You</p>
                                            <p style={{fontSize:'0.9rem', fontWeight:'700', color:'#4ade80'}}>Score: {meRps?.score || 0}</p>
                                        </div>
                                        <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                                            <span className="cpu_result"><img src={rpsAnimating || displayedRpsState.status !== 'revealing' ? getRpsImg('R') : getRpsImg(oppRps?.choice)} alt="Opponent" /></span>
                                            <p style={{fontWeight:'bold', color:'white', marginTop:'10px'}}>{oppRps ? 'Opponent' : 'Waiting...'}</p>
                                            <p style={{fontSize:'0.9rem', fontWeight:'700', color:'#ef4444'}}>Score: {oppRps?.score || 0}</p>
                                        </div>
                                    </div>
                                    <div className="result" style={{color: '#a855f7'}}>{rpsResultText}</div>
                                </div>

                                <div className={`option_images ${displayedRpsState.status !== 'ready' || meRps?.choice ? 'disabled' : ''}`} style={{background:'rgba(255,255,255,0.05)', border:'1px solid var(--border-color)'}}>
                                    <span className={`option_image ${meRps?.choice === 'R' ? 'active' : ''}`} onClick={() => makeRpsMove('R')}><img src="https://codingstella.com/wp-content/uploads/2024/01/download.png" alt="Rock" /><p>Rock</p></span>
                                    <span className={`option_image ${meRps?.choice === 'P' ? 'active' : ''}`} onClick={() => makeRpsMove('P')}><img src="https://codingstella.com/wp-content/uploads/2024/01/download-1.png" alt="Paper" /><p>Paper</p></span>
                                    <span className={`option_image ${meRps?.choice === 'S' ? 'active' : ''}`} onClick={() => makeRpsMove('S')}><img src="https://codingstella.com/wp-content/uploads/2024/01/download-2.png" alt="Scissors" /><p>Scissors</p></span>
                                </div>
                                
                                <div style={{display:'flex', gap:'10px', marginTop:'30px'}}>
                                    <button className="full-btn" style={{background:'#3f3f46', color:'white', fontWeight:'bold'}} onClick={leaveRpsGame}>Leave Match</button>
                                    {displayedRpsState.status === 'revealing' && !rpsAnimating && (
                                        <button className="full-btn" style={{background:'var(--accent-color)', color:'white', fontWeight:'bold'}} onClick={nextRpsRound}>Next Round</button>
                                    )}
                                </div>
                            </div>
                        )}
                      </>
                  )}
              </div>
          </div>
      )}

      {showTerminatedModal && (
        <div className="modal-overlay" onClick={() => setShowTerminatedModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{textAlign:'center', maxWidth:'400px', background: 'var(--card-bg)', border: '1px solid #ef4444'}}>
            <div style={{fontSize:'3rem', marginBottom:'10px'}}>🎮❌</div>
            <h3 style={{color:'#ef4444', marginBottom:'15px', fontSize:'1.5rem'}}>Game Terminated</h3>
            <p style={{color:'#d1d5db', marginBottom:'25px', lineHeight:'1.6'}}>
              The opponent has left the match.<br/>The game room has been closed.
            </p>
            <button className="full-btn" onClick={() => setShowTerminatedModal(false)} style={{background:'#3f3f46'}}>Return to Lobby</button>
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
                <><input key="create-input" autoFocus className="lobby-input" placeholder="Name your room" value={inputName} onChange={(e) => setInputName(e.target.value)} onKeyDown={handleLobbyKeyDown} /><button className="full-btn" onClick={handleCreate}>Generate Code & Enter</button></>
            ) : (
                <><input key="join-input" autoFocus className="lobby-input" placeholder="Enter 5-Digit Code" value={inputCode} onChange={(e) => setInputCode(e.target.value)} maxLength={5} type="number" onKeyDown={handleLobbyKeyDown} /><button className="full-btn" onClick={handleJoin}>Connect to Device</button></>
            )}
            </div>
            <div className="footer">© 2026 kunalzz • SecureClip</div>
        </div>
      ) : (
        <div className="container">
            <header>
                <div className="brand" style={{ flexShrink: 0 }}>SecureClip</div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', alignItems: 'center', minWidth: 0, flexGrow: 1, justifyContent: 'flex-end' }}>
                    <div className="room-badge" title={`${displayName} #${room}`} style={{ display: 'flex', alignItems: 'center', maxWidth: '140px', padding: '6px 10px', flexShrink: 1, overflow: 'hidden' }}>
                        <FaLock className="lock-icon" style={{ flexShrink: 0, marginRight: '6px' }} />
                        <span className="room-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {displayName}
                        </span>
                        <span style={{ opacity: 0.5, marginLeft: '4px', flexShrink: 0, color: 'white', fontSize: '0.9rem' }}>#{room}</span>
                    </div>
                    
                    <div className="room-badge" title="Game Center (Alt+G)" onClick={() => setShowGameCenter(true)} style={{cursor: 'pointer', padding: '6px 10px', flexShrink: 0}}>
                        <FaGamepad style={{color: '#a855f7', fontSize: '1.2rem'}} />
                    </div>
                    
                    <div className="room-badge" title="Online Members" style={{ padding: '6px 10px', flexShrink: 0 }}>
                        <FaUsers className="lock-icon" style={{color: '#4ade80', marginRight: '6px'}} />
                        <span className="room-name">{memberCount}</span>
                    </div>

                    <FaSignOutAlt className="exit-icon" onClick={handleLogout} title="Exit Room" style={{ flexShrink: 0, marginLeft: '4px' }} />
                </div>
            </header>

            <div {...getRootProps()} className="input-card" style={{ position: 'relative', outline: 'none' }}>
                <input {...getInputProps()} />
                <textarea ref={inputRef} className="text-area" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder="What's on your clipboard? (Secret code for easters!)" autoFocus />
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
                  <button className="delete-all-icon-btn" onClick={() => setShowClearModal(true)} title="Delete all clips in this room"><FaTrash /></button>
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
