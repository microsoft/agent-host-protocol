import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { CliError, object, redact } from './common.js';

export const MAX_FRAME_BYTES = 4 * 1024 * 1024;

export interface Frame {
  direction: 'in' | 'out';
  bytes: number;
  method?: string;
  channel?: string;
  rpcId?: unknown;
  serverSeq?: number;
  message: Record<string, unknown>;
}

export function inspectFrame(text: string, direction: Frame['direction']): Frame {
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_FRAME_BYTES) throw new CliError('protocol', 'Frame exceeds the 4 MiB diagnostic limit');
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    throw new CliError('protocol', 'Malformed JSON-RPC frame');
  }
  if (!object(message) || message.jsonrpc !== '2.0') {
    throw new CliError('protocol', 'Invalid JSON-RPC envelope');
  }
  if ('id' in message && (typeof message.id !== 'number' || !Number.isSafeInteger(message.id))) {
    throw new CliError('protocol', 'Invalid JSON-RPC request or response ID');
  }
  if ('method' in message) {
    if (typeof message.method !== 'string' || !message.method
      || 'result' in message || 'error' in message) {
      throw new CliError('protocol', 'Invalid JSON-RPC request or notification');
    }
  } else {
    if (!('id' in message) || ('result' in message) === ('error' in message)) {
      throw new CliError('protocol', 'Invalid JSON-RPC response');
    }
    if ('error' in message && (!object(message.error)
      || typeof message.error.code !== 'number' || !Number.isSafeInteger(message.error.code)
      || typeof message.error.message !== 'string')) {
      throw new CliError('protocol', 'Invalid JSON-RPC error response');
    }
  }
  const params = object(message.params) ? message.params : undefined;
  if (params && 'serverSeq' in params
    && (typeof params.serverSeq !== 'number' || !Number.isSafeInteger(params.serverSeq) || params.serverSeq < 0)) {
    throw new CliError('protocol', 'Invalid server sequence number');
  }
  return {
    direction, bytes, message,
    ...(typeof message.method === 'string' ? { method: message.method } : {}),
    ...(typeof params?.channel === 'string' ? { channel: params.channel } : {}),
    ...('id' in message ? { rpcId: message.id } : {}),
    ...(typeof params?.serverSeq === 'number' ? { serverSeq: params.serverSeq } : {}),
  };
}

export function frameRecord(frame: Frame, includeContent: boolean): Record<string, unknown> {
  const { message, ...metadata } = frame;
  return { version: 1, kind: 'frame', ...metadata, ...(includeContent ? { message } : {}) };
}

export class Capture {
  private readonly fd: number;
  private cursor = 0;
  private bytes = 0;
  private finished = false;

  constructor(
    path: string,
    private readonly maxBytes: number,
    private readonly secrets: readonly string[],
    private readonly durable = false,
  ) {
    this.fd = openSync(path, 'wx', 0o600);
    try {
      this.append({ kind: 'capture', state: 'started' });
    } catch (error) {
      closeSync(this.fd);
      throw error;
    }
  }

  append(value: Record<string, unknown>): void {
    if (this.finished) throw new CliError('capture', 'Capture is already closed');
    const line = JSON.stringify(redact({
      ...value, version: 1, cursor: this.cursor + 1, timestamp: new Date().toISOString(),
    }, this.secrets)) + '\n';
    const buffer = Buffer.from(line);
    if (buffer.length > MAX_FRAME_BYTES * 6) {
      throw new CliError('capture', 'Recording record exceeds the 24 MiB diagnostic limit');
    }
    // Reserve space for the final marker, including a bounded error description.
    if (this.bytes + buffer.length > this.maxBytes - 2048 && value.kind !== 'capture') {
      throw new CliError('capture', 'Recording byte limit exceeded; partial capture retained');
    }
    let offset = 0;
    while (offset < buffer.length) {
      const written = writeSync(this.fd, buffer, offset, buffer.length - offset);
      if (written === 0) throw new CliError('capture', 'Recording write made no progress');
      offset += written;
    }
    this.bytes += buffer.length;
    this.cursor++;
    if (this.durable) fsyncSync(this.fd);
  }

  finish(state: 'completed' | 'failed', category?: string): void {
    if (this.finished) return;
    try {
      this.append({ kind: 'capture', state, ...(category ? { category } : {}) });
    } finally {
      this.finished = true;
      closeSync(this.fd);
    }
  }
}

export interface ReplayOptions {
  after: number;
  limit: number;
  method?: string;
  channel?: string;
  direction?: string;
}

export async function replay(
  path: string,
  options: ReplayOptions,
  emit: (record: Record<string, unknown>) => Promise<void>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw new CliError('interrupted', 'Replay interrupted');
  const input = createReadStream(path, { encoding: 'utf8' });
  const interrupted = () => input.destroy(new CliError('interrupted', 'Replay interrupted'));
  signal?.addEventListener('abort', interrupted, { once: true });
  async function* readLines(): AsyncGenerator<string> {
    let pending = '';
    for await (const chunk of input) {
      pending += chunk;
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        yield pending.slice(0, newline);
        pending = pending.slice(newline + 1);
      }
      if (Buffer.byteLength(pending) > MAX_FRAME_BYTES * 6) {
        throw new CliError('replay', 'Capture record exceeds the diagnostic limit');
      }
    }
    if (pending) yield pending;
  }
  let cursor = 0;
  let displayed = 0;
  let terminal: string | undefined;
  let limited = false;
  try {
    for await (const line of readLines()) {
      if (Buffer.byteLength(line) > MAX_FRAME_BYTES * 6) {
        throw new CliError('replay', 'Capture record exceeds the diagnostic limit');
      }
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        throw new CliError('replay', `Invalid JSON at capture record ${cursor + 1}`);
      }
      if (!object(record) || record.version !== 1 || record.cursor !== cursor + 1
        || typeof record.timestamp !== 'string' || !['capture', 'frame'].includes(String(record.kind))) {
        throw new CliError('replay', `Invalid capture record or cursor gap at ${cursor + 1}`);
      }
      if (terminal || (cursor === 0 && (record.kind !== 'capture' || record.state !== 'started'))) {
        throw new CliError('replay', 'Invalid capture lifecycle');
      }
      cursor++;
      if (record.kind === 'capture') {
        if (cursor !== 1) {
          if (record.state !== 'completed' && record.state !== 'failed') {
            throw new CliError('replay', 'Invalid capture completion marker');
          }
          terminal = record.state;
        }
      } else if (!['in', 'out'].includes(String(record.direction))
        || typeof record.bytes !== 'number' || !Number.isSafeInteger(record.bytes) || record.bytes < 0) {
        throw new CliError('replay', 'Invalid frame metadata');
      }
      if (cursor <= options.after
        || (options.direction && record.direction !== options.direction)
        || (options.method && record.method !== options.method)
        || (options.channel && record.channel !== options.channel)) continue;
      await emit(record);
      displayed++;
      if (displayed >= options.limit) {
        limited = true;
        break;
      }
    }
  } finally {
    signal?.removeEventListener('abort', interrupted);
    input.destroy();
  }
  if (!limited && !terminal) throw new CliError('replay', 'Incomplete capture: no completion marker');
  return { displayed, lastCursor: cursor, fullyInspected: !limited, captureState: terminal ?? 'unverified' };
}
