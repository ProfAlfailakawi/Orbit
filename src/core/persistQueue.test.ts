import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoalescedWriter } from './persistQueue.ts';

/** A fake store: each write records the state it read when it started, and finishes when the test releases it. */
function harness(minIntervalMs = 0) {
  let state = 0;
  const written: number[] = [];
  const results: boolean[] = [];
  const releases: Array<(ok: boolean) => void> = [];
  let clock = 0;
  const waits: number[] = [];
  const writer = createCoalescedWriter({
    write: () => {
      written.push(state); // the snapshot is taken when the write starts
      return new Promise<void>((resolve, reject) => releases.push(ok => (ok ? resolve() : reject(new Error('store down')))));
    },
    onResult: ok => { results.push(ok); },
    minIntervalMs,
    now: () => clock,
    wait: async ms => { waits.push(ms); clock += ms; },
  });
  const change = () => { state += 1; return writer.schedule(); };
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  return { writer, change, written, results, releases, settle, waits, get state() { return state; }, tick: (ms: number) => { clock += ms; } };
}

test('a burst of changes while a save is in flight costs one more save, and that save carries the latest state', async () => {
  const h = harness();
  h.change();
  await h.settle();
  assert.equal(h.written.length, 1, 'the first change starts a save at once');
  for (let i = 0; i < 50; i += 1) h.change(); // fifty anonymous beacons arrive meanwhile
  h.releases[0](true);
  await h.settle();
  assert.equal(h.written.length, 2, 'fifty changes are folded into one queued save, not fifty');
  assert.equal(h.written[1], h.state, 'the queued save read the newest state when it started');
  h.releases[1](true);
  await h.writer.idle();
  assert.deepEqual(h.results, [true, true]);
});

test('awaiting the promise of a change resolves only after a save that includes it', async () => {
  const h = harness();
  h.change();
  await h.settle();
  const done = h.change(); // queued behind the save in flight
  let resolved = false;
  void done.then(() => { resolved = true; });
  h.releases[0](true);
  await h.settle();
  assert.equal(resolved, false, 'the first save did not carry this change, so the caller still waits');
  h.releases[1](true);
  await done;
  assert.equal(h.written.at(-1), h.state);
});

test('a failed save is reported, and the next change saves again', async () => {
  const h = harness();
  h.change();
  await h.settle();
  h.releases[0](false);
  await h.writer.idle();
  assert.deepEqual(h.results, [false]);
  h.change();
  await h.settle();
  h.releases[1](true);
  await h.writer.idle();
  assert.deepEqual(h.results, [false, true]);
});

test('saves start at least the minimum interval apart', async () => {
  const h = harness(1000);
  h.change();
  await h.settle();
  h.releases[0](true);
  await h.writer.idle();
  h.tick(200);
  h.change();
  await h.settle();
  assert.deepEqual(h.waits, [800], 'the second save waits out the rest of the second');
  h.releases[1](true);
  await h.writer.idle();
  assert.equal(h.written.length, 2);
});
