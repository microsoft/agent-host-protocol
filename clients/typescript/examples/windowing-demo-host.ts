/**
 * A small in-memory AHP host for the windowing examples.
 *
 * It implements only what the examples need: `initialize`, a windowed
 * `subscribe` to one terminal, and the host side of the window rules:
 *
 * - It counts every data message it sends, in UTF-16 bytes, and stops while
 *   `sent - consumed` is at or above the client's window.
 * - It counts every data message the client sends, and returns
 *   `channel/credit` after it has processed each one.
 *
 * A real host applies the same rules to every windowed subscription.
 */

import { InMemoryTransport, type AhpTransport } from '../src/client/index.js';
import { ActionType, SUPPORTED_PROTOCOL_VERSIONS, type StateAction } from '../src/types/index.js';
import type { ChannelFlowControl } from '../src/types/common/state.js';

export interface DemoHostOptions {
  /** The largest window the host accepts for data that it sends. */
  readonly clientWindowBytes: number;
  /** The window the host offers for data that the client sends. */
  readonly hostWindowBytes: number;
  /** How long the host takes to process one message from the client. */
  readonly inputDelayMs?: number;
}

const MAXIMUM_FRAME_BYTES = 16_384;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const utf16Bytes = (text: string) => text.length * 2;
const log = (message: string) => console.log(`  host   | ${message}`);

export class DemoHost {
  /** The half of the transport to give to `AhpClient`. */
  readonly clientTransport: AhpTransport;
  /** Terminal input that the host has processed, in order. */
  receivedInput = '';

  private readonly transport: AhpTransport;
  private readonly subscribed: Promise<void>;
  private resolveSubscribed!: () => void;
  private limits?: ChannelFlowControl;
  private channel = '';
  private serverSeq = 0;

  // Data that the host sends to the client.
  private sentBytes = 0;
  private consumedBytes = 0;
  private creditWaiter?: () => void;

  // Data that the client sends to the host.
  private receivedBytes = 0;
  private processedBytes = 0;
  private inputQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: DemoHostOptions) {
    [this.clientTransport, this.transport] = InMemoryTransport.pair();
    this.subscribed = new Promise(resolve => { this.resolveSubscribed = resolve; });
    void this.run();
  }

  /** Resolves after the host has accepted the subscription and sent the snapshot. */
  whenSubscribed(): Promise<void> {
    return this.subscribed;
  }

  /** Send one terminal action, first waiting for credit if the client's window is full. */
  async sendAction(action: StateAction): Promise<void> {
    const window = this.limits!.clientReceive.windowBytes;
    if (this.sentBytes - this.consumedBytes >= window) {
      log(`window full (${this.sentBytes - this.consumedBytes} of ${window} bytes outstanding); pausing output`);
      while (this.sentBytes - this.consumedBytes >= window) {
        await new Promise<void>(resolve => { this.creditWaiter = resolve; });
      }
      log(`credit received (consumedBytes=${this.consumedBytes}); resuming output`);
    }
    this.sendData({
      jsonrpc: '2.0',
      method: 'action',
      params: { channel: this.channel, action, serverSeq: ++this.serverSeq },
    });
  }

  close(): void {
    void this.transport.close();
  }

  private sendData(message: object): void {
    const text = JSON.stringify(message);
    this.sentBytes += utf16Bytes(text);
    void this.transport.send(text);
  }

  private sendControl(message: object): void {
    void this.transport.send(JSON.stringify(message));
  }

  private async run(): Promise<void> {
    for (;;) {
      const frame = await this.transport.recv().catch(() => null);
      if (!frame) return;
      if (frame.kind !== 'text') continue;
      const message = JSON.parse(frame.text);
      switch (message.method) {
        case 'initialize':
          this.sendControl({
            jsonrpc: '2.0',
            id: message.id,
            result: { protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0], serverSeq: 0, snapshots: [] },
          });
          break;
        case 'subscribe':
          this.acceptSubscription(message);
          break;
        case 'channel/credit':
          // Credit is a running total, so ignore values that are not larger.
          if (message.params.consumedBytes > this.consumedBytes) {
            this.consumedBytes = message.params.consumedBytes;
            this.creditWaiter?.();
            this.creditWaiter = undefined;
          }
          break;
        case 'dispatchAction':
          this.receiveInput(frame.text, message.params.action);
          break;
      }
    }
  }

  private acceptSubscription(message: any): void {
    const offered = message.params.flowControl?.receive;
    if (!offered) throw new Error('the examples expect a windowed subscribe');
    this.channel = message.params.channel;
    // A host can lower the limits that the client offered, but never raise them.
    this.limits = {
      clientReceive: {
        windowBytes: Math.min(offered.windowBytes, this.options.clientWindowBytes),
        maximumFrameBytes: Math.min(offered.maximumFrameBytes, MAXIMUM_FRAME_BYTES),
      },
      hostReceive: { windowBytes: this.options.hostWindowBytes, maximumFrameBytes: MAXIMUM_FRAME_BYTES },
    };
    log(`accepted windowed delivery: client window ${this.limits.clientReceive.windowBytes} bytes `
      + `(offered ${offered.windowBytes}), host window ${this.limits.hostReceive.windowBytes} bytes`);
    this.sendControl({ jsonrpc: '2.0', id: message.id, result: { flowControl: this.limits } });

    // The first data message on a windowed subscription is always the snapshot.
    this.sendData({
      jsonrpc: '2.0',
      method: 'channel/snapshot',
      params: {
        channel: this.channel,
        snapshot: {
          resource: this.channel,
          state: {
            title: 'demo shell',
            content: [],
            lifecycle: { status: 'running' },
            claim: { kind: 'client', clientId: 'windowing-example' },
          },
          fromSeq: this.serverSeq,
        },
      },
    });
    this.resolveSubscribed();
  }

  private receiveInput(text: string, action: StateAction): void {
    const bytes = utf16Bytes(text);
    this.receivedBytes += bytes;
    const limits = this.limits!.hostReceive;
    // The client can go past the window only with the message that fills it.
    if (this.receivedBytes - this.processedBytes > limits.windowBytes + limits.maximumFrameBytes) {
      log('client went past the host window');
    }
    // Process input one message at a time, then return credit for it.
    this.inputQueue = this.inputQueue.then(async () => {
      await sleep(this.options.inputDelayMs ?? 0);
      if (action.type === ActionType.TerminalInput) this.receivedInput += action.data;
      this.processedBytes += bytes;
      this.sendControl({
        jsonrpc: '2.0',
        method: 'channel/credit',
        params: { channel: this.channel, consumedBytes: this.processedBytes },
      });
    });
  }
}
