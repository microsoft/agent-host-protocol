<script setup lang="ts">
import { enabledFeature } from '../notebook-channels.js'
import type { FeatureRow } from '../notebook-channels.js'

defineProps<{ rows: FeatureRow[]; protocolVersion: string }>()

const status = (row: FeatureRow) => enabledFeature(row) ? 'On' : !row.offered ? 'Not offered' : 'Not built yet'
</script>

<template>
  <div class="chan">
    <p class="chan-title">Settings · Connection</p>
    <dl class="chan-facts">
      <div><dt>Host</dt><dd>Local simulated host</dd></div>
      <div><dt>Protocol</dt><dd>AHP {{ protocolVersion }} <i>negotiated</i></dd></div>
    </dl>
    <p class="chan-label">Features</p>
    <ul class="chan-rows">
      <li v-for="row in rows" :key="row.family" :class="{ 'is-on': enabledFeature(row), 'is-absent': !row.offered }">
        <b>{{ row.label }}</b>
        <code>{{ row.channel }}</code>
        <span>{{ status(row) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.chan { display:flex; flex-direction:column; gap:10px; height:100%; padding:14px 16px 12px; font:13px/1.45 var(--nb-sans); color:var(--nb-ink); }
.chan-title { margin:0; padding-bottom:8px; border-bottom:1px solid var(--nb-line-soft); font-weight:700; font-size:14px; }
.chan-facts { display:grid; gap:4px; margin:0; font:11.5px/1.35 var(--nb-mono); }
.chan-facts div { display:flex; gap:10px; }
.chan-facts dt { width:70px; color:var(--nb-faint); }
.chan-facts dd { margin:0; }
.chan-facts i { font-style:normal; color:var(--nb-green); }
.chan-label { margin:6px 0 0; font:600 9.5px/1 var(--nb-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--nb-faint); }
.chan-rows { margin:0; padding:0; list-style:none; }
.chan-rows li { display:grid; grid-template-columns:100px minmax(0,1fr) auto; align-items:center; gap:10px; padding:9px 2px; border-bottom:1px solid var(--nb-selected); color:var(--nb-faint); transition:color .35s ease; }
.chan-rows li.is-on { color:var(--nb-ink); }
.chan-rows code { font:10.5px/1.3 var(--nb-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.chan-rows span { padding:2px 7px; border:1px solid currentColor; border-radius:10px; font:500 10px/1.3 var(--nb-mono); }
.chan-rows li.is-on span { border-color:var(--nb-green); color:var(--nb-green); }
.chan-rows li.is-absent b { text-decoration:line-through; text-decoration-color:var(--nb-red); }
@media (prefers-reduced-motion: reduce) { .chan-rows li { transition:none; } }
</style>
