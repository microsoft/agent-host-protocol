import type { CommandMap } from '../../clients/typescript/src/types/common/messages.js';
import type { InitializeResult } from '../../clients/typescript/src/types/common/commands.js';
import { IS_CLIENT_DISPATCHABLE } from '../../clients/typescript/src/types/action-origin.generated.js';
import { ACTION_INTRODUCED_IN, SUPPORTED_PROTOCOL_VERSIONS } from '../../clients/typescript/src/types/version/registry.js';
import { CliError, object } from './common.js';

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

interface ResourceDescription {
  channel: string;
  stateful: boolean;
  fromSeq?: number;
  metadata: Record<string, unknown> | null;
}

function metadata(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return null;
  if (!object(value)) throw new CliError('protocol', 'Expected _meta to be an object');
  return value;
}

export function describeResource(channel: string, subscription: unknown): ResourceDescription {
  if (!object(subscription)) throw new CliError('protocol', 'Invalid subscription response');
  const snapshot = subscription.snapshot;
  if (snapshot === undefined) return { channel, stateful: false, metadata: null };
  if (!object(snapshot) || snapshot.resource !== channel || !object(snapshot.state)
    || typeof snapshot.fromSeq !== 'number' || !Number.isSafeInteger(snapshot.fromSeq) || snapshot.fromSeq < 0) {
    throw new CliError('protocol', 'Invalid or mismatched subscription snapshot');
  }
  return { channel, stateful: true, fromSeq: snapshot.fromSeq, metadata: metadata(snapshot.state._meta) };
}

export function describeHost(host: InitializeResult, resource?: ResourceDescription): unknown {
  return {
    protocol: describeProtocol(),
    host,
    metadata: {
      host: metadata(host._meta),
      ...(resource ? { resource: resource.metadata } : {}),
    },
    ...(resource ? { resource: {
      channel: resource.channel, stateful: resource.stateful,
      ...(resource.fromSeq !== undefined ? { fromSeq: resource.fromSeq } : {}),
    } } : {}),
  };
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
        describe: { inputs: ['instance', 'channel?'], mutation: false },
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
