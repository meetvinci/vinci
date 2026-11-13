import type { ElectrobunConfig } from 'electrobun';

const name = process.env.APP_NAME ?? 'Orbs';
const identifier = process.env.DESKTOP_BUNDLE_ID ?? 'pt.entrypoint.orbs.desktop';

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
  // Read back at runtime through BuildConfig, so packaged builds keep the name and identifier.
  runtime: { exitOnLastWindowClosed: false, name, identifier },
  // The update address (scripts/desktop.ts release requires it); without it the build has updates off.
  release: { baseUrl: process.env.DESKTOP_UPDATE_URL ?? '', generatePatch: false },
} satisfies ElectrobunConfig;
