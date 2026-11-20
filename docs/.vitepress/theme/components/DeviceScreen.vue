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

const linkLabel = computed(() => props.link === 'offline' ? 'offline' : props.link === 'reconnecting' ? 'syncing' : undefined)
</script>

<template>
  <div class="dev" :class="[`dev-${variant}`, `is-${link}`, { 'is-focused': focused, 'is-received': received }]">
    <div class="dev-bar">
      <span v-if="!(tag && variant === 'phone')" class="dev-name">{{ variant }}</span>
      <span v-if="tag" class="dev-tag">{{ tag }}</span>
      <span class="dev-link" :title="linkLabel ?? 'live'"><i aria-hidden="true"></i>{{ linkLabel }}</span>
      <span v-if="seq !== undefined" :key="seq" class="dev-seq">#{{ seq }}</span>
      <span v-else-if="badge" class="dev-seq">{{ badge }}</span>
    </div>
    <div class="dev-body">
      <nav v-if="apps" class="dev-rail" aria-hidden="true">
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
.dev { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; background:var(--nb-surface); border:1px solid var(--nb-device-border); border-radius:12px; box-shadow:var(--nb-device-shadow); color:var(--nb-ink); transition:box-shadow .35s ease, border-color .35s ease; }
.dev.is-focused { border-color:var(--nb-blue); box-shadow:0 0 0 3px var(--nb-focus), var(--nb-device-shadow); }
.dev.is-offline { border-color:var(--nb-red); border-style:dashed; box-shadow:var(--nb-device-shadow); }
.dev.is-reconnecting { border-color:var(--nb-amber); border-style:dashed; box-shadow:var(--nb-device-shadow); }
.dev-bar { display:flex; align-items:center; gap:8px; padding:0 10px; height:28px; border-bottom:1px solid var(--nb-line-soft); background:var(--nb-chrome); font:600 9.5px/1 var(--nb-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--nb-faint); flex:none; }
.dev-tag { padding:2px 6px; border:1px solid var(--nb-line); border-radius:4px; background:var(--nb-surface); color:var(--nb-ink); text-transform:none; letter-spacing:0; }
.dev-link { display:inline-flex; align-items:center; gap:5px; margin-left:auto; text-transform:none; letter-spacing:0; font-weight:500; white-space:nowrap; }
.dev-link i { width:6px; height:6px; border-radius:50%; background:var(--nb-green); box-shadow:0 0 0 2px color-mix(in srgb, var(--nb-green) 22%, transparent); }
.is-offline .dev-link { color:var(--nb-red); }
.is-offline .dev-link i { background:var(--nb-red); box-shadow:0 0 0 2px color-mix(in srgb, var(--nb-red) 22%, transparent); }
.is-reconnecting .dev-link { color:var(--nb-amber); }
.is-reconnecting .dev-link i { background:var(--nb-amber); box-shadow:0 0 0 2px color-mix(in srgb, var(--nb-amber) 22%, transparent); }
.dev-seq { padding:2px 6px; border-radius:4px; background:var(--nb-selected); color:var(--nb-ink); font-variant-numeric:tabular-nums; text-transform:none; letter-spacing:0; }
.is-received .dev-seq { animation:dev-seq 1.1s ease-out; }
@keyframes dev-seq { 0% { background:var(--nb-info-bg); color:var(--nb-blue); } 100% { background:var(--nb-selected); color:var(--nb-ink); } }
.dev-body { position:relative; display:flex; flex:1; min-height:0; }
.dev-rail { display:flex; flex-direction:column; gap:2px; width:124px; flex:none; padding:12px 8px; border-right:1px solid var(--nb-line-soft); background:var(--nb-chrome); font:12px/1.3 var(--nb-sans); color:var(--nb-muted); }
.dev-app { padding:6px 8px; border-radius:6px; }
.dev-app.is-current { background:var(--nb-selected); color:var(--nb-ink); font-weight:600; }
.dev-app-enter-active, .dev-app-leave-active { transition:opacity .35s ease .2s; }
.dev-app-enter-from, .dev-app-leave-to { opacity:0; }
.dev-view { position:relative; flex:1; min-width:0; min-height:0; overflow:hidden; }
/* In flow, so the screen shrinks above it instead of hiding the newest content. */
.dev-banner { flex:none; margin:0 6px 6px; padding:6px 9px; border:1px solid color-mix(in srgb, var(--nb-red) 35%, transparent); border-radius:7px; background:var(--nb-danger-bg); color:var(--nb-red); font:500 10px/1.3 var(--nb-mono); }
.is-reconnecting .dev-banner { border-color:color-mix(in srgb, var(--nb-amber) 35%, transparent); background:var(--nb-warning-bg); color:var(--nb-warning-text); }
.dev-banner-enter-active, .dev-banner-leave-active { transition:transform .3s ease, opacity .3s ease; }
.dev-banner-enter-from, .dev-banner-leave-to { transform:translateY(8px); opacity:0; }

.dev-tablet .dev-bar, .dev-phone .dev-bar { height:22px; padding:0 8px; font-size:8px; gap:5px; }
.dev-tablet { border-radius:14px; }
.dev-phone { border-radius:18px; }
.dev-phone .dev-tag, .dev-tablet .dev-tag { padding:1px 4px; }
.dev-tablet .dev-banner, .dev-phone .dev-banner { margin:0 5px 5px; font-size:8px; padding:4px 6px; border-radius:6px; }
@media (prefers-reduced-motion: reduce) {
  .dev { transition:none; }
  .is-received .dev-seq { animation:none; }
  .dev-app-enter-active, .dev-app-leave-active, .dev-banner-enter-active, .dev-banner-leave-active { transition:none; }
}
</style>
