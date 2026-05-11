import { useState, useRef } from 'react';
import { auth } from './api.js';
import { SynthBackground, Scanlines } from './background.jsx';

const EMOJI_PRESETS = [
  '😎', '🤓', '👩', '👨', '🧒', '👶',
  '🚀', '🧑‍🚀', '👽', '🤖', '🦸', '🧙',
  '🐱', '🐶', '🦊', '🐼', '🦄', '🐉',
];

export default function Login({ mode, onAuth }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [familyName, setFamilyName] = useState('');
  const [inviteCodeVal, setInviteCodeVal] = useState('');
  const [username, setUsername] = useState('');
  const [emoji, setEmoji] = useState('😎');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState(null); // null = step 1, { code, is_family_starter, family_name } = step 2
  const [checkingCode, setCheckingCode] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const userRef = useRef(null);
  const pwRef = useRef(null);

  const isBootstrap = mode === 'bootstrap';
  const isRegister = !isBootstrap && tab === 'register';

  const checkInvite = async () => {
    setError('');
    if (!inviteCodeVal.trim()) {
      setError('Invite code required');
      return;
    }
    setCheckingCode(true);
    try {
      const result = await auth.checkInvite(inviteCodeVal.trim());
      if (!result.valid) {
        setError('Invalid or expired invite code');
        setCheckingCode(false);
        return;
      }
      setInviteInfo({ code: inviteCodeVal.trim(), is_family_starter: result.is_family_starter, family_name: result.family_name });
      setError('');
    } catch {
      setError('Invalid or expired invite code');
    }
    setCheckingCode(false);
  };

  const submit = async () => {
    setError('');
    if (isBootstrap && !familyName.trim()) {
      setError('Family name required');
      return;
    }
    if (isRegister && inviteInfo?.is_family_starter && !familyName.trim()) {
      setError('Family name required');
      return;
    }
    if (!username.trim() || !password) {
      setError('Username and password required');
      return;
    }
    if ((isBootstrap || isRegister) && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if ((isBootstrap || isRegister) && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      let user;
      if (isBootstrap) {
        user = await auth.bootstrapAdmin(familyName.trim(), username.trim(), password, emoji, email.trim());
      } else if (isRegister) {
        const data = { username: username.trim(), password, emoji, invite_code: inviteInfo.code };
        if (inviteInfo.is_family_starter) data.family_name = familyName.trim();
        if (email.trim()) data.email = email.trim();
        user = await auth.register(data);
      } else {
        user = await auth.login(username.trim(), password);
      }
      onAuth(user);
    } catch (e) {
      const msg = e.message || 'Failed';
      if (isRegister && (msg.includes('invite') || msg.includes('expired'))) {
        setInviteInfo(null);
        setError('This code is no longer valid. Please try again or request a new one.');
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  };

  return (
    <>
      <SynthBackground /><Scanlines />
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="title">STASH</h1>
          <div className="subtitle">
            ◢ {isBootstrap ? 'INITIALIZE' : isRegister ? (inviteInfo ? (inviteInfo.is_family_starter ? 'CREATE FAMILY' : 'JOIN FAMILY') : 'ENTER INVITE CODE') : 'AUTHENTICATE'} ◣
          </div>

          {isBootstrap && (
            <div className="hint-box">
              <strong>FIRST RUN.</strong> Name your family stash and create the admin account.
            </div>
          )}

          {!isBootstrap && (
            <div className="auth-tabs">
              <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError(''); setInviteInfo(null); }}>
                LOG IN
              </button>
              <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError(''); setInviteInfo(null); }}>
                JOIN / CREATE
              </button>
            </div>
          )}

          {isRegister && !inviteInfo && (
            <div style={{ marginTop: 16 }}>
              <div className="field">
                <label>INVITE CODE</label>
                <input
                  type="text"
                  value={inviteCodeVal}
                  onChange={e => setInviteCodeVal(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && checkInvite()}
                  placeholder="Enter your code"
                  maxLength={8}
                  autoComplete="off"
                  autoFocus
                  disabled={checkingCode}
                  style={{ fontFamily: 'Orbitron', letterSpacing: '3px', textAlign: 'center' }}
                />
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button
                className="btn-primary"
                onClick={checkInvite}
                disabled={checkingCode}
                style={{ width: '100%', marginTop: 8 }}
              >
                {checkingCode ? 'CHECKING...' : 'CONTINUE'}
              </button>
            </div>
          )}

          {isRegister && inviteInfo && (
            <>
              <div className="hint-box" style={{ marginTop: 16 }}>
                {inviteInfo.is_family_starter
                  ? <><strong>NEW FAMILY.</strong> You're creating a new family. You'll be the admin.</>
                  : <><strong>JOINING:</strong> {inviteInfo.family_name}</>
                }
              </div>
              {inviteInfo.is_family_starter && (
                <div className="field" style={{ marginTop: 16 }}>
                  <label>FAMILY NAME</label>
                  <input
                    type="text"
                    value={familyName}
                    onChange={e => setFamilyName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && userRef.current?.focus()}
                    placeholder="e.g. The Smiths"
                    maxLength={64}
                    autoComplete="off"
                    autoFocus
                    disabled={loading}
                  />
                </div>
              )}
            </>
          )}

          {isBootstrap && (
            <div className="field" style={{ marginTop: 24 }}>
              <label>FAMILY NAME</label>
              <input
                type="text"
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && userRef.current?.focus()}
                placeholder="e.g. The Smiths"
                maxLength={64}
                autoComplete="off"
                autoFocus
                disabled={loading}
              />
            </div>
          )}

          {(!isRegister || inviteInfo) && (
            <div className="field" style={!isBootstrap && !isRegister ? { marginTop: 24 } : undefined}>
              <label>USERNAME</label>
              <input
                ref={userRef}
                type="text"
                autoComplete={isRegister || isBootstrap ? 'off' : 'username'}
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && pwRef.current?.focus()}
                autoFocus={!isBootstrap && (!isRegister || (inviteInfo && !inviteInfo.is_family_starter))}
                disabled={loading}
              />
            </div>
          )}

          {(isBootstrap || (isRegister && inviteInfo)) && (
            <div className="field">
              <label>YOUR AVATAR</label>
              <div className="emoji-presets">
                {EMOJI_PRESETS.map(e => (
                  <button
                    key={e}
                    className={`emoji-preset ${emoji === e ? 'active' : ''}`}
                    onClick={() => setEmoji(e)}
                    type="button"
                  >{e}</button>
                ))}
              </div>
            </div>
          )}

          {(isBootstrap || (isRegister && inviteInfo)) && (
            <div className="field">
              <label>EMAIL (OPTIONAL)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>
          )}

          {(!isRegister || inviteInfo) && (
            <div className="field">
              <label>PASSWORD {(isBootstrap || isRegister) ? '(8+ CHARS)' : ''}</label>
              <input
                ref={pwRef}
                type="password"
                autoComplete={(isBootstrap || isRegister) ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !(isBootstrap || isRegister) && submit()}
                disabled={loading}
              />
            </div>
          )}

          {(isBootstrap || (isRegister && inviteInfo)) && (
            <div className="field">
              <label>CONFIRM PASSWORD</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                disabled={loading}
              />
            </div>
          )}

          {error && !(isRegister && !inviteInfo) && <div className="error-msg">{error}</div>}

          {!(isRegister && !inviteInfo) && (
            <button
              className="btn-primary"
              onClick={submit}
              disabled={loading}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? 'WORKING...' :
                isBootstrap ? 'INITIALIZE STASH' :
                isRegister && inviteInfo?.is_family_starter ? 'CREATE FAMILY' :
                isRegister ? 'JOIN FAMILY' :
                'LOG IN'}
            </button>
          )}

          {isRegister && inviteInfo && (
            <button
              type="button"
              onClick={() => { setInviteInfo(null); setError(''); }}
              style={{
                background: 'none', border: 'none', color: '#00d2d3', cursor: 'pointer',
                fontSize: 12, marginTop: 12, padding: 0, textDecoration: 'underline',
              }}
            >Back to invite code</button>
          )}

          {!isBootstrap && !isRegister && (
            <button
              type="button"
              onClick={() => { setShowForgot(true); setForgotSent(false); setForgotUsername(''); }}
              style={{
                background: 'none', border: 'none', color: '#00d2d3', cursor: 'pointer',
                fontSize: 12, marginTop: 12, padding: 0, textDecoration: 'underline',
              }}
            >Forgot password?</button>
          )}
        </div>

        {showForgot && (
          <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setShowForgot(false)}>
            <div className="modal" style={{ maxWidth: 380 }}>
              <div className="modal-header">
                <h2 className="modal-title">RESET PASSWORD</h2>
                <button className="btn-close" onClick={() => setShowForgot(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>&times;</button>
              </div>
              {forgotSent ? (
                <div style={{ padding: '16px 0', textAlign: 'center' }}>
                  <p style={{ color: '#00d2d3', fontSize: 14, margin: '0 0 12px' }}>Check your email for a reset link.</p>
                  <button className="btn-secondary" onClick={() => setShowForgot(false)} style={{ padding: '8px 20px' }}>OK</button>
                </div>
              ) : (
                <>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>USERNAME</label>
                    <input
                      type="text"
                      value={forgotUsername}
                      onChange={e => setForgotUsername(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && forgotUsername.trim() && !forgotLoading && (async () => {
                        setForgotLoading(true);
                        try { await auth.forgotPassword(forgotUsername.trim()); } catch {}
                        setForgotSent(true);
                        setForgotLoading(false);
                      })()}
                      autoFocus
                      autoComplete="username"
                      disabled={forgotLoading}
                    />
                  </div>
                  <div className="modal-actions">
                    <button className="btn-secondary" onClick={() => setShowForgot(false)}>CANCEL</button>
                    <button
                      className="btn-primary"
                      disabled={!forgotUsername.trim() || forgotLoading}
                      onClick={async () => {
                        setForgotLoading(true);
                        try { await auth.forgotPassword(forgotUsername.trim()); } catch {}
                        setForgotSent(true);
                        setForgotLoading(false);
                      }}
                    >{forgotLoading ? 'SENDING...' : 'SEND RESET LINK'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
