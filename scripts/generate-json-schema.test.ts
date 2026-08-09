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

import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { typeAdmitsUndefined } from './generate-json-schema.js';

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
    const not = (node as Record<string, unknown>).not;
    if (not) collectRefTargets(not as JsonNode, acc);
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

function dereferenceSchema(
  root: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const ref = schema.$ref;
  if (typeof ref !== 'string') {
    return schema;
  }
  const match = ref.match(/^#\/\$defs\/(.+)$/);
  assert.ok(match, `unsupported schema ref: ${ref}`);
  const defs = root.$defs as Record<string, Record<string, unknown>>;
  const resolved = defs[match[1]];
  assert.ok(resolved, `missing schema def for ${ref}`);
  return resolved;
}

function schemaAccepts(
  root: Record<string, unknown>,
  node: JsonNode,
  value: unknown,
): boolean {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return true;
  }

  const schema = dereferenceSchema(root, node as Record<string, unknown>);
  const oneOf = schema.oneOf;
  if (Array.isArray(oneOf)) {
    return oneOf.filter(branch => schemaAccepts(root, branch as JsonNode, value)).length === 1;
  }

  const allOf = schema.allOf;
  if (Array.isArray(allOf)) {
    return allOf.every(branch => schemaAccepts(root, branch as JsonNode, value));
  }

  if (schema.not) {
    return !schemaAccepts(root, schema.not as JsonNode, value);
  }

  if ('const' in schema) {
    return value === schema.const;
  }

  if (schema.type === 'object' || schema.required || schema.properties) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some((property) => !(property in record))) {
      return false;
    }
    const properties = (schema.properties as Record<string, JsonNode> | undefined) ?? {};
    return Object.entries(properties).every(([name, propertySchema]) => {
      if (!(name in record)) {
        return true;
      }
      return schemaAccepts(root, propertySchema, record[name]);
    });
  }

  switch (schema.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
  }

  return true;
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

      it('preserves nested automation capability objects', () => {
        if (file !== 'commands.schema.json') {
          return;
        }
        const defs = schema.$defs as Record<string, Record<string, unknown>>;
        const schedules = defs.AutomationScheduleCapabilities;
        const properties = schedules.properties as Record<string, Record<string, unknown>>;
        assert.deepEqual(properties.cron.$ref, '#/$defs/AutomationCronScheduleCapability');
        const cron = defs.AutomationCronScheduleCapability;
        const cronProperties = cron.properties as Record<string, Record<string, unknown>>;
        assert.deepEqual(cronProperties.dialect.enum, ['unix5']);
        assert.equal(cronProperties.minIntervalMinutes.type, 'number');
      });

      it('constrains every ChatOrigin branch to a distinct kind', () => {
        const defs = schema.$defs as Record<string, Record<string, unknown>>;
        const chatOrigin = defs.ChatOrigin;
        const branches = chatOrigin.oneOf as Array<Record<string, unknown>>;
        const kinds = branches.map((branch) => {
          const properties = branch.properties as Record<string, Record<string, unknown>>;
          return properties.kind.const;
        });

        assert.deepEqual(kinds, ['user', 'fork', 'sideChat', 'tool']);
      });

      it('requires stable top-level turn identifiers for fork and side-chat provenance', () => {
        const defs = schema.$defs as Record<string, Record<string, unknown>>;
        const chatOrigin = defs.ChatOrigin;
        const branches = chatOrigin.oneOf as Array<Record<string, unknown>>;
        const branchByKind = new Map(
          branches.map((branch) => {
            const properties = branch.properties as Record<string, Record<string, unknown>>;
            return [properties.kind.const as string, properties];
          }),
        );

        assert.deepEqual(branchByKind.get('fork')?.turnId?.type, 'string');
        assert.deepEqual(branchByKind.get('sideChat')?.turnId?.type, 'string');
        assert.deepEqual(branchByKind.get('sideChat')?.selection?.$ref, '#/$defs/SideChatSelection');

        const chatSource = defs.ChatSource;
        if (chatSource) {
          assert.deepEqual(defs.ForkChatSource?.properties?.kind?.const, 'fork');
          assert.deepEqual(defs.ForkChatSource?.properties?.turnId?.type, 'string');
          assert.deepEqual(defs.SideChatSource?.properties?.kind?.const, 'sideChat');
          assert.deepEqual(defs.SideChatSource?.properties?.turnId?.type, 'string');
          assert.deepEqual(defs.SideChatSource?.properties?.selection?.$ref, '#/$defs/SideChatSelection');
          assert.equal(defs.SideChatSource?.properties?.turn, undefined);
        }

        assert.deepEqual(defs.SideChatSelection?.required, ['text']);
        assert.deepEqual(defs.SideChatSelection?.properties?.text?.type, 'string');
        assert.deepEqual(defs.SideChatSelection?.properties?.responsePartId?.type, 'string');
      });

      it('accepts valid discriminated ChatSource payloads and rejects missing or unknown kinds', () => {
        const defs = schema.$defs as Record<string, Record<string, unknown>>;
        const chatSource = defs.ChatSource;
        if (!chatSource) {
          return;
        }

        assert.equal(
          schemaAccepts(schema, chatSource, {
            kind: 'fork',
            chat: 'ahp-chat:/source',
            turnId: 'turn-1',
          }),
          true,
        );
        assert.equal(
          schemaAccepts(schema, chatSource, {
            kind: 'sideChat',
            chat: 'ahp-chat:/source',
            turnId: 'turn-1',
            selection: {
              text: 'selected text',
              responsePartId: 'part-1',
            },
          }),
          true,
        );
        assert.equal(
          schemaAccepts(schema, chatSource, {
            chat: 'ahp-chat:/source',
            turnId: 'turn-1',
          }),
          false,
        );
        assert.equal(
          schemaAccepts(schema, chatSource, {
            kind: 'sideChat',
            chat: 'ahp-chat:/source',
            turnId: 'turn-1',
            selection: {},
          }),
          false,
        );
        assert.equal(
          schemaAccepts(schema, chatSource, {
            kind: 'unknown',
            chat: 'ahp-chat:/source',
            turnId: 'turn-1',
          }),
          false,
        );
      });
    });
  }
});

describe('typeAdmitsUndefined', () => {
  // Guards the depth-aware union splitting these checks depend on: only a
  // *top-level* `undefined` member means the property may be absent on the
  // wire. A nested one (inside a generic argument, tuple, parenthesised union
  // or inline object) does not — the property itself is still always present.

  const admits: string[] = [
    'string | undefined',
    'undefined | string',
    'UsageInfo | undefined',
    'Changeset[] | undefined',
    'Record<string, unknown> | undefined',
    'A | B | undefined',
    '  string   |   undefined  ',
  ];

  const doesNotAdmit: string[] = [
    'string',
    'UsageInfo',
    'A | B',
    'Array<string | undefined>',
    'Record<string, string | undefined>',
    '[string | undefined]',
    '[ string | undefined ]',
    '{ a: string | undefined }',
    '(string | undefined)[]',
    'Map<string, A | undefined>',
  ];

  for (const typeText of admits) {
    it(`treats \`${typeText.trim()}\` as admitting undefined`, () => {
      assert.equal(typeAdmitsUndefined(typeText), true);
    });
  }

  for (const typeText of doesNotAdmit) {
    it(`treats \`${typeText}\` as NOT admitting undefined`, () => {
      assert.equal(typeAdmitsUndefined(typeText), false);
    });
  }
});

describe('`T | undefined` properties are not schema-required', () => {
  // The protocol writes a handful of properties as an explicit `T | undefined`
  // union rather than with a `?` question token, so that a producer building the
  // object literal in TypeScript is forced to mention the key and consciously
  // choose between a value and a clear (e.g. `session/activityChanged` clearing
  // the activity string).
  //
  // That is an authoring-time constraint only. `JSON.stringify` drops
  // `undefined` members, so on the wire such a property is simply **absent**,
  // exactly like an optional one — and every language generator emits it as
  // optional (`Option<T>` + `skip_serializing_if`, `*T` + `omitempty`,
  // `T? = null`). Listing them under `required` made the published schemas
  // reject the very traffic all five clients produce.
  //
  // Derived from the canonical sources rather than hardcoded, so a newly added
  // `T | undefined` property is covered automatically. Classification reuses the
  // generator's own `typeAdmitsUndefined` so the test and the generator can
  // never disagree about what qualifies (in particular, both treat only
  // *top-level* union members as admitting `undefined`).

  /** `interface name` → property names declared as an explicit `T | undefined` union. */
  const undefinedProps = new Map<string, Set<string>>();

  // Built lazily in `before` rather than at module load: constructing a ts-morph
  // Project is expensive, and doing it in the describe body would pay that cost
  // even when running a filtered subset of tests from this file.
  before(() => {
    const project = new Project({
      tsConfigFilePath: resolve(root, 'types/tsconfig.json'),
      skipAddingFilesFromTsConfig: false,
    });

    for (const sourceFile of project.getSourceFiles()) {
      for (const iface of sourceFile.getInterfaces()) {
        for (const prop of iface.getProperties()) {
          if (prop.hasQuestionToken()) {
            continue;
          }
          if (!typeAdmitsUndefined(prop.getTypeNode()?.getText() ?? '')) {
            continue;
          }
          let set = undefinedProps.get(iface.getName());
          if (!set) {
            set = new Set();
            undefinedProps.set(iface.getName(), set);
          }
          set.add(prop.getName());
        }
      }
    }
  });

  it('finds the known `T | undefined` properties in types/', () => {
    // Sanity-check the derivation itself: if this drops to zero because the
    // extraction broke, the per-schema assertions below would vacuously pass.
    assert.ok(
      undefinedProps.size > 0,
      'expected to find at least one `T | undefined` property in types/ — the extraction is probably broken',
    );
  });

  for (const file of SCHEMA_FILES) {
    it(`${file} marks none of them required`, () => {
      const schema = loadSchema(file);
      const defs = (schema.$defs as Record<string, Record<string, unknown>>) ?? {};
      const offenders: string[] = [];

      for (const [typeName, properties] of undefinedProps) {
        const def = defs[typeName];
        if (!def) {
          continue;
        }
        const required = Array.isArray(def.required) ? (def.required as string[]) : [];
        const declared = (def.properties as Record<string, unknown> | undefined) ?? {};
        for (const property of properties) {
          if (required.includes(property)) {
            offenders.push(`${typeName}.${property} is listed as required`);
          }
          // It must still be *declared* — dropping it from `required` is only
          // correct if the property itself is still described.
          if (!(property in declared)) {
            offenders.push(`${typeName}.${property} is missing from properties`);
          }
        }
      }

      assert.deepEqual(
        offenders.sort(),
        [],
        `${file}: a \`T | undefined\` property must be optional-but-declared, since it is absent on the wire and every client emits it as optional:\n  ${offenders.join('\n  ')}`,
      );
    });
  }
});
