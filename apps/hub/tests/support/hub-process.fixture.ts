import { redactSecrets } from '@repo/logger/server';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { assert } from 'vitest';
import type { ChildProcess } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '../../../..');

// A daemon answers /health in a few seconds even on a loaded CI runner; a child that exits fails setup at once.
const HUB_FIXTURE_READY_MS = 30_000;
const HUB_FIXTURE_OUTPUT_CHARS = 16_384;
const HUB_FIXTURE_TAIL_LINES = 40;

interface HubFixtureSpawnOptions {
  label: string;
  app: 'daemon' | 'hub';
  health: string;
  env: NodeJS.ProcessEnv;
}

export interface HubFixtureChild {
  label: string;
  health: string;
  process: ChildProcess;
  output: string;
  isReady: boolean;
  isStopping: boolean;
}

function hubFixtureReport({ label, health, process: child, output }: HubFixtureChild, what: string): string {
  const tail = redactSecrets(stripVTControlCharacters(output))
    // A pairing prints the PIN, links carrying `#code=` and the same link as a QR code.
    .replaceAll(/\bPIN \d+/gu, 'PIN [redacted]')
    .replaceAll(/\bcode=\S+/gu, 'code=[redacted]')
    .replaceAll(/^[ ▀▄█]+$/gmu, '[QR code redacted]')
    .trimEnd()
    .split('\n')
    .slice(-HUB_FIXTURE_TAIL_LINES)
    .join('\n');

  return `${label} at ${health} ${what} (exit: ${child.exitCode ?? child.signalCode ?? 'still running'}). Its last output, secrets redacted:\n${tail || '(nothing)'}`;
}

export function hubFixtureSpawn({ label, app, health, env }: HubFixtureSpawnOptions): HubFixtureChild {
  const child: HubFixtureChild = {
    label,
    health,
    process: spawn('bun', ['src/entry.native.ts'], {
      cwd: join(ROOT, 'apps', app),
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    }),
    output: '',
    isReady: false,
    isStopping: false,
  };

  const keep = (text: string) => {
    child.output = `${child.output}${text}`.slice(-HUB_FIXTURE_OUTPUT_CHARS);
  };

  child.process.stdout?.on('data', (chunk: Buffer) => keep(chunk.toString()));
  child.process.stderr?.on('data', (chunk: Buffer) => keep(chunk.toString()));
  child.process.once('error', (error) => keep(`\n${error.message}\n`));
  child.process.once('exit', () => {
    // A failure during setup is thrown by hubFixtureReady; this reports a process that dies while the tests run.
    if (child.isReady && !child.isStopping) {
      process.stderr.write(`${hubFixtureReport(child, 'exited while the suite was running')}\n`);
    }
  });

  return child;
}

// Fails as soon as the process exits, with its exit code and last output, instead of waiting out the deadline.
export async function hubFixtureReady(child: HubFixtureChild, deadline = Date.now() + HUB_FIXTURE_READY_MS): Promise<HubFixtureChild> {
  if (child.process.exitCode !== null || child.process.signalCode !== null) {
    assert.fail(hubFixtureReport(child, 'exited before it answered'));
  }

  const response = await fetch(child.health).catch(() => null);

  if (response?.ok) {
    child.isReady = true;
    return child;
  }

  if (Date.now() > deadline) {
    assert.fail(hubFixtureReport(child, `did not answer within ${HUB_FIXTURE_READY_MS / 1000} s`));
  }

  await sleep(250);

  return hubFixtureReady(child, deadline);
}

export function hubFixtureEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const kept = Object.entries(process.env).filter(([name]) => !name.endsWith('_API_KEY') && !['DATA_DIR', 'PI_CODING_AGENT_DIR', 'HOME'].includes(name));

  return { ...Object.fromEntries(kept), LOG_LEVEL: 'warn', ...extra };
}

export async function hubFixtureExit(child: HubFixtureChild): Promise<void> {
  child.isStopping = true;
  child.process.kill('SIGTERM');
  await new Promise((done) => {
    if (child.process.exitCode === null && child.process.signalCode === null) {
      child.process.once('exit', done);
    } else {
      done(null);
    }
  });
}
