// client/src/pages/Landing.tsx

import { useNavigate } from 'react-router-dom';
import { connectSocket } from '../socket/socket';
import { useState } from 'react';

export default function Landing() {
  const nav = useNavigate();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  async function handleNav(path: string) {
    setConnecting(true);
    setError('');
    try {
      await connectSocket();
      nav(path);
    } catch {
      setError('Cannot connect to server. Make sure the server is running on port 3001.');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="flex-center flex-col" style={{ height: '100%', position: 'relative' }}>
      <div className="stars-bg" />
      <div className="scanlines" />

      {/* Logo / Title */}
      <div style={{ textAlign: 'center', marginBottom: 60, position: 'relative', zIndex: 1 }}>
        {/* Split world visual */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, gap: 0 }}>
          <SplitWorldIcon />
        </div>

        <h1 className="landing-title">SPLIT WORLD</h1>
        <p className="landing-sub">2-Player Co-op Puzzle</p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16 }}>
          <span className="badge badge-light">☀ Light Realm</span>
          <span className="badge badge-dark">🌑 Dark Realm</span>
        </div>
      </div>

      {/* Buttons */}
      <div
        className="glass-card"
        style={{ padding: 40, width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button
            className="btn btn-primary"
            style={{ fontSize: 14, padding: '16px 32px' }}
            onClick={() => handleNav('/create')}
            disabled={connecting}
          >
            {connecting ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /></> : '✦'}
            &nbsp; CREATE ROOM
          </button>

          <button
            className="btn btn-danger"
            style={{ fontSize: 14, padding: '16px 32px' }}
            onClick={() => handleNav('/join')}
            disabled={connecting}
          >
            ⟡ JOIN ROOM
          </button>

          <div className="divider">HOW TO PLAY</div>

          <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)', textAlign: 'center' }}>
            <p>🎮 <strong>WASD / Arrow keys</strong> to move</p>
            <p>⬆ / W / Space to <strong>jump</strong></p>
            <p>E to <strong>interact</strong> with switches</p>
            <p>Each player sees a <strong>different world</strong></p>
            <p>Cooperate to reach the <strong>exit portal</strong></p>
          </div>
        </div>

        {error && (
          <p style={{ marginTop: 16, color: '#ff5252', fontSize: 12, textAlign: 'center' }}>
            ⚠ {error}
          </p>
        )}
      </div>

      {/* Level count */}
      <div style={{ marginTop: 24, position: 'relative', zIndex: 1 }}>
        <span className="level-pill">5 LEVELS • REALTIME MULTIPLAYER • WEB AUDIO</span>
      </div>
    </div>
  );
}

function SplitWorldIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <radialGradient id="lightGrad" cx="30%" cy="50%">
          <stop offset="0%" stopColor="#4fc3f7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0288d1" stopOpacity="0.4" />
        </radialGradient>
        <radialGradient id="darkGrad" cx="70%" cy="50%">
          <stop offset="0%" stopColor="#ff7043" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#e64a19" stopOpacity="0.4" />
        </radialGradient>
      </defs>
      {/* Light half */}
      <path d="M60,10 A50,50 0 0,0 60,110 Z" fill="url(#lightGrad)" />
      {/* Dark half */}
      <path d="M60,10 A50,50 0 0,1 60,110 Z" fill="url(#darkGrad)" />
      {/* Dividing line glow */}
      <line x1="60" y1="10" x2="60" y2="110" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      {/* Outer ring */}
      <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      {/* Icons */}
      <text x="34" y="65" fontSize="22" textAnchor="middle" fill="#fff" opacity="0.9">☀</text>
      <text x="86" y="65" fontSize="22" textAnchor="middle" fill="#fff" opacity="0.9">🌑</text>
    </svg>
  );
}
