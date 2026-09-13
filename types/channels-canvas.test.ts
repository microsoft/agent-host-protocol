/**
 * Boundary tests for the canvas channel's declared, enforceable size/depth
 * limits (`CANVAS_SCHEMA_MAX_PROPERTIES`, `CANVAS_SCHEMA_MAX_DEPTH`, and the
 * `isCanvasSchemaWithinLimits` helper hosts use to enforce them). These are
 * protocol-mandated ceilings, not measured workload numbers — see
 * `types/channels-canvas/state.ts` for the full contract.
 *
 * Run: npx tsx --test types/channels-canvas.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  CANVAS_SCHEMA_MAX_PROPERTIES,
  CANVAS_SCHEMA_MAX_DEPTH,
  isCanvasSchemaWithinLimits,
} from './channels-canvas/state.js';

/** Builds an object schema with `count` trivial top-level properties. */
function schemaWithProperties(count: number): { properties: Record<string, unknown> } {
  const properties: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    properties[`p${i}`] = { type: 'string' };
  }
  return { properties };
}

/** Builds a schema nested `depth` levels deep (depth 1 = no nested `properties`). */
function schemaWithDepth(depth: number): { properties: Record<string, unknown> } {
  let inner: { properties?: Record<string, unknown> } = {};
  for (let level = depth; level > 1; level--) {
    inner = { properties: { child: inner } };
  }
  return { properties: { child: inner } };
}

describe('isCanvasSchemaWithinLimits', () => {
  it('accepts a schema with no properties', () => {
    assert.equal(isCanvasSchemaWithinLimits({}), true);
  });

  it('accepts a schema at exactly CANVAS_SCHEMA_MAX_PROPERTIES', () => {
    assert.equal(isCanvasSchemaWithinLimits(schemaWithProperties(CANVAS_SCHEMA_MAX_PROPERTIES)), true);
  });

  it('rejects a schema exceeding CANVAS_SCHEMA_MAX_PROPERTIES by one', () => {
    assert.equal(isCanvasSchemaWithinLimits(schemaWithProperties(CANVAS_SCHEMA_MAX_PROPERTIES + 1)), false);
  });

  it('accepts a schema nested at exactly CANVAS_SCHEMA_MAX_DEPTH', () => {
    assert.equal(isCanvasSchemaWithinLimits(schemaWithDepth(CANVAS_SCHEMA_MAX_DEPTH)), true);
  });

  it('rejects a schema nested one level past CANVAS_SCHEMA_MAX_DEPTH', () => {
    assert.equal(isCanvasSchemaWithinLimits(schemaWithDepth(CANVAS_SCHEMA_MAX_DEPTH + 1)), false);
  });

  it('rejects a schema whose properties exceed the bound only at a nested level', () => {
    const nested = schemaWithProperties(CANVAS_SCHEMA_MAX_PROPERTIES + 1);
    assert.equal(isCanvasSchemaWithinLimits({ properties: { child: nested } }), false);
  });
});
