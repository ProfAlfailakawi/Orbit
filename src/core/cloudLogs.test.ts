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

const START = 'The request failed because the instance could not start successfully.';
const startEntries = (revision: string, n: number) => Array.from({ length: n }, (_, i) => ({ timestamp: `2026-10-22T22:${10 + i}:00Z`, textPayload: START, resource: { labels: { revision_name: revision } } }));
const fiveHundreds = (revision: string, n: number) => Array.from({ length: n }, (_, i) => ({ timestamp: `2026-10-22T22:4${i}:00Z`, httpRequest: { status: 500 }, resource: { labels: { revision_name: revision } } }));

test('without traffic information a start failure stays a red problem: it may be a real outage', () => {
  const p = applyServerErrors(program(), summarizeLogEntries(startEntries('service-00975-x7f', 7)), null, new Date(NOW).toISOString());
  assert.match(serverProblems(p, NOW)[0], /could not start.*service-00975-x7f/);
});

test('a start failure on a revision that gets no traffic is a warning that names it; the serving revision keeps its red 5xx', () => {
  const errors = summarizeLogEntries([...startEntries('service-00975-x7f', 7), ...fiveHundreds('service-00539-yik', 4)], ['service-00539-yik']);
  const p = applyServerErrors(program(), errors, null, new Date(NOW).toISOString());
  const problems = serverProblems(p, NOW);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HTTP 500.*service-00539-yik/);
  assert.ok(serverWarnings(p, NOW).some(x => /لا تخدم الزوار.*service-00975-x7f.*لا أثر على الزوار/.test(x)));
});

test('a serving revision that cannot start is red even though the message matches', () => {
  const errors = summarizeLogEntries(startEntries('service-00539-yik', 5), ['service-00539-yik']);
  const p = applyServerErrors(program(), errors, null, new Date(NOW).toISOString());
  assert.equal(serverProblems(p, NOW).length, 1);
});

test('many failing idle revisions cannot crowd a visitor-facing error out of the list', () => {
  const idle = ['service-00971-a', 'service-00972-b', 'service-00973-c', 'service-00974-d', 'service-00975-e'].flatMap(r => startEntries(r, 9));
  const errors = summarizeLogEntries([...idle, ...fiveHundreds('service-00539-yik', 3)], ['service-00539-yik']);
  assert.ok(errors.some(e => e.revision === 'service-00539-yik' && e.count === 3 && e.serving !== false));
  assert.equal(errors.filter(e => e.serving === false).length, 2, 'only a couple of idle groups are kept');
});

test('a revision name that is not a plain identifier is ignored', () => {
  const [e] = summarizeLogEntries([{ textPayload: 'boom', resource: { labels: { revision_name: 'bad name; DROP' } } }]);
  assert.equal(e.revision, undefined);
});

test('the traffic split tells which revisions serve visitors; anything unclear gives null', async () => {
  const src = { codeName: 'A', project: 'my-project-1', service: 'service' };
  const reader = (status: number, body: unknown) => createCloudLogReader(async () => 'tok', (async () => ({ status, ok: status < 300, json: async () => body })) as unknown as typeof fetch);
  const body = { services: [{ name: 'projects/my-project-1/locations/europe-west3/services/other', trafficStatuses: [{ revision: 'other-1', percent: 100 }] }, { name: 'projects/my-project-1/locations/europe-west3/services/service', trafficStatuses: [{ revision: 'service-00539-yik', percent: 100 }, { revision: 'service-00976-qcl', percent: 0 }] }] };
  assert.deepEqual(await reader(200, body).servingRevisions(src), ['service-00539-yik']);
  assert.equal(await reader(403, {}).servingRevisions(src), null);
  assert.equal(await reader(200, { services: [] }).servingRevisions(src), null);
  assert.equal(await createCloudLogReader(async () => null, fetch).servingRevisions(src), null);
});
