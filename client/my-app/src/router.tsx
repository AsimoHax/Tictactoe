import { createBrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import {TicTacToe} from "./component/TicTacToe/TicTacToe.tsx";
import Login from "./component/Login/Login.tsx";


const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "/", element: <App /> },
      { path: "/game", element: <TicTacToe /> },
      { path: "/login", element: <Login /> },
    ],
  },
]);

export default router;
