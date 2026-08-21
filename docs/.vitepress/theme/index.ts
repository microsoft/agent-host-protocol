/// <reference path="./styles.d.ts" />

import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'

import HomeWalkthrough from './components/HomeWalkthrough.vue'
import ProtocolHero from './components/ProtocolHero.vue'
import StabilityIndex from './components/StabilityIndex.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'home-hero-image': () => h(ProtocolHero),
  }),
  enhanceApp({ app }) {
    app.component('HomeWalkthrough', HomeWalkthrough)
    app.component('StabilityIndex', StabilityIndex)
  },
} satisfies Theme
