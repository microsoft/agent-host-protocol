import type { ChannelFlowControl, ChannelReceiveLimits, URI } from '../types/common/state.js';
import type { ChannelDeliveryResumeOptions, SubscribeParams, SubscribeResult, ReconnectResult, ReconnectParams } from '../types/common/commands.js';
import type { JsonRpcNotification } from '../types/common/messages.js';
import { countsAgainstWindow } from '../types/window-exempt.generated.js';
import { AsyncBroadcastQueue } from './async-queue.js';
import { BackpressureError, ClientClosedError, TransportError } from './error.js';
import type { ClientDeliveryEvent, ReceivedDelivery } from './events.js';
import type { AhpClient, Subscription } from './client.js';
import type { DeliveryEvent } from './events.js';
import { deliveryEvent } from './events.js';
import type { AhpTransport, JsonRpcMessage } from './transport.js';

export interface WindowOptions {
  windowBytes?: number;
  maximumFrameBytes?: number;
  receive?: 'auto' | 'manual';
  coalescing?: boolean;
}

export interface CoalescerContext {
  readonly channel: URI;
  readonly direction: 'receive' | 'send';
}

/** Custom coalescers run before built-ins, on adjacent, still queued messages. */
export interface ChannelCoalescer {
  readonly method: string;
  merge(earlier: JsonRpcNotification, later: JsonRpcNotification,
    context: CoalescerContext): JsonRpcNotification | undefined;
}

export interface WindowingConfig {
  /** Default receive window, in UTF-16 bytes. Default 262144. */
  windowBytes?: number;
  /** Defaults to the transport's limit, or 1048576 if unknown. */
  maximumFrameBytes?: number;
  /** Limit for data queued behind the head send, in UTF-16 bytes. Default 1048576. */
  maxBufferedSendBytes?: number;
  coalescers?: readonly ChannelCoalescer[];
}

export interface FlowControlStatus {
  readonly mode: 'ordinary' | 'windowed';
  readonly fallbackReason?: 'declined' | 'transport';
  readonly limits?: ChannelFlowControl;
  readonly outstandingSendBytes: number;
  readonly bufferedSendBytes: number;
  readonly bufferedReceiveBytes: number;
  readonly writable: boolean;
}

export interface FlowControlEvent {
  readonly channel: URI;
  readonly type: 'blocked' | 'unblocked' | 'creditSent' | 'creditReceived'
    | 'fragmentedMessageReceived' | 'fragmentedMessageSent' | 'coalesced'
    | 'resumed' | 'dropped';
  readonly status: FlowControlStatus;
  readonly bytes?: number;
}

export const DEFAULT_MAXIMUM_FRAME_BYTES = 1_048_576;
const MAX_CONTROL_BYTES = 1_048_576;
const CONTROL_INTERVAL_MS = 10;
const CONTROL_BURST = 256;
export function utf16Bytes(text: string): number { return text.length * 2; }

function immutableLimits(limits: ChannelFlowControl): ChannelFlowControl {
  return Object.freeze({ clientReceive: Object.freeze({ ...limits.clientReceive }),
    hostReceive: Object.freeze({ ...limits.hostReceive }) });
}

function protocol(message: string): never { throw new TransportError('protocol', message); }
function validLimits(limits: ChannelReceiveLimits): void {
  if (!limits || !Number.isSafeInteger(limits.windowBytes) || limits.windowBytes < 1
    || !Number.isSafeInteger(limits.maximumFrameBytes) || limits.maximumFrameBytes < 1024) {
    protocol('invalid channel flow-control limits');
  }
}

function params(n: JsonRpcNotification): Record<string, unknown> {
  return n.params as Record<string, unknown>;
}

function sameMetadata(a: Record<string, unknown>, b: Record<string, unknown>, omitted: string[]): boolean {
  const rest = (v: Record<string, unknown>) => Object.fromEntries(
    Object.entries(v).filter(([k]) => !omitted.includes(k)));
  const canonical = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
    return JSON.stringify(v) ?? 'undefined';
  };
  return canonical(rest(a)) === canonical(rest(b));
}

function decodeBase64(data: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data) || !data) {
    protocol('invalid tcp/data base64');
  }
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (encodeBase64(bytes) !== data) protocol('noncanonical tcp/data base64');
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function mergeNotifications(a: JsonRpcNotification, b: JsonRpcNotification,
  context: CoalescerContext, customs: readonly ChannelCoalescer[]): JsonRpcNotification | undefined {
  if (a.method !== b.method || !countsAgainstWindow(a.method)
    || ['channel/frame', 'channel/snapshot', 'tcp/eof', 'dispatchAction'].includes(a.method)) return;
  const ap = params(a), bp = params(b);
  if (ap.channel !== bp.channel || ap.origin !== undefined || bp.origin !== undefined
    || ap.rejectionReason !== undefined || bp.rejectionReason !== undefined) return;
  for (const custom of customs) {
    if (custom.method !== a.method) continue;
    const merged = custom.merge(a, b, context);
    if (merged) {
      if (merged.method !== a.method || params(merged).channel !== ap.channel
        || !countsAgainstWindow(merged.method)) protocol('coalescer changed method or channel');
      if (context.direction === 'receive' && a.method === 'action') {
        return { ...merged, params: { ...params(merged), serverSeq: bp.serverSeq } };
      }
      return merged;
    }
  }
  if (context.direction === 'send' && a.method === 'tcp/data') {
    const first = decodeBase64(ap.data as string), second = decodeBase64(bp.data as string);
    const bytes = new Uint8Array(first.length + second.length);
    bytes.set(first); bytes.set(second, first.length);
    return { ...b, params: { ...bp, data: encodeBase64(bytes) } };
  }
  if (context.direction !== 'receive' || a.method !== 'action') return;
  const aa = ap.action as Record<string, unknown>, ba = bp.action as Record<string, unknown>;
  if (!aa || !ba || aa.type !== ba.type
    || !sameMetadata(ap, bp, ['action', 'serverSeq'])) return;
  const field = aa.type === 'terminal/data' ? 'data' : aa.type === 'chat/delta' ? 'content' : undefined;
  if (!field || typeof aa[field] !== 'string' || typeof ba[field] !== 'string'
    || !sameMetadata(aa, ba, [field])) return;
  return { ...b, params: { ...bp, action: { ...ba, [field]: aa[field] + ba[field] } } };
}

interface Entry {
  notification: JsonRpcNotification;
  bytes: number;
  debit: number;
  epoch: number;
}
interface Send {
  notification: JsonRpcNotification;
  serialized: string;
  text?: string;
  offset: number;
  bytes: number;
  completions: Array<{ resolve(): void; reject(e: Error): void }>;
  cleanup: Array<() => void>;
  cancelable: boolean;
}

/** Persistent owner queue; migrated by the host runtime, never by observer streams. @internal */
export class WindowChannel {
  owner?: Subscription<DeliveryEvent>;
  readonly rebound = new Set<(client: AhpClient) => void>();
  readonly closed = new Set<(error?: Error) => void>();
  readonly changes = new AsyncBroadcastQueue<FlowControlStatus>(1);
  options: WindowOptions;
  offer?: ChannelReceiveLimits;
  limits?: ChannelFlowControl;
  fallbackReason?: 'declined' | 'transport';
  epoch = 0;
  sent = 0;
  remoteConsumed = 0;
  received = 0;
  released = 0;
  advertised = 0;
  lastAppliedServerSeq = 0;
  expectingSnapshot = false;
  connected = true;
  pauseNewMessages = false;
  fragment = '';
  fragmentBytes = 0;
  fragmenting = false;
  sends: Send[] = [];
  private queue: Entry[] = [];
  private waiter?: { resolve(v: IteratorResult<ReceivedDelivery>): void; reject(e: Error): void };
  private current?: ReceivedDelivery;
  private terminal = false;
  private error?: Error;
  private timer?: ReturnType<typeof setTimeout>;
  private installed = false;
  private ownerHasRead = false;
  private waitingForOwnerSnapshot = false;
  private lastStatus = '';
  private wasWritable = true;
  private readonly retainedDebits = new Map<number, number>();
  private tcpReset = false;
  private tcpReceivedEof = false;
  tcpSentEof = false;
  engine: WindowEngine;

  constructor(readonly uri: URI, options: WindowOptions, engine: WindowEngine,
    private readonly ordinaryBuffer: number) {
    this.options = options;
    this.engine = engine;
  }

  get status(): FlowControlStatus {
    return {
      mode: this.limits ? 'windowed' : 'ordinary',
      ...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
      ...(this.limits ? { limits: this.limits } : {}),
      outstandingSendBytes: this.sent - this.remoteConsumed,
      bufferedSendBytes: this.sends.reduce((sum, s) => sum + s.bytes, 0),
      bufferedReceiveBytes: this.received - this.released
        + [...this.retainedDebits.values()].reduce((sum, bytes) => sum + bytes, 0),
      writable: this.connected && !this.terminal && !this.tcpReset && !this.tcpSentEof && !this.pauseNewMessages
        && (!this.limits || this.sent - this.remoteConsumed < this.limits.hostReceive.windowBytes)
        && this.sends.reduce((sum, s) => sum + s.bytes, 0) < this.engine.maxBufferedSendBytes,
    };
  }

  get hasInstalled(): boolean { return this.installed; }

  changed(): void {
    const status = this.status, key = JSON.stringify(status);
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.changes.publish(status);
    if (status.writable !== this.wasWritable) {
      this.wasWritable = status.writable;
      this.engine.emit(this, status.writable ? 'unblocked' : 'blocked');
    }
  }

  async waitWritable(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (this.status.writable) return;
    if (!this.connected || this.terminal || this.tcpReset || this.tcpSentEof) throw this.error ?? new ClientClosedError();
    const reader = this.changes.reader();
    let abort: (() => void) | undefined;
    const cancellation = new Promise<never>((_, reject) => {
      abort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      while (!this.status.writable) {
        if (!this.connected || this.terminal || this.tcpReset || this.tcpSentEof) throw this.error ?? new ClientClosedError();
        await Promise.race([reader.next(), cancellation]);
      }
    } finally {
      if (abort) signal?.removeEventListener('abort', abort);
      await reader.return?.();
    }
  }

  install(result: SubscribeResult, offered?: ChannelReceiveLimits, transportFallback = false): void {
    const oldWindowed = !!this.limits;
    if (result.flowControl) {
      if (!offered || result.snapshot) protocol('unsolicited flow control or snapshot in accepted result');
      this.engine.validateAcceptance(result.flowControl, offered, this.uri);
      if (!oldWindowed) this.resetCounters();
      this.limits = immutableLimits(result.flowControl);
      this.fallbackReason = undefined;
      this.expectingSnapshot = true;
    } else {
      if (this.uri.startsWith('ahp-tcp:')) protocol('TCP subscription requires windowed delivery');
      if (this.sends.some(send => send.offset > 0)) protocol('host declined while a fragmented send is active');
      this.limits = undefined;
      this.fallbackReason = transportFallback ? 'transport' : offered ? 'declined' : undefined;
      this.expectingSnapshot = false;
      if (oldWindowed) this.resetCounters();
      if (result.snapshot) {
        const notification = { jsonrpc: '2.0' as const, method: 'channel/snapshot',
          params: { channel: this.uri, snapshot: result.snapshot } };
        this.enqueue({ notification, bytes: 0, debit: 0, epoch: this.epoch }, !this.installed);
        this.engine.observe(this.uri, notification);
      }
    }
    this.installed = true;
    this.pauseNewMessages = false;
    this.connected = true;
    this.changed();
    this.engine.schedule();
  }

  resetCounters(): void {
    const held = this.received - this.released;
    if (held > 0) this.retainedDebits.set(this.epoch, held);
    this.epoch++;
    this.sent = this.remoteConsumed = this.received = this.released = this.advertised = 0;
    this.fragment = ''; this.fragmentBytes = 0; this.fragmenting = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async waitForFragment(): Promise<void> {
    while (this.sends[0]?.offset) {
      const send = this.sends[0];
      await new Promise<void>((resolve, reject) => send.completions.push({ resolve, reject }));
    }
  }

  receive(notification: JsonRpcNotification, size: number | undefined): void {
    if (!this.connected) protocol('channel traffic before reconnect result');
    if (this.limits && !countsAgainstWindow(notification.method)) this.engine.checkControl(size);
    if (this.tcpReset && notification.method !== 'tcp/reset') return;
    if (notification.method === 'channel/credit') {
      if (!this.limits) protocol('credit on ordinary subscription');
      const consumed = params(notification).consumedBytes as number;
      if (!Number.isSafeInteger(consumed) || consumed < 0 || consumed > this.sent) {
        protocol('channel credit exceeds bytes sent');
      }
      if (consumed > this.remoteConsumed) {
        this.remoteConsumed = consumed;
        this.engine.emit(this, 'creditReceived', consumed);
        this.changed(); this.engine.schedule();
      }
      return;
    }
    const counted = !!this.limits && countsAgainstWindow(notification.method);
    if (counted) {
      if (size === undefined) protocol('windowed transport did not preserve raw JSON text');
      if (size > this.limits!.clientReceive.maximumFrameBytes) protocol('oversized channel data message');
      this.received = this.add(this.received, size);
    }
    const debit = counted ? size! : 0;
    if (notification.method === 'channel/snapshot' && !this.limits) protocol('snapshot notification on ordinary subscription');
    if (notification.method === 'channel/frame') {
      if (!this.limits) protocol('fragment on ordinary subscription');
      const p = params(notification);
      if (typeof p.data !== 'string' || !p.data || (p.final !== undefined && typeof p.final !== 'boolean')) {
        protocol('invalid channel fragment');
      }
      const first = p.data.charCodeAt(0), last = p.data.charCodeAt(p.data.length - 1);
      if ((first >= 0xdc00 && first <= 0xdfff) || (last >= 0xd800 && last <= 0xdbff)) {
        protocol('fragment divides UTF-16 surrogate pair');
      }
      this.fragmenting = true;
      this.fragment += p.data;
      this.fragmentBytes = this.add(this.fragmentBytes, debit);
      if (!p.final) { this.releaseBytes(debit, this.epoch); this.changed(); return; }
      let joined: JsonRpcNotification;
      try { joined = JSON.parse(this.fragment) as JsonRpcNotification; }
      catch { protocol('invalid JSON in joined channel fragments'); }
      const bytes = this.fragmentBytes;
      this.fragment = ''; this.fragmentBytes = 0; this.fragmenting = false;
      if (!joined || joined.jsonrpc !== '2.0' || 'id' in joined || typeof joined.method !== 'string'
        || !joined.params || params(joined).channel !== this.uri || !countsAgainstWindow(joined.method)
        || joined.method === 'channel/frame') protocol('invalid joined notification or channel mismatch');
      this.engine.emit(this, 'fragmentedMessageReceived', bytes);
      this.acceptData(joined, bytes, debit);
    } else {
      if (counted && this.fragmenting) protocol('data interleaved with unfinished fragments');
      if (notification.method === 'tcp/reset') this.resetTcp();
      this.acceptData(notification, debit, debit);
    }
    this.changed();
  }

  private acceptData(notification: JsonRpcNotification, bytes: number, debit: number, observe = true): void {
    if (this.expectingSnapshot && countsAgainstWindow(notification.method)) {
      if (notification.method !== 'channel/snapshot') protocol('first channel data must be a snapshot');
      this.expectingSnapshot = false;
    }
    if (notification.method === 'channel/snapshot') {
      const snapshot = params(notification).snapshot as { resource?: string; fromSeq?: number };
      if (!snapshot || snapshot.resource !== this.uri) protocol('snapshot channel mismatch');
    }
    if (notification.method === 'tcp/data') {
      if (this.tcpReceivedEof) protocol('tcp/data after tcp/eof');
      decodeBase64(params(notification).data as string);
    } else if (notification.method === 'tcp/eof') this.tcpReceivedEof = true;
    const p = params(notification);
    const seq = notification.method === 'channel/snapshot'
      ? (p.snapshot as { fromSeq: number }).fromSeq : p.serverSeq;
    if ((notification.method === 'action' || notification.method === 'channel/snapshot')
      && (!Number.isSafeInteger(seq) || (seq as number) < 0)) protocol('invalid channel sequence number');
    if (typeof seq === 'number') this.lastAppliedServerSeq = Math.max(this.lastAppliedServerSeq, seq);
    this.enqueue({ notification, bytes, debit, epoch: this.epoch });
    if (observe) this.engine.observe(this.uri, notification);
  }

  seedOrdinary(notification: JsonRpcNotification): void {
    this.connected = true;
    this.acceptData(notification, 0, 0, false);
    this.changed();
  }

  private enqueue(entry: Entry, first = false): void {
    if (this.terminal) return;
    if (this.waitingForOwnerSnapshot) {
      if (entry.notification.method !== 'channel/snapshot') {
        this.releaseBytes(entry.debit, entry.epoch);
        return;
      }
      this.waitingForOwnerSnapshot = false;
    }
    if (first && this.queue.length) this.queue.unshift(entry);
    else {
      const tail = this.queue[this.queue.length - 1];
      const merged = this.limits && this.options.coalescing !== false && tail?.epoch === entry.epoch
        ? mergeNotifications(tail.notification, entry.notification,
          { channel: this.uri, direction: 'receive' }, this.engine.coalescers) : undefined;
      if (merged) {
        tail.notification = merged; tail.bytes += entry.bytes; tail.debit += entry.debit;
        this.engine.emit(this, 'coalesced', entry.bytes);
      } else this.queue.push(entry);
    }
    if (!this.limits && this.queue.length > this.ordinaryBuffer) {
      const pinned = !this.ownerHasRead && this.queue[0].notification.method === 'channel/snapshot';
      this.queue.splice(pinned ? 1 : 0, 1);
    }
    if (this.waiter) {
      const waiter = this.waiter; this.waiter = undefined;
      waiter.resolve({ value: this.take(), done: false });
    }
  }

  private take(): ReceivedDelivery {
    const entry = this.queue.shift()!;
    this.ownerHasRead = true;
    let released = false;
    const delivery: ReceivedDelivery = {
      event: deliveryEvent(entry.notification), notification: entry.notification, bytes: entry.bytes,
      release: () => {
        if (released) return;
        released = true;
        this.releaseBytes(entry.debit, entry.epoch);
      },
    };
    return delivery;
  }

  next(manual = false): Promise<IteratorResult<ReceivedDelivery>> {
    if (!manual) this.releaseCurrent();
    const finish = (value: IteratorResult<ReceivedDelivery>) => {
      if (!manual && !value.done) this.current = value.value;
      return value;
    };
    if (this.queue.length) return Promise.resolve(finish({ value: this.take(), done: false }));
    if (this.terminal) {
      if (this.error) return Promise.reject(this.error);
      return Promise.resolve({ value: undefined, done: true });
    }
    if (this.waiter) return Promise.reject(new TypeError('only one owner read may be pending'));
    return new Promise<IteratorResult<ReceivedDelivery>>((resolve, reject) => {
      this.waiter = { resolve: v => resolve(finish(v)), reject };
    });
  }

  releaseCurrent(): void { this.current?.release(); this.current = undefined; }

  abandonReader(): void {
    this.releaseCurrent();
    for (const entry of this.queue) this.releaseBytes(entry.debit, entry.epoch);
    this.queue = [];
    if (this.waiter) {
      const waiter = this.waiter; this.waiter = undefined;
      waiter.resolve({ value: undefined, done: true });
    }
  }

  prepareNewOwner(): void {
    this.abandonReader();
    this.ownerHasRead = false;
    this.waitingForOwnerSnapshot = true;
  }

  private add(total: number, bytes: number): number {
    if (!Number.isSafeInteger(total + bytes)) protocol('channel byte counter overflow');
    return total + bytes;
  }

  private releaseBytes(bytes: number, epoch: number): void {
    if (!bytes || this.terminal) return;
    if (epoch !== this.epoch) {
      const held = this.retainedDebits.get(epoch);
      if (held !== undefined) {
        if (held <= bytes) this.retainedDebits.delete(epoch);
        else this.retainedDebits.set(epoch, held - bytes);
        this.changed();
      }
      return;
    }
    if (!this.limits) return;
    this.released = this.add(this.released, bytes);
    this.changed();
    if (!this.connected || this.tcpReset) return;
    const threshold = Math.max(1, Math.min(16_384, Math.floor(this.limits.clientReceive.windowBytes / 4)));
    if (this.released - this.advertised >= threshold
      || this.received - this.advertised >= this.limits.clientReceive.windowBytes) this.flushCredit();
    else if (!this.timer) this.timer = setTimeout(() => this.flushCredit(), 5);
  }

  private flushCredit(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.connected || this.terminal || !this.limits || this.released <= this.advertised) return;
    this.advertised = this.released;
    this.engine.control({ jsonrpc: '2.0', method: 'channel/credit',
      params: { channel: this.uri, consumedBytes: this.advertised } }, this).catch(() => undefined);
    this.engine.emit(this, 'creditSent', this.advertised);
  }

  disconnect(error: Error, retain: boolean): void {
    this.connected = false;
    this.fragment = ''; this.fragmentBytes = 0; this.fragmenting = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.cancelSends(error);
    if (!retain) this.close(error);
    this.changed();
  }

  close(error?: Error, notify = true): void {
    if (this.terminal) return;
    this.connected = false;
    this.terminal = true;
    this.epoch++;
    this.limits = undefined;
    this.fragment = ''; this.fragmentBytes = 0; this.fragmenting = false;
    this.retainedDebits.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.releaseCurrent();
    if (!error) {
      for (const entry of this.queue) this.releaseBytes(entry.debit, entry.epoch);
      this.queue = [];
    }
    this.error = error;
    this.cancelSends(error ?? new ClientClosedError());
    if (this.waiter) {
      const w = this.waiter; this.waiter = undefined;
      if (error) w.reject(error); else w.resolve({ value: undefined, done: true });
    }
    this.changed();
    this.changes.close();
    this.engine.retire(this, error, notify);
    for (const callback of this.closed) callback(error);
    this.closed.clear();
    this.rebound.clear();
  }

  resetTcp(): void {
    this.tcpReset = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.current?.release();
    for (const entry of this.queue) this.releaseBytes(entry.debit, entry.epoch);
    this.queue = [];
    this.fragment = ''; this.fragmentBytes = 0; this.fragmenting = false;
    this.cancelSends(new ClientClosedError('TCP reset'));
  }
  get isTcpReset(): boolean { return this.tcpReset; }

  cancelSends(error: Error): void {
    for (const send of this.sends) {
      for (const cleanup of send.cleanup) cleanup();
      for (const completion of send.completions) completion.reject(error);
    }
    this.sends = [];
    this.changed();
  }

  get isClosed(): boolean { return this.terminal; }
}

interface Control {
  message: JsonRpcMessage | string;
  resolve(): void;
  reject(error: Error): void;
  exempt: boolean;
  creditOwner?: WindowChannel;
  started?: boolean;
  canceled?: Error;
}

/** Negotiation, accounting and one fair, serialized writer per connection. @internal */
export class WindowEngine {
  readonly channels = new Map<URI, WindowChannel>();
  readonly events = new AsyncBroadcastQueue<FlowControlEvent>(1024);
  readonly observations = new AsyncBroadcastQueue<ClientDeliveryEvent>(4096);
  readonly coalescers: readonly ChannelCoalescer[];
  readonly maxBufferedSendBytes: number;
  private controls: Control[] = [];
  private scheduled = false;
  private stopped = false;
  private cursor = 0;
  private retain = false;
  private controlPeriod = 0;
  private controlCount = 0;
  private receivedControlPeriod = 0;
  private receivedControlCount = 0;
  private readonly sendAbort = new AbortController();
  private currentControl?: Control;
  private driving = false;

  constructor(readonly transport: AhpTransport, readonly config: WindowingConfig,
    private readonly buffer: number, private readonly fail: (error: TransportError) => void,
    private readonly legacyObserve: (notification: JsonRpcNotification) => void,
    readonly client: AhpClient) {
    this.coalescers = [...(config.coalescers ?? [])];
    this.maxBufferedSendBytes = config.maxBufferedSendBytes ?? 1_048_576;
    if (!Number.isSafeInteger(this.maxBufferedSendBytes) || this.maxBufferedSendBytes < 1) {
      throw new TypeError('maxBufferedSendBytes must be a positive safe integer');
    }
  }

  observe(channel: URI, notification: JsonRpcNotification): void {
    this.observations.publish({ channel, event: deliveryEvent(notification) });
    this.legacyObserve(notification);
  }

  ensure(uri: URI, options: WindowOptions = {}): WindowChannel {
    let channel = this.channels.get(uri);
    if (!channel || channel.isClosed) {
      channel = new WindowChannel(uri, options, this, this.buffer);
      this.channels.set(uri, channel);
    }
    return channel;
  }

  retire(channel: WindowChannel, error?: Error, notify = true): void {
    if (this.channels.get(channel.uri) !== channel) return;
    this.channels.delete(channel.uri);
    this.controls = this.controls.filter(control => {
      if (control.creditOwner !== channel) return true;
      control.resolve(); return false;
    });
    this.client.retireWindowedSubscription(channel, error, notify && !this.stopped);
  }

  cancelRequest(id: number, error: Error): boolean {
    const matches = (control: Control) => typeof control.message !== 'string'
      && 'id' in control.message && control.message.id === id && 'method' in control.message;
    const index = this.controls.findIndex(matches);
    if (index >= 0) {
      this.controls.splice(index, 1)[0].reject(error);
      return true;
    }
    if (this.currentControl && matches(this.currentControl) && !this.currentControl.started) {
      this.currentControl.canceled = error;
      this.currentControl.reject(error);
      return true;
    }
    return false;
  }

  offer(options: WindowOptions): ChannelReceiveLimits {
    const limits = {
      windowBytes: options.windowBytes ?? this.config.windowBytes ?? 262_144,
      maximumFrameBytes: options.maximumFrameBytes ?? this.config.maximumFrameBytes
        ?? this.transport.maximumFrameBytes ?? DEFAULT_MAXIMUM_FRAME_BYTES,
    };
    validLimits(limits);
    return limits;
  }

  validateAcceptance(flow: ChannelFlowControl, offer: ChannelReceiveLimits, uri: URI): void {
    validLimits(flow.clientReceive); validLimits(flow.hostReceive);
    if (flow.clientReceive.windowBytes > offer.windowBytes
      || flow.clientReceive.maximumFrameBytes > offer.maximumFrameBytes) protocol('accepted limits exceed offer');
    const smallest = utf16Bytes(JSON.stringify({ jsonrpc: '2.0', method: 'channel/frame',
      params: { channel: uri, data: 'x', final: true } }));
    if (smallest > flow.clientReceive.maximumFrameBytes || smallest > flow.hostReceive.maximumFrameBytes) {
      protocol('channel URI cannot fit in a fragment');
    }
  }

  installSubscribe(p: SubscribeParams, result: SubscribeResult, fallback = false): void {
    const channel = this.channels.get(p.channel);
    if (channel) channel.install(result, p.flowControl?.receive, fallback);
    else if (result.flowControl) protocol('flow-control result has no local subscription');
  }

  resumeOptions(): ChannelDeliveryResumeOptions {
    return { items: [...this.channels.values()].filter(c => !!c.limits && !c.isClosed
      && !c.uri.startsWith('ahp-tcp:')).map(c => ({
      channel: c.uri, flowControl: { receive: this.offer(c.options) },
      lastAppliedServerSeq: c.lastAppliedServerSeq,
    })) };
  }

  retainChannels(): Map<URI, WindowChannel> {
    this.retain = true;
    return new Map([...this.channels].filter(([uri, c]) => !uri.startsWith('ahp-tcp:') && !c.isClosed));
  }

  restore(channels: ReadonlyMap<URI, WindowChannel>): void {
    for (const [uri, channel] of channels) {
      if (channel.connected) throw new TypeError('close the old connection before restoring subscriptions');
      channel.engine = this;
      channel.connected = false;
      channel.resetCounters();
      this.channels.set(uri, channel);
      for (const callback of channel.rebound) callback(this.client);
    }
  }

  installReconnect(windows: ChannelDeliveryResumeOptions, result: ReconnectResult): void {
    const kept = new Map(result.windows?.items.map(i => [i.channel, i]) ?? []);
    if (kept.size !== (result.windows?.items.length ?? 0)) protocol('duplicate reconnect window');
    for (const uri of kept.keys()) if (!windows.items.some(i => i.channel === uri)) protocol('unsolicited reconnect window');
    for (const item of windows.items) {
      const channel = this.ensure(item.channel);
      const resumed = kept.get(item.channel);
      if (!resumed) {
        channel.disconnect(new ClientClosedError(`subscription dropped on reconnect: ${item.channel}`), false);
        this.emit(channel, 'dropped'); continue;
      }
      this.validateAcceptance(resumed.flowControl, item.flowControl.receive, item.channel);
      if (!['snapshot', 'replay', 'live'].includes(resumed.recovery)) protocol('unknown reconnect recovery kind');
      channel.resetCounters(); channel.limits = immutableLimits(resumed.flowControl);
      channel.expectingSnapshot = resumed.recovery === 'snapshot';
      channel.connected = true; channel.changed();
      this.emit(channel, 'resumed');
    }
    this.schedule();
  }

  installOrdinaryReconnect(request: ReconnectParams, result: ReconnectResult): void {
    for (const uri of request.subscriptions) {
      const channel = this.channels.get(uri);
      if (channel && !channel.limits && !channel.isClosed) {
        channel.connected = true;
        channel.changed();
      }
    }
    if (result.type === 'snapshot') {
      for (const snapshot of result.snapshots) {
        const channel = this.channels.get(snapshot.resource);
        if (channel && !channel.limits && !channel.isClosed) channel.seedOrdinary({
          jsonrpc: '2.0', method: 'channel/snapshot', params: { channel: snapshot.resource, snapshot },
        });
      }
    } else {
      for (const uri of result.missing) {
        const channel = this.channels.get(uri);
        if (channel && !channel.limits) {
          channel.disconnect(new ClientClosedError(`subscription dropped on reconnect: ${uri}`), false);
          this.emit(channel, 'dropped');
        }
      }
      for (const action of result.actions) {
        const channel = this.channels.get(action.channel);
        if (channel && !channel.limits && !channel.isClosed) channel.seedOrdinary({
          jsonrpc: '2.0', method: 'action', params: action,
        });
      }
    }
  }

  emit(channel: WindowChannel, type: FlowControlEvent['type'], bytes?: number): void {
    this.events.publish({ channel: channel.uri, type, status: channel.status,
      ...(bytes !== undefined ? { bytes } : {}) });
  }

  send(message: JsonRpcMessage, signal?: AbortSignal): Promise<void> {
    if ('id' in message || !('method' in message)) return this.control(message);
    const notification = message as JsonRpcNotification;
    const uri = params(notification)?.channel as URI;
    const channel = this.channels.get(uri);
    if (notification.method === 'channel/frame') throw new TypeError('channel/frame is managed by the client');
    if (notification.method === 'channel/credit') throw new TypeError('channel/credit is managed by delivery.release()');
    if (channel && notification.method === 'tcp/reset') channel.resetTcp();
    if (['tcp/data', 'tcp/eof'].includes(notification.method)) {
      if (!channel?.limits) throw new TypeError('TCP sends require an accepted windowed subscription');
      if (channel.isTcpReset || channel.tcpSentEof) throw new ClientClosedError('TCP send direction closed');
      if (notification.method === 'tcp/data') decodeBase64(params(notification).data as string);
    }
    if (!channel || !countsAgainstWindow(notification.method)
      || (!channel.limits && !channel.sends.length)) return this.control(message);
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (!channel.connected || channel.isClosed) throw new ClientClosedError();
    const serialized = JSON.stringify(notification);
    const frozen = JSON.parse(serialized) as JsonRpcNotification;
    const bytes = utf16Bytes(serialized);
    const tail = channel.sends[channel.sends.length - 1];
    let merged = channel.limits && channel.options.coalescing !== false && !signal && tail && !tail.cancelable && !tail.text
      ? mergeNotifications(tail.notification, frozen,
        { channel: uri, direction: 'send' }, this.coalescers) : undefined;
    if (merged && tail === channel.sends[0] && utf16Bytes(JSON.stringify(merged)) > this.maxBufferedSendBytes) {
      merged = undefined;
    }
    const mergedSerialized = merged ? JSON.stringify(merged) : serialized;
    const mergedBytes = utf16Bytes(mergedSerialized);
    const behind = channel.sends.slice(1).reduce((sum, send) => sum + send.bytes, 0);
    const queuedBytes = merged
      ? behind + (tail === channel.sends[0] ? 0 : mergedBytes - tail!.bytes)
      : behind + (channel.sends.length ? bytes : 0);
    if (queuedBytes > this.maxBufferedSendBytes) {
      throw new BackpressureError(uri, this.maxBufferedSendBytes);
    }
    const send: Send = merged ? tail! : {
      notification: frozen, serialized, bytes, offset: 0, completions: [], cleanup: [], cancelable: !!signal,
    };
    if (merged) {
      send.notification = JSON.parse(mergedSerialized) as JsonRpcNotification;
      send.serialized = mergedSerialized; send.bytes = mergedBytes; this.emit(channel, 'coalesced', bytes);
    }
    else channel.sends.push(send);
    if (notification.method === 'tcp/eof') channel.tcpSentEof = true;
    const promise = new Promise<void>((resolve, reject) => send.completions.push({ resolve, reject }));
    if (signal) {
      const abort = () => {
        if (send.offset > 0 || send.text !== undefined) return;
        const index = channel.sends.indexOf(send);
        if (index < 0) return;
        // Independently cancelable sends must not be merged.
        channel.sends.splice(index, 1);
        if (send.notification.method === 'tcp/eof') channel.tcpSentEof = false;
        for (const completion of send.completions) completion.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        for (const cleanup of send.cleanup) cleanup();
        channel.changed();
      };
      signal.addEventListener('abort', abort, { once: true });
      send.cleanup.push(() => signal.removeEventListener('abort', abort));
    }
    channel.changed(); this.schedule();
    return promise;
  }

  control(message: JsonRpcMessage | string, creditOwner?: WindowChannel): Promise<void> {
    if (this.stopped) return Promise.reject(new ClientClosedError());
    const windowed = [...this.channels.values()].some(channel => !!channel.limits);
    if (creditOwner) {
      const queued = this.controls.find(control => control.creditOwner === creditOwner);
      if (queued) { queued.message = message; return Promise.resolve(); }
    }
    if (!creditOwner && windowed && this.controls.length >= 4096) {
      return Promise.reject(new BackpressureError('ahp-root://', MAX_CONTROL_BYTES));
    }
    const shape = typeof message === 'string' ? JSON.parse(message) as JsonRpcMessage : message;
    const exempt = !('id' in shape) && 'method' in shape && !countsAgainstWindow(shape.method);
    if (windowed && exempt && utf16Bytes(typeof message === 'string' ? message : JSON.stringify(message)) > MAX_CONTROL_BYTES) {
      return Promise.reject(new BackpressureError('ahp-root://', MAX_CONTROL_BYTES));
    }
    let control!: Control;
    const promise = new Promise<void>((resolve, reject) => {
      control = { message, resolve, reject, exempt, creditOwner };
    });
    if (!windowed && !this.driving && !this.currentControl && !this.controls.length
      && ![...this.channels.values()].some(channel => channel.sends.length)) {
      this.currentControl = control;
      const finish = (error?: unknown) => {
        if (this.currentControl === control) this.currentControl = undefined;
        if (error) {
          const failure = error instanceof BackpressureError || error instanceof TransportError ? error
            : new TransportError('io', `transport send failed: ${String(error)}`, { cause: error });
          control.reject(failure);
          if (!(failure instanceof BackpressureError)) this.fail(failure);
        } else control.resolve();
        if (this.controls.length || [...this.channels.values()].some(channel => channel.sends.length)) this.schedule();
      };
      try {
        control.started = true;
        const sent = this.transport.send(message);
        if (sent) void Promise.resolve(sent).then(() => finish(), finish);
        else finish();
      } catch (error) { finish(error); }
      return promise;
    }
    this.controls.push(control);
    this.schedule(); return promise;
  }

  checkControl(size: number | undefined): void {
    if (size === undefined) protocol('control frame did not preserve raw text');
    if (size > MAX_CONTROL_BYTES) protocol('oversized channel control message');
    const now = performance.now();
    if (now - this.receivedControlPeriod >= CONTROL_INTERVAL_MS) {
      this.receivedControlPeriod = now; this.receivedControlCount = 0;
    }
    if (++this.receivedControlCount > CONTROL_BURST * 4) protocol('channel control rate exceeded');
  }

  schedule(): void {
    if (this.scheduled || this.stopped || this.currentControl) return;
    this.scheduled = true;
    queueMicrotask(() => { void this.drive(); });
  }

  private async drive(): Promise<void> {
    if (this.currentControl) { this.scheduled = false; return; }
    this.driving = true;
    try {
      let controlBurst = 0;
      while (!this.stopped) {
        const channels = [...this.channels.values()];
        let ready: WindowChannel | undefined;
        for (let i = 0; i < channels.length; i++) {
          const index = (this.cursor + i) % channels.length;
          const c = channels[index];
          if (c.connected && c.sends.length && (!c.pauseNewMessages || c.sends[0].offset > 0)
            && (!c.limits || c.sent - c.remoteConsumed < c.limits.hostReceive.windowBytes)) {
            ready = c; this.cursor = (index + 1) % channels.length; break;
          }
        }
        const now = performance.now();
        if (now - this.controlPeriod >= CONTROL_INTERVAL_MS) {
          this.controlPeriod = now; this.controlCount = 0;
        }
        const controlIndex = this.controls[0]?.exempt && this.controlCount >= CONTROL_BURST
          ? this.controls.findIndex(control => !control.exempt) : this.controls.length ? 0 : -1;
        if (controlIndex >= 0 && (!ready || controlBurst < 16)) {
          const control = this.controls.splice(controlIndex, 1)[0];
          this.currentControl = control;
          if (control.exempt) this.controlCount++;
          try {
            if ([...this.channels.values()].some(channel => !!channel.limits)) {
              await this.transport.waitWritable?.({ signal: this.sendAbort.signal });
            }
            if (this.stopped) { control.reject(new ClientClosedError()); return; }
            if (control.canceled) continue;
            if (control.creditOwner?.isClosed) { control.resolve(); continue; }
            control.started = true;
            await this.transport.send(control.message); control.resolve();
          }
          catch (error) {
            control.reject(error as Error);
            if (!(error instanceof BackpressureError)) throw error;
          }
          finally { if (this.currentControl === control) this.currentControl = undefined; }
          controlBurst++; continue;
        }
        if (!ready) {
          if (!this.controls.length) break;
          await new Promise<void>(resolve => setTimeout(resolve,
            Math.max(1, CONTROL_INTERVAL_MS - (now - this.controlPeriod))));
          continue;
        }
        controlBurst = 0;
        const send = ready.sends[0];
        if (ready.limits) await this.transport.waitWritable?.({ signal: this.sendAbort.signal });
        if (this.stopped || ready.engine !== this) return;
        if (ready.sends[0] !== send) continue;
        if (ready.pauseNewMessages && send.offset === 0) continue;
        if (ready.limits && ready.sent - ready.remoteConsumed >= ready.limits.hostReceive.windowBytes) continue;
        send.text ??= send.serialized;
        const previousOffset = send.offset;
        const epoch = ready.epoch;
        const limit = ready.limits?.hostReceive;
        let text = send.text, final = true;
        if (limit && (send.offset > 0 || utf16Bytes(text) > limit.maximumFrameBytes)) {
          const remaining = limit.windowBytes - (ready.sent - ready.remoteConsumed);
          const frame = fragment(text, send.offset, ready.uri, limit.maximumFrameBytes, remaining);
          text = frame.text; send.offset = frame.offset; final = frame.final;
        }
        const size = utf16Bytes(text);
        if (!Number.isSafeInteger(ready.sent + size)) protocol('channel send counter overflow');
        if (limit) ready.sent += size;
        ready.changed();
        try { await this.transport.send(text); }
        catch (error) {
          if (!(error instanceof BackpressureError)) throw error;
          if (this.stopped || ready.engine !== this) return;
          if (limit && epoch === ready.epoch) ready.sent -= size;
          send.offset = previousOffset;
          if (previousOffset === 0) {
            if (ready.sends[0] === send) ready.sends.shift();
            if (send.notification.method === 'tcp/eof') ready.tcpSentEof = false;
            for (const cleanup of send.cleanup) cleanup();
            for (const completion of send.completions) completion.reject(error);
          } else {
            await new Promise<void>(resolve => setTimeout(resolve, 5));
          }
          ready.changed();
          continue;
        }
        if (this.stopped || ready.engine !== this) return;
        if (final) {
          ready.sends.shift();
          for (const cleanup of send.cleanup) cleanup();
          for (const completion of send.completions) completion.resolve();
          if (send.offset > 0) this.emit(ready, 'fragmentedMessageSent', utf16Bytes(send.text));
        }
        ready.changed();
      }
    } catch (cause) {
      const error = cause instanceof TransportError ? cause
        : new TransportError('io', `transport send failed: ${String(cause)}`, { cause });
      this.fail(error);
    } finally {
      this.driving = false;
      this.scheduled = false;
      if (!this.stopped && this.controls.length) this.schedule();
    }
  }

  stop(error: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.sendAbort.abort(error);
    this.currentControl?.reject(error);
    for (const control of this.controls) control.reject(error);
    this.controls = [];
    for (const channel of this.channels.values()) {
      channel.disconnect(error, this.retain && !channel.uri.startsWith('ahp-tcp:'));
    }
    this.events.close();
    this.observations.close();
  }
}

function fragment(text: string, start: number, channel: URI, maximum: number, remaining: number):
  { text: string; offset: number; final: boolean } {
  const boundary = (end: number) => end < text.length && end > start
    && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff ? end - 1 : end;
  const make = (end: number) => JSON.stringify({ jsonrpc: '2.0', method: 'channel/frame',
    params: { channel, data: text.slice(start, end), ...(end === text.length ? { final: true } : {}) } });
  const minEnd = start + (text.codePointAt(start)! > 0xffff ? 2 : 1);
  const minimum = utf16Bytes(make(minEnd));
  if (minimum > maximum) protocol('fragment cannot carry one character within frame limit');
  const target = Math.min(maximum, Math.max(remaining, minimum));
  let low = minEnd, high = text.length, best = minEnd;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2), end = boundary(mid);
    if (end <= start) { low = mid + 1; continue; }
    if (utf16Bytes(make(end)) <= target) { best = end; low = mid + 1; }
    else high = mid - 1;
  }

  return { text: make(best), offset: best, final: best === text.length };
}
