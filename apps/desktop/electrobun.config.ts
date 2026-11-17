import type { ElectrobunConfig } from 'electrobun';

const name = process.env.APP_NAME ?? 'Vinci';
const identifier = process.env.DESKTOP_BUNDLE_ID ?? 'pt.entrypoint.vinci.desktop';
// A separate data folder and first port let a test build run beside dev servers without sharing their data or ports.
const { DESKTOP_DATA_DIR: dataDir = '', DESKTOP_PORT: portText = '' } = process.env;
const port = Number(portText);

if (dataDir && !/^(?:\/|~\/)./u.test(dataDir)) {
  throw new Error(`DESKTOP_DATA_DIR must be an absolute path or start with ~/, not "${dataDir}".`);
}

// The app tries ten ports from here and runs its daemon 100 higher, so the last one it may use is port + 109.
if (portText && !(/^\d+$/u.test(portText) && port >= 1024 && port <= 65_000)) {
  throw new Error(`DESKTOP_PORT must be a whole number from 1024 to 65000, not "${portText}".`);
}

export default {
  app: {
    name,
    identifier,
    version: process.env.DESKTOP_VERSION ?? '0.0.0',
  },
  build: {
    mainProcess: 'bun',
    bun: { entrypoint: 'src/desktop.ts' },
    views: { connect: { entrypoint: 'src/views/connect/index.ts' } },
    copy: {
      'dist/server': 'views/server',
      'src/views/connect/index.html': 'views/connect/index.html',
    },
    mac: {
      // scripts/desktop.ts release signs and notarizes with a dedicated keychain instead.
      codesign: false,
      notarize: false,
      createDmg: false,
      icons: 'icon.icon',
    },
    linux: {
      defaultRenderer: 'native',
      icon: 'icon.png',
    },
  },
  scripts: { postBuild: '../../scripts/desktop.ts' },
  // Read back at runtime through BuildConfig, so packaged builds keep the name, identifier, data folder and port.
  runtime: { exitOnLastWindowClosed: false, name, identifier, ...(dataDir ? { dataDir } : {}), ...(portText ? { port } : {}) },
  // The update address (scripts/desktop.ts release requires it); without it the build has updates off.
  release: { baseUrl: process.env.DESKTOP_UPDATE_URL ?? '', generatePatch: false },
} satisfies ElectrobunConfig;
