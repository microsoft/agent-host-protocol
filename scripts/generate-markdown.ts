/**
 * Markdown Generator — Generates VitePress-compatible reference markdown from
 * TypeScript type definitions parsed via ts-morph.
 *
 * Emits one page per channel (common, root, session, terminal, changeset)
 * plus error-codes and a flat messages overview. Each per-channel page has
 * sections in this fixed order, only emitting sections with content:
 *
 * 1. State Types  — interfaces, type aliases, and const enums declared in
 *    the channel's `state.ts` (plus a few cross-cutting types on the common
 *    page).
 * 2. Actions      — interfaces and type aliases declared in `actions.ts`.
 * 3. Commands     — every `*Params` interface in `commands.ts` whose method
 *    appears in `CommandMap` (or carries a `@method` JSDoc tag).
 * 4. Notifications — every `*Params` interface in `notifications.ts` that
 *    appears in `ServerNotificationMap`.
 */

import {
  Project,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  PropertySignature,
  VariableDeclaration,
  SourceFile,
  Node,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { findProtocolSourceFiles } from './find-protocol-sources.js';

const GENERATED_HEADER = '<!-- Generated from types/*.ts — do not edit -->\n\n';

const GITHUB_REF = process.env.GITHUB_SHA || 'main';
const GITHUB_BASE = `https://github.com/microsoft/agent-host-protocol/blob/${GITHUB_REF}`;
const SCHEMA_BASE = '/agent-host-protocol/schema';

function schemaLink(schemaFile: string): string {
  return `<a href="${SCHEMA_BASE}/${schemaFile}" target="_blank">JSON Schema: <code>${schemaFile}</code></a>\n`;
}

// ─── Type → Page Mapping ─────────────────────────────────────────────────────

/**
 * Maps a canonical source directory (under `types/`) to the doc page slug.
 * Used to build cross-page anchor links so a type declared in
 * `channels-session/state.ts` becomes `/reference/session#sessionstate`.
 */
const DIR_TO_PAGE: Record<string, string> = {
  'common': 'common',
  'channels-root': 'root',
  'channels-session': 'session',
  'channels-terminal': 'terminal',
  'channels-changeset': 'changeset',
};

/**
 * Files whose contained types should resolve to a non-default page. By
 * default a file's types are linked to its directory's page; entries here
 * override that (e.g. types in `common/errors.ts` link to
 * `/reference/error-codes` rather than `/reference/common`).
 */
const BASENAME_PAGE_OVERRIDE: Record<string, string> = {
  'errors.ts': 'error-codes',
};

/** Set of every known declared type name (for cross-link detection). */
let knownTypes = new Set<string>();

/** Maps each known type name to the doc page slug where it's defined. */
const typeToPage: Record<string, string> = {};

/** The page currently being generated; same-page links omit the slug. */
let currentPage = '';

/** Built lazily from `knownTypes`, longest-name-first so prefixes don't shadow. */
let knownTypesRegex: RegExp | null = null;

function isCanonicalSourceFile(sf: SourceFile): boolean {
  const dir = path.basename(path.dirname(sf.getFilePath()));
  return dir in DIR_TO_PAGE;
}

function pageForSourceFile(sf: SourceFile): string | undefined {
  const dir = path.basename(path.dirname(sf.getFilePath()));
  const dirPage = DIR_TO_PAGE[dir];
  if (!dirPage) return undefined;
  const baseName = sf.getBaseName();
  return BASENAME_PAGE_OVERRIDE[baseName] ?? dirPage;
}

function populateKnownTypes(project: Project): void {
  knownTypes = new Set<string>();
  for (const key of Object.keys(typeToPage)) delete typeToPage[key];

  for (const sf of project.getSourceFiles()) {
    if (!isCanonicalSourceFile(sf)) continue;
    const page = pageForSourceFile(sf);
    if (!page) continue;
    for (const iface of sf.getInterfaces()) {
      const name = iface.getName();
      knownTypes.add(name);
      typeToPage[name] = page;
    }
    for (const ta of sf.getTypeAliases()) {
      const name = ta.getName();
      knownTypes.add(name);
      typeToPage[name] = page;
    }
    for (const en of sf.getEnums()) {
      const name = en.getName();
      knownTypes.add(name);
      typeToPage[name] = page;
    }
  }

  const sorted = Array.from(knownTypes).sort((a, b) => b.length - a.length);
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  knownTypesRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
}

function typeAnchor(name: string): string {
  return name.toLowerCase();
}

/**
 * VitePress slugifies headings like `\`root/sessionAdded\`` by lowercasing
 * and stripping non-alphanumerics. Mirror that here so cross-links land on
 * the right anchor for notification and namespaced command methods.
 */
function methodAnchor(method: string): string {
  return method.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function linkifyType(typeText: string): string {
  if (!knownTypesRegex) return typeText;
  return typeText.replace(knownTypesRegex, (match) => {
    const page = typeToPage[match];
    if (page && page !== currentPage) {
      return `[${match}](/reference/${page}#${typeAnchor(match)})`;
    }
    return `[${match}](#${typeAnchor(match)})`;
  });
}

// ─── Source Link & JSDoc Helpers ─────────────────────────────────────────────

type DocNode =
  | InterfaceDeclaration
  | TypeAliasDeclaration
  | EnumDeclaration
  | VariableDeclaration;

function renderHeading(name: string, _node: DocNode, level = 3): string {
  const hashes = '#'.repeat(level);
  return `${hashes} \`${name}\`\n`;
}

function getJsDocDescription(node: InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration): string {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) return '';
  return jsDocs[0].getDescription().trim();
}

function getJsDocTag(node: InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration, tagName: string): string | undefined {
  const jsDocs = node.getJsDocs();
  for (const doc of jsDocs) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === tagName) {
        return tag.getCommentText()?.trim();
      }
    }
  }
  return undefined;
}

function hasJsDocTag(node: InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration, tagName: string): boolean {
  return getJsDocTag(node, tagName) !== undefined;
}

function getJsDocExamples(node: InterfaceDeclaration | TypeAliasDeclaration): string[] {
  const examples: string[] = [];
  for (const doc of node.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === 'example') {
        const text = tag.getCommentText()?.trim();
        if (text) examples.push(text);
      }
    }
  }
  return examples;
}

function getPropertyDescription(prop: PropertySignature): string {
  const jsDocs = prop.getJsDocs();
  if (jsDocs.length === 0) return '';
  return jsDocs[0].getDescription().trim();
}

function getPropertyType(prop: PropertySignature): string {
  const typeNode = prop.getTypeNode();
  if (typeNode) return typeNode.getText();
  return prop.getType().getText(prop);
}

function isOptional(prop: PropertySignature): boolean {
  return prop.hasQuestionToken();
}

function formatType(typeText: string): string {
  return typeText
    .replace(/import\([^)]+\)\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*\|\s*/, '')
    .trim();
}

/** Strip JSDoc-style block comments (`/** ... *\/`) from a type text. */
function stripJsDocBlocks(text: string): string {
  return text.replace(/\/\*\*[\s\S]*?\*\//g, '');
}

/**
 * Pretty-print a TypeScript type that contains nested object literals into
 * multi-line form with brace-depth indentation. Used for inline anonymous
 * object types (e.g. `FileEdit.before`) that would otherwise be unreadable
 * crammed into a single cell.
 */
function prettyPrintNestedType(typeText: string): string {
  const stripped = stripJsDocBlocks(typeText).replace(/\s+/g, ' ').trim();
  let out = '';
  let depth = 0;
  const indent = (n: number) => '  '.repeat(n);

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '{') {
      out += '{\n' + indent(++depth);
      // Skip any whitespace immediately after the brace so we don't
      // double-indent the first property.
      while (i + 1 < stripped.length && stripped[i + 1] === ' ') i++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      out = out.replace(/[ \t]+$/, '');
      if (!out.endsWith('\n')) out += '\n';
      out += indent(depth) + '}';
    } else if (ch === ';' || ch === ',') {
      out += ch;
      let j = i + 1;
      while (j < stripped.length && stripped[j] === ' ') j++;
      if (j < stripped.length && stripped[j] !== '}') {
        out += '\n' + indent(depth);
        i = j - 1;
      }
    } else {
      out += ch;
    }
  }
  return out.trim();
}

/** HTML-escape `&`, `<`, `>` (and nothing else). */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Like {@link linkifyType} but emits HTML `<a>` tags. Used inside `<pre>`
 * blocks where markdown link syntax wouldn't be processed.
 */
function linkifyTypeAsHtml(typeText: string): string {
  const escaped = escapeHtml(typeText);
  if (!knownTypesRegex) return escaped;
  return escaped.replace(knownTypesRegex, (match) => {
    const page = typeToPage[match];
    const href = page && page !== currentPage
      ? `/reference/${page}#${typeAnchor(match)}`
      : `#${typeAnchor(match)}`;
    return `<a href="${href}">${match}</a>`;
  });
}

function escapeMarkdown(text: string): string {
  return text
    // Collapse paragraph breaks (blank lines) to a `<br><br>` so the cell
    // keeps visual separation without spilling onto a new markdown row.
    .replace(/\r?\n\s*\r?\n+/g, '<br><br>')
    // Soft-wrap newlines become a single space so a multi-line JSDoc
    // description renders on one logical line inside the table.
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Un-escape the `<br>` separators we introduced above (they're literal
    // HTML, not user content).
    .replace(/&lt;br&gt;/g, '<br>');
}

function escapeTypeForTable(typeText: string): string {
  const stripped = stripJsDocBlocks(typeText);
  // Nested object literal (anonymous record) → pretty-print into a `<pre>`
  // code block so the structure is readable inside a one-line table cell.
  // Cross-references are emitted as HTML `<a>` tags (markdown link syntax
  // isn't processed inside `<pre>` blocks).
  if (stripped.includes('{')) {
    const pretty = prettyPrintNestedType(stripped);
    const html = linkifyTypeAsHtml(pretty).replace(/\n/g, '&#10;');
    return `<pre><code class="language-ts">${html}</code></pre>`;
  }
  const formatted = formatType(stripped).replace(/\|/g, '\\|');
  const linked = linkifyType(formatted);
  if (linked !== formatted) {
    // Has markdown links → can't wrap the cell in backticks. Escape any
    // remaining `<`/`>` (e.g. inside `Record<string, X>`) as HTML entities so
    // Vue's template parser doesn't treat them as unclosed HTML tags.
    return linked.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  return '`' + formatted + '`';
}

// ─── Table Rendering ─────────────────────────────────────────────────────────

interface TableRow {
  field: string;
  type: string;
  required?: string;
  description: string;
}

function renderTable(rows: TableRow[], includeRequired: boolean): string {
  const lines: string[] = [];
  if (includeRequired) {
    lines.push('| Field | Type | Required | Description |');
    lines.push('|---|---|---|---|');
    for (const row of rows) {
      lines.push(`| \`${row.field}\` | ${escapeTypeForTable(row.type)} | ${row.required || 'Yes'} | ${escapeMarkdown(row.description)} |`);
    }
  } else {
    lines.push('| Field | Type | Description |');
    lines.push('|---|---|---|');
    for (const row of rows) {
      lines.push(`| \`${row.field}\` | ${escapeTypeForTable(row.type)} | ${escapeMarkdown(row.description)} |`);
    }
  }
  return lines.join('\n');
}

function interfaceToRows(iface: InterfaceDeclaration): TableRow[] {
  return iface.getProperties().map((prop) => {
    const name = prop.getName();
    const typeText = getPropertyType(prop);
    let description = getPropertyDescription(prop);
    if (!description && (name === 'type' || name === 'kind') && typeText.startsWith("'")) {
      description = 'Discriminant';
    }
    return {
      field: name,
      type: typeText,
      required: isOptional(prop) ? 'No' : 'Yes',
      description,
    };
  });
}

function hasOptionalProperties(iface: InterfaceDeclaration): boolean {
  return iface.getProperties().some((p) => isOptional(p));
}

function renderInterfaceTable(iface: InterfaceDeclaration): string {
  const rows = interfaceToRows(iface);
  const showRequired = hasOptionalProperties(iface);
  return renderTable(rows, showRequired);
}

function renderInterfaceBlock(iface: InterfaceDeclaration): string {
  const lines: string[] = [];
  lines.push(renderHeading(iface.getName(), iface));
  const desc = getJsDocDescription(iface);
  if (desc) lines.push(desc + '\n');
  if (iface.getProperties().length > 0) {
    lines.push(renderInterfaceTable(iface) + '\n');
  }
  return lines.join('\n');
}

/**
 * Render a type alias as a heading + its definition. String-literal unions
 * become a single backticked line; unions over interfaces are linkified so
 * the constituents become clickable cross-references.
 */
function renderTypeAliasBlock(ta: TypeAliasDeclaration): string {
  const lines: string[] = [];
  const name = ta.getName();
  const desc = getJsDocDescription(ta);
  const typeText = formatType(ta.getTypeNode()?.getText() || '');
  lines.push(renderHeading(name, ta));
  if (desc) lines.push(desc + '\n');
  const linkedType = linkifyType(typeText);
  if (linkedType.includes('[')) {
    // Linkified — angle brackets inside the original type (e.g. `Record<string, X>`)
    // would otherwise be parsed as unclosed HTML tags by Vue's template
    // compiler. Escape them as HTML entities.
    lines.push(linkedType.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '\n');
  } else {
    lines.push(`\`${typeText}\`\n`);
  }
  return lines.join('\n');
}

/**
 * Render a const enum as a heading + a `Member | Value` table. Each member's
 * leading JSDoc (`/** ... *\/`) becomes the description.
 */
function renderEnumBlock(en: EnumDeclaration): string {
  const lines: string[] = [];
  lines.push(renderHeading(en.getName(), en));
  const desc = getJsDocDescription(en);
  if (desc) lines.push(desc + '\n');
  const members = en.getMembers();
  if (members.length === 0) return lines.join('\n');
  const showDesc = members.some((m) => m.getJsDocs().length > 0);
  if (showDesc) {
    lines.push('| Member | Value | Description |');
    lines.push('|---|---|---|');
  } else {
    lines.push('| Member | Value |');
    lines.push('|---|---|');
  }
  for (const member of members) {
    const name = member.getName();
    const initText = member.getInitializer()?.getText() ?? '';
    // Escape pipes inside the value text so they don't terminate the table column
    const escapedInit = initText.replace(/\|/g, '\\|');
    const value = initText.length > 0 ? `\`${escapedInit}\`` : '';
    if (showDesc) {
      const memberDesc = member.getJsDocs()[0]?.getDescription().trim() ?? '';
      lines.push(`| \`${name}\` | ${value} | ${escapeMarkdown(memberDesc)} |`);
    } else {
      lines.push(`| \`${name}\` | ${value} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Source File Lookup ──────────────────────────────────────────────────────

function findChannelSourceFile(project: Project, dirName: string, baseName: string): SourceFile | undefined {
  for (const sf of project.getSourceFiles()) {
    if (sf.getBaseName() !== baseName) continue;
    const dir = path.basename(path.dirname(sf.getFilePath()));
    if (dir === dirName) return sf;
  }
  return undefined;
}

function getInterfaceMaybe(project: Project, name: string): InterfaceDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    if (!isCanonicalSourceFile(sf)) continue;
    const iface = sf.getInterface(name);
    if (iface) return iface;
  }
  return undefined;
}

// ─── Registry Parsing ────────────────────────────────────────────────────────

interface RegistryEntry {
  /** JSON-RPC method name as it appears on the wire. */
  method: string;
  /** Identifier of the params interface (or full type text if it's not a bare reference). */
  paramsType: string;
  /** Identifier or text of the result type; `null` for notifications. */
  resultType: string | null;
}

/**
 * Parse a registry interface like `CommandMap` whose members each carry an
 * inline `{ params: X; result: Y }` type literal. Used to derive the wire
 * method ↔ params/result type mappings without duplicating them in tables.
 */
function parseRegistryInterface(project: Project, ifaceName: string, hasResult: boolean): RegistryEntry[] {
  const iface = getInterfaceMaybe(project, ifaceName);
  if (!iface) return [];
  const entries: RegistryEntry[] = [];
  for (const prop of iface.getProperties()) {
    const rawName = prop.getName();
    const method = rawName.replace(/^['"`]|['"`]$/g, '');
    const typeNode = prop.getTypeNode();
    if (!typeNode || !Node.isTypeLiteral(typeNode)) continue;
    let paramsType = '';
    let resultType: string | null = null;
    for (const member of typeNode.getMembers()) {
      if (!Node.isPropertySignature(member)) continue;
      const memberName = member.getName();
      const memberTypeText = member.getTypeNode()?.getText() ?? '';
      if (memberName === 'params') paramsType = memberTypeText;
      else if (memberName === 'result') resultType = memberTypeText;
    }
    if (paramsType) entries.push({ method, paramsType, resultType: hasResult ? resultType : null });
  }
  return entries;
}

// ─── Section Emitters ────────────────────────────────────────────────────────

/**
 * Emit a "State Types" section: every interface, type alias, and const enum
 * declared in the given source files, in declaration order, with cross-links
 * to other channel pages.
 */
function emitStateTypesSection(sourceFiles: SourceFile[]): string {
  const lines: string[] = [];
  for (const sf of sourceFiles) {
    for (const stmt of sf.getStatements()) {
      if (Node.isInterfaceDeclaration(stmt) && stmt.isExported()) {
        lines.push(renderInterfaceBlock(stmt));
      } else if (Node.isTypeAliasDeclaration(stmt) && stmt.isExported()) {
        lines.push(renderTypeAliasBlock(stmt));
      } else if (Node.isEnumDeclaration(stmt) && stmt.isExported()) {
        lines.push(renderEnumBlock(stmt));
      }
    }
  }
  return lines.join('\n');
}

/**
 * Emit an "Actions" section: every exported interface or type alias whose
 * name ends in `Action`. Each action is rendered with its action-type
 * discriminant value, a "Client-dispatchable" marker (if `@clientDispatchable`
 * is set), and a fields table.
 */
function emitActionsSection(sourceFiles: SourceFile[]): string {
  const lines: string[] = [];
  for (const sf of sourceFiles) {
    for (const stmt of sf.getStatements()) {
      if (Node.isInterfaceDeclaration(stmt) && stmt.isExported() && stmt.getName().endsWith('Action')) {
        lines.push(renderActionInterfaceBlock(stmt));
      } else if (Node.isTypeAliasDeclaration(stmt) && stmt.isExported() && stmt.getName().endsWith('Action')) {
        lines.push(renderTypeAliasBlock(stmt));
      }
    }
  }
  return lines.join('\n');
}

function renderActionInterfaceBlock(iface: InterfaceDeclaration): string {
  const lines: string[] = [];
  const name = iface.getName();
  const typeValue = getActionTypeValue(iface);
  // Disambiguate variants that share an ActionType discriminant (e.g.
  // `SessionToolCallApprovedAction` and `SessionToolCallDeniedAction` both
  // use `session/toolCallConfirmed`). Append `(approved)` / `(denied)` when
  // an `approved: true|false` literal is present on the interface.
  const approvedProp = iface.getProperty('approved');
  const approvedType = approvedProp?.getTypeNode()?.getText().trim();
  const variantSuffix =
    approvedType === 'true' ? ' (approved)'
    : approvedType === 'false' ? ' (denied)'
    : '';
  const labelBase = typeValue ?? name;
  // Emit an explicit anchor matching the interface name so cross-links from
  // other pages (e.g. references to `SessionToolCallApprovedAction` in union
  // types) resolve, even when the heading text differs from the type name.
  if (typeValue && labelBase !== name) {
    lines.push(`<a id="${name.toLowerCase()}"></a>\n`);
  }
  const heading = `### \`${labelBase}${variantSuffix}\``;
  lines.push(heading + '\n');
  const isClientDispatchable = hasJsDocTag(iface, 'clientDispatchable');
  const desc = getJsDocDescription(iface);
  const prefix = isClientDispatchable ? '**Client-dispatchable.** ' : '';
  if (desc || isClientDispatchable) lines.push(prefix + desc + '\n');
  if (iface.getProperties().length > 0) {
    lines.push(renderInterfaceTable(iface) + '\n');
  }
  return lines.join('\n');
}

/**
 * Extract the action's wire-level `type` value from a `type: ActionType.Foo`
 * property signature. Returns `undefined` for action interfaces whose type
 * isn't a simple enum reference (such as discriminated-union variants
 * `SessionToolCallApprovedAction` / `SessionToolCallDeniedAction` which both
 * use `ActionType.SessionToolCallConfirmed`; their interface name is shown
 * instead).
 */
function getActionTypeValue(iface: InterfaceDeclaration): string | undefined {
  const typeProp = iface.getProperty('type');
  if (!typeProp) return undefined;
  const typeText = typeProp.getTypeNode()?.getText() ?? '';
  // Expect `ActionType.Foo` — map to the enum member's value.
  const match = typeText.match(/^ActionType\.(\w+)$/);
  if (!match) return undefined;
  const memberName = match[1];
  const sf = iface.getSourceFile().getProject().getSourceFiles();
  for (const file of sf) {
    const en = file.getEnum('ActionType');
    if (!en) continue;
    const member = en.getMember(memberName);
    if (!member) continue;
    const initText = member.getInitializer()?.getText();
    if (initText) return initText.replace(/^['"`]|['"`]$/g, '');
  }
  return undefined;
}

/**
 * Emit a "Commands" section: every exported `*Params` interface in the given
 * source files whose method name appears in `CommandMap` (or whose JSDoc
 * carries `@method`). Each entry renders the direction/type, parameters
 * table, and a result table looked up from the registry.
 */
function emitCommandsSection(project: Project, sourceFiles: SourceFile[]): string {
  const commandMap = parseRegistryInterface(project, 'CommandMap', true);
  const methodByParams = new Map<string, RegistryEntry>();
  for (const entry of commandMap) methodByParams.set(entry.paramsType, entry);

  // Client → Server notification methods that also live in commands.ts
  // (subscribe/unsubscribe/dispatchAction). They have no result.
  const clientNotificationMap = parseRegistryInterface(project, 'ClientNotificationMap', false);
  for (const entry of clientNotificationMap) {
    if (!methodByParams.has(entry.paramsType)) methodByParams.set(entry.paramsType, entry);
  }

  const lines: string[] = [];
  for (const sf of sourceFiles) {
    for (const stmt of sf.getStatements()) {
      if (!Node.isInterfaceDeclaration(stmt) || !stmt.isExported()) continue;
      const name = stmt.getName();
      const entry = methodByParams.get(name);
      // Fallback: any *Params interface with a @method tag we missed.
      if (!entry) {
        if (!name.endsWith('Params')) continue;
        const method = getJsDocTag(stmt, 'method');
        if (!method) continue;
        lines.push(emitCommandBlock(project, { method, paramsType: name, resultType: null }, stmt));
        continue;
      }
      lines.push(emitCommandBlock(project, entry, stmt));
    }
  }
  return lines.join('\n');
}

function emitCommandBlock(project: Project, entry: RegistryEntry, paramsIface: InterfaceDeclaration): string {
  const lines: string[] = [];
  const desc = getJsDocDescription(paramsIface);
  const direction = getJsDocTag(paramsIface, 'direction') || 'Client → Server';
  const messageType = getJsDocTag(paramsIface, 'messageType') || 'Request';

  lines.push(`## \`${entry.method}\`\n`);
  if (desc) lines.push(desc + '\n');
  lines.push('| Property | Value |');
  lines.push('|---|---|');
  lines.push(`| Direction | ${direction} |`);
  lines.push(`| Type | ${messageType} |\n`);

  lines.push('**Parameters:**\n');
  if (paramsIface.getProperties().length > 0) {
    lines.push(renderInterfaceTable(paramsIface) + '\n');
  } else {
    lines.push('_No parameters._\n');
  }

  // Result handling
  if (entry.method === 'reconnect') {
    const replay = getInterfaceMaybe(project, 'ReconnectReplayResult');
    const snapshot = getInterfaceMaybe(project, 'ReconnectSnapshotResult');
    if (replay) {
      lines.push('**Result (replay):** When the server can replay from the requested sequence:\n');
      lines.push(renderInterfaceTable(replay) + '\n');
    }
    if (snapshot) {
      lines.push('**Result (snapshot):** When the gap exceeds the replay buffer:\n');
      lines.push(renderInterfaceTable(snapshot) + '\n');
    }
  } else if (entry.resultType) {
    const t = entry.resultType.trim();
    if (t === 'null') {
      lines.push('**Result:** `null` on success.\n');
    } else {
      const resultIface = getInterfaceMaybe(project, t);
      if (resultIface) {
        lines.push('**Result:**\n');
        if (resultIface.getProperties().length > 0) {
          lines.push(renderInterfaceTable(resultIface) + '\n');
        } else {
          lines.push('_(empty object)_\n');
        }
      } else {
        // Fallback: render type as code
        lines.push(`**Result:** ${escapeTypeForTable(t)}\n`);
      }
    }
  } else if (messageType !== 'Notification') {
    lines.push('**Result:** `null` on success.\n');
  }

  // @see link
  const seeTag = getJsDocTag(paramsIface, 'see');
  if (seeTag) {
    const seeMatch = seeTag.match(/\{@link\s+([^|}]+)(?:\|([^}]+))?\}/);
    if (seeMatch) {
      const target = seeMatch[1].trim();
      const label = (seeMatch[2] ?? target).trim();
      lines.push(`See [${label}](${target}) for details.\n`);
    }
  }

  // @example blocks
  const examples = getJsDocExamples(paramsIface);
  for (const example of examples) {
    lines.push('**Example:**\n');
    lines.push(example + '\n');
  }

  lines.push('---\n');
  return lines.join('\n');
}

/**
 * Emit a "Notifications" section: every exported `*Params` interface in the
 * given source files whose method name appears in `ServerNotificationMap`.
 * Each entry renders the direction/type, fields table, and any `@example`
 * blocks attached to the params interface.
 */
function emitNotificationsSection(project: Project, sourceFiles: SourceFile[]): string {
  const serverNotifMap = parseRegistryInterface(project, 'ServerNotificationMap', false);
  const methodByParams = new Map<string, RegistryEntry>();
  for (const entry of serverNotifMap) methodByParams.set(entry.paramsType, entry);

  const lines: string[] = [];
  for (const sf of sourceFiles) {
    for (const stmt of sf.getStatements()) {
      if (!Node.isInterfaceDeclaration(stmt) || !stmt.isExported()) continue;
      const name = stmt.getName();
      const entry = methodByParams.get(name);
      if (!entry) continue;
      lines.push(emitNotificationBlock(entry, stmt));
    }
  }
  return lines.join('\n');
}

function emitNotificationBlock(entry: RegistryEntry, paramsIface: InterfaceDeclaration): string {
  const lines: string[] = [];
  const desc = getJsDocDescription(paramsIface);
  const direction = getJsDocTag(paramsIface, 'direction') || 'Server → Client';
  const messageType = getJsDocTag(paramsIface, 'messageType') || 'Notification';

  lines.push(`### \`${entry.method}\`\n`);
  if (desc) lines.push(desc + '\n');
  lines.push('| Property | Value |');
  lines.push('|---|---|');
  lines.push(`| Direction | ${direction} |`);
  lines.push(`| Type | ${messageType} |\n`);

  if (paramsIface.getProperties().length > 0) {
    lines.push('**Parameters:**\n');
    lines.push(renderInterfaceTable(paramsIface) + '\n');
  }

  for (const example of getJsDocExamples(paramsIface)) {
    lines.push('**Example:**\n');
    lines.push(example + '\n');
  }
  return lines.join('\n');
}

/**
 * Render a single interface as a code-fenced TypeScript block. Used on the
 * common page for the JSON-RPC wire-type registries (`CommandMap`,
 * `ServerCommandMap`, `ClientNotificationMap`, `ServerNotificationMap`)
 * where the literal definition is the most useful documentation form.
 */
function renderInterfaceCodeBlock(iface: InterfaceDeclaration): string {
  const lines: string[] = [];
  lines.push(renderHeading(iface.getName(), iface));
  const desc = getJsDocDescription(iface);
  if (desc) lines.push(desc + '\n');
  lines.push('```ts');
  lines.push(iface.getText());
  lines.push('```\n');
  return lines.join('\n');
}

// ─── Per-Channel Page Generators ─────────────────────────────────────────────

function generateCommonPage(project: Project): string {
  currentPage = 'common';
  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Common Types\n');
  lines.push('Cross-cutting type definitions shared across every channel of the Agent Host Protocol — primitive aliases, action envelopes, base command shapes, the cross-channel `auth/required` notification, and the JSON-RPC wire types.\n');
  lines.push(schemaLink('state.schema.json'));

  const stateSf = findChannelSourceFile(project, 'common', 'state.ts');
  const actionsSf = findChannelSourceFile(project, 'common', 'actions.ts');
  const commandsSf = findChannelSourceFile(project, 'common', 'commands.ts');
  const notificationsSf = findChannelSourceFile(project, 'common', 'notifications.ts');
  const messagesSf = findChannelSourceFile(project, 'common', 'messages.ts');

  // ─── State Types ────────────────────────────────────────────────────────
  const stateFiles: SourceFile[] = [];
  if (stateSf) stateFiles.push(stateSf);
  if (stateFiles.length > 0) {
    lines.push('## State Types\n');
    lines.push(emitStateTypesSection(stateFiles));
  }

  // ─── Action Envelope & Discriminant Enum ────────────────────────────────
  if (actionsSf) {
    lines.push('## Action Envelope\n');
    lines.push('Every state-mutating message is wrapped in an `ActionEnvelope` and routed by its `channel` field. The full discriminated union of action payloads is `StateAction`; individual action variants are documented on the per-channel pages.\n');
    for (const name of ['ActionType', 'ActionOrigin', 'ActionEnvelope', 'StateAction']) {
      const iface = actionsSf.getInterface(name);
      if (iface) { lines.push(renderInterfaceBlock(iface)); continue; }
      const ta = actionsSf.getTypeAlias(name);
      if (ta) { lines.push(renderTypeAliasBlock(ta)); continue; }
      const en = actionsSf.getEnum(name);
      if (en) { lines.push(renderEnumBlock(en)); }
    }
  }

  // ─── Base Params ────────────────────────────────────────────────────────
  if (commandsSf) {
    const baseParams = commandsSf.getInterface('BaseParams');
    if (baseParams) {
      lines.push('## Base Parameters\n');
      lines.push('Every command\'s `params` object extends `BaseParams`, ensuring a top-level `channel: URI` is always present.\n');
      lines.push(renderInterfaceBlock(baseParams));
    }
  }

  // ─── Commands ───────────────────────────────────────────────────────────
  if (commandsSf) {
    lines.push('## Commands\n');
    lines.push('Cross-channel commands and notifications. Channel-specific commands (`createSession`, `listSessions`, `createTerminal`, `invokeChangesetOperation`, etc.) live on the corresponding channel page.\n');
    lines.push(schemaLink('commands.schema.json'));
    lines.push(emitCommandsSection(project, [commandsSf]));
  }

  // ─── Notifications ──────────────────────────────────────────────────────
  if (notificationsSf) {
    lines.push('## Notifications\n');
    lines.push('Notifications are ephemeral broadcasts and are **not** part of the state tree. They are not processed by reducers and are not replayed on reconnection. Every notification carries a top-level `channel: URI` identifying the subscription it belongs to.\n');
    lines.push(schemaLink('notifications.schema.json'));
    lines.push(emitNotificationsSection(project, [notificationsSf]));
  }

  // ─── JSON-RPC Wire Types ────────────────────────────────────────────────
  if (messagesSf) {
    lines.push('## JSON-RPC Wire Types\n');
    lines.push('Base JSON-RPC message shapes and the typed registries that drive the discriminated-union wrappers (`AhpRequest`, `AhpResponse`, `AhpClientNotification`, `AhpServerNotification`, `AhpNotification`, `ProtocolMessage`).\n');
    for (const name of ['JsonRpcRequest', 'JsonRpcSuccessResponse', 'JsonRpcErrorResponse', 'JsonRpcNotification', 'AhpErrorResponse']) {
      const iface = messagesSf.getInterface(name);
      if (iface) lines.push(renderInterfaceBlock(iface));
    }
    lines.push('### Registries\n');
    lines.push('The discriminated-union wrappers are parameterised over these registry interfaces. Each property is a JSON-RPC method name; each value is a `{ params; result? }` type literal.\n');
    for (const name of ['CommandMap', 'ServerCommandMap', 'ClientNotificationMap', 'ServerNotificationMap']) {
      const iface = messagesSf.getInterface(name);
      if (iface) lines.push(renderInterfaceCodeBlock(iface));
    }
    lines.push('### Typed Wrappers\n');
    for (const name of [
      'AhpRequest', 'AhpServerRequest',
      'AhpSuccessResponse', 'AhpResponse',
      'AhpServerSuccessResponse', 'AhpServerResponse',
      'AhpClientNotification', 'AhpServerNotification', 'AhpNotification',
      'ProtocolMessage',
    ]) {
      const ta = messagesSf.getTypeAlias(name);
      if (ta) lines.push(renderTypeAliasBlock(ta));
    }
  }

  return lines.join('\n');
}

function generateRootChannelPage(project: Project): string {
  currentPage = 'root';
  const stateSf = findChannelSourceFile(project, 'channels-root', 'state.ts');
  const actionsSf = findChannelSourceFile(project, 'channels-root', 'actions.ts');
  const commandsSf = findChannelSourceFile(project, 'channels-root', 'commands.ts');
  const notificationsSf = findChannelSourceFile(project, 'channels-root', 'notifications.ts');

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Root Channel\n');
  lines.push('Reference for the `ahp-root://` channel — the single, host-wide channel every client subscribes to first. See [Root Channel specification](/specification/root-channel) for the wire-level overview.\n');
  lines.push(schemaLink('state.schema.json'));

  if (stateSf) {
    lines.push('## State Types\n');
    lines.push(emitStateTypesSection([stateSf]));
  }
  if (actionsSf) {
    lines.push('## Actions\n');
    lines.push('Mutate `RootState`. All root actions are server-only.\n');
    lines.push(schemaLink('actions.schema.json'));
    lines.push(emitActionsSection([actionsSf]));
  }
  if (commandsSf) {
    lines.push('## Commands\n');
    lines.push(schemaLink('commands.schema.json'));
    lines.push(emitCommandsSection(project, [commandsSf]));
  }
  if (notificationsSf) {
    lines.push('## Notifications\n');
    lines.push(schemaLink('notifications.schema.json'));
    lines.push(emitNotificationsSection(project, [notificationsSf]));
  }
  return lines.join('\n');
}

function generateSessionChannelPage(project: Project): string {
  currentPage = 'session';
  const stateSf = findChannelSourceFile(project, 'channels-session', 'state.ts');
  const actionsSf = findChannelSourceFile(project, 'channels-session', 'actions.ts');
  const commandsSf = findChannelSourceFile(project, 'channels-session', 'commands.ts');

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Session Channel\n');
  lines.push('Reference for the `ahp-session:/<uuid>` channel — per-session state, the turn lifecycle, tool-call state machine, attachments, pending messages, input requests, and per-session customizations. See [Session Channel specification](/specification/session-channel) for the wire-level overview.\n');
  lines.push(schemaLink('state.schema.json'));

  if (stateSf) {
    lines.push('## State Types\n');
    lines.push(emitStateTypesSection([stateSf]));
  }
  if (actionsSf) {
    lines.push('## Actions\n');
    lines.push('Mutate `SessionState`. Scoped to a session URI via the enclosing `ActionEnvelope.channel`.\n');
    lines.push(schemaLink('actions.schema.json'));
    lines.push(emitActionsSection([actionsSf]));
  }
  if (commandsSf) {
    lines.push('## Commands\n');
    lines.push(schemaLink('commands.schema.json'));
    lines.push(emitCommandsSection(project, [commandsSf]));
  }
  return lines.join('\n');
}

function generateTerminalChannelPage(project: Project): string {
  currentPage = 'terminal';
  const stateSf = findChannelSourceFile(project, 'channels-terminal', 'state.ts');
  const actionsSf = findChannelSourceFile(project, 'channels-terminal', 'actions.ts');
  const commandsSf = findChannelSourceFile(project, 'channels-terminal', 'commands.ts');

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Terminal Channel\n');
  lines.push('Reference for the `ahp-terminal:/<id>` channel — long-lived pseudo-terminals that can be attached to clients and/or sessions. See [Terminal Channel specification](/specification/terminal-channel) for the wire-level overview.\n');
  lines.push(schemaLink('state.schema.json'));

  if (stateSf) {
    lines.push('## State Types\n');
    lines.push(emitStateTypesSection([stateSf]));
  }
  if (actionsSf) {
    lines.push('## Actions\n');
    lines.push('Mutate `TerminalState`. Scoped to a terminal URI via the enclosing `ActionEnvelope.channel`.\n');
    lines.push(schemaLink('actions.schema.json'));
    lines.push(emitActionsSection([actionsSf]));
  }
  if (commandsSf) {
    lines.push('## Commands\n');
    lines.push(schemaLink('commands.schema.json'));
    lines.push(emitCommandsSection(project, [commandsSf]));
  }
  return lines.join('\n');
}

function generateChangesetChannelPage(project: Project): string {
  currentPage = 'changeset';
  const stateSf = findChannelSourceFile(project, 'channels-changeset', 'state.ts');
  const actionsSf = findChannelSourceFile(project, 'channels-changeset', 'actions.ts');
  const commandsSf = findChannelSourceFile(project, 'channels-changeset', 'commands.ts');

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Changeset Channel\n');
  lines.push('Reference for the `ahp-changeset:/<id>` channel — server-owned views of file changes (uncommitted, session-wide, per-turn, etc.) that clients can subscribe to and invoke operations on. See the [Changesets guide](/guide/changesets) for an overview of the model.\n');
  lines.push(schemaLink('state.schema.json'));

  if (stateSf) {
    lines.push('## State Types\n');
    lines.push(emitStateTypesSection([stateSf]));
  }
  if (actionsSf) {
    lines.push('## Actions\n');
    lines.push('Mutate `ChangesetState`. Scoped to a changeset URI via the enclosing `ActionEnvelope.channel`.\n');
    lines.push(schemaLink('actions.schema.json'));
    lines.push(emitActionsSection([actionsSf]));
  }
  if (commandsSf) {
    lines.push('## Commands\n');
    lines.push(schemaLink('commands.schema.json'));
    lines.push(emitCommandsSection(project, [commandsSf]));
  }
  return lines.join('\n');
}

// ─── Error Codes Page ────────────────────────────────────────────────────────

function generateErrorCodesPage(project: Project): string {
  currentPage = 'error-codes';
  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Error Codes\n');
  lines.push('AHP uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification) error codes. In addition to the standard JSON-RPC codes, AHP defines application-specific error codes in the `-32000` to `-32099` range.\n');
  lines.push(schemaLink('errors.schema.json'));

  const errorsFile = findProtocolSourceFiles(project, 'errors.ts').find((sf) =>
    path.basename(path.dirname(sf.getFilePath())) === 'common',
  );
  if (!errorsFile) throw new Error('common/errors.ts not found');

  // Standard JSON-RPC Codes
  lines.push('## Standard JSON-RPC Codes\n');
  lines.push('These codes are defined by the JSON-RPC 2.0 specification:\n');
  lines.push('| Code | Name | Description |');
  lines.push('|---|---|---|');
  const jsonRpcCodes: Array<{ code: number; name: string; description: string }> = [
    { code: -32700, name: 'Parse error', description: 'Invalid JSON' },
    { code: -32600, name: 'Invalid request', description: 'Not a valid JSON-RPC request' },
    { code: -32601, name: 'Method not found', description: 'Unknown method name' },
    { code: -32602, name: 'Invalid params', description: 'Invalid method parameters' },
    { code: -32603, name: 'Internal error', description: 'Unspecified server error' },
  ];
  for (const c of jsonRpcCodes) {
    lines.push(`| \`${c.code}\` | ${c.name} | ${c.description} |`);
  }
  lines.push('');

  // AHP Application Codes — extract from the source
  lines.push('## AHP Application Codes\n');
  lines.push('| Code | Name | Description |');
  lines.push('|---|---|---|');
  const ahpCodesVar = errorsFile.getVariableDeclaration('AhpErrorCodes');
  if (ahpCodesVar) {
    let initializer = ahpCodesVar.getInitializer();
    if (initializer && Node.isAsExpression(initializer)) {
      initializer = initializer.getExpression();
    }
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      for (const prop of initializer.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const name = prop.getName();
          const value = prop.getInitializer()?.getText();
          const fullText = prop.getFullText();
          let description = '';
          // Match single- or multi-line `/** ... */` JSDoc preceding the
          // property. Use `[\s\S]` so the body can span newlines.
          const commentMatch = fullText.match(/\/\*\*([\s\S]+?)\*\//);
          if (commentMatch) {
            description = commentMatch[1]
              .split('\n')
              .map((line) => line.replace(/^\s*\*\s?/, '').trim())
              .filter((line) => line.length > 0 && !line.startsWith('@'))
              .join(' ');
          }
          lines.push(`| \`${value}\` | \`${name}\` | ${description} |`);
        }
      }
    }
  }
  lines.push('');

  // Error Response Format
  lines.push('## Error Response Format\n');
  lines.push('All error responses follow the JSON-RPC 2.0 error format:\n');
  lines.push('```json');
  lines.push('{');
  lines.push('  "jsonrpc": "2.0",');
  lines.push('  "id": 1,');
  lines.push('  "error": {');
  lines.push('    "code": -32002,');
  lines.push('    "message": "No agent registered for provider \'unknown\'",');
  lines.push('    "data": {}');
  lines.push('  }');
  lines.push('}');
  lines.push('```\n');
  lines.push('The `data` field is OPTIONAL and MAY contain additional structured information about the error. Its shape is not defined by the protocol.\n');

  // Typed error-data shapes
  lines.push('## Typed Error Data\n');
  lines.push('A handful of error codes carry a typed `data` payload. The mapping is captured by `AhpErrorDetailsMap`; the typed `AhpError<C>` union narrows `data` based on the code.\n');
  for (const name of ['AuthRequiredErrorData', 'PermissionDeniedErrorData', 'UnsupportedProtocolVersionErrorData', 'AhpErrorDetailsMap']) {
    const iface = errorsFile.getInterface(name);
    if (iface) lines.push(renderInterfaceBlock(iface));
  }
  for (const name of ['AhpErrorCode', 'JsonRpcErrorCode', 'AhpErrorCodeWithData', 'AhpError']) {
    const ta = errorsFile.getTypeAlias(name);
    if (ta) lines.push(renderTypeAliasBlock(ta));
  }

  // Version Introduction
  lines.push('## Version Introduction\n');
  lines.push('All error codes listed above were introduced in protocol version **1**.\n');
  return lines.join('\n');
}

// ─── Messages Page ───────────────────────────────────────────────────────────

/**
 * Pick the channel doc page for a given JSON-RPC method by inspecting the
 * source file that declares its params type. Returns `undefined` if the
 * method has no params or its params type can't be located.
 */
function pageForMethod(project: Project, paramsType: string): string | undefined {
  const iface = getInterfaceMaybe(project, paramsType);
  if (!iface) return undefined;
  return pageForSourceFile(iface.getSourceFile());
}

function generateMessagesPage(project: Project): string {
  currentPage = 'messages';
  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Messages Reference\n');
  lines.push('Complete reference of every JSON-RPC method in the Agent Host Protocol, organized by direction and type. Each method links to the channel reference page that documents its parameters and result.\n');

  const commandMap = parseRegistryInterface(project, 'CommandMap', true);
  const serverCommandMap = parseRegistryInterface(project, 'ServerCommandMap', true);
  const clientNotifMap = parseRegistryInterface(project, 'ClientNotificationMap', false);
  const serverNotifMap = parseRegistryInterface(project, 'ServerNotificationMap', false);

  const refLink = (entry: RegistryEntry): string => {
    const page = pageForMethod(project, entry.paramsType);
    if (!page) return '_(no params)_';
    const channelLabel = page === 'common' ? 'Common'
      : page === 'root' ? 'Root Channel'
      : page === 'session' ? 'Session Channel'
      : page === 'terminal' ? 'Terminal Channel'
      : page === 'changeset' ? 'Changeset Channel'
      : page;
    return `[${channelLabel}](/reference/${page}#${methodAnchor(entry.method)})`;
  };

  const briefDescription = (entry: RegistryEntry): string => {
    const iface = getInterfaceMaybe(project, entry.paramsType);
    if (!iface) return '';
    const desc = getJsDocDescription(iface);
    if (!desc) return '';
    // First non-empty line, stripped of trailing punctuation.
    const firstLine = desc.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
    return firstLine.replace(/[.,;:]+$/, '');
  };

  lines.push('## Client → Server Requests\n');
  lines.push('Methods with an `id` that expect a response. Server-side handlers live on the channel page indicated in the Reference column.\n');
  lines.push('| Method | Description | Reference |');
  lines.push('|---|---|---|');
  for (const entry of commandMap) {
    lines.push(`| \`${entry.method}\` | ${escapeMarkdown(briefDescription(entry))} | ${refLink(entry)} |`);
  }
  lines.push('');

  if (clientNotifMap.length > 0) {
    lines.push('## Client → Server Notifications\n');
    lines.push('Methods with no `id` that expect no response. Every notification carries a top-level `channel: URI`.\n');
    lines.push('| Method | Description | Reference |');
    lines.push('|---|---|---|');
    for (const entry of clientNotifMap) {
      lines.push(`| \`${entry.method}\` | ${escapeMarkdown(briefDescription(entry))} | ${refLink(entry)} |`);
    }
    lines.push('');
  }

  if (serverCommandMap.length > 0) {
    lines.push('## Server → Client Requests\n');
    lines.push('Methods initiated by the server that the client must respond to.\n');
    lines.push('| Method | Description | Reference |');
    lines.push('|---|---|---|');
    for (const entry of serverCommandMap) {
      lines.push(`| \`${entry.method}\` | ${escapeMarkdown(briefDescription(entry))} | ${refLink(entry)} |`);
    }
    lines.push('');
  }

  lines.push('## Server → Client Notifications\n');
  lines.push('Pushed by the server without a preceding request. Every notification carries a top-level `channel: URI`.\n');
  lines.push('| Method | Description | Reference |');
  lines.push('|---|---|---|');
  for (const entry of serverNotifMap) {
    // `action` has params `ActionEnvelope` which lives in common/actions.ts.
    const refPage = pageForMethod(project, entry.paramsType) ?? 'common';
    const channelLabel = refPage === 'common' ? 'Common'
      : refPage === 'root' ? 'Root Channel'
      : refPage === 'session' ? 'Session Channel'
      : refPage === 'terminal' ? 'Terminal Channel'
      : refPage === 'changeset' ? 'Changeset Channel'
      : refPage;
    const ref = entry.method === 'action'
      ? `[Common](/reference/common#actionenvelope)`
      : `[${channelLabel}](/reference/${refPage}#${methodAnchor(entry.method)})`;
    lines.push(`| \`${entry.method}\` | ${escapeMarkdown(briefDescription(entry))} | ${ref} |`);
  }
  lines.push('');

  lines.push('## Version Introduction\n');
  lines.push('All messages listed above were introduced in protocol version **1**.\n');
  return lines.join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generateMarkdownDocs(project: Project, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });

  // Single shared crawl: build the global type → page map for cross-page links.
  populateKnownTypes(project);

  const pages: Array<{ filename: string; generator: (project: Project) => string }> = [
    { filename: 'common.md', generator: generateCommonPage },
    { filename: 'root.md', generator: generateRootChannelPage },
    { filename: 'session.md', generator: generateSessionChannelPage },
    { filename: 'terminal.md', generator: generateTerminalChannelPage },
    { filename: 'changeset.md', generator: generateChangesetChannelPage },
    { filename: 'messages.md', generator: generateMessagesPage },
    { filename: 'error-codes.md', generator: generateErrorCodesPage },
  ];

  for (const page of pages) {
    const content = page.generator(project);
    fs.writeFileSync(path.join(outDir, page.filename), content, 'utf-8');
    console.log(`  • ${page.filename}`);
  }
}
