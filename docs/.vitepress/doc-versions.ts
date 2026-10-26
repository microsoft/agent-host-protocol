import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DefaultTheme } from 'vitepress'
import { STABLE_DOC_VERSIONS, VERSIONED_SECTIONS, VERSIONS_DIR } from './versions'

export interface DocVersion {
  label: string
  prefix: string
  pages: string[]
}

export interface DocThemeConfig extends DefaultTheme.Config {
  docVersions: DocVersion[]
}

const docsDir = fileURLToPath(new URL('../', import.meta.url))
const registry = readFileSync(new URL('../../types/version/registry.ts', import.meta.url), 'utf8')
const protocolVersion = registry.match(/^export const PROTOCOL_VERSION = ['"]([^'"]+)['"];?/m)?.[1]
if (!protocolVersion) throw new Error('Could not read PROTOCOL_VERSION from types/version/registry.ts')

const sources = [
  { label: `${protocolVersion} (draft)`, prefix: '/draft', sourcePrefix: '', dir: docsDir },
  ...STABLE_DOC_VERSIONS.map((version, index) => {
    const sourcePrefix = `${VERSIONS_DIR}/${version}/`
    const dir = join(docsDir, sourcePrefix)
    if (!existsSync(dir) || !existsSync(join(dir, 'sidebar.json'))) {
      throw new Error(`Missing documentation for stable version ${version}. Run \`npm run docs:versions\` first.`)
    }
    return { label: version, prefix: index === 0 ? '' : `/v${version}`, sourcePrefix, dir }
  }),
]

function isVersionedPage(path: string): boolean {
  return VERSIONED_SECTIONS.some((section) => path.startsWith(`${section}/`))
}

function sourceForPath(path: string) {
  return sources.find(({ sourcePrefix }) =>
    path.startsWith(sourcePrefix) && isVersionedPage(path.slice(sourcePrefix.length)),
  )
}

export function versionForSource(file: string | undefined) {
  // Inline renders (e.g. container titles) carry no source path.
  return file ? sourceForPath(relative(docsDir, file).split(sep).join('/')) : undefined
}

export function rewriteDocPath(path: string): string {
  const version = sourceForPath(path)
  return version
    ? `${version.prefix}/${path.slice(version.sourcePrefix.length)}`.slice(1)
    : path
}

export function prefixDocLink(link: string, prefix: string): string {
  return link.startsWith('/') && isVersionedPage(link.slice(1)) ? prefix + link : link
}

function collectPages(dir: string, path: string): string[] {
  return readdirSync(join(dir, path), { withFileTypes: true }).flatMap((entry) => {
    const page = `${path}/${entry.name}`
    if (entry.isDirectory()) return collectPages(dir, page)
    return entry.isFile() && page.endsWith('.md') ? [page.slice(0, -3)] : []
  })
}

export const docVersions: DocVersion[] = sources.map(({ label, prefix, dir }) => ({
  label,
  prefix,
  pages: VERSIONED_SECTIONS.flatMap((section) => collectPages(dir, section)).sort(),
}))

function prefixItems(items: DefaultTheme.SidebarItem[], prefix: string): DefaultTheme.SidebarItem[] {
  return items.map((item) => ({
    ...item,
    link: item.link ? prefixDocLink(item.link, prefix) : undefined,
    base: item.base ? prefixDocLink(item.base, prefix) : undefined,
    items: item.items ? prefixItems(item.items, prefix) : undefined,
  }))
}

export function createVersionedSidebar(draftSidebar: DefaultTheme.SidebarMulti): DefaultTheme.SidebarMulti {
  const sidebar: DefaultTheme.SidebarMulti = {}
  for (const { dir, prefix, sourcePrefix } of sources) {
    const source: DefaultTheme.SidebarMulti = sourcePrefix
      ? JSON.parse(readFileSync(join(dir, 'sidebar.json'), 'utf8'))
      : draftSidebar
    for (const section of VERSIONED_SECTIONS) {
      const items = source[`/${section}/`]
      if (!items) continue
      sidebar[`${prefix}/${section}/`] = Array.isArray(items)
        ? prefixItems(items, prefix)
        : { ...items, base: prefixDocLink(items.base, prefix), items: prefixItems(items.items, prefix) }
    }
  }
  return sidebar
}
