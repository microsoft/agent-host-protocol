import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer, type WebSocket } from 'ws';
import { readEvidence } from '../src/controller-store.js';

const executable = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const SESSION = 'ahp-session:/controller-test';
const CHAT = 'ahp-chat:/controller-test-chat';

interface Message {
  id?: number;
  method: string;
  params: Record<string, unknown>;
}

interface Execution {
  code: number | null;
  signal: NodeJS.Signals | null;
  records: Record<string, unknown>[];
  output: string;
}

async function execute(root: string, args: string[], options: { input?: string; interrupt?: boolean } = {}): Promise<Execution> {
  const child = spawn(process.execPath, [executable, ...args], {
    env: { ...process.env, AHP_STATE_DIR: root, AHP_URL: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  let interrupted = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', data => {
    output += data;
    if (options.interrupt && !interrupted) {
      interrupted = true;
      child.kill('SIGINT');
    }
  });
  child.stderr.on('data', data => { errors += data; });
  child.stdin.end(options.input ?? '');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
  const [code, signal] = await once(child, 'close');
  clearTimeout(timeout);
  return {
    code, signal, output: output + errors,
    records: output.trim() ? output.trim().split('\n').map(line => JSON.parse(line)) : [],
  };
}

function result(execution: Execution): Record<string, unknown> {
  assert.equal(execution.code, 0, execution.output);
  const value = execution.records.at(-1)?.result;
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), execution.output);
  return value as Record<string, unknown>;
}

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'ahp-controller-'));
  const names = new Set<string>();
  const messages: Message[] = [];
  const clients = new Map<WebSocket, string>();
  const session: Record<string, unknown> = {
    lifecycle: 'ready', activeClients: [], chats: [{ resource: CHAT }],
    defaultChat: CHAT, title: 'Test', provider: 'test', status: 1,
  };
  const chat: Record<string, unknown> = { resource: CHAT, turns: [], title: 'Test', status: 1 };
  let serverSeq = 0;
  let echoDelay = 0;
  let rejectActions = false;
  let omitEcho = false;
  let malformed = false;
  let holdTurnStart = false;
  const held: { socket: WebSocket; params: Record<string, unknown> }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const notify = (action: Record<string, unknown>, channel = CHAT, origin?: { clientId: string; clientSeq: number }) => {
    for (const socket of server.clients) socket.send(JSON.stringify({
      jsonrpc: '2.0', method: 'action', params: { channel, action, serverSeq: ++serverSeq, ...(origin ? { origin } : {}) },
    }));
  };
  server.on('connection', socket => {
    socket.on('close', () => clients.delete(socket));
    socket.on('message', data => {
      const message: Message = JSON.parse(data.toString());
      messages.push(message);
      const respond = (value: unknown) => socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: value }));
      if (message.method === 'initialize') {
        clients.set(socket, String(message.params.clientId));
        respond({ protocolVersion: '1.0.0', serverSeq, snapshots: [] });
      } else if (message.method === 'authenticate') respond({});
      else if (message.method === 'subscribe') {
        if (malformed) { socket.send('not-json'); return; }
        respond({ snapshot: {
          resource: message.params.channel, fromSeq: serverSeq,
          state: message.params.channel === SESSION ? session : chat,
        } });
      } else if (message.method === 'listSessions') respond({
        items: [], nextCursor: message.params.cursor === 'second' ? undefined : 'second',
      });
      else if (message.method === 'dispatchAction') {
        const action = message.params.action as Record<string, unknown>;
        if (!rejectActions) {
          if (action.type === 'session/activeClientSet') {
            const entry = action.activeClient as Record<string, unknown>;
            session.activeClients = [...(session.activeClients as Record<string, unknown>[])
              .filter(item => item.clientId !== entry.clientId), entry];
          } else if (action.type === 'chat/turnStarted') chat.activeTurn = { id: action.turnId };
          else if (action.type === 'chat/pendingMessageSet') chat.steeringMessage = { id: action.id };
          else if (action.type === 'chat/turnCancelled') delete chat.activeTurn;
        }
        const params = {
          channel: message.params.channel, serverSeq: ++serverSeq, action,
          origin: { clientId: clients.get(socket), clientSeq: message.params.clientSeq },
          ...(rejectActions ? { rejectionReason: 'test rejection' } : {}),
        };
        if (omitEcho || (holdTurnStart && action.type === 'chat/turnStarted')) {
          held.push({ socket, params });
        } else {
          const timer = setTimeout(() => {
            timers.delete(timer);
            if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'action', params }));
          }, echoDelay);
          timers.add(timer);
        }
      } else if (message.method === 'extension/fail') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32008, message: 'Test RPC rejection', data: { reason: 'test' } } }));
      } else if (message.method === 'extension/large') respond({ text: 'x'.repeat(2 * 1024 * 1024) });
      else if (message.id !== undefined) respond(null);
    });
  });
  const run = (args: string[], options?: { input?: string; interrupt?: boolean }) => execute(root, args, options);
  const start = async (name: string, observer = false, extra: string[] = []) => {
    names.add(name);
    return run([observer ? 'listen' : 'join', '--instance', name, '--session', SESSION,
      '--url', `ws://127.0.0.1:${address.port}`, ...extra]);
  };
  const command = (name: string, verb: string, ...args: string[]) => run([verb, '--instance', name, ...args]);
  const accept = async (name: string, opId: string) => result(await command(name, 'wait', '--op-id', opId, '--timeout', '4s'));
  const participate = async (name: string) => {
    result(await command(name, 'participate', '--op-id', 'participation'));
    await accept(name, 'participation');
  };
  t.after(async () => {
    for (const name of names) {
      await command(name, 'stop');
      const path = join(root, 'instances', name, 'instance.json');
      try {
        const metadata = JSON.parse(await readFile(path, 'utf8'));
        if (metadata.pid && !['failed', 'stopped'].includes(metadata.state)) {
          process.kill(metadata.pid, 'SIGTERM');
          await delay(150);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    for (const timer of timers) clearTimeout(timer);
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  });
  return {
    root, session, chat, messages, server, run, start, command, participate, accept, notify,
    delayEcho: (ms: number) => { echoDelay = ms; },
    reject: (value = true) => { rejectActions = value; },
    omitEcho: () => { omitEcho = true; },
    holdTurnStart: () => { holdTurnStart = true; },
    releaseEcho: () => {
      for (const entry of held.splice(0)) entry.socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'action', params: entry.params }));
    },
    malformed: () => { malformed = true; },
    dispatches: () => messages.filter(message => message.method === 'dispatchAction'),
  };
}

test('join retains identity/default chat, is responsive across invocations, and never auto-participates', async t => {
  const f = await fixture(t);
  const joined = result(await f.start('work'));
  assert.equal(joined.state, 'ready');
  assert.equal(joined.session, SESSION);
  assert.equal(joined.chat, CHAT);
  assert.equal(joined.token, undefined);
  assert.equal(f.dispatches().length, 0);
  assert.equal((await f.command('work', 'ping')).code, 0);
  assert.equal(result(await f.command('work', 'status')).clientId, joined.clientId);
  assert.equal(result(await f.command('work', 'sessions')).nextCursor, 'second');
  assert.equal(result(await f.command('work', 'sessions', '--cursor', 'second')).nextCursor, undefined);
  assert.equal(f.messages.filter(message => message.method === 'initialize').length, 1);
  assert.equal((await f.start('work')).code, 1);
  assert.equal((await f.run(['status'])).code, 2);
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(f.root, 'instances', 'work'))).mode & 0o777, 0o700);
    assert.equal((await stat(join(f.root, 'instances', 'work', 'instance.json'))).mode & 0o777, 0o600);
  }
  assert.equal(result(await f.command('work', 'stop')).state, 'stopped');
  assert.equal(result(await f.command('work', 'status')).state, 'stopped');
});

test('local stop terminates an unresponsive peer and finalizes metadata, journals, and replay before process exit', async t => {
  const f = await fixture(t);
  const joined = result(await f.start('stalled'));
  await f.participate('stalled');
  f.holdTurnStart();
  const prompt = join(f.root, 'prompt.txt');
  await writeFile(prompt, 'Work');
  result(await f.command('stalled', 'send', '--op-id', 'pending', '--message-file', prompt));
  const dispatchDeadline = Date.now() + 2000;
  while (f.dispatches().length < 2 && Date.now() < dispatchDeadline) await delay(10);
  assert.equal(f.dispatches().length, 2);
  for (const socket of f.server.clients) socket.pause();
  const started = Date.now();
  assert.equal(result(await f.command('stalled', 'stop')).state, 'stopped');
  assert.ok(Date.now() - started < 4000, 'Controller exceeded the bounded local shutdown');
  assert.equal(result(await f.command('stalled', 'status')).state, 'stopped');
  assert.equal(result(await f.command('stalled', 'status', '--op-id', 'participation')).state, 'accepted');
  assert.equal(result(await f.command('stalled', 'status', '--op-id', 'pending')).state, 'uncertain');
  assert.ok(f.dispatches().every(message => (message.params.action as { type: string }).type !== 'chat/turnCancelled'));
  const capture = join(f.root, 'instances', 'stalled', 'events.jsonl');
  assert.equal(result(await f.run(['replay', capture, '--limit', '1000'])).captureState, 'completed');
  const pid = joined.pid;
  assert.ok(typeof pid === 'number');
  const exitDeadline = Date.now() + 2000;
  let alive = true;
  while (alive && Date.now() < exitDeadline) {
    try { process.kill(pid, 0); await delay(25); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      alive = false;
    }
  }
  assert.equal(alive, false, 'Stopped controller process still has a live socket');
});

test('observer-only listeners durably capture across CLI lifetimes, filter cursors, and reject all mutations', async t => {
  const f = await fixture(t);
  assert.equal(result(await f.start('observe', true)).observer, true);
  f.notify({ type: 'chat/delta', turnId: 'external', partId: 'text', content: 'private-message' },
    CHAT, { clientId: 'other-client', clientSeq: 0 });
  await delay(100);
  const events = await f.command('observe', 'events', '--method', 'action', '--limit', '1');
  const page = result(events);
  assert.equal(events.records[0].method, 'action');
  assert.ok(!events.output.includes('private-message'));
  const cursor = String(page.nextCursor);
  const next = result(await f.command('observe', 'events', '--after', cursor));
  assert.ok(Number(next.nextCursor) >= Number(cursor));
  assert.equal((await f.command('observe', 'participate', '--op-id', 'no')).code, 1);
  const action = join(f.root, 'action.json');
  const params = join(f.root, 'params.json');
  await writeFile(action, JSON.stringify({ type: 'chat/turnCancelled', turnId: 'external', duration: 0 }));
  await writeFile(params, JSON.stringify({ channel: 'ahp-root://' }));
  assert.equal((await f.command('observe', 'dispatch', CHAT, '--action-file', action, '--confirm', '--op-id', 'raw')).code, 1);
  assert.equal((await f.command('observe', 'request', 'extension/mutate', '--params-file', params, '--confirm', '--op-id', 'extension')).code, 1);
  assert.equal(f.dispatches().length, 0);
  const followed = await f.run(['events', '--instance', 'observe', '--follow', '--timeout', '5s'], { interrupt: true });
  assert.equal(followed.code, process.platform === 'win32' ? null : 130, followed.output);
  assert.equal(followed.signal, process.platform === 'win32' ? 'SIGINT' : null);
  assert.equal(result(await f.command('observe', 'status')).state, 'ready');
  assert.equal(result(await f.command('observe', 'stop')).state, 'stopped');
  assert.equal(result(await f.command('observe', 'events')).state, 'stopped');
  const replay = await f.run(['replay', join(f.root, 'instances', 'observe', 'events.jsonl')]);
  assert.equal(replay.code, 0, replay.output);
});

test('send requires explicit participation, deduplicates intent and distinguishes acceptance from turn completion', async t => {
  const f = await fixture(t);
  result(await f.start('work'));
  const prompt = join(f.root, 'prompt.txt');
  await writeFile(prompt, 'Do the work');
  result(await f.command('work', 'send', '--op-id', 'unclaimed', '--message-file', prompt));
  const refused = await f.command('work', 'wait', '--op-id', 'unclaimed');
  assert.equal(refused.code, 1);
  assert.equal(refused.records[0].category, 'refused');
  assert.equal(f.dispatches().length, 0);
  await f.participate('work');
  result(await f.command('work', 'send', '--op-id', 'send-1', '--message-file', prompt));
  const accepted = await f.accept('work', 'send-1');
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.completion, undefined);
  const repeated = result(await f.command('work', 'send', '--op-id', 'send-1', '--message-file', prompt));
  assert.equal(repeated.turnId, accepted.turnId);
  assert.equal(f.dispatches().filter(m => (m.params.action as { type: string }).type === 'chat/turnStarted').length, 1);
  await writeFile(prompt, 'Different work');
  assert.equal((await f.command('work', 'send', '--op-id', 'send-1', '--message-file', prompt)).code, 1);
  assert.equal((await f.command('work', 'wait', '--op-id', 'send-1', '--until', 'completed', '--timeout', '100ms')).code, 1);
  f.notify({ type: 'chat/turnComplete', turnId: accepted.turnId, duration: 123 });
  const completed = result(await f.command('work', 'wait', '--op-id', 'send-1', '--until', 'completed'));
  assert.equal(completed.completion, 'completed');
  delete f.chat.activeTurn;
  result(await f.command('work', 'send', '--op-id', 'duplicate-turn', '--message-file', prompt,
    '--turn', String(accepted.turnId)));
  assert.equal((await f.command('work', 'wait', '--op-id', 'duplicate-turn')).code, 1);
  assert.equal(f.dispatches().filter(m => (m.params.action as { type: string }).type === 'chat/turnStarted').length, 1);
  result(await f.command('work', 'stop'));
  assert.equal(result(await f.command('work', 'status', '--op-id', 'send-1')).completion, 'completed');
  await writeFile(prompt, 'Do the work');
  assert.equal(result(await f.command('work', 'send', '--op-id', 'send-1', '--message-file', prompt)).completion, 'completed');
});

test('steer/cancel require the exact active turn, preserve other clients and remain usable while ACKs are pending', async t => {
  const f = await fixture(t);
  f.session.activeClients = [{ clientId: 'other-client', tools: [] }];
  result(await f.start('work'));
  await f.participate('work');
  assert.equal((f.session.activeClients as unknown[]).length, 2);
  f.holdTurnStart();
  const prompt = join(f.root, 'prompt.txt');
  await writeFile(prompt, 'Work');
  const submission = result(await f.command('work', 'send', '--op-id', 'send', '--message-file', prompt, '--turn', 'exact'));
  assert.equal(submission.turnId, 'exact');
  result(await f.command('work', 'steer', '--op-id', 'wrong', '--turn', 'wrong-turn', '--message-file', prompt));
  assert.equal((await f.command('work', 'wait', '--op-id', 'wrong')).code, 1);
  result(await f.command('work', 'steer', '--op-id', 'steer', '--turn', 'exact', '--message-file', prompt));
  result(await f.command('work', 'cancel', '--op-id', 'cancel', '--turn', 'exact'));
  const dispatchDeadline = Date.now() + 2000;
  while (f.dispatches().length < 4 && Date.now() < dispatchDeadline) await delay(10);
  assert.deepEqual(f.dispatches().map(m => (m.params.action as { type: string }).type), [
    'session/activeClientSet', 'chat/turnStarted', 'chat/pendingMessageSet', 'chat/turnCancelled',
  ]);
  assert.equal(result(await f.command('work', 'status', '--op-id', 'send')).state, 'transport_completed');
  assert.equal((await f.accept('work', 'steer')).state, 'accepted');
  const cancelled = result(await f.command('work', 'wait', '--op-id', 'cancel', '--until', 'completed'));
  assert.equal(cancelled.completion, 'cancelled');
  assert.equal((await f.command('work', 'wait', '--op-id', 'steer', '--until', 'completed')).code, 2);
  f.chat.activeTurn = { id: 'exact' };
  result(await f.command('work', 'steer', '--op-id', 'replace-steering', '--turn', 'exact', '--message-file', prompt));
  assert.equal((await f.command('work', 'wait', '--op-id', 'replace-steering')).code, 1);
  assert.equal(f.dispatches().length, 4);
});

test('rejections and unknown outcomes are durable, never retried, and late echoes resolve uncertainty', async t => {
  const f = await fixture(t);
  result(await f.start('work', false, ['--timeout-ms', '500']));
  f.reject();
  result(await f.command('work', 'participate', '--op-id', 'reject'));
  const rejected = await f.command('work', 'wait', '--op-id', 'reject');
  assert.equal(rejected.code, 1);
  assert.equal(rejected.records[0].category, 'rejected');
  f.reject(false);
  f.omitEcho();
  result(await f.command('work', 'participate', '--op-id', 'unknown'));
  await delay(600);
  assert.equal(result(await f.command('work', 'status', '--op-id', 'unknown')).state, 'uncertain');
  const before = f.dispatches().length;
  assert.equal(result(await f.command('work', 'participate', '--op-id', 'unknown')).state, 'uncertain');
  assert.equal(f.dispatches().length, before);
  f.releaseEcho();
  const accepted = await f.accept('work', 'unknown');
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.error, undefined);
  result(await f.command('work', 'stop'));
  assert.equal(result(await f.command('work', 'status', '--op-id', 'unknown')).state, 'accepted');
});

test('crashed controllers are interrupted, not healthy; journal outcomes and stable recording prefixes survive', async t => {
  const f = await fixture(t);
  const metadata = result(await f.start('crash'));
  f.omitEcho();
  result(await f.command('crash', 'participate', '--op-id', 'in-flight'));
  await delay(100);
  process.kill(Number(metadata.pid), 'SIGKILL');
  await delay(100);
  assert.equal(result(await f.command('crash', 'status')).state, 'interrupted');
  assert.equal(result(await f.command('crash', 'status', '--op-id', 'in-flight')).state, 'uncertain');
  assert.equal(result(await f.command('crash', 'participate', '--op-id', 'in-flight')).state, 'uncertain');
  const events = await f.command('crash', 'events');
  assert.equal(events.code, 1);
  assert.ok(events.records.some(record => record.kind === 'frame'));
  const replay = await f.run(['replay', join(f.root, 'instances', 'crash', 'events.jsonl')]);
  assert.equal(replay.code, 1);
});

test('failed readiness and malformed frames leave explicit failure evidence', async t => {
  const f = await fixture(t);
  delete f.session.defaultChat;
  assert.equal((await f.start('no-chat')).code, 1);
  assert.equal(result(await f.command('no-chat', 'status')).state, 'failed');
  f.session.defaultChat = CHAT;
  f.malformed();
  assert.equal((await f.start('malformed')).code, 1);
  assert.equal(result(await f.command('malformed', 'status')).state, 'failed');
});

test('capture exhaustion stops explicitly and full captures redact authentication credentials', async t => {
  const f = await fixture(t);
  const auth = join(f.root, 'auth.json');
  await writeFile(auth, JSON.stringify({ channel: 'ahp-root://', resource: 'https://example.test', token: 'controller-secret-token' }));
  const started = result(await f.start('capture', true, [
    '--auth-file', auth, '--include-content', '--max-record-bytes', '8192',
  ]));
  assert.equal(started.state, 'ready');
  f.notify({ type: 'chat/delta', turnId: 'external', partId: 'text', content: 'x'.repeat(8192) });
  const deadline = Date.now() + 3000;
  let state: unknown;
  do {
    state = result(await f.command('capture', 'status')).state;
    if (state === 'failed') break;
    await delay(25);
  } while (Date.now() < deadline);
  assert.equal(state, 'failed');
  const capture = await readFile(join(f.root, 'instances', 'capture', 'events.jsonl'), 'utf8');
  assert.ok(!capture.includes('controller-secret-token'));
  assert.ok(capture.includes('[REDACTED]'));
  assert.equal(JSON.parse(capture.trim().split('\n').at(-1)!).state, 'failed');
  assert.ok(Buffer.byteLength(capture) <= 8192);
});

test('IPC rejects wrong credentials/generations without dispatching or stopping the controller', async t => {
  const f = await fixture(t);
  result(await f.start('private'));
  const dir = join(f.root, 'instances', 'private');
  const metadata = JSON.parse(await readFile(join(dir, 'instance.json'), 'utf8'));
  const hash = createHash('sha256').update(dir).digest('hex').slice(0, 24);
  const path = process.platform === 'win32' ? `\\\\.\\pipe\\ahp-${hash}` : join(f.root, 'ipc', `${hash}.sock`);
  for (const credentials of [
    { generation: metadata.generation, token: '0'.repeat(64) },
    { generation: 'wrong-generation', token: metadata.token },
    { generation: metadata.generation, token: '\u{1F600}'.repeat(32) },
  ]) {
    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = connect(path);
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('error', reject);
      socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('IPC test timed out')); });
      socket.once('connect', () => socket.write(JSON.stringify({
        ...credentials, command: 'participate', args: { opId: 'unauthorized' },
      }) + '\n'));
      socket.on('data', chunk => {
        buffer += chunk;
        if (buffer.includes('\n')) { socket.destroy(); resolve(JSON.parse(buffer.trim())); }
      });
    });
    assert.equal(reply.ok, false);
    assert.equal((reply.error as { category: string }).category, 'instance');
  }
  assert.equal(result(await f.command('private', 'status')).state, 'ready');
  assert.equal(f.dispatches().length, 0);
});

test('journal exhaustion stops the controller without exceeding its fixed byte cap', async t => {
  const f = await fixture(t);
  result(await f.start('journal'));
  const params = join(f.root, 'params.json');
  await writeFile(params, JSON.stringify({ channel: 'ahp-root://' }));
  for (let i = 0; i < 3; i++) {
    result(await f.command('journal', 'request', 'extension/large', '--params-file', params, '--confirm', '--op-id', `large-${i}`));
    const accepted = await f.command('journal', 'wait', '--op-id', `large-${i}`, '--timeout', '5s');
    assert.equal(accepted.code, 0, String(accepted.records.at(-1)?.category ?? 'Unexpected failure'));
  }
  result(await f.command('journal', 'request', 'extension/large', '--params-file', params, '--confirm', '--op-id', 'large-3'));
  const deadline = Date.now() + 5000;
  let state: unknown;
  do {
    state = result(await f.command('journal', 'status')).state;
    if (state === 'failed') break;
    await delay(25);
  } while (Date.now() < deadline);
  assert.equal(state, 'failed');
  assert.ok((await stat(join(f.root, 'instances', 'journal', 'operations.jsonl'))).size <= 8 * 1024 * 1024);
});

test('live raw commands preserve RPC errors and journal confirmed mutations without losing the connection', async t => {
  const f = await fixture(t);
  result(await f.start('raw'));
  const params = join(f.root, 'params.json');
  const action = join(f.root, 'action.json');
  await writeFile(params, JSON.stringify({ channel: 'ahp-root://' }));
  assert.equal((await f.command('raw', 'request', 'extension/fail', '--params-file', params)).code, 2);
  result(await f.command('raw', 'request', 'extension/fail', '--params-file', params, '--confirm', '--op-id', 'rpc'));
  assert.equal((await f.command('raw', 'wait', '--op-id', 'rpc')).code, 1);
  const outcome = result(await f.command('raw', 'status', '--op-id', 'rpc'));
  assert.equal((outcome.error as { code: number }).code, -32008);
  await writeFile(action, JSON.stringify({ type: 'session/titleChanged', title: 'Changed' }));
  result(await f.command('raw', 'dispatch', SESSION, '--action-file', action, '--confirm', '--op-id', 'rename'));
  assert.equal((await f.accept('raw', 'rename')).state, 'accepted');
  assert.equal((await f.command('raw', 'ping')).code, 0);
});

test('evidence pagination advances filtered cursors, preserves oversized records, and detects gaps and partial tails', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ahp-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'events.jsonl');
  const record = (cursor: number, method: string) => ({
    version: 1, kind: 'frame', cursor, timestamp: new Date().toISOString(), method,
  });
  await writeFile(path, [record(1, 'skip'), record(2, 'select'), record(3, 'skip')].map(r => JSON.stringify(r) + '\n').join(''));
  const page = await readEvidence(path, 0, 1, { method: 'select' });
  assert.equal(page.nextCursor, 2);
  assert.equal(page.records.length, 1);
  assert.equal((await readEvidence(path, 2, 10, { method: 'select' })).nextCursor, 3);
  assert.equal((await readEvidence(path, 2, 10, { method: 'select' }, { cursor: 2, offset: page.nextOffset })).nextCursor, 3);
  await assert.rejects(readEvidence(path, 4, 10), /beyond/);
  await writeFile(path, JSON.stringify(record(1, 'a')) + '\n' + '{"cursor":2');
  assert.equal((await readEvidence(path, 0, 10)).incomplete, true);
  await writeFile(path, JSON.stringify(record(2, 'a')) + '\n');
  await assert.rejects(readEvidence(path, 0, 10), /cursor gap/);
  const large = { ...record(1, 'large'), content: 'x'.repeat(2 * 1024 * 1024) };
  await writeFile(path, JSON.stringify(large) + '\n' + JSON.stringify(record(2, 'tail')) + '\n');
  const oversized = await readEvidence(path, 0, 100);
  assert.equal(oversized.records.length, 1);
  assert.equal(oversized.nextCursor, 1);
  const tail = await readEvidence(path, 1, 100, {}, { cursor: 1, offset: oversized.nextOffset });
  assert.equal(tail.records.length, 1);
  assert.equal(tail.nextCursor, 2);
});
