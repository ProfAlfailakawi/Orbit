import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBrowserVisit, freshBrowserProblems, parseBrowserReports } from './browserVisit.ts';
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
  const r = { id: 'a', url: 'https://old.app', ok: false, problems: ['x'] };
  assert.equal(applyBrowserVisit(rec(), r, 'https://new.app', 'T').browserVisit, undefined);
  assert.equal(applyBrowserVisit(rec(), r, 'https://old.app/', 'T').browserVisit?.ok, false);
});

test('only fresh failing visits count', () => {
  const now = Date.now();
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  assert.deepEqual(freshBrowserProblems(rec({ browserVisit: { at: at(2), ok: false, problems: ['p'] } }), now), ['p']);
  assert.deepEqual(freshBrowserProblems(rec({ browserVisit: { at: at(40), ok: false, problems: ['p'] } }), now), []);
  assert.deepEqual(freshBrowserProblems(rec({ browserVisit: { at: at(1), ok: true, problems: [] } }), now), []);
});
