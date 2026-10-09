import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { AhpClient } from '../../clients/typescript/src/client/client.js';
import { RpcError } from '../../clients/typescript/src/client/error.js';
import { SUPPORTED_PROTOCOL_VERSIONS, compareProtocolVersions } from '../../clients/typescript/src/types/version/registry.js';
import { Capture, frameRecord, replay, type Frame } from './capture.js';
import { describeProtocol, dispatchable, requestPolicy } from './catalog.js';
import { channel, CliError, deadline, errorRecord, integer, jsonFile, object, redact, stdout } from './common.js';
import { ObservedTransport, openTransport } from './connection.js';
import { controllerInvocation, runControllerCli } from './controller-cli.js';

export const HELP = `Usage: ahp COMMAND [TARGET...] [OPTIONS]

Agent-oriented AHP protocol debugging. JSONL output; no interactive prompts.

  describe                    Offline protocol versions, methods and action policy
  connect                     Initialize and inspect host capabilities
  ping                        Protocol liveness request
  sessions                    One listSessions page (--page-size)
  snapshot URI                Subscribe and read an authoritative snapshot
  watch URI...                Subscribe and observe bounded notification metadata
  listen URI...               Alias for watch
  request METHOD              Explicit RPC (--params-file FILE, or - for stdin)
  dispatch URI                Dispatch once, await echo (--action-file FILE --confirm)
  replay FILE                 Offline capture review; never resends frames

Persistent controllers (explicit --instance NAME):
  join --session URI          Retain connection, session and advertised default chat
  listen --session URI        Separate observer-only controller with durable events
  status / events / stop      Inspect, query/follow evidence, or stop locally
  participate / send          Explicit participation or new turn (--op-id)
  steer / cancel              Exact active turn (--turn, --op-id)
  wait                        Wait on --op-id --until accepted|completed --timeout 30s
  ping/sessions/snapshot      Read using an instance's retained connection
  request/dispatch            Raw mutation requires --confirm and --op-id

Use ahp join --help for controller options. One-shot listen URI... remains watch.

Network options:
  --url URL                   WebSocket endpoint (or AHP_URL)
  --client-id ID              Explicit identity (default: fresh UUID)
  --protocol-version VERSION  Offered version; repeat to offer several
  --timeout-ms N              Connection/per-request timeout (default: 30000)
  --auth-file FILE            authenticate parameters; token stays off argv
  --record FILE               Exclusive private JSONL capture (never overwrite)
  --max-record-bytes N        Capture cap (default: 67108864, minimum: 4096)
  --include-content           Include redacted frame bodies in watch/capture
  --confirm                   Required for mutations and extension requests

Observation/replay options:
  --duration-ms N             watch duration (default: 10000, maximum: 3600000)
  --limit N                   Notifications/replay records (default: 100)
  --after N                   Replay cursor (default: 0)
  --method NAME               Replay method filter
  --channel URI              Replay channel filter
  --direction in|out          Replay direction filter

Read commands never claim ownership or submit work. Connecting/subscribing can
have host-defined effects. No automatic retries. Captures may contain secrets.
Exit codes: 0 completed, 1 failed, 2 invalid usage, 130 SIGINT, 143 SIGTERM.
`;

const OPTIONS = {
  help: { type: 'boolean' },
  url: { type: 'string' },
  'client-id': { type: 'string' },
  'protocol-version': { type: 'string', multiple: true },
  'timeout-ms': { type: 'string' },
  'auth-file': { type: 'string' },
  record: { type: 'string' },
  'max-record-bytes': { type: 'string' },
  'include-content': { type: 'boolean' },
  confirm: { type: 'boolean' },
  'params-file': { type: 'string' },
  'action-file': { type: 'string' },
  'page-size': { type: 'string' },
  'duration-ms': { type: 'string' },
  limit: { type: 'string' },
  after: { type: 'string' },
  method: { type: 'string' },
  channel: { type: 'string' },
  direction: { type: 'string' },
} as const;

const NETWORK_OPTIONS = [
  'url', 'client-id', 'protocol-version', 'timeout-ms', 'auth-file',
  'record', 'max-record-bytes', 'include-content',
];

export async function runCli(args: string[], signal: AbortSignal): Promise<number> {
  if (controllerInvocation(args)) return runControllerCli(args, signal);
  const secrets: string[] = [];
  let capture: Capture | undefined;
  let client: AhpClient | undefined;
  let transport: ObservedTransport | undefined;
  let outcomeUnknown = false;
  let operationFailure: unknown;
  let observeFailure: unknown;
  let stopWatching: (() => void) | undefined;
  let resolveEcho: ((params: Record<string, unknown>) => void) | undefined;
  let watchingReady = false;
  const buffered: Frame[] = [];
  let watched = 0;
  let minimumEchoSeq = -1;
  let command = '';
  const emit = async (record: unknown) => stdout(redact(record, secrets));
  const result = (value: unknown) => emit({ version: 1, kind: 'result', command, result: value });
  let rejectAbort: (error: Error) => void = () => {};
  const interrupted = () => rejectAbort(signal.reason instanceof Error
    ? signal.reason : new CliError('interrupted', 'Operation interrupted'));
  const abort = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  if (signal.aborted) interrupted();
  else signal.addEventListener('abort', interrupted, { once: true });
  // The same abort is raced against connection work, requests and observation.
  void abort.catch(() => {});
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, options: OPTIONS, allowPositionals: true });
    } catch {
      throw new CliError('usage', 'Invalid arguments; run ahp --help');
    }
    const { values, positionals } = parsed;
    if (values.help || positionals[0] === 'help' || args.length === 0) {
      process.stderr.write(HELP);
      return 0;
    }
    command = positionals[0] === 'listen' ? 'watch' : positionals[0];
    const targets = positionals.slice(1);
    const extraOptions: Record<string, string[]> = {
      describe: [], connect: [], ping: [],
      sessions: ['page-size'],
      snapshot: [],
      watch: ['duration-ms', 'limit'],
      request: ['params-file', 'confirm'],
      dispatch: ['action-file', 'confirm'],
      replay: ['after', 'limit', 'method', 'channel', 'direction'],
    };
    if (!Object.hasOwn(extraOptions, command)) throw new CliError('usage', 'Unknown command; run ahp --help');
    const offline = command === 'describe' || command === 'replay';
    const allowed = new Set([...extraOptions[command], ...(offline ? [] : NETWORK_OPTIONS)]);
    for (const key of Object.keys(values)) {
      if (!allowed.has(key)) throw new CliError('usage', `--${key} is not valid for ${command}`);
    }
    const count = targets.length;
    if (command === 'watch' ? count < 1
      : ['snapshot', 'request', 'dispatch', 'replay'].includes(command) ? count !== 1 : count !== 0) {
      throw new CliError('usage', `Invalid target count for ${command}; run ahp --help`);
    }
    const limit = integer(values.limit, 100, 1, 1_000_000, '--limit');
    if (command === 'describe') {
      await result(describeProtocol());
      return 0;
    }
    if (command === 'replay') {
      if (values.direction && !['in', 'out'].includes(values.direction)) {
        throw new CliError('usage', '--direction must be in or out');
      }
      await result(await replay(targets[0], {
        after: integer(values.after, 0, 0, Number.MAX_SAFE_INTEGER, '--after'),
        limit, method: values.method, channel: values.channel, direction: values.direction,
      }, emit, signal));
      return 0;
    }
    const endpoint = values.url ?? process.env.AHP_URL;
    if (!endpoint) throw new CliError('usage', 'Specify --url or AHP_URL');
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new CliError('usage', 'Endpoint must be a ws:// or wss:// URL');
    }
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new CliError('usage', 'Endpoint must be ws:// or wss:// without userinfo or a fragment');
    }
    for (const [key, value] of url.searchParams) {
      if (/token|secret|password|key|authorization/i.test(key) && value) secrets.push(value);
    }
    if (values['max-record-bytes'] && !values.record) {
      throw new CliError('usage', '--max-record-bytes requires --record');
    }
    if (values['include-content'] && !values.record && command !== 'watch') {
      throw new CliError('usage', '--include-content requires --record or watch');
    }
    const timeoutMs = integer(values['timeout-ms'], 30_000, 1, 3_600_000, '--timeout-ms');
    const durationMs = integer(values['duration-ms'], 10_000, 1, 3_600_000, '--duration-ms');
    const maxBytes = integer(values['max-record-bytes'], 64 * 1024 * 1024, 4096, 1024 * 1024 * 1024, '--max-record-bytes');
    const pageSize = values['page-size'] === undefined ? undefined
      : integer(values['page-size'], 20, 1, 1000, '--page-size');
    const versions = values['protocol-version'] ?? [...SUPPORTED_PROTOCOL_VERSIONS];
    for (const version of versions) {
      try {
        compareProtocolVersions(version, version);
      } catch {
        throw new CliError('usage', '--protocol-version must be MAJOR.MINOR.PATCH');
      }
    }
    const clientId = values['client-id'] ?? randomUUID();
    if (!clientId.trim()) throw new CliError('usage', '--client-id must not be empty');
    const channels = ['watch', 'snapshot', 'dispatch'].includes(command)
      ? [...new Set(targets.map(channel))] : [];
    let params: Record<string, unknown> | undefined;
    let action: Record<string, unknown> | undefined;
    if (values['auth-file'] === '-'
      && (values['params-file'] === '-' || values['action-file'] === '-')) {
      throw new CliError('usage', 'Only one input file can read stdin');
    }
    if (command === 'request') {
      if (!/^\S+$/.test(targets[0])) throw new CliError('usage', 'Request method must not be empty or contain whitespace');
      const policy = requestPolicy(targets[0]);
      if (policy === 'lifecycle') throw new CliError('usage', 'Use the dedicated lifecycle commands or --auth-file');
      if (policy !== 'read' && !values.confirm) throw new CliError('usage', 'This request requires --confirm');
      if (!values['params-file']) throw new CliError('usage', 'request requires --params-file');
      params = await Promise.race([jsonFile(values['params-file'], signal), abort]);
      channel(params.channel);
    }
    if (command === 'dispatch') {
      if (!values.confirm || !values['action-file']) {
        throw new CliError('usage', 'dispatch requires --action-file and --confirm');
      }
      action = await Promise.race([jsonFile(values['action-file'], signal), abort]);
      if (typeof action.type !== 'string' || !dispatchable(action.type)) {
        throw new CliError('usage', 'Action type must be known and client-dispatchable; run ahp describe');
      }
    }
    const auth = values['auth-file'] ? await Promise.race([jsonFile(values['auth-file'], signal), abort]) : undefined;
    if (auth) {
      if (auth.channel !== 'ahp-root://' || typeof auth.resource !== 'string'
        || !auth.resource || typeof auth.token !== 'string') {
        throw new CliError('usage', '--auth-file must contain channel: ahp-root://, resource, and token');
      }
      if (auth.token) secrets.push(auth.token);
    }
    if (values.record) capture = new Capture(values.record, maxBytes, secrets);
    const watchDone = new Promise<void>(resolve => { stopWatching = resolve; });
    const echo = new Promise<Record<string, unknown>>(resolve => { resolveEcho = resolve; });
    const emitFrame = async (frame: Frame) => {
      if (watched >= limit) return;
      await emit(frameRecord(frame, values['include-content'] ?? false));
      watched++;
      if (watched >= limit) stopWatching?.();
    };
    const observedTransport = new ObservedTransport(await openTransport(endpoint, timeoutMs, signal), async frame => {
      try {
        capture?.append(frameRecord(frame, values['include-content'] ?? false));
        if (frame.direction !== 'in') return;
        if (command === 'dispatch' && frame.method === 'action' && frame.channel === channels[0]
          && outcomeUnknown && typeof frame.serverSeq === 'number' && frame.serverSeq > minimumEchoSeq
          && object(frame.message.params) && object(frame.message.params.origin)
          && object(frame.message.params.action) && frame.message.params.action.type === action?.type
          && frame.message.params.origin.clientId === clientId
          && frame.message.params.origin.clientSeq === 1) {
          resolveEcho?.(frame.message.params);
        }
        if (command === 'watch' && frame.method && !('id' in frame.message)
          && frame.channel && channels.includes(frame.channel)) {
          if (watchingReady) await emitFrame(frame);
          else {
            if (buffered.length >= 4096) throw new CliError('protocol', 'Observation buffer overflow before snapshots');
            buffered.push(frame);
          }
        }
      } catch (error) {
        observeFailure = error;
        throw error;
      }
    }, error => { observeFailure = error; });
    transport = observedTransport;
    client = new AhpClient(observedTransport, { requestTimeoutMs: timeoutMs });
    const states = client.stateChanges();
    const disconnected = (async () => {
      for await (const state of states) {
        if (state.status === 'closed' && state.reason.type === 'transport') {
          throw observeFailure ?? state.reason.error;
        }
      }
      return new Promise<never>(() => {});
    })();
    void disconnected.catch(() => {});
    client.connect();
    const currentClient = client;
    const operation = async () => {
      const init = await currentClient.request('initialize', {
        channel: 'ahp-root://', clientId, protocolVersions: versions,
        clientInfo: { name: 'ahp-cli' },
      });
      if (!object(init) || !versions.includes(init.protocolVersion)) {
        throw new CliError('protocol', 'Host selected a protocol version not offered by this client');
      }
      if (auth) await currentClient.requestRaw('authenticate', auth);
      if (command === 'connect') return result(init);
      if (command === 'ping') {
        await currentClient.ping();
        return result(null);
      }
      if (command === 'sessions') return result(await currentClient.request('listSessions', {
        channel: 'ahp-root://',
        ...(pageSize !== undefined ? { limit: pageSize } : {}),
      }));
      if (command === 'request') {
        outcomeUnknown = requestPolicy(targets[0]) !== 'read';
        const response = await currentClient.requestRaw(targets[0], params);
        outcomeUnknown = false;
        return result(response);
      }
      for (const uri of channels) {
        const { result: subscription } = await currentClient.subscribe(uri);
        if (!object(subscription)) throw new CliError('protocol', 'Invalid subscribe result');
        if (subscription.snapshot !== undefined) {
          if (!object(subscription.snapshot) || subscription.snapshot.resource !== uri
            || typeof subscription.snapshot.fromSeq !== 'number'
            || !Number.isSafeInteger(subscription.snapshot.fromSeq) || subscription.snapshot.fromSeq < 0
            || !object(subscription.snapshot.state)) {
            throw new CliError('protocol', 'Invalid or mismatched subscription snapshot');
          }
          minimumEchoSeq = subscription.snapshot.fromSeq;
        }
        if (command !== 'dispatch') await emit({
          version: 1, kind: 'snapshot', command, channel: uri,
          stateful: subscription.snapshot !== undefined, snapshot: subscription.snapshot ?? null,
        });
      }
      if (command === 'snapshot') return result({ channel: channels[0] });
      if (command === 'dispatch') {
        outcomeUnknown = true;
        await observedTransport.send(JSON.stringify({
          jsonrpc: '2.0', method: 'dispatchAction',
          params: { channel: channels[0], clientSeq: 1, action },
        }));
        const accepted = await deadline(
          Promise.race([echo, disconnected]), timeoutMs, 'Timed out waiting for the authoritative action echo',
        );
        outcomeUnknown = false;
        if (accepted.rejectionReason !== undefined) {
          throw new CliError('rejected', 'Host rejected dispatched action', accepted);
        }
        return result({ outcome: 'accepted', envelope: accepted });
      }
      // Frames received during subscribe remain ordered behind initial snapshots.
      while (buffered.length) await emitFrame(buffered.shift()!);
      watchingReady = true;
      let timer: ReturnType<typeof setTimeout>;
      const duration = new Promise<void>(resolve => { timer = setTimeout(resolve, durationMs); });
      try {
        await Promise.race([duration, watchDone, disconnected, abort]);
      } finally {
        clearTimeout(timer!);
      }
      return result({ notifications: watched });
    };
    await Promise.race([operation(), abort]);
    await client.shutdown();
    if (observeFailure !== undefined) throw observeFailure;
    capture?.finish('completed');
    return 0;
  } catch (error) {
    operationFailure = observeFailure ?? error;
    if (operationFailure instanceof RpcError) outcomeUnknown = false;
    const record = errorRecord(operationFailure, outcomeUnknown);
    await emit(record);
    return record.category === 'usage' ? 2
      : record.category === 'interrupted' ? signal.reason === 'SIGTERM' ? 143 : 130 : 1;
  } finally {
    signal.removeEventListener('abort', interrupted);
    stopWatching?.();
    await client?.shutdown();
    // SDK teardown on receive failure may precede shutdown; we still own the socket.
    await transport?.close();
    if (operationFailure !== undefined) {
      capture?.finish('failed', String(errorRecord(operationFailure, false).category));
    }
  }
}
