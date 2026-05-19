import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: 'Agent Host Protocol',
  description: 'Documentation for the Agent Host Protocol — a synchronized, multi-client state protocol for AI agent sessions',
  base: '/agent-host-protocol/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/agent-host-protocol/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/what-is-ahp' },
      { text: 'Specification', link: '/specification/overview' },
      { text: 'Reference', link: '/reference/common' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is AHP?', link: '/guide/what-is-ahp' },
            { text: 'Getting Started', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'State Model', link: '/guide/state-model' },
            { text: 'Actions', link: '/guide/actions' },
            { text: 'Elicitation', link: '/guide/elicitation' },
            { text: 'Terminals', link: '/guide/terminals' },
            { text: 'Customizations', link: '/guide/customizations' },
            { text: 'Write-Ahead Reconciliation', link: '/guide/reconciliation' },
          ],
        },
        {
          text: 'Design',
          items: [
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
            { text: 'Channels & Subscriptions', link: '/specification/subscriptions' },
            { text: 'Authentication', link: '/specification/authentication' },
            { text: 'Versioning', link: '/specification/versioning' },
          ],
        },
        {
          text: 'Channels',
          items: [
            { text: 'Root Channel', link: '/specification/root-channel' },
            { text: 'Session Channel', link: '/specification/session-channel' },
            { text: 'Terminal Channel', link: '/specification/terminal-channel' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Common', link: '/reference/common' },
            { text: 'Messages', link: '/reference/messages' },
            { text: 'Error Codes', link: '/reference/error-codes' },
          ],
        },
        {
          text: 'Channels',
          items: [
            { text: 'Root Channel', link: '/reference/root' },
            { text: 'Session Channel', link: '/reference/session' },
            { text: 'Terminal Channel', link: '/reference/terminal' },
            { text: 'Changeset Channel', link: '/reference/changeset' },
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
