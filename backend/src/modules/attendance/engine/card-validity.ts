import { businessDate } from '../../../common/time/time.util';

/**
 * True when the worker's ID card has passed its validity date at the moment of
 * the tap.
 *
 * The card is valid *through* `validityTill` — a card stamped 09-Jul-2026 still
 * works all day on the 9th and stops on the 10th. Both sides are reduced to the
 * site's business date before comparing, so a late-evening tap is judged
 * against the local calendar day rather than UTC's.
 *
 * A worker with no validity date has an open-ended card and never expires.
 */
export function isCardExpired(
  validityTill: Date | null | undefined,
  tapTime: Date,
  timezone: string,
): boolean {
  if (!validityTill) return false;
  const tapDay = businessDate(tapTime, timezone);
  const lastValidDay = businessDate(validityTill, 'UTC');
  return tapDay.getTime() > lastValidDay.getTime();
}
