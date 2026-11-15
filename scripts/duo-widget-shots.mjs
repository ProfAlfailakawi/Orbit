#!/usr/bin/env node
// iPhone Duo widget corner: before/after screenshots with the reserved zone drawn as a translucent red frame.
//   node scripts/duo-widget-shots.mjs <before|after> [baseUrl] [outDir]
// WebKit via PW_MODULE (global playwright) and PLAYWRIGHT_BROWSERS_PATH. The frame uses the nominal measured zone
// (96 px wide, clamp(64px, 31vh, 270px) high), NOT the page's own variables, so "before" shows the same box.
import fs from 'node:fs/promises';
const { webkit } = await import(process.env.PW_MODULE || 'playwright');
const tag = process.argv[2] || 'after';
const base = (process.argv[3] || 'http://127.0.0.1:5160').replace(/\/$/, '');
const out = process.argv[4] || 'docs/iphone-duo-widget-corner';
await fs.mkdir(out, { recursive: true });
const SIZES = [[382, 580], [669, 867], [951, 585]];
const browser = await webkit.launch();
let n = 0;
for (const [w, h] of SIZES) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.88.0.${++n + 10}` }, viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'ar-KW', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.btn-demo').waitFor({ timeout: 20000 });
  await page.locator('.btn-demo').click();
  await page.locator('.rs').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const vh = window.innerHeight, zh = Math.min(270, Math.max(64, vh * 0.31));
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;right:0;top:0;width:96px;height:${zh}px;border:2px solid rgba(255,0,0,.9);background:rgba(255,0,0,.12);pointer-events:none;z-index:99999;box-sizing:border-box`;
    document.body.appendChild(d);
  });
  await page.screenshot({ path: `${out}/${tag}-${w}x${h}.png`, type: 'png' });
  await context.close();
}
await browser.close();
