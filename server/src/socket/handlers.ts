// server/src/socket/handlers.ts

import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager.js';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  PlayerMovePayload,
  InteractPayload,
  QuickChatPayload,
} from '../../../shared/types.js';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../../../shared/types.js';

export function registerHandlers(io: Server, socket: Socket, roomManager: RoomManager): void {
  // ── CREATE ROOM ──────────────────────────────────────────────
  socket.on('create-room', (payload: CreateRoomPayload, ack) => {
    try {
      const player = {
        id: socket.id,
        name: payload.playerName || 'Player 1',
        x: 80, y: 600, vx: 0, vy: 0,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
        world: 'light' as const,
        lives: 3,
        isAlive: true,
        direction: 'idle' as const,
        isOnGround: false,
        skin: payload.skin ?? 0,
        isInteracting: false,
      };
      const room = roomManager.createRoom(socket.id, player);
      socket.join(room.code);
      ack({ success: true, roomCode: room.code, world: 'light', player });
    } catch (err) {
      ack({ success: false, error: String(err) });
    }
  });

  // ── JOIN ROOM ────────────────────────────────────────────────
  socket.on('join-room', (payload: JoinRoomPayload, ack) => {
    try {
      const player = {
        id: socket.id,
        name: payload.playerName || 'Player 2',
        x: 80, y: 600, vx: 0, vy: 0,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
        world: 'dark' as const,
        lives: 3,
        isAlive: true,
        direction: 'idle' as const,
        isOnGround: false,
        skin: payload.skin ?? 1,
        isInteracting: false,
      };
      const { room, error } = roomManager.joinRoom(payload.roomCode, player);
      if (error || !room) {
        ack({ success: false, error: error ?? 'Unknown error.' });
        return;
      }
      socket.join(room.code);
      ack({ success: true, roomCode: room.code, world: 'dark', player });

      // Notify host that partner joined
      io.to(room.code).emit('player-joined', {
        player,
        players: room.players,
      });

      if (room.players.length === 2) {
        io.to(room.code).emit('room-ready', { players: room.players });
      }
    } catch (err) {
      ack({ success: false, error: String(err) });
    }
  });

  // ── START GAME ───────────────────────────────────────────────
  socket.on('start-game', (payload: { roomCode: string }, ack) => {
    const { gameState, error } = roomManager.startGame(payload.roomCode);
    if (error || !gameState) {
      ack?.({ success: false, error });
      return;
    }
    io.to(payload.roomCode).emit('game-started', { gameState });
    ack?.({ success: true });
  });

  // ── PLAYER MOVE ──────────────────────────────────────────────
  socket.on('player-move', (payload: PlayerMovePayload) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    roomManager.updatePlayerPosition(room.code, socket.id, payload);
    // Broadcast to others in room only
    socket.to(room.code).emit('player-moved', { id: socket.id, ...payload });
  });

  // ── INTERACT (switch/checkpoint/exit) ────────────────────────
  socket.on('interact', (payload: InteractPayload, ack) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) { ack?.({ success: false, error: 'Not in a room.' }); return; }

    const { gameState, error } = roomManager.activateSwitch(
      room.code, payload.switchId, payload.playerWorld
    );
    if (error || !gameState) {
      ack?.({ success: false, error });
      return;
    }
    io.to(room.code).emit('state-update', { gameState });
    ack?.({ success: true, gameState });
  });

  // ── CHECKPOINT ───────────────────────────────────────────────
  socket.on('activate-checkpoint', (payload: { checkpointId: string }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const gs = roomManager.activateCheckpoint(room.code, payload.checkpointId);
    if (gs) io.to(room.code).emit('state-update', { gameState: gs });
  });

  // ── PLAYER DIED ──────────────────────────────────────────────
  socket.on('player-died', (_, ack) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const gs = roomManager.respawnPlayer(room.code, socket.id);
    if (gs) {
      io.to(room.code).emit('player-respawned', { id: socket.id, gameState: gs });
      if (gs.players[socket.id] && !gs.players[socket.id].isAlive) {
        io.to(room.code).emit('game-over', { reason: 'Out of lives' });
      }
    }
    ack?.({ success: true });
  });

  // ── LEVEL COMPLETE ───────────────────────────────────────────
  socket.on('level-complete', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const { nextGameState, isGameOver } = roomManager.completeLevel(room.code);
    if (isGameOver) {
      io.to(room.code).emit('game-complete', { message: 'Worlds Merged! You win!' });
    } else {
      io.to(room.code).emit('next-level', { gameState: nextGameState });
    }
  });

  // ── QUICK CHAT ───────────────────────────────────────────────
  socket.on('quick-chat', (payload: QuickChatPayload) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    // Broadcast to everyone EXCEPT the sender (sender already adds msg locally)
    socket.to(room.code).emit('chat-message', payload);
  });


  // ── SYNC STATE (request full state) ─────────────────────────
  socket.on('sync-state', (_, ack) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room?.gameState) { ack?.({ success: false }); return; }
    ack?.({ success: true, gameState: room.gameState });
  });

  // ── DISCONNECT ───────────────────────────────────────────────
  socket.on('disconnecting', () => {
    const { roomCode, room } = roomManager.leaveRoom(socket.id);
    if (roomCode && room) {
      io.to(roomCode).emit('player-left', { id: socket.id, players: room.players });
    }
  });
}
