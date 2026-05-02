/**
 * Rust Crate Generator — Generates Rust type definitions for the `ahp-types`
 * crate from the TypeScript source of truth parsed via ts-morph.
 *
 * Output: clients/rust/crates/ahp-types/src/{state,actions,commands,
 * notifications,errors,messages,version}.rs
 *
 * Mirrors the structure of `generate-swift.ts`. The generated files are
 * always overwritten; the hand-written files (`lib.rs`, `common.rs`) are
 * left alone.
 */

import {
  Project,
  InterfaceDeclaration,
  EnumDeclaration,
  PropertySignature,
  SourceFile,
} from 'ts-morph';
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const GENERATED_BANNER = '// Generated from types/*.ts — do not edit.\n//\n// Regenerate with: npm run generate:rust\n\n#![allow(missing_docs)]\n';

const GENERATED_HEADER = `${GENERATED_BANNER}
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use serde_repr::{Deserialize_repr, Serialize_repr};
#[allow(unused_imports)]
use crate::common::{AnyValue, JsonObject, StringOrMarkdown, Uri};
`;

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

const RUST_RESERVED = new Set([
  'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern',
  'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod',
  'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct',
  'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while',
  'async', 'await', 'dyn', 'abstract', 'become', 'box', 'do', 'final',
  'macro', 'override', 'priv', 'typeof', 'unsized', 'virtual', 'yield', 'try',
]);

/** Escape a Rust identifier with `r#` if it collides with a keyword. */
function rustIdent(name: string): string {
  return RUST_RESERVED.has(name) ? `r#${name}` : name;
}

/** camelCase/PascalCase → snake_case */
function toSnakeCase(name: string): string {
  return name
    .replace(/_/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Property name policy: TypeScript wire name → Rust field name.
 *
 * - `_meta` → `meta` (drop the leading underscore, preserve wire name via rename)
 * - otherwise camelCase → snake_case
 */
function rustFieldName(tsName: string): { rustName: string; wireName: string; renamed: boolean } {
  let wireName = tsName;
  let cleanName = tsName;
  if (cleanName.startsWith('_')) {
    cleanName = cleanName.substring(1);
  }
  const snake = toSnakeCase(cleanName);
  const rustName = rustIdent(snake);
  const effectiveName = rustName.startsWith('r#') ? rustName.slice(2) : rustName;
  // Apply a rename whenever the serde rename_all = "camelCase" would produce
  // a different wire name than `tsName`, or whenever the leading underscore was
  // dropped, or whenever reserved-keyword escape is in play.
  const snakeToCamel = effectiveName.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  const renamed = snakeToCamel !== wireName;
  return { rustName, wireName, renamed };
}

/** PascalCase enum variant from a string literal (for explicit-rename variants). */
function toEnumVariant(value: string): string {
  // notify/sessionAdded → NotifySessionAdded
  // session/toolCallStart → SessionToolCallStart
  // pending-confirmation → PendingConfirmation
  // single-select → SingleSelect
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('');
}

// ─── Type Mapping ────────────────────────────────────────────────────────────

/** Tracks Partial<T> references encountered so the generator can emit sibling types. */
const requiredPartialStructs = new Set<string>();

function partialRustName(tsInterfaceName: string): string {
  return `Partial${stripIPrefix(tsInterfaceName)}`;
}

/** Map a TypeScript type expression to a Rust type expression. */
function mapType(tsType: string, propName?: string, containerName?: string): string {
  tsType = tsType.replace(/import\([^)]+\)\./g, '').trim();

  while (tsType.startsWith('(') && tsType.endsWith(')')) {
    tsType = tsType.slice(1, -1).trim();
  }

  if (tsType === 'string') return 'String';
  if (tsType === 'number') {
    return 'i64';
  }
  if (tsType === 'boolean') return 'bool';
  if (tsType === 'unknown') return 'AnyValue';
  if (tsType === 'object') return 'AnyValue';
  if (tsType === 'true' || tsType === 'false') return 'bool';

  if (tsType === 'URI') return 'Uri';
  if (tsType === 'StringOrMarkdown') return 'StringOrMarkdown';

  // SessionStatus is a bitfield — represent as raw u32 rather than enum.
  if (tsType === 'SessionStatus') return 'u32';

  if (tsType === 'IRootState | ISessionState' || tsType === 'IRootState | ISessionState | ITerminalState'
    || tsType === 'RootState | SessionState' || tsType === 'RootState | SessionState | TerminalState') {
    return 'SnapshotState';
  }

  const nullMatch = tsType.match(/^(.+?)\s*\|\s*null$/);
  if (nullMatch) return `Option<${mapType(nullMatch[1], propName, containerName)}>`;

  const undefMatch = tsType.match(/^(.+?)\s*\|\s*undefined$/);
  if (undefMatch) return mapType(undefMatch[1], propName, containerName);

  const arrayMatch = tsType.match(/^(.+)\[\]$/);
  if (arrayMatch) return `Vec<${mapType(arrayMatch[1], propName, containerName)}>`;

  const arrayGenericMatch = tsType.match(/^Array<(.+)>$/);
  if (arrayGenericMatch) return `Vec<${mapType(arrayGenericMatch[1], propName, containerName)}>`;

  const recordMatch = tsType.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) {
    const inner = recordMatch[1].trim();
    if (inner === 'unknown') return 'JsonObject';
    return `std::collections::HashMap<String, ${mapType(inner, propName, containerName)}>`;
  }

  const partialMatch = tsType.match(/^Partial<(\w+)>$/);
  if (partialMatch) {
    requiredPartialStructs.add(partialMatch[1]);
    return partialRustName(partialMatch[1]);
  }

  const enumUnionMatch = tsType.match(/^(\w+)\.\w+(\s*\|\s*\1\.\w+)*$/);
  if (enumUnionMatch) return stripIPrefix(enumUnionMatch[1]);

  const enumMemberMatch = tsType.match(/^(\w+)\.(\w+)$/);
  if (enumMemberMatch) return stripIPrefix(enumMemberMatch[1]);

  // String literal: treat as String for standalone usage. Discriminant fields
  // are filtered out before we reach this function.
  if (tsType.startsWith("'") && tsType.endsWith("'")) return 'String';
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(tsType)) return 'String';

  if (tsType.startsWith('{')) return 'AnyValue';

  return stripIPrefix(tsType);
}

// ─── Property Extraction ─────────────────────────────────────────────────────

interface RustProp {
  rustName: string;
  wireName: string;
  rustType: string;
  optional: boolean;
  renamed: boolean;
  doc: string;
  isLiteralDiscriminant: boolean;
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

/** Returns true if the property has a `@format float` JSDoc tag. */
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

function extractProps(iface: InterfaceDeclaration, project: Project): RustProp[] {
  const allProps = getAllProperties(iface, project);
  const seen = new Set<string>();
  const result: RustProp[] = [];

  for (const p of allProps) {
    const tsName = p.getName();
    if (seen.has(tsName)) continue;
    seen.add(tsName);

    const tsType = getPropertyType(p);

    // Detect literal discriminant: a TS type matching `EnumName.Value` or `'value'`
    // or a narrow string-literal union. These become the enum tag and are not
    // stored as fields on the inner struct.
    const enumMember = tsType.match(/^(\w+)\.(\w+)$/);
    const stringLiteral = tsType.match(/^'([^']+)'$/);
    let isLiteralDiscriminant = false;
    let literalValue: string | undefined;

    // Only treat as discriminant if it's the `type`, `kind`, `status`, `state`, or `role` field.
    const tsPropLower = tsName.toLowerCase();
    if (['type', 'kind', 'status', 'state'].includes(tsPropLower)) {
      if (enumMember) {
        // Resolve enum member value to its wire string/number.
        const enumName = enumMember[1];
        const memberName = enumMember[2];
        const enumDecl = findEnum(project, enumName);
        if (enumDecl) {
          const mem = enumDecl.getMembers().find(m => m.getName() === memberName);
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
        // Union of enum members like `E.A | E.B` — still a discriminant.
        isLiteralDiscriminant = true;
      }
    }

    const { rustName, wireName, renamed } = rustFieldName(tsName);
    const hasUnionUndefined = /\|\s*undefined/.test(tsType);
    const hasQuestionToken = p.hasQuestionToken();

    let rustType = mapType(tsType, tsName, iface.getName());
    // `@format float` overrides the default i64 → f64 for number properties.
    if (rustType === 'i64' && hasFormatFloat(p)) {
      rustType = 'f64';
    }
    const optional = hasQuestionToken || hasUnionUndefined || rustType.startsWith('Option<');
    if (optional && !rustType.startsWith('Option<')) {
      rustType = `Option<${rustType}>`;
    }

    result.push({
      rustName,
      wireName,
      rustType,
      optional,
      renamed,
      doc: getPropertyDoc(p),
      isLiteralDiscriminant,
      literalValue,
    });
  }
  return result;
}

function findEnum(project: Project, name: string): EnumDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const e = sf.getEnum(name);
    if (e) return e;
  }
  return undefined;
}

// ─── Rust Enum Generation ────────────────────────────────────────────────────

function generateRustEnum(enumDecl: EnumDeclaration): string {
  const name = enumDecl.getName();
  const lines: string[] = [];
  const desc = enumDecl.getJsDocs()[0]?.getDescription().trim();
  const values = enumDecl.getMembers().map(m => m.getValue());
  const isNumeric = values.every(v => typeof v === 'number');

  if (desc) {
    for (const d of desc.split('\n')) {
      lines.push(`/// ${d.trim()}`);
    }
  }

  if (isNumeric) {
    lines.push('#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize_repr, Deserialize_repr)]');
    lines.push('#[repr(u32)]');
    lines.push(`pub enum ${name} {`);
    for (const mem of enumDecl.getMembers()) {
      const doc = mem.getJsDocs()[0]?.getDescription().trim();
      if (doc) {
        for (const d of doc.split('\n')) lines.push(`    /// ${d.trimEnd()}`);
      }
      lines.push(`    ${mem.getName()} = ${mem.getValue()},`);
    }
    lines.push('}');
  } else {
    lines.push('#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]');
    lines.push(`pub enum ${name} {`);
    for (const mem of enumDecl.getMembers()) {
      const doc = mem.getJsDocs()[0]?.getDescription().trim();
      if (doc) {
        for (const d of doc.split('\n')) lines.push(`    /// ${d.trimEnd()}`);
      }
      lines.push(`    #[serde(rename = ${JSON.stringify(String(mem.getValue()))})]`);
      lines.push(`    ${mem.getName()},`);
    }
    lines.push('}');
  }
  return lines.join('\n');
}

// ─── Rust Struct Generation ──────────────────────────────────────────────────

interface StructOpts {
  /** Omit fields flagged as literal discriminants (for union variants). */
  omitDiscriminants?: boolean;
  /** Force `Default` derive (synthesizes Default impl when all fields optional). */
  deriveDefault?: boolean;
  /** Docstring for the struct itself. */
  doc?: string;
}

function generateRustStruct(rustName: string, props: RustProp[], opts: StructOpts = {}): string {
  const lines: string[] = [];
  const emittedProps = props.filter(p => !(opts.omitDiscriminants && p.isLiteralDiscriminant));
  const allOptional = emittedProps.length > 0 && emittedProps.every(p => p.optional);
  const wantsDefault = opts.deriveDefault || allOptional;

  if (opts.doc) {
    for (const d of opts.doc.split('\n')) lines.push(`/// ${d.trimEnd()}`);
  }

  const derives = ['Debug', 'Clone', 'PartialEq', 'Serialize', 'Deserialize'];
  if (wantsDefault) derives.push('Default');
  lines.push(`#[derive(${derives.join(', ')})]`);
  lines.push('#[serde(rename_all = "camelCase")]');
  lines.push(`pub struct ${rustName} {`);

  for (const p of emittedProps) {
    if (p.doc) {
      for (const d of p.doc.split('\n')) lines.push(`    /// ${d.trimEnd()}`);
    }
    const attrs: string[] = [];
    if (p.renamed) attrs.push(`rename = ${JSON.stringify(p.wireName)}`);
    if (p.optional) {
      attrs.push('default');
      attrs.push('skip_serializing_if = "Option::is_none"');
    }
    if (attrs.length > 0) {
      lines.push(`    #[serde(${attrs.join(', ')})]`);
    }
    // Box self-referential fields to break infinite size cycles.
    let rustType = p.rustType;
    if (rustType.includes(rustName)) {
      rustType = rustType.replace(new RegExp(`\\b${rustName}\\b`, 'g'), `Box<${rustName}>`);
    }
    lines.push(`    pub ${p.rustName}: ${rustType},`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── Partial Struct Generation ───────────────────────────────────────────────

function generatePartialStruct(project: Project, tsInterfaceName: string): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const props = extractProps(iface, project).map(p => {
    if (p.optional) return p;
    return {
      ...p,
      optional: true,
      rustType: p.rustType.startsWith('Option<') ? p.rustType : `Option<${p.rustType}>`,
    };
  });
  return generateRustStruct(partialRustName(tsInterfaceName), props, {
    deriveDefault: true,
    doc: `Partial equivalent of ${stripIPrefix(tsInterfaceName)} — every field is optional for delta updates.`,
  });
}

// ─── Discriminated Union Generation ──────────────────────────────────────────

interface UnionVariant {
  variantName: string;
  innerType: string;
  wireValue: string;
  doc?: string;
  /** If set, deserialize to this variant but omit the inner struct (unit variant). */
  isUnit?: boolean;
  /** Wrap the inner type in `Box<>` to reduce enum size. */
  boxed?: boolean;
}

interface UnionConfig {
  name: string;
  discriminantField: string;
  doc?: string;
  variants: UnionVariant[];
  /** Extra variant for unknown/future values. */
  unknown?: boolean;
}

function generateDiscriminatedUnion(cfg: UnionConfig): string {
  const lines: string[] = [];
  if (cfg.doc) {
    for (const d of cfg.doc.split('\n')) lines.push(`/// ${d.trimEnd()}`);
  }
  lines.push('#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]');
  lines.push(`#[serde(tag = ${JSON.stringify(cfg.discriminantField)})]`);
  lines.push(`pub enum ${cfg.name} {`);

  for (const v of cfg.variants) {
    if (v.doc) {
      for (const d of v.doc.split('\n')) lines.push(`    /// ${d.trimEnd()}`);
    }
    lines.push(`    #[serde(rename = ${JSON.stringify(v.wireValue)})]`);
    if (v.isUnit) {
      lines.push(`    ${v.variantName},`);
    } else {
      const inner = v.boxed ? `Box<${v.innerType}>` : v.innerType;
      lines.push(`    ${v.variantName}(${inner}),`);
    }
  }

  if (cfg.unknown) {
    lines.push('    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.');
    lines.push('    /// Reducers treat this as a no-op.');
    lines.push('    #[serde(untagged)]');
    lines.push('    Unknown(serde_json::Value),');
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── Interface → Rust Struct (auto) ──────────────────────────────────────────

function generateStructFromInterface(
  project: Project,
  tsInterfaceName: string,
  rustNameOverride?: string,
  opts: StructOpts = {},
): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const name = rustNameOverride ?? stripIPrefix(tsInterfaceName);
  const props = extractProps(iface, project);
  const ifaceDoc = iface.getJsDocs()[0]?.getDescription().trim();
  return generateRustStruct(name, props, { doc: ifaceDoc, ...opts });
}

// ─── State File Generator ────────────────────────────────────────────────────

const STATE_ENUMS = [
  'PolicyState', 'PendingMessageKind', 'SessionLifecycle', 'SessionStatus',
  'SessionInputAnswerState', 'SessionInputAnswerValueKind', 'SessionInputQuestionKind',
  'SessionInputResponseKind',
  'TurnState', 'AttachmentType', 'ResponsePartKind', 'ToolCallStatus',
  'ToolCallConfirmationReason', 'ToolCallCancellationReason',
  'ConfirmationOptionKind',
  'ToolResultContentType', 'CustomizationStatus', 'TerminalClaimKind',
];

/**
 * State structs to emit. The order matters only for human-readability — Rust
 * doesn't require forward declaration. Structs that serve as variants of a
 * discriminated union have `omitDiscriminants: true` set.
 */
const STATE_STRUCTS: { name: string; omitDiscriminants?: boolean; rustName?: string }[] = [
  { name: 'Icon' },
  { name: 'ProtectedResourceMetadata' },
  { name: 'RootState' },
  { name: 'RootConfigState' },
  { name: 'AgentInfo' },
  { name: 'SessionModelInfo' },
  { name: 'ModelSelection' },
  { name: 'ConfigPropertySchema' },
  { name: 'ConfigSchema' },
  { name: 'PendingMessage' },
  { name: 'SessionState' },
  { name: 'SessionActiveClient' },
  { name: 'SessionSummary' },
  { name: 'ProjectInfo' },
  { name: 'SessionConfigPropertySchema' },
  { name: 'SessionConfigSchema' },
  { name: 'SessionConfigState' },
  { name: 'Turn' },
  { name: 'ActiveTurn' },
  { name: 'UserMessage' },
  { name: 'SessionInputOption' },
  { name: 'SessionInputTextAnswerValue', omitDiscriminants: true },
  { name: 'SessionInputNumberAnswerValue', omitDiscriminants: true },
  { name: 'SessionInputBooleanAnswerValue', omitDiscriminants: true },
  { name: 'SessionInputSelectedAnswerValue', omitDiscriminants: true },
  { name: 'SessionInputSelectedManyAnswerValue', omitDiscriminants: true },
  { name: 'SessionInputAnswered', omitDiscriminants: true },
  { name: 'SessionInputSkipped', omitDiscriminants: true },
  { name: 'SessionInputTextQuestion', omitDiscriminants: true },
  { name: 'SessionInputNumberQuestion', omitDiscriminants: true },
  { name: 'SessionInputBooleanQuestion', omitDiscriminants: true },
  { name: 'SessionInputSingleSelectQuestion', omitDiscriminants: true },
  { name: 'SessionInputMultiSelectQuestion', omitDiscriminants: true },
  { name: 'SessionInputRequest' },
  { name: 'MessageAttachment' },
  { name: 'MarkdownResponsePart', omitDiscriminants: true },
  { name: 'ContentRef' },
  { name: 'ResourceReponsePart', omitDiscriminants: true, rustName: 'ResourceResponsePart' },
  { name: 'ToolCallResponsePart', omitDiscriminants: true },
  { name: 'ReasoningResponsePart', omitDiscriminants: true },
  { name: 'SystemNotificationResponsePart', omitDiscriminants: true },
  { name: 'ToolCallResult' },
  { name: 'ConfirmationOption' },
  { name: 'ToolCallStreamingState', omitDiscriminants: true },
  { name: 'ToolCallPendingConfirmationState', omitDiscriminants: true },
  { name: 'ToolCallRunningState', omitDiscriminants: true },
  { name: 'ToolCallPendingResultConfirmationState', omitDiscriminants: true },
  { name: 'ToolCallCompletedState', omitDiscriminants: true },
  { name: 'ToolCallCancelledState', omitDiscriminants: true },
  { name: 'ToolDefinition' },
  { name: 'ToolAnnotations' },
  { name: 'ToolResultTextContent', omitDiscriminants: true },
  { name: 'ToolResultEmbeddedResourceContent', omitDiscriminants: true },
  { name: 'ToolResultResourceContent', omitDiscriminants: true },
  { name: 'ToolResultFileEditContent', omitDiscriminants: true },
  { name: 'ToolResultTerminalContent', omitDiscriminants: true },
  { name: 'ToolResultSubagentContent', omitDiscriminants: true },
  { name: 'CustomizationRef' },
  { name: 'SessionCustomization' },
  { name: 'FileEdit' },
  { name: 'TerminalInfo' },
  { name: 'TerminalClientClaim', omitDiscriminants: true },
  { name: 'TerminalSessionClaim', omitDiscriminants: true },
  { name: 'TerminalState' },
  { name: 'TerminalUnclassifiedPart', omitDiscriminants: true },
  { name: 'TerminalCommandPart', omitDiscriminants: true },
  { name: 'UsageInfo' },
  { name: 'ErrorInfo' },
  { name: 'Snapshot' },
];

const RESPONSE_PART_UNION: UnionConfig = {
  name: 'ResponsePart',
  discriminantField: 'kind',
  doc: 'A single part of a response stream (text, tool call, reasoning, content reference).',
  variants: [
    { variantName: 'Markdown', innerType: 'MarkdownResponsePart', wireValue: 'markdown' },
    { variantName: 'ContentRef', innerType: 'ResourceResponsePart', wireValue: 'contentRef' },
    { variantName: 'ToolCall', innerType: 'ToolCallResponsePart', wireValue: 'toolCall', boxed: true },
    { variantName: 'Reasoning', innerType: 'ReasoningResponsePart', wireValue: 'reasoning' },
    { variantName: 'SystemNotification', innerType: 'SystemNotificationResponsePart', wireValue: 'systemNotification' },
  ],
  unknown: true,
};

const TOOL_CALL_STATE_UNION: UnionConfig = {
  name: 'ToolCallState',
  discriminantField: 'status',
  doc: 'Full tool call lifecycle state.',
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
  doc: 'Who currently holds a terminal.',
  variants: [
    { variantName: 'Client', innerType: 'TerminalClientClaim', wireValue: 'client' },
    { variantName: 'Session', innerType: 'TerminalSessionClaim', wireValue: 'session' },
  ],
  unknown: true,
};

const TERMINAL_CONTENT_PART_UNION: UnionConfig = {
  name: 'TerminalContentPart',
  discriminantField: 'type',
  doc: 'A content part within terminal output.',
  variants: [
    { variantName: 'Unclassified', innerType: 'TerminalUnclassifiedPart', wireValue: 'unclassified' },
    { variantName: 'Command', innerType: 'TerminalCommandPart', wireValue: 'command' },
  ],
  unknown: true,
};

const SESSION_INPUT_QUESTION_UNION: UnionConfig = {
  name: 'SessionInputQuestion',
  discriminantField: 'kind',
  doc: 'One question within a session input request.',
  variants: [
    { variantName: 'Text', innerType: 'SessionInputTextQuestion', wireValue: 'text' },
    { variantName: 'Number', innerType: 'SessionInputNumberQuestion', wireValue: 'number' },
    { variantName: 'Integer', innerType: 'SessionInputNumberQuestion', wireValue: 'integer' },
    { variantName: 'Boolean', innerType: 'SessionInputBooleanQuestion', wireValue: 'boolean' },
    { variantName: 'SingleSelect', innerType: 'SessionInputSingleSelectQuestion', wireValue: 'single-select' },
    { variantName: 'MultiSelect', innerType: 'SessionInputMultiSelectQuestion', wireValue: 'multi-select' },
  ],
  unknown: true,
};

const SESSION_INPUT_ANSWER_VALUE_UNION: UnionConfig = {
  name: 'SessionInputAnswerValue',
  discriminantField: 'kind',
  doc: 'Value captured for one answer.',
  variants: [
    { variantName: 'Text', innerType: 'SessionInputTextAnswerValue', wireValue: 'text' },
    { variantName: 'Number', innerType: 'SessionInputNumberAnswerValue', wireValue: 'number' },
    { variantName: 'Boolean', innerType: 'SessionInputBooleanAnswerValue', wireValue: 'boolean' },
    { variantName: 'Selected', innerType: 'SessionInputSelectedAnswerValue', wireValue: 'selected' },
    { variantName: 'SelectedMany', innerType: 'SessionInputSelectedManyAnswerValue', wireValue: 'selected-many' },
  ],
  unknown: true,
};

const SESSION_INPUT_ANSWER_UNION: UnionConfig = {
  name: 'SessionInputAnswer',
  discriminantField: 'state',
  doc: 'Draft, submitted, or skipped answer for one question.',
  variants: [
    { variantName: 'Draft', innerType: 'SessionInputAnswered', wireValue: 'draft' },
    { variantName: 'Submitted', innerType: 'SessionInputAnswered', wireValue: 'submitted' },
    { variantName: 'Skipped', innerType: 'SessionInputSkipped', wireValue: 'skipped' },
  ],
  unknown: true,
};

const TOOL_RESULT_CONTENT_UNION: UnionConfig = {
  name: 'ToolResultContent',
  discriminantField: 'type',
  doc: 'Content block in a tool result.',
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

function generateSnapshotState(): string {
  return `/// The state payload of a snapshot — root, session, or terminal state.
///
/// Deserialized by trying session first (has required \`summary\`), then
/// terminal (has required \`content\`), then root.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SnapshotState {
    Session(Box<SessionState>),
    Terminal(Box<TerminalState>),
    Root(Box<RootState>),
}`;
}

function generateStateFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'state.ts')!;
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// ─── Enums ────────────────────────────────────────────────────────────\n');
  for (const enumName of STATE_ENUMS) {
    const decl = sf.getEnum(enumName);
    if (decl) {
      lines.push(generateRustEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ─── Structs ──────────────────────────────────────────────────────────\n');
  for (const entry of STATE_STRUCTS) {
    try {
      lines.push(generateStructFromInterface(project, entry.name, entry.rustName, {
        omitDiscriminants: entry.omitDiscriminants,
      }));
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
  lines.push(generateDiscriminatedUnion(SESSION_INPUT_QUESTION_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(SESSION_INPUT_ANSWER_VALUE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(SESSION_INPUT_ANSWER_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_RESULT_CONTENT_UNION));
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
  rustName?: string;
}[] = [
  { type: 'root/agentsChanged', variantName: 'RootAgentsChanged', tsInterface: 'RootAgentsChangedAction' },
  { type: 'root/activeSessionsChanged', variantName: 'RootActiveSessionsChanged', tsInterface: 'RootActiveSessionsChangedAction' },
  { type: 'root/configChanged', variantName: 'RootConfigChanged', tsInterface: 'RootConfigChangedAction' },
  { type: 'session/ready', variantName: 'SessionReady', tsInterface: 'SessionReadyAction' },
  { type: 'session/creationFailed', variantName: 'SessionCreationFailed', tsInterface: 'SessionCreationFailedAction' },
  { type: 'session/turnStarted', variantName: 'SessionTurnStarted', tsInterface: 'SessionTurnStartedAction' },
  { type: 'session/delta', variantName: 'SessionDelta', tsInterface: 'SessionDeltaAction' },
  { type: 'session/responsePart', variantName: 'SessionResponsePart', tsInterface: 'SessionResponsePartAction' },
  { type: 'session/toolCallStart', variantName: 'SessionToolCallStart', tsInterface: 'SessionToolCallStartAction' },
  { type: 'session/toolCallDelta', variantName: 'SessionToolCallDelta', tsInterface: 'SessionToolCallDeltaAction' },
  { type: 'session/toolCallReady', variantName: 'SessionToolCallReady', tsInterface: 'SessionToolCallReadyAction' },
  { type: 'session/toolCallConfirmed', variantName: 'SessionToolCallConfirmed', tsInterface: '_merged_' },
  { type: 'session/toolCallComplete', variantName: 'SessionToolCallComplete', tsInterface: 'SessionToolCallCompleteAction' },
  { type: 'session/toolCallResultConfirmed', variantName: 'SessionToolCallResultConfirmed', tsInterface: 'SessionToolCallResultConfirmedAction' },
  { type: 'session/turnComplete', variantName: 'SessionTurnComplete', tsInterface: 'SessionTurnCompleteAction' },
  { type: 'session/turnCancelled', variantName: 'SessionTurnCancelled', tsInterface: 'SessionTurnCancelledAction' },
  { type: 'session/error', variantName: 'SessionError', tsInterface: 'SessionErrorAction' },
  { type: 'session/titleChanged', variantName: 'SessionTitleChanged', tsInterface: 'SessionTitleChangedAction' },
  { type: 'session/usage', variantName: 'SessionUsage', tsInterface: 'SessionUsageAction' },
  { type: 'session/reasoning', variantName: 'SessionReasoning', tsInterface: 'SessionReasoningAction' },
  { type: 'session/modelChanged', variantName: 'SessionModelChanged', tsInterface: 'SessionModelChangedAction' },
  { type: 'session/isReadChanged', variantName: 'SessionIsReadChanged', tsInterface: 'SessionIsReadChangedAction' },
  { type: 'session/isArchivedChanged', variantName: 'SessionIsArchivedChanged', tsInterface: 'SessionIsArchivedChangedAction' },
  { type: 'session/activityChanged', variantName: 'SessionActivityChanged', tsInterface: 'SessionActivityChangedAction' },
  { type: 'session/serverToolsChanged', variantName: 'SessionServerToolsChanged', tsInterface: 'SessionServerToolsChangedAction' },
  { type: 'session/activeClientChanged', variantName: 'SessionActiveClientChanged', tsInterface: 'SessionActiveClientChangedAction' },
  { type: 'session/activeClientToolsChanged', variantName: 'SessionActiveClientToolsChanged', tsInterface: 'SessionActiveClientToolsChangedAction' },
  { type: 'session/pendingMessageSet', variantName: 'SessionPendingMessageSet', tsInterface: 'SessionPendingMessageSetAction' },
  { type: 'session/pendingMessageRemoved', variantName: 'SessionPendingMessageRemoved', tsInterface: 'SessionPendingMessageRemovedAction' },
  { type: 'session/queuedMessagesReordered', variantName: 'SessionQueuedMessagesReordered', tsInterface: 'SessionQueuedMessagesReorderedAction' },
  { type: 'session/inputRequested', variantName: 'SessionInputRequested', tsInterface: 'SessionInputRequestedAction' },
  { type: 'session/inputAnswerChanged', variantName: 'SessionInputAnswerChanged', tsInterface: 'SessionInputAnswerChangedAction' },
  { type: 'session/inputCompleted', variantName: 'SessionInputCompleted', tsInterface: 'SessionInputCompletedAction' },
  { type: 'session/customizationsChanged', variantName: 'SessionCustomizationsChanged', tsInterface: 'SessionCustomizationsChangedAction' },
  { type: 'session/customizationToggled', variantName: 'SessionCustomizationToggled', tsInterface: 'SessionCustomizationToggledAction' },
  { type: 'session/truncated', variantName: 'SessionTruncated', tsInterface: 'SessionTruncatedAction' },
  { type: 'session/diffsChanged', variantName: 'SessionDiffsChanged', tsInterface: 'SessionDiffsChangedAction' },
  { type: 'session/configChanged', variantName: 'SessionConfigChanged', tsInterface: 'SessionConfigChangedAction' },
  { type: 'session/metaChanged', variantName: 'SessionMetaChanged', tsInterface: 'SessionMetaChangedAction' },
  { type: 'session/toolCallContentChanged', variantName: 'SessionToolCallContentChanged', tsInterface: 'SessionToolCallContentChangedAction' },
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
];

function generateMergedToolCallConfirmedStruct(): string {
  return `/// Client approves or denies a pending tool call (merged approved + denied variants).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallConfirmedAction {
    pub session: Uri,
    pub turn_id: String,
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Whether the tool call was approved.
    pub approved: bool,
    /// How the tool was confirmed (present when approved).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<ToolCallConfirmationReason>,
    /// Why the tool was cancelled (present when denied).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<ToolCallCancellationReason>,
    /// Edited tool input parameters, if the client modified them before confirming.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edited_tool_input: Option<String>,
    /// What the user suggested doing instead (present when denied).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_suggestion: Option<UserMessage>,
    /// Explanation for the denial.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason_message: Option<StringOrMarkdown>,
    /// ID of the selected confirmation option, if the server provided options.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_option_id: Option<String>,
}`;
}

function generateActionsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'actions.ts')!;
  const lines: string[] = [GENERATED_HEADER];
  lines.push('use crate::state::{AgentInfo, ConfirmationOption, ErrorInfo, FileEdit, ModelSelection, ResponsePart, SessionActiveClient, SessionCustomization, SessionInputAnswer, SessionInputRequest, SessionInputResponseKind, TerminalClaim, TerminalInfo, ToolCallResult, ToolCallConfirmationReason, ToolCallCancellationReason, ToolDefinition, ToolResultContent, UsageInfo, UserMessage, PendingMessageKind};');
  lines.push('');

  // ActionType enum
  lines.push('// ─── ActionType ──────────────────────────────────────────────────────\n');
  const actionTypeEnum = sf.getEnum('ActionType');
  if (actionTypeEnum) {
    lines.push(generateRustEnum(actionTypeEnum));
    lines.push('');
  }

  // ActionEnvelope / ActionOrigin
  lines.push('// ─── Action Envelope ─────────────────────────────────────────────────\n');
  lines.push(generateStructFromInterface(project, 'ActionOrigin'));
  lines.push('');
  // ActionEnvelope has a field `action: IStateAction` — we need to replace IStateAction with StateAction
  lines.push(`/// Every action is wrapped in an \`ActionEnvelope\`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionEnvelope {
    pub action: StateAction,
    pub server_seq: u64,
    pub origin: Option<ActionOrigin>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rejection_reason: Option<String>,
}`);
  lines.push('');

  // Individual action structs (as variant inner types — omit the `type` field)
  lines.push('// ─── Action Payloads ─────────────────────────────────────────────────\n');
  for (const v of ACTION_VARIANTS) {
    if (v.tsInterface === '_merged_') {
      lines.push(generateMergedToolCallConfirmedStruct());
      lines.push('');
      continue;
    }
    try {
      lines.push(generateStructFromInterface(project, v.tsInterface, undefined, {
        omitDiscriminants: true,
      }));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: could not generate ${v.tsInterface}: ${e}`);
      lines.push('');
    }
  }

  // StateAction union
  lines.push('// ─── StateAction Union ───────────────────────────────────────────────\n');
  const variants: UnionVariant[] = ACTION_VARIANTS.map(v => ({
    variantName: v.variantName,
    innerType: v.tsInterface === '_merged_' ? 'SessionToolCallConfirmedAction' : stripIPrefix(v.tsInterface),
    wireValue: v.type,
  }));
  lines.push(generateDiscriminatedUnion({
    name: 'StateAction',
    discriminantField: 'type',
    doc: 'Discriminated union of every state action.',
    variants,
    unknown: true,
  }));
  lines.push('');

  return lines.join('\n');
}

// ─── Commands File Generator ─────────────────────────────────────────────────

const COMMAND_ENUMS = ['ReconnectResultType', 'ContentEncoding'];

const COMMAND_STRUCTS: { name: string; omitDiscriminants?: boolean; rustName?: string }[] = [
  { name: 'InitializeParams' }, { name: 'InitializeResult' },
  { name: 'ReconnectParams' },
  { name: 'ReconnectReplayResult', omitDiscriminants: true },
  { name: 'ReconnectSnapshotResult', omitDiscriminants: true },
  { name: 'SubscribeParams' }, { name: 'SubscribeResult' },
  { name: 'SessionForkSource' }, { name: 'CreateSessionParams' },
  { name: 'DisposeSessionParams' },
  { name: 'ListSessionsParams' }, { name: 'ListSessionsResult' },
  { name: 'ResourceReadParams' }, { name: 'ResourceReadResult' },
  { name: 'ResourceWriteParams' }, { name: 'ResourceWriteResult' },
  { name: 'ResourceListParams' }, { name: 'ResourceListResult' },
  { name: 'DirectoryEntry' },
  { name: 'ResourceCopyParams' }, { name: 'ResourceCopyResult' },
  { name: 'ResourceDeleteParams' }, { name: 'ResourceDeleteResult' },
  { name: 'ResourceMoveParams' }, { name: 'ResourceMoveResult' },
  { name: 'ResourceRequestParams' }, { name: 'ResourceRequestResult' },
  { name: 'FetchTurnsParams' }, { name: 'FetchTurnsResult' },
  { name: 'UnsubscribeParams' }, { name: 'DispatchActionParams' },
  { name: 'AuthenticateParams' }, { name: 'AuthenticateResult' },
  { name: 'CreateTerminalParams' }, { name: 'DisposeTerminalParams' },
  { name: 'ResolveSessionConfigParams' }, { name: 'ResolveSessionConfigResult' },
  { name: 'SessionConfigCompletionsParams' }, { name: 'SessionConfigCompletionsResult' },
  { name: 'SessionConfigValueItem' },
];

const RECONNECT_RESULT_UNION: UnionConfig = {
  name: 'ReconnectResult',
  discriminantField: 'type',
  doc: 'Result of the `reconnect` command.',
  variants: [
    { variantName: 'Replay', innerType: 'ReconnectReplayResult', wireValue: 'replay' },
    { variantName: 'Snapshot', innerType: 'ReconnectSnapshotResult', wireValue: 'snapshot' },
  ],
};

function generateCommandsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'commands.ts')!;
  const lines: string[] = [GENERATED_HEADER];
  lines.push('#[allow(unused_imports)]');
  lines.push('use crate::actions::{ActionEnvelope, StateAction};');
  lines.push('#[allow(unused_imports)]');
  lines.push('use crate::state::{ModelSelection, SessionActiveClient, SessionConfigSchema, SessionSummary, Snapshot, SnapshotState, TerminalClaim, Turn};');
  lines.push('');

  lines.push('// ─── Enums ────────────────────────────────────────────────────────────\n');
  for (const enumName of COMMAND_ENUMS) {
    const decl = sf.getEnum(enumName);
    if (decl) {
      lines.push(generateRustEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ─── Command Payloads ─────────────────────────────────────────────────\n');
  const generated = new Set<string>();
  for (const entry of COMMAND_STRUCTS) {
    if (generated.has(entry.name)) continue;
    generated.add(entry.name);
    try {
      lines.push(generateStructFromInterface(project, entry.name, entry.rustName, {
        omitDiscriminants: entry.omitDiscriminants,
      }));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: could not generate ${entry.name}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// ─── ReconnectResult Union ────────────────────────────────────────────\n');
  lines.push(generateDiscriminatedUnion(RECONNECT_RESULT_UNION));
  lines.push('');

  return lines.join('\n');
}

// ─── Notifications File Generator ────────────────────────────────────────────

const NOTIFICATION_ENUMS = ['AuthRequiredReason', 'NotificationType'];

const NOTIFICATION_STRUCTS = [
  'SessionAddedNotification',
  'SessionRemovedNotification',
  'SessionSummaryChangedNotification',
  'AuthRequiredNotification',
];

const PROTOCOL_NOTIFICATION_UNION: UnionConfig = {
  name: 'ProtocolNotification',
  discriminantField: 'type',
  doc: 'Discriminated union of all protocol notifications.',
  variants: [
    { variantName: 'SessionAdded', innerType: 'SessionAddedNotification', wireValue: 'notify/sessionAdded' },
    { variantName: 'SessionRemoved', innerType: 'SessionRemovedNotification', wireValue: 'notify/sessionRemoved' },
    { variantName: 'SessionSummaryChanged', innerType: 'SessionSummaryChangedNotification', wireValue: 'notify/sessionSummaryChanged' },
    { variantName: 'AuthRequired', innerType: 'AuthRequiredNotification', wireValue: 'notify/authRequired' },
  ],
};

function generateNotificationsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'notifications.ts')!;
  const lines: string[] = [GENERATED_HEADER];
  lines.push('#[allow(unused_imports)]');
  lines.push('use crate::state::{FileEdit, ModelSelection, ProjectInfo, SessionStatus, SessionSummary};');
  lines.push('');

  lines.push('// ─── Enums ────────────────────────────────────────────────────────────\n');
  for (const enumName of NOTIFICATION_ENUMS) {
    const decl = sf.getEnum(enumName);
    if (decl) {
      lines.push(generateRustEnum(decl));
      lines.push('');
    }
  }

  const priorPartials = new Set(requiredPartialStructs);

  lines.push('// ─── Notification Payloads ────────────────────────────────────────────\n');
  for (const tsName of NOTIFICATION_STRUCTS) {
    try {
      lines.push(generateStructFromInterface(project, tsName, undefined, {
        omitDiscriminants: true,
      }));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: could not generate ${tsName}: ${e}`);
      lines.push('');
    }
  }

  const newPartials = [...requiredPartialStructs].filter(n => !priorPartials.has(n));
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

  lines.push('// ─── ProtocolNotification Union ───────────────────────────────────────\n');
  lines.push(generateDiscriminatedUnion(PROTOCOL_NOTIFICATION_UNION));
  lines.push('');

  return lines.join('\n');
}

// ─── Errors File Generator ───────────────────────────────────────────────────

function generateErrorsFile(): string {
  return `${GENERATED_HEADER}
use crate::commands::ResourceRequestParams;
use crate::state::ProtectedResourceMetadata;

// ─── Standard JSON-RPC Error Codes ─────────────────────────────────────────

/// Standard JSON-RPC 2.0 error codes.
pub mod json_rpc_error_codes {
    /// Invalid JSON.
    pub const PARSE_ERROR: i32 = -32700;
    /// Not a valid JSON-RPC request.
    pub const INVALID_REQUEST: i32 = -32600;
    /// Unknown method name.
    pub const METHOD_NOT_FOUND: i32 = -32601;
    /// Invalid method parameters.
    pub const INVALID_PARAMS: i32 = -32602;
    /// Unspecified server error.
    pub const INTERNAL_ERROR: i32 = -32603;
}

/// AHP application-specific error codes.
pub mod ahp_error_codes {
    /// The referenced session URI does not exist.
    pub const SESSION_NOT_FOUND: i32 = -32001;
    /// The requested agent provider is not registered.
    pub const PROVIDER_NOT_FOUND: i32 = -32002;
    /// A session with the given URI already exists.
    pub const SESSION_ALREADY_EXISTS: i32 = -32003;
    /// The operation requires no active turn, but one is in progress.
    pub const TURN_IN_PROGRESS: i32 = -32004;
    /// The client's protocol version is not supported by the server.
    pub const UNSUPPORTED_PROTOCOL_VERSION: i32 = -32005;
    /// The requested content URI does not exist.
    pub const CONTENT_NOT_FOUND: i32 = -32006;
    /// Authentication required for a protected resource.
    pub const AUTH_REQUIRED: i32 = -32007;
    /// The requested file, folder, or URI does not exist.
    pub const NOT_FOUND: i32 = -32008;
    /// The client is not permitted to access the requested resource.
    pub const PERMISSION_DENIED: i32 = -32009;
    /// The target resource already exists and the operation does not allow overwriting.
    pub const ALREADY_EXISTS: i32 = -32010;
}

/// Type alias: AHP application error code.
pub type AhpErrorCode = i32;
/// Type alias: JSON-RPC 2.0 error code.
pub type JsonRpcErrorCode = i32;

// ─── Error Detail Payloads ────────────────────────────────────────────────

/// Details carried in the \`data\` field of an \`AuthRequired\` (-32007) error.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRequiredErrorData {
    /// Protected resources that require authentication.
    pub resources: Vec<ProtectedResourceMetadata>,
}

/// Details carried in the \`data\` field of a \`PermissionDenied\` (-32009) error.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDeniedErrorData {
    /// The resource access that, if granted via \`resourceRequest\`, would
    /// unlock the operation. Omitted when no specific access grant would
    /// resolve the denial.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request: Option<ResourceRequestParams>,
}
`;
}

// ─── Messages File Generator ─────────────────────────────────────────────────

function generateMessagesFile(): string {
  return `${GENERATED_HEADER}
use crate::actions::ActionEnvelope;
use crate::notifications::ProtocolNotification;

// ─── JSON-RPC Envelope ────────────────────────────────────────────────────

/// A JSON-RPC 2.0 request (method + id).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: JsonRpcVersion,
    pub id: u64,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<AnyValue>,
}

/// A JSON-RPC 2.0 success response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcSuccessResponse {
    pub jsonrpc: JsonRpcVersion,
    pub id: u64,
    pub result: AnyValue,
}

/// A JSON-RPC 2.0 error response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcErrorResponse {
    pub jsonrpc: JsonRpcVersion,
    pub id: u64,
    pub error: JsonRpcError,
}

/// JSON-RPC 2.0 error object (\`code\`, \`message\`, optional \`data\`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<AnyValue>,
}

/// A JSON-RPC 2.0 notification (method, no id).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: JsonRpcVersion,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<AnyValue>,
}

/// The sole allowed value of the \`jsonrpc\` field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum JsonRpcVersion {
    #[default]
    #[serde(rename = "2.0")]
    V2,
}

/// A discriminated union over the four JSON-RPC message shapes.
///
/// Useful for a transport that demuxes an inbound byte stream into typed
/// messages before routing them to the correlation and subscription
/// machinery.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JsonRpcMessage {
    Request(JsonRpcRequest),
    SuccessResponse(JsonRpcSuccessResponse),
    ErrorResponse(JsonRpcErrorResponse),
    Notification(JsonRpcNotification),
}

/// Params for the server → client \`notification\` method.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NotificationMethodParams {
    pub notification: ProtocolNotification,
}

/// Params for the server → client \`action\` method.
pub type ActionNotificationParams = ActionEnvelope;
`;
}

// ─── Version File Generator ──────────────────────────────────────────────────

function generateVersionFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName().endsWith('registry.ts'));
  let protocolVersion = 1;
  let minProtocolVersion = 1;
  if (sf) {
    for (const decl of sf.getVariableDeclarations()) {
      if (decl.getName() === 'PROTOCOL_VERSION') {
        const init = decl.getInitializer()?.getText() ?? '1';
        protocolVersion = Number(init) || 1;
      } else if (decl.getName() === 'MIN_PROTOCOL_VERSION') {
        const init = decl.getInitializer()?.getText() ?? '1';
        minProtocolVersion = Number(init) || 1;
      }
    }
  }

  return `${GENERATED_BANNER}
/// Current protocol version.
pub const PROTOCOL_VERSION: u32 = ${protocolVersion};

/// Minimum protocol version this SDK can negotiate.
pub const MIN_PROTOCOL_VERSION: u32 = ${minProtocolVersion};
`;
}

// ─── Exhaustiveness ─────────────────────────────────────────────────────────

function checkExhaustiveness(project: Project): void {
  const v1 = project.getSourceFiles().find(f => f.getBaseName() === 'v1.ts');
  if (!v1) return; // Optional — Swift generator throws but we just skip.

  const protocolModules = new Set(['state', 'actions', 'commands', 'notifications', 'errors']);
  const imported = new Set<string>();
  for (const decl of v1.getImportDeclarations()) {
    const mod = decl.getModuleSpecifierValue().replace(/^\.\.\//, '').replace(/\.js$/, '');
    if (!protocolModules.has(mod)) continue;
    for (const named of decl.getNamedImports()) {
      imported.add(named.getName());
    }
  }

  const coveredByLists = new Set<string>([
    ...STATE_STRUCTS.map(s => s.name),
    ...STATE_ENUMS,
    ...COMMAND_STRUCTS.map(s => s.name),
    ...COMMAND_ENUMS,
    ...NOTIFICATION_STRUCTS,
    ...NOTIFICATION_ENUMS,
    ...ACTION_VARIANTS
      .filter(v => v.tsInterface !== '_merged_')
      .map(v => v.tsInterface),
  ]);

  const knownSpecial = new Set<string>([
    'StringOrMarkdown',
    'ToolCallState',
    'StateAction',
    'ActionEnvelope',
    'ActionOrigin',
    'SessionToolCallApprovedAction',
    'SessionToolCallDeniedAction',
    'ProtocolNotification',
    'TerminalClaim',
    'TerminalContentPart',
    'SessionInputQuestion',
    'SessionInputAnswerValue',
    'SessionInputAnswer',
    'ReconnectResult',
    'AuthRequiredErrorData',
    'PermissionDeniedErrorData',
    'AhpError',
    'AhpErrorDetailsMap',
  ]);

  const missing = [...imported].filter(n => !coveredByLists.has(n) && !knownSpecial.has(n));
  if (missing.length > 0) {
    console.warn(
      `generate-rust.ts exhaustiveness: the following types are declared in v1.ts ` +
      `but not covered by the Rust generator:\n` +
      missing.map(n => `  - ${n}`).join('\n'),
    );
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function generateRustCrate(project: Project, outputDir: string): void {
  // Check that cargo is available; skip generation if not so developers
  // without a Rust toolchain aren't forced to install one.
  try {
    execFileSync('cargo', ['--version'], { stdio: 'ignore' });
  } catch {
    console.warn('  ⚠ cargo not found — skipping Rust crate generation.');
    return;
  }

  checkExhaustiveness(project);

  const srcDir = path.join(outputDir, 'crates', 'ahp-types', 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(path.join(srcDir, 'state.rs'), generateStateFile(project));
  fs.writeFileSync(path.join(srcDir, 'actions.rs'), generateActionsFile(project));
  fs.writeFileSync(path.join(srcDir, 'commands.rs'), generateCommandsFile(project));
  fs.writeFileSync(path.join(srcDir, 'notifications.rs'), generateNotificationsFile(project));
  fs.writeFileSync(path.join(srcDir, 'errors.rs'), generateErrorsFile());
  fs.writeFileSync(path.join(srcDir, 'messages.rs'), generateMessagesFile());
  fs.writeFileSync(path.join(srcDir, 'version.rs'), generateVersionFile(project));

  execSync('cargo fmt -p ahp-types', { cwd: outputDir, stdio: 'inherit' });
}
