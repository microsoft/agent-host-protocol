/**
 * Snapshot variants in shape-dispatch order shared by all native clients.
 * Automation runs and terminals must precede sessions (all have lifecycle);
 * top-level content is unique to terminals. Sessions must precede annotations
 * (sessions can carry an annotations summary).
 */
export const SNAPSHOT_STATE_SHAPES = [
  { variant: 'AutomationRun', type: 'AutomationRunState', keys: ['automation', 'origin', 'sessions'] },
  { variant: 'Automations', type: 'AutomationState', keys: ['entries'] },
  { variant: 'Terminal', type: 'TerminalState', keys: ['content'] },
  { variant: 'Session', type: 'SessionState', keys: ['lifecycle'] },
  { variant: 'Chat', type: 'ChatState', keys: ['turns'] },
  { variant: 'Canvas', type: 'CanvasState', keys: ['instanceId', 'extensionId', 'canvasId'] },
  { variant: 'Changeset', type: 'ChangesetState', keys: ['status', 'files'] },
  { variant: 'ResourceWatch', type: 'ResourceWatchState', keys: ['root', 'recursive'] },
  { variant: 'Annotations', type: 'AnnotationsState', keys: ['annotations'] },
  { variant: 'Root', type: 'RootState', keys: ['agents'] },
] as const;
