/** Materialize released documentation from git tags for VitePress. */

import { execFileSync, spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import {
  STABLE_DOC_VERSIONS,
  VERSIONED_SECTIONS,
  VERSIONS_DIR,
} from '../docs/.vitepress/versions.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', VERSIONS_DIR);

function waitForExit(child: ChildProcess, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function extractTag(tag: string, directory: string): Promise<void> {
  const archive = spawn('git', ['archive', '--format=tar', tag], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const extract = spawn('tar', ['-x', '-C', directory], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  // Wait for both processes and the pipe before cleaning up the extraction.
  const results = await Promise.allSettled([
    waitForExit(archive, `git archive ${tag}`),
    waitForExit(extract, 'tar'),
    pipeline(archive.stdout!, extract.stdin!),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
}

async function materialize(version: string): Promise<void> {
  const tag = `v${version}`;
  let sha: string;
  try {
    sha = execFileSync('git', ['rev-parse', `${tag}^{commit}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(`Cannot resolve documentation tag ${tag}. Run git fetch --tags and try again.`);
  }

  const output = path.join(OUTPUT, version);
  const stamp = path.join(output, '.stamp');
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === sha) {
    console.log(`[docs:versions] ${version} up to date`);
    return;
  }

  console.log(`[docs:versions] materializing ${version} from ${tag} (${sha.slice(0, 7)})`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ahp-docs-'));
  try {
    await extractTag(tag, directory);
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
    execFileSync('npx', ['tsx', 'scripts/generate.ts', '--docs'], {
      cwd: directory,
      stdio: 'inherit',
    });

    const sidebarFile = path.join(directory, 'sidebar.json');
    execFileSync('npx', ['tsx', '--eval', `
      import { writeFileSync } from 'node:fs';
      import('./docs/.vitepress/config.mts').then(({ default: config }) => {
        writeFileSync(process.env.AHP_DOCS_SIDEBAR, JSON.stringify(config.themeConfig.sidebar));
      });
    `], {
      cwd: directory,
      stdio: 'inherit',
      env: { ...process.env, AHP_DOCS_SIDEBAR: sidebarFile },
    });
    const sidebar = JSON.parse(fs.readFileSync(sidebarFile, 'utf8')) as Record<string, unknown>;
    const filteredSidebar: Record<string, unknown> = {};
    for (const section of VERSIONED_SECTIONS) {
      const key = `/${section}/`;
      if (key in sidebar) filteredSidebar[key] = sidebar[key];
    }

    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(output, { recursive: true });
    for (const section of VERSIONED_SECTIONS) {
      const source = path.join(directory, 'docs', section);
      if (fs.existsSync(source)) fs.cpSync(source, path.join(output, section), { recursive: true });
    }
    fs.writeFileSync(path.join(output, 'sidebar.json'), JSON.stringify(filteredSidebar, null, 2) + '\n');
    fs.writeFileSync(stamp, sha + '\n');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT, { recursive: true });
  for (const version of STABLE_DOC_VERSIONS) await materialize(version);
  for (const entry of fs.readdirSync(OUTPUT, { withFileTypes: true })) {
    if (entry.isDirectory() && !STABLE_DOC_VERSIONS.includes(entry.name)) {
      fs.rmSync(path.join(OUTPUT, entry.name), { recursive: true, force: true });
      console.log(`[docs:versions] removed ${entry.name}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(`[docs:versions] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
