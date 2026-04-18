import './env.js';

function parseBoundedInt(name, fallback, min, max) {
  const rawValue = process.env[name];
  const parsed = Number.parseInt(rawValue ?? '', 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export const PRICE_REFRESH_INTERVAL_SEC = parseBoundedInt('PRICE_REFRESH_INTERVAL_SEC', 60, 10, 3600);
export const ADMIN_SESSION_RATE_LIMIT_MAX = parseBoundedInt('ADMIN_SESSION_RATE_LIMIT_MAX', 10, 1, 100);
export const ADMIN_SESSION_RATE_LIMIT_WINDOW_MS = parseBoundedInt('ADMIN_SESSION_RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000);
export const MANUAL_REFRESH_RATE_LIMIT_MAX = parseBoundedInt('MANUAL_REFRESH_RATE_LIMIT_MAX', 6, 1, 100);
export const MANUAL_REFRESH_RATE_LIMIT_WINDOW_MS = parseBoundedInt('MANUAL_REFRESH_RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000);

export function normalizeSettings(settings = {}) {
  return {
    ...settings,
    refreshIntervalSec: PRICE_REFRESH_INTERVAL_SEC,
  };
}
