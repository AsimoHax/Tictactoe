import React, { useEffect, useState } from "react";
import "./TicTacToe.css";
import cross from "../Assets/cross.png";
import circle from "../Assets/circle.png";
<<<<<<< HEAD
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
=======
import socket from "../../socket";
>>>>>>> cd0c544c7356fc43e285e8d2373b294bd5149183
import { useNavigate } from "react-router-dom";

const WIN_PATTERNS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const TicTacToe: React.FC = () => {
  const navigate = useNavigate();
  const emptyBoard = Array(9).fill("");
  const [board, setBoard] = useState<string[]>(emptyBoard);
  const [xIsNext, setXIsNext] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const [spectators, setSpectators] = useState<number>(3);
  const [chat, setChat] = useState<{ from: string; text: string }[]>([
  ]);
  const [clientId] = useState(() => {
    let id = localStorage.getItem("clientId");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem("clientId", id); } catch (e) {}
    }
    return id;
  });
  const [message, setMessage] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

    const joinPayload = { roomId, userName: "Client-" + clientId.slice(0,4), clientId };
    s.on("connect", () => {
      s.emit("join-room", joinPayload);
    });
    // if socket already connected (singleton), join immediately
    if (s.connected) {
      s.emit("join-room", joinPayload);
    }

    s.on("room-update", ({ roomId: rid, room }) => {
      console.log('room-update', roomId, room);
      setRoomInfo(room);
      setSpectators(room.spectators ?? 0);
      // server now includes clientId on players; detect our role by clientId
      const meIsPlayer = room.players.some((p: any) => p.clientId === clientId);
      if (meIsPlayer) {
        setRole("player");
        const p = room.players.find((p: any) => p.clientId === clientId);
        setSymbol(p?.symbol || null);
      } else {
        setRole("spectator");
        setSymbol(null);
      }
      setBoard(room.board || board);
      setXIsNext(room.xIsNext ?? xIsNext);
      setWinner(room.winner ?? null);
    });

    s.on("game-over", ({ winner, reason }) => {
      setWinner(winner);
      setChat((c) => [
        ...c,
        {
          from: "System",
          text: `Game over: ${winner} (${reason || "finished"})`,
        },
      ]);
    });
    s.on("chat", ({ from, text }) => {
      console.log("received chat", { from, text });
      setChat((c) => [...c, { from: from || "Unknown", text }]);
    });

    // cleanup listeners on unmount to avoid duplicate handlers
    return () => {
      s.off("room-update");
      s.off("game-over");
      s.off("chat");
    };
  }, []);

  // handle move — emit to server
  function handleClick(index: number) {
    if (!socket) return;
    if (role !== "player") return;
    if (winner || board[index]) return;
    socket.emit("move", {
      roomId:
        new URLSearchParams(window.location.search).get("room") ||
        "default-room",
      index,
    });
  }

  function reset() {
    setBoard(emptyBoard);
    setXIsNext(true);
    setWinner(null);
  }

  function sendMessage() {
    if (!message.trim() || !socket) return;
    const roomId = new URLSearchParams(window.location.search).get("room") || "default-room";
    const myPlayer = roomInfo?.players?.find((p: any) => p.clientId === clientId);
    const name = myPlayer?.name || (role === "player" ? `Player-${symbol || "?"}` : `Spectator`);
    console.log("send chat", { roomId, name, text: message.trim(), clientId });
    socket.emit("chat", { roomId, name, text: message.trim(), clientId });
    setMessage("");
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

  function promoteToPlayer() {
    if (!socket) return;
    socket.emit("promote", {
      roomId:
        new URLSearchParams(window.location.search).get("room") ||
        "default-room",
      clientId,
    });
  }

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
              navigate('/lobby')
            }}
          >
>>>>>>> cd0c544c7356fc43e285e8d2373b294bd5149183
            ← Back
          </button>
          <button
            className="surrender-btn"
            onClick={surrender}
            disabled={!!winner}
          >
            Surrender
          </button>
        </div>

        <div className="player-list">
          {/* Render players from server (symbol X and O) */}
          {['X','O'].map((sym) => {
            const p = roomInfo?.players?.find((pl: any) => pl.symbol === sym);
            const isActive = xIsNext ? sym === 'X' : sym === 'O';
            return (
              <div key={sym} className={`player card ${isActive ? 'active' : ''}`}>
                <div className="avatar">{sym}</div>
                <div className="meta">
                  <div className="name">{p?.name || `Player ${sym}`}</div>
                  <div className="status">{isActive ? (role === 'player' && symbol === sym ? 'Your turn' : 'Your turn') : 'Waiting'}</div>
                </div>
                <img src={sym === 'X' ? cross : circle} alt={sym} className="symbol" />
              </div>
            );
          })}
        </div>

        <div className="left-footer">
          <button onClick={reset} className="reset-btn">
            Restart
          </button>
        </div>
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
              <div className="avatar-small">ME</div>
            </button>
            {dropdownOpen && (
              <div className="drop-menu">
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
      </div>
    </div>
  );
};
