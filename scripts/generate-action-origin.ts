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

const GENERATED_HEADER = `// Generated from types/actions.ts — do not edit
// Run \`npm run generate\` to regenerate.
`;

type ActionScope = 'root' | 'session' | 'terminal';

interface ActionInfo {
  /** The interface name (e.g. 'IRootAgentsChangedAction') */
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
  const actionsFile = project.getSourceFileOrThrow('actions.ts');

  // Parse ActionType enum values
  const enumValues = new Map<string, string>();
  const actionTypeEnum = actionsFile.getEnumOrThrow('ActionType');
  for (const member of actionTypeEnum.getMembers()) {
    const value = member.getValue();
    if (typeof value === 'string') {
      enumValues.set(member.getName(), value);
    }
  }

  // Find the IStateAction union to know which types are in scope
  const stateActionAlias = actionsFile.getTypeAliasOrThrow('IStateAction');
  const unionText = stateActionAlias.getTypeNodeOrThrow().getText();

  // Extract interface names from the union (e.g. "IRootAgentsChangedAction")
  const unionMembers = new Set(
    unionText.split('|').map(s => s.trim()).filter(s => s.length > 0),
  );

  // Collect info for each action interface/type alias in the union
  const actions: ActionInfo[] = [];

  for (const name of unionMembers) {
    // Could be an interface or a type alias (ISessionToolCallConfirmedAction is a type alias)
    const iface = actionsFile.getInterface(name);
    const typeAlias = actionsFile.getTypeAlias(name);
    const node = iface || typeAlias;

    if (!node) {
      throw new Error(`Could not find declaration for ${name} in actions.ts`);
    }

    const category = getJsDocTag(node as any, 'category') || '';
    const scope: ActionScope = category === 'Root Actions' ? 'root'
      : category === 'Terminal Actions' ? 'terminal'
      : 'session';
    const isClientDispatchable = hasJsDocTag(node as any, 'clientDispatchable');

    // Resolve the action type discriminant
    let resolved: { actionType: string; enumRef: string } | undefined;

    if (iface) {
      resolved = resolveActionType(iface, enumValues);
    } else if (typeAlias) {
      // For type aliases (unions like ISessionToolCallConfirmedAction),
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
  const clientSessionActions = sessionActions.filter(a => a.isClientDispatchable);
  const serverSessionActions = sessionActions.filter(a => !a.isClientDispatchable);
  const clientTerminalActions = terminalActions.filter(a => a.isClientDispatchable);
  const serverTerminalActions = terminalActions.filter(a => !a.isClientDispatchable);

  const lines: string[] = [GENERATED_HEADER];

  // Imports
  lines.push(`import type {`);
  lines.push(`  IStateAction,`);
  for (const a of actions) {
    lines.push(`  ${a.name},`);
  }
  lines.push(`} from './actions.js';`);
  lines.push(``);
  lines.push(`import { ActionType } from './actions.js';`);
  lines.push(``);

  // IRootAction
  lines.push(`// ─── Root vs Session vs Terminal Action Unions ───────────────────────────────`);
  lines.push(``);
  lines.push(`/** Union of all root-scoped actions. */`);
  lines.push(`export type IRootAction =`);
  for (let i = 0; i < rootActions.length; i++) {
    lines.push(`  | ${rootActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ISessionAction
  lines.push(`/** Union of all session-scoped actions. */`);
  lines.push(`export type ISessionAction =`);
  for (let i = 0; i < sessionActions.length; i++) {
    lines.push(`  | ${sessionActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // IClientSessionAction
  lines.push(`/** Union of session actions that clients may dispatch. */`);
  lines.push(`export type IClientSessionAction =`);
  for (let i = 0; i < clientSessionActions.length; i++) {
    lines.push(`  | ${clientSessionActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // IServerSessionAction
  lines.push(`/** Union of session actions that only the server may produce. */`);
  lines.push(`export type IServerSessionAction =`);
  for (let i = 0; i < serverSessionActions.length; i++) {
    lines.push(`  | ${serverSessionActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // ITerminalAction
  lines.push(`/** Union of all terminal-scoped actions. */`);
  lines.push(`export type ITerminalAction =`);
  for (let i = 0; i < terminalActions.length; i++) {
    lines.push(`  | ${terminalActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // IClientTerminalAction
  lines.push(`/** Union of terminal actions that clients may dispatch. */`);
  lines.push(`export type IClientTerminalAction =`);
  for (let i = 0; i < clientTerminalActions.length; i++) {
    lines.push(`  | ${clientTerminalActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);

  // IServerTerminalAction
  lines.push(`/** Union of terminal actions that only the server may produce. */`);
  lines.push(`export type IServerTerminalAction =`);
  for (let i = 0; i < serverTerminalActions.length; i++) {
    lines.push(`  | ${serverTerminalActions[i].name}`);
  }
  lines.push(`;`);
  lines.push(``);


  // IS_CLIENT_DISPATCHABLE map
  lines.push(`// ─── Client-Dispatchable Map ─────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Exhaustive map indicating which action types may be dispatched by clients.`);
  lines.push(` * Adding a new action to IStateAction without adding it here is a compile error.`);
  lines.push(` */`);
  lines.push(`export const IS_CLIENT_DISPATCHABLE: { readonly [K in IStateAction['type']]: boolean } = {`);
  for (const a of actions) {
    lines.push(`  [${a.enumRef}]: ${a.isClientDispatchable},`);
  }
  lines.push(`};`);
  lines.push(``);

  const output = lines.join('\n');
  const outPath = path.join(outDir, 'action-origin.generated.ts');
  fs.writeFileSync(outPath, output, 'utf-8');
}
