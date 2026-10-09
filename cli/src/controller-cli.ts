import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { SUPPORTED_PROTOCOL_VERSIONS, compareProtocolVersions } from '../../clients/typescript/src/types/version/registry.js';
import { RpcError } from '../../clients/typescript/src/client/error.js';
import { channel, CliError, errorRecord, integer, jsonFile, object, redact, stdout, textFile } from './common.js';
import {
  instancePaths, operationFingerprint, publicMetadata, readEvidence, readMetadata,
  reserveInstance, saveMetadata, type InstanceMetadata,
} from './controller-store.js';
import { requestPolicy } from './catalog.js';

const CONTROLLER_COMMANDS = ['join', 'status', 'events', 'participate', 'send', 'steer', 'cancel', 'wait', 'stop'];

export function controllerInvocation(args: string[]): boolean {
  return CONTROLLER_COMMANDS.includes(args[0]) || args.some(arg => arg === '--instance' || arg.startsWith('--instance='));
}

const HELP = `Usage: ahp COMMAND --instance NAME [OPTIONS]

No implicit current instance. All results/errors are versioned JSONL.

  join --session URI           Start a persistent controller; never auto-participate
  listen --session URI         Start a separate observer-only controller
  status [--op-id ID]           Instance status or durable operation outcome
  events [--after N] [--follow] Query retained capture; --limit is page size
  participate --op-id ID        Register only this client; no exclusive ownership
  send --op-id ID               New turn from --message-file FILE (- reads stdin)
  steer --turn ID --op-id ID    Steer exact active turn from --message-file
  cancel --turn ID --op-id ID   Cancel exact active turn
  wait --op-id ID               --until accepted|completed --timeout 30s
  stop                         Stop locally; keep evidence; never cancel remotely
  ping                         Liveness over retained connection
  sessions                     One page; --page-size N and connection-scoped --cursor
  snapshot URI                 Subscribe/read using retained connection
  request METHOD               --params-file FILE; mutations: --confirm --op-id ID
  dispatch URI                 --action-file FILE --confirm --op-id ID

Startup: --url URL (or AHP_URL), --auth-file FILE, --client-id ID,
  --protocol-version VERSION (repeatable), --timeout-ms N (default 30000),
  --include-content, --max-record-bytes N (default 67108864).
Readiness includes session/default-chat snapshots and durable capture.
Each controller records privately under AHP_STATE_DIR (default ~/.ahp).
Names remain occupied after stop; choose new names to retain evidence.
On Windows, use an AHP_STATE_DIR protected by private current-user ACLs.

Events: --limit N (1-1000, default 100), --method NAME, --channel URI,
  --direction in|out, --timeout 30s (follow bound; ms/s/m accepted).
Wait completion is supported for send/cancel, not steering-message consumption.
Register with participate before send/steer/cancel. No retries or reconnect.
Interrupting a command leaves its controller and submitted operations running.
`;

const OPTIONS = {
  help: { type: 'boolean' }, instance: { type: 'string' }, session: { type: 'string' },
  url: { type: 'string' }, 'client-id': { type: 'string' },
  'protocol-version': { type: 'string', multiple: true }, 'timeout-ms': { type: 'string' },
  'auth-file': { type: 'string' }, 'include-content': { type: 'boolean' },
  'max-record-bytes': { type: 'string' }, 'op-id': { type: 'string' },
  'message-file': { type: 'string' }, turn: { type: 'string' }, until: { type: 'string' },
  timeout: { type: 'string' }, after: { type: 'string' }, limit: { type: 'string' },
  follow: { type: 'boolean' }, method: { type: 'string' }, channel: { type: 'string' },
  direction: { type: 'string' }, 'page-size': { type: 'string' }, cursor: { type: 'string' },
  'params-file': { type: 'string' }, 'action-file': { type: 'string' }, confirm: { type: 'boolean' },
} as const;
const START_OPTIONS = [
  'session', 'url', 'client-id', 'protocol-version', 'timeout-ms', 'auth-file', 'include-content', 'max-record-bytes',
];
const ALLOWED: Record<string, string[]> = {
  join: START_OPTIONS, listen: START_OPTIONS,
  status: ['op-id'], stop: [], ping: [],
  events: ['after', 'limit', 'follow', 'method', 'channel', 'direction', 'timeout'],
  participate: ['op-id'], send: ['op-id', 'message-file', 'turn'],
  steer: ['op-id', 'message-file', 'turn'], cancel: ['op-id', 'turn'],
  wait: ['op-id', 'until', 'timeout'],
  sessions: ['page-size', 'cursor'], snapshot: [],
  request: ['op-id', 'params-file', 'confirm'], dispatch: ['op-id', 'action-file', 'confirm'],
};

function duration(value = '30s'): number {
  const match = /^(\d+)(ms|s|m)$/.exec(value);
  if (!match) throw new CliError('usage', '--timeout must be a duration such as 500ms, 30s or 2m');
  const ms = Number(match[1]) * (match[2] === 'm' ? 60_000 : match[2] === 's' ? 1000 : 1);
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 3_600_000) throw new CliError('usage', '--timeout must be at most one hour');
  return ms;
}

function unreachable(error: unknown): boolean {
  return (error instanceof CliError && error.category === 'controller_unavailable')
    || (object(error) && ['ENOENT', 'ECONNREFUSED', 'EPIPE', 'ECONNRESET'].includes(String(error.code)));
}

export async function controllerRequest(
  metadata: InstanceMetadata, command: string, args: Record<string, unknown>,
  signal?: AbortSignal, timeoutMs = 30_000,
): Promise<unknown> {
  if (signal?.aborted) throw new CliError('interrupted', 'Local command interrupted');
  const request = JSON.stringify({ generation: metadata.generation, token: metadata.token, command, args }) + '\n';
  if (Buffer.byteLength(request) > 4 * 1024 * 1024) throw new CliError('usage', 'Local input exceeds 4 MiB');
  return new Promise((resolve, reject) => {
    const socket = connect(instancePaths(metadata.instance).socket);
    let buffer = '';
    let finished = false;
    const timer = setTimeout(() => finish(new CliError('timeout',
      'Local command timed out; submitted mutations may still run. Query the same operation ID.')), timeoutMs);
    const interrupted = () => finish(new CliError('interrupted', 'Command interrupted; controller remains running'));
    const finish = (error?: unknown, result?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', interrupted);
      socket.destroy();
      if (error !== undefined) reject(error);
      else resolve(result);
    };
    signal?.addEventListener('abort', interrupted, { once: true });
    socket.setEncoding('utf8');
    socket.once('error', error => finish(error));
    socket.once('close', () => {
      if (!finished) finish(new CliError('controller_unavailable', 'Controller closed before a command result; query retained evidence'));
    });
    socket.once('connect', () => socket.write(request));
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 24 * 1024 * 1024) {
        finish(new CliError('instance', 'Local result exceeds the 24 MiB limit'));
        return;
      }
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      try {
        const response: unknown = JSON.parse(buffer.slice(0, newline));
        if (!object(response) || typeof response.ok !== 'boolean') throw new CliError('instance', 'Invalid local result');
        if (response.ok) finish(undefined, response.result);
        else if (object(response.error) && typeof response.error.category === 'string'
          && typeof response.error.message === 'string') {
          finish(response.error.category === 'rpc' && typeof response.error.code === 'number'
            ? new RpcError(response.error.code, response.error.message, response.error.data)
            : new CliError(response.error.category, response.error.message, response.error.data));
        } else throw new CliError('instance', 'Invalid local error');
      } catch (error) { finish(error); }
    });
  });
}

async function launch(metadata: InstanceMetadata): Promise<void> {
  const paths = instancePaths(metadata.instance);
  const fd = openSync(paths.log, 'wx', 0o600);
  try {
    const child = spawn(process.execPath, [...process.execArgv, resolve(process.argv[1]), '--controller-process', metadata.instance], {
      detached: true, stdio: ['ignore', fd, fd],
      env: { ...process.env, AHP_STATE_DIR: paths.root },
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
  } catch (error) {
    metadata.state = 'failed';
    metadata.error = errorRecord(error, false);
    saveMetadata(metadata);
    throw error;
  } finally { closeSync(fd); }
}

async function liveStatus(metadata: InstanceMetadata, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (['stopped', 'failed'].includes(metadata.state)) return publicMetadata(metadata);
  try {
    const value = await controllerRequest(metadata, 'status', {}, signal, 2000);
    if (!object(value)) throw new CliError('instance', 'Invalid controller status');
    return value;
  } catch (error) {
    if (!unreachable(error)) throw error;
    return { ...publicMetadata(readMetadata(metadata.instance)), state: 'interrupted',
      error: errorRecord(new CliError('instance', 'No live controller for this generation; retained evidence is partial'), false) };
  }
}

async function operationOutcome(
  metadata: InstanceMetadata, opId: string, signal: AbortSignal, includeFingerprint = false,
): Promise<Record<string, unknown>> {
  if (!opId.trim()) throw new CliError('usage', '--op-id must not be empty');
  if (!includeFingerprint && (metadata.state === 'ready' || metadata.state === 'starting')) {
    try {
      const value = await controllerRequest(metadata, 'operation', { opId }, signal, 2000);
      if (!object(value)) throw new CliError('operation', 'Invalid operation result');
      return value;
    } catch (error) { if (!unreachable(error)) throw error; }
  }
  let after = 0;
  let offset = 0;
  let latest: Record<string, unknown> | undefined;
  while (true) {
    const page = await readEvidence(instancePaths(metadata.instance).journal, after, 1000, {}, { offset, cursor: after });
    for (const record of page.records) if (record.opId === opId) latest = record;
    if (page.nextCursor === after) break;
    after = page.nextCursor;
    offset = page.nextOffset;
  }
  if (!latest) throw new CliError('operation', 'Unknown operation ID');
  const { fingerprint: _fingerprint, minimumSeq: _minimumSeq, ...result } = latest;
  if (includeFingerprint) result.fingerprint = latest.fingerprint;
  if (['recorded', 'submitted', 'transport_completed'].includes(String(result.state))) {
    result.state = result.state === 'recorded' ? 'refused' : 'uncertain';
    result.error = errorRecord(new CliError('instance', 'No controller or authoritative terminal outcome; do not resend'), false);
  }
  return result;
}

export async function runControllerCli(args: string[], signal: AbortSignal): Promise<number> {
  const secrets: string[] = [];
  let command = args[0];
  let instance: string | undefined;
  let generation: string | undefined;
  const emit = (record: unknown) => stdout(redact(record, secrets));
  const result = (value: unknown) => emit({ version: 1, kind: 'result', command, instance, generation, result: value });
  try {
    let parsed;
    try { parsed = parseArgs({ args, options: OPTIONS, allowPositionals: true }); }
    catch { throw new CliError('usage', 'Invalid controller arguments; run ahp join --help'); }
    const { values, positionals } = parsed;
    command = positionals[0];
    if (values.help) { process.stderr.write(HELP); return 0; }
    if (!Object.hasOwn(ALLOWED, command)) throw new CliError('usage', 'Unknown controller command');
    const allowed = new Set(['instance', ...ALLOWED[command]]);
    for (const key of Object.keys(values)) if (!allowed.has(key)) throw new CliError('usage', `--${key} is not valid for ${command}`);
    const targets = positionals.slice(1);
    if (targets.length !== (['snapshot', 'request', 'dispatch'].includes(command) ? 1 : 0)) {
      throw new CliError('usage', 'Invalid target count for controller command');
    }
    instance = values.instance;
    if (!instance) throw new CliError('usage', 'Specify an explicit --instance NAME');
    const paths = instancePaths(instance);
    if (command === 'join' || command === 'listen') {
      const session = channel(values.session);
      if (!session.startsWith('ahp-session:/') || session.length > 4096) throw new CliError('usage', '--session must be a native session URI of at most 4096 characters');
      const url = values.url ?? process.env.AHP_URL;
      if (!url) throw new CliError('usage', 'Specify --url or AHP_URL');
      let endpoint: URL;
      try { endpoint = new URL(url); } catch { throw new CliError('usage', 'Invalid WebSocket endpoint'); }
      if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
        throw new CliError('usage', 'Endpoint must be ws:// or wss:// without userinfo or a fragment');
      }
      for (const [key, value] of endpoint.searchParams) {
        if (/token|secret|password|key|authorization/i.test(key) && value) secrets.push(value);
      }
      const timeoutMs = integer(values['timeout-ms'], 30_000, 1, 3_600_000, '--timeout-ms');
      const maxBytes = integer(values['max-record-bytes'], 64 * 1024 * 1024, 4096, 1024 * 1024 * 1024, '--max-record-bytes');
      const versions = values['protocol-version'] ?? [...SUPPORTED_PROTOCOL_VERSIONS];
      for (const version of versions) {
        try { compareProtocolVersions(version, version); }
        catch { throw new CliError('usage', '--protocol-version must be MAJOR.MINOR.PATCH'); }
      }
      const auth = values['auth-file'] ? await jsonFile(values['auth-file'], signal) : undefined;
      if (auth && (auth.channel !== 'ahp-root://' || typeof auth.resource !== 'string'
        || !auth.resource || typeof auth.token !== 'string')) throw new CliError('usage', 'Invalid authentication parameters');
      if (auth && typeof auth.token === 'string') secrets.push(auth.token);
      if (values['client-id'] !== undefined && (!values['client-id'].trim() || values['client-id'].length > 200)) {
        throw new CliError('usage', '--client-id must be nonempty and at most 200 characters');
      }
      const metadata = reserveInstance(instance, session, command === 'listen');
      generation = metadata.generation;
      if (values['client-id'] !== undefined) { metadata.clientId = values['client-id']; saveMetadata(metadata); }
      await launch(metadata);
      const started = Date.now();
      while (true) {
        if (signal.aborted) throw new CliError('interrupted', 'Command interrupted; controller may still be starting');
        const current = readMetadata(instance);
        if (current.state === 'failed') throw new CliError('instance', 'Controller failed to start', current.error);
        try {
          await controllerRequest(current, 'status', {}, signal, 2000);
          break;
        } catch (error) {
          if (!unreachable(error)) throw error;
          if (Date.now() - started > timeoutMs) throw new CliError('timeout', 'Controller IPC startup timed out; evidence retained');
          await delay(25, undefined, { signal });
        }
      }
      try {
        await result(await controllerRequest(readMetadata(instance), 'initialize', {
          url, auth, timeoutMs, maxBytes, versions, includeContent: values['include-content'] ?? false,
        }, signal, timeoutMs * 4 + 2000));
      } catch (error) {
        const current = readMetadata(instance);
        if (current.state === 'failed' && current.error) throw new CliError('instance', 'Controller initialization failed', current.error);
        throw error;
      }
      return 0;
    }
    const metadata = readMetadata(instance);
    generation = metadata.generation;
    if (command === 'status') {
      await result(values['op-id'] ? await operationOutcome(metadata, values['op-id'], signal) : await liveStatus(metadata, signal));
      return 0;
    }
    if (command === 'events') {
      const limit = integer(values.limit, 100, 1, 1000, '--limit');
      let after = integer(values.after, 0, 0, Number.MAX_SAFE_INTEGER, '--after');
      let position = { offset: 0, cursor: 0 };
      if (values.direction && !['in', 'out'].includes(values.direction)) throw new CliError('usage', '--direction must be in or out');
      const deadline = Date.now() + duration(values.timeout);
      let state: unknown;
      let incomplete = false;
      let limited = false;
      do {
        if (signal.aborted) throw new CliError('interrupted', 'Event observation interrupted; controller remains running');
        const page = await readEvidence(paths.events, after, limit, {
          method: values.method, channel: values.channel, direction: values.direction,
        }, position);
        for (const record of page.records) await emit({ ...record, instance, generation: metadata.generation });
        const advanced = page.nextCursor > after;
        after = page.nextCursor;
        position = { cursor: after, offset: page.nextOffset };
        incomplete = page.incomplete;
        limited = page.limited;
        state = (await liveStatus(readMetadata(instance), signal)).state;
        if (!values.follow || Date.now() >= deadline || (state !== 'ready' && !page.limited)) break;
        if (!advanced) await delay(Math.min(100, Math.max(1, deadline - Date.now())), undefined, { signal });
      } while (true);
      await result({ instance, generation: metadata.generation, nextCursor: after, state, incomplete, limited });
      if (state === 'failed' || state === 'interrupted' || (incomplete && state !== 'ready')) {
        throw new CliError('capture', 'Recording ended abnormally; partial evidence retained');
      }
      return 0;
    }
    if (command === 'wait') {
      if (!values['op-id']) throw new CliError('usage', 'wait requires --op-id');
      const until = values.until ?? 'accepted';
      if (!['accepted', 'completed'].includes(until)) throw new CliError('usage', '--until must be accepted or completed');
      const deadline = Date.now() + duration(values.timeout);
      do {
        const operation = await operationOutcome(readMetadata(instance), values['op-id'], signal);
        if (until === 'completed' && !['send', 'cancel'].includes(String(operation.command))) {
          throw new CliError('usage', 'Completion waits are supported for send/cancel only; steering acceptance is not consumption');
        }
        if (['refused', 'rejected', 'uncertain'].includes(String(operation.state))) {
          throw new CliError(String(operation.state), 'Operation did not reach the requested condition; do not resend', operation);
        }
        if (operation.state === 'accepted' && (until === 'accepted' || operation.completion !== undefined)) {
          await result(operation);
          if (until === 'completed' && operation.completion === 'error') throw new CliError('turn', 'Turn ended with an error', operation);
          return 0;
        }
        if ((await liveStatus(readMetadata(instance), signal)).state !== 'ready') {
          throw new CliError('uncertain', 'Controller ended before the requested condition was observed', operation);
        }
        if (Date.now() >= deadline) throw new CliError('timeout', 'Wait timed out; operation continues independently', operation);
        await delay(Math.min(100, Math.max(1, deadline - Date.now())), undefined, { signal });
      } while (true);
    }
    if (command === 'stop' && ['stopped', 'failed'].includes(metadata.state)) {
      await result(publicMetadata(metadata));
      return 0;
    }
    const request: Record<string, unknown> = {
      ...(values['op-id'] !== undefined ? { opId: values['op-id'] } : {}),
      ...(values.turn !== undefined ? { turn: values.turn } : {}),
      ...(values.confirm !== undefined ? { confirm: values.confirm } : {}),
    };
    if (command === 'send' || command === 'steer') {
      if (!values['message-file']) throw new CliError('usage', `${command} requires --message-file`);
      request.text = await textFile(values['message-file'], signal);
    }
    if (command === 'snapshot' || command === 'dispatch') request.channel = channel(targets[0]);
    if (command === 'dispatch') {
      if (!values['action-file']) throw new CliError('usage', 'dispatch requires --action-file');
      request.action = await jsonFile(values['action-file'], signal);
    }
    if (command === 'request') {
      if (!values['params-file']) throw new CliError('usage', 'request requires --params-file');
      request.method = targets[0];
      request.params = await jsonFile(values['params-file'], signal);
    }
    if (command === 'sessions') {
      if (values['page-size']) request.pageSize = integer(values['page-size'], 20, 1, 1000, '--page-size');
      if (values.cursor !== undefined) request.cursor = values.cursor;
    }
    const mutating = ['participate', 'send', 'steer', 'cancel', 'dispatch'].includes(command)
      || (command === 'request' && typeof request.method === 'string' && requestPolicy(request.method) !== 'read');
    const recover = async () => {
      if (typeof request.opId !== 'string') throw new CliError('usage', 'Mutations require --op-id');
      const operation = await operationOutcome(metadata, request.opId, signal, true);
      if (operation.fingerprint !== operationFingerprint(command, request)) {
        throw new CliError('operation', 'Operation ID was already used with different inputs');
      }
      const { fingerprint: _fingerprint, ...outcome } = operation;
      return outcome;
    };
    let response: unknown;
    if (mutating && ['stopped', 'failed'].includes(metadata.state)) response = await recover();
    else {
      try { response = await controllerRequest(metadata, command, request, signal); }
      catch (error) {
        if (!mutating || !unreachable(error)) throw error;
        response = await recover();
      }
    }
    if (command === 'stop') {
      const deadline = Date.now() + 5000;
      while (!['stopped', 'failed'].includes(readMetadata(instance).state)) {
        if (Date.now() > deadline) throw new CliError('timeout', 'Local stop did not complete; evidence retained');
        await delay(25, undefined, { signal });
      }
      const stopped = readMetadata(instance);
      if (stopped.state === 'failed') throw new CliError('instance', 'Controller ended with a failure', stopped.error);
      await result(publicMetadata(stopped));
    } else {
      await result(response);
    }
    return 0;
  } catch (error) {
    const record = errorRecord(signal.aborted ? new CliError('interrupted', 'Command interrupted; controller and submitted operations are independent') : error, false);
    await emit(record);
    return record.category === 'usage' ? 2 : record.category === 'interrupted' ? signal.reason === 'SIGTERM' ? 143 : 130 : 1;
  }
}
