import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import { unlinkSync } from 'node:fs';
import { AhpClient } from '../../clients/typescript/src/client/client.js';
import type { InitializeResult } from '../../clients/typescript/src/types/common/commands.js';
import { ActionType } from '../../clients/typescript/src/types/common/actions.js';
import type {
  ChatPendingMessageSetAction, ChatTurnCancelledAction, ChatTurnStartedAction,
} from '../../clients/typescript/src/types/channels-chat/actions.js';
import { ChatInteractivity, MessageKind, PendingMessageKind } from '../../clients/typescript/src/types/channels-chat/state.js';
import type { SessionActiveClientSetAction } from '../../clients/typescript/src/types/channels-session/actions.js';
import { SessionLifecycle } from '../../clients/typescript/src/types/channels-session/state.js';
import { SUPPORTED_PROTOCOL_VERSIONS, compareProtocolVersions } from '../../clients/typescript/src/types/version/registry.js';
import { Capture, frameRecord, type Frame } from './capture.js';
import { describeHost, describeResource, dispatchable, requestPolicy } from './catalog.js';
import { channel, CliError, errorRecord, object, redact } from './common.js';
import { ObservedTransport, openTransport } from './connection.js';
import {
  instancePaths, operationFingerprint, OperationJournal, publicMetadata, readMetadata,
  saveMetadata, serializeIntent, type InstanceMetadata,
} from './controller-store.js';

export type OperationState =
  'recorded' | 'submitted' | 'transport_completed' | 'accepted' | 'rejected' | 'refused' | 'uncertain';

export interface Operation extends Record<string, unknown> {
  opId: string;
  command: string;
  fingerprint: string;
  state: OperationState;
  channel: string;
  turnId?: string;
  messageId?: string;
  clientSeq?: number;
  actionType?: string;
  minimumSeq?: number;
  completion?: 'completed' | 'cancelled' | 'error';
  error?: Record<string, unknown>;
  result?: unknown;
}

export function publicOperation(operation: Operation): Record<string, unknown> {
  const { fingerprint: _fingerprint, minimumSeq: _minimumSeq, ...result } = operation;
  return result;
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /\s/.test(value)) {
    throw new CliError('usage', `${name} must be a nonempty identifier of at most 200 characters`);
  }
  return value;
}

function messageText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new CliError('usage', 'Message must not be empty');
  return value;
}

class Controller {
  readonly secrets: string[] = [];
  readonly operations = new Map<string, Operation>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly journal: OperationJournal;
  private capture?: Capture;
  private client?: AhpClient;
  private initialization?: InitializeResult;
  private transport?: ObservedTransport;
  private queue = Promise.resolve();
  private clientSeq = 0;
  private timeoutMs = 30_000;
  private starting = false;
  private ending = false;
  private queuedBytes = 0;
  private queuedCount = 0;
  private readonly abort = new AbortController();

  constructor(
    readonly metadata: InstanceMetadata,
    private readonly end: (error?: unknown) => Promise<void>,
  ) {
    this.journal = new OperationJournal(instancePaths(metadata.instance).journal);
  }

  async initialize(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.starting || this.metadata.state !== 'starting') throw new CliError('instance', 'Controller already initialized');
    this.starting = true;
    try {
      if (typeof config.url !== 'string') throw new CliError('usage', 'Specify --url or AHP_URL');
      const url = new URL(config.url);
      if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
        throw new CliError('usage', 'Endpoint must be ws:// or wss:// without userinfo or a fragment');
      }
      for (const [key, value] of url.searchParams) {
        if (/token|secret|password|key|authorization/i.test(key) && value) this.secrets.push(value);
      }
      if (typeof config.timeoutMs !== 'number' || !Number.isSafeInteger(config.timeoutMs)
        || config.timeoutMs < 1 || config.timeoutMs > 3_600_000) throw new CliError('usage', 'Invalid request timeout');
      this.timeoutMs = config.timeoutMs;
      const versions = config.versions ?? [...SUPPORTED_PROTOCOL_VERSIONS];
      if (!Array.isArray(versions) || !versions.length || !versions.every(v => typeof v === 'string')) {
        throw new CliError('usage', 'Invalid protocol versions');
      }
      for (const version of versions) compareProtocolVersions(version, version);
      const auth = config.auth;
      if (auth !== undefined) {
        if (!object(auth) || auth.channel !== 'ahp-root://' || typeof auth.resource !== 'string'
          || !auth.resource || typeof auth.token !== 'string') throw new CliError('usage', 'Invalid authentication parameters');
        if (auth.token) this.secrets.push(auth.token);
      }
      if (typeof config.maxBytes !== 'number' || !Number.isSafeInteger(config.maxBytes)
        || config.maxBytes < 4096 || config.maxBytes > 1024 * 1024 * 1024) throw new CliError('usage', 'Invalid capture cap');
      this.capture = new Capture(instancePaths(this.metadata.instance).events, config.maxBytes, this.secrets, true);
      this.transport = new ObservedTransport(
        await openTransport(config.url, this.timeoutMs, this.abort.signal),
        async frame => {
          this.capture!.append(frameRecord(frame, config.includeContent === true));
          this.observe(frame);
        },
        error => { void this.end(error); },
      );
      this.client = new AhpClient(this.transport, { requestTimeoutMs: this.timeoutMs });
      const states = this.client.stateChanges();
      this.client.connect();
      void (async () => {
        for await (const state of states) {
          if (state.status === 'closed' && state.reason.type === 'transport') {
            await this.end(state.reason.error);
          }
        }
      })().catch(error => { void this.end(error); });
      const init = await this.client.initialize({ clientId: this.metadata.clientId, protocolVersions: versions });
      if (!object(init) || typeof init.protocolVersion !== 'string' || !versions.includes(init.protocolVersion)) {
        throw new CliError('protocol', 'Host selected an unoffered protocol version');
      }
      this.initialization = init;
      if (auth !== undefined) await this.client.requestRaw('authenticate', auth);
      const session = await this.snapshot(this.metadata.session);
      this.readySession(session.state);
      const chat = channel(session.state.defaultChat);
      if (!chat.startsWith('ahp-chat:/')) throw new CliError('protocol', 'Session defaultChat is not a chat URI');
      if (!this.boundChat(session.state, chat)) throw new CliError('protocol', 'Default chat is absent from the session catalog');
      await this.snapshot(chat);
      if (this.ending) throw new CliError('instance', 'Controller stopped before readiness');
      this.metadata.chat = chat;
      this.metadata.protocolVersion = init.protocolVersion;
      this.metadata.state = 'ready';
      saveMetadata(this.metadata);
      return publicMetadata(this.metadata);
    } catch (error) {
      await this.end(error);
      throw error;
    }
  }

  private readySession(state: Record<string, unknown>): void {
    if (state.lifecycle !== SessionLifecycle.Ready || !Array.isArray(state.chats) || !Array.isArray(state.activeClients)) {
      throw new CliError('protocol', 'Expected a ready session with chats and plural activeClients');
    }
  }

  private boundChat(state: Record<string, unknown>, chat: string): boolean {
    return Array.isArray(state.chats) && state.chats.some(item => object(item) && item.resource === chat);
  }

  private async snapshot(uri: string): Promise<{ state: Record<string, unknown>; fromSeq: number }> {
    const result = await this.client!.request('subscribe', { channel: uri });
    if (!object(result)) throw new CliError('protocol', 'Invalid subscription response');
    const snapshot = result.snapshot;
    if (!object(snapshot) || snapshot.resource !== uri || !object(snapshot.state) || typeof snapshot.fromSeq !== 'number'
      || !Number.isSafeInteger(snapshot.fromSeq) || snapshot.fromSeq < 0) {
      throw new CliError('protocol', 'Invalid or missing authoritative snapshot');
    }
    return { state: snapshot.state, fromSeq: snapshot.fromSeq };
  }

  async execute(command: string, args: Record<string, unknown>): Promise<unknown> {
    if (command === 'status') return publicMetadata(this.metadata);
    if (command === 'operation') {
      const opId = identifier(args.opId, '--op-id');
      const operation = this.operations.get(opId);
      if (!operation) throw new CliError('operation', 'Unknown operation ID');
      return publicOperation(operation);
    }
    if (command === 'stop') return publicMetadata(this.metadata);
    if (this.metadata.state !== 'ready' || this.ending) throw new CliError('instance', 'Controller is not ready');
    if (command === 'describe') {
      const uri = args.channel === undefined ? undefined : channel(args.channel);
      const resource = uri === undefined ? undefined
        : describeResource(uri, await this.client!.request('subscribe', { channel: uri }));
      return describeHost(this.initialization!, resource);
    }
    if (command === 'ping') { await this.client!.ping(); return null; }
    if (command === 'sessions') return this.client!.requestRaw('listSessions', {
      channel: 'ahp-root://',
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      ...(args.pageSize !== undefined ? { limit: args.pageSize } : {}),
    });
    if (command === 'snapshot') return this.client!.request('subscribe', { channel: channel(args.channel) });
    if (command === 'request') {
      if (typeof args.method !== 'string' || !/^\S+$/.test(args.method) || !object(args.params)) {
        throw new CliError('usage', 'request requires a method and JSON parameters');
      }
      channel(args.params.channel);
      const policy = requestPolicy(args.method);
      if (policy === 'lifecycle') throw new CliError('usage', 'Lifecycle methods are owned by the controller');
      if (policy === 'read') return this.client!.requestRaw(args.method, args.params);
    }
    if (!['participate', 'send', 'steer', 'cancel', 'dispatch', 'request'].includes(command)) {
      throw new CliError('usage', 'Unknown controller command');
    }
    if (this.metadata.observer) throw new CliError('observer', 'Observer-only instances cannot submit mutations');
    if ((command === 'request' || command === 'dispatch') && args.confirm !== true) {
      throw new CliError('usage', 'Raw mutations require --confirm');
    }
    const opId = identifier(args.opId, '--op-id');
    if (['send', 'steer'].includes(command)) messageText(args.text);
    if (['steer', 'cancel'].includes(command)) identifier(args.turn, '--turn');
    if (command === 'dispatch') {
      channel(args.channel);
      if (!object(args.action) || typeof args.action.type !== 'string' || !dispatchable(args.action.type)) {
        throw new CliError('usage', 'Action must be known and client-dispatchable');
      }
      if (args.action.type === ActionType.SessionActiveClientSet
        && (!object(args.action.activeClient) || args.action.activeClient.clientId !== this.metadata.clientId)) {
        throw new CliError('usage', 'An instance may only register its own client identity');
      }
    }
    const intent = serializeIntent(command, args);
    const fingerprint = operationFingerprint(command, args);
    const existing = this.operations.get(opId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new CliError('operation', 'Operation ID was already used with different inputs');
      return publicOperation(existing);
    }
    if (this.operations.size >= 10_000) throw new CliError('operation', 'Controller operation limit exceeded');
    const intentBytes = Buffer.byteLength(intent);
    if (this.queuedCount >= 128 || this.queuedBytes + intentBytes > 16 * 1024 * 1024) {
      throw new CliError('operation', 'Submission queue is full; no intent was recorded or submitted');
    }
    const operation: Operation = {
      opId, command, fingerprint, state: 'recorded',
      channel: command === 'participate' ? this.metadata.session
        : command === 'dispatch' ? channel(args.channel)
          : command === 'request' && object(args.params) ? channel(args.params.channel) : this.metadata.chat!,
      ...(command === 'send' ? { turnId: args.turn === undefined ? randomUUID() : identifier(args.turn, '--turn') } : {}),
      ...(['steer', 'cancel'].includes(command) ? { turnId: identifier(args.turn, '--turn') } : {}),
      ...(command === 'steer' ? { messageId: randomUUID() } : {}),
    };
    this.update(operation);
    this.queuedCount++;
    this.queuedBytes += intentBytes;
    this.queue = this.queue.then(async () => {
      try { await this.submit(operation, args); }
      finally { this.queuedCount--; this.queuedBytes -= intentBytes; }
    })
      .catch(error => this.end(error));
    return publicOperation(operation);
  }

  private update(operation: Operation, changes: Partial<Operation> = {}): void {
    const next: Operation = { ...operation, ...changes };
    if (next.error !== undefined) {
      const error = redact(next.error, this.secrets);
      if (!object(error)) throw new CliError('operation', 'Invalid operation error');
      next.error = error;
    }
    if (next.result !== undefined) next.result = redact(next.result, this.secrets);
    try { this.journal.append(next); }
    catch (error) { void this.end(error); throw error; }
    Object.assign(operation, next);
    this.operations.set(operation.opId, operation);
  }

  private async submit(operation: Operation, args: Record<string, unknown>): Promise<void> {
    let action: Record<string, unknown>;
    let fence = -1;
    try {
      if (this.ending) throw new CliError('instance', 'Controller is stopping');
      if (operation.command === 'request') {
        this.update(operation, { state: 'submitted' });
        const request = this.client!.requestRaw(String(args.method), args.params);
        this.armTimeout(operation);
        void request.then(
          result => {
            if (this.ending) return;
            this.update(operation, { state: 'accepted', result, error: undefined }); this.clearTimeout(operation);
          },
          error => {
            if (this.ending) return;
            this.update(operation, { state: errorRecord(error, false).category === 'rpc' ? 'rejected' : 'uncertain',
              error: errorRecord(error, false) });
            this.clearTimeout(operation);
          },
        ).catch(error => this.end(error));
        return;
      }
      if (['participate', 'send', 'steer', 'cancel'].includes(operation.command)) {
        const session = await this.snapshot(this.metadata.session);
        this.readySession(session.state);
        if (operation.command === 'participate') {
          fence = session.fromSeq;
          action = {
            type: ActionType.SessionActiveClientSet,
            activeClient: { clientId: this.metadata.clientId, displayName: 'ahp-cli', tools: [] },
          } satisfies SessionActiveClientSetAction;
        } else {
          if (!this.boundChat(session.state, this.metadata.chat!)) {
            throw new CliError('precondition', 'Retained chat is no longer bound to the session');
          }
          if (!Array.isArray(session.state.activeClients)
            || !session.state.activeClients.some(item => object(item) && item.clientId === this.metadata.clientId)) {
            throw new CliError('precondition', 'Register explicitly with participate before sending, steering or cancelling');
          }
          const chat = await this.snapshot(this.metadata.chat!);
          if (chat.state.interactivity !== undefined && chat.state.interactivity !== ChatInteractivity.Full) {
            throw new CliError('precondition', 'Chat is not fully interactive');
          }
          fence = chat.fromSeq;
          const active = chat.state.activeTurn;
          if (operation.command === 'send') {
            if (active !== undefined) throw new CliError('precondition', 'Chat already has an active turn; use steer with its exact ID');
            if (this.usedTurn(operation) || (Array.isArray(chat.state.turns)
              && chat.state.turns.some(turn => object(turn) && turn.id === operation.turnId))) {
              throw new CliError('precondition', 'Turn ID was already used; refusing another submission');
            }
            action = {
              type: ActionType.ChatTurnStarted, turnId: identifier(operation.turnId, 'turnId'),
              startedAt: new Date().toISOString(),
              message: { text: messageText(args.text), origin: { kind: MessageKind.User } },
            } satisfies ChatTurnStartedAction;
          } else {
            if (!object(active) || active.id !== operation.turnId) {
              throw new CliError('precondition', 'Exact requested turn is not active');
            }
            if (operation.command === 'steer') {
              if (chat.state.steeringMessage !== undefined) throw new CliError('precondition', 'A steering message is already pending');
              action = {
                type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Steering,
                id: identifier(operation.messageId, 'messageId'),
                message: { text: messageText(args.text), origin: { kind: MessageKind.User } },
              } satisfies ChatPendingMessageSetAction;
            } else action = {
              type: ActionType.ChatTurnCancelled,
              turnId: identifier(operation.turnId, 'turnId'), duration: 0,
            } satisfies ChatTurnCancelledAction;
          }
        }
      } else {
        const snapshot = await this.snapshot(operation.channel);
        fence = snapshot.fromSeq;
        if (!object(args.action)) throw new CliError('usage', 'Missing action');
        action = args.action;
        if (action.type === ActionType.ChatTurnStarted) {
          operation.turnId = identifier(action.turnId, 'turnId');
          if (this.usedTurn(operation)) throw new CliError('precondition', 'Turn ID already submitted in this journal');
        }
      }
      if (this.ending) throw new CliError('instance', 'Controller is stopping');
      const seq = ++this.clientSeq;
      this.update(operation, {
        state: 'submitted', clientSeq: seq, actionType: String(action.type), minimumSeq: fence,
      });
      this.armTimeout(operation);
      await this.transport!.send(JSON.stringify({
        jsonrpc: '2.0', method: 'dispatchAction',
        params: { channel: operation.channel, clientSeq: seq, action },
      }));
      if (operation.state === 'submitted') this.update(operation, { state: 'transport_completed' });
    } catch (error) {
      if (this.ending) return;
      this.clearTimeout(operation);
      this.update(operation, { state: operation.state === 'recorded' ? 'refused' : 'uncertain',
        error: errorRecord(error, false) });
      if (errorRecord(error, false).category === 'capture') await this.end(error);
    }
  }

  private usedTurn(operation: Operation): boolean {
    return [...this.operations.values()].some(other => other.opId !== operation.opId
      && other.channel === operation.channel && other.turnId === operation.turnId
      && other.actionType === ActionType.ChatTurnStarted && other.state !== 'refused');
  }

  private armTimeout(operation: Operation): void {
    this.timers.set(operation.opId, setTimeout(() => {
      try {
        this.update(operation, { state: 'uncertain',
          error: errorRecord(new CliError('timeout', 'No authoritative mutation outcome observed; do not resend'), false) });
        this.timers.delete(operation.opId);
      } catch (error) { void this.end(error); }
    }, this.timeoutMs));
  }

  private clearTimeout(operation: Operation): void {
    const timer = this.timers.get(operation.opId);
    if (timer) clearTimeout(timer);
    this.timers.delete(operation.opId);
  }

  private observe(frame: Frame): void {
    if (frame.direction !== 'in' || frame.method !== 'action' || !object(frame.message.params)) return;
    const params = frame.message.params;
    if (!object(params.action) || typeof params.action.type !== 'string'
      || typeof params.channel !== 'string' || typeof params.serverSeq !== 'number'
      || (params.rejectionReason !== undefined && typeof params.rejectionReason !== 'string')
      || (params.origin !== undefined && (!object(params.origin)
        || typeof params.origin.clientId !== 'string' || typeof params.origin.clientSeq !== 'number'
        || !Number.isSafeInteger(params.origin.clientSeq)))) {
      throw new CliError('protocol', 'Invalid action envelope');
    }
    const action = params.action;
    for (const operation of this.operations.values()) {
      if (params.channel !== operation.channel) continue;
      if (object(params.origin) && params.origin.clientId === this.metadata.clientId
        && params.origin.clientSeq === operation.clientSeq && operation.clientSeq !== undefined
        && action.type === operation.actionType && typeof params.serverSeq === 'number'
        && params.serverSeq > (operation.minimumSeq ?? -1)
        && !['refused', 'rejected', 'accepted'].includes(operation.state)) {
        this.clearTimeout(operation);
        this.update(operation, {
          state: params.rejectionReason === undefined ? 'accepted' : 'rejected',
          error: params.rejectionReason !== undefined
            ? errorRecord(new CliError('rejected', 'Host rejected dispatched action', params.rejectionReason), false) : undefined,
        });
      }
      if (params.rejectionReason === undefined && operation.turnId !== undefined
        && action.turnId === operation.turnId && !operation.completion
        && !['recorded', 'refused', 'rejected'].includes(operation.state)
        && typeof params.serverSeq === 'number' && params.serverSeq > (operation.minimumSeq ?? Number.MAX_SAFE_INTEGER)
        && [ActionType.ChatTurnComplete, ActionType.ChatTurnCancelled, ActionType.ChatError].some(type => type === action.type)
        && (operation.actionType === ActionType.ChatTurnStarted || operation.command === 'cancel')) {
        this.update(operation, { completion: action.type === ActionType.ChatTurnComplete ? 'completed'
          : action.type === ActionType.ChatTurnCancelled ? 'cancelled' : 'error' });
      }
    }
  }

  async shutdown(error?: unknown): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    this.abort.abort();
    let failure = error;
    try {
      for (const operation of this.operations.values()) {
        this.clearTimeout(operation);
        if (['recorded', 'submitted', 'transport_completed'].includes(operation.state)) {
          this.update(operation, { state: operation.state === 'recorded' ? 'refused' : 'uncertain',
            error: errorRecord(new CliError('instance', 'Controller ended before an authoritative outcome'), false) });
        }
      }
    } catch (journalError) { failure = journalError; }
    await this.client?.shutdown();
    await this.transport?.close();
    try { this.capture?.finish(failure === undefined ? 'completed' : 'failed', failure === undefined ? undefined : 'controller'); }
    catch (captureError) { failure = captureError; }
    this.journal.close();
    this.metadata.state = failure === undefined ? 'stopped' : 'failed';
    if (failure !== undefined) {
      const record = redact(errorRecord(failure, false), this.secrets);
      if (!object(record)) throw new CliError('instance', 'Invalid controller error');
      this.metadata.error = record;
    }
    saveMetadata(this.metadata);
  }
}

export async function controllerProcess(instance: string, signal: AbortSignal): Promise<number> {
  const metadata = readMetadata(instance);
  if (metadata.state !== 'starting' || metadata.pid !== 0) throw new CliError('instance', 'Controller generation is already occupied');
  metadata.pid = process.pid;
  saveMetadata(metadata);
  const sockets = new Set<Socket>();
  let finish: (value: number) => void = () => {};
  let ending = false;
  let initializationDeadline: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<number>(resolve => { finish = resolve; });
  const server = createServer(socket => {
    socket.on('error', () => { /* The invoking CLI may disconnect independently. */ });
    if (sockets.size >= 16) {
      socket.end(JSON.stringify({ ok: false, error: errorRecord(new CliError('instance', 'Too many local clients'), false) }) + '\n');
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.setTimeout(60_000, () => socket.destroy());
    let buffer = '';
    let received = false;
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      if (received) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) {
        received = true;
        socket.end(JSON.stringify({ ok: false, error: errorRecord(new CliError('usage', 'Local input exceeds 4 MiB'), false) }) + '\n');
        return;
      }
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      received = true;
      void (async () => {
        const request: unknown = JSON.parse(buffer.slice(0, newline));
        if (!object(request) || request.generation !== metadata.generation
          || typeof request.token !== 'string' || request.token.length !== metadata.token.length
          || !/^[a-f0-9]{64}$/.test(request.token)
          || !timingSafeEqual(Buffer.from(request.token), Buffer.from(metadata.token))
          || typeof request.command !== 'string' || !object(request.args)) {
          throw new CliError('instance', 'Invalid local controller credentials or request');
        }
        if (request.command === 'initialize') clearTimeout(initializationDeadline);
        const result = request.command === 'initialize'
          ? await controller.initialize(request.args) : await controller.execute(request.command, request.args);
        if (!socket.destroyed) socket.end(JSON.stringify(redact({ ok: true, result }, controller.secrets)) + '\n');
        if (request.command === 'stop') setImmediate(() => { void end(); });
      })().catch(error => {
        if (!socket.destroyed) socket.end(JSON.stringify(redact({ ok: false, error: errorRecord(error, false) }, controller.secrets)) + '\n');
      });
    });
  });
  const end = async (error?: unknown) => {
    if (ending) return;
    ending = true;
    try {
      await controller.shutdown(error);
    } catch (shutdownError) {
      process.stderr.write(JSON.stringify(redact(errorRecord(shutdownError, false), controller.secrets)) + '\n');
      error = shutdownError;
    } finally {
      server.close();
      for (const socket of sockets) socket.destroy();
      finish(error === undefined ? 0 : 1);
    }
  };
  const controller = new Controller(metadata, end);
  const interrupted = () => { void end(new CliError('interrupted', 'Controller interrupted')); };
  signal.addEventListener('abort', interrupted, { once: true });
  server.on('error', error => { void end(error); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(instancePaths(instance).socket, () => { server.removeListener('error', reject); resolve(); });
  });
  initializationDeadline = setTimeout(() => {
    if (metadata.state === 'starting') void end(new CliError('timeout', 'Controller initialization deadline exceeded'));
  }, 60_000);
  if (signal.aborted) interrupted();
  try { return await done; }
  finally {
    clearTimeout(initializationDeadline);
    signal.removeEventListener('abort', interrupted);
    if (process.platform !== 'win32') {
      try { unlinkSync(instancePaths(instance).socket); }
      catch (error) {
        if (!object(error) || error.code !== 'ENOENT') throw error;
      }
    }
  }
}
