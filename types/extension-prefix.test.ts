/**
 * Ensures first-party protocol names do not use the extension namespace.
 *
 * Run: npx tsx --test types/extension-prefix.test.ts
 */

import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const extensionPrefix = 'x-';

function readSource(file: string): string {
  return readFileSync(resolve(root, file), 'utf-8');
}

function parseInterfaceKeys(source: string, interfaceName: string): string[] {
  const match = new RegExp(`interface\\s+${interfaceName}\\s*\\{([^]*?)^\\}`, 'm').exec(source);
  assert.ok(match, `Interface ${interfaceName} not found`);
  return [...match[1].matchAll(/^\s*'([^']+)'\s*:/gm)].map(key => key[1]);
}

function parseActionTypes(source: string): string[] {
  const match = /enum\s+ActionType\s*\{([^]*?)^\}/m.exec(source);
  assert.ok(match, 'ActionType enum not found');
  return [...match[1].matchAll(/=\s*'([^']+)'/g)].map(value => value[1]);
}

function assertNoReservedNames(names: string[], namespace: string): void {
  assert.notDeepStrictEqual(names, [], `No ${namespace} found`);
  const reserved = names.filter(name => name.startsWith(extensionPrefix));
  assert.deepStrictEqual(
    reserved,
    [],
    `First-party ${namespace} must not use the reserved ${extensionPrefix} prefix: ${reserved.join(', ')}`,
  );
}

describe('reserved extension prefix', () => {
  const messagesSource = readSource('common/messages.ts');

  it('is not used by first-party command methods', () => {
    const commands = [
      ...parseInterfaceKeys(messagesSource, 'CommandMap'),
      ...parseInterfaceKeys(messagesSource, 'ServerCommandMap'),
    ];
    assertNoReservedNames(commands, 'command methods');
  });

  it('is not used by first-party notification methods', () => {
    const notifications = [
      ...parseInterfaceKeys(messagesSource, 'ClientNotificationMap'),
      ...parseInterfaceKeys(messagesSource, 'ServerNotificationMap'),
    ];
    assertNoReservedNames(notifications, 'notification methods');
  });

  it('is not used by first-party action types', () => {
    assertNoReservedNames(parseActionTypes(readSource('common/actions.ts')), 'action types');
  });

  it('is not used by first-party channel URI schemes', () => {
    const channelSchemes = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('channels-'))
      .flatMap(entry => {
        const source = readSource(`${entry.name}/state.ts`);
        const moduleDoc = source.match(/^\/\*\*([^]*?)\*\//)?.[1];
        assert.ok(moduleDoc, `Module documentation not found in ${entry.name}/state.ts`);
        const schemes = [...moduleDoc.matchAll(/\b([a-z][a-z0-9+.-]*):/g)].map(match => match[1]);
        assert.notDeepStrictEqual(schemes, [], `Channel URI scheme not documented in ${entry.name}/state.ts`);
        return schemes;
      });

    assertNoReservedNames(channelSchemes, 'channel URI schemes');
  });
});
