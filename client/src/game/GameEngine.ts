// client/src/game/GameEngine.ts
// Main game loop: physics, rendering, input, particles, audio

import type {
  GameState, Player, Platform, Switch, Door, Enemy, Checkpoint, ExitPortal,
} from '../../../shared/types';
import {
  PLAYER_SPEED, PLAYER_JUMP_FORCE, GRAVITY, PLAYER_WIDTH, PLAYER_HEIGHT,
} from '../../../shared/types';
import { resolvePlatformCollisions, checkEnemyCollision } from './collision';
import { ParticleSystem } from './ParticleSystem';
import { AudioEngine } from './AudioEngine';
import { LEVELS } from '../../../shared/levelData';

export type InputState = {
  left: boolean; right: boolean; up: boolean; jump: boolean; interact: boolean;
};

export type GameCallbacks = {
  onPositionUpdate: (payload: {
    x: number; y: number; vx: number; vy: number;
    direction: string; isOnGround: boolean;
  }) => void;
  onInteract: (switchId: string, playerWorld: 'light' | 'dark') => void;
  onPlayerDied: () => void;
  onLevelComplete: () => void;
  onCheckpoint: (id: string) => void;
};

// ── Skin colour palettes ──────────────────────────────────────
const SKIN_COLORS = [
  { body: '#4fc3f7', outline: '#0288d1', eye: '#fff', pupil: '#1a237e', glow: '#29b6f6' },
  { body: '#ce93d8', outline: '#7b1fa2', eye: '#fff', pupil: '#1a237e', glow: '#ba68c8' },
  { body: '#80cbc4', outline: '#00695c', eye: '#fff', pupil: '#1a237e', glow: '#4db6ac' },
  { body: '#ffcc80', outline: '#e65100', eye: '#fff', pupil: '#4e342e', glow: '#ffa726' },
];

const WORLD_BG: Record<string, { top: string; bottom: string; grid: string }> = {
  light: { top: '#0d0d2b', bottom: '#1a1a4e', grid: 'rgba(100,120,255,0.07)' },
  dark:  { top: '#1a0a08', bottom: '#2d0f0a', grid: 'rgba(255,80,80,0.07)' },
};

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState | null = null;
  private localPlayerId: string;
  private playerWorld: 'light' | 'dark';

  // Remote player interpolation
  private remoteTarget: { x: number; y: number; vx: number; vy: number } | null = null;
  private remoteDisplay: { x: number; y: number } = { x: 0, y: 0 };

  // Local physics
  private local = { x: 0, y: 0, vx: 0, vy: 0, isOnGround: false, isAlive: true };
  private lastSentTime = 0;
  private readonly SEND_RATE = 50; // ms

  private input: InputState = { left: false, right: false, up: false, jump: false, interact: false };
  private prevInput: InputState = { ...this.input };
  private jumpPressed = false;
  private interactPressed = false;
  private lastInteractTime = 0;

  private animFrame = 0;
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private running = false;

  // Moving platform offsets
  private platformOffsets = new Map<string, { x: number; y: number; dir: number }>();

  // Camera
  private camera = { x: 0, y: 0 };

  // Particles
  private particles: ParticleSystem;
  private audio: AudioEngine;

  // Death cooldown
  private deathCooldown = 0;
  private readonly DEATH_COOLDOWN = 2000;

  private callbacks: GameCallbacks;
  private scaleFactor = 1;

  // Tile map dimensions
  private levelWidth = 2400;
  private levelHeight = 800;

  constructor(
    canvas: HTMLCanvasElement,
    localPlayerId: string,
    playerWorld: 'light' | 'dark',
    callbacks: GameCallbacks
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.localPlayerId = localPlayerId;
    this.playerWorld = playerWorld;
    this.callbacks = callbacks;
    this.particles = new ParticleSystem();
    this.audio = new AudioEngine();

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  // ── Public API ────────────────────────────────────────────────

  setGameState(gs: GameState) {
    const wasNull = !this.gameState;
    this.gameState = gs;

    const me = gs.players[this.localPlayerId];
    if (me && wasNull) {
      this.local.x = me.x;
      this.local.y = me.y;
    }

    this.levelWidth = LEVELS[gs.levelIndex]?.width ?? 2400;
    this.levelHeight = LEVELS[gs.levelIndex]?.height ?? 800;

    // Init platform offsets if new level
    for (const plat of gs.platforms) {
      if (plat.isMoving && !this.platformOffsets.has(plat.id)) {
        this.platformOffsets.set(plat.id, {
          x: plat.x, y: plat.y, dir: 1,
        });
      }
    }
  }

  updateRemotePlayer(payload: { x: number; y: number; vx: number; vy: number }) {
    this.remoteTarget = payload;
    if (!this.remoteDisplay.x && !this.remoteDisplay.y) {
      this.remoteDisplay = { x: payload.x, y: payload.y };
    }
  }

  setInput(input: Partial<InputState>) {
    Object.assign(this.input, input);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.lastTime = null;
  }

  destroy() {
    this.stop();
    this.audio.destroy();
    window.removeEventListener('resize', this.handleResize);
  }

  // ── Main Loop ─────────────────────────────────────────────────

  private loop = (time: number) => {
    if (!this.running) return;
    const dt = this.lastTime !== null ? Math.min((time - this.lastTime) / 1000, 0.05) : 0.016;
    this.lastTime = time;
    this.animFrame++;

    this.update(dt, time);
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };

  // ── Update ────────────────────────────────────────────────────

  private update(dt: number, now: number) {
    if (!this.gameState) return;

    // Moving platforms
    this.updateMovingPlatforms(dt);

    // Remote interpolation
    if (this.remoteTarget) {
      const speed = 12;
      this.remoteDisplay.x += (this.remoteTarget.x - this.remoteDisplay.x) * speed * dt;
      this.remoteDisplay.y += (this.remoteTarget.y - this.remoteDisplay.y) * speed * dt;
    }

    // Local player physics
    if (this.deathCooldown > 0) {
      this.deathCooldown -= dt * 1000;
      return;
    }

    const platforms = this.getEffectivePlatforms();

    // Horizontal movement
    let targetVx = 0;
    if (this.input.left)  targetVx = -PLAYER_SPEED;
    if (this.input.right) targetVx =  PLAYER_SPEED;
    this.local.vx = targetVx;

    // Jump
    const jumpJustPressed = this.input.jump && !this.prevInput.jump;
    if (jumpJustPressed && this.local.isOnGround) {
      this.local.vy = PLAYER_JUMP_FORCE;
      this.local.isOnGround = false;
      this.audio.playJump();
      this.particles.burst(
        this.local.x + PLAYER_WIDTH / 2,
        this.local.y + PLAYER_HEIGHT,
        8, '#4fc3f7', 60
      );
    }

    // Gravity
    this.local.vy += GRAVITY * dt;

    // Apply velocity
    this.local.x += this.local.vx * dt;
    this.local.y += this.local.vy * dt;

    // Resolve collisions
    const playerObj = {
      x: this.local.x, y: this.local.y,
      width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
      vx: this.local.vx, vy: this.local.vy,
      isOnGround: this.local.isOnGround,
    };
    resolvePlatformCollisions(playerObj, platforms, this.playerWorld);
    this.local.x = playerObj.x;
    this.local.y = playerObj.y;
    this.local.vx = playerObj.vx;
    this.local.vy = playerObj.vy;
    this.local.isOnGround = playerObj.isOnGround;

    // World bounds
    this.local.x = Math.max(0, Math.min(this.local.x, this.levelWidth - PLAYER_WIDTH));
    if (this.local.y > this.levelHeight + 200) {
      this.killPlayer();
    }

    // Enemy collision
    const allPlayers = Object.values(this.gameState.players);
    const me = allPlayers.find(p => p.id === this.localPlayerId);
    if (me) {
      const fakePlayer = { ...me, x: this.local.x, y: this.local.y };
      if (checkEnemyCollision(fakePlayer, this.gameState.enemies, this.playerWorld)) {
        this.killPlayer();
      }
    }

    // Interact
    const interactJustPressed = this.input.interact && !this.prevInput.interact;
    if (interactJustPressed && now - this.lastInteractTime > 300) {
      this.tryInteract();
      this.lastInteractTime = now;
    }

    // Checkpoint
    this.checkCheckpoints();

    // Exit
    this.checkExit();

    // Send position
    if (now - this.lastSentTime > this.SEND_RATE) {
      this.lastSentTime = now;
      let dir = 'idle';
      if (this.input.left)  dir = 'left';
      if (this.input.right) dir = 'right';
      if (!this.local.isOnGround) dir = this.local.vy < 0 ? 'up' : 'down';
      this.callbacks.onPositionUpdate({
        x: this.local.x, y: this.local.y,
        vx: this.local.vx, vy: this.local.vy,
        direction: dir, isOnGround: this.local.isOnGround,
      });
    }

    // Particles
    this.particles.update(dt);

    // Update enemy positions (client-side simulation for visual only)
    this.updateEnemies(dt);

    this.prevInput = { ...this.input };
  }

  private getEffectivePlatforms(): Platform[] {
    if (!this.gameState) return [];
    return this.gameState.platforms.map(p => {
      const offset = this.platformOffsets.get(p.id);
      if (offset) return { ...p, x: offset.x, y: offset.y };
      return p;
    });
  }

  private updateMovingPlatforms(dt: number) {
    if (!this.gameState) return;
    for (const plat of this.gameState.platforms) {
      if (!plat.isMoving) continue;
      let off = this.platformOffsets.get(plat.id);
      if (!off) { off = { x: plat.x, y: plat.y, dir: 1 }; this.platformOffsets.set(plat.id, off); }

      if (plat.moveAxis === 'x') {
        off.x += plat.moveSpeed! * off.dir * dt;
        if (off.x >= plat.moveMax!) off.dir = -1;
        if (off.x <= plat.moveMin!) off.dir = 1;
      } else {
        off.y += plat.moveSpeed! * off.dir * dt;
        if (off.y >= plat.moveMax!) off.dir = -1;
        if (off.y <= plat.moveMin!) off.dir = 1;
      }
    }
  }

  private updateEnemies(dt: number) {
    if (!this.gameState) return;
    for (const enemy of this.gameState.enemies) {
      if (!enemy.isAlive) continue;
      enemy.x += enemy.speed * enemy.direction * dt;
      if (enemy.x >= enemy.patrolMax) enemy.direction = -1;
      if (enemy.x <= enemy.patrolMin) enemy.direction = 1;
    }
  }

  private killPlayer() {
    if (this.deathCooldown > 0) return;
    this.deathCooldown = this.DEATH_COOLDOWN;
    this.audio.playDeath();
    const me = this.gameState?.players[this.localPlayerId];
    const color = me ? SKIN_COLORS[me.skin % SKIN_COLORS.length].glow : '#ff4444';
    this.particles.burst(
      this.local.x + PLAYER_WIDTH / 2,
      this.local.y + PLAYER_HEIGHT / 2,
      20, color, 150
    );
    this.callbacks.onPlayerDied();
  }

  private tryInteract() {
    if (!this.gameState) return;
    const px = this.local.x + PLAYER_WIDTH / 2;
    const py = this.local.y + PLAYER_HEIGHT / 2;
    const REACH = 80;

    for (const sw of this.gameState.switches) {
      if (sw.isActive) continue;
      if (sw.world !== 'both' && sw.world !== this.playerWorld) continue;
      const scx = sw.x + sw.width / 2;
      const scy = sw.y + sw.height / 2;
      const dist = Math.hypot(px - scx, py - scy);
      if (dist < REACH) {
        this.audio.playSwitch();
        this.particles.burst(scx, scy, 12,
          this.playerWorld === 'light' ? '#4fc3f7' : '#ff7043', 80);
        this.callbacks.onInteract(sw.id, this.playerWorld);
        break;
      }
    }
  }

  private checkCheckpoints() {
    if (!this.gameState) return;
    for (const cp of this.gameState.checkpoints) {
      if (cp.activated) continue;
      if (cp.world !== 'both' && cp.world !== this.playerWorld) continue;
      if (
        this.local.x < cp.x + cp.width && this.local.x + PLAYER_WIDTH > cp.x &&
        this.local.y < cp.y + cp.height && this.local.y + PLAYER_HEIGHT > cp.y
      ) {
        cp.activated = true;
        this.audio.playCheckpoint();
        this.particles.burst(cp.x + cp.width / 2, cp.y, 16, '#66bb6a', 100);
        this.callbacks.onCheckpoint(cp.id);
      }
    }
  }

  private exitCooldown = false;
  private checkExit() {
    if (!this.gameState || this.exitCooldown) return;
    const exit = this.gameState.exit;

    const myX = this.local.x, myY = this.local.y;
    const inExit = (
      myX < exit.x + exit.width && myX + PLAYER_WIDTH > exit.x &&
      myY < exit.y + exit.height && myY + PLAYER_HEIGHT > exit.y
    );

    if (!inExit) return;

    if (exit.requiresBothPlayers) {
      // Check if remote player is also in exit
      const remote = Object.values(this.gameState.players).find(p => p.id !== this.localPlayerId);
      if (!remote) return;
      const remoteInExit = (
        this.remoteDisplay.x < exit.x + exit.width && this.remoteDisplay.x + PLAYER_WIDTH > exit.x &&
        this.remoteDisplay.y < exit.y + exit.height && this.remoteDisplay.y + PLAYER_HEIGHT > exit.y
      );
      if (!remoteInExit) return;
    }

    this.exitCooldown = true;
    this.audio.playLevelComplete();
    this.particles.burst(exit.x + exit.width / 2, exit.y + exit.height / 2, 40, '#ffd54f', 200);
    setTimeout(() => this.callbacks.onLevelComplete(), 1000);
  }

  // ── Camera ────────────────────────────────────────────────────

  private updateCamera(canvasW: number, canvasH: number) {
    const targetX = this.local.x - canvasW / (2 * this.scaleFactor);
    const targetY = this.local.y - canvasH / (2 * this.scaleFactor);
    this.camera.x += (targetX - this.camera.x) * 0.12;
    this.camera.y += (targetY - this.camera.y) * 0.12;

    const maxX = this.levelWidth - canvasW / this.scaleFactor;
    const maxY = this.levelHeight - canvasH / this.scaleFactor;
    this.camera.x = Math.max(0, Math.min(this.camera.x, maxX));
    this.camera.y = Math.max(0, Math.min(this.camera.y, Math.max(0, maxY)));
  }

  // ── Render ────────────────────────────────────────────────────

  private render() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const W = canvas.width / this.scaleFactor;
    const H = canvas.height / this.scaleFactor;

    ctx.save();
    ctx.scale(this.scaleFactor, this.scaleFactor);

    this.updateCamera(W, H);
    ctx.translate(-this.camera.x, -this.camera.y);

    // Background
    this.drawBackground(ctx, W, H);

    if (!this.gameState) { ctx.restore(); return; }

    // Platforms
    this.drawPlatforms(ctx);

    // Doors
    this.drawDoors(ctx);

    // Switches
    this.drawSwitches(ctx);

    // Enemies
    this.drawEnemies(ctx);

    // Checkpoints
    this.drawCheckpoints(ctx);

    // Exit portal
    this.drawExit(ctx);

    // Remote player
    const remotePlayer = Object.values(this.gameState.players).find(p => p.id !== this.localPlayerId);
    if (remotePlayer) {
      this.drawPlayer(ctx, this.remoteDisplay.x, this.remoteDisplay.y, remotePlayer, false);
    }

    // Local player
    const localPlayer = this.gameState.players[this.localPlayerId];
    if (localPlayer) {
      this.drawPlayer(ctx, this.local.x, this.local.y, localPlayer, true);
    }

    // Particles
    this.particles.draw(ctx);

    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const bg = WORLD_BG[this.playerWorld];
    const grad = ctx.createLinearGradient(
      this.camera.x, this.camera.y,
      this.camera.x, this.camera.y + H
    );
    grad.addColorStop(0, bg.top);
    grad.addColorStop(1, bg.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(this.camera.x, this.camera.y, W, H);

    // Grid
    ctx.strokeStyle = bg.grid;
    ctx.lineWidth = 1;
    const gSize = 64;
    const startX = Math.floor(this.camera.x / gSize) * gSize;
    const startY = Math.floor(this.camera.y / gSize) * gSize;
    for (let x = startX; x < this.camera.x + W; x += gSize) {
      ctx.beginPath(); ctx.moveTo(x, this.camera.y); ctx.lineTo(x, this.camera.y + H); ctx.stroke();
    }
    for (let y = startY; y < this.camera.y + H; y += gSize) {
      ctx.beginPath(); ctx.moveTo(this.camera.x, y); ctx.lineTo(this.camera.x + W, y); ctx.stroke();
    }
  }

  private drawPlatforms(ctx: CanvasRenderingContext2D) {
    if (!this.gameState) return;
    const platforms = this.getEffectivePlatforms();

    for (const plat of platforms) {
      const visible = plat.world === 'both' || plat.world === this.playerWorld;
      const hinted  = !visible; // dim hint for hidden platforms

      if (hinted) {
        // Ghost hint — barely visible so partners can see the outline
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = this.playerWorld === 'light' ? '#4fc3f7' : '#ff7043';
        ctx.lineWidth = 1;
        ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
        ctx.restore();
        continue;
      }

      ctx.save();
      const isMoving = plat.isMoving;
      const off = this.platformOffsets.get(plat.id);
      const px = off ? off.x : plat.x;
      const py = off ? off.y : plat.y;

      // Platform gradient
      const grad = ctx.createLinearGradient(px, py, px, py + plat.height);
      if (this.playerWorld === 'light') {
        grad.addColorStop(0, '#1a237e');
        grad.addColorStop(1, '#0d1b69');
      } else {
        grad.addColorStop(0, '#4a0a0a');
        grad.addColorStop(1, '#2d0505');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, plat.width, plat.height);

      // Top highlight
      ctx.fillStyle = isMoving
        ? (this.playerWorld === 'light' ? 'rgba(79,195,247,0.6)' : 'rgba(255,112,67,0.6)')
        : (this.playerWorld === 'light' ? 'rgba(100,130,255,0.3)' : 'rgba(255,100,70,0.3)');
      ctx.fillRect(px, py, plat.width, 3);

      // Glow for moving platforms
      if (isMoving) {
        ctx.shadowColor = this.playerWorld === 'light' ? '#4fc3f7' : '#ff7043';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = this.playerWorld === 'light' ? '#4fc3f780' : '#ff704380';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, plat.width, plat.height);
      }
      ctx.restore();
    }
  }

  private drawDoors(ctx: CanvasRenderingContext2D) {
    if (!this.gameState) return;
    for (const door of this.gameState.doors) {
      const visible = door.world === 'both' || door.world === this.playerWorld;
      if (!visible) continue;
      if (door.isOpen) continue;

      ctx.save();
      const color = this.playerWorld === 'light' ? '#0d47a1' : '#7f0000';
      const glow  = this.playerWorld === 'light' ? '#1565c0' : '#c62828';

      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.fillRect(door.x, door.y, door.width, door.height);

      // Circuit lines
      ctx.strokeStyle = glow + '88';
      ctx.lineWidth = 1;
      for (let i = 8; i < door.height; i += 16) {
        ctx.beginPath();
        ctx.moveTo(door.x + 4, door.y + i);
        ctx.lineTo(door.x + door.width - 4, door.y + i);
        ctx.stroke();
      }

      // Lock icon
      ctx.fillStyle = glow;
      ctx.font = `${Math.min(door.width, door.height) * 0.4}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', door.x + door.width / 2, door.y + door.height / 2);
      ctx.restore();
    }
  }

  private drawSwitches(ctx: CanvasRenderingContext2D) {
    if (!this.gameState) return;
    for (const sw of this.gameState.switches) {
      const visible = sw.world === 'both' || sw.world === this.playerWorld;
      if (!visible) continue;

      ctx.save();
      const isActive = sw.isActive;
      const color = isActive
        ? (this.playerWorld === 'light' ? '#00e676' : '#ff6d00')
        : (this.playerWorld === 'light' ? '#4fc3f7' : '#ff7043');

      ctx.shadowColor = color;
      ctx.shadowBlur = isActive ? 18 : 8;

      // Base
      ctx.fillStyle = isActive ? color : '#1a1a3e';
      ctx.beginPath();
      ctx.roundRect(sw.x, sw.y, sw.width, sw.height, 6);
      ctx.fill();

      // Indicator light
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sw.x + sw.width / 2, sw.y + sw.height / 2, 7, 0, Math.PI * 2);
      ctx.fill();

      // Label
      if (!isActive) {
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('E', sw.x + sw.width / 2, sw.y - 14);
        ctx.fillText(sw.label ?? 'SWITCH', sw.x + sw.width / 2, sw.y - 5);
      }
      ctx.restore();
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D) {
    if (!this.gameState) return;
    for (const enemy of this.gameState.enemies) {
      if (!enemy.isAlive) continue;
      const visible = enemy.world === 'both' || enemy.world === this.playerWorld;
      if (!visible) continue;

      ctx.save();
      const t = this.animFrame * 0.04;
      const hover = Math.sin(t + enemy.x * 0.01) * 3;

      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 14;

      // Body
      ctx.fillStyle = '#b71c1c';
      ctx.beginPath();
      ctx.roundRect(enemy.x, enemy.y + hover, enemy.width, enemy.height, 6);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(enemy.x + 10, enemy.y + 14 + hover, 5, 0, Math.PI * 2);
      ctx.arc(enemy.x + enemy.width - 10, enemy.y + 14 + hover, 5, 0, Math.PI * 2);
      ctx.fill();

      // Glowing outline
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(enemy.x, enemy.y + hover, enemy.width, enemy.height);
      ctx.restore();
    }
  }

  private drawCheckpoints(ctx: CanvasRenderingContext2D) {
    if (!this.gameState) return;
    for (const cp of this.gameState.checkpoints) {
      const visible = cp.world === 'both' || cp.world === this.playerWorld;
      if (!visible) continue;

      ctx.save();
      const color = cp.activated ? '#66bb6a' : '#aaa';
      const t = this.animFrame * 0.05;
      const pulse = cp.activated ? Math.sin(t) * 4 : 0;

      ctx.shadowColor = color;
      ctx.shadowBlur = cp.activated ? 16 : 4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(cp.x, cp.y - pulse, cp.width, cp.height + pulse);

      // Flag
      ctx.fillStyle = color;
      ctx.fillRect(cp.x + cp.width / 2 - 1, cp.y - 20, 2, 20);
      ctx.beginPath();
      ctx.moveTo(cp.x + cp.width / 2 + 1, cp.y - 20);
      ctx.lineTo(cp.x + cp.width / 2 + 14, cp.y - 14);
      ctx.lineTo(cp.x + cp.width / 2 + 1, cp.y - 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawExit(ctx: CanvasRenderingContext2D) {
    if (!this.gameState) return;
    const exit = this.gameState.exit;
    const t = this.animFrame * 0.04;
    const pulse = Math.sin(t) * 0.3 + 0.7;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.shadowColor = '#ffd54f';
    ctx.shadowBlur = 30;

    // Portal ring
    const cx = exit.x + exit.width / 2;
    const cy = exit.y + exit.height / 2;
    const r = Math.min(exit.width, exit.height) / 2;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,213,79,0.9)');
    grad.addColorStop(0.5, 'rgba(255,160,0,0.5)');
    grad.addColorStop(1, 'rgba(255,160,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Spinning ring
    ctx.rotate(t * 0.5);
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', cx, cy + r + 14);
    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    player: Player,
    isLocal: boolean
  ) {
    const colors = SKIN_COLORS[player.skin % SKIN_COLORS.length];
    const alpha = isLocal && this.deathCooldown > 0
      ? Math.sin(this.animFrame * 0.5) * 0.5 + 0.5
      : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    // World-coloured glow
    const glowColor = player.world === 'light' ? '#4fc3f780' : '#ff704380';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 16;

    // Body
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 12, PLAYER_WIDTH - 6, PLAYER_HEIGHT - 12, 8);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(x + PLAYER_WIDTH / 2, y + 10, 14, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = colors.eye;
    const eyeOffX = player.direction === 'left' ? -3 : 3;
    ctx.beginPath();
    ctx.arc(x + PLAYER_WIDTH / 2 - 5 + eyeOffX, y + 9, 4, 0, Math.PI * 2);
    ctx.arc(x + PLAYER_WIDTH / 2 + 5 + eyeOffX, y + 9, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.pupil;
    ctx.beginPath();
    ctx.arc(x + PLAYER_WIDTH / 2 - 4 + eyeOffX, y + 9, 2, 0, Math.PI * 2);
    ctx.arc(x + PLAYER_WIDTH / 2 + 6 + eyeOffX, y + 9, 2, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 12, PLAYER_WIDTH - 6, PLAYER_HEIGHT - 12, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + PLAYER_WIDTH / 2, y + 10, 14, 0, Math.PI * 2);
    ctx.stroke();

    // World badge
    ctx.fillStyle = player.world === 'light' ? '#4fc3f7' : '#ff7043';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(player.world === 'light' ? '☀' : '🌑', x + PLAYER_WIDTH / 2, y - 4);

    // Name tag
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(player.name.substring(0, 8), x + PLAYER_WIDTH / 2, y - 14);

    ctx.restore();
  }

  // ── Resize ────────────────────────────────────────────────────

  private handleResize = () => {
    const container = this.canvas.parentElement;
    if (!container) return;
    const W = container.clientWidth;
    const H = container.clientHeight;
    this.canvas.width  = W;
    this.canvas.height = H;

    const GAME_W = 1280, GAME_H = 720;
    const scaleX = W / GAME_W;
    const scaleY = H / GAME_H;
    this.scaleFactor = Math.min(scaleX, scaleY);
  };

  getLocalPosition() {
    return { x: this.local.x, y: this.local.y };
  }
}
