import test from 'node:test';
import assert from 'node:assert/strict';
import { addVital, detectDrift, driftWarnings, type VitalSample } from './vitals.ts';
import { applyCert, certDue, certProblems, certWarnings } from './certs.ts';
import type { PlatformRecord } from './types.ts';

const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString();
const series = (ms: number[], bytes: number[] = ms.map(() => 4000)): VitalSample[] => ms.map((m, i) => ({ at: at(i), ms: m, bytes: bytes[i] }));
const steady = Array.from({ length: 30 }, (_, i) => 300 + (i % 3) * 20);

test('a steady site has no drift, and too little history says nothing', () => {
  assert.deepEqual(detectDrift(series(steady)), []);
  assert.deepEqual(detectDrift(series([300, 300, 9000, 9000])), []);
  assert.deepEqual(detectDrift(undefined), []);
});

test('one slow visit is a blip, a lasting slowdown is a warning', () => {
  assert.deepEqual(detectDrift(series([...steady, 4000])), []);
  const slow = detectDrift(series([...steady, 1900, 2100, 2300, 2500]));
  assert.equal(slow.length, 1);
  assert.match(slow[0], /يتباطأ.*2.2 ث.*0.3 ث/);
});

test('a lasting jump in page size is reported, a single odd page is not', () => {
  const bytes = [...steady.map(() => 4000), 9000, 9000, 9000, 9000];
  assert.match(detectDrift(series([...steady, 300, 300, 300, 300], bytes))[0], /تغيّر 125% للأكبر/);
  const odd = [...steady.map(() => 4000), 9000, 4000, 4000, 4000];
  assert.deepEqual(detectDrift(series([...steady, 300, 300, 300, 300], odd)), []);
});

test('history is capped and stale history is ignored', () => {
  let v: VitalSample[] | undefined;
  for (let i = 0; i < 120; i++) v = addVital(v, { at: at(i), ms: 100, bytes: 1000 });
  assert.equal(v?.length, 96);
  const p = { vitals: series([...steady, 3000, 3000, 3000, 3000]) } as PlatformRecord;
  const lastAt = Date.parse(p.vitals![p.vitals!.length - 1].at);
  assert.equal(driftWarnings(p, lastAt + 3_600_000).length, 1);
  assert.deepEqual(driftWarnings(p, lastAt + 5 * 3_600_000), []);
});

test('certificate: late notice is a problem, early notice is a warning, healthy is silent', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const nowIso = new Date(now).toISOString();
  const cert = (daysLeft: number, problem: string | null = null) => applyCert({} as PlatformRecord, { expiresAt: new Date(now + daysLeft * 86_400_000).toISOString(), problem }, nowIso);
  assert.match(certProblems(cert(-1), now)[0], /انتهت/);
  assert.match(certProblems(cert(2), now)[0], /بعد يومين/);
  assert.deepEqual(certWarnings(cert(2), now), []);
  assert.match(certWarnings(cert(10), now)[0], /بعد 10 أيام/);
  assert.deepEqual([...certProblems(cert(60), now), ...certWarnings(cert(60), now)], []);
  assert.match(certProblems(cert(60, 'شهادة غير موثوقة'), now)[0], /غير موثوقة/);
});

test('certificate checks are rate-limited and expire with their evidence', () => {
  const now = Date.now();
  const p = applyCert({} as PlatformRecord, { expiresAt: new Date(now + 1000).toISOString(), problem: null }, new Date(now).toISOString());
  assert.equal(certDue(p, now + 3_600_000), false);
  assert.equal(certDue(p, now + 21 * 3_600_000), true);
  assert.equal(certDue({} as PlatformRecord, now), true);
  assert.deepEqual(certProblems(p, now + 100 * 3_600_000), [], 'a check from days ago proves nothing');
});

import { releaseSlowdown, trackRelease } from './vitals.ts';
import { applyVisit } from './watch.ts';

const commit = (sha: string, timestamp: string) => ({ sha, author: 'a', message: 'm', timestamp, branch: 'main', changedFiles: [], riskLevel: 'Low' as const, dataIntegrity: 'Live' as const });

test('speed before the newest commit is remembered, and a lasting slowdown after it names that commit', () => {
  const base = { vitals: series(steady), recentCommits: [commit('abcdef1234567', at(31))] } as unknown as PlatformRecord;
  const watch = trackRelease(base)!;
  assert.equal(watch.sha, 'abcdef1234567');
  assert.ok(watch.beforeMs && watch.beforeMs < 400, 'median of the visits before the commit');
  // 4 slow visits well after the 10-minute settling time
  const slowAfter = { ...base, releaseWatch: watch, vitals: [...series(steady), ...series([...Array(40).fill(300), 2500, 2600, 2400, 2700]).slice(40).map((s, i) => ({ ...s, at: at(34 + i) }))] } as PlatformRecord;
  const out = releaseSlowdown(slowAfter, Date.parse(at(40)));
  assert.equal(out.length, 1);
  assert.match(out[0], /abcdef1.*2.[56] ث.*0.3 ث/);
});

test('no slowdown is claimed without enough before/after evidence, or long after the release', () => {
  const fresh = trackRelease({ vitals: series([300, 300]), recentCommits: [commit('abcdef1234567', at(5))] } as unknown as PlatformRecord)!;
  assert.equal(fresh.beforeMs, undefined, 'too few earlier visits: nothing to compare against');
  assert.deepEqual(releaseSlowdown({ releaseWatch: fresh, vitals: series([5000, 5000, 5000, 5000, 5000]) } as unknown as PlatformRecord, Date.parse(at(60))), []);
  const old = { sha: 'abcdef1234567', at: at(0), beforeMs: 300 };
  assert.deepEqual(releaseSlowdown({ releaseWatch: old, vitals: series([300, 300, 300, 300, 300, 300, 3000, 3000, 3000, 3000]) } as unknown as PlatformRecord, Date.parse(at(0)) + 72 * 3_600_000), []);
});

test('the same commit does not reset the baseline; a new one does', () => {
  const p = { vitals: series(steady), recentCommits: [commit('aaaaaaa1', at(31))] } as unknown as PlatformRecord;
  const w1 = trackRelease(p)!;
  assert.equal(trackRelease({ ...p, releaseWatch: w1, vitals: series(steady.map(() => 3000)) } as PlatformRecord), w1);
  const w2 = trackRelease({ ...p, releaseWatch: w1, recentCommits: [commit('bbbbbbb2', at(35)), ...p.recentCommits] } as PlatformRecord)!;
  assert.equal(w2.sha, 'bbbbbbb2');
});

test('a watch visit records the release baseline on the program', () => {
  const p = { id: 'p', fourState: {}, vitals: series(steady), recentCommits: [commit('abcdef1234567', at(31))] } as unknown as PlatformRecord;
  const next = applyVisit(p, 'https://x.example', { ok: true, reachable: true, problems: [], ms: 300, htmlBytes: 4000 } as never, at(32));
  assert.equal(next.releaseWatch?.sha, 'abcdef1234567');
});
