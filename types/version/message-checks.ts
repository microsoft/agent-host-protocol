/**
 * Message Map Exhaustiveness Checks — Compile-time verification that the
 * command and notification maps in messages.ts stay in sync with the actual
 * method definitions, and that every command and notification carries a
 * top-level `channel: URI`.
 *
 * If a method is added to commands.ts or notifications.ts but not
 * registered in the maps (or vice versa), the compiler will surface an
 * error here. If any command or notification's params shape is missing
 * `channel: URI`, the compiler will also surface an error.
 *
 * @module version/message-checks
 */

import type {
  CommandMap,
  ClientNotificationMap,
  ServerNotificationMap,
  ServerCommandMap,
} from '../messages.js';
import type { BaseParams } from '../commands.js';
import type { URI } from '../state.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type _Exact<A, B> = [A] extends [B] ? [B] extends [A] ? true : never : never;

/**
 * Resolves to `true` if every entry in `M` has params extending
 * {@link BaseParams} (i.e. carries a top-level `channel: URI`). Any
 * offending key is mapped to `never`, so the final union evaluates to
 * `never` and the assertion below fails to compile.
 */
type _AllParamsHaveChannel<M> = {
  [K in keyof M]: M[K] extends { params: BaseParams } ? true : never;
}[keyof M];

/**
 * Same as {@link _AllParamsHaveChannel} but for notification maps where
 * params are not required to extend `BaseParams` directly — only to have
 * a `channel: URI` field. Notifications keep using the structural check
 * so external producers (e.g. the `action` envelope) don't need to
 * import `BaseParams`.
 */
type _AllNotificationParamsHaveChannel<M> = {
  [K in keyof M]: M[K] extends { params: { channel: URI } } ? true : never;
}[keyof M];

// ─── Expected Method Names ───────────────────────────────────────────────────

/** All methods annotated `@messageType Request` in commands.ts. */
type _ExpectedCommands =
  | 'initialize'
  | 'ping'
  | 'reconnect'
  | 'subscribe'
  | 'createSession'
  | 'disposeSession'
  | 'createChat'
  | 'disposeChat'
  | 'createTerminal'
  | 'disposeTerminal'
  | 'createResourceWatch'
  | 'listSessions'
  | 'resourceRead'
  | 'resourceWrite'
  | 'resourceList'
  | 'resourceCopy'
  | 'resourceDelete'
  | 'resourceMove'
  | 'resourceResolve'
  | 'resourceMkdir'
  | 'resourceRequest'
  | 'fetchTurns'
  | 'authenticate'
  | 'resolveSessionConfig'
  | 'sessionConfigCompletions'
  | 'completions'
  | 'invokeChangesetOperation';

/** All methods annotated `@messageType Notification` (client → server). */
type _ExpectedClientNotifications =
  | 'unsubscribe'
  | 'dispatchAction';

/** All server → client notification methods. */
type _ExpectedServerNotifications =
  | 'action'
  | 'root/sessionAdded'
  | 'root/sessionRemoved'
  | 'root/sessionSummaryChanged'
  | 'auth/required'
  | 'otlp/exportLogs'
  | 'otlp/exportTraces'
  | 'otlp/exportMetrics';

/** All server → client request methods. */
type _ExpectedServerCommands =
  | 'resourceRead'
  | 'resourceWrite'
  | 'resourceList'
  | 'resourceCopy'
  | 'resourceDelete'
  | 'resourceMove'
  | 'resourceResolve'
  | 'resourceMkdir'
  | 'resourceRequest'
  | 'createResourceWatch';

// ─── Assertions ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCommandMapKeys = _Exact<keyof CommandMap, _ExpectedCommands>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckClientNotificationMapKeys = _Exact<keyof ClientNotificationMap, _ExpectedClientNotifications>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerNotificationMapKeys = _Exact<keyof ServerNotificationMap, _ExpectedServerNotifications>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerCommandMapKeys = _Exact<keyof ServerCommandMap, _ExpectedServerCommands>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckClientNotificationsHaveChannel = _AllNotificationParamsHaveChannel<ClientNotificationMap> extends true ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerNotificationsHaveChannel = _AllNotificationParamsHaveChannel<ServerNotificationMap> extends true ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCommandsHaveChannel = _AllParamsHaveChannel<CommandMap> extends true ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerCommandsHaveChannel = _AllParamsHaveChannel<ServerCommandMap> extends true ? true : never;
