import { BuildConfig } from 'electrobun/main';
import { DESKTOP } from './desktop.constants';
import { desktopBuild } from './types/desktop.types';

const { runtime, isPackaged } = BuildConfig.getSync();

/** Packaged apps have no env, so the name, bundle ID, data folder and first port come from the build. */
export const DESKTOP_BUILD = desktopBuild.parse(runtime);

// Only a packaged app uses the folder and port built into it, so `dev:app` keeps its DATA_DIR and the dev servers' ports whatever .env holds.
const desktopOwn: Partial<typeof DESKTOP_BUILD> = isPackaged ? DESKTOP_BUILD : {};

/** The built-in data folder wins over DATA_DIR, so a shell's DATA_DIR never moves a test build onto other data. */
export const DESKTOP_DATA_DIR = desktopOwn.dataDir ?? process.env.DATA_DIR ?? DESKTOP.dataDir;

const desktopFirstPort = desktopOwn.port ?? DESKTOP.port;

/** The ports this app tries for its own server, in order. */
export const DESKTOP_PORTS = Array.from({ length: DESKTOP.portCount }, (_, index) => desktopFirstPort + index);
