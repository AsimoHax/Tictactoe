import React, { useEffect, useState } from "react";
import "./TicTacToe.css";
import cross from "../Assets/cross.png";
import circle from "../Assets/circle.png";

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

  useEffect(() => {
    const w = getWinner(board);
    setWinner(w);
  }, [board]);

  function getWinner(b: string[]) {
    for (const [a, c, d] of WIN_PATTERNS) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return null;
  }

  function handleClick(index: number) {
    if (winner || board[index]) return;
    const next = xIsNext ? "X" : "O";
    const copy = [...board];
    copy[index] = next;
    setBoard(copy);
    setXIsNext(!xIsNext);
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
    if (winner) return; // already finished
    const opponent = xIsNext ? "O" : "X";
    setWinner(opponent);
    setChat((c) => [
      ...c,
      {
        from: "System",
        text: `Player ${xIsNext ? "X" : "O"} surrendered — ${opponent} wins`,
      },
    ]);
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
