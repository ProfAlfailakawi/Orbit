import test from 'node:test';
import assert from 'node:assert/strict';
import { applyServerErrors, buildLogFilter, createCloudLogReader, parseLogSources, serverProblems, serverWarnings, summarizeLogEntries } from './cloudLogs.ts';
import type { PlatformRecord } from './types.ts';

const program = (patch: Partial<PlatformRecord> = {}) => ({ id: 'p', codeName: 'P', ...patch }) as PlatformRecord;
const NOW = Date.parse('2026-10-22T12:00:00Z');

test('log sources are validated, never trusted', () => {
  const good = { codeName: 'order', project: 'my-project-1', service: 'order-api' };
  assert.deepEqual(parseLogSources(JSON.stringify([good, { codeName: 'x', project: 'BAD PROJECT', service: 'a' }, { codeName: 'y', project: 'my-project-1', service: 'a"; OR 1=1' }, 5])), [{ ...good, codeName: 'ORDER' }]);
  assert.deepEqual(parseLogSources('order=my-project-1/order-api; ADMIN=my-project-1/admin-api  bad=NOPE/x;x=my-project-1/a"b'), [{ codeName: 'ORDER', project: 'my-project-1', service: 'order-api' }, { codeName: 'ADMIN', project: 'my-project-1', service: 'admin-api' }]);
  assert.deepEqual(parseLogSources('[not json'), []);
  assert.deepEqual(parseLogSources('   '), []);
  assert.deepEqual(parseLogSources(undefined), []);
});

test('the filter asks only for this service errors since a time', () => {
  const f = buildLogFilter('order-api', '2026-10-22T11:30:00Z');
  assert.match(f, /service_name="order-api"/);
  assert.match(f, /severity>=ERROR/);
  assert.match(f, /timestamp>="2026-10-22T11:30:00Z"/);
});

test('entries group by message with digits collapsed, noise dropped, secrets masked', () => {
  const entries = [
    { timestamp: '2026-10-22T11:40:00Z', textPayload: 'Error: timeout after 3021ms calling payments' },
    { timestamp: '2026-10-22T11:50:00Z', textPayload: 'Error: timeout after 3150ms calling payments' },
    { timestamp: '2026-10-22T11:55:00Z', jsonPayload: { message: 'Error: timeout after 2999ms calling payments' } },
    { timestamp: '2026-10-22T11:56:00Z', textPayload: 'request aborted by client' },
    { timestamp: '2026-10-22T11:57:00Z', httpRequest: { status: 500 } },
    { timestamp: '2026-10-22T11:58:00Z', textPayload: 'failed for user a.b@example.com' },
  ];
  const out = summarizeLogEntries(entries);
  assert.equal(out[0].count, 3);
  assert.match(out[0].text, /timeout after \d+ms calling payments/);
  assert.equal(out[0].lastAt, '2026-10-22T11:55:00Z');
  assert.ok(out.some(e => /HTTP 500/.test(e.text)));
  assert.ok(!out.some(e => /aborted/.test(e.text)));
  assert.ok(!out.some(e => /example\.com/.test(e.text)), 'email must be masked');
});

test('three of the same error is a problem; fewer is a warning; stale checks say nothing', () => {
  const p = applyServerErrors(program(), [{ text: 'boom', count: 3, lastAt: '' }, { text: 'once', count: 1, lastAt: '' }], null, new Date(NOW).toISOString());
  assert.equal(serverProblems(p, NOW).length, 1);
  assert.match(serverProblems(p, NOW)[0], /boom/);
  assert.match(serverWarnings(p, NOW)[0], /once/);
  assert.deepEqual(serverProblems(p, NOW + 2 * 3_600_000), []);
  assert.deepEqual(serverWarnings(p, NOW + 2 * 3_600_000), []);
});

test('an unreadable log source is a warning, never mistaken for "no errors"', () => {
  const p = applyServerErrors(program({ serverErrors: [{ text: 'old', count: 9, lastAt: '' }] }), null, 'ليس لحساب أوربت صلاحية', new Date(NOW).toISOString());
  assert.equal(p.serverErrors, undefined);
  assert.deepEqual(serverProblems(p, NOW), []);
  assert.match(serverWarnings(p, NOW)[0], /لا يمكن قراءة سجلات الخادم/);
  const ok = applyServerErrors(p, [], null, new Date(NOW).toISOString());
  assert.deepEqual(serverWarnings(ok, NOW), []);
});

test('the reader maps permission and network failures to plain reasons', async () => {
  const reader = (status: number, body: unknown = {}) => createCloudLogReader(async () => 'tok', (async () => ({ status, ok: status < 300, json: async () => body })) as unknown as typeof fetch);
  const src = { codeName: 'A', project: 'my-project-1', service: 'svc' };
  assert.deepEqual(await reader(200, { entries: [{ textPayload: 'x' }] }).read(src, 'z'), { entries: [{ textPayload: 'x' }] });
  assert.match((await reader(403).read(src, 'z') as { error: string }).error, /Logs Viewer/);
  assert.match((await reader(500).read(src, 'z') as { error: string }).error, /500/);
  const noToken = createCloudLogReader(async () => null, fetch);
  assert.match((await noToken.read(src, 'z') as { error: string }).error, /هوية/);
});

test('a revision that could not start is a warning with its revision name, never a red problem', () => {
  const entries = [
    ...Array.from({ length: 7 }, (_, i) => ({ timestamp: `2026-10-22T22:3${i}:00Z`, textPayload: 'The request failed because the instance could not start successfully.', resource: { labels: { revision_name: 'service-00975-x7f' } } })),
    ...Array.from({ length: 4 }, (_, i) => ({ timestamp: `2026-10-22T22:4${i}:00Z`, httpRequest: { status: 500 }, resource: { labels: { revision_name: 'service-00539-yik' } } })),
  ];
  const errors = summarizeLogEntries(entries);
  assert.ok(errors.some(e => e.revision === 'service-00975-x7f' && e.count === 7));
  assert.ok(errors.some(e => e.revision === 'service-00539-yik' && e.count === 4), 'the same message on another revision is counted apart');
  const p = applyServerErrors(program(), errors, null, new Date(NOW).toISOString());
  const problems = serverProblems(p, NOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HTTP 500.*service-00539-yik/, 'visitor-facing 5xx on the serving revision stays red and names it');
  assert.ok(!problems.some(x => /could not start/.test(x)), 'a start failure is never red');
  const warns = serverWarnings(p, NOW);
  assert.ok(warns.some(x => /فشلت في الإقلاع.*7.*service-00975-x7f.*فلا أثر على الزوار/.test(x)));
});

test('a revision name that is not a plain identifier is ignored', () => {
  const [e] = summarizeLogEntries([{ textPayload: 'boom', resource: { labels: { revision_name: 'bad name; DROP' } } }]);
  assert.equal(e.revision, undefined);
});
