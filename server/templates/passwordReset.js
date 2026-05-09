import { wrapTemplate, ctaButton, COLORS } from './layout.js';

export function renderPasswordReset(resetUrl) {
  const bodyHtml = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: ${COLORS.pink};">Password reset</h2>
    <p style="margin: 0 0 8px; font-size: 15px; color: ${COLORS.text};">
      Someone requested a password reset for your account.
    </p>
    ${ctaButton('Reset Password', resetUrl)}
    <p style="margin: 16px 0 0; font-size: 13px; color: ${COLORS.muted}; text-align: center;">
      This link expires in 1 hour.
    </p>
    <p style="margin: 8px 0 0; font-size: 13px; color: ${COLORS.muted}; text-align: center;">
      If you didn't request this, you can safely ignore this email.
    </p>`;

  const bodyText = `Password reset\n\nSomeone requested a password reset for your account.\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, you can safely ignore this email.`;

  const { html, text } = wrapTemplate('Password reset', bodyHtml, bodyText);

  return {
    subject: '[Stash] Password reset',
    html,
    text,
  };
}
