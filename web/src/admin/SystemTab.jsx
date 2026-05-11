import { useState, useEffect } from 'react';
import { Trash2, Plus, Shield, Copy, Check, X, KeyRound, Star } from 'lucide-react';
import { auth, admin } from '../api.js';
import { formatTimeAgo } from '../format.js';

const formatExpiry = (ts) => {
  const diff = ts - Date.now();
  if (diff <= 0) return 'expired';
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 1) return `${Math.ceil(diff / 60000)}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export default function SystemTab({ currentUserId, exactDates }) {
  const [allUsers, setAllUsers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [resetPwId, setResetPwId] = useState(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [copiedCode, setCopiedCode] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const refresh = async () => {
    try {
      const [u, f, inv] = await Promise.all([
        admin.listAllUsers(),
        admin.listFamilies(),
        auth.listInvites(),
      ]);
      setAllUsers(u);
      setFamilies(f);
      setInvites(inv.filter(i => i.is_family_starter));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const toggleAdmin = async (userId, currentIsAdmin) => {
    setError('');
    try {
      await admin.updateUser(userId, { is_admin: !currentIsAdmin });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleSuperadmin = async (userId, currentIsSuperadmin) => {
    setError('');
    try {
      await admin.toggleSuperadmin(userId, !currentIsSuperadmin);
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

  const remove = async (id) => {
    try {
      await auth.deleteUser(id);
      setConfirmDeleteId(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const createStarterCode = async () => {
    setError('');
    try {
      await auth.createInvite({ max_uses: 1, expires_hours: 168, is_family_starter: true });
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

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sortedUsers = [...allUsers].sort((a, b) => {
    let va = a[sortBy], vb = b[sortBy];
    if (sortBy === 'family_name') { va = va || ''; vb = vb || ''; }
    if (va == null) va = 0;
    if (vb == null) vb = 0;
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (loading) {
    return <div className="admin-placeholder">LOADING...</div>;
  }

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="admin-section-label">{'◢'} ALL USERS {'◣'}</div>

      <div className="system-sort">
        {[
          { col: 'last_login_at', label: 'LAST SEEN' },
          { col: 'created_at', label: 'CREATED' },
          { col: 'family_name', label: 'FAMILY' },
        ].map(s => (
          <button
            key={s.col}
            className={`unit-btn ${sortBy === s.col ? 'active' : ''}`}
            onClick={() => toggleSort(s.col)}
          >
            {s.label} {sortBy === s.col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </button>
        ))}
      </div>

      <div className="user-list">
        {sortedUsers.map(u => (
          <div key={u.id} className="user-row">
            <div className="user-icon" style={u.color ? { borderColor: u.color, color: u.color } : undefined}>
              {u.emoji || '👤'}
            </div>
            <div className="user-info">
              <div className="user-name">
                {u.username}
                {u.id === currentUserId && <span className="user-self-tag">YOU</span>}
                {u.is_superadmin && <span className="user-sa-tag">SA</span>}
              </div>
              <div className="user-meta">
                {u.family_name}
                {' · '}
                {u.is_admin ? 'Admin' : 'Member'}
                {' · '}
                {formatTimeAgo(u.last_login_at, exactDates)}
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
                  className={`btn-secondary-small ${u.is_superadmin ? 'active' : ''}`}
                  onClick={() => toggleSuperadmin(u.id, u.is_superadmin)}
                  title={u.is_superadmin ? 'Revoke superadmin' : 'Grant superadmin'}
                  style={u.is_superadmin ? { borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' } : undefined}
                >
                  <Star size={14} />
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
                <button className="btn-primary" onClick={() => resetPassword(u.id)} style={{ padding: '6px 12px', fontSize: 11 }}>SET</button>
                <button className="btn-secondary" onClick={() => { setResetPwId(null); setResetPwValue(''); }} style={{ padding: '6px 12px', fontSize: 11 }}>CANCEL</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, borderTop: '1px solid rgba(0,240,255,0.2)', paddingTop: 16 }}>
        <div className="admin-section-label">{'◢'} FAMILIES {'◣'}</div>
        <div className="family-list">
          {families.map(f => (
            <div key={f.id} className="family-row">
              <div className="family-name">{f.name}</div>
              <div className="family-stats">
                {f.member_count} members {'·'} {f.item_count} items {'·'} {new Date(f.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 28, borderTop: '1px solid rgba(255,16,240,0.3)', paddingTop: 16 }}>
        <div className="admin-section-label" style={{ color: 'var(--neon-magenta)' }}>{'◢'} NEW FAMILY CODES {'◣'}</div>

        {invites.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {invites.map(inv => (
              <div key={inv.id} className="invite-row" style={{ borderColor: 'rgba(255,16,240,0.3)' }}>
                <button className="invite-code" onClick={() => copyCode(inv.code)} title="Copy"
                  style={{ color: 'var(--neon-magenta)', borderColor: 'rgba(255,16,240,0.4)', background: 'rgba(255,16,240,0.08)' }}>
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

        <button
          className="btn-primary"
          onClick={createStarterCode}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Plus size={14} /> CREATE FAMILY CODE
        </button>
      </div>
    </div>
  );
}
