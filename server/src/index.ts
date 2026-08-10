// server/src/index.ts — Split World Game Server

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './rooms/RoomManager.js';
import { registerHandlers } from './socket/handlers.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const corsOrigin = process.env.CLIENT_URL ? (process.env.CLIENT_URL === '*' ? true : process.env.CLIENT_URL.split(',')) : true;

const app = express();
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 5000,
  pingTimeout: 10000,
});

const roomManager = new RoomManager();

// ── Static client dist serving for production single-port deployment ────────
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io') || req.path.startsWith('/health')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ── HTTP health check ─────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', time: Date.now() }));

// ── Socket.IO connections ─────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);
  registerHandlers(io, socket, roomManager);

  socket.on('disconnect', (reason) => {
    console.log(`[-] Disconnected: ${socket.id} — ${reason}`);
  });
});

// ── Server tick (timed challenges & timer) ────────────────────
const TICK_MS = 500;
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const delta = (now - lastTick) / 1000;
  lastTick = now;

  // Iterate all active rooms (exposed via a simple getter we'll add)
  // For now just track via connected rooms
  for (const [roomCode] of (roomManager as any).rooms as Map<string, any>) {
    roomManager.updateTimer(roomCode, delta);

    const { expired, gameState } = roomManager.tickTimedChallenges(roomCode);
    if (expired && gameState) {
      io.to(roomCode).emit('timer-reset', { gameState, message: 'Time\'s up! Switches reset.' });
    }
  }
}, TICK_MS);

// ── Start ─────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🌐 Split World Server running on http://localhost:${PORT}`);
  console.log(`   Accepting connections from: ${process.env.CLIENT_URL ?? '*'}\n`);
});
