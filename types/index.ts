/**
 * Agent Host Protocol — Type Definitions
 *
 * @module agent-host-protocol
 * @description Canonical TypeScript type definitions for the Agent Host Protocol.
 * These types are the source of truth from which documentation and JSON Schema
 * are generated.
 */

export * from './state.js';
export * from './actions.js';
export * from './action-origin.generated.js';
export * from './commands.js';
export * from './notifications.js';
export * from './messages.js';
export * from './errors.js';
export * from './version/registry.js';

// `ChatAction` is declared both by hand and in the generated origin module, so
// disambiguate the `export *`s above.
export type { ChatAction } from './action-origin.generated.js';

// Explicit: the shim also re-exports the internal `softAssertNever`.
export {
  rootReducer,
  sessionReducer,
  chatReducer,
  terminalReducer,
  changesetReducer,
  annotationsReducer,
  resourceWatchReducer,
  automationReducer,
  automationRunReducer,
  isClientDispatchable,
} from './reducers.js';
