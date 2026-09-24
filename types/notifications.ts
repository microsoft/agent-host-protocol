/**
 * Notification Types — Aggregator shim that re-exports channel-organized
 * notification declarations. New code should import directly from the
 * per-channel files under `types/common/`, `types/channels-root/`, and
 * `types/channels-chat/`.
 *
 * @module notifications
 */

export * from './common/notifications.js';
export * from './channels-root/notifications.js';
export * from './channels-chat/notifications.js';
export * from './channels-otlp/notifications.js';
