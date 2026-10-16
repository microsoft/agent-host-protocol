import type {
  AutomationAction, AutomationRunAction, ClientTerminalAction, RootAction, TerminalAction,
} from '../../../types/action-origin.generated.js'
import { automationRunReducer } from '../../../types/channels-automation-run/reducer.js'
import { AutomationRunOriginKind, AutomationRunStatus } from '../../../types/channels-automation-run/state.js'
import type { AutomationRunState, AutomationRunSummary } from '../../../types/channels-automation-run/state.js'
import type { RunAutomationParams, RunAutomationResult } from '../../../types/channels-automation/commands.js'
import { automationReducer } from '../../../types/channels-automation/reducer.js'
import { AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind } from '../../../types/channels-automation/state.js'
import type { AutomationEntry, AutomationState } from '../../../types/channels-automation/state.js'
import { MessageKind } from '../../../types/channels-chat/state.js'
import { rootReducer } from '../../../types/channels-root/reducer.js'
import type { RootState } from '../../../types/channels-root/state.js'
import { SessionOriginKind } from '../../../types/channels-session/state.js'
import type { AutomationSessionOrigin } from '../../../types/channels-session/state.js'
import { terminalReducer } from '../../../types/channels-terminal/reducer.js'
import { TerminalClaimKind, TerminalLifecycleStatus } from '../../../types/channels-terminal/state.js'
import type { TerminalClaim, TerminalInfo, TerminalState } from '../../../types/channels-terminal/state.js'
import { ActionType } from '../../../types/common/actions.js'
import type { ActionEnvelope, ActionOrigin } from '../../../types/common/actions.js'
import type { AutomationCapabilities, DispatchActionParams, InitializeParams, InitializeResult, SubscribeResult } from '../../../types/common/commands.js'
import type { URI } from '../../../types/common/state.js'
import { SUPPORTED_PROTOCOL_VERSIONS, negotiateProtocolVersion } from '../../../types/version/registry.js'
import { clientIds, rootChannel } from './notebook.js'
import type { Subject } from './notebook.js'

/**
 * Deterministic automation, terminal and negotiation scenes for the homepage
 * notebook. They continue the chat notebook's `serverSeq` (one ordered stream
 * per connection) and reduce every action through the canonical reducers.
 * Nothing here talks to a host: the "host" is a scripted local simulation.
 */

export const chatEndSeq = 49
export const catalogueChannel = 'ahp-automations://' as const
export const automationUri: URI = 'ahp-automation:/nightly-reducer-check'
export const runUri: URI = 'ahp-automation-run:/run-0312-manual'
export const runSession: URI = 'ahp-session:/auto-0312'
export const runChat: URI = 'ahp-chat:/auto-0312'
export const terminalUri: URI = 'ahp-terminal:/auto-0312-tests'

export interface ChannelWire {
  label: string
  from: Subject
  to: Subject[]
  message: unknown
}

const at = (minutes: number, seconds = 0) => new Date(Date.UTC(2026, 2, 12, 9, 41 + minutes, seconds)).toISOString()

/** What this sample host advertises in `InitializeResult.automations`. */
export const automationCapabilities: AutomationCapabilities = { schedules: { minIntervalMinutes: 15 }, runCancellation: {}, runHistoryLimit: 20 }

const previousRun: AutomationRunSummary = {
  resource: 'ahp-automation-run:/run-0312-0200',
  automation: automationUri,
  origin: { kind: AutomationRunOriginKind.Trigger, triggerId: 'weeknights', scheduledFor: '2026-03-12T02:00:00.000Z' },
  lifecycle: {
    status: AutomationRunStatus.Completed,
    createdAt: '2026-03-12T02:00:00.000Z', startedAt: '2026-03-12T02:00:01.000Z', completedAt: '2026-03-12T02:03:12.000Z',
  },
  primarySession: 'ahp-session:/auto-0312-0200',
  sessionCount: 1,
}

function initialEntry(): AutomationEntry {
  return {
    resource: automationUri,
    definition: {
      title: 'Nightly reducer check',
      message: { text: 'Run the chat reducer tests and summarise any failures.', origin: { kind: MessageKind.User } },
      session: { provider: 'local-sim', workingDirectories: ['file:///workspace/agent-host-protocol'] },
      enabled: true,
      triggers: [{
        id: 'weeknights', kind: AutomationTriggerKind.Schedule,
        schedule: { expression: '0 2 * * 1-5', timeZone: 'Europe/London' },
        misfirePolicy: AutomationMisfirePolicy.Skip,
      }],
    },
    // Host-computed: the next weekday 02:00 in Europe/London (GMT in March, before DST).
    nextRunAt: '2026-03-13T02:00:00.000Z',
    runCount: 1,
    runs: [previousRun],
    operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
    createdAt: '2026-03-02T17:20:00.000Z',
    modifiedAt: '2026-03-02T17:20:00.000Z',
  }
}

function summary(run: AutomationRunState): AutomationRunSummary {
  return {
    resource: run.resource, automation: run.automation, origin: run.origin, lifecycle: run.lifecycle,
    ...(run.primarySession ? { primarySession: run.primarySession } : {}),
    sessionCount: run.sessions.length,
  }
}

/** Scripted host for the automation catalogue and run channels. */
export class AutomationHost {
  serverSeq = chatEndSeq
  catalogue: AutomationState = { entries: [initialEntry()] }
  runs = new Map<URI, AutomationRunState>()
  log: ActionEnvelope[] = []
  private requests = new Map<string, URI>()

  publish(channel: URI, action: AutomationAction | AutomationRunAction, origin?: ActionOrigin): ActionEnvelope {
    if (channel === catalogueChannel) this.catalogue = automationReducer(this.catalogue, action as AutomationAction)
    else {
      const run = this.runs.get(channel)
      if (!run) throw new Error(`Unknown run channel ${channel}`)
      this.runs.set(channel, automationRunReducer(run, action as AutomationRunAction))
    }
    const envelope: ActionEnvelope = { channel, action, serverSeq: ++this.serverSeq, origin }
    this.log.push(envelope)
    return envelope
  }

  /** `runAutomation`: idempotent by `(automation, requestId)`; persists the run before any session exists. */
  runAutomation(params: RunAutomationParams): { result: RunAutomationResult; envelopes: ActionEnvelope[] } {
    if (params.channel !== catalogueChannel) throw new Error('runAutomation targets ahp-automations://')
    const entry = this.catalogue.entries.find(candidate => candidate.resource === params.automation)
    if (!entry) throw new Error(`Unknown automation ${params.automation}`)
    if (!entry.operations.includes(AutomationOperation.Run)) throw new Error('run is not an advertised operation')
    const key = `${params.automation} ${params.requestId}`
    const existing = this.requests.get(key)
    if (existing) return { result: { resource: existing }, envelopes: [] }
    const run: AutomationRunState = {
      resource: runUri, automation: entry.resource, origin: { kind: AutomationRunOriginKind.Manual },
      lifecycle: { status: AutomationRunStatus.Pending, createdAt: at(2) }, sessions: [],
    }
    this.runs.set(run.resource, run)
    this.requests.set(key, run.resource)
    return { result: { resource: run.resource }, envelopes: [this.setEntry(entry, run)] }
  }

  /** Record the fresh session before its first message, then start the run. */
  startRun(resource: URI, session: URI): ActionEnvelope[] {
    const envelopes = [
      this.publish(resource, { type: ActionType.AutomationRunSessionSet, session }),
      this.publish(resource, { type: ActionType.AutomationRunPrimarySessionChanged, primarySession: session }),
      this.publish(resource, { type: ActionType.AutomationRunLifecycleChanged, lifecycle: { status: AutomationRunStatus.Running, createdAt: at(2), startedAt: at(2, 3) } }),
    ]
    const entry = this.catalogue.entries.find(candidate => candidate.resource === this.runs.get(resource)!.automation)!
    envelopes.push(this.setEntry(entry, this.runs.get(resource)!))
    return envelopes
  }

  private setEntry(entry: AutomationEntry, run: AutomationRunState): ActionEnvelope {
    const runs = [summary(run), ...entry.runs.filter(candidate => candidate.resource !== run.resource)]
    const known = entry.runs.some(candidate => candidate.resource === run.resource)
    return this.publish(catalogueChannel, {
      type: ActionType.AutomationSet,
      automation: { ...entry, runs, runCount: (entry.runCount ?? 0) + (known ? 0 : 1) },
    })
  }
}

export interface AutomationFrame {
  slug: 'catalogue' | 'run-requested' | 'run-running'
  serverSeq: number
  host: { catalogue: AutomationState; run?: AutomationRunState }
  desktop: { catalogue: AutomationState; lastSeenServerSeq: number; requested?: RunAutomationResult }
  tablet?: { run: AutomationRunState; lastSeenServerSeq: number; origin: AutomationSessionOrigin }
  wire: ChannelWire[]
}

export function buildAutomationFrames(): AutomationFrame[] {
  const host = new AutomationHost()
  const desktop = { catalogue: structuredClone(host.catalogue), lastSeenServerSeq: chatEndSeq, requested: undefined as RunAutomationResult | undefined }
  const frames: AutomationFrame[] = []
  const applyCatalogue = (envelopes: ActionEnvelope[]) => {
    for (const envelope of envelopes) {
      if (envelope.channel !== catalogueChannel) continue
      desktop.catalogue = automationReducer(desktop.catalogue, envelope.action as AutomationAction)
      desktop.lastSeenServerSeq = envelope.serverSeq
    }
  }
  const snapshot: SubscribeResult = { snapshot: { resource: catalogueChannel, state: structuredClone(host.catalogue), fromSeq: host.serverSeq } }
  frames.push({
    slug: 'catalogue', serverSeq: host.serverSeq, host: { catalogue: structuredClone(host.catalogue) },
    desktop: structuredClone(desktop),
    wire: [
      { label: 'subscribe', from: 'desktop', to: ['host'], message: { jsonrpc: '2.0', id: 3, method: 'subscribe', params: { channel: catalogueChannel } } },
      { label: 'subscribe (result)', from: 'host', to: ['desktop'], message: { jsonrpc: '2.0', id: 3, result: snapshot } },
    ],
  })

  const params: RunAutomationParams = { channel: catalogueChannel, automation: automationUri, requestId: `${clientIds.desktop}-run-1` }
  const requested = host.runAutomation(params)
  applyCatalogue(requested.envelopes)
  desktop.requested = requested.result
  frames.push({
    slug: 'run-requested', serverSeq: host.serverSeq,
    host: { catalogue: structuredClone(host.catalogue), run: structuredClone(host.runs.get(runUri)) },
    desktop: structuredClone(desktop),
    wire: [
      { label: 'runAutomation', from: 'desktop', to: ['host'], message: { jsonrpc: '2.0', id: 4, method: 'runAutomation', params } },
      ...requested.envelopes.map(envelope => ({ label: `action #${envelope.serverSeq}`, from: 'host' as const, to: ['desktop' as const], message: { jsonrpc: '2.0', method: 'action', params: envelope } })),
      { label: 'runAutomation (result)', from: 'host', to: ['desktop'], message: { jsonrpc: '2.0', id: 4, result: requested.result } },
    ],
  })

  // The tablet opens the run as soon as it appears; its snapshot is the persisted pending run.
  const tabletSnapshot: SubscribeResult = { snapshot: { resource: runUri, state: structuredClone(host.runs.get(runUri)!), fromSeq: host.serverSeq } }
  let tabletRun = structuredClone(host.runs.get(runUri)!)
  let tabletSeq = host.serverSeq
  const started = host.startRun(runUri, runSession)
  for (const envelope of started) {
    if (envelope.channel === runUri) {
      tabletRun = automationRunReducer(tabletRun, envelope.action as AutomationRunAction)
      tabletSeq = envelope.serverSeq
    }
  }
  applyCatalogue(started)
  frames.push({
    slug: 'run-running', serverSeq: host.serverSeq,
    host: { catalogue: structuredClone(host.catalogue), run: structuredClone(host.runs.get(runUri)) },
    desktop: structuredClone(desktop),
    tablet: { run: tabletRun, lastSeenServerSeq: tabletSeq, origin: { kind: SessionOriginKind.Automation, automation: automationUri, run: runUri } },
    wire: [
      { label: 'subscribe (result)', from: 'host', to: ['tablet'], message: { jsonrpc: '2.0', id: 5, result: tabletSnapshot } },
      ...started.map(envelope => ({
        label: `action #${envelope.serverSeq}`, from: 'host' as const,
        to: envelope.channel === runUri ? ['tablet' as const] : ['desktop' as const],
        message: { jsonrpc: '2.0', method: 'action', params: envelope },
      })),
    ],
  })
  return frames
}

// ─── Terminal ───────────────────────────────────────────────────────────────

export const terminalStartSeq = chatEndSeq + 5
const toolClaim: TerminalClaim = { kind: TerminalClaimKind.Session, session: runSession, chat: runChat, turnId: 'turn-1', toolCallId: 'tool-1' }
const backgroundClaim: TerminalClaim = { kind: TerminalClaimKind.Session, session: runSession, chat: runChat }
const clientClaim: TerminalClaim = { kind: TerminalClaimKind.Client, clientId: clientIds.desktop }

/** Illustrative local output. No shell runs; these strings are scripted. */
export const terminalOutput = {
  tests: '\n> tsx --test types/reducers.test.ts\n\n✔ chatReducer applies turn lifecycle (14 ms)\n✔ chatReducer replays tool confirmation (6 ms)\nℹ tests 128  pass 128  fail 0\n',
  lint: '\n> eslint\n\n✔ no problems\n',
}

function initialTerminal(): TerminalState {
  return {
    title: 'npm test', cwd: 'file:///workspace/agent-host-protocol', cols: 100, rows: 24, content: [],
    lifecycle: { status: TerminalLifecycleStatus.Running }, claim: toolClaim, supportsCommandDetection: true, isPty: true,
  }
}

export interface TerminalMirror {
  confirmed: TerminalState
  pending: { clientSeq: number; action: ClientTerminalAction }[]
  lastSeenServerSeq: number
}

export function terminalView(mirror: TerminalMirror): TerminalState {
  return mirror.pending.reduce<TerminalState>((state, entry) => terminalReducer(state, entry.action), mirror.confirmed)
}

export interface TerminalFrame {
  slug: 'agent-runs' | 'backgrounded' | 'take-over'
  serverSeq: number
  host: TerminalState
  root: RootState
  desktop: TerminalMirror
  wire: ChannelWire[]
}

export class TerminalHost {
  serverSeq = terminalStartSeq
  state = initialTerminal()
  root: RootState = { agents: [], terminals: [] }
  desktop: TerminalMirror = { confirmed: initialTerminal(), pending: [], lastSeenServerSeq: terminalStartSeq }
  private nextClientSeq = 8

  publishRoot(action: RootAction): ActionEnvelope {
    this.root = rootReducer(this.root, action)
    return { channel: rootChannel, action, serverSeq: ++this.serverSeq, origin: undefined }
  }

  publish(action: TerminalAction, origin?: ActionOrigin): ActionEnvelope {
    this.state = terminalReducer(this.state, action)
    return { channel: terminalUri, action, serverSeq: ++this.serverSeq, origin }
  }

  info(): TerminalInfo {
    return { resource: terminalUri, title: this.state.title, claim: this.state.claim, lifecycle: this.state.lifecycle }
  }

  /** Client writes ahead; terminal input stays a no-op until the pty answers with `terminal/data`. */
  dispatch(action: ClientTerminalAction): DispatchActionParams {
    const clientSeq = this.nextClientSeq++
    this.desktop.pending.push({ clientSeq, action })
    return { channel: terminalUri, clientSeq, action }
  }

  accept(params: DispatchActionParams): ActionEnvelope {
    return this.publish(params.action as TerminalAction, { clientId: clientIds.desktop, clientSeq: params.clientSeq })
  }

  deliver(envelopes: ActionEnvelope[]): void {
    for (const envelope of envelopes) {
      if (envelope.channel !== terminalUri) continue
      const mirror = this.desktop
      mirror.confirmed = terminalReducer(mirror.confirmed, envelope.action as TerminalAction)
      mirror.lastSeenServerSeq = envelope.serverSeq
      if (envelope.origin?.clientId === clientIds.desktop) mirror.pending = mirror.pending.filter(entry => entry.clientSeq !== envelope.origin!.clientSeq)
    }
  }
}

const notify = (envelope: ActionEnvelope, to: Subject[] = ['desktop']): ChannelWire => ({ label: `action #${envelope.serverSeq}`, from: 'host', to, message: { jsonrpc: '2.0', method: 'action', params: envelope } })

export function buildTerminalFrames(): TerminalFrame[] {
  const host = new TerminalHost()
  const frames: TerminalFrame[] = []
  const capture = (slug: TerminalFrame['slug'], wire: ChannelWire[]) => frames.push({
    slug, serverSeq: host.serverSeq, host: structuredClone(host.state), root: structuredClone(host.root), desktop: structuredClone(host.desktop), wire,
  })

  // The agent's tool call created the terminal with a session claim; the catalogue advertises it.
  const added = host.publishRoot({ type: ActionType.RootTerminalsChanged, terminals: [host.info()] })
  host.desktop.lastSeenServerSeq = added.serverSeq
  const subscribed: SubscribeResult = { snapshot: { resource: terminalUri, state: structuredClone(host.state), fromSeq: added.serverSeq } }
  const running = [
    host.publish({ type: ActionType.TerminalCommandExecuted, commandId: 'cmd-1', commandLine: 'npm test -- chat', timestamp: Date.parse(at(2, 6)) }),
    host.publish({ type: ActionType.TerminalData, data: terminalOutput.tests }),
  ]
  host.deliver(running)
  capture('agent-runs', [
    notify(added),
    { label: 'subscribe (result)', from: 'host', to: ['desktop'], message: { jsonrpc: '2.0', id: 6, result: subscribed } },
    ...running.map(envelope => notify(envelope)),
  ])

  const finished = [
    host.publish({ type: ActionType.TerminalCommandFinished, commandId: 'cmd-1', exitCode: 0, durationMs: 3120 }),
    host.publish({ type: ActionType.TerminalClaimed, claim: backgroundClaim }),
  ]
  host.deliver(finished)
  capture('backgrounded', finished.map(envelope => notify(envelope)))

  const claim = host.dispatch({ type: ActionType.TerminalClaimed, claim: clientClaim })
  const input = host.dispatch({ type: ActionType.TerminalInput, data: 'npm run lint\r' })
  const echoed = [host.accept(claim), host.accept(input)]
  const output = [
    host.publish({ type: ActionType.TerminalCommandExecuted, commandId: 'cmd-2', commandLine: 'npm run lint', timestamp: Date.parse(at(3)) }),
    host.publish({ type: ActionType.TerminalData, data: terminalOutput.lint }),
    host.publish({ type: ActionType.TerminalCommandFinished, commandId: 'cmd-2', exitCode: 0, durationMs: 2480 }),
  ]
  host.deliver([...echoed, ...output])
  capture('take-over', [
    { label: 'dispatchAction', from: 'desktop', to: ['host'], message: { jsonrpc: '2.0', method: 'dispatchAction', params: claim } },
    { label: 'dispatchAction', from: 'desktop', to: ['host'], message: { jsonrpc: '2.0', method: 'dispatchAction', params: input } },
    ...[...echoed, ...output].map(envelope => notify(envelope)),
  ])
  return frames
}

// ─── Negotiation and gradual support ────────────────────────────────────────

export type ChannelFamily = 'chat' | 'terminals' | 'automations'

export interface FeatureRow {
  family: ChannelFamily
  label: string
  channel: string
  /** Implemented by this client build. */
  implemented: boolean
  /** Advertised by the host on this connection. */
  offered: boolean
}

/** Features this sample desktop client has implemented so far. */
export const implemented: Record<ChannelFamily, boolean> = { chat: true, terminals: true, automations: true }

export function initializeParams(): InitializeParams {
  return { channel: rootChannel, protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS], clientId: clientIds.desktop, initialSubscriptions: [rootChannel] }
}

export function initializeResult(params: InitializeParams, offers: { automations?: boolean; terminals?: boolean } = { automations: true, terminals: true }): InitializeResult {
  const protocolVersion = negotiateProtocolVersion(params.protocolVersions)
  if (!protocolVersion) throw new Error('UnsupportedProtocolVersion')
  const root: RootState = { agents: [{ provider: 'local-sim', displayName: 'Local simulated agent', description: 'Scripted agent in your browser. No network, no model.', models: [] }], ...(offers.terminals ? { terminals: [] } : {}) }
  return {
    protocolVersion,
    serverSeq: 40,
    snapshots: [{ resource: rootChannel, state: root, fromSeq: 40 }],
    ...(offers.automations ? { automations: automationCapabilities } : {}),
  }
}

/**
 * Gate each channel family on what the host advertised. Automations require
 * `InitializeResult.automations`; terminals appear through `RootState.terminals`.
 */
export function negotiatedFeatures(result: InitializeResult, built: Record<ChannelFamily, boolean> = implemented): FeatureRow[] {
  const root = result.snapshots.find(snapshot => snapshot.resource === rootChannel)?.state as RootState | undefined
  return [
    { family: 'chat', label: 'Chat', channel: 'ahp-chat:/…', implemented: built.chat, offered: true },
    { family: 'terminals', label: 'Terminals', channel: 'ahp-terminal:/…', implemented: built.terminals, offered: Boolean(root && 'terminals' in root) },
    { family: 'automations', label: 'Automations', channel: catalogueChannel, implemented: built.automations, offered: result.automations !== undefined },
  ]
}

export const enabledFeature = (row: FeatureRow) => row.implemented && row.offered

let cachedAutomation: readonly AutomationFrame[] | undefined
let cachedTerminal: readonly TerminalFrame[] | undefined
export const automationFrames = () => cachedAutomation ??= Object.freeze(buildAutomationFrames())
export const terminalFrames = () => cachedTerminal ??= Object.freeze(buildTerminalFrames())
