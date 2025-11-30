import React, { useState } from "react";
import "../TicTacToe/TicTacToe.css";
import circle from "../Assets/circle.png";
import cross from "../assets/cross.png";

let data = ["", "", "", "", "", "", "", "", ""];

export const TicTacToe = () => {
  let [count, setCount] = useState(0);
  let [lock, setLock] = useState(false);

  const toggle = (e: React.MouseEvent<HTMLDivElement>, num: number) => {
    if (lock) return;
    const target = e.currentTarget as HTMLDivElement;

    if (count % 2 === 0) {
      target.innerHTML = `<img src="${cross}" class="img-box"/>`;
      data[num] = "X";
      setCount((c) => c + 1);
    } else {
      target.innerHTML = `<img src="${circle}" class="img-box"/>`;
      data[num] = "O";
      setCount((c) => c + 1);
    }
    checkWinner();
  };

  const checkWinner = () => {
    if (
      data[0] !== "" &&
      data[0] === data[1] &&
      data[1] === data[2] &&
      data[2] !== ""
    ) {
      won(data);
    } else if (
      data[3] !== "" &&
      data[3] === data[4] &&
      data[4] === data[5] &&
      data[5] !== ""
    ) {
      won(data);
    } else if (
      data[6] !== "" &&
      data[6] === data[7] &&
      data[7] === data[8] &&
      data[8] !== ""
    ) {
      won(data);
    } else if (
      data[0] !== "" &&
      data[0] === data[3] &&
      data[3] === data[6] &&
      data[6] !== ""
    ) {
      won(data);
    } else if (
      data[1] !== "" &&
      data[1] === data[4] &&
      data[4] === data[7] &&
      data[7] !== ""
    ) {
      won(data);
    } else if (
      data[2] !== "" &&
      data[2] === data[5] &&
      data[5] === data[8] &&
      data[8] !== ""
    ) {
      won(data);
    } else if (
      data[0] !== "" &&
      data[0] === data[4] &&
      data[4] === data[8] &&
      data[8] !== ""
    ) {
      won(data);
    } else if (
      data[2] !== "" &&
      data[2] === data[4] &&
      data[4] === data[6] &&
      data[6] !== ""
    ) {
      won(data);
    }
  };
  const won = () => {
    setLock(true);
  };

  return (
    <div className="container">
      <h1 className="title">Tic Tac Toe</h1>
      <div className="board">
        <div className="row1">
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 0);
            }}
          ></div>
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 1);
            }}
          ></div>
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 2);
            }}
          ></div>
        </div>
        <div className="row1">
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 3);
            }}
          ></div>
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 4);
            }}
          ></div>
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 5);
            }}
          ></div>
        </div>
        <div className="row1">
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 6);
            }}
          ></div>
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 7);
            }}
          ></div>
          <div
            className="box"
            onClick={(e) => {
              toggle(e, 8);
            }}
          ></div>
        </div>
      </div>
      <button className="reset">Restart</button>
    </div>
  );
};
