/**
 * Tunnels Channel Reducer.
 *
 * @module channels-tunnels/reducer
 */

import type { TunnelAction } from '../action-origin.generated.js';
import { ActionType } from '../common/actions.js';
import { softAssertNever } from '../common/reducer-helpers.js';
import { TunnelPortDirectionKind, type TunnelsState } from './state.js';

/** Pure reducer for tunnels state. */
export function tunnelReducer(state: TunnelsState, action: TunnelAction, log?: (msg: string) => void): TunnelsState {
  switch (action.type) {
    case ActionType.TunnelPortSet: {
      const idx = state.ports.findIndex(port => port.resource === action.port.resource);
      if (idx < 0) {
        return {
          ...state,
          ports: [...state.ports, action.port],
        };
      }
      const ports = state.ports.slice();
      ports[idx] = action.port;
      return { ...state, ports };
    }

    case ActionType.TunnelPortClientUpdated: {
      const portIdx = state.ports.findIndex(port => port.resource === action.resource);
      if (portIdx < 0) {
        return state;
      }
      const port = state.ports[portIdx];
      if (port.direction === TunnelPortDirectionKind.HostToClient) {
        const clientIdx = port.clients.findIndex(client => client.clientId === action.clientId);
        if (clientIdx < 0) {
          return state;
        }
        const clients = port.clients.slice();
        clients[clientIdx] = { ...clients[clientIdx], state: action.state };
        const ports = state.ports.slice();
        ports[portIdx] = { ...port, clients };
        return { ...state, ports };
      }
      if (port.client.clientId !== action.clientId) {
        return state;
      }
      const ports = state.ports.slice();
      ports[portIdx] = { ...port, client: { ...port.client, state: action.state } };
      return { ...state, ports };
    }

    case ActionType.TunnelPortClientSet: {
      const portIdx = state.ports.findIndex(port => port.resource === action.resource);
      if (portIdx < 0) {
        return state;
      }
      const port = state.ports[portIdx];
      const ports = state.ports.slice();
      if (port.direction === TunnelPortDirectionKind.HostToClient) {
        const clientIdx = port.clients.findIndex(client => client.clientId === action.client.clientId);
        const clients = port.clients.slice();
        if (clientIdx < 0) {
          clients.push(action.client);
        } else {
          clients[clientIdx] = action.client;
        }
        ports[portIdx] = { ...port, clients };
      } else {
        ports[portIdx] = { ...port, client: action.client };
      }
      return { ...state, ports };
    }

    case ActionType.TunnelPortClientRemoved: {
      const portIdx = state.ports.findIndex(port => port.resource === action.resource);
      if (portIdx < 0) {
        return state;
      }
      const port = state.ports[portIdx];
      if (port.direction !== TunnelPortDirectionKind.HostToClient) {
        return state;
      }
      const clientIdx = port.clients.findIndex(client => client.clientId === action.clientId);
      if (clientIdx < 0) {
        return state;
      }
      const clients = port.clients.slice();
      clients.splice(clientIdx, 1);
      const ports = state.ports.slice();
      ports[portIdx] = { ...port, clients };
      return { ...state, ports };
    }

    case ActionType.TunnelPortRemoved: {
      const idx = state.ports.findIndex(port => port.resource === action.resource);
      if (idx < 0) {
        return state;
      }
      const ports = state.ports.slice();
      ports.splice(idx, 1);
      return { ...state, ports };
    }

    default:
      softAssertNever(action, log);
      return state;
  }
}
