import assert from 'node:assert/strict';
import test from 'node:test';
import { INCIDENT_STATUSES, isIncidentStatus } from './types.ts';

test('isIncidentStatus accepts every declared status', () => {
  for (const status of INCIDENT_STATUSES) assert.equal(isIncidentStatus(status), true, status);
});

test('isIncidentStatus rejects unknown, wrongly-cased and non-string values', () => {
  for (const bad of ['', 'resolved', 'RESOLVED', 'Closed', ' Resolved', null, undefined, 0, {}, ['Resolved']]) {
    assert.equal(isIncidentStatus(bad), false, String(bad));
  }
});

test('the status list keeps the twelve lifecycle states the dashboard knows', () => {
  assert.equal(INCIDENT_STATUSES.length, 12);
  assert.equal(new Set(INCIDENT_STATUSES).size, 12);
  assert.ok(INCIDENT_STATUSES.includes('Resolved'));
  assert.ok(INCIDENT_STATUSES.includes("Won't Fix"));
});
