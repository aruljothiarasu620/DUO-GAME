// client/src/pages/CreateRoom.tsx

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket/socket';
import type { Player } from '../../shared/types';

const SKINS = [
  { name: 'Cyan Warrior',  color: '#4fc3f7', glow: '#29b6f6' },
  { name: 'Purple Mystic', color: '#ce93d8', glow: '#ba68c8' },
  { name: 'Teal Ghost',    color: '#80cbc4', glow: '#4db6ac' },
  { name: 'Amber Knight',  color: '#ffcc80', glow: '#ffa726' },
];

export default function CreateRoom() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [skin, setSkin] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleCreate() {
    if (!name.trim()) { setError('Enter your name!'); return; }
    setLoading(true);
    setError('');

    socket.emit('create-room', { playerName: name.trim(), skin }, (res: {
      success: boolean; error?: string; roomCode: string; world: string; player: Player;
    }) => {
      setLoading(false);
      if (!res.success) { setError(res.error ?? 'Error creating room.'); return; }
      nav('/game', { state: { roomCode: res.roomCode, world: res.world, player: res.player, isHost: true } });
    });
  }

  return (
    <div className="flex-center flex-col" style={{ height: '100%', position: 'relative' }}>
      <div className="stars-bg" />
      <div className="scanlines" />

      <div className="glass-card" style={{ padding: 40, width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <button
          className="btn btn-ghost"
          style={{ marginBottom: 24, padding: '8px 16px', fontSize: 12 }}
          onClick={() => nav('/')}
        >
          ← BACK
        </button>

        <h2 style={{ fontFamily: 'Orbitron', fontSize: 22, marginBottom: 6 }}>
          <span className="neon-light">CREATE</span> ROOM
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 28 }}>
          You'll inhabit the <strong className="neon-light">Light Realm ☀</strong>
        </p>

        <div className="form-group">
          <label className="label">Your Name</label>
          <input
            className="input"
            placeholder="Enter codename…"
            value={name}
            maxLength={16}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="label">Choose Skin</label>
          <div className="char-select-grid">
            {SKINS.map((s, i) => (
              <button
                key={i}
                className={`char-option${skin === i ? ' selected' : ''}`}
                onClick={() => setSkin(i)}
                style={{ cursor: 'pointer', background: 'none', border: '2px solid', borderColor: skin === i ? s.glow : 'var(--border)', borderRadius: 12 }}
              >
                <SkinPreview color={s.color} glow={s.glow} />
                <div style={{ fontSize: 11, color: skin === i ? s.color : 'var(--text-muted)', marginTop: 6 }}>
                  {s.name}
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ color: '#ff5252', fontSize: 12, marginBottom: 12 }}>⚠ {error}</p>}

        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '14px' }}
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : '✦ CREATE ROOM'}
        </button>
      </div>
    </div>
  );
}

function SkinPreview({ color, glow }: { color: string; glow: string }) {
  return (
    <svg width="48" height="60" viewBox="0 0 48 60" style={{ display: 'block', margin: '0 auto' }}>
      <defs>
        <filter id={`glow-${color}`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Body */}
      <rect x="7" y="24" width="34" height="32" rx="8" fill={color} />
      {/* Head */}
      <circle cx="24" cy="16" r="14" fill={color} />
      {/* Eyes */}
      <circle cx="19" cy="15" r="4" fill="#fff" />
      <circle cx="29" cy="15" r="4" fill="#fff" />
      <circle cx="20" cy="15" r="2" fill="#1a237e" />
      <circle cx="30" cy="15" r="2" fill="#1a237e" />
      {/* Outline */}
      <rect x="7" y="24" width="34" height="32" rx="8" fill="none" stroke={glow} strokeWidth="1.5" />
      <circle cx="24" cy="16" r="14" fill="none" stroke={glow} strokeWidth="1.5" />
    </svg>
  );
}
