import type { CommandMap } from '../../clients/typescript/src/types/common/messages.js';
import { IS_CLIENT_DISPATCHABLE } from '../../clients/typescript/src/types/action-origin.generated.js';
import { ACTION_INTRODUCED_IN, SUPPORTED_PROTOCOL_VERSIONS } from '../../clients/typescript/src/types/version/registry.js';

export const COMMAND_POLICY = {
  initialize: 'lifecycle',
  ping: 'read',
  reconnect: 'lifecycle',
  subscribe: 'lifecycle',
  createSession: 'write',
  disposeSession: 'write',
  createChat: 'write',
  moveChat: 'write',
  disposeChat: 'write',
  createTerminal: 'write',
  disposeTerminal: 'write',
  createResourceWatch: 'write',
  listSessions: 'read',
  resourceRead: 'read',
  resourceWrite: 'write',
  resourceList: 'read',
  resourceCopy: 'write',
  resourceDelete: 'write',
  resourceMove: 'write',
  resourceResolve: 'read',
  resourceMkdir: 'write',
  resourceRequest: 'write',
  fetchTurns: 'read',
  authenticate: 'lifecycle',
  resolveSessionConfig: 'read',
  sessionConfigCompletions: 'read',
  completions: 'read',
  invokeChangesetOperation: 'write',
  listAutomationTriggerDefinitions: 'read',
  runAutomation: 'write',
  fetchAutomationRuns: 'read',
} satisfies Record<keyof CommandMap, 'read' | 'write' | 'lifecycle'>;

export function requestPolicy(method: string): 'read' | 'write' | 'lifecycle' | 'extension' {
  if (!Object.hasOwn(COMMAND_POLICY, method)) return 'extension';
  return COMMAND_POLICY[method as keyof typeof COMMAND_POLICY];
}

export function dispatchable(type: string): boolean {
  return Object.hasOwn(IS_CLIENT_DISPATCHABLE, type)
    && IS_CLIENT_DISPATCHABLE[type as keyof typeof IS_CLIENT_DISPATCHABLE];
}

export function describeProtocol(): unknown {
  return {
    protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    commands: COMMAND_POLICY,
    actions: Object.entries(ACTION_INTRODUCED_IN).map(([type, introducedIn]) => ({
      type, introducedIn, clientDispatchable: dispatchable(type),
    })),
    transports: ['websocket'],
    outputVersion: 1,
    cli: {
      targeting: 'Explicit --url for one-shot commands; explicit --instance for controllers',
      controllers: {
        join: { inputs: ['instance', 'url', 'session'], mutation: false },
        listen: { inputs: ['instance', 'url', 'session'], mutation: false, observerOnly: true },
        status: { inputs: ['instance', 'op-id?'], mutation: false },
        events: { inputs: ['instance', 'after?', 'limit?', 'follow?', 'timeout?'], mutation: false },
        participate: { inputs: ['instance', 'op-id'], mutation: true },
        send: { inputs: ['instance', 'op-id', 'message-file', 'turn?'], mutation: true },
        steer: { inputs: ['instance', 'op-id', 'turn', 'message-file'], mutation: true },
        cancel: { inputs: ['instance', 'op-id', 'turn'], mutation: true },
        wait: { inputs: ['instance', 'op-id', 'until?', 'timeout?'], mutation: false },
        stop: { inputs: ['instance'], mutation: false, localOnly: true },
      },
      mutationRetry: 'Never resubmit; query a journaled operation using the same operation ID',
    },
  };
}
