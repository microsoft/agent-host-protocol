/**
 * Go Module Generator — Generates Go type definitions for the
 * `ahptypes` package from the TypeScript source of truth parsed via
 * ts-morph.
 *
 * Output: clients/go/ahptypes/{state,actions,commands,notifications,
 * errors,messages,version}.generated.go
 *
 * Mirrors the structure of `generate-rust.ts`. The generated files are
 * always overwritten; the hand-written files (`common.go`,
 * `discriminated_unions.go`) are left alone.
 *
 * Conventions:
 *   - Wire field names (camelCase) are preserved exactly via `json:""`
 *     tags. Go field identifiers are PascalCase.
 *   - Required fields → value types, no `omitempty`.
 *   - Optional fields → pointer types with `,omitempty`.
 *   - TS `number` → Go `int64` unless `@format float` → `float64`.
 *   - TS `unknown` / `object` / `Record<string, unknown>` →
 *     `json.RawMessage` / `map[string]json.RawMessage`.
 *   - Discriminated unions are emitted as a concrete wrapper struct
 *     plus a marker interface, with custom MarshalJSON / UnmarshalJSON
 *     methods. Unknown discriminator values surface as a
 *     `*<Name>Unknown` variant carrying the raw JSON.
 *   - Bitset enums (JSDoc starts with "Bitset") are emitted as a typed
 *     `uint32` with named flag constants plus `Has` / `Or` helpers, so
 *     unknown future bits round-trip losslessly.
 *   - The generator runs `gofmt -w` after writing to keep style stable
 *     and to validate the emitted code compiles, unless `gofmt` is missing
 *     and the caller explicitly allows unformatted output.
 */

import {
  Project,
  InterfaceDeclaration,
  EnumDeclaration,
  PropertySignature,
} from 'ts-morph';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { findProtocolSourceFiles } from './find-protocol-sources.js';
import { readProtocolVersions } from './read-protocol-versions.js';

const GENERATED_BANNER =
  '// Generated from types/*.ts — do not edit.\n' +
  '//\n' +
  '// Regenerate with: npm run generate:go\n\n' +
  'package ahptypes\n';

const HEADER_WITH_IMPORTS =
  GENERATED_BANNER +
  '\n' +
  'import (\n' +
  '\t"encoding/json"\n' +
  ')\n\n' +
  '// Reference the encoding/json import to keep gofmt -d from\n' +
  '// stripping it when a generated file has no struct that mentions\n' +
  '// json.RawMessage directly (rare but possible). Compiled out.\n' +
  'var _ = json.RawMessage(nil)\n';

export interface GenerateGoModuleOptions {
  readonly allowMissingFormatter?: boolean;
}


// ─── Name Mapping ────────────────────────────────────────────────────────────

/** Strips the I prefix from interface names: IRootState → RootState */
function stripIPrefix(tsName: string): string {
  if (
    tsName.length > 1 &&
    tsName[0] === 'I' &&
    tsName[1] === tsName[1].toUpperCase() &&
    tsName[1] !== tsName[1].toLowerCase()
  ) {
    return tsName.substring(1);
  }
  return tsName;
}

const GO_RESERVED = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var',
]);

/** Coerce a Go identifier to avoid keyword collisions. */
function goIdent(name: string): string {
  return GO_RESERVED.has(name) ? `${name}_` : name;
}

/** camelCase/snake_case/whatever → PascalCase. */
function toPascalCase(name: string): string {
  if (!name) return name;
  // strip leading underscore (e.g. `_meta`)
  const cleaned = name.replace(/^_+/, '');
  const segments = cleaned.split(/[_-]/).filter(Boolean);
  if (segments.length > 1) {
    return segments
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('');
  }
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

/**
 * Map a TS property name to its Go field name. The wire name is always
 * preserved on the `json:""` tag exactly as it appears in TypeScript.
 */
function goFieldName(tsName: string): { goName: string; wireName: string } {
  return { goName: goIdent(toPascalCase(tsName)), wireName: tsName };
}

/** PascalCase enum-variant name from a free-form string. */
function toEnumVariant(value: string): string {
  // root/sessionAdded → RootSessionAdded
  // pending-confirmation → PendingConfirmation
  // single-select → SingleSelect
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

// ─── Type Mapping ────────────────────────────────────────────────────────────

/** Tracks Partial<T> references encountered so the generator can emit sibling types. */
const requiredPartialStructs = new Set<string>();

function partialGoName(tsInterfaceName: string): string {
  return `Partial${stripIPrefix(tsInterfaceName)}`;
}

/** Map a TypeScript type expression to a Go type expression. */
function mapType(tsType: string): string {
  tsType = tsType.replace(/import\([^)]+\)\./g, '').trim();

  while (tsType.startsWith('(') && tsType.endsWith(')')) {
    tsType = tsType.slice(1, -1).trim();
  }

  if (tsType === 'string') return 'string';
  if (tsType === 'number') return 'int64';
  if (tsType === 'boolean') return 'bool';
  if (tsType === 'unknown') return 'json.RawMessage';
  if (tsType === 'object') return 'json.RawMessage';
  if (tsType === 'true' || tsType === 'false') return 'bool';

  if (tsType === 'URI') return 'URI';
  if (tsType === 'StringOrMarkdown') return 'StringOrMarkdown';

  // ChildCustomizationType is a TS-only subset alias of CustomizationType.
  if (tsType === 'ChildCustomizationType') return 'CustomizationType';

  // SessionStatus is a bitset — Go keeps it as the typed alias for round-trip.
  if (tsType === 'SessionStatus') return 'SessionStatus';

  if (
    tsType === 'IRootState | ISessionState' ||
    tsType === 'IRootState | ISessionState | ITerminalState' ||
    tsType === 'RootState | SessionState' ||
    tsType === 'RootState | SessionState | TerminalState' ||
    tsType === 'RootState | SessionState | TerminalState | ChangesetState' ||
    tsType === 'RootState | SessionState | TerminalState | ChangesetState | AnnotationsState' ||
    tsType === 'RootState | SessionState | TerminalState | ChangesetState | ResourceWatchState | AnnotationsState' ||
    tsType === 'RootState | SessionState | TerminalState | ChangesetState | ResourceWatchState | AnnotationsState | ChatState' ||
    tsType === 'RootState | SessionState | ChatState | TerminalState | ChangesetState' ||
    tsType === 'RootState | SessionState | ChatState | TerminalState | ChangesetState | AnnotationsState'
  ) {
    return 'SnapshotState';
  }

  // `T | null` → pointer to T at the call site; the inner type stays
  // bare here so the caller can decide pointer vs not.
  const nullMatch = tsType.match(/^(.+?)\s*\|\s*null$/);
  if (nullMatch) {
    return `*${mapType(nullMatch[1])}`;
  }

  // `T | undefined` is treated identically to optional `?` — the
  // pointerification is applied later at the property level.
  const undefMatch = tsType.match(/^(.+?)\s*\|\s*undefined$/);
  if (undefMatch) return mapType(undefMatch[1]);

  const arrayMatch = tsType.match(/^(.+)\[\]$/);
  if (arrayMatch) return `[]${mapTypeForSliceElem(arrayMatch[1])}`;

  const arrayGenericMatch = tsType.match(/^Array<(.+)>$/);
  if (arrayGenericMatch) return `[]${mapTypeForSliceElem(arrayGenericMatch[1])}`;

  const recordMatch = tsType.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) {
    const inner = recordMatch[1].trim();
    // `Record<string, never>` is the MCP-style marker for "empty object";
    // treat it like `Record<string, unknown>` so the wire `{}` round-trips.
    if (inner === 'unknown' || inner === 'never') return 'map[string]json.RawMessage';
    return `map[string]${mapTypeForSliceElem(inner)}`;
  }

  const partialMatch = tsType.match(/^Partial<(\w+)>$/);
  if (partialMatch) {
    requiredPartialStructs.add(partialMatch[1]);
    return partialGoName(partialMatch[1]);
  }

  const enumUnionMatch = tsType.match(/^(\w+)\.\w+(\s*\|\s*\1\.\w+)*$/);
  if (enumUnionMatch) return stripIPrefix(enumUnionMatch[1]);

  const enumMemberMatch = tsType.match(/^(\w+)\.(\w+)$/);
  if (enumMemberMatch) return stripIPrefix(enumMemberMatch[1]);

  // String literal: treat as string for standalone usage. Discriminant
  // fields are filtered out before we reach this function in the union
  // emitter, but variant structs include their discriminator as the
  // string-literal type — emit a typed enum reference instead so the
  // field type matches the union's enum.
  if (tsType.startsWith("'") && tsType.endsWith("'")) return 'string';
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(tsType)) return 'string';

  if (tsType.startsWith('{')) return 'json.RawMessage';

  return stripIPrefix(tsType);
}

/** Wrap a slice/map element type — Go forbids `[]*nil` etc. */
function mapTypeForSliceElem(tsType: string): string {
  const mapped = mapType(tsType);
  return mapped;
}

// ─── Property Extraction ─────────────────────────────────────────────────────

interface GoProp {
  goName: string;
  wireName: string;
  goType: string;
  optional: boolean;
  doc: string;
  /** True iff this property is the union variant's literal discriminant. */
  isLiteralDiscriminant: boolean;
  /** The literal wire value of the discriminator, if applicable. */
  literalValue?: string;
}

function getPropertyType(prop: PropertySignature): string {
  const typeNode = prop.getTypeNode();
  if (typeNode) return typeNode.getText();
  return prop.getType().getText(prop);
}

function getPropertyDoc(prop: PropertySignature): string {
  const jsDocs = prop.getJsDocs();
  if (jsDocs.length === 0) return '';
  return jsDocs[0].getDescription().trim();
}

function hasFormatFloat(prop: PropertySignature): boolean {
  for (const doc of prop.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === 'format' && tag.getCommentText()?.trim() === 'float') {
        return true;
      }
    }
  }
  return false;
}

function getAllProperties(iface: InterfaceDeclaration, project: Project): PropertySignature[] {
  const props: PropertySignature[] = [];
  for (const ext of iface.getExtends()) {
    const baseName = ext.getExpression().getText();
    const baseIface = findInterface(project, baseName);
    if (baseIface) {
      props.push(...getAllProperties(baseIface, project));
    }
  }
  props.push(...iface.getProperties());
  return props;
}

function findInterface(project: Project, name: string): InterfaceDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const iface = sf.getInterface(name);
    if (iface) return iface;
  }
  return undefined;
}

function findEnum(project: Project, name: string): EnumDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const e = sf.getEnum(name);
    if (e) return e;
  }
  return undefined;
}

function extractProps(iface: InterfaceDeclaration, project: Project): GoProp[] {
  const allProps = getAllProperties(iface, project);
  const seen = new Set<string>();
  const result: GoProp[] = [];

  for (const p of allProps) {
    const tsName = p.getName();
    if (seen.has(tsName)) continue;
    seen.add(tsName);

    const tsType = getPropertyType(p);

    // Detect literal discriminant: EnumName.Value or 'value' or a narrow union
    // restricted to the conventional discriminator field names.
    const enumMember = tsType.match(/^(\w+)\.(\w+)$/);
    const stringLiteral = tsType.match(/^'([^']+)'$/);
    let isLiteralDiscriminant = false;
    let literalValue: string | undefined;

    const tsPropLower = tsName.toLowerCase();
    if (['type', 'kind', 'status', 'state'].includes(tsPropLower)) {
      if (enumMember) {
        const enumName = enumMember[1];
        const memberName = enumMember[2];
        const enumDecl = findEnum(project, enumName);
        if (enumDecl) {
          const mem = enumDecl.getMembers().find((m) => m.getName() === memberName);
          if (mem) {
            const v = mem.getValue();
            isLiteralDiscriminant = true;
            literalValue = typeof v === 'number' ? String(v) : String(v);
          }
        }
      } else if (stringLiteral) {
        isLiteralDiscriminant = true;
        literalValue = stringLiteral[1];
      } else if (/^\w+\.\w+(\s*\|\s*\w+\.\w+)+$/.test(tsType)) {
        isLiteralDiscriminant = true;
      }
    }

    const { goName, wireName } = goFieldName(tsName);
    const hasUnionUndefined = /\|\s*undefined/.test(tsType);
    const hasQuestionToken = p.hasQuestionToken();

    let goType = mapType(tsType);
    if (goType === 'int64' && hasFormatFloat(p)) {
      goType = 'float64';
    }

    // `T | null` already returns `*T`; combine with optional question
    // token: optional null-able stays a single pointer (avoid `**T`).
    const alreadyPointer = goType.startsWith('*');
    const optional = hasQuestionToken || hasUnionUndefined || alreadyPointer;
    if (optional && !alreadyPointer && !goType.startsWith('[]') && !goType.startsWith('map[')) {
      goType = `*${goType}`;
    }

    result.push({
      goName,
      wireName,
      goType,
      optional,
      doc: getPropertyDoc(p),
      isLiteralDiscriminant,
      literalValue,
    });
  }
  return result;
}

// ─── Enum Generation ─────────────────────────────────────────────────────────

function emitDocComment(prefix: string, doc: string | undefined, lines: string[]): void {
  if (!doc) return;
  for (const line of doc.split('\n')) {
    const trimmed = line.trimEnd();
    if (trimmed.length === 0) {
      lines.push(`${prefix}//`);
    } else {
      lines.push(`${prefix}// ${trimmed}`);
    }
  }
}

/**
 * String enum:
 *   type PolicyState string
 *   const (
 *     PolicyStateEnabled       PolicyState = "enabled"
 *     ...
 *   )
 */
function generateStringEnum(enumDecl: EnumDeclaration): string {
  const name = enumDecl.getName();
  const lines: string[] = [];
  const desc = enumDecl.getJsDocs()[0]?.getDescription().trim();
  emitDocComment('', desc, lines);
  lines.push(`type ${name} string`);
  lines.push('');
  lines.push('const (');
  for (const mem of enumDecl.getMembers()) {
    const memberName = mem.getName();
    const memberDoc = mem.getJsDocs()[0]?.getDescription().trim();
    emitDocComment('\t', memberDoc, lines);
    lines.push(`\t${name}${memberName} ${name} = ${JSON.stringify(String(mem.getValue()))}`);
  }
  lines.push(')');
  return lines.join('\n');
}

/**
 * Bitset enum (numeric values, JSDoc tag "Bitset" or numeric values):
 *   type SessionStatus uint32
 *   const ( SessionStatusIdle SessionStatus = 1 ... )
 *   func (s SessionStatus) Has(other SessionStatus) bool
 *   func (s SessionStatus) Or(other SessionStatus) SessionStatus
 */
function generateBitsetEnum(enumDecl: EnumDeclaration): string {
  const name = enumDecl.getName();
  const lines: string[] = [];
  const desc = enumDecl.getJsDocs()[0]?.getDescription().trim();
  emitDocComment('', desc, lines);
  lines.push(`type ${name} uint32`);
  lines.push('');
  lines.push('const (');
  for (const mem of enumDecl.getMembers()) {
    const memberName = mem.getName();
    const memberDoc = mem.getJsDocs()[0]?.getDescription().trim();
    emitDocComment('\t', memberDoc, lines);
    lines.push(`\t${name}${memberName} ${name} = ${mem.getValue()}`);
  }
  lines.push(')');
  lines.push('');
  lines.push(`// Has reports whether every flag in other is also set in s.`);
  lines.push(`func (s ${name}) Has(other ${name}) bool { return s&other == other }`);
  lines.push('');
  lines.push(`// Or returns s combined with the flags in other.`);
  lines.push(`func (s ${name}) Or(other ${name}) ${name} { return s | other }`);
  return lines.join('\n');
}

/** Choose between string-enum and bitset-enum emission. */
function generateEnum(enumDecl: EnumDeclaration): string {
  const values = enumDecl.getMembers().map((m) => m.getValue());
  const isNumeric = values.every((v) => typeof v === 'number');
  return isNumeric ? generateBitsetEnum(enumDecl) : generateStringEnum(enumDecl);
}

// ─── Struct Generation ───────────────────────────────────────────────────────

interface StructOpts {
  /** Omit fields flagged as literal discriminants (for union variants). */
  omitDiscriminants?: boolean;
  /** Docstring for the struct itself. */
  doc?: string;
  /**
   * Force inclusion of the literal-discriminant field even when emitting
   * a union variant. Useful for the actions and notifications wrappers
   * where the literal value differs from the inner struct's own enum.
   */
  includeDiscriminants?: boolean;
}

function generateGoStruct(goName: string, props: GoProp[], opts: StructOpts = {}): string {
  const lines: string[] = [];
  emitDocComment('', opts.doc, lines);
  const include = opts.includeDiscriminants === true;
  const emittedProps = props.filter((p) => include || !(opts.omitDiscriminants && p.isLiteralDiscriminant));

  lines.push(`type ${goName} struct {`);
  for (const p of emittedProps) {
    if (p.doc) {
      emitDocComment('\t', p.doc, lines);
    }
    const tagParts: string[] = [p.wireName];
    if (p.optional) tagParts.push('omitempty');
    // Box self-referential value types in a pointer so the struct has
    // a finite size on the stack.
    let goType = p.goType;
    if (
      goType === goName ||
      goType.startsWith(`${goName}<`) ||
      new RegExp(`\\b${goName}\\b`).test(goType.replace(/^\*/, '')) &&
        !goType.startsWith('*') &&
        !goType.startsWith('[]') &&
        !goType.startsWith('map[')
    ) {
      goType = `*${goType}`;
    }
    const tag = `\`json:"${tagParts.join(',')}"\``;
    lines.push(`\t${p.goName} ${goType} ${tag}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateStructFromInterface(
  project: Project,
  tsInterfaceName: string,
  goNameOverride?: string,
  opts: StructOpts = {},
): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const name = goNameOverride ?? stripIPrefix(tsInterfaceName);
  const props = extractProps(iface, project);
  const ifaceDoc = iface.getJsDocs()[0]?.getDescription().trim();
  return generateGoStruct(name, props, { doc: ifaceDoc, ...opts });
}

// ─── Partial Struct Generation ───────────────────────────────────────────────

function generatePartialStruct(project: Project, tsInterfaceName: string): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const props = extractProps(iface, project).map((p) => {
    if (p.optional) return p;
    // Pointer-ify, except for slice/map (already nilable in Go).
    if (p.goType.startsWith('*') || p.goType.startsWith('[]') || p.goType.startsWith('map[')) {
      return { ...p, optional: true };
    }
    return { ...p, optional: true, goType: `*${p.goType}` };
  });
  return generateGoStruct(partialGoName(tsInterfaceName), props, {
    doc: `Partial${stripIPrefix(tsInterfaceName)} is the partial equivalent of ${stripIPrefix(tsInterfaceName)} — every field is optional for delta updates.`,
  });
}

// ─── Discriminated Union Generation ──────────────────────────────────────────

interface UnionVariant {
  /** Wrapper-side variant name, e.g. `Markdown` for `ResponsePartMarkdown`. */
  variantName: string;
  /** Inner concrete struct, e.g. `MarkdownResponsePart`. */
  innerType: string;
  /** Discriminator wire value, e.g. `"markdown"`. */
  wireValue: string;
  doc?: string;
}

interface UnionConfig {
  /** Union name, e.g. `ResponsePart`. */
  name: string;
  /** JSON field used as the discriminator, e.g. `"kind"`. */
  discriminantField: string;
  doc?: string;
  variants: UnionVariant[];
  /** Emit an `XUnknown` variant for forward-compat. */
  unknown?: boolean;
  /**
   * For action-like unions where the inner-struct's own discriminator
   * type would not match the wrapper's wireValue (e.g. unique inner
   * structs that intentionally omit the discriminator), force the wrapper
   * to re-inject the discriminator on marshal.
   */
  injectDiscriminantOnMarshal?: boolean;
}

function generateDiscriminatedUnion(cfg: UnionConfig): string {
  const lines: string[] = [];
  emitDocComment('', cfg.doc, lines);
  lines.push(`type ${cfg.name} struct {`);
  lines.push(`\tValue is${cfg.name}`);
  lines.push('}');
  lines.push('');
  lines.push(`// is${cfg.name} is the marker interface implemented by every`);
  lines.push(`// concrete variant of ${cfg.name}.`);
  lines.push(`type is${cfg.name} interface{ is${cfg.name}() }`);
  lines.push('');

  const seenInner = new Set<string>();
  for (const v of cfg.variants) {
    if (seenInner.has(v.innerType)) continue;
    seenInner.add(v.innerType);
    lines.push(`func (*${v.innerType}) is${cfg.name}() {}`);
  }
  if (cfg.unknown) {
    lines.push('');
    emitDocComment('', `${cfg.name}Unknown carries an unrecognized ${cfg.name} variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.`, lines);
    lines.push(`type ${cfg.name}Unknown struct {`);
    lines.push('\tRaw json.RawMessage');
    lines.push('}');
    lines.push('');
    lines.push(`func (*${cfg.name}Unknown) is${cfg.name}() {}`);
  }
  lines.push('');

  // UnmarshalJSON
  lines.push(`// UnmarshalJSON decodes the variant indicated by the ${JSON.stringify(cfg.discriminantField)} discriminator.`);
  lines.push(`func (u *${cfg.name}) UnmarshalJSON(data []byte) error {`);
  lines.push(`\tdisc, _, err := readDiscriminator(data, ${JSON.stringify(cfg.discriminantField)})`);
  lines.push('\tif err != nil {');
  lines.push('\t\treturn err');
  lines.push('\t}');
  lines.push('\tswitch disc {');
  for (const v of cfg.variants) {
    lines.push(`\tcase ${JSON.stringify(v.wireValue)}:`);
    lines.push(`\t\tvar value ${v.innerType}`);
    lines.push('\t\tif err := json.Unmarshal(data, &value); err != nil {');
    lines.push('\t\t\treturn err');
    lines.push('\t\t}');
    lines.push('\t\tu.Value = &value');
  }
  lines.push('\tdefault:');
  if (cfg.unknown) {
    lines.push('\t\traw := make(json.RawMessage, len(data))');
    lines.push('\t\tcopy(raw, data)');
    lines.push(`\t\tu.Value = &${cfg.name}Unknown{Raw: raw}`);
  } else {
    lines.push(`\t\treturn &json.UnmarshalTypeError{Value: "${cfg.name}", Type: nil}`);
  }
  lines.push('\t}');
  lines.push('\treturn nil');
  lines.push('}');
  lines.push('');

  // MarshalJSON
  lines.push(`// MarshalJSON encodes the active variant back to JSON.`);
  lines.push(`func (u ${cfg.name}) MarshalJSON() ([]byte, error) {`);
  if (cfg.unknown) {
    lines.push(`\tif unk, ok := u.Value.(*${cfg.name}Unknown); ok {`);
    lines.push('\t\tif len(unk.Raw) == 0 {');
    lines.push('\t\t\treturn []byte("null"), nil');
    lines.push('\t\t}');
    lines.push('\t\treturn unk.Raw, nil');
    lines.push('\t}');
  }
  lines.push('\tif u.Value == nil {');
  lines.push('\t\treturn []byte("null"), nil');
  lines.push('\t}');
  lines.push('\treturn json.Marshal(u.Value)');
  lines.push('}');
  return lines.join('\n');
}

// ─── State File Generator ────────────────────────────────────────────────────

const STATE_ENUMS = [
  'PolicyState', 'SessionLifecycle', 'SessionStatus',
  'ChatOriginKind', 'ChatInteractivity', 'PendingMessageKind', 'ChatInputAnswerState', 'ChatInputAnswerValueKind', 'ChatInputQuestionKind',
  'ChatInputResponseKind',
  'TurnState', 'MessageAttachmentKind', 'ResponsePartKind', 'ToolCallStatus',
  'ToolCallConfirmationReason', 'ToolCallCancellationReason',
  'ConfirmationOptionKind', 'ToolCallContributorKind',
  'ToolResultContentType', 'CustomizationType', 'CustomizationLoadStatus', 'TerminalClaimKind',
  'McpServerStatus', 'McpAuthRequiredReason',
  'ChangesetStatus', 'ChangesetOperationStatus', 'ChangesetOperationScope', 'ResourceChangeType',
];

const STATE_STRUCTS: { name: string; omitDiscriminants?: boolean; goName?: string }[] = [
  { name: 'Icon' },
  { name: 'ProtectedResourceMetadata' },
  { name: 'RootState' },
  { name: 'RootConfigState' },
  { name: 'AgentInfo' },
  { name: 'SessionModelInfo' },
  { name: 'ModelSelection' },
  { name: 'AgentSelection' },
  { name: 'ConfigPropertySchema' },
  { name: 'ConfigSchema' },
  { name: 'SessionState' },
  { name: 'SessionActiveClient' },
  { name: 'SessionSummary' },
  { name: 'ChangesSummary' },
  { name: 'ChatState' },
  { name: 'ChatSummary' },
  { name: 'PendingMessage' },
  { name: 'ProjectInfo' },
  { name: 'SessionConfigPropertySchema' },
  { name: 'SessionConfigSchema' },
  { name: 'SessionConfigState' },
  { name: 'Turn' },
  { name: 'ActiveTurn' },
  { name: 'Message' },
  { name: 'ChatInputOption' },
  { name: 'ChatInputTextAnswerValue' },
  { name: 'ChatInputNumberAnswerValue' },
  { name: 'ChatInputBooleanAnswerValue' },
  { name: 'ChatInputSelectedAnswerValue' },
  { name: 'ChatInputSelectedManyAnswerValue' },
  { name: 'ChatInputAnswered' },
  { name: 'ChatInputSkipped' },
  { name: 'ChatInputTextQuestion' },
  { name: 'ChatInputNumberQuestion' },
  { name: 'ChatInputBooleanQuestion' },
  { name: 'ChatInputSingleSelectQuestion' },
  { name: 'ChatInputMultiSelectQuestion' },
  { name: 'ChatInputRequest' },
  { name: 'TextPosition' },
  { name: 'TextRange' },
  { name: 'TextSelection' },
  { name: 'SimpleMessageAttachment' },
  { name: 'MessageEmbeddedResourceAttachment' },
  { name: 'MessageResourceAttachment' },
  { name: 'MessageAnnotationsAttachment' },
  { name: 'MarkdownResponsePart' },
  { name: 'ContentRef' },
  { name: 'ResourceReponsePart', goName: 'ResourceResponsePart' },
  { name: 'ToolCallResponsePart' },
  { name: 'ReasoningResponsePart' },
  { name: 'SystemNotificationResponsePart' },
  { name: 'ToolCallResult' },
  { name: 'ConfirmationOption' },
  { name: 'ToolCallStreamingState' },
  { name: 'ToolCallPendingConfirmationState' },
  { name: 'ToolCallRunningState' },
  { name: 'ToolCallPendingResultConfirmationState' },
  { name: 'ToolCallCompletedState' },
  { name: 'ToolCallCancelledState' },
  { name: 'ToolDefinition' },
  { name: 'ToolAnnotations' },
  { name: 'ToolResultTextContent' },
  { name: 'ToolResultEmbeddedResourceContent' },
  { name: 'ToolResultResourceContent' },
  { name: 'ToolResultFileEditContent' },
  { name: 'ToolResultTerminalContent' },
  { name: 'ToolResultSubagentContent' },
  { name: 'CustomizationLoadingState' },
  { name: 'CustomizationLoadedState' },
  { name: 'CustomizationDegradedState' },
  { name: 'CustomizationErrorState' },
  { name: 'PluginCustomization' },
  { name: 'ClientPluginCustomization' },
  { name: 'DirectoryCustomization' },
  { name: 'AgentCustomization' },
  { name: 'SkillCustomization' },
  { name: 'PromptCustomization' },
  { name: 'RuleCustomization' },
  { name: 'HookCustomization' },
  { name: 'McpServerCustomization' },
  { name: 'McpServerCustomizationApps' },
  { name: 'AhpMcpUiHostCapabilities' },
  { name: 'McpServerStartingState' },
  { name: 'McpServerReadyState' },
  { name: 'McpServerAuthRequiredState' },
  { name: 'McpServerErrorState' },
  { name: 'McpServerStoppedState' },
  { name: 'ToolCallClientContributor' },
  { name: 'ToolCallMcpContributor' },
  { name: 'FileEdit' },
  { name: 'TerminalInfo' },
  { name: 'TerminalClientClaim' },
  { name: 'TerminalSessionClaim' },
  { name: 'TerminalState' },
  { name: 'TerminalUnclassifiedPart' },
  { name: 'TerminalCommandPart' },
  { name: 'UsageInfo' },
  { name: 'ErrorInfo' },
  { name: 'Snapshot' },
  { name: 'Changeset' },
  { name: 'ChangesetState' },
  { name: 'ChangesetFile' },
  { name: 'ChangesetOperation' },
  { name: 'AnnotationsSummary' },
  { name: 'AnnotationsState' },
  { name: 'Annotation' },
  { name: 'AnnotationEntry' },
  { name: 'TelemetryCapabilities' },
  { name: 'ResourceWatchState' },
  { name: 'ResourceChange' },
];

const RESPONSE_PART_UNION: UnionConfig = {
  name: 'ResponsePart',
  discriminantField: 'kind',
  doc: 'ResponsePart is a single part of a response stream (text, tool call, reasoning, content reference).',
  variants: [
    { variantName: 'Markdown', innerType: 'MarkdownResponsePart', wireValue: 'markdown' },
    { variantName: 'ContentRef', innerType: 'ResourceResponsePart', wireValue: 'contentRef' },
    { variantName: 'ToolCall', innerType: 'ToolCallResponsePart', wireValue: 'toolCall' },
    { variantName: 'Reasoning', innerType: 'ReasoningResponsePart', wireValue: 'reasoning' },
    { variantName: 'SystemNotification', innerType: 'SystemNotificationResponsePart', wireValue: 'systemNotification' },
  ],
  unknown: true,
};

const TOOL_CALL_STATE_UNION: UnionConfig = {
  name: 'ToolCallState',
  discriminantField: 'status',
  doc: 'ToolCallState is the full tool call lifecycle state.',
  variants: [
    { variantName: 'Streaming', innerType: 'ToolCallStreamingState', wireValue: 'streaming' },
    { variantName: 'PendingConfirmation', innerType: 'ToolCallPendingConfirmationState', wireValue: 'pending-confirmation' },
    { variantName: 'Running', innerType: 'ToolCallRunningState', wireValue: 'running' },
    { variantName: 'PendingResultConfirmation', innerType: 'ToolCallPendingResultConfirmationState', wireValue: 'pending-result-confirmation' },
    { variantName: 'Completed', innerType: 'ToolCallCompletedState', wireValue: 'completed' },
    { variantName: 'Cancelled', innerType: 'ToolCallCancelledState', wireValue: 'cancelled' },
  ],
  unknown: true,
};

const TERMINAL_CLAIM_UNION: UnionConfig = {
  name: 'TerminalClaim',
  discriminantField: 'kind',
  doc: 'TerminalClaim identifies who currently holds a terminal.',
  variants: [
    { variantName: 'Client', innerType: 'TerminalClientClaim', wireValue: 'client' },
    { variantName: 'Session', innerType: 'TerminalSessionClaim', wireValue: 'session' },
  ],
  unknown: true,
};

const TERMINAL_CONTENT_PART_UNION: UnionConfig = {
  name: 'TerminalContentPart',
  discriminantField: 'type',
  doc: 'TerminalContentPart is a content part within terminal output.',
  variants: [
    { variantName: 'Unclassified', innerType: 'TerminalUnclassifiedPart', wireValue: 'unclassified' },
    { variantName: 'Command', innerType: 'TerminalCommandPart', wireValue: 'command' },
  ],
  unknown: true,
};

const CHAT_INPUT_QUESTION_UNION: UnionConfig = {
  name: 'ChatInputQuestion',
  discriminantField: 'kind',
  doc: 'ChatInputQuestion is one question within a chat input request.',
  variants: [
    { variantName: 'Text', innerType: 'ChatInputTextQuestion', wireValue: 'text' },
    { variantName: 'Number', innerType: 'ChatInputNumberQuestion', wireValue: 'number' },
    { variantName: 'Integer', innerType: 'ChatInputNumberQuestion', wireValue: 'integer' },
    { variantName: 'Boolean', innerType: 'ChatInputBooleanQuestion', wireValue: 'boolean' },
    { variantName: 'SingleSelect', innerType: 'ChatInputSingleSelectQuestion', wireValue: 'single-select' },
    { variantName: 'MultiSelect', innerType: 'ChatInputMultiSelectQuestion', wireValue: 'multi-select' },
  ],
  unknown: true,
};

const CHAT_INPUT_ANSWER_VALUE_UNION: UnionConfig = {
  name: 'ChatInputAnswerValue',
  discriminantField: 'kind',
  doc: 'ChatInputAnswerValue is the value captured for one answer.',
  variants: [
    { variantName: 'Text', innerType: 'ChatInputTextAnswerValue', wireValue: 'text' },
    { variantName: 'Number', innerType: 'ChatInputNumberAnswerValue', wireValue: 'number' },
    { variantName: 'Boolean', innerType: 'ChatInputBooleanAnswerValue', wireValue: 'boolean' },
    { variantName: 'Selected', innerType: 'ChatInputSelectedAnswerValue', wireValue: 'selected' },
    { variantName: 'SelectedMany', innerType: 'ChatInputSelectedManyAnswerValue', wireValue: 'selected-many' },
  ],
  unknown: true,
};

const CHAT_INPUT_ANSWER_UNION: UnionConfig = {
  name: 'ChatInputAnswer',
  discriminantField: 'state',
  doc: 'ChatInputAnswer is a draft, submitted, or skipped answer for one question.',
  variants: [
    { variantName: 'Draft', innerType: 'ChatInputAnswered', wireValue: 'draft' },
    { variantName: 'Submitted', innerType: 'ChatInputAnswered', wireValue: 'submitted' },
    { variantName: 'Skipped', innerType: 'ChatInputSkipped', wireValue: 'skipped' },
  ],
  unknown: true,
};

const TOOL_RESULT_CONTENT_UNION: UnionConfig = {
  name: 'ToolResultContent',
  discriminantField: 'type',
  doc: 'ToolResultContent is a content block in a tool result.',
  variants: [
    { variantName: 'Text', innerType: 'ToolResultTextContent', wireValue: 'text' },
    { variantName: 'EmbeddedResource', innerType: 'ToolResultEmbeddedResourceContent', wireValue: 'embeddedResource' },
    { variantName: 'Resource', innerType: 'ToolResultResourceContent', wireValue: 'resource' },
    { variantName: 'FileEdit', innerType: 'ToolResultFileEditContent', wireValue: 'fileEdit' },
    { variantName: 'Terminal', innerType: 'ToolResultTerminalContent', wireValue: 'terminal' },
    { variantName: 'Subagent', innerType: 'ToolResultSubagentContent', wireValue: 'subagent' },
  ],
  unknown: true,
};

const MESSAGE_ATTACHMENT_UNION: UnionConfig = {
  name: 'MessageAttachment',
  discriminantField: 'type',
  doc: 'MessageAttachment is an attachment associated with a Message.',
  variants: [
    { variantName: 'Simple', innerType: 'SimpleMessageAttachment', wireValue: 'simple' },
    { variantName: 'EmbeddedResource', innerType: 'MessageEmbeddedResourceAttachment', wireValue: 'embeddedResource' },
    { variantName: 'Resource', innerType: 'MessageResourceAttachment', wireValue: 'resource' },
    { variantName: 'Annotations', innerType: 'MessageAnnotationsAttachment', wireValue: 'annotations' },
  ],
  unknown: true,
};

const CUSTOMIZATION_UNION: UnionConfig = {
  name: 'Customization',
  discriminantField: 'type',
  doc: 'Customization is a top-level customization (plugin, directory, or bare MCP server).',
  variants: [
    { variantName: 'Plugin', innerType: 'PluginCustomization', wireValue: 'plugin' },
    { variantName: 'Directory', innerType: 'DirectoryCustomization', wireValue: 'directory' },
    { variantName: 'McpServer', innerType: 'McpServerCustomization', wireValue: 'mcpServer' },
  ],
  unknown: true,
};

const CHILD_CUSTOMIZATION_UNION: UnionConfig = {
  name: 'ChildCustomization',
  discriminantField: 'type',
  doc: 'ChildCustomization is a child customization living inside a plugin or directory.',
  variants: [
    { variantName: 'Agent', innerType: 'AgentCustomization', wireValue: 'agent' },
    { variantName: 'Skill', innerType: 'SkillCustomization', wireValue: 'skill' },
    { variantName: 'Prompt', innerType: 'PromptCustomization', wireValue: 'prompt' },
    { variantName: 'Rule', innerType: 'RuleCustomization', wireValue: 'rule' },
    { variantName: 'Hook', innerType: 'HookCustomization', wireValue: 'hook' },
    { variantName: 'McpServer', innerType: 'McpServerCustomization', wireValue: 'mcpServer' },
  ],
  unknown: true,
};

const CUSTOMIZATION_LOAD_STATE_UNION: UnionConfig = {
  name: 'CustomizationLoadState',
  discriminantField: 'kind',
  doc: 'CustomizationLoadState is the host-reported load state for a container customization.',
  variants: [
    { variantName: 'Loading', innerType: 'CustomizationLoadingState', wireValue: 'loading' },
    { variantName: 'Loaded', innerType: 'CustomizationLoadedState', wireValue: 'loaded' },
    { variantName: 'Degraded', innerType: 'CustomizationDegradedState', wireValue: 'degraded' },
    { variantName: 'Error', innerType: 'CustomizationErrorState', wireValue: 'error' },
  ],
  unknown: true,
};

const MCP_SERVER_STATUS_UNION: UnionConfig = {
  name: 'McpServerState',
  discriminantField: 'kind',
  doc: 'McpServerState is the discriminated lifecycle status of an MCP server customization.',
  variants: [
    { variantName: 'Starting', innerType: 'McpServerStartingState', wireValue: 'starting' },
    { variantName: 'Ready', innerType: 'McpServerReadyState', wireValue: 'ready' },
    { variantName: 'AuthRequired', innerType: 'McpServerAuthRequiredState', wireValue: 'authRequired' },
    { variantName: 'Error', innerType: 'McpServerErrorState', wireValue: 'error' },
    { variantName: 'Stopped', innerType: 'McpServerStoppedState', wireValue: 'stopped' },
  ],
  unknown: true,
};

const TOOL_CALL_CONTRIBUTOR_UNION: UnionConfig = {
  name: 'ToolCallContributor',
  discriminantField: 'kind',
  doc: 'ToolCallContributor identifies the contributor (client or MCP server) of a tool call.',
  variants: [
    { variantName: 'Client', innerType: 'ToolCallClientContributor', wireValue: 'client' },
    { variantName: 'Mcp', innerType: 'ToolCallMcpContributor', wireValue: 'mcp' },
  ],
  unknown: true,
};

function generateChatOriginGo(): string {
  return `// ChatOrigin describes how a chat came into existence.
type ChatOrigin struct {
\tValue isChatOrigin
}

// isChatOrigin is the marker interface for chat origin variants.
type isChatOrigin interface{ isChatOrigin() }

type ChatUserOrigin struct {
\tKind ChatOriginKind \`json:"kind"\`
}

func (*ChatUserOrigin) isChatOrigin() {}

type ChatForkOrigin struct {
\tKind   ChatOriginKind \`json:"kind"\`
\tChat   URI            \`json:"chat"\`
\tTurnId string         \`json:"turnId"\`
}

func (*ChatForkOrigin) isChatOrigin() {}

type ChatToolOrigin struct {
\tKind       ChatOriginKind \`json:"kind"\`
\tChat       URI            \`json:"chat"\`
\tToolCallId string         \`json:"toolCallId"\`
}

func (*ChatToolOrigin) isChatOrigin() {}

type ChatOriginUnknown struct {
\tRaw json.RawMessage
}

func (*ChatOriginUnknown) isChatOrigin() {}

func (o *ChatOrigin) UnmarshalJSON(data []byte) error {
\tdisc, _, err := readDiscriminator(data, "kind")
\tif err != nil {
\t\treturn err
\t}
\tswitch disc {
\tcase "user":
\t\tvar v ChatUserOrigin
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\to.Value = &v
\tcase "fork":
\t\tvar v ChatForkOrigin
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\to.Value = &v
\tcase "tool":
\t\tvar v ChatToolOrigin
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\to.Value = &v
\tdefault:
\t\traw := make(json.RawMessage, len(data))
\t\tcopy(raw, data)
\t\to.Value = &ChatOriginUnknown{Raw: raw}
\t}
\treturn nil
}

func (o ChatOrigin) MarshalJSON() ([]byte, error) {
\tif unk, ok := o.Value.(*ChatOriginUnknown); ok {
\t\tif len(unk.Raw) == 0 {
\t\t\treturn []byte("null"), nil
\t\t}
\t\treturn unk.Raw, nil
\t}
\tif o.Value == nil {
\t\treturn []byte("null"), nil
\t}
\treturn json.Marshal(o.Value)
}`;
}

function generateSnapshotState(): string {
  return `// SnapshotState is the state payload of a snapshot — root, session,
// chat, terminal, changeset, resource-watch, or annotations state. The active
// variant is chosen by which pointer field is non-nil; UnmarshalJSON probes
// for required fields in the canonical order
// (session → chat → terminal → changeset → resourceWatch → annotations → root).
type SnapshotState struct {
\tRoot          *RootState          \`json:"-"\`
\tSession       *SessionState       \`json:"-"\`
\tChat          *ChatState          \`json:"-"\`
\tTerminal      *TerminalState      \`json:"-"\`
\tChangeset     *ChangesetState     \`json:"-"\`
\tResourceWatch *ResourceWatchState \`json:"-"\`
\tAnnotations   *AnnotationsState   \`json:"-"\`
}

// MarshalJSON encodes whichever variant is currently populated.
func (s SnapshotState) MarshalJSON() ([]byte, error) {
\tswitch {
\tcase s.Session != nil:
\t\treturn json.Marshal(s.Session)
\tcase s.Chat != nil:
\t\treturn json.Marshal(s.Chat)
\tcase s.Terminal != nil:
\t\treturn json.Marshal(s.Terminal)
\tcase s.Changeset != nil:
\t\treturn json.Marshal(s.Changeset)
\tcase s.ResourceWatch != nil:
\t\treturn json.Marshal(s.ResourceWatch)
\tcase s.Annotations != nil:
\t\treturn json.Marshal(s.Annotations)
\tcase s.Root != nil:
\t\treturn json.Marshal(s.Root)
\tdefault:
\t\treturn []byte("null"), nil
\t}
}

// UnmarshalJSON tries each concrete variant in turn and keeps the first
// one that decodes without losing any of its required fields.
func (s *SnapshotState) UnmarshalJSON(data []byte) error {
\t*s = SnapshotState{}
\tvar probe map[string]json.RawMessage
\tif err := json.Unmarshal(data, &probe); err != nil {
\t\treturn err
\t}
\tswitch {
\tcase containsAll(probe, "summary", "lifecycle"):
\t\tvar v SessionState
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\ts.Session = &v
\tcase containsAll(probe, "summary", "turns"):
\t\tvar v ChatState
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\ts.Chat = &v
\tcase containsAll(probe, "content"):
\t\tvar v TerminalState
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\ts.Terminal = &v
\tcase containsAll(probe, "status", "files"):
\t\tvar v ChangesetState
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\ts.Changeset = &v
\tcase containsAll(probe, "root", "recursive"):
\t\tvar v ResourceWatchState
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\ts.ResourceWatch = &v
\tcase containsAll(probe, "annotations"):
\t\tvar v AnnotationsState
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\ts.Annotations = &v
\tdefault:
\t\tvar v RootState
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\ts.Root = &v
\t}
\treturn nil
}

func containsAll(m map[string]json.RawMessage, keys ...string) bool {
\tfor _, k := range keys {
\t\tif _, ok := m[k]; !ok {
\t\t\treturn false
\t\t}
\t}
\treturn true
}`;
}

function generateStateFile(project: Project): string {
  const lines: string[] = [HEADER_WITH_IMPORTS];

  lines.push('// ─── Enums ────────────────────────────────────────────────────────────\n');
  for (const enumName of STATE_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ─── Structs ──────────────────────────────────────────────────────────\n');
  for (const entry of STATE_STRUCTS) {
    try {
      lines.push(
        generateStructFromInterface(project, entry.name, entry.goName, {
          omitDiscriminants: entry.omitDiscriminants,
        }),
      );
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: could not generate ${entry.name}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// ─── Discriminated Unions ─────────────────────────────────────────────\n');
  lines.push(generateDiscriminatedUnion(RESPONSE_PART_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_CALL_STATE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TERMINAL_CLAIM_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TERMINAL_CONTENT_PART_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CHAT_INPUT_QUESTION_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CHAT_INPUT_ANSWER_VALUE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CHAT_INPUT_ANSWER_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_RESULT_CONTENT_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(MESSAGE_ATTACHMENT_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CUSTOMIZATION_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CHILD_CUSTOMIZATION_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(CUSTOMIZATION_LOAD_STATE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(MCP_SERVER_STATUS_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_CALL_CONTRIBUTOR_UNION));
  lines.push('');
  lines.push(generateChatOriginGo());
  lines.push('');
  lines.push(generateSnapshotState());
  lines.push('');

  return lines.join('\n');
}

// ─── Actions File Generator ──────────────────────────────────────────────────

const ACTION_VARIANTS: {
  type: string;
  variantName: string;
  tsInterface: string;
}[] = [
  { type: 'root/agentsChanged', variantName: 'RootAgentsChanged', tsInterface: 'RootAgentsChangedAction' },
  { type: 'root/activeSessionsChanged', variantName: 'RootActiveSessionsChanged', tsInterface: 'RootActiveSessionsChangedAction' },
  { type: 'root/configChanged', variantName: 'RootConfigChanged', tsInterface: 'RootConfigChangedAction' },
  { type: 'session/ready', variantName: 'SessionReady', tsInterface: 'SessionReadyAction' },
  { type: 'session/creationFailed', variantName: 'SessionCreationFailed', tsInterface: 'SessionCreationFailedAction' },
  { type: 'session/chatAdded', variantName: 'SessionChatAdded', tsInterface: 'SessionChatAddedAction' },
  { type: 'session/chatRemoved', variantName: 'SessionChatRemoved', tsInterface: 'SessionChatRemovedAction' },
  { type: 'session/chatUpdated', variantName: 'SessionChatUpdated', tsInterface: 'SessionChatUpdatedAction' },
  { type: 'session/defaultChatChanged', variantName: 'SessionDefaultChatChanged', tsInterface: 'SessionDefaultChatChangedAction' },
  { type: 'chat/turnStarted', variantName: 'ChatTurnStarted', tsInterface: 'ChatTurnStartedAction' },
  { type: 'chat/delta', variantName: 'ChatDelta', tsInterface: 'ChatDeltaAction' },
  { type: 'chat/responsePart', variantName: 'ChatResponsePart', tsInterface: 'ChatResponsePartAction' },
  { type: 'chat/toolCallStart', variantName: 'ChatToolCallStart', tsInterface: 'ChatToolCallStartAction' },
  { type: 'chat/toolCallDelta', variantName: 'ChatToolCallDelta', tsInterface: 'ChatToolCallDeltaAction' },
  { type: 'chat/toolCallReady', variantName: 'ChatToolCallReady', tsInterface: 'ChatToolCallReadyAction' },
  { type: 'chat/toolCallConfirmed', variantName: 'ChatToolCallConfirmed', tsInterface: '_chat_tool_call_confirmed_' },
  { type: 'chat/toolCallComplete', variantName: 'ChatToolCallComplete', tsInterface: 'ChatToolCallCompleteAction' },
  { type: 'chat/toolCallResultConfirmed', variantName: 'ChatToolCallResultConfirmed', tsInterface: 'ChatToolCallResultConfirmedAction' },
  { type: 'chat/toolCallContentChanged', variantName: 'ChatToolCallContentChanged', tsInterface: 'ChatToolCallContentChangedAction' },
  { type: 'chat/turnComplete', variantName: 'ChatTurnComplete', tsInterface: 'ChatTurnCompleteAction' },
  { type: 'chat/turnCancelled', variantName: 'ChatTurnCancelled', tsInterface: 'ChatTurnCancelledAction' },
  { type: 'chat/error', variantName: 'ChatError', tsInterface: 'ChatErrorAction' },
  { type: 'session/titleChanged', variantName: 'SessionTitleChanged', tsInterface: 'SessionTitleChangedAction' },
  { type: 'chat/usage', variantName: 'ChatUsage', tsInterface: 'ChatUsageAction' },
  { type: 'chat/reasoning', variantName: 'ChatReasoning', tsInterface: 'ChatReasoningAction' },
  { type: 'chat/pendingMessageSet', variantName: 'ChatPendingMessageSet', tsInterface: 'ChatPendingMessageSetAction' },
  { type: 'chat/pendingMessageRemoved', variantName: 'ChatPendingMessageRemoved', tsInterface: 'ChatPendingMessageRemovedAction' },
  { type: 'chat/queuedMessagesReordered', variantName: 'ChatQueuedMessagesReordered', tsInterface: 'ChatQueuedMessagesReorderedAction' },
  { type: 'chat/inputRequested', variantName: 'ChatInputRequested', tsInterface: 'ChatInputRequestedAction' },
  { type: 'chat/inputAnswerChanged', variantName: 'ChatInputAnswerChanged', tsInterface: 'ChatInputAnswerChangedAction' },
  { type: 'chat/inputCompleted', variantName: 'ChatInputCompleted', tsInterface: 'ChatInputCompletedAction' },
  { type: 'chat/truncated', variantName: 'ChatTruncated', tsInterface: 'ChatTruncatedAction' },
  { type: 'session/modelChanged', variantName: 'SessionModelChanged', tsInterface: 'SessionModelChangedAction' },
  { type: 'session/agentChanged', variantName: 'SessionAgentChanged', tsInterface: 'SessionAgentChangedAction' },
  { type: 'session/isReadChanged', variantName: 'SessionIsReadChanged', tsInterface: 'SessionIsReadChangedAction' },
  { type: 'session/isArchivedChanged', variantName: 'SessionIsArchivedChanged', tsInterface: 'SessionIsArchivedChangedAction' },
  { type: 'session/activityChanged', variantName: 'SessionActivityChanged', tsInterface: 'SessionActivityChangedAction' },
  { type: 'session/changesetsChanged', variantName: 'SessionChangesetsChanged', tsInterface: 'SessionChangesetsChangedAction' },
  { type: 'session/serverToolsChanged', variantName: 'SessionServerToolsChanged', tsInterface: 'SessionServerToolsChangedAction' },
  { type: 'session/activeClientChanged', variantName: 'SessionActiveClientChanged', tsInterface: 'SessionActiveClientChangedAction' },
  { type: 'session/activeClientToolsChanged', variantName: 'SessionActiveClientToolsChanged', tsInterface: 'SessionActiveClientToolsChangedAction' },
  { type: 'session/customizationsChanged', variantName: 'SessionCustomizationsChanged', tsInterface: 'SessionCustomizationsChangedAction' },
  { type: 'session/customizationToggled', variantName: 'SessionCustomizationToggled', tsInterface: 'SessionCustomizationToggledAction' },
  { type: 'session/customizationUpdated', variantName: 'SessionCustomizationUpdated', tsInterface: 'SessionCustomizationUpdatedAction' },
  { type: 'session/customizationRemoved', variantName: 'SessionCustomizationRemoved', tsInterface: 'SessionCustomizationRemovedAction' },
  { type: 'session/mcpServerStateChanged', variantName: 'SessionMcpServerStateChanged', tsInterface: 'SessionMcpServerStateChangedAction' },
  { type: 'session/configChanged', variantName: 'SessionConfigChanged', tsInterface: 'SessionConfigChangedAction' },
  { type: 'session/metaChanged', variantName: 'SessionMetaChanged', tsInterface: 'SessionMetaChangedAction' },
  { type: 'changeset/statusChanged', variantName: 'ChangesetStatusChanged', tsInterface: 'ChangesetStatusChangedAction' },
  { type: 'changeset/fileSet', variantName: 'ChangesetFileSet', tsInterface: 'ChangesetFileSetAction' },
  { type: 'changeset/fileRemoved', variantName: 'ChangesetFileRemoved', tsInterface: 'ChangesetFileRemovedAction' },
  { type: 'changeset/operationsChanged', variantName: 'ChangesetOperationsChanged', tsInterface: 'ChangesetOperationsChangedAction' },
  { type: 'changeset/operationStatusChanged', variantName: 'ChangesetOperationStatusChanged', tsInterface: 'ChangesetOperationStatusChangedAction' },
  { type: 'changeset/cleared', variantName: 'ChangesetCleared', tsInterface: 'ChangesetClearedAction' },
  { type: 'annotations/set', variantName: 'AnnotationsSet', tsInterface: 'AnnotationsSetAction' },
  { type: 'annotations/updated', variantName: 'AnnotationsUpdated', tsInterface: 'AnnotationsUpdatedAction' },
  { type: 'annotations/removed', variantName: 'AnnotationsRemoved', tsInterface: 'AnnotationsRemovedAction' },
  { type: 'annotations/entrySet', variantName: 'AnnotationsEntrySet', tsInterface: 'AnnotationsEntrySetAction' },
  { type: 'annotations/entryRemoved', variantName: 'AnnotationsEntryRemoved', tsInterface: 'AnnotationsEntryRemovedAction' },
  { type: 'root/terminalsChanged', variantName: 'RootTerminalsChanged', tsInterface: 'RootTerminalsChangedAction' },
  { type: 'terminal/data', variantName: 'TerminalData', tsInterface: 'TerminalDataAction' },
  { type: 'terminal/input', variantName: 'TerminalInput', tsInterface: 'TerminalInputAction' },
  { type: 'terminal/resized', variantName: 'TerminalResized', tsInterface: 'TerminalResizedAction' },
  { type: 'terminal/claimed', variantName: 'TerminalClaimed', tsInterface: 'TerminalClaimedAction' },
  { type: 'terminal/titleChanged', variantName: 'TerminalTitleChanged', tsInterface: 'TerminalTitleChangedAction' },
  { type: 'terminal/cwdChanged', variantName: 'TerminalCwdChanged', tsInterface: 'TerminalCwdChangedAction' },
  { type: 'terminal/exited', variantName: 'TerminalExited', tsInterface: 'TerminalExitedAction' },
  { type: 'terminal/cleared', variantName: 'TerminalCleared', tsInterface: 'TerminalClearedAction' },
  { type: 'terminal/commandDetectionAvailable', variantName: 'TerminalCommandDetectionAvailable', tsInterface: 'TerminalCommandDetectionAvailableAction' },
  { type: 'terminal/commandExecuted', variantName: 'TerminalCommandExecuted', tsInterface: 'TerminalCommandExecutedAction' },
  { type: 'terminal/commandFinished', variantName: 'TerminalCommandFinished', tsInterface: 'TerminalCommandFinishedAction' },
  { type: 'resourceWatch/changed', variantName: 'ResourceWatchChanged', tsInterface: 'ResourceWatchChangedAction' },
];

function generateMergedChatToolCallConfirmedStruct(): string {
  return `// ChatToolCallConfirmedAction is the client approves or denies a
// pending tool call (merged approved + denied variants on the wire).
type ChatToolCallConfirmedAction struct {
\tType            ActionType                     \`json:"type"\`
\tTurnId          string                         \`json:"turnId"\`
\tToolCallId      string                         \`json:"toolCallId"\`
\tMeta            map[string]json.RawMessage     \`json:"_meta,omitempty"\`
\tApproved        bool                           \`json:"approved"\`
\tConfirmed       *ToolCallConfirmationReason    \`json:"confirmed,omitempty"\`
\tReason          *ToolCallCancellationReason    \`json:"reason,omitempty"\`
\tEditedToolInput *string                        \`json:"editedToolInput,omitempty"\`
\tUserSuggestion  *Message                       \`json:"userSuggestion,omitempty"\`
\tReasonMessage   *StringOrMarkdown              \`json:"reasonMessage,omitempty"\`
\tSelectedOptionId *string                       \`json:"selectedOptionId,omitempty"\`
}`;
}

function generateActionEnvelope(): string {
  // origin is `ActionOrigin | undefined`; the `| undefined` sentinel serializes to ABSENT,
  // so it omits when empty — consistent with activity/usage and every other client.
  return `// ActionEnvelope wraps every action with the channel URI it
// belongs to, the server-assigned monotonic sequence number, and an
// optional origin record.
type ActionEnvelope struct {
\tChannel         URI           \`json:"channel"\`
\tAction          StateAction   \`json:"action"\`
\tServerSeq       int64         \`json:"serverSeq"\`
\tOrigin          *ActionOrigin \`json:"origin,omitempty"\`
\tRejectionReason *string       \`json:"rejectionReason,omitempty"\`
}`;
}

function generateActionTypeEnum(project: Project): string {
  const decl = findEnum(project, 'ActionType');
  if (!decl) return '// TODO: ActionType enum not found';
  return generateEnum(decl);
}

function generateActionsUnion(): string {
  const cfg: UnionConfig = {
    name: 'StateAction',
    discriminantField: 'type',
    doc: 'StateAction is the discriminated union of every state action.',
    variants: ACTION_VARIANTS.map((v) => ({
      variantName: v.variantName,
      innerType:
        v.tsInterface === '_chat_tool_call_confirmed_'
          ? 'ChatToolCallConfirmedAction'
          : stripIPrefix(v.tsInterface),
      wireValue: v.type,
    })),
    unknown: true,
  };
  return generateDiscriminatedUnion(cfg);
}

function generateActionsFile(project: Project): string {
  const lines: string[] = [HEADER_WITH_IMPORTS];

  lines.push('// ─── ActionType ──────────────────────────────────────────────────────\n');
  lines.push(generateActionTypeEnum(project));
  lines.push('');

  lines.push('// ─── Action Envelope ─────────────────────────────────────────────────\n');
  lines.push(generateStructFromInterface(project, 'ActionOrigin'));
  lines.push('');
  lines.push(generateActionEnvelope());
  lines.push('');

  lines.push('// ─── Action Payloads ─────────────────────────────────────────────────\n');
  for (const v of ACTION_VARIANTS) {
    if (v.tsInterface === '_chat_tool_call_confirmed_') {
      lines.push(generateMergedChatToolCallConfirmedStruct());
      lines.push('');
      continue;
    }
    try {
      lines.push(
        generateStructFromInterface(project, v.tsInterface, undefined, {
          includeDiscriminants: true,
        }),
      );
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: could not generate ${v.tsInterface}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// ─── StateAction Union ───────────────────────────────────────────────\n');
  lines.push(generateActionsUnion());
  lines.push('');

  return lines.join('\n');
}

// ─── Commands File Generator ─────────────────────────────────────────────────

const COMMAND_ENUMS = ['ReconnectResultType', 'ContentEncoding', 'CompletionItemKind', 'ResourceType', 'ResourceWriteMode'];

const COMMAND_STRUCTS: { name: string; omitDiscriminants?: boolean; goName?: string }[] = [
  { name: 'InitializeParams' }, { name: 'InitializeResult' },
  { name: 'ClientCapabilities' },
  { name: 'ReconnectParams' },
  { name: 'ReconnectReplayResult', omitDiscriminants: true },
  { name: 'ReconnectSnapshotResult', omitDiscriminants: true },
  { name: 'SubscribeParams' }, { name: 'SubscribeResult' },
  { name: 'SessionForkSource' }, { name: 'CreateSessionParams' },
  { name: 'DisposeSessionParams' },
  { name: 'ChatForkSource' }, { name: 'CreateChatParams' }, { name: 'DisposeChatParams' },
  { name: 'ListSessionsParams' }, { name: 'ListSessionsResult' },
  { name: 'ResourceReadParams' }, { name: 'ResourceReadResult' },
  { name: 'ResourceWriteParams' }, { name: 'ResourceWriteResult' },
  { name: 'ResourceListParams' }, { name: 'ResourceListResult' },
  { name: 'DirectoryEntry' },
  { name: 'ResourceCopyParams' }, { name: 'ResourceCopyResult' },
  { name: 'ResourceDeleteParams' }, { name: 'ResourceDeleteResult' },
  { name: 'ResourceMoveParams' }, { name: 'ResourceMoveResult' },
  { name: 'ResourceResolveParams' }, { name: 'ResourceResolveResult' },
  { name: 'ResourceMkdirParams' }, { name: 'ResourceMkdirResult' },
  { name: 'ResourceRequestParams' }, { name: 'ResourceRequestResult' },
  { name: 'CreateResourceWatchParams' }, { name: 'CreateResourceWatchResult' },
  { name: 'FetchTurnsParams' }, { name: 'FetchTurnsResult' },
  { name: 'UnsubscribeParams' }, { name: 'DispatchActionParams' },
  { name: 'AuthenticateParams' }, { name: 'AuthenticateResult' },
  { name: 'CreateTerminalParams' }, { name: 'DisposeTerminalParams' },
  { name: 'ResolveSessionConfigParams' }, { name: 'ResolveSessionConfigResult' },
  { name: 'SessionConfigCompletionsParams' }, { name: 'SessionConfigCompletionsResult' },
  { name: 'SessionConfigValueItem' },
  { name: 'CompletionsParams' }, { name: 'CompletionItem' }, { name: 'CompletionsResult' },
  { name: 'InvokeChangesetOperationParams' }, { name: 'InvokeChangesetOperationResult' },
  { name: 'ChangesetOperationFollowUp' },
];

const RECONNECT_RESULT_UNION: UnionConfig = {
  name: 'ReconnectResult',
  discriminantField: 'type',
  doc: 'ReconnectResult is the result of the `reconnect` command.',
  variants: [
    { variantName: 'Replay', innerType: 'ReconnectReplayResult', wireValue: 'replay' },
    { variantName: 'Snapshot', innerType: 'ReconnectSnapshotResult', wireValue: 'snapshot' },
  ],
};

function generateChangesetOperationTargetGo(): string {
  return `// ChangesetOperationTarget identifies the file or range a
// ChangesetOperation should act on.
type ChangesetOperationTarget struct {
\tValue isChangesetOperationTarget
}

// isChangesetOperationTarget is the marker interface for the two variants.
type isChangesetOperationTarget interface{ isChangesetOperationTarget() }

// ChangesetOperationResourceTarget targets an entire resource.
type ChangesetOperationResourceTarget struct {
\tKind     string  \`json:"kind"\`
\tResource URI     \`json:"resource"\`
\tSide     *string \`json:"side,omitempty"\`
}

func (*ChangesetOperationResourceTarget) isChangesetOperationTarget() {}

// ChangesetOperationRangeTarget targets a range within a resource.
type ChangesetOperationRangeTarget struct {
\tKind     string  \`json:"kind"\`
\tResource URI     \`json:"resource"\`
\tSide     *string \`json:"side,omitempty"\`
\tRange    TextRange \`json:"range"\`
}

func (*ChangesetOperationRangeTarget) isChangesetOperationTarget() {}

// UnmarshalJSON dispatches on the \`kind\` discriminator.
func (t *ChangesetOperationTarget) UnmarshalJSON(data []byte) error {
\tdisc, _, err := readDiscriminator(data, "kind")
\tif err != nil {
\t\treturn err
\t}
\tswitch disc {
\tcase "resource":
\t\tvar v ChangesetOperationResourceTarget
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\tt.Value = &v
\tcase "range":
\t\tvar v ChangesetOperationRangeTarget
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\tt.Value = &v
\tdefault:
\t\treturn &json.UnmarshalTypeError{Value: "ChangesetOperationTarget"}
\t}
\treturn nil
}

// MarshalJSON encodes the active variant.
func (t ChangesetOperationTarget) MarshalJSON() ([]byte, error) {
\tif t.Value == nil {
\t\treturn []byte("null"), nil
\t}
\treturn json.Marshal(t.Value)
}`;
}

function generateCommandsFile(project: Project): string {
  const lines: string[] = [HEADER_WITH_IMPORTS];

  lines.push('// ─── Enums ────────────────────────────────────────────────────────────\n');
  for (const enumName of COMMAND_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ─── Command Payloads ─────────────────────────────────────────────────\n');
  const generated = new Set<string>();
  for (const entry of COMMAND_STRUCTS) {
    if (generated.has(entry.name)) continue;
    generated.add(entry.name);
    try {
      lines.push(
        generateStructFromInterface(project, entry.name, entry.goName, {
          omitDiscriminants: entry.omitDiscriminants,
        }),
      );
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: could not generate ${entry.name}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// ─── ReconnectResult Union ────────────────────────────────────────────\n');
  lines.push(generateDiscriminatedUnion(RECONNECT_RESULT_UNION));
  lines.push('');

  lines.push('// ─── Changeset Operation Unions ───────────────────────────────────────\n');
  lines.push(generateChangesetOperationTargetGo());
  lines.push('');

  return lines.join('\n');
}

// ─── Notifications File Generator ────────────────────────────────────────────

const NOTIFICATION_ENUMS = ['AuthRequiredReason'];

const NOTIFICATION_STRUCTS = [
  'SessionAddedParams',
  'SessionRemovedParams',
  'SessionSummaryChangedParams',
  'AuthRequiredParams',
  'OtlpExportLogsParams',
  'OtlpExportTracesParams',
  'OtlpExportMetricsParams',
];

function generateNotificationsFile(project: Project): string {
  const lines: string[] = [HEADER_WITH_IMPORTS];

  lines.push('// ─── Enums ────────────────────────────────────────────────────────────\n');
  for (const enumName of NOTIFICATION_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateEnum(decl));
      lines.push('');
    }
  }

  const priorPartials = new Set(requiredPartialStructs);

  lines.push('// ─── Notification Payloads ────────────────────────────────────────────\n');
  for (const tsName of NOTIFICATION_STRUCTS) {
    try {
      lines.push(
        generateStructFromInterface(project, tsName, undefined, {
          omitDiscriminants: true,
        }),
      );
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: could not generate ${tsName}: ${e}`);
      lines.push('');
    }
  }

  const newPartials = [...requiredPartialStructs].filter((n) => !priorPartials.has(n));
  if (newPartials.length > 0) {
    lines.push('// ─── Partial Summaries ────────────────────────────────────────────────\n');
    for (const tsName of newPartials) {
      try {
        lines.push(generatePartialStruct(project, tsName));
        lines.push('');
      } catch (e) {
        lines.push(`// TODO: could not generate Partial<${tsName}>: ${e}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// ─── Errors File Generator ───────────────────────────────────────────────────

function generateErrorsFile(): string {
  return `${GENERATED_BANNER}
// ─── Standard JSON-RPC Error Codes ─────────────────────────────────────────

// Standard JSON-RPC 2.0 error codes.
const (
\t// ErrorCodeParseError indicates the request body was invalid JSON.
\tErrorCodeParseError int32 = -32700
\t// ErrorCodeInvalidRequest indicates the payload was not a valid
\t// JSON-RPC request.
\tErrorCodeInvalidRequest int32 = -32600
\t// ErrorCodeMethodNotFound indicates the requested method does not
\t// exist on the server.
\tErrorCodeMethodNotFound int32 = -32601
\t// ErrorCodeInvalidParams indicates the method parameters did not
\t// match the declared schema.
\tErrorCodeInvalidParams int32 = -32602
\t// ErrorCodeInternalError indicates an unspecified server failure.
\tErrorCodeInternalError int32 = -32603
)

// AHP application-specific error codes (above the JSON-RPC reserved
// range).
const (
\tErrorCodeSessionNotFound             int32 = -32001
\tErrorCodeProviderNotFound            int32 = -32002
\tErrorCodeSessionAlreadyExists        int32 = -32003
\tErrorCodeTurnInProgress              int32 = -32004
\tErrorCodeUnsupportedProtocolVersion  int32 = -32005
\tErrorCodeContentNotFound             int32 = -32006
\tErrorCodeAuthRequired                int32 = -32007
\tErrorCodeNotFound                    int32 = -32008
\tErrorCodePermissionDenied            int32 = -32009
\tErrorCodeAlreadyExists               int32 = -32010
)

// AhpErrorCode is the type alias used by AHP application error codes.
type AhpErrorCode = int32

// JsonRpcErrorCode is the type alias used by standard JSON-RPC codes.
type JsonRpcErrorCode = int32

// ─── Error Detail Payloads ────────────────────────────────────────────────

// AuthRequiredErrorData is the detail payload of an AuthRequired
// (-32007) error.
type AuthRequiredErrorData struct {
\tResources []ProtectedResourceMetadata \`json:"resources"\`
}

// PermissionDeniedErrorData is the detail payload of a
// PermissionDenied (-32009) error.
type PermissionDeniedErrorData struct {
\tRequest *ResourceRequestParams \`json:"request,omitempty"\`
}

// UnsupportedProtocolVersionErrorData is the detail payload of an
// UnsupportedProtocolVersion (-32005) error.
type UnsupportedProtocolVersionErrorData struct {
\tSupportedVersions []string \`json:"supportedVersions"\`
}
`;
}

// ─── Messages File Generator ─────────────────────────────────────────────────

function generateMessagesFile(): string {
  return `${GENERATED_BANNER}
import (
\t"encoding/json"
\t"fmt"
)

// ─── JSON-RPC Envelope ────────────────────────────────────────────────────

// JsonRpcVersion is the sole allowed value of the \`jsonrpc\` field
// (\`"2.0"\`).
type JsonRpcVersion string

// JsonRpcV2 is the canonical \`"2.0"\` JSON-RPC version literal.
const JsonRpcV2 JsonRpcVersion = "2.0"

// JsonRpcRequest is a JSON-RPC 2.0 request (method + id).
type JsonRpcRequest struct {
\tJsonRpc JsonRpcVersion  \`json:"jsonrpc"\`
\tID      uint64          \`json:"id"\`
\tMethod  string          \`json:"method"\`
\tParams  json.RawMessage \`json:"params,omitempty"\`
}

// JsonRpcSuccessResponse is a JSON-RPC 2.0 success response.
type JsonRpcSuccessResponse struct {
\tJsonRpc JsonRpcVersion  \`json:"jsonrpc"\`
\tID      uint64          \`json:"id"\`
\tResult  json.RawMessage \`json:"result"\`
}

// JsonRpcErrorResponse is a JSON-RPC 2.0 error response.
type JsonRpcErrorResponse struct {
\tJsonRpc JsonRpcVersion \`json:"jsonrpc"\`
\tID      uint64         \`json:"id"\`
\tError   JsonRpcError   \`json:"error"\`
}

// JsonRpcError is the standard JSON-RPC 2.0 error object.
type JsonRpcError struct {
\tCode    int32           \`json:"code"\`
\tMessage string          \`json:"message"\`
\tData    json.RawMessage \`json:"data,omitempty"\`
}

// Error implements the standard error interface.
func (e *JsonRpcError) Error() string {
\treturn fmt.Sprintf("jsonrpc error %d: %s", e.Code, e.Message)
}

// JsonRpcNotification is a JSON-RPC 2.0 notification (method, no id).
type JsonRpcNotification struct {
\tJsonRpc JsonRpcVersion  \`json:"jsonrpc"\`
\tMethod  string          \`json:"method"\`
\tParams  json.RawMessage \`json:"params,omitempty"\`
}

// JsonRpcMessage is a discriminated union over the four JSON-RPC
// message shapes. Use [DecodeJsonRpcMessage] to parse an inbound frame
// into the correct variant.
type JsonRpcMessage struct {
\tRequest         *JsonRpcRequest
\tSuccessResponse *JsonRpcSuccessResponse
\tErrorResponse   *JsonRpcErrorResponse
\tNotification    *JsonRpcNotification
}

// MarshalJSON encodes whichever variant is populated.
func (m JsonRpcMessage) MarshalJSON() ([]byte, error) {
\tswitch {
\tcase m.Request != nil:
\t\treturn json.Marshal(m.Request)
\tcase m.SuccessResponse != nil:
\t\treturn json.Marshal(m.SuccessResponse)
\tcase m.ErrorResponse != nil:
\t\treturn json.Marshal(m.ErrorResponse)
\tcase m.Notification != nil:
\t\treturn json.Marshal(m.Notification)
\tdefault:
\t\treturn []byte("null"), nil
\t}
}

// UnmarshalJSON inspects the raw object's shape to pick a variant.
//
// JSON-RPC 2.0's shape rules:
//   - request:        has \`id\` and \`method\`
//   - notification:   has \`method\` but no \`id\`
//   - success-resp:   has \`id\` and \`result\` (no \`error\`)
//   - error-resp:     has \`id\` and \`error\` (no \`result\`)
func (m *JsonRpcMessage) UnmarshalJSON(data []byte) error {
\t*m = JsonRpcMessage{}
\tvar probe map[string]json.RawMessage
\tif err := json.Unmarshal(data, &probe); err != nil {
\t\treturn err
\t}
\t_, hasMethod := probe["method"]
\t_, hasID := probe["id"]
\t_, hasResult := probe["result"]
\t_, hasError := probe["error"]
\tswitch {
\tcase hasMethod && hasID:
\t\tvar v JsonRpcRequest
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\tm.Request = &v
\tcase hasMethod:
\t\tvar v JsonRpcNotification
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\tm.Notification = &v
\tcase hasError:
\t\tvar v JsonRpcErrorResponse
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\tm.ErrorResponse = &v
\tcase hasResult:
\t\tvar v JsonRpcSuccessResponse
\t\tif err := json.Unmarshal(data, &v); err != nil {
\t\t\treturn err
\t\t}
\t\tm.SuccessResponse = &v
\tdefault:
\t\treturn fmt.Errorf("ahptypes: JSON-RPC message has no method/result/error")
\t}
\treturn nil
}

// ActionNotificationParams is the params shape of the server → client
// \`action\` JSON-RPC method.
type ActionNotificationParams = ActionEnvelope
`;
}

// ─── Version File Generator ──────────────────────────────────────────────────

function generateVersionFile(project: Project): string {
  const { current, supported } = readProtocolVersions(project);
  const supportedLiteral = supported.map((v) => `\t${JSON.stringify(v)},`).join('\n');
  return `${GENERATED_BANNER}
// ProtocolVersion is the current protocol version (SemVer
// MAJOR.MINOR.PATCH) that this generated source speaks.
const ProtocolVersion = ${JSON.stringify(current)}

// supportedProtocolVersions backs [SupportedProtocolVersions] — held
// in an unexported slice so callers cannot accidentally mutate the
// shared backing array.
var supportedProtocolVersions = []string{
${supportedLiteral}
}

// SupportedProtocolVersions returns every protocol version this client
// is willing to negotiate, ordered most-preferred-first. The first
// entry always equals [ProtocolVersion]. The returned slice is a fresh
// copy on every call so callers may mutate it freely.
func SupportedProtocolVersions() []string {
\tout := make([]string, len(supportedProtocolVersions))
\tcopy(out, supportedProtocolVersions)
\treturn out
}
`;
}

// ─── Exhaustiveness ─────────────────────────────────────────────────────────

function checkExhaustiveness(project: Project): void {
  const protocolModules = ['state.ts', 'actions.ts', 'commands.ts', 'notifications.ts', 'errors.ts'];
  const imported = new Set<string>();
  for (const baseName of protocolModules) {
    for (const sf of findProtocolSourceFiles(project, baseName)) {
      for (const decl of sf.getInterfaces()) {
        if (decl.isExported()) imported.add(decl.getName());
      }
      for (const decl of sf.getTypeAliases()) {
        if (decl.isExported()) imported.add(decl.getName());
      }
    }
  }

  const coveredByLists = new Set<string>([
    ...STATE_STRUCTS.map((s) => s.name),
    ...STATE_ENUMS,
    ...COMMAND_STRUCTS.map((s) => s.name),
    ...COMMAND_ENUMS,
    ...NOTIFICATION_STRUCTS,
    ...NOTIFICATION_ENUMS,
    ...ACTION_VARIANTS.filter((v) => !v.tsInterface.startsWith('_')).map((v) => v.tsInterface),
  ]);

  const knownSpecial = new Set<string>([
    'URI',
    'BaseParams',
    'StringOrMarkdown',
    'ToolCallState',
    'StateAction',
    'ActionEnvelope',
    'ActionOrigin',
    'ResponsePart',
    'ToolResultContent',
    'SessionToolCallApprovedAction',
    'SessionToolCallDeniedAction',
    'SessionToolCallConfirmedAction',
    'ChatToolCallApprovedAction',
    'ChatToolCallDeniedAction',
    'ChatToolCallConfirmedAction',
    'ChatAction',
    'PingParams',
    'TerminalClaim',
    'TerminalContentPart',
    'ChatOrigin',
    'ChatInputQuestion',
    'ChatInputAnswerValue',
    'ChatInputAnswer',
    'MessageAttachment',
    'MessageAttachmentBase',
    'Customization',
    'ChildCustomization',
    'ChildCustomizationType',
    'CustomizationLoadState',
    'McpServerState',
    'ToolCallContributor',
    'ReconnectResult',
    'AuthRequiredErrorData',
    'PermissionDeniedErrorData',
    'UnsupportedProtocolVersionErrorData',
    'AhpError',
    'AhpErrorDetailsMap',
    'AhpErrorCode',
    'AhpErrorCodeWithData',
    'JsonRpcErrorCode',
    'ChangesetOperationTarget',
  ]);

  const missing = [...imported].filter((n) => !coveredByLists.has(n) && !knownSpecial.has(n));
  if (missing.length > 0) {
    console.warn(
      `generate-go.ts exhaustiveness: the following types are exported from ` +
        `the protocol source modules but not covered by the Go generator:\n` +
        missing.map((n) => `  - ${n}`).join('\n'),
    );
  }
}

function gofmtCandidates(): string[] {
  const candidates = ['gofmt'];
  const goRoot = process.env.GOROOT;
  if (goRoot) {
    candidates.push(path.join(goRoot, 'bin', process.platform === 'win32' ? 'gofmt.exe' : 'gofmt'));
  }
  if (process.platform === 'win32') {
    const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((value): value is string => !!value);
    for (const root of programFiles) {
      candidates.push(path.join(root, 'Go', 'bin', 'gofmt.exe'));
    }
  }
  const orderedCandidates: string[] = [];
  for (const candidate of candidates) {
    if (!orderedCandidates.includes(candidate)) {
      orderedCandidates.push(candidate);
    }
  }
  return orderedCandidates;
}

function resolveGoFmt(allowMissingFormatter: boolean): string | undefined {
  for (const candidate of gofmtCandidates()) {
    try {
      execFileSync(candidate, [], { input: '', stdio: ['pipe', 'ignore', 'ignore'] });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  if (allowMissingFormatter) {
    console.warn(
      `gofmt was not found, so the generated Go module may not be formatted.\n` +
      `Generated Go files must be formatted before they can be merged.\n` +
      `Install Go or add gofmt to PATH to restore formatting,\n` +
      `or run the "Format Generated Sources" GitHub Actions workflow\n` +
      `(Actions tab → "Format Generated Sources" → "Run workflow" on your\n` +
      `branch) to format and commit the generated sources for you.\n`
    );
    return undefined;
  }

  throw new Error(
    `gofmt was not found, so the Go generator cannot produce stable output.\n` +
    `Generated Go files must be formatted before they can be merged.\n` +
    `Install Go or add gofmt to PATH, then rerun npm run generate:go.\n` +
    `To generate anyway without formatting, rerun with --allow-missing-formatter,\n` +
    `then run the "Format Generated Sources" GitHub Actions workflow (Actions tab\n` +
    `→ "Format Generated Sources" → "Run workflow" on your branch) to format and\n` +
    `commit the generated sources for you.`
  );
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function generateGoModule(project: Project, outputDir: string, options: GenerateGoModuleOptions = {}): void {
  const gofmt = resolveGoFmt(options.allowMissingFormatter ?? false);

  checkExhaustiveness(project);

  const srcDir = path.join(outputDir, 'ahptypes');
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(path.join(srcDir, 'state.generated.go'), generateStateFile(project));
  fs.writeFileSync(path.join(srcDir, 'actions.generated.go'), generateActionsFile(project));
  fs.writeFileSync(path.join(srcDir, 'commands.generated.go'), generateCommandsFile(project));
  fs.writeFileSync(path.join(srcDir, 'notifications.generated.go'), generateNotificationsFile(project));
  fs.writeFileSync(path.join(srcDir, 'errors.generated.go'), generateErrorsFile());
  fs.writeFileSync(path.join(srcDir, 'messages.generated.go'), generateMessagesFile());
  fs.writeFileSync(path.join(srcDir, 'version.generated.go'), generateVersionFile(project));

  if (gofmt) {
    try {
      execFileSync(gofmt, ['-w', 'ahptypes'], { cwd: outputDir, stdio: 'inherit' });
    } catch (e) {
      throw new Error(`gofmt -w failed for the generated Go module: ${String(e)}`);
    }
  }
}
