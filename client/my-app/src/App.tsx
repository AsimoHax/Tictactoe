import { useState } from "react";
import "./App.css";
import { TicTacToe } from "./component/TicTacToe/TicTacToe.js";

function App() {
  const [count, setCount] = useState(0);

  // return the JSX — not "return;" by itself
  return (
    <>
      <div>
        <TicTacToe />
      </div>
    </>
  );
}

export default App;
