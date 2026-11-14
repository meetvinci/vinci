export const RUNTIME_SANDBOX = {
  envId: 'pi-env:sandbox',
  execSocket: 'exec.sock',
  waitMs: 10_000,
  spares: 2,
  bridge: [
    "import { connect } from 'node:net';",
    'const [, path, ...args] = process.argv;',
    "const socket = connect(path, () => { socket.write(args.join(' ') + '\\n'); process.stdin.pipe(socket); });",
    'socket.pipe(process.stdout);',
    "socket.on('close', () => process.exit(0));",
    "socket.on('error', (error) => { process.stderr.write(error.message + '\\n'); process.exit(1); });",
    "process.stdin.on('end', () => socket.end());",
  ].join('\n'),
  lost: /pi-env connection (?:lost|timed out)/u,
} as const;
