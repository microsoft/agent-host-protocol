<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute, useRouter, withBase, type DefaultTheme } from 'vitepress'
import type { DocThemeConfig } from '../../doc-versions'
import { goToDocVersion, parseDocVersionRoute } from '../doc-version-route'

defineProps<{ navBar?: boolean; screenMenu?: boolean }>()

const { theme, site } = useData<DocThemeConfig>()
const route = useRoute()
const router = useRouter()
const versions = computed(() => theme.value.docVersions ?? [])

const current = computed(() => parseDocVersionRoute(route.path, site.value.base, versions.value))

function firstSidebarLink(items: DefaultTheme.SidebarItem[]): string | undefined {
  for (const item of items) {
    const link = item.link || (item.items && firstSidebarLink(item.items))
    if (link) return link
  }
}

async function switchVersion(event: Event) {
  const source = current.value
  const prefix = (event.target as HTMLSelectElement).value
  const target = versions.value.find((version) => version.prefix === prefix)
  if (!source || !target) return
  const sidebar = theme.value.sidebar
  const sectionSidebar = sidebar && !Array.isArray(sidebar)
    ? sidebar[`${target.prefix}/${source.section}/`]
    : undefined
  const firstLink = firstSidebarLink(Array.isArray(sectionSidebar) ? sectionSidebar : sectionSidebar?.items ?? [])
  const sidebarPage = firstLink ? parseDocVersionRoute(firstLink, '/', versions.value)?.page : undefined
  const page = target.pages.includes(source.page)
    ? source.page
    : sidebarPage ?? target.pages.find((page) => page.startsWith(`${source.section}/`)) ?? target.pages[0]
  if (!page) return
  const html = route.path.endsWith('.html') || (!site.value.cleanUrls && route.path.endsWith('/'))
  const path = page.endsWith('/index') ? page.slice(0, -5) : page + (html ? '.html' : '')
  await goToDocVersion(router, withBase(`${target.prefix}/${path}`) + window.location.hash)
}
</script>

<template>
  <label
    v-if="current && (navBar || screenMenu)"
    class="version-picker"
    :class="{ 'screen-menu': screenMenu }"
  >
    <span class="codicon codicon-versions" aria-hidden="true" />
    <select
      aria-label="Documentation version"
      :value="current.version.prefix"
      @change="switchVersion"
    >
      <option v-for="version in versions" :key="version.prefix" :value="version.prefix">
        {{ version.label }}
      </option>
    </select>
    <span class="vpi-chevron-down" aria-hidden="true" />
  </label>
</template>

<style scoped>
.version-picker {
  display: none;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  height: 40px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 10px 0 12px;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg-alt);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.25s, color 0.25s;
}

.version-picker:hover,
.version-picker:focus-within {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.version-picker:has(select:focus-visible) {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.version-picker select {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  appearance: none;
  cursor: pointer;
}

.version-picker > span {
  flex-shrink: 0;
  pointer-events: none;
}

.version-picker .codicon {
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.version-picker .vpi-chevron-down {
  width: 12px;
  height: 12px;
}

.version-picker.screen-menu {
  display: flex;
  width: 100%;
  margin: 12px 0;
}

@media (min-width: 768px) {
  .version-picker:not(.screen-menu) {
    display: flex;
    order: -1;
    margin: 0 auto 0 10px;
  }

  :global(.content-body:has(> .version-picker) > .VPNavBarSearch) {
    flex-grow: 0;
    order: -2;
  }
}
</style>
