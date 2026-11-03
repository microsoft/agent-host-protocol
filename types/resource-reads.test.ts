import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { ContentEncoding } from './common/commands.js';
import { AhpErrorCodes, ResourceReadFailureKind } from './common/errors.js';
import type { AhpErrorResponse, AhpRequest, AhpSuccessResponse, JsonRpcRequest } from './common/messages.js';

const specification = readFileSync(new URL('../docs/specification/resource-reads.md', import.meta.url), 'utf8');
const examples: unknown[] = [];
for (const [, block] of specification.matchAll(/```jsonc?\n([\s\S]*?)\n```/g)) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, block);
  let depth = 0;
  let start = 0;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.OpenBraceToken) {
      if (depth === 0) start = scanner.getTokenPos();
      depth++;
    } else if (token === ts.SyntaxKind.CloseBraceToken) {
      depth--;
      if (depth === 0) examples.push(JSON.parse(block.slice(start, scanner.getTextPos())));
    }
  }
  assert.equal(depth, 0, 'JSON examples must have balanced braces');
}

describe('resource-read specification examples', () => {
  it('uses the canonical offer, acceptance, read, result, and error shapes', () => {
    const offer: AhpRequest<'initialize'> = {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        channel: 'ahp-root://', clientId: 'reader-1', protocolVersions: ['1.0.0'],
        capabilities: { resourceRead: { schemes: [] } },
      },
    };
    const acceptance: AhpSuccessResponse<'initialize'> = {
      jsonrpc: '2.0', id: 1,
      result: {
        protocolVersion: '1.0.0', serverSeq: 1, snapshots: [],
        resourceRead: { schemes: ['http', 'https', 'canvas-content'] },
      },
    };
    const malformedOffer: JsonRpcRequest = {
      jsonrpc: '2.0', id: 7, method: 'initialize',
      params: {
        channel: 'ahp-root://', clientId: 'reader-1', protocolVersions: ['1.0.0'],
        capabilities: { resourceRead: { schemes: 'http' } },
      },
    };
    const declined: AhpSuccessResponse<'initialize'> = {
      jsonrpc: '2.0', id: 7,
      result: { protocolVersion: '1.0.0', serverSeq: 1, snapshots: [] },
    };
    const request: AhpRequest<'resourceRead'> = {
      jsonrpc: '2.0', id: 2, method: 'resourceRead',
      params: {
        channel: 'ahp-root://', uri: 'canvas-content://c1/preview', encoding: ContentEncoding.Base64,
      },
    };
    const result: AhpSuccessResponse<'resourceRead'> = {
      jsonrpc: '2.0', id: 2,
      result: {
        data: 'PGgxPkhlbGxvPC9oMT4=', encoding: ContentEncoding.Base64,
        contentType: 'text/html', effectiveUri: 'canvas-content://c1/preview/',
      },
    };
    const failure: AhpErrorResponse = {
      jsonrpc: '2.0', id: 3,
      error: {
        code: AhpErrorCodes.ResourceReadFailed,
        message: 'Resource exceeds the read size limit',
        data: { kind: ResourceReadFailureKind.TooLarge },
      },
    };
    const denied: AhpErrorResponse = {
      jsonrpc: '2.0', id: 4,
      error: {
        code: AhpErrorCodes.PermissionDenied,
        message: 'Canvas source access requires approval',
        data: { request: { channel: 'ahp-root://', uri: 'resource-grant:/g1', read: true } },
      },
    };
    const grant: AhpRequest<'resourceRequest'> = {
      jsonrpc: '2.0', id: 5, method: 'resourceRequest',
      params: { channel: 'ahp-root://', uri: 'resource-grant:/g1', read: true },
    };
    const granted: AhpSuccessResponse<'resourceRequest'> = {
      jsonrpc: '2.0', id: 5, result: {},
    };
    const retry: AhpRequest<'resourceRead'> = {
      jsonrpc: '2.0', id: 6, method: 'resourceRead',
      params: {
        channel: 'ahp-root://', uri: 'canvas-content://c1/preview/index.html',
        encoding: ContentEncoding.Base64,
      },
    };
    const content: AhpSuccessResponse<'resourceRead'> = {
      jsonrpc: '2.0', id: 6,
      result: { data: 'PGgxPkhlbGxvPC9oMT4=', encoding: ContentEncoding.Base64, contentType: 'text/html' },
    };
    assert.deepEqual(examples, [
      offer, acceptance, malformedOffer, declined, request, result,
      denied, grant, granted, retry, content, failure,
    ]);
    assert.deepEqual(grant.params, denied.error.data.request);
    assert.notEqual(retry.params.uri, grant.params.uri);
    assert.equal(declined.result.resourceRead, undefined);
    assert.equal(Buffer.from(result.result.data, 'base64').toString('utf8'), '<h1>Hello</h1>');
  });

  it('limits scheme coverage without disabling unlisted reads in either direction', () => {
    const rows = [...specification.matchAll(/^\| (Client to host|Host to client) \| `([^`]+)` \| ([^|]+) \|$/gm)];
    assert.equal(rows.length, 5);
    for (const [, direction, uri, behavior] of rows) {
      const schemes = direction === 'Client to host' ? ['http', 'https', 'canvas-content'] : [];
      const covered = schemes.includes(new URL(uri).protocol.slice(0, -1));
      if (covered) {
        assert.equal(behavior, 'Resource Reads contract');
      } else {
        assert.match(behavior, /^Existing (reverse )?(file|changeset|virtual)-read behavior$/);
      }
    }
    assert.ok(rows.some(([, direction, uri]) => direction === 'Host to client' && uri.startsWith('file:')));
    assert.ok(rows.some(([, direction, uri]) => direction === 'Host to client' && uri.startsWith('virtual:')));
    assert.ok(rows.some(([, direction, uri]) => direction === 'Client to host' && uri.startsWith('ahp-changeset:')));
  });

  it('preserves every URI-resolution example including queries and trailing slashes', () => {
    const base = 'http://127.0.0.1:41234/preview/index.html?token=abc';
    assert.ok(specification.includes(`\`${base}\``));
    const rows = [...specification.matchAll(/^\| `([^`]+)` \| `([^`]+)` \|$/gm)];
    assert.equal(rows.length, 6);
    for (const [, reference, expected] of rows) {
      const resolved = new URL(reference, base);
      resolved.hash = '';
      assert.equal(resolved.href, expected, reference);
    }
  });

  it('uses each redirected document and stylesheet as its own public base', () => {
    const requested = 'canvas-content://c1/preview';
    const effective = 'canvas-content://c1/preview/';
    assert.equal(new URL('app.js', requested).href, 'canvas-content://c1/app.js');
    assert.equal(new URL('app.js', effective).href, 'canvas-content://c1/preview/app.js');
    assert.equal(new URL('/assets/icon.svg', effective).href, 'canvas-content://c1/assets/icon.svg');
    const stylesheet = 'canvas-content://c1/themes/dark/style.css';
    assert.equal(new URL('../font.woff2?v=2', stylesheet).href, 'canvas-content://c1/themes/font.woff2?v=2');
    const fragment = new URL('#details', effective);
    fragment.hash = '';
    assert.equal(fragment.href, effective);
  });

  it('keeps source queries out of independent subresource requests', () => {
    const entry = 'https://source.example/preview/index.html?token=entry-secret';
    assert.equal(new URL('app.js?v=2', entry).href, 'https://source.example/preview/app.js?v=2');
    assert.equal(new URL('assets/', entry).search, '');
    assert.equal(new URL('?view=2', entry).search, '?view=2');
  });
});
