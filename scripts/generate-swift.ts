/**
 * Swift Package Generator — Generates the Swift sources of the AgentHostProtocol
 * package from TypeScript type definitions parsed via ts-morph.
 *
 * Outputs (under clients/swift/AgentHostProtocol/):
 *   - Sources/AgentHostProtocol/Generated/*.generated.swift   (always overwritten)
 *   - Sources/AgentHostProtocol/AnyCodable.swift              (only if missing)
 *
 * Note: Package.swift lives at the repository root (see /Package.swift). It
 * is hand-maintained, not generated, because SwiftPM requires the manifest to
 * live at the repo root for remote (`.package(url:)`) consumption.
 */

import {
  Project,
  InterfaceDeclaration,
  EnumDeclaration,
  PropertySignature,
  SourceFile,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { findProtocolSourceFiles } from './find-protocol-sources.js';
import { readProtocolVersions } from './read-protocol-versions.js';

const GENERATED_HEADER = '// Generated from types/*.ts — do not edit\n\nimport Foundation\n';


/** PascalCase → camelCase */
function toCamelCase(name: string): string {
  return name[0].toLowerCase() + name.slice(1);
}

const SWIFT_RESERVED_KEYWORDS = new Set([
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate',
  'func', 'import', 'init', 'inout', 'internal', 'let', 'open', 'operator',
  'private', 'precedencegroup', 'protocol', 'public', 'rethrows', 'static',
  'struct', 'subscript', 'typealias', 'var', 'break', 'case', 'catch',
  'continue', 'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard',
  'if', 'in', 'repeat', 'return', 'throw', 'switch', 'where', 'while', 'as',
  'Any', 'false', 'is', 'nil', 'self', 'Self', 'super', 'throws', 'true', 'try',
]);

function swiftIdentifier(name: string): string {
  return SWIFT_RESERVED_KEYWORDS.has(name) ? `\`${name}\`` : name;
}

/** Convert _meta → meta, otherwise keep as-is */
function swiftPropName(tsPropName: string): string {
  if (tsPropName.startsWith('_')) return tsPropName.substring(1);
  return tsPropName;
}

/** Snake_case → camelCase (for RFC 9728 properties) */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Check if a property needs a CodingKey (wire name differs from Swift name) */
function needsCodingKey(tsPropName: string): boolean {
  return tsPropName.startsWith('_') || tsPropName.includes('_');
}

// ─── Type Mapping ────────────────────────────────────────────────────────────

/** Known inline object types mapped to named Swift structs */
const INLINE_TYPE_OVERRIDES: Record<string, string> = {};

/**
 * Synthetic Swift structs required for `Partial<T>` references encountered
 * during type mapping. Swift has no structural `Partial`, so we emit a
 * sibling struct with every property forced optional. Populated by
 * `mapType`, consumed by the file generators that reference them.
 */
const requiredPartialStructs = new Set<string>();

/** Swift name for `Partial<SessionSummary>` → `PartialSessionSummary`. */
function partialSwiftName(tsInterfaceName: string): string {
  return `Partial${tsInterfaceName}`;
}

/** Map a TypeScript type string to a Swift type string */
function mapType(tsType: string, propName?: string, containerName?: string): string {
  tsType = tsType.replace(/import\([^)]+\)\./g, '').trim();

  // Remove outer parens
  while (tsType.startsWith('(') && tsType.endsWith(')')) {
    tsType = tsType.slice(1, -1).trim();
  }

  // Primitives
  if (tsType === 'string') return 'String';
  if (tsType === 'number') {
    return 'Int';
  }
  if (tsType === 'boolean') return 'Bool';
  if (tsType === 'unknown') return 'AnyCodable';
  if (tsType === 'object') return 'AnyCodable';
  if (tsType === 'true' || tsType === 'false') return 'Bool';
  // A primitive JSON value (`string | number | boolean | null`) maps to a
  // type-erased JSON value.
  if (tsType === 'JsonPrimitive') return 'AnyCodable';

  // Type aliases
  if (tsType === 'URI') return 'String';
  if (tsType === 'StringOrMarkdown') return 'StringOrMarkdown';
  // ChildCustomizationType is a TS-only subset alias of CustomizationType.
  if (tsType === 'ChildCustomizationType') return 'CustomizationType';

  // Known unions
  if (tsType === 'RootState | SessionState'
    || tsType === 'RootState | SessionState | TerminalState'
    || tsType === 'RootState | SessionState | TerminalState | ChangesetState'
    || tsType === 'RootState | SessionState | TerminalState | ChangesetState | AnnotationsState'
    || tsType === 'RootState | SessionState | TerminalState | ChangesetState | ResourceWatchState | AnnotationsState'
    || tsType === 'RootState | SessionState | TerminalState | ChangesetState | ResourceWatchState | AnnotationsState | ChatState'
    || tsType === 'RootState | SessionState | ChatState'
    || tsType === 'RootState | SessionState | ChatState | TerminalState'
    || tsType === 'RootState | SessionState | ChatState | TerminalState | ChangesetState'
    || tsType === 'RootState | SessionState | ChatState | TerminalState | ChangesetState | AnnotationsState') return 'SnapshotState';

  // T | null → T?
  const nullMatch = tsType.match(/^(.+?)\s*\|\s*null$/);
  if (nullMatch) return mapType(nullMatch[1]) + '?';

  // T | undefined → T (optionality from ?)
  const undefMatch = tsType.match(/^(.+?)\s*\|\s*undefined$/);
  if (undefMatch) return mapType(undefMatch[1]);

  // Array: T[]
  const arrayMatch = tsType.match(/^(.+)\[\]$/);
  if (arrayMatch) return `[${mapType(arrayMatch[1])}]`;

  // Array<T>
  const arrayGenericMatch = tsType.match(/^Array<(.+)>$/);
  if (arrayGenericMatch) return `[${mapType(arrayGenericMatch[1])}]`;

  // Record<string, T>
  const recordMatch = tsType.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) {
    const inner = recordMatch[1].trim();
    // `Record<string, never>` is the MCP-style marker for "empty object";
    // treat it like `Record<string, unknown>` so the wire `{}` round-trips.
    if (inner === 'never') return `[String: AnyCodable]`;
    return `[String: ${mapType(inner)}]`;
  }

  // Partial<T> — Swift has no structural Partial; emit/ reuse a sibling
  // struct with every property optional. Tracked for later emission.
  const partialMatch = tsType.match(/^Partial<(\w+)>$/);
  if (partialMatch) {
    requiredPartialStructs.add(partialMatch[1]);
    return partialSwiftName(partialMatch[1]);
  }

  // Enum member union: EnumName.A | EnumName.B | ...
  const enumUnionMatch = tsType.match(/^(\w+)\.\w+(\s*\|\s*\1\.\w+)*$/);
  if (enumUnionMatch) return enumUnionMatch[1];

  // Single enum member: EnumName.Value
  const enumMemberMatch = tsType.match(/^(\w+)\.(\w+)$/);
  if (enumMemberMatch) return enumMemberMatch[1];

  // String literal: 'value'
  if (tsType.startsWith("'") && tsType.endsWith("'")) return 'String';

  // String literal union: 'a' | 'b' | ...
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(tsType)) return 'String';

  // Inline object type → AnyCodable fallback
  if (tsType.startsWith('{')) return 'AnyCodable';

  // Named type
  return tsType;
}

// ─── Property Extraction ─────────────────────────────────────────────────────

interface SwiftProp {
  name: string;      // Swift property name
  wireName: string;  // JSON key
  type: string;      // Swift type
  optional: boolean;
  doc: string;
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

/**
 * Recursively collect all properties from an interface, flattening extends.
 */
function getAllProperties(iface: InterfaceDeclaration, project: Project): PropertySignature[] {
  const props: PropertySignature[] = [];

  // Recurse into base interfaces
  for (const ext of iface.getExtends()) {
    const baseName = ext.getExpression().getText();
    const baseIface = findInterface(project, baseName);
    if (baseIface) {
      props.push(...getAllProperties(baseIface, project));
    }
  }

  // Add own properties
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

/** Extract Swift properties from a TypeScript interface */
function extractProps(iface: InterfaceDeclaration, project: Project): SwiftProp[] {
  const allProps = getAllProperties(iface, project);
  const seen = new Set<string>();

  return allProps
    .filter(p => {
      // Deduplicate (later declaration wins)
      const name = p.getName();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map(p => {
      const tsName = p.getName();
      const tsType = getPropertyType(p);
        let swiftT = mapType(tsType, tsName, iface.getName());
      // `@format float` overrides the default Int → Double for number properties.
      if (swiftT === 'Int' && hasFormatFloat(p)) {
        swiftT = 'Double';
      }
      const hasUnionUndefined = /\|\s*undefined/.test(tsType);
      const isOptional = p.hasQuestionToken() || hasUnionUndefined || swiftT.endsWith('?');
      const finalType = isOptional && !swiftT.endsWith('?') ? swiftT + '?' : swiftT;
      const sName = tsName.startsWith('_')
        ? swiftPropName(tsName)
        : tsName.includes('_')
          ? snakeToCamel(tsName)
          : tsName;

      return {
        name: swiftIdentifier(sName),
        wireName: tsName,
        type: finalType,
        optional: isOptional,
        doc: getPropertyDoc(p),
      };
    });
}

// ─── Swift Doc Emission ──────────────────────────────────────────────────────

function emitSwiftDocLine(docLine: string, indent = ''): string {
  const trimmed = docLine.trim();
  return trimmed ? `${indent}/// ${trimmed}` : `${indent}///`;
}

// ─── Swift Enum Generation ───────────────────────────────────────────────────

function generateSwiftEnum(enumDecl: EnumDeclaration): string {
  const name = enumDecl.getName();
  const lines: string[] = [];
  const desc = enumDecl.getJsDocs()[0]?.getDescription().trim();
  const values = enumDecl.getMembers().map(member => member.getValue());
  const rawType = values.every(value => typeof value === 'number') ? 'Int' : 'String';

  // Bitset enums (detected via JSDoc convention "Bitset of …") are emitted
  // as Swift `OptionSet` structs so OR'd combinations are representable and
  // Codable decoding accepts any int rawValue rather than only enumerated
  // cases.
  const isBitset = rawType === 'Int' && desc !== undefined && /^bitset\b/i.test(desc);

  if (desc) {
    for (const docLine of desc.split('\n')) {
      lines.push(emitSwiftDocLine(docLine));
    }
  }

  if (isBitset) {
    lines.push(`public struct ${name}: OptionSet, Codable, Sendable, Hashable {`);
    lines.push('    public let rawValue: UInt32');
    lines.push('    public init(rawValue: UInt32) { self.rawValue = rawValue }');
    lines.push('');
    for (const member of enumDecl.getMembers()) {
      const memberName = swiftIdentifier(toCamelCase(member.getName()));
      const value = member.getValue();
      const memberDoc = member.getJsDocs()[0]?.getDescription().trim();
      if (memberDoc) {
        for (const docLine of memberDoc.split('\n')) {
          lines.push(emitSwiftDocLine(docLine, '    '));
        }
      }
      lines.push(`    public static let ${memberName} = ${name}(rawValue: ${value})`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  lines.push(`public enum ${name}: ${rawType}, Codable, Sendable {`);

  for (const member of enumDecl.getMembers()) {
    const memberName = swiftIdentifier(toCamelCase(member.getName()));
    const value = member.getValue();
    const memberDoc = member.getJsDocs()[0]?.getDescription().trim();
    if (memberDoc) {
      for (const docLine of memberDoc.split('\n')) {
        lines.push(emitSwiftDocLine(docLine, '    '));
      }
    }
    lines.push(`    case ${memberName} = ${JSON.stringify(value)}`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── Swift Struct Generation ─────────────────────────────────────────────────

function generateSwiftStruct(
  swiftName: string,
  props: SwiftProp[],
  nested?: string,
): string {
  const lines: string[] = [];

  // Detect direct self-recursion. Swift structs cannot store a property
  // that contains themselves (infinite size). Emit such types as a
  // `final class` so the stored property becomes a heap reference.
  // Array/Dictionary of Self are safe (they box via COW storage), so only
  // bare `Self` or `Self?` property types trigger this.
  const isRecursive = props.some(p => p.type === swiftName || p.type === `${swiftName}?`);

  if (isRecursive) {
    lines.push(`public final class ${swiftName}: Codable, @unchecked Sendable {`);
  } else {
    lines.push(`public struct ${swiftName}: Codable, Sendable {`);
  }

  // Properties
  for (const p of props) {
    if (p.doc) {
      for (const docLine of p.doc.split('\n')) {
        lines.push(emitSwiftDocLine(docLine, '    '));
      }
    }
    lines.push(`    public var ${p.name}: ${p.type}`);
  }

  // Nested types
  if (nested) {
    lines.push('');
    for (const line of nested.split('\n')) {
      lines.push(`    ${line}`);
    }
  }

  // CodingKeys if needed
  const needsKeys = props.some(p => p.name !== p.wireName);
  if (needsKeys) {
    lines.push('');
    lines.push('    enum CodingKeys: String, CodingKey {');
    for (const p of props) {
      if (p.name !== p.wireName) {
        lines.push(`        case ${p.name} = ${JSON.stringify(p.wireName)}`);
      } else {
        lines.push(`        case ${p.name}`);
      }
    }
    lines.push('    }');
  }

  // Public init
  lines.push('');
  const initParams = props.map(p => {
    const defaultVal = p.optional ? ' = nil' : '';
    return `        ${p.name}: ${p.type}${defaultVal}`;
  });
  lines.push('    public init(');
  lines.push(initParams.join(',\n'));
  lines.push('    ) {');
  for (const p of props) {
    lines.push(`        self.${p.name} = ${p.name}`);
  }
  lines.push('    }');

  lines.push('}');
  return lines.join('\n');
}

// ─── Discriminated Union Generation ──────────────────────────────────────────

interface UnionVariant {
  caseName: string;
  structName: string;
  discriminantValue: string;
}

interface UnionConfig {
  name: string;
  discriminantField: string;
  variants: UnionVariant[];
  /**
   * When true, an unrecognized discriminant value decodes into a raw
   * `.unknown(AnyCodable)` passthrough case (instead of throwing) and
   * re-encodes the preserved payload verbatim. Mirrors the .NET
   * `UnionConverter(..., allowUnknown: true)` flag so open unions
   * (StateAction, Customization, …) round-trip forward-compatibly.
   * Defaults to false (closed union: throw on unknown — e.g.
   * ChangesetOperationTarget, ReconnectResult).
   */
  allowUnknown?: boolean;
}

function generateDiscriminatedUnion(config: UnionConfig): string {
  const lines: string[] = [];
  lines.push(`public enum ${config.name}: Codable, Sendable {`);

  for (const v of config.variants) {
    lines.push(`    case ${v.caseName}(${v.structName})`);
  }
  if (config.allowUnknown) {
    lines.push('    /// Unknown or future discriminant; the raw payload is preserved');
    lines.push('    /// and re-encoded verbatim for forward-compatibility.');
    lines.push('    case unknown(AnyCodable)');
  }

  lines.push('');
  lines.push('    private enum DiscriminantKey: String, CodingKey {');
  lines.push(`        case discriminant = ${JSON.stringify(config.discriminantField)}`);
  lines.push('    }');

  // Decoder
  lines.push('');
  lines.push('    public init(from decoder: Decoder) throws {');
  lines.push('        let container = try decoder.container(keyedBy: DiscriminantKey.self)');
  lines.push('        let discriminant = try container.decode(String.self, forKey: .discriminant)');
  lines.push('        switch discriminant {');
  for (const v of config.variants) {
    lines.push(`        case ${JSON.stringify(v.discriminantValue)}:`);
    lines.push(`            self = .${v.caseName}(try ${v.structName}(from: decoder))`);
  }
  lines.push('        default:');
  if (config.allowUnknown) {
    lines.push('            self = .unknown(try AnyCodable(from: decoder))');
  } else {
    lines.push(`            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ${config.name} discriminant: \\(discriminant)")`);
  }
  lines.push('        }');
  lines.push('    }');

  // Encoder
  lines.push('');
  lines.push('    public func encode(to encoder: Encoder) throws {');
  lines.push('        switch self {');
  for (const v of config.variants) {
    lines.push(`        case .${v.caseName}(let value): try value.encode(to: encoder)`);
  }
  if (config.allowUnknown) {
    lines.push('        case .unknown(let value): try value.encode(to: encoder)');
  }
  lines.push('        }');
  lines.push('    }');

  lines.push('}');
  return lines.join('\n');
}

// ─── Interface → Swift Struct (auto from project) ────────────────────────────

function generateStructFromInterface(
  project: Project,
  tsInterfaceName: string,
  swiftNameOverride?: string,
): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const name = swiftNameOverride ?? tsInterfaceName;
  const props = extractProps(iface, project);
  return generateSwiftStruct(name, props);
}

/**
 * Emit a Swift counterpart for `Partial<T>`: same properties as `T` but with
 * every field forced optional. The synthetic struct is referenced by
 * `mapType` via `partialSwiftName`.
 */
function generatePartialStructFromInterface(
  project: Project,
  tsInterfaceName: string,
): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const props = extractProps(iface, project).map(p => ({
    ...p,
    optional: true,
    type: p.type.endsWith('?') ? p.type : `${p.type}?`,
  }));
  return generateSwiftStruct(partialSwiftName(tsInterfaceName), props);
}

// ─── State File Generator ────────────────────────────────────────────────────

const STATE_ENUMS = [
  'PolicyState', 'PendingMessageKind', 'SessionLifecycle', 'SessionStatus',
  'ChatOriginKind', 'ChatInteractivity', 'ChatInputAnswerState', 'ChatInputAnswerValueKind', 'ChatInputQuestionKind',
  'ChatInputResponseKind', 'SessionInputRequestKind',
  'TurnState', 'MessageKind', 'MessageAttachmentKind', 'ResponsePartKind', 'ToolCallStatus',
  'ToolCallConfirmationReason', 'ToolCallCancellationReason', 'ConfirmationOptionKind',
  'ToolCallContributorKind',
  'ToolResultContentType', 'CustomizationType', 'CustomizationLoadStatus', 'TerminalClaimKind',
  'McpServerStatus', 'McpAuthRequiredReason',
  'ChangesetStatus', 'ChangesetOperationStatus', 'ChangesetOperationScope', 'ResourceChangeType',
];

const STATE_STRUCTS = [
  'Icon', 'ProtectedResourceMetadata', 'RootState', 'RootConfigState', 'AgentInfo',
  'AgentCapabilities',
  'SessionModelInfo', 'ModelSelection', 'AgentSelection', 'ConfigPropertySchema', 'ConfigSchema',
  'PendingMessage', 'ChatState', 'ChatSummary', 'SessionState', 'SessionActiveClient',
  'SessionChatInputRequest', 'SessionToolConfirmationRequest', 'SessionToolClientExecutionRequest',
  'SessionSummary', 'ChangesSummary', 'ProjectInfo', 'SessionConfigState', 'Turn', 'ActiveTurn', 'Message',
  'MessageOrigin',
  'ChatInputOption',
  'ChatInputTextAnswerValue', 'ChatInputNumberAnswerValue',
  'ChatInputBooleanAnswerValue', 'ChatInputSelectedAnswerValue',
  'ChatInputSelectedManyAnswerValue', 'ChatInputAnswered',
  'ChatInputSkipped',
  'ChatInputTextQuestion',
  'ChatInputNumberQuestion', 'ChatInputBooleanQuestion',
  'ChatInputSingleSelectQuestion', 'ChatInputMultiSelectQuestion',
  'ChatInputRequest',
  'TextPosition', 'TextRange', 'TextSelection',
  'SimpleMessageAttachment', 'MessageEmbeddedResourceAttachment', 'MessageResourceAttachment',
  'MessageAnnotationsAttachment',
  'MarkdownResponsePart', 'ContentRef',
  'ResourceReponsePart', 'ToolCallResponsePart', 'ReasoningResponsePart',
  'SystemNotificationResponsePart',
  'ToolCallResult', 'ToolCallStreamingState',
  'ToolCallPendingConfirmationState', 'ToolCallRunningState',
  'ToolCallPendingResultConfirmationState', 'ToolCallCompletedState',
  'ToolCallCancelledState', 'ConfirmationOption', 'ToolDefinition', 'ToolAnnotations',
  'ToolResultTextContent', 'ToolResultEmbeddedResourceContent',
  'ToolResultResourceContent', 'ToolResultFileEditContent',
  'ToolResultTerminalContent', 'ToolResultSubagentContent',
  'CustomizationLoadingState', 'CustomizationLoadedState',
  'CustomizationDegradedState', 'CustomizationErrorState',
  'PluginCustomization', 'ClientPluginCustomization', 'DirectoryCustomization',
  'AgentCustomization', 'SkillCustomization', 'PromptCustomization',
  'RuleCustomization', 'HookCustomization',
  'McpServerCustomization', 'McpServerCustomizationApps', 'AhpMcpUiHostCapabilities',
  'McpServerStartingState', 'McpServerReadyState', 'McpServerAuthRequiredState',
  'McpServerErrorState', 'McpServerStoppedState',
  'ToolCallClientContributor', 'ToolCallMcpContributor',
  'FileEdit', 'TerminalInfo',
  'TerminalClientClaim', 'TerminalSessionClaim', 'TerminalState',
  'TerminalUnclassifiedPart', 'TerminalCommandPart',
  'UsageInfo', 'ErrorInfo', 'Snapshot',
  'Changeset', 'ChangesetState', 'ChangesetFile', 'ChangesetOperation',
  'AnnotationsSummary', 'AnnotationsState', 'Annotation', 'AnnotationEntry',
  'TelemetryCapabilities',
  'ResourceWatchState', 'ResourceChange',
];

const RESPONSE_PART_UNION: UnionConfig = {
  name: 'ResponsePart',
  discriminantField: 'kind',
  // Open union: an unrecognized `kind` (e.g. a future protocol part type) is
  // preserved as a raw AnyCodable passthrough and re-encoded verbatim so that
  // snapshot decode and round-trip both succeed and delta reducers that target
  // other parts (by id) still work correctly. Mirrors .NET allowUnknown.
  allowUnknown: true,
  variants: [
    { caseName: 'markdown', structName: 'MarkdownResponsePart', discriminantValue: 'markdown' },
    { caseName: 'contentRef', structName: 'ResourceReponsePart', discriminantValue: 'contentRef' },
    { caseName: 'toolCall', structName: 'ToolCallResponsePart', discriminantValue: 'toolCall' },
    { caseName: 'reasoning', structName: 'ReasoningResponsePart', discriminantValue: 'reasoning' },
    { caseName: 'systemNotification', structName: 'SystemNotificationResponsePart', discriminantValue: 'systemNotification' },
  ],
};

const TOOL_CALL_STATE_UNION: UnionConfig = {
  name: 'ToolCallState',
  discriminantField: 'status',
  // Open union: a future protocol version may add new tool call statuses.
  // Preserve unknown discriminants verbatim for round-trip fidelity.
  allowUnknown: true,
  variants: [
    { caseName: 'streaming', structName: 'ToolCallStreamingState', discriminantValue: 'streaming' },
    { caseName: 'pendingConfirmation', structName: 'ToolCallPendingConfirmationState', discriminantValue: 'pending-confirmation' },
    { caseName: 'running', structName: 'ToolCallRunningState', discriminantValue: 'running' },
    { caseName: 'pendingResultConfirmation', structName: 'ToolCallPendingResultConfirmationState', discriminantValue: 'pending-result-confirmation' },
    { caseName: 'completed', structName: 'ToolCallCompletedState', discriminantValue: 'completed' },
    { caseName: 'cancelled', structName: 'ToolCallCancelledState', discriminantValue: 'cancelled' },
  ],
};

const TOOL_CALL_CONFIRMATION_STATE_UNION: UnionConfig = {
  name: 'ToolCallConfirmationState',
  discriminantField: 'status',
  // Open union: mirrors TOOL_CALL_STATE_UNION's forward-compat policy.
  allowUnknown: true,
  variants: [
    { caseName: 'pendingConfirmation', structName: 'ToolCallPendingConfirmationState', discriminantValue: 'pending-confirmation' },
    { caseName: 'pendingResultConfirmation', structName: 'ToolCallPendingResultConfirmationState', discriminantValue: 'pending-result-confirmation' },
  ],
};

const TERMINAL_CLAIM_UNION: UnionConfig = {
  name: 'TerminalClaim',
  discriminantField: 'kind',
  // Open union: future protocol versions may add new terminal claim kinds.
  allowUnknown: true,
  variants: [
    { caseName: 'client', structName: 'TerminalClientClaim', discriminantValue: 'client' },
    { caseName: 'session', structName: 'TerminalSessionClaim', discriminantValue: 'session' },
  ],
};

const TERMINAL_CONTENT_PART_UNION: UnionConfig = {
  name: 'TerminalContentPart',
  discriminantField: 'type',
  // Open union: future protocol versions may add new terminal content types.
  allowUnknown: true,
  variants: [
    { caseName: 'unclassified', structName: 'TerminalUnclassifiedPart', discriminantValue: 'unclassified' },
    { caseName: 'command', structName: 'TerminalCommandPart', discriminantValue: 'command' },
  ],
};

const SESSION_INPUT_QUESTION_UNION: UnionConfig = {
  name: 'ChatInputQuestion',
  discriminantField: 'kind',
  // Open union: future protocol versions may add new question kinds.
  allowUnknown: true,
  variants: [
    { caseName: 'text', structName: 'ChatInputTextQuestion', discriminantValue: 'text' },
    { caseName: 'number', structName: 'ChatInputNumberQuestion', discriminantValue: 'number' },
    { caseName: 'integer', structName: 'ChatInputNumberQuestion', discriminantValue: 'integer' },
    { caseName: 'boolean', structName: 'ChatInputBooleanQuestion', discriminantValue: 'boolean' },
    { caseName: 'singleSelect', structName: 'ChatInputSingleSelectQuestion', discriminantValue: 'single-select' },
    { caseName: 'multiSelect', structName: 'ChatInputMultiSelectQuestion', discriminantValue: 'multi-select' },
  ],
};

const SESSION_INPUT_ANSWER_VALUE_UNION: UnionConfig = {
  name: 'ChatInputAnswerValue',
  discriminantField: 'kind',
  // Open union: future protocol versions may add new answer value kinds.
  allowUnknown: true,
  variants: [
    { caseName: 'text', structName: 'ChatInputTextAnswerValue', discriminantValue: 'text' },
    { caseName: 'number', structName: 'ChatInputNumberAnswerValue', discriminantValue: 'number' },
    { caseName: 'boolean', structName: 'ChatInputBooleanAnswerValue', discriminantValue: 'boolean' },
    { caseName: 'selected', structName: 'ChatInputSelectedAnswerValue', discriminantValue: 'selected' },
    { caseName: 'selectedMany', structName: 'ChatInputSelectedManyAnswerValue', discriminantValue: 'selected-many' },
  ],
};

const SESSION_INPUT_ANSWER_UNION: UnionConfig = {
  name: 'ChatInputAnswer',
  discriminantField: 'state',
  // Open union: future protocol versions may add new answer states.
  allowUnknown: true,
  variants: [
    { caseName: 'draft', structName: 'ChatInputAnswered', discriminantValue: 'draft' },
    { caseName: 'submitted', structName: 'ChatInputAnswered', discriminantValue: 'submitted' },
    { caseName: 'skipped', structName: 'ChatInputSkipped', discriminantValue: 'skipped' },
  ],
};

const MESSAGE_ATTACHMENT_UNION: UnionConfig = {
  name: 'MessageAttachment',
  discriminantField: 'type',
  // Open union: future protocol versions may add new attachment types.
  allowUnknown: true,
  variants: [
    { caseName: 'simple', structName: 'SimpleMessageAttachment', discriminantValue: 'simple' },
    { caseName: 'embeddedResource', structName: 'MessageEmbeddedResourceAttachment', discriminantValue: 'embeddedResource' },
    { caseName: 'resource', structName: 'MessageResourceAttachment', discriminantValue: 'resource' },
    { caseName: 'annotations', structName: 'MessageAnnotationsAttachment', discriminantValue: 'annotations' },
  ],
};

const CUSTOMIZATION_UNION: UnionConfig = {
  name: 'Customization',
  discriminantField: 'type',
  // Open union: mirrors .NET CustomizationConverter(allowUnknown: true)
  // (State.generated.cs). An unrecognized `type` is preserved as a raw
  // AnyCodable passthrough and re-encoded verbatim, not thrown.
  allowUnknown: true,
  variants: [
    { caseName: 'plugin', structName: 'PluginCustomization', discriminantValue: 'plugin' },
    { caseName: 'directory', structName: 'DirectoryCustomization', discriminantValue: 'directory' },
    { caseName: 'mcpServer', structName: 'McpServerCustomization', discriminantValue: 'mcpServer' },
  ],
};

const CHILD_CUSTOMIZATION_UNION: UnionConfig = {
  name: 'ChildCustomization',
  discriminantField: 'type',
  // Open union: mirrors CUSTOMIZATION_UNION's allowUnknown policy. Future
  // protocol versions may add new child customization types (e.g. new plugin
  // child kinds). An unrecognized type is preserved verbatim.
  allowUnknown: true,
  variants: [
    { caseName: 'agent', structName: 'AgentCustomization', discriminantValue: 'agent' },
    { caseName: 'skill', structName: 'SkillCustomization', discriminantValue: 'skill' },
    { caseName: 'prompt', structName: 'PromptCustomization', discriminantValue: 'prompt' },
    { caseName: 'rule', structName: 'RuleCustomization', discriminantValue: 'rule' },
    { caseName: 'hook', structName: 'HookCustomization', discriminantValue: 'hook' },
    { caseName: 'mcpServer', structName: 'McpServerCustomization', discriminantValue: 'mcpServer' },
  ],
};

const CUSTOMIZATION_LOAD_STATE_UNION: UnionConfig = {
  name: 'CustomizationLoadState',
  discriminantField: 'kind',
  // Open union: future protocol versions may add new load state kinds.
  allowUnknown: true,
  variants: [
    { caseName: 'loading', structName: 'CustomizationLoadingState', discriminantValue: 'loading' },
    { caseName: 'loaded', structName: 'CustomizationLoadedState', discriminantValue: 'loaded' },
    { caseName: 'degraded', structName: 'CustomizationDegradedState', discriminantValue: 'degraded' },
    { caseName: 'error', structName: 'CustomizationErrorState', discriminantValue: 'error' },
  ],
};

const MCP_SERVER_STATUS_UNION: UnionConfig = {
  name: 'McpServerState',
  discriminantField: 'kind',
  variants: [
    { caseName: 'starting', structName: 'McpServerStartingState', discriminantValue: 'starting' },
    { caseName: 'ready', structName: 'McpServerReadyState', discriminantValue: 'ready' },
    { caseName: 'authRequired', structName: 'McpServerAuthRequiredState', discriminantValue: 'authRequired' },
    { caseName: 'error', structName: 'McpServerErrorState', discriminantValue: 'error' },
    { caseName: 'stopped', structName: 'McpServerStoppedState', discriminantValue: 'stopped' },
  ],
};

const TOOL_CALL_CONTRIBUTOR_UNION: UnionConfig = {
  name: 'ToolCallContributor',
  discriminantField: 'kind',
  variants: [
    { caseName: 'client', structName: 'ToolCallClientContributor', discriminantValue: 'client' },
    { caseName: 'mcp', structName: 'ToolCallMcpContributor', discriminantValue: 'mcp' },
  ],
};

const SESSION_INPUT_REQUEST_UNION: UnionConfig = {
  name: 'SessionInputRequest',
  discriminantField: 'kind',
  // Open union: future protocol versions may add new session input request kinds.
  allowUnknown: true,
  variants: [
    { caseName: 'chatInput', structName: 'SessionChatInputRequest', discriminantValue: 'chatInput' },
    { caseName: 'toolConfirmation', structName: 'SessionToolConfirmationRequest', discriminantValue: 'toolConfirmation' },
    { caseName: 'toolClientExecution', structName: 'SessionToolClientExecutionRequest', discriminantValue: 'toolClientExecution' },
  ],
};

function generateToolResultContentUnion(): string {
  return `public enum ToolResultContent: Codable, Sendable {
    case text(ToolResultTextContent)
    case embeddedResource(ToolResultEmbeddedResourceContent)
    case resource(ToolResultResourceContent)
    case fileEdit(ToolResultFileEditContent)
    case terminal(ToolResultTerminalContent)
    case subagent(ToolResultSubagentContent)
    /// Unknown or future tool result content type; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum Keys: String, CodingKey {
        case type
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: Keys.self)
        if let type = try container.decodeIfPresent(String.self, forKey: .type) {
            switch type {
            case "text":
                self = .text(try ToolResultTextContent(from: decoder))
            case "embeddedResource":
                self = .embeddedResource(try ToolResultEmbeddedResourceContent(from: decoder))
            case "resource":
                self = .resource(try ToolResultResourceContent(from: decoder))
            case "fileEdit":
                self = .fileEdit(try ToolResultFileEditContent(from: decoder))
            case "terminal":
                self = .terminal(try ToolResultTerminalContent(from: decoder))
            case "subagent":
                self = .subagent(try ToolResultSubagentContent(from: decoder))
            default:
                self = .unknown(try AnyCodable(from: decoder))
            }
        } else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: decoder.codingPath,
                    debugDescription: "ToolResultContent missing type")
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .text(let v): try v.encode(to: encoder)
        case .embeddedResource(let v): try v.encode(to: encoder)
        case .resource(let v): try v.encode(to: encoder)
        case .fileEdit(let v): try v.encode(to: encoder)
        case .terminal(let v): try v.encode(to: encoder)
        case .subagent(let v): try v.encode(to: encoder)
        case .unknown(let v): try v.encode(to: encoder)
        }
    }
}`;
}

function generateStringOrMarkdown(): string {
  return `/// A value that is either a plain string or a markdown-formatted string.
public enum StringOrMarkdown: Codable, Sendable, Equatable {
    case string(String)
    case markdown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            self = .string(str)
            return
        }
        let obj = try MarkdownWrapper(from: decoder)
        self = .markdown(obj.markdown)
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .string(let value):
            var container = encoder.singleValueContainer()
            try container.encode(value)
        case .markdown(let value):
            try MarkdownWrapper(markdown: value).encode(to: encoder)
        }
    }

    private struct MarkdownWrapper: Codable {
        let markdown: String
    }
}`;
}

function generateSnapshotState(): string {
  return `/// The state payload of a snapshot — root, session, chat, terminal, changeset, resource-watch, or annotations state.
public enum SnapshotState: Codable, Sendable {
    case root(RootState)
    case session(SessionState)
    case chat(ChatState)
    case terminal(TerminalState)
    case changeset(ChangesetState)
    case resourceWatch(ResourceWatchState)
    case annotations(AnnotationsState)

    public init(from decoder: Decoder) throws {
        // Try the most distinctive shapes first. SessionState has required
        // \`lifecycle\` / \`activeClients\` / \`chats\`; ChatState has required
        // \`turns\`; the remaining variants follow, with RootState as the
        // catch-all.
        if let session = try? SessionState(from: decoder) {
            self = .session(session)
        } else if let chat = try? ChatState(from: decoder) {
            self = .chat(chat)
        } else if let terminal = try? TerminalState(from: decoder) {
            self = .terminal(terminal)
        } else if let changeset = try? ChangesetState(from: decoder) {
            self = .changeset(changeset)
        } else if let resourceWatch = try? ResourceWatchState(from: decoder) {
            self = .resourceWatch(resourceWatch)
        } else if let annotations = try? AnnotationsState(from: decoder) {
            self = .annotations(annotations)
        } else {
            self = .root(try RootState(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .root(let state): try state.encode(to: encoder)
        case .session(let state): try state.encode(to: encoder)
        case .chat(let state): try state.encode(to: encoder)
        case .terminal(let state): try state.encode(to: encoder)
        case .changeset(let state): try state.encode(to: encoder)
        case .resourceWatch(let state): try state.encode(to: encoder)
        case .annotations(let state): try state.encode(to: encoder)
        }
    }
}`;
}


function generateChatOriginSwift(): string {
  return `public struct ChatOriginUser: Codable, Sendable {
    public var kind: ChatOriginKind

    public init(kind: ChatOriginKind = .user) {
        self.kind = kind
    }
}

public struct ChatOriginFork: Codable, Sendable {
    public var kind: ChatOriginKind
    public var chat: String
    public var turnId: String

    public init(kind: ChatOriginKind = .fork, chat: String, turnId: String) {
        self.kind = kind
        self.chat = chat
        self.turnId = turnId
    }
}

public struct ChatOriginTool: Codable, Sendable {
    public var kind: ChatOriginKind
    public var chat: String
    public var toolCallId: String

    public init(kind: ChatOriginKind = .tool, chat: String, toolCallId: String) {
        self.kind = kind
        self.chat = chat
        self.toolCallId = toolCallId
    }
}

public enum ChatOrigin: Codable, Sendable {
    case user(ChatOriginUser)
    case fork(ChatOriginFork)
    case tool(ChatOriginTool)

    private enum DiscriminatorCodingKeys: String, CodingKey { case kind }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)
        let discriminant = try container.decode(String.self, forKey: .kind)
        switch discriminant {
        case "user": self = .user(try ChatOriginUser(from: decoder))
        case "fork": self = .fork(try ChatOriginFork(from: decoder))
        case "tool": self = .tool(try ChatOriginTool(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unknown ChatOrigin kind: \\(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .user(let value): try value.encode(to: encoder)
        case .fork(let value): try value.encode(to: encoder)
        case .tool(let value): try value.encode(to: encoder)
        }
    }
}`;
}

function generateStateFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// MARK: - Type Aliases\n');
  lines.push('public typealias URI = String\n');

  lines.push('// MARK: - StringOrMarkdown\n');
  lines.push(generateStringOrMarkdown());
  lines.push('');

  lines.push('// MARK: - Enums\n');
  for (const enumName of STATE_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateSwiftEnum(decl));
      lines.push('');
    }
  }

  lines.push('// MARK: - State Types\n');
  for (const ifaceName of STATE_STRUCTS) {
    try {
      lines.push(generateStructFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// MARK: - Discriminated Unions\n');
  lines.push(generateChatOriginSwift());
  lines.push('');
  lines.push(generateDiscriminatedUnion(RESPONSE_PART_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_CALL_STATE_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_CALL_CONFIRMATION_STATE_UNION));
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
  lines.push(generateDiscriminatedUnion(SESSION_INPUT_REQUEST_UNION));
  lines.push('');
  lines.push(generateToolResultContentUnion());
  lines.push('');
  lines.push(generateSnapshotState());
  lines.push('');

  return lines.join('\n');
}

// ─── Actions File Generator ──────────────────────────────────────────────────

/** Action type discriminant values mapped to struct names */
const ACTION_VARIANTS: { type: string; caseName: string; tsInterface: string }[] = [
  { type: 'root/agentsChanged', caseName: 'rootAgentsChanged', tsInterface: 'RootAgentsChangedAction' },
  { type: 'root/activeSessionsChanged', caseName: 'rootActiveSessionsChanged', tsInterface: 'RootActiveSessionsChangedAction' },
  { type: 'session/ready', caseName: 'sessionReady', tsInterface: 'SessionReadyAction' },
  { type: 'session/creationFailed', caseName: 'sessionCreationFailed', tsInterface: 'SessionCreationFailedAction' },
  { type: 'session/chatAdded', caseName: 'sessionChatAdded', tsInterface: 'SessionChatAddedAction' },
  { type: 'session/chatRemoved', caseName: 'sessionChatRemoved', tsInterface: 'SessionChatRemovedAction' },
  { type: 'session/chatUpdated', caseName: 'sessionChatUpdated', tsInterface: 'SessionChatUpdatedAction' },
  { type: 'session/defaultChatChanged', caseName: 'sessionDefaultChatChanged', tsInterface: 'SessionDefaultChatChangedAction' },
  { type: 'chat/turnStarted', caseName: 'chatTurnStarted', tsInterface: 'ChatTurnStartedAction' },
  { type: 'chat/delta', caseName: 'chatDelta', tsInterface: 'ChatDeltaAction' },
  { type: 'chat/responsePart', caseName: 'chatResponsePart', tsInterface: 'ChatResponsePartAction' },
  { type: 'chat/toolCallStart', caseName: 'chatToolCallStart', tsInterface: 'ChatToolCallStartAction' },
  { type: 'chat/toolCallDelta', caseName: 'chatToolCallDelta', tsInterface: 'ChatToolCallDeltaAction' },
  { type: 'chat/toolCallReady', caseName: 'chatToolCallReady', tsInterface: 'ChatToolCallReadyAction' },
  { type: 'chat/toolCallConfirmed', caseName: 'chatToolCallConfirmed', tsInterface: '_merged_chat_' },
  { type: 'chat/toolCallComplete', caseName: 'chatToolCallComplete', tsInterface: 'ChatToolCallCompleteAction' },
  { type: 'chat/toolCallResultConfirmed', caseName: 'chatToolCallResultConfirmed', tsInterface: 'ChatToolCallResultConfirmedAction' },
  { type: 'chat/toolCallContentChanged', caseName: 'chatToolCallContentChanged', tsInterface: 'ChatToolCallContentChangedAction' },
  { type: 'chat/turnComplete', caseName: 'chatTurnComplete', tsInterface: 'ChatTurnCompleteAction' },
  { type: 'chat/turnCancelled', caseName: 'chatTurnCancelled', tsInterface: 'ChatTurnCancelledAction' },
  { type: 'chat/error', caseName: 'chatError', tsInterface: 'ChatErrorAction' },
  { type: 'chat/activityChanged', caseName: 'chatActivityChanged', tsInterface: 'ChatActivityChangedAction' },
  { type: 'session/titleChanged', caseName: 'sessionTitleChanged', tsInterface: 'SessionTitleChangedAction' },
  { type: 'chat/usage', caseName: 'chatUsage', tsInterface: 'ChatUsageAction' },
  { type: 'chat/reasoning', caseName: 'chatReasoning', tsInterface: 'ChatReasoningAction' },
  { type: 'session/isReadChanged', caseName: 'sessionIsReadChanged', tsInterface: 'SessionIsReadChangedAction' },
  { type: 'session/isArchivedChanged', caseName: 'sessionIsArchivedChanged', tsInterface: 'SessionIsArchivedChangedAction' },
  { type: 'session/activityChanged', caseName: 'sessionActivityChanged', tsInterface: 'SessionActivityChangedAction' },
  { type: 'session/changesetsChanged', caseName: 'sessionChangesetsChanged', tsInterface: 'SessionChangesetsChangedAction' },
  { type: 'session/serverToolsChanged', caseName: 'sessionServerToolsChanged', tsInterface: 'SessionServerToolsChangedAction' },
  { type: 'session/activeClientSet', caseName: 'sessionActiveClientSet', tsInterface: 'SessionActiveClientSetAction' },
  { type: 'session/activeClientRemoved', caseName: 'sessionActiveClientRemoved', tsInterface: 'SessionActiveClientRemovedAction' },
  { type: 'session/inputNeededSet', caseName: 'sessionInputNeededSet', tsInterface: 'SessionInputNeededSetAction' },
  { type: 'session/inputNeededRemoved', caseName: 'sessionInputNeededRemoved', tsInterface: 'SessionInputNeededRemovedAction' },
  { type: 'chat/pendingMessageSet', caseName: 'chatPendingMessageSet', tsInterface: 'ChatPendingMessageSetAction' },
  { type: 'chat/pendingMessageRemoved', caseName: 'chatPendingMessageRemoved', tsInterface: 'ChatPendingMessageRemovedAction' },
  { type: 'chat/queuedMessagesReordered', caseName: 'chatQueuedMessagesReordered', tsInterface: 'ChatQueuedMessagesReorderedAction' },
  { type: 'chat/draftChanged', caseName: 'chatDraftChanged', tsInterface: 'ChatDraftChangedAction' },
  { type: 'chat/inputRequested', caseName: 'chatInputRequested', tsInterface: 'ChatInputRequestedAction' },
  { type: 'chat/inputAnswerChanged', caseName: 'chatInputAnswerChanged', tsInterface: 'ChatInputAnswerChangedAction' },
  { type: 'chat/inputCompleted', caseName: 'chatInputCompleted', tsInterface: 'ChatInputCompletedAction' },
  { type: 'session/customizationsChanged', caseName: 'sessionCustomizationsChanged', tsInterface: 'SessionCustomizationsChangedAction' },
  { type: 'session/customizationToggled', caseName: 'sessionCustomizationToggled', tsInterface: 'SessionCustomizationToggledAction' },
  { type: 'session/customizationUpdated', caseName: 'sessionCustomizationUpdated', tsInterface: 'SessionCustomizationUpdatedAction' },
  { type: 'session/customizationRemoved', caseName: 'sessionCustomizationRemoved', tsInterface: 'SessionCustomizationRemovedAction' },
  { type: 'session/mcpServerStateChanged', caseName: 'sessionMcpServerStateChanged', tsInterface: 'SessionMcpServerStateChangedAction' },
  { type: 'chat/truncated', caseName: 'chatTruncated', tsInterface: 'ChatTruncatedAction' },
  { type: 'session/configChanged', caseName: 'sessionConfigChanged', tsInterface: 'SessionConfigChangedAction' },
  { type: 'session/metaChanged', caseName: 'sessionMetaChanged', tsInterface: 'SessionMetaChangedAction' },
  { type: 'changeset/statusChanged', caseName: 'changesetStatusChanged', tsInterface: 'ChangesetStatusChangedAction' },
  { type: 'changeset/fileSet', caseName: 'changesetFileSet', tsInterface: 'ChangesetFileSetAction' },
  { type: 'changeset/fileRemoved', caseName: 'changesetFileRemoved', tsInterface: 'ChangesetFileRemovedAction' },
  { type: 'changeset/contentChanged', caseName: 'changesetContentChanged', tsInterface: 'ChangesetContentChangedAction' },
  { type: 'changeset/operationsChanged', caseName: 'changesetOperationsChanged', tsInterface: 'ChangesetOperationsChangedAction' },
  { type: 'changeset/operationStatusChanged', caseName: 'changesetOperationStatusChanged', tsInterface: 'ChangesetOperationStatusChangedAction' },
  { type: 'changeset/cleared', caseName: 'changesetCleared', tsInterface: 'ChangesetClearedAction' },
  { type: 'annotations/set', caseName: 'annotationsSet', tsInterface: 'AnnotationsSetAction' },
  { type: 'annotations/updated', caseName: 'annotationsUpdated', tsInterface: 'AnnotationsUpdatedAction' },
  { type: 'annotations/removed', caseName: 'annotationsRemoved', tsInterface: 'AnnotationsRemovedAction' },
  { type: 'annotations/entrySet', caseName: 'annotationsEntrySet', tsInterface: 'AnnotationsEntrySetAction' },
  { type: 'annotations/entryRemoved', caseName: 'annotationsEntryRemoved', tsInterface: 'AnnotationsEntryRemovedAction' },
  { type: 'root/terminalsChanged', caseName: 'rootTerminalsChanged', tsInterface: 'RootTerminalsChangedAction' },
  { type: 'root/configChanged', caseName: 'rootConfigChanged', tsInterface: 'RootConfigChangedAction' },
  { type: 'terminal/data', caseName: 'terminalData', tsInterface: 'TerminalDataAction' },
  { type: 'terminal/input', caseName: 'terminalInput', tsInterface: 'TerminalInputAction' },
  { type: 'terminal/resized', caseName: 'terminalResized', tsInterface: 'TerminalResizedAction' },
  { type: 'terminal/claimed', caseName: 'terminalClaimed', tsInterface: 'TerminalClaimedAction' },
  { type: 'terminal/titleChanged', caseName: 'terminalTitleChanged', tsInterface: 'TerminalTitleChangedAction' },
  { type: 'terminal/cwdChanged', caseName: 'terminalCwdChanged', tsInterface: 'TerminalCwdChangedAction' },
  { type: 'terminal/exited', caseName: 'terminalExited', tsInterface: 'TerminalExitedAction' },
  { type: 'terminal/cleared', caseName: 'terminalCleared', tsInterface: 'TerminalClearedAction' },
  { type: 'terminal/commandDetectionAvailable', caseName: 'terminalCommandDetectionAvailable', tsInterface: 'TerminalCommandDetectionAvailableAction' },
  { type: 'terminal/commandExecuted', caseName: 'terminalCommandExecuted', tsInterface: 'TerminalCommandExecutedAction' },
  { type: 'terminal/commandFinished', caseName: 'terminalCommandFinished', tsInterface: 'TerminalCommandFinishedAction' },
  { type: 'resourceWatch/changed', caseName: 'resourceWatchChanged', tsInterface: 'ResourceWatchChangedAction' },
];

/** Merged struct for the approved/denied tool call confirmed action */
function generateMergedToolCallConfirmedStruct(scope: 'Session' | 'Chat' = 'Session'): string {
  const className = `${scope}ToolCallConfirmedAction`;
  const wireType = scope === 'Chat' ? 'chat/toolCallConfirmed' : 'session/toolCallConfirmed';
  return `/// Client approves or denies a pending tool call (merged approved + denied variants).
public struct ${className}: Codable, Sendable {
    /// Action type discriminant
    public var type: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Whether the tool call was approved
    public var approved: Bool
    /// How the tool was confirmed (present when approved)
    public var confirmed: ToolCallConfirmationReason?
    /// Edited tool input parameters, if the client modified them before confirming
    public var editedToolInput: String?
    /// Why the tool was cancelled (present when denied)
    public var reason: ToolCallCancellationReason?
    /// What the user suggested instead (present when denied)
    public var userSuggestion: Message?
    /// Explanation for the denial
    public var reasonMessage: StringOrMarkdown?
    /// ID of the selected confirmation option, if the server provided options
    public var selectedOptionId: String?
    /// Additional provider-specific metadata
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type, turnId, toolCallId, approved, confirmed, editedToolInput, reason, userSuggestion, reasonMessage, selectedOptionId
        case meta = "_meta"
    }

    public init(
        type: String = "${wireType}",
        turnId: String,
        toolCallId: String,
        approved: Bool,
        confirmed: ToolCallConfirmationReason? = nil,
        editedToolInput: String? = nil,
        reason: ToolCallCancellationReason? = nil,
        userSuggestion: Message? = nil,
        reasonMessage: StringOrMarkdown? = nil,
        selectedOptionId: String? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.approved = approved
        self.confirmed = confirmed
        self.editedToolInput = editedToolInput
        self.reason = reason
        self.userSuggestion = userSuggestion
        self.reasonMessage = reasonMessage
        self.selectedOptionId = selectedOptionId
        self.meta = meta
    }
}`;
}

function generateActionsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  // ActionType enum
  lines.push('// MARK: - ActionType\n');
  const actionTypeEnum = findEnum(project, 'ActionType');
  if (actionTypeEnum) {
    lines.push(generateSwiftEnum(actionTypeEnum));
    lines.push('');
  }

  // ActionEnvelope and ActionOrigin
  lines.push('// MARK: - Action Infrastructure\n');
  lines.push(generateStructFromInterface(project, 'ActionOrigin'));
  lines.push('');
  lines.push(generateStructFromInterface(project, 'ActionEnvelope'));
  lines.push('');

  // Individual action structs
  lines.push('// MARK: - Action Types\n');
  const priorPartialsAction = new Set(requiredPartialStructs);
  for (const variant of ACTION_VARIANTS) {
    if (variant.tsInterface === '_merged_' || variant.tsInterface === '_merged_chat_') {
      lines.push(generateMergedToolCallConfirmedStruct(variant.tsInterface === '_merged_chat_' ? 'Chat' : 'Session'));
      lines.push('');
      continue;
    }
    try {
      lines.push(generateStructFromInterface(project, variant.tsInterface));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${variant.tsInterface}: ${e}`);
      lines.push('');
    }
  }

  // Emit any Partial<T> types referenced only by action payloads (e.g.
  // Partial<ChatSummary> on SessionChatUpdatedAction). Mirrors the
  // notification-side emission.
  const actionNewPartials = [...requiredPartialStructs].filter(n => !priorPartialsAction.has(n));
  if (actionNewPartials.length > 0) {
    lines.push('// MARK: - Partial Summary Types\n');
    for (const tsName of actionNewPartials) {
      try {
        lines.push(generatePartialStructFromInterface(project, tsName));
        lines.push('');
      } catch (e) {
        lines.push(`// TODO: Could not generate Partial<${tsName}>: ${e}`);
        lines.push('');
      }
    }
  }

  // StateAction discriminated union
  lines.push('// MARK: - StateAction Union\n');
  lines.push('/// Discriminated union of all state actions.');
  lines.push('public enum StateAction: Codable, Sendable {');
  for (const v of ACTION_VARIANTS) {
    lines.push(`    case ${v.caseName}(${v.tsInterface === '_merged_' ? 'SessionToolCallConfirmedAction' : v.tsInterface === '_merged_chat_' ? 'ChatToolCallConfirmedAction' : v.tsInterface})`);
  }
  lines.push('    /// Unknown or future action type; reducers treat this as a no-op.');
  lines.push('    /// The raw payload (including its `type` discriminant) is preserved');
  lines.push('    /// as an `AnyCodable` so a decode→encode round-trip re-emits it');
  lines.push('    /// verbatim for forward-compatibility (mirrors .NET allowUnknown).');
  lines.push('    case unknown(AnyCodable)');
  lines.push('');
  lines.push('    private enum TypeKey: String, CodingKey { case type }');
  lines.push('');
  lines.push('    public init(from decoder: Decoder) throws {');
  lines.push('        let container = try decoder.container(keyedBy: TypeKey.self)');
  lines.push('        let type = try container.decode(String.self, forKey: .type)');
  lines.push('        switch type {');
  for (const v of ACTION_VARIANTS) {
    const structName = v.tsInterface === '_merged_'
      ? 'SessionToolCallConfirmedAction'
      : v.tsInterface === '_merged_chat_'
        ? 'ChatToolCallConfirmedAction'
        : v.tsInterface;
    lines.push(`        case ${JSON.stringify(v.type)}:`);
    lines.push(`            self = .${v.caseName}(try ${structName}(from: decoder))`);
  }
  lines.push('        default:');
  lines.push('            self = .unknown(try AnyCodable(from: decoder))');
  lines.push('        }');
  lines.push('    }');
  lines.push('');
  lines.push('    public func encode(to encoder: Encoder) throws {');
  lines.push('        switch self {');
  for (const v of ACTION_VARIANTS) {
    lines.push(`        case .${v.caseName}(let v): try v.encode(to: encoder)`);
  }
  lines.push('        case .unknown(let value): try value.encode(to: encoder)');
  lines.push('        }');
  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ─── Commands File Generator ─────────────────────────────────────────────────

const COMMAND_ENUMS = ['ReconnectResultType', 'ContentEncoding', 'CompletionItemKind', 'ResourceType', 'ResourceWriteMode'];

const COMMAND_STRUCTS = [
  'InitializeParams', 'InitializeResult', 'ClientCapabilities',
  'ReconnectParams', 'ReconnectReplayResult', 'ReconnectSnapshotResult',
  'SubscribeParams', 'SubscribeResult',
  'SessionForkSource', 'CreateSessionParams', 'DisposeSessionParams',
  'ChatForkSource', 'CreateChatParams', 'DisposeChatParams',
  'ListSessionsParams', 'ListSessionsResult',
  'ResourceReadParams', 'ResourceReadResult',
  'ResourceWriteParams', 'ResourceWriteResult',
  'ResourceListParams', 'ResourceListResult', 'DirectoryEntry',
  'ResourceCopyParams', 'ResourceCopyResult',
  'ResourceDeleteParams', 'ResourceDeleteResult',
  'ResourceMoveParams', 'ResourceMoveResult',
  'ResourceResolveParams', 'ResourceResolveResult',
  'ResourceMkdirParams', 'ResourceMkdirResult',
  'ResourceRequestParams', 'ResourceRequestResult',
  'CreateResourceWatchParams', 'CreateResourceWatchResult',
  'FetchTurnsParams', 'FetchTurnsResult',
  'UnsubscribeParams', 'DispatchActionParams',
  'AuthenticateParams', 'AuthenticateResult',
  'CreateTerminalParams', 'DisposeTerminalParams',
  'ResolveSessionConfigParams', 'ResolveSessionConfigResult',
  'SessionConfigPropertySchema', 'SessionConfigSchema',
  'SessionConfigCompletionsParams', 'SessionConfigCompletionsResult',
  'SessionConfigValueItem',
  'CompletionsParams', 'CompletionItem', 'CompletionsResult',
  'InvokeChangesetOperationParams', 'InvokeChangesetOperationResult',
  'ChangesetOperationFollowUp',
];

const RECONNECT_RESULT_UNION: UnionConfig = {
  name: 'ReconnectResult',
  discriminantField: 'type',
  variants: [
    { caseName: 'replay', structName: 'ReconnectReplayResult', discriminantValue: 'replay' },
    { caseName: 'snapshot', structName: 'ReconnectSnapshotResult', discriminantValue: 'snapshot' },
  ],
};

function generateCommandsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// MARK: - Command Enums\n');
  for (const enumName of COMMAND_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateSwiftEnum(decl));
      lines.push('');
    }
  }

  lines.push('// MARK: - Command Types\n');
  // Track which interfaces we've already generated to handle duplicates
  const generated = new Set<string>();
  for (const ifaceName of COMMAND_STRUCTS) {
    if (generated.has(ifaceName)) continue;
    generated.add(ifaceName);
    try {
      lines.push(generateStructFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// MARK: - ReconnectResult Union\n');
  lines.push(generateDiscriminatedUnion(RECONNECT_RESULT_UNION));
  lines.push('');

  lines.push('// MARK: - Changeset Operation Unions\n');
  lines.push(generateChangesetOperationTargetSwift());
  lines.push('');

  return lines.join('\n');
}

function generateChangesetOperationTargetSwift(): string {
  return `/// Identifies the file or range a \`ChangesetOperation\` should act on.
public enum ChangesetOperationTarget: Codable, Sendable {
    case resource(ChangesetOperationResourceTarget)
    case range(ChangesetOperationRangeTarget)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "resource":
            self = .resource(try ChangesetOperationResourceTarget(from: decoder))
        case "range":
            self = .range(try ChangesetOperationRangeTarget(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ChangesetOperationTarget discriminant: \\(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .resource(let value): try value.encode(to: encoder)
        case .range(let value): try value.encode(to: encoder)
        }
    }
}

public struct ChangesetOperationResourceTarget: Codable, Sendable {
    public var kind: String { "resource" }
    public var resource: String
    public var side: String?

    public init(resource: String, side: String? = nil) {
        self.resource = resource
        self.side = side
    }

    // kind is the union discriminant: a fixed constant for this variant (so it
    // is NOT decoded from the wire — the union already dispatched on it), but it
    // MUST be re-emitted on encode so the wire stays a decodable
    // discriminated-union value. Hence the custom encode and the decode-only
    // CodingKeys that omit kind.
    private enum CodingKeys: String, CodingKey { case resource, side }
    private enum EncodingKeys: String, CodingKey { case kind, resource, side }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(resource, forKey: .resource)
        try container.encodeIfPresent(side, forKey: .side)
    }
}

public struct ChangesetOperationRangeTarget: Codable, Sendable {
    public var kind: String { "range" }
    public var resource: String
    public var side: String?
    public var range: TextRange

    public init(resource: String, side: String? = nil, range: TextRange) {
        self.resource = resource
        self.side = side
        self.range = range
    }

    // See ChangesetOperationResourceTarget: kind is re-emitted on encode but
    // not decoded (the union dispatches on it).
    private enum CodingKeys: String, CodingKey { case resource, side, range }
    private enum EncodingKeys: String, CodingKey { case kind, resource, side, range }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(resource, forKey: .resource)
        try container.encodeIfPresent(side, forKey: .side)
        try container.encode(range, forKey: .range)
    }
}`;
}

// ─── Notifications File Generator ────────────────────────────────────────────

const NOTIFICATION_ENUMS = ['AuthRequiredReason'];

const NOTIFICATION_STRUCTS = [
  'SessionAddedParams', 'SessionRemovedParams', 'SessionSummaryChangedParams', 'ProgressParams', 'AuthRequiredParams',
  'OtlpExportLogsParams', 'OtlpExportTracesParams', 'OtlpExportMetricsParams',
];

function generateNotificationsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// MARK: - Notification Enums\n');
  for (const enumName of NOTIFICATION_ENUMS) {
    const decl = findEnum(project, enumName);
    if (decl) {
      lines.push(generateSwiftEnum(decl));
      lines.push('');
    }
  }

  // Snapshot partials requested before notifications (typically empty) so we
  // can emit exactly the partials introduced by notification structs in this
  // file, keeping them co-located with their sole consumer.
  const priorPartials = new Set(requiredPartialStructs);

  lines.push('// MARK: - Notification Types\n');
  for (const ifaceName of NOTIFICATION_STRUCTS) {
    try {
      lines.push(generateStructFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  const newPartials = [...requiredPartialStructs].filter(n => !priorPartials.has(n));
  if (newPartials.length > 0) {
    lines.push('// MARK: - Partial Summary Types\n');
    for (const tsName of newPartials) {
      try {
        lines.push(generatePartialStructFromInterface(project, tsName));
        lines.push('');
      } catch (e) {
        lines.push(`// TODO: Could not generate Partial<${tsName}>: ${e}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// ─── Errors File Generator ───────────────────────────────────────────────────

function generateErrorsFile(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// MARK: - Standard JSON-RPC Error Codes\n');
  lines.push('public enum JsonRpcErrorCodes {');
  lines.push('    /// Invalid JSON');
  lines.push('    public static let parseError = -32700');
  lines.push('    /// Not a valid JSON-RPC request');
  lines.push('    public static let invalidRequest = -32600');
  lines.push('    /// Unknown method name');
  lines.push('    public static let methodNotFound = -32601');
  lines.push('    /// Invalid method parameters');
  lines.push('    public static let invalidParams = -32602');
  lines.push('    /// Unspecified server error');
  lines.push('    public static let internalError = -32603');
  lines.push('}');
  lines.push('');

  lines.push('// MARK: - AHP Application Error Codes\n');
  lines.push('public enum AhpErrorCodes {');
  lines.push('    /// The referenced session URI does not exist');
  lines.push('    public static let sessionNotFound = -32001');
  lines.push('    /// The requested agent provider is not registered');
  lines.push('    public static let providerNotFound = -32002');
  lines.push('    /// A session with the given URI already exists');
  lines.push('    public static let sessionAlreadyExists = -32003');
  lines.push('    /// The operation requires no active turn, but one is in progress');
  lines.push('    public static let turnInProgress = -32004');
  lines.push('    /// The server cannot speak any of the protocol versions offered by the client in `InitializeParams.protocolVersions`');
  lines.push('    public static let unsupportedProtocolVersion = -32005');
  lines.push('    /// The requested content URI does not exist');
  lines.push('    public static let contentNotFound = -32006');
  lines.push('    /// Authentication required for a protected resource');
  lines.push('    public static let authRequired = -32007');
  lines.push('    /// The requested file, folder, or URI does not exist');
  lines.push('    public static let notFound = -32008');
  lines.push('    /// The client is not permitted to access the requested resource');
  lines.push('    public static let permissionDenied = -32009');
  lines.push('    /// The target resource already exists and the operation does not allow overwriting');
  lines.push('    public static let alreadyExists = -32010');
  lines.push('}');
  lines.push('');

  lines.push('// MARK: - Error Detail Payloads\n');
  for (const ifaceName of ['AuthRequiredErrorData', 'PermissionDeniedErrorData', 'UnsupportedProtocolVersionErrorData']) {
    try {
      lines.push(generateStructFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Messages File Generator ─────────────────────────────────────────────────

function generateMessagesFile(): string {
  return `${GENERATED_HEADER}
// MARK: - JSON-RPC Base Types

/// A JSON-RPC 2.0 request.
public struct JsonRpcRequest<Params: Codable>: Codable, Sendable where Params: Sendable {
    public let jsonrpc: String
    public let id: Int
    public let method: String
    public let params: Params

    public init(id: Int, method: String, params: Params) {
        self.jsonrpc = "2.0"
        self.id = id
        self.method = method
        self.params = params
    }
}

/// A JSON-RPC 2.0 error object.
public struct JsonRpcError: Codable, Sendable {
    public let code: Int
    public let message: String
    public let data: AnyCodable?

    public init(code: Int, message: String, data: AnyCodable? = nil) {
        self.code = code
        self.message = message
        self.data = data
    }
}

/// A JSON-RPC 2.0 success response.
public struct JsonRpcSuccessResponse<Result: Codable>: Codable, Sendable where Result: Sendable {
    public let jsonrpc: String
    public let id: Int
    public let result: Result
}

/// A JSON-RPC 2.0 error response.
public struct JsonRpcErrorResponse: Codable, Sendable {
    public let jsonrpc: String
    public let id: Int
    public let error: JsonRpcError
}

/// A JSON-RPC 2.0 notification (no id).
public struct JsonRpcNotification<Params: Codable>: Codable, Sendable where Params: Sendable {
    public let jsonrpc: String
    public let method: String
    public let params: Params

    public init(method: String, params: Params) {
        self.jsonrpc = "2.0"
        self.method = method
        self.params = params
    }
}

// MARK: - Server → Client Notification Params

/// Params for the server → client \`action\` notification.
public typealias ActionNotificationParams = ActionEnvelope

// MARK: - AHP Command Helpers

/// Typed helper for constructing AHP JSON-RPC requests.
public enum AHPCommands {
    public static func initialize(id: Int, params: InitializeParams) -> JsonRpcRequest<InitializeParams> {
        JsonRpcRequest(id: id, method: "initialize", params: params)
    }

    public static func reconnect(id: Int, params: ReconnectParams) -> JsonRpcRequest<ReconnectParams> {
        JsonRpcRequest(id: id, method: "reconnect", params: params)
    }

    public static func subscribe(id: Int, params: SubscribeParams) -> JsonRpcRequest<SubscribeParams> {
        JsonRpcRequest(id: id, method: "subscribe", params: params)
    }

    public static func createSession(id: Int, params: CreateSessionParams) -> JsonRpcRequest<CreateSessionParams> {
        JsonRpcRequest(id: id, method: "createSession", params: params)
    }

    public static func disposeSession(id: Int, params: DisposeSessionParams) -> JsonRpcRequest<DisposeSessionParams> {
        JsonRpcRequest(id: id, method: "disposeSession", params: params)
    }

    public static func listSessions(id: Int, params: ListSessionsParams) -> JsonRpcRequest<ListSessionsParams> {
        JsonRpcRequest(id: id, method: "listSessions", params: params)
    }

    public static func resourceRead(id: Int, params: ResourceReadParams) -> JsonRpcRequest<ResourceReadParams> {
        JsonRpcRequest(id: id, method: "resourceRead", params: params)
    }

    public static func resourceWrite(id: Int, params: ResourceWriteParams) -> JsonRpcRequest<ResourceWriteParams> {
        JsonRpcRequest(id: id, method: "resourceWrite", params: params)
    }

    public static func resourceList(id: Int, params: ResourceListParams) -> JsonRpcRequest<ResourceListParams> {
        JsonRpcRequest(id: id, method: "resourceList", params: params)
    }

    public static func resourceCopy(id: Int, params: ResourceCopyParams) -> JsonRpcRequest<ResourceCopyParams> {
        JsonRpcRequest(id: id, method: "resourceCopy", params: params)
    }

    public static func resourceDelete(id: Int, params: ResourceDeleteParams) -> JsonRpcRequest<ResourceDeleteParams> {
        JsonRpcRequest(id: id, method: "resourceDelete", params: params)
    }

    public static func resourceMove(id: Int, params: ResourceMoveParams) -> JsonRpcRequest<ResourceMoveParams> {
        JsonRpcRequest(id: id, method: "resourceMove", params: params)
    }

    public static func resourceRequest(id: Int, params: ResourceRequestParams) -> JsonRpcRequest<ResourceRequestParams> {
        JsonRpcRequest(id: id, method: "resourceRequest", params: params)
    }

    public static func fetchTurns(id: Int, params: FetchTurnsParams) -> JsonRpcRequest<FetchTurnsParams> {
        JsonRpcRequest(id: id, method: "fetchTurns", params: params)
    }

    public static func authenticate(id: Int, params: AuthenticateParams) -> JsonRpcRequest<AuthenticateParams> {
        JsonRpcRequest(id: id, method: "authenticate", params: params)
    }
}

/// Typed helper for constructing client → server notifications.
public enum AHPClientNotifications {
    public static func unsubscribe(params: UnsubscribeParams) -> JsonRpcNotification<UnsubscribeParams> {
        JsonRpcNotification(method: "unsubscribe", params: params)
    }

    public static func dispatchAction(params: DispatchActionParams) -> JsonRpcNotification<DispatchActionParams> {
        JsonRpcNotification(method: "dispatchAction", params: params)
    }
}
`;
}

// ─── AnyCodable Utility ──────────────────────────────────────────────────────

function anyCodableContent(): string {
  return `// AnyCodable — type-erased Codable wrapper for unknown/Record<string, unknown> values.

import Foundation

/// A type-erased \`Codable\` value for handling \`unknown\` and \`Record<string, unknown>\` types.
///
/// Marked \`@unchecked Sendable\`: \`value\` is a \`let\`, so it cannot be mutated
/// after initialization, and the decoding path only ever stores immutable,
/// \`Sendable\`-safe types (Bool, Int, Double, String, NSNull, and recursive
/// \`[Any]\`/\`[String: Any]\` of those). The public \`init(_:)\` accepts arbitrary
/// \`Any\`, so Sendability is unchecked and relies on callers passing
/// \`Sendable\`-safe values.
public struct AnyCodable: Codable, @unchecked Sendable, Equatable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self.value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            self.value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "AnyCodable cannot decode value"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        // Native Swift types are matched first with an exact metatype guard so
        // these arms stay reachable even though Swift also bridges them to NSNumber.
        case let bool as Bool where type(of: value) == Bool.self:
            try container.encode(bool)
        case let int as Int where type(of: value) == Int.self:
            try container.encode(int)
        case let double as Double where type(of: value) == Double.self:
            try container.encode(double)
        case let n as NSNumber:
            // Reached only for NSNumber objects not already matched above (e.g.
            // values produced by JSONSerialization.jsonObject). Use CFTypeID to
            // distinguish booleans, then objCType for float/integral and signed/unsigned.
            if CFGetTypeID(n) == CFBooleanGetTypeID() {
                try container.encode(n.boolValue)
            } else {
                // objCType distinguishes float/double from integral, and signed
                // from unsigned. A JSON integer above Int64.max is boxed as an
                // unsigned NSNumber; int64Value would corrupt it (it does not
                // round-trip), so those encode via uint64Value.
                let objCType = String(cString: n.objCType)
                switch objCType {
                case "f", "d":
                    try container.encode(n.doubleValue)
                case "C", "I", "S", "L", "Q":
                    try container.encode(n.uint64Value)
                default:
                    try container.encode(n.int64Value)
                }
            }
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(codingPath: encoder.codingPath,
                    debugDescription: "AnyCodable cannot encode value of type \\(type(of: value))")
            )
        }
    }

    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        switch (lhs.value, rhs.value) {
        case is (NSNull, NSNull):
            return true
        case let (lhs as Bool, rhs as Bool):
            return lhs == rhs
        case let (lhs as Int, rhs as Int):
            return lhs == rhs
        case let (lhs as Double, rhs as Double):
            return lhs == rhs
        case let (lhs as String, rhs as String):
            return lhs == rhs
        case let (lhs as [Any], rhs as [Any]):
            guard lhs.count == rhs.count else { return false }
            return zip(lhs, rhs).allSatisfy { AnyCodable($0) == AnyCodable($1) }
        case let (lhs as [String: Any], rhs as [String: Any]):
            guard lhs.count == rhs.count else { return false }
            return lhs.allSatisfy { key, val in
                guard let other = rhs[key] else { return false }
                return AnyCodable(val) == AnyCodable(other)
            }
        default:
            return false
        }
    }
}
`;
}

// ─── Exhaustiveness Check ─────────────────────────────────────────────────────

/**
 * Verifies that every type exported from the protocol source modules
 * (state, actions, commands, notifications, errors) is covered by one of
 * the generator lists or a known special-cased code path.
 *
 * This catches the class of bug where a new type is added to the TypeScript
 * protocol but the Swift generator lists are not updated.
 */
function checkExhaustiveness(project: Project): void {
  const protocolModules = ['state.ts', 'actions.ts', 'commands.ts', 'notifications.ts', 'errors.ts'];
  const imported = new Set<string>();
  for (const baseName of protocolModules) {
    const sources = findProtocolSourceFiles(project, baseName);
    if (sources.length === 0) throw new Error(`Could not find types/${baseName} in the project`);
    for (const sf of sources) {
      for (const decl of sf.getInterfaces()) {
        if (decl.isExported()) imported.add(decl.getName());
      }
      for (const decl of sf.getTypeAliases()) {
        if (decl.isExported()) imported.add(decl.getName());
      }
    }
  }

  // Types covered by the explicit generator lists.
  const coveredByLists = new Set<string>([
    ...STATE_STRUCTS,
    ...STATE_ENUMS,
    ...COMMAND_STRUCTS,
    ...COMMAND_ENUMS,
    ...NOTIFICATION_STRUCTS,
    ...NOTIFICATION_ENUMS,
    ...ACTION_VARIANTS
      .filter(v => v.tsInterface !== '_merged_')
      .map(v => v.tsInterface),
  ]);

  // Types that ARE generated but via explicit non-list code paths.
  const knownSpecial = new Set<string>([
    'URI',                          // type alias for string
    'JsonPrimitive',                // primitive JSON value alias; mapped to AnyCodable
    'BaseParams',                    // marker base interface; flattened into each command params struct
    'StringOrMarkdown',              // generateStringOrMarkdown()
    'ToolCallState',                // TOOL_CALL_STATE_UNION discriminated union
    'StateAction',                  // StateAction enum in generateActionsFile()
    'ActionEnvelope',               // generateStructFromInterface() call in generateActionsFile()
    'ActionOrigin',                 // generateStructFromInterface() call in generateActionsFile()
    'ResponsePart',                 // RESPONSE_PART_UNION discriminated union
    'ToolResultContent',            // TOOL_RESULT_CONTENT_UNION discriminated union
    'SessionToolCallApprovedAction', // merged into SessionToolCallConfirmedAction
    'SessionToolCallDeniedAction',   // merged into SessionToolCallConfirmedAction
    'SessionToolCallConfirmedAction', // emitted as merged variant
    'PingParams',                    // empty interface; no Swift type emitted
    'TerminalClaim',                // TERMINAL_CLAIM_UNION discriminated union
    'TerminalContentPart',           // TERMINAL_CONTENT_PART_UNION discriminated union
    'ChatInputQuestion',         // SESSION_INPUT_QUESTION_UNION discriminated union
    'ChatInputAnswerValue',      // SESSION_INPUT_ANSWER_VALUE_UNION discriminated union
    'ChatInputAnswer',           // CHAT_INPUT_ANSWER_UNION discriminated union
    'ChatOrigin',                // hand-generated union for inline variants
    'ChatToolCallApprovedAction',
    'ChatToolCallDeniedAction',
    'ChatToolCallConfirmedAction',
    'ChatAction',
    'MessageAttachment',            // MESSAGE_ATTACHMENT_UNION discriminated union
    'MessageAttachmentBase',        // base interface, flattened into the variant structs via `extends`
    'SessionMetadata',              // base interface, flattened into SessionState / SessionSummary via `extends`
    'Customization',                // CUSTOMIZATION_UNION discriminated union
    'ChildCustomization',           // CHILD_CUSTOMIZATION_UNION discriminated union
    'ChildCustomizationType',       // TS subset alias of CustomizationType; consumers reuse the CustomizationType Swift enum
    'CustomizationLoadState',       // CUSTOMIZATION_LOAD_STATE_UNION discriminated union
    'McpServerState',              // MCP_SERVER_STATUS_UNION discriminated union
    'ToolCallContributor',          // TOOL_CALL_CONTRIBUTOR_UNION discriminated union
    'SessionInputRequest',          // SESSION_INPUT_REQUEST_UNION discriminated union
    'ToolCallConfirmationState',    // TOOL_CALL_CONFIRMATION_STATE_UNION discriminated union
    'AuthRequiredErrorData',        // emitted by generateErrorsFile()
    'PermissionDeniedErrorData',    // emitted by generateErrorsFile()
    'UnsupportedProtocolVersionErrorData', // emitted by generateErrorsFile()
    'AhpError',                     // typed via JsonRpcError; not a Swift struct
    'AhpErrorDetailsMap',           // type-level mapping; not a Swift struct
    'AhpErrorCode',                 // type-level alias over AhpErrorCodes const enum
    'AhpErrorCodeWithData',         // type-level alias; not a Swift type
    'JsonRpcErrorCode',             // type-level alias over JsonRpcErrorCodes const enum
    'ReconnectResult',              // RECONNECT_RESULT_UNION discriminated union
    'ChangesetOperationTarget',     // TS discriminated union; consumers should add a Swift case-iterable enum
  ]);

  const missing = [...imported].filter(n => !coveredByLists.has(n) && !knownSpecial.has(n));
  if (missing.length > 0) {
    throw new Error(
      `generate-swift.ts exhaustiveness check failed.\n` +
      `The following types are exported from the protocol source modules but are not covered by the Swift generator:\n` +
      missing.map(n => `  - ${n}`).join('\n') + '\n\n' +
      `Add them to the appropriate list in scripts/generate-swift.ts:\n` +
      `  STATE_STRUCTS / STATE_ENUMS, COMMAND_STRUCTS / COMMAND_ENUMS,\n` +
      `  NOTIFICATION_STRUCTS / NOTIFICATION_ENUMS, ACTION_VARIANTS,\n` +
      `  or knownSpecial if they are generated via a non-list code path.`
    );
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

function generateVersionFile(project: Project): string {
  const { current, supported } = readProtocolVersions(project);

  const items = supported.map((v) => `    ${JSON.stringify(v)},`).join('\n');

  return (
    '// Generated from types/*.ts — do not edit\n\n' +
    'import Foundation\n\n' +
    '/// Current protocol version (SemVer `MAJOR.MINOR.PATCH`).\n' +
    `public let PROTOCOL_VERSION: String = ${JSON.stringify(current)}\n\n` +
    '/// Every protocol version this package is willing to negotiate,\n' +
    '/// ordered most-preferred-first. The first entry equals\n' +
    '/// ``PROTOCOL_VERSION``.\n' +
    '///\n' +
    '/// Pass this list (or a derived `[String]`) as `protocolVersions` on\n' +
    '/// `InitializeParams` so the same client binary can fall back to older\n' +
    "/// protocol versions if the host doesn't accept the newest one.\n" +
    'public let SUPPORTED_PROTOCOL_VERSIONS: [String] = [\n' +
    items +
    '\n]\n'
  );
}

export function generateSwiftPackage(project: Project, outputDir: string): void {
  checkExhaustiveness(project);

  const generatedDir = path.join(outputDir, 'Sources', 'AgentHostProtocol', 'Generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  // AnyCodable is only written if it doesn't exist yet, so hand-edits are
  // preserved across regeneration. Package.swift is hand-maintained at the
  // repository root (see /Package.swift) — SwiftPM requires the manifest to
  // live at the repo root for remote consumption — so it is not generated
  // here.
  const anyCodablePath = path.join(outputDir, 'Sources', 'AgentHostProtocol', 'AnyCodable.swift');
  if (!fs.existsSync(anyCodablePath)) {
    fs.mkdirSync(path.dirname(anyCodablePath), { recursive: true });
    fs.writeFileSync(anyCodablePath, anyCodableContent());
  }

  // Generated files (always overwritten)
  fs.writeFileSync(path.join(generatedDir, 'State.generated.swift'), generateStateFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Actions.generated.swift'), generateActionsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Commands.generated.swift'), generateCommandsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Notifications.generated.swift'), generateNotificationsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Errors.generated.swift'), generateErrorsFile(project));
  fs.writeFileSync(path.join(generatedDir, 'Messages.generated.swift'), generateMessagesFile());
  fs.writeFileSync(path.join(generatedDir, 'Version.generated.swift'), generateVersionFile(project));
}
