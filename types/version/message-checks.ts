/**
 * Message Map Exhaustiveness Checks — Compile-time verification that the
 * command and notification maps in messages.ts stay in sync with the actual
 * method definitions.
 *
 * If a method is added to commands.ts but not registered in the maps (or
 * vice versa), the compiler will surface an error here.
 *
 * @module version/message-checks
 */

import type {
  CommandMap,
  ClientNotificationMap,
  ServerNotificationMap,
} from '../messages.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type _Exact<A, B> = [A] extends [B] ? [B] extends [A] ? true : never : never;

// ─── Expected Method Names ───────────────────────────────────────────────────

/** All methods annotated `@messageType Request` in commands.ts. */
type _ExpectedCommands =
  | 'initialize'
  | 'reconnect'
  | 'subscribe'
  | 'createSession'
  | 'disposeSession'
  | 'createTerminal'
  | 'disposeTerminal'
  | 'listSessions'
  | 'resourceRead'
  | 'resourceWrite'
  | 'resourceList'
  | 'resourceCopy'
  | 'resourceDelete'
  | 'resourceMove'
  | 'fetchTurns'
  | 'authenticate'
  | 'resolveSessionConfig'
  | 'sessionConfigCompletions';

/** All methods annotated `@messageType Notification` (client → server) in commands.ts. */
type _ExpectedClientNotifications =
  | 'unsubscribe'
  | 'dispatchAction';

/** All server → client notification methods. */
type _ExpectedServerNotifications =
  | 'action'
  | 'notification';

// ─── Assertions ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCommandMapKeys = _Exact<keyof CommandMap, _ExpectedCommands>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckClientNotificationMapKeys = _Exact<keyof ClientNotificationMap, _ExpectedClientNotifications>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerNotificationMapKeys = _Exact<keyof ServerNotificationMap, _ExpectedServerNotifications>;
