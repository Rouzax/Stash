import { wrapTemplate, COLORS } from './layout.js';
import { escapeHtml } from './html.js';

export function renderWeeklyDigest(familyStats) {
  const { logs, lowStockItems } = familyStats;

  const itemTotals = new Map();
  const userTotals = new Map();
  const dayTotals = new Map();
  const giveTotals = new Map();

  for (const entry of logs) {
    const abs = Math.abs(entry.delta);

    if (entry.is_give) {
      const key = entry.item_id;
      const prev = giveTotals.get(key);
      const recipient = entry.give_recipient || 'someone';
      if (prev) {
        prev.total += abs;
        prev.recipients.set(recipient, (prev.recipients.get(recipient) || 0) + abs);
      } else {
        giveTotals.set(key, {
          name: entry.item_name || `Item #${key}`,
          emoji: entry.item_emoji || '',
          unit: entry.item_unit || 'pcs',
          total: abs,
          recipients: new Map([[recipient, abs]]),
        });
      }
      continue;
    }

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
      const sortedUsers = [...it.users.entries()].sort((a, b) => b[1] - a[1]);
      const userRows = sortedUsers.map(([name, amount]) =>
        `<tr>
          <td style="padding: 4px 12px 4px 28px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.muted}; font-size: 13px;">${escapeHtml(name)}</td>
          <td style="padding: 4px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.muted}; font-size: 13px; text-align: right;">${Math.round(amount * 10) / 10} ${escapeHtml(it.unit)}</td>
        </tr>`
      ).join('');
      return `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text};">${escapeHtml(it.emoji)} ${escapeHtml(it.name)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.cyan}; text-align: right;">${Math.round(it.total * 10) / 10} ${escapeHtml(it.unit)}</td>
      </tr>${userRows}`;
    }).join('');

    itemsHtml = `
      <h3 style="margin: 24px 0 8px; font-size: 14px; color: ${COLORS.pink}; letter-spacing: 2px;">TOP CONSUMED</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.bg}; border-radius: 6px;">
        <tr>
          <th style="padding: 8px 12px; text-align: left; color: ${COLORS.muted}; font-size: 11px; letter-spacing: 1px;">ITEM</th>
          <th style="padding: 8px 12px; text-align: right; color: ${COLORS.muted}; font-size: 11px; letter-spacing: 1px;">AMOUNT</th>
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

  const giveItems = [...giveTotals.values()].sort((a, b) => b.total - a.total);
  let sharedHtml = '';
  if (giveItems.length > 0) {
    const rows = giveItems.map(it => {
      const recipientList = [...it.recipients.entries()]
        .map(([name, amount]) => `${escapeHtml(name)}: ${Math.round(amount * 10) / 10} ${escapeHtml(it.unit)}`)
        .join(', ');
      return `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text};">${escapeHtml(it.emoji)} ${escapeHtml(it.name)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.muted}; text-align: right;">${recipientList}</td>
      </tr>`;
    }).join('');
    sharedHtml = `
      <h3 style="margin: 24px 0 8px; font-size: 14px; color: ${COLORS.pink}; letter-spacing: 2px;">SHARED</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.bg}; border-radius: 6px;">
        <tr>
          <th style="padding: 8px 12px; text-align: left; color: ${COLORS.muted}; font-size: 11px; letter-spacing: 1px;">ITEM</th>
          <th style="padding: 8px 12px; text-align: right; color: ${COLORS.muted}; font-size: 11px; letter-spacing: 1px;">GIVEN TO</th>
        </tr>
        ${rows}
      </table>`;
  }

  const funStatHtml = busiestDay
    ? `<p style="margin: 24px 0 0; padding: 12px 16px; background-color: ${COLORS.bg}; border-radius: 6px; color: ${COLORS.cyan}; text-align: center; font-size: 14px;">Peak snack day: <strong>${busiestDay}</strong></p>`
    : '';

  const bodyHtml = `
    <h2 style="margin: 0 0 8px; font-size: 20px; color: ${COLORS.pink};">Weekly Snack Report</h2>
    <p style="margin: 0 0 16px; font-size: 14px; color: ${COLORS.muted};">Here's what happened this week</p>
    ${itemsHtml}
    ${sharedHtml}
    ${lowStockHtml}
    ${funStatHtml}`;

  let bodyText = 'Weekly Snack Report\n\n';
  if (topItems.length > 0) {
    bodyText += 'TOP CONSUMED:\n';
    for (const it of topItems) {
      bodyText += `  ${it.emoji} ${it.name}: ${Math.round(it.total * 10) / 10} ${it.unit}\n`;
      const sortedUsers = [...it.users.entries()].sort((a, b) => b[1] - a[1]);
      for (const [name, amount] of sortedUsers) {
        bodyText += `    ${name}: ${Math.round(amount * 10) / 10} ${it.unit}\n`;
      }
    }
  }
  if (giveItems.length > 0) {
    bodyText += '\nSHARED:\n';
    for (const it of giveItems) {
      const recipientList = [...it.recipients.entries()]
        .map(([name, amount]) => `${name}: ${Math.round(amount * 10) / 10} ${it.unit}`)
        .join(', ');
      bodyText += `  ${it.emoji} ${it.name}: ${recipientList}\n`;
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
