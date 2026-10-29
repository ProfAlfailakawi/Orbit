/**
 * Durable saves of the whole workspace state (one Firestore document).
 *
 * Every change used to queue its own full write. A burst therefore queued one full write per change: each anonymous
 * /api/public-sensor beacon, each audit line of a GitHub sync. That cost money, held old snapshots in memory, and went past
 * Firestore's sustained rate of about one write per second for a single document.
 *
 * Here at most one write waits behind the one in flight. It reads the state when it starts, so it carries every change made
 * before it, and the promise returned by `schedule()` resolves only after a write that includes the caller's change.
 * Writes start at least `minIntervalMs` apart.
 */
export function createCoalescedWriter(options: {
  write: () => Promise<void>;
  onResult: (ok: boolean, error?: unknown) => void;
  minIntervalMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const gap = options.minIntervalMs ?? 0;
  let tail: Promise<void> = Promise.resolve();
  let waiting = false;
  let lastStart = -Infinity;

  function schedule(): Promise<void> {
    if (waiting) return tail; // the queued write has not started yet: it will read this change too
    waiting = true;
    tail = tail.then(async () => {
      const delay = lastStart + gap - now();
      if (delay > 0) await wait(delay);
      waiting = false; // from here on, a new change needs a new write
      lastStart = now();
      try {
        await options.write();
        options.onResult(true);
      } catch (error) {
        options.onResult(false, error);
      }
    });
    return tail;
  }

  return { schedule, idle: () => tail };
}
