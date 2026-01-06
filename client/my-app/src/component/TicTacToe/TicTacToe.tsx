import React, { useEffect, useState } from "react";
import "./TicTacToe.css";
import cross from "../Assets/cross.png";
import circle from "../Assets/circle.png";
import socket from "../../socket";
import { auth } from "../../firebase";
import { useNavigate } from "react-router-dom";

// (WIN_PATTERNS removed — server is authoritative; kept client minimal)

export const TicTacToe: React.FC = () => {
  const navigate = useNavigate();
  const emptyBoard = Array(9).fill("");
  const [board, setBoard] = useState<string[]>(emptyBoard);
  const [xIsNext, setXIsNext] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const [spectators, setSpectators] = useState<number>(3);
  const [chat, setChat] = useState<{ from: string; text: string }[]>([
  ]);
  const [clientId, setClientId] = useState(() => {
    try {
      const fbUid = (auth && (auth.currentUser as any) && (auth.currentUser as any).uid) || null;
      if (fbUid) {
        try { localStorage.setItem('clientId', fbUid); } catch (e) {}
        return fbUid;
      }
    } catch (e) {}
    let id = localStorage.getItem("clientId");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem("clientId", id); } catch (e) {}
    }
    return id;
  });
  const [displayName] = useState(() => {
    // prefer explicit username from auth, then saved username/displayName, else generate
    let n = (auth && auth.currentUser && auth.currentUser.displayName) || localStorage.getItem("username") || localStorage.getItem("displayName");
    if (!n) {
      n = `Player-${Math.random().toString(36).slice(2,5)}`;
      try { localStorage.setItem("displayName", n); } catch (e) {}
    }
    return n;
  });
  const [message, setMessage] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ name: string; photoURL?: string | null }>({ name: displayName, photoURL: (typeof localStorage !== 'undefined' ? localStorage.getItem('photoURL') : null) || null });
  // using shared socket singleton
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [role, setRole] = useState<"player" | "spectator" | null>(null);
  const [symbol, setSymbol] = useState<"X" | "O" | null>(null);
  const navigate = useNavigate();
  

  useEffect(() => {
    // read room id from query param ?room=abc
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room") || "default-room";

    const s = socket;
    // ensure no duplicate listeners
    s.off("connect");
    s.off("room-update");
    s.off("game-over");
    s.off("chat");
    s.off("match-restart");

    s.on("connect", () => {
      const payload: any = { roomId, userName: displayName, clientId };
      // prefer persisted photoURL (from previous upload) if present
      const storedPhoto = localStorage.getItem('photoURL');
      if (storedPhoto) payload.userPhoto = storedPhoto;
      else if (userProfile?.photoURL) payload.userPhoto = userProfile.photoURL;
      s.emit("join-room", payload);
    });
    // if socket already connected (singleton), join immediately
    if (s.connected) {
      const payload: any = { roomId, userName: displayName, clientId };
      const storedPhoto = localStorage.getItem('photoURL');
      if (storedPhoto) payload.userPhoto = storedPhoto;
      else if (userProfile?.photoURL) payload.userPhoto = userProfile.photoURL;
      s.emit("join-room", payload);
    }

    s.on("room-update", ({ room }) => {
      console.log('room-update', room);
      setRoomInfo(room);
      setSpectators(Array.isArray(room.spectators) ? room.spectators.length : (room.spectators ?? 0));
      // handle restart-ready state if provided
      if (room.restartReady) {
        setRestartReady(room.restartReady.includes(clientId));
      }
      // server now includes clientId on players; detect our role by clientId
      const meIsPlayer = Array.isArray(room.players) && room.players.some((p: any) => p.clientId === clientId);
      if (meIsPlayer) {
        setRole("player");
        const p = room.players.find((p: any) => p.clientId === clientId);
        setSymbol(p?.symbol || null);
      } else {
        setRole("spectator");
        setSymbol(null);
      }
      setBoard(room.board ?? emptyBoard);
      setXIsNext(room.xIsNext ?? true);
      setWinner(room.winner ?? null);
    });

    s.on("game-over", ({ winner, reason }) => {
      setWinner(winner);
      // map symbol (X/O) to player name when possible
      const winnerName = roomInfo?.players?.find((p: any) => p.symbol === winner)?.name || winner;
      setChat((c) => [
        ...c,
        {
          from: "System",
          text: `Game over: ${winnerName} (${reason || "finished"})`,
        },
      ]);
    });
    s.on("chat", ({ from, text }) => {
      console.log("received chat", { from, text });
      setChat((c) => [...c, { from: from || "Unknown", text }]);
    });

    // handle room closed by host
    s.off('room-closed');
    s.on('room-closed', () => {
      // Don't fully disconnect socket — just navigate back to lobby so client retains identity
      try { navigate('/lobby'); } catch (e) {}
    });

    s.on('match-restart', () => {
      console.log('match-restart');
      // clear local state; server will also send room-update with cleared board
      setWinner(null);
      // reset board immediately to avoid stale UI
      setBoard(emptyBoard);
      setXIsNext(true);
      // clear restart waiting flag
      setRestartReady(false);
      // only mark started locally if server-side indicates two players are present
      setRoomInfo((r: any) => ({ ...(r || {}), board: emptyBoard, xIsNext: true, winner: null, started: (r?.players?.length === 2) }));
    });

    // handle upload result to persist avatar locally and update profile
    s.off('upload-result');
    s.on('upload-result', ({ url }) => {
      try {
        setUserProfile((p) => ({ ...(p || {}), photoURL: url }));
        localStorage.setItem('photoURL', url);
        // inform server to set photo for this clientId if needed
        const roomId = new URLSearchParams(window.location.search).get('room') || 'default-room';
        try { s.emit('update-photo', { roomId, clientId, photoURL: url }); } catch (e) {}
      } catch (e) {}
    });

    // cleanup listeners on unmount to avoid duplicate handlers
    return () => {
      s.off("room-update");
      s.off("game-over");
      s.off("chat");
      s.off("match-restart");
      s.off('upload-result');
      s.off('room-closed');
    };
  }, []);

  

  // Fallback: poll for Firebase auth.currentUser for a short period and re-join when available
  useEffect(() => {
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      try {
        const user: any = (auth && (auth as any).currentUser) || null;
        if (user && user.uid && user.uid !== clientId) {
          try { localStorage.setItem('clientId', user.uid); } catch (e) {}
          setClientId(user.uid);
          if (socket && socket.connected) {
            const roomId = new URLSearchParams(window.location.search).get('room') || 'default-room';
            const photo = localStorage.getItem('photoURL') || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || displayName)}&background=random&size=200`;
            try { socket.emit('join-room', { roomId, userName: user.displayName || displayName, clientId: user.uid, userPhoto: photo }); } catch (e) {}
          }
          clearInterval(iv);
        }
      } catch (e) {}
      if (tries > 10) clearInterval(iv);
    }, 500);
    return () => clearInterval(iv);
  }, [clientId, displayName]);

  // set user profile from Firebase auth if available
  useEffect(() => {
    try {
      if (auth && auth.currentUser) {
        const name = auth.currentUser.displayName || displayName;
        // if no photoURL, use ui-avatars based on display name as a deterministic fallback
        const photo = auth.currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=200`;
        setUserProfile({ name, photoURL: photo });
      }
    } catch (e) {}
  }, [displayName]);

  async function uploadAvatar(file: File) {
    if (!file) return;
    try {
      const roomId = new URLSearchParams(window.location.search).get("room") || "default-room";
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // send via socket to server to store and broadcast
        try { socket.emit('upload-avatar', { roomId, clientId, dataUrl, filename: file.name }); } catch (e) { console.error(e); }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error('avatar upload failed', e);
    }
  }

  // ensure we notify server if the user refreshes or navigates away (best-effort)
  useEffect(() => {
    function onUnload() {
      const roomId = new URLSearchParams(window.location.search).get("room") || "default-room";
      // Don't emit leave-room on unload; rely on socket disconnect and server's pending-reconnect window
      console.log('page unload - socket will disconnect; relying on pending-reconnect', { roomId, clientId });
    }
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [clientId]);

  // handle move — emit to server
  function handleClick(index: number) {
    console.log('handleClick', { index, role, symbol, winner, board, connected: socket?.connected, roomInfo });
    if (!socket || !roomInfo) return;
    if (role !== "player") return;
    // do not allow moves unless there are two players present
    if (!roomInfo.players || roomInfo.players.length < 2) {
      console.log('move blocked: fewer than 2 players', { players: roomInfo?.players?.length });
      return;
    }
    // use authoritative server state from roomInfo
    if (roomInfo.winner || roomInfo.board[index]) return;
    const payload = {
      roomId: new URLSearchParams(window.location.search).get("room") || "default-room",
      index,
    };
    console.log('emit move', payload);
    socket.emit("move", payload);
  }

  // reset() removed — not used in this component

  function sendMessage() {
    if (!message.trim() || !socket) return;
    const roomId = new URLSearchParams(window.location.search).get("room") || "default-room";
    const myPlayer = roomInfo?.players?.find((p: any) => p.clientId === clientId);
    const name = myPlayer?.name || displayName || (role === "player" ? `Player-${symbol || "?"}` : `Spectator`);
    console.log("send chat", { roomId, name, text: message.trim(), clientId });
    socket.emit("chat", { roomId, name, text: message.trim(), clientId });
    setMessage("");
  }

  const [restartReadyState, setRestartReady] = useState(false);

  function requestRestart() {
    if (!socket) return;
    if (roomInfo?.terminated) {
      console.log('restart-request blocked: room terminated');
      return; // cannot request restart on a terminated room
    }
    const roomId = new URLSearchParams(window.location.search).get("room") || "default-room";
    socket.emit('restart-request', { roomId, clientId });
    setRestartReady(true);
  }

  // surrender immediately ends the match; opponent becomes winner
  function surrender() {
    if (!socket) return;
    socket.emit("surrender", {
      roomId:
        new URLSearchParams(window.location.search).get("room") ||
        "default-room",
    });
  }

  // promoteToPlayer() removed — not used

  return (
    <div className="ttt-page">
      <div className="ttt-left">
        <div className="left-top">
<<<<<<< HEAD
          <button className="back-btn" onClick={() => navigate("/lobby")}>
=======
          <button
            className="back-btn"
            onClick={() => {
              const roomId = new URLSearchParams(window.location.search).get("room") || "default-room";
              console.log('back button - leaving room', { roomId, clientId });
              try { socket.emit('leave-room', { roomId, clientId }); } catch (e) {}
              navigate('/lobby');
            }}
          >
>>>>>>> cd0c544c7356fc43e285e8d2373b294bd5149183
            ← Back
          </button>
            {roomInfo?.players?.[0]?.clientId === clientId && (
              <button
                className="close-room-btn"
                style={{ marginLeft: 12 }}
                onClick={async () => {
                  const roomId = new URLSearchParams(window.location.search).get("room") || null;
                  if (!roomId) return;
                  const ok = window.confirm('Close this room for everyone? This will remove it from the lobby.');
                  if (!ok) return;
                  try {
                    // attempt server-side in-memory close
                    try { socket.emit('close-room', { roomId, clientId }); } catch (e) { console.error('socket close-room failed', e); }
                    // also request server to delete Firestore doc so lobby updates
                    try {
                      await fetch((import.meta.env.VITE_SERVER_URL ?? 'http://localhost:5000') + '/api/close-room', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId })
                      });
                    } catch (e) {
                      console.warn('Failed to ask server to delete Firestore room', e);
                    }
                  } catch (e) { console.error('close room failed', e); }
                }}
              >
                Close Room
              </button>
            )}
          <button
            className="surrender-btn"
            onClick={surrender}
            disabled={!!winner}
          >
            Surrender
          </button>
        </div>

        <div className="player-list">
          {/* Slot 1: first joined */}
          {(() => {
            const p1 = roomInfo?.players?.[0] || null;
            const p2 = roomInfo?.players?.[1] || null;
            const activeSymbol = xIsNext ? 'X' : 'O';
            const slot1Symbol = 'X';
            const slot2Symbol = 'O';
            const slot1Active = activeSymbol === slot1Symbol;
            const slot2Active = activeSymbol === slot2Symbol;
            return (
              <>
                <div key="slot1" className={`player card ${slot1Active ? 'active' : ''}`}>
                    <div className="avatar">
                      <>
                        <div className="avatar-initials">{(p1?.name || slot1Symbol).slice(0,2).toUpperCase()}</div>
                        {p1?.photo ? (
                          <img src={p1.photo} alt={p1.name} style={{ display: 'none' }} onLoad={(e) => { const img = e.currentTarget as HTMLImageElement; img.style.display = ''; const initials = img.parentElement?.querySelector('.avatar-initials') as HTMLElement; if (initials) initials.style.display = 'none'; }} onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.style.display = 'none'; const initials = img.parentElement?.querySelector('.avatar-initials') as HTMLElement; if (initials) initials.style.display = ''; }} />
                        ) : null}
                      </>
                    </div>
                  <div className="meta">
                    <div className="name">{p1?.name || 'Waiting...'}</div>
                    <div className="status">{p1 ? (slot1Active ? (p1.clientId === clientId ? 'Your turn' : `${p1.name}'s turn`) : 'Waiting') : 'Waiting'}</div>
                  </div>
                  <img src={cross} alt={slot1Symbol} className="symbol" />
                </div>

                <div key="slot2" className={`player card ${slot2Active ? 'active' : ''}`}>
                  <div className="avatar">
                    <>
                      <div className="avatar-initials">{(p2?.name || slot2Symbol).slice(0,2).toUpperCase()}</div>
                      {p2?.photo ? (
                        <img src={p2.photo} alt={p2.name} style={{ display: 'none' }} onLoad={(e) => { const img = e.currentTarget as HTMLImageElement; img.style.display = ''; const initials = img.parentElement?.querySelector('.avatar-initials') as HTMLElement; if (initials) initials.style.display = 'none'; }} onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.style.display = 'none'; const initials = img.parentElement?.querySelector('.avatar-initials') as HTMLElement; if (initials) initials.style.display = ''; }} />
                      ) : null}
                    </>
                  </div>
                  <div className="meta">
                    <div className="name">{p2?.name || 'Waiting...'}</div>
                    <div className="status">{p2 ? (slot2Active ? (p2.clientId === clientId ? 'Your turn' : `${p2.name}'s turn`) : 'Waiting') : 'Waiting'}</div>
                  </div>
                  <img src={circle} alt={slot2Symbol} className="symbol" />
                </div>
              </>
            );
          })()}
        </div>

        {/* left footer restart removed — not used */}
      </div>

      <div className="ttt-center">
        <h2 className="game-title">Tic Tac Toe</h2>
        <div className="status-line">
          {winner ? `Winner: ${winner}` : `Next: ${xIsNext ? "X" : "O"}`}
        </div>

        <div className="board" role="grid" aria-label="tic-tac-toe board">
          {board.map((cell, i) => (
            <div
              key={i}
              className={`box ${cell ? "filled" : ""} ${
                winner && cell === winner ? "winner" : ""
              }`}
              onClick={() => handleClick(i)}
              role="button"
              aria-label={`cell-${i}`}
            >
              {cell === "X" && <img src={cross} alt="X" className="img-box" />}
              {cell === "O" && <img src={circle} alt="O" className="img-box" />}
            </div>
          ))}
        </div>
      </div>

      <div className="ttt-right">
        <div className="right-top">
          <div className="spectator">
            👀 <span>{spectators}</span> watching
          </div>

          <div className="profile">
            <button
              className="profile-btn"
              onClick={() => setDropdownOpen((s) => !s)}
              aria-expanded={dropdownOpen}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <>
                  <div className="avatar-small profile-initials">{(userProfile?.name || 'Me').slice(0,2).toUpperCase()}</div>
                  {userProfile?.photoURL ? (
                    <img src={userProfile.photoURL} alt="profile" className="avatar-small" style={{ display: 'none' }} onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.display = ''; const init = (e.currentTarget.parentElement as HTMLElement)?.querySelector('.profile-initials') as HTMLElement; if (init) init.style.display = 'none'; }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const init = (e.currentTarget.parentElement as HTMLElement)?.querySelector('.profile-initials') as HTMLElement; if (init) init.style.display = ''; }} />
                  ) : null}
                </>
                <span className="profile-name">{userProfile?.name}</span>
              </div>
            </button>
            {dropdownOpen && (
              <div className="drop-menu">
                <div className="drop-item profile-info">
                  <div className="profile-row">
                        {userProfile?.photoURL ? (
                          <img src={userProfile.photoURL} alt="profile" className="avatar-small" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="avatar-small">{(userProfile?.name || 'Me').slice(0,2).toUpperCase()}</div>
                        )}
                    <div className="profile-text">
                      <div className="profile-name-bold">{userProfile?.name}</div>
                    </div>
                        <div style={{ marginLeft: 12 }}>
                          <label style={{ cursor: 'pointer' }}>
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
                            <div className="drop-item">Upload Avatar</div>
                          </label>
                        </div>
                  </div>
                </div>
                <button className="drop-item">Settings</button>
                <button className="drop-item">Drop out</button>
              </div>
            )}
          </div>
        </div>

        <div className="chat-window">
          <div className="chat-list">
            {chat.map((c, idx) => (
              <div className="chat-message" key={idx}>
                <strong>{c.from}</strong>: {c.text}
              </div>
            ))}
          </div>

          <div className="chat-input">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message"
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
        {/* Restart overlay area - do not show if room was terminated by long disconnect */}
        {roomInfo?.players?.length === 2 && !roomInfo?.started && !roomInfo?.terminated && !(roomInfo?.winner || roomInfo?.tie) && (
          <div className="restart-overlay">
            {!restartReadyState ? (
              <button className="restart-btn" onClick={requestRestart}>Restart</button>
            ) : (
              <div className="waiting-text">Waiting for other player...</div>
            )}
          </div>
        )}
      </div>
      {/* Centered modal for game over / tie */}
      {(roomInfo?.winner || roomInfo?.tie) && (
        <div className="center-modal-backdrop">
          <div className="center-modal">
            <div className="title" style={{ color: 'black' }}>
              {roomInfo?.winner ? `Winner: ${((roomInfo.players || []).find((p: any) => p.symbol === roomInfo.winner)?.name) || roomInfo.winner}` : 'Tie'}
            </div>
            <div className="sub" style={{ color: 'black' }}>
              {roomInfo?.winner ? `${((roomInfo.players || []).find((p: any) => p.symbol === roomInfo.winner)?.name) || `Player ${roomInfo.winner}`} won the game` : 'The game ended in a tie'}
            </div>
            <div className="actions">
              {!restartReadyState ? (
                <button className="restart-btn" onClick={requestRestart}>Restart</button>
              ) : (
                <div className="waiting-text">Waiting for other player...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
