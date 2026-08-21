<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { ChatAction } from '../../../../types/action-origin.generated.js'
import { chatReducer } from '../../../../types/channels-chat/reducer.js'
import type { ChatState, ToolCallState } from '../../../../types/channels-chat/state.js'
import {
  MessageKind,
  ResponsePartKind,
  ToolCallConfirmationReason,
} from '../../../../types/channels-chat/state.js'
import { ActionType } from '../../../../types/common/actions.js'
import { SessionStatus } from '../../../../types/channels-session/state.js'

type FlowPhase = 'action' | 'reducer' | 'state'
type InspectorTab = 'action' | 'diff'

interface VisualDiffLine {
  kind: 'add' | 'remove' | 'context'
  text: string
}

interface FakeTool {
  name: 'read_file' | 'write_file'
  displayName: string
  intention: string
  path: string
  invocationMessage: string
  pastTenseMessage: string
}

const CHANNEL = 'ahp-chat:/demo'
const MAX_REMOVED_DIFF_LINES = 4
const MAX_ADDED_DIFF_LINES = 7

const tools: readonly FakeTool[] = [
  {
    name: 'read_file',
    displayName: 'Read file',
    intention: 'Inspect the current chat reducer',
    path: 'types/channels-chat/reducer.ts',
    invocationMessage: 'Reading types/channels-chat/reducer.ts',
    pastTenseMessage: 'Read the chat reducer',
  },
  {
    name: 'write_file',
    displayName: 'Write file',
    intention: 'Update the protocol walkthrough',
    path: 'docs/guide/state-model.md',
    invocationMessage: 'Writing docs/guide/state-model.md',
    pastTenseMessage: 'Updated the state model guide',
  },
]

const autoplayPrompts = [
  'Show me how chat state changes',
  'Inspect the reducer lifecycle',
  'Demonstrate a tool call',
]

const loremResponses = [
  'Lorem ipsum dolor sit amet; the resulting state remains deterministic.',
  'Lorem ipsum dolor sit amet, reduced through the same immutable state path.',
  'Lorem ipsum dolor sit amet. Every subscriber now sees the same turn.',
]

function compactDiffLines(
  lines: string[],
  limit: number,
  kind: VisualDiffLine['kind'],
): VisualDiffLine[] {
  if (lines.length <= limit) {
    return lines.map(text => ({ kind, text }))
  }

  return [
    ...lines.slice(0, limit - 1).map(text => ({ kind, text }) satisfies VisualDiffLine),
    { kind: 'context', text: `  … ${lines.length - limit + 1} more lines` },
  ]
}

function visualJsonDiff(before: unknown, after: unknown): VisualDiffLine[] {
  const beforeLines = JSON.stringify(before, null, 2).split('\n')
  const afterLines = JSON.stringify(after, null, 2).split('\n')
  let prefixLength = 0
  let suffixLength = 0

  while (
    prefixLength < beforeLines.length
    && prefixLength < afterLines.length
    && beforeLines[prefixLength] === afterLines[prefixLength]
  ) {
    prefixLength += 1
  }

  while (
    suffixLength < beforeLines.length - prefixLength
    && suffixLength < afterLines.length - prefixLength
    && beforeLines[beforeLines.length - suffixLength - 1]
      === afterLines[afterLines.length - suffixLength - 1]
  ) {
    suffixLength += 1
  }

  const beforeEnd = beforeLines.length - suffixLength
  const afterEnd = afterLines.length - suffixLength
  const lines: VisualDiffLine[] = []

  if (prefixLength > 0) {
    lines.push({
      kind: 'context',
      text: `  ${beforeLines[prefixLength - 1]}`,
    })
  }
  lines.push(...compactDiffLines(
    beforeLines.slice(prefixLength, beforeEnd),
    MAX_REMOVED_DIFF_LINES,
    'remove',
  ))
  lines.push(...compactDiffLines(
    afterLines.slice(prefixLength, afterEnd),
    MAX_ADDED_DIFF_LINES,
    'add',
  ))
  if (suffixLength > 0) {
    lines.push({
      kind: 'context',
      text: `  ${afterLines[afterEnd]}`,
    })
  }

  return lines
}

const initialState: ChatState = {
  resource: CHANNEL,
  title: 'Interactive protocol demo',
  status: SessionStatus.Idle,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  turns: [],
}

const initialAction = {
  type: ActionType.ChatActivityChanged,
  activity: 'Waiting for input',
} satisfies ChatAction

const initialReducedState = chatReducer(initialState, initialAction)

const chatState = ref<ChatState>(initialReducedState)
const inputText = ref('')
const lastAction = ref<ChatAction>(initialAction)
const lastDiff = ref<VisualDiffLine[]>(visualJsonDiff(initialState, initialReducedState))
const serverSeq = ref(1)
const flowPhase = ref<FlowPhase>('state')
const inspectorTab = ref<InspectorTab>('action')
const userInteracted = ref(false)

const responderTimers = new Set<number>()
const autoplayTimers = new Set<number>()
const flowTimers = new Set<number>()
let activeRunToken = 0
let autoplayPromptIndex = 0

const displayedTurn = computed(
  () => chatState.value.activeTurn ?? chatState.value.turns.at(-1),
)

const userMessage = computed(
  () => displayedTurn.value?.message.text ?? 'The autoplay demo will send a message...',
)

const assistantText = computed(() => {
  const turn = displayedTurn.value
  if (!turn) return 'Actions and reducer output will appear here.'

  const text = turn.responseParts
    .flatMap(part => part.kind === ResponsePartKind.Markdown ? [part.content] : [])
    .join('')

  if (text) return text
  return chatState.value.activeTurn ? 'Waiting for the fake responder...' : 'No assistant text.'
})

const toolCalls = computed<ToolCallState[]>(() => {
  const turn = displayedTurn.value
  if (!turn) return []
  return turn.responseParts.flatMap(
    part => part.kind === ResponsePartKind.ToolCall ? [part.toolCall] : [],
  )
})

const actionJson = computed(() => JSON.stringify({
  channel: CHANNEL,
  action: lastAction.value,
  serverSeq: serverSeq.value,
}, null, 2))

function clearTimers(timers: Set<number>): void {
  for (const timer of timers) window.clearTimeout(timer)
  timers.clear()
}

function schedule(timers: Set<number>, delay: number, callback: () => void): void {
  const timer = window.setTimeout(() => {
    timers.delete(timer)
    callback()
  }, delay)
  timers.add(timer)
}

function setFlowPhase(phase: FlowPhase): void {
  clearTimers(flowTimers)
  flowPhase.value = phase
  schedule(flowTimers, 90, () => {
    flowPhase.value = 'reducer'
  })
  schedule(flowTimers, 230, () => {
    flowPhase.value = 'state'
  })
}

function publishAction(action: ChatAction): void {
  const before = chatState.value
  const after = chatReducer(before, action)

  lastAction.value = action
  lastDiff.value = visualJsonDiff(before, after)
  chatState.value = after
  serverSeq.value += 1
  setFlowPhase('action')
}

function isCurrentRun(runToken: number, turnId: string): boolean {
  return runToken === activeRunToken && chatState.value.activeTurn?.id === turnId
}

function scheduleResponder(turnId: string, startedAt: number): void {
  clearTimers(responderTimers)
  const runToken = ++activeRunToken
  const tool = tools[Math.floor(Math.random() * tools.length)] ?? tools[0]
  const lorem = loremResponses[Math.floor(Math.random() * loremResponses.length)]
    ?? loremResponses[0]
  const partId = `md-${turnId}`
  const toolCallId = `tool-${turnId}`

  const dispatchIfCurrent = (action: ChatAction): void => {
    if (isCurrentRun(runToken, turnId)) publishAction(action)
  }

  schedule(responderTimers, 380, () => dispatchIfCurrent({
    type: ActionType.ChatResponsePart,
    turnId,
    part: {
      kind: ResponsePartKind.Markdown,
      id: partId,
      content: '',
    },
  }))

  schedule(responderTimers, 700, () => dispatchIfCurrent({
    type: ActionType.ChatDelta,
    turnId,
    partId,
    content: 'I will run this through the canonical chat reducer. ',
  }))

  schedule(responderTimers, 1080, () => dispatchIfCurrent({
    type: ActionType.ChatToolCallStart,
    turnId,
    toolCallId,
    toolName: tool.name,
    displayName: tool.displayName,
    intention: tool.intention,
  }))

  schedule(responderTimers, 1420, () => dispatchIfCurrent({
    type: ActionType.ChatToolCallReady,
    turnId,
    toolCallId,
    invocationMessage: tool.invocationMessage,
    toolInput: JSON.stringify({ path: tool.path }),
    confirmed: ToolCallConfirmationReason.NotNeeded,
  }))

  schedule(responderTimers, 1950, () => dispatchIfCurrent({
    type: ActionType.ChatToolCallComplete,
    turnId,
    toolCallId,
    result: {
      success: true,
      pastTenseMessage: tool.pastTenseMessage,
    },
  }))

  schedule(responderTimers, 2260, () => dispatchIfCurrent({
    type: ActionType.ChatDelta,
    turnId,
    partId,
    content: lorem,
  }))

  schedule(responderTimers, 2920, () => {
    if (!isCurrentRun(runToken, turnId)) return
    publishAction({
      type: ActionType.ChatTurnComplete,
      turnId,
      duration: Date.now() - startedAt,
    })
    scheduleAutoplay(4400)
  })
}

function submitMessage(explicitInteraction: boolean): void {
  const text = inputText.value.trim()
  if (!text || chatState.value.activeTurn) return
  if (explicitInteraction) markInputInteraction()

  const startedAt = Date.now()
  const turnId = `turn-${serverSeq.value}`
  inputText.value = ''

  publishAction({
    type: ActionType.ChatTurnStarted,
    turnId,
    startedAt: new Date(startedAt).toISOString(),
    message: {
      text,
      origin: { kind: MessageKind.User },
    },
  })
  scheduleResponder(turnId, startedAt)
}

function cancelTurn(): void {
  markInputInteraction()
  const turn = chatState.value.activeTurn
  if (!turn) return

  clearTimers(responderTimers)
  activeRunToken += 1
  publishAction({
    type: ActionType.ChatTurnCancelled,
    turnId: turn.id,
    duration: Math.max(0, Date.now() - Date.parse(turn.startedAt)),
  })
}

function markInputInteraction(): void {
  if (userInteracted.value) return
  userInteracted.value = true
  clearTimers(autoplayTimers)
}

function typeAutoplayPrompt(prompt: string, index = 0): void {
  if (userInteracted.value) return

  inputText.value = prompt.slice(0, index)
  if (index <= prompt.length) {
    schedule(autoplayTimers, 92, () => typeAutoplayPrompt(prompt, index + 1))
    return
  }

  schedule(autoplayTimers, 720, () => submitMessage(false))
}

function scheduleAutoplay(delay: number): void {
  if (
    userInteracted.value
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) return

  clearTimers(autoplayTimers)
  const prompt = autoplayPrompts[autoplayPromptIndex % autoplayPrompts.length]
    ?? autoplayPrompts[0]
  autoplayPromptIndex += 1
  schedule(autoplayTimers, delay, () => typeAutoplayPrompt(prompt))
}

onMounted(() => {
  scheduleAutoplay(2600)
})

onBeforeUnmount(() => {
  clearTimers(responderTimers)
  clearTimers(autoplayTimers)
  clearTimers(flowTimers)
})
</script>

<template>
  <section
    class="ph"
    aria-label="Interactive Agent Host Protocol chat reducer demo"
  >
    <header class="ph-toolbar" aria-hidden="true">
      <span class="ph-window-dot ph-window-dot--close"></span>
      <span class="ph-window-dot ph-window-dot--minimize"></span>
      <span class="ph-window-dot ph-window-dot--zoom"></span>
    </header>

    <div class="ph-workspace">
      <section class="ph-chat" aria-label="Demo chat">
        <div class="ph-transcript" aria-live="polite">
          <div class="ph-message ph-message--user">
            <span class="ph-avatar">U</span>
            <p>{{ userMessage }}</p>
          </div>

          <div class="ph-message ph-message--agent">
            <span class="ph-avatar">A</span>
            <div>
              <p>{{ assistantText }}<span v-if="chatState.activeTurn" class="ph-cursor"></span></p>
              <div
                v-for="toolCall in toolCalls"
                :key="toolCall.toolCallId"
                class="ph-tool"
              >
                <span class="ph-tool-icon" aria-hidden="true"></span>
                <strong>{{ toolCall.displayName }}</strong>
                <span>{{ toolCall.status }}</span>
              </div>
            </div>
          </div>
        </div>

        <form class="ph-composer" @submit.prevent="submitMessage(true)">
          <label class="ph-input-wrap">
            <span class="ph-visually-hidden">Send a chat message</span>
            <input
              v-model="inputText"
              type="text"
              placeholder="Send a protocol action..."
              :disabled="Boolean(chatState.activeTurn)"
              @focus="markInputInteraction"
              @input="markInputInteraction"
              @pointerdown="markInputInteraction"
            />
            <span v-if="!userInteracted && inputText" class="ph-autoplay">autoplay</span>
          </label>
          <button
            v-if="chatState.activeTurn"
            class="ph-send ph-send--cancel"
            type="button"
            @click="cancelTurn"
          >
            Cancel
          </button>
          <button
            v-else
            class="ph-send"
            type="submit"
            :disabled="!inputText.trim()"
          >
            Send
          </button>
        </form>
      </section>

      <aside class="ph-inspector" aria-label="Protocol action and state diff">
        <div class="ph-flow">
          <span :class="{ active: flowPhase === 'action' }">action</span>
          <i></i>
          <span :class="{ active: flowPhase === 'reducer' }">chatReducer</span>
          <i></i>
          <span :class="{ active: flowPhase === 'state' }">state</span>
        </div>

        <div class="ph-inspector-tabs" aria-label="Inspector view">
          <button
            type="button"
            :aria-pressed="inspectorTab === 'action'"
            @click="inspectorTab = 'action'"
          >
            Action
          </button>
          <button
            type="button"
            :aria-pressed="inspectorTab === 'diff'"
            @click="inspectorTab = 'diff'"
          >
            State diff
          </button>
        </div>

        <section
          class="ph-json-panel"
          :class="{ 'ph-json-panel--mobile-hidden': inspectorTab !== 'action' }"
        >
          <div class="ph-json-heading">
            <span>published action</span>
            <code>#{{ serverSeq }}</code>
          </div>
          <pre>{{ actionJson }}</pre>
        </section>

        <section
          class="ph-json-panel ph-json-panel--diff"
          :class="{ 'ph-json-panel--mobile-hidden': inspectorTab !== 'diff' }"
        >
          <div class="ph-json-heading">
            <span>state diff</span>
            <code>reducer output</code>
          </div>
          <div class="ph-diff" role="log" aria-label="JSON state line changes">
            <div
              v-for="(line, index) in lastDiff"
              :key="`${serverSeq}-${index}`"
              class="ph-diff-line"
              :class="`ph-diff-line--${line.kind}`"
            >
              <span aria-hidden="true">{{ line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ' }}</span>
              <code>{{ line.text }}</code>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.ph {
  --ph-blue: #4f73ed;
  --ph-green: #138761;
  --ph-purple: #7c57c2;
  --ph-red: #b64747;
  --ph-surface: color-mix(in srgb, var(--vp-c-bg) 95%, var(--vp-c-brand-1));
  --ph-surface-soft: color-mix(in srgb, var(--vp-c-bg-soft) 95%, var(--vp-c-brand-1));
  --ph-border: color-mix(in srgb, var(--vp-c-text-1) 13%, transparent);

  position: relative;
  width: min(100%, 610px);
  overflow: hidden;
  border: 1px solid var(--ph-border);
  border-radius: 18px;
  background: var(--ph-surface);
  box-shadow:
    0 28px 75px color-mix(in srgb, #000 20%, transparent),
    inset 0 1px color-mix(in srgb, #fff 6%, transparent);
  text-align: left;
}

:global(.dark) .ph {
  --ph-blue: #7891f5;
  --ph-green: #4ebd91;
  --ph-purple: #a587e2;
  --ph-red: #e06c75;
  --ph-surface: #191b23;
  --ph-surface-soft: #20232d;
  --ph-border: color-mix(in srgb, #fff 12%, transparent);
}

.ph-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 27px;
  padding: 0 10px;
  border-bottom: 1px solid var(--ph-border);
}

.ph-window-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.ph-window-dot--close { background: #ed6a5e; }
.ph-window-dot--minimize { background: #f4bf4f; }
.ph-window-dot--zoom { background: #61c454; }

.ph-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  height: 340px;
  min-height: 0;
}

.ph-chat {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--ph-border);
}

.ph-transcript {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 14px 12px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.ph-message {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.ph-message p {
  min-height: 31px;
  margin: 0;
  font-size: 10px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.ph-message--user p {
  display: inline-block;
  justify-self: start;
  padding: 8px 10px;
  border-radius: 4px 10px 10px 10px;
  background: color-mix(in srgb, var(--ph-blue) 10%, transparent);
  color: var(--vp-c-text-1);
}

.ph-avatar {
  display: grid;
  place-items: center;
  width: 23px;
  height: 23px;
  border: 1px solid var(--ph-border);
  border-radius: 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
  color: var(--vp-c-text-2);
  background: var(--ph-surface-soft);
}

.ph-message--agent .ph-avatar {
  border-color: color-mix(in srgb, var(--ph-purple) 45%, var(--ph-border));
  color: var(--ph-purple);
}

.ph-cursor {
  display: inline-block;
  width: 5px;
  height: 10px;
  margin-left: 3px;
  vertical-align: -1px;
  background: var(--ph-blue);
  animation: phCursor 1s steps(1) infinite;
}

.ph-tool {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  padding: 7px 8px;
  border: 1px solid var(--ph-border);
  border-radius: 7px;
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
  color: var(--vp-c-text-3);
  background: var(--ph-surface-soft);
}

.ph-tool strong {
  overflow: hidden;
  color: var(--vp-c-text-2);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ph-tool-icon {
  width: 7px;
  height: 7px;
  border: 1px solid var(--ph-purple);
  transform: rotate(45deg);
}

.ph-composer {
  display: flex;
  gap: 7px;
  padding: 10px;
  border-top: 1px solid var(--ph-border);
}

.ph-input-wrap {
  position: relative;
  min-width: 0;
  flex: 1;
}

.ph-input-wrap input {
  width: 100%;
  height: 34px;
  padding: 0 66px 0 10px;
  border: 1px solid var(--ph-border);
  border-radius: 8px;
  outline: none;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-base);
  font-size: 10px;
  background: var(--ph-surface-soft);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.ph-input-wrap input:focus {
  border-color: var(--ph-blue);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ph-blue) 12%, transparent);
}

.ph-input-wrap input:disabled {
  opacity: .58;
}

.ph-autoplay {
  position: absolute;
  top: 50%;
  right: 8px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 7px;
  text-transform: uppercase;
  letter-spacing: .06em;
  transform: translateY(-50%);
}

.ph-send {
  min-width: 54px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--ph-blue) 64%, transparent);
  border-radius: 8px;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  background: var(--ph-blue);
  cursor: pointer;
}

.ph-send:disabled {
  border-color: var(--ph-border);
  color: var(--vp-c-text-3);
  background: var(--ph-surface-soft);
  cursor: default;
}

.ph-send--cancel {
  border-color: color-mix(in srgb, var(--ph-red) 64%, transparent);
  background: var(--ph-red);
}

.ph-inspector {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  background: color-mix(in srgb, var(--ph-surface-soft) 72%, transparent);
}

.ph-flow {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 9px;
  border-bottom: 1px solid var(--ph-border);
}

.ph-flow span {
  font-family: var(--vp-font-family-mono);
  font-size: 7px;
  color: var(--vp-c-text-3);
  transition: color 120ms ease;
}

.ph-flow span.active {
  color: var(--ph-blue);
}

.ph-flow i {
  flex: 1;
  height: 1px;
  margin: 0 5px;
  background: var(--ph-border);
}

.ph-inspector-tabs {
  display: none;
}

.ph-json-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 9px;
  border-bottom: 1px solid var(--ph-border);
}

.ph-json-panel:last-child {
  border-bottom: 0;
}

.ph-json-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 7px;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  letter-spacing: .08em;
}

.ph-json-heading code {
  color: var(--ph-blue);
}

.ph-json-panel--diff .ph-json-heading code {
  color: var(--ph-green);
}

.ph-json-panel pre,
.ph-diff {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 7px;
  line-height: 1.45;
  background: color-mix(in srgb, var(--vp-c-bg) 66%, transparent);
  scrollbar-width: thin;
}

.ph-diff {
  padding: 6px 0;
}

.ph-diff-line {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  min-height: 13px;
  padding: 0 7px;
  font-family: var(--vp-font-family-mono);
  font-size: 7px;
  line-height: 1.55;
}

.ph-diff-line > span {
  user-select: none;
}

.ph-diff-line code {
  overflow: hidden;
  color: inherit;
  text-overflow: ellipsis;
  white-space: pre;
}

.ph-diff-line--add {
  color: color-mix(in srgb, var(--ph-green) 82%, var(--vp-c-text-1));
  background: color-mix(in srgb, var(--ph-green) 10%, transparent);
}

.ph-diff-line--remove {
  color: color-mix(in srgb, var(--ph-red) 82%, var(--vp-c-text-1));
  background: color-mix(in srgb, var(--ph-red) 10%, transparent);
}

.ph-diff-line--context {
  color: var(--vp-c-text-3);
}

.ph-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes phCursor {
  0%, 45% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

@media (max-width: 959px) {
  .ph {
    width: min(100%, 560px);
    margin: 22px auto 0;
  }
}

@media (max-width: 639px) {
  .ph {
    width: 320px;
    margin-top: 40px;
  }

  .ph-toolbar {
    min-height: 25px;
  }

  .ph-workspace {
    grid-template-columns: 1fr;
    height: auto;
    min-height: auto;
  }

  .ph-chat {
    min-height: 188px;
    border-right: 0;
    border-bottom: 1px solid var(--ph-border);
  }

  .ph-transcript {
    gap: 7px;
    padding: 8px 10px;
  }

  .ph-message {
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 6px;
  }

  .ph-avatar {
    width: 19px;
    height: 19px;
  }

  .ph-message p {
    min-height: 0;
    font-size: 9px;
  }

  .ph-message--user p {
    padding: 6px 8px;
  }

  .ph-tool {
    margin-top: 5px;
    padding: 5px 7px;
  }

  .ph-composer {
    padding: 7px;
  }

  .ph-input-wrap input,
  .ph-send {
    height: 31px;
  }

  .ph-flow {
    min-height: 28px;
  }

  .ph-inspector-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 6px;
  }

  .ph-inspector-tabs button {
    min-height: 25px;
    border: 0;
    border-radius: 5px;
    color: var(--vp-c-text-3);
    font-family: var(--vp-font-family-mono);
    font-size: 8px;
    background: transparent;
  }

  .ph-inspector-tabs button[aria-pressed='true'] {
    color: var(--vp-c-text-1);
    background: var(--ph-surface);
  }

  .ph-json-panel {
    min-height: 92px;
    max-height: 92px;
    padding: 7px;
  }

  .ph-json-panel--mobile-hidden {
    display: none;
  }

  .ph-json-panel pre,
  .ph-diff-line {
    font-size: 6.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ph-cursor {
    animation: none;
  }
}
</style>
