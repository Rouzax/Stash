import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Edit2, LogOut, Users, KeyRound, MoreVertical, UserCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { items as itemsApi, logApi, auth } from './api.js';
import { SynthBackground } from './background.jsx';
import AdminPanel from './AdminPanel.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import ItemModal from './ItemModal.jsx';
import UserSettingsModal from './UserSettingsModal.jsx';

const RUSH_FULL = 1;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const portionFor = (item) => item?.portion_size || (item?.unit === 'mg' ? 100 : 1);

const formatCount = (n) => {
  if (n == null || Number.isNaN(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return parseFloat(n.toFixed(4)).toString();
};

const formatDelta = (n) => {
  const abs = Math.abs(n);
  if (abs === 0.25) return n > 0 ? '+¼' : '−¼';
  if (abs === 0.5) return n > 0 ? '+½' : '−½';
  if (abs === 0.75) return n > 0 ? '+¾' : '−¾';
  return (n > 0 ? '+' : '−') + formatCount(abs);
};

export default function Inventory({ user: initialUser, onLogout }) {
  const [user, setUser] = useState(initialUser);
  const [items, setItems] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [floats, setFloats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const [chartPeriod, setChartPeriod] = useState('year');
  const [, setTick] = useState(0);

  const adjustSeq = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [itemsData, logData] = await Promise.all([
          itemsApi.list(),
          logApi.fetch(400)
        ]);
        if (cancelled) return;
        setItems(itemsData);
        setLog(logData);
      } catch (e) {
        if (cancelled) return;
        if (e.status !== 401) showError(e.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 1_000_000), 60_000);
    return () => clearInterval(id);
  }, []);

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  const updateCount = async (id, delta) => {
    const item = items.find(it => it.id === id);
    if (!item) return;
    const optimisticCount = Math.max(0, item.count + delta);
    if (optimisticCount === item.count) return;
    const optimisticDelta = optimisticCount - item.count;

    setItems(prev => prev.map(it => it.id === id ? { ...it, count: optimisticCount } : it));
    const fid = Math.random().toString(36).slice(2);
    setFloats(f => [...f, { id: fid, itemId: id, delta: optimisticDelta }]);
    setTimeout(() => setFloats(f => f.filter(x => x.id !== fid)), 800);

    const mySeq = (adjustSeq.current.get(id) || 0) + 1;
    adjustSeq.current.set(id, mySeq);

    try {
      const result = await itemsApi.adjust(id, delta);
      if (adjustSeq.current.get(id) === mySeq) {
        setItems(prev => prev.map(it => it.id === id ? { ...it, count: result.count } : it));
      }
      if (result.delta !== 0) {
        setLog(prev => [...prev, { item_id: id, user_id: user.id, delta: result.delta, ts: result.ts }]);
      }
    } catch (e) {
      setItems(prev => prev.map(it =>
        it.id === id ? { ...it, count: Math.max(0, it.count - optimisticDelta) } : it
      ));
      if (e.status === 404) {
        setItems(prev => prev.filter(it => it.id !== id));
      } else if (e.status !== 401) {
        showError('Update failed: ' + e.message);
      }
    }
  };

  const takeOne = (id) => {
    const item = items.find(it => it.id === id);
    if (item) updateCount(id, -portionFor(item));
  };
  const takeQuarter = (id) => {
    const item = items.find(it => it.id === id);
    if (item) updateCount(id, -portionFor(item) / 4);
  };

  const saveItem = async (data) => {
    try {
      if (editingId) {
        const updated = await itemsApi.update(editingId, data);
        setItems(prev => prev.map(it => it.id === editingId ? updated : it));
      } else {
        const created = await itemsApi.create(data);
        setItems(prev => [...prev, created]);
      }
      setShowItemModal(false);
      setEditingId(null);
    } catch (e) {
      if (e.status === 404) {
        setShowItemModal(false);
        setEditingId(null);
        if (editingId) setItems(prev => prev.filter(it => it.id !== editingId));
        showError('That item is no longer available');
      } else if (e.status !== 401) {
        showError('Save failed: ' + e.message);
      }
    }
  };

  const deleteItem = async (id) => {
    try {
      await itemsApi.remove(id);
      setItems(prev => prev.filter(it => it.id !== id));
      setShowItemModal(false);
      setEditingId(null);
    } catch (e) {
      if (e.status === 404) {
        setItems(prev => prev.filter(it => it.id !== id));
        setShowItemModal(false);
        setEditingId(null);
      } else if (e.status !== 401) {
        showError('Delete failed: ' + e.message);
      }
    }
  };

  const handleLogout = async () => {
    try { await auth.logout(); } catch {}
    onLogout();
  };

  // ============ Rush meter (per-item factor + decay) ============
  const itemsById = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const rushResetAt = user.rush_reset_at || 0;

  const now = Date.now();
  let rushScore = 0;
  for (const entry of log) {
    if (entry.delta >= 0) continue;
    if (entry.ts <= rushResetAt) continue;
    const item = itemsById.get(entry.item_id);
    if (!item) continue;
    const decayMs = (item.decay_minutes || 240) * 60 * 1000;
    const age = now - entry.ts;
    if (age >= decayMs || age < 0) continue;
    const portions = Math.abs(entry.delta) / (item.portion_size || 1);
    rushScore += (item.rush_factor || 1) * portions * (1 - age / decayMs);
  }
  const rushLevel = (rushScore / RUSH_FULL) * 100;

  let mascot = '😴', mascotLabel = 'CHILL';
  if (rushLevel > 25) { mascot = '🙂'; mascotLabel = 'WARMING UP'; }
  if (rushLevel > 50) { mascot = '😄'; mascotLabel = 'HYPED'; }
  if (rushLevel > 75) { mascot = '🤪'; mascotLabel = 'FULL RAVE'; }
  if (rushLevel > 150) { mascot = '🤯'; mascotLabel = 'OVERDRIVE'; }
  if (rushLevel > 250) { mascot = '💀'; mascotLabel = 'COMA'; }

  // ============ Chart data ============
  const chartData = useMemo(() => {
    const data = [];
    if (chartPeriod === 'week') {
      for (let i = 6; i >= 0; i--) {
        const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        let units = 0;
        for (const l of log) {
          if (l.ts < start.getTime() || l.ts >= end.getTime()) continue;
          if (l.delta >= 0) continue;
          const item = itemsById.get(l.item_id);
          if (item) units += (item.rush_factor || 1) * (Math.abs(l.delta) / (item.portion_size || 1));
        }
        const pct = (units / RUSH_FULL) * 100;
        data.push({ label: DAY_LABELS[start.getDay()], rush: Math.round(pct) });
      }
    } else {
      const today = new Date();
      for (let i = 11; i >= 0; i--) {
        const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
        let units = 0;
        for (const l of log) {
          if (l.ts < start.getTime() || l.ts >= end.getTime()) continue;
          if (l.delta >= 0) continue;
          const item = itemsById.get(l.item_id);
          if (item) units += (item.rush_factor || 1) * (Math.abs(l.delta) / (item.portion_size || 1));
        }
        const pct = (units / RUSH_FULL) * 100;
        data.push({ label: MONTH_LABELS[start.getMonth()], rush: Math.round(pct) });
      }
    }
    return data;
  }, [log, itemsById, chartPeriod]);
  const chartHasData = chartData.some(d => d.rush > 0);

  const editingItem = editingId ? items.find(it => it.id === editingId) : null;

  if (loading) {
    return (
      <>
        <SynthBackground />
        <div className="loading-screen"><div className="loading-text">LOADING</div></div>
      </>
    );
  }

  return (
    <>
      <SynthBackground />

      <div className="synth-app">
        <div className="header">
          <h1 className="title">STASH</h1>

          <button className="user-pill" style={{ '--user-color': user.color || 'var(--neon-magenta)' }} onClick={() => setSettingsOpen(true)}>
            <span className="user-pill-emoji">{user.emoji || '😎'}</span>
            <span className="user-pill-name">{user.username}</span>
          </button>

          <div className="mascot-box">
            <div className="mascot">{mascot}</div>
            <div className="mascot-label">{mascotLabel}</div>
          </div>

          <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <MoreVertical size={20} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu-dropdown">
                <button className="menu-item" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                  <UserCircle size={14} /> PROFILE
                </button>
                {user.is_admin && (
                  <button className="menu-item" onClick={() => { setMenuOpen(false); setAdminOpen(true); }}>
                    <Users size={14} /> FAMILY
                  </button>
                )}
                <button className="menu-item" onClick={() => { setMenuOpen(false); setPwOpen(true); }}>
                  <KeyRound size={14} /> PASSWORD
                </button>
                <button className="menu-item" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                  <LogOut size={14} /> LOG OUT
                </button>
              </div>
            </>
          )}
        </div>

        <div className={`rush-meter ${rushLevel > 100 ? 'rush-overdrive' : ''} ${rushLevel > 250 ? 'rush-coma' : ''}`}
          style={{ '--rush-intensity': Math.min(rushLevel / 100, 3) }}
        >
          <div className="rush-label">
            <span>◢ RUSH-O-METER</span>
            <span>{Math.round(rushLevel)}%</span>
          </div>
          <div className="rush-bar">
            <div className="rush-fill" style={{ width: `${Math.min(rushLevel, 100)}%` }} />
          </div>
          <div className="rush-sublabel">YOUR CURRENT HIGH</div>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-title">THE STASH IS EMPTY</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>Tap + to add the first item</div>
          </div>
        ) : (
          <div className="grid">
            {items.map(item => {
              const low = item.threshold > 0 && item.count <= item.threshold;
              const itemFloats = floats.filter(f => f.itemId === item.id);
              return (
                <div
                  key={item.id}
                  className={`card ${low ? 'low' : ''}`}
                  style={{ '--card-color': item.color, '--card-glow': item.color + '88' }}
                >
                  <div className="card-glow-bg" />
                  {low && <div className="low-badge">LOW</div>}
                  <div className="item-emoji">{item.emoji || '📦'}</div>
                  <div className="item-name">{item.name}</div>
                  <div>
                    <span className="item-count">{formatCount(item.count)}</span>
                    <span className="item-unit">{item.unit}</span>
                  </div>
                  <div className="item-actions">
                    <button
                      className="btn-take"
                      onClick={() => takeOne(item.id)}
                    >TAKE {formatCount(portionFor(item))}</button>
                    <button
                      className="btn-take btn-take-quarter"
                      onClick={() => takeQuarter(item.id)}
                    >TAKE {formatCount(portionFor(item) / 4)}</button>
                    <button
                      className="btn-edit"
                      onClick={() => { setEditingId(item.id); setShowItemModal(true); }}
                      aria-label="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                  {itemFloats.map(f => (
                    <div
                      key={f.id}
                      className={`float-indicator ${f.delta > 0 ? 'float-pos' : 'float-neg'}`}
                    >
                      {formatDelta(f.delta)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <div className="chart-section">
          <div className="chart-header">
            <div className="chart-title">
              ◢ {chartPeriod === 'year' ? '12-MONTH' : '7-DAY'} RUSH % ◣
            </div>
            <div className="chart-toggle">
              <button
                className={chartPeriod === 'week' ? 'active' : ''}
                onClick={() => setChartPeriod('week')}
              >WEEK</button>
              <button
                className={chartPeriod === 'year' ? 'active' : ''}
                onClick={() => setChartPeriod('year')}
              >YEAR</button>
            </div>
          </div>
          {chartHasData ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <XAxis dataKey="label" stroke="#00f0ff"
                  tick={{ fontSize: chartPeriod === 'year' ? 9 : 10, fontFamily: 'Orbitron', fill: '#00f0ff' }}
                  axisLine={{ stroke: '#ff10f0' }}
                  interval={0}
                />
                <YAxis stroke="#00f0ff"
                  tick={{ fontSize: 10, fontFamily: 'Orbitron', fill: '#00f0ff' }}
                  axisLine={{ stroke: '#ff10f0' }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0d0221',
                    border: '1px solid #ff10f0',
                    borderRadius: 8,
                    fontFamily: 'Orbitron',
                    fontSize: 11
                  }}
                  cursor={{ fill: 'rgba(255, 16, 240, 0.1)' }}
                />
                <Bar dataKey="rush" fill="#ff10f0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">NO {chartPeriod === 'year' ? 'YEAR' : 'WEEK'} DATA YET</div>
          )}
        </div>

      </div>

      <button
        className="fab"
        onClick={() => { setEditingId(null); setShowItemModal(true); }}
        aria-label="Add item"
      >
        <Plus size={28} />
      </button>

      {showItemModal && (
        <ItemModal
          item={editingItem}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={() => { setShowItemModal(false); setEditingId(null); }}
        />
      )}

      {adminOpen && (
        <AdminPanel currentUserId={user.id} isSuperadmin={user.is_superadmin} onClose={() => setAdminOpen(false)} />
      )}

      {settingsOpen && (
        <UserSettingsModal
          user={user}
          onUpdate={setUser}
          onRushReset={() => {
            setUser(prev => ({ ...prev, rush_reset_at: Date.now() }));
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}

      {error && <div className="toast error">{error}</div>}
    </>
  );
}
