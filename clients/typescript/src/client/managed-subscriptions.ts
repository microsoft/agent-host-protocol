/**
 * Shared, reference-counted ownership for AHP subscriptions.
 *
 * @module client/managed-subscriptions
 */

import type { SubscribeResult } from '../types/common/commands.js';
import type { Snapshot, URI } from '../types/common/state.js';
import { AsyncBroadcastQueue } from './async-queue.js';
import { type AhpClient, type SubscribeOptions, type Subscription } from './client.js';
import { ClientClosedError } from './error.js';
import type { SubscriptionEvent } from './events.js';

/** Lifecycle state of a shared managed subscription. */
export type ManagedSubscriptionStatus = 'pending' | 'active' | 'failed' | 'closed';

/** A named owner retaining a shared subscription. */
export interface ManagedSubscriptionHolder {
  readonly owner: string;
  readonly count: number;
}

/** Read-only inspection data for one managed subscription. */
export interface ManagedSubscriptionInfo {
  readonly uri: URI;
  readonly status: ManagedSubscriptionStatus;
  readonly refCount: number;
  readonly holders: readonly ManagedSubscriptionHolder[];
}

/**
 * A subscribe result whose snapshot state has been narrowed by the consumer.
 *
 * The wire owner remains the generated {@link SubscribeResult}; this type only
 * gives handwritten client code the same caller-selected state typing that
 * VS Code's subscription manager exposes for its resource kinds.
 */
export type ManagedSubscribeResult<
  TState extends Snapshot['state'] = Snapshot['state'],
> = Omit<SubscribeResult, 'snapshot'> & {
  readonly snapshot?: Omit<Snapshot, 'state'> & { readonly state: TState };
};

/**
 * Shared state for one wire-level subscription.
 *
 * The object remains valid for the lifetime of every lease that acquired it.
 * Await {@link ManagedSubscription.ready} for the initial subscribe result;
 * events received during that round-trip are retained by each lease's event
 * iterator and delivered afterward in wire order.
 */
export interface ManagedSubscription<
  TState extends Snapshot['state'] = Snapshot['state'],
> {
  readonly uri: URI;
  readonly ready: Promise<ManagedSubscribeResult<TState>>;
  readonly status: ManagedSubscriptionStatus;
  /** Initial subscribe result, once {@link ready} has resolved. */
  readonly result: ManagedSubscribeResult<TState> | undefined;
  /** Subscribe failure, when {@link status} is `failed`. */
  readonly error: Error | undefined;
}

class ManagedSubscriptionState implements ManagedSubscription {
  readonly uri: URI;
  readonly ready: Promise<SubscribeResult>;
  private statusValue: ManagedSubscriptionStatus = 'pending';
  private resultValue: SubscribeResult | undefined;
  private errorValue: Error | undefined;
  private readonly resolveReady: (result: SubscribeResult) => void;
  private readonly rejectReady: (error: Error) => void;

  constructor(uri: URI) {
    this.uri = uri;
    let resolveReady!: (result: SubscribeResult) => void;
    let rejectReady!: (error: Error) => void;
    this.ready = new Promise<SubscribeResult>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // A consumer may prefer status/error inspection over awaiting `ready`.
    // Observe the rejection here so that path never creates an unhandled one.
    void this.ready.catch(() => undefined);
    this.resolveReady = resolveReady;
    this.rejectReady = rejectReady;
  }

  get status(): ManagedSubscriptionStatus {
    return this.statusValue;
  }

  get result(): SubscribeResult | undefined {
    return this.resultValue;
  }

  get error(): Error | undefined {
    return this.errorValue;
  }

  activate(result: SubscribeResult): void {
    if (this.statusValue !== 'pending') return;
    this.resultValue = result;
    this.statusValue = 'active';
    this.resolveReady(result);
  }

  fail(error: Error): void {
    if (this.statusValue !== 'pending') return;
    this.errorValue = error;
    this.statusValue = 'failed';
    this.rejectReady(error);
  }

  close(message = 'managed subscription closed'): void {
    if (this.statusValue === 'failed' || this.statusValue === 'closed') return;
    if (this.statusValue === 'pending') {
      this.rejectReady(new ClientClosedError(message));
    }
    this.statusValue = 'closed';
  }
}

/**
 * One holder's lease on a shared managed subscription.
 *
 * {@link events} is attached before the wire-level `subscribe` request is
 * sent. Disposal is idempotent; disposing the final lease sends the protocol
 * `unsubscribe` notification.
 */
export interface ManagedSubscriptionLease<
  TState extends Snapshot['state'] = Snapshot['state'],
  TEvent extends SubscriptionEvent = SubscriptionEvent,
> extends Disposable {
  readonly subscription: ManagedSubscription<TState>;
  readonly events: AsyncIterableIterator<TEvent>;
}

interface Entry {
  readonly uri: URI;
  readonly optionsKey: string;
  readonly subscription: ManagedSubscriptionState;
  readonly events: AsyncBroadcastQueue<SubscriptionEvent>;
  readonly holders: Map<number, string>;
  source?: Subscription;
}

/**
 * Owns one wire-level subscription per URI and shares it across named leases.
 *
 * Concurrent acquires coalesce onto the same request. A failed request is
 * removed from the manager after its local attachment is cleaned up, so the
 * next acquire deterministically makes a fresh request. Releasing the last
 * lease tears down both local fan-out and the server subscription.
 */
export class ManagedSubscriptionManager {
  private readonly client: AhpClient;
  private readonly eventBuffer: number;
  private readonly entries = new Map<URI, Entry>();
  private nextHolderId = 1;
  private closed = false;

  constructor(client: AhpClient, options: { eventBuffer?: number } = {}) {
    this.client = client;
    const buffer = options.eventBuffer ?? 4096;
    this.eventBuffer = buffer >= 1 ? Math.floor(buffer) : 1;
  }

  /**
   * Acquire a named lease for `uri`.
   *
   * The first acquire starts the wire request. Later acquires share its result
   * and event fan-out. All holders for a URI must use the same subscribe
   * options; conflicting options throw rather than silently changing the
   * already-active server subscription.
   */
  acquire<
    TState extends Snapshot['state'] = Snapshot['state'],
    TEvent extends SubscriptionEvent = SubscriptionEvent,
  >(
    uri: URI,
    owner: string,
    options: SubscribeOptions = {},
  ): ManagedSubscriptionLease<TState, TEvent> {
    if (this.closed) {
      throw new ClientClosedError('managed subscription manager closed');
    }

    const optionsKey = subscriptionOptionsKey(options);
    let entry = this.entries.get(uri);
    if (entry && entry.optionsKey !== optionsKey) {
      throw new TypeError(`subscription options for "${uri}" differ from the active subscription`);
    }

    if (!entry) {
      entry = {
        uri,
        optionsKey,
        subscription: new ManagedSubscriptionState(uri),
        events: new AsyncBroadcastQueue<SubscriptionEvent>(this.eventBuffer),
        holders: new Map<number, string>(),
      };
      this.entries.set(uri, entry);
    }

    const lease = this.createLease<TState, TEvent>(entry, owner);
    if (entry.holders.size === 1) {
      void this.start(entry, options);
    }
    return lease;
  }

  /** Current managed subscription without acquiring another lease. */
  get<TState extends Snapshot['state'] = Snapshot['state']>(
    uri: URI,
  ): ManagedSubscription<TState> | undefined {
    return this.entries.get(uri)?.subscription as ManagedSubscription<TState> | undefined;
  }

  /** Active subscription URIs, in deterministic lexical order. */
  currentSubscriptionUris(): URI[] {
    return [...this.entries.keys()].sort();
  }

  /** Read-only lifecycle and ownership snapshot for diagnostics. */
  activeSubscriptions(): ManagedSubscriptionInfo[] {
    return [...this.entries.values()]
      .sort((a, b) => a.uri.localeCompare(b.uri))
      .map(entry => ({
        uri: entry.uri,
        status: entry.subscription.status,
        refCount: entry.holders.size,
        holders: summarizeHolders(entry.holders),
      }));
  }

  /** Release every managed subscription and reject future acquires. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map(entry => this.disposeEntry(
      entry,
      'managed subscription manager closed',
    )));
  }

  private createLease<
    TState extends Snapshot['state'],
    TEvent extends SubscriptionEvent,
  >(entry: Entry, owner: string): ManagedSubscriptionLease<TState, TEvent> {
    const holderId = this.nextHolderId++;
    entry.holders.set(holderId, owner);
    const events = entry.events.reader();
    let released = false;

    return {
      subscription: entry.subscription as ManagedSubscription<TState>,
      events: events as AsyncIterableIterator<TEvent>,
      [Symbol.dispose]: () => {
        if (released) return;
        released = true;
        void events.return?.();
        entry.holders.delete(holderId);
        if (entry.holders.size === 0 && this.entries.get(entry.uri) === entry) {
          this.entries.delete(entry.uri);
          void this.disposeEntry(entry, 'managed subscription released before ready');
        }
      },
    };
  }

  private async start(entry: Entry, options: SubscribeOptions): Promise<void> {
    try {
      const { result, subscription } = await this.client.subscribe(entry.uri, options);
      if (this.entries.get(entry.uri) !== entry || entry.holders.size === 0) {
        await subscription.close();
        return;
      }
      entry.source = subscription;
      entry.subscription.activate(result);
      void this.pump(entry, subscription);
    } catch (cause) {
      if (this.entries.get(entry.uri) !== entry) return;
      this.entries.delete(entry.uri);
      const error = cause instanceof Error ? cause : new Error(String(cause));
      entry.subscription.fail(error);
      entry.events.close();
      await this.client.unsubscribe(entry.uri);
    }
  }

  private async pump(entry: Entry, source: Subscription): Promise<void> {
    try {
      for await (const event of source) {
        entry.events.publish(event);
      }
    } finally {
      if (this.entries.get(entry.uri) === entry) {
        this.entries.delete(entry.uri);
        entry.subscription.close('managed subscription event stream closed');
        entry.events.close();
      }
    }
  }

  private async disposeEntry(entry: Entry, message: string): Promise<void> {
    entry.subscription.close(message);
    entry.events.close();
    await this.client.unsubscribe(entry.uri);
    await entry.source?.close();
  }
}

function subscriptionOptionsKey(options: SubscribeOptions): string {
  return JSON.stringify({
    maxLatencyMs: options.delivery?.maxLatencyMs ?? null,
    turns: options.view?.turns ?? null,
  });
}

function summarizeHolders(holders: ReadonlyMap<number, string>): ManagedSubscriptionHolder[] {
  const counts = new Map<string, number>();
  for (const owner of holders.values()) {
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}
