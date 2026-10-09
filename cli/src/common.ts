import { createReadStream } from 'node:fs';
import { RpcError, RpcTimeoutError, TransportError } from '../../clients/typescript/src/client/error.js';

export class CliError extends Error {
  constructor(
    readonly category: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function channel(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z\d+.-]*:\/[^\s]*$/i.test(value)) {
    throw new CliError('usage', 'Expected an explicit channel URI, such as ahp-session:/session-id');
  }
  return value;
}

export function integer(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const number = value === undefined ? fallback : Number(value);
  if ((value !== undefined && !/^\d+$/.test(value))
    || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new CliError('usage', `${name} must be an integer from ${min} to ${max}`);
  }
  return number;
}

export async function stdout(record: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(JSON.stringify(record) + '\n', error => error ? reject(error) : resolve());
  });
}

export async function textFile(path: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new CliError('interrupted', 'Input interrupted');
  const input = path === '-' ? process.stdin : createReadStream(path);
  const interrupted = () => input.destroy(new CliError('interrupted', 'Input interrupted'));
  signal?.addEventListener('abort', interrupted, { once: true });
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bytes += buffer.length;
      if (bytes > 4 * 1024 * 1024) throw new CliError('usage', 'JSON input exceeds 4 MiB');
      chunks.push(buffer);
    }
  } finally {
    signal?.removeEventListener('abort', interrupted);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export async function jsonFile(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const source = await textFile(path, signal);
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CliError('usage', 'Input must contain valid JSON');
  }
  if (!object(value)) throw new CliError('usage', 'Input must be a JSON object');
  return value;
}

export function redact(value: unknown, secrets: readonly string[], depth = 0): unknown {
  if (depth > 100) throw new CliError('protocol', 'JSON nesting exceeds the diagnostic limit');
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets) {
      if (secret) text = text.split(secret).join('[REDACTED]');
    }
    return text;
  }
  if (Array.isArray(value)) return value.map(item => redact(item, secrets, depth + 1));
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /^(token|accesstoken|refreshtoken|authorization|password|secret|apikey|clientsecret)$/i.test(key.replace(/[-_]/g, ''))
      ? '[REDACTED]'
      : redact(item, secrets, depth + 1),
  ]));
}

export function errorRecord(error: unknown, outcomeUnknown: boolean): Record<string, unknown> {
  let category = 'io';
  let message = error instanceof Error ? error.message : String(error);
  const fields: Record<string, unknown> = {};
  if (error instanceof CliError) {
    category = error.category;
    if (error.details !== undefined) fields.data = error.details;
  } else if (error instanceof RpcError) {
    category = 'rpc';
    fields.code = error.code;
    if (error.data !== undefined) fields.data = error.data;
  } else if (error instanceof RpcTimeoutError) {
    category = 'timeout';
  } else if (error instanceof TransportError) {
    category = 'transport';
  }
  if (outcomeUnknown) {
    fields.outcome = 'unknown';
    message += '; no authoritative mutation outcome observed; do not blindly retry';
  }
  return { version: 1, kind: 'error', category, message, ...fields };
}

export function deadline<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new CliError('timeout', message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
