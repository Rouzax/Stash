import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { auth } from './api.js';

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (!current || !next || !confirm) {
      setError('All fields required');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await auth.changePassword(current, next);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">CHANGE PASSWORD</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {done ? (
          <div className="success-msg">
            <Check size={32} />
            <div style={{ marginTop: 8 }}>PASSWORD UPDATED</div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>CURRENT</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
                autoComplete="current-password" disabled={loading} autoFocus />
            </div>
            <div className="field">
              <label>NEW (8+)</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)}
                autoComplete="new-password" disabled={loading} />
            </div>
            <div className="field">
              <label>CONFIRM</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && submit()} disabled={loading} />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>CANCEL</button>
              <button className="btn-primary" onClick={submit} disabled={loading}>
                {loading ? 'WORKING...' : 'UPDATE'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
