import { wrapTemplate, COLORS } from './layout.js';

export function renderTestEmail() {
  const bodyHtml = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: ${COLORS.cyan};">Connection verified!</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.text};">
      If you can read this, email notifications are working.
    </p>
    <p style="margin: 0; font-size: 14px; color: ${COLORS.muted}; text-align: center;">
      You can enable notification preferences in your profile settings.
    </p>`;

  const bodyText = 'Connection verified!\n\nIf you can read this, email notifications are working.\n\nYou can enable notification preferences in your profile settings.';

  const { html, text } = wrapTemplate('Test email', bodyHtml, bodyText);

  return { subject: '\u{1F9EA} Stash test email', html, text };
}
