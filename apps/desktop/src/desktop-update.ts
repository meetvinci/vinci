import { Updater } from 'electrobun/main';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DESKTOP } from './desktop.constants';
import { desktopUpdatePrepared } from './types/desktop.types';
import type { DesktopUpdateState } from './types/desktop.types';

let state: DesktopUpdateState = { status: 'idle', version: '' };
let running: Promise<DesktopUpdateState> | null = null;
let listener: (next: DesktopUpdateState) => void = () => undefined;

function desktopUpdateSet(next: Partial<DesktopUpdateState>): DesktopUpdateState {
  state = { ...state, ...next };
  listener(state);

  return state;
}

/**
 * The running app's code requirement: Apple-issued signature, its signed identifier and Developer ID team. Null for an
 * unsigned or ad hoc signed app, which then accepts no update.
 */
function desktopUpdateRequirement(app: string): string | null {
  const result = Bun.spawnSync([DESKTOP.update.codesign, '-dv', app], { stdout: 'pipe', stderr: 'pipe' });
  const lines = result.stderr.toString().split('\n');
  const value = (prefix: string) => lines.find((entry) => entry.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
  const team = value(DESKTOP.update.teamIdPrefix);
  const identifier = value(DESKTOP.update.identifierPrefix);

  if (result.exitCode !== 0 || !DESKTOP.update.team.test(team) || !DESKTOP.update.identifier.test(identifier)) {
    return null;
  }

  return `anchor apple generic and identifier "${identifier}" and certificate leaf[subject.OU] = "${team}"`;
}

function desktopUpdateVersion(app: string): string {
  const plist = join(app, 'Contents', 'Info.plist');

  return Bun.spawnSync([DESKTOP.update.plutil, '-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]).stdout.toString().trim();
}

/**
 * Electrobun checks only the release identity in the manifest, which whoever serves the update writes, and never the
 * downloaded bytes. So the downloaded app must cryptographically satisfy this app's requirement (Apple anchor, same
 * identifier and team, checked by codesign itself even when Gatekeeper is turned off), be accepted by Gatekeeper, and
 * be newer than this app, so an older signed release can't be served again. Electrobun's helper installs from the
 * retained tar with its own tar reader, so the tar is then rewritten to hold exactly the app checked here.
 */
async function desktopUpdateVerify(current: string): Promise<boolean> {
  const prepared = desktopUpdatePrepared.safeParse(JSON.parse(readFileSync(join(await Updater.appDataFolder(), DESKTOP.update.preparedFile), 'utf8')));
  const requirement = desktopUpdateRequirement(resolve(dirname(process.execPath), '..', '..'));

  if (!prepared.success || !requirement) {
    return false;
  }

  const folder = mkdtempSync(join(tmpdir(), 'desktop-update-'));

  try {
    const unpacked = Bun.spawnSync([DESKTOP.update.tar, '-xf', prepared.data.retained_tar_path, '-C', folder]);
    const entries = readdirSync(folder);
    const app = entries[0];

    // One real folder: a symlink would be checked at its target but installed as a link.
    if (unpacked.exitCode !== 0 || entries.length !== 1 || !app.endsWith('.app') || !lstatSync(join(folder, app)).isDirectory()) {
      return false;
    }

    const path = join(folder, app);
    const version = desktopUpdateVersion(path);

    const accepted = Bun.spawnSync([DESKTOP.update.codesign, '--verify', '--deep', '--strict', `-R=${requirement}`, path]).exitCode === 0
      && Bun.spawnSync([DESKTOP.update.spctl, '--assess', '--type', 'execute', path]).exitCode === 0
      && Bun.semver.satisfies(version, `>${current}`);

    if (!accepted) {
      return false;
    }

    const verified = `${prepared.data.retained_tar_path}.verified`;
    const packed = Bun.spawnSync([DESKTOP.update.tar, '--no-mac-metadata', '-cf', verified, '-C', folder, app], { env: { ...process.env, COPYFILE_DISABLE: '1' } });

    if (packed.exitCode !== 0) {
      rmSync(verified, { force: true });

      return false;
    }

    renameSync(verified, prepared.data.retained_tar_path);

    return true;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

async function desktopUpdateRun(): Promise<DesktopUpdateState> {
  if (state.status === 'ready') {
    return state;
  }

  desktopUpdateSet({ status: 'checking' });

  try {
    const found = await Updater.checkForUpdate();

    if (!found.updateAvailable) {
      return desktopUpdateSet({ status: 'current' });
    }

    desktopUpdateSet({ status: 'downloading' });
    await Updater.downloadUpdate();

    if (!Updater.updateInfo().updateReady || !await desktopUpdateVerify(state.version)) {
      return desktopUpdateSet({ status: 'error' });
    }

    return desktopUpdateSet({ status: 'ready', available: found.version });
  } catch {
    return desktopUpdateSet({ status: 'error' });
  }
}

export function desktopUpdateState(): DesktopUpdateState {
  return state;
}

/** Checks, downloads and verifies one update; concurrent calls share the same run. */
export function desktopUpdateCheck(): Promise<DesktopUpdateState> {
  running ??= desktopUpdateRun().finally(() => {
    running = null;
  });

  return running;
}

/** Only packaged stable builds with an update address update; dev and canary builds keep their own version. */
export async function desktopUpdateStart(onChange: (next: DesktopUpdateState) => void): Promise<boolean> {
  // Releases ship only signed macOS builds, and verification needs codesign and Gatekeeper.
  if (DESKTOP.platform !== 'macos') {
    return false;
  }

  const { baseUrl, channel, version } = await Updater.getLocalInfo();

  // DESKTOP_UPDATE_URL at build time; a build without it never looks for updates.
  if (channel !== DESKTOP.update.channel || !baseUrl) {
    return false;
  }

  listener = onChange;
  desktopUpdateSet({ version });
  setTimeout(() => void desktopUpdateCheck(), DESKTOP.update.firstCheckMs);
  setInterval(() => void desktopUpdateCheck(), DESKTOP.update.intervalMs);

  return true;
}

/** Swaps in the verified update and relaunches; the caller stops the local server first. */
export function desktopUpdateApply(): Promise<void> {
  return Updater.applyUpdate();
}
