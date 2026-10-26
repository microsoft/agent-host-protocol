import type { Router } from 'vitepress'
import type { DocVersion } from '../doc-versions'
import { VERSIONED_SECTIONS } from '../versions'

export function parseDocVersionRoute(routePath: string, base: string, versions: DocVersion[]) {
  const pathname = routePath.split(/[?#]/)[0]
  const path = pathname.startsWith(base)
    ? pathname.slice(base.length)
    : pathname.replace(/^\//, '')
  const version = versions.find(({ prefix }) => prefix && path.startsWith(`${prefix.slice(1)}/`))
    ?? versions.find(({ prefix }) => prefix === '')
  if (!version) return
  let page = (version.prefix ? path.slice(version.prefix.length) : path).replace(/\.html$/, '')
  if (page.endsWith('/')) page += 'index'
  if (VERSIONED_SECTIONS.some((section) => page === section)) page += '/index'
  const section = VERSIONED_SECTIONS.find((section) => page.startsWith(`${section}/`))
  return section ? { version, page, section } : undefined
}

// Explicit version changes must bypass the guard that keeps ordinary navigation in a version.
export const versionSwitches = new WeakSet<Router>()

export async function goToDocVersion(router: Router, href: string) {
  versionSwitches.add(router)
  try {
    await router.go(href)
  } finally {
    versionSwitches.delete(router)
  }
}
