/**
 * Public surface of the `@microsoft/agent-host-protocol/hosts` entry point.
 *
 * The multi-host SDK builds on top of `@microsoft/agent-host-protocol/client`'s
 * {@link AhpClient} to manage one or more AHP host connections at once:
 * per-host reconnect supervisors, stable `clientId` persistence, a
 * generation-checked client-handle escape hatch, fan-in event streams,
 * aggregated views, and a host-aware reducer mirror.
 *
 * Mirrors the Rust `ahp::hosts` module surface.
 *
 * @module hosts
 */

export { MultiHostClient } from './multi.js';

export { HostClientHandle } from './host-client-handle.js';

export {
  // Types
  isConnected,
  isFailed,
  ROOT_RESOURCE_URI,
  // Error classes
  ClientIdStoreError,
  DuplicateHostError,
  HostMultiError,
  HostNotConnectedError,
  HostReconnectedError,
  HostShutDownError,
  UnknownHostError,
} from './types.js';
export type {
  HostConfig,
  HostEvent,
  HostFlowControlEvent,
  HostHandle,
  HostId,
  HostState,
  HostSubscriptionEvent,
  HostedAgent,
  HostedSessionSummary,
} from './types.js';

export type { HostTransportFactory } from './factory.js';

export {
  attemptsExhausted,
  backoffDelayForAttempt,
  defaultReconnectPolicy,
  delayWithJitter,
  disabledPolicy,
  exponentialPolicy,
  immediateForeverPolicy,
} from './policy.js';
export type { Backoff, ReconnectPolicy } from './policy.js';

export { InMemoryClientIdStore } from './client-id-store.js';
export type { ClientIdStore } from './client-id-store.js';

export { MultiHostStateMirror, hostedResourceKey } from './state-mirror.js';
export type { HostedResourceKey } from './state-mirror.js';
