<script setup lang="ts">
import { computed } from 'vue'
import { ResponsePartKind, ToolCallStatus } from '../../../../types/channels-chat/state.js'
import type { StringOrMarkdown } from '../../../../types/common/state.js'
import { ActionType } from '../../../../types/common/actions.js'
import { optimisticState } from '../notebook.js'
import type { DeviceMirror } from '../notebook.js'

const props = defineProps<{
  mirror: DeviceMirror
  variant: 'desktop' | 'tablet' | 'phone'
}>()

const plain = (value: StringOrMarkdown): string => typeof value === 'string' ? value : value.markdown
const state = computed(() => optimisticState(props.mirror))
const turn = computed(() => state.value.activeTurn ?? state.value.turns.at(-1))
const finished = computed(() => {
  const value = turn.value
  return value && 'state' in value ? { state: value.state, seconds: ((value.duration ?? 0) / 1000).toFixed(1) } : undefined
})
const userPending = computed(() => props.mirror.pending.some(entry => entry.action.type === ActionType.ChatTurnStarted))
const approvalPending = computed(() => props.mirror.pending.some(entry => entry.action.type === ActionType.ChatToolCallConfirmed))
const text = computed(() => turn.value?.responseParts.flatMap(part => part.kind === ResponsePartKind.Markdown ? [part.content] : []).join('') ?? '')
const tool = computed(() => {
  for (const part of turn.value?.responseParts ?? []) {
    if (part.kind !== ResponsePartKind.ToolCall) continue
    const call = part.toolCall
    const detail = call.status === ToolCallStatus.Completed
      ? plain(call.pastTenseMessage)
      : 'invocationMessage' in call && call.invocationMessage ? plain(call.invocationMessage) : call.displayName
    return { name: call.displayName, status: call.status, detail: detail.replace(/`/g, '') }
  }
  return undefined
})
const statusLabel: Partial<Record<ToolCallStatus, string>> = {
  [ToolCallStatus.Streaming]: 'Preparing',
  [ToolCallStatus.PendingConfirmation]: 'Needs approval',
  [ToolCallStatus.Running]: 'Running',
  [ToolCallStatus.Completed]: 'Completed',
}
</script>

<template>
  <div class="chat" :class="{ 'is-small': variant !== 'desktop' }">
    <p class="chat-title">{{ state.title }}</p>
    <div class="chat-log">
      <p v-if="!turn" class="chat-empty">No turns yet. Subscribed at #40.</p>
      <template v-else>
        <div class="chat-msg chat-user" :class="{ 'is-pending': userPending }">
          <span v-if="userPending" class="chat-who">Pending</span>
          <p>{{ turn.message.text }}</p>
        </div>
        <div v-if="text || tool" class="chat-msg chat-agent">
          <span class="chat-who">Agent</span>
          <p v-if="text">{{ text }}</p>
          <div v-if="tool" class="chat-tool" :class="[`tool-${tool.status}`, { 'is-pending': approvalPending }]">
            <span class="chat-tool-name">{{ tool.name }}<b>{{ approvalPending ? 'Approving…' : statusLabel[tool.status] ?? tool.status }}</b></span>
            <code>{{ tool.detail }}</code>
            <span v-if="tool.status === 'pending-confirmation' && !approvalPending" class="chat-approve"><span>Deny</span><span class="is-primary">Approve</span></span>
          </div>
        </div>
        <p v-if="finished" class="chat-done">Turn {{ finished.state }} · {{ finished.seconds }}s</p>
        <p v-else-if="state.activeTurn && !text" class="chat-empty">{{ userPending ? 'Waiting for host echo…' : 'Agent is thinking…' }}</p>
      </template>
    </div>
    <div v-if="variant !== 'phone'" class="chat-composer">Message the agent…</div>
  </div>
</template>

<style scoped>
.chat { position:relative; display:flex; flex-direction:column; gap:10px; height:100%; min-width:0; padding:14px 16px 12px; font:13px/1.45 var(--nb-sans); }
.chat-title { flex:none; margin:0; padding-bottom:8px; border-bottom:1px solid var(--nb-line-soft); font-weight:700; font-size:14px; }
/* Small screens keep the newest content in view, like a real chat log. */
.chat-log { display:flex; flex-direction:column; gap:10px; flex:1; min-height:0; overflow:hidden; }
.is-small .chat-log { justify-content:flex-end; mask-image:linear-gradient(to bottom, transparent, black 22px); }
.chat-msg { flex:none; }
.chat-msg p { margin:0; }
.chat-who { display:block; margin-bottom:3px; font:600 9.5px/1 var(--nb-sans); letter-spacing:.06em; text-transform:uppercase; color:var(--nb-faint); }
.chat-user { align-self:flex-end; max-width:82%; padding:8px 11px; border-radius:12px 12px 4px 12px; background:var(--nb-selected); transition:opacity .35s ease; }
.chat-user .chat-who { color:var(--nb-amber); text-align:right; }
.is-pending { opacity:.55; outline:1px dashed var(--nb-faint); outline-offset:2px; }
.chat-agent { max-width:94%; }
.chat-tool { display:grid; gap:4px; margin-top:8px; padding:8px 10px; border:1px solid var(--nb-line); border-left:3px solid var(--nb-blue); border-radius:6px; background:var(--nb-raised); transition:opacity .35s ease, border-color .35s ease; }
.chat-tool.tool-pending-confirmation { border-left-color:var(--nb-amber); }
.chat-tool.tool-completed { border-left-color:var(--nb-green); }
.chat-tool-name { display:flex; justify-content:space-between; gap:8px; font-weight:600; font-size:12px; }
.chat-tool-name b { font:500 10px/1.4 var(--nb-mono); color:var(--nb-muted); }
.chat-tool code { font:11px/1.35 var(--nb-mono); color:var(--nb-body); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.chat-approve { display:flex; gap:6px; justify-content:flex-end; margin-top:2px; }
.chat-approve span { padding:3px 10px; border:1px solid var(--nb-line); border-radius:5px; font-size:11px; font-weight:500; }
.chat-approve .is-primary { background:var(--nb-ink); border-color:var(--nb-ink); color:var(--nb-surface); }
.chat-done { flex:none; margin:0; font:11px/1 var(--nb-mono); color:var(--nb-green); }
.chat-empty { flex:none; margin:0; font-size:12px; color:var(--nb-faint); font-style:italic; }
.chat-composer { flex:none; padding:8px 10px; border:1px solid var(--nb-line); border-radius:8px; background:var(--nb-raised); color:var(--nb-faint); font-size:12px; }
.is-small { gap:7px; padding:10px 10px 8px; font-size:10.5px; }
.is-small .chat-log { gap:7px; }
.is-small .chat-title { font-size:11px; padding-bottom:5px; }
.is-small .chat-who { font-size:8px; }
.is-small .chat-tool { padding:5px 6px; margin-top:5px; }
.is-small .chat-tool-name { font-size:10px; flex-direction:column; gap:2px; }
.is-small .chat-tool code { font-size:9px; }
.is-small .chat-composer { font-size:10px; padding:5px 7px; }
.is-small .chat-user { max-width:92%; padding:6px 8px; }
.is-small .chat-approve span { padding:3px 6px; font-size:9.5px; }
@media (prefers-reduced-motion: reduce) { .chat-user, .chat-tool { transition:none; } }
</style>
