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
import type { AuthRequiredParams, ChannelSnapshotParams } from '../types/common/notifications.js';
import type { TcpDataParams, TcpEofParams, TcpResetParams } from '../types/channels-tcp/notifications.js';
import type { JsonRpcNotification } from '../types/common/messages.js';
import type { URI } from '../types/common/state.js';
import type { TransportError } from './error.js';

/** A single event delivered to a {@link Subscription}. */
export type SubscriptionEvent =
  | { readonly type: 'action'; readonly params: ActionEnvelope }
  | { readonly type: 'sessionAdded'; readonly params: SessionAddedParams }
  | { readonly type: 'sessionRemoved'; readonly params: SessionRemovedParams }
  | { readonly type: 'sessionSummaryChanged'; readonly params: SessionSummaryChangedParams }
  | { readonly type: 'authRequired'; readonly params: AuthRequiredParams };

/** Extended delivery surface, leaving legacy exhaustive SubscriptionEvent switches intact. */
export type DeliveryEvent = SubscriptionEvent
  | { readonly type: 'snapshot'; readonly params: ChannelSnapshotParams }
  | { readonly type: 'tcpData'; readonly params: TcpDataParams }
  | { readonly type: 'tcpEof'; readonly params: TcpEofParams }
  | { readonly type: 'tcpReset'; readonly params: TcpResetParams }
  | { readonly type: 'notification'; readonly notification: JsonRpcNotification };

export interface ReceivedDelivery {
  readonly event: DeliveryEvent;
  readonly notification: JsonRpcNotification;
  /** Sum of original wire sizes, including fragments already credited when stored. */
  readonly bytes: number;
  /** Release remaining credit; idempotent and safe after reconnect. */
  release(): void;
}

/** Observe-only extended fan-in. It never owns a receipt or releases credit. */
export interface ClientDeliveryEvent {
  readonly channel: URI;
  readonly event: DeliveryEvent;
}

/** @internal */
export function deliveryEvent(n: JsonRpcNotification): DeliveryEvent {
  switch (n.method) {
    case 'action': return { type: 'action', params: n.params as ActionEnvelope };
    case 'root/sessionAdded': return { type: 'sessionAdded', params: n.params as SessionAddedParams };
    case 'root/sessionRemoved': return { type: 'sessionRemoved', params: n.params as SessionRemovedParams };
    case 'root/sessionSummaryChanged': return { type: 'sessionSummaryChanged', params: n.params as SessionSummaryChangedParams };
    case 'auth/required': return { type: 'authRequired', params: n.params as AuthRequiredParams };
    case 'channel/snapshot': return { type: 'snapshot', params: n.params as ChannelSnapshotParams };
    case 'tcp/data': return { type: 'tcpData', params: n.params as TcpDataParams };
    case 'tcp/eof': return { type: 'tcpEof', params: n.params as TcpEofParams };
    case 'tcp/reset': return { type: 'tcpReset', params: n.params as TcpResetParams };
    default: return { type: 'notification', notification: n };
  }
}

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
