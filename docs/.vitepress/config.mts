import { defineConfigWithTheme } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import {
  createVersionedSidebar,
  docVersions,
  prefixDocLink,
  rewriteDocPath,
  versionForSource,
  type DocThemeConfig,
} from './doc-versions'

export default withMermaid(defineConfigWithTheme<DocThemeConfig>({
  title: 'Agent Host Protocol',
  description: 'Documentation for the Agent Host Protocol — a synchronized, multi-client state protocol for AI agent sessions',
  base: '/agent-host-protocol/',
  rewrites: rewriteDocPath,
  markdown: {
    config(md) {
      md.core.ruler.push('doc-version-links', (state) => {
        // Page rendering rewrites env.path; local search provides only the source path.
        const prefix = versionForSource(state.env.realPath ?? state.env.path)?.prefix
        if (!prefix) return
        for (const token of state.tokens) {
          if (token.type !== 'inline') continue
          for (const child of token.children ?? []) {
            if (child.type !== 'link_open') continue
            const href = child.attrGet('href')
            if (href) child.attrSet('href', prefixDocLink(href, prefix))
          }
        }
      })
    },
  },
  mermaid: {
    theme: 'neutral',
    fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
  },

  head: [
    ['link', { rel: 'stylesheet', href: 'https://unpkg.com/@vscode/codicons/dist/codicon.css' }],
  ],

  themeConfig: {
    docVersions,
    nav: [
      { text: 'Guide', link: '/guide/what-is-ahp', activeMatch: '^/(?:draft/|v[^/]+/)?guide/' },
      { text: 'Specification', link: '/specification/overview', activeMatch: '^/(?:draft/|v[^/]+/)?specification/' },
      { text: 'Reference', link: '/reference/common', activeMatch: '^/(?:draft/|v[^/]+/)?reference/' },
      { component: 'VersionSwitcher' },
    ],

    sidebar: createVersionedSidebar({
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
            { text: 'MCP Servers', link: '/guide/mcp' },
            { text: 'Write-Ahead Reconciliation', link: '/guide/reconciliation' },
          ],
        },
        {
          text: 'More',
          items: [
            { text: 'Doctrine', link: '/guide/doctrine' },
            { text: 'AHP and ACP', link: '/guide/ahp-and-acp' },
            { text: 'Clients', link: '/guide/clients' },
            { text: 'Implementations', link: '/guide/implementations' },
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
            { text: 'Windowed Delivery', link: '/specification/windowed-delivery' },
            { text: 'Authentication', link: '/specification/authentication' },
            { text: 'MCP Channel', link: '/specification/mcp-channel' },
            { text: 'Versioning', link: '/specification/versioning' },
          ],
        },
        {
          text: 'Channels',
          items: [
            { text: 'Root Channel', link: '/specification/root-channel' },
            { text: 'Session Channel', link: '/specification/session-channel' },
            { text: 'Chat Channel', link: '/specification/chat-channel' },
            { text: 'Automation Catalogue Channel', link: '/specification/automation-channel' },
            { text: 'Automation Run Channel', link: '/specification/automation-run-channel' },
            { text: 'Terminal Channel', link: '/specification/terminal-channel' },
            { text: 'TCP Channel', link: '/specification/tcp-channel' },
            { text: 'Resource Watch Channel', link: '/specification/resource-watch-channel' },
            { text: 'Telemetry Channel', link: '/specification/telemetry-channel' },
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
            { text: 'Chat Channel', link: '/reference/chat' },
            { text: 'Canvas Channel', link: '/reference/canvas' },
            { text: 'Terminal Channel', link: '/reference/terminal' },
            { text: 'TCP Channel', link: '/reference/tcp' },
            { text: 'Changeset Channel', link: '/reference/changeset' },
            { text: 'Annotations Channel', link: '/reference/annotations' },
            { text: 'Automation Catalogue Channel', link: '/reference/automation' },
            { text: 'Automation Run Channel', link: '/reference/automation-run' },
            { text: 'Resource Watch Channel', link: '/reference/resource-watch' },
            { text: 'Telemetry Channel', link: '/reference/otlp' },
            { text: 'MCP Channel', link: '/reference/mcp' },
          ],
        },
      ],
    }),

    socialLinks: [
      { icon: 'github', link: 'https://github.com/microsoft/agent-host-protocol' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Microsoft',
    },

    search: {
      provider: 'local',
      options: {
        _render(src, env, md) {
          if (versionForSource(env.realPath ?? env.path)?.prefix) return ''
          const html = md.render(src, env)
          return env.frontmatter?.search === false ? '' : html
        },
      },
    },

    editLink: {
      // Serialized to the client, so it can't reference imports. Released pages edit main's copy.
      pattern: ({ filePath }) => 'https://github.com/microsoft/agent-host-protocol/edit/main/docs/'
        + filePath.replace(/^versions\/[^/]+\//, ''),
      text: 'Edit this page on GitHub',
    },
  },
}))
