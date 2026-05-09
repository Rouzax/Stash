import { wrapTemplate, COLORS } from './layout.js';

export function renderRushWarning(meterLevel) {
  const pct = Math.min(Math.round(meterLevel), 100);
  const barWidth = Math.max(pct, 5);

  const bodyHtml = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: ${COLORS.pink};">Rush meter alert!</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.text};">
      Your sugar rush is at <strong style="color: ${COLORS.pink};">${pct}%</strong>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
      <tr>
        <td style="padding: 4px; background-color: ${COLORS.bg}; border-radius: 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width: ${barWidth}%; min-width: 20px;">
            <tr>
              <td style="height: 24px; background: linear-gradient(90deg, ${COLORS.cyan}, ${COLORS.pink}); border-radius: 6px;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin: 16px 0 0; font-size: 14px; color: ${COLORS.muted}; text-align: center;">
      Maybe ease up on the snacks for a bit
    </p>`;

  const bodyText = `Rush meter alert!\n\nYour sugar rush is at ${pct}%\n[${'#'.repeat(Math.round(barWidth / 5))}${'.'.repeat(20 - Math.round(barWidth / 5))}]\n\nMaybe ease up on the snacks for a bit`;

  const { html, text } = wrapTemplate('Rush meter alert', bodyHtml, bodyText);

  return {
    subject: `[Stash] Your rush meter is at ${pct}%!`,
    html,
    text,
  };
}
