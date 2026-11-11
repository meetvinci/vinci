import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as EmbedTypes from '../types/embed.types';
import type { BunPlugin } from 'bun';

const UI = join(import.meta.dir, '..', '..');
const BASE = '/embed/';
const FONT = /^assets\/fonts\/[\w-]+\.woff2$/u;
// A bundled daemon finds the embed prebuilt next to its bundle (scripts/desktop.ts bundle); from source it builds on first use.
const PREBUILT = fileURLToPath(new URL('embed/', import.meta.url));
const MANIFEST = 'manifest.json';
const SERVER = 'embed.server.js';

let ready: Promise<EmbedTypes.EmbedBuild> | undefined;

export async function embedPage({ artifact, theme }: EmbedTypes.EmbedPageParams): Promise<string> {
  const { server, script, styles } = await embedReady();
  const body = server.embedRender({ artifact });
  const payload = JSON.stringify({ title: artifact.title, spec: artifact.spec }).replaceAll('<', String.raw`\u003c`);

  return `<!doctype html><html lang="en" class="${theme}" style="color-scheme:${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="${BASE}${styles}"><script type="module" src="${BASE}${script}"></script></head><body class="bg-background text-foreground antialiased"><main class="mx-auto flex w-full max-w-4xl flex-col p-4"><div id="artifact">${body}</div></main><script id="artifact-payload" type="application/json">${payload}</script></body></html>`;
}

export async function embedFile(path: string): Promise<Response | null> {
  const name = path.slice(BASE.length);
  const file = (await embedReady()).files.get(name);
  const cacheControl = FONT.test(name) ? 'public, max-age=86400' : 'public, max-age=31536000, immutable';

  return file ? new Response(file, { headers: { 'Content-Type': file.type, 'Cache-Control': cacheControl } }) : null;
}

/** Builds the embed into a directory that a bundled daemon serves without building at runtime. */
export async function embedWrite(directory: string): Promise<void> {
  const { server, files, script, styles } = await embedCompile();
  const manifest: EmbedTypes.EmbedManifest = { script, styles, files: [...files.keys()] };

  await Promise.all([
    Bun.write(join(directory, SERVER), server),
    Bun.write(join(directory, MANIFEST), JSON.stringify(manifest)),
    ...[...files].map(([name, file]) => Bun.write(join(directory, name), file)),
  ]);
}

function embedReady(): Promise<EmbedTypes.EmbedBuild> {
  ready ??= embedLoad();

  return ready;
}

async function embedLoad(): Promise<EmbedTypes.EmbedBuild> {
  const prebuilt = Bun.file(join(PREBUILT, MANIFEST));

  if (await prebuilt.exists()) {
    // SAFETY: embedWrite wrote this manifest from the build outputs.
    const { script, styles, files } = await prebuilt.json() as EmbedTypes.EmbedManifest;
    // SAFETY: embedWrite wrote this server bundle from embed.server.tsx, which exports embedRender.
    const server = await import(join(PREBUILT, SERVER)) as EmbedTypes.EmbedServer;

    return { server, script, styles, files: new Map(files.map((name) => [name, Bun.file(join(PREBUILT, name))])) };
  }

  const compiled = await embedCompile();
  // SAFETY: the server bundle is built from embed.server.tsx, which exports embedRender.
  const server = await import(URL.createObjectURL(new Blob([await compiled.server.text()], { type: 'text/javascript' }))) as EmbedTypes.EmbedServer;

  return { ...compiled, server };
}

async function embedCompile(): Promise<EmbedTypes.EmbedCompiled> {
  const tsconfig = join(UI, 'tsconfig.json');
  const plugins = await embedPlugins();

  const [server, client, styles, fonts] = await Promise.all([
    Bun.build({
      entrypoints: [fileURLToPath(new URL('embed.server.tsx', import.meta.url))],
      target: 'bun',
      plugins,
      tsconfig,
    }),
    Bun.build({
      entrypoints: [fileURLToPath(new URL('embed.client.tsx', import.meta.url))],
      target: 'browser',
      plugins,
      tsconfig,
      splitting: true,
      minify: true,
      naming: '[name]-[hash].[ext]',
      define: { 'process.env.NODE_ENV': '"production"' },
    }),
    embedStyles(),
    Array.fromAsync(new Bun.Glob('assets/fonts/*.woff2').scan({ cwd: join(UI, 'src') })),
  ]);

  const bundle = server.outputs.at(0);
  const script = client.outputs.find((output) => output.kind === 'entry-point')?.path.replace(/^\.\//u, '');

  if (!bundle || !script) {
    throw new AggregateError([...server.logs, ...client.logs], 'Artifact embed build failed');
  }

  const files = new Map<string, Blob>([
    ...client.outputs.map((output): [string, Blob] => [output.path.replace(/^\.\//u, ''), output]),
    ...fonts.map((name): [string, Blob] => [name, Bun.file(join(UI, 'src', name))]),
  ]);

  const stylesName = `embed-${Bun.hash(styles).toString(16)}.css`;

  files.set(stylesName, new Blob([styles], { type: 'text/css' }));

  return {
    server: bundle,
    files,
    script,
    styles: stylesName,
  };
}

// Loaded lazily, so a daemon serving a prebuilt embed never loads the icon compiler.
async function embedPlugins(): Promise<BunPlugin[]> {
  const { default: unpluginIcons } = await import('unplugin-icons');
  const { FileSystemIconLoader } = await import('unplugin-icons/loaders');

  return [
    unpluginIcons.bun({
      compiler: 'jsx',
      jsx: 'react',
      collectionsNodeResolvePath: UI,
      customCollections: { brands: FileSystemIconLoader(join(UI, 'src/assets/brands')) },
    }),
    {
      name: 'markdown-without-raw-html',
      setup: (build) => {
        build.onResolve({ filter: /^rehype-raw$/u }, () => ({ path: 'rehype-raw', namespace: 'embed-stub' }));
        build.onLoad({ filter: /.*/u, namespace: 'embed-stub' }, () => ({ contents: 'export default function rehypeRaw() {}', loader: 'js' }));
      },
    },
    {
      name: 'react-from-ui',
      setup: (build) => {
        build.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/u }, (args) => ({ path: Bun.resolveSync(args.path, UI) }));
      },
    },
  ];
}

async function embedStyles(): Promise<string> {
  const { compile } = await import('@tailwindcss/node');
  const { Scanner } = await import('@tailwindcss/oxide');
  const base = join(UI, 'src');
  const compiler = await compile(await Bun.file(join(base, 'styles.css')).text(), { base, onDependency: () => undefined });
  const sources = compiler.root === null || compiler.root === 'none' ? [] : [{ ...compiler.root, negated: false }];
  const scanner = new Scanner({ sources: [...sources, ...compiler.sources] });

  return compiler.build(scanner.scan());
}
