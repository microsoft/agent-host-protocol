/// <reference path="./styles.d.ts" />

import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'

import HomeWalkthrough from './components/HomeWalkthrough.vue'
import StabilityIndex from './components/StabilityIndex.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomeWalkthrough', HomeWalkthrough)
    app.component('StabilityIndex', StabilityIndex)
  },
} satisfies Theme
