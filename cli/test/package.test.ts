import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const directory = fileURLToPath(new URL('..', import.meta.url));

test('the standalone npm artifact installs its ahp executable without SDK or development dependencies', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ahp-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const npm = process.env.npm_execpath;
  assert.ok(npm, 'Run the package tests with npm test');
  const packed = await execute(process.execPath, [
    npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', root,
  ], { cwd: directory, timeout: 30_000 });
  const [artifact] = JSON.parse(packed.stdout);
  assert.equal(artifact.name, '@microsoft/agent-host-protocol-cli');
  assert.deepEqual(artifact.files.map((file: { path: string }) => file.path).sort(), [
    'CHANGELOG.md', 'LICENSE', 'README.md', 'dist/main.js', 'package.json',
  ]);
  await execute(process.execPath, [
    npm, 'install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund',
    join(root, artifact.filename),
  ], { timeout: 30_000 });
  const installed = join(root, 'node_modules', '@microsoft', 'agent-host-protocol-cli');
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.bin, { ahp: './dist/main.js' });
  const sourceManifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, { ws: sourceManifest.dependencies.ws });
  const websocket = JSON.parse(await readFile(join(root, 'node_modules', 'ws', 'package.json'), 'utf8'));
  assert.equal(websocket.name, 'ws');
  await assert.rejects(readFile(join(root, 'node_modules', '@microsoft', 'agent-host-protocol', 'package.json')),
    { code: 'ENOENT' });
  await assert.rejects(readFile(join(root, 'node_modules', 'tsx', 'package.json')), { code: 'ENOENT' });
  const discovered = await execute(process.execPath, [
    npm, 'exec', '--offline', '--', 'ahp', 'describe',
  ], { cwd: root, timeout: 30_000 });
  const result = JSON.parse(discovered.stdout.trim());
  assert.equal(result.kind, 'result');
  assert.equal(result.command, 'describe');
});
