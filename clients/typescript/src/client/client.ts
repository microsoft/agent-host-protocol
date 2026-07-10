/**
 * Async JSON-RPC client for the Agent Host Protocol.
 *
 * Mirrors the surface of the Rust `ahp::Client`: a transport-agnostic
 * client that runs a background receive loop over a pluggable
 * {@link AhpTransport}, exposes typed `initialize` / `reconnect` /
 * `subscribe` / `dispatch` helpers, and fans inbound notifications out to
 * per-URI {@link Subscription}s and a top-level {@link AhpClient.events}
 * stream.
 *
 * @module client/client
 */

import type { StateAction } from '../types/actions.js';
import type {
  DispatchActionParams,
  InitializeParams,
  InitializeResult,
  PingParams,
  ReconnectParams,
  ReconnectResult,
  ResourceReadParams,
  ResourceReadResult,
  ResourceWriteParams,
  ResourceWriteResult,
  ResourceListParams,
  ResourceListResult,
  ResourceCopyParams,
  ResourceCopyResult,
  ResourceDeleteParams,
  ResourceDeleteResult,
  ResourceMoveParams,
  ResourceMoveResult,
  ResourceResolveParams,
  ResourceResolveResult,
  ResourceMkdirParams,
  ResourceMkdirResult,
  ResourceRequestParams,
  ResourceRequestResult,
  SubscribeParams,
  SubscribeView,
  SubscriptionDeliveryOptions,
  SubscribeResult,
  UnsubscribeParams,
} from '../types/common/commands.js';
import type {
  CreateResourceWatchParams,
  CreateResourceWatchResult,
} from '../types/channels-resource-watch/commands.js';
import type {
  CommandMap,
  ClientNotificationMap,
  JsonRpcErrorResponse,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  ProtocolMessage,
  ServerCommandMap,
} from '../types/common/messages.js';
import type { ActionEnvelope } from '../types/common/actions.js';
import type {
  SessionAddedParams,
  SessionRemovedParams,
  SessionSummaryChangedParams,
} from '../types/channels-root/notifications.js';
import type { AuthRequiredParams } from '../types/common/notifications.js';
import type { URI } from '../types/common/state.js';
import { JsonRpcErrorCodes } from '../types/common/errors.js';
import { AsyncBroadcastQueue } from './async-queue.js';
import type { ClientEvent, ConnectionState, SubscriptionEvent } from './events.js';
import {
  ClientClosedError,
  RpcError,
  RpcTimeoutError,
  TransportError,
} from './error.js';
import {
  type AhpTransport,
  type JsonRpcMessage,
  type TransportFrame,
  decodeMessage,
} from './transport.js';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Configuration for an {@link AhpClient}. */
export interface AhpClientConfig {
  /**
   * Maximum time in milliseconds to wait for a request to resolve before
   * failing with {@link RpcTimeoutError}. Default `30000`. Set to `0` or
   * a negative number to disable the default timeout.
   */
  requestTimeoutMs?: number;
  /**
   * Maximum number of events buffered per subscription. Slow consumers
   * that lag by more than this many events will skip the gap (oldest
   * events are dropped). Default `4096`.
   */
  subscriptionBuffer?: number;
}

/** Optional preferences for a `subscribe` request. */
export interface SubscribeOptions {
  /** Advisory delivery preferences for this subscription. */
  delivery?: SubscriptionDeliveryOptions;
  /** Optional client-requested shape for the returned snapshot. */
  view?: SubscribeView;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_SUBSCRIPTION_BUFFER = 4096;

/** Silently discard a rejected promise. */
function noop(): void { /* intentionally empty */ }

// ─── Handles ─────────────────────────────────────────────────────────────────

/**
 * Handle to a single resource subscription. Iterate to receive
 * {@link SubscriptionEvent}s. Call {@link Subscription.close} to terminate
 * this consumer's iterator (the server-side subscription is released only
 * when {@link AhpClient.unsubscribe} is called for this URI).
 */
export class Subscription implements AsyncIterableIterator<SubscriptionEvent> {
  /** Channel URI this subscription is bound to. */
  readonly uri: URI;
  /** @internal */
  private readonly inner: AsyncIterableIterator<SubscriptionEvent>;

  /** @internal */
  constructor(uri: URI, inner: AsyncIterableIterator<SubscriptionEvent>) {
    this.uri = uri;
    this.inner = inner;
  }

  next(): Promise<IteratorResult<SubscriptionEvent>> {
    return this.inner.next();
  }

  return(): Promise<IteratorResult<SubscriptionEvent>> {
    return this.inner.return ? this.inner.return() : Promise.resolve({ value: undefined as unknown as SubscriptionEvent, done: true });
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  /** Terminate this consumer's iterator. Does not unsubscribe server-side. */
  async close(): Promise<void> {
    await this.return();
  }
}

/** Result of {@link AhpClient.dispatch}. */
export interface DispatchHandle {
  /** Client-local sequence number assigned to this dispatch. */
  readonly clientSeq: number;
}

/**
 * Handler for inbound server-initiated requests. Should return a value
 * matching the corresponding `ServerCommandMap[M]['result']`, or throw an
 * {@link RpcError} to send back an error response.
 */
export type ServerRequestHandler = <M extends keyof ServerCommandMap>(
  method: M,
  params: ServerCommandMap[M]['params'],
) => Promise<ServerCommandMap[M]['result']>;

/**
 * Typed per-method handlers for inbound server-initiated resource requests.
 *
 * Every method of {@link ServerCommandMap} (the symmetrical `resource*`
 * family) maps to an optional handler that receives the decoded params and
 * returns — or resolves to — the matching result. This is the typed layer
 * over the generic {@link ServerRequestHandler}: install it with
 * {@link AhpClient.setResourceRequestHandlers}, or compose it yourself with
 * {@link createResourceRequestHandler}. A method left undefined is reported
 * back to the peer as JSON-RPC `MethodNotFound`.
 */
export type ResourceRequestHandlers = {
  [M in keyof ServerCommandMap]?: (
    params: ServerCommandMap[M]['params'],
  ) => Promise<ServerCommandMap[M]['result']> | ServerCommandMap[M]['result'];
};

/**
 * Compose a set of typed per-method {@link ResourceRequestHandlers} into a
 * single {@link ServerRequestHandler} suitable for
 * {@link AhpClient.setServerRequestHandler}. Requests whose method has no
 * registered handler reject with a JSON-RPC `MethodNotFound` {@link RpcError}.
 */
export function createResourceRequestHandler(
  handlers: ResourceRequestHandlers,
): ServerRequestHandler {
  return (async (method: keyof ServerCommandMap, params: unknown) => {
    const handler = handlers[method] as
      | ((p: unknown) => Promise<unknown> | unknown)
      | undefined;
    if (!handler) {
      throw new RpcError(
        JsonRpcErrorCodes.MethodNotFound,
        `no handler for server method "${method}"`,
      );
    }
    return handler(params);
  }) as ServerRequestHandler;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  method: string;
  timer: ReturnType<typeof setTimeout> | null;
}

// ─── Client ──────────────────────────────────────────────────────────────────

/**
 * Async JSON-RPC client driving a pluggable {@link AhpTransport}.
 *
 * The receive loop is started by {@link AhpClient.connect} and runs until
 * the transport closes or {@link AhpClient.shutdown} is called. In-flight
 * requests reject with {@link ClientClosedError} when the client is shut
 * down.
 */
export class AhpClient {
  private readonly transport: AhpTransport;
  private readonly requestTimeoutMs: number;
  private readonly subscriptionBuffer: number;

  private readonly pending = new Map<number, PendingRequest>();
  private readonly subscriptions = new Map<URI, AsyncBroadcastQueue<SubscriptionEvent>>();
  private readonly allEvents = new AsyncBroadcastQueue<ClientEvent>();
  private readonly stateQueue = new AsyncBroadcastQueue<ConnectionState>();

  private nextRequestId = 1;
  private nextClientSeq = 1;
  private state: ConnectionState = { status: 'idle' };
  private receiveLoop: Promise<void> | null = null;
  private serverRequestHandler: ServerRequestHandler | null = null;

  constructor(transport: AhpTransport, config: AhpClientConfig = {}) {
    this.transport = transport;
    const timeout = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.requestTimeoutMs = timeout > 0 ? timeout : 0;
    const buffer = config.subscriptionBuffer ?? DEFAULT_SUBSCRIPTION_BUFFER;
    // Clamp to >= 1 so the queue can deliver at least one value to
    // already-parked readers without immediately being trimmed.
    this.subscriptionBuffer = buffer >= 1 ? Math.floor(buffer) : 1;
  }

  /** Current connection state. */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /** AsyncIterable stream of connection-state transitions. */
  stateChanges(): AsyncIterableIterator<ConnectionState> {
    return this.stateQueue.reader();
  }

  /**
   * Top-level fan-in stream of every inbound event from this client.
   *
   * Each call returns a fresh independent iterator. Events are also
   * delivered to the matching per-URI {@link Subscription}.
   */
  events(): AsyncIterableIterator<ClientEvent> {
    return this.allEvents.reader();
  }

  /**
   * Install a handler for server-initiated requests
   * ({@link ServerCommandMap}). If no handler is installed, the client
   * responds with a JSON-RPC `MethodNotFound` error so the server does
   * not leak pending requests.
   */
  setServerRequestHandler(handler: ServerRequestHandler | null): void {
    this.serverRequestHandler = handler;
  }

  /**
   * Install typed per-method handlers for inbound server-initiated resource
   * requests ({@link ServerCommandMap}). Sugar over
   * {@link AhpClient.setServerRequestHandler} +
   * {@link createResourceRequestHandler}: a method left undefined is reported
   * to the peer as JSON-RPC `MethodNotFound`. Pass `null` to clear the
   * installed handler.
   */
  setResourceRequestHandlers(handlers: ResourceRequestHandlers | null): void {
    this.setServerRequestHandler(
      handlers ? createResourceRequestHandler(handlers) : null,
    );
  }

  /**
   * Start the inbound receive loop. Idempotent — calling more than once
   * is a no-op.
   */
  connect(): void {
    if (this.receiveLoop) return;
    this.setState({ status: 'connected' });
    this.receiveLoop = this.driveTransport();
  }

  /**
   * Gracefully shut down the client. Closes the transport, rejects every
   * pending request with {@link ClientClosedError}, and terminates all
   * subscription and event streams.
   */
  async shutdown(): Promise<void> {
    if (this.state.status === 'closing' || this.state.status === 'closed') return;
    this.setState({ status: 'closing' });
    // Tear down first so pending requests reject with ClientClosedError
    // rather than racing against the receive loop seeing the transport
    // close (which would reject with TransportError instead).
    this.tearDown({ type: 'shutdown' });
    try {
      await this.transport.close();
    } catch {
      // best-effort close
    }
    if (this.receiveLoop) {
      try {
        await this.receiveLoop;
      } catch {
        // already surfaced via tearDown
      }
    }
  }

  // ─── Typed protocol helpers ────────────────────────────────────────────────

  /**
   * Send the `initialize` handshake. MUST be the first request after
   * {@link AhpClient.connect}.
   */
  async initialize(args: {
    clientId: string;
    protocolVersions: readonly string[];
    initialSubscriptions?: readonly URI[];
    locale?: string;
  }): Promise<InitializeResult> {
    const params: InitializeParams = {
      channel: 'ahp-root://',
      clientId: args.clientId,
      protocolVersions: [...args.protocolVersions],
      ...(args.initialSubscriptions && args.initialSubscriptions.length > 0
        ? { initialSubscriptions: [...args.initialSubscriptions] }
        : {}),
      ...(args.locale !== undefined ? { locale: args.locale } : {}),
    };
    return this.request('initialize', params);
  }

  /** Re-establish a dropped connection. */
  async reconnect(args: {
    clientId: string;
    lastSeenServerSeq: number;
    subscriptions: readonly URI[];
  }): Promise<ReconnectResult> {
    const params: ReconnectParams = {
      channel: 'ahp-root://',
      clientId: args.clientId,
      lastSeenServerSeq: args.lastSeenServerSeq,
      subscriptions: [...args.subscriptions],
    };
    return this.request('reconnect', params);
  }

  /**
   * Subscribe to a URI and obtain a {@link Subscription} that streams
   * subsequent events. The returned subscription is registered locally
   * before the `subscribe` request is sent, so no events delivered during
   * the round-trip are missed.
   */
  async subscribe(
    uri: URI,
    options: SubscribeOptions = {},
  ): Promise<{ result: SubscribeResult; subscription: Subscription }> {
    const subscription = this.attachSubscription(uri);
    try {
      const params: SubscribeParams = {
        channel: uri,
        ...(options.delivery ? { delivery: options.delivery } : {}),
        ...(options.view ? { view: options.view } : {}),
      };
      const result = await this.request('subscribe', params);
      return { result, subscription };
    } catch (err) {
      await subscription.close();
      throw err;
    }
  }

  /**
   * Attach a new local {@link Subscription} without sending a `subscribe`
   * request — use this when the URI was included in `initialSubscriptions`
   * during {@link AhpClient.initialize}, or to add an additional consumer
   * for a URI that is already subscribed.
   *
   * Throws {@link ClientClosedError} after the client has been shut down.
   */
  attachSubscription(uri: URI): Subscription {
    this.assertOpen();
    let queue = this.subscriptions.get(uri);
    if (!queue) {
      queue = new AsyncBroadcastQueue<SubscriptionEvent>(this.subscriptionBuffer);
      this.subscriptions.set(uri, queue);
    }
    return new Subscription(uri, queue.reader());
  }

  /**
   * Send an `unsubscribe` notification and drop the local fan-out for
   * this URI. Any active {@link Subscription} iterators terminate.
   *
   * No-op after the client has been shut down.
   */
  async unsubscribe(uri: URI): Promise<void> {
    if (this.isClosed()) return;
    const queue = this.subscriptions.get(uri);
    if (queue) {
      this.subscriptions.delete(uri);
      queue.close();
    }
    const params: UnsubscribeParams = { channel: uri };
    this.notify('unsubscribe', params);
    return Promise.resolve();
  }

  /**
   * Fire a write-ahead `dispatchAction` notification.
   *
   * If `clientSeq` is omitted, the client uses its internal monotonic
   * counter. If supplied, the counter advances to `max(current,
   * clientSeq + 1)` so subsequent auto-assigned sequences remain
   * monotonic.
   *
   * Throws {@link ClientClosedError} after the client has been shut down.
   */
  dispatch(channel: URI, action: StateAction, clientSeq?: number): DispatchHandle {
    this.assertOpen();
    const seq = clientSeq ?? this.nextClientSeq;
    if (clientSeq !== undefined) {
      if (seq + 1 > this.nextClientSeq) this.nextClientSeq = seq + 1;
    } else {
      this.nextClientSeq = seq + 1;
    }
    const params: DispatchActionParams = { channel, clientSeq: seq, action };
    this.notify('dispatchAction', params);
    return { clientSeq: seq };
  }

  /**
   * Protocol-level liveness ping. Useful in browsers, which cannot send
   * WebSocket ping frames directly.
   *
   * `ping` is a connection-level command; its channel is always
   * `ahp-root://`.
   */
  async ping(): Promise<void> {
    const params: PingParams = { channel: 'ahp-root://' };
    await this.request('ping', params);
  }

  // ─── Resource commands ─────────────────────────────────────────────────────
  //
  // Typed convenience wrappers over the symmetrical `resource*` family. Each
  // targets the root channel (`ahp-root://`), so callers omit `channel`. The
  // reverse direction — a server calling these on the client — is handled via
  // {@link AhpClient.setResourceRequestHandlers}.

  /** Read the content of a resource by URI (`resourceRead`). */
  async resourceRead(
    params: Omit<ResourceReadParams, 'channel'>,
  ): Promise<ResourceReadResult> {
    return this.request('resourceRead', { ...params, channel: 'ahp-root://' });
  }

  /** Write content to a file on the receiver's filesystem (`resourceWrite`). */
  async resourceWrite(
    params: Omit<ResourceWriteParams, 'channel'>,
  ): Promise<ResourceWriteResult> {
    return this.request('resourceWrite', { ...params, channel: 'ahp-root://' });
  }

  /** List directory entries at a file URI (`resourceList`). */
  async resourceList(
    params: Omit<ResourceListParams, 'channel'>,
  ): Promise<ResourceListResult> {
    return this.request('resourceList', { ...params, channel: 'ahp-root://' });
  }

  /** Copy a resource from one URI to another (`resourceCopy`). */
  async resourceCopy(
    params: Omit<ResourceCopyParams, 'channel'>,
  ): Promise<ResourceCopyResult> {
    return this.request('resourceCopy', { ...params, channel: 'ahp-root://' });
  }

  /** Delete a resource at a URI (`resourceDelete`). */
  async resourceDelete(
    params: Omit<ResourceDeleteParams, 'channel'>,
  ): Promise<ResourceDeleteResult> {
    return this.request('resourceDelete', { ...params, channel: 'ahp-root://' });
  }

  /** Move (rename) a resource from one URI to another (`resourceMove`). */
  async resourceMove(
    params: Omit<ResourceMoveParams, 'channel'>,
  ): Promise<ResourceMoveResult> {
    return this.request('resourceMove', { ...params, channel: 'ahp-root://' });
  }

  /** Resolve a resource — `stat` + `realpath` (`resourceResolve`). */
  async resourceResolve(
    params: Omit<ResourceResolveParams, 'channel'>,
  ): Promise<ResourceResolveResult> {
    return this.request('resourceResolve', { ...params, channel: 'ahp-root://' });
  }

  /** Create a directory with `mkdir -p` semantics (`resourceMkdir`). */
  async resourceMkdir(
    params: Omit<ResourceMkdirParams, 'channel'>,
  ): Promise<ResourceMkdirResult> {
    return this.request('resourceMkdir', { ...params, channel: 'ahp-root://' });
  }

  /** Request permission to access a resource (`resourceRequest`). */
  async resourceRequest(
    params: Omit<ResourceRequestParams, 'channel'>,
  ): Promise<ResourceRequestResult> {
    return this.request('resourceRequest', { ...params, channel: 'ahp-root://' });
  }

  /**
   * Create a resource watcher (`createResourceWatch`). Returns the
   * `ahp-resource-watch:/<id>` channel URI; {@link AhpClient.subscribe} to it
   * to receive change events, and {@link AhpClient.unsubscribe} to release the
   * watcher.
   */
  async createResourceWatch(
    params: Omit<CreateResourceWatchParams, 'channel'>,
  ): Promise<CreateResourceWatchResult> {
    return this.request('createResourceWatch', {
      ...params,
      channel: 'ahp-root://',
    });
  }

  // ─── Lower-level JSON-RPC ──────────────────────────────────────────────────

  /** Send a JSON-RPC request and await its result. */
  async request<M extends keyof CommandMap>(
    method: M,
    params: CommandMap[M]['params'],
  ): Promise<CommandMap[M]['result']> {
    this.assertOpen();
    const id = this.nextRequestId++;
    const msg: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method: method as string,
      params,
    };

    return new Promise<CommandMap[M]['result']>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: value => resolve(value as CommandMap[M]['result']),
        reject,
        method: method as string,
        timer: null,
      };
      this.pending.set(id, pending);

      if (this.requestTimeoutMs > 0) {
        pending.timer = setTimeout(() => {
          if (this.pending.delete(id)) {
            reject(new RpcTimeoutError(method as string, this.requestTimeoutMs));
          }
        }, this.requestTimeoutMs);
      }

      this.sendMessage(msg).catch(err => {
        if (this.pending.delete(id)) {
          if (pending.timer) clearTimeout(pending.timer);
          reject(err);
        }
      });
    });
  }

  /**
   * Send a JSON-RPC notification (fire-and-forget).
   *
   * Throws {@link ClientClosedError} after the client has been shut down.
   * Transport-level send failures surface synchronously via
   * {@link AhpClient.connectionState} (the receive loop also tears down
   * on the next inbound failure).
   */
  notify<M extends keyof ClientNotificationMap>(
    method: M,
    params: ClientNotificationMap[M]['params'],
  ): void {
    this.assertOpen();
    const msg: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: method as string,
      params,
    };
    // Send failures tear down the client via `sendMessage`; swallow the
    // rejection here so a fire-and-forget notify never produces an
    // unhandled promise rejection.
    this.sendMessage(msg).catch(noop);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private isClosed(): boolean {
    return this.state.status === 'closing' || this.state.status === 'closed';
  }

  private assertOpen(): void {
    if (this.isClosed()) throw new ClientClosedError();
  }

  private async sendMessage(msg: JsonRpcMessage): Promise<void> {
    try {
      await this.transport.send(msg);
    } catch (err) {
      const te = err instanceof TransportError
        ? err
        : new TransportError('io', `transport send failed: ${(err as Error).message}`, { cause: err });
      this.tearDown({ type: 'transport', error: te });
      throw te;
    }
  }

  private setState(next: ConnectionState): void {
    this.state = next;
    this.stateQueue.publish(next);
  }

  private tearDown(reason: { type: 'shutdown' } | { type: 'transport'; error: TransportError }): void {
    if (this.state.status === 'closed') return;
    this.setState({ status: 'closed', reason });

    // Fail every pending request.
    const failure = reason.type === 'shutdown' ? new ClientClosedError() : reason.error;
    for (const [id, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      try {
        pending.reject(failure);
      } catch {
        // ignore listener errors
      }
      this.pending.delete(id);
    }

    for (const queue of this.subscriptions.values()) queue.close();
    this.subscriptions.clear();
    this.allEvents.close();
    this.stateQueue.close();
  }

  private async driveTransport(): Promise<void> {
    try {
      while (this.state.status === 'connected') {
        const frame = await this.transport.recv();
        if (frame === null) {
          this.tearDown({ type: 'transport', error: new TransportError('closed', 'transport closed') });
          return;
        }
        this.handleFrame(frame);
      }
    } catch (err) {
      const te = err instanceof TransportError
        ? err
        : new TransportError('io', `transport recv failed: ${(err as Error).message}`, { cause: err });
      this.tearDown({ type: 'transport', error: te });
    }
  }

  private handleFrame(frame: TransportFrame): void {
    let message: ProtocolMessage;
    try {
      switch (frame.kind) {
        case 'parsed':
          message = frame.message;
          break;
        case 'text':
          message = decodeMessage(frame.text);
          break;
        case 'binary': {
          const text = new TextDecoder('utf-8').decode(frame.data);
          message = decodeMessage(text);
          break;
        }
      }
    } catch (err) {
      // A single malformed frame doesn't tear down the channel — a
      // well-behaved server should not send them, and a transient bad
      // frame from a peer that recovers shouldn't kill in-flight
      // requests. Surface it via `console.warn` so consumers have a
      // breadcrumb when requests later time out.
      // eslint-disable-next-line no-console
      console.warn(`AhpClient: malformed inbound frame: ${(err as Error).message}`);
      return;
    }

    this.dispatchInbound(message);
  }

  private dispatchInbound(message: ProtocolMessage): void {
    // Response: { id, result } or { id, error }
    if ('id' in message && 'result' in message) {
      const success = message as JsonRpcSuccessResponse;
      const pending = this.pending.get(success.id);
      if (pending) {
        this.pending.delete(success.id);
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve(success.result);
      }
      return;
    }
    if ('id' in message && 'error' in message) {
      const failure = message as JsonRpcErrorResponse;
      const pending = this.pending.get(failure.id);
      if (pending) {
        this.pending.delete(failure.id);
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(new RpcError(failure.error.code, failure.error.message, failure.error.data));
      }
      return;
    }
    // Server-initiated request: { id, method }
    if ('id' in message && 'method' in message) {
      void this.handleServerRequest(message as JsonRpcRequest);
      return;
    }
    // Notification: { method } no id
    if ('method' in message) {
      this.handleNotification(message as JsonRpcNotification);
      return;
    }
  }

  private async handleServerRequest(req: JsonRpcRequest): Promise<void> {
    if (this.serverRequestHandler) {
      try {
        // The dynamic cast here is unavoidable — the runtime method name
        // narrows to ServerCommandMap externally.
        const handler = this.serverRequestHandler as (m: string, p: unknown) => Promise<unknown>;
        const result = await handler(req.method, req.params);
        const response: JsonRpcSuccessResponse = {
          jsonrpc: '2.0',
          id: req.id,
          result,
        };
        this.sendMessage(response).catch(noop);
      } catch (err) {
        const code = err instanceof RpcError ? err.code : JsonRpcErrorCodes.InternalError;
        const message = err instanceof Error ? err.message : String(err);
        const data = err instanceof RpcError ? err.data : undefined;
        const response: JsonRpcErrorResponse = {
          jsonrpc: '2.0',
          id: req.id,
          error: data !== undefined ? { code, message, data } : { code, message },
        };
        this.sendMessage(response).catch(noop);
      }
      return;
    }
    // No handler installed — respond with MethodNotFound so the server
    // does not leak a pending request.
    const response: JsonRpcErrorResponse = {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: JsonRpcErrorCodes.MethodNotFound,
        message: `no handler for server method "${req.method}"`,
      },
    };
    this.sendMessage(response).catch(noop);
  }

  private handleNotification(n: JsonRpcNotification): void {
    const params = (n.params ?? {}) as { channel?: URI };
    const channel = params.channel;
    switch (n.method) {
      case 'action': {
        const env = n.params as ActionEnvelope;
        this.fanOut(env.channel, { type: 'action', params: env });
        break;
      }
      case 'root/sessionAdded': {
        const p = n.params as SessionAddedParams;
        this.fanOut(p.channel, { type: 'sessionAdded', params: p });
        break;
      }
      case 'root/sessionRemoved': {
        const p = n.params as SessionRemovedParams;
        this.fanOut(p.channel, { type: 'sessionRemoved', params: p });
        break;
      }
      case 'root/sessionSummaryChanged': {
        const p = n.params as SessionSummaryChangedParams;
        this.fanOut(p.channel, { type: 'sessionSummaryChanged', params: p });
        break;
      }
      case 'auth/required': {
        const p = n.params as AuthRequiredParams;
        this.fanOut(p.channel, { type: 'authRequired', params: p });
        break;
      }
      default:
        // Unhandled notification (e.g. `otlp/exportLogs`). Channel is
        // available in params for consumers who route via `events()`,
        // but these are not surfaced as `SubscriptionEvent`s to mirror
        // the Rust/Swift clients.
        void channel;
        break;
    }
  }

  private fanOut(channel: URI, event: SubscriptionEvent): void {
    const queue = this.subscriptions.get(channel);
    if (queue) queue.publish(event);
    this.allEvents.publish({ channel, event });
  }
}
