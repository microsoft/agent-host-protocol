/**
 * Command Types — Aggregator shim that re-exports channel-organized command
 * declarations. New code should import directly from the per-channel files
 * under `types/common/`, `types/channels-root/`, `types/channels-session/`,
 * `types/channels-terminal/`, and `types/channels-changeset/`.
 *
 * @module commands
 */

export * from './common/commands.js';
export * from './channels-root/commands.js';
export * from './channels-session/commands.js';
export * from './channels-terminal/commands.js';
export * from './channels-changeset/commands.js';
