import {
  ActionType,
  PolicyState,
  ResponsePartKind,
  SessionStatus,
  type ResponsePart,
  type StateAction,
} from '@microsoft/agent-host-protocol';
import { AhpClient } from '@microsoft/agent-host-protocol/client';
import { MultiHostClient } from '@microsoft/agent-host-protocol/hosts';
import { WebSocketTransport } from '@microsoft/agent-host-protocol/ws';

const action: StateAction = {
  type: ActionType.RootActiveSessionsChanged,
  activeSessions: 2,
};
const response: ResponsePart = {
  kind: ResponsePartKind.Markdown,
  id: 'response-1',
  content: 'Hello',
};
const status: SessionStatus = SessionStatus.InputNeeded;

// Run the emitted JavaScript without a TypeScript loader: imports must resolve
// to real enum objects, including numeric reverse mappings and bit flags.
const actual = {
  action: action.type,
  response: response.kind,
  policy: PolicyState.Enabled,
  status,
  inProgress: status & SessionStatus.InProgress,
  statusName: SessionStatus[SessionStatus.InputNeeded],
  actionObject: typeof ActionType,
  client: typeof AhpClient,
  hosts: typeof MultiHostClient,
  ws: typeof WebSocketTransport,
};
const expected = {
  action: 'root/activeSessionsChanged',
  response: 'markdown',
  policy: 'enabled',
  status: 24,
  inProgress: 8,
  statusName: 'InputNeeded',
  actionObject: 'object',
  client: 'function',
  hosts: 'function',
  ws: 'function',
};
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected package exports: ${JSON.stringify(actual)}`);
}
