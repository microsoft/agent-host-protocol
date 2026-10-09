import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync, createReadStream, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, statSync, writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CliError, object } from './common.js';

export const JOURNAL_BYTES = 8 * 1024 * 1024;
export const RECORD_BYTES = 24 * 1024 * 1024;

export interface InstanceMetadata {
  version: 1;
  instance: string;
  generation: string;
  token: string;
  pid: number;
  state: 'starting' | 'ready' | 'stopped' | 'failed';
  observer: boolean;
  clientId: string;
  session: string;
  chat?: string;
  protocolVersion?: string;
  error?: Record<string, unknown>;
}

export function publicMetadata(metadata: InstanceMetadata): Record<string, unknown> {
  const { token: _token, ...result } = metadata;
  return result;
}

function canonical(value: unknown, depth = 0): string {
  if (depth > 100) throw new CliError('usage', 'Input nesting exceeds the diagnostic limit');
  if (Array.isArray(value)) return '[' + value.map(item => canonical(item, depth + 1)).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
  return JSON.stringify(value);
}

export function serializeIntent(command: string, args: Record<string, unknown>): string {
  return canonical({ command, ...args });
}

export function operationFingerprint(command: string, args: Record<string, unknown>): string {
  return createHash('sha256').update(serializeIntent(command, args)).digest('hex');
}

function metadataState(value: unknown): value is InstanceMetadata['state'] {
  return value === 'starting' || value === 'ready' || value === 'stopped' || value === 'failed';
}

export function instancePaths(instance: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(instance)) {
    throw new CliError('usage', '--instance must be 1-40 letters, digits, underscores or hyphens');
  }
  const root = resolve(process.env.AHP_STATE_DIR ?? join(homedir(), '.ahp'));
  const dir = join(root, 'instances', instance);
  const hash = createHash('sha256').update(dir).digest('hex').slice(0, 24);
  const socket = process.platform === 'win32'
    ? `\\\\.\\pipe\\ahp-${hash}` : join(root, 'ipc', `${hash}.sock`);
  if (process.platform !== 'win32' && Buffer.byteLength(socket) > 100) {
    throw new CliError('usage', 'IPC path is too long; set AHP_STATE_DIR to a shorter private directory');
  }
  return {
    root, dir, socket, metadata: join(dir, 'instance.json'),
    events: join(dir, 'events.jsonl'), journal: join(dir, 'operations.jsonl'),
    log: join(dir, 'controller.log'),
  };
}

function privateDirectory(path: string): void {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (process.platform !== 'win32'
      && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))) {
    throw new CliError('instance', `Instance storage must be an owned private directory: ${path}`);
  }
}

export function reserveInstance(instance: string, session: string, observer: boolean): InstanceMetadata {
  const paths = instancePaths(instance);
  mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  privateDirectory(paths.root);
  for (const subdir of ['instances', 'ipc']) {
    const path = join(paths.root, subdir);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    privateDirectory(path);
  }
  try {
    mkdirSync(paths.dir, { mode: 0o700 });
  } catch (error) {
    if (object(error) && error.code === 'EEXIST') {
      throw new CliError('instance', 'Instance name is occupied; choose a new name. Evidence is never overwritten.');
    }
    throw error;
  }
  const metadata: InstanceMetadata = {
    version: 1, instance, generation: randomUUID(), token: randomBytes(32).toString('hex'),
    pid: 0, state: 'starting', observer, clientId: randomUUID(), session,
  };
  saveMetadata(metadata);
  return metadata;
}

export function readMetadata(instance: string): InstanceMetadata {
  const paths = instancePaths(instance);
  privateDirectory(paths.root);
  privateDirectory(join(paths.root, 'instances'));
  privateDirectory(paths.dir);
  const info = lstatSync(paths.metadata);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024
    || (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))) {
    throw new CliError('instance', 'Invalid or non-private instance metadata');
  }
  const value: unknown = JSON.parse(readFileSync(paths.metadata, 'utf8'));
  if (!object(value) || value.version !== 1 || value.instance !== instance
    || typeof value.generation !== 'string' || typeof value.token !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.token)
    || typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid < 0
    || !metadataState(value.state)
    || typeof value.observer !== 'boolean' || typeof value.clientId !== 'string'
    || typeof value.session !== 'string'
    || (value.chat !== undefined && typeof value.chat !== 'string')
    || (value.protocolVersion !== undefined && typeof value.protocolVersion !== 'string')
    || (value.error !== undefined && !object(value.error))) {
    throw new CliError('instance', 'Invalid instance metadata');
  }
  return {
    version: 1, instance, generation: value.generation, token: value.token,
    pid: value.pid, state: value.state,
    observer: value.observer, clientId: value.clientId, session: value.session,
    ...(value.chat !== undefined ? { chat: value.chat } : {}),
    ...(value.protocolVersion !== undefined ? { protocolVersion: value.protocolVersion } : {}),
    ...(value.error !== undefined ? { error: value.error } : {}),
  };
}

export function saveMetadata(metadata: InstanceMetadata): void {
  const path = instancePaths(metadata.instance).metadata;
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeAll(fd, Buffer.from(JSON.stringify(metadata) + '\n'));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  if (process.platform !== 'win32') {
    const parent = openSync(dirname(path), 'r');
    try { fsyncSync(parent); } finally { closeSync(parent); }
  }
}

function writeAll(fd: number, buffer: Buffer): void {
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset);
    if (!written) throw new CliError('capture', 'Evidence write made no progress');
    offset += written;
  }
}

export class OperationJournal {
  private readonly fd: number;
  private bytes = 0;
  private cursor = 0;
  constructor(path: string) { this.fd = openSync(path, 'wx', 0o600); }
  append(operation: Record<string, unknown>): void {
    const buffer = Buffer.from(JSON.stringify({
      version: 1, kind: 'operation', cursor: this.cursor + 1,
      timestamp: new Date().toISOString(), ...operation,
    }) + '\n');
    if (this.bytes + buffer.length > JOURNAL_BYTES) {
      throw new CliError('capture', 'Operation journal limit exceeded; evidence retained');
    }
    writeAll(this.fd, buffer);
    fsyncSync(this.fd);
    this.bytes += buffer.length;
    this.cursor++;
  }
  close(): void { closeSync(this.fd); }
}

export interface EventPage {
  records: Record<string, unknown>[];
  nextCursor: number;
  terminal?: string;
  incomplete: boolean;
  limited: boolean;
  nextOffset: number;
}

export async function readEvidence(
  path: string, after: number, limit: number,
  filter: { method?: string; channel?: string; direction?: string } = {},
  start: { offset: number; cursor: number } = { offset: 0, cursor: 0 },
): Promise<EventPage> {
  const size = statSync(path).size;
  if (size > 1024 * 1024 * 1024) throw new CliError('capture', 'Evidence exceeds the supported size');
  if (start.offset > size || start.cursor > after) throw new CliError('capture', 'Evidence was truncated or cursor moved backwards');
  const page: EventPage = {
    records: [], nextCursor: start.cursor, nextOffset: start.offset, incomplete: false, limited: false,
  };
  if (size === start.offset) {
    if (after > start.cursor) throw new CliError('usage', 'Cursor is beyond this recording');
    return page;
  }
  const input = createReadStream(path, { start: start.offset, end: size - 1 });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let cursor = start.cursor;
  let bytes = 0;
  try {
    for await (const chunk of input) {
      pending += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (Buffer.byteLength(line) > RECORD_BYTES) throw new CliError('capture', 'Oversized evidence record');
        const record: unknown = JSON.parse(line);
        if (!object(record) || record.version !== 1 || record.cursor !== cursor + 1
          || typeof record.kind !== 'string' || typeof record.timestamp !== 'string') {
          throw new CliError('capture', `Invalid evidence or cursor gap at ${cursor + 1}`);
        }
        cursor++;
        if (record.kind === 'capture' && ['completed', 'failed'].includes(String(record.state))) {
          page.terminal = String(record.state);
        }
        const selected = cursor > after
          && (!filter.method || record.method === filter.method)
          && (!filter.channel || record.channel === filter.channel)
          && (!filter.direction || record.direction === filter.direction);
        if (selected) {
          if (bytes + Buffer.byteLength(line) > 1024 * 1024 && page.records.length) {
            page.limited = true;
            return page;
          }
          page.records.push(record);
          bytes += Buffer.byteLength(line);
        }
        page.nextCursor = cursor;
        page.nextOffset += Buffer.byteLength(line) + 1;
        if (page.records.length >= limit) { page.limited = true; return page; }
      }
      if (Buffer.byteLength(pending) > RECORD_BYTES) throw new CliError('capture', 'Oversized evidence record');
    }
    page.incomplete = page.nextOffset < size;
    if (after > cursor) throw new CliError('usage', 'Cursor is beyond this recording');
    return page;
  } finally {
    input.destroy();
  }
}
