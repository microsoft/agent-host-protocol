import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function projectForTypes(): Project {
  return new Project({ tsConfigFilePath: resolve(root, 'types/tsconfig.json') });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value: unknown): Record<string, unknown> {
  assert.ok(isJsonObject(value), 'expected a JSON object');
  return value;
}

test('file-edit fields reference shared named types', () => {
  const project = projectForTypes();
  const common = project.getSourceFileOrThrow(resolve(root, 'types/common/state.ts'));
  const side = common.getInterfaceOrThrow('FileEditSide');
  const stats = common.getInterfaceOrThrow('FileEditDiffStats');
  const collection = common.getInterfaceOrThrow('FileEditCollection');
  const edit = common.getInterfaceOrThrow('FileEdit');

  assert.deepEqual(side.getProperties().map(p => p.getName()), ['uri', 'content']);
  assert.equal(side.getPropertyOrThrow('uri').getTypeNodeOrThrow().getText(), 'URI');
  assert.equal(side.getPropertyOrThrow('content').getTypeNodeOrThrow().getText(), 'ContentRef');
  assert.ok(side.getProperties().every(p => !p.hasQuestionToken()));
  assert.deepEqual(stats.getProperties().map(p => p.getName()), ['added', 'removed']);
  assert.ok(stats.getProperties().every(p => p.hasQuestionToken()));
  assert.ok(stats.getProperties().every(p => p.getTypeNodeOrThrow().getText() === 'number'));
  assert.equal(collection.getPropertyOrThrow('items').getTypeNodeOrThrow().getText(), 'FileEdit[]');
  assert.equal(collection.getPropertyOrThrow('items').hasQuestionToken(), false);

  for (const name of ['before', 'after']) {
    const property = edit.getPropertyOrThrow(name);
    assert.equal(property.getTypeNodeOrThrow().getText(), 'FileEditSide');
    assert.equal(property.hasQuestionToken(), true);
  }
  assert.equal(edit.getPropertyOrThrow('diff').getTypeNodeOrThrow().getText(), 'FileEditDiffStats');
  assert.equal(edit.getPropertyOrThrow('diff').hasQuestionToken(), true);

  for (const [file, name] of [
    ['types/channels-chat/state.ts', 'ToolCallPendingConfirmationState'],
    ['types/channels-chat/actions.ts', 'ChatToolCallReadyAction'],
  ]) {
    const property = project.getSourceFileOrThrow(resolve(root, file))
      .getInterfaceOrThrow(name).getPropertyOrThrow('edits');
    assert.equal(property.getTypeNodeOrThrow().getText(), 'FileEditCollection');
    assert.equal(property.hasQuestionToken(), true);
  }

  const result = project.getSourceFileOrThrow(resolve(root, 'types/channels-chat/state.ts'))
    .getInterfaceOrThrow('ToolResultFileEditContent');
  assert.ok(result.getExtends().some(base => base.getText() === 'FileEdit'));
});

test('the public TypeScript entry point supports typed file-edit consumers', () => {
  const project = projectForTypes();
  project.createSourceFile(resolve(root, 'types/__file_edit_api_check__.ts'), `
    import type {
      ChatToolCallReadyAction,
      FileEdit,
      FileEditCollection,
      FileEditDiffStats,
      FileEditSide,
      ToolCallPendingConfirmationState,
      ToolResultFileEditContent,
    } from './index.js';

    const side: FileEditSide = {
      uri: 'file:///workspace/file.txt',
      content: { uri: 'ahp-content:/file' },
    };
    const edit: FileEdit = {
      before: side,
      after: side,
      diff: { added: 2147483648, removed: 0 },
    };
    const collection: FileEditCollection = { items: [edit] };
    const ready: ChatToolCallReadyAction['edits'] = collection;
    const pending: ToolCallPendingConfirmationState['edits'] = collection;
    const resultSide: ToolResultFileEditContent['after'] = side;
    const stats: FileEditDiffStats | undefined = edit.diff;
    void [ready, pending, resultSide, stats];
  `);
  assert.deepEqual(
    project.getPreEmitDiagnostics().map(d => d.getMessageText()),
    [],
  );
});

test('named file-edit schemas keep their original required fields and wrappers', () => {
  for (const file of ['state.schema.json', 'actions.schema.json']) {
    const schema = jsonObject(JSON.parse(readFileSync(resolve(root, 'schema', file), 'utf8')));
    const defs = jsonObject(schema.$defs);
    const edit = jsonObject(defs.FileEdit);
    const editProperties = jsonObject(edit.properties);
    assert.equal(jsonObject(editProperties.before).$ref, '#/$defs/FileEditSide');
    assert.equal(jsonObject(editProperties.after).$ref, '#/$defs/FileEditSide');
    assert.equal(jsonObject(editProperties.diff).$ref, '#/$defs/FileEditDiffStats');
    assert.equal(edit.required, undefined);

    const side = jsonObject(defs.FileEditSide);
    assert.deepEqual(side.required, ['uri', 'content']);
    assert.equal(jsonObject(jsonObject(side.properties).content).$ref, '#/$defs/ContentRef');

    const stats = jsonObject(defs.FileEditDiffStats);
    assert.equal(stats.required, undefined);
    assert.equal(jsonObject(jsonObject(stats.properties).added).type, 'number');
    assert.equal(jsonObject(jsonObject(stats.properties).removed).type, 'number');

    const collection = jsonObject(defs.FileEditCollection);
    assert.deepEqual(collection.required, ['items']);
    const items = jsonObject(jsonObject(collection.properties).items);
    assert.equal(items.type, 'array');
    assert.equal(jsonObject(items.items).$ref, '#/$defs/FileEdit');
  }
});
