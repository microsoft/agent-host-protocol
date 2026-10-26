<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { withBase } from 'vitepress'
import { STABLE_DOC_VERSIONS } from '../../versions'
import AutomationView from './AutomationView.vue'
import ChannelsView from './ChannelsView.vue'
import ChatView from './ChatView.vue'
import DeviceScreen from './DeviceScreen.vue'
import TerminalView from './TerminalView.vue'
import { checkpoints, clientIds, deviceIds, pickActiveStep, stateDigest } from '../notebook.js'
import type { DeviceId, Subject } from '../notebook.js'
import {
  automationFrame, baseSize, chapterBySlug, chapterStart, chapterStops, chapters, chatFrame, clampStop, desktopApps, finalChapter,
  deviceSeq, features, hostSeq, planeSize, receivedBy, sceneBoxes, stopDiff, stops, stopWire,
  subjectLabel, terminalFrame, visibleDevices,
} from '../notebook-story.js'
import type { Layout, Stop } from '../notebook-story.js'

const step = ref(0)
const stop = computed(() => stops[step.value])
const chapter = computed(() => chapters.find(entry => entry.number === stop.value.chapter))

const reveal = ref(0)
const reducedMotion = ref(false)
const wide = ref(true)
const fit = ref(1)
/** Space left below the cover so the first chapter peeks above the fold. */
const peek = computed(() => wide.value ? 150 : 104)
/** Spare vertical space in the wide figure, split evenly so the devices sit centred. */
const slack = ref(0)
const layout = computed<Layout>(() => wide.value ? 'full' : 'compact')

const pad = (value: number) => String(value).padStart(2, '0')
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const jsonToken = /("(?:\\.|[^\\"])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
/** Pretty-printed JSON as escaped HTML with token classes for highlighting. */
const json = (value: unknown) => escapeHtml(JSON.stringify(value, null, 2)).replace(jsonToken, (token, string?: string, colon?: string) => {
  if (string) return colon ? `<span class="j-key">${string}</span>${colon}` : `<span class="j-str">${string}</span>`
  return `<span class="${/^-?\d/.test(token) ? 'j-num' : 'j-lit'}">${token}</span>`
})
const messageCount = (count: number) => `${count} ${count === 1 ? 'message' : 'messages'}`

// ─── Copy ──────────────────────────────────────────────────────────────────

/** `wire` explains the messages shown when the step's message list is expanded. */
interface StepCopy { body: string; aside?: string; wire?: string }
const copy: Record<string, StepCopy> = {
  optimistic: {
    body: 'AHP drives the UI by applying actions to state through pure reducers. A client sends a message by issuing <code>chat/turnStarted</code> as a <code>dispatchAction</code>, and can naturally show it in a pending state until the server acknowledges it.\n\nOther clients stay in sync by seeing the stream of actions echoed and broadcast by the agent host. The host is the arbiter of state and can choose to reject or reconcile concurrent conflicting actions.',
    wire: 'The client numbers each write with its own <code>clientSeq</code> and keeps it in <code>pending</code>, drawing the confirmed state with pending actions applied on top. When the host broadcasts the action back with an <code>origin</code> naming this client and <code>clientSeq</code>, it moves from pending into confirmed state.',
  },
  'link-drops': {
    body: 'Because actions are pure, sequenced envelopes, AHP behaves well under network interruptions. Clients can keep letting the user work and reconcile their pending actions when the network reconnects. Here, the phone approves a tool call just as it loses signal.',
    wire: 'The host accepted the approval, stamped it <code>#46</code> and broadcast it with the phone’s <code>origin</code>. Only the desktop and tablet were still connected to receive it, so the phone keeps the approval pending. It isn’t lost, just not yet confirmed.',
  },
  'host-advances': {
    body: 'The host can keep working too. When a client reconnects, the host sends either the actions it missed or simply a snapshot of the current state.',
    wire: 'These actions carry no <code>origin</code>: they come from the host itself as the agent makes progress. Each takes the next <code>serverSeq</code>, which is how a client that falls behind knows exactly what it missed.',
  },
  replay: {
    body: 'The client then reconciles its pending actions with the current state. Each one is applied, or rejected if it would conflict. The phone’s approval already reached the host before the link dropped, so it’s simply confirmed, and the phone matches every other screen.',
    wire: 'The phone tells the host the last <code>serverSeq</code> it saw, and the host answers with every action after it, in order, inside the response. The first replayed action carries the phone’s own <code>origin</code>, so the phone treats it as the echo of its pending approval.',
  },
  'run-running': {
    body: 'Chat is just one channel, and AHP is designed to be extended with more. Automations, for example, are scheduled tasks that live on the host. Any client can start a run and follow it into the session it creates.',
    wire: 'Subscribing to the run returns a snapshot of its current state, and later changes stream in as actions on the same channel. The desktop’s catalogue updates separately on <code>ahp-automations://</code>. Each client only receives actions for the channels it subscribes to.',
  },
  'take-over': {
    body: 'Terminals are another optional capability. The agent can run a command, and you can take over the same terminal from any client. The host tracks who’s in control, and output always comes from the host, so every screen sees the same thing.',
    wire: 'Claiming the terminal and typing into it are ordinary dispatched actions, echoed back like any other. The echoed <code>terminal/input</code> changes no state; the output only appears once the host’s shell answers with <code>terminal/data</code>.',
  },
  'host-offers-less': {
    body: 'It’s important that AHP be expressive enough to implement powerful, featureful agent hosts. But it’s just as important that it’s easy to build a simple, useful integration that runs wherever developers want it.\n\nFeatures beyond basic conversations are optionally implemented and negotiated by clients and hosts when they connect, so you can start with just chat and add more as you go. This host doesn’t offer automations, so the client simply leaves them out.',
    wire: 'The client lists the protocol versions it speaks, and the host picks one. Capabilities come back with the result: terminals are listed in the root state’s <code>terminals</code>, and automations would appear as an <code>automations</code> field on the result. This host leaves that field out, so the client hides the feature.',
  },
  'any-client': {
    body: 'There are ready-to-use clients in several languages, so it’s easy to build AHP-compatible clients and hosts. If you’d rather implement your own, there are language-independent test suites too. We’ve found that most agents can build fully functional clients and hosts with these packages and minimal prompting.',
  },
}

const chapterLinks: Record<number, [string, string][]> = {
  1: [['Actions', '/guide/actions'], ['Client-side state', '/guide/reconciliation#client-side-state']],
  2: [['Reconciliation', '/guide/reconciliation#reconnection'], ['Reconnection', '/specification/lifecycle#reconnection']],
  3: [['Automations', '/guide/automations'], ['Terminals', '/guide/terminals'], ['Connection handshake', '/specification/lifecycle#connection-handshake']],
  4: [['Choosing a client', '/guide/clients'], ['Test suites', 'https://github.com/microsoft/agent-host-protocol/tree/main/types/test-cases'], ['Specification', '/specification/overview']],
}

const libraries = [['TypeScript', 'typescript'], ['Rust', 'rust'], ['Kotlin', 'kotlin'], ['Swift', 'swift'], ['Go', 'go'], ['.NET', 'dotnet']] as const

// ─── Scene ─────────────────────────────────────────────────────────────────

type Variant = DeviceId
interface Screen {
  id: DeviceId
  stop: Stop
  view: NonNullable<Stop['views'][DeviceId]>
}

/** A device off the desk keeps showing its last scene while it slides away. */
function screenFor(index: number, id: DeviceId): Screen {
  for (let cursor = index; cursor >= 0; cursor--) {
    const view = stops[cursor].views[id]
    if (view) return { id, stop: stops[cursor], view }
  }
  const later = stops.slice(index).find(candidate => candidate.views[id])!
  return { id, stop: later, view: later.views[id]! }
}

const screens = computed(() => deviceIds.map(id => screenFor(step.value, id)))
const visible = computed(() => new Set(visibleDevices(stop.value)))
const boxes = computed(() => sceneBoxes(stop.value.scene, layout.value, visibleDevices(stop.value)))
const received = computed(() => receivedBy(stop.value))
const plane = computed(() => planeSize[layout.value])
const host = computed(() => hostSeq(stop.value))

const delays = ref<Record<DeviceId, number>>({ desktop: 0, tablet: 0, phone: 0 })
watch(step, (now, before) => {
  const was = new Set(visibleDevices(stops[before]))
  const is = new Set(visibleDevices(stops[now]))
  const exits = [...was].some(id => !is.has(id))
  const moves = stops[before].scene !== stops[now].scene
  // Exits first, then the remaining devices settle, then newcomers slide in.
  delays.value = Object.fromEntries(deviceIds.map(id => [id,
    was.has(id) && !is.has(id) ? 0 : !was.has(id) && is.has(id) ? (exits || moves ? 200 : 100) : exits ? 80 : 0,
  ])) as Record<DeviceId, number>
})

function deviceStyle(id: DeviceId) {
  const box = boxes.value.devices[id]
  const base = baseSize[layout.value][id]
  return {
    width: `${base.width}px`,
    height: `${base.height}px`,
    transform: `translate3d(${box.x}px, ${box.y}px, 0) scale(${box.scale})`,
    '--d': `${delays.value[id]}ms`,
  }
}

const railStyle = computed(() => {
  const rail = boxes.value.rail
  return { transform: `translate3d(${rail.x}px, ${rail.y}px, 0)`, width: `${rail.width}px`, height: `${rail.height}px` }
})

const wires = computed(() => {
  const rail = boxes.value.rail
  return visibleDevices(stop.value).map(id => {
    const box = boxes.value.devices[id]
    const y = Math.round(box.y + Math.min(box.height / 2, rail.height - 20))
    const right = box.x > rail.x
    const mirror = screens.value.find(screen => screen.id === id)!.view === 'chat' ? chatFrame(stop.value).devices[id] : undefined
    return { id, x1: right ? rail.x + rail.width : box.x + box.width, x2: right ? box.x : rail.x, y, cut: mirror ? mirror.link !== 'connected' : false }
  })
})

function linkOf(screen: Screen) {
  return screen.view === 'chat' && screen.stop.chapter !== finalChapter ? chatFrame(screen.stop).devices[screen.id].link : 'connected'
}

function bannerOf(screen: Screen): string | undefined {
  if (screen.view !== 'chat' || screen.stop.chapter === finalChapter) return undefined
  const mirror = chatFrame(screen.stop).devices[screen.id]
  if (mirror.link === 'offline') return `Transport closed · last seen #${mirror.lastSeenServerSeq}`
  if (mirror.link === 'reconnecting') return `reconnect → last seen #${mirror.lastSeenServerSeq}`
  return undefined
}

const deviceSummary = computed(() => visibleDevices(stop.value).map(id => {
  const seq = deviceSeq(stop.value, id)
  return `${subjectLabel(id)} shows ${stop.value.views[id]}${seq === undefined ? '' : `, last seen #${seq}`}.`
}).join(' '))
const announcement = computed(() => stop.value.chapter === 0
  ? 'Cover'
  : `Chapter ${stop.value.chapter} of ${chapters.length}, ${chapter.value?.title}: ${stop.value.title}. ${stop.value.caption}`)

const heroZoom = 0.06
const planeStyle = computed(() => {
  const zoom = wide.value && !reducedMotion.value ? 1 + heroZoom * (1 - reveal.value) : 1
  const lift = wide.value && !reducedMotion.value ? (1 - reveal.value) * 14 : 0
  return { width: `${plane.value.width}px`, height: `${plane.value.height}px`, transform: `translate3d(-50%, ${Math.round(slack.value + lift)}px, 0) scale(${(fit.value * zoom).toFixed(4)})` }
})
const figureStyle = computed(() => wide.value ? undefined : { height: `${Math.round(plane.value.height * fit.value)}px` })

// ─── Details (rendered only while open) ────────────────────────────────────

const open = reactive(new Set<string>())
function onToggle(key: string, event: Event) {
  if ((event.target as HTMLDetailsElement).open) open.add(key)
  else open.delete(key)
}
const routeLabel = (from: Subject, to: readonly Subject[]) => `${subjectLabel(from)} → ${to.map(subjectLabel).join(', ')}`
const snapshotFallback = () => {
  const frame = checkpoints().find(candidate => candidate.slug === 'snapshot')!
  return { record: frame.wire[0], seq: frame.devices.phone.lastSeenServerSeq, digest: stateDigest(frame.devices.phone.confirmed), host: stateDigest(frame.host), replayFrom: frame.replayFrom }
}

// ─── Scroll checkpoints ────────────────────────────────────────────────────

const runEl = ref<HTMLElement>()
const stageEl = ref<HTMLElement>()
const stageHeight = ref(0)
const figureEl = ref<HTMLElement>()
const coverEl = ref<HTMLElement>()
const markers: HTMLElement[] = []
const setMarker = (index: number) => (el: Element | ComponentPublicInstance | null) => { if (el instanceof HTMLElement) markers[index] = el }

let rafId = 0
let unlockTimer: ReturnType<typeof setTimeout> | undefined
let hashTimer: ReturnType<typeof setTimeout> | undefined
let navigating = false
let motionQuery: MediaQueryList | undefined
let resizeObserver: ResizeObserver | undefined

function readingLine(): number {
  if (!wide.value && stageEl.value) {
    // The stacked stage is pinned to the bottom; read in the space above it.
    return (window.innerHeight - stageEl.value.getBoundingClientRect().height) * 0.45
  }
  return window.innerHeight * 0.42
}

function tops(): number[] {
  return stops.map(entry => entry.index === 0 ? coverEl.value?.getBoundingClientRect().top ?? 0 : markers[entry.index]?.getBoundingClientRect().top ?? Infinity)
}

function measure(): void {
  rafId = 0
  reveal.value = reducedMotion.value || !wide.value ? 1 : Math.min(1, Math.max(0, window.scrollY / 320))
  if (navigating || !markers.length) return
  step.value = pickActiveStep(tops(), readingLine())
}

function schedule(): void {
  if (!rafId) rafId = requestAnimationFrame(measure)
}

function resize(): void {
  wide.value = window.innerWidth >= 1024 && window.innerHeight >= 620
  stageHeight.value = stageEl.value?.offsetHeight ?? 0
  const box = figureEl.value
  const size = planeSize[wide.value ? 'full' : 'compact']
  if (box) {
    fit.value = wide.value
      ? Math.max(0.4, Math.min(box.clientWidth / size.width, box.clientHeight / size.height) / (1 + heroZoom))
      : Math.max(0.4, Math.min(box.parentElement!.clientWidth / size.width, (window.innerHeight * 0.36) / size.height, 1.15))
    slack.value = wide.value ? Math.max(0, (box.clientHeight - size.height * fit.value) / 2) : 0
  }
  schedule()
}

function release(): void {
  navigating = false
  clearTimeout(unlockTimer)
  schedule()
}

function goto(index: number, jump = false): void {
  const target = clampStop(index)
  step.value = target
  const marker = target === 0 ? undefined : markers[target]
  navigating = true
  const instant = jump || (motionQuery?.matches ?? reducedMotion.value)
  const top = marker ? window.scrollY + marker.getBoundingClientRect().top - readingLine() + 2 : 0
  window.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' })
  clearTimeout(unlockTimer)
  unlockTimer = setTimeout(release, instant ? 60 : 1200)
}

function syncHash(): void {
  const id = decodeURIComponent(window.location.hash.slice(1))
  const target = id.startsWith('ch-') ? chapterBySlug(id.slice(3)) : undefined
  if (target) goto(chapterStart(target.number), true)
}

function onScrollEnd(): void {
  if (navigating) release()
}

function updateMotion(): void {
  reducedMotion.value = motionQuery?.matches ?? false
  schedule()
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', updateMotion)
  reducedMotion.value = motionQuery.matches
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('scrollend', onScrollEnd)
  window.addEventListener('resize', resize)
  window.addEventListener('hashchange', syncHash)
  resizeObserver = new ResizeObserver(resize)
  if (figureEl.value) resizeObserver.observe(figureEl.value)
  if (runEl.value) resizeObserver.observe(runEl.value)
  if (stageEl.value) resizeObserver.observe(stageEl.value)
  resize()
  // Let the router's own hash scroll land first, then align the linked chapter to the reading line.
  hashTimer = setTimeout(syncHash, 120)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  clearTimeout(unlockTimer)
  clearTimeout(hashTimer)
  motionQuery?.removeEventListener('change', updateMotion)
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('scrollend', onScrollEnd)
  window.removeEventListener('resize', resize)
  window.removeEventListener('hashchange', syncHash)
  resizeObserver?.disconnect()
})

const variantOf = (id: DeviceId): Variant => id
</script>

<template>
  <div class="nb" :class="{ 'is-reduced': reducedMotion, 'is-wide': wide }" :style="{ '--nb-stage-h': `${stageHeight}px`, '--nb-peek': `${peek}px` }">
    <div ref="runEl" class="nb-run">
      <header ref="coverEl" class="nb-cover">
        <h1>A protocol for synchronizing agent state across UIs</h1>
        <p class="nb-intro">AHP is a display protocol built to let many interfaces operate on shared session state. It’s an extensible, bidirectional, state-based protocol that works well across a variety of modalities and network conditions.</p>
        <div class="nb-cta">
          <a class="nb-primary" :href="withBase('/guide/what-is-ahp')">Read the guide</a>
          <a :href="withBase('/specification/overview')">Specification <span class="nb-version">v{{ STABLE_DOC_VERSIONS[0] }}</span> ↗</a>
        </div>
      </header>

      <div class="nb-stage-col">
        <section ref="stageEl" class="nb-stage" aria-label="Protocol notebook stage" :style="{ '--reveal': reveal }">
          <figure ref="figureEl" class="nb-figure" :style="figureStyle">
            <div class="nb-plane" :class="`is-${layout}`" :style="planeStyle" aria-hidden="true">
              <svg class="nb-wires" :viewBox="`0 0 ${plane.width} ${plane.height}`" focusable="false">
                <line v-for="wire in wires" :key="`${stop.scene}-${wire.id}`" :x1="wire.x1" :x2="wire.x2" :y1="wire.y" :y2="wire.y" :class="{ 'is-hot': received.has(wire.id), 'is-cut': wire.cut }" />
              </svg>
              <div class="nb-host-rail" :style="railStyle"><span>HOST</span><b>{{ host === undefined ? 'init' : `#${host}` }}</b></div>
              <div
                v-for="screen in screens" :key="screen.id" class="nb-device" :class="{ 'is-out': !visible.has(screen.id) }"
                :style="deviceStyle(screen.id)" :inert="!visible.has(screen.id) || undefined"
              >
                <DeviceScreen
                  :variant="variantOf(screen.id)" :link="linkOf(screen)" :seq="deviceSeq(screen.stop, screen.id)"
                  :badge="screen.view === 'channels' ? `v${features(screen.stop)!.protocolVersion}` : undefined"
                  :tag="screen.stop.tags?.[screen.id]" :focused="visible.size > 1 && stop.chapter > 0 && stop.chapter !== finalChapter && stop.focus === screen.id"
                  :received="received.has(screen.id)" :banner="bannerOf(screen)"
                  :apps="screen.id === 'desktop' && layout === 'full' ? desktopApps(screen.stop) : undefined"
                >
                  <Transition name="nb-swap" mode="out-in">
                    <ChatView v-if="screen.view === 'chat'" key="chat" :mirror="chatFrame(screen.stop).devices[screen.id]" :variant="screen.id" />
                    <AutomationView
                      v-else-if="screen.view === 'automations'" key="automations" :variant="screen.id"
                      :catalogue="automationFrame(screen.stop)!.desktop.catalogue" :requested="automationFrame(screen.stop)!.desktop.requested !== undefined"
                    />
                    <AutomationView
                      v-else-if="screen.view === 'run'" key="run" :variant="screen.id"
                      :run="automationFrame(screen.stop)!.tablet!.run" :origin="automationFrame(screen.stop)!.tablet!.origin"
                    />
                    <TerminalView v-else-if="screen.view === 'terminal'" key="terminal" :variant="screen.id" :state="terminalFrame(screen.stop)!.host" :me="clientIds.desktop" />
                    <ChannelsView v-else key="channels" :rows="features(screen.stop)!.rows" :protocol-version="features(screen.stop)!.protocolVersion" />
                  </Transition>
                </DeviceScreen>
              </div>
            </div>
            <figcaption class="nb-sr">{{ deviceSummary }}</figcaption>
          </figure>
          <p class="nb-sr" aria-live="polite">{{ announcement }}</p>
        </section>
      </div>

      <ol class="nb-notes" aria-label="Notebook chapters">
        <li v-for="entry in chapters" :id="`ch-${entry.slug}`" :key="entry.slug" :ref="setMarker(chapterStart(entry.number))" class="nb-chapter" :class="{ 'is-active': entry.number === stop.chapter, 'is-past': entry.number < stop.chapter }">
          <div class="nb-note-margin" aria-hidden="true">§{{ pad(entry.number) }}</div>
          <div class="nb-chapter-body">
            <h2><a class="nb-anchor" :href="`#ch-${entry.slug}`">{{ entry.title }}</a></h2>
            <ol class="nb-steps">
              <li
                v-for="item in chapterStops(entry.number)" :key="item.slug" :ref="item.sub > 0 ? setMarker(item.index) : undefined"
                class="nb-step" :class="{ 'is-active': item.index === step, 'is-sub': item.sub > 0 }"
              >
                <h3 v-if="chapterStops(entry.number).length > 1"><span>{{ item.sub + 1 }}</span> {{ item.title }}</h3>
                <p v-for="(paragraph, index) in copy[item.slug].body.split('\n\n')" :key="index" v-html="paragraph"></p>
                <p v-if="copy[item.slug].aside" class="nb-aside" v-html="copy[item.slug].aside"></p>
                <details v-if="stopWire(item).length" class="nb-glass" @toggle="onToggle(item.slug, $event)">
                  <summary><span>{{ messageCount(stopWire(item).length) }}</span></summary>
                  <template v-if="open.has(item.slug)">
                    <p v-if="copy[item.slug].wire" class="nb-glass-text" v-html="copy[item.slug].wire"></p>
                    <section v-for="(record, index) in stopWire(item)" :key="index" class="nb-wire">
                      <p><b>{{ record.label }}</b><i>{{ routeLabel(record.from, record.to) }}</i></p>
                      <pre v-html="json(record.message)"></pre>
                    </section>
                    <section v-if="stopDiff(item)?.entries.length" class="nb-wire">
                      <p><b>State diff</b><i>previous step → this step</i></p>
                      <ul class="nb-diff">
                        <li v-for="change in stopDiff(item)!.entries" :key="change.op + change.path" :class="`op-${change.op === '+' ? 'add' : change.op === '-' ? 'del' : 'mod'}`">
                          <b>{{ change.op }}</b><span>{{ change.path }}</span><i>{{ change.op === '~' ? `${change.before} → ${change.after}` : change.after ?? change.before }}</i>
                        </li>
                        <li v-if="stopDiff(item)!.more" class="nb-quiet">… {{ stopDiff(item)!.more }} more paths</li>
                      </ul>
                    </section>
                  </template>
                </details>
                <details v-if="item.slug === 'replay'" class="nb-glass" @toggle="onToggle('snapshot', $event)">
                  <summary><span>If the gap is too old</span></summary>
                  <template v-if="open.has('snapshot')">
                    <p class="nb-glass-text">Had the host trimmed its replay buffer to <code>#{{ snapshotFallback().replayFrom }}</code>, it could not replay <code>#46</code>. It would answer the same request with <code>type: "snapshot"</code> and fresh state for every subscription at <code>fromSeq: {{ snapshotFallback().seq }}</code>. The phone replaces its confirmed state, clears pending and lands on the same digest, <code>{{ snapshotFallback().digest }}</code> ≡ <code>{{ snapshotFallback().host }}</code>.</p>
                    <section class="nb-wire">
                      <p><b>{{ snapshotFallback().record.label }}</b><i>{{ routeLabel(snapshotFallback().record.from, snapshotFallback().record.to) }}</i></p>
                      <pre v-html="json(snapshotFallback().record.message)"></pre>
                    </section>
                  </template>
                </details>
              </li>
            </ol>
            <ul v-if="entry.number === finalChapter" class="nb-libraries" aria-label="Client libraries">
              <li v-for="[name, directory] in libraries" :key="directory"><a :href="`https://github.com/microsoft/agent-host-protocol/tree/main/clients/${directory}`"><span>{{ name }}</span><span class="nb-lib-arrow" aria-hidden="true">↗</span></a></li>
            </ul>
            <p class="nb-more">Read more <a v-for="[label, link] in chapterLinks[entry.number]" :key="link" :href="withBase(link)">{{ label }} ↗</a></p>
          </div>
        </li>
      </ol>
    </div>

    <section class="nb-section nb-routes" aria-labelledby="nb-routes-title">
      <div class="nb-section-margin" aria-hidden="true">→</div>
      <div>
        <h2 id="nb-routes-title">Learn more</h2>
        <p>The guide walks through the concepts, and the specification has the full details.</p>
      </div>
      <nav class="nb-route-list" aria-label="Documentation">
        <a :href="withBase('/guide/what-is-ahp')"><b>Guide</b><span>Concepts, state model and write-ahead reconciliation.</span></a>
        <a :href="withBase('/specification/overview')"><b>Specification</b><span>Transport, lifecycle, channels and reconnection rules.</span></a>
        <a :href="withBase('/reference/common')"><b>Reference</b><span>Every action, command and state type, generated from source.</span></a>
        <a :href="withBase('/guide/clients')"><b>Clients</b><span>Pick a client library and wire it to a host.</span></a>
        <a href="https://github.com/microsoft/agent-host-protocol"><b>GitHub</b><span>Canonical types, clients and conformance fixtures.</span></a>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.nb { --nb-top:calc(var(--vp-nav-height, 64px) + 12px);
  max-width:1440px; margin:0 auto; padding:0 48px; overflow-x:clip; background:var(--nb-paper); color:var(--nb-ink); font-family:var(--nb-sans); }
.nb *, .nb *::before, .nb *::after { box-sizing:border-box; }
.nb a { color:inherit; text-decoration:none; }
.nb a:hover { color:var(--nb-red); }
.nb :focus-visible { outline:2px solid var(--nb-red); outline-offset:2px; }
.nb button { font:inherit; color:inherit; cursor:pointer; }
.nb code { font-family:var(--nb-mono); font-size:.88em; }
.nb-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }

.nb-run { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(360px,1fr); grid-template-areas:"stage cover" "stage notes"; column-gap:48px; }
.nb-cover { grid-area:cover; display:flex; flex-direction:column; justify-content:center; min-height:calc(100vh - var(--vp-nav-height, 64px) - var(--nb-peek, 0px)); padding:44px 0; border-bottom:1px solid var(--nb-line); }
.nb-cover h1 { margin:0 0 18px; font:700 clamp(32px,3vw,44px)/1.08 var(--nb-sans); letter-spacing:-.03em; text-wrap:balance; }
.nb-intro { margin:0; max-width:34em; font-size:16px; line-height:1.55; color:var(--nb-body); }
.nb-cta { display:flex; flex-wrap:wrap; align-items:center; gap:22px; margin:22px 0 16px; font-weight:600; font-size:14px; }
.nb-primary { padding:10px 16px; background:var(--nb-ink); color:var(--nb-paper) !important; border-radius:2px; }
.nb-primary:hover { background:var(--nb-red); }
.nb-version { margin-left:2px; color:var(--nb-muted); font-family:var(--nb-mono); font-size:12px; font-weight:400; }

.nb-stage-col { grid-area:stage; position:relative; }
.nb-stage { position:sticky; top:var(--nb-top); height:calc(100vh - var(--nb-top) - 12px); display:flex; flex-direction:column; padding:14px 0 24px; }

.nb-figure { position:relative; flex:1 1 auto; min-height:0; margin:0; z-index:1; }
.nb-plane { position:absolute; top:0; left:50%; transform-origin:50% 0; will-change:transform; transition:transform .45s cubic-bezier(.2,.7,.2,1); }
.nb-wires { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.nb-wires line { stroke:var(--nb-wire); stroke-width:1.25; transition:stroke .3s ease, stroke-width .3s ease; animation:nb-wire-in .3s ease .45s backwards; }
.nb-wires line.is-hot { stroke:var(--nb-blue); stroke-width:1.75; }
.nb-wires line.is-cut { stroke:var(--nb-red); stroke-dasharray:3 4; }
@keyframes nb-wire-in { from { opacity:0; } }
.nb-host-rail { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:12px 0; border:1px solid var(--nb-device-border); border-radius:999px; background:var(--nb-chrome); color:var(--nb-faint); font:600 8.5px/1 var(--nb-mono); box-shadow:var(--nb-device-shadow); transition:transform .5s cubic-bezier(.2,.7,.2,1) .08s, height .5s cubic-bezier(.2,.7,.2,1) .08s; }
.nb-host-rail span, .nb-host-rail b { writing-mode:vertical-rl; }
.nb-host-rail span { letter-spacing:.3em; }
.nb-host-rail b { font-weight:600; color:var(--nb-ink); font-variant-numeric:tabular-nums; }
.is-compact .nb-host-rail { font-size:7px; padding:8px 0; }
.nb-device { position:absolute; left:0; top:0; transform-origin:0 0; transition:transform .5s cubic-bezier(.2,.7,.2,1) var(--d, 0ms), opacity .35s ease var(--d, 0ms), visibility 0s linear var(--d, 0ms); }
.nb-device.is-out { opacity:0; visibility:hidden; transition:transform .4s ease var(--d, 0ms), opacity .25s ease var(--d, 0ms), visibility 0s linear calc(var(--d, 0ms) + .4s); }
.nb-swap-enter-active, .nb-swap-leave-active { transition:opacity .2s ease; }
.nb-swap-enter-from, .nb-swap-leave-to { opacity:0; }

.nb-notes { grid-area:notes; margin:0; padding:0 0 48vh; list-style:none; background-image:linear-gradient(to right, transparent 43px, var(--nb-margin-line) 43px, var(--nb-margin-line) 44px, transparent 44px); }
.nb-chapter { display:grid; grid-template-columns:44px minmax(0,1fr); column-gap:20px; padding:28px 0 40px; border-bottom:1px solid var(--nb-line); scroll-margin-top:40vh; color:var(--nb-muted); transition:color .3s ease; }
.nb-chapter.is-active { color:var(--nb-ink); }
.nb-note-margin { padding:2px 8px 0 0; font:500 12px/1 var(--nb-mono); color:var(--nb-faint); text-align:right; }
.is-active > .nb-note-margin { color:var(--nb-red); font-weight:700; }
.nb-chapter-body { min-width:0; max-width:36em; font-size:15px; line-height:1.6; }
.nb-chapter h2 { margin:0 0 12px; padding:0; border:0; font:700 24px/1.2 var(--nb-sans); letter-spacing:-.015em; color:var(--nb-ink); }
.nb-anchor:hover::after { content:" ¶"; color:var(--nb-faint); }
.nb-steps { margin:0; padding:0; list-style:none; }
.nb-step { min-height:46vh; padding:0 0 20px; }
.nb-step.is-sub { padding-top:22px; border-top:1px dotted var(--nb-line); }
.nb-step:last-child { min-height:0; }
.nb-chapter .nb-step:only-child { min-height:40vh; }
.nb-step h3 { display:flex; gap:10px; align-items:baseline; margin:0 0 8px; font:700 16px/1.3 var(--nb-sans); color:var(--nb-muted); transition:color .3s ease; }
.nb-step h3 span { font:500 11px/1 var(--nb-mono); color:var(--nb-faint); }
.nb-step.is-active h3 { color:var(--nb-ink); }
.nb-step.is-active h3 span { color:var(--nb-red); }
.nb-step > p { margin:0 0 12px; }
.nb-step :deep(code) { padding:0 3px; background:var(--nb-code-bg); border-radius:2px; font-size:.86em; color:var(--nb-ink); }
.nb-aside { padding-left:12px; border-left:2px solid var(--nb-line); font-size:13.5px; }
.nb-glass { margin:0 -11px 2px; border:1px solid transparent; border-radius:2px; transition:background-color .2s ease, border-color .2s ease; }
.nb-glass[open] { margin-bottom:8px; border-color:var(--nb-line); background:var(--nb-surface); }
.nb-glass summary { display:flex; gap:10px; justify-content:space-between; padding:5px 10px; cursor:pointer; font:500 11.5px/1.35 var(--nb-mono); color:var(--nb-muted); list-style:none; }
.nb-glass summary::-webkit-details-marker { display:none; }
.nb-glass summary > span::before { content:"▸"; display:inline-block; width:1em; margin-right:.25em; text-align:center; transition:transform .15s ease; }
.nb-glass[open] summary > span::before { transform:rotate(90deg); }
.nb-glass summary:hover, .nb-glass[open] summary { color:var(--nb-ink); }
.nb-glass-text { margin:0; padding:8px 10px; border-top:1px solid var(--nb-line); font-size:13.5px; line-height:1.55; }
.nb-wire { border-top:1px solid var(--nb-line); }
.nb-wire > p { display:flex; justify-content:space-between; gap:10px; margin:0; padding:6px 10px 0; font:600 11px/1.35 var(--nb-mono); }
.nb-wire > p i { font-style:normal; font-weight:400; color:var(--nb-faint); }
.nb-wire pre { margin:0; padding:6px 10px 10px; max-height:260px; overflow:auto; background:transparent; font:11px/1.45 var(--nb-mono); color:var(--nb-faint); }
.nb-wire pre :deep(.j-key) { color:var(--nb-blue); }
.nb-wire pre :deep(.j-str) { color:var(--nb-green); }
.nb-wire pre :deep(.j-num) { color:var(--nb-amber); }
.nb-wire pre :deep(.j-lit) { color:var(--nb-red); }
.nb-diff { margin:0; padding:6px 10px 10px; list-style:none; font:11px/1.35 var(--nb-mono); }
.nb-diff li { display:grid; grid-template-columns:12px 1fr; column-gap:4px; padding:2px 0; }
.nb-diff li > span { overflow-wrap:anywhere; }
.nb-diff i { grid-column:2; font-style:normal; color:var(--nb-muted); font-size:10px; overflow-wrap:anywhere; }
.nb-diff .op-add b, .nb-diff .op-add > span { color:var(--nb-green); }
.nb-diff .op-del b, .nb-diff .op-del > span { color:var(--nb-red); }
.nb-diff .op-mod b { color:var(--nb-blue); }
.nb-quiet { color:var(--nb-faint); }
.nb-more { display:flex; flex-wrap:wrap; gap:6px 14px; margin:14px 0 0; font:600 12px/1.4 var(--nb-sans); color:var(--nb-faint); }
.nb-more a { color:var(--nb-blue); border-bottom:1px solid var(--nb-link-line); }
.nb-libraries { display:grid; grid-template-columns:repeat(auto-fill,minmax(128px,1fr)); gap:8px; margin:16px 0 0; padding:0; list-style:none; }
.nb-libraries a { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px 12px; border:1px solid var(--nb-line); border-radius:8px; background:var(--nb-surface); font-weight:600; font-size:14px; transition:border-color .2s ease, background-color .2s ease; }
.nb-libraries a:hover { border-color:var(--nb-device-border); background:var(--nb-raised); }
.nb-lib-arrow { color:var(--nb-faint); font-weight:400; }

.nb-section { display:grid; grid-template-columns:44px minmax(0,1fr) minmax(0,1.2fr); column-gap:20px; padding:56px 0; border-top:1px solid var(--nb-ink); }
.nb-section-margin { font:700 12px/1 var(--nb-mono); color:var(--nb-red); text-align:right; padding:4px 8px 0 0; }
.nb-section h2 { margin:8px 0 12px; font:700 30px/1.1 var(--nb-sans); letter-spacing:-.025em; border:0; padding:0; }
.nb-section p { margin:0 0 14px; max-width:32em; color:var(--nb-body); line-height:1.55; }
.nb-route-list { display:grid; border-top:1px solid var(--nb-line); align-self:start; }
.nb-route-list a { display:grid; grid-template-columns:140px 1fr; gap:16px; padding:14px 4px; border-bottom:1px solid var(--nb-line); }
.nb-route-list span { color:var(--nb-muted); font-size:14px; }

/* Reduced motion: state changes are instant; nothing moves or scales. */
.is-reduced .nb-plane, .is-reduced .nb-device, .is-reduced .nb-host-rail, .is-reduced .nb-chapter, .is-reduced .nb-step h3 { transition:none !important; }
.is-reduced .nb-wires line { animation:none; }
.is-reduced :deep(.nb-swap-enter-active), .is-reduced :deep(.nb-swap-leave-active) { transition:none !important; }
@media (prefers-reduced-motion: reduce) {
  .nb-plane, .nb-device, .nb-host-rail, .nb-chapter, .nb-step h3, .nb-swap-enter-active, .nb-swap-leave-active, .nb-wires line { transition:none !important; }
  .nb-wires line { animation:none; }
}

@media (max-width:1279px) {
  .nb-run { grid-template-columns:minmax(0,1.4fr) minmax(330px,1fr); column-gap:32px; }
}

/* Stacked layout: the compact stage holds only the devices and sticks to the bottom; details live in each note. */
@media (max-width:1023px), (max-height:619px) {
  .nb { padding:0 24px; }
  .nb-run { grid-template-columns:minmax(0,1fr); grid-template-areas:"cover" "notes" "stage"; }
  .nb-cover { min-height:calc(100svh - var(--vp-nav-height, 64px) - var(--nb-stage-h, 0px) - var(--nb-peek, 0px)); padding:28px 0; border-bottom:0; }
  .nb-cover h1 { font-size:clamp(28px,6.5vw,40px); }
  .nb-stage-col { display:contents; }
  .nb-stage { grid-area:stage; align-self:end; top:auto; bottom:0; height:auto; z-index:5; padding:10px 0 calc(10px + env(safe-area-inset-bottom, 0px)); background:var(--nb-paper); border-top:1px solid var(--nb-line); box-shadow:0 -12px 24px -20px var(--nb-shadow); }
  .nb-figure { flex:none; }
  .nb-plane { transition:none; }
  .nb-notes { padding-bottom:24px; background-image:none; }
  .nb-chapter:last-child { border-bottom:0; }
  .nb-chapter { grid-template-columns:30px minmax(0,1fr); column-gap:10px; scroll-margin-top:16px; }
  .nb-note-margin { padding-right:0; text-align:left; font-size:11px; }
  .nb-step { min-height:40vh; }
  .nb-section { grid-template-columns:minmax(0,1fr); row-gap:20px; padding:40px 0; }
  .nb-section-margin { text-align:left; padding:0; }
}
@media (max-width:520px) {
  .nb { padding:0 16px; }
  .nb-chapter-body { font-size:14.5px; }
  .nb-chapter h2 { font-size:21px; }
  .nb-glass summary { flex-wrap:wrap; row-gap:2px; }
  .nb-wire > p { flex-direction:column; gap:2px; }
  .nb-route-list a { grid-template-columns:1fr; gap:4px; }
}
</style>
