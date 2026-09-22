/**
 * Error taxonomy for {@link AhpClient}.
 *
 * Five error families surface to consumers:
 *
 * - {@link TransportError} — failures of the underlying {@link AhpTransport}
 *   (closed connection, I/O, undecodable frames).
 * - {@link RpcError} — a JSON-RPC error response from the server.
 * - {@link RpcTimeoutError} — a client-side timeout firing before the
 *   server responded. Distinct from {@link RpcError}: there was no server
 *   error, the wait just elapsed.
 * - {@link ClientClosedError} — the client was shut down (or the transport
 *   was torn down) while a request was in flight.
 * - {@link AhpClientError} — base class; consumers can use `instanceof` to
 *   catch every error this SDK throws.
 *
 * Malformed inbound frames do not throw — they are logged via
 * `console.warn` and the channel stays alive (matching the Rust client's
 * `tracing::warn!` behavior). Pending requests still time out via
 * {@link RpcTimeoutError} if the bad frame would have been their reply.
 *
 * @module client/error
 */

/** Base type for every error thrown by the client SDK. */
export class AhpClientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = 'AhpClientError';
  }
}

/** A JSON-RPC error response returned by the server for a request. */
export class RpcError extends AhpClientError {
  /** JSON-RPC numeric error code. See `JsonRpcErrorCodes` and `AhpErrorCodes`. */
  readonly code: number;
  /** Optional structured payload included in the response. */
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(`RPC error ${code}: ${message}`);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

/**
 * A request timed out client-side before the server responded.
 *
 * Distinct from {@link RpcError}: no server error occurred, the request was
 * abandoned locally. Consumers commonly retry these.
 */
export class RpcTimeoutError extends AhpClientError {
  /** The JSON-RPC method name that timed out. */
  readonly method: string;
  /** The configured timeout in milliseconds that was exceeded. */
  readonly timeoutMs: number;

  constructor(method: string, timeoutMs: number) {
    super(`Request "${method}" timed out after ${timeoutMs}ms`);
    this.name = 'RpcTimeoutError';
    this.method = method;
    this.timeoutMs = timeoutMs;
  }
}

/** Kinds of {@link TransportError}. */
export type TransportErrorKind = 'closed' | 'io' | 'protocol';

/** A failure of the underlying {@link AhpTransport}. */
export class TransportError extends AhpClientError {
  /** What kind of transport failure this represents. */
  readonly kind: TransportErrorKind;

  constructor(kind: TransportErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransportError';
    this.kind = kind;
  }
}

/** The client was shut down while a request was in flight. */
export class ClientClosedError extends AhpClientError {
  constructor(message = 'client shut down') {
    super(message);
    this.name = 'ClientClosedError';
  }
}
