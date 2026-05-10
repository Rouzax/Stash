import { wrapTemplate, COLORS } from './layout.js';
import { escapeHtml } from './html.js';

export function renderWeeklyDigest(familyStats) {
  const { logs, lowStockItems } = familyStats;

  const itemTotals = new Map();
  const userTotals = new Map();
  const dayTotals = new Map();

  for (const entry of logs) {
    const abs = Math.abs(entry.delta);
    const key = entry.item_id;
    const prev = itemTotals.get(key);
    if (prev) {
      prev.total += abs;
      const userPrev = prev.users.get(entry.username) || 0;
      prev.users.set(entry.username, userPrev + abs);
    } else {
      itemTotals.set(key, {
        name: entry.item_name || `Item #${key}`,
        emoji: entry.item_emoji || '',
        unit: entry.item_unit || 'pcs',
        total: abs,
        users: new Map([[entry.username, abs]]),
      });
    }

    const userPrev = userTotals.get(entry.username) || 0;
    userTotals.set(entry.username, userPrev + abs);

    const day = new Date(entry.ts).toLocaleDateString('en-US', { weekday: 'long' });
    const dayPrev = dayTotals.get(day) || 0;
    dayTotals.set(day, dayPrev + abs);
  }

  const topItems = [...itemTotals.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  let busiestDay = '';
  let busiestCount = 0;
  for (const [day, total] of dayTotals) {
    if (total > busiestCount) {
      busiestDay = day;
      busiestCount = total;
    }
  }

  let itemsHtml = '';
  if (topItems.length > 0) {
    const rows = topItems.map(it => {
      const topUser = [...it.users.entries()].sort((a, b) => b[1] - a[1])[0];
      return `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text};">${escapeHtml(it.emoji)} ${escapeHtml(it.name)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.cyan}; text-align: right;">${Math.round(it.total * 10) / 10} ${escapeHtml(it.unit)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.muted}; text-align: right;">${topUser ? escapeHtml(topUser[0]) : ''}</td>
      </tr>`;
    }).join('');

    itemsHtml = `
      <h3 style="margin: 24px 0 8px; font-size: 14px; color: ${COLORS.pink}; letter-spacing: 2px;">TOP CONSUMED</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.bg}; border-radius: 6px;">
        <tr>
          <th style="padding: 8px 12px; text-align: left; color: ${COLORS.muted}; font-size: 11px; letter-spacing: 1px;">ITEM</th>
          <th style="padding: 8px 12px; text-align: right; color: ${COLORS.muted}; font-size: 11px; letter-spacing: 1px;">AMOUNT</th>
          <th style="padding: 8px 12px; text-align: right; color: ${COLORS.muted}; font-size: 11px; letter-spacing: 1px;">TOP SNACKER</th>
        </tr>
        ${rows}
      </table>`;
  }

  let lowStockHtml = '';
  if (lowStockItems.length > 0) {
    const items = lowStockItems.map(it =>
      `<li style="padding: 4px 0; color: ${COLORS.text};">${escapeHtml(it.emoji)} ${escapeHtml(it.name)} - <span style="color: ${COLORS.pink};">${it.count} ${escapeHtml(it.unit) || 'pcs'}</span></li>`
    ).join('');
    lowStockHtml = `
      <h3 style="margin: 24px 0 8px; font-size: 14px; color: ${COLORS.pink}; letter-spacing: 2px;">NEEDS RESTOCKING</h3>
      <ul style="margin: 0; padding: 0 0 0 20px;">${items}</ul>`;
  }

  const funStatHtml = busiestDay
    ? `<p style="margin: 24px 0 0; padding: 12px 16px; background-color: ${COLORS.bg}; border-radius: 6px; color: ${COLORS.cyan}; text-align: center; font-size: 14px;">Peak snack day: <strong>${busiestDay}</strong></p>`
    : '';

  const bodyHtml = `
    <h2 style="margin: 0 0 8px; font-size: 20px; color: ${COLORS.pink};">Weekly Snack Report</h2>
    <p style="margin: 0 0 16px; font-size: 14px; color: ${COLORS.muted};">Here's what happened this week</p>
    ${itemsHtml}
    ${lowStockHtml}
    ${funStatHtml}`;

  let bodyText = 'Weekly Snack Report\n\n';
  if (topItems.length > 0) {
    bodyText += 'TOP CONSUMED:\n';
    for (const it of topItems) {
      const topUser = [...it.users.entries()].sort((a, b) => b[1] - a[1])[0];
      bodyText += `  ${it.emoji} ${it.name}: ${Math.round(it.total * 10) / 10} ${it.unit} (top: ${topUser ? topUser[0] : 'n/a'})\n`;
    }
  }
  if (lowStockItems.length > 0) {
    bodyText += '\nNEEDS RESTOCKING:\n';
    for (const it of lowStockItems) {
      bodyText += `  ${it.emoji || ''} ${it.name}: ${it.count} ${it.unit || 'pcs'}\n`;
    }
  }
  if (busiestDay) {
    bodyText += `\nPeak snack day: ${busiestDay}`;
  }

  const { html, text } = wrapTemplate('Weekly Snack Report', bodyHtml, bodyText);

  return {
    subject: '[Stash] Your weekly snack report',
    html,
    text,
  };
}
