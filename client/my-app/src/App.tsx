
import "./App.css";

import { Outlet, Link } from "react-router-dom";

function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", margin: 0, padding: 0, width: "100%" }}>
      {/* Top Navigation Bar */}
      <nav style={{
        background: "#1a1a1a",
        color: "white",
        padding: "16px 24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        margin: 0,
        width: "100%",
        boxSizing: "border-box",
      }}>
        <Link to="/lobby" style={{ textDecoration: "none", color: "inherit" }}>
          <h2 style={{ margin: 0, padding: 0, fontSize: "24px", fontWeight: 600 }}>TicTacToe</h2>
        </Link>
      </nav>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}


export default App;
