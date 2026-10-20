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
  assert.equal(state.incidents.some(i => i.appId === 'ORBIT-CANARY' && i.dataIntegrity === 'Live'), false, 'Test incidents must not be treated as live');

  await page.screenshot({ path: 'test-artifacts/orbit-desktop.png', fullPage: true });
  await page.locator('.orbit-filter-tabs button').last().click();
  await page.locator('.orbit-filter-tabs button').first().click();
  await page.locator('.orbit-app-card').first().click();
  assert.equal(await page.locator('.orbit-executive').count(), 0, 'Program detail navigation not working');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.orbit-mobile-tab').first().click();
  await page.waitForSelector('.orbit-executive', { state: 'visible' });
  await page.screenshot({ path: 'test-artifacts/orbit-mobile.png', fullPage: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 3);
  assert.equal(overflow, false, 'Mobile viewport has horizontal overflow');

  await page.locator('.orbit-mobile-tab').nth(1).click();
  await page.locator('.orbit-mobile-tab').first().click();
  await page.locator('.orbit-tools-menu > summary').click();
  assert.equal(await page.locator('.orbit-tools-popover').isVisible(), true, 'Utility menu should open');
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
