/**
 * Public surface of the `@microsoft/agent-host-protocol/client` entry point.
 *
 * @module client
 */

export { AhpClient, Subscription } from './client.js';
export type { AhpClientConfig, DispatchHandle, ServerRequestHandler, SubscribeOptions } from './client.js';
export type { ClientEvent, ClosedReason, ConnectionState, SubscriptionEvent } from './events.js';
export {
  AhpClientError,
  ClientClosedError,
  RpcError,
  RpcTimeoutError,
  TransportError,
} from './error.js';
export type { TransportErrorKind } from './error.js';
export { InMemoryTransport } from './transport.js';
export type { AhpTransport, JsonRpcMessage, TransportFrame } from './transport.js';
export { AhpStateMirror } from './state-mirror.js';
