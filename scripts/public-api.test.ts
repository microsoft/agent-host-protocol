/**
 * Asserts that every public protocol declaration is reachable from the
 * package entry point (`types/index.ts`).
 *
 * `types/index.ts` is copied verbatim into the published TypeScript client and
 * is its root export, so anything unreachable from here is unreachable for
 * consumers of `@microsoft/agent-host-protocol`. It used to be a hand-written
 * allowlist, which silently fell 60 declarations behind the sources — the whole
 * customization subsystem (`Customization`, `CustomizationType`, every variant),
 * the whole MCP-server state machine (`McpServerState` and friends), 13 action
 * types, and assorted others such as `Icon` and `ChatInteractivity`.
 *
 * The barrel now uses `export *`, so this guards against a regression in that
 * mechanism (for example a name collision resolved by dropping one side, which
 * TypeScript will not otherwise flag).
 *
 * Run: npx tsx --test scripts/public-api.test.ts
 */

import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Declarations that are intentionally absent from the public entry point.
 * Keep this as small as possible and justify every entry — an addition here is
 * a decision to withhold something from consumers.
 */
const INTENTIONALLY_INTERNAL: ReadonlySet<string> = new Set([
  // Reducer-internal exhaustiveness helper. Re-exported by the `reducers.ts`
  // shim for the per-channel reducers, but not part of the protocol surface.
  'softAssertNever',
]);

/** Canonical source folders holding protocol declarations. */
const CHANNEL_MODULE_RE = /types[\\/](common|channels-[a-z-]+)[\\/]/;

describe('public API surface', () => {
  let declared: Set<string>;
  let exported: Set<string>;

  before(() => {
    // Built here rather than at module load so the cost is only paid when this
    // suite actually runs.
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
    // Without this, a broken walk would make the assertions below vacuous.
    assert.ok(
      declared.size > 100,
      `expected to find many protocol declarations, found ${declared.size} — the extraction is probably broken`,
    );
    assert.ok(
      exported.size > 100,
      `expected types/index.ts to re-export many declarations, found ${exported.size}`,
    );
  });

  it('re-exports every public declaration from types/index.ts', () => {
    const missing = [...declared]
      .filter(name => !exported.has(name) && !INTENTIONALLY_INTERNAL.has(name))
      .sort();

    assert.deepEqual(
      missing,
      [],
      `${missing.length} public declaration(s) are unreachable from types/index.ts, so consumers of the published package cannot name them:\n  ${missing.join('\n  ')}`,
    );
  });

  it('keeps every intentionally-internal declaration internal', () => {
    // The flip side: if something on the withhold-list becomes reachable, the
    // list is stale and should be pruned rather than silently ignored.
    const leaked = [...INTENTIONALLY_INTERNAL].filter(name => exported.has(name)).sort();

    assert.deepEqual(
      leaked,
      [],
      `${leaked.length} declaration(s) marked internal are now exported from types/index.ts — either that is a mistake, or they should be removed from INTENTIONALLY_INTERNAL:\n  ${leaked.join('\n  ')}`,
    );
  });
});
