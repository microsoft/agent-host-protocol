#!/usr/bin/env node
import { runCli } from './run.js';
import { controllerProcess } from './controller.js';

const controller = new AbortController();
const interrupt = () => controller.abort('SIGINT');
const terminate = () => controller.abort('SIGTERM');
const outputFailed = (error: Error) => controller.abort(error);
process.once('SIGINT', interrupt);
process.once('SIGTERM', terminate);
process.stdout.on('error', outputFailed);

try {
  const args = process.argv.slice(2);
  process.exitCode = args[0] === '--controller-process' && args.length === 2
    ? await controllerProcess(args[1], controller.signal)
    : await runCli(args, controller.signal);
} catch (error) {
  process.stderr.write(JSON.stringify({
    version: 1, kind: 'error', category: 'io',
    message: error instanceof Error ? error.message : String(error),
  }) + '\n');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', terminate);
  process.stdout.removeListener('error', outputFailed);
}
