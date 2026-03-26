import { db } from './db';

export const XP_PER_JOB_TIER = [0, 100, 200, 400, 800] as const; // index = tier

export const TIER_THRESHOLDS: Record<number, number> = { 1: 0, 2: 200, 3: 500, 4: 1000 };

export const TIER_NAMES: Record<number, string> = {
  1: 'First Day',
  2: 'Operator',
  3: 'Engineer',
  4: 'Site Boss',
};

export function tierForXp(xp: number): number {
  if (xp >= TIER_THRESHOLDS[4]) return 4;
  if (xp >= TIER_THRESHOLDS[3]) return 3;
  if (xp >= TIER_THRESHOLDS[2]) return 2;
  return 1;
}

export async function getCurrentXp(): Promise<number> {
  const record = await db.settings.get('xp');
  return record ? Number(record.value) : 0;
}

/**
 * Award XP for completing a job. Returns the new XP total and whether a tier
 * change occurred (so the caller can show a toast).
 */
export async function awardJobXp(
  tier: 1 | 2 | 3 | 4,
): Promise<{ newXp: number; oldTier: number; newTier: number }> {
  const oldXp = await getCurrentXp();
  const gained = XP_PER_JOB_TIER[tier] ?? 100;
  const newXp = oldXp + gained;
  await db.settings.put({ key: 'xp', value: String(newXp) });
  return { newXp, oldTier: tierForXp(oldXp), newTier: tierForXp(newXp) };
}
