import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIconCandidates, iconsFromManifest, sniffImageMime, isUsableLogo, isPublicIp, discoverSiteLogo, declaredSize, resolveHttps,
} from './logo.ts';

const png = (side: number, extra = 100) => {
  const bytes = new Uint8Array(24 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, side); view.setUint32(20, side);
  return bytes;
};
const svg = (body = '<circle r="5"/>') => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">${body}</svg>`.padEnd(120, ' '));

test('icon links: apple-touch-icon beats a small favicon, urls are resolved and non-https is dropped', () => {
  const html = `<head>
    <link rel="icon" href="/favicon-16.png" sizes="16x16">
    <link rel="apple-touch-icon" sizes="180x180" href="/img/touch.png">
    <link rel="icon" href="http://insecure.example/x.png">
    <link rel="icon" href="data:image/png;base64,AAAA">
    <link rel="manifest" href="/site.webmanifest"></head>`;
  const { icons, manifestUrl } = extractIconCandidates(html, 'https://app.example/home');
  assert.equal(manifestUrl, 'https://app.example/site.webmanifest');
  assert.equal(icons.length, 2);
  const best = [...icons].sort((a, b) => b.score - a.score)[0];
  assert.equal(best.url, 'https://app.example/img/touch.png');
  assert.equal(best.kind, 'apple');
});

test('an SVG icon outranks plain bitmaps, an app icon outranks both; unquoted and single-quoted attributes are read', () => {
  const plain = extractIconCandidates(`<link rel=icon type=image/svg+xml href=/logo.svg><link rel='icon' href='/f.png' sizes='32x32'>`, 'https://x.example/');
  assert.equal([...plain.icons].sort((a, b) => b.score - a.score)[0].url, 'https://x.example/logo.svg');
  const withApp = extractIconCandidates(`<link rel=icon type=image/svg+xml href=/logo.svg><link rel='apple-touch-icon' href='/a.png' sizes='180x180'>`, 'https://x.example/');
  assert.equal([...withApp.icons].sort((a, b) => b.score - a.score)[0].url, 'https://x.example/a.png');
});

test('manifest icons: plain icons beat maskable ones and relative paths resolve against the manifest', () => {
  const icons = iconsFromManifest({ icons: [
    { src: 'icons/m.png', sizes: '512x512', purpose: 'maskable' },
    { src: 'icons/a.png', sizes: '192x192', purpose: 'any' },
    { src: 'javascript:alert(1)', sizes: '512x512' },
  ] }, 'https://x.example/app/manifest.json');
  assert.equal(icons.length, 2);
  const best = [...icons].sort((a, b) => b.score - a.score)[0];
  assert.equal(best.url, 'https://x.example/app/icons/a.png');
  assert.deepEqual(iconsFromManifest('nope', 'https://x.example/m.json'), []);
});

test('declared sizes and https-only resolution', () => {
  assert.equal(declaredSize('48x48 192x192'), 192);
  assert.equal(declaredSize('any'), 512);
  assert.equal(declaredSize(''), 0);
  assert.equal(resolveHttps('//cdn.example/i.png', 'https://x.example/'), 'https://cdn.example/i.png');
  assert.equal(resolveHttps('https://user:pw@x.example/i.png', 'https://x.example/'), null);
});

test('only real images are accepted: type comes from the bytes, not from a header', () => {
  assert.equal(sniffImageMime(png(64)), 'image/png');
  assert.equal(sniffImageMime(svg()), 'image/svg+xml');
  assert.equal(sniffImageMime(new TextEncoder().encode('<!doctype html><html>'.padEnd(120))), null);
  assert.equal(isUsableLogo(png(64)), 'image/png');
  assert.equal(isUsableLogo(png(16)), null, 'tiny bitmaps look blurry in a circle');
  assert.equal(isUsableLogo(png(64, 200_000)), null, 'oversized');
  assert.equal(isUsableLogo(svg('<script>alert(1)</script>')), null, 'active content');
  assert.equal(isUsableLogo(svg('<circle r="5" onload="x()"/>')), null);
});

test('private, loopback, link-local and metadata addresses are never public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '224.0.0.1']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '151.101.1.1', '2606:4700:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
});

test('discovery falls through a dead first candidate and returns the next usable image as a data URI', async () => {
  const good = png(180);
  const pages: Record<string, string> = {
    'https://app.example/': '<link rel="apple-touch-icon" sizes="180x180" href="/dead.png"><link rel="manifest" href="/m.json">',
    'https://app.example/m.json': JSON.stringify({ icons: [{ src: '/ok.png', sizes: '192x192', purpose: 'any' }] }),
  };
  const result = await discoverSiteLogo('https://app.example/some/page', {
    fetchText: async url => (pages[url] ? { text: pages[url], finalUrl: url } : null),
    fetchBytes: async url => (url === 'https://app.example/ok.png' ? good : null),
  });
  assert.equal(result?.sourceUrl, 'https://app.example/ok.png');
  assert.match(result?.dataUri || '', /^data:image\/png;base64,/);
});

test('discovery still tries the conventional favicon when the page itself cannot be read', async () => {
  const result = await discoverSiteLogo('https://down.example', {
    fetchText: async () => null,
    fetchBytes: async url => (url === 'https://down.example/favicon.svg' ? svg() : null),
  });
  assert.equal(result?.sourceUrl, 'https://down.example/favicon.svg');
  assert.equal(await discoverSiteLogo('http://insecure.example', { fetchText: async () => null, fetchBytes: async () => null }), null);
});
