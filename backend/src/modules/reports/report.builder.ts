/** Pure CSV helpers used by the reports service (kept dependency-free & testable). */

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\n');
}

export function minutesToHours(mins: number | null | undefined): string {
  if (!mins) return '0.00';
  return (mins / 60).toFixed(2);
}

/** Statutory ceiling on a single day's working hours, in minutes. */
export const COMPLIANCE_CAP_MINUTES = 9 * 60;

export interface CappedSession {
  workedMinutes: number | null;
  overtimeMinutes: number | null;
  logoutAt: Date | null;
  /** True when this session was longer than the cap and has been trimmed. */
  capped: boolean;
}

/**
 * Trim a day that ran past the statutory ceiling — the usual cause being a
 * worker who forgot to tap out, leaving the session open far beyond their
 * shift. The client's compliance report must not show anyone above the cap.
 *
 * Overtime is trimmed before regular hours: a capped day keeps every regular
 * minute it had, and only the overtime above the ceiling disappears. The
 * logout stamp is pulled back to login + cap so the row stays internally
 * consistent — a reader cannot derive 11 hours from the timestamps while the
 * hours column claims 9.
 *
 * Sessions at or under the cap are returned untouched, so this is safe to run
 * over every row.
 */
export function capSessionHours(
  session: {
    workedMinutes: number | null;
    overtimeMinutes: number | null;
    loginAt: Date | null;
    logoutAt: Date | null;
  },
  capMinutes: number = COMPLIANCE_CAP_MINUTES,
): CappedSession {
  const worked = session.workedMinutes;
  if (worked === null || worked <= capMinutes) {
    return {
      workedMinutes: worked,
      overtimeMinutes: session.overtimeMinutes,
      logoutAt: session.logoutAt,
      capped: false,
    };
  }

  const overtime = session.overtimeMinutes ?? 0;
  const regular = Math.max(0, worked - overtime);
  return {
    workedMinutes: capMinutes,
    // Whatever the cap leaves once regular hours are paid; never negative.
    overtimeMinutes: Math.max(0, capMinutes - regular),
    logoutAt: session.loginAt ? new Date(session.loginAt.getTime() + capMinutes * 60_000) : session.logoutAt,
    capped: true,
  };
}
