/**
 * Changeset Channel Reducer — Pure reducer for `ChangesetState`.
 *
 * @module channels-changeset/reducer
 */

import { ActionType } from '../common/actions.js';
import type { ChangesetState, ChangesetFile } from './state.js';
import { ChangesetStatus } from './state.js';
import type { ChangesetAction } from '../action-origin.generated.js';
import { softAssertNever } from '../common/reducer-helpers.js';

/**
 * Pure reducer for changeset state. Handles all {@link ChangesetAction}
 * variants.
 *
 * Per the spec, every changeset action is server-only; the reducer
 * preserves a stable file order by appending new files via
 * {@link ActionType.ChangesetFileSet} when the id is unknown, and
 * replacing in place when it matches an existing entry.
 */
export function changesetReducer(state: ChangesetState, action: ChangesetAction, log?: (msg: string) => void): ChangesetState {
  switch (action.type) {
    case ActionType.ChangesetStatusChanged: {
      // Carry `error` only when the new status is `Error` so we don't
      // leave a stale error sitting on a recovered changeset.
      if (action.status === ChangesetStatus.Error) {
        return { ...state, status: action.status, error: action.error };
      }
      const { error: _ignored, ...rest } = state;
      return { ...rest, status: action.status };
    }

    case ActionType.ChangesetFileSet: {
      const idx = state.files.findIndex(f => f.id === action.file.id);
      if (idx < 0) {
        return { ...state, files: [...state.files, action.file] };
      }
      const next: ChangesetFile[] = [...state.files];
      next[idx] = action.file;
      return { ...state, files: next };
    }

    case ActionType.ChangesetFileRemoved: {
      const idx = state.files.findIndex(f => f.id === action.fileId);
      if (idx < 0) {
        return state;
      }
      const next: ChangesetFile[] = [...state.files];
      next.splice(idx, 1);
      return { ...state, files: next };
    }

    case ActionType.ChangesetOperationsChanged: {
      if (action.operations === undefined) {
        const { operations: _ignored, ...rest } = state;
        return rest;
      }
      return { ...state, operations: action.operations };
    }

    case ActionType.ChangesetCleared:
      if (state.files.length === 0) {
        return state;
      }
      return { ...state, files: [] };

    default:
      softAssertNever(action, log);
      return state;
  }
}
