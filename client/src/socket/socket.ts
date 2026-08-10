// client/src/socket/socket.ts — Singleton Socket.IO client

import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://duo-game.onrender.com'
    : 'http://localhost:3001'
);

export let socket: Socket;

export function initSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      timeout: 60000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(onStatusUpdate?: (msg: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket) initSocket();
    if (socket.connected) { resolve(); return; }

    let timer: any = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      socket.off('connect', onConnect);
    };

    const onConnect = () => {
      cleanup();
      resolve();
    };

    // Fail after 60 seconds if still not connected
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Server connection timed out after 60s. Please check if the server is active.'));
    }, 60000);

    socket.on('connect', onConnect);

    // If socket is already attempting to connect, don't restart
    if (!socket.active) {
      socket.connect();
    }
  });
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
