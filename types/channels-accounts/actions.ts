/**
 * Accounts Channel Actions for `ahp-accounts://`.
 *
 * @module channels-accounts/actions
 */

import { ActionType } from '../common/actions.js';
import type { AuthAttemptState, HostAccount } from './state.js';

/**
 * Upsert a complete account by id, appending or replacing it in place.
 *
 * Only the host publishes accounts and consumer selections. When moving a
 * consumer, the host detaches its old selection before publishing the new one.
 * Credential authority changes atomically, regardless of action delivery.
 *
 * @category Accounts Actions
 * @version 1
 */
export interface AccountSetAction {
  type: ActionType.AccountSet;
  /** Complete account entry. */
  account: HostAccount;
}

/**
 * Remove one account lifetime and its consumer selections by id.
 *
 * The host MUST atomically fence all affected credentials, rotations,
 * dependencies, admissions, and replay, and promptly cancel affected active
 * work before accepting this action. Other accounts and independently owned
 * work MUST remain unaffected. No upstream client grant is revoked.
 * A surviving source credential MUST NOT automatically recreate a removed
 * derived lifetime or its consumer selections.
 *
 * The host revalidates permission and removability. Rejection is echoed with
 * `ActionEnvelope.rejectionReason`; it is never silent. An authorized removal
 * of an absent id is an accepted no-op, not removal of another account.
 *
 * @category Accounts Actions
 * @version 1
 * @clientDispatchable
 * @see {@link /specification/accounts-channel | Accounts Channel}
 */
export interface AccountRemovedAction {
  type: ActionType.AccountRemoved;
  /** Host-issued account lifetime to retire. No resource or token precondition. */
  id: string;
}

/**
 * Upsert a complete admission by id, appending or replacing it in place.
 *
 * Only the host may publish pending, completed, or failed admission state.
 *
 * @category Accounts Actions
 * @version 1
 */
export interface AuthAttemptSetAction {
  type: ActionType.AuthAttemptSet;
  /** Complete admission entry. */
  attempt: AuthAttemptState;
}

/**
 * Cancel a pending admission, or let the host discard a retained outcome.
 *
 * For a client dispatch, the host validates the initiating authorization
 * context and atomically prevents credential installation before accepting.
 * If completion or failure won the race, reject with `rejectionReason` and
 * retain the outcome so the client can reconcile and remove the account when
 * needed. Hosts MUST retain completed attempts while their account is live;
 * failed outcomes and receipts for removed accounts may expire.
 *
 * An authorized removal of an absent id is a no-op. After authoritative
 * reconciliation, an absent attempt cannot own a still-live account lifetime.
 *
 * @category Accounts Actions
 * @version 1
 * @clientDispatchable
 */
export interface AuthAttemptRemovedAction {
  type: ActionType.AuthAttemptRemoved;
  /** Host-issued attempt id. */
  id: string;
}
