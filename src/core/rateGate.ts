/**
 * A small in-memory rate gate for owner-only actions (one operator, one instance at a time is enough).
 * take(now) returns 0 and counts the call when it is allowed, otherwise how many milliseconds to wait.
 */
export function createRateGate(options: { minIntervalMs: number; windowMs: number; maxPerWindow: number }) {
  let stamps: number[] = [];
  return {
    take(now: number): number {
      stamps = stamps.filter(at => now - at < options.windowMs);
      const last = stamps[stamps.length - 1];
      if (last !== undefined && now - last < options.minIntervalMs) return options.minIntervalMs - (now - last);
      if (stamps.length >= options.maxPerWindow) return options.windowMs - (now - stamps[0]);
      stamps.push(now);
      return 0;
    },
  };
}
