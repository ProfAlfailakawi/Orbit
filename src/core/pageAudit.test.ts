import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHeaders, auditSnapshot, averageHash, crawlTargets, hashDistance, scanForSecrets, type PageSnapshot } from './pageAudit.ts';

const page = (over: Partial<PageSnapshot> = {}): PageSnapshot => ({
  lang: 'ar', direction: 'rtl', text: 'مرحبًا بك في الموقع، هذه صفحة سليمة فيها نص عربي كثير يكفي لاعتبارها صفحة عربية حقيقية للزائر.',
  overflowX: false, images: 4, brokenImages: 0, unnamedControls: 0, smallTargets: 0, consoleErrors: [], loadMs: 1200, ...over,
});

test('a healthy page has nothing to report', () => {
  assert.deepEqual(auditSnapshot(page()), { problems: [], warnings: [] });
  assert.deepEqual(auditSnapshot(page(), 'phone-slow'), { problems: [], warnings: [] });
});

test('visible placeholder and broken-value text are problems', () => {
  assert.match(auditSnapshot(page({ text: page().text + ' Lorem ipsum dolor sit amet' })).problems[0], /نص مؤقت منسي.*Lorem ipsum/);
  assert.match(auditSnapshot(page({ text: 'الرصيد: undefined ريال ' + page().text })).problems[0], /«undefined»/);
  assert.match(auditSnapshot(page({ text: 'العدد NaN' })).problems[0], /«NaN»/);
  assert.deepEqual(auditSnapshot(page({ text: 'unknownly undefinedness' })).problems, [], 'words that merely contain the token are fine');
});

test('phone-only and slow-link-only problems carry the device in their text', () => {
  assert.deepEqual(auditSnapshot(page({ overflowX: true }), 'desktop').problems, []);
  assert.match(auditSnapshot(page({ overflowX: true }), 'phone').problems[0], /^\[جوال\] الصفحة أعرض من شاشة الجوال/);
  assert.match(auditSnapshot(page({ loadMs: 14_000 }), 'phone-slow').problems[0], /^\[جوال بطيء\] .*14 ثانية/);
  assert.deepEqual(auditSnapshot(page({ loadMs: 14_000 }), 'phone').problems, []);
  assert.match(auditSnapshot(page({ loadMs: 9000 }), 'desktop').problems[0], /9 ثانية/);
});

test('images, browser errors and RTL mistakes', () => {
  assert.match(auditSnapshot(page({ brokenImages: 2 })).problems[0], /2 من 4 صور/);
  assert.match(auditSnapshot(page({ consoleErrors: ['TypeError: x', 'b'] })).problems[0], /TypeError: x \(\+1\)/);
  assert.match(auditSnapshot(page({ direction: 'ltr' })).problems[0], /من اليسار لليمين/);
  assert.deepEqual(auditSnapshot(page({ direction: 'ltr', text: 'Welcome to a plain English site' })).problems, []);
});

test('softer findings are warnings, not problems', () => {
  const a = auditSnapshot(page({ lang: '', unnamedControls: 3, text: page().text + ' This is a long untranslated English sentence here' }));
  assert.deepEqual(a.problems, []);
  assert.equal(a.warnings.length, 3);
  assert.match(auditSnapshot(page({ smallTargets: 5 }), 'phone').warnings[0], /5 عناصر ضغط/);
  assert.deepEqual(auditSnapshot(page({ smallTargets: 5 }), 'desktop').warnings, []);
  assert.deepEqual(auditSnapshot(page({ text: page().text + ' Powered by ORBIT' })).warnings, [], 'a brand name is not an untranslated sentence');
});

test('header hygiene', () => {
  assert.equal(auditHeaders({}).length, 3);
  assert.deepEqual(auditHeaders({ 'Strict-Transport-Security': 'max-age=1', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "frame-ancestors 'self'" }), []);
});

test('secrets in served files are named, never echoed', () => {
  const token = 'ghp_' + 'a'.repeat(36);
  const out = scanForSecrets(`const t="${token}"`, 'main.abc123.js');
  assert.equal(out.length, 1);
  assert.match(out[0], /مفتاح GitHub شخصي.*main\.abc123\.js/);
  assert.ok(!out[0].includes(token));
  assert.deepEqual(scanForSecrets('const key = "AIzaSyPublicFirebaseWebKey_isNotSecret_000000"', 'a.js'), []);
});

test('the crawl picks real same-origin pages and skips destructive or non-page links', () => {
  const out = crawlTargets([
    '/about', '/about/', '/about?x=1', 'https://other.app/x', 'http://a.app/insecure', '/logout', '/files/report.pdf',
    '/api/items', '/delete/3', '/contact#team', '/pricing', '/a', '/b', '/c', '/d',
  ], 'https://a.app/', 4);
  assert.deepEqual(out, ['https://a.app/about', 'https://a.app/contact', 'https://a.app/pricing', 'https://a.app/a']);
});

test('visual hash: same picture is distance 0, inverted picture is far', () => {
  const light = Array.from({ length: 64 }, (_, i) => (i % 8 < 4 ? 20 : 230));
  const dark = light.map(v => 250 - v);
  const a = averageHash(light);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(hashDistance(a, averageHash(light)), 0);
  assert.equal(hashDistance(a, averageHash(dark)), 64);
  assert.equal(hashDistance(a, 'zz'), 0, 'garbage compares as unchanged rather than raising an alarm');
  assert.throws(() => averageHash([1, 2]));
});
