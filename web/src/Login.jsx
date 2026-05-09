import { useState, useRef } from 'react';
import { auth } from './api.js';
import { SynthBackground } from './background.jsx';

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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const userRef = useRef(null);
  const pwRef = useRef(null);

  const isBootstrap = mode === 'bootstrap';
  const isRegister = !isBootstrap && tab === 'register';
  const submit = async () => {
    setError('');
    if (isBootstrap && !familyName.trim()) {
      setError('Family name required');
      return;
    }
    if (isRegister && !inviteCodeVal.trim()) {
      setError('Invite code required');
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
    setLoading(true);
    try {
      let user;
      if (isBootstrap) {
        user = await auth.bootstrapAdmin(familyName.trim(), username.trim(), password, emoji, email.trim());
      } else if (isRegister) {
        const data = { username: username.trim(), password, emoji, invite_code: inviteCodeVal.trim() };
        if (familyName.trim()) data.family_name = familyName.trim();
        if (email.trim()) data.email = email.trim();
        user = await auth.register(data);
      } else {
        user = await auth.login(username.trim(), password);
      }
      onAuth(user);
    } catch (e) {
      setError(e.message || 'Failed');
      setLoading(false);
    }
  };

  return (
    <>
      <SynthBackground />
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="title">STASH</h1>
          <div className="subtitle">
            ◢ {isBootstrap ? 'INITIALIZE' : isRegister ? 'JOIN OR CREATE' : 'AUTHENTICATE'} ◣
          </div>

          {isBootstrap && (
            <div className="hint-box">
              <strong>FIRST RUN.</strong> Name your family stash and create the admin account.
            </div>
          )}

          {!isBootstrap && (
            <div className="auth-tabs">
              <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError(''); }}>
                LOG IN
              </button>
              <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError(''); }}>
                JOIN / CREATE
              </button>
            </div>
          )}

          {isRegister && (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label>INVITE CODE</label>
                <input
                  type="text"
                  value={inviteCodeVal}
                  onChange={e => setInviteCodeVal(e.target.value.toUpperCase())}
                  placeholder="Ask your family admin"
                  maxLength={8}
                  autoComplete="off"
                  style={{ fontFamily: 'Orbitron', letterSpacing: '3px', textAlign: 'center' }}
                />
              </div>
              <div className="field">
                <label>FAMILY NAME (FOR NEW FAMILIES)</label>
                <input
                  type="text"
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                  placeholder="Only needed for new family codes"
                  maxLength={64}
                  autoComplete="off"
                />
              </div>
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

          <div className="field" style={!isBootstrap && !isRegister ? { marginTop: 24 } : undefined}>
            <label>USERNAME</label>
            <input
              ref={userRef}
              type="text"
              autoComplete={isRegister || isBootstrap ? 'off' : 'username'}
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && pwRef.current?.focus()}
              autoFocus={!isBootstrap && !isRegister}
              disabled={loading}
            />
          </div>

          {(isBootstrap || isRegister) && (
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

          {(isBootstrap || isRegister) && (
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

          <div className="field">
            <label>PASSWORD {(isBootstrap || isRegister) ? '(8+ CHARS)' : ''}</label>
            <input
              ref={pwRef}
              type="password"
              autoComplete={(isBootstrap || isRegister) ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              disabled={loading}
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <button
            className="btn-primary"
            onClick={submit}
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'WORKING...' :
              isBootstrap ? 'INITIALIZE STASH' :
              isRegister ? 'JOIN FAMILY' :
              'LOG IN'}
          </button>
        </div>
      </div>
    </>
  );
}
