import { useState } from 'react';
import { Plus, Edit2, Trash2, X, ArrowLeft } from 'lucide-react';
import { logApi } from './api.js';
import { formatTimeAgo, formatDelta } from './format.js';

const PAGE_SIZE = 100;

const toDateStr = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toTimeStr = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function HistoryModal({ log, items, itemsById, user, onLogChange, onClose }) {
  const [mode, setMode] = useState('list');
  const [editEntry, setEditEntry] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [addItemId, setAddItemId] = useState(items[0]?.id || '');
  const [addDelta, setAddDelta] = useState('');
  const [addType, setAddType] = useState('consumed');
  const [addRecipient, setAddRecipient] = useState('');
  const [addDate, setAddDate] = useState(toDateStr(Date.now()));
  const [addTime, setAddTime] = useState(toTimeStr(Date.now()));

  const [editDelta, setEditDelta] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  const sorted = [...log].sort((a, b) => b.ts - a.ts);
  const visible = sorted.slice(0, visibleCount);

  const handleAdd = async () => {
    const amount = Number(addDelta);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('Enter a valid amount');
      return;
    }
    const ts = new Date(`${addDate}T${addTime}`).getTime();
    if (!Number.isFinite(ts) || ts > Date.now() + 60000) {
      showError('Invalid or future date');
      return;
    }
    const delta = addType === 'restocked' ? Math.abs(amount) : -Math.abs(amount);
    const isGive = addType === 'gave';
    try {
      const entry = await logApi.add({
        item_id: Number(addItemId), delta, ts,
        ...(isGive ? { is_give: true, give_recipient: addRecipient.trim() || undefined } : {}),
      });
      onLogChange(prev => [...prev, entry]);
      setMode('list');
      setAddDelta('');
      setAddType('consumed');
      setAddRecipient('');
    } catch (e) {
      showError(e.message || 'Failed to add entry');
    }
  };

  const handleEdit = async () => {
    const amount = Number(editDelta);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('Enter a valid amount');
      return;
    }
    const ts = new Date(`${editDate}T${editTime}`).getTime();
    if (!Number.isFinite(ts) || ts > Date.now() + 60000) {
      showError('Invalid or future date');
      return;
    }
    const delta = editEntry.delta < 0 ? -Math.abs(amount) : Math.abs(amount);
    try {
      const updated = await logApi.update(editEntry.id, { delta, ts });
      onLogChange(prev => prev.map(e => e.id === editEntry.id ? updated : e));
      setMode('list');
      setEditEntry(null);
    } catch (e) {
      showError(e.message || 'Failed to update entry');
    }
  };

  const handleDelete = async (id) => {
    try {
      await logApi.remove(id);
      onLogChange(prev => prev.filter(e => e.id !== id));
      setConfirmDeleteId(null);
    } catch (e) {
      showError(e.message || 'Failed to delete entry');
    }
  };

  const startEdit = (entry) => {
    setEditEntry(entry);
    setEditDelta(String(Math.abs(entry.delta)));
    setEditDate(toDateStr(entry.ts));
    setEditTime(toTimeStr(entry.ts));
    setMode('edit');
  };

  const selectedItem = items.find(it => it.id === Number(addItemId));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        {mode === 'list' && (
          <>
            <div className="modal-header">
              <h2 className="modal-title">HISTORY</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="history-add-btn" onClick={() => setMode('add')}>
                  <Plus size={14} /> ADD
                </button>
                <button className="btn-close" onClick={onClose}><X size={18} /></button>
              </div>
            </div>

            {error && <div className="error-msg">{error}</div>}

            {sorted.length === 0 ? (
              <div className="chart-empty">NO HISTORY YET</div>
            ) : (
              <div className="history-list">
                {visible.map(entry => {
                  const item = itemsById.get(entry.item_id);
                  const emoji = item?.emoji || '\u{1F4E6}';
                  const name = item?.name || 'Unknown';
                  const unit = item?.unit || 'pcs';
                  const isConfirming = confirmDeleteId === entry.id;

                  return (
                    <div key={entry.id} className={`history-entry ${entry.is_give ? 'give' : entry.delta < 0 ? 'consumption' : 'restock'}`}>
                      <div className="history-entry-item">
                        {emoji} {name}
                      </div>
                      <div className="history-entry-detail">
                        {entry.is_give
                          ? `gave ${Math.abs(entry.delta)} ${unit}${entry.give_recipient ? ` to ${entry.give_recipient}` : ''}`
                          : formatDelta(entry.delta, unit)}
                      </div>
                      <div className="history-entry-actions">
                        {isConfirming ? (
                          <>
                            <button className="btn-danger-sm" onClick={() => handleDelete(entry.id)}>YES</button>
                            <button className="btn-secondary-sm" onClick={() => setConfirmDeleteId(null)}>NO</button>
                          </>
                        ) : (
                          <>
                            <button className="btn-icon" onClick={() => startEdit(entry)}><Edit2 size={14} /></button>
                            <button className="btn-icon btn-icon-danger" onClick={() => setConfirmDeleteId(entry.id)}><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                      <div className="history-entry-time">{formatTimeAgo(entry.ts, user?.exact_dates)}</div>
                    </div>
                  );
                })}
                {visibleCount < sorted.length && (
                  <button
                    className="btn-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                  >LOAD MORE</button>
                )}
              </div>
            )}
          </>
        )}

        {mode === 'add' && (
          <>
            <div className="modal-header">
              <button className="btn-icon" onClick={() => setMode('list')}><ArrowLeft size={18} /></button>
              <h2 className="modal-title">ADD ENTRY</h2>
              <button className="btn-close" onClick={onClose}><X size={18} /></button>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <div className="form-group">
              <label className="form-label">ITEM</label>
              <select className="form-input" value={addItemId} onChange={e => setAddItemId(e.target.value)}>
                {items.map(it => (
                  <option key={it.id} value={it.id}>{it.emoji} {it.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">TYPE</label>
              <div className="form-toggle">
                <button className={addType === 'consumed' ? 'active' : ''} onClick={() => setAddType('consumed')}>CONSUMED</button>
                <button className={addType === 'restocked' ? 'active' : ''} onClick={() => setAddType('restocked')}>RESTOCKED</button>
                <button className={addType === 'gave' ? 'active' : ''} onClick={() => setAddType('gave')}>GAVE AWAY</button>
              </div>
            </div>

            {addType === 'gave' && (
              <div className="form-group">
                <label className="form-label">TO (OPTIONAL)</label>
                <input className="form-input" type="text" value={addRecipient} onChange={e => setAddRecipient(e.target.value)} placeholder="Dave, office, etc." maxLength={64} autoComplete="off" />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">AMOUNT ({selectedItem?.unit || 'pcs'})</label>
              <input className="form-input" type="number" min="0" step="any"
                value={addDelta} onChange={e => setAddDelta(e.target.value)}
                placeholder="0" />
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">DATE</label>
                <input className="form-input" type="date" value={addDate} onChange={e => setAddDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">TIME</label>
                <input className="form-input" type="time" value={addTime} onChange={e => setAddTime(e.target.value)} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setMode('list')}>CANCEL</button>
              <button className="btn-primary" onClick={handleAdd}>SAVE</button>
            </div>
          </>
        )}

        {mode === 'edit' && editEntry && (
          <>
            <div className="modal-header">
              <button className="btn-icon" onClick={() => { setMode('list'); setEditEntry(null); }}><ArrowLeft size={18} /></button>
              <h2 className="modal-title">EDIT ENTRY</h2>
              <button className="btn-close" onClick={onClose}><X size={18} /></button>
            </div>

            {error && <div className="error-msg">{error}</div>}

            {(() => {
              const item = itemsById.get(editEntry.item_id);
              return (
                <div className="history-edit-context">
                  {item?.emoji || '\u{1F4E6}'} {item?.name || 'Unknown'} ({editEntry.delta < 0 ? 'consumed' : 'restocked'})
                </div>
              );
            })()}

            <div className="form-group">
              <label className="form-label">AMOUNT ({itemsById.get(editEntry.item_id)?.unit || 'pcs'})</label>
              <input className="form-input" type="number" min="0" step="any"
                value={editDelta} onChange={e => setEditDelta(e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">DATE</label>
                <input className="form-input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">TIME</label>
                <input className="form-input" type="time" value={editTime} onChange={e => setEditTime(e.target.value)} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setMode('list'); setEditEntry(null); }}>CANCEL</button>
              <button className="btn-primary" onClick={handleEdit}>SAVE</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
