import { useState, useEffect } from 'react';
import { Trash2, Plus, Shield, User, Copy, Check, Link, X, KeyRound, ChevronDown, ChevronUp } from 'lucide-react';
import { auth, admin } from '../api.js';
import { formatTimeAgo } from '../format.js';

const EXPIRY_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

const USES_OPTIONS = [
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '∞', value: 0 },
];

const EMOJI_PRESETS = ['\u{1F60E}', '\u{1F913}', '\u{1F469}', '\u{1F468}', '\u{1F9D2}', '\u{1F476}', '\u{1F680}', '\u{1F9D1}‍\u{1F680}', '\u{1F47D}', '\u{1F916}', '\u{1F9B8}', '\u{1F9D9}', '\u{1F431}', '\u{1F436}', '\u{1F98A}', '\u{1F43C}', '\u{1F984}', '\u{1F409}'];

export default function UsersTab({ currentUserId, exactDates }) {
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showInviteCreate, setShowInviteCreate] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [inviteExpiry, setInviteExpiry] = useState(24);
  const [invitesExpanded, setInvitesExpanded] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmoji, setNewEmoji] = useState('\u{1F60E}');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [resetPwId, setResetPwId] = useState(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(null);

  const refresh = async () => {
    try {
      const [u, inv] = await Promise.all([auth.listUsers(), auth.listInvites()]);
      setUsers(u);
      setInvites(inv.filter(i => !i.is_family_starter));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const create = async () => {
    setError('');
    if (!newUsername.trim() || !newPassword) {
      setError('Username and password required');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await auth.createUser(newUsername.trim(), newPassword, newIsAdmin, newEmail.trim(), newEmoji);
      setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewEmoji('\u{1F60E}'); setNewIsAdmin(false);
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await auth.deleteUser(id);
      setConfirmDeleteId(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleAdmin = async (userId, currentIsAdmin) => {
    setError('');
    try {
      await admin.updateUser(userId, { is_admin: !currentIsAdmin });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const resetPassword = async (userId) => {
    setError('');
    if (!resetPwValue || resetPwValue.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await admin.updateUser(userId, { password: resetPwValue });
      setResetPwId(null);
      setResetPwValue('');
    } catch (e) {
      setError(e.message);
    }
  };

  const createInvite = async () => {
    setError('');
    try {
      await auth.createInvite({ max_uses: inviteMaxUses, expires_hours: inviteExpiry });
      setShowInviteCreate(false);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const revokeInvite = async (id) => {
    try {
      await auth.deleteInvite(id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const formatExpiry = (ts) => {
    const diff = ts - Date.now();
    if (diff <= 0) return 'expired';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    if (hours < 1) return `${Math.ceil(diff / 60000)}m`;
    if (hours < 48) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  if (loading) {
    return <div className="admin-placeholder">LOADING...</div>;
  }

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="user-list">
        {users.map(u => (
          <div key={u.id} className="user-row">
            <div className="user-icon" style={u.color ? { borderColor: u.color, color: u.color } : undefined}>
              {u.emoji || (u.is_admin ? <Shield size={16} /> : <User size={16} />)}
            </div>
            <div className="user-info">
              <div className="user-name">
                {u.username}
                {u.id === currentUserId && <span className="user-self-tag">YOU</span>}
              </div>
              <div className="user-meta">
                {u.is_admin ? 'Admin' : 'Member'}
                {' · '}
                {formatTimeAgo(u.last_login_at, exactDates)}
                {' · '}
                {new Date(u.created_at).toLocaleDateString()}
              </div>
            </div>
            {u.id !== currentUserId && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`btn-secondary-small ${u.is_admin ? 'active' : ''}`}
                  onClick={() => toggleAdmin(u.id, u.is_admin)}
                  title={u.is_admin ? 'Demote to member' : 'Promote to admin'}
                >
                  <Shield size={14} />
                </button>
                <button
                  className="btn-secondary-small"
                  onClick={() => { setResetPwId(resetPwId === u.id ? null : u.id); setResetPwValue(''); }}
                  title="Reset password"
                >
                  <KeyRound size={14} />
                </button>
                {confirmDeleteId === u.id ? (
                  <>
                    <button className="btn-danger-small" onClick={() => remove(u.id)}>YES</button>
                    <button className="btn-secondary-small" onClick={() => setConfirmDeleteId(null)}>NO</button>
                  </>
                ) : (
                  <button className="btn-danger-small" onClick={() => setConfirmDeleteId(u.id)} aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
            {resetPwId === u.id && (
              <div className="reset-pw-inline">
                <input
                  type="password"
                  placeholder="New password (8+)"
                  value={resetPwValue}
                  onChange={e => setResetPwValue(e.target.value)}
                  autoFocus
                />
                <button className="btn-primary" onClick={() => resetPassword(u.id)} style={{ padding: '6px 12px', fontSize: 11 }}>
                  SET
                </button>
                <button className="btn-secondary" onClick={() => { setResetPwId(null); setResetPwValue(''); }} style={{ padding: '6px 12px', fontSize: 11 }}>
                  CANCEL
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreate ? (
        <div className="create-user-card">
          <div className="field">
            <label>USERNAME</label>
            <input value={newUsername} onChange={e => setNewUsername(e.target.value)} autoComplete="off" autoFocus />
          </div>
          <div className="field">
            <label>EMAIL (OPTIONAL)</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" autoComplete="off" />
          </div>
          <div className="field">
            <label>PASSWORD (8+)</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field">
            <label>EMOJI</label>
            <div className="emoji-presets">
              {EMOJI_PRESETS.map(e => (
                <button key={e} type="button"
                  className={`emoji-preset ${newEmoji === e ? 'active' : ''}`}
                  onClick={() => setNewEmoji(e)}
                >{e}</button>
              ))}
            </div>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)} />
            <span>GRANT ADMIN PRIVILEGES</span>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setError(''); }}>CANCEL</button>
            <button className="btn-primary" onClick={create} style={{ flex: 1 }}>CREATE</button>
          </div>
        </div>
      ) : (
        <button
          className="btn-primary"
          onClick={() => { setShowCreate(true); setError(''); }}
          style={{ width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Plus size={16} /> ADD MEMBER
        </button>
      )}

      <div style={{ marginTop: 24, borderTop: '1px solid rgba(0,240,255,0.2)', paddingTop: 16 }}>
        <button
          className="admin-section-toggle"
          onClick={() => setInvitesExpanded(!invitesExpanded)}
        >
          <span>MEMBER INVITES</span>
          {invitesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {invitesExpanded && (
          <>
            {invites.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {invites.map(inv => (
                  <div key={inv.id} className="invite-row">
                    <button className="invite-code" onClick={() => copyCode(inv.code)} title="Copy">
                      {inv.code}
                      {copiedCode === inv.code ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <div className="invite-meta">
                      {inv.max_uses === 0 ? '∞' : `${inv.use_count}/${inv.max_uses}`} uses {'·'} {formatExpiry(inv.expires_at)}
                    </div>
                    <button className="btn-danger-small" onClick={() => revokeInvite(inv.id)} aria-label="Revoke" style={{ width: 28, height: 28 }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showInviteCreate ? (
              <div className="create-user-card">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field">
                    <label>MAX USES</label>
                    <div className="units">
                      {USES_OPTIONS.map(o => (
                        <button key={o.value} type="button"
                          className={`unit-btn ${inviteMaxUses === o.value ? 'active' : ''}`}
                          onClick={() => setInviteMaxUses(o.value)}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>EXPIRES</label>
                    <div className="units">
                      {EXPIRY_OPTIONS.map(o => (
                        <button key={o.hours} type="button"
                          className={`unit-btn ${inviteExpiry === o.hours ? 'active' : ''}`}
                          onClick={() => setInviteExpiry(o.hours)}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn-secondary" onClick={() => setShowInviteCreate(false)}>CANCEL</button>
                  <button className="btn-primary" onClick={createInvite} style={{ flex: 1 }}>GENERATE</button>
                </div>
              </div>
            ) : (
              <button
                className="btn-secondary"
                onClick={() => setShowInviteCreate(true)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Link size={14} /> INVITE MEMBER
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
