/**
 * Markdown Generator — Generates VitePress-compatible reference markdown from
 * TypeScript type definitions parsed via ts-morph.
 */

import {
  Project,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  PropertySignature,
  VariableDeclaration,
  JSDocTag,
  SourceFile,
  Node,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';

const GENERATED_HEADER = '<!-- Generated from types/*.ts — do not edit -->\n\n';

const GITHUB_REF = process.env.GITHUB_SHA || 'main';
const GITHUB_BASE = `https://github.com/microsoft/agent-host-protocol/blob/${GITHUB_REF}`;
const SCHEMA_BASE = '/agent-host-protocol/schema';

function schemaLink(schemaFile: string): string {
  return `<a href="${SCHEMA_BASE}/${schemaFile}" target="_blank">JSON Schema: <code>${schemaFile}</code></a>\n`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a markdown-formatted source link for a declaration.
 * e.g. `[source](https://github.com/.../types/state.ts#L42)`
 */
function sourceLink(node: InterfaceDeclaration | TypeAliasDeclaration | VariableDeclaration): string {
  const sf = node.getSourceFile();
  const fileName = sf.getBaseName();
  const line = node.getStartLineNumber();
  return `<a href="${GITHUB_BASE}/types/${fileName}#L${line}" title="View source" style="float:right;font-size:0.75em;opacity:0.5;text-decoration:none">📄</a>`;
}

/**
 * Renders a ### heading with the type name and a source link.
 */
function renderHeading(name: string, node: InterfaceDeclaration | TypeAliasDeclaration | VariableDeclaration, level = 3): string {
  const hashes = '#'.repeat(level);
  return `${hashes} \`${name}\` ${sourceLink(node)}\n`;
}

function getJsDocDescription(node: InterfaceDeclaration | TypeAliasDeclaration): string {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) return '';
  return jsDocs[0].getDescription().trim();
}

function getJsDocTag(node: InterfaceDeclaration | TypeAliasDeclaration, tagName: string): string | undefined {
  const jsDocs = node.getJsDocs();
  for (const doc of jsDocs) {
    const tags = doc.getTags();
    for (const tag of tags) {
      if (tag.getTagName() === tagName) {
        return tag.getCommentText()?.trim();
      }
    }
  }
  return undefined;
}

function hasJsDocTag(node: InterfaceDeclaration | TypeAliasDeclaration, tagName: string): boolean {
  return getJsDocTag(node, tagName) !== undefined;
}

function getJsDocTagFromProperty(prop: PropertySignature, tagName: string): string | undefined {
  const jsDocs = prop.getJsDocs();
  for (const doc of jsDocs) {
    const tags = doc.getTags();
    for (const tag of tags) {
      if (tag.getTagName() === tagName) {
        return tag.getCommentText()?.trim();
      }
    }
  }
  return undefined;
}

function getPropertyDescription(prop: PropertySignature): string {
  const jsDocs = prop.getJsDocs();
  if (jsDocs.length === 0) return '';
  return jsDocs[0].getDescription().trim();
}

function getPropertyType(prop: PropertySignature): string {
  const typeNode = prop.getTypeNode();
  if (typeNode) {
    return typeNode.getText();
  }
  return prop.getType().getText(prop);
}

function isOptional(prop: PropertySignature): boolean {
  return prop.hasQuestionToken();
}

function formatType(typeText: string): string {
  // Clean up imported type references (remove import paths)
  return typeText
    .replace(/import\([^)]+\)\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Set of known type names that can be cross-linked within the page.
 * Populated before rendering each page.
 */
let knownTypes = new Set<string>();

/**
 * Maps type names to the page where they're defined (for cross-page links).
 */
const typeToPage: Record<string, string> = {};

/**
 * The current page being generated (e.g. 'state-types', 'actions').
 */
let currentPage = '';

/**
 * Maps a type name to the page-relative anchor (VitePress lowercases heading text).
 */
function typeAnchor(name: string): string {
  return name.toLowerCase();
}

/**
 * Wraps known type references in markdown links to their heading anchors.
 * Links to the correct page if the type is defined on a different page.
 * Handles arrays (T[]), Record<string, T>, unions (A | B), and T | undefined.
 */
function linkifyType(typeText: string): string {
  return typeText.replace(/\b(I[A-Z]\w+|ToolCallStatus|ToolCallConfirmationReason|StringOrMarkdown|URI)\b/g, (match) => {
    if (knownTypes.has(match)) {
      const page = typeToPage[match];
      if (page && page !== currentPage) {
        return `[${match}](/reference/${page}#${typeAnchor(match)})`;
      }
      return `[${match}](#${typeAnchor(match)})`;
    }
    return match;
  });
}

function escapeTypeForTable(typeText: string): string {
  const formatted = formatType(typeText).replace(/\|/g, '\\|');
  const linked = linkifyType(formatted);
  // If it contains cross-links, render without backticks so links are clickable
  if (linked !== formatted) {
    return linked;
  }
  return '`' + formatted + '`';
}

// ─── Table Generation ────────────────────────────────────────────────────────

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

    // Auto-label literal type fields (discriminants) if no explicit description
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

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

function getInterface(project: Project, name: string): InterfaceDeclaration {
  for (const sf of project.getSourceFiles()) {
    const iface = sf.getInterface(name);
    if (iface) return iface;
  }
  throw new Error(`Interface ${name} not found`);
}

function getTypeAlias(project: Project, name: string): TypeAliasDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const ta = sf.getTypeAlias(name);
    if (ta) return ta;
  }
  return undefined;
}

/**
 * Renders a type alias as a proper ### heading with its definition.
 * String-literal unions: ### `ToolCallStatus` \n `'running' | 'pending-permission' | ...`
 * Interface unions: ### `IResponsePart` \n `IMarkdownResponsePart | IContentRef` (with cross-links)
 */
function renderTypeAlias(project: Project, name: string): string {
  const ta = getTypeAlias(project, name);
  if (!ta) return '';
  const desc = getJsDocDescription(ta);
  const typeText = formatType(ta.getTypeNode()?.getText() || '');
  const lines: string[] = [];
  lines.push(renderHeading(name, ta));
  if (desc) lines.push(desc + '\n');
  // Linkify interface references in the definition
  const linkedType = linkifyType(typeText);
  if (linkedType.includes('[')) {
    // Contains cross-links — render without wrapping backticks so links are clickable
    lines.push(linkedType + '\n');
  } else {
    // Pure literal type — wrap in backticks
    lines.push(`\`${typeText}\`\n`);
  }
  return lines.join('\n');
}

/**
 * Finds all type aliases in a source file that have a given @category tag.
 */
function getTypeAliasesByCategory(project: Project, fileName: string, category: string): TypeAliasDeclaration[] {
  const result: TypeAliasDeclaration[] = [];
  const sf = project.getSourceFiles().find(f => f.getBaseName() === fileName);
  if (!sf) return result;
  for (const ta of sf.getTypeAliases()) {
    const cat = getJsDocTag(ta, 'category');
    if (cat === category) {
      result.push(ta);
    }
  }
  return result;
}

function getVariable(project: Project, name: string): VariableDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    for (const vs of sf.getVariableStatements()) {
      for (const decl of vs.getDeclarations()) {
        if (decl.getName() === name) return decl;
      }
    }
  }
  return undefined;
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

function getRemarksText(node: InterfaceDeclaration | TypeAliasDeclaration): string | undefined {
  return getJsDocTag(node, 'remarks');
}

// ─── State Types Page ────────────────────────────────────────────────────────

/**
 * Populates the knownTypes set from interfaces and type aliases across source files.
 * Also builds the typeToPage map for cross-page linking.
 */
function collectKnownTypes(project: Project, fileNames: string[]): void {
  knownTypes = new Set<string>();
  for (const fileName of fileNames) {
    const sf = project.getSourceFiles().find(f => f.getBaseName() === fileName);
    if (!sf) continue;
    for (const iface of sf.getInterfaces()) {
      knownTypes.add(iface.getName());
    }
    for (const ta of sf.getTypeAliases()) {
      knownTypes.add(ta.getName());
    }
  }
  knownTypes.add('URI');
}

/** Maps source file names to their doc page slugs. */
const FILE_TO_PAGE: Record<string, string> = {
  'state.ts': 'state-types',
  'actions.ts': 'actions',
  'commands.ts': 'commands',
  'notifications.ts': 'notifications',
  'errors.ts': 'error-codes',
};

/**
 * Populates typeToPage for all types across all source files.
 * Called once at the start of generation.
 */
function buildTypePageMap(project: Project): void {
  for (const [fileName, page] of Object.entries(FILE_TO_PAGE)) {
    const sf = project.getSourceFiles().find(f => f.getBaseName() === fileName);
    if (!sf) continue;
    for (const iface of sf.getInterfaces()) {
      typeToPage[iface.getName()] = page;
    }
    for (const ta of sf.getTypeAliases()) {
      typeToPage[ta.getName()] = page;
    }
  }
}

function generateStateTypesPage(project: Project): string {
  collectKnownTypes(project, ['state.ts']);
  currentPage = 'state-types';

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# State Types\n');
  lines.push('Complete reference for all state types in the Agent Host Protocol.\n');
  lines.push(schemaLink('state.schema.json'));

  // Root State
  lines.push('## Root State\n');
  const rootState = getInterface(project, 'IRootState');
  lines.push(renderHeading('IRootState', rootState));
  lines.push(getJsDocDescription(rootState) + '\n');
  lines.push(renderInterfaceTable(rootState) + '\n');

  const agentInfo = getInterface(project, 'IAgentInfo');
  lines.push(renderHeading('IAgentInfo', agentInfo));
  lines.push(renderInterfaceTable(agentInfo) + '\n');

  const modelInfo = getInterface(project, 'ISessionModelInfo');
  lines.push(renderHeading('ISessionModelInfo', modelInfo));
  lines.push(renderInterfaceTable(modelInfo) + '\n');

  // Session State
  lines.push('## Session State\n');
  const sessionState = getInterface(project, 'ISessionState');
  lines.push(renderHeading('ISessionState', sessionState));
  lines.push(getJsDocDescription(sessionState) + '\n');
  lines.push(renderInterfaceTable(sessionState) + '\n');

  const sessionSummary = getInterface(project, 'ISessionSummary');
  lines.push(renderHeading('ISessionSummary', sessionSummary));
  lines.push(renderInterfaceTable(sessionSummary) + '\n');

  // Turn Types
  lines.push('## Turn Types\n');
  const turn = getInterface(project, 'ITurn');
  lines.push(renderHeading('ITurn', turn));
  lines.push(getJsDocDescription(turn) + '\n');
  lines.push(renderInterfaceTable(turn) + '\n');

  const activeTurn = getInterface(project, 'IActiveTurn');
  lines.push(renderHeading('IActiveTurn', activeTurn));
  lines.push(getJsDocDescription(activeTurn) + '\n');
  lines.push(renderInterfaceTable(activeTurn) + '\n');

  const userMessage = getInterface(project, 'IUserMessage');
  lines.push(renderHeading('IUserMessage', userMessage));
  lines.push(renderInterfaceTable(userMessage) + '\n');

  const messageAttachment = getInterface(project, 'IMessageAttachment');
  lines.push(renderHeading('IMessageAttachment', messageAttachment));
  lines.push(renderInterfaceTable(messageAttachment) + '\n');

  // Response Parts
  lines.push('## Response Parts\n');
  const mdPart = getInterface(project, 'IMarkdownResponsePart');
  lines.push(renderHeading('IMarkdownResponsePart', mdPart));
  lines.push(renderInterfaceTable(mdPart) + '\n');

  const contentRef = getInterface(project, 'IContentRef');
  lines.push(renderHeading('IContentRef', contentRef));
  lines.push(getJsDocDescription(contentRef) + '\n');
  lines.push(renderInterfaceTable(contentRef) + '\n');

  // Render IResponsePart type alias automatically
  const responseParts = getTypeAliasesByCategory(project, 'state.ts', 'Response Parts');
  for (const ta of responseParts) {
    lines.push(renderTypeAlias(project, ta.getName()) + '\n');
  }

  // Tool Call Types
  lines.push('## Tool Call Types\n');

  // Render type aliases in the Tool Call Types category (IToolCallState union, ToolCallStatus, etc.)
  const toolCallAliases = getTypeAliasesByCategory(project, 'state.ts', 'Tool Call Types');
  for (const ta of toolCallAliases) {
    const rendered = renderTypeAlias(project, ta.getName());
    if (rendered) lines.push(rendered + '\n');
  }

  // Render each tool call state interface
  const toolCallInterfaces = [
    'IToolCallResult',
    'IToolCallStreamingState',
    'IToolCallPendingConfirmationState',
    'IToolCallRunningState',
    'IToolCallPendingResultConfirmationState',
    'IToolCallCompletedState',
    'IToolCallCancelledState',
    'IToolResultSubagentContent',
  ];
  for (const name of toolCallInterfaces) {
    const iface = getInterface(project, name);
    lines.push(renderHeading(name, iface));
    const desc = getJsDocDescription(iface);
    if (desc) lines.push(desc + '\n');
    lines.push(renderInterfaceTable(iface) + '\n');
  }

  // Common Types
  lines.push('## Common Types\n');

  const usageInfo = getInterface(project, 'IUsageInfo');
  lines.push(renderHeading('IUsageInfo', usageInfo));
  lines.push(renderInterfaceTable(usageInfo) + '\n');

  const errorInfo = getInterface(project, 'IErrorInfo');
  lines.push(renderHeading('IErrorInfo', errorInfo));
  lines.push(renderInterfaceTable(errorInfo) + '\n');

  const snapshot = getInterface(project, 'ISnapshot');
  lines.push(renderHeading('ISnapshot', snapshot));
  lines.push(getJsDocDescription(snapshot) + '\n');
  lines.push(renderInterfaceTable(snapshot) + '\n');

  return lines.join('\n');
}

// ─── Actions Page ────────────────────────────────────────────────────────────

interface ActionMeta {
  interfaceName: string;
  typeValue: string;
  description: string;
  clientDispatchable: boolean;
  version: number;
}

const ACTION_ORDER: ActionMeta[] = [
  // Root
  { interfaceName: 'IRootAgentsChangedAction', typeValue: 'root/agentsChanged', description: 'Fired when available agent backends or their models change.', clientDispatchable: false, version: 1 },
  // Session
  { interfaceName: 'ISessionReadyAction', typeValue: 'session/ready', description: 'Session backend initialized successfully.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionCreationFailedAction', typeValue: 'session/creationFailed', description: 'Session backend failed to initialize.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionTurnStartedAction', typeValue: 'session/turnStarted', description: 'User sent a message; server starts agent processing.', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionDeltaAction', typeValue: 'session/delta', description: 'Streaming text chunk from the assistant.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionResponsePartAction', typeValue: 'session/responsePart', description: 'Structured content appended to the response.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionToolCallStartAction', typeValue: 'session/toolCallStart', description: 'A tool call begins — parameters are streaming from the LM.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionToolCallDeltaAction', typeValue: 'session/toolCallDelta', description: 'Streaming partial parameters for a tool call.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionToolCallReadyAction', typeValue: 'session/toolCallReady', description: 'Tool call parameters are complete, or a running tool requires re-confirmation.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionToolCallApprovedAction', typeValue: 'session/toolCallConfirmed (approved)', description: 'Client approves a pending tool call.', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionToolCallDeniedAction', typeValue: 'session/toolCallConfirmed (denied)', description: 'Client denies a pending tool call.', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionToolCallCompleteAction', typeValue: 'session/toolCallComplete', description: 'Tool execution finished.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionToolCallResultConfirmedAction', typeValue: 'session/toolCallResultConfirmed', description: 'Client approves or denies a tool result.', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionTurnCompleteAction', typeValue: 'session/turnComplete', description: 'Turn finished — the assistant is idle.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionTurnCancelledAction', typeValue: 'session/turnCancelled', description: 'Turn was aborted; server stops processing.', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionErrorAction', typeValue: 'session/error', description: 'Error during turn processing.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionTitleChangedAction', typeValue: 'session/titleChanged', description: 'Session title updated (auto-generated from conversation, or dispatched by a client to rename).', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionUsageAction', typeValue: 'session/usage', description: 'Token usage report for a turn.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionReasoningAction', typeValue: 'session/reasoning', description: 'Reasoning/thinking text from the model.', clientDispatchable: false, version: 1 },
  { interfaceName: 'ISessionModelChangedAction', typeValue: 'session/modelChanged', description: 'Model changed for this session.', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionIsReadChangedAction', typeValue: 'session/isReadChanged', description: 'Read state changed for this session.', clientDispatchable: true, version: 1 },
  { interfaceName: 'ISessionIsDoneChangedAction', typeValue: 'session/isDoneChanged', description: 'Done state changed for this session.', clientDispatchable: true, version: 1 },
];

function generateActionsPage(project: Project): string {
  collectKnownTypes(project, ['state.ts', 'actions.ts']);
  currentPage = 'actions';

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Actions Reference\n');
  lines.push('Complete reference for all action types in the Agent Host Protocol. Actions are the sole mutation mechanism for subscribable state.\n');
  lines.push(schemaLink('actions.schema.json'));

  // Action Envelope
  lines.push('## Action Envelope\n');
  lines.push('Every action is wrapped in an `ActionEnvelope`:\n');
  lines.push('```typescript');
  lines.push('interface IActionEnvelope {');
  lines.push('  readonly action: IStateAction;');
  lines.push('  readonly serverSeq: number;');
  lines.push('  readonly origin: { clientId: string; clientSeq: number } | undefined;');
  lines.push('  readonly rejectionReason?: string;');
  lines.push('}');
  lines.push('```\n');

  // Root Actions
  lines.push('## Root Actions\n');
  lines.push('Mutate `RootState`. All are server-only.\n');

  // Session Actions header will be inserted at the right point
  let inSession = false;

  for (const meta of ACTION_ORDER) {
    if (!inSession && meta.typeValue.startsWith('session/')) {
      inSession = true;
      lines.push('## Session Actions\n');
      lines.push('Mutate `SessionState`. Scoped to a session URI.\n');
    }

    const iface = getInterface(project, meta.interfaceName);
    lines.push(`### \`${meta.typeValue}\` ${sourceLink(iface)}\n`);

    const prefix = meta.clientDispatchable ? '**Client-dispatchable.** ' : '';
    lines.push(prefix + getJsDocDescription(iface) + '\n');

    lines.push(renderInterfaceTable(iface) + '\n');

    // Special case: toolCallComplete has a nested IToolCallResult
    if (meta.typeValue === 'session/toolCallComplete') {
      const resultIface = getInterface(project, 'IToolCallResult');
      lines.push(renderHeading('IToolCallResult', resultIface, 4));
      lines.push(renderInterfaceTable(resultIface) + '\n');
    }
  }

  // Version Introduction table
  lines.push('## Version Introduction\n');
  lines.push('All actions listed above were introduced in protocol version **1**.\n');
  lines.push('| Action Type | Version |');
  lines.push('|---|---|');
  for (const meta of ACTION_ORDER) {
    lines.push(`| \`${meta.typeValue}\` | ${meta.version} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Commands Page ───────────────────────────────────────────────────────────

interface CommandMeta {
  method: string;
  paramsInterface: string;
  resultInterface?: string;
  resultText?: string;
}

const COMMAND_ORDER: CommandMeta[] = [
  { method: 'initialize', paramsInterface: 'IInitializeParams', resultInterface: 'IInitializeResult' },
  { method: 'reconnect', paramsInterface: 'IReconnectParams' },
  { method: 'createSession', paramsInterface: 'ICreateSessionParams', resultText: '`null` on success.' },
  { method: 'disposeSession', paramsInterface: 'IDisposeSessionParams', resultText: '`null` on success.' },
  { method: 'listSessions', paramsInterface: 'IListSessionsParams', resultInterface: 'IListSessionsResult' },
  { method: 'resourceRead', paramsInterface: 'IResourceReadParams', resultInterface: 'IResourceReadResult' },
  { method: 'resourceWrite', paramsInterface: 'IResourceWriteParams', resultInterface: 'IResourceWriteResult' },
  { method: 'resourceList', paramsInterface: 'IResourceListParams', resultInterface: 'IResourceListResult' },
  { method: 'resourceCopy', paramsInterface: 'IResourceCopyParams', resultInterface: 'IResourceCopyResult' },
  { method: 'resourceDelete', paramsInterface: 'IResourceDeleteParams', resultInterface: 'IResourceDeleteResult' },
  { method: 'resourceMove', paramsInterface: 'IResourceMoveParams', resultInterface: 'IResourceMoveResult' },
  { method: 'fetchTurns', paramsInterface: 'IFetchTurnsParams', resultInterface: 'IFetchTurnsResult' },
];

function generateCommandsPage(project: Project): string {
  collectKnownTypes(project, ['state.ts', 'actions.ts', 'commands.ts']);
  currentPage = 'commands';

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Commands\n');
  lines.push('Commands are JSON-RPC requests from the client to the server. They return a result or a JSON-RPC error.\n');
  lines.push(schemaLink('commands.schema.json'));

  for (const cmd of COMMAND_ORDER) {
    const paramsIface = getInterface(project, cmd.paramsInterface);
    const desc = getJsDocDescription(paramsIface);
    const direction = getJsDocTag(paramsIface, 'direction') || 'Client → Server';
    const messageType = getJsDocTag(paramsIface, 'messageType') || 'Request';

    lines.push(`## \`${cmd.method}\` ${sourceLink(paramsIface)}\n`);
    lines.push(desc + '\n');
    lines.push('| Property | Value |');
    lines.push('|---|---|');
    lines.push(`| Direction | ${direction} |`);
    lines.push(`| Type | ${messageType} |\n`);

    lines.push('**Parameters:**\n');
    lines.push(renderInterfaceTable(paramsIface) + '\n');

    // Reconnect has two result types
    if (cmd.method === 'reconnect') {
      const replayResult = getInterface(project, 'IReconnectReplayResult');
      const snapshotResult = getInterface(project, 'IReconnectSnapshotResult');

      lines.push('**Result (replay):** When the server can replay from the requested sequence:\n');
      lines.push(renderInterfaceTable(replayResult) + '\n');

      lines.push('**Result (snapshot):** When the gap exceeds the replay buffer:\n');
      lines.push(renderInterfaceTable(snapshotResult) + '\n');

      lines.push(getJsDocDescription(replayResult) + '\n');
    } else if (cmd.resultInterface) {
      const resultIface = getInterface(project, cmd.resultInterface);
      lines.push('**Result:**\n');
      lines.push(renderInterfaceTable(resultIface) + '\n');
    } else if (cmd.resultText) {
      lines.push(`**Result:** ${cmd.resultText}\n`);
    }

    // Add any extra description text from the params interface
    const seeTag = getJsDocTag(paramsIface, 'see');
    if (seeTag) {
      // Convert @see tag to markdown link
      const seeMatch = seeTag.match(/\{@link\s+([^|]+)\|([^}]+)\}/);
      if (seeMatch) {
        lines.push(`See [${seeMatch[2].trim()}](${seeMatch[1].trim()}) for details.\n`);
      }
    }

    // Add examples
    const examples = getJsDocExamples(paramsIface);
    for (const example of examples) {
      lines.push('**Example:**\n');
      lines.push(example + '\n');
    }

    // Add spec notes from description (after the first sentence)
    const fullDesc = getJsDocDescription(paramsIface);
    const sentences = fullDesc.split('\n\n');
    if (sentences.length > 1) {
      for (let i = 1; i < sentences.length; i++) {
        lines.push(sentences[i].trim() + '\n');
      }
    }

    lines.push('---\n');
  }

  // Client-Dispatched Actions section
  lines.push('## Client-Dispatched Actions\n');
  lines.push('In addition to commands, clients interact with the server by **dispatching actions** as fire-and-forget notifications:\n');
  lines.push('```jsonc');
  lines.push('// Client → Server');
  lines.push('{');
  lines.push('  "jsonrpc": "2.0",');
  lines.push('  "method": "dispatchAction",');
  lines.push('  "params": {');
  lines.push('    "clientSeq": 1,');
  lines.push('    "action": { "type": "session/turnStarted", "session": "copilot:/<uuid>", ... }');
  lines.push('  }');
  lines.push('}');
  lines.push('```\n');
  lines.push('These are **write-ahead**: the client applies them optimistically to local state. See [Actions](/guide/actions) for the full list of client-dispatchable actions.\n');
  lines.push('| Action | Server-side effect |');
  lines.push('|---|---|');
  lines.push('| `session/turnStarted` | Begins agent processing for the new turn |');
  lines.push('| `session/permissionResolved` | Unblocks the pending tool execution |');
  lines.push('| `session/turnCancelled` | Aborts the in-progress turn |');
  lines.push('| `session/modelChanged` | Changes the model for subsequent turns |');
  lines.push('');

  return lines.join('\n');
}

// ─── Notifications Page ──────────────────────────────────────────────────────

function generateNotificationsPage(project: Project): string {
  collectKnownTypes(project, ['state.ts', 'notifications.ts']);
  currentPage = 'notifications';

  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Notifications\n');
  lines.push('Notifications are ephemeral broadcasts that are **not** part of the state tree. They are not processed by reducers and are not replayed on reconnection.\n');
  lines.push(schemaLink('notifications.schema.json'));

  // Protocol Notifications
  lines.push('## Protocol Notifications\n');

  const sessionAdded = getInterface(project, 'ISessionAddedNotification');
  lines.push(`### \`notify/sessionAdded\` ${sourceLink(sessionAdded)}\n`);
  lines.push(getJsDocDescription(sessionAdded) + '\n');
  lines.push(renderInterfaceTable(sessionAdded) + '\n');

  const sessionAddedExamples = getJsDocExamples(sessionAdded);
  for (const example of sessionAddedExamples) {
    lines.push('**Example:**\n');
    lines.push(example + '\n');
  }

  const sessionRemoved = getInterface(project, 'ISessionRemovedNotification');
  lines.push(`### \`notify/sessionRemoved\` ${sourceLink(sessionRemoved)}\n`);
  lines.push(getJsDocDescription(sessionRemoved) + '\n');
  lines.push(renderInterfaceTable(sessionRemoved) + '\n');

  const sessionRemovedExamples = getJsDocExamples(sessionRemoved);
  for (const example of sessionRemovedExamples) {
    lines.push('**Example:**\n');
    lines.push(example + '\n');
  }

  const sessionSummaryChanged = getInterface(project, 'ISessionSummaryChangedNotification');
  lines.push(`### \`notify/sessionSummaryChanged\` ${sourceLink(sessionSummaryChanged)}\n`);
  lines.push(getJsDocDescription(sessionSummaryChanged) + '\n');
  lines.push(renderInterfaceTable(sessionSummaryChanged) + '\n');

  const sessionSummaryChangedExamples = getJsDocExamples(sessionSummaryChanged);
  for (const example of sessionSummaryChangedExamples) {
    lines.push('**Example:**\n');
    lines.push(example + '\n');
  }

  // Usage Pattern
  lines.push('## Usage Pattern\n');
  lines.push('Clients use notifications to maintain a local session list cache:\n');
  lines.push('1. On connect, fetch the full session list via `listSessions()`.');
  lines.push('2. Listen for `notify/sessionAdded` and `notify/sessionRemoved` to track lifecycle, and `notify/sessionSummaryChanged` to patch cached summaries in place.');
  lines.push('3. On reconnect, **re-fetch** the full list — notifications are not replayed.\n');

  // Version Introduction
  lines.push('## Version Introduction\n');
  lines.push('| Notification Type | Version |');
  lines.push('|---|---|');
  lines.push('| `notify/sessionAdded` | 1 |');
  lines.push('| `notify/sessionRemoved` | 1 |');
  lines.push('| `notify/sessionSummaryChanged` | 1 |\n');

  // Server Notifications (action delivery)
  lines.push('## Server Notifications\n');
  lines.push('In addition to protocol notifications, the server pushes action envelopes to subscribed clients:\n');
  lines.push(`### \`action\`\n`);
  lines.push('Wraps an `ActionEnvelope` for delivery to subscribed clients:\n');
  lines.push('```json');
  lines.push('{');
  lines.push('  "jsonrpc": "2.0",');
  lines.push('  "method": "action",');
  lines.push('  "params": {');
  lines.push('    "envelope": {');
  lines.push('      "action": { "type": "session/delta", ... },');
  lines.push('      "serverSeq": 43,');
  lines.push('      "origin": { "clientId": "client-1", "clientSeq": 1 }');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ─── Error Codes Page ────────────────────────────────────────────────────────

function generateErrorCodesPage(project: Project): string {
  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Error Codes\n');
  lines.push('AHP uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification) error codes. In addition to the standard JSON-RPC codes, AHP defines application-specific error codes in the `-32000` to `-32099` range.\n');
  lines.push(schemaLink('errors.schema.json'));

  // Get the error code objects from the source
  const errorsFile = project.getSourceFiles().find(sf => sf.getBaseName() === 'errors.ts');
  if (!errorsFile) throw new Error('errors.ts not found');

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

  // Parse from the const object in errors.ts
  const ahpCodesVar = errorsFile.getVariableDeclaration('AhpErrorCodes');
  if (ahpCodesVar) {
    let initializer = ahpCodesVar.getInitializer();
    // Unwrap `as const`
    if (initializer && Node.isAsExpression(initializer)) {
      initializer = initializer.getExpression();
    }
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      for (const prop of initializer.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const name = prop.getName();
          const value = prop.getInitializer()?.getText();
          // Get the leading comment for this property
          const fullText = prop.getFullText();
          let description = '';
          const commentMatch = fullText.match(/\/\*\*\s*(.+?)\s*\*\//);
          if (commentMatch) {
            description = commentMatch[1];
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

  // Version Introduction
  lines.push('## Version Introduction\n');
  lines.push('All error codes listed above were introduced in protocol version **1**.\n');

  return lines.join('\n');
}

// ─── Messages Page ───────────────────────────────────────────────────────────

function generateMessagesPage(_project: Project): string {
  const lines: string[] = [GENERATED_HEADER];
  lines.push('# Messages Reference\n');
  lines.push('Complete reference of all JSON-RPC methods in the Agent Host Protocol, organized by direction and type.\n');

  lines.push('## Client → Server Requests\n');
  lines.push('These methods have an `id` and expect a response.\n');
  lines.push('| Method | Description | Reference |');
  lines.push('|---|---|---|');
  lines.push('| `initialize` | Handshake — establishes the connection and protocol version | [Lifecycle](/specification/lifecycle) |');
  lines.push('| `reconnect` | Re-establishes a dropped connection with replay or snapshot | [Lifecycle](/specification/lifecycle) |');
  lines.push('| `subscribe` | Subscribe to a URI-identified state resource | [Subscriptions](/specification/subscriptions) |');
  lines.push('| `createSession` | Create a new agent session | [Commands](/reference/commands) |');
  lines.push('| `disposeSession` | Dispose a session and clean up resources | [Commands](/reference/commands) |');
  lines.push('| `listSessions` | Fetch session summaries | [Commands](/reference/commands) |');
  lines.push('| `fetchTurns` | Fetch historical turns for a session | [Commands](/reference/commands) |');
  lines.push('| `resourceRead` | Read content by URI | [Commands](/reference/commands) |');
  lines.push('| `resourceWrite` | Write content to a file on the server filesystem | [Commands](/reference/commands) |');
  lines.push('| `resourceList` | List directory entries on the server filesystem | [Commands](/reference/commands) |');
  lines.push('| `resourceCopy` | Copy a resource from one URI to another | [Commands](/reference/commands) |');
  lines.push('| `resourceDelete` | Delete a resource at a URI | [Commands](/reference/commands) |');
  lines.push('| `resourceMove` | Move a resource from one URI to another | [Commands](/reference/commands) |\n');

  lines.push('## Client → Server Notifications\n');
  lines.push('These methods have no `id` and expect no response.\n');
  lines.push('| Method | Description | Reference |');
  lines.push('|---|---|---|');
  lines.push('| `unsubscribe` | Stop receiving updates for a URI | [Subscriptions](/specification/subscriptions) |');
  lines.push('| `dispatchAction` | Fire-and-forget action dispatch (write-ahead) | [Actions](/guide/actions) |\n');

  lines.push('## Server → Client Notifications\n');
  lines.push('These are pushed by the server without a preceding request.\n');
  lines.push('| Method | Description | Reference |');
  lines.push('|---|---|---|');
  lines.push('| `action` | Delivers an `ActionEnvelope` to subscribed clients | [Actions](/reference/actions) |');
  lines.push('| `notification` | Ephemeral protocol notification (e.g. session added/removed) | [Notifications](/reference/notifications) |\n');

  lines.push('## Version Introduction\n');
  lines.push('All messages listed above were introduced in protocol version **1**.\n');

  return lines.join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generateMarkdownDocs(project: Project, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });

  // Build the global type→page map for cross-page links
  buildTypePageMap(project);

  const pages: Array<{ filename: string; generator: (project: Project) => string }> = [
    { filename: 'state-types.md', generator: generateStateTypesPage },
    { filename: 'actions.md', generator: generateActionsPage },
    { filename: 'commands.md', generator: generateCommandsPage },
    { filename: 'notifications.md', generator: generateNotificationsPage },
    { filename: 'error-codes.md', generator: generateErrorCodesPage },
    { filename: 'messages.md', generator: generateMessagesPage },
  ];

  for (const page of pages) {
    const content = page.generator(project);
    fs.writeFileSync(path.join(outDir, page.filename), content, 'utf-8');
    console.log(`  • ${page.filename}`);
  }
}
