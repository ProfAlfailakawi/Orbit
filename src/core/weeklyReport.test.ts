import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyDigest, logProblems } from './weeklyReport.ts';
import type { PlatformRecord } from './types.ts';

const prog = (id: string, patch: Partial<PlatformRecord> = {}) => ({ id, codeName: id.toUpperCase(), nameAr: id, lifecycleState: 'active', runtimeMode: 'cloud', ...patch }) as PlatformRecord;
const NOW = Date.parse('2026-10-22T12:00:00Z');
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

test('a problem is logged once while it lingers, and again when it comes back', () => {
  let p = prog('a');
  p = logProblems(p, ['الموقع لا يستجيب'], iso(10));
  assert.equal(p.problemLog?.length, 1);
  const same = logProblems(p, ['الموقع لا يستجيب'], iso(8));
  assert.equal(same, p, 'still the same occurrence: no new entry, no change');
  p = logProblems(p, ['الموقع لا يستجيب'], iso(2)); // quiet for 8h, now back
  assert.equal(p.problemLog?.length, 2);
});

test('digits do not make a different problem; old entries are forgotten', () => {
  let p = prog('a', { problemLog: [{ at: new Date(NOW - 20 * 86_400_000).toISOString(), text: 'قديم' }] });
  p = logProblems(p, ['بطيء 3 ث'], iso(10));
  assert.equal(p.problemLog?.length, 1, 'the 20-day-old entry is dropped');
  p = logProblems(p, ['بطيء 5 ث'], iso(9));
  assert.equal(p.problemLog?.length, 1, 'same shape within 6h is the same occurrence');
});

test('the digest names quiet programs, recurring problems and what expires soon', () => {
  const a = prog('a', { problemLog: [{ at: iso(100), text: 'خطأ في الدفع' }, { at: iso(30), text: 'خطأ في الدفع' }, { at: iso(5), text: 'ملف لا يُحمَّل' }], certExpiresAt: new Date(NOW + 3 * 86_400_000).toISOString() });
  const b = prog('b');
  const old = prog('c', { problemLog: [{ at: iso(24 * 9), text: 'قديم جدًا' }] });
  const local = prog('d', { runtimeMode: 'local-only' });
  const d = buildWeeklyDigest([a, b, old, local], new Date(NOW + 10 * 86_400_000).toISOString(), NOW);
  assert.match(d.text, /بلا أي مشكلة هذا الأسبوع: 2 من 3/);
  assert.match(d.text, /خطأ في الدفع — تكرر 2 مرات/);
  assert.match(d.text, /مشاكل تتكرر/);
  assert.match(d.text, /شهادة موقع .*ينتهي بعد 3 يومًا/);
  assert.match(d.text, /رمز GitHub لأوربت.*ينتهي بعد 10 يومًا/);
  assert.ok(!/قديم جدًا/.test(d.text));
  assert.equal(d.push.kind, 'summary');
  assert.ok(d.push.body.length <= 180);
});

test('a quiet week says so', () => {
  const d = buildWeeklyDigest([prog('a'), prog('b')], null, NOW);
  assert.match(d.text, /أسبوع هادئ/);
  assert.match(d.push.body, /2 من 2 برنامجًا بلا مشاكل/);
});
