// Backend base URL used server-side (inside Docker network) and public (browser).
export const API_INTERNAL_BASE_URL =
  process.env.API_INTERNAL_BASE_URL ?? 'http://localhost:3000/api/v1';

export const COOKIE_ACCESS = 'clams_at';
export const COOKIE_REFRESH = 'clams_rt';

export const ACCESS_MAX_AGE = 60 * 15; // 15 min
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
