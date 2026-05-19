/**
 * State Types — Aggregator shim that re-exports channel-organized state
 * declarations. New code should import directly from the per-channel files
 * under `types/common/`, `types/channels-root/`, `types/channels-session/`,
 * `types/channels-terminal/`, and `types/channels-changeset/`.
 *
 * @module state
 */

export * from './common/state.js';
export * from './channels-root/state.js';
export * from './channels-session/state.js';
export * from './channels-terminal/state.js';
export * from './channels-changeset/state.js';
