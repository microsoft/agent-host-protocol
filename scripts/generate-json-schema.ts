/**
 * JSON Schema Generator — Generates JSON Schema files from TypeScript type
 * definitions parsed via ts-morph.
 */

import {
  Project,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  PropertySignature,
  Node,
  Type,
  SourceFile,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { findProtocolSourceFiles } from './find-protocol-sources.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface JsonSchema {
  $schema?: string;
  $comment?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: Array<string | number | boolean>;
  const?: string | number | boolean;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// JSDoc text picked up from .ts files may contain CRLF when the working tree
// was checked out on Windows; normalize so generated schemas are byte-identical
// across platforms.
function normalizeDescription(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function getPropertyDescription(prop: PropertySignature): string {
  const jsDocs = prop.getJsDocs();
  if (jsDocs.length === 0) return '';
  return normalizeDescription(jsDocs[0].getDescription());
}

function getInterfaceDescription(node: InterfaceDeclaration): string {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) return '';
  return normalizeDescription(jsDocs[0].getDescription());
}

function getPropertyType(prop: PropertySignature): string {
  const typeNode = prop.getTypeNode();
  if (typeNode) return typeNode.getText();
  return prop.getType().getText(prop);
}

function findInterface(project: Project, name: string): InterfaceDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const iface = sf.getInterface(name);
    if (iface) return iface;
  }
  return undefined;
}

function findTypeAlias(project: Project, name: string): TypeAliasDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const ta = sf.getTypeAlias(name);
    if (ta) return ta;
  }
  return undefined;
}

function findEnum(project: Project, name: string): EnumDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const en = sf.getEnum(name);
    if (en) return en;
  }
  return undefined;
}

// A whole `const enum` → a JSON Schema `enum` of its members' evaluated values.
// ts-morph evaluates const-enum initializers (including bitwise expressions like
// `(1 << 3) | (1 << 4)`), so numeric flag enums resolve to concrete numbers.
function enumToSchema(en: EnumDeclaration): JsonSchema {
  const values = en.getMembers().map(m => m.getValue());
  const defined = values.filter((v): v is string | number => v !== undefined);
  const schema: JsonSchema = { enum: defined };
  if (defined.every(v => typeof v === 'string')) schema.type = 'string';
  else if (defined.every(v => typeof v === 'number')) schema.type = 'number';
  const rawDesc = en.getJsDocs()[0]?.getDescription();
  const desc = rawDesc ? normalizeDescription(rawDesc) : '';
  if (desc) schema.description = desc;
  return schema;
}

function getAllInterfaceProperties(iface: InterfaceDeclaration, project: Project): PropertySignature[] {
  const props: PropertySignature[] = [];

  for (const extension of iface.getExtends()) {
    const baseName = extension.getExpression().getText();
    const baseIface = findInterface(project, baseName);
    if (baseIface) {
      props.push(...getAllInterfaceProperties(baseIface, project));
    }
  }

  props.push(...iface.getProperties());

  const byName = new Map<string, PropertySignature>();
  for (const prop of props) {
    byName.set(prop.getName(), prop);
  }
  return [...byName.values()];
}

// ─── Type → JSON Schema Conversion ──────────────────────────────────────────

function typeTextToSchema(typeText: string, project: Project, _depth = 0): JsonSchema {
  // Real protocol types nest only a handful of levels deep; a runaway depth
  // means a type text is re-expanding to itself (e.g. a nested `|` mis-routed
  // as a top-level union). Fail loudly rather than overflowing the stack.
  if (_depth > 100) {
    throw new Error(`typeTextToSchema: recursion limit exceeded on type text: ${typeText}`);
  }
  let cleaned = typeText
    .replace(/import\([^)]+\)\./g, '')
    .trim();

  // Strip outer parentheses: (A | B) → A | B
  while (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // String literal unions: 'a' | 'b' | 'c'
  if (/^'[^']*'(\s*\|\s*'[^']*')*$/.test(cleaned)) {
    const values = cleaned.match(/'([^']*)'/g)?.map(s => s.slice(1, -1)) || [];
    return { type: 'string', enum: values };
  }

  // Simple types
  if (cleaned === 'string') return { type: 'string' };
  if (cleaned === 'number') return { type: 'number' };
  if (cleaned === 'boolean') return { type: 'boolean' };
  if (cleaned === 'null') return { type: 'null' };
  if (cleaned === 'unknown') return {};
  if (cleaned === 'object') return { type: 'object' };

  // Array types
  const arrayMatch = cleaned.match(/^(.+)\[\]$/);
  if (arrayMatch) {
    return { type: 'array', items: typeTextToSchema(arrayMatch[1], project, _depth + 1) };
  }

  // Record<string, X>
  const recordMatch = cleaned.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) {
    return {
      type: 'object',
      additionalProperties: typeTextToSchema(recordMatch[1], project, _depth + 1) as any,
    };
  }

  // Type | undefined → just the type (handled by optionality)
  const undefinedMatch = cleaned.match(/^(.+?)\s*\|\s*undefined$/);
  if (undefinedMatch) {
    return typeTextToSchema(undefinedMatch[1], project, _depth + 1);
  }

  // Partial<X> — inline every property of X as optional (no `required`).
  // Keeps the generated schema self-describing without introducing synthetic
  // $defs entries that have no counterpart in the TS source.
  const partialMatch = cleaned.match(/^Partial<(\w+)>$/);
  if (partialMatch) {
    const iface = findInterface(project, partialMatch[1]);
    if (iface) {
      const inner = interfaceToSchema(iface, project);
      delete inner.required;
      delete inner.description;
      return inner;
    }
  }

  // Union types (not string literals): A | B. Only treat as a union when there
  // is a genuine TOP-LEVEL `|`. splitUnionType is depth-aware, so a `|` nested
  // inside `{ … }` or `<…>` (e.g. an inline object with a `side?: 'a' | 'b'`
  // field) yields a single part equal to the input — it must fall through to the
  // inline-object / reference handling below rather than re-expanding forever.
  // A union type-alias's printed text can also carry a leading `|`
  // (`type X =\n  | A\n  | B`), which makes splitUnionType yield an empty first
  // element; dropping empties (and `undefined`) keeps us from emitting a
  // matches-anything `{}` branch that breaks strict `oneOf` validation.
  if (cleaned.includes('|') && !cleaned.startsWith("'")) {
    const parts = splitUnionType(cleaned).filter(p => p !== 'undefined' && p !== '');
    if (parts.length > 1) {
      return { oneOf: parts.map(p => typeTextToSchema(p, project, _depth + 1)) };
    }
    if (parts.length === 1 && parts[0] !== cleaned) {
      return typeTextToSchema(parts[0], project, _depth + 1);
    }
  }

  // Enum member access: `ActionType.ChatTurnStarted` → the member's literal
  // value as a `const`. Without this the capitalized-identifier fallback below
  // emits a `$ref` to `#/$defs/ActionType.ChatTurnStarted` that is never
  // defined (dangling). Must run before the interface-reference fallback.
  const enumMemberMatch = cleaned.match(/^([A-Z]\w*)\.(\w+)$/);
  if (enumMemberMatch) {
    const [, enumName, memberName] = enumMemberMatch;
    const en = findEnum(project, enumName);
    const member = en?.getMember(memberName);
    const value = member?.getValue();
    if (value !== undefined) {
      return { const: value };
    }
  }

  // Inline object: { message: string; code?: string }
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    return inlineObjectToSchema(cleaned);
  }

  // Interface references: check if it's a known interface
  if (/^I[A-Z]/.test(cleaned) || /^[A-Z]/.test(cleaned)) {
    return { $ref: `#/$defs/${cleaned}` };
  }

  return {};
}

function splitUnionType(typeText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of typeText) {
    if (char === '<' || char === '(' || char === '{') depth++;
    else if (char === '>' || char === ')' || char === '}') depth--;
    else if (char === '|' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function inlineObjectToSchema(text: string): JsonSchema {
  // Parse { key: type; key?: type } style, stripping any JSDoc/block comments
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const inner = cleaned.slice(cleaned.indexOf('{') + 1, cleaned.lastIndexOf('}')).trim();
  const schema: JsonSchema = { type: 'object', properties: {}, required: [] };
  const fields = inner.split(';').map(f => f.trim()).filter(Boolean);

  for (const field of fields) {
    const match = field.match(/^(\w+)(\?)?:\s*(.+)$/);
    if (match) {
      const [, name, optional, type] = match;
      schema.properties![name] = { type: mapSimpleType(type.trim()) };
      if (!optional) {
        schema.required!.push(name);
      }
    }
  }

  if (schema.required!.length === 0) delete schema.required;
  return schema;
}

function mapSimpleType(t: string): string {
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'string'; // fallback
}

// ─── Interface → JSON Schema ─────────────────────────────────────────────────

function interfaceToSchema(iface: InterfaceDeclaration, project: Project): JsonSchema {
  const schema: JsonSchema = {
    type: 'object',
    description: getInterfaceDescription(iface),
    properties: {},
    required: [],
  };

  for (const prop of getAllInterfaceProperties(iface, project)) {
    const name = prop.getName();
    const typeText = getPropertyType(prop);
    const desc = getPropertyDescription(prop);
    const propSchema = typeTextToSchema(typeText, project);
    if (desc) propSchema.description = desc;
    schema.properties![name] = propSchema;
    if (!prop.hasQuestionToken()) {
      if (!schema.required!.includes(name)) {
        schema.required!.push(name);
      }
    }
  }

  if (schema.required!.length === 0) delete schema.required;
  if (!schema.description) delete schema.description;
  return schema;
}

// ─── Schema File Generators ──────────────────────────────────────────────────

function collectInterfacesFromFile(
  project: Project,
  fileName: string,
): Map<string, InterfaceDeclaration> {
  const map = new Map<string, InterfaceDeclaration>();
  for (const sf of findProtocolSourceFiles(project, fileName)) {
    for (const iface of sf.getInterfaces()) {
      map.set(iface.getName(), iface);
    }
  }
  return map;
}

function buildSchemaWithDefs(
  project: Project,
  title: string,
  description: string,
  rootInterfaces: string[],
  sourceFile: string,
  additionalFiles: string[] = [],
): JsonSchema {
  const schema: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from types/*.ts — do not edit',
    title,
    description,
    $defs: {},
  };

  // Collect all interfaces from the primary file and additional files
  const allInterfaces = new Map<string, InterfaceDeclaration>();
  for (const fn of [sourceFile, ...additionalFiles]) {
    const ifaces = collectInterfacesFromFile(project, fn);
    for (const [name, iface] of ifaces) {
      allInterfaces.set(name, iface);
    }
  }

  // Add all interfaces to $defs
  for (const [name, iface] of allInterfaces) {
    schema.$defs![name] = interfaceToSchema(iface, project);
  }

  // Set the root schema
  if (rootInterfaces.length === 1) {
    schema.$ref = `#/$defs/${rootInterfaces[0]}`;
  } else if (rootInterfaces.length > 1) {
    schema.oneOf = rootInterfaces.map(name => ({ $ref: `#/$defs/${name}` }));
  }

  return schema;
}

function generateStateSchema(project: Project): JsonSchema {
  const schema: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from types/state.ts — do not edit',
    $id: 'https://microsoft.github.io/agent-host-protocol/schema/state.schema.json',
    title: 'AHP State Types',
    description: 'All state types in the Agent Host Protocol.',
    $defs: {},
  };

  const ifaces = collectInterfacesFromFile(project, 'state.ts');
  for (const [name, iface] of ifaces) {
    schema.$defs![name] = interfaceToSchema(iface, project);
  }

  // Add type aliases to $defs
  for (const sf of findProtocolSourceFiles(project, 'state.ts')) {
    for (const ta of sf.getTypeAliases()) {
      const name = ta.getName();
      // Skip simple alias like URI = string, and indexed access types like ToolCallState['status']
      const typeText = ta.getTypeNode()?.getText() || '';
      if (typeText === 'string' || typeText.includes('[')) continue;
      schema.$defs![name] = typeTextToSchema(typeText, project);
      const rawDesc = ta.getJsDocs()[0]?.getDescription();
      const desc = rawDesc ? normalizeDescription(rawDesc) : '';
      if (desc) schema.$defs![name].description = desc;
    }
  }

  return schema;
}

function generateActionsSchema(project: Project): JsonSchema {
  const schema: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from types/actions.ts — do not edit',
    $id: 'https://microsoft.github.io/agent-host-protocol/schema/actions.schema.json',
    title: 'AHP Action Types',
    description: 'All action types in the Agent Host Protocol.',
    $defs: {},
  };

  // Add action interfaces
  const actionIfaces = collectInterfacesFromFile(project, 'actions.ts');
  for (const [name, iface] of actionIfaces) {
    schema.$defs![name] = interfaceToSchema(iface, project);
  }

  // Add action type aliases (e.g. SessionToolCallConfirmedAction union)
  for (const actionSf of findProtocolSourceFiles(project, 'actions.ts')) {
    for (const ta of actionSf.getTypeAliases()) {
      const name = ta.getName();
      if (name === 'StateAction') continue; // handled below
      const typeText = ta.getTypeNode()?.getText() || '';
      schema.$defs![name] = typeTextToSchema(typeText, project);
      const rawDesc = ta.getJsDocs()[0]?.getDescription();
      const desc = rawDesc ? normalizeDescription(rawDesc) : '';
      if (desc) schema.$defs![name].description = desc;
    }
  }

  // Add state type interfaces needed for refs
  const stateIfaces = collectInterfacesFromFile(project, 'state.ts');
  for (const [name, iface] of stateIfaces) {
    if (!schema.$defs![name]) {
      schema.$defs![name] = interfaceToSchema(iface, project);
    }
  }

  // Add state type aliases needed for refs
  for (const stateSf of findProtocolSourceFiles(project, 'state.ts')) {
    for (const ta of stateSf.getTypeAliases()) {
      const name = ta.getName();
      const typeText = ta.getTypeNode()?.getText() || '';
      if (typeText === 'string' || typeText.includes('[')) continue;
      if (!schema.$defs![name]) {
        schema.$defs![name] = typeTextToSchema(typeText, project);
        const rawDesc = ta.getJsDocs()[0]?.getDescription();
        const desc = rawDesc ? normalizeDescription(rawDesc) : '';
        if (desc) schema.$defs![name].description = desc;
      }
    }
  }

  // StateAction as oneOf — derive members from the StateAction type alias itself
  const stateActionAlias = findProtocolSourceFiles(project, 'actions.ts')
    .map(sf => sf.getTypeAlias('StateAction'))
    .find(ta => ta !== undefined);
  const stateActionMembers = stateActionAlias
    ? splitUnionType(stateActionAlias.getTypeNode()?.getText() || '').map(s => s.trim())
    : [];
  schema.$defs!['StateAction'] = {
    description: 'Discriminated union of all state actions.',
    oneOf: stateActionMembers.map(name => ({ $ref: `#/$defs/${name}` })),
  };

  return schema;
}

function generateCommandsSchema(project: Project): JsonSchema {
  const schema: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from types/commands.ts — do not edit',
    $id: 'https://microsoft.github.io/agent-host-protocol/schema/commands.schema.json',
    title: 'AHP Command Types',
    description: 'All command parameter and result types in the Agent Host Protocol.',
    $defs: {},
  };

  const cmdIfaces = collectInterfacesFromFile(project, 'commands.ts');
  for (const [name, iface] of cmdIfaces) {
    schema.$defs![name] = interfaceToSchema(iface, project);
  }

  // Add referenced types from state.ts and actions.ts
  for (const file of ['state.ts', 'actions.ts']) {
    const ifaces = collectInterfacesFromFile(project, file);
    for (const [name, iface] of ifaces) {
      if (!schema.$defs![name]) {
        schema.$defs![name] = interfaceToSchema(iface, project);
      }
    }
  }

  return schema;
}

function generateNotificationsSchema(project: Project): JsonSchema {
  const schema: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from types/notifications.ts — do not edit',
    $id: 'https://microsoft.github.io/agent-host-protocol/schema/notifications.schema.json',
    title: 'AHP Notification Types',
    description: 'All notification types in the Agent Host Protocol.',
    $defs: {},
  };

  const notifIfaces = collectInterfacesFromFile(project, 'notifications.ts');
  for (const [name, iface] of notifIfaces) {
    schema.$defs![name] = interfaceToSchema(iface, project);
  }

  // Add ProtocolNotification discriminated union
  const notifNames = Array.from(notifIfaces.keys());
  schema.$defs!['ProtocolNotification'] = {
    description: 'Discriminated union of all protocol notifications.',
    oneOf: notifNames.map(name => ({ $ref: `#/$defs/${name}` })),
  };

  // Add referenced types from state.ts
  const stateIfaces = collectInterfacesFromFile(project, 'state.ts');
  for (const [name, iface] of stateIfaces) {
    if (!schema.$defs![name]) {
      schema.$defs![name] = interfaceToSchema(iface, project);
    }
  }

  return schema;
}

function generateErrorsSchema(project: Project): JsonSchema {
  const schema: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from types/errors.ts — do not edit',
    $id: 'https://microsoft.github.io/agent-host-protocol/schema/errors.schema.json',
    title: 'AHP Error Codes',
    description: 'Error codes used in the Agent Host Protocol.',
    $defs: {
      JsonRpcErrorCode: {
        description: 'Standard JSON-RPC 2.0 error codes.',
        type: 'number',
        enum: [-32700, -32600, -32601, -32602, -32603],
      },
      AhpErrorCode: {
        description: 'AHP application-specific error codes.',
        type: 'number',
        enum: [-32001, -32002, -32003, -32004, -32005, -32006, -32007, -32008, -32009, -32010],
      },
    },
  };

  // Add error detail interfaces (e.g. AuthRequiredErrorData, PermissionDeniedErrorData)
  const errorIfaces = collectInterfacesFromFile(project, 'errors.ts');
  for (const [name, iface] of errorIfaces) {
    schema.$defs![name] = interfaceToSchema(iface, project);
  }

  // Add referenced types from state.ts and commands.ts so the error detail
  // schemas are self-contained.
  for (const file of ['state.ts', 'commands.ts']) {
    const ifaces = collectInterfacesFromFile(project, file);
    for (const [name, iface] of ifaces) {
      if (!schema.$defs![name]) {
        schema.$defs![name] = interfaceToSchema(iface, project);
      }
    }
  }

  return schema;
}

// ─── Transitive $def resolution ──────────────────────────────────────────────

// Collect every `#/$defs/<name>` reference target reachable in a schema node.
function collectRefTargets(node: JsonSchema | undefined, acc: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (node.$ref) {
    const m = node.$ref.match(/^#\/\$defs\/(.+)$/);
    if (m) acc.add(m[1]);
  }
  if (node.items) collectRefTargets(node.items, acc);
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    collectRefTargets(node.additionalProperties as JsonSchema, acc);
  }
  if (node.properties) {
    for (const key of Object.keys(node.properties)) collectRefTargets(node.properties[key], acc);
  }
  if (node.$defs) {
    for (const key of Object.keys(node.$defs)) collectRefTargets(node.$defs[key], acc);
  }
  for (const branch of [node.oneOf, node.anyOf]) {
    if (branch) for (const b of branch) collectRefTargets(b, acc);
  }
}

// Resolve a referenced type name to its schema, searching interfaces, type
// aliases, and enums (in that order). Returns undefined for names that resolve
// to none of the above (left for the caller to surface).
function buildDefForName(project: Project, name: string): JsonSchema | undefined {
  const iface = findInterface(project, name);
  if (iface) return interfaceToSchema(iface, project);

  const ta = findTypeAlias(project, name);
  if (ta) {
    const typeText = ta.getTypeNode()?.getText() || '';
    const schema = typeTextToSchema(typeText, project);
    const rawDesc = ta.getJsDocs()[0]?.getDescription();
    const desc = rawDesc ? normalizeDescription(rawDesc) : '';
    if (desc && !schema.description) schema.description = desc;
    return schema;
  }

  const en = findEnum(project, name);
  if (en) return enumToSchema(en);

  return undefined;
}

// Walk a fully-built schema and backfill any `$def` that is referenced but not
// yet defined — enums, type aliases (including `URI = string`), and interfaces
// living in source files the per-schema generator did not eagerly inline. Runs
// to a fixpoint because a newly-added `$def` can itself reference further types.
// This is what keeps every generated schema self-contained (no dangling `$ref`).
function resolveMissingDefs(schema: JsonSchema, project: Project): void {
  schema.$defs = schema.$defs || {};
  const unresolved = new Set<string>();
  for (;;) {
    const refs = new Set<string>();
    collectRefTargets(schema, refs);
    let added = false;
    for (const name of refs) {
      if (schema.$defs[name] || unresolved.has(name)) continue;
      const def = buildDefForName(project, name);
      if (def) {
        schema.$defs[name] = def;
        added = true;
      } else {
        unresolved.add(name);
      }
    }
    if (!added) break;
  }
  if (unresolved.size > 0) {
    throw new Error(
      `generate-json-schema: unresolved $ref target(s) with no interface/alias/enum: ` +
        `${[...unresolved].sort().join(', ')}`,
    );
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generateJsonSchemas(project: Project, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });

  const schemas: Array<{ filename: string; generator: (project: Project) => JsonSchema }> = [
    { filename: 'state.schema.json', generator: generateStateSchema },
    { filename: 'actions.schema.json', generator: generateActionsSchema },
    { filename: 'commands.schema.json', generator: generateCommandsSchema },
    { filename: 'notifications.schema.json', generator: generateNotificationsSchema },
    { filename: 'errors.schema.json', generator: generateErrorsSchema },
  ];

  for (const { filename, generator } of schemas) {
    const schema = generator(project);
    resolveMissingDefs(schema, project);
    fs.writeFileSync(
      path.join(outDir, filename),
      JSON.stringify(schema, null, 2) + '\n',
      'utf-8',
    );
    console.log(`  • ${filename}`);
  }
}
