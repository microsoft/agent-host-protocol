import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function getConstructorPropertyOrder(file: URL, className: string): string[] {
  const source = readFileSync(file, 'utf8');
  const declaration = source.match(new RegExp(`data class ${className}\\(([\\s\\S]*?)\\n\\)`));
  assert.ok(declaration, `missing generated Kotlin data class ${className}`);
  return [...declaration[1].matchAll(/val (\w+):/g)].map(match => match[1]);
}

describe('generated Kotlin constructor order', () => {
  it('appends CreateChatParams.title after the existing constructor properties', () => {
    assert.deepEqual(
      getConstructorPropertyOrder(
        new URL('../clients/kotlin/src/main/kotlin/com/microsoft/agenthostprotocol/generated/Commands.generated.kt', import.meta.url),
        'CreateChatParams',
      ),
      ['channel', 'meta', 'chat', 'initialMessage', 'source', 'workingDirectories', 'title'],
    );
  });

  it('appends MultipleChatsCapability.initialTitle after the existing constructor properties', () => {
    assert.deepEqual(
      getConstructorPropertyOrder(
        new URL('../clients/kotlin/src/main/kotlin/com/microsoft/agenthostprotocol/generated/State.generated.kt', import.meta.url),
        'MultipleChatsCapability',
      ),
      ['fork', 'sideChat', 'initialTitle'],
    );
  });
});
