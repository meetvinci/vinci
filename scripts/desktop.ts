import { embedWrite } from '@repo/ui/native';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const desktop = path.join(root, 'apps/desktop');
const name = process.env.APP_NAME ?? 'Vinci';
const entitlements = ['allow-jit', 'allow-unsigned-executable-memory', 'disable-library-validation'];
const isDarwin = process.platform === 'darwin';
// The in-app updater only updates stable Apple silicon builds; Electrobun names its files after this prefix.
const updatePrefix = 'stable-macos-arm64';
const updateManifestName = `${updatePrefix}-update.json`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// .env leaves unset values empty; empty counts as unset.
function envValue(key: string): string | undefined {
  return process.env[key]?.trim() ? process.env[key] : undefined;
}

function run(command: string[], env: Record<string, string | undefined> = process.env): string {
  const result = Bun.spawnSync(command, {
    cwd: root,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    fail(`${command.slice(0, 3).join(' ')} failed:\n${result.stdout.toString()}${result.stderr.toString()}`);
  }

  return result.stdout.toString().trim();
}

/** DESKTOP_UPDATE_URL without a trailing slash: the address the app reads `<prefix>-update.json` and its bundle from. */
function updateUrl(): string {
  const value = envValue('DESKTOP_UPDATE_URL') ?? fail('Set DESKTOP_UPDATE_URL to the address the app downloads updates from (docs/desktop-release.md).');
  const url = URL.parse(value);

  // Electrobun appends its own `?query` to the address, so the address carries its key in the path, never in a query.
  if (url?.protocol !== 'https:' || url.search || url.hash || url.username || url.password) {
    fail('DESKTOP_UPDATE_URL must be an https:// address with no ?query, #fragment or user name.');
  }

  return value.replace(/\/+$/u, '');
}

/** The release identity Electrobun bakes into the app and reads back to look for updates. */
function versionInfo(app: string): { version: string; hash: string; channel: string; baseUrl: string; identifier: string } {
  return JSON.parse(readFileSync(path.join(app, 'Contents/Resources/version.json'), 'utf8'));
}

function files(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const file = path.join(folder, entry);

    return statSync(file).isDirectory() ? files(file) : [file];
  });
}

// Vite's SSR output loads a bundled CommonJS package's own dependencies (React for tiptap's use-sync-external-store) through a
// runtime `createRequire`. Bun cannot follow those calls, and the bundle has no node_modules, so SSR failed (React error #419).
// Turning each `__require("x")` into a static import lets Bun bundle the dependency like any other.
const ssrRequires: Bun.BunPlugin = {
  name: 'ssr-requires',
  setup(build) {
    build.onLoad({ filter: /apps[\\/]web[\\/]dist[\\/]server[\\/].*\.js$/u }, async ({ path: file }) => {
      const source = await Bun.file(file).text();
      const specifiers = [...new Set(Array.from(source.matchAll(/\b__require\("([^"]+)"\)/gu), ([, specifier]) => specifier))];

      const contents = specifiers.reduce(
        (code, specifier, index) => code.replaceAll(`__require("${specifier}")`, `__ssrRequire${index}`),
        source,
      );

      const imports = specifiers.map((specifier, index) => `import * as __ssrRequire${index} from ${JSON.stringify(specifier)};\n`).join('');

      return { contents: `${imports}${contents}`, loader: 'js' };
    });
  },
};

async function bundle() {
  const target = path.join(desktop, 'dist/server');
  const resolve = (pkg: string, from: string) => path.dirname(Bun.resolveSync(`${pkg}/package.json`, from));
  const durable = resolve('@earendil-works/pi-durable', path.join(root, 'packages/runtime'));

  rmSync(target, { recursive: true, force: true });

  const web = Bun.spawnSync(['bun', 'run', 'build'], {
    cwd: path.join(root, 'apps/web'),
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (!web.success) {
    process.exit(1);
  }

  const builds = await Promise.all([
    Bun.build({
      entrypoints: [path.join(root, 'apps/web/src/application/server.bun.ts')],
      target: 'bun',
      outdir: path.join(target, 'web/src/application'),
    }),
    Bun.build({
      entrypoints: [path.join(root, 'apps/web/dist/server/server.tanstack.js')],
      target: 'bun',
      splitting: true,
      plugins: [ssrRequires],
      outdir: path.join(target, 'web/dist/server'),
    }),
    Bun.build({
      entrypoints: [path.join(root, 'apps/daemon/src/entry.native.ts')],
      target: 'bun',
      outdir: path.join(target, 'daemon'),
    }),
    // pi-env's transport to a person's sandbox, its own small program next to the daemon (the daemon runs it per
    // connection, so it must not load the whole daemon).
    Bun.build({
      entrypoints: [path.join(root, 'apps/daemon/src/entry-sandbox-bridge.native.ts')],
      target: 'bun',
      outdir: path.join(target, 'daemon'),
    }),
    // Pi Durable's Photon worker, which prepares the images bots read off the daemon's event loop: the daemon starts it
    // from ./node-worker.js next to its own bundle, and without it falls back to its own thread.
    Bun.build({
      entrypoints: [path.join(durable, 'dist/images/node-worker.js')],
      target: 'bun',
      outdir: path.join(target, 'daemon'),
    }),
  ]);

  const failed = builds.find((result) => !result.success);

  if (failed) {
    fail(failed.logs.map((entry) => entry.message).join('\n'));
  }

  cpSync(path.join(root, 'apps/web/dist/client'), path.join(target, 'web/dist/client'), { recursive: true });
  cpSync(path.join(root, 'packages/server/src/services/database/migrations'), path.join(target, 'daemon/migrations'), { recursive: true });
  await embedWrite(path.join(target, 'daemon/embed'));

  // Bun cannot bundle Takumi's native binding; without a local copy it auto-installs the latest one, which breaks the bundled JS.
  const binding = `@takumi-rs/core-${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}`;
  const core = resolve('@takumi-rs/core', resolve('takumi-js', path.join(root, 'packages/server')));

  cpSync(resolve(binding, core), path.join(target, 'daemon/node_modules', binding), { recursive: true, dereference: true });

  // Pi Durable reads Photon's WebAssembly by package path at run time (the read tool's images), which Bun cannot bundle.
  cpSync(resolve('@silvia-odwyer/photon', durable), path.join(target, 'daemon/node_modules/@silvia-odwyer/photon'), { recursive: true, dereference: true });
}

function plist() {
  if (!isDarwin) {
    return;
  }

  const { ELECTROBUN_BUILD_DIR: buildDir, ELECTROBUN_APP_NAME: appName } = process.env;

  if (!buildDir || !appName) {
    fail('Run plist as the Electrobun postBuild hook.');
  }

  const file = path.join(buildDir, `${appName}.app/Contents/Info.plist`);
  const key = ':NSAppTransportSecurity:NSAllowsArbitraryLoadsInWebContent';

  Bun.spawnSync(['/usr/libexec/PlistBuddy', '-c', 'Add :NSAppTransportSecurity dict', file], { stderr: 'ignore' });
  run(['/usr/libexec/PlistBuddy', '-c', `Add ${key} bool true`, '-c', `Set ${key} true`, file]);
  Bun.spawnSync(['/usr/libexec/PlistBuddy', '-c', 'Delete :NSUserActivityTypes', file], { stderr: 'ignore' });
  run(['/usr/libexec/PlistBuddy', '-c', 'Add :NSUserActivityTypes array', '-c', 'Add :NSUserActivityTypes:0 string INSendMessageIntent', file]);
}

function release() {
  const app = path.join(desktop, `build/${updatePrefix}/${name}.app`);

  // Fails before the build: the app reads updates only from this address (electrobun.config.ts).
  updateUrl();
  const keychain = process.env.DESKTOP_SIGNING_KEYCHAIN ?? fail('Set DESKTOP_SIGNING_KEYCHAIN to the signing keychain path.');
  const identity = process.env.DESKTOP_SIGNING_IDENTITY ?? fail('Set DESKTOP_SIGNING_IDENTITY to the Developer ID SHA-1 fingerprint.');
  const credentialsFile = path.join(path.dirname(keychain), 'credentials.json');
  const credentials = existsSync(credentialsFile) ? JSON.parse(readFileSync(credentialsFile, 'utf8')) : {};
  const password = process.env.DESKTOP_SIGNING_KEYCHAIN_PASSWORD ?? credentials.releaseKeychainPassword ?? fail('Set DESKTOP_SIGNING_KEYCHAIN_PASSWORD.');
  const keyId = process.env.DESKTOP_NOTARY_KEY_ID ?? credentials.apiKeyId ?? fail('Set DESKTOP_NOTARY_KEY_ID.');
  const issuer = process.env.DESKTOP_NOTARY_ISSUER ?? credentials.apiIssuerId ?? fail('Set DESKTOP_NOTARY_ISSUER.');
  const key = process.env.DESKTOP_NOTARY_KEY_PATH ?? path.join(path.dirname(keychain), `AuthKey_${keyId}.p8`);
  const version = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8')).version;

  if (!/^[0-9A-F]{40}$/iu.test(identity)) {
    fail('DESKTOP_SIGNING_IDENTITY must be the 40-character SHA-1 fingerprint.');
  }

  if (!existsSync(key)) {
    fail(`No notary key at ${key}: set DESKTOP_NOTARY_KEY_PATH.`);
  }

  console.log(`Building ${name} ${version}`);
  run(['bun', 'run', '--cwd', 'apps/desktop', 'build:app'], { ...process.env, DESKTOP_VERSION: version });

  const temp = mkdtempSync(path.join(tmpdir(), 'desktop-release-'));
  const resources = path.join(app, 'Contents/Resources');
  const archive = readdirSync(resources).find((entry) => entry.endsWith('.tar.zst')) ?? fail(`No app archive in ${resources}`);

  run(['tar', '-xf', path.join(resources, archive), '-C', temp]);
  rmSync(app, { recursive: true, force: true });
  renameSync(path.join(temp, path.basename(app)), app);

  run(['security', 'unlock-keychain', '-p', password, keychain]);
  run(['/usr/libexec/PlistBuddy', '-c', `Add :CFBundleShortVersionString string ${version}`, path.join(app, 'Contents/Info.plist')]);

  const entitlementsFile = path.join(temp, 'entitlements.plist');

  writeFileSync(entitlementsFile, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${entitlements.map((entitlement) => `<key>com.apple.security.cs.${entitlement}</key><true/>`).join('')}</dict></plist>
`);

  const sign = ['codesign', '--force', '--timestamp', '--options', 'runtime', '--keychain', keychain, '--sign', identity];
  const launcher = path.join(app, 'Contents/MacOS/launcher');
  const binaries = files(path.join(app, 'Contents')).filter((file) => file !== launcher && run(['file', '-b', file]).startsWith('Mach-O'));

  for (const file of binaries) {
    run([...sign, ...(file.endsWith('.dylib') ? [] : ['--entitlements', entitlementsFile]), file]);
  }

  run([...sign, '--entitlements', entitlementsFile, app]);
  run(['codesign', '--verify', '--deep', '--strict', app]);
  console.log('Signed');

  const zip = path.join(desktop, `artifacts/${name}-${version}-macos-arm64.zip`);

  run(['ditto', '-c', '-k', '--keepParent', app, zip]);

  const submitted = JSON.parse(run(['xcrun', 'notarytool', 'submit', zip, '--key', key, '--key-id', keyId, '--issuer', issuer, '--wait', '--output-format', 'json']));

  if (submitted.status !== 'Accepted') {
    fail(`Notarization ${submitted.status}: xcrun notarytool log ${submitted.id} --key ${key} --key-id ${keyId} --issuer ${issuer}`);
  }

  run(['xcrun', 'stapler', 'staple', app]);
  rmSync(zip);
  run(['ditto', '-c', '-k', '--keepParent', app, zip]);
  run(['spctl', '--assess', '--type', 'execute', app]);
  rmSync(temp, { recursive: true, force: true });

  // The in-app updater downloads the manifest Electrobun wrote and a bundle of this signed, stapled app under the same name.
  const manifest = JSON.parse(readFileSync(path.join(desktop, 'artifacts', updateManifestName), 'utf8'));
  const updateTar = path.join(desktop, 'artifacts', `${manifest.artifact.file}.tar`);

  run(['tar', '--no-mac-metadata', '-cf', updateTar, '-C', path.dirname(app), path.basename(app)], { ...process.env, COPYFILE_DISABLE: '1' });
  writeFileSync(path.join(desktop, 'artifacts', manifest.artifact.file), Bun.zstdCompressSync(readFileSync(updateTar)));
  rmSync(updateTar);
  console.log(`Notarized: ${zip}`);
}

/**
 * Uploads a release's update files to the update bucket: the bundle, then the manifest, so no app sees a manifest before
 * its bundle. It checks the bundle it uploads, never only the app it came from: signed with a Developer ID, notarized and
 * stapled, accepted by Gatekeeper, and built for DESKTOP_UPDATE_URL. Anything else stops before the first upload.
 */
async function publish() {
  if (!isDarwin) {
    fail('Publish from a Mac: it checks the signature with codesign, spctl and stapler before uploading.');
  }

  const baseUrl = updateUrl();
  const bucket = envValue('DESKTOP_UPDATE_S3_BUCKET') ?? fail('Set DESKTOP_UPDATE_S3_BUCKET and the other DESKTOP_UPDATE_S3_ settings (docs/desktop-release.md).');
  const artifacts = path.resolve(process.argv[3] ?? path.join(desktop, 'artifacts'));
  const manifestFile = path.join(artifacts, updateManifestName);

  if (!existsSync(manifestFile)) {
    fail(`No ${updateManifestName} in ${artifacts}: run bun run release <patch|minor|major> --desktop first.`);
  }

  const manifestText = readFileSync(manifestFile, 'utf8');
  const manifest = JSON.parse(manifestText);
  const file: unknown = manifest.artifact?.file;

  if (manifest.schemaVersion !== 1 || manifest.channel !== 'stable' || manifest.platform !== 'macos' || manifest.arch !== 'arm64'
    || typeof file !== 'string' || !file.startsWith(`${updatePrefix}-`) || !file.endsWith('.tar.zst') || file.includes('/')) {
    fail(`${manifestFile} is not a stable macOS arm64 update manifest.`);
  }

  // The exact bytes that are checked are the ones uploaded.
  const archive = readFileSync(path.join(artifacts, file));
  const temp = path.join(artifacts, '.publish-check');

  rmSync(temp, { recursive: true, force: true });
  mkdirSync(temp);
  writeFileSync(path.join(temp, 'update.tar'), Bun.zstdDecompressSync(archive));
  run(['tar', '-xf', path.join(temp, 'update.tar'), '-C', temp]);

  const app = path.join(temp, readdirSync(temp).find((entry) => entry.endsWith('.app')) ?? fail(`${file} holds no app.`));
  const info = versionInfo(app);

  if (info.hash !== manifest.hash || info.version !== manifest.version || info.identifier !== manifest.identifier || info.channel !== 'stable') {
    fail(`${file} is not the build ${manifestFile} describes.`);
  }

  if (info.baseUrl.replace(/\/+$/u, '') !== baseUrl) {
    fail(info.baseUrl ? 'That build reads updates from another address than DESKTOP_UPDATE_URL.' : 'That build has no update address: build it with DESKTOP_UPDATE_URL set.');
  }

  run(['codesign', '--verify', '--deep', '--strict', app]);
  run(['xcrun', 'stapler', 'validate', app]);
  run(['spctl', '--assess', '--type', 'execute', app]);
  console.log(`${name} ${info.version} (${info.identifier}) is signed, notarized and stapled.`);
  rmSync(temp, { recursive: true, force: true });

  const client = new Bun.S3Client({
    bucket,
    endpoint: envValue('DESKTOP_UPDATE_S3_ENDPOINT'),
    region: envValue('DESKTOP_UPDATE_S3_REGION'),
    accessKeyId: envValue('DESKTOP_UPDATE_S3_ACCESS_KEY_ID'),
    secretAccessKey: envValue('DESKTOP_UPDATE_S3_SECRET_ACCESS_KEY'),
  });

  await client.write(file, archive, { type: 'application/zstd' });
  await client.write(updateManifestName, manifestText, { type: 'application/json' });

  const served = await fetch(`${baseUrl}/${updateManifestName}?${crypto.randomUUID()}`).then((response) => (response.ok ? response.json() : null)).catch(() => null);

  if (served?.hash !== manifest.hash) {
    fail(`Uploaded to ${bucket}, but DESKTOP_UPDATE_URL does not serve ${updateManifestName}: check the bucket's public address.`);
  }

  console.log(`Published ${name} ${manifest.version}: installed apps find it at DESKTOP_UPDATE_URL.`);
}

const commands = { bundle, plist, release, publish };

// Electrobun runs its postBuild hook without arguments, so a bare call inside a build is the plist step.
const command = process.argv[2] ?? (process.env.ELECTROBUN_BUILD_DIR ? 'plist' : '');

if (!(command in commands)) {
  fail('Usage: bun scripts/desktop.ts bundle | release | publish [artifacts folder] (plist runs as the Electrobun postBuild hook)');
}

await commands[command as keyof typeof commands]();
