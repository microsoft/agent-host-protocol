import { WebSocketServer, type WebSocket } from 'ws';

import {
  ActionType,
  PROTOCOL_VERSION,
  SessionLifecycle,
  SessionStatus,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from '../../../../../types/index.js';

const sessionUri = 'ahp-session:/dotnet-typescript-conformance';
const initialState: SessionState = {
  provider: 'typescript-conformance-host',
  title: 'Seeded by initialize',
  status: SessionStatus.Idle,
  lifecycle: SessionLifecycle.Creating,
  activeClients: [],
  chats: [],
};

const actions: readonly SessionAction[] = [
  { type: ActionType.SessionTitleChanged, title: 'Reduced by both implementations' },
  { type: ActionType.SessionIsReadChanged, isRead: true },
  { type: ActionType.SessionActivityChanged, activity: 'streaming' },
  { type: ActionType.SessionIsArchivedChanged, isArchived: true },
];

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly method: string;
  readonly params?: unknown;
}

function send(socket: WebSocket, value: unknown): void {
  socket.send(JSON.stringify(value));
}

function success(socket: WebSocket, id: number, result: unknown): void {
  send(socket, { jsonrpc: '2.0', id, result });
}

function failure(socket: WebSocket, id: number, code: number, message: string): void {
  send(socket, { jsonrpc: '2.0', id, error: { code, message } });
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<JsonRpcRequest>;
  return candidate.jsonrpc === '2.0'
    && typeof candidate.id === 'number'
    && typeof candidate.method === 'string';
}

function handleRequest(socket: WebSocket, request: JsonRpcRequest, initialized: { value: boolean }): void {
  if (request.method === 'initialize') {
    if (initialized.value) {
      failure(socket, request.id, -32600, 'initialize may only be sent once');
      return;
    }
    const params = request.params as {
      channel?: unknown;
      clientId?: unknown;
      protocolVersions?: unknown;
      initialSubscriptions?: unknown;
    } | undefined;
    const offered = params?.protocolVersions;
    const subscriptions = params?.initialSubscriptions;
    if (params?.channel !== 'ahp-root://'
      || typeof params.clientId !== 'string'
      || !Array.isArray(offered)
      || !offered.every(version => typeof version === 'string')
      || !offered.includes(PROTOCOL_VERSION)
      || !Array.isArray(subscriptions)
      || subscriptions.length !== 1
      || subscriptions[0] !== sessionUri) {
      failure(socket, request.id, -32602, 'invalid current-protocol initialize request');
      return;
    }
    initialized.value = true;
    success(socket, request.id, {
      protocolVersion: PROTOCOL_VERSION,
      serverSeq: 0,
      serverInfo: { name: 'repository-local-typescript-conformance-host', version: PROTOCOL_VERSION },
      snapshots: [{ resource: sessionUri, state: initialState, fromSeq: 0 }],
    });
    return;
  }

  if (request.method === 'interop/run') {
    if (!initialized.value) {
      failure(socket, request.id, -32002, 'initialize must be the first request');
      return;
    }
    const params = request.params as { channel?: unknown } | undefined;
    if (params?.channel !== sessionUri) {
      failure(socket, request.id, -32602, 'interop/run must target the seeded session');
      return;
    }
    let state = structuredClone(initialState);
    let serverSeq = 0;
    for (const action of actions) {
      state = sessionReducer(state, action);
      serverSeq += 1;
      send(socket, {
        jsonrpc: '2.0',
        method: 'action',
        params: { channel: sessionUri, action, serverSeq },
      });
    }
    success(socket, request.id, { actionCount: actions.length, finalState: state, serverSeq });
    return;
  }

  failure(socket, request.id, -32601, `unknown method: ${request.method}`);
}

const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
server.on('connection', socket => {
  const initialized = { value: false };
  socket.on('message', payload => {
    let decoded: unknown;
    try {
      decoded = JSON.parse(payload.toString());
    } catch {
      socket.close(1007, 'invalid JSON payload');
      return;
    }
    if (isRequest(decoded)) {
      handleRequest(socket, decoded, initialized);
    }
  });
});
server.on('listening', () => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  console.log(JSON.stringify({ type: 'ready', port: address.port }));
});
server.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});

function shutdown(): void {
  for (const socket of server.clients) {
    socket.close(1001, 'server shutting down');
  }
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
