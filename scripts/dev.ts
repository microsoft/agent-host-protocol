/**
 * Dev server — watches types/ for changes, regenerates docs, and runs VitePress dev server.
 */

import { spawn, type ChildProcess } from 'child_process';
import { watch } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TYPES_DIR = path.join(ROOT, 'types');

let generating = false;
let queued = false;

function generate(): void {
  if (generating) {
    queued = true;
    return;
  }
  generating = true;
  console.log('\x1b[36m[dev]\x1b[0m types changed — regenerating docs...');

  const proc = spawn('npx tsx scripts/generate.ts --docs', {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });

  proc.on('close', (code) => {
    generating = false;
    if (code === 0) {
      console.log('\x1b[36m[dev]\x1b[0m docs regenerated ✓');
    } else {
      console.error('\x1b[31m[dev]\x1b[0m generation failed (exit ' + code + ')');
    }
    if (queued) {
      queued = false;
      generate();
    }
  });
}

// Initial generation
console.log('\x1b[36m[dev]\x1b[0m initial generation...');
const initial = spawn('npx tsx scripts/generate.ts && npx tsx scripts/build-doc-versions.ts', {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});

initial.on('close', (code) => {
  if (code !== 0) {
    console.error('\x1b[31m[dev]\x1b[0m initial generation failed');
    process.exit(1);
  }

  // Start VitePress dev server
  console.log('\x1b[36m[dev]\x1b[0m starting VitePress dev server...');
  const vitepress = spawn('npx vitepress dev docs', {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });

  vitepress.on('close', (code) => {
    process.exit(code ?? 0);
  });

  // Watch types/ directory for changes
  console.log('\x1b[36m[dev]\x1b[0m watching types/ for changes...');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(TYPES_DIR, { recursive: true }, (_event, filename) => {
    if (!filename || !filename.endsWith('.ts')) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => generate(), 200);
  });

  // Forward signals to VitePress
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      vitepress.kill(signal);
      process.exit();
    });
  }
});
