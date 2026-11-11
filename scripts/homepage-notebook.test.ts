import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  NotebookSession, buildCheckpoints, chatChannel, checkpoints, clampStep, clientIds, converged, deviceIds, diffJson,
  optimisticState, pickActiveStep, rootChannel, stateFingerprint, subjectState,
} from '../docs/.vitepress/theme/notebook.js'
import { chatReducer } from '../types/channels-chat/reducer.js'
import { ToolCallStatus } from '../types/channels-chat/state.js'
import type { ChatState } from '../types/channels-chat/state.js'
import { ActionType } from '../types/common/actions.js'
import { ReconnectResultType } from '../types/common/commands.js'

const frames = checkpoints()
const at = (slug: string) => frames.find(frame => frame.slug === slug)!

test('checkpoints are deterministic: rebuilding, skipping and walking backwards yield identical frames', () => {
  assert.equal(frames.length, 10)
  assert.deepEqual(buildCheckpoints(), frames)
  const order = [9, 2, 7, 0, 5, 5, 8, 1, 3]
  const visited = order.map(index => structuredClone(frames[index]))
  assert.deepEqual(visited, order.map(index => buildCheckpoints()[index]))
  for (let index = frames.length - 1; index >= 0; index--) assert.equal(frames[index].index, index)
})

test('checkpoint navigation holds until an explicit step and clamps at the ends', () => {
  assert.equal(clampStep(-3), 0)
  assert.equal(clampStep(4.7), 4)
  assert.equal(clampStep(99), 9)
  assert.equal(clampStep(Number.NaN), 0)
  assert.equal(pickActiveStep([100, 600, 1200], 50), 0)
  assert.equal(pickActiveStep([-900, -300, 380, 980], 400), 2)
  assert.equal(pickActiveStep([-900, -300, -10, -5], 400), 3)
  assert.equal(subjectState(frames[1], 'desktop').activeTurn?.id, subjectState(structuredClone(frames[1]), 'desktop').activeTurn?.id)
})

test('optimistic write is pending until the host echo returns with the same origin', () => {
  const optimistic = at('optimistic')
  assert.equal(optimistic.serverSeq, 40)
  assert.equal(optimistic.host.activeTurn, undefined)
  assert.deepEqual(optimistic.devices.desktop.pending.map(entry => entry.clientSeq), [7])
  assert.equal(optimistic.devices.desktop.confirmed.activeTurn, undefined)
  assert.equal(optimisticState(optimistic.devices.desktop).activeTurn?.message.text, 'Run the reducer tests before I merge.')
  assert.deepEqual(optimistic.wire.map(record => record.message), [{ jsonrpc: '2.0', method: 'dispatchAction', params: { channel: chatChannel, clientSeq: 7, action: optimistic.devices.desktop.pending[0].action } }])

  const hostReduces = at('host-reduces')
  assert.equal(hostReduces.serverSeq, 41)
  assert.equal(hostReduces.host.activeTurn?.id, 'turn-7')
  assert.equal(hostReduces.devices.desktop.pending.length, 1)
  assert.deepEqual(hostReduces.applied.host, [{ via: 'host', type: ActionType.ChatTurnStarted, serverSeq: 41, origin: { clientId: clientIds.desktop, clientSeq: 7 } }])

  const echo = at('echo')
  for (const id of deviceIds) {
    assert.ok(converged(echo.devices[id], echo.host), id)
    assert.equal(echo.devices[id].lastSeenServerSeq, 41)
  }
})

test('the phone misses host progress while offline and keeps its unacknowledged approval pending', () => {
  const waiting = at('tool-waits')
  const tool = waiting.host.activeTurn?.responseParts.find(part => 'toolCall' in part)
  assert.equal(tool && 'toolCall' in tool ? tool.toolCall.status : undefined, ToolCallStatus.PendingConfirmation)

  const dropped = at('link-drops')
  assert.equal(dropped.serverSeq, 46)
  assert.equal(dropped.devices.phone.link, 'offline')
  assert.equal(dropped.devices.phone.lastSeenServerSeq, 45)
  assert.deepEqual(dropped.devices.phone.pending.map(entry => [entry.clientSeq, entry.action.type]), [[3, ActionType.ChatToolCallConfirmed]])
  assert.ok(converged(dropped.devices.desktop, dropped.host))

  const advanced = at('host-advances')
  assert.equal(advanced.serverSeq, 49)
  assert.equal(advanced.host.activeTurn, undefined)
  assert.equal(advanced.devices.phone.lastSeenServerSeq, 45)
  assert.ok(!converged(advanced.devices.phone, advanced.host))
  assert.ok(converged(advanced.devices.tablet, advanced.host))
  assert.equal(advanced.applied.phone, undefined)
})

test('reconnect sends lastSeenServerSeq and subscriptions as a request; replay is ordered inside the response', () => {
  const request = at('reconnect-request')
  assert.deepEqual(request.wire[0].message, {
    jsonrpc: '2.0', id: 2, method: 'reconnect',
    params: { channel: rootChannel, clientId: clientIds.phone, lastSeenServerSeq: 45, subscriptions: [rootChannel, chatChannel] },
  })
  assert.equal(request.devices.phone.link, 'reconnecting')

  const replay = at('replay')
  assert.equal(replay.wire.length, 1)
  const response = replay.wire[0].message
  assert.ok('result' in response && 'type' in response.result && response.result.type === ReconnectResultType.Replay)
  assert.deepEqual(response.result.actions.map(envelope => envelope.serverSeq), [46, 47, 48, 49])
  assert.deepEqual(response.result.actions[0].origin, { clientId: clientIds.phone, clientSeq: 3 })
  assert.deepEqual(response.result.missing, [])
  assert.ok(response.result.actions.every(envelope => envelope.channel === chatChannel))
  assert.ok(replay.wire.every(record => !('method' in record.message && record.message.method === 'action')), 'no replayed notifications')
  assert.deepEqual(replay.applied.phone?.map(entry => [entry.via, entry.serverSeq]), [['replay', 46], ['replay', 47], ['replay', 48], ['replay', 49]])
  assert.equal(replay.devices.phone.link, 'connected')
  for (const id of deviceIds) assert.ok(converged(replay.devices[id], replay.host), id)

  const folded = response.result.actions.reduce<ChatState>((state, envelope) => chatReducer(state, envelope.action as never), request.devices.phone.confirmed)
  assert.equal(stateFingerprint(folded), stateFingerprint(replay.host))
})

test('a gap older than the replay buffer falls back to snapshots and still converges', () => {
  const snapshot = at('snapshot')
  assert.equal(snapshot.base, at('reconnect-request').index)
  const response = snapshot.wire[0].message
  assert.ok('result' in response && 'type' in response.result && response.result.type === ReconnectResultType.Snapshot)
  assert.deepEqual(response.result.snapshots.map(entry => [entry.resource, entry.fromSeq]), [[rootChannel, 49], [chatChannel, 49]])
  assert.equal(snapshot.devices.phone.lastSeenServerSeq, 49)
  assert.ok(converged(snapshot.devices.phone, snapshot.host))
  assert.equal(stateFingerprint(snapshot.host), stateFingerprint(at('replay').host))
})

test('session guards order, offline dispatch and unknown subscriptions', () => {
  const session = new NotebookSession()
  session.disconnect('tablet')
  assert.throws(() => session.dispatch('tablet', { type: ActionType.ChatIsReadChanged, isRead: true } as never), /offline/)
  const params = session.reconnectRequest('tablet')
  const result = session.reconnectResult({ ...params, subscriptions: [...params.subscriptions, 'ahp-session:/gone'] }, 1)
  assert.ok(result.type === ReconnectResultType.Replay)
  assert.deepEqual(result.missing, ['ahp-session:/gone'])
  session.completeReconnect('tablet', result)
  assert.deepEqual(session.devices.tablet.subscriptions, [rootChannel, chatChannel])
})

test('diffJson reports precise bounded paths', () => {
  assert.deepEqual(diffJson({ a: 1, b: [1] }, { a: 2, b: [1, 2], c: 'x' }).entries, [
    { op: '~', path: 'a', before: '1', after: '2' },
    { op: '+', path: 'b[1]', after: '2' },
    { op: '+', path: 'c', after: '"x"' },
  ])
  assert.deepEqual(diffJson({ kept: 1, gone: 'x', hole: undefined }, { kept: 1, gone: undefined, hole: undefined }).entries, [
    { op: '-', path: 'gone', before: '"x"' },
  ])
  const bounded = diffJson({}, Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`k${index}`, index])), 5)
  assert.equal(bounded.entries.length, 5)
  assert.equal(bounded.more, 25)
})
