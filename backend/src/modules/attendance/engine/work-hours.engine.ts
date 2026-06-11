import { DateTime } from 'luxon';

export interface ShiftConfig {
  startTimeMinutes: number; // minutes-of-day, site-local
  endTimeMinutes: number; // minutes-of-day, site-local
  isOvernight: boolean;
  lateGraceMinutes: number;
  earlyGraceMinutes: number;
  otThresholdMinutes: number;
}

export interface WorkHoursResult {
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
}

/** Standard working day when a site has no shift configured: 8 hours. */
export const DEFAULT_WORKDAY_MINUTES = 8 * 60;

/**
 * Compute worked/overtime/late/early-leave for one session.
 * All math is anchored to the site's IANA timezone so DST transitions and
 * overnight shifts (end <= start) are handled correctly. login/logout are
 * absolute instants (UTC); shift bounds are minutes-of-day in site-local time.
 */
export function computeWorkHours(
  loginAt: Date,
  logoutAt: Date,
  timezone: string,
  shift?: ShiftConfig,
): WorkHoursResult {
  const workedMinutes = Math.max(0, Math.round((logoutAt.getTime() - loginAt.getTime()) / 60000));

  if (!shift) {
    // No shift configured: anything beyond the standard 8-hour day counts as OT.
    return {
      workedMinutes,
      overtimeMinutes: Math.max(0, workedMinutes - DEFAULT_WORKDAY_MINUTES),
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
    };
  }

  const loginLocal = DateTime.fromJSDate(loginAt, { zone: timezone });

  // Scheduled shift start anchored to the login's local calendar day.
  const shiftStart = loginLocal.startOf('day').plus({ minutes: shift.startTimeMinutes });
  // For overnight shifts the scheduled end rolls to the next day.
  const shiftEnd = shift.isOvernight
    ? loginLocal.startOf('day').plus({ days: 1, minutes: shift.endTimeMinutes })
    : loginLocal.startOf('day').plus({ minutes: shift.endTimeMinutes });

  const logoutLocal = DateTime.fromJSDate(logoutAt, { zone: timezone });

  const lateRaw = Math.round(loginLocal.diff(shiftStart, 'minutes').minutes);
  const lateMinutes = Math.max(0, lateRaw - shift.lateGraceMinutes);

  const earlyRaw = Math.round(shiftEnd.diff(logoutLocal, 'minutes').minutes);
  const earlyLeaveMinutes = Math.max(0, earlyRaw - shift.earlyGraceMinutes);

  // Overtime = worked beyond scheduled shift length + OT threshold.
  const scheduledMinutes = Math.max(0, Math.round(shiftEnd.diff(shiftStart, 'minutes').minutes));
  const overtimeMinutes = Math.max(0, workedMinutes - scheduledMinutes - shift.otThresholdMinutes);

  return { workedMinutes, overtimeMinutes, lateMinutes, earlyLeaveMinutes };
}
