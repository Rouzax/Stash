import { wrapTemplate, ctaButton, COLORS } from './layout.js';
import { escapeHtml } from './html.js';

const APP_URL = process.env.APP_URL || '';

export function renderLowStockAlert(item) {
  const emoji = escapeHtml(item.emoji);
  const name = escapeHtml(item.name);
  const display = `${emoji} ${name}`.trim();
  const unit = escapeHtml(item.unit) || 'pcs';

  const bodyHtml = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: ${COLORS.pink};">Running low!</h2>
    <p style="margin: 0 0 8px; font-size: 16px; color: ${COLORS.text};">
      <strong style="font-size: 24px;">${display}</strong>
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 16px 0; width: 100%;">
      <tr>
        <td style="padding: 12px 16px; background-color: ${COLORS.bg}; border-radius: 6px;">
          <span style="color: ${COLORS.cyan}; font-size: 28px; font-weight: 700;">${item.count}</span>
          <span style="color: ${COLORS.muted}; font-size: 14px;"> ${unit} left</span>
          <span style="color: ${COLORS.muted}; font-size: 14px; float: right; line-height: 36px;">threshold: ${item.threshold} ${unit}</span>
        </td>
      </tr>
    </table>
    ${APP_URL ? ctaButton('Open Stash', APP_URL) : ''}`;

  const bodyText = `Running low!\n\n${display}\n${item.count} ${unit} left (threshold: ${item.threshold} ${unit})\n\nTime to restock!${APP_URL ? `\n\nOpen Stash: ${APP_URL}` : ''}`;

  const { html, text } = wrapTemplate(`${display} is running low!`, bodyHtml, bodyText);

  return {
    subject: `[Stash] ${display} is running low!`,
    html,
    text,
  };
}
