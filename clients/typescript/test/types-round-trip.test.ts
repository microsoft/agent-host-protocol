/**
 * types-round-trip.test.ts — data-driven wire round-trip parity for TypeScript.
 *
 * Loads the SHARED, language-agnostic round-trip corpus under
 * `types/test-cases/round-trips/*.json` and round-trips each through
 * `JSON.parse` -> `JSON.stringify`.
 *
 * SCOPE — what this harness does and does NOT verify. TypeScript types are
 * erased at runtime, so this exercises TypeScript's *runtime wire behavior*
 * (JSON.parse/stringify) and the *fixtures' self-consistency* — NOT the
 * correctness of the generated TypeScript types. `bindToType` (below) is a
 * compile-time `as T` annotation that is erased at runtime, and because `parsed`
 * is `unknown` it narrows nothing at compile time either; it documents the
 * intended type per wire `type` but does not catch a wrong generated type
 * (renamed field, wrong optionality, SessionStatus typed as a string, ...).
 * Generated-type correctness is the compiler's job, covered where the types are
 * consumed (reducers, client code) and by `tsc`. A wrong fixture or wrong runtime
 * JSON behavior IS caught here.
 *
 * Each fixture has the shape:
 *   { "name": ..., "description": ..., "type": ...,
 *     "input": <wire JSON value>,
 *     "acceptableOutputs": [ <exactly one canonical re-encoded value> ],
 *     "preservedOutput": <group-B only: the unknown-keys-preserved form TS asserts>,
 *     "notApplicable": [ <legacy optional list of client names to skip> ] }
 *
 * The harness decodes `input` with `JSON.parse`, re-encodes with
 * `JSON.stringify`, and asserts the result structurally equals
 * acceptableOutputs[0] (key-order-independent, value- and key-presence-sensitive;
 * `null` is NOT normalized to absent). acceptableOutputs MUST have exactly one
 * entry — the single intended wire form. For group-"B" fixtures TS asserts
 * `preservedOutput` (unknown keys preserved) instead — see the group-B branch.
 *
 * Real-execution: no mocks. Every fixture round-trips through real
 * `JSON.parse` / `JSON.stringify` — TypeScript's actual runtime wire path.
 *
 * Run: npm test (node --test --import tsx test/*.test.ts) from clients/typescript.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../src/types/index.js';
import type {
  ActionEnvelope,
  StateAction,
} from '../src/types/common/actions.js';
import type { StringOrMarkdown } from '../src/types/common/state.js';
import type { ChangesetOperationTarget } from '../src/types/channels-changeset/commands.js';
import type {
  ChatInputQuestion,
  Customization,
  SessionSummary,
} from '../src/types/channels-session/state.js';
import type { SessionAddedParams } from '../src/types/channels-root/notifications.js';

// ─── Fixture directory ───────────────────────────────────────────────────────

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'types', 'test-cases', 'round-trips');

function fixtureFiles(): string[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
}

// ─── Fixture shape ───────────────────────────────────────────────────────────

interface FixtureRoot {
  readonly name?: string;
  readonly description?: string;
  /** "A" = all clients agree; "B" = runtime-decoders drop unknown keys, TS preserves them */
  readonly group?: 'A' | 'B';
  readonly type: string;
  readonly input: unknown;
  readonly acceptableOutputs: unknown[];
  /**
   * Group-B only: the output expected from TypeScript (which has no runtime decoder and
   * preserves unknown wire keys verbatim). Harnesses running as TypeScript assert this
   * instead of acceptableOutputs[0].
   */
  readonly preservedOutput?: unknown;
  /** @deprecated Use group:"B" + preservedOutput instead. */
  readonly notApplicable?: string[];
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

// ─── Loaded-something guard ──────────────────────────────────────────────────

test('round-trip corpus is present', () => {
  assert.ok(
    fixtureFiles().length > 0,
    `No round-trip fixtures found at ${FIXTURE_DIR}. Ensure the checkout includes types/test-cases/round-trips/.`,
  );
});

// ─── Whole-corpus runner ─────────────────────────────────────────────────────

test('round-trip corpus decodes + re-encodes via the real generated types', () => {
  const failures: string[] = [];
  let ranRealAssertions = 0;
  let skippedCount = 0;

  for (const file of fixtureFiles()) {
    const raw = fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf-8');
    const root = JSON.parse(raw) as FixtureRoot;

    try {
      const result = runFixture(file, root);
      if (result === 'skipped') {
        skippedCount += 1;
      } else {
        ranRealAssertions += 1;
      }
    } catch (err) {
      failures.push(`✗ ${file}: ${(err as Error).message}`);
    }
  }

  assert.equal(
    failures.length,
    0,
    `${failures.length} round-trip fixture(s) failed:\n${failures.join('\n')}`,
  );

  assert.ok(ranRealAssertions > 0, 'No fixtures ran real assertions.');
  if (skippedCount > 0) {
    console.log(`  (${skippedCount} fixture(s) skipped via legacy notApplicable)`);
  }
});

// ─── Per-fixture dispatch ────────────────────────────────────────────────────

function runFixture(file: string, root: FixtureRoot): void | 'skipped' {
  const type = root.type;
  if (typeof type !== 'string') {
    throw new Error(`${file}: missing \`type\``);
  }
  if (root.input === undefined) {
    throw new Error(`${file}: missing \`input\``);
  }
  if (!Array.isArray(root.acceptableOutputs) || root.acceptableOutputs.length === 0) {
    throw new Error(`${file}: fixture made no assertions — \`acceptableOutputs\` is empty`);
  }

  // Enforce single canonical form: acceptableOutputs MUST have exactly one entry.
  // Multi-form acceptance sets encode observed-but-wrong divergence as acceptable.
  if (root.acceptableOutputs.length !== 1) {
    throw new Error(
      `${file}: acceptableOutputs must have exactly 1 entry (the single canonical re-encoded form); ` +
      `got ${root.acceptableOutputs.length}. Multiple entries cement divergence instead of fixing it.`,
    );
  }

  // Group B: TypeScript has no runtime decoder (JSON.parse/stringify preserves unknown keys).
  // TS asserts against preservedOutput (the input preserved verbatim), NOT acceptableOutputs[0].
  // This is a documented structural exception — TypeScript DOES assert, never skips.
  if (root.group === 'B') {
    if (root.preservedOutput === undefined) {
      throw new Error(
        `${file}: group B fixture must include a preservedOutput field for TypeScript's expected form`,
      );
    }
    const inputJson = JSON.stringify(root.input);
    const parsed = JSON.parse(inputJson) as unknown;
    bindToType(file, type, parsed);
    const reencoded = JSON.stringify(parsed);
    if (canonicalJson(reencoded) === canonicalJson(JSON.stringify(root.preservedOutput))) {
      return; // PASS — TypeScript preserves unknown keys as expected
    }
    throw new Error(
      `${file}: TypeScript re-encoded output does not match preservedOutput.\n` +
      `  got:      ${reencoded}\n` +
      `  expected: ${JSON.stringify(root.preservedOutput)}`,
    );
  }

  // Legacy notApplicable: skip this client if listed. Prefer group B + preservedOutput for new fixtures.
  if (Array.isArray(root.notApplicable) && root.notApplicable.includes('typescript')) {
    console.log(`⊘ ${file}: not applicable to typescript (legacy notApplicable) — TypeScript has no runtime decoder; it cannot drop unknown wire keys`);
    return 'skipped';
  }

  // Decode `input` with JSON.parse (round-tripping through JSON.stringify ensures
  // we start from a canonical JSON representation), re-encode with JSON.stringify.
  const inputJson = JSON.stringify(root.input);
  const parsed = JSON.parse(inputJson) as unknown;

  // Bind to the real generated type (compile-time cast; TypeScript has no runtime decoder).
  bindToType(file, type, parsed);

  const reencoded = JSON.stringify(parsed);

  // Assert the re-encoded result structurally equals the single canonical output.
  if (canonicalJson(reencoded) === canonicalJson(JSON.stringify(root.acceptableOutputs[0]))) {
    return; // PASS
  }

  throw new Error(
    `${file}: re-encoded output does not match the canonical acceptableOutput.\n` +
    `  got:      ${reencoded}\n` +
    `  expected: ${JSON.stringify(root.acceptableOutputs[0])}`,
  );
}

// ─── Real decode dispatch ────────────────────────────────────────────────────
//
// Binds `parsed` to its real generated type for compile-time type-checking.
// In TypeScript "decode" is `JSON.parse(...) as T` — a structural cast — and
// "re-encode" is `JSON.stringify(...)`. Adding a wire type to the corpus is a
// deliberate edit here; the corpus never decodes arbitrary types reflectively.

function bindToType(file: string, type: string, parsed: unknown): void {
  switch (type) {
    case 'ActionEnvelope':     void (parsed as ActionEnvelope); break;
    case 'StateAction':        void (parsed as StateAction); break;
    case 'Customization':      void (parsed as Customization); break;
    case 'SessionStatus':      void (parsed as number); break;
    case 'StringOrMarkdown':   void (parsed as StringOrMarkdown); break;
    case 'JsonRpcMessage':     void (parsed as JsonValue); break;
    case 'ChangesetOperationTarget': void (parsed as ChangesetOperationTarget); break;
    case 'ChatInputQuestion': void (parsed as ChatInputQuestion); break;
    case 'SessionSummary':     void (parsed as SessionSummary); break;
    case 'SessionAddedParams': void (parsed as SessionAddedParams); break;
    case 'PartialSessionSummary': void (parsed as Partial<SessionSummary>); break;
    default:
      throw new Error(
        `${file}: unknown wire type "${type}". Add a decode entry to bindToType.`,
      );
  }
}

// ─── JSON equality ────────────────────────────────────────────────────────────

/** Deterministic, key-sorted JSON serialization for structural comparison. */
function canonicalJson(jsonStr: string): string {
  const value = JSON.parse(jsonStr) as JsonValue;
  return sortedStringify(value);
}

function sortedStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(sortedStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${sortedStringify(value[k])}`).join(',')}}`;
}

// ─── ProtocolVersion constant tests ─────────────────────────────────────────
//
// These checks were previously exercised via corpus fixtures 021–023 (now
// deleted from the round-trip corpus; moved here as direct assertions).

test('ProtocolVersion constants', () => {
  assert.ok(
    typeof PROTOCOL_VERSION === 'string' && PROTOCOL_VERSION.trim().length > 0,
    `PROTOCOL_VERSION must be a non-empty string, got ${JSON.stringify(PROTOCOL_VERSION)}`,
  );

  assert.ok(
    Array.isArray(SUPPORTED_PROTOCOL_VERSIONS) && SUPPORTED_PROTOCOL_VERSIONS.length > 0,
    'SUPPORTED_PROTOCOL_VERSIONS must be a non-empty array',
  );

  assert.equal(
    SUPPORTED_PROTOCOL_VERSIONS[0],
    PROTOCOL_VERSION,
    `first SUPPORTED_PROTOCOL_VERSIONS entry "${SUPPORTED_PROTOCOL_VERSIONS[0]}" must equal PROTOCOL_VERSION "${PROTOCOL_VERSION}"`,
  );
});
