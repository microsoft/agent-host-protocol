/**
 * Snapshot variants in shape-dispatch order, matching the Kotlin serializer.
 * Automation runs must precede sessions (both have lifecycle); sessions must
 * precede annotations (sessions can carry an annotations summary).
 */
export const SNAPSHOT_STATE_SHAPES = [
  { variant: 'AutomationRun', type: 'AutomationRunState', keys: ['automation', 'origin', 'sessions'] },
  { variant: 'Automations', type: 'AutomationState', keys: ['entries'] },
  { variant: 'Session', type: 'SessionState', keys: ['lifecycle'] },
  { variant: 'Chat', type: 'ChatState', keys: ['turns'] },
  { variant: 'Canvas', type: 'CanvasState', keys: ['instanceId', 'extensionId', 'canvasId'] },
  { variant: 'Changeset', type: 'ChangesetState', keys: ['status', 'files'] },
  { variant: 'ResourceWatch', type: 'ResourceWatchState', keys: ['root', 'recursive'] },
  { variant: 'Annotations', type: 'AnnotationsState', keys: ['annotations'] },
  { variant: 'Terminal', type: 'TerminalState', keys: ['content'] },
  { variant: 'Root', type: 'RootState', keys: ['agents'] },
] as const;
