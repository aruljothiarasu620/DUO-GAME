// server/src/rooms/RoomManager.ts

import type { Room, Player, GameState, Level } from '../../../shared/types.js';
import { LEVELS } from '../../../shared/levelData.js';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function buildGameState(level: Level, players: Player[]): GameState {
  // Deep clone level entities so mutations don't affect source
  return {
    levelIndex: level.id - 1,
    players: Object.fromEntries(players.map(p => [p.id, {
      ...p,
      x: level.player1Spawn.x,
      y: level.player1Spawn.y,
    }])),
    switches: level.switches.map(s => ({ ...s })),
    doors: level.doors.map(d => ({ ...d })),
    platforms: level.platforms.map(p => ({ ...p })),
    enemies: level.enemies.map(e => ({ ...e })),
    checkpoints: level.checkpoints.map(c => ({ ...c })),
    exit: { ...level.exit },
    score: 0,
    timer: 0,
    timerRunning: false,
    isComplete: false,
    isPaused: false,
    timedChallenge: level.timedChallenge ? { ...level.timedChallenge } : undefined,
  };
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  // Track which room each socket belongs to
  private socketToRoom = new Map<string, string>();

  createRoom(hostId: string, player: Player): Room {
    let code: string;
    do { code = generateRoomCode(); } while (this.rooms.has(code));

    const room: Room = {
      code,
      hostId,
      players: [{ ...player, world: 'light' }],
      gameState: null,
      levelIndex: 0,
      status: 'waiting',
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.socketToRoom.set(hostId, code);
    return room;
  }

  joinRoom(code: string, player: Player): { room: Room; error?: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { room: null as unknown as Room, error: 'Room not found.' };
    if (room.players.length >= 2) return { room: null as unknown as Room, error: 'Room is full.' };
    if (room.status !== 'waiting' && room.status !== 'character_select') {
      return { room: null as unknown as Room, error: 'Game already in progress.' };
    }

    const joined = { ...player, world: 'dark' as const };
    room.players.push(joined);
    this.socketToRoom.set(player.id, code.toUpperCase());
    return { room };
  }

  leaveRoom(socketId: string): { roomCode: string | null; room: Room | null } {
    const code = this.socketToRoom.get(socketId);
    if (!code) return { roomCode: null, room: null };

    const room = this.rooms.get(code);
    if (!room) return { roomCode: code, room: null };

    room.players = room.players.filter(p => p.id !== socketId);
    this.socketToRoom.delete(socketId);

    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { roomCode: code, room: null };
    }
    // Reassign host if host left
    if (room.hostId === socketId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }
    room.status = 'waiting';
    return { roomCode: code, room };
  }

  startGame(roomCode: string): { gameState: GameState | null; error?: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { gameState: null, error: 'Room not found.' };
    if (room.players.length < 2) return { gameState: null, error: 'Need 2 players to start.' };

    const level = LEVELS[room.levelIndex];
    // Assign spawns based on world
    const playersWithSpawns = room.players.map((p, i) => ({
      ...p,
      x: i === 0 ? level.player1Spawn.x : level.player2Spawn.x,
      y: i === 0 ? level.player1Spawn.y : level.player2Spawn.y,
      vx: 0,
      vy: 0,
      isAlive: true,
      isOnGround: false,
      isInteracting: false,
    }));

    room.gameState = buildGameState(level, playersWithSpawns);
    room.gameState.timerRunning = true;
    room.status = 'playing';
    return { gameState: room.gameState };
  }

  activateSwitch(roomCode: string, switchId: string, playerWorld: 'light' | 'dark'): {
    gameState: GameState | null;
    error?: string;
    timedOut?: boolean;
  } {
    const room = this.rooms.get(roomCode);
    if (!room?.gameState) return { gameState: null, error: 'No active game.' };

    const sw = room.gameState.switches.find(s => s.id === switchId);
    if (!sw) return { gameState: null, error: 'Switch not found.' };
    // World check
    if (sw.world !== 'both' && sw.world !== playerWorld) {
      return { gameState: null, error: 'Wrong world for this switch.' };
    }
    if (sw.isActive) return { gameState: room.gameState }; // already active

    sw.isActive = true;

    // Timed challenge logic
    const tc = room.gameState.timedChallenge;
    if (tc && !tc.isActive) {
      tc.isActive = true;
      tc.startTime = Date.now();
    }

    // Resolve door opens
    this.resolveDoors(room.gameState);
    return { gameState: room.gameState };
  }

  private resolveDoors(gs: GameState): void {
    for (const door of gs.doors) {
      const condition = door.openCondition;
      if (condition.includes('+')) {
        // All listed switches must be active
        const ids = condition.split('+');
        door.isOpen = ids.every(id => gs.switches.find(s => s.id === id)?.isActive);
      } else {
        door.isOpen = gs.switches.find(s => s.id === condition)?.isActive ?? false;
      }
      door.isSolid = !door.isOpen;
    }
  }

  tickTimedChallenges(roomCode: string): { expired: boolean; gameState: GameState | null } {
    const room = this.rooms.get(roomCode);
    if (!room?.gameState?.timedChallenge) return { expired: false, gameState: null };

    const tc = room.gameState.timedChallenge;
    if (!tc.isActive) return { expired: false, gameState: room.gameState };

    const elapsed = (Date.now() - tc.startTime) / 1000;
    if (elapsed > tc.duration) {
      // Reset switches
      room.gameState.switches.forEach(sw => { sw.isActive = false; });
      this.resolveDoors(room.gameState);
      tc.isActive = false;
      tc.startTime = 0;
      return { expired: true, gameState: room.gameState };
    }
    return { expired: false, gameState: room.gameState };
  }

  updatePlayerPosition(roomCode: string, socketId: string, payload: {
    x: number; y: number; vx: number; vy: number;
    direction: string; isOnGround: boolean;
  }): void {
    const room = this.rooms.get(roomCode);
    if (!room?.gameState) return;
    const player = room.gameState.players[socketId];
    if (!player) return;
    player.x = payload.x;
    player.y = payload.y;
    player.vx = payload.vx;
    player.vy = payload.vy;
    player.direction = payload.direction as Player['direction'];
    player.isOnGround = payload.isOnGround;
  }

  activateCheckpoint(roomCode: string, checkpointId: string): GameState | null {
    const room = this.rooms.get(roomCode);
    if (!room?.gameState) return null;
    const cp = room.gameState.checkpoints.find(c => c.id === checkpointId);
    if (cp) cp.activated = true;
    return room.gameState;
  }

  respawnPlayer(roomCode: string, socketId: string): GameState | null {
    const room = this.rooms.get(roomCode);
    if (!room?.gameState) return null;
    const player = room.gameState.players[socketId];
    if (!player) return null;

    player.lives = Math.max(0, player.lives - 1);
    player.isAlive = player.lives > 0;

    if (player.isAlive) {
      const level = LEVELS[room.levelIndex];
      // Find last activated checkpoint
      const lastCp = room.gameState.checkpoints.filter(c => c.activated).pop();
      if (lastCp) {
        player.x = lastCp.x;
        player.y = lastCp.y - 60;
      } else {
        const isP1 = room.players.findIndex(p => p.id === socketId) === 0;
        player.x = isP1 ? level.player1Spawn.x : level.player2Spawn.x;
        player.y = isP1 ? level.player1Spawn.y : level.player2Spawn.y;
      }
      player.vx = 0;
      player.vy = 0;
    }
    return room.gameState;
  }

  completeLevel(roomCode: string): { nextGameState: GameState | null; isGameOver: boolean } {
    const room = this.rooms.get(roomCode);
    if (!room) return { nextGameState: null, isGameOver: true };

    room.levelIndex += 1;
    if (room.levelIndex >= LEVELS.length) {
      room.status = 'complete';
      return { nextGameState: null, isGameOver: true };
    }

    const level = LEVELS[room.levelIndex];
    const playersWithSpawns = room.players.map((p, i) => ({
      ...p,
      x: i === 0 ? level.player1Spawn.x : level.player2Spawn.x,
      y: i === 0 ? level.player1Spawn.y : level.player2Spawn.y,
      vx: 0, vy: 0, isAlive: true, isOnGround: false, isInteracting: false,
      lives: room.gameState?.players[p.id]?.lives ?? 3,
    }));

    room.gameState = buildGameState(level, playersWithSpawns);
    room.gameState.timerRunning = true;
    return { nextGameState: room.gameState, isGameOver: false };
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  getRoomBySocketId(socketId: string): Room | undefined {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  getRoomCodeBySocketId(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  updateTimer(roomCode: string, delta: number): void {
    const room = this.rooms.get(roomCode);
    if (!room?.gameState?.timerRunning) return;
    room.gameState.timer += delta;
  }
}
