/**
 * Subscription events fanned out to consumers of {@link AhpClient}.
 *
 * `action` envelopes carry the write-ahead mutation stream; the remaining
 * variants carry channel-tagged protocol notifications the server emits as
 * top-level JSON-RPC methods (`root/sessionAdded`, `auth/required`, …).
 *
 * Mirrors the Rust `SubscriptionEvent` enum surface, expressed as a TS
 * discriminated union.
 *
 * @module client/events
 */

import type { ActionEnvelope } from '../types/actions.js';
import type {
  SessionAddedParams,
  SessionRemovedParams,
  SessionSummaryChangedParams,
} from '../types/channels-root/notifications.js';
import type { AuthRequiredParams } from '../types/common/notifications.js';
import type { URI } from '../types/common/state.js';
import type { TransportError } from './error.js';

/** A single event delivered to a {@link Subscription}. */
export type SubscriptionEvent =
  | { readonly type: 'action'; readonly params: ActionEnvelope }
  | { readonly type: 'sessionAdded'; readonly params: SessionAddedParams }
  | { readonly type: 'sessionRemoved'; readonly params: SessionRemovedParams }
  | { readonly type: 'sessionSummaryChanged'; readonly params: SessionSummaryChangedParams }
  | { readonly type: 'authRequired'; readonly params: AuthRequiredParams };

/**
 * A single event delivered to the top-level {@link AhpClient.events} stream,
 * tagged with the channel URI it was scoped to.
 */
export interface ClientEvent {
  /** Channel URI this event was scoped to (drawn from the envelope or params). */
  readonly channel: URI;
  /** The subscription event payload. */
  readonly event: SubscriptionEvent;
}

/** Connection-level state observed by {@link AhpClient.connectionState}. */
export type ConnectionState =
  | { readonly status: 'idle' }
  | { readonly status: 'connected' }
  | { readonly status: 'closing' }
  | { readonly status: 'closed'; readonly reason: ClosedReason };

/** Why a connection ended. */
export type ClosedReason =
  | { readonly type: 'shutdown' }
  | { readonly type: 'transport'; readonly error: TransportError };
