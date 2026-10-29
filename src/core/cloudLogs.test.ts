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

test('a 1st-gen Cloud Function source reads that function\'s errors and has no revisions', async () => {
  assert.deepEqual(parseLogSources('TEBYAN=tebyan-app-2026/fn:api;x=my-project-1/fn:a"b'), [{ codeName: 'TEBYAN', project: 'tebyan-app-2026', service: 'fn:api' }]);
  const f = buildLogFilter('fn:api', '2026-10-29T11:30:00Z');
  assert.match(f, /^resource\.type="cloud_function" AND resource\.labels\.function_name="api" AND severity>=ERROR/);
  assert.doesNotMatch(f, /cloud_run_revision|fn:/);
  let called = false;
  const reader = createCloudLogReader(async () => 'tok', (async () => { called = true; return { status: 200, ok: true, json: async () => ({}) }; }) as unknown as typeof fetch);
  assert.equal(await reader.servingRevisions({ codeName: 'TEBYAN', project: 'tebyan-app-2026', service: 'fn:api' }), null);
  assert.equal(called, false, 'no Cloud Run or request-log lookup for a function');
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
  assert.deepEqual(serverProblems(p, NOW + 27 * 3_600_000), []);
  assert.deepEqual(serverWarnings(p, NOW + 27 * 3_600_000), []);
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

test('without the Cloud Run Viewer role, the revision of the newest request is the serving one', async () => {
  const src = { codeName: 'MAJAL', project: 'my-project-1', service: 'majal-app' };
  const calls: string[] = [];
  const reader = (logs: { status: number; body: unknown }) => createCloudLogReader(async () => 'tok', (async (url: string, init?: { body?: string }) => {
    calls.push(String(url));
    if (String(url).startsWith('https://run.googleapis.com')) return { status: 403, ok: false, json: async () => ({}) };
    assert.match(String(init?.body), /log_id\(\\"run.googleapis.com\/requests\\"\)/, 'asks for request logs only');
    return { status: logs.status, ok: logs.status < 300, json: async () => logs.body };
  }) as unknown as typeof fetch);

  assert.deepEqual(await reader({ status: 200, body: { entries: [{ resource: { labels: { revision_name: 'majal-app-00244-4l9' } } }] } }).servingRevisions(src), ['majal-app-00244-4l9']);
  assert.ok(calls.some(u => u.startsWith('https://run.googleapis.com')) && calls.some(u => u.startsWith('https://logging.googleapis.com')));
  // nothing usable from either source: unknown, so errors keep their normal (possibly red) verdict
  assert.equal(await reader({ status: 403, body: {} }).servingRevisions(src), null);
  assert.equal(await reader({ status: 200, body: { entries: [] } }).servingRevisions(src), null);
  assert.equal(await reader({ status: 200, body: { entries: [{ resource: { labels: { revision_name: 'x" OR 1' } } }] } }).servingRevisions(src), null);

  // a burst on the replaced revision is a warning, the same burst on the serving one stays red
  const burst = (revision: string) => Array.from({ length: 5 }, (_, i) => ({ timestamp: `2026-10-29T08:3${i}:00Z`, textPayload: 'Error: Connection terminated due to connection timeout', resource: { labels: { revision_name: revision } } }));
  const now = Date.parse('2026-10-29T12:00:00Z');
  const record = (errors: ReturnType<typeof summarizeLogEntries>) => ({ serverErrors: errors, serverLogsCheckedAt: '2026-10-29T11:59:00Z' }) as never;
  const old = summarizeLogEntries(burst('majal-app-00242-27w'), ['majal-app-00244-4l9']);
  assert.deepEqual(serverProblems(record(old), now), []);
  assert.equal(serverWarnings(record(old), now).length, 1);
  assert.equal(serverProblems(record(summarizeLogEntries(burst('majal-app-00244-4l9'), ['majal-app-00244-4l9'])), now).length, 1);
});

test('the same error three times within half an hour is red; three times spread over the day is a warning', () => {
  const at = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
  const burst = summarizeLogEntries([0, 5, 20].map(m => ({ timestamp: at(m), textPayload: 'Error: burst' })));
  const spread = summarizeLogEntries([0, 300, 900].map(m => ({ timestamp: at(m), textPayload: 'Error: spread' })));
  assert.deepEqual([burst[0].count, burst[0].peak, spread[0].count, spread[0].peak], [3, 3, 3, 1]);
  const p = applyServerErrors(program(), [...burst, ...spread], null, new Date(NOW).toISOString());
  assert.equal(serverProblems(p, NOW).length, 1);
  assert.match(serverProblems(p, NOW)[0], /burst.*3 مرة خلال نصف ساعة/);
  assert.match(serverWarnings(p, NOW).join(' '), /spread.*3 مرة في آخر يوم/);
  assert.equal(serverProblems(p, NOW + 20 * 3_600_000).length, 1, 'a daily check stays valid until the next one');
});
