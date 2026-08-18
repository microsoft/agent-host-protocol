/**
 * Automation Run Channel Reducer.
 *
 * @module channels-automation-run/reducer
 */

import type { AutomationRunAction } from '../action-origin.generated.js';
import { ActionType } from '../common/actions.js';
import { softAssertNever } from '../common/reducer-helpers.js';
import type { AutomationRunState } from './state.js';

/** Pure reducer for automation-run state. */
export function automationRunReducer(state: AutomationRunState, action: AutomationRunAction, log?: (msg: string) => void): AutomationRunState {
  switch (action.type) {
    case ActionType.AutomationRunLifecycleChanged:
      return { ...state, lifecycle: action.lifecycle, operations: action.operations };

    case ActionType.AutomationRunSessionSet:
      if (state.sessions.includes(action.session)) {
        return state;
      }
      return { ...state, sessions: [...state.sessions, action.session] };

    case ActionType.AutomationRunSessionRemoved: {
      const index = state.sessions.indexOf(action.session);
      if (index < 0) {
        return state;
      }
      const sessions = state.sessions.slice();
      sessions.splice(index, 1);
      const next: AutomationRunState = { ...state, sessions };
      if (state.primarySession === action.session) {
        delete next.primarySession;
      }
      return next;
    }

    case ActionType.AutomationRunPrimarySessionChanged: {
      const next: AutomationRunState = { ...state };
      if (action.primarySession === undefined) {
        delete next.primarySession;
      } else {
        next.primarySession = action.primarySession;
      }
      return next;
    }

    case ActionType.AutomationRunCancelRequested:
      return state;

    default:
      softAssertNever(action, log);
      return state;
  }
}
