import { computeWorkHours, ShiftConfig } from './work-hours.engine';

const dayShift: ShiftConfig = {
  startTimeMinutes: 8 * 60, // 08:00
  endTimeMinutes: 17 * 60, // 17:00
  isOvernight: false,
  lateGraceMinutes: 10,
  earlyGraceMinutes: 10,
  otThresholdMinutes: 0,
};

const nightShift: ShiftConfig = {
  startTimeMinutes: 22 * 60, // 22:00
  endTimeMinutes: 6 * 60, // 06:00 next day
  isOvernight: true,
  lateGraceMinutes: 0,
  earlyGraceMinutes: 0,
  otThresholdMinutes: 0,
};

const TZ = 'Asia/Kolkata';

describe('computeWorkHours', () => {
  it('computes a clean 9h day shift', () => {
    const r = computeWorkHours(
      new Date('2026-06-09T02:30:00Z'), // 08:00 IST
      new Date('2026-06-09T11:30:00Z'), // 17:00 IST
      TZ,
      dayShift,
    );
    expect(r.workedMinutes).toBe(540);
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyLeaveMinutes).toBe(0);
    expect(r.overtimeMinutes).toBe(0);
  });

  it('applies late grace (within grace → not late)', () => {
    const r = computeWorkHours(
      new Date('2026-06-09T02:38:00Z'), // 08:08 IST, 8 min late, grace 10
      new Date('2026-06-09T11:30:00Z'),
      TZ,
      dayShift,
    );
    expect(r.lateMinutes).toBe(0);
  });

  it('flags late beyond grace', () => {
    const r = computeWorkHours(
      new Date('2026-06-09T03:00:00Z'), // 08:30 IST, 30 late, grace 10 → 20
      new Date('2026-06-09T11:30:00Z'),
      TZ,
      dayShift,
    );
    expect(r.lateMinutes).toBe(20);
  });

  it('flags early departure beyond grace', () => {
    const r = computeWorkHours(
      new Date('2026-06-09T02:30:00Z'),
      new Date('2026-06-09T11:00:00Z'), // 16:30 IST, 30 early, grace 10 → 20
      TZ,
      dayShift,
    );
    expect(r.earlyLeaveMinutes).toBe(20);
  });

  it('computes overtime beyond scheduled length', () => {
    const r = computeWorkHours(
      new Date('2026-06-09T02:30:00Z'), // 08:00
      new Date('2026-06-09T13:30:00Z'), // 19:00 → 11h worked, 9h scheduled
      TZ,
      dayShift,
    );
    expect(r.workedMinutes).toBe(660);
    expect(r.overtimeMinutes).toBe(120);
  });

  it('handles an overnight shift crossing midnight', () => {
    // 22:00 IST = 16:30Z; 06:00 IST next day = 00:30Z next day → 8h.
    const r = computeWorkHours(
      new Date('2026-06-09T16:30:00Z'),
      new Date('2026-06-10T00:30:00Z'),
      TZ,
      nightShift,
    );
    expect(r.workedMinutes).toBe(480);
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyLeaveMinutes).toBe(0);
    expect(r.overtimeMinutes).toBe(0);
  });

  it('returns plain worked minutes when no shift is configured', () => {
    const r = computeWorkHours(
      new Date('2026-06-09T02:30:00Z'),
      new Date('2026-06-09T06:30:00Z'),
      TZ,
    );
    expect(r.workedMinutes).toBe(240);
    expect(r.overtimeMinutes).toBe(0);
  });
});
