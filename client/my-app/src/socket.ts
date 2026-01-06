import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:5000';
const socket: Socket = io(URL, { autoConnect: true });

export default socket;
