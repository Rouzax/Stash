const APP_URL = process.env.APP_URL || '';

const COLORS = {
  bg: '#1a1a2e',
  card: '#16213e',
  border: '#0f3460',
  pink: '#e94560',
  cyan: '#00d2d3',
  text: '#e0e0e0',
  muted: '#8888aa',
};

const fontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function wrapTemplate(title, bodyHtml, bodyText) {
  const prefsUrl = APP_URL ? `${APP_URL}` : '';
  const prefsLink = prefsUrl
    ? `<a href="${prefsUrl}" style="color: ${COLORS.cyan}; text-decoration: underline;">Manage preferences</a>`
    : '';
  const prefsText = prefsUrl ? `Manage preferences: ${prefsUrl}` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.bg}; font-family: ${fontStack}; color: ${COLORS.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.bg};">
    <tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 8px;">
        <!-- Header -->
        <tr><td style="padding: 32px 32px 16px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: ${COLORS.pink}; text-shadow: 0 0 20px ${COLORS.pink}88, 0 0 40px ${COLORS.pink}44;">STASH</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding: 16px 32px 32px;">
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding: 16px 32px 24px; text-align: center; border-top: 1px solid ${COLORS.border};">
          <p style="margin: 0; font-size: 12px; color: ${COLORS.muted};">
            Sent by Stash${prefsLink ? ` &middot; ${prefsLink}` : ''}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `STASH\n${'='.repeat(40)}\n\n${bodyText}\n\n---\nSent by Stash${prefsText ? ` | ${prefsText}` : ''}`;

  return { html, text };
}

export function ctaButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
    <tr><td style="background-color: ${COLORS.pink}; border-radius: 6px; text-align: center;">
      <a href="${url}" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; letter-spacing: 1px;">${label}</a>
    </td></tr>
  </table>`;
}

export { COLORS };
