import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Directories whose text is authored/hand-edited and should never contain a
 * secret-scanner redaction marker. `types/` is the canonical protocol source;
 * a redaction here silently corrupts every generated client and schema.
 */
const SCANNED_DIRS = ['types', 'docs'] as const;

/**
 * A secret-scanner redacts a matched token by substituting a run of asterisks.
 * We look for six or more consecutive asterisks, which never occurs in
 * legitimate prose, Markdown emphasis (`*`/`**`), or comment banners built from
 * this repo's own conventions. Built from a char class + quantifier so the
 * marker literal does not appear verbatim in this file (which lives outside the
 * scanned dirs, but keeping it out avoids any self-matching if that changes).
 */
const REDACTION_MARKER = new RegExp('\\*{6,}');

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', '.gradle', 'dist', 'target']);

function collectFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else {
      out.push(full);
    }
  }
}

describe('no redaction markers in authored sources', () => {
  it('has no secret-scanner redaction run under types/ or docs/', () => {
    const offences: string[] = [];
    for (const relDir of SCANNED_DIRS) {
      const files: string[] = [];
      collectFiles(join(root, relDir), files);
      for (const file of files) {
        const contents = readFileSync(file, 'utf8');
        if (!REDACTION_MARKER.test(contents)) {
          continue;
        }
        const lines = contents.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (REDACTION_MARKER.test(lines[i])) {
            // Report only the location, never the offending line: a genuine
            // future redaction hides a real secret, and echoing it would leak
            // it into CI logs.
            offences.push(`${relative(root, file)}:${i + 1}`);
          }
        }
      }
    }

    assert.deepEqual(
      offences,
      [],
      offences.length === 0
        ? ''
        : `Found secret-scanner redaction marker(s) (a run of 6+ asterisks) at:\n` +
            offences.map((o) => `  - ${o}`).join('\n') +
            `\nA secret-scanning tool likely corrupted authored text here. Restore the ` +
            `original wording from git history before the redaction (do not retype secrets).`,
    );
  });
});
