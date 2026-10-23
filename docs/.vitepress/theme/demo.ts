import type { ChatAction } from '../../../types/action-origin.generated.js'
import { chatReducer } from '../../../types/channels-chat/reducer.js'
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason } from '../../../types/channels-chat/state.js'
import type { ChatState } from '../../../types/channels-chat/state.js'
import { ActionType } from '../../../types/common/actions.js'
import type { ActionEnvelope } from '../../../types/common/actions.js'
import { SessionStatus } from '../../../types/channels-session/state.js'

export const clientIds = ['IDE', 'CLI', 'Web'] as const
export type DemoClient = typeof clientIds[number]
export const demoChannel = 'ahp-chat:/switchyard'

export interface DemoEnvelope extends ActionEnvelope {
  action: ChatAction
}

interface PendingAction {
  id: number
  action: ChatAction
}

export interface DemoMirror {
  confirmed: ChatState
  pending: PendingAction[]
  lastEnvelope?: DemoEnvelope
  before?: ChatState
}

export interface DemoPacket {
  id: number
  client: DemoClient
  direction: 'in' | 'out'
  action: ChatAction['type']
  start: number
  end: number
}

interface Job {
  at: number
  run: () => void
}

const prompts = [
  'How does my session stay in sync across clients?',
  'Show me the path from an action to shared state.',
  'What happens when I open another client?',
]

function initialState(): ChatState {
  return {
    resource: demoChannel,
    title: 'Follow the shared state',
    status: SessionStatus.Idle,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    turns: [],
  }
}

export function optimisticState(mirror: DemoMirror): ChatState {
  return mirror.pending.reduce((state, pending) => chatReducer(state, pending.action), mirror.confirmed)
}

/** A local transport: its clock drives both delivery and the SVG packet positions. */
export class SessionDemo {
  now = 0
  latencyMs = 1000
  playing = true
  autoplay = true
  host = initialState()
  serverSeq = 0
  revision = 0
  packets: DemoPacket[] = []
  mirrors: Record<DemoClient, DemoMirror> = {
    IDE: { confirmed: initialState(), pending: [] },
    CLI: { confirmed: initialState(), pending: [] },
    Web: { confirmed: initialState(), pending: [] },
  }
  turnClients: Record<string, DemoClient> = {}
  private jobs: Job[] = []
  private nextId = 0
  private nextAuto = 1800
  private autoIndex = 0
  private runToken = 0

  get busy(): boolean {
    return Boolean(this.host.activeTurn || this.packets.length || clientIds.some(id => this.mirrors[id].pending.length))
  }

  setLatency(milliseconds: number): void {
    if (![250, 500, 1000, 2000].includes(milliseconds)) throw new Error('Unsupported demo latency')
    if (this.busy) throw new Error('Wait for the current turn before changing demo latency')
    this.latencyMs = milliseconds
    this.revision += 1
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Invalid demo clock step')
    if (!this.playing) return
    const target = this.now + milliseconds
    while (this.jobs.length && this.jobs[0].at <= target) {
      const job = this.jobs.shift()!
      this.now = job.at
      this.packets = this.packets.filter(packet => packet.end > this.now)
      job.run()
      this.revision += 1
    }
    this.now = target
    this.packets = this.packets.filter(packet => packet.end > this.now)
    if (this.autoplay && !this.busy && this.now >= this.nextAuto) {
      const index = this.autoIndex++ % clientIds.length
      this.send(clientIds[index], prompts[index])
    }
  }

  send(client: DemoClient, text: string): boolean {
    if (!this.playing || this.busy || !text.trim()) return false
    const turnId = `turn-${++this.nextId}`
    this.turnClients[turnId] = client
    this.dispatch(client, {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: new Date(Date.UTC(2026, 0, 1) + this.now).toISOString(),
      message: { text: text.trim(), origin: { kind: MessageKind.User } },
    }, () => this.respond(turnId))
    this.revision += 1
    return true
  }

  cancel(client: DemoClient): boolean {
    const turn = this.host.activeTurn
    if (!this.playing || !turn || clientIds.some(id => this.mirrors[id].pending.length)) return false
    this.runToken += 1
    this.dispatch(client, {
      type: ActionType.ChatTurnCancelled,
      turnId: turn.id,
      duration: Math.max(0, this.now - (Date.parse(turn.startedAt) - Date.UTC(2026, 0, 1))),
    })
    this.revision += 1
    return true
  }

  private later(delay: number, run: () => void): void {
    this.jobs.push({ at: this.now + delay, run })
    this.jobs.sort((a, b) => a.at - b.at)
  }

  private packet(client: DemoClient, direction: DemoPacket['direction'], action: ChatAction, duration: number): void {
    this.packets.push({ id: ++this.nextId, client, direction, action: action.type, start: this.now, end: this.now + duration })
  }

  private dispatch(client: DemoClient, action: ChatAction, received?: () => void): void {
    const id = ++this.nextId
    const leg = this.latencyMs / 2
    this.mirrors[client].pending.push({ id, action })
    this.packet(client, 'in', action, leg)
    this.later(leg, () => {
      this.publish(action, client, leg, id)
      received?.()
    })
  }

  private publish(action: ChatAction, origin: DemoClient | 'host', leg = this.latencyMs / 2, dispatchId?: number): void {
    this.host = chatReducer(this.host, action)
    const envelope: DemoEnvelope = {
      channel: demoChannel, action, serverSeq: ++this.serverSeq,
      origin: origin !== 'host' && dispatchId !== undefined ? { clientId: origin, clientSeq: dispatchId } : undefined,
    }
    for (const client of clientIds) {
      this.packet(client, 'out', action, leg)
      this.later(leg, () => {
        const mirror = this.mirrors[client]
        mirror.before = mirror.confirmed
        mirror.confirmed = chatReducer(mirror.confirmed, action)
        if (origin === client) mirror.pending = mirror.pending.filter(pending => pending.id !== dispatchId)
        mirror.lastEnvelope = envelope
      })
    }
    if (action.type === ActionType.ChatTurnComplete || action.type === ActionType.ChatTurnCancelled) {
      this.nextAuto = this.now + leg + 4000
    }
  }

  private respond(turnId: string): void {
    const token = ++this.runToken
    const partId = `text-${turnId}`
    const toolCallId = `tool-${turnId}`
    const actions: ChatAction[] = [
      { type: ActionType.ChatResponsePart, turnId, part: { kind: ResponsePartKind.Markdown, id: partId, content: '' } },
      { type: ActionType.ChatDelta, turnId, partId, content: 'I’ll follow an action through the shared session. ' },
      { type: ActionType.ChatToolCallStart, turnId, toolCallId, toolName: 'read_file', displayName: 'Read protocol overview', intention: 'Inspect the state model' },
      { type: ActionType.ChatToolCallReady, turnId, toolCallId, invocationMessage: 'Reading the protocol overview', toolInput: '{"path":"docs/specification/overview.md"}', confirmed: ToolCallConfirmationReason.NotNeeded },
      { type: ActionType.ChatToolCallComplete, turnId, toolCallId, result: { success: true, pastTenseMessage: 'Read the protocol overview' } },
      { type: ActionType.ChatDelta, turnId, partId, content: 'The host owns the state. Each client applies the same ordered actions with the same pure reducer, so every interface follows one conversation.' },
      { type: ActionType.ChatTurnComplete, turnId, duration: 0 },
    ]
    const spacing = Math.max(650, this.latencyMs / 2 + 150)
    const started = this.now
    actions.forEach((action, index) => {
      this.later(350 + index * spacing, () => {
        if (token !== this.runToken || this.host.activeTurn?.id !== turnId) return
        this.publish(action.type === ActionType.ChatTurnComplete ? { ...action, duration: this.now - started } : action, 'host')
      })
    })
  }
}

export type Point = readonly [number, number]
export const routes: Record<DemoClient, Record<'in' | 'out', readonly Point[]>> = {
  IDE: { in: [[151, 101], [224, 101], [224, 149], [368, 149], [368, 185], [424, 185]], out: [[526, 267], [526, 365], [200, 365], [200, 125], [153, 125]] },
  CLI: { in: [[151, 221], [272, 221], [272, 197], [424, 197]], out: [[502, 267], [502, 317], [176, 317], [176, 245], [153, 245]] },
  Web: { in: [[151, 341], [248, 341], [248, 269], [368, 269], [368, 209], [424, 209]], out: [[478, 267], [478, 389], [224, 389], [224, 365], [153, 365]] },
}

export function routePoint(points: readonly Point[], progress: number): Point {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]))
  let remaining = Math.max(0, Math.min(1, progress)) * lengths.reduce((sum, length) => sum + length, 0)
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const ratio = lengths[index] ? remaining / lengths[index] : 0
      return [points[index][0] + (points[index + 1][0] - points[index][0]) * ratio, points[index][1] + (points[index + 1][1] - points[index][1]) * ratio]
    }
    remaining -= lengths[index]
  }
  return points[points.length - 1]
}
