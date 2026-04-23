/**
 * Go Module Generator — Generates a Go module from TypeScript type
 * definitions parsed via ts-morph.
 *
 * Output: examples/go/ahp/ with go.mod and generated .go files.
 */

import {
  Project,
  InterfaceDeclaration,
  EnumDeclaration,
  PropertySignature,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';

const GENERATED_HEADER = '// Code generated from types/*.ts — DO NOT EDIT.\n\npackage ahp\n';

// ─── Name Mapping ────────────────────────────────────────────────────────────

/** Strips the I prefix from interface names: IRootState → RootState */
function goTypeName(tsName: string): string {
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

/** camelCase or PascalCase → Go exported PascalCase with acronym handling */
function goFieldName(name: string): string {
  // Strip leading underscore: _meta → meta
  if (name.startsWith('_')) name = name.substring(1);

  // Convert snake_case to camelCase
  if (name.includes('_')) {
    name = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  }

  // Capitalize first letter
  name = name[0].toUpperCase() + name.slice(1);

  // Apply Go acronym conventions at word boundaries
  name = name
    .replace(/Id$/,       'ID')
    .replace(/Id([A-Z])/g, 'ID$1')
    .replace(/Url$/,       'URL')
    .replace(/Url([A-Z])/g, 'URL$1')
    .replace(/Uri$/,       'URI')
    .replace(/Uri([A-Z])/g, 'URI$1')
    .replace(/Rpc$/,       'RPC')
    .replace(/Rpc([A-Z])/g, 'RPC$1')
    .replace(/Json$/,      'JSON')
    .replace(/Json([A-Z])/g, 'JSON$1')
    .replace(/Http$/,      'HTTP')
    .replace(/Http([A-Z])/g, 'HTTP$1')
    .replace(/Api$/,       'API')
    .replace(/Api([A-Z])/g, 'API$1')
    .replace(/Ip$/,        'IP')
    .replace(/Ip([A-Z])/g,  'IP$1');

  return name;
}

/** PascalCase → camelCase (for Go enum const names from TS member names) */
function toCamelCase(name: string): string {
  return name[0].toLowerCase() + name.slice(1);
}

/** Snake_case → camelCase (for RFC 9728 properties) */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ─── Type Mapping ────────────────────────────────────────────────────────────

/**
 * Synthetic Go structs required for `Partial<T>` references.
 * Go has no structural `Partial`, so we emit a sibling struct with every
 * property forced to a pointer. Populated by `mapType`.
 */
const requiredPartialStructs = new Set<string>();

/** Go name for `Partial<ISessionSummary>` → `PartialSessionSummary`. */
function partialGoName(tsInterfaceName: string): string {
  return `Partial${goTypeName(tsInterfaceName)}`;
}

/** Map a TypeScript type string to a Go type string */
function mapType(tsType: string, propName?: string, containerName?: string): string {
  tsType = tsType.replace(/import\([^)]+\)\./g, '').trim();

  // Remove outer parens
  while (tsType.startsWith('(') && tsType.endsWith(')')) {
    tsType = tsType.slice(1, -1).trim();
  }

  // Primitives
  if (tsType === 'string') return 'string';
  if (tsType === 'number') {
    const isFloat =
      (containerName === 'ISessionInputNumberAnswerValue' && propName === 'value') ||
      (containerName === 'ISessionInputNumberQuestion' && (propName === 'defaultValue' || propName === 'min' || propName === 'max')) ||
      propName === 'numberValue';
    return isFloat ? 'float64' : 'int';
  }
  if (tsType === 'boolean') return 'bool';
  if (tsType === 'unknown') return 'json.RawMessage';
  if (tsType === 'object') return 'map[string]json.RawMessage';
  if (tsType === 'true' || tsType === 'false') return 'bool';

  // Type aliases
  if (tsType === 'URI') return 'string';
  if (tsType === 'StringOrMarkdown') return 'StringOrMarkdown';

  // Known unions
  if (tsType === 'IRootState | ISessionState' || tsType === 'IRootState | ISessionState | ITerminalState') return 'SnapshotState';

  // T | null → *T
  const nullMatch = tsType.match(/^(.+?)\s*\|\s*null$/);
  if (nullMatch) {
    const inner = mapType(nullMatch[1], propName, containerName);
    return inner.startsWith('*') ? inner : `*${inner}`;
  }

  // T | undefined → T (optionality handled by ? token)
  const undefMatch = tsType.match(/^(.+?)\s*\|\s*undefined$/);
  if (undefMatch) return mapType(undefMatch[1], propName, containerName);

  // Array: T[]
  const arrayMatch = tsType.match(/^(.+)\[\]$/);
  if (arrayMatch) return `[]${mapType(arrayMatch[1], propName, containerName)}`;

  // Array<T>
  const arrayGenericMatch = tsType.match(/^Array<(.+)>$/);
  if (arrayGenericMatch) return `[]${mapType(arrayGenericMatch[1], propName, containerName)}`;

  // Record<string, T>
  const recordMatch = tsType.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) return `map[string]${mapType(recordMatch[1], propName, containerName)}`;

  // Partial<T>
  const partialMatch = tsType.match(/^Partial<(\w+)>$/);
  if (partialMatch) {
    requiredPartialStructs.add(partialMatch[1]);
    return partialGoName(partialMatch[1]);
  }

  // Enum member union: EnumName.A | EnumName.B | ...
  const enumUnionMatch = tsType.match(/^(\w+)\.\w+(\s*\|\s*\1\.\w+)*$/);
  if (enumUnionMatch) return enumUnionMatch[1];

  // Single enum member: EnumName.Value
  const enumMemberMatch = tsType.match(/^(\w+)\.(\w+)$/);
  if (enumMemberMatch) return enumMemberMatch[1];

  // String literal: 'value'
  if (tsType.startsWith("'") && tsType.endsWith("'")) return 'string';

  // String literal union: 'a' | 'b' | ...
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(tsType)) return 'string';

  // Inline object type → json.RawMessage fallback
  if (tsType.startsWith('{')) return 'json.RawMessage';

  // Named type — strip I prefix
  return goTypeName(tsType);
}

// ─── Property Extraction ─────────────────────────────────────────────────────

interface GoProp {
  name: string;     // Go field name (PascalCase)
  wireName: string; // JSON key (original TS name)
  type: string;     // Go type
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

/** Check whether a Go type is inherently nullable (pointer, slice, map) */
function isNullableGoType(goType: string): boolean {
  return goType.startsWith('*') || goType.startsWith('[]') || goType.startsWith('map[') || goType === 'json.RawMessage';
}

/** Extract Go properties from a TypeScript interface */
function extractProps(iface: InterfaceDeclaration, project: Project): GoProp[] {
  const allProps = getAllProperties(iface, project);
  const seen = new Set<string>();

  return allProps
    .filter(p => {
      const name = p.getName();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map(p => {
      const tsName = p.getName();
      const tsType = getPropertyType(p);
      const goType = mapType(tsType, tsName, iface.getName());
      const hasUnionUndefined = /\|\s*undefined/.test(tsType);
      const isOptional = p.hasQuestionToken() || hasUnionUndefined;

      // If optional and not already a nullable Go type, wrap in pointer
      const needsPointer = isOptional && !isNullableGoType(goType);
      const finalType = needsPointer ? `*${goType}` : goType;

      // Build Go field name
      let fieldName: string;
      if (tsName.startsWith('_')) {
        fieldName = goFieldName(tsName);
      } else if (tsName.includes('_')) {
        fieldName = goFieldName(snakeToCamel(tsName));
      } else {
        fieldName = goFieldName(tsName);
      }

      return {
        name: fieldName,
        wireName: tsName,
        type: finalType,
        optional: isOptional,
        doc: getPropertyDoc(p),
      };
    });
}

// ─── Go Enum Generation ──────────────────────────────────────────────────────

function generateGoEnum(enumDecl: EnumDeclaration): string {
  const name = enumDecl.getName();
  const lines: string[] = [];
  const desc = enumDecl.getJsDocs()[0]?.getDescription().trim();
  const values = enumDecl.getMembers().map(member => member.getValue());
  const rawType = values.every(value => typeof value === 'number') ? 'int' : 'string';

  if (desc) {
    for (const docLine of desc.split('\n')) {
      lines.push(`// ${docLine.trim()}`);
    }
  }
  lines.push(`type ${name} ${rawType}`);
  lines.push('');
  lines.push('const (');

  for (const member of enumDecl.getMembers()) {
    const memberName = name + member.getName();
    const value = member.getValue();
    const memberDoc = member.getJsDocs()[0]?.getDescription().trim();
    if (memberDoc) {
      for (const docLine of memberDoc.split('\n')) {
        lines.push(`\t// ${docLine.trim()}`);
      }
    }
    if (rawType === 'int') {
      lines.push(`\t${memberName} ${name} = ${value}`);
    } else {
      lines.push(`\t${memberName} ${name} = ${JSON.stringify(value)}`);
    }
  }

  lines.push(')');
  return lines.join('\n');
}

// ─── Go Struct Generation ────────────────────────────────────────────────────

function generateGoStruct(
  goName: string,
  props: GoProp[],
  doc?: string,
): string {
  const lines: string[] = [];

  if (doc) {
    lines.push(`// ${goName} ${doc}`);
  }
  lines.push(`type ${goName} struct {`);

  for (const p of props) {
    if (p.doc) {
      for (const docLine of p.doc.split('\n')) {
        lines.push(`\t// ${docLine.trim()}`);
      }
    }
    const omit = p.optional ? ',omitempty' : '';
    lines.push(`\t${p.name} ${p.type} \`json:"${p.wireName}${omit}"\``);
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── Discriminated Union Generation ──────────────────────────────────────────

interface UnionVariant {
  caseName: string;         // Go field name on wrapper struct (PascalCase)
  structName: string;       // Go type name of the variant struct
  discriminantValue: string; // Wire value for the discriminant
}

interface UnionConfig {
  name: string;
  discriminantField: string;
  variants: UnionVariant[];
  unknownFallback?: boolean; // If true, add raw JSON fallback for unknown discriminants
}

function generateDiscriminatedUnion(config: UnionConfig): string {
  const lines: string[] = [];

  // Struct definition with one pointer per variant
  lines.push(`// ${config.name} is a discriminated union keyed on "${config.discriminantField}".`);
  lines.push(`type ${config.name} struct {`);
  for (const v of config.variants) {
    lines.push(`\t${v.caseName} *${v.structName}`);
  }
  if (config.unknownFallback) {
    lines.push(`\tUnknownType string`);
    lines.push(`\tUnknownRaw  json.RawMessage`);
  }
  lines.push('}');
  lines.push('');

  // UnmarshalJSON
  lines.push(`func (u *${config.name}) UnmarshalJSON(data []byte) error {`);
  lines.push(`\tvar disc struct {`);
  lines.push(`\t\tD string \`json:"${config.discriminantField}"\``);
  lines.push(`\t}`);
  lines.push(`\tif err := json.Unmarshal(data, &disc); err != nil {`);
  lines.push(`\t\treturn err`);
  lines.push(`\t}`);
  lines.push(`\tswitch disc.D {`);
  for (const v of config.variants) {
    lines.push(`\tcase ${JSON.stringify(v.discriminantValue)}:`);
    lines.push(`\t\tu.${v.caseName} = new(${v.structName})`);
    lines.push(`\t\treturn json.Unmarshal(data, u.${v.caseName})`);
  }
  lines.push(`\tdefault:`);
  if (config.unknownFallback) {
    lines.push(`\t\tu.UnknownType = disc.D`);
    lines.push(`\t\tu.UnknownRaw = make(json.RawMessage, len(data))`);
    lines.push(`\t\tcopy(u.UnknownRaw, data)`);
    lines.push(`\t\treturn nil`);
  } else {
    lines.push(`\t\treturn fmt.Errorf("unknown ${config.name} ${config.discriminantField}: %q", disc.D)`);
  }
  lines.push(`\t}`);
  lines.push('}');
  lines.push('');

  // MarshalJSON
  lines.push(`func (u ${config.name}) MarshalJSON() ([]byte, error) {`);
  for (const v of config.variants) {
    lines.push(`\tif u.${v.caseName} != nil {`);
    lines.push(`\t\treturn json.Marshal(u.${v.caseName})`);
    lines.push(`\t}`);
  }
  if (config.unknownFallback) {
    lines.push(`\tif u.UnknownRaw != nil {`);
    lines.push(`\t\treturn u.UnknownRaw, nil`);
    lines.push(`\t}`);
  }
  lines.push(`\treturn nil, fmt.Errorf("empty ${config.name}: no variant set")`);
  lines.push('}');

  return lines.join('\n');
}

// ─── Interface → Go Struct (auto from project) ──────────────────────────────

function generateStructFromInterface(
  project: Project,
  tsInterfaceName: string,
  goNameOverride?: string,
): string {
  const iface = findInterface(project, tsInterfaceName);
  if (!iface) throw new Error(`Interface ${tsInterfaceName} not found`);
  const name = goNameOverride ?? goTypeName(tsInterfaceName);
  const props = extractProps(iface, project);
  const desc = iface.getJsDocs()[0]?.getDescription().trim();
  const docLine = desc ? desc.split('\n')[0].trim() : undefined;
  return generateGoStruct(name, props, docLine);
}

/**
 * Emit a Go counterpart for `Partial<T>`: same fields as `T` but with
 * every field forced to a pointer type.
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
    type: p.type.startsWith('*') ? p.type : `*${p.type}`,
  }));
  return generateGoStruct(partialGoName(tsInterfaceName), props);
}

// ─── State File Generator ────────────────────────────────────────────────────

const STATE_ENUMS = [
  'PolicyState', 'PendingMessageKind', 'SessionLifecycle', 'SessionStatus',
  'SessionInputAnswerState', 'SessionInputAnswerValueKind', 'SessionInputQuestionKind',
  'SessionInputResponseKind',
  'TurnState', 'AttachmentType', 'ResponsePartKind', 'ToolCallStatus',
  'ToolCallConfirmationReason', 'ToolCallCancellationReason', 'ConfirmationOptionKind',
  'ToolResultContentType', 'CustomizationStatus', 'TerminalClaimKind',
];

const STATE_STRUCTS = [
  'Icon', 'IProtectedResourceMetadata', 'IRootState', 'IRootConfigState', 'IAgentInfo',
  'ISessionModelInfo', 'IModelSelection', 'IConfigPropertySchema', 'IConfigSchema',
  'IPendingMessage', 'ISessionState', 'ISessionActiveClient',
  'ISessionSummary', 'IProjectInfo', 'ISessionConfigState', 'ITurn', 'IActiveTurn', 'IUserMessage',
  'ISessionInputOption',
  'ISessionInputTextAnswerValue', 'ISessionInputNumberAnswerValue',
  'ISessionInputBooleanAnswerValue', 'ISessionInputSelectedAnswerValue',
  'ISessionInputSelectedManyAnswerValue', 'ISessionInputAnswered',
  'ISessionInputSkipped',
  'ISessionInputTextQuestion',
  'ISessionInputNumberQuestion', 'ISessionInputBooleanQuestion',
  'ISessionInputSingleSelectQuestion', 'ISessionInputMultiSelectQuestion',
  'ISessionInputRequest',
  'IMessageAttachment', 'IMarkdownResponsePart', 'IContentRef',
  'IResourceReponsePart', 'IToolCallResponsePart', 'IReasoningResponsePart',
  'IToolCallResult', 'IToolCallStreamingState',
  'IToolCallPendingConfirmationState', 'IToolCallRunningState',
  'IToolCallPendingResultConfirmationState', 'IToolCallCompletedState',
  'IToolCallCancelledState', 'IConfirmationOption', 'IToolDefinition', 'IToolAnnotations',
  'IToolResultTextContent', 'IToolResultEmbeddedResourceContent',
  'IToolResultResourceContent', 'IToolResultFileEditContent',
  'IToolResultTerminalContent', 'IToolResultSubagentContent', 'ICustomizationRef',
  'ISessionCustomization', 'IFileEdit', 'ITerminalInfo',
  'ITerminalClientClaim', 'ITerminalSessionClaim', 'ITerminalState',
  'ITerminalUnclassifiedPart', 'ITerminalCommandPart',
  'IUsageInfo', 'IErrorInfo', 'ISnapshot',
];

const RESPONSE_PART_UNION: UnionConfig = {
  name: 'ResponsePart',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Markdown', structName: 'MarkdownResponsePart', discriminantValue: 'markdown' },
    { caseName: 'ContentRef', structName: 'ResourceReponsePart', discriminantValue: 'contentRef' },
    { caseName: 'ToolCall', structName: 'ToolCallResponsePart', discriminantValue: 'toolCall' },
    { caseName: 'Reasoning', structName: 'ReasoningResponsePart', discriminantValue: 'reasoning' },
  ],
};

const TOOL_CALL_STATE_UNION: UnionConfig = {
  name: 'ToolCallState',
  discriminantField: 'status',
  variants: [
    { caseName: 'Streaming', structName: 'ToolCallStreamingState', discriminantValue: 'streaming' },
    { caseName: 'PendingConfirmation', structName: 'ToolCallPendingConfirmationState', discriminantValue: 'pending-confirmation' },
    { caseName: 'Running', structName: 'ToolCallRunningState', discriminantValue: 'running' },
    { caseName: 'PendingResultConfirmation', structName: 'ToolCallPendingResultConfirmationState', discriminantValue: 'pending-result-confirmation' },
    { caseName: 'Completed', structName: 'ToolCallCompletedState', discriminantValue: 'completed' },
    { caseName: 'Cancelled', structName: 'ToolCallCancelledState', discriminantValue: 'cancelled' },
  ],
};

const TERMINAL_CLAIM_UNION: UnionConfig = {
  name: 'TerminalClaim',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Client', structName: 'TerminalClientClaim', discriminantValue: 'client' },
    { caseName: 'Session', structName: 'TerminalSessionClaim', discriminantValue: 'session' },
  ],
};

const TERMINAL_CONTENT_PART_UNION: UnionConfig = {
  name: 'TerminalContentPart',
  discriminantField: 'type',
  variants: [
    { caseName: 'Unclassified', structName: 'TerminalUnclassifiedPart', discriminantValue: 'unclassified' },
    { caseName: 'Command', structName: 'TerminalCommandPart', discriminantValue: 'command' },
  ],
};

const SESSION_INPUT_QUESTION_UNION: UnionConfig = {
  name: 'SessionInputQuestion',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Text', structName: 'SessionInputTextQuestion', discriminantValue: 'text' },
    { caseName: 'Number', structName: 'SessionInputNumberQuestion', discriminantValue: 'number' },
    { caseName: 'Integer', structName: 'SessionInputNumberQuestion', discriminantValue: 'integer' },
    { caseName: 'Boolean', structName: 'SessionInputBooleanQuestion', discriminantValue: 'boolean' },
    { caseName: 'SingleSelect', structName: 'SessionInputSingleSelectQuestion', discriminantValue: 'single-select' },
    { caseName: 'MultiSelect', structName: 'SessionInputMultiSelectQuestion', discriminantValue: 'multi-select' },
  ],
};

const SESSION_INPUT_ANSWER_VALUE_UNION: UnionConfig = {
  name: 'SessionInputAnswerValue',
  discriminantField: 'kind',
  variants: [
    { caseName: 'Text', structName: 'SessionInputTextAnswerValue', discriminantValue: 'text' },
    { caseName: 'Number', structName: 'SessionInputNumberAnswerValue', discriminantValue: 'number' },
    { caseName: 'Boolean', structName: 'SessionInputBooleanAnswerValue', discriminantValue: 'boolean' },
    { caseName: 'Selected', structName: 'SessionInputSelectedAnswerValue', discriminantValue: 'selected' },
    { caseName: 'SelectedMany', structName: 'SessionInputSelectedManyAnswerValue', discriminantValue: 'selected-many' },
  ],
};

const SESSION_INPUT_ANSWER_UNION: UnionConfig = {
  name: 'SessionInputAnswer',
  discriminantField: 'state',
  variants: [
    { caseName: 'Draft', structName: 'SessionInputAnswered', discriminantValue: 'draft' },
    { caseName: 'Submitted', structName: 'SessionInputAnswered', discriminantValue: 'submitted' },
    { caseName: 'Skipped', structName: 'SessionInputSkipped', discriminantValue: 'skipped' },
  ],
};

function generateToolResultContentUnion(): string {
  return `// ToolResultContent is a discriminated union keyed on "type".
type ToolResultContent struct {
\tText             *ToolResultTextContent
\tEmbeddedResource *ToolResultEmbeddedResourceContent
\tResource         *ToolResultResourceContent
\tFileEdit         *ToolResultFileEditContent
\tTerminal         *ToolResultTerminalContent
\tSubagent         *ToolResultSubagentContent
}

func (u *ToolResultContent) UnmarshalJSON(data []byte) error {
\tvar disc struct {
\t\tType string \`json:"type"\`
\t}
\tif err := json.Unmarshal(data, &disc); err != nil {
\t\treturn err
\t}
\tswitch disc.Type {
\tcase "text":
\t\tu.Text = new(ToolResultTextContent)
\t\treturn json.Unmarshal(data, u.Text)
\tcase "embeddedResource":
\t\tu.EmbeddedResource = new(ToolResultEmbeddedResourceContent)
\t\treturn json.Unmarshal(data, u.EmbeddedResource)
\tcase "resource":
\t\tu.Resource = new(ToolResultResourceContent)
\t\treturn json.Unmarshal(data, u.Resource)
\tcase "fileEdit":
\t\tu.FileEdit = new(ToolResultFileEditContent)
\t\treturn json.Unmarshal(data, u.FileEdit)
\tcase "terminal":
\t\tu.Terminal = new(ToolResultTerminalContent)
\t\treturn json.Unmarshal(data, u.Terminal)
\tcase "subagent":
\t\tu.Subagent = new(ToolResultSubagentContent)
\t\treturn json.Unmarshal(data, u.Subagent)
\tdefault:
\t\treturn fmt.Errorf("unknown ToolResultContent type: %q", disc.Type)
\t}
}

func (u ToolResultContent) MarshalJSON() ([]byte, error) {
\tif u.Text != nil {
\t\treturn json.Marshal(u.Text)
\t}
\tif u.EmbeddedResource != nil {
\t\treturn json.Marshal(u.EmbeddedResource)
\t}
\tif u.Resource != nil {
\t\treturn json.Marshal(u.Resource)
\t}
\tif u.FileEdit != nil {
\t\treturn json.Marshal(u.FileEdit)
\t}
\tif u.Terminal != nil {
\t\treturn json.Marshal(u.Terminal)
\t}
\tif u.Subagent != nil {
\t\treturn json.Marshal(u.Subagent)
\t}
\treturn nil, fmt.Errorf("empty ToolResultContent: no variant set")
}`;
}

function generateStringOrMarkdown(): string {
  return `// StringOrMarkdown represents a value that is either a plain string or
// a markdown-formatted string.
type StringOrMarkdown struct {
\tText     *string // non-nil when the value is a plain string
\tMarkdown *string // non-nil when the value is markdown
}

func (s *StringOrMarkdown) UnmarshalJSON(data []byte) error {
\t// Try plain string first
\tvar str string
\tif err := json.Unmarshal(data, &str); err == nil {
\t\ts.Text = &str
\t\treturn nil
\t}
\t// Try markdown object
\tvar obj struct {
\t\tMarkdown string \`json:"markdown"\`
\t}
\tif err := json.Unmarshal(data, &obj); err == nil {
\t\ts.Markdown = &obj.Markdown
\t\treturn nil
\t}
\treturn fmt.Errorf("StringOrMarkdown: cannot decode %s", string(data))
}

func (s StringOrMarkdown) MarshalJSON() ([]byte, error) {
\tif s.Markdown != nil {
\t\treturn json.Marshal(struct {
\t\t\tMarkdown string \`json:"markdown"\`
\t\t}{Markdown: *s.Markdown})
\t}
\tif s.Text != nil {
\t\treturn json.Marshal(*s.Text)
\t}
\treturn json.Marshal(nil)
}`;
}

function generateSnapshotState(): string {
  return `// SnapshotState is the state payload of a snapshot — root, session, or terminal state.
type SnapshotState struct {
\tRoot     *RootState
\tSession  *SessionState
\tTerminal *TerminalState
}

func (s *SnapshotState) UnmarshalJSON(data []byte) error {
\t// Peek at top-level fields to determine variant type
\tvar peek map[string]json.RawMessage
\tif err := json.Unmarshal(data, &peek); err != nil {
\t\treturn err
\t}
\t// SessionState has a required "summary" field
\tif _, ok := peek["summary"]; ok {
\t\ts.Session = new(SessionState)
\t\treturn json.Unmarshal(data, s.Session)
\t}
\t// TerminalState has "content" but not "agents"
\tif _, hasContent := peek["content"]; hasContent {
\t\tif _, hasAgents := peek["agents"]; !hasAgents {
\t\t\ts.Terminal = new(TerminalState)
\t\t\treturn json.Unmarshal(data, s.Terminal)
\t\t}
\t}
\t// Fall back to RootState
\ts.Root = new(RootState)
\treturn json.Unmarshal(data, s.Root)
}

func (s SnapshotState) MarshalJSON() ([]byte, error) {
\tif s.Session != nil {
\t\treturn json.Marshal(s.Session)
\t}
\tif s.Terminal != nil {
\t\treturn json.Marshal(s.Terminal)
\t}
\tif s.Root != nil {
\t\treturn json.Marshal(s.Root)
\t}
\treturn nil, fmt.Errorf("empty SnapshotState: no variant set")
}`;
}

function generateStateFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'state.ts')!;
  const lines: string[] = [
    GENERATED_HEADER,
    'import (',
    '\t"encoding/json"',
    '\t"fmt"',
    ')',
    '',
  ];

  lines.push('// ── Type Aliases ──────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('// URI is a string alias for URI values (e.g. "agenthost:/root").');
  lines.push('type URI = string');
  lines.push('');

  lines.push('// ── StringOrMarkdown ──────────────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateStringOrMarkdown());
  lines.push('');

  lines.push('// ── Enums ────────────────────────────────────────────────────────────────────');
  lines.push('');
  for (const enumName of STATE_ENUMS) {
    const decl = sf.getEnum(enumName);
    if (decl) {
      lines.push(generateGoEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ── State Types ──────────────────────────────────────────────────────────────');
  lines.push('');
  for (const ifaceName of STATE_STRUCTS) {
    try {
      lines.push(generateStructFromInterface(project, ifaceName));
      lines.push('');
    } catch (e) {
      lines.push(`// TODO: Could not generate ${ifaceName}: ${e}`);
      lines.push('');
    }
  }

  lines.push('// ── Discriminated Unions ──────────────────────────────────────────────────────');
  lines.push('');
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
  lines.push(generateToolResultContentUnion());
  lines.push('');
  lines.push(generateSnapshotState());
  lines.push('');

  return lines.join('\n');
}

// ─── Actions File Generator ──────────────────────────────────────────────────

/** Action type discriminant values mapped to struct names */
const ACTION_VARIANTS: { type: string; caseName: string; tsInterface: string }[] = [
  { type: 'root/agentsChanged', caseName: 'RootAgentsChanged', tsInterface: 'IRootAgentsChangedAction' },
  { type: 'root/activeSessionsChanged', caseName: 'RootActiveSessionsChanged', tsInterface: 'IRootActiveSessionsChangedAction' },
  { type: 'session/ready', caseName: 'SessionReady', tsInterface: 'ISessionReadyAction' },
  { type: 'session/creationFailed', caseName: 'SessionCreationFailed', tsInterface: 'ISessionCreationFailedAction' },
  { type: 'session/turnStarted', caseName: 'SessionTurnStarted', tsInterface: 'ISessionTurnStartedAction' },
  { type: 'session/delta', caseName: 'SessionDelta', tsInterface: 'ISessionDeltaAction' },
  { type: 'session/responsePart', caseName: 'SessionResponsePart', tsInterface: 'ISessionResponsePartAction' },
  { type: 'session/toolCallStart', caseName: 'SessionToolCallStart', tsInterface: 'ISessionToolCallStartAction' },
  { type: 'session/toolCallDelta', caseName: 'SessionToolCallDelta', tsInterface: 'ISessionToolCallDeltaAction' },
  { type: 'session/toolCallReady', caseName: 'SessionToolCallReady', tsInterface: 'ISessionToolCallReadyAction' },
  { type: 'session/toolCallConfirmed', caseName: 'SessionToolCallConfirmed', tsInterface: '_merged_' },
  { type: 'session/toolCallComplete', caseName: 'SessionToolCallComplete', tsInterface: 'ISessionToolCallCompleteAction' },
  { type: 'session/toolCallResultConfirmed', caseName: 'SessionToolCallResultConfirmed', tsInterface: 'ISessionToolCallResultConfirmedAction' },
  { type: 'session/turnComplete', caseName: 'SessionTurnComplete', tsInterface: 'ISessionTurnCompleteAction' },
  { type: 'session/turnCancelled', caseName: 'SessionTurnCancelled', tsInterface: 'ISessionTurnCancelledAction' },
  { type: 'session/error', caseName: 'SessionError', tsInterface: 'ISessionErrorAction' },
  { type: 'session/titleChanged', caseName: 'SessionTitleChanged', tsInterface: 'ISessionTitleChangedAction' },
  { type: 'session/usage', caseName: 'SessionUsage', tsInterface: 'ISessionUsageAction' },
  { type: 'session/reasoning', caseName: 'SessionReasoning', tsInterface: 'ISessionReasoningAction' },
  { type: 'session/modelChanged', caseName: 'SessionModelChanged', tsInterface: 'ISessionModelChangedAction' },
  { type: 'session/isReadChanged', caseName: 'SessionIsReadChanged', tsInterface: 'ISessionIsReadChangedAction' },
  { type: 'session/isDoneChanged', caseName: 'SessionIsDoneChanged', tsInterface: 'ISessionIsDoneChangedAction' },
  { type: 'session/serverToolsChanged', caseName: 'SessionServerToolsChanged', tsInterface: 'ISessionServerToolsChangedAction' },
  { type: 'session/activeClientChanged', caseName: 'SessionActiveClientChanged', tsInterface: 'ISessionActiveClientChangedAction' },
  { type: 'session/activeClientToolsChanged', caseName: 'SessionActiveClientToolsChanged', tsInterface: 'ISessionActiveClientToolsChangedAction' },
  { type: 'session/pendingMessageSet', caseName: 'SessionPendingMessageSet', tsInterface: 'ISessionPendingMessageSetAction' },
  { type: 'session/pendingMessageRemoved', caseName: 'SessionPendingMessageRemoved', tsInterface: 'ISessionPendingMessageRemovedAction' },
  { type: 'session/queuedMessagesReordered', caseName: 'SessionQueuedMessagesReordered', tsInterface: 'ISessionQueuedMessagesReorderedAction' },
  { type: 'session/inputRequested', caseName: 'SessionInputRequested', tsInterface: 'ISessionInputRequestedAction' },
  { type: 'session/inputAnswerChanged', caseName: 'SessionInputAnswerChanged', tsInterface: 'ISessionInputAnswerChangedAction' },
  { type: 'session/inputCompleted', caseName: 'SessionInputCompleted', tsInterface: 'ISessionInputCompletedAction' },
  { type: 'session/customizationsChanged', caseName: 'SessionCustomizationsChanged', tsInterface: 'ISessionCustomizationsChangedAction' },
  { type: 'session/customizationToggled', caseName: 'SessionCustomizationToggled', tsInterface: 'ISessionCustomizationToggledAction' },
  { type: 'session/truncated', caseName: 'SessionTruncated', tsInterface: 'ISessionTruncatedAction' },
  { type: 'session/diffsChanged', caseName: 'SessionDiffsChanged', tsInterface: 'ISessionDiffsChangedAction' },
  { type: 'session/configChanged', caseName: 'SessionConfigChanged', tsInterface: 'ISessionConfigChangedAction' },
  { type: 'session/toolCallContentChanged', caseName: 'SessionToolCallContentChanged', tsInterface: 'ISessionToolCallContentChangedAction' },
  { type: 'root/terminalsChanged', caseName: 'RootTerminalsChanged', tsInterface: 'IRootTerminalsChangedAction' },
  { type: 'root/configChanged', caseName: 'RootConfigChanged', tsInterface: 'IRootConfigChangedAction' },
  { type: 'terminal/data', caseName: 'TerminalData', tsInterface: 'ITerminalDataAction' },
  { type: 'terminal/input', caseName: 'TerminalInput', tsInterface: 'ITerminalInputAction' },
  { type: 'terminal/resized', caseName: 'TerminalResized', tsInterface: 'ITerminalResizedAction' },
  { type: 'terminal/claimed', caseName: 'TerminalClaimed', tsInterface: 'ITerminalClaimedAction' },
  { type: 'terminal/titleChanged', caseName: 'TerminalTitleChanged', tsInterface: 'ITerminalTitleChangedAction' },
  { type: 'terminal/cwdChanged', caseName: 'TerminalCwdChanged', tsInterface: 'ITerminalCwdChangedAction' },
  { type: 'terminal/exited', caseName: 'TerminalExited', tsInterface: 'ITerminalExitedAction' },
  { type: 'terminal/cleared', caseName: 'TerminalCleared', tsInterface: 'ITerminalClearedAction' },
  { type: 'terminal/commandDetectionAvailable', caseName: 'TerminalCommandDetectionAvailable', tsInterface: 'ITerminalCommandDetectionAvailableAction' },
  { type: 'terminal/commandExecuted', caseName: 'TerminalCommandExecuted', tsInterface: 'ITerminalCommandExecutedAction' },
  { type: 'terminal/commandFinished', caseName: 'TerminalCommandFinished', tsInterface: 'ITerminalCommandFinishedAction' },
];

/** Merged struct for the approved/denied tool call confirmed action */
function generateMergedToolCallConfirmedStruct(): string {
  return `// SessionToolCallConfirmedAction represents a client approving or denying a pending tool call.
type SessionToolCallConfirmedAction struct {
\tType           string                      \`json:"type"\`
\tSession        string                      \`json:"session"\`
\tTurnID         string                      \`json:"turnId"\`
\tToolCallID     string                      \`json:"toolCallId"\`
\tApproved       bool                        \`json:"approved"\`
\tConfirmed      *ToolCallConfirmationReason  \`json:"confirmed,omitempty"\`
\tReason         *ToolCallCancellationReason  \`json:"reason,omitempty"\`
\tUserSuggestion *UserMessage                \`json:"userSuggestion,omitempty"\`
\tReasonMessage  *StringOrMarkdown           \`json:"reasonMessage,omitempty"\`
\tMeta           map[string]json.RawMessage  \`json:"_meta,omitempty"\`
}`;
}

function generateActionsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'actions.ts')!;
  const lines: string[] = [
    GENERATED_HEADER,
    'import (',
    '\t"encoding/json"',
    '\t"fmt"',
    ')',
    '',
  ];

  // ActionType enum
  lines.push('// ── ActionType ────────────────────────────────────────────────────────────────');
  lines.push('');
  const actionTypeEnum = sf.getEnum('ActionType');
  if (actionTypeEnum) {
    lines.push(generateGoEnum(actionTypeEnum));
    lines.push('');
  }

  // ActionEnvelope and ActionOrigin
  lines.push('// ── Action Infrastructure ─────────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateStructFromInterface(project, 'IActionOrigin'));
  lines.push('');
  lines.push(generateStructFromInterface(project, 'IActionEnvelope'));
  lines.push('');

  // Individual action structs
  lines.push('// ── Action Types ─────────────────────────────────────────────────────────────');
  lines.push('');
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
  lines.push('// ── StateAction Union ─────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('// StateAction is a discriminated union of all state actions.');
  lines.push('type StateAction struct {');
  for (const v of ACTION_VARIANTS) {
    const structName = v.tsInterface === '_merged_'
      ? 'SessionToolCallConfirmedAction'
      : goTypeName(v.tsInterface);
    lines.push(`\t${v.caseName} *${structName}`);
  }
  lines.push(`\tUnknownType string`);
  lines.push(`\tUnknownRaw  json.RawMessage`);
  lines.push('}');
  lines.push('');

  // StateAction UnmarshalJSON
  lines.push('func (u *StateAction) UnmarshalJSON(data []byte) error {');
  lines.push('\tvar disc struct {');
  lines.push('\t\tType string `json:"type"`');
  lines.push('\t}');
  lines.push('\tif err := json.Unmarshal(data, &disc); err != nil {');
  lines.push('\t\treturn err');
  lines.push('\t}');
  lines.push('\tswitch disc.Type {');
  for (const v of ACTION_VARIANTS) {
    const structName = v.tsInterface === '_merged_'
      ? 'SessionToolCallConfirmedAction'
      : goTypeName(v.tsInterface);
    lines.push(`\tcase ${JSON.stringify(v.type)}:`);
    lines.push(`\t\tu.${v.caseName} = new(${structName})`);
    lines.push(`\t\treturn json.Unmarshal(data, u.${v.caseName})`);
  }
  lines.push('\tdefault:');
  lines.push('\t\tu.UnknownType = disc.Type');
  lines.push('\t\tu.UnknownRaw = make(json.RawMessage, len(data))');
  lines.push('\t\tcopy(u.UnknownRaw, data)');
  lines.push('\t\treturn nil');
  lines.push('\t}');
  lines.push('}');
  lines.push('');

  // StateAction MarshalJSON
  lines.push('func (u StateAction) MarshalJSON() ([]byte, error) {');
  for (const v of ACTION_VARIANTS) {
    lines.push(`\tif u.${v.caseName} != nil {`);
    lines.push(`\t\treturn json.Marshal(u.${v.caseName})`);
    lines.push(`\t}`);
  }
  lines.push('\tif u.UnknownRaw != nil {');
  lines.push('\t\treturn u.UnknownRaw, nil');
  lines.push('\t}');
  lines.push('\treturn nil, fmt.Errorf("empty StateAction: no variant set")');
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
  'ICreateTerminalParams', 'IDisposeTerminalParams',
  'IResolveSessionConfigParams', 'IResolveSessionConfigResult',
  'ISessionConfigPropertySchema', 'ISessionConfigSchema',
  'ISessionConfigCompletionsParams', 'ISessionConfigCompletionsResult',
  'ISessionConfigValueItem',
];

const RECONNECT_RESULT_UNION: UnionConfig = {
  name: 'ReconnectResult',
  discriminantField: 'type',
  variants: [
    { caseName: 'Replay', structName: 'ReconnectReplayResult', discriminantValue: 'replay' },
    { caseName: 'Snapshot', structName: 'ReconnectSnapshotResult', discriminantValue: 'snapshot' },
  ],
};

function generateCommandsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'commands.ts')!;
  const lines: string[] = [
    GENERATED_HEADER,
    'import (',
    '\t"encoding/json"',
    '\t"fmt"',
    ')',
    '',
  ];

  lines.push('// ── Command Enums ─────────────────────────────────────────────────────────────');
  lines.push('');
  for (const enumName of COMMAND_ENUMS) {
    const decl = sf.getEnum(enumName);
    if (decl) {
      lines.push(generateGoEnum(decl));
      lines.push('');
    }
  }

  lines.push('// ── Command Types ─────────────────────────────────────────────────────────────');
  lines.push('');
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

  lines.push('// ── ReconnectResult Union ─────────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateDiscriminatedUnion(RECONNECT_RESULT_UNION));
  lines.push('');

  return lines.join('\n');
}

// ─── Notifications File Generator ────────────────────────────────────────────

const NOTIFICATION_ENUMS = ['AuthRequiredReason', 'NotificationType'];

const NOTIFICATION_STRUCTS = [
  'ISessionAddedNotification', 'ISessionRemovedNotification',
  'ISessionSummaryChangedNotification', 'IAuthRequiredNotification',
];

const PROTOCOL_NOTIFICATION_UNION: UnionConfig = {
  name: 'ProtocolNotification',
  discriminantField: 'type',
  variants: [
    { caseName: 'SessionAdded', structName: 'SessionAddedNotification', discriminantValue: 'notify/sessionAdded' },
    { caseName: 'SessionRemoved', structName: 'SessionRemovedNotification', discriminantValue: 'notify/sessionRemoved' },
    { caseName: 'SessionSummaryChanged', structName: 'SessionSummaryChangedNotification', discriminantValue: 'notify/sessionSummaryChanged' },
    { caseName: 'AuthRequired', structName: 'AuthRequiredNotification', discriminantValue: 'notify/authRequired' },
  ],
};

function generateNotificationsFile(project: Project): string {
  const sf = project.getSourceFiles().find(f => f.getBaseName() === 'notifications.ts')!;
  const lines: string[] = [
    GENERATED_HEADER,
    'import (',
    '\t"encoding/json"',
    '\t"fmt"',
    ')',
    '',
  ];

  lines.push('// ── Notification Enums ────────────────────────────────────────────────────────');
  lines.push('');
  for (const enumName of NOTIFICATION_ENUMS) {
    const decl = sf.getEnum(enumName);
    if (decl) {
      lines.push(generateGoEnum(decl));
      lines.push('');
    }
  }

  // Track partials introduced by notification structs
  const priorPartials = new Set(requiredPartialStructs);

  lines.push('// ── Notification Types ────────────────────────────────────────────────────────');
  lines.push('');
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
    lines.push('// ── Partial Summary Types ─────────────────────────────────────────────────────');
    lines.push('');
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

  lines.push('// ── ProtocolNotification Union ────────────────────────────────────────────────');
  lines.push('');
  lines.push(generateDiscriminatedUnion(PROTOCOL_NOTIFICATION_UNION));
  lines.push('');

  return lines.join('\n');
}

// ─── Errors File Generator ───────────────────────────────────────────────────

function generateErrorsFile(): string {
  const lines: string[] = [
    GENERATED_HEADER,
  ];

  lines.push('// ── Standard JSON-RPC Error Codes ─────────────────────────────────────────────');
  lines.push('');
  lines.push('const (');
  lines.push('\t// JSONRPCParseError indicates invalid JSON.');
  lines.push('\tJSONRPCParseError = -32700');
  lines.push('\t// JSONRPCInvalidRequest indicates a malformed JSON-RPC request.');
  lines.push('\tJSONRPCInvalidRequest = -32600');
  lines.push('\t// JSONRPCMethodNotFound indicates an unknown method name.');
  lines.push('\tJSONRPCMethodNotFound = -32601');
  lines.push('\t// JSONRPCInvalidParams indicates invalid method parameters.');
  lines.push('\tJSONRPCInvalidParams = -32602');
  lines.push('\t// JSONRPCInternalError indicates an unspecified server error.');
  lines.push('\tJSONRPCInternalError = -32603');
  lines.push(')');
  lines.push('');

  lines.push('// ── AHP Application Error Codes ───────────────────────────────────────────────');
  lines.push('');
  lines.push('const (');
  lines.push('\t// AHPSessionNotFound indicates the referenced session URI does not exist.');
  lines.push('\tAHPSessionNotFound = -32001');
  lines.push('\t// AHPProviderNotFound indicates the requested agent provider is not registered.');
  lines.push('\tAHPProviderNotFound = -32002');
  lines.push('\t// AHPSessionAlreadyExists indicates a session with the given URI already exists.');
  lines.push('\tAHPSessionAlreadyExists = -32003');
  lines.push('\t// AHPTurnInProgress indicates the operation requires no active turn, but one is in progress.');
  lines.push('\tAHPTurnInProgress = -32004');
  lines.push('\t// AHPUnsupportedProtocolVersion indicates the client\'s protocol version is not supported.');
  lines.push('\tAHPUnsupportedProtocolVersion = -32005');
  lines.push('\t// AHPContentNotFound indicates the requested content URI does not exist.');
  lines.push('\tAHPContentNotFound = -32006');
  lines.push('\t// AHPAuthRequired indicates authentication is required for a protected resource.');
  lines.push('\tAHPAuthRequired = -32007');
  lines.push('\t// AHPNotFound indicates the requested file, folder, or URI does not exist.');
  lines.push('\tAHPNotFound = -32008');
  lines.push('\t// AHPPermissionDenied indicates the client is not permitted to access the requested resource.');
  lines.push('\tAHPPermissionDenied = -32009');
  lines.push('\t// AHPAlreadyExists indicates the target resource already exists and overwriting is not allowed.');
  lines.push('\tAHPAlreadyExists = -32010');
  lines.push(')');
  lines.push('');

  return lines.join('\n');
}

// ─── Messages File Generator ─────────────────────────────────────────────────

function generateMessagesFile(): string {
  return `${GENERATED_HEADER}
import "encoding/json"

// ── JSON-RPC Base Types ──────────────────────────────────────────────────────

// JSONRPCRequest is a JSON-RPC 2.0 request with typed params.
type JSONRPCRequest[T any] struct {
\tJSONRPC string \`json:"jsonrpc"\`
\tID      int    \`json:"id"\`
\tMethod  string \`json:"method"\`
\tParams  T      \`json:"params"\`
}

// NewJSONRPCRequest creates a new JSON-RPC 2.0 request.
func NewJSONRPCRequest[T any](id int, method string, params T) JSONRPCRequest[T] {
\treturn JSONRPCRequest[T]{
\t\tJSONRPC: "2.0",
\t\tID:      id,
\t\tMethod:  method,
\t\tParams:  params,
\t}
}

// JSONRPCError is a JSON-RPC 2.0 error object.
type JSONRPCError struct {
\tCode    int              \`json:"code"\`
\tMessage string           \`json:"message"\`
\tData    *json.RawMessage \`json:"data,omitempty"\`
}

// JSONRPCSuccessResponse is a JSON-RPC 2.0 success response with typed result.
type JSONRPCSuccessResponse[T any] struct {
\tJSONRPC string \`json:"jsonrpc"\`
\tID      int    \`json:"id"\`
\tResult  T      \`json:"result"\`
}

// JSONRPCErrorResponse is a JSON-RPC 2.0 error response.
type JSONRPCErrorResponse struct {
\tJSONRPC string       \`json:"jsonrpc"\`
\tID      int          \`json:"id"\`
\tError   JSONRPCError \`json:"error"\`
}

// JSONRPCNotification is a JSON-RPC 2.0 notification (no id) with typed params.
type JSONRPCNotification[T any] struct {
\tJSONRPC string \`json:"jsonrpc"\`
\tMethod  string \`json:"method"\`
\tParams  T      \`json:"params"\`
}

// NewJSONRPCNotification creates a new JSON-RPC 2.0 notification.
func NewJSONRPCNotification[T any](method string, params T) JSONRPCNotification[T] {
\treturn JSONRPCNotification[T]{
\t\tJSONRPC: "2.0",
\t\tMethod:  method,
\t\tParams:  params,
\t}
}

// ── Server → Client Notification Params ──────────────────────────────────────

// ActionNotificationParams is the params for the server → client action notification.
type ActionNotificationParams = ActionEnvelope

// NotificationMethodParams is the params for the server → client notification method.
type NotificationMethodParams struct {
\tNotification ProtocolNotification \`json:"notification"\`
}

// ── AHP Command Helpers ──────────────────────────────────────────────────────

// NewInitializeRequest creates an initialize JSON-RPC request.
func NewInitializeRequest(id int, params InitializeParams) JSONRPCRequest[InitializeParams] {
\treturn NewJSONRPCRequest(id, "initialize", params)
}

// NewReconnectRequest creates a reconnect JSON-RPC request.
func NewReconnectRequest(id int, params ReconnectParams) JSONRPCRequest[ReconnectParams] {
\treturn NewJSONRPCRequest(id, "reconnect", params)
}

// NewSubscribeRequest creates a subscribe JSON-RPC request.
func NewSubscribeRequest(id int, params SubscribeParams) JSONRPCRequest[SubscribeParams] {
\treturn NewJSONRPCRequest(id, "subscribe", params)
}

// NewCreateSessionRequest creates a createSession JSON-RPC request.
func NewCreateSessionRequest(id int, params CreateSessionParams) JSONRPCRequest[CreateSessionParams] {
\treturn NewJSONRPCRequest(id, "createSession", params)
}

// NewDisposeSessionRequest creates a disposeSession JSON-RPC request.
func NewDisposeSessionRequest(id int, params DisposeSessionParams) JSONRPCRequest[DisposeSessionParams] {
\treturn NewJSONRPCRequest(id, "disposeSession", params)
}

// NewListSessionsRequest creates a listSessions JSON-RPC request.
func NewListSessionsRequest(id int, params ListSessionsParams) JSONRPCRequest[ListSessionsParams] {
\treturn NewJSONRPCRequest(id, "listSessions", params)
}

// NewResourceReadRequest creates a resourceRead JSON-RPC request.
func NewResourceReadRequest(id int, params ResourceReadParams) JSONRPCRequest[ResourceReadParams] {
\treturn NewJSONRPCRequest(id, "resourceRead", params)
}

// NewResourceWriteRequest creates a resourceWrite JSON-RPC request.
func NewResourceWriteRequest(id int, params ResourceWriteParams) JSONRPCRequest[ResourceWriteParams] {
\treturn NewJSONRPCRequest(id, "resourceWrite", params)
}

// NewResourceListRequest creates a resourceList JSON-RPC request.
func NewResourceListRequest(id int, params ResourceListParams) JSONRPCRequest[ResourceListParams] {
\treturn NewJSONRPCRequest(id, "resourceList", params)
}

// NewResourceCopyRequest creates a resourceCopy JSON-RPC request.
func NewResourceCopyRequest(id int, params ResourceCopyParams) JSONRPCRequest[ResourceCopyParams] {
\treturn NewJSONRPCRequest(id, "resourceCopy", params)
}

// NewResourceDeleteRequest creates a resourceDelete JSON-RPC request.
func NewResourceDeleteRequest(id int, params ResourceDeleteParams) JSONRPCRequest[ResourceDeleteParams] {
\treturn NewJSONRPCRequest(id, "resourceDelete", params)
}

// NewResourceMoveRequest creates a resourceMove JSON-RPC request.
func NewResourceMoveRequest(id int, params ResourceMoveParams) JSONRPCRequest[ResourceMoveParams] {
\treturn NewJSONRPCRequest(id, "resourceMove", params)
}

// NewFetchTurnsRequest creates a fetchTurns JSON-RPC request.
func NewFetchTurnsRequest(id int, params FetchTurnsParams) JSONRPCRequest[FetchTurnsParams] {
\treturn NewJSONRPCRequest(id, "fetchTurns", params)
}

// NewAuthenticateRequest creates an authenticate JSON-RPC request.
func NewAuthenticateRequest(id int, params AuthenticateParams) JSONRPCRequest[AuthenticateParams] {
\treturn NewJSONRPCRequest(id, "authenticate", params)
}

// ── AHP Client Notification Helpers ──────────────────────────────────────────

// NewUnsubscribeNotification creates an unsubscribe JSON-RPC notification.
func NewUnsubscribeNotification(params UnsubscribeParams) JSONRPCNotification[UnsubscribeParams] {
\treturn NewJSONRPCNotification("unsubscribe", params)
}

// NewDispatchActionNotification creates a dispatchAction JSON-RPC notification.
func NewDispatchActionNotification(params DispatchActionParams) JSONRPCNotification[DispatchActionParams] {
\treturn NewJSONRPCNotification("dispatchAction", params)
}
`;
}

// ─── go.mod ──────────────────────────────────────────────────────────────────

function goModContent(): string {
  return `module github.com/microsoft/agent-host-protocol/examples/go/ahp

go 1.21
`;
}

// ─── Exhaustiveness Check ────────────────────────────────────────────────────

/**
 * Verifies that every type imported in types/version/v1.ts from the protocol
 * source modules is covered by one of the generator lists or a known
 * special-cased code path.
 */
function checkExhaustiveness(project: Project): void {
  const v1 = project.getSourceFiles().find(f => f.getBaseName() === 'v1.ts');
  if (!v1) throw new Error('Could not find types/version/v1.ts in the project');

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

  const knownSpecial = new Set<string>([
    'StringOrMarkdown',               // generateStringOrMarkdown()
    'IToolCallState',                  // TOOL_CALL_STATE_UNION discriminated union
    'IStateAction',                    // StateAction in generateActionsFile()
    'IActionEnvelope',                 // generateStructFromInterface() in generateActionsFile()
    'IActionOrigin',                   // generateStructFromInterface() in generateActionsFile()
    'ISessionToolCallApprovedAction',  // merged into SessionToolCallConfirmedAction
    'ISessionToolCallDeniedAction',    // merged into SessionToolCallConfirmedAction
    'IProtocolNotification',           // PROTOCOL_NOTIFICATION_UNION discriminated union
    'ITerminalClaim',                  // TERMINAL_CLAIM_UNION discriminated union
    'ITerminalContentPart',            // TERMINAL_CONTENT_PART_UNION discriminated union
    'ISessionInputQuestion',           // SESSION_INPUT_QUESTION_UNION discriminated union
    'ISessionInputAnswerValue',        // SESSION_INPUT_ANSWER_VALUE_UNION discriminated union
    'ISessionInputAnswer',             // SESSION_INPUT_ANSWER_UNION discriminated union
  ]);

  const missing = [...imported].filter(n => !coveredByLists.has(n) && !knownSpecial.has(n));
  if (missing.length > 0) {
    throw new Error(
      `generate-go.ts exhaustiveness check failed.\n` +
      `The following types are declared in types/version/v1.ts but are not covered by the Go generator:\n` +
      missing.map(n => `  - ${n}`).join('\n') + '\n\n' +
      `Add them to the appropriate list in scripts/generate-go.ts:\n` +
      `  STATE_STRUCTS / STATE_ENUMS, COMMAND_STRUCTS / COMMAND_ENUMS,\n` +
      `  NOTIFICATION_STRUCTS / NOTIFICATION_ENUMS, ACTION_VARIANTS,\n` +
      `  or knownSpecial if they are generated via a non-list code path.`
    );
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function generateGoModule(project: Project, outputDir: string): void {
  checkExhaustiveness(project);

  fs.mkdirSync(outputDir, { recursive: true });

  // go.mod is only written if it doesn't exist yet, so hand-edits are preserved.
  const modPath = path.join(outputDir, 'go.mod');
  if (!fs.existsSync(modPath)) {
    fs.writeFileSync(modPath, goModContent());
  }

  // Generated files (always overwritten)
  fs.writeFileSync(path.join(outputDir, 'state_generated.go'), generateStateFile(project));
  fs.writeFileSync(path.join(outputDir, 'actions_generated.go'), generateActionsFile(project));
  fs.writeFileSync(path.join(outputDir, 'commands_generated.go'), generateCommandsFile(project));
  fs.writeFileSync(path.join(outputDir, 'notifications_generated.go'), generateNotificationsFile(project));
  fs.writeFileSync(path.join(outputDir, 'errors_generated.go'), generateErrorsFile());
  fs.writeFileSync(path.join(outputDir, 'messages_generated.go'), generateMessagesFile());
}
