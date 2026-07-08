// Backend base URL used server-side (inside Docker network) and public (browser).
export const API_INTERNAL_BASE_URL =
  process.env.API_INTERNAL_BASE_URL ?? 'http://localhost:3000/api/v1';

export const COOKIE_ACCESS = 'clams_at';
export const COOKIE_REFRESH = 'clams_rt';
// Browser device identity (device-approval flow): a stable per-browser UID,
// the server-issued device row id, and the device token. These outlive login
// sessions so an approved browser stays approved.
export const COOKIE_DEVICE_UID = 'clams_did';
export const COOKIE_DEVICE_ID = 'clams_dev';
export const COOKIE_DEVICE_TOKEN = 'clams_dt';

export const ACCESS_MAX_AGE = 60 * 15; // 15 min
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
