/**
 * Shared helper for the generators: read the notification methods that are
 * annotated `@windowExempt`. These methods do not count against the window on
 * a windowed subscription; every other notification for a subscription does.
 *
 * The annotation is the single source of truth. Each generator emits the list
 * as a native constant, so peers in every language agree on which messages
 * are counted. Throws if the annotation is misused, so a mistake fails
 * generation instead of producing clients that disagree.
 */

import fs from 'fs';
import path from 'path';
import { InterfaceDeclaration, Project } from 'ts-morph';
import { PROTOCOL_SOURCE_DIRS, findProtocolSourceFiles } from './find-protocol-sources.js';

const TAG = 'windowExempt';

function tagValues(node: InterfaceDeclaration, name: string): string[] {
  return node.getJsDocs()
    .flatMap(doc => doc.getTags())
    .filter(tag => tag.getTagName() === name)
    .map(tag => tag.getCommentText()?.trim() ?? '');
}

/**
 * Returns the `@method` names of every `@windowExempt` declaration, sorted.
 * Throws if the tag has a value, appears more than once, or is on a
 * declaration that is not a notification.
 */
export function readWindowExemptMethods(project: Project): string[] {
  const methods = new Set<string>();
  const files = ['commands.ts', 'notifications.ts']
    .flatMap(baseName => findProtocolSourceFiles(project, baseName));
  for (const sf of files) {
    for (const iface of sf.getInterfaces()) {
      const exempt = tagValues(iface, TAG);
      if (exempt.length === 0) continue;
      const name = iface.getName();
      if (exempt.length > 1 || exempt[0] !== '') {
        throw new Error(`${name}: @${TAG} must appear once, without a value`);
      }
      const [method] = tagValues(iface, 'method');
      const [messageType] = tagValues(iface, 'messageType');
      if (!method || messageType !== 'Notification') {
        throw new Error(`${name}: @${TAG} is only valid on a notification with a @method`);
      }
      methods.add(method);
    }
  }
  if (methods.size === 0) {
    throw new Error(`readWindowExemptMethods: no @${TAG} notifications found in ${PROTOCOL_SOURCE_DIRS.join(', ')}`);
  }
  return [...methods].sort();
}

const GENERATED_HEADER = `// Generated from @windowExempt annotations in types/ — do not edit
// Run \`npm run generate\` to regenerate.
`;

/** Writes `window-exempt.generated.ts` into the canonical types directory. */
export function generateWindowExempt(project: Project, typesDir: string): void {
  const methods = readWindowExemptMethods(project);
  const list = methods.map(method => `  '${method}',`).join('\n');
  const content = `${GENERATED_HEADER}
/**
 * Notification methods that do not count against the window on a windowed
 * subscription. Every other notification for a subscription counts.
 *
 * @see {@link /specification/windowed-delivery#control-messages | Windowed Delivery: Control Messages}
 */
export const WINDOW_EXEMPT_METHODS = [
${list}
] as const;

/** A notification method that does not count against the window. */
export type WindowExemptMethod = typeof WINDOW_EXEMPT_METHODS[number];

const windowExemptMethods: ReadonlySet<string> = new Set(WINDOW_EXEMPT_METHODS);

/**
 * Whether a notification with this method counts against the window on a
 * windowed subscription. Methods that are not recognized count.
 */
export function countsAgainstWindow(method: string): boolean {
  return !windowExemptMethods.has(method);
}
`;
  const file = path.join(typesDir, 'window-exempt.generated.ts');
  fs.writeFileSync(file, content);
  // Make sure the TypeScript client copy sees the file, even on its first run.
  const existing = project.getSourceFile(file);
  if (existing) existing.refreshFromFileSystemSync();
  else project.addSourceFileAtPath(file);
}
