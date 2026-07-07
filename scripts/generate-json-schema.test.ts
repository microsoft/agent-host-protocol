/**
 * Validates the generated JSON Schema files (schema/*.json) are self-contained
 * and strict-oneOf-safe. Guards the two correctness bugs fixed for
 * microsoft/agent-host-protocol#302:
 *   1. no `oneOf` branch is an empty `{}` schema (which matches any value and
 *      breaks strict `oneOf` validation for every union type alias), and
 *   2. no `$ref` is dangling (every `#/$defs/<name>` reference resolves to a
 *      defined `$def`, so each schema is self-contained).
 *
 * Run: npx tsx --test scripts/generate-json-schema.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILES = [
  'state.schema.json',
  'actions.schema.json',
  'commands.schema.json',
  'notifications.schema.json',
  'errors.schema.json',
];

type JsonNode = Record<string, unknown> | unknown[] | string | number | boolean | null;

function loadSchema(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, 'schema', file), 'utf-8'));
}

// Every `#/$defs/<name>` reference target reachable in the schema.
function collectRefTargets(node: JsonNode, acc: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefTargets(child as JsonNode, acc);
    return;
  }
  if (node && typeof node === 'object') {
    const ref = (node as Record<string, unknown>).$ref;
    if (typeof ref === 'string') {
      const m = ref.match(/^#\/\$defs\/(.+)$/);
      if (m) acc.add(m[1]);
    }
    for (const value of Object.values(node)) collectRefTargets(value as JsonNode, acc);
  }
}

// Count `oneOf` branches that are an empty `{}` (matches any value).
function countEmptyOneOfBranches(node: JsonNode): number {
  let count = 0;
  if (Array.isArray(node)) {
    for (const child of node) count += countEmptyOneOfBranches(child as JsonNode);
    return count;
  }
  if (node && typeof node === 'object') {
    const oneOf = (node as Record<string, unknown>).oneOf;
    if (Array.isArray(oneOf)) {
      count += oneOf.filter(
        (branch) => branch && typeof branch === 'object' && Object.keys(branch).length === 0,
      ).length;
    }
    for (const value of Object.values(node)) count += countEmptyOneOfBranches(value as JsonNode);
  }
  return count;
}

describe('generated JSON schemas', () => {
  for (const file of SCHEMA_FILES) {
    describe(file, () => {
      const schema = loadSchema(file);

      it('has no empty `{}` oneOf branch', () => {
        assert.equal(
          countEmptyOneOfBranches(schema as JsonNode),
          0,
          `${file} contains an empty {} oneOf branch (bug #302.1) — it matches any value and defeats strict oneOf validation`,
        );
      });

      it('has no dangling $ref (every referenced $def is defined)', () => {
        const targets = new Set<string>();
        collectRefTargets(schema as JsonNode, targets);
        const defs = new Set(Object.keys((schema.$defs as Record<string, unknown>) ?? {}));
        const dangling = [...targets].filter((name) => !defs.has(name)).sort();
        assert.deepEqual(
          dangling,
          [],
          `${file} references ${dangling.length} undefined $def(s) (bug #302.2): ${dangling.slice(0, 10).join(', ')}`,
        );
      });
    });
  }
});
