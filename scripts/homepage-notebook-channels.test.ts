import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AutomationHost, automationFrames, automationUri, buildAutomationFrames, buildTerminalFrames, catalogueChannel, chatEndSeq,
  enabledFeature, initializeParams, initializeResult, negotiatedFeatures, runSession, runUri, terminalFrames, terminalUri, terminalView,
} from '../docs/.vitepress/theme/notebook-channels.js'
import { clientIds } from '../docs/.vitepress/theme/notebook.js'
import { automationRunReducer } from '../types/channels-automation-run/reducer.js'
import { AutomationRunOriginKind, AutomationRunStatus } from '../types/channels-automation-run/state.js'
import { automationReducer } from '../types/channels-automation/reducer.js'
import { AutomationOperation } from '../types/channels-automation/state.js'
import { terminalReducer } from '../types/channels-terminal/reducer.js'
import { TerminalClaimKind } from '../types/channels-terminal/state.js'
import { ActionType } from '../types/common/actions.js'
import type { ActionEnvelope } from '../types/common/actions.js'

const methods = (wire: { message: unknown }[]) => wire.map(record => (record.message as { method?: string }).method)

test('automation frames are deterministic and the catalogue mirror converges through automationReducer', () => {
  assert.deepEqual(buildAutomationFrames(), automationFrames())
  const frames = automationFrames()
  assert.deepEqual(frames.map(frame => frame.slug), ['catalogue', 'run-requested', 'run-running'])
  for (const frame of frames) assert.deepEqual(frame.desktop.catalogue, frame.host.catalogue, frame.slug)
  const entry = frames[0].host.catalogue.entries[0]
  assert.equal(entry.resource, automationUri)
  assert.ok(entry.nextRunAt, 'the host computes nextRunAt')
  assert.ok(entry.operations.includes(AutomationOperation.Run))
  // The desktop subscribes to the catalogue, never to the entry URI.
  const subscribe = frames[0].wire[0].message as { method: string; params: { channel: string } }
  assert.equal(subscribe.method, 'subscribe')
  assert.equal(subscribe.params.channel, catalogueChannel)
  for (const frame of frames) {
    for (const record of frame.wire) {
      const params = (record.message as { params?: { channel?: string } }).params
      assert.notEqual(params?.channel, automationUri)
    }
  }
  assert.equal(frames[2].desktop.lastSeenServerSeq, frames[2].serverSeq)
})

test('runAutomation persists a pending run, is idempotent per requestId and only targets the catalogue', () => {
  const host = new AutomationHost()
  const params = { channel: catalogueChannel, automation: automationUri, requestId: 'req-1' }
  const first = host.runAutomation(params)
  assert.deepEqual(first.result, { resource: runUri })
  assert.equal(first.envelopes.length, 1)
  assert.equal(first.envelopes[0].action.type, ActionType.AutomationSet)
  assert.equal(first.envelopes[0].serverSeq, chatEndSeq + 1)
  const run = host.runs.get(runUri)!
  assert.equal(run.lifecycle.status, AutomationRunStatus.Pending)
  assert.equal(run.origin.kind, AutomationRunOriginKind.Manual)
  assert.deepEqual(run.sessions, [], 'persisted before any session exists')
  assert.equal(host.catalogue.entries[0].runs[0].resource, runUri)
  assert.equal(host.catalogue.entries[0].runCount, 2)

  const again = host.runAutomation(params)
  assert.deepEqual(again, { result: { resource: runUri }, envelopes: [] })
  assert.equal(host.catalogue.entries[0].runCount, 2)
  assert.throws(() => host.runAutomation({ ...params, channel: automationUri as typeof catalogueChannel }), /ahp-automations:\/\//)
  assert.throws(() => host.runAutomation({ ...params, automation: 'ahp-automation:/missing' }), /Unknown automation/)

  // Create/update requests are reducer no-ops: only the host's automation/set changes the catalogue.
  const entry = host.catalogue.entries[0]
  for (const action of [
    { type: ActionType.AutomationCreateRequested, resource: 'ahp-automation:/draft', definition: entry.definition },
    { type: ActionType.AutomationUpdateRequested, resource: automationUri, changes: { enabled: false } },
  ] as const) {
    const before = structuredClone(host.catalogue)
    assert.equal(automationReducer(before, action), before)
  }
})

test('the run reaches running in a fresh session through automationRunReducer', () => {
  const frame = automationFrames()[2]
  const run = frame.tablet!.run
  assert.deepEqual(run, frame.host.run)
  assert.equal(run.lifecycle.status, AutomationRunStatus.Running)
  assert.deepEqual(run.sessions, [runSession])
  assert.equal(run.primarySession, runSession)
  assert.deepEqual(frame.tablet!.origin, { kind: 'automation', automation: automationUri, run: runUri })
  const replayed = frame.wire
    .map(record => (record.message as { params?: ActionEnvelope }).params)
    .filter((envelope): envelope is ActionEnvelope => envelope?.channel === runUri)
  assert.deepEqual(replayed.map(envelope => envelope.action.type), [
    ActionType.AutomationRunSessionSet, ActionType.AutomationRunPrimarySessionChanged, ActionType.AutomationRunLifecycleChanged,
  ])
  const pending = automationFrames()[1].host.run!
  assert.deepEqual(replayed.reduce((state, envelope) => automationRunReducer(state, envelope.action as never), pending), run)
})

test('terminal claims narrow over time, input is a no-op and the desktop mirror converges', () => {
  assert.deepEqual(buildTerminalFrames(), terminalFrames())
  const [agent, background, takeOver] = terminalFrames()
  assert.equal(agent.host.claim.kind, TerminalClaimKind.Session)
  assert.ok('toolCallId' in agent.host.claim && agent.host.claim.toolCallId)
  assert.equal(agent.root.terminals?.[0].resource, terminalUri)
  assert.equal(background.host.claim.kind, TerminalClaimKind.Session)
  assert.ok(!('toolCallId' in background.host.claim))
  assert.deepEqual(takeOver.host.claim, { kind: TerminalClaimKind.Client, clientId: clientIds.desktop })

  const before = structuredClone(background.host)
  assert.deepEqual(terminalReducer(before, { type: ActionType.TerminalInput, data: 'ls\r' }), before)

  const commands = takeOver.host.content.flatMap(part => part.type === 'command' ? [part] : [])
  assert.deepEqual(commands.map(part => [part.commandLine, part.isComplete, part.exitCode]), [['npm test -- chat', true, 0], ['npm run lint', true, 0]])
  for (const frame of terminalFrames()) {
    assert.deepEqual(frame.desktop.confirmed, frame.host, frame.slug)
    assert.deepEqual(frame.desktop.pending, [], frame.slug)
    assert.deepEqual(terminalView(frame.desktop), frame.host)
    assert.equal(frame.desktop.lastSeenServerSeq, frame.serverSeq)
  }
  assert.deepEqual(methods(takeOver.wire).slice(0, 2), ['dispatchAction', 'dispatchAction'])
  const echoes = takeOver.wire.slice(2, 4).map(record => (record.message as { params: ActionEnvelope }).params)
  assert.deepEqual(echoes.map(envelope => envelope.origin?.clientId), [clientIds.desktop, clientIds.desktop])
  // Sequence numbers continue the chat and automation story without gaps.
  const seqs = terminalFrames().flatMap(frame => frame.wire.map(record => (record.message as { params?: ActionEnvelope }).params?.serverSeq).filter(Boolean))
  assert.deepEqual(seqs, Array.from({ length: seqs.length }, (_, index) => seqs[0]! + index))
  assert.ok(seqs[0]! > automationFrames()[2].serverSeq)
})

test('negotiation picks a supported version and gates channels on what the host advertises', () => {
  const params = initializeParams()
  assert.ok(params.protocolVersions.includes('1.0.0'))
  const full = initializeResult(params)
  assert.equal(full.protocolVersion, '1.0.0')
  assert.ok(negotiatedFeatures(full).every(enabledFeature))
  const noAutomations = negotiatedFeatures(initializeResult(params, { terminals: true }))
  assert.deepEqual(noAutomations.map(row => [row.family, enabledFeature(row)]), [['chat', true], ['terminals', true], ['automations', false]])
  const bare = negotiatedFeatures(initializeResult(params, {}))
  assert.deepEqual(bare.filter(enabledFeature).map(row => row.family), ['chat'])
  const chatOnly = negotiatedFeatures(full, { chat: true, terminals: false, automations: false })
  assert.deepEqual(chatOnly.filter(enabledFeature).map(row => row.family), ['chat'])
  assert.throws(() => initializeResult({ ...params, protocolVersions: ['0.1.0'] }), /UnsupportedProtocolVersion/)
})
