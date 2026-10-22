import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSiteCandidates, chooseLiveSite, toOrigin, deployWorkflowPaths } from './siteDiscovery.ts';

const best = (texts: Record<string, string>, homepage?: string) => extractSiteCandidates(texts, homepage)[0]?.url;

test('hosting config names the site: firebase.json site, or a target resolved through .firebaserc', () => {
  assert.equal(best({ 'firebase.json': JSON.stringify({ hosting: { site: 'tebyan-clean-2026', public: 'dist' } }), '.firebaserc': '{"projects":{"default":"tebyan-clean-2026"}}' }), 'https://tebyan-clean-2026.web.app');
  assert.equal(best({ 'firebase.json': '{"hosting":{"target":"mirasedu"}}', '.firebaserc': '{"projects":{"default":"meras-320eb"},"targets":{"meras-320eb":{"hosting":{"mirasedu":["mirasedu"]}}}}' }), 'https://mirasedu.web.app');
});

test('several hosted sites: the one the docs actually mention ranks first', () => {
  const texts = {
    'firebase.json': JSON.stringify({ hosting: [{ site: 'academicos-kw' }, { site: 'academicos-edu' }] }),
    'README.md': 'Live: https://academicos-edu.web.app and https://academicos-edu.web.app/login',
  };
  assert.equal(best(texts), 'https://academicos-edu.web.app');
});

test('a custom domain (canonical, sitemap) outranks the web.app address; paths are dropped', () => {
  const texts = {
    'firebase.json': '{"hosting":{"site":"dr-alfailakawi"}}',
    'public/sitemap.xml': '<urlset><url><loc>https://dr-alfailakawi.com/</loc></url></urlset>',
    'index.html': '<link rel="canonical" href="https://dr-alfailakawi.com/ar/home">',
  };
  const ranked = extractSiteCandidates(texts);
  assert.equal(ranked[0].url, 'https://dr-alfailakawi.com');
  assert.ok(ranked[0].sources.includes('canonical') && ranked[0].sources.includes('sitemap'));
  assert.equal(ranked[1].url, 'https://dr-alfailakawi.web.app');
});

test('placeholders, localhost and non-https schemes are never evidence', () => {
  assert.equal(toOrigin('https://example.web.app/x'), null);
  assert.equal(toOrigin('https://mizan-xxxx.run.app'), null);
  assert.equal(toOrigin('http://localhost:3000'), null);
  assert.equal(toOrigin('ftp://files.example.org'), null);
  assert.equal(toOrigin('https://Mizan-Quran.WEB.app/legal/terms'), 'https://mizan-quran.web.app');
  assert.deepEqual(extractSiteCandidates({ 'README.md': 'try https://example.web.app and http://localhost:5173' }), []);
});

test('the project default is only a weak hint when hosting names its own site', () => {
  const texts = { 'firebase.json': '{"hosting":{"site":"alturath-admin-0200723670"}}', '.firebaserc': '{"projects":{"default":"gen-lang-client-0200723670"}}' };
  assert.equal(best(texts), 'https://alturath-admin-0200723670.web.app');
  assert.equal(extractSiteCandidates(texts).some(c => c.url.includes('gen-lang-client')), false);
  assert.equal(best({ '.firebaserc': '{"projects":{"default":"nahj-a27a4"}}' }), 'https://nahj-a27a4.web.app');
});

test('the first candidate that is really live wins; dead hosts are skipped', async () => {
  const ranked = extractSiteCandidates({ 'firebase.json': '{"hosting":[{"site":"dead-one"},{"site":"live-one"}]}', 'README.md': 'https://live-one.web.app' });
  const chosen = await chooseLiveSite(ranked, async url => url.includes('live-one'));
  assert.equal(chosen?.url, 'https://live-one.web.app');
  assert.equal(await chooseLiveSite(ranked, async () => false), null);
});

test('only deploy-like workflow files are worth reading', () => {
  assert.deepEqual(deployWorkflowPaths(['.github/workflows/ci.yml', '.github/workflows/deploy.yml', '.github/workflows/deploy-watchdog.yml', 'src/x.ts']), ['.github/workflows/deploy.yml', '.github/workflows/deploy-watchdog.yml']);
});

test('a site the owner confirmed by name is used as given', async () => {
  const { confirmedSite } = await import('./ownerSites.ts');
  assert.equal(confirmedSite('nahj'), 'https://nahjq8.ai.studio');
  assert.equal(confirmedSite('MIRAS'), null);
});
