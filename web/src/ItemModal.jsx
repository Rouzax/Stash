import { useState } from 'react';
import { Trash2, X } from 'lucide-react';

const COLOR_PRESETS = ['#ff006e', '#fb5607', '#ffbe0b', '#06ffa5', '#3a86ff', '#8338ec', '#ff10f0', '#00f0ff'];
const EMOJI_PRESETS = [
  '🍬', '🍭', '🍫', '🍪', '🧁', '🍰',
  '🍩', '🍿', '🥤', '🧃', '☕', '🍺',
  '❤️', '😻', '🚀', '🤪', '🤯', '🔥',
  '💊', '🧪', '⚡', '🌈', '💎', '📦',
];
const UNIT_OPTIONS = ['pcs', 'mg', 'g', 'ml'];
const ONSET_OPTIONS = [
  { label: '0m', value: 0 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
];
const DECAY_OPTIONS = [
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
  { label: '6h', value: 360 },
  { label: '8h', value: 480 },
];

export default function ItemModal({ item, onSave, onDelete, onClose }) {
  const [name, setName] = useState(item?.name || '');
  const [emoji, setEmoji] = useState(item?.emoji || '🍬');
  const [color, setColor] = useState(item?.color || COLOR_PRESETS[0]);
  const [unit, setUnit] = useState(item?.unit || 'pcs');
  const [count, setCount] = useState(item?.count ?? 0);
  const [threshold, setThreshold] = useState(item?.threshold ?? 0);
  const [portionSize, setPortionSize] = useState(item?.portion_size ?? (item?.unit === 'mg' ? 100 : item?.unit === 'ml' ? 250 : item?.unit === 'g' ? 100 : 1));
  const [rushPct, setRushPct] = useState(Math.round((item?.rush_factor ?? 1.0) * 100));
  const [onsetMinutes, setOnsetMinutes] = useState(item?.onset_minutes ?? 0);
  const [decayMinutes, setDecayMinutes] = useState(item?.decay_minutes ?? 240);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      emoji: emoji || '📦',
      color, unit,
      count: Number(count) || 0,
      threshold: Number(threshold) || 0,
      portion_size: Number(portionSize) || 1,
      rush_factor: (Number(rushPct) || 100) / 100,
      onset_minutes: onsetMinutes,
      decay_minutes: decayMinutes
    });
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{item ? 'EDIT ITEM' : 'NEW ITEM'}</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="field">
          <label>NAME</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tikkels" maxLength={64} autoComplete="off" autoFocus />
        </div>

        <div className="field">
          <label>EMOJI / ICON</label>
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
          <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength="4" placeholder="Or type your own" autoComplete="off" style={{ marginTop: 8 }} />
        </div>

        <div className="field">
          <label>NEON COLOR</label>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>COUNT</label>
            <input type="number" inputMode="decimal" value={count} onChange={e => setCount(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label>LOW STOCK ≤</label>
            <input type="number" inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} autoComplete="off" />
          </div>
        </div>

        <div className="field">
          <label>UNIT</label>
          <div className="units">
            {UNIT_OPTIONS.map(u => (
              <button
                key={u}
                className={`unit-btn ${unit === u ? 'active' : ''}`}
                onClick={() => setUnit(u)}
                type="button"
              >{u}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>PORTION ({unit})</label>
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              step="1"
              value={portionSize}
              onChange={e => setPortionSize(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>RUSH %</label>
            <input
              type="number"
              inputMode="numeric"
              min="10"
              max="1000"
              step="10"
              value={rushPct}
              onChange={e => setRushPct(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>ONSET</label>
            <div className="units">
              {ONSET_OPTIONS.map(o => (
                <button
                  key={o.value}
                  className={`unit-btn ${onsetMinutes === o.value ? 'active' : ''}`}
                  onClick={() => setOnsetMinutes(o.value)}
                  type="button"
                >{o.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>DECAY</label>
            <div className="units decay-units">
              {DECAY_OPTIONS.map(d => (
                <button
                  key={d.value}
                  className={`unit-btn ${decayMinutes === d.value ? 'active' : ''}`}
                  onClick={() => setDecayMinutes(d.value)}
                  type="button"
                >{d.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          {item && (
            confirmDelete ? (
              <button className="btn-danger" onClick={() => onDelete(item.id)}>
                CONFIRM
              </button>
            ) : (
              <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} />
              </button>
            )
          )}
          <button className="btn-secondary" onClick={onClose}>CANCEL</button>
          <button className="btn-primary" onClick={handleSave}>SAVE</button>
        </div>
      </div>
    </div>
  );
}
