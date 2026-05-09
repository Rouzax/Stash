import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { auth, logApi } from './api.js';

const COLOR_PRESETS = ['#ff006e', '#fb5607', '#ffbe0b', '#06ffa5', '#3a86ff', '#8338ec', '#ff10f0', '#00f0ff'];
const EMOJI_PRESETS = [
  '😎', '🤓', '👩', '👨', '🧒', '👶',
  '🚀', '🧑‍🚀', '👽', '🤖', '🦸', '🧙',
  '🐱', '🐶', '🦊', '🐼', '🦄', '🐉',
];

export default function UserSettingsModal({ user, onUpdate, onRushReset, onChartClear, onClose }) {
  const [emoji, setEmoji] = useState(user.emoji || '😎');
  const [color, setColor] = useState(user.color || '#ff10f0');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const save = async () => {
    setError('');
    setLoading(true);
    try {
      const updated = await auth.updateMe({ emoji, color });
      onUpdate(updated);
      onClose();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">PROFILE</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="field">
          <label>YOUR EMOJI</label>
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
          <input
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            maxLength={4}
            placeholder="Or type your own"
            autoComplete="off"
            style={{ marginTop: 8 }}
          />
        </div>

        <div className="field">
          <label>YOUR COLOR</label>
          <div className="swatches">
            {COLOR_PRESETS.map(c => (
              <div
                key={c}
                className={`swatch ${color === c ? 'active' : ''}`}
                style={{ background: c, boxShadow: `0 0 10px ${c}` }}
                onClick={() => setColor(c)}
                role="button"
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,0,110,0.3)', paddingTop: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, letterSpacing: '2px', color: '#ff006e', marginBottom: 10 }}>
            ◢ RUSH METER ◣
          </div>
          {confirmReset ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#ff006e', flex: 1 }}>
                <AlertTriangle size={14} style={{ verticalAlign: -2 }} /> RESET TO 0%?
              </span>
              <button className="btn-danger" style={{ padding: '8px 14px', fontSize: 11 }} onClick={async () => {
                try {
                  await logApi.resetRush();
                  onRushReset();
                  onClose();
                } catch (e) {
                  setError(e.message);
                }
              }}>YES</button>
              <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 11 }} onClick={() => setConfirmReset(false)}>NO</button>
            </div>
          ) : (
            <button
              className="btn-danger"
              style={{ width: '100%', padding: '10px', fontSize: 11 }}
              onClick={() => setConfirmReset(true)}
            >RESET RUSH METER</button>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          {confirmClear ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#ff006e', flex: 1 }}>
                <AlertTriangle size={14} style={{ verticalAlign: -2 }} /> WIPE ALL CHART DATA?
              </span>
              <button className="btn-danger" style={{ padding: '8px 14px', fontSize: 11 }} onClick={async () => {
                try {
                  await logApi.clearHistory();
                  onChartClear();
                  onClose();
                } catch (e) {
                  setError(e.message);
                }
              }}>YES</button>
              <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 11 }} onClick={() => setConfirmClear(false)}>NO</button>
            </div>
          ) : (
            <button
              className="btn-danger"
              style={{ width: '100%', padding: '10px', fontSize: 11 }}
              onClick={() => setConfirmClear(true)}
            >CLEAR CHART HISTORY</button>
          )}
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>CANCEL</button>
          <button className="btn-primary" onClick={save} disabled={loading}>
            {loading ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
