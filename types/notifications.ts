/**
 * Notification Types — Aggregator shim that re-exports channel-organized
 * notification declarations. New code should import directly from the
 * per-channel files under `types/common/` and `types/channels-root/`.
 *
 * @module notifications
 */

export * from './common/notifications.js';
export * from './channels-root/notifications.js';
