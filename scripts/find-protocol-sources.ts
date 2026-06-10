/**
 * Shared helper for the protocol type generators: discover canonical
 * per-channel source files under `types/common/` and `types/channels-*\/`,
 * deliberately ignoring the legacy aggregator shims (`types/state.ts`,
 * `types/actions.ts`, etc.) so declarations are not counted twice.
 */

import { Project, SourceFile } from 'ts-morph';
import path from 'path';

/**
 * Folders containing canonical declarations. Iteration order is
 * `common, channels-root, channels-session, channels-terminal,
 * channels-changeset` — preserved across generators so emitted output is
 * stable and roughly matches the legacy single-file declaration order.
 */
export const PROTOCOL_SOURCE_DIRS: readonly string[] = [
  'common',
  'channels-root',
  'channels-session',
  'channels-chat',
  'channels-terminal',
  'channels-changeset',
  'channels-annotations',
  'channels-otlp',
  'channels-resource-watch',
];

/**
 * Returns every source file with the given base name that lives in one of
 * the canonical per-channel folders. The result is ordered to match
 * {@link PROTOCOL_SOURCE_DIRS}, which keeps generator output deterministic.
 *
 * Use this in place of
 *
 * ```ts
 * project.getSourceFiles().find(f => f.getBaseName() === 'state.ts')
 * ```
 *
 * which would otherwise resolve to the empty legacy shim after the
 * channel-organized refactor.
 */
export function findProtocolSourceFiles(project: Project, baseName: string): SourceFile[] {
  const matched: SourceFile[] = [];
  for (const dir of PROTOCOL_SOURCE_DIRS) {
    for (const sf of project.getSourceFiles()) {
      if (sf.getBaseName() !== baseName) continue;
      const parent = path.basename(path.dirname(sf.getFilePath()));
      if (parent === dir) {
        matched.push(sf);
      }
    }
  }
  return matched;
}
