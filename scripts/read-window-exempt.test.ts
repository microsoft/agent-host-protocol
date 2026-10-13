import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { generateWindowExempt, readWindowExemptMethods } from './read-window-exempt.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const project = new Project({ tsConfigFilePath: resolve(root, 'types/tsconfig.json') });
const methods = readWindowExemptMethods(project);

function fixtureProject(declaration: string): Project {
  const fixture = new Project({ useInMemoryFileSystem: true });
  fixture.createSourceFile('/types/common/notifications.ts', declaration);
  return fixture;
}

test('window-exempt methods are read from the @windowExempt annotations', () => {
  assert.deepEqual(methods, ['channel/credit', 'tcp/reset', 'unsubscribe']);
});

test('the committed window-exempt.generated.ts matches the annotations', () => {
  const out = mkdtempSync(join(tmpdir(), 'ahp-window-exempt-'));
  try {
    generateWindowExempt(new Project({ tsConfigFilePath: resolve(root, 'types/tsconfig.json') }), out);
    assert.equal(
      readFileSync(resolve(root, 'types/window-exempt.generated.ts'), 'utf8'),
      readFileSync(join(out, 'window-exempt.generated.ts'), 'utf8'),
      'types/window-exempt.generated.ts is stale; run npm run generate',
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the windowed delivery spec lists exactly the window-exempt methods', () => {
  const spec = readFileSync(resolve(root, 'docs/specification/windowed-delivery.md'), 'utf8');
  const section = spec.split('## Control Messages\n')[1]?.split('\n## ')[0];
  assert.ok(section, 'Control Messages section must exist');
  const tableMethods = [...section.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]);
  const mentioned = new Set([...section.matchAll(/`([a-z]+\/[A-Za-z]+|unsubscribe)`/g)].map(match => match[1]));
  for (const method of tableMethods) assert.ok(methods.includes(method), `${method} is in the table but not @windowExempt`);
  for (const method of methods) assert.ok(mentioned.has(method), `${method} is @windowExempt but not in the Control Messages section`);
});

test('channel specs that show window counting agree with the annotations', () => {
  const tcp = readFileSync(resolve(root, 'docs/specification/tcp-channel.md'), 'utf8');
  const rows = [...tcp.matchAll(/^\| `(tcp\/[a-z]+)` \|[^\n]*\| (Yes|No) \|$/gm)];
  assert.ok(rows.length >= 3, 'TCP notification table must have a window column');
  for (const [, method, counts] of rows) {
    assert.equal(counts === 'No', methods.includes(method), `${method}: TCP spec says "${counts}"`);
  }
});

test('@windowExempt is rejected on requests, with a value, or when repeated', () => {
  const invalid = [
    '/**\n * @method example\n * @messageType Request\n * @windowExempt\n */\nexport interface ExampleParams {}',
    '/**\n * @method example\n * @messageType Notification\n * @windowExempt yes\n */\nexport interface ExampleParams {}',
    '/**\n * @method example\n * @messageType Notification\n * @windowExempt\n * @windowExempt\n */\nexport interface ExampleParams {}',
    '/**\n * @messageType Notification\n * @windowExempt\n */\nexport interface ExampleParams {}',
  ];
  for (const declaration of invalid) {
    assert.throws(() => readWindowExemptMethods(fixtureProject(declaration)), /@windowExempt/);
  }
  const valid = '/**\n * @method example/control\n * @messageType Notification\n * @windowExempt\n */\nexport interface ExampleParams {}';
  assert.deepEqual(readWindowExemptMethods(fixtureProject(valid)), ['example/control']);
});
