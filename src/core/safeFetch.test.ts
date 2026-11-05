import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHost, safeGet } from './safeFetch.ts';

test('assertPublicHost refuses local names, IP literals and IPv6 without touching DNS', async () => {
  for (const host of ['', 'localhost', 'app.localhost', 'printer.local', 'db.internal', '127.0.0.1', '10.0.0.5', '::1', 'LOCALHOST']) {
    await assert.rejects(() => assertPublicHost(host), /not a public hostname/, host);
  }
});

test('safeGet refuses non-https, credentials, custom ports and malformed urls before any request', async () => {
  const opts = { maxBytes: 1000 };
  for (const url of ['http://example.com/', 'https://user:pw@example.com/', 'https://example.com:8443/', 'not a url', 'https://localhost/', 'https://127.0.0.1/']) {
    assert.equal(await safeGet(url, opts), null, url);
  }
});
