/**
 * Action Origin Generator — Generates action classification types and the
 * IS_CLIENT_DISPATCHABLE map from @clientDispatchable JSDoc annotations
 * in types/actions.ts.
 */

import {
  Project,
  InterfaceDeclaration,
  TypeAliasDeclaration,
} from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { findProtocolSourceFiles } from './find-protocol-sources.js';

const GENERATED_HEADER = `// Generated from types/actions.ts — do not edit
// Run \`npm run generate\` to regenerate.
`;

type ActionScope = 'root' | 'session' | 'terminal' | 'changeset';

interface ActionInfo {
  /** The interface name (e.g. 'RootAgentsChangedAction') */
  name: string;
  /** The ActionType enum value string (e.g. 'root/agentsChanged') */
  actionType: string;
  /** The ActionType enum member name (e.g. 'ActionType.RootAgentsChanged') */
  enumRef: string;
  /** Which scope this action belongs to */
  scope: ActionScope;
  /** Whether the action is @clientDispatchable */
  isClientDispatchable: boolean;
}

function hasJsDocTag(node: InterfaceDeclaration | TypeAliasDeclaration, tagName: string): boolean {
  for (const doc of node.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === tagName) return true;
    }
  }
  return false;
}

function getJsDocTag(node: InterfaceDeclaration | TypeAliasDeclaration, tagName: string): string | undefined {
  for (const doc of node.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === tagName) {
        return tag.getCommentText()?.trim();
      }
    }
  }
  return undefined;
}

/**
 * Resolves the string value of a `type: ActionType.X` property in an interface,
 * looking up the const enum value from the ActionType enum in the source file.
 */
function resolveActionType(
  iface: InterfaceDeclaration,
  enumValues: Map<string, string>,
): { actionType: string; enumRef: string } | undefined {
  const typeProp = iface.getProperty('type');
  if (!typeProp) return undefined;

  const typeNode = typeProp.getTypeNode();
  if (!typeNode) return undefined;

  const text = typeNode.getText();
  // e.g. "ActionType.RootAgentsChanged"
  const match = text.match(/^ActionType\.(\w+)$/);
  if (!match) return undefined;

  const enumMember = match[1];
  const value = enumValues.get(enumMember);
  if (value === undefined) return undefined;

  return { actionType: value, enumRef: text };
}

export function generateActionOrigin(project: Project, outDir: string): void {
  // After the channel-organized refactor, the `ActionType` enum and
  // `StateAction` union live in `types/common/actions.ts`, while the
  // individual action interfaces live in `types/channels-*/actions.ts`.
  // Look up declarations across every canonical actions file.
  const actionsFiles = findProtocolSourceFiles(project, 'actions.ts');
  if (actionsFiles.length === 0) {
    throw new Error('No canonical types/**/actions.ts files found in the project');
  }

  function findEnumAcross(name: string) {
    for (const sf of actionsFiles) {
      const e = sf.getEnum(name);
      if (e) return e;
    }
    return undefined;
  }
  function findTypeAliasAcross(name: string) {
    for (const sf of actionsFiles) {
      const ta = sf.getTypeAlias(name);
      if (ta) return ta;
    }
    return undefined;
  }
  function findInterfaceAcross(name: string) {
    for (const sf of actionsFiles) {
      const iface = sf.getInterface(name);
      if (iface) return iface;
    }
    return undefined;
  }

  // Parse ActionType enum values
  const enumValues = new Map<string, string>();
  const actionTypeEnum = findEnumAcross('ActionType');
  if (!actionTypeEnum) {
    throw new Error('ActionType enum not found in any types/**/actions.ts');
  }
  for (const member of actionTypeEnum.getMembers()) {
    const value = member.getValue();
    if (typeof value === 'string') {
      enumValues.set(member.getName(), value);
    }
  }

  // Find the StateAction union to know which types are in scope
  const stateActionAlias = findTypeAliasAcross('StateAction');
  if (!stateActionAlias) {
    throw new Error('StateAction type alias not found in any types/**/actions.ts');
  }
  const unionText = stateActionAlias.getTypeNodeOrThrow().getText();

  // Extract interface names from the union (e.g. "RootAgentsChangedAction")
  const unionMembers = new Set(
    unionText.split('|').map(s => s.trim()).filter(s => s.length > 0),
  );

  // Collect info for each action interface/type alias in the union
  const actions: ActionInfo[] = [];

  for (const name of unionMembers) {
    // Could be an interface or a type alias (SessionToolCallConfirmedAction is a type alias)
    const iface = findInterfaceAcross(name);
    const typeAlias = findTypeAliasAcross(name);
    const node = iface || typeAlias;

    if (!node) {
      throw new Error(`Could not find declaration for ${name} in any types/**/actions.ts`);
    }

    const category = getJsDocTag(node as any, 'category') || '';
    const scope: ActionScope = category === 'Root Actions' ? 'root'
      : category === 'Terminal Actions' ? 'terminal'
      : category === 'Changeset Actions' ? 'changeset'
      : 'session';
    const isClientDispatchable = hasJsDocTag(node as any, 'clientDispatchable');

    // Resolve the action type discriminant
    let resolved: { actionType: string; enumRef: string } | undefined;

    if (iface) {
      resolved = resolveActionType(iface, enumValues);
    } else if (typeAlias) {
      // For type aliases (unions like SessionToolCallConfirmedAction),
      // look at the first union member to find the type discriminant
      const aliasType = typeAlias.getType();
      const unionTypes = aliasType.getUnionTypes();
      if (unionTypes.length > 0) {
        const typeProp = unionTypes[0].getProperty('type');
        if (typeProp) {
          const propType = typeProp.getValueDeclaration()?.getType() ?? typeProp.getTypeAtLocation(typeAlias);
          const literalValue = propType.getLiteralValue();
          if (typeof literalValue === 'string') {
            // Find the matching enum member
            for (const [memberName, memberValue] of enumValues) {
              if (memberValue === literalValue) {
                resolved = { actionType: literalValue, enumRef: `ActionType.${memberName}` };
                break;
              }
            }
          }
        }
      }
    }

    if (!resolved) {
      throw new Error(`Could not resolve action type for ${name}`);
    }

    actions.push({
      name,
      actionType: resolved.actionType,
      enumRef: resolved.enumRef,
      scope,
      isClientDispatchable,
    });
  }

  // Generate output
  const rootActions = actions.filter(a => a.scope === 'root');
  const sessionActions = actions.filter(a => a.scope === 'session');
  const terminalActions = actions.filter(a => a.scope === 'terminal');
  const changesetActions = actions.filter(a => a.scope === 'changeset');
  const clientRootActions = rootActions.filter(a => a.isClientDispatchable);
  const serverRootActions = rootActions.filter(a => !a.isClientDispatchable);
  const clientSessionActions = sessionActions.filter(a => a.isClientDispatchable);
  const serverSessionActions = sessionActions.filter(a => !a.isClientDispatchable);
  const clientTerminalActions = terminalActions.filter(a => a.isClientDispatchable);
  const serverTerminalActions = terminalActions.filter(a => !a.isClientDispatchable);
  const clientChangesetActions = changesetActions.filter(a => a.isClientDispatchable);
  const serverChangesetActions = changesetActions.filter(a => !a.isClientDispatchable);

  const lines: string[] = [GENERATED_HEADER];

  // Imports
  lines.push(`import type {`);
  lines.push(`  StateAction,`);
  for (const a of actions) {
    lines.push(`  ${a.name},`);
  }
  lines.push(`} from './actions.js';`);
  lines.push(``);
  lines.push(`import { ActionType } from './actions.js';`);
  lines.push(``);

  // RootAction
  lines.push(`// ─── Root vs Session vs Terminal vs Changeset Action Unions ─────────────────`);
  lines.push(``);
  lines.push(`/** Union of all root-scoped actions. */`);
  lines.push(`export type RootAction =`);
  for (let i = 0; i < rootActions.length; i++) {
    lines.push(`  | ${rootActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ClientRootAction
  lines.push(`/** Union of root actions that clients may dispatch. */`);
  lines.push(`export type ClientRootAction =`);
  for (let i = 0; i < clientRootActions.length; i++) {
    lines.push(`  | ${clientRootActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ServerRootAction
  lines.push(`/** Union of root actions that only the server may produce. */`);
  lines.push(`export type ServerRootAction =`);
  for (let i = 0; i < serverRootActions.length; i++) {
    lines.push(`  | ${serverRootActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // SessionAction
  lines.push(`/** Union of all session-scoped actions. */`);
  lines.push(`export type SessionAction =`);
  for (let i = 0; i < sessionActions.length; i++) {
    lines.push(`  | ${sessionActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ClientSessionAction
  lines.push(`/** Union of session actions that clients may dispatch. */`);
  lines.push(`export type ClientSessionAction =`);
  for (let i = 0; i < clientSessionActions.length; i++) {
    lines.push(`  | ${clientSessionActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ServerSessionAction
  lines.push(`/** Union of session actions that only the server may produce. */`);
  lines.push(`export type ServerSessionAction =`);
  for (let i = 0; i < serverSessionActions.length; i++) {
    lines.push(`  | ${serverSessionActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // TerminalAction
  lines.push(`/** Union of all terminal-scoped actions. */`);
  lines.push(`export type TerminalAction =`);
  for (let i = 0; i < terminalActions.length; i++) {
    lines.push(`  | ${terminalActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ClientTerminalAction
  lines.push(`/** Union of terminal actions that clients may dispatch. */`);
  lines.push(`export type ClientTerminalAction =`);
  for (let i = 0; i < clientTerminalActions.length; i++) {
    lines.push(`  | ${clientTerminalActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ServerTerminalAction
  lines.push(`/** Union of terminal actions that only the server may produce. */`);
  lines.push(`export type ServerTerminalAction =`);
  for (let i = 0; i < serverTerminalActions.length; i++) {
    lines.push(`  | ${serverTerminalActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ChangesetAction
  lines.push(`/** Union of all changeset-scoped actions. */`);
  lines.push(`export type ChangesetAction =`);
  for (let i = 0; i < changesetActions.length; i++) {
    lines.push(`  | ${changesetActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ClientChangesetAction
  lines.push(`/** Union of changeset actions that clients may dispatch. */`);
  lines.push(`export type ClientChangesetAction =`);
  if (clientChangesetActions.length === 0) {
    lines.push(`  never`);
  } else {
    for (let i = 0; i < clientChangesetActions.length; i++) {
      lines.push(`  | ${clientChangesetActions[i].name}`);
    }
  }
  lines.push(`;`);
  lines.push(``);

  // ServerChangesetAction
  lines.push(`/** Union of changeset actions that only the server may produce. */`);
  lines.push(`export type ServerChangesetAction =`);
  if (serverChangesetActions.length === 0) {
    lines.push(`  never`);
  } else {
    for (let i = 0; i < serverChangesetActions.length; i++) {
      lines.push(`  | ${serverChangesetActions[i].name}`);
    }
  }
  lines.push(`;`);
  lines.push(``);


  // IS_CLIENT_DISPATCHABLE map
  lines.push(`// ─── Client-Dispatchable Map ─────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Exhaustive map indicating which action types may be dispatched by clients.`);
  lines.push(` * Adding a new action to StateAction without adding it here is a compile error.`);
  lines.push(` */`);
  lines.push(`export const IS_CLIENT_DISPATCHABLE: { readonly [K in StateAction['type']]: boolean } = {`);
  for (const a of actions) {
    lines.push(`  [${a.enumRef}]: ${a.isClientDispatchable},`);
  }
  lines.push(`};`);
  lines.push(``);

  const output = lines.join('\n');
  const outPath = path.join(outDir, 'action-origin.generated.ts');
  fs.writeFileSync(outPath, output, 'utf-8');
}
