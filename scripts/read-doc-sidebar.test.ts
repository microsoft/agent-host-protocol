import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDocSidebarSource } from './read-doc-sidebar.js';

test('reads the plain sidebar used by older documentation releases', () => {
  const sidebar = "{ '/guide/': [{ text: 'Guide', link: '/guide/start' }] }";
  assert.equal(readDocSidebarSource(
    `export default defineConfig({ themeConfig: { sidebar: ${sidebar} } });`,
  ), sidebar);
});

test('reads the release sidebar without importing versioned documentation', () => {
  const sidebar = "{ '/guide/': [{ text: 'New page', link: '/guide/new' }] }";
  assert.equal(readDocSidebarSource(`
    import { createVersionedSidebar } from './missing-doc-versions';
    export default withMermaid(defineConfig({
      themeConfig: { sidebar: createVersionedSidebar(${sidebar}) },
    }));
  `), sidebar);
});

test('rejects missing and unsupported sidebars explicitly', () => {
  for (const config of [
    'export default {};',
    'export default { themeConfig: { sidebar: loadSidebar() } };',
    'export default { themeConfig: { sidebar: createVersionedSidebar() } };',
  ]) {
    assert.throws(() => readDocSidebarSource(config), /Expected themeConfig.sidebar/);
  }
});
