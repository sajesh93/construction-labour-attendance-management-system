import { isCardExpired } from './card-validity';

const IST = 'Asia/Kolkata';

/** Prisma reads a @db.Date column back as midnight UTC. */
const validityDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('isCardExpired', () => {
  it('never expires a card with no validity date', () => {
    expect(isCardExpired(null, new Date('2030-01-01T04:00:00Z'), IST)).toBe(false);
    expect(isCardExpired(undefined, new Date('2030-01-01T04:00:00Z'), IST)).toBe(false);
  });

  it('is valid on the validity date itself', () => {
    // 09-Jul-2026 14:30 IST — the card runs out at the end of this day.
    expect(isCardExpired(validityDate('2026-07-09'), new Date('2026-07-09T09:00:00Z'), IST)).toBe(
      false,
    );
  });

  it('is valid right up to the last minute of that local day', () => {
    // 23:59 IST on the 9th is 18:29Z on the 9th.
    expect(isCardExpired(validityDate('2026-07-09'), new Date('2026-07-09T18:29:00Z'), IST)).toBe(
      false,
    );
  });

  it('expires from the next local day', () => {
    // 00:05 IST on the 10th is 18:35Z on the 9th — still expired, because the
    // business day has rolled over locally even though UTC has not.
    expect(isCardExpired(validityDate('2026-07-09'), new Date('2026-07-09T18:35:00Z'), IST)).toBe(
      true,
    );
  });

  it('expires a long-lapsed card', () => {
    expect(isCardExpired(validityDate('2025-01-31'), new Date('2026-07-09T09:00:00Z'), IST)).toBe(
      true,
    );
  });

  it('is not yet expired for a future validity date', () => {
    expect(isCardExpired(validityDate('2027-01-01'), new Date('2026-07-09T09:00:00Z'), IST)).toBe(
      false,
    );
  });

  it('judges the tap against the site timezone, not UTC', () => {
    const tap = new Date('2026-07-09T23:30:00Z'); // 05:00 IST on the 10th
    expect(isCardExpired(validityDate('2026-07-09'), tap, IST)).toBe(true);
    expect(isCardExpired(validityDate('2026-07-09'), tap, 'UTC')).toBe(false);
  });
});
