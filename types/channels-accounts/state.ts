/**
 * Accounts Channel State Types for `ahp-accounts://`.
 *
 * Stability: 1.0 - Early development
 *
 * @module channels-accounts/state
 */

import type { ErrorInfo, URI } from '../common/state.js';

/**
 * A consumer whose credential selection the host manages.
 *
 * Unknown consumer kinds MUST NOT be interpreted as a known consumer.
 *
 * @category Accounts State
 * @nonexhaustive
 */
export const enum AccountConsumerKind {
  Agent = 'agent',
  McpServer = 'mcpServer',
}

/**
 * One protected resource used by an advertised agent provider.
 *
 * @category Accounts State
 */
export interface AgentAccountConsumer {
  kind: AccountConsumerKind.Agent;
  /** Matches `AgentInfo.provider`. */
  provider: string;
  /** Exact identifier from the provider's advertised protected resources. */
  resource: string;
}

/**
 * One host-published MCP server customization in a live session.
 *
 * The host resolves its resource, rather than treating a server name as a
 * globally unique identity. A replaced customization or changed resource
 * requires a fresh admission; a missing binding MUST NOT select another account.
 *
 * @category Accounts State
 */
export interface McpServerAccountConsumer {
  kind: AccountConsumerKind.McpServer;
  /** Session URI containing the customization. */
  session: URI;
  /** Session-unique `McpServerCustomization.id`, not its display name. */
  customizationId: string;
}

/**
 * Exact consumer selecting an account. Selection and token renewal are distinct:
 * renewing an account MUST NOT change which account a consumer selects.
 *
 * @category Accounts State
 */
export type AccountConsumer = AgentAccountConsumer | McpServerAccountConsumer;

/**
 * A host-held, revocable authorization lifetime for one verified identity.
 *
 * Rotations and resource/scope variants in the same ownership context share
 * this entry, even when supplied by different clients. Independently owned
 * grants MUST NOT be coalesced merely because their human identity matches.
 * Tokens, token hashes, and client-local identity assertions never belong here.
 *
 * @category Accounts State
 */
export interface HostAccount {
  /**
   * Opaque, host-assigned key, stable across rotation and scoped to the host
   * authority. Removal retires it permanently; a deliberate later admission
   * receives a new id. Possessing the id is not permission to use or remove it.
   */
  id: string;
  /** Display label, not an identity proof. */
  label: string;
  /**
   * Whether the host can contain and remove its local credential lifetime.
   * This does not promise upstream grant revocation or authorize the caller.
   */
  removable: boolean;
  /**
   * Explicit consumer selections. A consumer MUST NOT select two accounts.
   * Removing this entry drops these selections but MUST NOT select a fallback.
   * Previously started work can still depend on this account after a move;
   * this list is therefore not the host's complete revocation set.
   */
  consumers: AccountConsumer[];
}

/**
 * Lifecycle of a client-brokered credential admission.
 *
 * Clients preserve unknown statuses but MUST NOT interpret them as success.
 *
 * @category Accounts State
 * @nonexhaustive
 */
export const enum AuthAttemptStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
}

/**
 * Correlation and target shared by every admission outcome.
 *
 * @category Accounts State
 */
export interface AuthAttemptBase {
  /** Host-assigned, single-use id. Not a bearer authorization. */
  id: string;
  /** Host-validated consumer selected for this admission. */
  consumer: AccountConsumer;
  /** Exact protected resource captured when the attempt was admitted. */
  resource: string;
}

/**
 * Awaiting a client-supplied token. No credential is usable from this state.
 *
 * @category Accounts State
 */
export interface AuthAttemptPendingState extends AuthAttemptBase {
  status: AuthAttemptStatus.Pending;
}

/**
 * Admission committed. Retained so a lost response can be reconciled.
 *
 * @category Accounts State
 */
export interface AuthAttemptCompletedState extends AuthAttemptBase {
  status: AuthAttemptStatus.Completed;
  /** The admitted authorization lifetime, which may subsequently be removed. */
  accountId: string;
}

/**
 * Admission failed or expired without installing a usable credential.
 *
 * @category Accounts State
 */
export interface AuthAttemptFailedState extends AuthAttemptBase {
  status: AuthAttemptStatus.Failed;
  /** Failure details, with no token or other secret content. */
  error: ErrorInfo;
}

/**
 * Recoverable admission state. Cancellation removes a pending entry. A completed
 * outcome MUST remain while its account lifetime is live; otherwise a client
 * losing the response could not discover which account to remove. Failed
 * outcomes and receipts for removed accounts may expire under host policy.
 *
 * @category Accounts State
 */
export type AuthAttemptState =
  | AuthAttemptPendingState
  | AuthAttemptCompletedState
  | AuthAttemptFailedState;

/**
 * Shared accounts and credential admissions on `ahp-accounts://`.
 *
 * Exposed only when `InitializeResult.authentication.flows` advertises
 * `clientBrokered`. Subscription and mutation are separately authorized.
 * State contains no access, refresh, or identity tokens.
 *
 * @category Accounts State
 * @see {@link /specification/accounts-channel | Accounts Channel}
 */
export interface AccountsState {
  /** Live, host-authoritative account lifetimes, keyed by `HostAccount.id`. */
  accounts: HostAccount[];
  /** Pending and retained terminal admissions, keyed by `AuthAttemptState.id`. */
  attempts: AuthAttemptState[];
}
