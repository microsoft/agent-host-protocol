/// <reference path="./styles.d.ts" />

import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import type { DocThemeConfig } from '../doc-versions'
import { parseDocVersionRoute, versionSwitches } from './doc-version-route'
import ProtocolHero from './components/ProtocolHero.vue'
import StabilityIndex from './components/StabilityIndex.vue'
import VersionSwitcher from './components/VersionSwitcher.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-content-before': () => h(VersionSwitcher, { navBar: true }),
  }),
  enhanceApp({ app, router, siteData }) {
    app.component('VersionSwitcher', VersionSwitcher)
    app.component('ProtocolHero', ProtocolHero)
    app.component('StabilityIndex', StabilityIndex)

    const beforeRouteChange = router.onBeforeRouteChange
    router.onBeforeRouteChange = async (href) => {
      const switchingVersion = versionSwitches.delete(router)
      if (await beforeRouteChange?.call(router, href) === false) return false
      if (switchingVersion) return
      const { base, themeConfig } = siteData.value
      const versions = (themeConfig as DocThemeConfig).docVersions ?? []
      const current = parseDocVersionRoute(router.route.path, base, versions)
      if (!current?.version.prefix) return
      const url = new URL(href, 'https://vitepress.local')
      if (!url.pathname.startsWith(base)) return
      const target = parseDocVersionRoute(url.pathname, base, versions)
      if (!target || target.version.prefix || !current.version.pages.includes(target.page)) return
      url.pathname = `${base}${current.version.prefix.slice(1)}/${url.pathname.slice(base.length)}`
      await router.go(url.pathname + url.search + url.hash)
      return false
    }
  },
} satisfies Theme
