import { capSessionHours, COMPLIANCE_CAP_MINUTES, minutesToHours, toCsv } from './report.builder';

describe('report.builder', () => {
  it('builds CSV with header and rows', () => {
    const csv = toCsv(
      ['A', 'B'],
      [
        [1, 'x'],
        [2, 'y'],
      ],
    );
    expect(csv).toBe('A,B\n1,x\n2,y');
  });

  it('escapes values containing commas, quotes, and newlines', () => {
    const csv = toCsv(['Name'], [['Doe, John'], ['say "hi"'], ['line\nbreak']]);
    expect(csv).toBe('Name\n"Doe, John"\n"say ""hi"""\n"line\nbreak"');
  });

  it('converts minutes to hours with 2 decimals', () => {
    expect(minutesToHours(90)).toBe('1.50');
    expect(minutesToHours(0)).toBe('0.00');
    expect(minutesToHours(null)).toBe('0.00');
  });
});

describe('capSessionHours', () => {
  const login = new Date('2026-07-09T02:30:00.000Z');
  const session = (workedMinutes: number | null, overtimeMinutes: number | null, hours = 0) => ({
    workedMinutes,
    overtimeMinutes,
    loginAt: login,
    logoutAt: hours ? new Date(login.getTime() + hours * 3_600_000) : null,
  });

  it('leaves a normal 8-hour day untouched', () => {
    const r = capSessionHours(session(480, 0, 8));
    expect(r.capped).toBe(false);
    expect(r.workedMinutes).toBe(480);
    expect(r.logoutAt).toEqual(new Date('2026-07-09T10:30:00.000Z'));
  });

  it('leaves a day exactly at the cap untouched', () => {
    const r = capSessionHours(session(COMPLIANCE_CAP_MINUTES, 60, 9));
    expect(r.capped).toBe(false);
    expect(r.workedMinutes).toBe(COMPLIANCE_CAP_MINUTES);
    expect(r.overtimeMinutes).toBe(60);
  });

  it('trims a forgotten logout down to 9 hours', () => {
    // Tapped in at 08:00 local, never tapped out — 14 hours on the clock.
    const r = capSessionHours(session(840, 360, 14));
    expect(r.capped).toBe(true);
    expect(r.workedMinutes).toBe(540);
    expect(minutesToHours(r.workedMinutes)).toBe('9.00');
  });

  it('pulls the logout stamp back so it agrees with the capped hours', () => {
    const r = capSessionHours(session(840, 360, 14));
    // login 02:30Z + 9h
    expect(r.logoutAt).toEqual(new Date('2026-07-09T11:30:00.000Z'));
  });

  it('trims overtime first, keeping every regular minute', () => {
    // 8h regular + 3h overtime = 11h worked → cap leaves 8h regular + 1h OT.
    const r = capSessionHours(session(660, 180));
    expect(r.workedMinutes).toBe(540);
    expect(r.overtimeMinutes).toBe(60);
  });

  it('never reports negative overtime when regular hours alone exceed the cap', () => {
    // 10h worked, none of it booked as overtime.
    const r = capSessionHours(session(600, 0));
    expect(r.workedMinutes).toBe(540);
    expect(r.overtimeMinutes).toBe(0);
  });

  it('passes through a session that has no worked minutes yet (still open)', () => {
    const r = capSessionHours(session(null, null));
    expect(r.capped).toBe(false);
    expect(r.workedMinutes).toBeNull();
    expect(r.logoutAt).toBeNull();
  });

  it('keeps a null logout null when there is no login to offset from', () => {
    const r = capSessionHours({
      workedMinutes: 700,
      overtimeMinutes: 0,
      loginAt: null,
      logoutAt: null,
    });
    expect(r.capped).toBe(true);
    expect(r.logoutAt).toBeNull();
  });

  it('honours a custom cap', () => {
    const r = capSessionHours(session(600, 0), 8 * 60);
    expect(r.workedMinutes).toBe(480);
  });
});
