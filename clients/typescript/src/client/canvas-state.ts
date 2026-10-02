/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Snapshot } from '../types/common/state.js';
import type { CanvasState } from '../types/channels-canvas/state.js';

/** Identifies the canvas variant of an untagged snapshot state. */
export function isCanvasState(state: Snapshot['state']): state is CanvasState {
  if (typeof state !== 'object' || state === null
    || !('instanceId' in state) || typeof state.instanceId !== 'string'
    || !('extensionId' in state) || typeof state.extensionId !== 'string'
    || !('canvasId' in state) || typeof state.canvasId !== 'string') {
    return false;
  }
  return (state.extensionName === undefined || typeof state.extensionName === 'string')
    && (state.title === undefined || typeof state.title === 'string')
    && (state.status === undefined || typeof state.status === 'string')
    && (state.url === undefined || typeof state.url === 'string');
}
