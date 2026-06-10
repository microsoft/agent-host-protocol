/**
 * Action Types — Aggregator shim that re-exports channel-organized action
 * declarations. New code should import directly from the per-channel files
 * under `types/common/`, `types/channels-root/`, `types/channels-session/`,
 * `types/channels-terminal/`, and `types/channels-changeset/`.
 *
 * @module actions
 */

export * from './common/actions.js';
export * from './channels-root/actions.js';
export * from './channels-session/actions.js';
export * from './channels-chat/actions.js';
export * from './channels-terminal/actions.js';
export * from './channels-changeset/actions.js';
export * from './channels-annotations/actions.js';
export * from './channels-resource-watch/actions.js';
