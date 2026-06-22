/// <reference path="./styles.d.ts" />

import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'

import HomeWalkthrough from './components/HomeWalkthrough.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomeWalkthrough', HomeWalkthrough)
  },
} satisfies Theme
