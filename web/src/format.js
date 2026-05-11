const exactFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit'
});

export const formatTimeAgo = (ts, exact) => {
  if (!ts) return 'never';
  if (exact) return exactFormatter.format(new Date(ts));
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
};

export const formatDelta = (delta, unit) => {
  const abs = Math.abs(delta);
  const formatted = Number.isInteger(abs) ? String(abs) : parseFloat(abs.toFixed(4)).toString();
  if (delta < 0) return `consumed ${formatted} ${unit}`;
  return `restocked +${formatted} ${unit}`;
};
