import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: 'Agent Host Protocol',
  description: 'Documentation for the Agent Host Protocol — a synchronized, multi-client state protocol for AI agent sessions',
  // todo: reenable when GH pages is public
  // base: '/agent-host-protocol/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/agent-host-protocol/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/what-is-ahp' },
      { text: 'Specification', link: '/specification/overview' },
      { text: 'Reference', link: '/reference/state-types' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is AHP?', link: '/guide/what-is-ahp' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'State Model', link: '/guide/state-model' },
            { text: 'Actions', link: '/guide/actions' },
            { text: 'Terminals', link: '/guide/terminals' },
            { text: 'Customizations', link: '/guide/customizations' },
            { text: 'Write-Ahead Reconciliation', link: '/guide/reconciliation' },
          ],
        },
        {
          text: 'Design',
          items: [
            { text: 'Design Decisions', link: '/guide/design' },
            { text: 'AHP and ACP', link: '/guide/ahp-and-acp' },
          ],
        },
      ],
      '/specification/': [
        {
          text: 'Specification',
          items: [
            { text: 'Overview', link: '/specification/overview' },
            { text: 'Transport', link: '/specification/transport' },
            { text: 'Lifecycle', link: '/specification/lifecycle' },
            { text: 'Authentication', link: '/specification/authentication' },
            { text: 'Subscriptions', link: '/specification/subscriptions' },
            { text: 'Versioning', link: '/specification/versioning' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'State Types', link: '/reference/state-types' },
            { text: 'Actions', link: '/reference/actions' },
            { text: 'Commands', link: '/reference/commands' },
            { text: 'Notifications', link: '/reference/notifications' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/microsoft/agent-host-protocol' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Microsoft',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/microsoft/agent-host-protocol/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
}))
