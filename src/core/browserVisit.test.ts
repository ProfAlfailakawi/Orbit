import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBrowserVisit, freshBrowserProblems, freshBrowserWarnings, parseBrowserReports } from './browserVisit.ts';
import type { PlatformRecord } from './types.ts';

const rec = (extra: Partial<PlatformRecord> = {}) => ({ id: 'a', ...extra } as PlatformRecord);

test('parse keeps well-formed reports and cleans text', () => {
  const out = parseBrowserReports({ reports: [
    { id: 'a', url: 'https://x.app', ok: true, problems: ['فشل https://x.app/a.js?token=SECRET\nتم'] },
    { id: 5 }, null, { id: 'b', url: 'https://y.app', ok: true, problems: [] },
  ] });
  assert.equal(out.length, 2);
  assert.equal(out[0].ok, false, 'a report with problems is never ok');
  assert.ok(!out[0].problems[0].includes('SECRET') && !out[0].problems[0].includes('\n'));
  assert.equal(out[1].ok, true);
  assert.deepEqual(parseBrowserReports('x'), []);
});

test('a report for another address is ignored', () => {
  const r = { id: 'a', url: 'https://old.app', ok: false, problems: ['x'], warnings: [] };
  assert.equal(applyBrowserVisit(rec(), r, 'https://new.app', 'T').browserVisit, undefined);
  assert.equal(applyBrowserVisit(rec(), r, 'https://old.app/', 'T').browserVisit?.ok, false);
});

test('parse keeps warnings and a valid look hash, and the look is compared with the previous visit', () => {
  const [r] = parseBrowserReports({ reports: [{ id: 'a', url: 'https://x.app', ok: true, problems: [], warnings: ['لغة الصفحة (lang) غير محددة', 5], hash: '0f0f0f0f0f0f0f0f' }, { id: 'b', url: 'https://y.app', ok: true, problems: [], hash: 'nope' }] });
  assert.deepEqual([r.warnings, r.hash], [['لغة الصفحة (lang) غير محددة'], '0f0f0f0f0f0f0f0f']);
  assert.equal(parseBrowserReports({ reports: [{ id: 'b', url: 'https://y.app', ok: true, problems: [], hash: 'nope' }] })[0].hash, undefined);
  const first = applyBrowserVisit(rec(), r, 'https://x.app', '2026-01-01T00:00:00Z');
  assert.deepEqual(freshBrowserWarnings(first, Date.parse('2026-01-01T01:00:00Z')), ['لغة الصفحة (lang) غير محددة']);
  const same = applyBrowserVisit(first, { ...r, warnings: [] }, 'https://x.app', '2026-01-02T00:00:00Z');
  assert.deepEqual(same.browserVisit?.warnings, []);
  const changed = applyBrowserVisit(first, { ...r, warnings: [], hash: 'f0f0f0f0f0f0f0f0' }, 'https://x.app', '2026-01-02T00:00:00Z');
  assert.match(changed.browserVisit?.warnings?.[0] || '', /تغيّر بشدة/);
  assert.equal(changed.browserVisit?.hash, 'f0f0f0f0f0f0f0f0');
});

test('only fresh failing visits count', () => {
  const now = Date.now();
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  assert.deepEqual(freshBrowserProblems(rec({ browserVisit: { at: at(2), ok: false, problems: ['p'] } }), now), ['p']);
  assert.deepEqual(freshBrowserProblems(rec({ browserVisit: { at: at(40), ok: false, problems: ['p'] } }), now), []);
  assert.deepEqual(freshBrowserProblems(rec({ browserVisit: { at: at(1), ok: true, problems: [] } }), now), []);
});
