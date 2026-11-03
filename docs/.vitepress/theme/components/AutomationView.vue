<script setup lang="ts">
import { computed } from 'vue'
import { AutomationRunOriginKind } from '../../../../types/channels-automation-run/state.js'
import type { AutomationRunLifecycle, AutomationRunState } from '../../../../types/channels-automation-run/state.js'
import { AutomationTriggerKind } from '../../../../types/channels-automation/state.js'
import type { AutomationState } from '../../../../types/channels-automation/state.js'
import type { AutomationSessionOrigin } from '../../../../types/channels-session/state.js'

const props = defineProps<{
  variant: 'desktop' | 'tablet' | 'phone'
  /** Catalogue mirror (desktop) or a single run channel (tablet). */
  catalogue?: AutomationState
  requested?: boolean
  run?: AutomationRunState
  origin?: AutomationSessionOrigin
}>()

const started = (lifecycle: AutomationRunLifecycle) => 'startedAt' in lifecycle ? lifecycle.startedAt : undefined
const time = (iso?: string) => iso ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}Z` : '—'
const entry = computed(() => props.catalogue?.entries[0])
const schedule = computed(() => {
  const trigger = entry.value?.definition.triggers[0]
  return trigger?.kind === AutomationTriggerKind.Schedule ? `${trigger.schedule.expression} · ${trigger.schedule.timeZone}` : ''
})
const tail = (uri: string) => uri.slice(uri.indexOf(':/') + 2)
</script>

<template>
  <div class="auto" :class="{ 'is-small': variant !== 'desktop' }">
    <template v-if="entry">
      <p class="auto-title">Automations</p>
      <article class="auto-card">
        <header>
          <b>{{ entry.definition.title }}</b>
          <span class="auto-toggle" :class="{ 'is-on': entry.definition.enabled }">{{ entry.definition.enabled ? 'Enabled' : 'Paused' }}</span>
        </header>
        <p class="auto-prompt">“{{ entry.definition.message.text }}”</p>
        <dl>
          <div><dt>Schedule</dt><dd>{{ schedule }}</dd></div>
          <div><dt>Next run</dt><dd>{{ time(entry.nextRunAt) }}</dd></div>
        </dl>
        <div class="auto-actions"><span class="auto-run" :class="{ 'is-pressed': requested }">{{ requested ? 'Run requested' : 'Run now' }}</span></div>
      </article>
      <p class="auto-label">Recent runs · {{ entry.runCount }}</p>
      <TransitionGroup tag="ol" name="auto-row" class="auto-runs">
        <li v-for="item in entry.runs" :key="item.resource">
          <span class="auto-status" :class="`is-${item.lifecycle.status}`">{{ item.lifecycle.status }}</span>
          <span>{{ item.origin.kind === AutomationRunOriginKind.Manual ? 'Manual' : 'Schedule' }}</span>
          <code>{{ tail(item.resource) }}</code>
          <time>{{ time(started(item.lifecycle) ?? item.lifecycle.createdAt) }}</time>
        </li>
      </TransitionGroup>
    </template>
    <template v-else-if="run">
      <p class="auto-title">Run <span>{{ tail(run.resource) }}</span></p>
      <p class="auto-big"><span class="auto-status" :class="`is-${run.lifecycle.status}`">{{ run.lifecycle.status }}</span> {{ run.origin.kind === AutomationRunOriginKind.Manual ? 'Manual run' : 'Scheduled run' }}</p>
      <dl class="auto-run-facts">
        <div><dt>Started</dt><dd>{{ time(started(run.lifecycle)) }}</dd></div>
        <div><dt>Session</dt><dd>{{ run.primarySession ? tail(run.primarySession) : 'creating…' }}</dd></div>
      </dl>
      <div v-if="origin && run.primarySession" class="auto-session">
        <span>Fresh session</span>
        <code>origin.kind: "{{ origin.kind }}"</code>
        <p>Run the chat reducer tests and summarise any failures.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.auto { display:flex; flex-direction:column; gap:10px; height:100%; padding:14px 16px 12px; font:13px/1.45 var(--nb-sans); color:var(--nb-ink); }
.auto-title { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin:0; padding-bottom:8px; border-bottom:1px solid var(--nb-line-soft); font-weight:700; font-size:14px; }
.auto-title span { font:400 10.5px/1 var(--nb-mono); color:var(--nb-faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.auto-card { display:grid; gap:8px; padding:11px 12px; border:1px solid var(--nb-line); border-radius:8px; background:var(--nb-raised); }
.auto-card header { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.auto-toggle { padding:2px 8px; border:1px solid var(--nb-line); border-radius:10px; font:500 10px/1.3 var(--nb-mono); color:var(--nb-muted); }
.auto-toggle.is-on { border-color:var(--nb-green); color:var(--nb-green); }
.auto-prompt { margin:0; font-size:12px; color:var(--nb-body); }
.auto-card dl, .auto-run-facts { display:grid; gap:4px; margin:0; font:11px/1.35 var(--nb-mono); }
.auto-card dl div, .auto-run-facts div { display:flex; gap:10px; }
.auto-card dt, .auto-run-facts dt { width:70px; flex:none; color:var(--nb-faint); }
.auto-card dd, .auto-run-facts dd { margin:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.auto-actions { display:flex; justify-content:flex-end; }
.auto-run { padding:4px 11px; border:1px solid var(--nb-ink); border-radius:5px; font-size:11.5px; font-weight:600; transition:background .3s, color .3s; }
.auto-run.is-pressed { background:var(--nb-ink); color:var(--nb-surface); }
.auto-label { margin:2px 0 0; font:600 9.5px/1 var(--nb-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--nb-faint); }
.auto-runs { display:grid; gap:0; margin:0; padding:0; list-style:none; font-size:11.5px; }
.auto-runs li { display:grid; grid-template-columns:76px 64px minmax(0,1fr) auto; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--nb-selected); }
.auto-runs code { font:10.5px/1.3 var(--nb-mono); color:var(--nb-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.auto-runs time { font:10.5px/1.3 var(--nb-mono); color:var(--nb-faint); }
.auto-status { justify-self:start; padding:1px 6px; border-radius:4px; font:600 10px/1.4 var(--nb-mono); background:var(--nb-selected); color:var(--nb-muted); }
.auto-status.is-pending { background:var(--nb-warning-bg); color:var(--nb-warning-text); }
.auto-status.is-running { background:var(--nb-info-bg); color:var(--nb-blue); }
.auto-status.is-completed { background:var(--nb-success-bg); color:var(--nb-green); }
.auto-row-enter-active { transition:opacity .4s ease .25s, transform .4s ease .25s; }
.auto-row-enter-from { opacity:0; transform:translateY(-6px); }
.auto-row-move { transition:transform .4s ease; }
.auto-big { display:flex; align-items:center; gap:6px; margin:0; font-weight:600; }
.auto-session { display:grid; gap:4px; margin-top:auto; padding:8px; border:1px solid var(--nb-line); border-left:3px solid var(--nb-blue); border-radius:6px; background:var(--nb-raised); }
.auto-session span { font:600 9px/1 var(--nb-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--nb-faint); }
.auto-session code { font:10px/1.3 var(--nb-mono); color:var(--nb-blue); }
.auto-session p { margin:0; }
.is-small { gap:7px; padding:10px 10px 8px; font-size:10.5px; }
.is-small .auto-title { font-size:11px; padding-bottom:5px; flex-direction:column; gap:3px; }
.is-small .auto-title span { font-size:8.5px; max-width:100%; }
.is-small .auto-run-facts { font-size:9px; }
.is-small .auto-run-facts dt { width:44px; }
.is-small .auto-session { padding:5px 6px; }
.is-small .auto-session code { font-size:8.5px; }
@media (prefers-reduced-motion: reduce) { .auto-run, .auto-row-enter-active, .auto-row-move { transition:none; } }
</style>
