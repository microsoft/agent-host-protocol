<script setup lang="ts">
import { computed } from 'vue'
import { TerminalClaimKind } from '../../../../types/channels-terminal/state.js'
import type { TerminalState } from '../../../../types/channels-terminal/state.js'

const props = defineProps<{
  variant: 'desktop' | 'tablet' | 'phone'
  state: TerminalState
  me: string
}>()

const owner = computed(() => {
  const claim = props.state.claim
  if (claim.kind === TerminalClaimKind.Client) return { label: claim.clientId === props.me ? 'You (this client)' : `Client ${claim.clientId}`, kind: 'client' }
  if (claim.toolCallId) return { label: `Tool call ${claim.toolCallId} · ${claim.turnId}`, kind: 'tool' }
  return { label: 'Session (background)', kind: 'session' }
})
const lines = computed(() => props.state.content.flatMap(part => part.type === 'command'
  ? [{ key: part.commandId, prompt: part.commandLine, output: part.output.trim(), done: part.isComplete, exit: part.exitCode }]
  : [{ key: part.value, prompt: '', output: part.value.trim(), done: true, exit: undefined }]))
</script>

<template>
  <div class="term" :class="{ 'is-small': variant !== 'desktop' }">
    <p class="term-title">{{ state.title }} <span>{{ state.lifecycle.status }}</span></p>
    <p class="term-owner" :class="`is-${owner.kind}`"><span>Claimed by</span> {{ owner.label }}</p>
    <div class="term-screen">
      <TransitionGroup name="term-line">
        <div v-for="line in lines" :key="line.key" class="term-cmd">
          <p v-if="line.prompt" class="term-prompt"><b>$</b> {{ line.prompt }}<i v-if="line.done">exit {{ line.exit }}</i></p>
          <pre>{{ line.output }}</pre>
        </div>
      </TransitionGroup>
      <p class="term-cursor"><b>$</b> <span aria-hidden="true">▍</span></p>
    </div>
  </div>
</template>

<style scoped>
.term { display:flex; flex-direction:column; gap:8px; height:100%; padding:14px 16px 12px; font:13px/1.45 var(--nb-sans); color:var(--nb-ink); }
.term-title { display:flex; justify-content:space-between; margin:0; padding-bottom:8px; border-bottom:1px solid var(--nb-line-soft); font-weight:700; font-size:14px; }
.term-title span { font:400 10.5px/1.4 var(--nb-mono); color:var(--nb-green); }
.term-owner { margin:0; padding:5px 8px; border-left:3px solid var(--nb-blue); border-radius:0 5px 5px 0; background:var(--nb-soft); font:11px/1.3 var(--nb-mono); transition:border-color .35s; }
.term-owner span { color:var(--nb-faint); margin-right:6px; }
.term-owner.is-session { border-left-color:var(--nb-amber); }
.term-owner.is-client { border-left-color:var(--nb-red); }
.term-screen { flex:1; min-height:0; overflow:hidden; padding:10px 12px; border:1px solid var(--nb-line); border-radius:8px; background:var(--nb-terminal-bg); color:var(--nb-terminal-text); font:11px/1.45 var(--nb-mono); display:flex; flex-direction:column; justify-content:flex-end; }
.term-cmd + .term-cmd { margin-top:8px; }
.term-prompt { display:flex; gap:6px; margin:0; color:var(--nb-terminal-bright); }
.term-prompt b, .term-cursor b { color:var(--nb-terminal-green); font-weight:500; }
.term-prompt i { margin-left:auto; font-style:normal; color:var(--nb-terminal-green); }
.term-screen pre { margin:2px 0 0; padding:0; background:none; font:inherit; color:var(--nb-terminal-muted); white-space:pre-wrap; overflow-wrap:anywhere; }
.term-cursor { margin:6px 0 0; }
.term-cursor span { animation:term-blink 1.1s steps(1) infinite; }
@keyframes term-blink { 50% { opacity:0; } }
.term-line-enter-active { transition:opacity .4s ease .2s; }
.term-line-enter-from { opacity:0; }
.is-small { gap:5px; padding:8px 8px 6px; font-size:10px; }
.is-small .term-title { font-size:10.5px; padding-bottom:4px; }
.is-small .term-owner { font-size:8px; padding:3px 5px; }
.is-small .term-owner span { display:none; }
.is-small .term-screen { padding:6px; font-size:7.5px; mask-image:linear-gradient(to bottom, transparent, black 20px); }
@media (prefers-reduced-motion: reduce) { .term-cursor span { animation:none; } .term-owner, .term-line-enter-active { transition:none; } }
</style>
