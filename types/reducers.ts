/**
 * Reducer Functions — Aggregator shim that re-exports the channel-organized
 * pure state reducers and dispatch helpers.
 *
 * @module reducers
 */

export { rootReducer } from './channels-root/reducer.js';
export { sessionReducer } from './channels-session/reducer.js';
export { chatReducer } from './channels-chat/reducer.js';
export { terminalReducer } from './channels-terminal/reducer.js';
export { changesetReducer } from './channels-changeset/reducer.js';
export { annotationsReducer } from './channels-annotations/reducer.js';
export { resourceWatchReducer } from './channels-resource-watch/reducer.js';
export { softAssertNever, isClientDispatchable } from './common/reducer-helpers.js';
