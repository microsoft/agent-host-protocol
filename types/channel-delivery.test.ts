import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { ActionType } from './common/actions.js';
import type {
  AhpRequest,
  AhpServerNotification,
  AhpSuccessResponse,
  ProtocolMessage,
} from './common/messages.js';

const section = readFileSync(new URL('../docs/specification/windowed-delivery.md', import.meta.url), 'utf8');

const examples: ProtocolMessage[] = [];
for (const [, block] of section.matchAll(/```jsonc?\n([\s\S]*?)\n```/g)) {
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

const request = examples.find((message): message is AhpRequest<'subscribe'> =>
  'method' in message && message.method === 'subscribe');
assert.ok(request);
const acceptance = examples.find((message): message is AhpSuccessResponse<'subscribe'> =>
  'result' in message && message.id === request.id);
assert.ok(acceptance?.result.flowControl);
const flowControl = acceptance.result.flowControl;
const limits = flowControl.clientReceive;

const snapshot = examples.find((message): message is AhpServerNotification<'channel/snapshot'> =>
  'method' in message && message.method === 'channel/snapshot');
assert.ok(snapshot);
const output = examples.find((message): message is AhpServerNotification<'action'> =>
  'method' in message && message.method === 'action');
assert.ok(output);
const frames = examples.filter((message): message is AhpServerNotification<'channel/frame'> =>
  'method' in message && message.method === 'channel/frame');
const credits = examples.filter((message): message is AhpServerNotification<'channel/credit'> =>
  'method' in message && message.method === 'channel/credit');

function utf16Bytes(text: string): number {
  return text.length * 2;
}

function serializedBytes(value: unknown): number {
  return utf16Bytes(JSON.stringify(value));
}

describe('windowed delivery protocol examples', () => {
  it('uses complete JSON-RPC messages and accepts only offered receive ceilings', () => {
    assert.ok(examples.length >= 10);
    for (const message of examples) {
      assert.equal(message.jsonrpc, '2.0');
      if ('method' in message) assert.equal(typeof message.params.channel, 'string');
    }
    assert.equal(acceptance.result.snapshot, undefined);
    assert.ok(request.params.flowControl);
    const keys = ['windowBytes', 'maximumFrameBytes'] as const;
    assert.deepEqual(Object.keys(limits).sort(), [...keys].sort());
    assert.deepEqual(Object.keys(flowControl.hostReceive).sort(), [...keys].sort());
    assert.deepEqual(Object.keys(request.params.flowControl.receive).sort(), [...keys].sort());
    for (const key of keys) {
      assert.ok(Number.isSafeInteger(limits[key]) && limits[key] > 0);
      assert.ok(limits[key] <= request.params.flowControl.receive[key]);
    }
    assert.ok(limits.maximumFrameBytes >= 1024);
    assert.ok(flowControl.hostReceive.maximumFrameBytes >= 1024);
  });

  it('sends the snapshot as the first data message and allows it to exceed the window', () => {
    const bytes = serializedBytes(snapshot);
    assert.equal(bytes, 520);
    assert.ok(bytes <= limits.maximumFrameBytes);
    assert.ok(bytes > limits.windowBytes);
    assert.equal(snapshot.params.snapshot.resource, request.params.channel);
    const firstServerNotification = examples
      .slice(examples.indexOf(acceptance) + 1)
      .find(message => 'method' in message && message.method !== 'channel/credit');
    assert.equal(firstServerNotification, snapshot);
    assert.ok(examples.every(message => !('method' in message) || !message.method.endsWith('/ready')));
    assert.equal(credits[0].params.consumedBytes, bytes);
  });

  it('charges direct output, then renegotiates limits without counters on reconnect', () => {
    assert.equal(serializedBytes(output), 284);
    assert.ok(serializedBytes(output) <= limits.maximumFrameBytes);
    const boundary = serializedBytes(snapshot) + serializedBytes(output);
    assert.equal(boundary, 804);
    assert.deepEqual(credits.map(message => message.params.consumedBytes), [520, boundary]);

    const reconnect = examples.find((message): message is AhpRequest<'reconnect'> =>
      'method' in message && message.method === 'reconnect');
    assert.ok(reconnect?.params.windows);
    const response = examples.find((message): message is AhpSuccessResponse<'reconnect'> =>
      'result' in message && message.id === reconnect.id);
    assert.ok(response?.result.windows);
    assert.equal(response.result.type, 'replay');
    if (response.result.type !== 'replay') assert.fail('Expected replay');
    assert.deepEqual(response.result.actions, []);
    assert.deepEqual(response.result.missing, ['ahp-terminal:/t2']);
    const retained = response.result.windows.items[0];
    assert.equal(retained.recovery, 'replay');
    assert.deepEqual(retained.flowControl, acceptance.result.flowControl);
    assert.deepEqual(Object.keys(retained).sort(), ['channel', 'flowControl', 'recovery']);
    for (const item of reconnect.params.windows.items) {
      assert.deepEqual(Object.keys(item).sort(), ['channel', 'flowControl', 'lastAppliedServerSeq']);
      assert.deepEqual(item.flowControl, request.params.flowControl);
    }
    // The server can lower the offered limits but never raise them.
    const offer = reconnect.params.windows.items[0].flowControl.receive;
    for (const key of ['windowBytes', 'maximumFrameBytes'] as const) {
      assert.ok(retained.flowControl.clientReceive[key] <= offer[key]);
    }
    assert.equal(reconnect.params.windows.items[0].lastAppliedServerSeq, output.params.serverSeq);
  });

  it('charges the alternative fragments by their full size, including envelopes', () => {
    assert.equal(frames.length, 2);
    let text = '';
    for (const [index, frame] of frames.entries()) {
      assert.equal(frame.params.channel, output.params.channel);
      assert.ok(frame.params.data.length > 0);
      assert.ok(serializedBytes(frame) <= limits.maximumFrameBytes);
      assert.equal(frame.params.final === true, index === frames.length - 1);
      text += frame.params.data;
    }
    assert.equal(text, JSON.stringify(output));
    assert.deepEqual(JSON.parse(text), output);
    assert.equal(utf16Bytes(text), 284);
    assert.deepEqual(frames.map(frame => serializedBytes(frame)), [360, 374]);
    const fragmentedCharge = frames.reduce((sum, frame) => sum + serializedBytes(frame), 0);
    assert.equal(fragmentedCharge, 734);
    assert.equal(serializedBytes(snapshot) + fragmentedCharge, 1254);
  });

  it('sends a large atomic tool-call action as fragments that each count against the window', () => {
    const toolCall: AhpServerNotification<'action'> = {
      ...output,
      params: {
        ...output.params,
        channel: 'ahp-chat:/c1',
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: 't1',
          toolCallId: 'call-1',
          invocationMessage: 'Write a file',
          toolInput: JSON.stringify({ content: 'x'.repeat(16384) }),
        },
      },
    };
    const text = JSON.stringify(toolCall);
    assert.ok(utf16Bytes(text) > limits.maximumFrameBytes);
    assert.ok(utf16Bytes(text) > limits.windowBytes * 64);

    const channel = toolCall.params.channel;
    const envelopeBytes = serializedBytes({ jsonrpc: '2.0', method: 'channel/frame', params: { channel, data: '', final: true } });
    const escapedBytes = (char: string) => utf16Bytes(JSON.stringify(char)) - 4;

    // The chat subscription has its own window, so its counters start at zero.
    let sent = 0;
    let charged = 0;
    let consumed = 0;
    let stored = '';
    let index = 0;
    let fragments = 0;
    let creditsSent = 0;
    while (index < text.length) {
      // The receiver stores fragments for reassembly and returns credit once the window is full.
      if (sent - consumed >= limits.windowBytes) {
        consumed = sent;
        creditsSent++;
      }
      assert.ok(sent - consumed < limits.windowBytes, 'a fragment must start below the window');

      // Size the fragment to the remaining credit without exceeding the hard frame limit,
      // adding each character's escaped size instead of serializing again. The fragment
      // always carries at least one character: when the envelope alone exceeds the remaining
      // credit, the fragment goes slightly past the soft window.
      const remainingCredit = limits.windowBytes - (sent - consumed);
      let wire = envelopeBytes;
      let end = index;
      while (end < text.length && (end === index || wire < remainingCredit)) {
        const next = wire + escapedBytes(text[end]);
        if (next > limits.maximumFrameBytes) break;
        wire = next;
        end++;
      }
      assert.ok(end > index, 'fragments must not be empty');
      const frame: AhpServerNotification<'channel/frame'> = {
        jsonrpc: '2.0',
        method: 'channel/frame',
        params: { channel, data: text.slice(index, end), ...(end === text.length ? { final: true } : {}) },
      };
      const frameBytes = serializedBytes(frame);
      assert.ok(frameBytes <= limits.maximumFrameBytes);
      assert.ok(frameBytes <= wire);
      sent += frameBytes;
      charged += frameBytes;
      assert.ok(sent - consumed < limits.windowBytes + limits.maximumFrameBytes);
      stored += frame.params.data;
      index = end;
      fragments++;
    }

    assert.equal(stored, text);
    assert.deepEqual(JSON.parse(stored), toolCall);
    assert.equal(sent, charged);
    assert.ok(charged > utf16Bytes(text), 'fragment envelopes and escaping count against the window');
    assert.ok(fragments > 64);
    assert.ok(creditsSent > 0);
  });

  it('keeps original whitespace and escape lengths rather than reserializing for credit', () => {
    const text = '{ "jsonrpc": "2.0", "method": "action", "params": { "channel": "ahp-terminal:/t1", "action": { "type": "terminal/data", "data": "\\u0061" }, "serverSeq": 7 } }';
    assert.ok(utf16Bytes(text) > serializedBytes(JSON.parse(text)));
    assert.equal(utf16Bytes('A\u00e9\ud83d\ude00'), 8);
    assert.notEqual(utf16Bytes('A\u00e9\ud83d\ude00'), Buffer.byteLength('A\u00e9\ud83d\ude00', 'utf8'));
  });
});
