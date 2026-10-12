import type { ChatState } from '../../../types/channels-chat/state.js'
import { ResponsePartKind } from '../../../types/channels-chat/state.js'
import { AutomationTriggerKind } from '../../../types/channels-automation/state.js'
import { TerminalClaimKind } from '../../../types/channels-terminal/state.js'
import type { ReconnectParams, ReconnectResult } from '../../../types/common/commands.js'
import {
  automationFrames, automationUri, catalogueChannel, implemented, initializeParams, initializeResult,
  negotiatedFeatures, enabledFeature, terminalFrames,
} from './notebook-channels.js'
import type { AutomationFrame, ChannelFamily, ChannelWire, FeatureRow, TerminalFrame } from './notebook-channels.js'
import { checkpoints, deviceIds, diffJson, optimisticState, stateDigest } from './notebook.js'
import type { Checkpoint, DeviceId, Subject } from './notebook.js'

/**
 * The homepage story: seven chapters, each made of one or more stops. A stop
 * is a deterministic scene — which devices are on the desk, what each one
 * shows, and which model frame it reads from. Scrolling, Prev/Next and
 * chapter jumps only ever select a stop index; nothing is accumulated.
 */

export type SceneId = 'trio' | 'solo' | 'phone' | 'pair'
export type DeviceView = 'chat' | 'automations' | 'run' | 'terminal' | 'channels'
export type Layout = 'full' | 'compact'

export interface FeatureSetup {
  built: Record<ChannelFamily, boolean>
  offers: { automations: boolean; terminals: boolean }
}

export interface Stop {
  index: number
  /** 0 is the cover; chapters are numbered from 1. */
  chapter: number
  sub: number
  slug: string
  title: string
  scene: SceneId
  views: Partial<Record<DeviceId, DeviceView>>
  focus: DeviceId
  chat: string
  automation?: AutomationFrame['slug']
  terminal?: TerminalFrame['slug']
  features?: FeatureSetup
  /** Illustrative client language per device (final chapter only). */
  tags?: Partial<Record<DeviceId, string>>
  caption: string
}

export interface Chapter {
  number: number
  slug: string
  title: string
  kicker: string
}

export const chapters: readonly Chapter[] = [
  { number: 1, slug: 'write-ahead', title: 'Write ahead, without guessing', kicker: 'dispatchAction · pending' },
  { number: 2, slug: 'one-order', title: 'One order, every screen', kicker: 'serverSeq · echo' },
  { number: 3, slug: 'reconnect', title: 'Drop the link, catch up', kicker: 'reconnect · replay' },
  { number: 4, slug: 'automations', title: 'Automations run on the host', kicker: 'ahp-automations://' },
  { number: 5, slug: 'terminals', title: 'A terminal always has an owner', kicker: 'ahp-terminal:/…' },
  { number: 6, slug: 'one-channel-at-a-time', title: 'Grow one channel at a time', kicker: 'initialize · capabilities' },
  { number: 7, slug: 'any-client', title: 'Any client, six languages', kicker: 'interoperability' },
]

const allBuilt = implemented
const chatOnly: Record<ChannelFamily, boolean> = { chat: true, terminals: false, automations: false }
const finalTags: Partial<Record<DeviceId, string>> = { desktop: 'TypeScript', tablet: 'Swift', phone: 'Kotlin' }

type StopSpec = Omit<Stop, 'index' | 'sub'>

const specs: StopSpec[] = [
  {
    chapter: 0, slug: 'cover', title: 'One turn, three screens', scene: 'trio', focus: 'desktop',
    views: { desktop: 'chat', tablet: 'chat', phone: 'chat' }, chat: 'tool-waits',
    caption: 'One chat on three screens, all waiting on the same approval.',
  },
  {
    chapter: 1, slug: 'optimistic', title: 'Write ahead', scene: 'solo', focus: 'desktop',
    views: { desktop: 'chat' }, chat: 'optimistic',
    caption: 'Your message shows at once, faded until the host confirms it.',
  },
  {
    chapter: 2, slug: 'echo', title: 'The host picks the order', scene: 'trio', focus: 'desktop',
    views: { desktop: 'chat', tablet: 'chat', phone: 'chat' }, chat: 'echo',
    caption: 'One envelope, #41, folds into all three mirrors.',
  },
  {
    chapter: 2, slug: 'tool-waits', title: 'A tool waits for approval', scene: 'trio', focus: 'tablet',
    views: { desktop: 'chat', tablet: 'chat', phone: 'chat' }, chat: 'tool-waits',
    caption: 'Same actions, same order: every screen offers the same approval.',
  },
  {
    chapter: 3, slug: 'link-drops', title: 'Approve, then lose the link', scene: 'phone', focus: 'phone',
    views: { desktop: 'chat', phone: 'chat' }, chat: 'link-drops',
    caption: 'The phone approves, then its socket closes before the echo lands.',
  },
  {
    chapter: 3, slug: 'host-advances', title: 'The host keeps going', scene: 'phone', focus: 'desktop',
    views: { desktop: 'chat', phone: 'chat' }, chat: 'host-advances',
    caption: 'Desktop sees the turn finish; the phone is frozen at #45.',
  },
  {
    chapter: 3, slug: 'reconnect-request', title: 'Reconnect with a bookmark', scene: 'phone', focus: 'phone',
    views: { desktop: 'chat', phone: 'chat' }, chat: 'reconnect-request',
    caption: 'One request: client id, last seen #45, the same subscriptions.',
  },
  {
    chapter: 3, slug: 'replay', title: 'Replay in the response', scene: 'phone', focus: 'phone',
    views: { desktop: 'chat', phone: 'chat' }, chat: 'replay',
    caption: 'The response holds #46 – #49; applied in order, the phone matches.',
  },
  {
    chapter: 4, slug: 'catalogue', title: 'The catalogue', scene: 'solo', focus: 'desktop',
    views: { desktop: 'automations' }, chat: 'replay', automation: 'catalogue',
    caption: 'A schedule the host owns, mirrored from ahp-automations://.',
  },
  {
    chapter: 4, slug: 'run-requested', title: 'Run now', scene: 'solo', focus: 'desktop',
    views: { desktop: 'automations' }, chat: 'replay', automation: 'run-requested',
    caption: 'runAutomation returns a run URI; the run is persisted as pending.',
  },
  {
    chapter: 4, slug: 'run-running', title: 'A fresh session runs it', scene: 'pair', focus: 'tablet',
    views: { desktop: 'automations', tablet: 'run' }, chat: 'replay', automation: 'run-running',
    caption: 'The tablet follows the run into its own new session.',
  },
  {
    chapter: 5, slug: 'agent-runs', title: 'The agent runs a command', scene: 'solo', focus: 'desktop',
    views: { desktop: 'terminal' }, chat: 'replay', terminal: 'agent-runs',
    caption: 'A tool call owns the terminal; output streams in (scripted, not a shell).',
  },
  {
    chapter: 5, slug: 'backgrounded', title: 'The tool lets go', scene: 'solo', focus: 'desktop',
    views: { desktop: 'terminal' }, chat: 'replay', terminal: 'backgrounded',
    caption: 'The command exits 0 and the claim narrows to the session.',
  },
  {
    chapter: 5, slug: 'take-over', title: 'You take over', scene: 'solo', focus: 'desktop',
    views: { desktop: 'terminal' }, chat: 'replay', terminal: 'take-over',
    caption: 'Desktop claims the terminal; typed input returns only as host output.',
  },
  {
    chapter: 6, slug: 'chat-first', title: 'Start with chat', scene: 'solo', focus: 'desktop',
    views: { desktop: 'channels' }, chat: 'replay', features: { built: chatOnly, offers: { automations: true, terminals: true } },
    caption: 'This build implements chat only, so it shows one app.',
  },
  {
    chapter: 6, slug: 'add-channels', title: 'Add terminals and automations', scene: 'solo', focus: 'desktop',
    views: { desktop: 'channels' }, chat: 'replay', features: { built: allBuilt, offers: { automations: true, terminals: true } },
    caption: 'New channels light up only where the host advertises them.',
  },
  {
    chapter: 6, slug: 'host-offers-less', title: 'A host that offers less', scene: 'solo', focus: 'desktop',
    views: { desktop: 'channels' }, chat: 'replay', features: { built: allBuilt, offers: { automations: false, terminals: true } },
    caption: 'No automations capability advertised, so none shown.',
  },
  {
    chapter: 7, slug: 'any-client', title: 'Three clients, one host', scene: 'trio', focus: 'desktop',
    views: { desktop: 'chat', tablet: 'run', phone: 'terminal' }, chat: 'replay', automation: 'run-running', terminal: 'take-over', tags: finalTags,
    caption: 'Different apps, different languages, one ordered stream.',
  },
]

export const stops: readonly Stop[] = Object.freeze(specs.map((spec, index) => ({
  ...spec,
  index,
  sub: specs.slice(0, index).filter(other => other.chapter === spec.chapter).length,
})))

export const lastStop = stops.length - 1

export function chapterStops(chapter: number): Stop[] {
  return stops.filter(stop => stop.chapter === chapter)
}

export function chapterStart(chapter: number): number {
  const first = stops.find(stop => stop.chapter === chapter)
  if (!first) throw new Error(`No chapter ${chapter}`)
  return first.index
}

export function chapterBySlug(slug: string): Chapter | undefined {
  return chapters.find(chapter => chapter.slug === slug)
}

export function clampStop(index: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(lastStop, Math.trunc(index)))
}

export const visibleDevices = (stop: Stop): DeviceId[] => deviceIds.filter(id => stop.views[id] !== undefined)

// ─── Geometry ───────────────────────────────────────────────────────────────

export interface Box { x: number; y: number; scale: number; width: number; height: number }
export interface SceneBoxes { devices: Record<DeviceId, Box & { visible: boolean }>; rail: { x: number; y: number; width: number; height: number } }

export const planeSize: Record<Layout, { width: number; height: number }> = { full: { width: 760, height: 540 }, compact: { width: 520, height: 340 } }
export const baseSize: Record<Layout, Record<DeviceId, { width: number; height: number }>> = {
  full: { desktop: { width: 540, height: 520 }, tablet: { width: 172, height: 256 }, phone: { width: 124, height: 248 } },
  compact: { desktop: { width: 344, height: 336 }, tablet: { width: 146, height: 160 }, phone: { width: 116, height: 168 } },
}

type Placement = { x: number; y: number; scale?: number }
const placements: Record<Layout, Record<SceneId, { rail: number; railY?: number; railH?: number } & Partial<Record<DeviceId, Placement>>>> = {
  full: {
    trio: { rail: 552, desktop: { x: 0, y: 10 }, tablet: { x: 588, y: 10 }, phone: { x: 612, y: 282 } },
    solo: { rail: 650, desktop: { x: 92, y: 10 } },
    phone: { rail: 462, railY: 40, railH: 460, desktop: { x: 0, y: 62, scale: 0.8 }, phone: { x: 512, y: 72, scale: 1.6 } },
    pair: { rail: 470, railY: 40, railH: 460, desktop: { x: 0, y: 56, scale: 0.82 }, tablet: { x: 508, y: 92, scale: 1.4 } },
  },
  compact: {
    trio: { rail: 352, desktop: { x: 0, y: 0 }, tablet: { x: 374, y: 0 }, phone: { x: 392, y: 170 } },
    solo: { rail: 442, desktop: { x: 88, y: 0 } },
    phone: { rail: 286, railY: 20, railH: 300, desktop: { x: 0, y: 36, scale: 0.8 }, phone: { x: 318, y: 22, scale: 1.7 } },
    pair: { rail: 286, railY: 20, railH: 300, desktop: { x: 0, y: 36, scale: 0.8 }, tablet: { x: 314, y: 50, scale: 1.4 } },
  },
}
/** Where an absent device waits, just off the right edge of the trio position. */
const offstageNudge = 56

export function sceneBoxes(scene: SceneId, layout: Layout, visible: readonly DeviceId[]): SceneBoxes {
  const place = placements[layout][scene]
  const trio = placements[layout].trio
  const plane = planeSize[layout]
  const devices = Object.fromEntries(deviceIds.map(id => {
    const base = baseSize[layout][id]
    const shown = visible.includes(id)
    const at = (shown ? place[id] : undefined) ?? { ...trio[id]!, x: trio[id]!.x + offstageNudge }
    const scale = at.scale ?? 1
    return [id, { x: at.x, y: at.y, scale, width: base.width * scale, height: base.height * scale, visible: shown }]
  })) as SceneBoxes['devices']
  const railWidth = layout === 'full' ? 20 : 14
  const railY = place.railY ?? (layout === 'full' ? 10 : 0)
  const railH = place.railH ?? (layout === 'full' ? 520 : 336)
  return { devices, rail: { x: place.rail, y: railY, width: railWidth, height: Math.min(railH, plane.height - railY) } }
}

// ─── Per-stop data ──────────────────────────────────────────────────────────

const chatFrames = () => checkpoints()
export const chatFrame = (stop: Stop): Checkpoint => {
  const frame = chatFrames().find(candidate => candidate.slug === stop.chat)
  if (!frame) throw new Error(`Unknown chat frame ${stop.chat}`)
  return frame
}
export const automationFrame = (stop: Stop): AutomationFrame | undefined => stop.automation ? automationFrames().find(frame => frame.slug === stop.automation) : undefined
export const terminalFrame = (stop: Stop): TerminalFrame | undefined => stop.terminal ? terminalFrames().find(frame => frame.slug === stop.terminal) : undefined

export function features(stop: Stop): { rows: FeatureRow[]; protocolVersion: string; offered: string[] } | undefined {
  if (!stop.features) return undefined
  const params = initializeParams()
  const result = initializeResult(params, stop.features.offers)
  return {
    rows: negotiatedFeatures(result, stop.features.built),
    protocolVersion: result.protocolVersion,
    offered: params.protocolVersions,
  }
}

export type AppId = 'chat' | 'automations' | 'terminals'
/** Apps in the desktop's navigation rail; in chapter 6 they follow the negotiated features. */
export function desktopApps(stop: Stop): { id: AppId; label: string; active: boolean }[] {
  const view = stop.views.desktop
  const active: AppId = view === 'automations' || view === 'run' ? 'automations' : view === 'terminal' ? 'terminals' : 'chat'
  const all: { id: AppId; label: string }[] = [{ id: 'chat', label: 'Chat' }, { id: 'automations', label: 'Automations' }, { id: 'terminals', label: 'Terminals' }]
  const gated = features(stop)
  const shown = gated ? all.filter(app => gated.rows.some(row => row.family === app.id && enabledFeature(row))) : all
  return shown.map(app => ({ ...app, active: !gated && app.id === active }))
}

/** The host's serverSeq for the scene in front of the reader. */
export function hostSeq(stop: Stop): number | undefined {
  if (stop.features) return undefined
  if (stop.terminal) return terminalFrame(stop)!.serverSeq
  if (stop.automation) return automationFrame(stop)!.serverSeq
  return chatFrame(stop).serverSeq
}

export function deviceSeq(stop: Stop, id: DeviceId): number | undefined {
  const view = stop.views[id]
  // In the final scene the desktop has followed every channel; the others keep their own bookmarks.
  if (stop.chapter === 7 && view === 'chat') return hostSeq(stop)
  switch (view) {
    case 'chat': return chatFrame(stop).devices[id].lastSeenServerSeq
    case 'automations': return automationFrame(stop)!.desktop.lastSeenServerSeq
    case 'run': return automationFrame(stop)!.tablet!.lastSeenServerSeq
    case 'terminal': return terminalFrame(stop)!.desktop.lastSeenServerSeq
    default: return undefined
  }
}

function wireFor(stop: Stop): ChannelWire[] {
  if (stop.features) {
    const params = initializeParams()
    return [
      { label: 'initialize', from: stop.focus, to: ['host'], message: { jsonrpc: '2.0', id: 1, method: 'initialize', params } },
      { label: 'initialize (result)', from: 'host', to: [stop.focus], message: { jsonrpc: '2.0', id: 1, result: initializeResult(params, stop.features.offers) } },
    ]
  }
  if (stop.chapter === 7) return []
  if (stop.terminal) return terminalFrame(stop)!.wire
  if (stop.automation) return automationFrame(stop)!.wire
  const frame = chatFrame(stop)
  // The echo stop folds in the host's reduction step, so its dispatch is visible too.
  if (stop.slug === 'echo') {
    const accepted = chatFrames().find(candidate => candidate.slug === 'host-reduces')!
    return [...accepted.wire, ...frame.wire]
  }
  return frame.wire
}

export function stopWire(stop: Stop): ChannelWire[] {
  return wireFor(stop)
}

/** Devices that received host traffic at this stop (they flash their seq badge). */
export function receivedBy(stop: Stop): Set<DeviceId> {
  const set = new Set<DeviceId>()
  if (stop.chapter === 0 || stop.chapter === 7) return set
  for (const record of wireFor(stop)) {
    if (record.from !== 'host') continue
    for (const target of record.to) if (target !== 'host' && stop.views[target as DeviceId]) set.add(target as DeviceId)
  }
  return set
}

// ─── Insets ─────────────────────────────────────────────────────────────────

export type InsetOp = '+' | '-' | '~' | '>' | '='
export interface InsetLine { op: InsetOp; text: string }
export interface Inset { label: string; lines: InsetLine[] }

const short = (uri: string) => uri.length > 34 ? `${uri.slice(0, 33)}…` : uri
const pendingList = (frame: Checkpoint, id: DeviceId) => frame.devices[id].pending.map(entry => `#${entry.clientSeq} ${entry.action.type}`).join(', ') || '[]'

function toolStatus(state: ChatState): string {
  const turn = state.activeTurn ?? state.turns.at(-1)
  for (const part of turn?.responseParts ?? []) if (part.kind === ResponsePartKind.ToolCall) return part.toolCall.status
  return 'none'
}

function hostApplied(frame: Checkpoint): InsetLine[] {
  return (frame.applied.host ?? []).map(entry => ({ op: '>', text: `#${entry.serverSeq} ${entry.type}` }))
}

function chatInset(stop: Stop): Inset {
  const frame = chatFrame(stop)
  const d = frame.devices
  switch (stop.slug) {
    case 'cover': return {
      label: 'three mirrors, one state',
      lines: [
        ...deviceIds.map(id => ({ op: '=' as const, text: `${id.padEnd(7)} #${d[id].lastSeenServerSeq}  ${stateDigest(optimisticState(d[id]))}` })),
        { op: '~', text: `toolCall.status "${toolStatus(frame.host)}"` },
      ],
    }
    case 'optimistic': {
      const view = optimisticState(d.desktop)
      const entries = diffJson(d.desktop.confirmed, view, 20).entries.filter(entry => entry.path === 'activeTurn')
      return {
        label: 'desktop · view = pending ∘ confirmed',
        lines: [
          { op: '>', text: `pending ${pendingList(frame, 'desktop')}` },
          ...entries.map(entry => ({ op: entry.op, text: `${entry.path} "${view.activeTurn?.message.text}"` })),
          { op: '=', text: `confirmed still #${d.desktop.lastSeenServerSeq}` },
        ],
      }
    }
    case 'echo': {
      const echoed = frame.applied.desktop?.find(entry => entry.via === 'notification')
      return {
        label: 'echo · reconcile',
        lines: [
          { op: '>', text: `#${echoed?.serverSeq} ${echoed?.type}` },
          { op: '~', text: `origin ${echoed?.origin?.clientId} · clientSeq ${echoed?.origin?.clientSeq}` },
          { op: '-', text: `desktop.pending #${echoed?.origin?.clientSeq}` },
          { op: '=', text: `digest ${stateDigest(frame.host)} ×3` },
        ],
      }
    }
    case 'tool-waits': return {
      label: 'host actions',
      lines: [...hostApplied(frame), { op: '~', text: `toolCall.status "${toolStatus(frame.host)}"` }],
    }
    case 'link-drops': return {
      label: 'phone · offline',
      lines: [
        { op: '>', text: `pending ${pendingList(frame, 'phone')}` },
        { op: '=', text: `lastSeenServerSeq ${d.phone.lastSeenServerSeq}` },
        { op: '~', text: `host accepted #${frame.serverSeq}` },
      ],
    }
    case 'host-advances': return {
      label: 'host · keeps the order',
      lines: [...hostApplied(frame), { op: '-', text: `phone behind by ${frame.serverSeq - d.phone.lastSeenServerSeq}` }],
    }
    case 'reconnect-request': {
      const request = frame.wire.find(record => 'method' in record.message && record.message.method === 'reconnect')
      const params = request && 'params' in request.message ? request.message.params as ReconnectParams : undefined
      return {
        label: 'phone → host · request',
        lines: [
          { op: '>', text: 'reconnect {' },
          { op: '=', text: `  clientId: "${params?.clientId}",` },
          { op: '=', text: `  lastSeenServerSeq: ${params?.lastSeenServerSeq},` },
          { op: '=', text: `  subscriptions: [${params?.subscriptions.length} URIs] }` },
        ],
      }
    }
    case 'replay': {
      const response = frame.wire.find(record => 'result' in record.message)
      const result = response && 'result' in response.message ? response.message.result as ReconnectResult : undefined
      const actions = result && result.type === 'replay' ? result.actions : []
      return {
        label: 'reconnect (result)',
        lines: [
          { op: '>', text: `type "${result?.type}" · actions #${actions[0]?.serverSeq} – #${actions.at(-1)?.serverSeq}` },
          { op: '-', text: 'pending → []' },
          { op: '+', text: `confirmed = actions.reduce(chatReducer, confirmed)` },
          { op: '=', text: `phone ${stateDigest(d.phone.confirmed)} ≡ host ${stateDigest(frame.host)}` },
        ],
      }
    }
    default: return { label: '', lines: [] }
  }
}

function automationInset(stop: Stop, frame: AutomationFrame): Inset {
  const entry = frame.desktop.catalogue.entries[0]
  switch (frame.slug) {
    case 'catalogue': {
      const trigger = entry.definition.triggers[0]
      return {
        label: `subscribe ${catalogueChannel}`,
        lines: [
          { op: '=', text: `entry ${short(automationUri)}` },
          { op: '=', text: trigger.kind === AutomationTriggerKind.Schedule ? `schedule "${trigger.schedule.expression}" ${trigger.schedule.timeZone}` : trigger.kind },
          { op: '~', text: `nextRunAt ${entry.nextRunAt} (host)` },
        ],
      }
    }
    case 'run-requested': return {
      label: 'runAutomation',
      lines: [
        { op: '>', text: `requestId "${(frame.wire[0].message as { params: { requestId: string } }).params.requestId}"` },
        { op: '+', text: `#${frame.serverSeq} automation/set · runs[0] ${entry.runs[0].lifecycle.status}` },
        { op: '=', text: `→ { resource: "${short(frame.desktop.requested!.resource)}" }` },
      ],
    }
    case 'run-running': {
      const tablet = frame.tablet!
      return {
        label: `tablet · ${short(tablet.run.resource)}`,
        lines: [
          ...frame.wire.filter(record => record.to.includes('tablet') && record.label.startsWith('action')).map(record => {
            const envelope = (record.message as { params: { serverSeq: number; action: { type: string } } }).params
            return { op: '>' as const, text: `#${envelope.serverSeq} ${envelope.action.type}` }
          }),
          { op: '~', text: `session.origin.kind "${tablet.origin.kind}"` },
        ],
      }
    }
  }
}

function terminalInset(frame: TerminalFrame, previous?: TerminalFrame): Inset {
  const state = frame.host
  switch (frame.slug) {
    case 'agent-runs': return {
      label: 'ahp-terminal · tool claim',
      lines: [
        { op: '=', text: `claim ${state.claim.kind} · turnId ${'turnId' in state.claim ? state.claim.turnId : '—'} · toolCallId ${'toolCallId' in state.claim ? state.claim.toolCallId : '—'}` },
        ...frame.wire.slice(2).map(record => {
          const envelope = (record.message as { params: { serverSeq: number; action: { type: string; commandLine?: string } } }).params
          return { op: '>' as const, text: `#${envelope.serverSeq} ${envelope.action.type}${envelope.action.commandLine ? ` "${envelope.action.commandLine}"` : ''}` }
        }),
      ],
    }
    case 'backgrounded': {
      const { entries } = diffJson(previous!.host.claim, state.claim, 4)
      return {
        label: 'terminal/claimed · narrows',
        lines: [
          { op: '>', text: `#${frame.serverSeq - 1} terminal/commandFinished exit 0` },
          ...entries.map(entry => ({ op: entry.op, text: `claim.${entry.path}${entry.op === '-' ? '' : ` ${entry.after}`}` })),
        ],
      }
    }
    case 'take-over': return {
      label: 'desktop · dispatchAction',
      lines: [
        { op: '~', text: `claim → client ${state.claim.kind === TerminalClaimKind.Client ? state.claim.clientId : ''}` },
        { op: '>', text: 'terminal/input "npm run lint\\r"  (reducer: no-op)' },
        { op: '+', text: `#${frame.serverSeq - 1} terminal/data from the pty` },
        { op: '=', text: `pending ${frame.desktop.pending.length} · seq #${frame.desktop.lastSeenServerSeq}` },
      ],
    }
  }
}

function featureInset(stop: Stop): Inset {
  const info = features(stop)!
  return {
    label: 'initialize → InitializeResult',
    lines: [
      { op: '>', text: `protocolVersions [${info.offered.map(version => `"${version}"`).join(', ')}]` },
      { op: '=', text: `protocolVersion "${info.protocolVersion}"` },
      ...info.rows.filter(row => row.family !== 'chat').map(row => ({
        op: (enabledFeature(row) ? '+' : row.offered ? '~' : '-') as InsetOp,
        text: `${row.label.toLowerCase()}: ${row.offered ? 'offered' : 'not offered'} · ${row.implemented ? 'built' : 'not built yet'}`,
      })),
    ],
  }
}

function finalInset(stop: Stop): Inset {
  const terminal = terminalFrame(stop)!
  return {
    label: `one host at #${terminal.serverSeq} · three clients`,
    lines: visibleDevices(stop).map(id => ({ op: '=' as const, text: `${(stop.tags?.[id] ?? id).padEnd(10)} ${stop.views[id]?.padEnd(8)} #${deviceSeq(stop, id)}` })),
  }
}

export function insetFor(stop: Stop): Inset {
  if (stop.features) return featureInset(stop)
  if (stop.chapter === 7) return finalInset(stop)
  if (stop.terminal) {
    const frames = terminalFrames()
    const index = frames.findIndex(frame => frame.slug === stop.terminal)
    return terminalInset(frames[index], frames[index - 1])
  }
  const automation = automationFrame(stop)
  if (automation) return automationInset(stop, automation)
  return chatInset(stop)
}

/** Bounded diff of the focused device's view against the previous stop in the chapter. */
export function stopDiff(stop: Stop): ReturnType<typeof diffJson> | undefined {
  if (stop.chapter === 0 || stop.chapter === 7 || stop.features) return undefined
  if (stop.terminal) {
    const frames = terminalFrames()
    const index = frames.findIndex(frame => frame.slug === stop.terminal)
    return index > 0 ? diffJson(frames[index - 1].host, frames[index].host, 8) : undefined
  }
  const automation = automationFrame(stop)
  if (automation) {
    const frames = automationFrames()
    const index = frames.findIndex(frame => frame.slug === automation.slug)
    return index > 0 ? diffJson(frames[index - 1].desktop.catalogue, automation.desktop.catalogue, 8) : undefined
  }
  const frame = chatFrame(stop)
  const base = chatFrames()[frame.base]
  const focus = stop.focus
  return diffJson(optimisticState(base.devices[focus]), optimisticState(frame.devices[focus]), 8)
}

export const subjectLabel = (subject: Subject) => subject === 'host' ? 'Host' : subject[0].toUpperCase() + subject.slice(1)
