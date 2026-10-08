import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

function npm(args: string[], cwd: string): string {
  const npmCli = process.env.npm_execpath;
  return execFileSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...args] : args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

test('packed package supports isolatedModules and verbatimModuleSyntax consumers', (t) => {
  const consumer = mkdtempSync(path.join(tmpdir(), 'ahp-package-consumer-'));
  t.after(() => rmSync(consumer, { recursive: true, force: true }));

  // npm test builds first. Pack and install that artifact outside the checkout
  // so package exports and declarations are resolved just as for a consumer.
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', consumer], packageRoot));
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm([
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
    path.join(consumer, packed.filename),
  ], consumer);
  copyFileSync(new URL('./fixtures/package-consumer.ts', import.meta.url), path.join(consumer, 'index.ts'));

  for (const verbatimModuleSyntax of [false, true]) {
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        isolatedModules: true,
        verbatimModuleSyntax,
        skipLibCheck: false,
        types: [],
        outDir: './out',
      },
      files: ['index.ts'],
    }));
    execFileSync(process.execPath, [tsc, '-p', consumer], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync(process.execPath, [path.join(consumer, 'out/index.js')], { encoding: 'utf8', stdio: 'pipe' });
  }

  const dist = path.join(consumer, 'node_modules/@microsoft/agent-host-protocol/dist');
  const declarations = readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.d.ts'));
  assert.ok(declarations.length > 0, 'the package must contain declarations');
  for (const file of declarations) {
    assert.doesNotMatch(readFileSync(path.join(dist, file), 'utf8'), /\bdeclare\s+const\s+enum\b/, file);
  }
});
