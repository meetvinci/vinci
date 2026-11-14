import { createServer } from 'node:net';
import { assert } from 'vitest';
import type { Server } from 'node:net';
import type { TestProject } from 'vitest/node';

// Below 32768, so outside the ephemeral ranges of Linux (32768-60999) and macOS (49152-65535): an outgoing connection never takes one of these ports.
const HUB_PORTS_FIRST = 20_000;
const HUB_PORTS_LAST = 32_700;
// Ten ports per suite, room for ten suites.
const HUB_PORTS_SIZE = 100;

declare module 'vitest' {
  export interface ProvidedContext {
    hubPortBase: number;
  }
}

function hubPortsHold(port: number): Promise<Server | null> {
  const server = createServer();

  return new Promise((done) => {
    server.once('error', () => done(null));
    server.listen(port, '127.0.0.1', () => done(server));
  });
}

async function hubPortsBlock(attempt: number): Promise<number> {
  const base = HUB_PORTS_FIRST + Math.floor(Math.random() * ((HUB_PORTS_LAST - HUB_PORTS_FIRST) / HUB_PORTS_SIZE)) * HUB_PORTS_SIZE;
  const held = await Promise.all(Array.from({ length: HUB_PORTS_SIZE }, (_, offset) => hubPortsHold(base + offset)));

  await Promise.all(held.map((server) => new Promise((done) => {
    if (server) {
      server.close(done);
    } else {
      done(null);
    }
  })));

  if (held.every(Boolean)) {
    return base;
  }

  if (attempt >= 20) {
    assert.fail(`No free block of ${HUB_PORTS_SIZE} ports between ${HUB_PORTS_FIRST} and ${HUB_PORTS_LAST} on 127.0.0.1 after 20 tries`);
  }

  return hubPortsBlock(attempt + 1);
}

// One free block per run, so the hub suites never share a port with each other or with another run that already listens.
export default async function hubPortsSetup(project: TestProject): Promise<void> {
  project.provide('hubPortBase', await hubPortsBlock(0));
}
