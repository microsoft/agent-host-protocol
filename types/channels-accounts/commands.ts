/**
 * Client-Brokered Authentication Capability and Admission Commands.
 *
 * @module channels-accounts/commands
 */

import type { BaseParams } from '../common/commands.js';
import type { AccountConsumer } from './state.js';

/**
 * Negotiated credential-acquisition flows.
 *
 * Unknown flows are not support for client-brokered admission. Hosts MUST
 * reject unsupported offers instead of silently choosing another flow.
 *
 * @category Authentication
 * @nonexhaustive
 */
export const enum AuthFlowKind {
  /** Client acquires the token; the host owns admission, use, and removal. */
  ClientBrokered = 'clientBrokered',
}

/**
 * A supported or offered authentication flow.
 *
 * @category Authentication
 */
export interface AuthFlowSupport {
  kind: AuthFlowKind;
}

/**
 * Authentication support advertised in `InitializeResult.authentication`.
 *
 * Advertising `clientBrokered` commits the host to the accounts-channel
 * contract, including account-safe invalidation and containment of active work.
 * It does not require host-run OAuth or refresh-token storage.
 *
 * @category Authentication
 */
export interface AuthenticationCapability {
  /** Flow descriptors clients may select; absence of a kind means unsupported. */
  flows: AuthFlowSupport[];
}

/**
 * Reserve a single-use client-brokered credential admission.
 *
 * The client MUST check the `clientBrokered` capability before calling. The
 * host validates the consumer, caller, and offered flow, captures the current
 * selection/resource as preconditions, and publishes a pending attempt before
 * responding. It performs no OAuth flow and accepts no credential here.
 * Changing that consumer's selection or resource invalidates competing pending
 * attempts, even if a later change restores the original selection.
 *
 * Completion uses `authenticate` with an attempt binding. Only the initiating
 * authorization context, including a verified reconnect, may complete or
 * cancel the attempt. A correlation id alone grants no authority.
 *
 * @category Commands
 * @method authBegin
 * @direction Client → Server
 * @messageType Request
 * @version 1
 * @see {@link /specification/accounts-channel | Accounts Channel}
 */
export interface AuthBeginParams extends BaseParams {
  channel: 'ahp-accounts://';
  /** Exact consumer from the host's current root or session state. */
  target: { consumer: AccountConsumer };
  /**
   * Offered flows. MUST include `clientBrokered`; an empty or unsupported
   * offer fails with `InvalidParams` without creating an attempt.
   */
  flows: AuthFlowSupport[];
  /**
   * Explicit live account to reauthorize. The host MUST verify the delivered
   * identity matches it. Omission admits an identity, reusing an existing
   * lifetime only when both verified identity and ownership context match.
   * Neither intent is inferred from a challenge.
   */
  accountId?: string;
}

/**
 * Acknowledgement of the selected client-brokered flow.
 *
 * The client MUST verify this flow before sending an attempt-bound token.
 *
 * @category Commands
 */
export interface AuthBeginResult {
  flow: AuthFlowKind.ClientBrokered;
  /** Host-issued id of the published pending admission. */
  attemptId: string;
}

/**
 * Whether token delivery completes an admission or renews a live account.
 *
 * Unknown bindings MUST be rejected, never interpreted as unbound delivery.
 *
 * @category Authentication
 * @exhaustive
 */
export const enum BrokeredAuthenticationBindingKind {
  Attempt = 'attempt',
  Account = 'account',
}

/**
 * Complete a live admission; its consumer preconditions still apply.
 *
 * @category Authentication
 */
export interface BrokeredAuthenticationAttemptBinding {
  kind: BrokeredAuthenticationBindingKind.Attempt;
  /** Pending attempt from `authBegin`. */
  attemptId: string;
}

/**
 * Renew credentials under a live account without changing any selections.
 *
 * @category Authentication
 */
export interface BrokeredAuthenticationAccountBinding {
  kind: BrokeredAuthenticationBindingKind.Account;
  /** Live host-issued account lifetime. Retired ids fail with `Conflict`. */
  accountId: string;
}

/**
 * Required token-to-lifetime binding in shared client-brokered mode.
 *
 * @category Authentication
 */
export type BrokeredAuthenticationBinding =
  | BrokeredAuthenticationAttemptBinding
  | BrokeredAuthenticationAccountBinding;
