<script setup lang="ts">
import { computed } from 'vue'
import type { LinkState } from '../notebook.js'
import type { AppId } from '../notebook-story.js'

const props = defineProps<{
  variant: 'desktop' | 'tablet' | 'phone'
  link: LinkState
  seq?: number
  /** Shown instead of a seq badge, e.g. the negotiated protocol version. */
  badge?: string
  /** Illustrative client language for the final chapter. */
  tag?: string
  focused: boolean
  received: boolean
  apps?: { id: AppId; label: string; active: boolean }[]
  banner?: string
}>()

const linkLabel = computed(() => props.link === 'connected' ? 'live' : props.link === 'offline' ? 'offline' : 'syncing')
</script>

<template>
  <div class="dev" :class="[`dev-${variant}`, `is-${link}`, { 'is-focused': focused, 'is-received': received }]">
    <div class="dev-bar">
      <span v-if="!(tag && variant === 'phone')" class="dev-name">{{ variant }}</span>
      <span v-if="tag" class="dev-tag">{{ tag }}</span>
      <span class="dev-link"><i aria-hidden="true"></i>{{ linkLabel }}</span>
      <span v-if="seq !== undefined" :key="seq" class="dev-seq">#{{ seq }}</span>
      <span v-else-if="badge" class="dev-seq">{{ badge }}</span>
    </div>
    <div class="dev-body">
      <nav v-if="apps" class="dev-rail" aria-hidden="true">
        <span class="dev-rail-head">Local agent host</span>
        <TransitionGroup name="dev-app">
          <span v-for="app in apps" :key="app.id" class="dev-app" :class="{ 'is-current': app.active }">{{ app.label }}</span>
        </TransitionGroup>
      </nav>
      <div class="dev-view">
        <slot />
      </div>
    </div>
    <Transition name="dev-banner">
      <div v-if="banner" class="dev-banner">{{ banner }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.dev { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; background:var(--nb-surface); border:1px solid var(--nb-device-border); border-radius:10px; box-shadow:0 1px 0 var(--nb-device-border), 0 18px 36px -24px var(--nb-shadow); color:var(--nb-ink); }
.dev.is-focused { box-shadow:0 0 0 3px var(--nb-focus), 0 1px 0 var(--nb-device-border), 0 18px 36px -24px var(--nb-shadow); }
.dev.is-offline, .dev.is-reconnecting { border-style:dashed; }
.dev-bar { display:flex; align-items:center; gap:8px; padding:0 10px; height:26px; border-bottom:1px solid var(--nb-line); font:600 10px/1 var(--nb-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--nb-muted); flex:none; }
.dev-name { color:var(--nb-ink); }
.dev-tag { padding:2px 5px; border-radius:2px; background:var(--nb-ink); color:var(--nb-surface); text-transform:none; letter-spacing:0; }
.dev-link { display:inline-flex; align-items:center; gap:5px; margin-left:auto; text-transform:none; letter-spacing:0; font-weight:500; white-space:nowrap; }
.dev-link i { width:6px; height:6px; border-radius:50%; background:var(--nb-green); }
.is-offline .dev-link i { background:var(--nb-red); }
.is-reconnecting .dev-link i { background:var(--nb-amber); }
.dev-seq { padding:2px 5px; border:1px solid var(--nb-line); border-radius:3px; color:var(--nb-ink); font-variant-numeric:tabular-nums; text-transform:none; letter-spacing:0; }
.is-received .dev-seq { animation:dev-seq 1.1s ease-out; }
@keyframes dev-seq { 0% { background:var(--nb-ink); color:var(--nb-surface); } 100% { background:transparent; color:var(--nb-ink); } }
.dev-body { position:relative; display:flex; flex:1; min-height:0; }
.dev-rail { display:flex; flex-direction:column; gap:2px; width:132px; flex:none; padding:12px 8px; border-right:1px solid var(--nb-line-soft); background:var(--nb-soft); font:12px/1.3 var(--nb-sans); color:var(--nb-muted); }
.dev-rail-head { margin:0 0 8px 6px; font:600 9px/1.2 var(--nb-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--nb-faint); }
.dev-app { padding:6px 8px; border-radius:4px; }
.dev-app.is-current { background:var(--nb-selected); color:var(--nb-ink); font-weight:600; }
.dev-app-enter-active, .dev-app-leave-active { transition:opacity .35s ease .2s; }
.dev-app-enter-from, .dev-app-leave-to { opacity:0; }
.dev-view { position:relative; flex:1; min-width:0; min-height:0; overflow:hidden; }
.dev-banner { position:absolute; left:0; right:0; bottom:0; padding:6px 10px; background:var(--nb-ink); color:var(--nb-paper); font:10.5px/1.3 var(--nb-mono); }
.is-reconnecting .dev-banner { background:var(--nb-warning-bg); color:var(--nb-warning-text); }
.dev-banner-enter-active, .dev-banner-leave-active { transition:transform .3s ease, opacity .3s ease; }
.dev-banner-enter-from, .dev-banner-leave-to { transform:translateY(100%); opacity:0; }

.dev-tablet .dev-bar, .dev-phone .dev-bar { height:22px; padding:0 7px; font-size:8.5px; gap:5px; }
.dev-phone { border-radius:16px; }
.dev-phone .dev-tag, .dev-tablet .dev-tag { padding:1px 4px; }
.dev-tablet .dev-banner, .dev-phone .dev-banner { font-size:8.5px; padding:5px 7px; }
@media (prefers-reduced-motion: reduce) {
  .is-received .dev-seq { animation:none; }
  .dev-app-enter-active, .dev-app-leave-active, .dev-banner-enter-active, .dev-banner-leave-active { transition:none; }
}
</style>
