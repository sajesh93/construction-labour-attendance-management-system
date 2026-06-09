import { DateTime } from 'luxon';

/** Parse "HH:mm" into a UTC Date carrying only the time-of-day (1970-01-01). */
export function parseTimeOfDay(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time-of-day: ${hhmm}`);
  }
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

/** Minutes-of-day for a stored Time value. */
export function minutesOfDay(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

/** Site-local business day (YYYY-MM-DD) for an instant in a given IANA tz. */
export function businessDate(instant: Date, timezone: string): Date {
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  return new Date(Date.UTC(local.year, local.month - 1, local.day));
}

/** True when a shift's end time precedes its start (crosses midnight). */
export function isOvernight(startTime: Date, endTime: Date): boolean {
  return minutesOfDay(endTime) <= minutesOfDay(startTime);
}
