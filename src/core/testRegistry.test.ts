import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// `npm test` lists its files explicitly, so a new *.test.ts that is not added to
// the script would be silently skipped by CI. This guard makes that a failure.

function collectTests(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectTests(full, out);
    else if (name.endsWith('.test.ts')) out.push(full.split('\\').join('/'));
  }
  return out;
}

test('every *.test.ts file under src/ is listed in the npm test script', () => {
  const script: string = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
  const listed = new Set(script.split(/\s+/).filter((token) => token.endsWith('.test.ts')));
  const unlisted = collectTests('src').filter((file) => !listed.has(file));
  assert.deepEqual(unlisted, [], `add these to the "test" script in package.json: ${unlisted.join(', ')}`);
});

test('every test file named in the npm test script exists', () => {
  const script: string = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
  const missing = script
    .split(/\s+/)
    .filter((token) => token.endsWith('.test.ts'))
    .filter((file) => {
      try {
        return !statSync(file).isFile();
      } catch {
        return true;
      }
    });
  assert.deepEqual(missing, []);
});
