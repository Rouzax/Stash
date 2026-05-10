import { useState, useEffect } from 'react';
import { auth, admin } from '../api.js';
import { items as itemsApi } from '../api.js';

const formatTimeAgo = (ts) => {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
};

const formatDelta = (delta, unit) => {
  const abs = Math.abs(delta);
  const formatted = Number.isInteger(abs) ? String(abs) : parseFloat(abs.toFixed(4)).toString();
  if (delta < 0) {
    return `consumed ${formatted} ${unit}`;
  }
  return `restocked +${formatted} ${unit}`;
};

export default function ActivityTab() {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [filterUser, setFilterUser] = useState('');
  const [filterItem, setFilterItem] = useState('');

  const fetchActivity = async (before, append = false) => {
    try {
      const params = { limit: 50 };
      if (before) params.before = before;
      if (filterUser) params.user_id = filterUser;
      if (filterItem) params.item_id = filterItem;
      const data = await admin.familyActivity(params);
      if (append) {
        setEntries(prev => [...prev, ...data.entries]);
      } else {
        setEntries(data.entries);
      }
      setHasMore(data.has_more);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [u, it] = await Promise.all([auth.listUsers(), itemsApi.list()]);
        setUsers(u);
        setAllItems(it);
      } catch (e) {
        setError(e.message);
      }
      await fetchActivity();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchActivity();
    }
  }, [filterUser, filterItem]);

  const loadMore = async () => {
    if (!entries.length) return;
    setLoadingMore(true);
    await fetchActivity(entries[entries.length - 1].ts, true);
    setLoadingMore(false);
  };

  if (loading) {
    return <div className="admin-placeholder">LOADING...</div>;
  }

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="activity-filters">
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="activity-filter"
        >
          <option value="">All members</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.emoji || '\u{1F464}'} {u.username}</option>
          ))}
        </select>
        <select
          value={filterItem}
          onChange={e => setFilterItem(e.target.value)}
          className="activity-filter"
        >
          <option value="">All items</option>
          {allItems.map(item => (
            <option key={item.id} value={item.id}>{item.emoji || '\u{1F4E6}'} {item.name}</option>
          ))}
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="admin-placeholder">NO ACTIVITY YET</div>
      ) : (
        <div className="activity-feed">
          {entries.map(entry => (
            <div key={entry.id} className={`activity-entry ${entry.delta < 0 ? 'consumption' : 'restock'}`}>
              <div className="activity-time">{formatTimeAgo(entry.ts)}</div>
              <div className="activity-user">
                <span className="activity-emoji">{entry.user_emoji || '\u{1F464}'}</span>
                <span>{entry.username}</span>
              </div>
              <div className="activity-action">
                {entry.item_emoji || '\u{1F4E6}'} {formatDelta(entry.delta, entry.item_unit)} of {entry.item_name}{entry.item_deleted_at ? ' (removed)' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          className="btn-secondary"
          onClick={loadMore}
          disabled={loadingMore}
          style={{ width: '100%', marginTop: 16 }}
        >
          {loadingMore ? 'LOADING...' : 'LOAD MORE'}
        </button>
      )}
    </div>
  );
}
