# 🌐 Split World — 2-Player Co-op Puzzle Game

> *Two players. Two worlds. One exit.*

Split World is a realtime multiplayer co-op puzzle platformer built with **React + Vite**, **Node.js + Socket.IO**, and **HTML5 Canvas**. Each player inhabits a different "world" (☀ Light or 🌑 Dark) and can only see certain platforms, enemies, and switches — forcing true cooperation to complete each level.

---

## 🗂 Project Structure

```
GAME/
├── shared/           # Shared TypeScript types + level data
│   ├── types.ts
│   └── levelData.ts
├── server/           # Node.js + Socket.IO backend
│   └── src/
│       ├── index.ts
│       ├── rooms/RoomManager.ts
│       └── socket/handlers.ts
└── client/           # Vite + React + Canvas frontend
    └── src/
        ├── game/     # GameEngine, Physics, Particles, Audio
        ├── pages/    # Landing, CreateRoom, JoinRoom, GameScreen
        └── styles/   # Cyberpunk CSS theme
```

---

## ⚡ Quick Start

### Prerequisites
- **Node.js** v18 or later
- Two browser windows (or two devices on the same network)

### 1. Install Dependencies

```bash
# From the GAME directory:
npm install --prefix server
npm install --prefix client
```

Or using the root convenience script:
```bash
npm run install:all
```

### 2. Start the Server

Open a terminal and run:
```bash
cd server
npm run dev
```
Server starts at **http://localhost:3001**

### 3. Start the Client

Open another terminal and run:
```bash
cd client
npm run dev
```
Client starts at **http://localhost:5173**

### 4. Play!

1. Open **http://localhost:5173** in two browser windows
2. **Window 1:** Click "Create Room" → enter name → copy the room code
3. **Window 2:** Click "Join Room" → enter name + room code
4. The host auto-starts when both players are in
5. Cooperate to complete all 5 levels!

---

## 🎮 Controls

| Action   | Keys                         |
|----------|------------------------------|
| Move     | `A`/`D` or `←`/`→` arrows   |
| Jump     | `W`, `↑`, or `Space`         |
| Interact | `E` or `F` (near a switch)   |
| Chat     | Click the 💬 button in HUD   |
| Mute     | Click 🔊 in HUD              |

**Mobile:** On-screen D-pad and action buttons appear automatically on touch devices.

---

## 🌍 The 5 Levels

| # | Name | Mechanic |
|---|------|----------|
| 1 | First Contact | P1 activates a switch to lower a bridge for P2 |
| 2 | Invisible Path | P2 sees floating platforms invisible to P1 |
| 3 | Sync or Sink | Both switches must activate within 8 seconds |
| 4 | Enemy Zone | Enemies visible only to P2; P1 is blind to them |
| 5 | Final Split | All mechanics combined — moving platforms, timed doors, enemies |

---

## 🔧 Architecture

### Frontend
- **Vite + React + TypeScript** — UI pages and routing
- **HTML5 Canvas** — 60fps game loop via `requestAnimationFrame`
- **GameEngine class** — physics, collision detection (AABB), camera, rendering
- **Socket.IO client** — position sync every 50ms, state updates on interact
- **Web Audio API** — synthesised sound effects, no external audio libraries
- **ParticleSystem** — burst effects on switches, deaths, checkpoints

### Backend
- **Express + Socket.IO** — HTTP health endpoint + WebSocket rooms
- **RoomManager** — in-memory room state, switch/door resolution, respawn logic
- **Server tick** (500ms) — updates timers, validates timed challenges
- **Zod-ready** — payload validation structure in place

### Shared
- `shared/types.ts` — all entity interfaces (Player, Switch, Door, Platform, Enemy…)
- `shared/levelData.ts` — all 5 levels as pure data objects (no hardcoded logic)

---

## 🎨 Design

- **Neon cyberpunk theme** — custom CSS with glassmorphism, glow effects, and scan lines
- **Google Fonts**: Orbitron (headings), Rajdhani (body), Share Tech Mono (code/monospace)
- **Animated star background** — drifting parallax layers
- **World-specific rendering** — light realm uses cool blues, dark realm uses warm reds
- **Ghost hints** — platforms from the other world are rendered as faint outlines (~8% opacity) so players can sense hidden geometry

---

## 🚀 Deployment

### Production Build
```bash
# Build client
cd client && npm run build

# Serve with Express (add this to server/src/index.ts):
# app.use(express.static('../client/dist'))
```

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `CLIENT_URL` | `http://localhost:5173` | CORS allowed origin |
| `VITE_SERVER_URL` | `http://localhost:3001` | Client → server URL |

---

## 📝 License

MIT — build something great with it. 🚀
