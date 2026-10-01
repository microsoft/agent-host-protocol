/**
 * An owned, flow-controlled TCP byte stream. No socket or connection policy.
 * @module client/tcp-connection
 */

import { ActionType, type ActionEnvelope } from '../types/common/actions.js';
import { IS_CLIENT_DISPATCHABLE, type ClientTcpAction, type TcpAction } from '../types/action-origin.generated.js';
import { tcpReducer } from '../types/channels-tcp/reducer.js';
import type { TcpConnectionSubscription } from '../types/channels-tcp/commands.js';
import { TcpDataEncoding, TcpResetReason, type TcpConnectionsCapability, type TcpConnectionState } from '../types/channels-tcp/state.js';
import type { Snapshot } from '../types/common/state.js';
import type { ReconnectResult } from '../types/common/commands.js';
import { AhpClientError } from './error.js';

/** A TCP channel failed or an operation cannot be performed in its current state. */
export class TcpConnectionError extends AhpClientError {
  constructor(message: string, readonly reason?: TcpResetReason) {
    super(message);
    this.name = 'TcpConnectionError';
  }
}

/**
 * Reconcile owned streams before live delivery resumes. Custom AHP clients can
 * use this with the same stream adapter; no TCP snapshot may restore payload.
 * The returned result omits ordinary actions the consumer already applied,
 * independently of the lower wire checkpoint needed by retained TCP streams.
 * Call finishResume only after the client's reconnect send gate is released.
 */
export function reconcileTcpConnections(connections: Iterable<TcpConnection>, result: ReconnectResult, lastSeenServerSeq: number): ReconnectResult {
  requireTcp(Number.isSafeInteger(lastSeenServerSeq) && lastSeenServerSeq >= 0, 'Invalid reconnect consumer checkpoint');
  const owned = new Map([...connections].map(connection => [connection.resource, connection]));
  const missing = new Set(result.missing ?? []);
  for (const connection of owned.values()) {
    if (result.type !== 'replay' || missing.has(connection.resource)) {
      connection.fail(new TcpConnectionError('TCP replay unavailable', TcpResetReason.ReplayUnavailable));
      owned.delete(connection.resource);
    }
  }
  if (result.type === 'replay') {
    for (const envelope of result.actions) {owned.get(envelope.channel)?.accept(envelope, true);}
    for (const connection of owned.values()) {connection.completeReplay();}
    return {
      ...result,
      actions: result.actions.filter(envelope => envelope.channel.startsWith('ahp-tcp:') || envelope.serverSeq > lastSeenServerSeq),
    };
  }
  return result;
}

/** @internal Transport ownership supplied by AhpClient, not by stream consumers. */
export interface TcpBinding {
  capability?: TcpConnectionsCapability;
  nextSeq(): number;
  sequenceFloor(): number;
  send(seq: number, action: ClientTcpAction): void;
  detach(unsubscribe: boolean): void;
}

function requireTcp(condition: boolean, message: string): asserts condition {
  if (!condition) {throw new TcpConnectionError(message, TcpResetReason.ProtocolError);}
}

/** @internal Shared wire validation for consumers and hosts; host policy is separate. */
export function validateTcpRequest(session: string, create: TcpConnectionSubscription): void {
  requireTcp(typeof session === 'string' && session.startsWith('ahp-session:'), 'TCP creation requires a parent session');
  validateTcpCreation(create);
}

/** @internal TCP options independent of the embedding host's session identity. */
export function validateTcpCreation(create: TcpConnectionSubscription): void {
  requireTcp(!!create && create.type === 'tcpConnection', 'Invalid TCP creation kind');
  requireTcp(typeof create.host === 'string' && create.host.length > 0 && !/[\s/\0]/.test(create.host), 'Invalid TCP host');
  requireTcp(Number.isInteger(create.port) && create.port >= 1 && create.port <= 65535, 'Invalid TCP port');
  requireTcp(create.encoding === TcpDataEncoding.Base64, 'Unsupported TCP encoding');
  requireTcp(Number.isInteger(create.receiveWindowBytes) && create.receiveWindowBytes >= 1 && create.receiveWindowBytes <= 0xffffffff, 'Invalid TCP receive window');
  requireTcp(Number.isInteger(create.maximumChunkSize) && create.maximumChunkSize >= 1 && create.maximumChunkSize <= create.receiveWindowBytes, 'Invalid TCP chunk size');
}

/** @internal A snapshot is accepted only for fresh creation, never stream recovery. */
export function validateTcpSnapshot(snapshot: Snapshot, session: string, create: TcpConnectionSubscription): TcpConnectionState {
  requireTcp(!!snapshot && typeof snapshot.resource === 'string' && snapshot.resource.startsWith('ahp-tcp:'), 'Invalid TCP creation resource');
  requireTcp(Number.isSafeInteger(snapshot.fromSeq) && snapshot.fromSeq >= 0, 'Invalid TCP creation sequence');
  const state = snapshot.state;
  requireTcp(!!state && typeof state === 'object' && 'input' in state && 'output' in state && 'target' in state, 'Invalid TCP creation state');
  requireTcp(state.session === session && state.target?.host === create.host && state.target?.port === create.port, 'TCP creation target mismatch');
  requireTcp(state.encoding === TcpDataEncoding.Base64, 'TCP creation encoding mismatch');
  requireTcp(state.clientClosed === false && state.hostClosed === false && state.reset === undefined, 'TCP creation is already closed');
  for (const direction of [state.input, state.output]) {
    requireTcp(!!direction && Number.isInteger(direction.windowBytes) && direction.windowBytes >= 1 && direction.windowBytes <= 0xffffffff, 'Invalid TCP creation window');
    requireTcp(Number.isInteger(direction.maximumChunkSize) && direction.maximumChunkSize >= 1 && direction.maximumChunkSize <= direction.windowBytes, 'Invalid TCP creation chunk limit');
    requireTcp(direction.receivedBytes === 0 && direction.consumedBytes === 0 && direction.eofAtBytes === undefined, 'TCP creation must start with empty directions');
  }
  requireTcp(state.output.windowBytes <= create.receiveWindowBytes && state.output.maximumChunkSize <= create.maximumChunkSize, 'Host exceeded requested TCP receive limits');
  return structuredClone(state);
}

function encode(data: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += 32768) {
    parts.push(String.fromCharCode(...data.subarray(i, i + 32768)));
  }
  return btoa(parts.join(''));
}

function decode(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {bytes[i] = binary.charCodeAt(i);}
  return bytes;
}

function matchesPendingAction(expected: ClientTcpAction, actual: ActionEnvelope['action']): boolean {
  switch (expected.type) {
    case ActionType.TcpInput:
      return actual.type === expected.type && actual.offset === expected.offset && actual.data === expected.data;
    case ActionType.TcpDataConsumed:
      return actual.type === expected.type && actual.consumedBytes === expected.consumedBytes;
    case ActionType.TcpInputEof:
      return actual.type === expected.type && actual.finalOffset === expected.finalOffset;
    case ActionType.TcpClientClose:
      return actual.type === expected.type;
    case ActionType.TcpClientReset:
      return actual.type === expected.type && actual.reason === expected.reason;
  }
}

/**
 * A single-reader, single-writer byte stream created by AhpClient.openTcpConnection.
 * Reads release receive credit. Writes wait for credit without an unbounded
 * send queue; do not modify the input buffer until write completes.
 * Transport loss suspends the stream until reconnectTcpConnections resumes it.
 */
export class TcpConnection implements Disposable {
  private readonly pending = new Map<number, ClientTcpAction>();
  private readonly received: Uint8Array[] = [];
  private readonly waiters = new Set<() => void>();
  private sentBytes = 0;
  private consumedBytes = 0;
  private reading = false;
  private writing = false;
  private ending = false;
  private closing = false;
  private terminal = false;
  private failure?: Error;
  private suspended = false;
  private resuming = false;
  private replayComplete = false;
  private lastSequence = 0;

  /** @internal */
  constructor(
    readonly resource: string,
    private currentState: TcpConnectionState,
    readonly clientId: string,
    private checkpoint: number,
    private binding: TcpBinding,
  ) {}

  /** A defensive copy for diagnostics; mutating it cannot change stream accounting. */
  get state(): TcpConnectionState { return structuredClone(this.currentState); }
  get isClosed(): boolean { return this.terminal; }
  get isSuspended(): boolean { return this.suspended && !this.terminal; }
  /** @internal */
  get canResume(): boolean { return this.isSuspended && !this.resuming; }
  /** @internal */
  get lastServerSeq(): number { return this.checkpoint; }
  /** @internal */
  get sequenceFloor(): number { return Math.max(this.lastSequence, this.binding.sequenceFloor()); }
  /** @internal Negotiated metadata follows the original logical host across reconnect. */
  get capability(): TcpConnectionsCapability | undefined { return this.binding.capability; }

  private changed(): void {
    for (const resolve of this.waiters) {resolve();}
    this.waiters.clear();
  }

  private wait(): Promise<void> {
    return new Promise(resolve => this.waiters.add(resolve));
  }

  private checkOpen(): void {
    if (this.failure) {throw this.failure;}
    if (this.terminal) {throw new TcpConnectionError('TCP connection is closed');}
  }

  private dispatch(action: ClientTcpAction): void {
    const seq = this.binding.nextSeq();
    requireTcp(Number.isSafeInteger(seq) && seq > 0, 'TCP client sequence exhausted');
    this.lastSequence = seq;
    this.pending.set(seq, action);
    if (!this.suspended) {this.binding.send(seq, action);}
  }

  /** @internal Live delivery is synchronous with the client's receive loop. */
  accept(envelope: ActionEnvelope, replay = false): void {
    if (this.terminal) {return;}
    try {
      requireTcp(!this.suspended || replay || this.replayComplete, 'TCP action arrived before reconnect replay');
      requireTcp(envelope.channel === this.resource && Number.isSafeInteger(envelope.serverSeq) && envelope.serverSeq >= 0, 'Invalid TCP action envelope');
      if (envelope.serverSeq <= this.checkpoint) {return;}
      requireTcp(envelope.rejectionReason === undefined, envelope.rejectionReason ?? 'TCP action rejected');
      const action = envelope.action;
      requireTcp(typeof action?.type === 'string' && action.type.startsWith('tcp/'), 'Non-TCP action on TCP channel');
      let echoedSequence: number | undefined;
      let pendingAction: ClientTcpAction | undefined;
      if (IS_CLIENT_DISPATCHABLE[action.type]) {
        const sequence = envelope.origin?.clientSeq;
        requireTcp(envelope.origin?.clientId === this.clientId && typeof sequence === 'number'
          && Number.isSafeInteger(sequence) && sequence > 0 && sequence <= this.lastSequence, 'Invalid TCP echo origin or sequence');
        echoedSequence = sequence;
        pendingAction = this.pending.get(sequence);
        if (pendingAction) {
          requireTcp(matchesPendingAction(pendingAction, action), 'TCP echo does not match pending action');
        }
      }
      const previous = this.currentState;
      const next = tcpReducer(previous, action as TcpAction);
      if (echoedSequence !== undefined && !pendingAction) {
        // Old unmatched echoes may only be state-neutral duplicates; no payload history is retained.
        requireTcp(next === previous, 'Unmatched TCP echo');
      }
      requireTcp(next.input.receivedBytes <= this.sentBytes, 'Host echoed input that this stream never sent');
      requireTcp(next.output.consumedBytes <= this.consumedBytes, 'Host echoed output credit not released by this stream');
      requireTcp(next.output.receivedBytes - this.consumedBytes <= next.output.windowBytes, 'TCP output exceeds locally released credit');
      if (action.type === ActionType.TcpData && next.output.receivedBytes > previous.output.receivedBytes) {
        this.received.push(decode(action.data));
      }
      this.currentState = next;
      this.checkpoint = envelope.serverSeq;
      if (echoedSequence !== undefined && pendingAction) {
        this.pending.delete(echoedSequence);
      }
      if (next.reset) {
        this.fail(new TcpConnectionError(`TCP reset: ${next.reset.reason}`, next.reset.reason));
      } else if (next.hostClosed && !this.closing) {
        this.close();
      }
      this.finishIfClosed();
    } catch (error) {
      this.abort(TcpResetReason.ProtocolError, error instanceof TcpConnectionError
        ? error
        : new TcpConnectionError(error instanceof Error ? error.message : String(error), TcpResetReason.ProtocolError));
    }
    this.changed();
  }

  /** Returns undefined only after the peer ended its output and buffered bytes drained. */
  async read(): Promise<Uint8Array | undefined> {
    if (this.reading) {throw new TcpConnectionError('TCP permits only one reader');}
    this.reading = true;
    try {
      while (true) {
        if (this.failure) {throw this.failure;}
        const data = this.received.shift();
        if (data) {
          this.consumedBytes += data.byteLength;
          this.dispatch({ type: ActionType.TcpDataConsumed, consumedBytes: this.consumedBytes });
          return data;
        }
        if (this.currentState.output.eofAtBytes !== undefined || this.currentState.hostClosed || this.terminal) {return undefined;}
        await this.wait();
      }
    } finally {
      this.reading = false;
    }
  }

  /** Retain all bytes for dispatch under available credit; drain() waits for destination consumption. */
  async write(data: Uint8Array): Promise<void> {
    this.checkOpen();
    if (this.writing || this.ending || this.closing) {throw new TcpConnectionError('TCP write requires an open, idle writer');}
    this.writing = true;
    try {
      let offset = 0;
      while (offset < data.byteLength) {
        this.checkOpen();
        if (this.closing) {throw new TcpConnectionError('TCP closed during write');}
        const direction = this.currentState.input;
        const credit = direction.windowBytes - (this.sentBytes - direction.consumedBytes);
        if (credit === 0) {
          await this.wait();
          continue;
        }
        const length = Math.min(credit, direction.maximumChunkSize, data.byteLength - offset);
        requireTcp(Number.isSafeInteger(this.sentBytes + length), 'TCP byte offset exhausted');
        const action: ClientTcpAction = { type: ActionType.TcpInput, offset: this.sentBytes, data: encode(data.subarray(offset, offset + length)) };
        this.sentBytes += length;
        offset += length;
        this.dispatch(action);
      }
    } finally {
      this.writing = false;
    }
  }

  /** Wait until the destination has consumed all dispatched input. */
  async drain(): Promise<void> {
    while (this.currentState.input.consumedBytes < this.sentBytes) {
      this.checkOpen();
      await this.wait();
    }
    if (this.failure) {throw this.failure;}
  }

  /** Half-close input after write completes; output remains readable. */
  end(): void {
    this.checkOpen();
    if (this.writing || this.closing) {throw new TcpConnectionError('TCP end requires an open, idle writer');}
    if (!this.ending) {
      this.ending = true;
      this.dispatch({ type: ActionType.TcpInputEof, finalOffset: this.sentBytes });
    }
  }

  /** Begin the final close handshake. Use end() for a one-direction half-close. */
  close(): void {
    if (!this.closing && !this.terminal) {
      this.closing = true;
      this.dispatch({ type: ActionType.TcpClientClose });
      this.changed();
    }
  }

  private finishIfClosed(): void {
    if (!this.terminal && this.currentState.clientClosed && this.currentState.hostClosed &&
        this.received.length === 0 && this.currentState.input.consumedBytes >= this.sentBytes &&
        this.currentState.output.consumedBytes >= this.consumedBytes) {
      this.terminal = true;
      this.pending.clear();
      this.binding.detach(true);
      this.changed();
    }
  }

  /** @internal Transport loss retains the original buffers and pending actions. */
  suspend(): void {
    this.suspended = true;
    this.resuming = false;
    this.replayComplete = false;
  }

  /** @internal Claims a suspended stream for one replacement client. */
  beginResume(clientId: string, binding: TcpBinding): void {
    this.checkOpen();
    requireTcp(this.clientId === clientId, 'Cannot resume TCP under another client identity');
    requireTcp(this.suspended && !this.resuming, 'TCP is not available for reconnect');
    this.resuming = true;
    this.binding.detach(false);
    this.binding = binding;
  }

  /** @internal Live events may follow the response while the client's send gate remains closed. */
  completeReplay(): void {
    if (this.terminal) {return;}
    requireTcp(this.resuming, 'TCP reconnect was not started');
    this.replayComplete = true;
  }

  /** @internal Replay must already have been applied before resending pending input. */
  finishResume(): void {
    if (this.terminal) {return;}
    requireTcp(this.resuming && this.replayComplete, 'TCP reconnect replay is incomplete');
    this.suspended = false;
    this.resuming = false;
    for (const [seq, action] of this.pending) {
      if (this.suspended) {break;}
      this.binding.send(seq, action);
    }
    this.changed();
  }

  /** Immediately abort, discard buffered bytes, and reject blocked operations. */
  abort(reason = TcpResetReason.ConnectionAborted, error: Error = new TcpConnectionError(`TCP aborted: ${reason}`, reason)): void {
    if (this.terminal) {return;}
    try {
      if (!this.suspended) {this.dispatch({ type: ActionType.TcpClientReset, reason });}
    } finally {
      this.fail(error);
    }
  }

  /** @internal */
  fail(error: Error): void {
    if (this.terminal) {return;}
    this.failure = error;
    this.terminal = true;
    this.pending.clear();
    this.received.length = 0;
    this.binding.detach(true);
    this.changed();
  }

  /** Release the remote subscription and cancel local operations. Idempotent. */
  dispose(): void {
    this.fail(new TcpConnectionError('TCP connection disposed', TcpResetReason.ConnectionAborted));
  }

  [Symbol.dispose](): void { this.dispose(); }
}
