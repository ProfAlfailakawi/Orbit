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
  const canary = await page.request.post(base + '/api/canary/run');
  assert.equal(canary.status(), 200, 'Isolated canary endpoint should run');
  const canaryData = await canary.json();
  assert.ok(canaryData.events.filter(item => item.appId === 'ORBIT-CANARY').every(item => item.dataIntegrity === 'Demo'), 'Synthetic canary must remain Demo');

  assert.equal(state.incidents.some(i => i.appId === 'ORBIT-CANARY' && i.dataIntegrity === 'Live'), false, 'Test incidents must not be treated as live');

  await page.screenshot({ path: 'test-artifacts/orbit-desktop.png', fullPage: true });
  const nav = page.locator('.orbit-desktop-nav .orbit-nav-link');
  await nav.nth(1).click();
  await page.locator('.orbit-workspace-overview[data-mode="radar"]').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-radar.png', fullPage: true });
  await nav.nth(2).click();
  await page.locator('.orbit-workspace-overview[data-mode="fleet"]').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-fleet.png', fullPage: true });
  await page.locator('.orbit-more-menu-desktop > summary').click();
  await page.getByRole('button', { name: 'الرؤى' }).click();
  await page.locator('.orbit-workspace-overview[data-mode="intelligence"]').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-intelligence.png', fullPage: true });
  await page.locator('.orbit-more-menu-desktop > summary').click();
  await page.getByRole('button', { name: 'الحماية' }).click();
  await page.locator('.orbit-workspace-overview[data-mode="operations"]').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-governance.png', fullPage: true });
  await nav.first().click();
  await page.locator('.orbit-executive').waitFor();
  await page.locator('.orbit-filter-tabs button').last().click();
  await page.locator('.orbit-filter-tabs button').first().click();
  await page.locator('.orbit-app-card').first().click();
  assert.equal(await page.locator('.orbit-executive').count(), 0, 'Program detail navigation not working');
  await page.locator('.orbit-program-page').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-program.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.orbit-mobile-tab').first().click();
  await page.waitForSelector('.orbit-executive', { state: 'visible' });
  await page.screenshot({ path: 'test-artifacts/orbit-mobile.png', fullPage: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 3);
  assert.equal(overflow, false, 'Mobile viewport has horizontal overflow');

  await page.locator('.orbit-mobile-tab').nth(1).click();
  await page.locator('.orbit-workspace-overview[data-mode="radar"]').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-mobile-radar.png', fullPage: true });
  await page.locator('#orbit-advanced-radar > summary').click();
  await page.locator('.orbit-radar-page').waitFor();
  await page.locator('.orbit-mobile-tab').nth(2).click();
  await page.locator('.orbit-workspace-overview[data-mode="fleet"]').waitFor();
  await page.screenshot({ path: 'test-artifacts/orbit-mobile-fleet.png', fullPage: true });
  await page.locator('.orbit-mobile-tab').first().click();
  await page.locator('.orbit-tools-menu > summary').click();
  assert.equal(await page.locator('.orbit-tools-popover').isVisible(), true, 'Utility menu should open');
  await page.getByRole('button', { name: 'المظهر الداكن' }).click();
  assert.equal(await page.locator('.orbit-shell.orbit-dark').count(), 1, 'Dark appearance not applied');
  await page.screenshot({ path: 'test-artifacts/orbit-mobile-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'المظهر الفاتح' }).click();
  assert.equal(await page.locator('.orbit-shell.orbit-dark').count(), 0, 'Light appearance not restored');
  const unauthorizedSensor = await page.request.post(base + '/api/sensor/ingest', {
    data: { appId: 'MIRAS', environment: 'production', operationName: 'ci.test', errorCode: 'CI_SMOKE', errorMessage: 'isolated smoke test' },
  });
  assert.equal(unauthorizedSensor.status(), 401, 'Sensor must reject requests without bearer authentication');
  const sensorToken = process.env.ORBIT_SENSOR_INGEST_TOKEN || '';
  assert.ok(sensorToken.length >= 32, 'CI sensor token missing');
  const authorizedSensor = await page.request.post(base + '/api/sensor/ingest', {
    headers: { Authorization: 'Bearer ' + sensorToken },
    data: { appId: 'MIRAS', environment: 'staging', operationName: 'ci.visual.smoke', errorCode: 'CI_SMOKE', errorMessage: 'Synthetic browser-only verification of opt-in secure sensor' },
  });
  assert.equal(authorizedSensor.status(), 202, 'Authenticated staging sensor must accept a test event');
  const spoofedSensor = await page.request.post(base + '/api/sensor/ingest', {
    headers: { Authorization: 'Bearer ' + sensorToken },
    data: { appId: 'THRIVE', environment: 'staging', operationName: 'ci.spoof.attempt', errorCode: 'CI_SPOOF', errorMessage: 'A MIRAS credential must not impersonate another app' },
  });
  assert.equal(spoofedSensor.status(), 403, 'An app-scoped sensor credential must not impersonate another app');
  const hydrate = await page.request.post(base + '/api/state/hydrate', { data: state });
  assert.equal(hydrate.status(), 410, 'Client cloud snapshots must not overwrite shared server truth');
  const updatedState = await page.request.get(base + '/api/state');
  const newState = await updatedState.json();
  assert.ok(newState.events.some(event => event.appId === 'MIRAS' && event.dataIntegrity === 'Live'), 'Authenticated sensor event should be Live');

  await page.locator('.orbit-lock-control').click();
  await page.waitForSelector('#orbit-passkey-input', { state: 'visible', timeout: 10000 });
  const loggedOut = await page.request.get(base + '/api/state');
  assert.equal(loggedOut.status(), 401, 'Logout must revoke the server session');

  assert.deepEqual(runtimeErrors, [], 'Browser must not have uncaught runtime exceptions');
  console.log('ORBIT browser smoke PASS: login, auth, dashboard, fleet, mobile, tools, logout.');
} catch (err) {
  await page.screenshot({ path: 'test-artifacts/orbit-failure.png', fullPage: true }).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
