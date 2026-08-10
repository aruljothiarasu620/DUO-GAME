// client/src/socket/socket.ts — Singleton Socket.IO client

import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? window.location.origin : 'http://localhost:3001');

export let socket: Socket;

export function initSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }
  return socket;
}

export function connectSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket) initSocket();
    if (socket.connected) { resolve(); return; }
    socket.connect();
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
