/// <reference path="./styles.d.ts" />

import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import ProtocolHero from './components/ProtocolHero.vue'
import StabilityIndex from './components/StabilityIndex.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ProtocolHero', ProtocolHero)
    app.component('StabilityIndex', StabilityIndex)
  },
} satisfies Theme
