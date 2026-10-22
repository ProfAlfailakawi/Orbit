import type { PlatformRecord } from './types.ts';

/**
 * A program keeps its own English name and is never translated: the fleet's code name (MIRAS, NAHJ, …),
 * or exactly what the owner typed for a program they added themselves.
 */
export function displayName(p: Pick<PlatformRecord, 'codeName' | 'nameAr' | 'isCustomAdded'>): string {
  if (!p.isCustomAdded) return p.codeName;
  return p.nameAr.replace(/\s*\([^)]*\)\s*$/, '').trim() || p.codeName;
}
