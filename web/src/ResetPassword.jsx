import { useState } from 'react';
import { auth } from './api.js';
import { SynthBackground } from './background.jsx';

export default function ResetPassword({ onBackToLogin }) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await auth.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setError(e.message || 'Reset failed');
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <>
        <SynthBackground />
        <div className="auth-screen">
          <div className="auth-card">
            <h1 className="title">STASH</h1>
            <div className="subtitle">◢ RESET PASSWORD ◣</div>
            <div className="error-msg">Invalid reset link. No token provided.</div>
            <button className="btn-primary" onClick={onBackToLogin} style={{ width: '100%', marginTop: 16 }}>
              BACK TO LOGIN
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SynthBackground />
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="title">STASH</h1>
          <div className="subtitle">◢ RESET PASSWORD ◣</div>

          {done ? (
            <>
              <p style={{ color: '#00d2d3', textAlign: 'center', margin: '24px 0', fontSize: 14 }}>
                Password updated. You can now log in.
              </p>
              <button className="btn-primary" onClick={onBackToLogin} style={{ width: '100%' }}>
                BACK TO LOGIN
              </button>
            </>
          ) : (
            <>
              <div className="field" style={{ marginTop: 24 }}>
                <label>NEW PASSWORD (8+ CHARS)</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label>CONFIRM PASSWORD</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              {error && <div className="error-msg">{error}</div>}

              <button
                className="btn-primary"
                onClick={submit}
                disabled={loading}
                style={{ width: '100%', marginTop: 8 }}
              >{loading ? 'RESETTING...' : 'SET NEW PASSWORD'}</button>

              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                style={{
                  background: 'none', border: 'none', color: '#00d2d3', cursor: 'pointer',
                  fontSize: 12, marginTop: 12, padding: 0, textDecoration: 'underline',
                }}
              >Back to login</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
