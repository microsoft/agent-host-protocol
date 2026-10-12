<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { withBase } from 'vitepress'
import AutomationView from './AutomationView.vue'
import ChannelsView from './ChannelsView.vue'
import ChatView from './ChatView.vue'
import DeviceScreen from './DeviceScreen.vue'
import TerminalView from './TerminalView.vue'
import { checkpoints, clientIds, deviceIds, pickActiveStep, stateDigest } from '../notebook.js'
import type { DeviceId, Subject } from '../notebook.js'
import {
  automationFrame, baseSize, chapterBySlug, chapterStart, chapterStops, chapters, chatFrame, clampStop, desktopApps,
  deviceSeq, features, hostSeq, insetFor, lastStop, planeSize, receivedBy, sceneBoxes, stopDiff, stops, stopWire,
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
const layout = computed<Layout>(() => wide.value ? 'full' : 'compact')

const pad = (value: number) => String(value).padStart(2, '0')
const json = (value: unknown) => JSON.stringify(value, null, 2)

// ─── Copy ──────────────────────────────────────────────────────────────────

interface StepCopy { body: string; aside?: string }
const copy: Record<string, StepCopy> = {
  optimistic: {
    body: 'You type into the desktop app. It sends <code>chat/turnStarted</code> as a <code>dispatchAction</code> with <code>clientSeq: 7</code> and shows it straight away, faded, because it sits in <code>pending</code> on top of the confirmed snapshot from <code>#40</code>. What you see is <code>pending.reduce(chatReducer, confirmed)</code>.',
  },
  echo: {
    body: 'The host runs the same <code>chatReducer</code>, stamps the action <code>serverSeq: 41</code> with <code>origin: { clientId, clientSeq: 7 }</code> and sends it to every subscriber. The desktop recognises its own write and drops it from pending; the tablet and phone just apply it.',
  },
  'tool-waits': {
    body: 'The agent streams a reply and asks to run a tool. <code>chat/toolCallReady</code> arrives without <code>confirmed</code>, so every mirror parks the call in <code>pending-confirmation</code>. Same actions, same order: any screen can approve.',
  },
  'link-drops': {
    body: 'You approve on the phone just as it loses signal. The host accepts the approval as <code>#46</code>, but the echo never arrives. The phone keeps <code>lastSeenServerSeq: 45</code> and one pending write.',
  },
  'host-advances': {
    body: 'The host does not wait. The tool finishes and the turn completes, <code>#47</code> to <code>#49</code>, on the desktop. The phone stays at <code>#45</code>.',
  },
  'reconnect-request': {
    body: 'On a new transport the phone sends one <code>reconnect</code> <em>request</em>: its <code>clientId</code>, <code>lastSeenServerSeq: 45</code> and the subscriptions it held.',
  },
  replay: {
    body: 'The <em>response</em> carries the missed envelopes, <code>#46</code> to <code>#49</code>; they are not re-sent as notifications. The phone clears pending, since its approval comes back as <code>#46</code> with its own origin, and applies them in order. Its state now matches the host.',
    aside: 'Protocol notifications such as <code>sessionAdded</code> are not replayed; re-fetch with <code>listSessions</code>.',
  },
  catalogue: {
    body: 'A nightly check lives on the host. The desktop subscribes to the <code>ahp-automations://</code> catalogue; the entry’s <code>ahp-automation:/…</code> URI names it but is not a channel you subscribe to. Triggers, <code>nextRunAt</code> and run claims are the host’s job. Clients never run a fallback scheduler.',
  },
  'run-requested': {
    body: '<b>Run now</b> sends <code>runAutomation</code> with a <code>requestId</code>. The host persists a pending run before any session exists, publishes <code>automation/set</code> (<code>#50</code>) and returns the run URI. Retrying with the same <code>requestId</code> returns the same run.',
  },
  'run-running': {
    body: 'The tablet opens the run. The host creates a fresh session for it, records it (<code>#51</code>, <code>#52</code>) and marks the run <code>running</code> (<code>#53</code>). The session’s <code>origin</code> points back to the automation and the run.',
  },
  'agent-runs': {
    body: 'The run’s agent needs a shell. The host lists the terminal in root state (<code>#55</code>), claimed by the session with the <code>turnId</code> and <code>toolCallId</code> that started it. Command detection marks <code>npm test -- chat</code>; output streams as <code>terminal/data</code>.',
    aside: 'The output on this page is scripted. No shell runs.',
  },
  backgrounded: {
    body: 'The command exits 0 and the tool call ends, so the host narrows the claim to the session and chat (<code>#59</code>). A terminal always has exactly one owner.',
  },
  'take-over': {
    body: 'You take over on the desktop: claim the terminal for your client, then type. <code>terminal/input</code> changes no state. Text appears only when the host’s pty answers with <code>terminal/data</code>.',
  },
  'chat-first': {
    body: 'You don’t need every channel on day one. <code>initialize</code> offers the versions your client speaks and the host picks one, here <code>1.0.0</code>. This build only implements chat, so it shows one app.',
  },
  'add-channels': {
    body: 'Add terminals, then automations. Each one turns on only where this host advertises it: terminals through <code>RootState.terminals</code>, automations through <code>InitializeResult.automations</code>, with limits such as <code>runCancellation</code>.',
  },
  'host-offers-less': {
    body: 'Another host leaves out <code>automations</code>, so the client hides that feature instead of assuming it. Check the negotiated version, the advertised capabilities and the channels each host supports, and ignore action types you don’t know.',
  },
  'any-client': {
    body: 'Nothing here is specific to this page. A client that speaks AHP to a compatible host receives the same envelopes and folds them through the same reducers. You build only the channels you need, gate them on what the host supports, and your screen joins in step. The language tags on the devices are illustrative.',
  },
}

const chapterLinks: Record<number, [string, string][]> = {
  1: [['Client-side state', '/guide/reconciliation#client-side-state'], ['Actions', '/guide/actions']],
  2: [['Reconciliation', '/guide/reconciliation#reconciliation-algorithm'], ['Chat channel', '/specification/chat-channel']],
  3: [['Reconnection', '/specification/lifecycle#reconnection'], ['Reconciliation · reconnect', '/guide/reconciliation#reconnection']],
  4: [['Automations guide', '/guide/automations'], ['Automation channel', '/specification/automation-channel'], ['Run channel', '/specification/automation-run-channel']],
  5: [['Terminals guide', '/guide/terminals'], ['Terminal channel', '/specification/terminal-channel']],
  6: [['Versioning', '/specification/versioning'], ['Connection handshake', '/specification/lifecycle#connection-handshake']],
  7: [['Choosing a client', '/guide/clients'], ['Specification', '/specification/overview']],
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
    was.has(id) && !is.has(id) ? 0 : !was.has(id) && is.has(id) ? (exits || moves ? 260 : 120) : exits ? 110 : 0,
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
  return screen.view === 'chat' && screen.stop.chapter !== 7 ? chatFrame(screen.stop).devices[screen.id].link : 'connected'
}

function bannerOf(screen: Screen): string | undefined {
  if (screen.view !== 'chat' || screen.stop.chapter === 7) return undefined
  const mirror = chatFrame(screen.stop).devices[screen.id]
  if (mirror.link === 'offline') return `Transport closed · last seen #${mirror.lastSeenServerSeq}`
  if (mirror.link === 'reconnecting') return `reconnect → last seen #${mirror.lastSeenServerSeq}`
  return undefined
}

const inset = computed(() => insetFor(stop.value))
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
  return { width: `${plane.value.width}px`, height: `${plane.value.height}px`, transform: `translate3d(-50%, ${lift}px, 0) scale(${(fit.value * zoom).toFixed(4)})` }
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
  const style = stageEl.value && getComputedStyle(stageEl.value)
  if (!wide.value && stageEl.value && style && style.position === 'sticky') {
    // Measure against the stage's stuck position so jumps from the cover land correctly.
    const bottom = (parseFloat(style.top) || 0) + stageEl.value.getBoundingClientRect().height
    return bottom + (window.innerHeight - bottom) * 0.3
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
  const box = figureEl.value
  const size = planeSize[wide.value ? 'full' : 'compact']
  if (box) {
    fit.value = wide.value
      ? Math.max(0.4, Math.min(box.clientWidth / size.width, box.clientHeight / size.height) / (1 + heroZoom))
      : Math.max(0.4, Math.min(box.parentElement!.clientWidth / size.width, (window.innerHeight * 0.36) / size.height, 1.15))
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
  <div class="nb" :class="{ 'is-reduced': reducedMotion, 'is-wide': wide }">
    <div class="nb-masthead">
      <span>AHP · Agent Host Protocol</span>
      <span>Notebook 01 · one host, seven short notes</span>
      <span>Local scripted simulation · canonical reducers · no backend</span>
    </div>

    <div ref="runEl" class="nb-run">
      <header ref="coverEl" class="nb-cover">
        <p class="nb-eyebrow">An open protocol for agent sessions</p>
        <h1>One session.<br>Every screen<br>in step.</h1>
        <p class="nb-intro">The host owns the state. Clients write ahead, the host decides the order, and every screen folds the same actions through the same pure reducer. Seven short notes follow one developer’s day: a chat, a dropped link, an automation, a terminal and a client of your own.</p>
        <div class="nb-cta">
          <a class="nb-primary" :href="withBase('/guide/what-is-ahp')">Read the guide</a>
          <a :href="withBase('/specification/overview')">Specification ↗</a>
        </div>
        <p class="nb-fine">JSON-RPC 2.0 over WebSocket · clients in TypeScript, Rust, Kotlin, Swift, Go and .NET</p>
      </header>

      <div class="nb-stage-col">
        <section ref="stageEl" class="nb-stage" aria-label="Protocol notebook stage" :style="{ '--reveal': reveal }">
          <div class="nb-stage-head">
            <p class="nb-stage-title">
              <template v-if="chapter"><span>§{{ pad(chapter.number) }}</span> {{ chapter.title }}<i v-if="chapterStops(chapter.number).length > 1"> · {{ stop.sub + 1 }}/{{ chapterStops(chapter.number).length }}</i></template>
              <template v-else><span>§00</span> One turn, three screens</template>
            </p>
            <nav class="nb-nav" aria-label="Notebook chapters">
              <button type="button" class="nb-nav-step" aria-label="Previous step" :disabled="step === 0" @click="goto(step - 1)"><span aria-hidden="true">←<span class="nb-nav-word"> Prev</span></span></button>
              <ol>
                <li v-for="entry in chapters" :key="entry.slug">
                  <button type="button" :aria-current="entry.number === stop.chapter ? 'step' : undefined" :aria-label="`Chapter ${entry.number}: ${entry.title}`" :title="entry.title" @click="goto(chapterStart(entry.number))">{{ pad(entry.number) }}</button>
                </li>
              </ol>
              <button type="button" class="nb-nav-step" aria-label="Next step" :disabled="step === lastStop" @click="goto(step + 1)"><span aria-hidden="true"><span class="nb-nav-word">Next </span>→</span></button>
            </nav>
          </div>

          <figure ref="figureEl" class="nb-figure" :style="figureStyle">
            <div class="nb-plane" :class="`is-${layout}`" :style="planeStyle" aria-hidden="true">
              <svg class="nb-wires" :viewBox="`0 0 ${plane.width} ${plane.height}`" focusable="false">
                <line v-for="wire in wires" :key="`${step}-${wire.id}`" :x1="wire.x1" :x2="wire.x2" :y1="wire.y" :y2="wire.y" :class="{ 'is-hot': received.has(wire.id), 'is-cut': wire.cut }" />
              </svg>
              <div class="nb-host-rail" :style="railStyle"><span>HOST</span><b>{{ host === undefined ? 'init' : `#${host}` }}</b></div>
              <div
                v-for="screen in screens" :key="screen.id" class="nb-device" :class="{ 'is-out': !visible.has(screen.id) }"
                :style="deviceStyle(screen.id)" :inert="!visible.has(screen.id) || undefined"
              >
                <DeviceScreen
                  :variant="variantOf(screen.id)" :link="linkOf(screen)" :seq="deviceSeq(screen.stop, screen.id)"
                  :badge="screen.view === 'channels' ? `v${features(screen.stop)!.protocolVersion}` : undefined"
                  :tag="screen.stop.tags?.[screen.id]" :focused="visible.size > 1 && stop.focus === screen.id"
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

          <div class="nb-foot">
            <Transition name="nb-fade" mode="out-in">
              <div :key="stop.slug" class="nb-foot-inner">
                <p class="nb-caption">{{ stop.caption }}</p>
                <div class="nb-inset" :aria-label="`Inset: ${inset.label}`">
                  <p class="nb-label">{{ inset.label }}</p>
                  <ul><li v-for="(line, index) in inset.lines" :key="index" :class="`op-${line.op === '+' ? 'add' : line.op === '-' ? 'del' : line.op === '~' ? 'mod' : line.op === '>' ? 'msg' : 'eq'}`"><b>{{ line.op }}</b>{{ line.text }}</li></ul>
                </div>
              </div>
            </Transition>
            <p class="nb-local">Scripted in your browser. No host, no network, no model.</p>
          </div>
          <p class="nb-sr" aria-live="polite">{{ announcement }}</p>
        </section>
      </div>

      <ol class="nb-notes" aria-label="Notebook chapters">
        <li v-for="entry in chapters" :id="`ch-${entry.slug}`" :key="entry.slug" :ref="setMarker(chapterStart(entry.number))" class="nb-chapter" :class="{ 'is-active': entry.number === stop.chapter, 'is-past': entry.number < stop.chapter }">
          <div class="nb-note-margin" aria-hidden="true">§{{ pad(entry.number) }}</div>
          <div class="nb-chapter-body">
            <p class="nb-kicker">{{ entry.kicker }}</p>
            <h2><a class="nb-anchor" :href="`#ch-${entry.slug}`">{{ entry.title }}</a></h2>
            <ol class="nb-steps">
              <li
                v-for="item in chapterStops(entry.number)" :key="item.slug" :ref="item.sub > 0 ? setMarker(item.index) : undefined"
                class="nb-step" :class="{ 'is-active': item.index === step, 'is-sub': item.sub > 0 }"
              >
                <h3 v-if="chapterStops(entry.number).length > 1"><span>{{ item.sub + 1 }}</span> {{ item.title }}</h3>
                <p v-html="copy[item.slug].body"></p>
                <p v-if="copy[item.slug].aside" class="nb-aside" v-html="copy[item.slug].aside"></p>
                <div class="nb-inset nb-narrow-only">
                  <p class="nb-label">{{ insetFor(item).label }}</p>
                  <ul><li v-for="(line, index) in insetFor(item).lines" :key="index" :class="`op-${line.op === '+' ? 'add' : line.op === '-' ? 'del' : line.op === '~' ? 'mod' : line.op === '>' ? 'msg' : 'eq'}`"><b>{{ line.op }}</b>{{ line.text }}</li></ul>
                </div>
                <details v-if="stopWire(item).length" class="nb-glass" @toggle="onToggle(item.slug, $event)">
                  <summary><span>Under the glass</span><i>{{ stopWire(item).length }} messages{{ stopDiff(item) ? ' · view diff' : '' }}</i></summary>
                  <template v-if="open.has(item.slug)">
                    <section v-for="(record, index) in stopWire(item)" :key="index" class="nb-wire">
                      <p><b>{{ record.label }}</b><i>{{ routeLabel(record.from, record.to) }}</i></p>
                      <pre>{{ json(record.message) }}</pre>
                    </section>
                    <section v-if="stopDiff(item)?.entries.length" class="nb-wire">
                      <p><b>View diff</b><i>previous step → this step</i></p>
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
                  <summary><span>If the gap is too old</span><i>snapshot fallback</i></summary>
                  <template v-if="open.has('snapshot')">
                    <p class="nb-glass-text">Had the host trimmed its replay buffer to <code>#{{ snapshotFallback().replayFrom }}</code>, it could not replay <code>#46</code>. It would answer the same request with <code>type: "snapshot"</code> and fresh state for every subscription at <code>fromSeq: {{ snapshotFallback().seq }}</code>. The phone replaces its confirmed state, clears pending and lands on the same digest, <code>{{ snapshotFallback().digest }}</code> ≡ <code>{{ snapshotFallback().host }}</code>.</p>
                    <section class="nb-wire">
                      <p><b>{{ snapshotFallback().record.label }}</b><i>{{ routeLabel(snapshotFallback().record.from, snapshotFallback().record.to) }}</i></p>
                      <pre>{{ json(snapshotFallback().record.message) }}</pre>
                    </section>
                  </template>
                </details>
              </li>
            </ol>
            <ul v-if="entry.number === 7" class="nb-libraries" aria-label="Client libraries">
              <li v-for="[name, directory] in libraries" :key="directory"><a :href="`https://github.com/microsoft/agent-host-protocol/tree/main/clients/${directory}`"><span>{{ name }}</span><code>clients/{{ directory }}</code></a></li>
            </ul>
            <p class="nb-more">Read more <a v-for="[label, link] in chapterLinks[entry.number]" :key="link" :href="withBase(link)">{{ label }} ↗</a></p>
          </div>
        </li>
      </ol>
    </div>

    <section class="nb-section nb-routes" aria-labelledby="nb-routes-title">
      <div class="nb-section-margin" aria-hidden="true">→</div>
      <div>
        <p class="nb-kicker">Keep reading</p>
        <h2 id="nb-routes-title">From idea to wire format.</h2>
        <p>The notebook skips most details on purpose. The guide explains the model; the specification is the contract.</p>
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

.nb-masthead { display:flex; justify-content:space-between; gap:24px; padding:14px 0 10px; border-bottom:1px solid var(--nb-ink); font:500 11px/1.3 var(--nb-mono); letter-spacing:.04em; color:var(--nb-muted); }
.nb-masthead span:first-child { color:var(--nb-ink); font-weight:700; }

.nb-run { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(360px,1fr); grid-template-areas:"stage cover" "stage notes"; column-gap:48px; }
.nb-cover { grid-area:cover; padding:44px 0 36px; border-bottom:1px solid var(--nb-line); }
.nb-eyebrow, .nb-kicker, .nb-label { margin:0; font:600 10.5px/1.3 var(--nb-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--nb-muted); }
.nb-cover h1 { margin:14px 0 18px; font:700 clamp(40px,4.2vw,60px)/.98 var(--nb-sans); letter-spacing:-.035em; }
.nb-intro { margin:0; max-width:34em; font-size:16px; line-height:1.55; color:var(--nb-body); }
.nb-cta { display:flex; flex-wrap:wrap; align-items:center; gap:22px; margin:22px 0 16px; font-weight:600; font-size:14px; }
.nb-primary { padding:10px 16px; background:var(--nb-ink); color:var(--nb-paper) !important; border-radius:2px; }
.nb-primary:hover { background:var(--nb-red); }
.nb-fine { margin:0; font:11px/1.4 var(--nb-mono); color:var(--nb-faint); }

.nb-stage-col { grid-area:stage; position:relative; }
.nb-stage { position:sticky; top:var(--nb-top); height:calc(100vh - var(--nb-top) - 12px); display:flex; flex-direction:column; gap:10px; padding-top:14px; }
.nb-stage-head { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom:8px; border-bottom:1px solid var(--nb-line); }
.nb-stage-title { margin:0; min-width:0; font:600 13px/1.3 var(--nb-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.nb-stage-title span { font-family:var(--nb-mono); color:var(--nb-red); margin-right:6px; }
.nb-stage-title i { font:400 11px/1 var(--nb-mono); font-style:normal; color:var(--nb-faint); }
.nb-nav { display:flex; align-items:center; gap:6px; flex:none; }
.nb-nav ol { display:flex; gap:2px; margin:0; padding:0; list-style:none; }
.nb-nav ol button { width:28px; height:26px; padding:0; border:1px solid transparent; border-radius:2px; background:none; font:500 10.5px/1 var(--nb-mono); color:var(--nb-faint); }
.nb-nav ol button:hover { color:var(--nb-ink); border-color:var(--nb-line); }
.nb-nav ol button[aria-current] { background:var(--nb-ink); color:var(--nb-paper); }
.nb-nav-step { height:26px; padding:0 9px; border:1px solid var(--nb-ink); border-radius:2px; background:transparent; font:600 11.5px/1 var(--nb-sans) !important; }
.nb-nav-step:hover:not(:disabled) { background:var(--nb-ink); color:var(--nb-paper); }
.nb-nav-step:disabled { opacity:.35; cursor:default; }

.nb-figure { position:relative; flex:1 1 auto; min-height:0; margin:0; z-index:1; }
.nb-plane { position:absolute; top:0; left:50%; transform-origin:50% 0; will-change:transform; transition:transform .45s cubic-bezier(.2,.7,.2,1); }
.nb-wires { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.nb-wires line { stroke:var(--nb-ink); stroke-width:1.25; animation:nb-wire-in .3s ease .55s backwards; }
.nb-wires line.is-hot { stroke:var(--nb-blue); stroke-width:2; }
.nb-wires line.is-cut { stroke:var(--nb-red); stroke-dasharray:3 3; }
@keyframes nb-wire-in { from { opacity:0; } }
.nb-host-rail { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:10px 0; border-radius:3px; background:var(--nb-ink); color:var(--nb-paper); font:700 9px/1 var(--nb-mono); transition:transform .6s cubic-bezier(.2,.7,.2,1) .1s, height .6s cubic-bezier(.2,.7,.2,1) .1s; }
.nb-host-rail span, .nb-host-rail b { writing-mode:vertical-rl; }
.nb-host-rail span { letter-spacing:.3em; }
.nb-host-rail b { font-weight:500; }
.is-compact .nb-host-rail { font-size:7.5px; padding:6px 0; }
.nb-device { position:absolute; left:0; top:0; transform-origin:0 0; transition:transform .6s cubic-bezier(.2,.7,.2,1) var(--d, 0ms), opacity .4s ease var(--d, 0ms), visibility 0s linear var(--d, 0ms); }
.nb-device.is-out { opacity:0; visibility:hidden; transition:transform .45s ease var(--d, 0ms), opacity .3s ease var(--d, 0ms), visibility 0s linear calc(var(--d, 0ms) + .45s); }
.nb-swap-enter-active, .nb-swap-leave-active { transition:opacity .22s ease; }
.nb-swap-enter-from, .nb-swap-leave-to { opacity:0; }

.nb-foot { flex:none; display:flex; flex-direction:column; gap:6px; min-height:150px; padding-top:10px; border-top:1px solid var(--nb-ink); position:relative; z-index:2; background:var(--nb-paper); }
.nb-foot-inner { display:grid; grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr); gap:20px; align-items:start; }
.nb-caption { margin:0; font:500 15px/1.45 var(--nb-sans); color:var(--nb-ink); }
.nb-inset { min-width:0; padding:8px 12px; border:1px solid var(--nb-line); border-left:3px solid var(--nb-ink); background:var(--nb-surface); }
.nb-inset ul { margin:6px 0 0; padding:0; list-style:none; font:11.5px/1.5 var(--nb-mono); }
.nb-inset li { white-space:pre; overflow:hidden; text-overflow:ellipsis; }
.nb-inset li b { display:inline-block; width:16px; font-weight:600; }
.nb-inset .op-add b, .nb-inset .op-add { color:var(--nb-green); }
.nb-inset .op-del b, .nb-inset .op-del { color:var(--nb-red); }
.nb-inset .op-mod b { color:var(--nb-blue); }
.nb-inset .op-msg b { color:var(--nb-faint); }
.nb-inset .op-eq b { color:var(--nb-faint); }
.nb-local { margin:auto 0 0; font:10.5px/1.3 var(--nb-mono); color:var(--nb-faint); }
.nb-fade-enter-active, .nb-fade-leave-active { transition:opacity .2s ease; }
.nb-fade-enter-from, .nb-fade-leave-to { opacity:0; }

.nb-notes { grid-area:notes; margin:0; padding:0 0 48vh; list-style:none; background-image:linear-gradient(to right, transparent 43px, var(--nb-margin-line) 43px, var(--nb-margin-line) 44px, transparent 44px); }
.nb-chapter { display:grid; grid-template-columns:44px minmax(0,1fr); column-gap:20px; padding:28px 0 40px; border-bottom:1px solid var(--nb-line); scroll-margin-top:40vh; color:var(--nb-muted); transition:color .3s ease; }
.nb-chapter.is-active { color:var(--nb-ink); }
.nb-note-margin { padding:2px 8px 0 0; font:500 12px/1 var(--nb-mono); color:var(--nb-faint); text-align:right; }
.is-active > .nb-note-margin { color:var(--nb-red); font-weight:700; }
.nb-chapter-body { min-width:0; max-width:36em; font-size:15px; line-height:1.6; }
.nb-chapter h2 { margin:6px 0 12px; padding:0; border:0; font:700 24px/1.2 var(--nb-sans); letter-spacing:-.015em; color:var(--nb-ink); }
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
.nb-glass { margin:0 0 6px; border:1px solid var(--nb-line); background:var(--nb-surface); border-radius:2px; }
.nb-glass summary { display:flex; gap:10px; justify-content:space-between; padding:6px 10px; cursor:pointer; font:600 11.5px/1.35 var(--nb-mono); color:var(--nb-ink); list-style-position:inside; }
.nb-glass summary i { font-style:normal; font-weight:400; color:var(--nb-faint); white-space:nowrap; }
.nb-glass-text { margin:0; padding:8px 10px; border-top:1px solid var(--nb-line); font-size:13.5px; line-height:1.55; }
.nb-wire { border-top:1px solid var(--nb-line); }
.nb-wire > p { display:flex; justify-content:space-between; gap:10px; margin:0; padding:6px 10px 0; font:600 11px/1.35 var(--nb-mono); }
.nb-wire > p i { font-style:normal; font-weight:400; color:var(--nb-faint); }
.nb-wire pre { margin:0; padding:6px 10px 10px; max-height:260px; overflow:auto; background:transparent; font:11px/1.45 var(--nb-mono); color:var(--nb-ink); }
.nb-diff { margin:0; padding:6px 10px 10px; list-style:none; font:11px/1.35 var(--nb-mono); }
.nb-diff li { display:grid; grid-template-columns:12px 1fr; column-gap:4px; padding:2px 0; }
.nb-diff li > span { overflow-wrap:anywhere; }
.nb-diff i { grid-column:2; font-style:normal; color:var(--nb-muted); font-size:10px; overflow-wrap:anywhere; }
.nb-diff .op-add b, .nb-diff .op-add > span { color:var(--nb-green); }
.nb-diff .op-del b, .nb-diff .op-del > span { color:var(--nb-red); }
.nb-diff .op-mod b { color:var(--nb-blue); }
.nb-quiet { color:var(--nb-faint); }
.nb-narrow-only { display:none; }
.nb-more { display:flex; flex-wrap:wrap; gap:6px 14px; margin:14px 0 0; font:600 12px/1.4 var(--nb-sans); color:var(--nb-faint); }
.nb-more a { color:var(--nb-blue); border-bottom:1px solid var(--nb-link-line); }
.nb-libraries { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); margin:16px 0 0; padding:0; list-style:none; border-top:1px solid var(--nb-line); }
.nb-libraries a { display:flex; justify-content:space-between; gap:10px; padding:12px 4px; border-bottom:1px solid var(--nb-line); font-weight:600; font-size:14px; }
.nb-libraries li:nth-child(odd) a { border-right:1px solid var(--nb-line); padding-right:14px; }
.nb-libraries li:nth-child(even) a { padding-left:14px; }
.nb-libraries code { color:var(--nb-faint); font-size:11px; font-weight:400; }

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
.is-reduced :deep(.nb-swap-enter-active), .is-reduced :deep(.nb-swap-leave-active), .is-reduced .nb-fade-enter-active, .is-reduced .nb-fade-leave-active { transition:none !important; }
@media (prefers-reduced-motion: reduce) {
  .nb-plane, .nb-device, .nb-host-rail, .nb-chapter, .nb-step h3, .nb-swap-enter-active, .nb-swap-leave-active, .nb-fade-enter-active, .nb-fade-leave-active { transition:none !important; }
  .nb-wires line { animation:none; }
}

@media (max-width:1279px) {
  .nb-run { grid-template-columns:minmax(0,1.4fr) minmax(330px,1fr); column-gap:32px; }
  .nb-nav-word { display:none; }
  .nb-foot-inner { grid-template-columns:minmax(0,1fr); gap:8px; }
}

/* Stacked layout: compact sticky stage holds only the nav and the devices; insets and details live in each note. */
@media (max-width:1023px), (max-height:619px) {
  .nb { padding:0 24px; }
  .nb-masthead span:nth-child(2) { display:none; }
  .nb-run { grid-template-columns:minmax(0,1fr); grid-template-areas:"cover" "stage" "notes"; }
  .nb-cover { padding:28px 0 22px; border-bottom:0; }
  .nb-cover h1 { font-size:clamp(34px,8vw,48px); }
  .nb-stage-col { display:contents; }
  .nb-stage { grid-area:stage; align-self:start; top:0; height:auto; z-index:5; gap:6px; padding:8px 0 6px; background:var(--nb-paper); border-bottom:1px solid var(--nb-ink); box-shadow:0 10px 18px -16px var(--nb-shadow); }
  .nb-stage-head { padding-bottom:6px; }
  .nb-stage-title { font-size:12px; }
  .nb-figure { flex:none; }
  .nb-plane { transition:none; }
  .nb-foot { display:none; }
  .nb-notes { padding-bottom:40vh; background-image:none; }
  .nb-chapter { grid-template-columns:30px minmax(0,1fr); column-gap:10px; scroll-margin-top:55vh; }
  .nb-note-margin { padding-right:0; text-align:left; font-size:11px; }
  .nb-step { min-height:40vh; }
  .nb-narrow-only { display:block; margin:0 0 10px; }
  .nb-section { grid-template-columns:minmax(0,1fr); row-gap:20px; padding:40px 0; }
  .nb-section-margin { text-align:left; padding:0; }
}
@media (min-width:960px) and (max-width:1023px) and (min-height:620px) { .nb-stage { top:var(--vp-nav-height, 64px); } }
@media (max-height:619px) { .nb-stage { position:relative; } }
@media (max-width:640px) {
  .nb-stage-head { flex-direction:column; align-items:stretch; gap:6px; }
  .nb-nav { justify-content:space-between; }
}
@media (max-width:520px) {
  .nb { padding:0 16px; }
  .nb-masthead { flex-direction:column; gap:2px; }
  .nb-nav-step { padding:0 8px; }
  .nb-nav ol button { width:30px; height:26px; font-size:10px; }
  .nb-chapter-body { font-size:14.5px; }
  .nb-chapter h2 { font-size:21px; }
  .nb-inset li { white-space:pre-wrap; overflow-wrap:anywhere; }
  .nb-glass summary, .nb-wire > p { flex-direction:column; gap:2px; }
  .nb-libraries { grid-template-columns:1fr; }
  .nb-libraries li a { border-right:0 !important; padding:12px 0 !important; }
  .nb-route-list a { grid-template-columns:1fr; gap:4px; }
}
</style>
