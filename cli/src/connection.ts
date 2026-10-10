import WebSocket from 'ws';
import type { AhpTransport, JsonRpcMessage, TransportFrame } from '../../clients/typescript/src/client/transport.js';
import { TransportError } from '../../clients/typescript/src/client/error.js';
import { WebSocketTransport } from '../../clients/typescript/src/ws/transport.js';
import { inspectFrame, type Frame } from './capture.js';
import { CliError } from './common.js';

const CLOSE_TIMEOUT_MS = 1000;

class OwnedTransport implements AhpTransport {
  private closing?: Promise<void>;

  constructor(private readonly socket: WebSocket, private readonly inner: WebSocketTransport) {}

  send(message: JsonRpcMessage | string): void {
    this.inner.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  async recv(): Promise<TransportFrame | null> {
    try { return await this.inner.recv(); }
    catch (error) {
      // Forced local termination is EOF, not a new failure of an observed operation.
      if (this.closing && error instanceof TransportError && error.kind === 'closed') return null;
      throw error;
    }
  }

  close(): Promise<void> {
    this.closing ??= new Promise<void>(resolve => {
      if (this.socket.readyState === WebSocket.CLOSED) { resolve(); return; }
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
    return this.closing;
  }
}

export async function openTransport(url: string, timeoutMs: number, signal: AbortSignal): Promise<AhpTransport> {
  if (signal.aborted) throw new CliError('interrupted', 'Interrupted before connection');
  return new Promise((resolve, reject) => {
    // ws supports closeTimeout, but its separate type declarations omit it.
    const options: WebSocket.ClientOptions & { closeTimeout: number } = { closeTimeout: CLOSE_TIMEOUT_MS };
    const socket = new WebSocket(url, options);
    const timer = setTimeout(() => fail(new CliError('timeout', 'WebSocket connection timed out')), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener('open', opened);
      socket.removeListener('error', failed);
      socket.removeListener('close', closed);
      signal.removeEventListener('abort', aborted);
    };
    const fail = (error: Error) => {
      cleanup();
      socket.once('error', () => { /* Terminating an unfinished upgrade emits an error already reported here. */ });
      socket.terminate();
      reject(error);
    };
    const opened = () => {
      const transport = new OwnedTransport(socket, WebSocketTransport.fromSocket(socket));
      cleanup();
      resolve(transport);
    };
    const failed = () => fail(new CliError('transport', 'WebSocket connection failed'));
    const closed = () => fail(new CliError('transport', 'WebSocket closed before initialization'));
    const aborted = () => fail(new CliError('interrupted', 'Connection interrupted'));
    socket.once('open', opened);
    socket.once('error', failed);
    socket.once('close', closed);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

export class ObservedTransport implements AhpTransport {
  constructor(
    private readonly inner: AhpTransport,
    private readonly observe: (frame: Frame) => Promise<void>,
    private readonly failed: (error: unknown) => void,
  ) {}

  async send(message: JsonRpcMessage | string): Promise<void> {
    try {
      await this.observe(inspectFrame(typeof message === 'string' ? message : JSON.stringify(message), 'out'));
      await this.inner.send(message);
    } catch (error) {
      this.failed(error);
      throw error;
    }
  }

  async recv(): Promise<TransportFrame | null> {
    try {
      const frame = await this.inner.recv();
      if (frame !== null) {
        const text = frame.kind === 'text' ? frame.text
          : frame.kind === 'binary' ? new TextDecoder('utf-8', { fatal: true }).decode(frame.data)
            : JSON.stringify(frame.message);
        await this.observe(inspectFrame(text, 'in'));
      }
      return frame;
    } catch (error) {
      this.failed(error);
      throw error;
    }
  }

  close(): Promise<void> | void { return this.inner.close(); }
}
