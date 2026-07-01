/**
 * Integration tests for the multi-host SDK (`@microsoft/agent-host-protocol/hosts`).
 *
 * Uses an in-memory transport pair (mirroring the Rust hosts.rs
 * integration suite and the TypeScript client.test.ts) to drive a real
 * {@link AhpClient} end-to-end through the {@link MultiHostClient}
 * supervisor without any networking. Each test spins up one or more
 * "fake hosts" — small async functions that respond to `initialize`,
 * `listSessions`, `subscribe`, and optionally inject notifications or
 * tear their socket down to force reconnects.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  InMemoryTransport,
  type AhpTransport,
  type JsonRpcMessage,
} from '../src/client/index.js';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
} from '../src/types/common/messages.js';
import type { SessionSummary } from '../src/types/channels-session/state.js';
import type { AgentInfo } from '../src/types/channels-root/state.js';
import type { InitializeResult } from '../src/types/common/commands.js';
import type { ListSessionsResult } from '../src/types/channels-root/commands.js';
import { ReconnectResultType } from '../src/types/common/commands.js';
import type { ReconnectResult } from '../src/types/common/commands.js';

import {
  ClientIdStoreError,
  DuplicateHostError,
  HostNotConnectedError,
  HostReconnectedError,
  HostShutDownError,
  InMemoryClientIdStore,
  MultiHostClient,
  MultiHostStateMirror,
  UnknownHostError,
  attemptsExhausted,
  backoffDelayForAttempt,
  delayWithJitter,
  disabledPolicy,
  exponentialPolicy,
  hostedResourceKey,
  immediateForeverPolicy,
  type ClientIdStore,
  type HostConfig,
  type HostId,
  type HostSubscriptionEvent,
  type HostTransportFactory,
} from '../src/client/hosts/index.js';

import { PROTOCOL_VERSION } from '../src/types/version/registry.js';
import { SessionStatus } from '../src/types/channels-session/state.js';

const ROOT = 'ahp-root://' as const;

// ─── Fake host harness ───────────────────────────────────────────────────────

interface FakeHostState {
  agents: AgentInfo[];
  sessions: SessionSummary[];
  /** Optional callback invoked once after the first request is handled (init or reconnect). */
  injectAfterInit?: (server: AhpTransport) => void | Promise<void>;
}

function makeFakeState(overrides: Partial<FakeHostState> = {}): FakeHostState {
  return { agents: [], sessions: [], ...overrides };
}

function makeAgent(provider = 'copilot'): AgentInfo {
  return {
    provider,
    displayName: provider,
    description: 'fake',
    models: [],
  };
}

function makeSummary(resource: string, title: string, modifiedAt: number): SessionSummary {
  return {
    resource,
    provider: 'copilot',
    title,
    status: SessionStatus.IDLE,
    createdAt: new Date(0).toISOString(),
    modifiedAt: new Date(modifiedAt).toISOString(),
  };
}

function buildInitResult(state: FakeHostState): InitializeResult {
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverSeq: 0,
    snapshots: [
      {
        resource: ROOT,
        state: {
          agents: state.agents,
          activeSessions: state.sessions.length,
        },
        fromSeq: 0,
      },
    ],
  };
}

function buildListResult(state: FakeHostState): ListSessionsResult {
  return { items: state.sessions };
}

/**
 * Drive one fake-host connection until the client closes. Recognises
 * `initialize`, `reconnect`, `listSessions`, `subscribe`, and
 * `unsubscribe`. Other requests echo an empty `{}` result.
 */
async function driveFakeHost(server: AhpTransport, state: FakeHostState): Promise<void> {
  let injectionRan = false;
  while (true) {
    const frame = await server.recv();
    if (!frame) return;
    if (frame.kind !== 'text') continue;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(frame.text) as JsonRpcMessage;
    } catch {
      continue;
    }
    if ('method' in msg && 'id' in msg) {
      const req = msg as JsonRpcRequest;
      const result = handleRequest(req, state);
      const resp: JsonRpcSuccessResponse = {
        jsonrpc: '2.0',
        id: req.id,
        result,
      };
      try {
        await server.send(resp);
      } catch {
        return;
      }
      if (!injectionRan && (req.method === 'initialize' || req.method === 'reconnect')) {
        injectionRan = true;
        if (state.injectAfterInit) {
          await state.injectAfterInit(server);
        }
      }
    }
    // Notifications (unsubscribe, dispatchAction) are silently
    // accepted; the fake host has no behavior to model for them.
  }
}

function handleRequest(req: JsonRpcRequest, state: FakeHostState): unknown {
  switch (req.method) {
    case 'initialize':
      return buildInitResult(state);
    case 'reconnect':
      // Default: reply with an empty replay so the supervisor moves on.
      return { type: ReconnectResultType.Replay, actions: [], missing: [] } satisfies ReconnectResult;
    case 'listSessions':
      return buildListResult(state);
    case 'subscribe': {
      // Minimal `SubscribeResult` — snapshot omitted (stateless channels
      // are valid). The fake server doesn't enforce real subscriptions.
      return {};
    }
    default:
      return {};
  }
}

/** Build a transport factory that pairs an InMemoryTransport with `driveFakeHost`. */
function makeBasicFactory(state: FakeHostState): HostTransportFactory {
  return async () => {
    const [c, s] = InMemoryTransport.pair();
    void driveFakeHost(s, state);
    return c;
  };
}

async function waitUntil<T>(
  predicate: () => T | undefined | null | false,
  timeoutMs = 2000,
  intervalMs = 5,
): Promise<T> {
  const start = Date.now();
  while (true) {
    const value = predicate();
    if (value !== undefined && value !== null && value !== false) return value as T;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

// ─── ReconnectPolicy unit tests ──────────────────────────────────────────────

test('exponential backoff caps at max', () => {
  const backoff = { kind: 'exponential' as const, initialMs: 1000, maxMs: 10_000, multiplier: 2 };
  assert.equal(backoffDelayForAttempt(backoff, 1), 1000);
  assert.equal(backoffDelayForAttempt(backoff, 2), 2000);
  assert.equal(backoffDelayForAttempt(backoff, 3), 4000);
  assert.equal(backoffDelayForAttempt(backoff, 4), 8000);
  assert.equal(backoffDelayForAttempt(backoff, 5), 10_000);
  assert.equal(backoffDelayForAttempt(backoff, 50), 10_000);
});

test('jitter at extremes scales delay', () => {
  const policy = {
    backoff: { kind: 'constant' as const, delayMs: 10_000 },
    jitter: 0.5,
    maxAttempts: null,
    resetOnSuccess: true,
  };
  assert.equal(delayWithJitter(policy, 1, 0), 5000);
  assert.equal(delayWithJitter(policy, 1, 1), 15_000);
  assert.equal(delayWithJitter(policy, 1, 0.5), 10_000);
});

test('disabled policy exhausts immediately', () => {
  assert.equal(attemptsExhausted(disabledPolicy(), 1), true);
});

test('unbounded policy never exhausts', () => {
  assert.equal(attemptsExhausted(exponentialPolicy(), 1_000_000), false);
});

// ─── InMemoryClientIdStore ──────────────────────────────────────────────────

test('InMemoryClientIdStore round-trips and overwrites', async () => {
  const store = new InMemoryClientIdStore();
  assert.equal(await store.load('a'), null);
  await store.store('a', 'first');
  assert.equal(await store.load('a'), 'first');
  await store.store('a', 'second');
  assert.equal(await store.load('a'), 'second');
});

// ─── generateClientId fallback chain ────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Replace `globalThis.crypto` with `value` for the duration of the test.
 * Node exposes `globalThis.crypto` as a getter-only property so plain
 * assignment fails — use `Object.defineProperty` and restore the original
 * descriptor afterwards.
 */
function withStubbedCrypto<T>(value: unknown, body: () => T): T {
  const target = globalThis as object;
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, 'crypto');
  Object.defineProperty(target, 'crypto', {
    value,
    configurable: true,
    writable: true,
  });
  try {
    return body();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(target, 'crypto', originalDescriptor);
    } else {
      delete (target as { crypto?: unknown }).crypto;
    }
  }
}

test('generateClientId prefers crypto.getRandomValues over Math.random when randomUUID is missing', async () => {
  const { generateClientId } = await import('../src/client/hosts/types.js');
  let getRandomCalls = 0;
  const stub = {
    // no randomUUID — force the fallback path
    getRandomValues<T extends ArrayBufferView>(view: T): T {
      getRandomCalls += 1;
      // Fill with a known deterministic pattern so we can assert
      // the bytes round-trip through the UUIDv4 framing.
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      for (let i = 0; i < bytes.length; i++) bytes[i] = 0xab;
      return view;
    },
  };
  const id = withStubbedCrypto(stub, () => generateClientId());
  assert.equal(getRandomCalls, 1, 'expected exactly one getRandomValues call');
  assert.match(id, UUID_RE);
  assert.equal(id[14], '4', 'UUID version digit should be 4');
  assert.ok('89ab'.includes(id[19]), 'UUID variant digit should be 8, 9, a, or b');
});

test('generateClientId still returns a UUIDv4-shaped string when only Math.random is available', async () => {
  const { generateClientId } = await import('../src/client/hosts/types.js');
  const id = withStubbedCrypto(undefined, () => generateClientId());
  assert.match(id, UUID_RE);
});

// ─── HostedResourceKey ──────────────────────────────────────────────────────

test('hostedResourceKey distinguishes hosts with the same URI', () => {
  const a = hostedResourceKey('host-a', 'ahp-session:/s1');
  const b = hostedResourceKey('host-b', 'ahp-session:/s1');
  assert.notEqual(a, b);
});

test('hostedResourceKey is collision-safe across awkward hostId / uri pairs', () => {
  // Length-prefix encoding must keep these distinct even though a naïve
  // `${hostId}\0${uri}` join would collide on the first pair and a
  // simpler `${hostId}${uri}` join would collide on the second.
  assert.notEqual(
    hostedResourceKey('host\x00a', 'b:/s'),
    hostedResourceKey('host', '\x00ab:/s'),
  );
  assert.notEqual(
    hostedResourceKey('host', 'a:/s'),
    hostedResourceKey('hosta', ':/s'),
  );
  // And a hostId containing the literal `\0` byte still round-trips
  // distinctly when only the URI changes.
  const a = hostedResourceKey('h\x00ost', 'ahp-session:/s1');
  const b = hostedResourceKey('h\x00ost', 'ahp-session:/s2');
  assert.notEqual(a, b);
});

// ─── MultiHostStateMirror ───────────────────────────────────────────────────

test('MultiHostStateMirror applies root snapshots scoped to host', () => {
  const mirror = new MultiHostStateMirror();
  mirror.applySnapshot('host-a', {
    resource: ROOT,
    state: { agents: [makeAgent('copilot')] },
    fromSeq: 0,
  });
  mirror.applySnapshot('host-b', {
    resource: ROOT,
    state: { agents: [makeAgent('vscode')] },
    fromSeq: 0,
  });
  assert.equal(mirror.getRoot('host-a')?.agents[0]?.provider, 'copilot');
  assert.equal(mirror.getRoot('host-b')?.agents[0]?.provider, 'vscode');
});

test('MultiHostStateMirror.resetHost drops every keyed state for that host', () => {
  const mirror = new MultiHostStateMirror();
  mirror.applySnapshot('host-a', { resource: ROOT, state: { agents: [] }, fromSeq: 0 });
  mirror.applySnapshot('host-a', {
    resource: 'ahp-session:/s1',
    state: {} as unknown as Parameters<MultiHostStateMirror['applySnapshot']>[1]['state'],
    fromSeq: 0,
  });
  mirror.applySnapshot('host-b', { resource: ROOT, state: { agents: [] }, fromSeq: 0 });
  mirror.resetHost('host-a');
  assert.equal(mirror.getRoot('host-a'), undefined);
  assert.equal(mirror.getSession('host-a', 'ahp-session:/s1'), undefined);
  assert.ok(mirror.getRoot('host-b') !== undefined);
});

// ─── MultiHostClient — single-host shape ────────────────────────────────────

test('MultiHostClient.single connects and exposes a HostHandle snapshot', async () => {
  const state = makeFakeState({ agents: [makeAgent('copilot')] });
  const config: HostConfig = {
    id: 'local',
    label: 'Local sessions server',
    transportFactory: makeBasicFactory(state),
  };
  const { multi } = await MultiHostClient.single(config);
  try {
    await waitUntil(() => multi.host('local')?.state.status === 'connected');
    const snap = multi.host('local');
    assert.ok(snap);
    assert.equal(snap.label, 'Local sessions server');
    assert.equal(snap.state.status, 'connected');
    assert.equal(snap.agents[0]?.provider, 'copilot');
    assert.equal(snap.protocolVersion, PROTOCOL_VERSION);
    assert.ok(snap.lastConnectedAt && snap.lastConnectedAt > 0);
  } finally {
    await multi.shutdown();
  }
});

// ─── addHost / removeHost lifecycle ─────────────────────────────────────────

test('two hosts register and connect independently', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'a',
      label: 'A',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await multi.addHost({
      id: 'b',
      label: 'B',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('a')?.state.status === 'connected');
    await waitUntil(() => multi.host('b')?.state.status === 'connected');
    const hosts = multi.hostsSnapshot();
    assert.equal(hosts.length, 2);
    assert.deepEqual(
      hosts.map(h => h.label).sort(),
      ['A', 'B'],
    );
  } finally {
    await multi.shutdown();
  }
});

test('addHost twice with the same id throws DuplicateHostError', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'dup',
      label: 'A',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await assert.rejects(
      multi.addHost({
        id: 'dup',
        label: 'B',
        transportFactory: makeBasicFactory(makeFakeState()),
      }),
      (err: unknown) => err instanceof DuplicateHostError && err.hostId === 'dup',
    );
  } finally {
    await multi.shutdown();
  }
});

test('removeHost stops a registered host', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'gone',
      label: 'Gone',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('gone')?.state.status === 'connected');
    await multi.removeHost('gone');
    assert.equal(multi.host('gone'), undefined);
    await assert.rejects(multi.removeHost('gone'), UnknownHostError);
  } finally {
    await multi.shutdown();
  }
});

// ─── ClientIdStore failure handling ─────────────────────────────────────────

test('addHost surfaces ClientIdStoreError when the store fails and frees the reservation', async () => {
  let failNext = true;
  const flakyStore: ClientIdStore = {
    async load() {
      if (failNext) {
        failNext = false;
        throw new Error('disk full');
      }
      return null;
    },
    async store() {
      // succeed
    },
  };
  const multi = new MultiHostClient({ clientIdStore: flakyStore });
  try {
    await assert.rejects(
      multi.addHost({
        id: 'flaky',
        label: 'Flaky',
        transportFactory: makeBasicFactory(makeFakeState()),
      }),
      (err: unknown) =>
        err instanceof ClientIdStoreError &&
        err.hostId === 'flaky' &&
        /disk full/.test(err.message),
    );
    // The pending reservation should be cleared so a follow-up succeeds.
    const handle = await multi.addHost({
      id: 'flaky',
      label: 'Flaky',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    assert.equal(handle.id, 'flaky');
  } finally {
    await multi.shutdown();
  }
});

test('explicit clientId is persisted into the store', async () => {
  const store = new InMemoryClientIdStore();
  const multi = new MultiHostClient({ clientIdStore: store });
  try {
    await multi.addHost({
      id: 'explicit',
      label: 'X',
      clientId: 'override-id',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    assert.equal(await store.load('explicit'), 'override-id');
  } finally {
    await multi.shutdown();
  }
});

// ─── HostClientHandle generation invalidation ───────────────────────────────

test('HostClientHandle invalidates after a reconnect', async () => {
  const state = makeFakeState();
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'rec',
      label: 'Rec',
      reconnectPolicy: immediateForeverPolicy(),
      transportFactory: makeBasicFactory(state),
    });
    await waitUntil(() => multi.host('rec')?.state.status === 'connected');
    const handle = multi.client('rec');
    assert.ok(handle, 'expected a client handle');
    const initialGen = handle.generation;

    await multi.reconnectHost('rec');
    await waitUntil(() => {
      const h = multi.host('rec');
      return h && h.generation > initialGen && h.state.status === 'connected';
    });

    assert.throws(
      () => handle.checkAlive(),
      (err: unknown) => {
        if (!(err instanceof HostReconnectedError)) return false;
        assert.equal(err.hostId, 'rec');
        assert.equal(err.handleGeneration, initialGen);
        assert.ok(err.currentGeneration > initialGen);
        return true;
      },
    );

    // A fresh handle works.
    const fresh = multi.client('rec');
    assert.ok(fresh);
    fresh.checkAlive();
  } finally {
    await multi.shutdown();
  }
});

test('HostClientHandle after removeHost throws HostShutDownError', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'rm',
      label: 'rm',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('rm')?.state.status === 'connected');
    const handle = multi.client('rm');
    assert.ok(handle);
    await multi.removeHost('rm');
    assert.throws(
      () => handle.checkAlive(),
      (err: unknown) => err instanceof HostShutDownError && err.hostId === 'rm',
    );
  } finally {
    await multi.shutdown();
  }
});

// ─── Aggregated views ───────────────────────────────────────────────────────

test('aggregatedSessions sorts by modifiedAt descending and tags hostLabel', async () => {
  const initial = makeSummary('copilot:/s1', 'Initial title', 1_000);
  const added = makeSummary('copilot:/s2', 'Added later', 2_000);

  const state: FakeHostState = makeFakeState({
    sessions: [initial],
    injectAfterInit: async server => {
      // Tiny delay so the client has consumed the listSessions response
      // before the notification arrives.
      await new Promise(r => setTimeout(r, 10));
      const notif: JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'root/sessionAdded',
        params: { channel: ROOT, summary: added },
      };
      try {
        await server.send(notif);
      } catch {
        // best-effort
      }
    },
  });

  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'local',
      label: 'Local',
      transportFactory: makeBasicFactory(state),
    });
    await waitUntil(() => multi.host('local')?.state.status === 'connected');
    await waitUntil(() => multi.aggregatedSessions().length === 2);
    const sessions = multi.aggregatedSessions();
    assert.deepEqual(
      sessions.map(s => s.summary.title),
      ['Added later', 'Initial title'],
    );
    assert.ok(sessions.every(s => s.hostId === 'local'));
    assert.ok(sessions.every(s => s.hostLabel === 'Local'));
  } finally {
    await multi.shutdown();
  }
});

test('aggregatedAgents tags every agent with its host', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'a',
      label: 'A',
      transportFactory: makeBasicFactory(makeFakeState({ agents: [makeAgent('copilot')] })),
    });
    await multi.addHost({
      id: 'b',
      label: 'B',
      transportFactory: makeBasicFactory(makeFakeState({ agents: [makeAgent('vscode')] })),
    });
    await waitUntil(() => multi.host('a')?.state.status === 'connected');
    await waitUntil(() => multi.host('b')?.state.status === 'connected');
    const agents = multi.aggregatedAgents().sort((x, y) => x.hostId.localeCompare(y.hostId));
    assert.equal(agents.length, 2);
    assert.equal(agents[0]?.hostId, 'a');
    assert.equal(agents[0]?.agent.provider, 'copilot');
    assert.equal(agents[1]?.hostId, 'b');
    assert.equal(agents[1]?.agent.provider, 'vscode');
  } finally {
    await multi.shutdown();
  }
});

// ─── reconnectAllUnavailable ────────────────────────────────────────────────

test('reconnectAllUnavailable skips connected hosts and returns per-host errors', async () => {
  // Build two hosts: one that connects normally, one that always fails
  // to construct a transport.
  const flakyFactory: HostTransportFactory = () => Promise.reject(new Error('boom'));
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'good',
      label: 'Good',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await multi.addHost({
      id: 'bad',
      label: 'Bad',
      reconnectPolicy: { ...disabledPolicy() },
      transportFactory: flakyFactory,
    });
    await waitUntil(() => multi.host('good')?.state.status === 'connected');
    await waitUntil(() => multi.host('bad')?.state.status === 'failed');
    const errors = await multi.reconnectAllUnavailable();
    // `good` was connected and is skipped → not in the map.
    assert.equal(errors.has('good'), false);
    // `bad` is in `failed` so it was woken, but the call itself returns
    // when the supervisor acknowledges (not necessarily after the
    // retry succeeds), so the error map may or may not contain `bad`
    // depending on timing. The important assertion is that the call
    // didn't throw and that connected hosts were skipped.
  } finally {
    await multi.shutdown();
  }
});

// ─── Events fan-in ──────────────────────────────────────────────────────────

test('hostEvents delivers added/stateChanged/connected/removed in order', async () => {
  const multi = new MultiHostClient();
  const events = multi.hostEvents();
  try {
    await multi.addHost({
      id: 'lifecycle',
      label: 'L',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('lifecycle')?.state.status === 'connected');
    await multi.removeHost('lifecycle');

    // Drain until we observe the `removed` event or hit a generous
    // timeout. Five events are expected (added, stateChanged×2,
    // connected, removed) but only the relative ordering matters.
    const collected: string[] = [];
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const remaining = Math.max(50, deadline - Date.now());
      const next = await Promise.race([
        events.next(),
        new Promise<{ done: true; value: undefined }>(resolve =>
          setTimeout(() => resolve({ done: true, value: undefined } as never), remaining),
        ),
      ]);
      if (next.done) break;
      collected.push(next.value.type);
      if (next.value.type === 'removed') break;
    }
    assert.equal(collected[0], 'added');
    assert.ok(collected.includes('connected'), `expected 'connected' in ${collected.join(',')}`);
    assert.equal(collected[collected.length - 1], 'removed');
  } finally {
    await multi.shutdown();
  }
});

test('events surface action envelopes tagged with hostId', async () => {
  const summary = makeSummary('copilot:/s1', 'New session', 500);
  const state: FakeHostState = makeFakeState({
    injectAfterInit: async server => {
      await new Promise(r => setTimeout(r, 10));
      const notif: JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'root/sessionAdded',
        params: { channel: ROOT, summary },
      };
      try {
        await server.send(notif);
      } catch {
        // best-effort
      }
    },
  });
  const multi = new MultiHostClient();
  const events = multi.events();
  try {
    await multi.addHost({
      id: 'evt',
      label: 'evt',
      transportFactory: makeBasicFactory(state),
    });
    let received: HostSubscriptionEvent | null = null;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const next = await Promise.race([
        events.next(),
        new Promise<{ done: true; value: undefined }>(resolve =>
          setTimeout(() => resolve({ done: true, value: undefined } as never), 500),
        ),
      ]);
      if (next.done) continue;
      if (next.value.event.type === 'sessionAdded') {
        received = next.value;
        break;
      }
    }
    assert.ok(received, 'expected a sessionAdded event');
    assert.equal(received.hostId, 'evt');
    assert.equal(received.channel, ROOT);
  } finally {
    await multi.shutdown();
  }
});

// ─── Manual reconnect from failed state ─────────────────────────────────────

test('manual reconnectHost wakes a host whose policy is exhausted', async () => {
  let attemptCount = 0;
  // Fail the first attempt; the second attempt (post-manual-reconnect) succeeds.
  const factory: HostTransportFactory = async () => {
    attemptCount += 1;
    if (attemptCount === 1) throw new Error('first attempt fails');
    const [c, s] = InMemoryTransport.pair();
    void driveFakeHost(s, makeFakeState());
    return c;
  };
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'wake',
      label: 'wake',
      reconnectPolicy: disabledPolicy(), // single attempt then `failed`
      transportFactory: factory,
    });
    await waitUntil(() => multi.host('wake')?.state.status === 'failed');
    // Manual reconnect bypasses the exhausted policy.
    await multi.reconnectHost('wake');
    await waitUntil(() => multi.host('wake')?.state.status === 'connected');
    assert.equal(attemptCount, 2);
  } finally {
    await multi.shutdown();
  }
});

// ─── Shutdown idempotency ───────────────────────────────────────────────────

test('MultiHostClient.shutdown is idempotent', async () => {
  const multi = new MultiHostClient();
  await multi.addHost({
    id: 'idemp',
    label: 'idemp',
    transportFactory: makeBasicFactory(makeFakeState()),
  });
  await multi.shutdown();
  await multi.shutdown();
  assert.equal(multi.host('idemp'), undefined);
});

// ─── Cancellation: factory signal aborts on manual reconnect ────────────────

test('manual reconnectHost aborts a slow in-flight transport factory', async () => {
  let attempt = 0;
  const firstAttemptSignal: { value: AbortSignal | null } = { value: null };
  const firstAttemptCalled = { value: false };
  const factory: HostTransportFactory = async (_id, signal) => {
    attempt += 1;
    if (attempt === 1) {
      // Capture the signal and hang until it aborts, then reject like
      // a transport open that bailed out on the signal would.
      firstAttemptSignal.value = signal;
      firstAttemptCalled.value = true;
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('aborted'));
          return;
        }
        signal.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
      throw new Error('unreachable');
    }
    // Second attempt succeeds.
    const [c, s] = InMemoryTransport.pair();
    void driveFakeHost(s, makeFakeState());
    return c;
  };

  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'slow',
      label: 'slow',
      transportFactory: factory,
    });
    // Wait for the first factory invocation so the supervisor is parked
    // on the hung promise.
    await waitUntil(() => firstAttemptCalled.value);
    assert.equal(firstAttemptSignal.value?.aborted, false, 'factory signal should not be aborted yet');

    // Manual reconnect should abort the first-attempt signal and let
    // the supervisor open a fresh transport.
    await multi.reconnectHost('slow');
    await waitUntil(() => multi.host('slow')?.state.status === 'connected');
    assert.equal(firstAttemptSignal.value?.aborted, true, 'factory signal should be aborted by manual reconnect');
    assert.equal(attempt, 2, 'expected a second factory invocation after manual reconnect');
  } finally {
    await multi.shutdown();
  }
});

// ─── Race: shutdown during addHost ──────────────────────────────────────────

test('addHost throws HostShutDownError when shutdown lands during ClientIdStore.load', async () => {
  // A store that exposes its in-flight load promise so the test can
  // sequence: addHost starts → shutdown runs → store resolves.
  let releaseLoad!: (value: string | null) => void;
  const loadStarted = { value: false };
  const slowStore: ClientIdStore = {
    async load() {
      loadStarted.value = true;
      return new Promise<string | null>(resolve => {
        releaseLoad = resolve;
      });
    },
    async store() {
      // unreachable in this test
    },
  };
  const factoryCallCount = { value: 0 };
  const factory: HostTransportFactory = async () => {
    factoryCallCount.value += 1;
    const [c, s] = InMemoryTransport.pair();
    void driveFakeHost(s, makeFakeState());
    return c;
  };

  const multi = new MultiHostClient({ clientIdStore: slowStore });
  const addPromise = multi.addHost({
    id: 'racey',
    label: 'racey',
    transportFactory: factory,
  });
  await waitUntil(() => loadStarted.value);

  // Shutdown lands while addHost is still awaiting the store.
  const shutdownPromise = multi.shutdown();
  // Now resolve the store; addHost must re-check shutDown and bail.
  releaseLoad(null);

  await assert.rejects(
    addPromise,
    (err: unknown) => err instanceof HostShutDownError,
  );
  await shutdownPromise;
  assert.equal(multi.host('racey'), undefined, 'no runtime should be registered');
  assert.equal(factoryCallCount.value, 0, 'transport factory must not have been invoked');
});

// ─── Unknown host ───────────────────────────────────────────────────────────

test('subscribe/unsubscribe/dispatch on an unknown host throws UnknownHostError', async () => {
  const multi = new MultiHostClient();
  try {
    await assert.rejects(multi.subscribe('nope', ROOT), UnknownHostError);
    await assert.rejects(multi.unsubscribe('nope', ROOT), UnknownHostError);
    assert.throws(
      () => multi.dispatch('nope', ROOT, { type: 'noop' } as unknown as Parameters<typeof multi.dispatch>[2]),
      UnknownHostError,
    );
  } finally {
    await multi.shutdown();
  }
});

// ─── HostNotConnectedError ──────────────────────────────────────────────────

test('subscribe on a registered-but-not-yet-connected host throws HostNotConnectedError', async () => {
  // A factory that hangs forever so the supervisor stays in `connecting`.
  const factory: HostTransportFactory = async (_id, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });

  const multi = new MultiHostClient();
  try {
    await multi.addHost({ id: 'pending', label: 'pending', transportFactory: factory });
    // No `await waitUntil` for connected — by design the host is still
    // connecting. `subscribe` should distinguish "not connected yet"
    // from "permanently shut down".
    await assert.rejects(
      multi.subscribe('pending', 'ahp-session:/s1'),
      (err: unknown) =>
        err instanceof HostNotConnectedError &&
        err.hostId === 'pending' &&
        !(err instanceof HostShutDownError),
    );
    // The URI should have been tracked for replay on the next connect
    // (alongside the implicit `ahp-root://` subscription every host
    // starts with).
    const handle = multi.host('pending');
    assert.ok(handle);
    assert.ok(handle.subscriptions.includes('ahp-session:/s1'));
  } finally {
    await multi.shutdown();
  }
});

test('dispatch on a registered-but-not-yet-connected host throws HostNotConnectedError', async () => {
  const factory: HostTransportFactory = async (_id, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });

  const multi = new MultiHostClient();
  try {
    await multi.addHost({ id: 'pending', label: 'pending', transportFactory: factory });
    assert.throws(
      () =>
        multi.dispatch(
          'pending',
          ROOT,
          { type: 'noop' } as unknown as Parameters<typeof multi.dispatch>[2],
        ),
      (err: unknown) =>
        err instanceof HostNotConnectedError &&
        err.hostId === 'pending' &&
        !(err instanceof HostShutDownError),
    );
  } finally {
    await multi.shutdown();
  }
});

// ─── ClientIdStore signal ───────────────────────────────────────────────────

test('ClientIdStore.load / store receive the multi-host shutdown signal', async () => {
  const observed: { load: AbortSignal | null; store: AbortSignal | null } = {
    load: null,
    store: null,
  };
  const recordingStore: ClientIdStore = {
    async load(_id, signal) {
      observed.load = signal ?? null;
      return null;
    },
    async store(_id, _clientId, signal) {
      observed.store = signal ?? null;
    },
  };
  const multi = new MultiHostClient({ clientIdStore: recordingStore });
  try {
    await multi.addHost({
      id: 'sig',
      label: 'sig',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
  } finally {
    await multi.shutdown();
  }
  assert.ok(observed.load instanceof AbortSignal, 'load should receive an AbortSignal');
  assert.ok(observed.store instanceof AbortSignal, 'store should receive an AbortSignal');
  // After shutdown the captured signal must reflect the aborted state.
  assert.equal(observed.load?.aborted, true);
  assert.equal(observed.store?.aborted, true);
});

// ─── Reconnect listener bookkeeping ─────────────────────────────────────────

test('repeated reconnect cycles do not accumulate abort listeners on the shutdown signal', async () => {
  // Drive a host through many disconnect/reconnect cycles by closing
  // the transport from the server side after init. If the per-connect
  // `linkAbortSignals` listeners weren't released on successful
  // connects, the per-runtime `shutdownController.signal` would
  // accumulate them (Node emits a `MaxListenersExceededWarning` after
  // 10 listeners on a target — we capture it).
  const warnings: string[] = [];
  const onWarning = (w: Error): void => {
    if (w.name === 'MaxListenersExceededWarning') warnings.push(w.message);
  };
  process.on('warning', onWarning);

  let attempt = 0;
  const factory: HostTransportFactory = async () => {
    attempt += 1;
    const [c, s] = InMemoryTransport.pair();
    const state: FakeHostState = makeFakeState({
      injectAfterInit: async server => {
        // Yield once so the supervisor enters `runConnection` before we
        // tear down. Then close the socket to force a reconnect.
        await new Promise(r => setTimeout(r, 1));
        server.close();
      },
    });
    void driveFakeHost(s, state);
    return c;
  };

  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'churn',
      label: 'churn',
      // Effectively no backoff so cycles complete quickly.
      reconnectPolicy: immediateForeverPolicy(),
      transportFactory: factory,
    });
    // Wait until we've completed at least 20 cycles.
    await waitUntil(() => attempt >= 20, 5000);
  } finally {
    await multi.shutdown();
    process.removeListener('warning', onWarning);
  }
  assert.equal(
    warnings.length,
    0,
    `expected no MaxListenersExceededWarning; got: ${warnings.join(' / ')}`,
  );
});

// Reference the imported HostId type to avoid 'unused' warnings.
void (null as unknown as HostId);
