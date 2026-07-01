/**
 * Session Channel Reducer — Pure reducer for `SessionState`.
 *
 * @module channels-session/reducer
 */

import { ActionType } from '../common/actions.js';
import type {
  SessionState,
  SessionInputRequest,
  McpServerCustomization,
  SessionOpenCanvas,
} from './state.js';
import {
  SessionLifecycle,
  SessionStatus,
  CustomizationType,
} from './state.js';
import type { SessionAction } from '../action-origin.generated.js';
import { softAssertNever } from '../common/reducer-helpers.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Bitmask covering the mutually-exclusive activity bits (bits 0–4). */
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;

/** Sets or clears a metadata flag on a status value. */
function withStatusFlag(status: SessionStatus, flag: SessionStatus, set: boolean): SessionStatus {
  return set ? status | flag : status & ~flag;
}

/**
 * Reflects the session-level {@link SessionState.inputNeeded | input queue}
 * into the activity bits of `status`. A non-empty queue promotes the activity
 * to {@link SessionStatus.InputNeeded}; emptying it clears the
 * input-needed-specific bit. Since `InputNeeded` implies
 * {@link SessionStatus.InProgress}, an unblocked turn falls back to
 * `InProgress` while an already-idle session stays idle. Orthogonal flags
 * (`IsRead` / `IsArchived`) are preserved.
 */
function withInputNeededStatus(status: SessionStatus, inputNeeded: readonly SessionInputRequest[]): SessionStatus {
  if (inputNeeded.length > 0) {
    return (status & ~STATUS_ACTIVITY_MASK) | SessionStatus.InputNeeded;
  }
  return status & ~(SessionStatus.InputNeeded & ~SessionStatus.InProgress);
}

// ─── Session Reducer ─────────────────────────────────────────────────────────

/**
 * Pure reducer for session state. Handles all {@link SessionAction} variants.
 */
export function sessionReducer(state: SessionState, action: SessionAction, log?: (msg: string) => void): SessionState {
  switch (action.type) {
    // ── Lifecycle ──────────────────────────────────────────────────────────

    case ActionType.SessionReady:
      // `SessionReady` is purely a lifecycle transition (Creating ->
      // Ready). It must not touch `status`: for provisional sessions the
      // first turn can start before materialization completes, so an
      // `activeTurn` may already be set when this action is dispatched
      // (e.g. from a materialize-session handler). Other reducers keep
      // `status` in sync with the activity state, so leaving it alone here
      // is correct.
      return { ...state, lifecycle: SessionLifecycle.Ready };

    case ActionType.SessionCreationFailed:
      return {
        ...state,
        lifecycle: SessionLifecycle.CreationFailed,
        creationError: action.error,
      };

    case ActionType.SessionChatAdded: {
      const list = state.chats;
      const idx = list.findIndex(c => c.resource === action.summary.resource);
      if (idx < 0) {
        return { ...state, chats: [...list, action.summary] };
      }
      const updated = list.slice();
      updated[idx] = action.summary;
      return { ...state, chats: updated };
    }

    case ActionType.SessionChatRemoved: {
      const list = state.chats;
      const idx = list.findIndex(c => c.resource === action.chat);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      const next: SessionState = { ...state, chats: updated };
      if (state.defaultChat === action.chat) {
        delete next.defaultChat;
      }
      return next;
    }

    case ActionType.SessionChatUpdated: {
      const list = state.chats;
      const idx = list.findIndex(c => c.resource === action.chat);
      if (idx < 0) {
        return state;
      }
      const { resource: _ignored, ...changes } = action.changes;
      const updated = list.slice();
      updated[idx] = { ...list[idx], ...changes };
      return { ...state, chats: updated };
    }

    case ActionType.SessionDefaultChatChanged:
      return { ...state, defaultChat: action.defaultChat };

    // ── Metadata ──────────────────────────────────────────────────────────

    case ActionType.SessionTitleChanged:
      return { ...state, title: action.title };

    case ActionType.SessionIsReadChanged:
      return {
        ...state,
        status: withStatusFlag(state.status, SessionStatus.IsRead, action.isRead),
      };

    case ActionType.SessionIsArchivedChanged:
      return {
        ...state,
        status: withStatusFlag(state.status, SessionStatus.IsArchived, action.isArchived),
      };

    case ActionType.SessionActivityChanged:
      return { ...state, activity: action.activity };

    case ActionType.SessionChangesetsChanged: {
      const { changesets: _omit, ...stateWithoutChangesets } = state;
      return action.changesets
        ? { ...stateWithoutChangesets, changesets: action.changesets }
        : stateWithoutChangesets;
    }

    case ActionType.SessionConfigChanged:
      if (!state.config) {
        return state;
      }
      return {
        ...state,
        config: {
          ...state.config,
          values: action.replace ? { ...action.config } : { ...state.config.values, ...action.config },
        },
      };

    case ActionType.SessionMetaChanged:
      return { ...state, _meta: action._meta };

    case ActionType.SessionServerToolsChanged:
      return { ...state, serverTools: action.tools };

    case ActionType.SessionActiveClientSet: {
      const list = state.activeClients;
      const idx = list.findIndex(c => c.clientId === action.activeClient.clientId);
      if (idx < 0) {
        return { ...state, activeClients: [...list, action.activeClient] };
      }
      const updated = list.slice();
      updated[idx] = action.activeClient;
      return { ...state, activeClients: updated };
    }

    case ActionType.SessionActiveClientRemoved: {
      const list = state.activeClients;
      const idx = list.findIndex(c => c.clientId === action.clientId);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      return { ...state, activeClients: updated };
    }

    // ── Input Needed ────────────────────────────────────────────────────

    case ActionType.SessionInputNeededSet: {
      const list = state.inputNeeded ?? [];
      const idx = list.findIndex(r => r.id === action.request.id);
      const inputNeeded = idx < 0 ? [...list, action.request] : list.slice();
      if (idx >= 0) {
        inputNeeded[idx] = action.request;
      }
      return { ...state, inputNeeded, status: withInputNeededStatus(state.status, inputNeeded) };
    }

    case ActionType.SessionInputNeededRemoved: {
      const list = state.inputNeeded;
      if (!list) {
        return state;
      }
      const idx = list.findIndex(r => r.id === action.id);
      if (idx < 0) {
        return state;
      }
      const remaining = list.slice();
      remaining.splice(idx, 1);
      const next: SessionState = { ...state, status: withInputNeededStatus(state.status, remaining) };
      if (remaining.length > 0) {
        next.inputNeeded = remaining;
      } else {
        delete next.inputNeeded;
      }
      return next;
    }

    // ── Customizations ──────────────────────────────────────────────────

    case ActionType.SessionCustomizationsChanged:
      return { ...state, customizations: action.customizations };

    case ActionType.SessionCustomizationToggled: {
      const list = state.customizations;
      if (!list) {
        return state;
      }
      const idx = list.findIndex(c => c.id === action.id);
      if (idx < 0) {
        return state;
      }
      const updated = [...list];
      updated[idx] = { ...list[idx], enabled: action.enabled };
      return { ...state, customizations: updated };
    }

    case ActionType.SessionCustomizationUpdated: {
      const list = state.customizations ?? [];
      const idx = list.findIndex(c => c.id === action.customization.id);
      if (idx < 0) {
        return { ...state, customizations: [...list, action.customization] };
      }
      const updated = [...list];
      updated[idx] = action.customization;
      return { ...state, customizations: updated };
    }

    case ActionType.SessionCustomizationRemoved: {
      const list = state.customizations;
      if (!list) {
        return state;
      }
      const topIdx = list.findIndex(c => c.id === action.id);
      if (topIdx >= 0) {
        const updated = list.slice();
        updated.splice(topIdx, 1);
        return { ...state, customizations: updated };
      }
      let changed = false;
      const updated = list.map(container => {
        if (container.type === CustomizationType.McpServer) {
          return container;
        }
        const children = container.children;
        if (!children) {
          return container;
        }
        const childIdx = children.findIndex(c => c.id === action.id);
        if (childIdx < 0) {
          return container;
        }
        changed = true;
        const newChildren = children.slice();
        newChildren.splice(childIdx, 1);
        return { ...container, children: newChildren };
      });
      if (!changed) {
        return state;
      }
      return { ...state, customizations: updated };
    }

    case ActionType.SessionMcpServerStateChanged: {
      const list = state.customizations;
      if (!list) {
        return state;
      }
      const topIdx = list.findIndex(c => c.id === action.id);
      if (topIdx >= 0) {
        const entry = list[topIdx];
        if (entry.type !== CustomizationType.McpServer) {
          return state;
        }
        const updatedEntry: McpServerCustomization = {
          ...entry,
          state: action.state,
          channel: action.channel,
        };
        const updated = list.slice();
        updated[topIdx] = updatedEntry;
        return { ...state, customizations: updated };
      }
      let changed = false;
      const updated = list.map(container => {
        if (container.type === CustomizationType.McpServer) {
          return container;
        }
        const children = container.children;
        if (!children) {
          return container;
        }
        const childIdx = children.findIndex(c => c.id === action.id);
        if (childIdx < 0) {
          return container;
        }
        const child = children[childIdx];
        if (child.type !== CustomizationType.McpServer) {
          return container;
        }
        changed = true;
        const updatedChild: McpServerCustomization = {
          ...child,
          state: action.state,
          channel: action.channel,
        };
        const newChildren = children.slice();
        newChildren[childIdx] = updatedChild;
        return { ...container, children: newChildren };
      });
      if (!changed) {
        return state;
      }
      return { ...state, customizations: updated };
    }

    // ── Canvases ─────────────────────────────────────────────────────────

    case ActionType.SessionCanvasRegistryChanged:
      return { ...state, canvasRegistry: action.canvases };

    case ActionType.SessionCanvasInstanceOpened: {
      const list = state.openCanvases ?? [];
      const idx = list.findIndex(c => c.instanceId === action.instance.instanceId);
      if (idx < 0) {
        return { ...state, openCanvases: [...list, action.instance] };
      }
      const updated = list.slice();
      updated[idx] = action.instance;
      return { ...state, openCanvases: updated };
    }

    case ActionType.SessionCanvasInstanceUpdated: {
      const list = state.openCanvases;
      if (!list) {
        return state;
      }
      const idx = list.findIndex(c => c.instanceId === action.instanceId);
      if (idx < 0) {
        return state;
      }
      const merged: SessionOpenCanvas = { ...list[idx] };
      if (action.title !== undefined) {
        merged.title = action.title;
      }
      if (action.status !== undefined) {
        merged.status = action.status;
      }
      if (action.url !== undefined) {
        merged.url = action.url;
      }
      if (action.availability !== undefined) {
        merged.availability = action.availability;
      }
      const next = list.slice();
      next[idx] = merged;
      return { ...state, openCanvases: next };
    }

    case ActionType.SessionCanvasInstanceClosed: {
      const openList = state.openCanvases;
      const requestList = state.canvasRequests;
      const hadOpen = openList?.some(c => c.instanceId === action.instanceId) ?? false;
      const hadRequest = requestList?.some(r => r.instanceId === action.instanceId) ?? false;
      if (!hadOpen && !hadRequest) {
        return state;
      }
      const next: SessionState = { ...state };
      if (openList && hadOpen) {
        const remaining = openList.filter(c => c.instanceId !== action.instanceId);
        if (remaining.length > 0) {
          next.openCanvases = remaining;
        } else {
          delete next.openCanvases;
        }
      }
      if (requestList && hadRequest) {
        const remaining = requestList.filter(r => r.instanceId !== action.instanceId);
        if (remaining.length > 0) {
          next.canvasRequests = remaining;
        } else {
          delete next.canvasRequests;
        }
      }
      return next;
    }

    case ActionType.SessionCanvasInstanceCloseRequested:
      // Pure client-to-host signal: the host responds by driving the
      // provider-facing close and ultimately a `canvasInstanceClosed`.
      return state;

    case ActionType.SessionCanvasRequestCreated: {
      const list = state.canvasRequests ?? [];
      const idx = list.findIndex(r => r.requestId === action.request.requestId);
      if (idx < 0) {
        return { ...state, canvasRequests: [...list, action.request] };
      }
      const updated = list.slice();
      updated[idx] = action.request;
      return { ...state, canvasRequests: updated };
    }

    case ActionType.SessionCanvasRequestCompleted: {
      const list = state.canvasRequests;
      if (!list) {
        return state;
      }
      const idx = list.findIndex(r => r.requestId === action.requestId);
      if (idx < 0) {
        return state;
      }
      const remaining = list.filter(r => r.requestId !== action.requestId);
      const next: SessionState = { ...state };
      if (remaining.length > 0) {
        next.canvasRequests = remaining;
      } else {
        delete next.canvasRequests;
      }
      return next;
    }

    case ActionType.SessionCanvasRequestCancelled: {
      const list = state.canvasRequests;
      if (!list) {
        return state;
      }
      const idx = list.findIndex(r => r.requestId === action.requestId);
      if (idx < 0) {
        return state;
      }
      const remaining = list.filter(r => r.requestId !== action.requestId);
      const next: SessionState = { ...state };
      if (remaining.length > 0) {
        next.canvasRequests = remaining;
      } else {
        delete next.canvasRequests;
      }
      return next;
    }

    default:
      softAssertNever(action, log);
      return state;
  }
}