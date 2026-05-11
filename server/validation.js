// Shared input validators. All return either a normalized value or null/fallback.

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const UNIT_VALUES = new Set(['pcs', 'mg', 'g', 'ml']);

const LIMITS = {
  username: 64,
  password: 256,       // sane upper bound; argon2 itself hashes long inputs fine
  familyName: 64,
  itemName: 64,
  emoji: 32,           // generous: ZWJ-joined emoji can be many code units
};

const VALID_DECAY_MINUTES = [30, 60, 120, 240, 360, 480];

// Returns trimmed string, or null if invalid (empty, non-string, too long).
export function nonEmptyString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) return null;
  return trimmed;
}

// Returns trimmed string or fallback for optional fields.
export function optionalString(value, maxLen, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const s = trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  return s;
}

// Returns a valid #rrggbb hex color, or fallback if invalid.
export function hexColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  if (!HEX_COLOR_RE.test(value)) return fallback;
  return value;
}

// Returns a whitelisted unit, or fallback.
export function unitValue(value, fallback = 'pcs') {
  if (typeof value !== 'string') return fallback;
  if (!UNIT_VALUES.has(value)) return fallback;
  return value;
}

// Returns a non-negative finite number, or fallback.
export function nonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

export function rushFactor(value, fallback = 1.0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(0.1, Math.round(n * 10) / 10));
}

export function decayMinutes(value, fallback = 240) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let closest = VALID_DECAY_MINUTES[0];
  for (const v of VALID_DECAY_MINUTES) {
    if (Math.abs(v - n) < Math.abs(closest - n)) closest = v;
  }
  return closest;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_ONSET_MINUTES = [0, 15, 30, 60];

const INVITE_CODE_RE = /^[A-Z0-9]{4,8}$/;

export function onsetMinutes(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let closest = VALID_ONSET_MINUTES[0];
  for (const v of VALID_ONSET_MINUTES) {
    if (Math.abs(v - n) < Math.abs(closest - n)) closest = v;
  }
  return closest;
}

export function emailAddress(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.length > 254) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

export function inviteCode(value) {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (!INVITE_CODE_RE.test(upper)) return null;
  return upper;
}

export function validId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function giveRecipient(value) {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > LIMITS.itemName) return null;
  return trimmed;
}

export { LIMITS };
