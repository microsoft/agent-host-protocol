import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { AhpClient } from '../../clients/typescript/src/client/client.js';
import { Capture, frameRecord, inspectFrame, replay } from '../src/capture.js';
import { redact, textFile } from '../src/common.js';
import { runCli } from '../src/run.js';

const executable = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const SESSION = 'ahp-session:/test';

interface Message {
  id?: number;
  method: string;
  params: Record<string, unknown>;
}

interface Execution {
  code: number | null;
  signal: NodeJS.Signals | null;
  records: Record<string, unknown>[];
  stdout: string;
  stderr: string;
}

async function directory(t: TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'ahp-cli-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function execute(
  args: string[],
  options: { input?: string; signalOnSnapshot?: NodeJS.Signals; env?: Record<string, string> } = {},
): Promise<Execution> {
  const child = spawn(process.execPath, [executable, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AHP_URL: '', ...options.env },
  });
  let stdout = '';
  let stderr = '';
  let signalled = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => {
    stdout += text;
    if (options.signalOnSnapshot && !signalled && stdout.includes('"kind":"snapshot"')) {
      signalled = true;
      child.kill(options.signalOnSnapshot);
    }
  });
  child.stderr.on('data', text => { stderr += text; });
  child.stdin.end(options.input ?? '');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 8000);
  let code: number | null;
  let signal: NodeJS.Signals | null;
  try { [code, signal] = await once(child, 'close'); }
  finally { clearTimeout(timeout); }
  return {
    code, signal, stdout, stderr,
    records: stdout.trim() ? stdout.trim().split('\n').map(line => JSON.parse(line)) : [],
  };
}

async function host(
  t: TestContext,
  handler?: (socket: WebSocket, message: Message, respond: (result: unknown) => void) => void,
): Promise<{ url: string; messages: Message[] }> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const messages: Message[] = [];
  server.on('connection', socket => {
    socket.on('message', data => {
      const message: Message = JSON.parse(data.toString());
      messages.push(message);
      const respond = (result: unknown) => socket.send(JSON.stringify({
        jsonrpc: '2.0', id: message.id, result,
      }));
      if (handler) handler(socket, message, respond);
      else if (message.method === 'initialize') respond({
        protocolVersion: '1.0.0', serverSeq: 0, snapshots: [], serverInfo: { name: 'test-host' },
      });
      else if (message.method === 'subscribe') respond({
        snapshot: { resource: message.params.channel, fromSeq: 10, state: { title: 'Test' } },
      });
      else if (message.method === 'listSessions') respond({ items: [], nextCursor: 'opaque' });
      else if (message.id !== undefined) respond(null);
    });
  });
  t.after(async () => {
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });
  return { url: `ws://127.0.0.1:${address.port}`, messages };
}

function initialize(message: Message, respond: (result: unknown) => void): boolean {
  if (message.method !== 'initialize') return false;
  respond({ protocolVersion: '1.0.0', serverSeq: 0, snapshots: [] });
  return true;
}

async function assertSigterm(execution: Execution, path: string): Promise<void> {
  const forced = process.platform === 'win32';
  assert.equal(execution.code, forced ? null : 143, execution.stdout + execution.stderr);
  assert.equal(execution.signal, forced ? 'SIGTERM' : null);
  const last = JSON.parse((await readFile(path, 'utf8')).trim().split('\n').at(-1)!);
  if (forced) {
    assert.equal(last.kind, 'frame');
    const reviewed = await execute(['replay', path]);
    assert.equal(reviewed.code, 1, reviewed.stdout + reviewed.stderr);
    assert.equal(reviewed.records.at(-1)?.category, 'replay');
  } else {
    assert.equal(execution.records.at(-1)?.category, 'interrupted');
    assert.equal(last.state, 'failed');
    assert.equal(last.category, 'interrupted');
  }
}

test('CLI help is on stderr; discovery is versioned JSONL without a connection', async () => {
  const help = await execute(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.stdout, '');
  assert.match(help.stderr, /Usage: ahp/);
  const description = await execute(['describe']);
  assert.equal(description.code, 0);
  assert.equal(description.records.length, 1);
  assert.equal(description.records[0].version, 1);
  const result = description.records[0].result as { commands: Record<string, string> };
  assert.equal(result.commands.listSessions, 'read');
  assert.equal(result.commands.createSession, 'write');
});

test('online discovery preserves host capabilities and opaque extension metadata without probing methods', async t => {
  const metadata = {
    'example.extensions': { methods: [{ name: 'x-example/capabilities', description: 'Explicit discovery' }] },
    'example.future': { options: ['unknown'], token: 'private-token' },
  };
  const fixture = await host(t, (_socket, message, respond) => {
    if (message.method === 'initialize') respond({
      protocolVersion: '1.0.0', serverSeq: 0, snapshots: [],
      serverInfo: { name: 'extension-host', version: 'test' },
      telemetry: { logs: 'ahp-otlp:/logs' }, _meta: metadata,
    });
  });
  const offline = await execute(['describe'], { env: { AHP_URL: fixture.url } });
  assert.equal(offline.code, 0);
  assert.equal(fixture.messages.length, 0);
  const execution = await execute(['describe', '--url', fixture.url]);
  assert.equal(execution.code, 0, execution.stdout + execution.stderr);
  const output = execution.records[0].result as {
    protocol: { actions: { type: string; clientDispatchable: boolean }[] };
    host: { _meta: unknown; telemetry: unknown; serverInfo: unknown };
    metadata: { host: unknown };
  };
  assert.deepEqual(output.host._meta, {
    ...metadata, 'example.future': { options: ['unknown'], token: '[REDACTED]' },
  });
  assert.deepEqual(output.metadata.host, output.host._meta);
  assert.deepEqual(output.host.telemetry, { logs: 'ahp-otlp:/logs' });
  assert.deepEqual(output.host.serverInfo, { name: 'extension-host', version: 'test' });
  for (const type of ['chat/inputAnswerChanged', 'chat/inputCompleted']) {
    assert.ok(output.protocol.actions.some(action => action.type === type && action.clientDispatchable));
  }
  assert.deepEqual(fixture.messages.map(message => message.method), ['initialize']);
});

test('resource discovery exposes explicit host/channel metadata and distinguishes absent metadata from stateless channels', async t => {
  const resourceMetadata = { 'example.resource': { nested: { options: ['one', 'two'] }, token: 'secret' } };
  const fixture = await host(t, (_socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'subscribe') {
      if (message.params.channel === 'ahp-otlp://logs') respond({});
      else respond({ snapshot: { resource: message.params.channel, fromSeq: 4,
        state: message.params.channel === SESSION ? { _meta: resourceMetadata } : {} } });
    }
  });
  for (const uri of [SESSION, 'ahp-chat:/no-metadata', 'ahp-otlp://logs']) {
    const execution = await execute(['describe', uri, '--url', fixture.url]);
    assert.equal(execution.code, 0, execution.stdout + execution.stderr);
    assert.equal(execution.records.length, 1);
    const output = execution.records[0].result as { metadata: unknown; resource: unknown };
    assert.deepEqual(output.metadata, { host: null, resource: uri === SESSION
      ? { 'example.resource': { nested: { options: ['one', 'two'] }, token: '[REDACTED]' } } : null });
    assert.deepEqual(output.resource, {
      channel: uri, stateful: uri !== 'ahp-otlp://logs',
      ...(uri !== 'ahp-otlp://logs' ? { fromSeq: 4 } : {}),
    });
  }
  assert.deepEqual(fixture.messages.filter(message => message.method === 'subscribe')
    .map(message => message.params.channel), [SESSION, 'ahp-chat:/no-metadata', 'ahp-otlp://logs']);
  assert.ok(fixture.messages.every(message => ['initialize', 'subscribe'].includes(message.method)));
});

test('resource discovery rejects malformed metadata and mismatched snapshots instead of returning empty success', async t => {
  for (const snapshot of [
    { resource: SESSION, fromSeq: 0, state: { _meta: [] } },
    { resource: SESSION, fromSeq: -1, state: {} },
    { resource: 'ahp-session:/wrong', fromSeq: 0, state: {} },
    null,
  ]) {
    const fixture = await host(t, (_socket, message, respond) => {
      if (initialize(message, respond)) return;
      if (message.method === 'subscribe') respond({ snapshot });
    });
    const execution = await execute(['describe', SESSION, '--url', fixture.url]);
    assert.equal(execution.code, 1, execution.stdout + execution.stderr);
    assert.equal(execution.records.at(-1)?.category, 'protocol');
  }
  const fixture = await host(t);
  assert.equal((await execute(['describe', SESSION, SESSION, '--url', fixture.url])).code, 2);
  assert.equal((await execute(['describe', 'not-a-uri', '--url', fixture.url])).code, 2);
  assert.equal(fixture.messages.length, 0);
});

test('explicit extension discovery preserves unknown result shapes and requires confirmation', async t => {
  const capabilities = { version: 1, operations: [
    { name: 'inspect', inputSchema: { type: 'object', properties: { detail: { type: 'boolean' } } } },
  ], extra: { future: true } };
  const fixture = await host(t, (_socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'x-example/capabilities') respond(capabilities);
  });
  const args = ['request', 'x-example/capabilities', '--url', fixture.url, '--params-file', '-'];
  const input = '{"channel":"ahp-root://"}';
  assert.equal((await execute(args, { input })).code, 2);
  assert.equal(fixture.messages.length, 0);
  const execution = await execute([...args, '--confirm'], { input });
  assert.equal(execution.code, 0, execution.stdout + execution.stderr);
  assert.deepEqual(execution.records.at(-1)?.result, capabilities);
  assert.deepEqual(fixture.messages.map(message => message.method), ['initialize', 'x-example/capabilities']);
});

test('raw extensions preserve implementation-defined parameters without requiring a channel', async t => {
  const fixture = await host(t, (_socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'x-example/inspect') respond(message.params);
  });
  const args = ['request', 'x-example/inspect', '--url', fixture.url, '--params-file', '-'];
  for (const params of [{ session: SESSION, chat: 'ahp-chat:/test' }, {}, { channel: 42 }]) {
    const input = JSON.stringify(params);
    assert.equal((await execute(args, { input })).code, 2);
    const execution = await execute([...args, '--confirm'], { input });
    assert.equal(execution.code, 0, execution.stdout + execution.stderr);
    assert.deepEqual(execution.records.at(-1)?.result, params);
  }
  const before = fixture.messages.length;
  assert.equal((await execute(['request', 'resourceRead', '--url', fixture.url,
    '--params-file', '-'], { input: '{}' })).code, 2);
  assert.equal(fixture.messages.length, before);
});

test('CLI initializes before requests, preserves pagination, and reads snapshots', async t => {
  const fixture = await host(t);
  const connected = await execute(['connect', '--url', fixture.url, '--client-id', 'cli-test']);
  assert.equal(connected.code, 0);
  assert.equal((connected.records[0].result as { protocolVersion: string }).protocolVersion, '1.0.0');
  assert.deepEqual(fixture.messages[0].params.protocolVersions, ['1.0.0', '0.9.0']);
  assert.equal(fixture.messages[0].params.clientId, 'cli-test');
  const sessions = await execute(['sessions', '--url', fixture.url, '--page-size', '3']);
  assert.equal(sessions.code, 0);
  assert.deepEqual(sessions.records[0].result, { items: [], nextCursor: 'opaque' });
  assert.deepEqual(fixture.messages.find(message => message.method === 'listSessions')?.params, {
    channel: 'ahp-root://', limit: 3,
  });
  const snapshot = await execute(['snapshot', SESSION, '--url', fixture.url]);
  assert.equal(snapshot.code, 0);
  assert.equal(snapshot.records[0].kind, 'snapshot');
  assert.equal(snapshot.records[0].channel, SESSION);
  assert.deepEqual((snapshot.records[0].snapshot as { state: unknown }).state, { title: 'Test' });
  assert.ok(fixture.messages.every(message => !['dispatchAction', 'createSession'].includes(message.method)));
});

test('watch buffers early notifications, records all frames, and replays offline', async t => {
  const dir = await directory(t);
  const path = join(dir, 'capture.jsonl');
  const fixture = await host(t, (socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'subscribe') {
      socket.send(JSON.stringify({
        jsonrpc: '2.0', method: 'extension/activity', params: { channel: SESSION, text: 'private-content' },
      }));
      respond({ snapshot: { resource: SESSION, state: {}, fromSeq: 0 } });
    }
  });
  const observed = await execute([
    'listen', SESSION, '--url', fixture.url, '--duration-ms', '1000',
    '--limit', '1', '--record', path,
  ]);
  assert.equal(observed.code, 0, observed.stderr + observed.stdout);
  assert.deepEqual(observed.records.map(record => record.kind), ['snapshot', 'frame', 'result']);
  assert.equal(observed.records[1].method, 'extension/activity');
  assert.ok(!observed.stdout.includes('private-content'));
  const content = await readFile(path, 'utf8');
  assert.ok(!content.includes('private-content'));
  const captured = content.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(captured.map(record => record.cursor), captured.map((_record, i) => i + 1));
  assert.equal(captured[0].state, 'started');
  assert.equal(captured.at(-1).state, 'completed');
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
  const reviewed = await execute(['replay', path, '--direction', 'in', '--method', 'extension/activity']);
  assert.equal(reviewed.code, 0);
  assert.equal(reviewed.records[0].method, 'extension/activity');
  assert.deepEqual(reviewed.records.at(-1)?.result, {
    displayed: 1, lastCursor: captured.length, fullyInspected: true, captureState: 'completed',
  });
  const prefix = await execute(['replay', path, '--limit', '1']);
  assert.equal((prefix.records.at(-1)?.result as { fullyInspected: boolean }).fullyInspected, false);
  const existing = await execute(['connect', '--url', fixture.url, '--record', path]);
  assert.equal(existing.code, 1);
  assert.equal(await readFile(path, 'utf8'), content);
});

test('watch bounds pre-snapshot notifications by aggregate wire bytes', async t => {
  const frameBytes = 2 * 1024 * 1024;
  for (const count of [8, 9]) {
    const path = join(await directory(t), 'buffered.jsonl');
    const fixture = await host(t, (socket, message, respond) => {
      if (initialize(message, respond)) return;
      if (message.method !== 'subscribe') return;
      for (let index = 0; index < count; index++) {
        const notification = {
          jsonrpc: '2.0', method: 'action',
          params: { channel: SESSION, serverSeq: index + 1,
            action: { type: 'session/titleChanged', title: '' } },
        };
        notification.params.action.title = 'x'.repeat(frameBytes - Buffer.byteLength(JSON.stringify(notification)));
        const text = JSON.stringify(notification);
        assert.equal(Buffer.byteLength(text), frameBytes);
        socket.send(text);
      }
      respond({ snapshot: { resource: SESSION, state: {}, fromSeq: count } });
    });
    const execution = await execute([
      'watch', SESSION, '--url', fixture.url, '--record', path,
      '--limit', String(count), '--duration-ms', '1000',
    ]);
    assert.equal(execution.code, count === 8 ? 0 : 1, execution.stdout + execution.stderr);
    const captured = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    if (count === 8) {
      assert.equal((execution.records.at(-1)?.result as { notifications: number }).notifications, count);
      assert.equal(captured.at(-1).state, 'completed');
    } else {
      assert.equal(execution.records.at(-1)?.category, 'protocol');
      assert.equal(execution.records.at(-1)?.message, 'Observation buffer overflow before snapshots');
      assert.equal(captured.at(-1).state, 'failed');
      assert.equal(captured.at(-1).category, 'protocol');
    }
  }
});

test('one-shot observation requests snapshots without attaching unread SDK subscription readers', async t => {
  const fixture = await host(t);
  const attach = t.mock.method(AhpClient.prototype, 'attachSubscription', () => {
    throw new Error('One-shot observation must not attach an SDK subscription reader');
  });
  const code = await runCli([
    'watch', SESSION, 'ahp-root://', '--url', fixture.url, '--duration-ms', '1',
  ], new AbortController().signal);
  assert.equal(code, 0);
  assert.equal(attach.mock.callCount(), 0);
  assert.deepEqual(fixture.messages.map(message => message.method), ['initialize', 'subscribe', 'subscribe']);
});

test('plaintext input limits are exact and format-neutral', async t => {
  const path = join(await directory(t), 'message.txt');
  await writeFile(path, 'x'.repeat(4 * 1024 * 1024));
  assert.equal((await textFile(path)).length, 4 * 1024 * 1024);
  await writeFile(path, 'x'.repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(textFile(path), { category: 'usage', message: 'Input exceeds 4 MiB' });
});

test('authentication credentials are redacted from captures, results, and errors', async t => {
  const dir = await directory(t);
  const auth = join(dir, 'auth.json');
  const path = join(dir, 'capture.jsonl');
  await writeFile(auth, JSON.stringify({
    channel: 'ahp-root://', resource: 'https://example.test', token: 'test-secret-token',
  }));
  const fixture = await host(t, (socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'authenticate') {
      assert.equal(message.params.token, 'test-secret-token');
      respond({});
    } else socket.send(JSON.stringify({
      jsonrpc: '2.0', id: message.id,
      error: { code: -32008, message: 'failed with test-secret-token', data: { access_token: 'another-secret' } },
    }));
  });
  const execution = await execute([
    'ping', '--url', fixture.url, '--auth-file', auth, '--record', path, '--include-content',
  ]);
  assert.equal(execution.code, 1);
  assert.equal(execution.records[0].code, -32008);
  assert.ok(!execution.stdout.includes('test-secret-token'));
  assert.ok(!execution.stdout.includes('another-secret'));
  const captured = await readFile(path, 'utf8');
  assert.ok(!captured.includes('test-secret-token'));
  assert.ok(!captured.includes('another-secret'));
  assert.ok(captured.includes('[REDACTED]'));
  assert.equal(JSON.parse(captured.trim().split('\n').at(-1)!).state, 'failed');
});

test('invalid mutations, lifecycle requests, input and flags fail before connecting', async t => {
  const fixture = await host(t);
  const cases = [
    ['request', 'createSession', '--params-file', '-'],
    ['request', 'extension/mutate', '--params-file', '-'],
    ['request', 'initialize', '--params-file', '-', '--confirm'],
    ['dispatch', SESSION, '--action-file', '-'],
    ['dispatch', SESSION, '--action-file', '-', '--confirm'],
    ['watch', SESSION, '--duration-ms', '0'],
    ['watch', SESSION, '--limit', 'NaN'],
    ['connect', '--params-file', '-'],
    ['snapshot', 'not-a-uri'],
    ['connect', '--protocol-version', '01.0.0'],
  ];
  for (const args of cases) {
    const execution = await execute([...args, '--url', fixture.url], {
      input: '{"type":"chat/delta","channel":"ahp-root://"}',
    });
    assert.equal(execution.code, 2, execution.stdout);
    assert.equal(execution.records[0].category, 'usage');
  }
  assert.equal(fixture.messages.length, 0);
});

test('explicit raw requests preserve input and unknown mutation outcomes', async t => {
  const fixture = await host(t, (_socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'resourceRead') respond({ content: 'read-result' });
  });
  const read = await execute(['request', 'resourceRead', '--url', fixture.url, '--params-file', '-'], {
    input: '{"channel":"ahp-root://","uri":"file:///readme"}',
  });
  assert.equal(read.code, 0);
  assert.deepEqual(read.records[0].result, { content: 'read-result' });
  const mutation = await execute([
    'request', 'extension/mutate', '--url', fixture.url, '--params-file', '-',
    '--confirm', '--timeout-ms', '50',
  ], { input: '{"channel":"ahp-root://","value":42}' });
  assert.equal(mutation.code, 1);
  assert.equal(mutation.records[0].category, 'timeout');
  assert.equal(mutation.records[0].outcome, 'unknown');
  assert.equal(fixture.messages.filter(message => message.method === 'extension/mutate').length, 1);
});

test('a clean close after an RPC response does not turn an observed result into failure', async t => {
  const fixture = await host(t, (socket, message, respond) => {
    if (initialize(message, respond)) return;
    respond({ completed: true });
    socket.close();
  });
  const execution = await execute([
    'request', 'resourceWrite', '--url', fixture.url, '--params-file', '-', '--confirm',
  ], { input: '{"channel":"ahp-root://","uri":"file:///readme"}' });
  assert.equal(execution.code, 0, execution.stdout + execution.stderr);
  assert.deepEqual(execution.records[0].result, { completed: true });
});

test('dispatch waits for its own echo, respects sequence fences and reports rejection', async t => {
  let rejected = false;
  const fixture = await host(t, (socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'subscribe') respond({
      snapshot: { resource: SESSION, state: {}, fromSeq: 10 },
    });
    if (message.method === 'dispatchAction') {
      const echo = (clientId: string, serverSeq: number) => socket.send(JSON.stringify({
        jsonrpc: '2.0', method: 'action', params: {
          channel: SESSION, serverSeq, action: message.params.action,
          origin: { clientId, clientSeq: 1 },
          ...(rejected ? { rejectionReason: 'not allowed' } : {}),
        },
      }));
      echo('another-client', 11);
      echo('cli-test', 10);
      echo('cli-test', 12);
    }
  });
  const args = [
    'dispatch', SESSION, '--url', fixture.url, '--client-id', 'cli-test',
    '--action-file', '-', '--confirm',
  ];
  const input = '{"type":"session/titleChanged","title":"New title"}';
  const accepted = await execute(args, { input });
  assert.equal(accepted.code, 0, accepted.stdout + accepted.stderr);
  assert.equal((accepted.records[0].result as { outcome: string }).outcome, 'accepted');
  assert.equal(((accepted.records[0].result as { envelope: { serverSeq: number } }).envelope).serverSeq, 12);
  rejected = true;
  const denied = await execute(args, { input });
  assert.equal(denied.code, 1);
  assert.equal(denied.records[0].category, 'rejected');
  assert.equal(denied.records[0].outcome, undefined);
});

test('unexpected disconnect and malformed frames fail instead of looking idle', async t => {
  for (const malformed of [false, true]) {
    const fixture = await host(t, (socket, message, respond) => {
      if (initialize(message, respond)) return;
      if (message.method === 'subscribe') {
        respond({ snapshot: { resource: SESSION, state: {}, fromSeq: 0 } });
        if (malformed) socket.send('invalid-json');
        else socket.close();
      }
    });
    const execution = await execute(['watch', SESSION, '--url', fixture.url, '--duration-ms', '1000']);
    assert.equal(execution.code, 1, execution.stdout);
    assert.ok(execution.records.some(record => record.kind === 'error'));
  }
});

test('dispatch timeout sends exactly once and reports an unknown outcome', async t => {
  const fixture = await host(t);
  const execution = await execute([
    'dispatch', SESSION, '--url', fixture.url, '--action-file', '-',
    '--confirm', '--timeout-ms', '50',
  ], { input: '{"type":"session/titleChanged","title":"New title"}' });
  assert.equal(execution.code, 1);
  assert.equal(execution.records[0].category, 'timeout');
  assert.equal(execution.records[0].outcome, 'unknown');
  assert.equal(fixture.messages.filter(message => message.method === 'dispatchAction').length, 1);
});

test('stateless subscriptions are explicit and mismatched snapshots fail', async t => {
  let stateless = true;
  const fixture = await host(t, (_socket, message, respond) => {
    if (initialize(message, respond)) return;
    if (message.method === 'subscribe') respond(stateless ? {} : {
      snapshot: { resource: 'ahp-session:/wrong', state: {}, fromSeq: 0 },
    });
  });
  const empty = await execute(['snapshot', SESSION, '--url', fixture.url]);
  assert.equal(empty.code, 0);
  assert.equal(empty.records[0].stateful, false);
  assert.equal(empty.records[0].snapshot, null);
  stateless = false;
  const mismatch = await execute(['snapshot', SESSION, '--url', fixture.url]);
  assert.equal(mismatch.code, 1);
  assert.equal(mismatch.records[0].category, 'protocol');
});

test('rejected RPC mutations preserve numeric errors without claiming unknown outcomes', async t => {
  const fixture = await host(t, (socket, message, respond) => {
    if (initialize(message, respond)) return;
    socket.send(JSON.stringify({
      jsonrpc: '2.0', id: message.id,
      error: { code: -32602, message: 'invalid request', data: { field: 'uri' } },
    }));
  });
  const execution = await execute([
    'request', 'resourceWrite', '--url', fixture.url, '--params-file', '-', '--confirm',
  ], { input: '{"channel":"ahp-root://","uri":"file:///readme"}' });
  assert.equal(execution.code, 1);
  assert.equal(execution.records[0].code, -32602);
  assert.deepEqual(execution.records[0].data, { field: 'uri' });
  assert.equal(execution.records[0].outcome, undefined);
});

test('frame inspection rejects invalid response shapes and unsafe sequence numbers', () => {
  const invalid = [
    { jsonrpc: '2.0', id: 1, result: null, error: { code: 1, message: 'error' } },
    { jsonrpc: '2.0', result: null },
    { jsonrpc: '2.0', id: 'wrong', result: null },
    { jsonrpc: '2.0', id: 1, error: null },
    { jsonrpc: '2.0', method: 42 },
    { jsonrpc: '2.0', method: 'action', params: { serverSeq: -1 } },
  ];
  for (const frame of invalid) assert.throws(() => inspectFrame(JSON.stringify(frame), 'in'));
});

test('SIGTERM preserves platform-specific termination evidence without cancelling remote work', async t => {
  const fixture = await host(t);
  const dir = await directory(t);
  const path = join(dir, 'interrupted.jsonl');
  const execution = await execute([
    'watch', SESSION, '--url', fixture.url, '--record', path, '--duration-ms', '60000',
  ], { signalOnSnapshot: 'SIGTERM' });
  await assertSigterm(execution, path);
  assert.ok(fixture.messages.every(message => message.method !== 'dispatchAction'));
});

test('AbortSignal interruption finalizes captures and bounds shutdown on every platform', async t => {
  for (const reason of ['SIGINT', 'SIGTERM']) {
    for (const stalled of [false, true]) {
      await t.test(`${reason}, ${stalled ? 'stalled' : 'responsive'} peer`, async t => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        t.after(() => clearTimeout(timer));
        const fixture = await host(t, (socket, message, respond) => {
          if (initialize(message, respond)) return;
          if (message.method === 'subscribe') {
            respond({ snapshot: { resource: message.params.channel, fromSeq: 0, state: {} } });
            if (stalled) socket.pause();
            timer = setTimeout(() => controller.abort(reason), 25);
          }
        });
        const path = join(await directory(t), 'interrupted.jsonl');
        const started = Date.now();
        const code = await runCli([
          'watch', SESSION, '--url', fixture.url, '--record', path, '--duration-ms', '60000',
        ], controller.signal);
        assert.equal(code, reason === 'SIGTERM' ? 143 : 130);
        assert.ok(Date.now() - started < 4000, 'Interrupted command remained alive during shutdown');
        const last = JSON.parse((await readFile(path, 'utf8')).trim().split('\n').at(-1)!);
        assert.equal(last.state, 'failed');
        assert.equal(last.category, 'interrupted');
        assert.ok(fixture.messages.every(message => message.method !== 'dispatchAction'));
      });
    }
  }
});

test('successful commands exit and finalize captures when the host never acknowledges close', async t => {
  for (const command of ['connect', 'request', 'dispatch']) {
    let clientId: unknown;
    const fixture = await host(t, (socket, message, respond) => {
      if (initialize(message, respond)) {
        clientId = message.params.clientId;
        if (command === 'connect') socket.pause();
      } else if (message.method === 'subscribe') respond({
        snapshot: { resource: message.params.channel, fromSeq: 0, state: {} },
      });
      else if (message.method === 'dispatchAction') {
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'action', params: {
          channel: message.params.channel, action: message.params.action, serverSeq: 1,
          origin: { clientId, clientSeq: message.params.clientSeq },
        } }));
        socket.pause();
      } else {
        respond({ observed: true });
        socket.pause();
      }
    });
    const path = join(await directory(t), 'completed.jsonl');
    const args = command === 'connect' ? ['connect']
      : command === 'request' ? ['request', 'extension/write', '--params-file', '-', '--confirm']
        : ['dispatch', SESSION, '--action-file', '-', '--confirm'];
    const input = command === 'dispatch' ? '{"type":"session/titleChanged","title":"Changed"}'
      : '{"channel":"ahp-root://"}';
    const started = Date.now();
    const execution = await execute([...args, '--url', fixture.url, '--timeout-ms', '1000', '--record', path], { input });
    assert.equal(execution.code, 0, execution.stdout + execution.stderr);
    assert.ok(Date.now() - started < 4000, 'Shutdown exceeded the local close deadline');
    const result = execution.records.at(-1);
    assert.equal(result?.kind, 'result');
    if (command === 'dispatch') {
      assert.ok(result?.result && typeof result.result === 'object' && 'outcome' in result.result);
      assert.equal(result.result.outcome, 'accepted');
    } else if (command === 'request') assert.deepEqual(result?.result, { observed: true });
    const captured = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(captured.at(-1).state, 'completed');
  }
});

test('request timeouts and interruption still exit and finalize failed captures with an unresponsive peer', async t => {
  for (const interrupt of [false, true]) {
    const fixture = await host(t, (socket, message, respond) => {
      if (initialize(message, respond)) return;
      if (interrupt && message.method === 'subscribe') respond({
        snapshot: { resource: message.params.channel, fromSeq: 0, state: {} },
      });
      socket.pause();
    });
    const path = join(await directory(t), 'failed.jsonl');
    const started = Date.now();
    const execution = await execute(interrupt
      ? ['watch', SESSION, '--url', fixture.url, '--record', path, '--duration-ms', '60000']
      : ['ping', '--url', fixture.url, '--record', path, '--timeout-ms', '100'],
    interrupt ? { signalOnSnapshot: 'SIGTERM' } : {});
    assert.ok(Date.now() - started < 4000, 'Failed command remained alive during shutdown');
    if (interrupt) await assertSigterm(execution, path);
    else {
      assert.equal(execution.code, 1, execution.stdout + execution.stderr);
      assert.equal(execution.records.at(-1)?.category, 'timeout');
      const captured = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(captured.at(-1).state, 'failed');
      assert.equal(captured.at(-1).category, 'timeout');
    }
  }
});

test('timed-out WebSocket upgrades are terminated without leaking a process or uncaught error', async t => {
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const path = join(await directory(t), 'upgrade.jsonl');
  const started = Date.now();
  const execution = await execute([
    'connect', '--url', `ws://127.0.0.1:${address.port}`, '--timeout-ms', '100', '--record', path,
  ]);
  assert.equal(execution.code, 1, execution.stdout + execution.stderr);
  assert.equal(execution.stderr, '');
  assert.equal(execution.records.at(-1)?.category, 'timeout');
  assert.ok(Date.now() - started < 4000, 'Timed-out upgrade kept the process alive');
  assert.equal(JSON.parse((await readFile(path, 'utf8')).trim().split('\n').at(-1)!).state, 'failed');
});

test('recording caps stop explicitly and retain a failed terminal marker', async t => {
  const dir = await directory(t);
  const path = join(dir, 'limited.jsonl');
  const fixture = await host(t, (_socket, message, respond) => {
    if (message.method === 'initialize') respond({
      protocolVersion: '1.0.0', serverSeq: 0, snapshots: [], extra: 'x'.repeat(5000),
    });
  });
  const execution = await execute([
    'connect', '--url', fixture.url, '--record', path, '--max-record-bytes', '4096', '--include-content',
  ]);
  assert.equal(execution.code, 1);
  assert.equal(execution.records[0].category, 'capture');
  const captured = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(captured.at(-1).state, 'failed');
  assert.ok((await stat(path)).size <= 4096);
});

test('replay detects corruption and incomplete captures even with filters', async t => {
  const dir = await directory(t);
  const path = join(dir, 'capture.jsonl');
  const capture = new Capture(path, 8192, []);
  capture.append(frameRecord(inspectFrame('{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-root://"}}', 'in'), true));
  capture.finish('completed');
  const lines = (await readFile(path, 'utf8')).trim().split('\n');
  const gap = join(dir, 'gap.jsonl');
  await writeFile(gap, [lines[0], lines[2]].join('\n') + '\n');
  await assert.rejects(replay(gap, { after: 0, limit: 100, method: 'not-present' }, async () => {}), /cursor gap/);
  const truncated = join(dir, 'truncated.jsonl');
  await writeFile(truncated, lines.slice(0, 2).join('\n') + '\n');
  await assert.rejects(replay(truncated, { after: 0, limit: 100 }, async () => {}), /Incomplete capture/);
  const trailing = join(dir, 'trailing.jsonl');
  await writeFile(trailing, lines.join('\n') + '\n' + lines[0] + '\n');
  await assert.rejects(replay(trailing, { after: 0, limit: 100 }, async () => {}), /cursor gap|lifecycle/);
});

test('redaction covers nested credential fields and known secret values without mutating input', () => {
  const input = { password: 'pw', nested: [{ api_key: 'key', text: 'prefix secret suffix' }] };
  assert.deepEqual(redact(input, ['secret']), {
    password: '[REDACTED]', nested: [{ api_key: '[REDACTED]', text: 'prefix [REDACTED] suffix' }],
  });
  assert.equal(input.password, 'pw');
});
