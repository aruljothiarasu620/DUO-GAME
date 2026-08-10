// client/src/pages/GameScreen.tsx
// Full game screen: waiting lobby, active game, overlays + real-time chat box

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { socket } from '../socket/socket';
import { GameEngine } from '../game/GameEngine';
import type { GameState, Player, QuickChatPayload } from '../../../shared/types';
import { QUICK_CHAT_MESSAGES } from '../../../shared/types';
import { LEVELS } from '../../../shared/levelData';

interface LocationState {
  roomCode: string;
  world: 'light' | 'dark';
  player: Player;
  isHost: boolean;
}

interface Toast { id: number; text: string; from: string; world: 'light' | 'dark'; }

interface ChatMsg {
  id: number;
  text: string;
  from: string;
  world: 'light' | 'dark';
  time: string;
  isSelf: boolean;
}

export default function GameScreen() {
  const nav = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [phase, setPhase] = useState<'waiting' | 'playing' | 'levelComplete' | 'gameOver' | 'victory'>('waiting');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [showQuickChat, setShowQuickChat] = useState(false);
  const [muted, setMuted] = useState(false);
  const [partners, setPartners] = useState<Player[]>([]);
  const [victoryStats, setVictoryStats] = useState<{ time: number; score: number } | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [isTouchDevice] = useState(() => 'ontouchstart' in window);

  // ── Chat state ────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // ── Guard: redirect if no state ──────────────────────────────
  useEffect(() => {
    if (!state?.roomCode) nav('/');
  }, [state, nav]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
    if (!showChat && chatMessages.length > 0) {
      setUnreadCount(c => c + 1);
    }
  }, [chatMessages]);

  useEffect(() => {
    if (showChat) setUnreadCount(0);
  }, [showChat]);

  // ── Socket events ─────────────────────────────────────────────
  useEffect(() => {
    if (!state) return;

    socket.on('player-joined', ({ players }: { players: Player[] }) => {
      setPartners(players.filter(p => p.id !== socket.id));
    });

    socket.on('room-ready', ({ players }: { players: Player[] }) => {
      setPartners(players.filter(p => p.id !== socket.id));
      if (state.isHost) {
        setTimeout(() => {
          socket.emit('start-game', { roomCode: state.roomCode });
        }, 1200);
      }
    });

    socket.on('game-started', ({ gameState }: { gameState: GameState }) => {
      setGameState(gameState);
      setCurrentLevel(gameState.levelIndex);
      setPhase('playing');
    });

    socket.on('player-moved', (payload: { id: string } & GameState['players'][string]) => {
      engineRef.current?.updateRemotePlayer(payload);
    });

    socket.on('state-update', ({ gameState }: { gameState: GameState }) => {
      setGameState(gs => ({ ...gs, ...gameState }));
      engineRef.current?.setGameState(gameState);
    });

    socket.on('timer-reset', ({ gameState, message }: { gameState: GameState; message: string }) => {
      addToast(message, 'System', state.world);
      addChatSystem(message);
      setGameState(gameState);
      engineRef.current?.setGameState(gameState);
    });

    socket.on('player-respawned', ({ gameState }: { id: string; gameState: GameState }) => {
      setGameState(gameState);
      engineRef.current?.setGameState(gameState);
    });

    socket.on('next-level', ({ gameState }: { gameState: GameState }) => {
      setGameState(gameState);
      setCurrentLevel(gameState.levelIndex);
      engineRef.current?.setGameState(gameState);
      setPhase('playing');
      const msg = `⭐ Level ${gameState.levelIndex + 1}: ${LEVELS[gameState.levelIndex]?.name}`;
      addToast(msg, 'System', state.world);
      addChatSystem(msg);
    });

    socket.on('game-complete', () => {
      setPhase('victory');
      setVictoryStats({ time: gameState?.timer ?? 0, score: gameState?.score ?? 0 });
    });

    socket.on('game-over', ({ reason }: { reason: string }) => {
      addToast(`Game Over: ${reason}`, 'System', state.world);
      addChatSystem(`💀 Game Over: ${reason}`);
      setPhase('gameOver');
    });

    // ── Unified chat-message handler ──────────────────────────
    socket.on('chat-message', (payload: QuickChatPayload & { isTyped?: boolean }) => {
      const isSelf = payload.playerName === state.player.name;
      addChatMsg(payload.message, payload.playerName, payload.playerWorld, isSelf);
      // Show toast popup for every message
      addToast(payload.message, payload.playerName, payload.playerWorld);
    });

    socket.on('player-left', () => {
      addToast('Your partner disconnected!', 'System', state.world);
      addChatSystem('⚡ Partner disconnected from the game.');
      setPhase('gameOver');
    });

    return () => {
      socket.off('player-joined'); socket.off('room-ready');
      socket.off('game-started'); socket.off('player-moved');
      socket.off('state-update'); socket.off('timer-reset');
      socket.off('player-respawned'); socket.off('next-level');
      socket.off('game-complete'); socket.off('game-over');
      socket.off('chat-message'); socket.off('player-left');
    };
  }, [state]);

  // ── Init GameEngine ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || !canvasRef.current || !gameState || !state) return;

    const engine = new GameEngine(
      canvasRef.current, socket.id!, state.world,
      {
        onPositionUpdate: (payload) => socket.emit('player-move', payload),
        onInteract: (switchId, playerWorld) => {
          socket.emit('interact', { switchId, playerWorld }, (res: { success: boolean; gameState?: GameState }) => {
            if (res.success && res.gameState) {
              setGameState(res.gameState);
              engine.setGameState(res.gameState);
            }
          });
        },
        onPlayerDied: () => socket.emit('player-died'),
        onLevelComplete: () => socket.emit('level-complete'),
        onCheckpoint: (id) => socket.emit('activate-checkpoint', { checkpointId: id }),
      }
    );
    engine.setGameState(gameState);
    engine.start();
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
  }, [phase, state]);

  // Sync gameState → engine
  useEffect(() => {
    if (gameState && engineRef.current) engineRef.current.setGameState(gameState);
  }, [gameState]);

  // ── Keyboard input ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const down = (e: KeyboardEvent) => {
      // Don't capture keys when typing in chat
      if (document.activeElement === chatInputRef.current) return;
      if (['ArrowLeft',  'a', 'A'].includes(e.key)) engineRef.current?.setInput({ left: true });
      if (['ArrowRight', 'd', 'D'].includes(e.key)) engineRef.current?.setInput({ right: true });
      if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) { e.preventDefault(); engineRef.current?.setInput({ jump: true }); }
      if (['e', 'E', 'f', 'F'].includes(e.key)) engineRef.current?.setInput({ interact: true });
      // Toggle chat with T
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowChat(c => { if (!c) setTimeout(() => chatInputRef.current?.focus(), 50); return !c; });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (document.activeElement === chatInputRef.current) return;
      if (['ArrowLeft',  'a', 'A'].includes(e.key)) engineRef.current?.setInput({ left: false });
      if (['ArrowRight', 'd', 'D'].includes(e.key)) engineRef.current?.setInput({ right: false });
      if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) engineRef.current?.setInput({ jump: false });
      if (['e', 'E', 'f', 'F'].includes(e.key)) engineRef.current?.setInput({ interact: false });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [phase]);

  // ── Toast helpers ─────────────────────────────────────────────
  const addToast = useCallback((text: string, from: string, world: 'light' | 'dark') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-3), { id, text, from, world }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  // ── Chat helpers ──────────────────────────────────────────────
  const addChatMsg = useCallback((text: string, from: string, world: 'light' | 'dark', isSelf: boolean) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setChatMessages(m => [...m.slice(-99), { id: Date.now() + Math.random(), text, from, world, time, isSelf }]);
  }, []);

  const addChatSystem = useCallback((text: string) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setChatMessages(m => [...m.slice(-99), { id: Date.now() + Math.random(), text, from: 'System', world: 'light', time, isSelf: false }]);
  }, []);

  function sendTypedChat() {
    const msg = chatInput.trim();
    if (!msg || !state) return;
    socket.emit('quick-chat', {
      message: msg,
      playerName: state.player.name,
      playerWorld: state.world,
      isTyped: true,
    } as QuickChatPayload & { isTyped: boolean });
    addChatMsg(msg, state.player.name, state.world, true);
    setChatInput('');
  }

  function sendQuickChat(msg: string) {
    if (!state) return;
    socket.emit('quick-chat', { message: msg, playerName: state.player.name, playerWorld: state.world });
    addChatMsg(msg, state.player.name, state.world, true);
    setShowQuickChat(false);
  }

  function leaveGame() {
    socket.emit('leave-room');
    nav('/');
  }

  // ── Touch controls ─────────────────────────────────────────────
  function touchStart(key: string) { engineRef.current?.setInput({ [key]: true }); }
  function touchEnd(key: string)   { engineRef.current?.setInput({ [key]: false }); }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Waiting Lobby
  // ─────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div className="flex-center flex-col" style={{ height: '100%', position: 'relative' }}>
        <div className="stars-bg" />
        <div className="scanlines" />
        <div className="glass-card" style={{ padding: 44, maxWidth: 440, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontFamily: 'Orbitron', fontSize: 20, marginBottom: 6 }}>Waiting for Partner</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 28 }}>Share this code with a friend</p>
          <div className="room-code-display">{state?.roomCode}</div>
          <div style={{ marginTop: 20, marginBottom: 24 }}>
            <span className={`badge badge-${state?.world}`}>
              {state?.world === 'light' ? '☀ Light Realm' : '🌑 Dark Realm'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 28 }}>
            <PlayerDot label={state?.player.name} world={state?.world} filled />
            {partners.length > 0
              ? <PlayerDot label={partners[0].name} world={partners[0].world === 'light' ? 'dark' : 'light'} filled />
              : <PlayerDot label="Waiting…" world="dark" filled={false} />
            }
          </div>
          {partners.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <span className="spinner" /> Waiting for second player…
            </div>
          )}
          {partners.length > 0 && (
            <div style={{ color: '#66bb6a', fontSize: 13, animation: 'pulse 1s infinite' }}>
              ✓ Partner joined! Starting game…
            </div>
          )}
          <button className="btn btn-ghost" style={{ marginTop: 24, width: '100%' }} onClick={leaveGame}>Leave Room</button>
        </div>
      </div>
    );
  }

  const lives = gameState?.players[socket.id!]?.lives ?? 3;
  const levelName = LEVELS[currentLevel]?.name ?? '';
  const worldColor = state?.world === 'light' ? 'var(--light-primary)' : 'var(--dark-primary)';
  const worldGlow  = state?.world === 'light' ? 'var(--light-glow)' : 'var(--dark-glow)';

  // ─────────────────────────────────────────────────────────────
  // RENDER: Active Game
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#04040f' }}>

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* HUD */}
      {phase === 'playing' && (
        <>
          {/* TOP BAR */}
          <div className="hud">
            {/* Left: Lives + Level */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="hud-lives">
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i} className={`heart${i >= lives ? ' dead' : ''}`}>♥</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="level-pill">LVL {currentLevel + 1}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{levelName}</span>
              </div>
            </div>

            {/* Center: Room code */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: 'var(--text-muted)', letterSpacing: 3 }}>
                {state?.roomCode}
              </div>
              <span className={`badge badge-${state?.world}`} style={{ marginTop: 4 }}>
                {state?.world === 'light' ? '☀ LIGHT' : '🌑 DARK'}
              </span>
            </div>

            {/* Right: Controls */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 14 }}
                onClick={() => setMuted(m => { const next = !m; (engineRef.current as any)?.audio?.setMuted(next); return next; })}>
                {muted ? '🔇' : '🔊'}
              </button>

              {/* Chat toggle with unread badge */}
              <button
                id="chat-toggle-btn"
                className="btn btn-ghost"
                style={{ padding: '6px 12px', fontSize: 12, position: 'relative', borderColor: showChat ? worldColor : undefined, color: showChat ? worldColor : undefined }}
                onClick={() => { setShowChat(c => !c); setUnreadCount(0); setTimeout(() => chatInputRef.current?.focus(), 80); }}
              >
                💬 CHAT
                {unreadCount > 0 && !showChat && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    background: '#ff1744', color: '#fff',
                    borderRadius: '50%', width: 18, height: 18,
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 8px #ff1744',
                  }}>{unreadCount}</span>
                )}
              </button>

              <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }}
                onClick={() => setShowQuickChat(c => !c)}>⚡</button>

              <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 10 }} onClick={leaveGame}>EXIT</button>
            </div>
          </div>

          {/* TOAST NOTIFICATIONS */}
          <div className="toast-container">
            {toasts.map(t => (
              <div key={t.id} className="toast" style={{
                borderColor: t.world === 'light' ? 'var(--light-primary)' : 'var(--dark-primary)',
                boxShadow: `0 0 16px ${t.world === 'light' ? 'var(--light-glow)' : 'var(--dark-glow)'}`,
              }}>
                <strong style={{ color: t.world === 'light' ? 'var(--light-primary)' : 'var(--dark-primary)' }}>
                  {t.from}:
                </strong> {t.text}
              </div>
            ))}
          </div>

          {/* ── CHAT BOX ─────────────────────────────────────────── */}
          {showChat && (
            <div id="chatbox-panel" style={{
              position: 'absolute',
              bottom: isTouchDevice ? 200 : 16,
              right: 16,
              width: 320,
              height: 380,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(4,4,20,0.96)',
              border: `1px solid ${worldColor}`,
              borderRadius: 14,
              boxShadow: `0 0 30px ${worldGlow}, 0 8px 32px rgba(0,0,0,0.6)`,
              zIndex: 40,
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
              animation: 'chatSlideIn 0.2s ease',
            }}>
              {/* Chat Header */}
              <div style={{
                padding: '10px 14px',
                background: `linear-gradient(135deg, ${worldColor}22, transparent)`,
                borderBottom: `1px solid ${worldColor}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💬</span>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 11, color: worldColor, letterSpacing: 2 }}>LIVE CHAT</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>T to toggle</span>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
                >✕</button>
              </div>

              {/* Chat Messages */}
              <div
                ref={chatBodyRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  scrollbarWidth: 'thin',
                  scrollbarColor: `${worldColor}40 transparent`,
                }}
              >
                {chatMessages.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 40 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                    <div>No messages yet.</div>
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>Say hi to your partner!</div>
                  </div>
                )}

                {chatMessages.map(msg => (
                  <ChatBubble key={msg.id} msg={msg} myWorld={state?.world} />
                ))}
              </div>

              {/* Quick-chat shortcuts inside chat */}
              <div style={{
                padding: '6px 10px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', gap: 4, flexWrap: 'wrap',
              }}>
                {QUICK_CHAT_MESSAGES.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => sendQuickChat(m)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${worldColor}33`,
                      borderRadius: 6,
                      color: 'var(--text-muted)',
                      fontSize: 9,
                      padding: '3px 7px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = worldColor)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = `${worldColor}33`)}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Chat Input */}
              <div style={{
                padding: '10px 12px',
                borderTop: `1px solid ${worldColor}33`,
                display: 'flex', gap: 8, alignItems: 'center',
                background: 'rgba(0,0,0,0.4)',
              }}>
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); sendTypedChat(); }
                    if (e.key === 'Escape') setShowChat(false);
                    // Stop game keys from firing while typing
                    e.stopPropagation();
                  }}
                  placeholder="Type a message… (Enter to send)"
                  maxLength={120}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${worldColor}44`,
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 12,
                    padding: '8px 12px',
                    outline: 'none',
                    fontFamily: 'Rajdhani, sans-serif',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = worldColor; }}
                  onBlur={e => { e.currentTarget.style.borderColor = `${worldColor}44`; }}
                />
                <button
                  onClick={sendTypedChat}
                  disabled={!chatInput.trim()}
                  style={{
                    background: chatInput.trim() ? `linear-gradient(135deg, ${worldColor}cc, ${worldColor})` : 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: 8,
                    color: chatInput.trim() ? '#fff' : 'var(--text-muted)',
                    width: 36, height: 36,
                    cursor: chatInput.trim() ? 'pointer' : 'default',
                    fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                    boxShadow: chatInput.trim() ? `0 0 12px ${worldGlow}` : 'none',
                  }}
                >
                  ➤
                </button>
              </div>
            </div>
          )}

          {/* ── QUICK CHAT PANEL ──────────────────────────────────── */}
          {showQuickChat && (
            <div className="quick-chat" style={{ bottom: isTouchDevice ? 200 : 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', marginBottom: 2, letterSpacing: 1 }}>
                ⚡ QUICK CHAT
              </div>
              {QUICK_CHAT_MESSAGES.map((msg, i) => (
                <button key={i} className="quick-chat-btn" onClick={() => sendQuickChat(msg)}>{msg}</button>
              ))}
              <button className="quick-chat-btn" style={{ borderColor: '#ff5252', color: '#ff5252' }} onClick={() => setShowQuickChat(false)}>
                ✕ Close
              </button>
            </div>
          )}

          {/* Touch Controls */}
          {isTouchDevice && (
            <div className="touch-controls">
              <div className="dpad">
                <div className="dpad-btn empty" />
                <div className="dpad-btn" onTouchStart={() => touchStart('jump')} onTouchEnd={() => touchEnd('jump')}>▲</div>
                <div className="dpad-btn empty" />
                <div className="dpad-btn" onTouchStart={() => touchStart('left')} onTouchEnd={() => touchEnd('left')}>◀</div>
                <div className="dpad-btn empty" />
                <div className="dpad-btn" onTouchStart={() => touchStart('right')} onTouchEnd={() => touchEnd('right')}>▶</div>
                <div className="dpad-btn empty" /><div className="dpad-btn empty" /><div className="dpad-btn empty" />
              </div>
              <div className="action-btns">
                <button className="action-btn interact" onTouchStart={() => touchStart('interact')} onTouchEnd={() => touchEnd('interact')}>E</button>
                <button className="action-btn jump" onTouchStart={() => touchStart('jump')} onTouchEnd={() => touchEnd('jump')}>JUMP</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* VICTORY OVERLAY */}
      {phase === 'victory' && (
        <div className="overlay">
          <div className="glass-card" style={{ padding: 48, maxWidth: 480, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌟</div>
            <h2 className="victory-title">WORLDS MERGED!</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: 12, marginBottom: 24, fontSize: 15 }}>
              You completed all 5 levels together!
            </p>
            {victoryStats && (
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginBottom: 28 }}>
                <StatCard label="Time" value={formatTime(victoryStats.time)} />
                <StatCard label="Score" value={String(victoryStats.score)} />
              </div>
            )}
            <button className="btn btn-gold" style={{ width: '100%' }} onClick={leaveGame}>🏠 Return to Menu</button>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {phase === 'gameOver' && (
        <div className="overlay">
          <div className="glass-card" style={{ padding: 48, maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💀</div>
            <h2 style={{ fontFamily: 'Orbitron', fontSize: 28, color: '#ff5252' }}>GAME OVER</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: 12, marginBottom: 28, fontSize: 14 }}>
              The worlds remain split. Try again.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={leaveGame}>🔄 Back to Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chat Bubble Component ────────────────────────────────────────
function ChatBubble({ msg, myWorld }: { msg: ChatMsg; myWorld: 'light' | 'dark' }) {
  const isSystem = msg.from === 'System';

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', fontSize: 10, color: '#ffd54f88', padding: '2px 0', letterSpacing: 0.5 }}>
        — {msg.text} —
      </div>
    );
  }

  const color = msg.world === 'light' ? '#4fc3f7' : '#ff7043';
  const align = msg.isSelf ? 'flex-end' : 'flex-start';
  const bubbleBg = msg.isSelf
    ? (msg.world === 'light' ? 'rgba(79,195,247,0.15)' : 'rgba(255,112,67,0.15)')
    : 'rgba(255,255,255,0.06)';
  const borderColor = msg.isSelf ? `${color}60` : 'rgba(255,255,255,0.08)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 2 }}>
      <div style={{ fontSize: 9, color: color, letterSpacing: 0.5, paddingLeft: msg.isSelf ? 0 : 4, paddingRight: msg.isSelf ? 4 : 0 }}>
        {msg.isSelf ? 'You' : msg.from} · {msg.time}
      </div>
      <div style={{
        background: bubbleBg,
        border: `1px solid ${borderColor}`,
        borderRadius: msg.isSelf ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        padding: '7px 11px',
        fontSize: 13,
        color: '#e8eaf6',
        maxWidth: '80%',
        lineHeight: 1.4,
        wordBreak: 'break-word',
        boxShadow: msg.isSelf ? `0 0 8px ${color}22` : 'none',
      }}>
        {msg.text}
      </div>
    </div>
  );
}

function PlayerDot({ label, world, filled }: { label: string; world: 'light' | 'dark'; filled: boolean }) {
  const color = world === 'light' ? 'var(--light-primary)' : 'var(--dark-primary)';
  const glow  = world === 'light' ? 'var(--light-glow)' : 'var(--dark-glow)';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: filled ? `radial-gradient(circle at 35% 35%, ${color}60, ${color}20)` : 'transparent',
        border: `2px solid ${filled ? color : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 6px',
        boxShadow: filled ? `0 0 20px ${glow}` : 'none',
        fontSize: 22,
      }}>
        {filled ? (world === 'light' ? '☀' : '🌑') : '?'}
      </div>
      <div style={{ fontSize: 11, color: filled ? color : 'var(--text-muted)', letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '16px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ color: 'var(--gold)', fontFamily: 'Orbitron', fontSize: 22 }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
