/**
 * Pluggable transport abstraction.
 *
 * The client is transport-agnostic. Any framed message stream — a WebSocket,
 * a Unix socket, stdio, or an in-memory pair for tests — can back an
 * {@link AhpTransport}. The client consumes typed {@link TransportFrame}s and
 * leaves framing/TLS/auth to the transport.
 *
 * @module client/transport
 */

import type {
  JsonRpcErrorResponse,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  ProtocolMessage,
} from '../types/messages.js';
import { TransportError } from './error.js';

/**
 * Loose JSON-RPC message union used on the outbound path. Mirrors the
 * shape of {@link ProtocolMessage} but with `method: string` so the
 * client can construct requests and responses for any method without
 * narrowing through the typed `CommandMap` registries.
 */
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse
  | JsonRpcNotification;

/**
 * A single inbound frame from an {@link AhpTransport}.
 *
 * Transports can deliver text or binary frames and let the client parse,
 * or pre-parse and hand over `{ kind: 'parsed' }` to avoid a round-trip
 * through JSON.
 */
export type TransportFrame =
  | { readonly kind: 'parsed'; readonly message: ProtocolMessage; readonly rawText?: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'binary'; readonly data: Uint8Array };

/**
 * A pluggable transport. Implementations deliver inbound frames in order
 * and accept outbound sends serially. {@link recv} returns `null` to signal
 * a clean close.
 */
export interface AhpTransport {
  /** Opt in only when inbound raw text is retained and outbound strings are sent verbatim. */
  readonly supportsWindowedDelivery?: boolean;
  /** Receive message limit in UTF-16 bytes; unknown defaults to 1048576. */
  readonly maximumFrameBytes?: number;
  /** Optional physical send-buffer backpressure. Implementations should honor cancellation. */
  waitWritable?(options?: { signal?: AbortSignal }): Promise<void>;
  /**
   * Send a single message. The argument may be either a {@link JsonRpcMessage}
   * (which the transport serialises) or a pre-serialised JSON-RPC string
   * (which the transport sends verbatim).
   *
   * Throws a {@link TransportError} on a fatal send failure. Browser
   * `WebSocket.send` only queues data and does not signal flush
   * completion; transports that wrap it should resolve immediately and
   * expose `bufferedAmount` separately for backpressure-sensitive callers.
   */
  send(message: JsonRpcMessage | string): Promise<void> | void;

  /**
   * Receive the next inbound frame.
   *
   * Resolves to `null` when the remote half of the connection has cleanly
   * closed. Throws a {@link TransportError} on abnormal closure or I/O
   * failure.
   */
  recv(): Promise<TransportFrame | null>;

  /** Close the transport and release any resources. May be a no-op. */
  close(): Promise<void> | void;
}

/**
 * Wire format helpers used by the client and transports.
 *
 * @internal
 */
export function encodeMessage(message: JsonRpcMessage): string {
  return JSON.stringify(message);
}

/** Decode an inbound text payload into a {@link ProtocolMessage}. @internal */
export function decodeMessage(text: string): ProtocolMessage {
  try {
    return JSON.parse(text) as ProtocolMessage;
  } catch (cause) {
    throw new TransportError('protocol', `invalid JSON: ${(cause as Error).message}`, { cause });
  }
}

// ─── In-memory transport (for tests) ─────────────────────────────────────────

class InMemoryHalf implements AhpTransport {
  readonly supportsWindowedDelivery = true;
  private inbox: Array<TransportFrame | null> = [];
  private waiter: ((frame: TransportFrame | null) => void) | null = null;
  private closed = false;

  /** @internal */
  peer!: InMemoryHalf;

  send(message: JsonRpcMessage | string): void {
    if (this.closed) {
      throw new TransportError('closed', 'transport closed');
    }
    const text = typeof message === 'string' ? message : encodeMessage(message);
    this.peer.deliver({ kind: 'text', text });
  }

  recv(): Promise<TransportFrame | null> {
    if (this.inbox.length > 0) {
      return Promise.resolve(this.inbox.shift() ?? null);
    }
    if (this.closed) {
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      this.waiter = resolve;
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Wake any pending receiver with a clean close, then propagate to the peer.
    this.deliver(null);
    this.peer.deliver(null);
  }

  /** @internal */
  private deliver(frame: TransportFrame | null): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(frame);
    } else {
      this.inbox.push(frame);
    }
  }
}

/**
 * A bidirectional in-memory transport pair, primarily for tests.
 *
 * Each half implements {@link AhpTransport}. A {@link AhpTransport.send}
 * on one half delivers to the other half's {@link AhpTransport.recv} as a
 * text frame.
 *
 * ```ts
 * const [client, server] = InMemoryTransport.pair();
 * const c = new AhpClient(client);
 * c.connect();
 * // The test harness drives `server.recv()` / `server.send(...)` directly.
 * ```
 */
export const InMemoryTransport = {
  /** Returns a connected `[a, b]` pair. */
  pair(): [AhpTransport, AhpTransport] {
    const a = new InMemoryHalf();
    const b = new InMemoryHalf();
    a.peer = b;
    b.peer = a;
    return [a, b];
  },
};
