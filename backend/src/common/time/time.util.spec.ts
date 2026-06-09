import { businessDate, isOvernight, minutesOfDay, parseTimeOfDay } from './time.util';

describe('time util', () => {
  it('parses HH:mm into a time-of-day', () => {
    const t = parseTimeOfDay('08:30');
    expect(minutesOfDay(t)).toBe(8 * 60 + 30);
  });

  it('rejects invalid time-of-day', () => {
    expect(() => parseTimeOfDay('25:00')).toThrow();
    expect(() => parseTimeOfDay('bad')).toThrow();
  });

  it('detects overnight shifts (end <= start)', () => {
    expect(isOvernight(parseTimeOfDay('22:00'), parseTimeOfDay('06:00'))).toBe(true);
    expect(isOvernight(parseTimeOfDay('08:00'), parseTimeOfDay('17:00'))).toBe(false);
  });

  it('computes the site-local business day', () => {
    // 2026-06-09T20:30:00Z is 2026-06-10 02:00 IST → business date 2026-06-10.
    const d = businessDate(new Date('2026-06-09T20:30:00Z'), 'Asia/Kolkata');
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-10');
  });
});
