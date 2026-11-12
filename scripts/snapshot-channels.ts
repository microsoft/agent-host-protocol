/**
 * Subscribable channel URI schemes and their SnapshotState variants/native types.
 * Keep in sync with docs/specification/subscriptions.md and types/common/state.ts.
 * Select by the scheme before the first colon; unlisted schemes preserve raw JSON
 * as Unknown. An ahp-automation: URI identifies a catalogue entry, not a channel.
 */
export const SNAPSHOT_CHANNELS = [
  { scheme: 'ahp-root', variant: 'Root', type: 'RootState' },
  { scheme: 'ahp-automations', variant: 'Automations', type: 'AutomationState' },
  { scheme: 'ahp-session', variant: 'Session', type: 'SessionState' },
  { scheme: 'ahp-chat', variant: 'Chat', type: 'ChatState' },
  { scheme: 'ahp-canvas', variant: 'Canvas', type: 'CanvasState' },
  { scheme: 'ahp-terminal', variant: 'Terminal', type: 'TerminalState' },
  { scheme: 'ahp-changeset', variant: 'Changeset', type: 'ChangesetState' },
  { scheme: 'ahp-resource-watch', variant: 'ResourceWatch', type: 'ResourceWatchState' },
  { scheme: 'ahp-annotations', variant: 'Annotations', type: 'AnnotationsState' },
  { scheme: 'ahp-automation-run', variant: 'AutomationRun', type: 'AutomationRunState' },
  { scheme: 'ahp-tcp', variant: 'Empty', type: 'EmptyState' },
  { scheme: 'ahp-otlp', variant: 'Empty', type: 'EmptyState' },
] as const;
