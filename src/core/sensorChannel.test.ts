import test from 'node:test';
import assert from 'node:assert/strict';
import { PROBE_MARK, sensorChannelWarnings, splitProbe } from './sensorChannel.ts';
import { applyBrowserVisit, parseBrowserReports } from './browserVisit.ts';
import { parseSensorBody } from './sensor.ts';
import type { PlatformRecord } from './types.ts';

const NOW = Date.parse('2026-10-22T04:30:00Z');
const prog = (patch: Partial<PlatformRecord>) => ({ id: 'p', ...patch }) as PlatformRecord;
const visit = (sensor: 'installed' | 'absent', at = '2026-10-22T04:20:00Z') => ({ at, ok: true, problems: [], sensor });

test('the self-test note is recognised and never becomes a finding', () => {
  const body = JSON.stringify({ s: 'abcdef123', r: [{ k: 'error', m: PROBE_MARK, p: '/' }, { k: 'error', m: 'TypeError: x is undefined', p: '/' }] });
  const { probe, rest } = splitProbe(parseSensorBody(body));
  assert.equal(probe, true);
  assert.equal(rest.length, 1);
  assert.match(rest[0].message, /TypeError/);
  assert.deepEqual(splitProbe(parseSensorBody(JSON.stringify({ s: 'abcdef123', r: [{ k: 'error', m: 'boom', p: '/' }] }))).probe, false);
});

test('an installed sensor whose test note arrived is healthy', () => {
  assert.deepEqual(sensorChannelWarnings(prog({ browserVisit: visit('installed'), sensorProbeAt: '2026-10-22T04:12:00Z' }), NOW), []);
});

test('an installed sensor with no test note is deaf: say so', () => {
  const w = sensorChannelWarnings(prog({ browserVisit: visit('installed') }), NOW);
  assert.equal(w.length, 1);
  assert.match(w[0], /لم يصل/);
  // yesterday's note does not count as today's proof
  assert.equal(sensorChannelWarnings(prog({ browserVisit: visit('installed'), sensorProbeAt: '2026-10-21T04:12:00Z' }), NOW).length, 1);
});

test('a missing sensor is a gap; an unchecked or stale visit says nothing', () => {
  assert.match(sensorChannelWarnings(prog({ browserVisit: visit('absent') }), NOW)[0], /غير مركّب/);
  assert.deepEqual(sensorChannelWarnings(prog({ browserVisit: { at: '2026-10-22T04:20:00Z', ok: true, problems: [] } }), NOW), []);
  assert.deepEqual(sensorChannelWarnings(prog({ browserVisit: visit('absent', '2026-10-20T04:20:00Z') }), NOW), []);
  assert.deepEqual(sensorChannelWarnings(prog({}), NOW), []);
});

test('the robot report carries the sensor state through to the program record', () => {
  const [report] = parseBrowserReports({ reports: [{ id: 'p', url: 'https://x.example', ok: true, problems: [], warnings: [], sensor: 'installed' }, { id: 'q', url: 'https://y.example', ok: true, problems: [], warnings: [], sensor: 'hax' }] });
  assert.equal(report.sensor, 'installed');
  assert.equal(parseBrowserReports({ reports: [{ id: 'q', url: 'https://y.example', ok: true, problems: [], warnings: [], sensor: 'hax' }] })[0].sensor, undefined);
  const next = applyBrowserVisit(prog({}), report, 'https://x.example', '2026-10-22T04:20:00Z');
  assert.equal(next.browserVisit?.sensor, 'installed');
});
