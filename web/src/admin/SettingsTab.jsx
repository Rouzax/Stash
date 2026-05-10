import { useState } from 'react';
import { admin } from '../api.js';

export default function SettingsTab({ user }) {
  const [familyName, setFamilyName] = useState(user.family_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const saveFamily = async () => {
    if (!familyName.trim()) {
      setError('Family name cannot be empty');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await admin.renameFamily(user.family_id, familyName.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const deleteFamily = async () => {
    if (deleteConfirmName !== user.family_name) return;
    setDeleting(true);
    try {
      await admin.deleteFamily(user.family_id);
      window.location.reload();
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="admin-section">
        <div className="admin-section-label">{'◢'} FAMILY IDENTITY {'◣'}</div>

        <div className="field">
          <label>FAMILY NAME</label>
          <input
            value={familyName}
            onChange={e => setFamilyName(e.target.value)}
            maxLength={64}
          />
        </div>
        <button
          className="btn-primary"
          onClick={saveFamily}
          disabled={saving}
          style={{ marginTop: 8 }}
        >
          {saved ? 'SAVED' : saving ? 'SAVING...' : 'SAVE'}
        </button>
      </div>

      {user.is_superadmin && (
        <div className="admin-danger-zone">
          <div className="admin-section-label" style={{ color: 'var(--neon-pink)' }}>{'◢'} DANGER ZONE {'◣'}</div>

          {confirmDelete ? (
            <div className="create-user-card" style={{ borderColor: 'rgba(255, 0, 110, 0.3)' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: '0 0 12px' }}>
                This will permanently delete the family, all its members, items, and history. Type the family name to confirm:
              </p>
              <div className="field">
                <label>TYPE &quot;{user.family_name}&quot; TO CONFIRM</label>
                <input
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  autoFocus
                  style={{ borderColor: 'rgba(255, 0, 110, 0.5)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-secondary" onClick={() => { setConfirmDelete(false); setDeleteConfirmName(''); }}>CANCEL</button>
                <button
                  className="btn-danger"
                  onClick={deleteFamily}
                  disabled={deleteConfirmName !== user.family_name || deleting}
                  style={{ flex: 1 }}
                >
                  {deleting ? 'DELETING...' : 'DELETE FAMILY'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn-danger"
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%' }}
            >
              DELETE THIS FAMILY
            </button>
          )}
        </div>
      )}
    </div>
  );
}
