import React, { useEffect, useState } from "react";
import "./TicTacToe.css";
import cross from "../Assets/cross.png";
import circle from "../Assets/circle.png";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

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
  const emptyBoard = Array(9).fill("");
  const [board, setBoard] = useState<string[]>(emptyBoard);
  const [xIsNext, setXIsNext] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const [spectators, setSpectators] = useState<number>(3);
  const [chat, setChat] = useState<{ from: string; text: string }[]>([
    { from: "System", text: "Welcome to the game" },
  ]);
  const [message, setMessage] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [role, setRole] = useState<"player" | "spectator" | null>(null);
  const [symbol, setSymbol] = useState<"X" | "O" | null>(null);

  useEffect(() => {
    // read room id from query param ?room=abc
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room") || "default-room";

    const s = io("http://localhost:5000");
    setSocket(s);

    s.on("connect", () => {
      s.emit("join-room", { roomId, userName: "Client-" + s.id.slice(0, 4) });
    });

    s.on("room-update", ({ roomId: rid, room }) => {
      setRoomInfo(room);
      // set role & symbol locally when assigned by server: detect whether we are a player or spectator by checking if socket is player
      // server doesn't return per-socket assignment — we infer locally by requesting role metadata
      const meIsPlayer = room.players.some((p) =>
        p.name.includes(s.id.slice(0, 4))
      );
      if (meIsPlayer) {
        setRole("player");
        const p = room.players.find((p) => p.name.includes(s.id.slice(0, 4)));
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

    // cleanup
    return () => {
      if (s.connected) s.disconnect();
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
    if (!message.trim()) return;
    setChat((c) => [...c, { from: "You", text: message.trim() }]);
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
    });
  }

  return (
    <div className="ttt-page">
      <div className="ttt-left">
        <div className="left-top">
          <button
            className="back-btn"
            onClick={() => {
              /* navigate back */
            }}
          >
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
          <div className={`player card ${xIsNext ? "active" : ""}`}>
            <div className="avatar">X</div>
            <div className="meta">
              <div className="name">Player X</div>
              <div className="status">{xIsNext ? "Your turn" : "Waiting"}</div>
            </div>
            <img src={cross} alt="X" className="symbol" />
          </div>

          <div className={`player card ${!xIsNext ? "active" : ""}`}>
            <div className="avatar">O</div>
            <div className="meta">
              <div className="name">Player O</div>
              <div className="status">{!xIsNext ? "Your turn" : "Waiting"}</div>
            </div>
            <img src={circle} alt="O" className="symbol" />
          </div>
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
