/**
 * Swift Package Generator — Generates a Swift Package from TypeScript type
 * definitions parsed via ts-morph.
 *
 * Output: swift/AgentHostProtocol/ with Package.swift and Sources/
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

const GENERATED_HEADER = '// Generated from types/*.ts — do not edit\n\nimport Foundation\n';

// ─── Name Mapping ────────────────────────────────────────────────────────────

/** Strips the I prefix from interface names: IRootState → RootState */
function swiftTypeName(tsName: string): string {
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

/** PascalCase → camelCase */
function toCamelCase(name: string): string {
  return name[0].toLowerCase() + name.slice(1);
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

/** Map a TypeScript type string to a Swift type string */
function mapType(tsType: string): string {
  tsType = tsType.replace(/import\([^)]+\)\./g, '').trim();

  // Remove outer parens
  while (tsType.startsWith('(') && tsType.endsWith(')')) {
    tsType = tsType.slice(1, -1).trim();
  }

  // Primitives
  if (tsType === 'string') return 'String';
  if (tsType === 'number') return 'Int';
  if (tsType === 'boolean') return 'Bool';
  if (tsType === 'unknown') return 'AnyCodable';
  if (tsType === 'object') return 'AnyCodable';
  if (tsType === 'true' || tsType === 'false') return 'Bool';

  // Type aliases
  if (tsType === 'URI') return 'String';
  if (tsType === 'StringOrMarkdown') return 'StringOrMarkdown';

  // Known unions
  if (tsType === 'IRootState | ISessionState') return 'SnapshotState';

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
  if (recordMatch) return `[String: ${mapType(recordMatch[1])}]`;

  // Enum member union: EnumName.A | EnumName.B | ...
  const enumUnionMatch = tsType.match(/^(\w+)\.\w+(\s*\|\s*\1\.\w+)*$/);
  if (enumUnionMatch) return swiftTypeName(enumUnionMatch[1]);

  // Single enum member: EnumName.Value
  const enumMemberMatch = tsType.match(/^(\w+)\.(\w+)$/);
  if (enumMemberMatch) return swiftTypeName(enumMemberMatch[1]);

  // String literal: 'value'
  if (tsType.startsWith("'") && tsType.endsWith("'")) return 'String';

  // String literal union: 'a' | 'b' | ...
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(tsType)) return 'String';

  // Inline object type → AnyCodable fallback
  if (tsType.startsWith('{')) return 'AnyCodable';

  // Named type — strip I prefix
  return swiftTypeName(tsType);
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
      const swiftT = mapType(tsType);
      const hasUnionUndefined = /\|\s*undefined/.test(tsType);
      const isOptional = p.hasQuestionToken() || hasUnionUndefined || swiftT.endsWith('?');
      const finalType = isOptional && !swiftT.endsWith('?') ? swiftT + '?' : swiftT;
      const sName = tsName.startsWith('_')
        ? swiftPropName(tsName)
        : tsName.includes('_')
          ? snakeToCamel(tsName)
          : tsName;

      return {
        name: sName,
        wireName: tsName,
        type: finalType,
        optional: isOptional,
        doc: getPropertyDoc(p),
      };
    });
}

// ─── Swift Enum Generation ───────────────────────────────────────────────────

function generateSwiftEnum(enumDecl: EnumDeclaration): string {
  const name = enumDecl.getName();
  const lines: string[] = [];
  const desc = enumDecl.getJsDocs()[0]?.getDescription().trim();

  if (desc) {
    for (const docLine of desc.split('\n')) {
      lines.push(`/// ${docLine.trim()}`);
    }
  }
  lines.push(`public enum ${name}: String, Codable, Sendable {`);

  for (const member of enumDecl.getMembers()) {
    const memberName = toCamelCase(member.getName());
    const value = member.getValue();
    const memberDoc = member.getJsDocs()[0]?.getDescription().trim();
    if (memberDoc) {
      for (const docLine of memberDoc.split('\n')) {
        lines.push(`    /// ${docLine.trim()}`);
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
  lines.push(`public struct ${swiftName}: Codable, Sendable {`);

  // Properties
  for (const p of props) {
    if (p.doc) {
      for (const docLine of p.doc.split('\n')) {
        lines.push(`    /// ${docLine.trim()}`);
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
}

function generateDiscriminatedUnion(config: UnionConfig): string {
  const lines: string[] = [];
  lines.push(`public enum ${config.name}: Codable, Sendable {`);

  for (const v of config.variants) {
    lines.push(`    case ${v.caseName}(${v.structName})`);
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
  lines.push(`            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ${config.name} discriminant: \\(discriminant)")`);
  lines.push('        }');
  lines.push('    }');

  // Encoder
  lines.push('');
  lines.push('    public func encode(to encoder: Encoder) throws {');
  lines.push('        switch self {');
  for (const v of config.variants) {
    lines.push(`        case .${v.caseName}(let value): try value.encode(to: encoder)`);
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
  const name = swiftNameOverride ?? swiftTypeName(tsInterfaceName);
  const props = extractProps(iface, project);
  return generateSwiftStruct(name, props);
}

// ─── State File Generator ────────────────────────────────────────────────────

const STATE_ENUMS = [
  'PolicyState', 'PendingMessageKind', 'SessionLifecycle', 'SessionStatus',
  'TurnState', 'AttachmentType', 'ResponsePartKind', 'ToolCallStatus',
  'ToolCallConfirmationReason', 'ToolCallCancellationReason',
  'ToolResultContentType', 'CustomizationStatus',
];

const STATE_STRUCTS = [
  'Icon', 'IProtectedResourceMetadata', 'IRootState', 'IAgentInfo',
  'ISessionModelInfo', 'IPendingMessage', 'ISessionState', 'ISessionActiveClient',
  'ISessionSummary', 'ITurn', 'IActiveTurn', 'IUserMessage',
  'IMessageAttachment', 'IMarkdownResponsePart', 'IContentRef',
  'IResourceReponsePart', 'IToolCallResponsePart', 'IReasoningResponsePart',
  'IToolCallResult', 'IToolCallStreamingState',
  'IToolCallPendingConfirmationState', 'IToolCallRunningState',
  'IToolCallPendingResultConfirmationState', 'IToolCallCompletedState',
  'IToolCallCancelledState', 'IToolDefinition', 'IToolAnnotations',
  'IToolResultTextContent', 'IToolResultEmbeddedResourceContent',
  'IToolResultResourceContent', 'IToolResultFileEditContent', 'ICustomizationRef',
  'ISessionCustomization', 'IUsageInfo', 'IErrorInfo', 'ISnapshot',
];

const RESPONSE_PART_UNION: UnionConfig = {
  name: 'ResponsePart',
  discriminantField: 'kind',
  variants: [
    { caseName: 'markdown', structName: 'MarkdownResponsePart', discriminantValue: 'markdown' },
    { caseName: 'contentRef', structName: 'ResourceReponsePart', discriminantValue: 'contentRef' },
    { caseName: 'toolCall', structName: 'ToolCallResponsePart', discriminantValue: 'toolCall' },
    { caseName: 'reasoning', structName: 'ReasoningResponsePart', discriminantValue: 'reasoning' },
  ],
};

const TOOL_CALL_STATE_UNION: UnionConfig = {
  name: 'ToolCallState',
  discriminantField: 'status',
  variants: [
    { caseName: 'streaming', structName: 'ToolCallStreamingState', discriminantValue: 'streaming' },
    { caseName: 'pendingConfirmation', structName: 'ToolCallPendingConfirmationState', discriminantValue: 'pending-confirmation' },
    { caseName: 'running', structName: 'ToolCallRunningState', discriminantValue: 'running' },
    { caseName: 'pendingResultConfirmation', structName: 'ToolCallPendingResultConfirmationState', discriminantValue: 'pending-result-confirmation' },
    { caseName: 'completed', structName: 'ToolCallCompletedState', discriminantValue: 'completed' },
    { caseName: 'cancelled', structName: 'ToolCallCancelledState', discriminantValue: 'cancelled' },
  ],
};

function generateToolResultContentUnion(): string {
  return `public enum ToolResultContent: Codable, Sendable {
    case text(ToolResultTextContent)
    case embeddedResource(ToolResultEmbeddedResourceContent)
    case resource(ToolResultResourceContent)
    case fileEdit(ToolResultFileEditContent)

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
            default:
                throw DecodingError.dataCorruptedError(
                    forKey: .type, in: container,
                    debugDescription: "Unknown ToolResultContent type: \\(type)"
                )
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
  return `/// The state payload of a snapshot — either root state or session state.
public enum SnapshotState: Codable, Sendable {
    case root(RootState)
    case session(SessionState)

    public init(from decoder: Decoder) throws {
        // SessionState has required \`summary\` field, try it first
        if let session = try? SessionState(from: decoder) {
            self = .session(session)
        } else {
            self = .root(try RootState(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .root(let state): try state.encode(to: encoder)
        case .session(let state): try state.encode(to: encoder)
        }
    }
}`;
}

function generateStateFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'state.ts')!;
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// MARK: - Type Aliases\n');
  lines.push('public typealias URI = String\n');

  lines.push('// MARK: - StringOrMarkdown\n');
  lines.push(generateStringOrMarkdown());
  lines.push('');

  lines.push('// MARK: - Enums\n');
  for (const enumName of STATE_ENUMS) {
    const decl = sf.getEnum(enumName);
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
  lines.push(generateDiscriminatedUnion(RESPONSE_PART_UNION));
  lines.push('');
  lines.push(generateDiscriminatedUnion(TOOL_CALL_STATE_UNION));
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
  { type: 'root/agentsChanged', caseName: 'rootAgentsChanged', tsInterface: 'IRootAgentsChangedAction' },
  { type: 'root/activeSessionsChanged', caseName: 'rootActiveSessionsChanged', tsInterface: 'IRootActiveSessionsChangedAction' },
  { type: 'session/ready', caseName: 'sessionReady', tsInterface: 'ISessionReadyAction' },
  { type: 'session/creationFailed', caseName: 'sessionCreationFailed', tsInterface: 'ISessionCreationFailedAction' },
  { type: 'session/turnStarted', caseName: 'sessionTurnStarted', tsInterface: 'ISessionTurnStartedAction' },
  { type: 'session/delta', caseName: 'sessionDelta', tsInterface: 'ISessionDeltaAction' },
  { type: 'session/responsePart', caseName: 'sessionResponsePart', tsInterface: 'ISessionResponsePartAction' },
  { type: 'session/toolCallStart', caseName: 'sessionToolCallStart', tsInterface: 'ISessionToolCallStartAction' },
  { type: 'session/toolCallDelta', caseName: 'sessionToolCallDelta', tsInterface: 'ISessionToolCallDeltaAction' },
  { type: 'session/toolCallReady', caseName: 'sessionToolCallReady', tsInterface: 'ISessionToolCallReadyAction' },
  { type: 'session/toolCallConfirmed', caseName: 'sessionToolCallConfirmed', tsInterface: '_merged_' },
  { type: 'session/toolCallComplete', caseName: 'sessionToolCallComplete', tsInterface: 'ISessionToolCallCompleteAction' },
  { type: 'session/toolCallResultConfirmed', caseName: 'sessionToolCallResultConfirmed', tsInterface: 'ISessionToolCallResultConfirmedAction' },
  { type: 'session/turnComplete', caseName: 'sessionTurnComplete', tsInterface: 'ISessionTurnCompleteAction' },
  { type: 'session/turnCancelled', caseName: 'sessionTurnCancelled', tsInterface: 'ISessionTurnCancelledAction' },
  { type: 'session/error', caseName: 'sessionError', tsInterface: 'ISessionErrorAction' },
  { type: 'session/titleChanged', caseName: 'sessionTitleChanged', tsInterface: 'ISessionTitleChangedAction' },
  { type: 'session/usage', caseName: 'sessionUsage', tsInterface: 'ISessionUsageAction' },
  { type: 'session/reasoning', caseName: 'sessionReasoning', tsInterface: 'ISessionReasoningAction' },
  { type: 'session/modelChanged', caseName: 'sessionModelChanged', tsInterface: 'ISessionModelChangedAction' },
  { type: 'session/serverToolsChanged', caseName: 'sessionServerToolsChanged', tsInterface: 'ISessionServerToolsChangedAction' },
  { type: 'session/activeClientChanged', caseName: 'sessionActiveClientChanged', tsInterface: 'ISessionActiveClientChangedAction' },
  { type: 'session/activeClientToolsChanged', caseName: 'sessionActiveClientToolsChanged', tsInterface: 'ISessionActiveClientToolsChangedAction' },
  { type: 'session/pendingMessageSet', caseName: 'sessionPendingMessageSet', tsInterface: 'ISessionPendingMessageSetAction' },
  { type: 'session/pendingMessageRemoved', caseName: 'sessionPendingMessageRemoved', tsInterface: 'ISessionPendingMessageRemovedAction' },
  { type: 'session/queuedMessagesReordered', caseName: 'sessionQueuedMessagesReordered', tsInterface: 'ISessionQueuedMessagesReorderedAction' },
  { type: 'session/customizationsChanged', caseName: 'sessionCustomizationsChanged', tsInterface: 'ISessionCustomizationsChangedAction' },
  { type: 'session/customizationToggled', caseName: 'sessionCustomizationToggled', tsInterface: 'ISessionCustomizationToggledAction' },
  { type: 'session/truncated', caseName: 'sessionTruncated', tsInterface: 'ISessionTruncatedAction' },
];

/** Merged struct for the approved/denied tool call confirmed action */
function generateMergedToolCallConfirmedStruct(): string {
  return `/// Client approves or denies a pending tool call (merged approved + denied variants).
public struct SessionToolCallConfirmedAction: Codable, Sendable {
    /// Action type discriminant
    public var type: String
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Whether the tool call was approved
    public var approved: Bool
    /// How the tool was confirmed (present when approved)
    public var confirmed: ToolCallConfirmationReason?
    /// Why the tool was cancelled (present when denied)
    public var reason: ToolCallCancellationReason?
    /// What the user suggested instead (present when denied)
    public var userSuggestion: UserMessage?
    /// Explanation for the denial
    public var reasonMessage: StringOrMarkdown?
    /// Additional provider-specific metadata
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type, session, turnId, toolCallId, approved, confirmed, reason, userSuggestion, reasonMessage
        case meta = "_meta"
    }

    public init(
        type: String = "session/toolCallConfirmed",
        session: String,
        turnId: String,
        toolCallId: String,
        approved: Bool,
        confirmed: ToolCallConfirmationReason? = nil,
        reason: ToolCallCancellationReason? = nil,
        userSuggestion: UserMessage? = nil,
        reasonMessage: StringOrMarkdown? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.approved = approved
        self.confirmed = confirmed
        self.reason = reason
        self.userSuggestion = userSuggestion
        self.reasonMessage = reasonMessage
        self.meta = meta
    }
}`;
}

function generateActionsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'actions.ts')!;
  const lines: string[] = [GENERATED_HEADER];

  // ActionType enum
  lines.push('// MARK: - ActionType\n');
  const actionTypeEnum = sf.getEnum('ActionType');
  if (actionTypeEnum) {
    lines.push(generateSwiftEnum(actionTypeEnum));
    lines.push('');
  }

  // ActionEnvelope and ActionOrigin
  lines.push('// MARK: - Action Infrastructure\n');
  lines.push(generateStructFromInterface(project, 'IActionOrigin'));
  lines.push('');
  lines.push(generateStructFromInterface(project, 'IActionEnvelope'));
  lines.push('');

  // Individual action structs
  lines.push('// MARK: - Action Types\n');
  for (const variant of ACTION_VARIANTS) {
    if (variant.tsInterface === '_merged_') {
      lines.push(generateMergedToolCallConfirmedStruct());
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

  // StateAction discriminated union
  lines.push('// MARK: - StateAction Union\n');
  lines.push('/// Discriminated union of all state actions.');
  lines.push('public enum StateAction: Codable, Sendable {');
  for (const v of ACTION_VARIANTS) {
    const structName = v.tsInterface === '_merged_'
      ? 'SessionToolCallConfirmedAction'
      : swiftTypeName(v.tsInterface).replace(/^Session/, 'Session').replace(/Action$/, 'Action');
    lines.push(`    case ${v.caseName}(${swiftTypeName(v.tsInterface === '_merged_' ? 'SessionToolCallConfirmedAction' : v.tsInterface)})`);
  }
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
      : swiftTypeName(v.tsInterface);
    lines.push(`        case ${JSON.stringify(v.type)}:`);
    lines.push(`            self = .${v.caseName}(try ${structName}(from: decoder))`);
  }
  lines.push('        default:');
  lines.push('            throw DecodingError.dataCorruptedError(forKey: .type, in: container, debugDescription: "Unknown action type: \\(type)")');
  lines.push('        }');
  lines.push('    }');
  lines.push('');
  lines.push('    public func encode(to encoder: Encoder) throws {');
  lines.push('        switch self {');
  for (const v of ACTION_VARIANTS) {
    lines.push(`        case .${v.caseName}(let v): try v.encode(to: encoder)`);
  }
  lines.push('        }');
  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ─── Commands File Generator ─────────────────────────────────────────────────

const COMMAND_ENUMS = ['ReconnectResultType', 'ContentEncoding'];

const COMMAND_STRUCTS = [
  'IInitializeParams', 'IInitializeResult',
  'IReconnectParams', 'IReconnectReplayResult', 'IReconnectSnapshotResult',
  'ISubscribeParams', 'ISubscribeResult',
  'ISessionForkSource', 'ICreateSessionParams', 'IDisposeSessionParams',
  'IListSessionsParams', 'IListSessionsResult',
  'IResourceReadParams', 'IResourceReadResult',
  'IResourceWriteParams', 'IResourceWriteResult',
  'IResourceListParams', 'IResourceListResult', 'IDirectoryEntry',
  'IResourceCopyParams', 'IResourceCopyResult',
  'IResourceDeleteParams', 'IResourceDeleteResult',
  'IResourceMoveParams', 'IResourceMoveResult',
  'IFetchTurnsParams', 'IFetchTurnsResult',
  'IUnsubscribeParams', 'IDispatchActionParams',
  'IAuthenticateParams', 'IAuthenticateResult',
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
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'commands.ts')!;
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// MARK: - Command Enums\n');
  for (const enumName of COMMAND_ENUMS) {
    const decl = sf.getEnum(enumName);
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

  return lines.join('\n');
}

// ─── Notifications File Generator ────────────────────────────────────────────

const NOTIFICATION_ENUMS = ['AuthRequiredReason', 'NotificationType'];

const NOTIFICATION_STRUCTS = [
  'ISessionAddedNotification', 'ISessionRemovedNotification', 'IAuthRequiredNotification',
];

const PROTOCOL_NOTIFICATION_UNION: UnionConfig = {
  name: 'ProtocolNotification',
  discriminantField: 'type',
  variants: [
    { caseName: 'sessionAdded', structName: 'SessionAddedNotification', discriminantValue: 'notify/sessionAdded' },
    { caseName: 'sessionRemoved', structName: 'SessionRemovedNotification', discriminantValue: 'notify/sessionRemoved' },
    { caseName: 'authRequired', structName: 'AuthRequiredNotification', discriminantValue: 'notify/authRequired' },
  ],
};

function generateNotificationsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'notifications.ts')!;
  const lines: string[] = [GENERATED_HEADER];

  lines.push('// MARK: - Notification Enums\n');
  for (const enumName of NOTIFICATION_ENUMS) {
    const decl = sf.getEnum(enumName);
    if (decl) {
      lines.push(generateSwiftEnum(decl));
      lines.push('');
    }
  }

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

  lines.push('// MARK: - ProtocolNotification Union\n');
  lines.push(generateDiscriminatedUnion(PROTOCOL_NOTIFICATION_UNION));
  lines.push('');

  return lines.join('\n');
}

// ─── Errors File Generator ───────────────────────────────────────────────────

function generateErrorsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'errors.ts')!;
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
  lines.push('    /// The client\'s protocol version is not supported by the server');
  lines.push('    public static let unsupportedProtocolVersion = -32005');
  lines.push('    /// The requested content URI does not exist');
  lines.push('    public static let contentNotFound = -32006');
  lines.push('    /// Authentication required for a protected resource');
  lines.push('    public static let authRequired = -32007');
  lines.push('    /// The requested file, folder, or URI does not exist');
  lines.push('    public static let notFound = -32008');
  lines.push('    /// The client is not permitted to access the requested resource');
  lines.push('    public static let permissionDenied = -32009');
  lines.push('}');
  lines.push('');

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

/// Params for the server → client \`notification\` method.
public struct NotificationMethodParams: Codable, Sendable {
    public let notification: ProtocolNotification

    public init(notification: ProtocolNotification) {
        self.notification = notification
    }
}

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
public struct AnyCodable: Codable, Sendable, Equatable {
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
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
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
        default:
            return false
        }
    }
}
`;
}

// ─── Package.swift ───────────────────────────────────────────────────────────

function packageSwiftContent(): string {
  return `// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "AgentHostProtocol",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
        .tvOS(.v16),
        .watchOS(.v9),
    ],
    products: [
        .library(
            name: "AgentHostProtocol",
            targets: ["AgentHostProtocol"]
        ),
    ],
    targets: [
        .target(
            name: "AgentHostProtocol",
            path: "Sources/AgentHostProtocol"
        ),
    ]
)
`;
}

// ─── Exhaustiveness Check ─────────────────────────────────────────────────────

/**
 * Verifies that every type imported in types/version/v1.ts from the protocol
 * source modules (state, actions, commands, notifications) is covered by one
 * of the generator lists or a known special-cased code path.
 *
 * This catches the class of bug where a new type is added to the TypeScript
 * protocol and to v1.ts but the Swift generator lists are not updated.
 */
function checkExhaustiveness(project: Project): void {
  const v1 = project.getSourceFiles().find(f => f.getBaseName() === 'v1.ts');
  if (!v1) throw new Error('Could not find types/version/v1.ts in the project');

  // Collect all interface/type names imported from protocol source modules.
  // We skip messages.ts because its types (ICommandMap etc.) are generated
  // as literal Swift strings in generateMessagesFile(), not as struct lists.
  const protocolModules = new Set(['state', 'actions', 'commands', 'notifications', 'errors']);
  const imported = new Set<string>();
  for (const decl of v1.getImportDeclarations()) {
    const mod = decl.getModuleSpecifierValue().replace(/^\.\.\//, '').replace(/\.js$/, '');
    if (!protocolModules.has(mod)) continue;
    for (const named of decl.getNamedImports()) {
      imported.add(named.getName());
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
    'StringOrMarkdown',              // generateStringOrMarkdown()
    'IToolCallState',                // TOOL_CALL_STATE_UNION discriminated union
    'IStateAction',                  // StateAction enum in generateActionsFile()
    'IActionEnvelope',               // generateStructFromInterface() call in generateActionsFile()
    'IActionOrigin',                 // generateStructFromInterface() call in generateActionsFile()
    'ISessionToolCallApprovedAction', // merged into SessionToolCallConfirmedAction
    'ISessionToolCallDeniedAction',   // merged into SessionToolCallConfirmedAction
    'IProtocolNotification',         // PROTOCOL_NOTIFICATION_UNION discriminated union
  ]);

  const missing = [...imported].filter(n => !coveredByLists.has(n) && !knownSpecial.has(n));
  if (missing.length > 0) {
    throw new Error(
      `generate-swift.ts exhaustiveness check failed.\n` +
      `The following types are declared in types/version/v1.ts but are not covered by the Swift generator:\n` +
      missing.map(n => `  - ${n}`).join('\n') + '\n\n' +
      `Add them to the appropriate list in scripts/generate-swift.ts:\n` +
      `  STATE_STRUCTS / STATE_ENUMS, COMMAND_STRUCTS / COMMAND_ENUMS,\n` +
      `  NOTIFICATION_STRUCTS / NOTIFICATION_ENUMS, ACTION_VARIANTS,\n` +
      `  or knownSpecial if they are generated via a non-list code path.`
    );
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function generateSwiftPackage(project: Project, outputDir: string): void {
  checkExhaustiveness(project);

  const generatedDir = path.join(outputDir, 'Sources', 'AgentHostProtocol', 'Generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  // Package.swift and AnyCodable are only written if they don't exist yet,
  // so hand-edits to Package.swift are preserved across regeneration.
  const pkgPath = path.join(outputDir, 'Package.swift');
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, packageSwiftContent());
  }
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
}
