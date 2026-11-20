import type { ChatAction, ClientChatAction } from '../../../types/action-origin.generated.js'
import { chatReducer } from '../../../types/channels-chat/reducer.js'
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason } from '../../../types/channels-chat/state.js'
import type { ChatState } from '../../../types/channels-chat/state.js'
import type { RootState } from '../../../types/channels-root/state.js'
import { SessionStatus } from '../../../types/channels-session/state.js'
import { ActionType } from '../../../types/common/actions.js'
import type { ActionEnvelope, ActionOrigin } from '../../../types/common/actions.js'
import { ReconnectResultType } from '../../../types/common/commands.js'
import type { DispatchActionParams, ReconnectParams, ReconnectResult, SubscribeResult } from '../../../types/common/commands.js'
import type { Snapshot, URI } from '../../../types/common/state.js'

/**
 * A deterministic, network-free scene model for the homepage notebook.
 * Every checkpoint is produced by replaying the same script through the
 * canonical `chatReducer`, so scrolling backwards or skipping is a lookup.
 */

export const deviceIds = ['desktop', 'tablet', 'phone'] as const
export type DeviceId = typeof deviceIds[number]
export type Subject = 'host' | DeviceId
export const subjects: readonly Subject[] = ['host', ...deviceIds]

export const rootChannel = 'ahp-root://' as const
export const chatChannel: URI = 'ahp-chat:/notebook-7f3a'
export const clientIds: Record<DeviceId, string> = { desktop: 'desktop-4f1c', tablet: 'tablet-9a20', phone: 'phone-c7e2' }
export const deviceLabels: Record<Subject, string> = { host: 'Host', desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' }
export const subscribedSeq = 40

export interface NotebookEnvelope extends ActionEnvelope {
  readonly action: ChatAction
}

export interface PendingAction {
  clientSeq: number
  action: ClientChatAction
}

export type LinkState = 'connected' | 'offline' | 'reconnecting'

export interface DeviceMirror {
  id: DeviceId
  clientId: string
  link: LinkState
  confirmed: ChatState
  pending: PendingAction[]
  lastSeenServerSeq: number
  nextClientSeq: number
  subscriptions: URI[]
}

export type AppliedVia = 'dispatch' | 'host' | 'notification' | 'replay' | 'snapshot'

export interface AppliedAction {
  via: AppliedVia
  type: string
  serverSeq?: number
  origin?: ActionOrigin
  clientSeq?: number
}

export type JsonRpcMessage =
  | { jsonrpc: '2.0'; method: 'dispatchAction'; params: DispatchActionParams }
  | { jsonrpc: '2.0'; method: 'action'; params: ActionEnvelope }
  | { jsonrpc: '2.0'; id: number; method: 'reconnect'; params: ReconnectParams }
  | { jsonrpc: '2.0'; id: number; result: ReconnectResult | SubscribeResult }

export interface WireRecord {
  label: string
  from: Subject
  to: Subject[]
  message: JsonRpcMessage
}

export interface Checkpoint {
  index: number
  /** Logical predecessor; branches compare against their branch point. */
  base: number
  slug: string
  title: string
  focus: Subject
  serverSeq: number
  /** Oldest serverSeq still held in the host's replay buffer. */
  replayFrom: number
  host: ChatState
  devices: Record<DeviceId, DeviceMirror>
  applied: Partial<Record<Subject, AppliedAction[]>>
  wire: WireRecord[]
}

const t0 = Date.UTC(2026, 2, 12, 9, 41)
const turnId = 'turn-7'
const partId = 'md-1'
const toolCallId = 'tool-1'

function initialChat(): ChatState {
  return { resource: chatChannel, title: 'Pre-merge check', status: SessionStatus.Idle, modifiedAt: new Date(t0).toISOString(), turns: [] }
}

const rootState: RootState = {
  agents: [{ provider: 'local-sim', displayName: 'Local simulated agent', description: 'Scripted agent in your browser. No network, no model.', models: [] }],
  activeSessions: 1,
}

export function optimisticState(mirror: Pick<DeviceMirror, 'confirmed' | 'pending'>): ChatState {
  return mirror.pending.reduce<ChatState>((state, pending) => chatReducer(state, pending.action), mirror.confirmed)
}

/** Stable serialisation for equality checks; reducers create keys in a deterministic order. */
export function stateFingerprint(state: ChatState): string {
  return JSON.stringify(state)
}

export function converged(mirror: DeviceMirror, host: ChatState): boolean {
  return mirror.pending.length === 0 && stateFingerprint(mirror.confirmed) === stateFingerprint(host)
}

export class NotebookSession {
  host = initialChat()
  serverSeq = subscribedSeq
  log: NotebookEnvelope[] = []
  devices = Object.fromEntries(deviceIds.map((id): [DeviceId, DeviceMirror] => [id, {
    id, clientId: clientIds[id], link: 'connected', confirmed: initialChat(), pending: [],
    lastSeenServerSeq: subscribedSeq, nextClientSeq: id === 'desktop' ? 7 : id === 'tablet' ? 2 : 3,
    subscriptions: [rootChannel, chatChannel],
  }])) as Record<DeviceId, DeviceMirror>
  outbox: Record<DeviceId, NotebookEnvelope[]> = { desktop: [], tablet: [], phone: [] }
  applied: Partial<Record<Subject, AppliedAction[]>> = {}
  wire: WireRecord[] = []
  reconnecting?: ReconnectParams
  private requestId = 2

  clone(): NotebookSession {
    const copy = new NotebookSession()
    copy.host = structuredClone(this.host)
    copy.serverSeq = this.serverSeq
    copy.log = structuredClone(this.log)
    copy.devices = structuredClone(this.devices)
    copy.outbox = structuredClone(this.outbox)
    copy.requestId = this.requestId
    copy.reconnecting = structuredClone(this.reconnecting)
    return copy
  }

  private note(subject: Subject, entry: AppliedAction): void {
    (this.applied[subject] ??= []).push(entry)
  }

  /** Client writes ahead: append to pending and send a `dispatchAction` notification. */
  dispatch(id: DeviceId, action: ClientChatAction): DispatchActionParams {
    const mirror = this.devices[id]
    if (mirror.link !== 'connected') throw new Error(`${id} cannot dispatch while ${mirror.link}`)
    const clientSeq = mirror.nextClientSeq++
    mirror.pending.push({ clientSeq, action })
    this.note(id, { via: 'dispatch', type: action.type, clientSeq })
    const params: DispatchActionParams = { channel: chatChannel, clientSeq, action }
    this.wire.push({ label: 'dispatchAction', from: id, to: ['host'], message: { jsonrpc: '2.0', method: 'dispatchAction', params } })
    return params
  }

  /** The host accepts a dispatched action, reduces it, and stamps the next serverSeq. */
  receive(id: DeviceId, clientSeq: number): NotebookEnvelope {
    const pending = this.devices[id].pending.find(entry => entry.clientSeq === clientSeq)
    if (!pending) throw new Error(`No pending action ${id}#${clientSeq}`)
    return this.publish(pending.action, { clientId: clientIds[id], clientSeq })
  }

  /** Server-originated action (the local simulated agent). */
  emit(action: ChatAction): NotebookEnvelope {
    return this.publish(action, undefined)
  }

  private publish(action: ChatAction, origin: ActionOrigin | undefined): NotebookEnvelope {
    this.host = chatReducer(this.host, action)
    const envelope: NotebookEnvelope = { channel: chatChannel, action, serverSeq: ++this.serverSeq, origin }
    this.log.push(envelope)
    this.note('host', { via: 'host', type: action.type, serverSeq: envelope.serverSeq, origin })
    for (const id of deviceIds) if (this.devices[id].link === 'connected') this.outbox[id].push(envelope)
    return envelope
  }

  /** Deliver queued `action` notifications in order and reconcile pending writes. */
  flush(id: DeviceId): NotebookEnvelope[] {
    const delivered = this.outbox[id]
    this.outbox[id] = []
    for (const envelope of delivered) this.apply(id, envelope, 'notification')
    return delivered
  }

  private apply(id: DeviceId, envelope: NotebookEnvelope, via: AppliedVia): void {
    const mirror = this.devices[id]
    if (envelope.serverSeq <= mirror.lastSeenServerSeq) throw new Error(`Out-of-order envelope #${envelope.serverSeq} for ${id}`)
    mirror.confirmed = chatReducer(mirror.confirmed, envelope.action)
    mirror.lastSeenServerSeq = envelope.serverSeq
    if (envelope.origin?.clientId === mirror.clientId) {
      mirror.pending = mirror.pending.filter(entry => entry.clientSeq !== envelope.origin!.clientSeq)
    }
    this.note(id, { via, type: envelope.action.type, serverSeq: envelope.serverSeq, origin: envelope.origin })
  }

  /** Transport closes: anything not yet delivered on that socket is gone. */
  disconnect(id: DeviceId): void {
    this.devices[id].link = 'offline'
    this.outbox[id] = []
  }

  reconnectRequest(id: DeviceId): ReconnectParams {
    const mirror = this.devices[id]
    mirror.link = 'reconnecting'
    const params: ReconnectParams = {
      channel: rootChannel,
      clientId: mirror.clientId,
      lastSeenServerSeq: mirror.lastSeenServerSeq,
      subscriptions: [...mirror.subscriptions],
    }
    this.reconnecting = params
    this.wire.push({ label: 'reconnect (request)', from: id, to: ['host'], message: { jsonrpc: '2.0', id: this.requestId, method: 'reconnect', params } })
    return params
  }

  /** The host answers from its replay buffer, or with fresh snapshots when the gap is too old. */
  reconnectResult(params: ReconnectParams, replayFrom: number): ReconnectResult {
    const known = new Set<URI>([rootChannel, chatChannel])
    if (params.lastSeenServerSeq + 1 >= replayFrom) {
      return {
        type: ReconnectResultType.Replay,
        actions: this.log.filter(envelope => envelope.serverSeq > params.lastSeenServerSeq && params.subscriptions.includes(envelope.channel)),
        missing: params.subscriptions.filter(uri => !known.has(uri)),
      }
    }
    const snapshots: Snapshot[] = []
    for (const resource of params.subscriptions) {
      if (resource === rootChannel) snapshots.push({ resource, state: structuredClone(rootState), fromSeq: this.serverSeq })
      if (resource === chatChannel) snapshots.push({ resource, state: structuredClone(this.host), fromSeq: this.serverSeq })
    }
    return { type: ReconnectResultType.Snapshot, snapshots }
  }

  /** Reset confirmed state from the result, clear pending, and resume. */
  completeReconnect(id: DeviceId, result: ReconnectResult): void {
    const mirror = this.devices[id]
    this.wire.push({ label: `reconnect (${result.type} result)`, from: 'host', to: [id], message: { jsonrpc: '2.0', id: this.requestId++, result } })
    mirror.pending = []
    if (result.type === ReconnectResultType.Replay) {
      for (const envelope of result.actions) this.apply(id, envelope as NotebookEnvelope, 'replay')
      mirror.subscriptions = mirror.subscriptions.filter(uri => !result.missing.includes(uri))
    } else {
      for (const snapshot of result.snapshots) {
        if (snapshot.resource !== chatChannel) continue
        mirror.confirmed = structuredClone(snapshot.state as ChatState)
        mirror.lastSeenServerSeq = snapshot.fromSeq
        this.note(id, { via: 'snapshot', type: 'snapshot', serverSeq: snapshot.fromSeq })
      }
    }
    mirror.link = 'connected'
    this.reconnecting = undefined
  }

  broadcastWire(envelopes: NotebookEnvelope[], to: DeviceId[]): void {
    for (const params of envelopes) {
      this.wire.push({ label: `action #${params.serverSeq}`, from: 'host', to, message: { jsonrpc: '2.0', method: 'action', params } })
    }
  }
}

interface StepSpec {
  slug: string
  title: string
  focus: Subject
  replayFrom?: number
  run: (session: NotebookSession) => void
}

const turnStarted: ClientChatAction = {
  type: ActionType.ChatTurnStarted,
  turnId,
  startedAt: new Date(t0 + 5_000).toISOString(),
  message: { text: 'Run the reducer tests before I merge.', origin: { kind: MessageKind.User } },
}

const approve: ClientChatAction = {
  type: ActionType.ChatToolCallConfirmed,
  turnId,
  toolCallId,
  approved: true,
  confirmed: ToolCallConfirmationReason.UserAction,
}

function flushAll(session: NotebookSession, ids: DeviceId[] = [...deviceIds]): void {
  const sent = new Map<number, { envelope: NotebookEnvelope; to: DeviceId[] }>()
  for (const id of ids) {
    for (const envelope of session.flush(id)) {
      const entry = sent.get(envelope.serverSeq) ?? { envelope, to: [] }
      entry.to.push(id)
      sent.set(envelope.serverSeq, entry)
    }
  }
  for (const { envelope, to } of [...sent.values()].sort((a, b) => a.envelope.serverSeq - b.envelope.serverSeq)) session.broadcastWire([envelope], to)
}

const script: StepSpec[] = [
  {
    slug: 'subscribed', title: 'Three clients, one snapshot', focus: 'desktop',
    run: session => {
      session.wire.push({ label: 'subscribe (result)', from: 'host', to: [...deviceIds], message: { jsonrpc: '2.0', id: 1, result: { snapshot: { resource: chatChannel, state: initialChat(), fromSeq: subscribedSeq } } } })
      for (const id of deviceIds) session.applied[id] = [{ via: 'snapshot', type: 'snapshot', serverSeq: subscribedSeq }]
    },
  },
  {
    slug: 'optimistic', title: 'Desktop writes ahead', focus: 'desktop',
    run: session => { session.dispatch('desktop', turnStarted) },
  },
  {
    slug: 'host-reduces', title: 'The host decides the order', focus: 'host',
    run: session => { session.receive('desktop', 7) },
  },
  {
    slug: 'echo', title: 'The echo confirms every mirror', focus: 'desktop',
    run: session => flushAll(session),
  },
  {
    slug: 'tool-waits', title: 'The agent streams, a tool waits', focus: 'tablet',
    run: session => {
      session.emit({ type: ActionType.ChatResponsePart, turnId, part: { kind: ResponsePartKind.Markdown, id: partId, content: '' } })
      session.emit({ type: ActionType.ChatDelta, turnId, partId, content: 'I’ll run the chat reducer tests first.' })
      session.emit({ type: ActionType.ChatToolCallStart, turnId, toolCallId, toolName: 'run_in_terminal', displayName: 'Run tests' })
      session.emit({
        type: ActionType.ChatToolCallReady, turnId, toolCallId,
        invocationMessage: 'Run `npm test -- chat`', toolInput: '{"command":"npm test -- chat"}', confirmationTitle: 'Run a terminal command?',
      })
      flushAll(session)
    },
  },
  {
    slug: 'link-drops', title: 'Approve on the phone, then the link drops', focus: 'phone',
    run: session => {
      session.dispatch('phone', approve)
      session.receive('phone', 3)
      session.disconnect('phone')
      flushAll(session, ['desktop', 'tablet'])
    },
  },
  {
    slug: 'host-advances', title: 'The host keeps going', focus: 'desktop',
    run: session => {
      session.emit({ type: ActionType.ChatToolCallComplete, turnId, toolCallId, result: { success: true, pastTenseMessage: 'Ran 128 chat reducer tests' } })
      session.emit({ type: ActionType.ChatDelta, turnId, partId, content: ' All 128 passed, including replay and snapshot paths.' })
      session.emit({ type: ActionType.ChatTurnComplete, turnId, duration: 8_400 })
      flushAll(session, ['desktop', 'tablet'])
    },
  },
  {
    slug: 'reconnect-request', title: 'Reconnect with a bookmark', focus: 'phone',
    run: session => { session.reconnectRequest('phone') },
  },
  {
    slug: 'replay', title: 'Replay arrives in the response', focus: 'phone', replayFrom: 41,
    run: session => session.completeReconnect('phone', session.reconnectResult(session.reconnecting!, 41)),
  },
  {
    slug: 'snapshot', title: 'Gap too old: snapshot instead', focus: 'phone', replayFrom: 48,
    run: session => session.completeReconnect('phone', session.reconnectResult(session.reconnecting!, 48)),
  },
]

/** The replay and snapshot checkpoints are alternative outcomes of the same reconnect request. */
const branchFrom: Record<string, string> = { snapshot: 'reconnect-request' }

function capture(session: NotebookSession, spec: StepSpec, index: number, base: number): Checkpoint {
  return {
    index,
    base,
    slug: spec.slug,
    title: spec.title,
    focus: spec.focus,
    serverSeq: session.serverSeq,
    replayFrom: spec.replayFrom ?? 41,
    host: structuredClone(session.host),
    devices: structuredClone(session.devices),
    applied: structuredClone(session.applied),
    wire: structuredClone(session.wire),
  }
}

export function buildCheckpoints(): Checkpoint[] {
  const frames: Checkpoint[] = []
  const sessions = new Map<string, NotebookSession>()
  let session = new NotebookSession()
  script.forEach((spec, index) => {
    const branch = branchFrom[spec.slug]
    if (branch) session = sessions.get(branch)!.clone()
    session.applied = {}
    session.wire = []
    spec.run(session)
    sessions.set(spec.slug, session.clone())
    frames.push(capture(session, spec, index, branch ? script.findIndex(step => step.slug === branch) : Math.max(0, index - 1)))
  })
  return frames
}

let cached: readonly Checkpoint[] | undefined
export function checkpoints(): readonly Checkpoint[] {
  return cached ??= Object.freeze(buildCheckpoints())
}

export function clampStep(step: number, count = script.length): number {
  if (!Number.isFinite(step)) return 0
  return Math.max(0, Math.min(count - 1, Math.trunc(step)))
}

/** The active checkpoint is the last note whose top has crossed the reading line. */
export function pickActiveStep(tops: readonly number[], readingLine: number): number {
  let active = 0
  tops.forEach((top, index) => { if (top <= readingLine) active = index })
  return active
}

export interface DiffEntry {
  op: '+' | '-' | '~'
  path: string
  before?: string
  after?: string
}

function brief(value: unknown, max = 54): string {
  const text = value === undefined ? 'undefined' : JSON.stringify(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Path-level JSON diff, bounded for display. */
export function diffJson(before: unknown, after: unknown, limit = 10): { entries: DiffEntry[]; more: number } {
  const entries: DiffEntry[] = []
  let total = 0
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (a === b) return
    if (isRecord(a) && isRecord(b) && Array.isArray(a) === Array.isArray(b)) {
      const keys = Array.isArray(a)
        ? Array.from({ length: Math.max(a.length, (b as unknown as unknown[]).length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(a), ...Object.keys(b)])]
      for (const key of keys) {
        const child = Array.isArray(a) ? `${path}[${key}]` : path ? `${path}.${key}` : key
        // JSON has no undefined: a key holding undefined is absent on the wire.
        if (a[key] === undefined && b[key] === undefined) continue
        if (a[key] === undefined) push({ op: '+', path: child, after: brief(b[key]) })
        else if (b[key] === undefined) push({ op: '-', path: child, before: brief(a[key]) })
        else walk(a[key], b[key], child)
      }
      return
    }
    push({ op: '~', path: path || '(root)', before: brief(a), after: brief(b) })
  }
  const push = (entry: DiffEntry): void => {
    total += 1
    if (entries.length < limit) entries.push(entry)
  }
  walk(before, after, '')
  return { entries, more: total - entries.length }
}

export function subjectState(frame: Checkpoint, subject: Subject): ChatState {
  return subject === 'host' ? frame.host : optimisticState(frame.devices[subject])
}

export function subjectSeq(frame: Checkpoint, subject: Subject): number {
  return subject === 'host' ? frame.serverSeq : frame.devices[subject].lastSeenServerSeq
}

/** Short FNV-1a digest of a state, so converged mirrors visibly share one value. */
export function stateDigest(state: ChatState): string {
  let hash = 0x811c9dc5
  const text = stateFingerprint(state)
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6)
}
