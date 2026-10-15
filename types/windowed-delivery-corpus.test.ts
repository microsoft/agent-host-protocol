import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { countsAgainstWindow } from './window-exempt.generated.js';

const dir = new URL('./test-cases/windowed-delivery/', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));

const OPS = new Set([
  'subscribe', 'expectSent', 'expectNotSent', 'respond', 'hostSends', 'hostCreditsAll',
  'next', 'advance', 'release', 'send', 'unsubscribe', 'expectStatus', 'expectClosed',
]);

interface Step {
  op: string;
  text?: string;
  channel?: string;
  expectBytes?: number;
  match?: { method?: string; params?: { channel?: string; consumedBytes?: number } };
}

describe('windowed-delivery corpus', () => {
  it('sizes.json counts UTF-16 code units of the raw text', () => {
    const { cases } = read('sizes.json') as { cases: { name: string; text: string; utf16Bytes: number; utf8Bytes: number }[] };
    assert.ok(cases.length > 0);
    for (const c of cases) {
      assert.equal(c.utf16Bytes, c.text.length * 2, c.name);
      assert.equal(c.utf8Bytes, Buffer.byteLength(c.text, 'utf8'), c.name);
    }
  });

  const names = readdirSync(new URL('scenarios/', dir)).filter(n => n.endsWith('.json')).sort();

  it('has scenarios', () => assert.ok(names.length >= 20));

  for (const name of names) {
    it(`scenario ${name} is well formed`, () => {
      const scenario = read(`scenarios/${name}`) as { description: string; steps: Step[] };
      assert.equal(typeof scenario.description, 'string');
      const frames = new Map<string, string>();
      const lastCredit = new Map<string, number>();
      for (const step of scenario.steps) {
        assert.ok(OPS.has(step.op), `${name}: unknown op ${step.op}`);
        if (step.op === 'hostSends') {
          const message = JSON.parse(step.text!);
          assert.equal(message.jsonrpc, '2.0');
          assert.equal(typeof message.method, 'string');
          if (message.method === 'channel/frame') {
            const channel = message.params.channel as string;
            const joined = (frames.get(channel) ?? '') + message.params.data;
            if (message.params.final) {
              frames.delete(channel);
              const inner = JSON.parse(joined);
              assert.ok(countsAgainstWindow(inner.method), `${name}: fragmented control message`);
            } else {
              frames.set(channel, joined);
            }
          }
        }
        if (step.op === 'expectSent' && step.match?.method === 'channel/credit') {
          const channel = step.match.params!.channel!;
          const consumed = step.match.params!.consumedBytes!;
          assert.ok(consumed > (lastCredit.get(channel) ?? 0), `${name}: credit must increase`);
          lastCredit.set(channel, consumed);
        }
      }
    });
  }
});
