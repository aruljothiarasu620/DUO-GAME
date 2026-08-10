// shared/types.ts — Shared types for Split World

export type World = 'light' | 'dark' | 'both';

export type Direction = 'left' | 'right' | 'up' | 'down' | 'idle';

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  world: 'light' | 'dark';
  lives: number;
  isAlive: boolean;
  direction: Direction;
  isOnGround: boolean;
  skin: number; // 0 or 1
  isInteracting: boolean;
}

export interface Switch {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  world: World;
  isActive: boolean;
  targetId: string; // door or platform ID to affect
  label?: string;
}

export interface Door {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  world: World;
  isOpen: boolean;
  openCondition: string; // switch ID or logic expression
  isSolid: boolean;
}

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  world: World;
  isMoving: boolean;
  moveAxis?: 'x' | 'y';
  moveMin?: number;
  moveMax?: number;
  moveSpeed?: number;
  isSolid: boolean;
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  world: World;
  patrolMin: number;
  patrolMax: number;
  speed: number;
  direction: 1 | -1;
  isAlive: boolean;
}

export interface Checkpoint {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  world: World;
  activated: boolean;
}

export interface ExitPortal {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  world: World;
  requiresBothPlayers: boolean;
}

export interface TimedChallenge {
  id: string;
  duration: number; // seconds
  isActive: boolean;
  startTime: number;
  onExpire: string; // 'reset_switches' | etc
}

export interface Level {
  id: number;
  name: string;
  description: string;
  width: number;
  height: number;
  backgroundLight: string;
  backgroundDark: string;
  player1Spawn: { x: number; y: number };
  player2Spawn: { x: number; y: number };
  platforms: Platform[];
  switches: Switch[];
  doors: Door[];
  enemies: Enemy[];
  checkpoints: Checkpoint[];
  exit: ExitPortal;
  timedChallenge?: TimedChallenge;
}

export interface GameState {
  levelIndex: number;
  players: Record<string, Player>;
  switches: Switch[];
  doors: Door[];
  platforms: Platform[];
  enemies: Enemy[];
  checkpoints: Checkpoint[];
  exit: ExitPortal;
  score: number;
  timer: number;
  timerRunning: boolean;
  isComplete: boolean;
  isPaused: boolean;
  timedChallenge?: TimedChallenge;
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  gameState: GameState | null;
  levelIndex: number;
  status: 'waiting' | 'character_select' | 'playing' | 'complete';
  createdAt: number;
}

// Socket event payloads
export interface CreateRoomPayload {
  playerName: string;
  skin: number;
}

export interface JoinRoomPayload {
  roomCode: string;
  playerName: string;
  skin: number;
}

export interface PlayerMovePayload {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  isOnGround: boolean;
}

export interface InteractPayload {
  switchId: string;
  playerWorld: 'light' | 'dark';
}

export interface QuickChatPayload {
  message: string;
  playerName: string;
  playerWorld: 'light' | 'dark';
}

export interface StartGamePayload {
  roomCode: string;
}

export const QUICK_CHAT_MESSAGES = [
  '🔵 Activate your switch!',
  '⏳ Wait for me!',
  '✅ I\'m ready!',
  '🚨 Enemy ahead!',
  '🛑 Stop! Trap!',
  '🏁 Head to the exit!',
];

export const LEVEL_COUNT = 5;
export const PLAYER_SPEED = 220;
export const PLAYER_JUMP_FORCE = -480;
export const GRAVITY = 900;
export const PLAYER_WIDTH = 36;
export const PLAYER_HEIGHT = 48;
export const TICK_RATE = 20; // ms between position broadcasts
