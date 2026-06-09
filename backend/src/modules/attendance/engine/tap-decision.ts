import { TapType } from '@prisma/client';

export interface OpenSessionInfo {
  id: string;
  loginAt: Date;
  siteId: string;
}

export interface LastTapInfo {
  clientEventTime: Date;
  tapType: TapType | null;
}

export type TapDecision =
  | { action: 'LOGIN' }
  | { action: 'LOGOUT'; sessionId: string }
  | { action: 'DUPLICATE'; cooldownRemainingSeconds: number };

/**
 * Pure decision function: given the worker's current open session (if any),
 * their last tap, and the site cooldown, decide whether this tap is a LOGIN,
 * a LOGOUT, or a DUPLICATE to ignore.
 *
 * Rules (docs/06-edge-cases.md #1, #4):
 *  - If the tap falls within the cooldown window of the last tap → DUPLICATE.
 *  - Else if an open session exists → LOGOUT (closes it).
 *  - Else → LOGIN.
 */
export function decideTap(
  tapTime: Date,
  cooldownSeconds: number,
  openSession: OpenSessionInfo | null,
  lastTap: LastTapInfo | null,
): TapDecision {
  if (lastTap) {
    const elapsedMs = tapTime.getTime() - lastTap.clientEventTime.getTime();
    const cooldownMs = cooldownSeconds * 1000;
    if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
      return {
        action: 'DUPLICATE',
        cooldownRemainingSeconds: Math.ceil((cooldownMs - elapsedMs) / 1000),
      };
    }
  }

  if (openSession) {
    return { action: 'LOGOUT', sessionId: openSession.id };
  }
  return { action: 'LOGIN' };
}

/** Haversine distance in metres between two lat/lng points. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Decide whether photo verification should trigger for this tap.
 * `roll` is a 0-100 value (caller supplies randomness) so this stays pure.
 */
export function shouldVerifyPhoto(
  mode: 'ALWAYS' | 'NEVER' | 'RANDOM',
  randomPct: number,
  roll: number,
): boolean {
  if (mode === 'ALWAYS') return true;
  if (mode === 'NEVER') return false;
  return roll < randomPct;
}
