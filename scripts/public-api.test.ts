/**
 * Asserts that every public protocol declaration is reachable from
 * `types/index.ts`, which is the published TypeScript client's root export.
 *
 * Run: npx tsx --test scripts/public-api.test.ts
 */

import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Declarations deliberately withheld from the entry point. */
const INTENTIONALLY_INTERNAL: ReadonlySet<string> = new Set([
  'softAssertNever', // reducer-internal exhaustiveness helper
]);

const CHANNEL_MODULE_RE = /types[\\/](common|channels-[a-z-]+)[\\/]/;

describe('public API surface', () => {
  let declared: Set<string>;
  let exported: Set<string>;

  before(() => {
    const project = new Project({
      tsConfigFilePath: resolve(root, 'types/tsconfig.json'),
      skipAddingFilesFromTsConfig: false,
    });

    declared = new Set<string>();
    for (const sourceFile of project.getSourceFiles()) {
      const filePath = sourceFile.getFilePath();
      if (!CHANNEL_MODULE_RE.test(filePath)) continue;
      if (filePath.endsWith('.test.ts')) continue;
      for (const name of sourceFile.getExportedDeclarations().keys()) {
        declared.add(name);
      }
    }

    exported = new Set(
      project.getSourceFileOrThrow(resolve(root, 'types/index.ts'))
        .getExportedDeclarations()
        .keys(),
    );
  });

  it('finds the protocol declarations (guards the extraction itself)', () => {
    assert.ok(declared.size > 100, `found only ${declared.size} declarations — the extraction is probably broken`);
    assert.ok(exported.size > 100, `types/index.ts re-exports only ${exported.size} declarations`);
  });

  it('re-exports every public declaration from types/index.ts', () => {
    const missing = [...declared]
      .filter(name => !exported.has(name) && !INTENTIONALLY_INTERNAL.has(name))
      .sort();

    assert.deepEqual(
      missing,
      [],
      `${missing.length} declaration(s) unreachable from types/index.ts, so consumers of the published package cannot name them:\n  ${missing.join('\n  ')}`,
    );
  });

  it('keeps every intentionally-internal declaration internal', () => {
    const leaked = [...INTENTIONALLY_INTERNAL].filter(name => exported.has(name)).sort();

    assert.deepEqual(
      leaked,
      [],
      `${leaked.length} internal declaration(s) are now exported — remove them from INTENTIONALLY_INTERNAL if that is intended:\n  ${leaked.join('\n  ')}`,
    );
  });
});
