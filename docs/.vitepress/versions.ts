/**
 * Released protocol versions whose docs are published alongside the draft
 * built from `main`, newest first. The first entry is the default version
 * served at the unprefixed URLs (`/guide/...`). Each entry must have a
 * matching `v<version>` git tag; `npm run docs:versions` materializes it
 * into `docs/versions/<version>/`.
 */
export const STABLE_DOC_VERSIONS: readonly string[] = ['1.0.0']

/** Top-level docs sections that are versioned. */
export const VERSIONED_SECTIONS = ['guide', 'specification', 'reference'] as const

/** Directory (relative to `docs/`) holding materialized stable versions. */
export const VERSIONS_DIR = 'versions'
