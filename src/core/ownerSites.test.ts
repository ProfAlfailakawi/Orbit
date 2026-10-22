import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_CONFIRMED_SITES, confirmedSite } from './ownerSites.ts';
import { INITIAL_PLATFORMS } from './seedData.ts';
import { originOf } from './sensor.ts';

test('every confirmed site belongs to a real program and is a bare https origin', () => {
  const codes = new Set(INITIAL_PLATFORMS.map(p => p.codeName.toUpperCase()));
  for (const [code, url] of Object.entries(OWNER_CONFIRMED_SITES)) {
    assert.ok(codes.has(code), `${code} is not a program in the catalog`);
    assert.equal(originOf(url), url, `${code}: ${url} must be exactly an https origin (no path, no trailing slash)`);
  }
});

test('two programs never share an origin, or the sensor could not tell their reports apart', () => {
  const urls = Object.values(OWNER_CONFIRMED_SITES);
  assert.equal(new Set(urls).size, urls.length);
});

test('lookups ignore case, and an unknown program has no confirmed site', () => {
  assert.equal(confirmedSite('majal'), 'https://majal.web.app');
  assert.equal(confirmedSite('dr.ahmad'), 'https://dr-alfailakawi.com');
  assert.equal(confirmedSite('ALFA'), null);
});
