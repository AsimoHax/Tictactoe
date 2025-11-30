import { createBrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import {TicTacToe} from "./component/TicTacToe/TicTacToe.tsx";
import Login from "./component/Login/Login.tsx";
import Signup from "./component/Login/Signup.tsx";
import Lobby from "./component/Home/lobby.tsx";
import Profile from "./component/Profile/Profile.tsx";


const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "/", element: <App /> },
      { path: "/game", element: <TicTacToe /> },
      { path: "/lobby", element: <Lobby /> },
      { path: "/login", element: <Login /> },
      { path: "/signup", element: <Signup /> },
      { path: "/profile", element: <Profile /> },
    ],
  },
]);

export default router;
