import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { AhpClient, InMemoryTransport, type ReceivedDelivery, type Subscription,
  type DeliveryEvent, type WindowOptions } from '../src/client/index.js';
import { utf16Bytes } from '../src/client/flow-control.js';
import { countsAgainstWindow } from '../src/types/window-exempt.generated.js';
import type { ClientNotificationMap } from '../src/types/common/messages.js';

const corpus = new URL('../../../types/test-cases/windowed-delivery/', import.meta.url);
type ObjectValue = Record<string, any>;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function matches(actual: any, expected: any): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (Array.isArray(expected)) {
    try { assert.deepEqual(actual, expected); return true; } catch { return false; }
  }
  return actual !== null && typeof actual === 'object'
    && Object.entries(expected).every(([key, value]) => matches(actual[key], value));
}

async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('corpus expectation timed out after 1 second')), 1000);
    })]);
  } finally { clearTimeout(timer!); }
}

class Driver {
  readonly transport = InMemoryTransport.pair();
  readonly client: AhpClient;
  readonly sent: ObjectValue[] = [];
  readonly requests: ObjectValue[] = [];
  readonly sentBytes = new Map<string, number>();
  readonly subscriptions = new Map<string, Promise<Subscription<DeliveryEvent>>>();
  readonly readers = new Map<string, AsyncIterableIterator<ReceivedDelivery>>();
  readonly deliveries = new Map<string, ReceivedDelivery[]>();
  readonly pendingNext = new Map<string, Promise<IteratorResult<ReceivedDelivery>>>();
  readonly sends: Promise<void>[] = [];
  readonly recording: Promise<void>;

  constructor(config: ObjectValue) {
    this.client = new AhpClient(this.transport[0], { windowing: config });
    this.client.connect();
    this.recording = this.record();
  }

  private async record(): Promise<void> {
    while (true) {
      const frame = await this.transport[1].recv();
      if (!frame) return;
      assert.equal(frame.kind, 'text');
      if (frame.kind !== 'text') throw new Error('not text');
      const message = JSON.parse(frame.text);
      Object.defineProperty(message, 'wireBytes', { value: utf16Bytes(frame.text) });
      this.sent.push(message);
      if ('id' in message) this.requests.push(message);
      else if (countsAgainstWindow(message.method)) {
        const uri = message.params.channel;
        this.sentBytes.set(uri, (this.sentBytes.get(uri) ?? 0) + utf16Bytes(frame.text));
      }
    }
  }

  async wait(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 1000;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error('corpus expectation timed out after 1 second');
      await delay(1);
    }
  }

  async reader(channel: string): Promise<AsyncIterableIterator<ReceivedDelivery>> {
    if (!this.readers.has(channel)) {
      const subscription = await within(this.subscriptions.get(channel)!);
      this.readers.set(channel, subscription.deliveries());
    }
    return this.readers.get(channel)!;
  }

  async step(step: ObjectValue): Promise<void> {
    const channel = step.channel as string;
    switch (step.op) {
      case 'subscribe': {
        const windowed = step.window !== undefined
          ? { ...step.window, receive: step.receive ?? 'auto', coalescing: step.coalescing ?? true } as WindowOptions
          : undefined;
        const promise = this.client.subscribe(channel, windowed ? { windowed } : {})
          .then(({ subscription }) => subscription as Subscription<DeliveryEvent>);
        void promise.catch(() => undefined);
        this.subscriptions.set(channel, promise);
        break;
      }
      case 'respond': {
        await this.wait(() => this.requests.some(r => r.method === step.to));
        const index = this.requests.findIndex(r => r.method === step.to);
        const request = this.requests.splice(index, 1)[0];
        this.transport[1].send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: step.result }));
        break;
      }
      case 'hostSends': this.transport[1].send(step.text); break;
      case 'unsubscribe':
        await this.client.unsubscribe(channel);
        this.readers.delete(channel);
        this.pendingNext.delete(channel);
        this.subscriptions.delete(channel);
        break;
      case 'hostCreditsAll':
        this.transport[1].send(JSON.stringify({ jsonrpc: '2.0', method: 'channel/credit',
          params: { channel, consumedBytes: this.sentBytes.get(channel) ?? 0 } }));
        break;
      case 'expectSent': {
        let candidate: ObjectValue;
        let fragments = '';
        while (true) {
          await this.wait(() => this.sent.length > 0);
          candidate = this.sent.shift()!;
          if (step.reassemble && candidate.method === 'channel/frame') {
            assert.equal(candidate.params.channel, step.match.params.channel);
            const limit = this.client.flowControl(candidate.params.channel).limits!.hostReceive.maximumFrameBytes;
            assert.ok(candidate.wireBytes <= limit);
            fragments += candidate.params.data;
            if (!candidate.params.final) continue;
            candidate = JSON.parse(fragments);
          }
          if (matches(candidate, step.match)) break;
          if (candidate.method === 'channel/credit') continue;
          assert.fail(`unexpected sent message: ${JSON.stringify(candidate)}; expected ${JSON.stringify(step.match)}`);
        }
        for (const path of step.absent ?? []) {
          let value: any = candidate!;
          for (const component of path.split('.')) value = value?.[component];
          assert.equal(value, undefined, `${path} must be absent`);
        }
        break;
      }
      case 'expectNotSent': {
        const until = Date.now() + step.withinMs;
        do {
          assert.ok(!this.sent.some(s => matches(s, step.match)), `unexpected message ${JSON.stringify(step.match)}`);
          await delay(1);
        } while (Date.now() < until);
        break;
      }
      case 'next': {
        const reader = await this.reader(channel);
        const next = this.pendingNext.get(channel) ?? reader.next();
        this.pendingNext.delete(channel);
        const result = await within(next);
        assert.ok(!result.done);
        assert.ok(matches(result.value.notification, step.expect),
          `delivery ${JSON.stringify(result.value.notification)} did not match ${JSON.stringify(step.expect)}`);
        if (step.expectBytes !== undefined) assert.equal(result.value.bytes, step.expectBytes);
        const history = this.deliveries.get(channel) ?? [];
        history.push(result.value); this.deliveries.set(channel, history);
        break;
      }
      case 'advance': {
        const promise = (await this.reader(channel)).next();
        void promise.catch(() => undefined);
        this.pendingNext.set(channel, promise);
        break;
      }
      case 'release': this.deliveries.get(channel)![step.index].release(); break;
      case 'send': {
        const promise = this.client.notifyAsync(step.method as keyof ClientNotificationMap, step.params);
        void promise.catch(() => undefined);
        this.sends.push(promise);
        break;
      }
      case 'expectStatus':
        await this.wait(() => matches(this.client.flowControl(channel), step.match));
        break;
      case 'expectClosed':
        await this.wait(() => this.client.connectionState.status === 'closed');
        assert.equal((this.client.connectionState as any).reason.error.kind, 'protocol');
        break;
      default: assert.fail(`unknown corpus operation ${step.op}`);
    }
  }

  async close(): Promise<void> {
    await this.client.shutdown();
    await this.transport[1].close();
    await this.recording;
    await Promise.allSettled(this.sends);
  }
}

const sizes = JSON.parse(readFileSync(new URL('sizes.json', corpus), 'utf8'));
for (const size of sizes.cases) {
  test(`window corpus size: ${size.name}`, () => {
    assert.equal(utf16Bytes(size.text), size.utf16Bytes);
    assert.equal(new TextEncoder().encode(size.text).length, size.utf8Bytes);
  });
}

for (const file of readdirSync(new URL('scenarios/', corpus)).filter(name => name.endsWith('.json')).sort()) {
  test(`window corpus: ${file}`, async () => {
    const scenario = JSON.parse(readFileSync(new URL(`scenarios/${file}`, corpus), 'utf8'));
    const driver = new Driver(scenario.windowing);
    try {
      for (let i = 0; i < scenario.steps.length; i++) {
        try { await driver.step(scenario.steps[i]); }
        catch (cause) { throw new Error(`${file}, step ${i}: ${scenario.steps[i].op}`, { cause }); }
      }
    } finally { await driver.close(); }
  });
}
