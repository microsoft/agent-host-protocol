/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { generateMarkdownDocs } from './generate-markdown.js';

test('command helper types have public reference anchors and fields', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const output = join(root, 'node_modules', '.cache', `markdown-${randomUUID()}`);
  try {
    const project = new Project({ tsConfigFilePath: join(root, 'types', 'tsconfig.json') });
    generateMarkdownDocs(project, output);
    const session = readFileSync(join(output, 'session.md'), 'utf8');
    const common = readFileSync(join(output, 'common.md'), 'utf8');
    assert.deepEqual({
      source: session.includes('### `RepositorySource`'),
      subdirectory: session.includes('| `subdirectory` |'),
      clientCapabilities: common.includes('### `ClientCapabilities`'),
      workingDirectoryInfo: common.includes('| `workingDirectoryInfo` |'),
      preparation: common.includes('### `RepositoryPreparationCapabilities`'),
    }, {
      source: true,
      subdirectory: true,
      clientCapabilities: true,
      workingDirectoryInfo: true,
      preparation: true,
    });
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
