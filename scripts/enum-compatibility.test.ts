import assert from 'node:assert/strict';
import test from 'node:test';
import { Project } from 'ts-morph';
import {
  discriminatedUnionAllowsUnknown,
  getEnumCompatibility,
  isBitsetEnum,
  validateEnumCompatibility,
} from './enum-compatibility.js';

function projectFor(source: string): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/types/example.ts', source);
  return project;
}

test('reads enum compatibility annotations', () => {
  const project = projectFor('/** An open enum. @nonexhaustive */ export enum Open { Value = "value" }');
  const enumDecl = project.getSourceFileOrThrow('/types/example.ts').getEnumOrThrow('Open');

  assert.equal(getEnumCompatibility(enumDecl), 'nonexhaustive');
});

test('identifies bitsets by @bitset rather than numeric values or description prose', () => {
  const project = projectFor(`
    /** Status flags. @nonexhaustive @bitset */
    export enum Tagged { First = 1, Second = 2, Combined = 1 | 2 }
    /** Bitset is just prose here. @nonexhaustive */
    export enum Untagged { First = 1, Second = 2 }
  `);
  const source = project.getSourceFileOrThrow('/types/example.ts');

  assert.equal(isBitsetEnum(source.getEnumOrThrow('Tagged')), true);
  assert.equal(isBitsetEnum(source.getEnumOrThrow('Untagged')), false);
  assert.doesNotThrow(() => validateEnumCompatibility(project));
});

test('rejects @bitset members outside the uint32 wire representation', () => {
  for (const value of ['"string"', '-1', '1.5', '4294967296']) {
    assert.throws(
      () => validateEnumCompatibility(projectFor(`
        /** Status flags. @nonexhaustive @bitset */
        export enum Invalid { Value = ${value} }
      `)),
      /enum Invalid.*@bitset.*uint32/,
    );
  }
});

test('rejects unannotated and ambiguously annotated enums', () => {
  assert.throws(
    () => validateEnumCompatibility(projectFor('export enum Missing { Value = "value" }')),
    /exactly one of @exhaustive or @nonexhaustive/,
  );
  assert.throws(
    () => validateEnumCompatibility(projectFor('/** @exhaustive @nonexhaustive */ export enum Both { Value = "value" }')),
    /exactly one of @exhaustive or @nonexhaustive/,
  );
});

test('requires compatibility annotations in the main enum JSDoc block', () => {
  assert.throws(
    () => validateEnumCompatibility(projectFor(`
      /** Describes the enum. */
      /** @nonexhaustive */
      export enum Detached { Value = "value" }
    `)),
    /substantive main enum JSDoc block/,
  );
  assert.throws(
    () => validateEnumCompatibility(projectFor(`
      /** @nonexhaustive */
      export enum Undocumented { Value = "value" }
    `)),
    /substantive main enum JSDoc block/,
  );
  assert.doesNotThrow(() => validateEnumCompatibility(projectFor(`
    /**
     * Describes the enum.
     *
     * @nonexhaustive
     */
    export enum Attached { Value = "value" }
  `)));
});

test('derives discriminated-union compatibility from its discriminator enum', () => {
  const project = projectFor(`
    /** A discriminator enum. @nonexhaustive */
    export enum Kind { Known = "known" }
    export interface Known { kind: Kind.Known }
  `);

  assert.equal(discriminatedUnionAllowsUnknown(project, 'kind', ['Known']), true);
});
