import path from 'node:path';
import { parseArgs } from 'node:util';

const root = path.resolve(import.meta.dir, '..');
const dockerfile = path.join(root, 'deploy/docker/Dockerfile');
const targets = ['daemon', 'web', 'hub'];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Builds orbs-<target>:<tag> images into the local Docker image store. linux/amd64 is the server target;
// pass --platform linux/arm64 for local runs on Apple Silicon.
function images() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      platform: { type: 'string', default: 'linux/amd64' },
      tag: { type: 'string', default: 'latest' },
    },
    allowPositionals: true,
  });

  const selected = positionals.length > 0 ? positionals : targets;
  const unknown = selected.filter((target) => !targets.includes(target));

  if (unknown.length > 0) {
    fail(`Unknown image target: ${unknown.join(', ')}. Choose from ${targets.join(', ')}.`);
  }

  for (const target of selected) {
    const image = `orbs-${target}:${values.tag}`;

    console.log(`Building ${image} for ${values.platform}`);

    const result = Bun.spawnSync(['docker', 'buildx', 'build', '--platform', values.platform, '--file', dockerfile, '--target', target, '--tag', image, '--load', root], {
      stdout: 'inherit',
      stderr: 'inherit',
    });

    if (!result.success) {
      fail(`Building ${image} failed.`);
    }
  }
}

const commands = { images };
const command = process.argv[2] ?? '';

if (!(command in commands)) {
  fail('Usage: bun scripts/deploy.ts images [daemon|web|hub ...] [--platform linux/amd64|linux/arm64] [--tag <tag>]');
}

commands[command as keyof typeof commands]();
