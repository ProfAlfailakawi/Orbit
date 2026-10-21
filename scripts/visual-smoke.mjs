import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.ORBIT_TEST_URL || 'http://127.0.0.1:3100';
const key = process.env.ORBIT_OPERATOR_PASSKEY;
if (!key || key.length < 16) throw new Error('CI-only ORBIT_OPERATOR_PASSKEY is required');
await fs.mkdir('test-artifacts', { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'ar-KW' });
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
  await page.getByRole('button', { name: /دخول غرفة العمليات/ }).click();
  await page.waitForSelector('.orbit-executive', { state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('.orbit-app-card').length >= 8, { timeout: 20000 });
  const count = await page.locator('.orbit-app-card').count();
  assert.ok(count >= 8, 'Expected program cards to render');

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

  await page.screenshot({ path: 'test-artifacts/orbit-desktop.png', fullPage: true });
  assert.equal(await page.locator('.orbit-desktop-nav, .orbit-mobile-nav, .orbit-more-menu').count(), 0, 'No dashboard tab bar or More menu should exist');
  assert.equal(await page.locator('.orbit-executive').count(), 1, 'Only one owner dashboard should exist');
  assert.equal(await page.locator('.one-quiet-settings, .orbit-tools-menu').count(), 0, 'Technical settings must stay out of the owner header');

  await page.getByRole('button', { name: /عرض المشاكل/ }).click();
  await page.locator('#orbit-one-incidents').waitFor();

  await page.getByRole('button', { name: /إضافة برنامج/ }).first().click();
  await page.getByRole('form', { name: 'إضافة برنامج جديد' }).waitFor();
  await page.getByRole('button', { name: 'إغلاق' }).click();

  await page.locator('.orbit-app-card').first().click();
  await page.getByRole('dialog', { name: 'تفاصيل أوربت' }).waitFor();
  await page.locator('.orbit-program-page').waitFor();
  assert.equal(await page.getByText(/نتائج GitHub Actions الأخيرة/).count(), 0, 'Detailed GitHub Actions history must stay hidden');
  await page.screenshot({ path: 'test-artifacts/orbit-program.png', fullPage: true });
  await page.getByRole('button', { name: 'العودة للصفحة الرئيسية' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Program detail must close within same owner page');

  await page.locator('.orbit-filter-tabs button').last().click();
  await page.locator('.orbit-filter-tabs button').first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.orbit-executive').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-mobile.png', fullPage: true });
  assert.equal(await page.getByRole('button', { name: 'مزامنة GitHub الآن' }).count(), 1, 'Manual GitHub sync button is missing');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 3);
  assert.equal(overflow, false, 'Mobile viewport has horizontal overflow');

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

  await page.locator('.orbit-lock-control').click();
  await page.waitForSelector('#orbit-passkey-input', { state: 'visible', timeout: 10000 });
  const loggedOut = await page.request.get(base + '/api/state');
  assert.equal(loggedOut.status(), 401, 'Logout must revoke the server session');

  assert.deepEqual(runtimeErrors, [], 'Browser must not have uncaught runtime exceptions');
  console.log('ORBIT ONE smoke PASS: one page, quick add, expert overlays, mobile, session, sensor safety.');
} catch (err) {
  await page.screenshot({ path: 'test-artifacts/orbit-failure.png', fullPage: true }).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
