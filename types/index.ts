/**
 * Agent Host Protocol — Type Definitions
 *
 * @module agent-host-protocol
 * @description Canonical TypeScript type definitions for the Agent Host Protocol.
 * These types are the source of truth from which documentation and JSON Schema
 * are generated.
 *
 * Every declaration in the per-channel modules is re-exported wholesale via
 * `export *` rather than through an explicit allowlist. The previous
 * hand-maintained list had silently fallen 60 declarations behind the sources
 * — including the whole customization and MCP-server subsystems — leaving them
 * unreachable for consumers of the published package. `export *` keeps this
 * entry point complete by construction, and `scripts/public-api.test.ts`
 * asserts it stays that way.
 *
 * The one curated section is the reducer block below, which deliberately omits
 * an internal helper.
 */

// State types
export * from './state.js';

// Action types
export * from './actions.js';

// Generated action origin types
export * from './action-origin.generated.js';

// `ChatAction` is declared twice — once by hand in `channels-chat/actions.ts`
// and once in the generated origin module — with identical member sets. Both
// reach this barrel through `export *`, so name it explicitly to resolve the
// ambiguity, preserving the generated declaration that the previous curated
// list exported. (The duplicate declaration itself is worth collapsing
// separately; doing it here would mix an unrelated source change into a
// packaging fix.)
export type { ChatAction } from './action-origin.generated.js';

// Command types
export * from './commands.js';

// Notification types
export * from './notifications.js';

// Message types (JSON-RPC wire format)
export * from './messages.js';

// Error codes
export * from './errors.js';

// Version registry
export * from './version/registry.js';

// Reducer functions
//
// Explicit rather than `export *`: the `./reducers.js` shim also re-exports
// `softAssertNever`, an internal reducer helper that is not part of the public
// protocol surface.
export {
  rootReducer,
  sessionReducer,
  chatReducer,
  terminalReducer,
  changesetReducer,
  annotationsReducer,
  resourceWatchReducer,
  isClientDispatchable,
} from './reducers.js';
