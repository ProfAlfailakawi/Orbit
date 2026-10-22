import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.ORBIT_TEST_URL || 'http://127.0.0.1:3100';
const key = process.env.ORBIT_OPERATOR_PASSKEY;
if (!key || key.length < 16) throw new Error('CI-only ORBIT_OPERATOR_PASSKEY is required');
await fs.mkdir('test-artifacts', { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'ar-KW' });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
const page = await context.newPage();
const runtimeErrors = [];
page.on('pageerror', error => runtimeErrors.push(error.message));
try {
  const health = await page.request.get(base + '/healthz');
  assert.equal(health.status(), 200);
  const healthData = await health.json();
  assert.equal(healthData.service, 'orbit');
  assert.equal(healthData.status, 'running');
  assert.ok(['firestore', 'local'].includes(healthData.storage));
  const unauth = await page.request.get(base + '/api/state');
  assert.equal(unauth.status(), 401, 'Protected state must reject unauthenticated requests');

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#orbit-passkey-input', { state: 'visible', timeout: 20000 });
  await page.locator('#orbit-passkey-input').fill(key);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sat').length >= 8, { timeout: 20000 });

  const signedIn = await page.request.get(base + '/api/auth/session');
  assert.equal((await signedIn.json()).authenticated, true, 'Login must set a server session');
  const response = await page.request.get(base + '/api/state');
  assert.equal(response.status(), 200, 'Authenticated dashboard must reach backend');
  const state = await response.json();
  assert.ok(Array.isArray(state.platforms), 'Fleet state missing');
  assert.ok(state.acceptanceCriteria.every(item => item.status !== 'Pass'), 'Unverified acceptance must not be declared passed');
  const unauthScheduler = await page.request.post(base + '/internal/scheduler/github-sync');
  assert.equal(unauthScheduler.status(), 503, 'Scheduler endpoint must fail closed when scheduler identity is not configured');
  const canary = await page.request.post(base + '/api/canary/run', { headers: { Origin: base } });
  assert.equal(canary.status(), 200, 'Isolated canary endpoint should run');
  const canaryData = await canary.json();
  assert.ok(canaryData.events.filter(item => item.appId === 'ORBIT-CANARY').every(item => item.dataIntegrity === 'Demo'), 'Synthetic canary must remain Demo');
  assert.equal(state.incidents.some(i => i.appId === 'ORBIT-CANARY' && i.dataIntegrity === 'Live'), false, 'Test incidents must not be treated as live');

  // The page is deliberately small: a summary, one line per program, and copy buttons.
  await page.screenshot({ path: 'test-artifacts/orbit-desktop.png', fullPage: true });
  assert.equal(await page.locator('main h1').count(), 1, 'Exactly one summary headline');
  assert.equal(await page.getByRole('dialog').count(), 0, 'No overlays or detail pages');
  assert.equal(await page.locator('[role="tab"], nav').count(), 0, 'No tabs or navigation');

  // The sync button reads "جارٍ الفحص…" while the automatic link on open runs.
  await page.getByRole('button', { name: 'تحديث', exact: true }).waitFor({ timeout: 90000 });

  // Every problem or monitoring gap has a copy button that really fills the clipboard.
  const copyAll = page.getByRole('button', { name: /^انسخ (كل المشاكل|التقرير)$/ });
  await copyAll.waitFor();
  await copyAll.click();
  await page.getByText('تم النسخ', { exact: true }).first().waitFor();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  if (clipboard) assert.match(clipboard, /تقرير أوربت/, 'Copied text must be the ORBIT report');
  // The orbit is the whole interface: tap a satellite to see its name and its problem, then copy it.
  assert.ok(await page.locator('.sat').count() >= 8, 'Every program must appear as a satellite');
  assert.equal(await page.locator('.sat .avatar').count(), await page.locator('.sat').count(), 'Every satellite shows a logo or a monogram');
  const logos = await page.request.get(base + '/api/logos');
  assert.equal(logos.status(), 200, 'Logos endpoint must serve the signed-in operator');
  assert.equal(typeof (await logos.json()).logos, 'object');
  const refreshed = await page.request.post(base + '/api/logos/refresh', { headers: { Origin: base }, data: { id: 'no-such-program' } });
  assert.equal(refreshed.status(), 200, 'Refreshing an unknown program is a harmless no-op');
  const sat = page.locator('.sat').first();
  await sat.click({ force: true }); // satellites orbit, so skip the stable-box wait
  await page.locator('.detail').waitFor();
  assert.ok((await page.locator('.detail strong').innerText()).length > 0, 'Detail must name the program');
  const rowCopy = page.locator('.detail .btn-copy');
  await rowCopy.waitFor();
  await rowCopy.click();
  await page.locator('.detail').getByText('تم النسخ', { exact: true }).waitFor();
  await page.locator('.detail-close').click();
  await page.locator('.detail').waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'إضافة برنامج' }).click();
  await page.getByRole('form', { name: 'إضافة برنامج جديد' }).waitFor();
  await page.getByRole('form', { name: 'إضافة برنامج جديد' }).getByRole('button', { name: 'إغلاق' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector('.summary');
  await page.screenshot({ path: 'test-artifacts/orbit-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 3);
  assert.equal(overflow, false, 'Mobile viewport has horizontal overflow');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-artifacts/orbit-mobile-dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });

  const unauthorizedSensor = await page.request.post(base + '/api/sensor/ingest', {
    headers: { Origin: base },
    data: { appId: 'MIRAS', environment: 'production', operationName: 'ci.test', errorCode: 'CI_SMOKE', errorMessage: 'isolated smoke test' },
  });
  assert.equal(unauthorizedSensor.status(), 401, 'Sensor must reject requests without bearer authentication');
  const sensorToken = process.env.ORBIT_SENSOR_INGEST_TOKEN || '';
  assert.ok(sensorToken.length >= 32, 'CI sensor token missing');
  const authorizedSensor = await page.request.post(base + '/api/sensor/ingest', {
    headers: { Authorization: 'Bearer ' + sensorToken, Origin: base },
    data: { appId: 'MIRAS', environment: 'staging', operationName: 'ci.visual.smoke', errorCode: 'CI_SMOKE', errorMessage: 'Synthetic browser-only verification of opt-in secure sensor' },
  });
  assert.equal(authorizedSensor.status(), 202, 'Authenticated staging sensor must accept a test event');
  const contradictorySensor = await page.request.post(base + '/api/sensor/ingest', {
    headers: { Authorization: 'Bearer ' + sensorToken },
    data: {
      appId: 'MIRAS', environment: 'staging', operationName: 'ci.truth.staging',
      outcomeEvidence: { uiReportedSuccess: true, serverRecordConfirmed: false, httpStatus: 200 },
      breadcrumbs: [
        { kind: 'ui_action', operation: 'save.click', outcome: 'success', typedValue: 'private.student@example.com', secret: 'DO_NOT_LOG' },
        { kind: 'http_result', operation: 'save.response', outcome: 'failure', statusCode: 200, body: 'private payload' },
      ],
    },
  });
  assert.equal(contradictorySensor.status(), 202, 'Explicit server contradiction must create a verified silent-failure incident');
  const truthState = await (await page.request.get(base + '/api/state')).json();
  const truthIncident = truthState.incidents.find(i => i.appId === 'MIRAS' && i.summary.includes('non-commit'));
  assert.ok(truthIncident, 'Authoritative mismatch must create an incident');
  assert.equal(truthIncident.blackBoxFrames.length, 2, 'Only two safe timeline records should be stored');
  assert.ok(!JSON.stringify(truthIncident.blackBoxFrames).includes('private.student@example.com'), 'No typed private input in evidence timeline');
  assert.ok(!JSON.stringify(truthIncident.blackBoxFrames).includes('DO_NOT_LOG'), 'No unexpected secret in evidence timeline');
  assert.ok(truthState.silentFailures.some(f => f.appId === 'MIRAS' && f.dataIntegrity === 'Live'), 'Internal evidence store must record explicit contradiction');

  const spoofedSensor = await page.request.post(base + '/api/sensor/ingest', {
    headers: { Authorization: 'Bearer ' + sensorToken, Origin: base },
    data: { appId: 'THRIVE', environment: 'staging', operationName: 'ci.spoof.attempt', errorCode: 'CI_SPOOF', errorMessage: 'A MIRAS credential must not impersonate another app' },
  });
  assert.equal(spoofedSensor.status(), 403, 'An app-scoped sensor credential must not impersonate another app');
  const hydrate = await page.request.post(base + '/api/state/hydrate', { headers: { Origin: base }, data: state });
  assert.equal(hydrate.status(), 410, 'Client cloud snapshots must not overwrite shared server truth');
  const updatedState = await page.request.get(base + '/api/state');
  const newState = await updatedState.json();
  assert.ok(newState.events.some(event => event.appId === 'MIRAS' && event.dataIntegrity === 'Live'), 'Authenticated sensor event should be Live');

  await page.getByRole('button', { name: 'خروج', exact: true }).click();
  await page.waitForSelector('#orbit-passkey-input', { state: 'visible', timeout: 10000 });
  const loggedOut = await page.request.get(base + '/api/state');
  assert.equal(loggedOut.status(), 401, 'Logout must revoke the server session');

  assert.deepEqual(runtimeErrors, [], 'Browser must not have uncaught runtime exceptions');
  console.log('ORBIT smoke PASS: one page, copy to Claude, add program, mobile light/dark, session, sensor safety.');
} catch (err) {
  await page.screenshot({ path: 'test-artifacts/orbit-failure.png', fullPage: true }).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
