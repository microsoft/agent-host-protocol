import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { getDocumentation, readStability } from './read-stability.js';
import { generateMarkdownDocs } from './generate-markdown.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'Stability: 1.0 - Early development.';

function fixture(annotation: string) {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile('fixture.ts', `
/** Declaration description.
 * ${annotation}
 */
export interface Example {
  /** Field description.
   * ${annotation}
   */
  field?: string;
  /** Ordinary field. */
  ordinary?: string;
}
`).getInterfaceOrThrow('Example');
}

test('stability preserves the exact index on declarations and fields', () => {
  const iface = fixture('@stability 1.0');
  for (const node of [iface, iface.getPropertyOrThrow('field')]) {
    assert.deepEqual(readStability(node), { level: '1.0', label: 'Early development' });
    assert.ok(getDocumentation(node).endsWith(marker));
  }
  assert.equal(getDocumentation(iface.getPropertyOrThrow('ordinary')), 'Ordinary field.');
  assert.equal(readStability(iface.getPropertyOrThrow('ordinary')), undefined);
});

test('stability supports every documented level without interpreting it as a version', () => {
  for (const [level, label] of [
    ['0', 'Deprecated'], ['1', 'Experimental'], ['1.0', 'Early development'],
    ['1.1', 'Active development'], ['1.2', 'Release candidate'],
    ['2', 'Stable'], ['3', 'Legacy'],
  ]) {
    assert.deepEqual(readStability(fixture(`@stability ${level}`)), { level, label });
  }
});

test('declaration documentation does not pick up a leading module summary', () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const iface = project.createSourceFile('module.ts', `
/** File summary. @module fixture */
/** Capability description. @stability 1.0 */
export interface Capability {}
`).getInterfaceOrThrow('Capability');
  assert.equal(getDocumentation(iface), `Capability description.\n\n${marker}`);
});

test('invalid, missing, and repeated stability values fail explicitly', () => {
  for (const annotation of ['@stability', '@stability 1.3', '@stability 1.0.0', '@stability 1.0\n * @stability 2']) {
    assert.throws(() => readStability(fixture(annotation)), /expected one @stability annotation/);
  }
  const project = new Project({ useInMemoryFileSystem: true });
  const bare = project.createSourceFile('bare.ts', '/** @stability 1.0 */ interface Bare {}')
    .getInterfaceOrThrow('Bare');
  assert.equal(getDocumentation(bare), marker);
  const ordinary = project.createSourceFile('ordinary.ts', 'interface Ordinary {}')
    .getInterfaceOrThrow('Ordinary');
  assert.equal(getDocumentation(ordinary), '');
});

test('API docs show stability on entrypoint fields and notification methods only', () => {
  const out = mkdtempSync(join(tmpdir(), 'ahp-stability-'));
  try {
    const project = new Project({ tsConfigFilePath: resolve(root, 'types/tsconfig.json') });
    generateMarkdownDocs(project, out);
    const common = readFileSync(join(out, 'common.md'), 'utf8');
    for (const method of ['channel/frame', 'channel/credit', 'channel/ready', 'channel/reset', 'channel/snapshot']) {
      assert.ok(common.includes(`### \`${method}\`\n\n<StabilityIndex level="1.0" />`));
    }
    const rows = common.split('\n');
    for (const field of ['flowControl', 'windows']) {
      const entries = rows.filter(line => line.startsWith(`| \`${field}\` |`));
      assert.equal(entries.length, 3);
      // The reconnect subscription's flowControl is data, not a negotiation entrypoint.
      const marked = entries.filter(line => line.includes(marker));
      assert.equal(marked.length, field === 'flowControl' ? 2 : 3);
      if (field === 'windows') {
        const results = entries.filter(line => line.includes('The server MUST omit this field'));
        assert.equal(results.length, 2);
        for (const result of results) {
          assert.ok(result.includes('unless ReconnectParams.windows was supplied'));
          assert.ok(result.includes('only channels requested in ReconnectParams.windows.items'));
        }
      }
    }
    assert.ok(!common.includes('### `subscribe`\n\n<StabilityIndex'));
    assert.ok(!common.includes('### `reconnect`\n\n<StabilityIndex'));
    const tcp = readFileSync(join(out, 'tcp.md'), 'utf8');
    assert.ok(tcp.includes('## `createTcpConnection`\n\n<StabilityIndex level="1.0" />'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('native client docs preserve declaration and entrypoint stability', () => {
  const clients = [
    ['clients/go/ahptypes', 'commands.generated.go', 'notifications.generated.go'],
    ['clients/rust/crates/ahp-types/src', 'commands.rs', 'notifications.rs'],
    ['clients/swift/AgentHostProtocol/Sources/AgentHostProtocol/Generated', 'Commands.generated.swift', 'Notifications.generated.swift'],
    ['clients/kotlin/src/main/kotlin/com/microsoft/agenthostprotocol/generated', 'Commands.generated.kt', 'Notifications.generated.kt'],
    ['clients/dotnet/src/AgentHostProtocol.Abstractions/Generated', 'Commands.generated.cs', 'Notifications.generated.cs'],
  ];
  for (const [directory, commands, notifications] of clients) {
    const state = commands.replace(/commands/i, match => match === 'commands' ? 'state' : 'State');
    for (const file of [commands, state]) {
      const content = readFileSync(resolve(root, directory, file), 'utf8');
      assert.equal(content.includes('ChannelReceiveProgress'), false, `${directory}/${file}`);
      assert.equal(content.includes('acceptedBytes'), false, `${directory}/${file}`);
      assert.equal(content.includes('accepted_bytes'), false, `${directory}/${file}`);
    }
    for (const [file, expected] of [[commands, 11], [notifications, 7]] as const) {
      const content = readFileSync(resolve(root, directory, file), 'utf8');
      assert.equal(content.split(marker).length - 1, expected, `${directory}/${file}`);
    }
  }
});
