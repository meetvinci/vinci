import { ATTACHMENT } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { spawn } from 'node:child_process';
import { closeSync, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { match } from 'ts-pattern';
import { runtimeBotFilesOpen, runtimeBotFilesWrite } from '@repo/runtime/native';
import { ATTACHMENT_STORAGE } from './attachment-storage.constants';
import { attachmentStorageAgents, attachmentStoragePath, attachmentStoragePosterPath } from './attachment-storage.utils';
import type { AttachmentStorageDeps, AttachmentStorageParams } from '../../types/attachment-storage.types';

// SAFETY: ffmpeg never opens a bot path: it reads a descriptor runtimeBotFiles opened and the daemon saves its output.
export async function attachmentStorageActionPoster(deps: AttachmentStorageDeps, params: AttachmentStorageParams) {
  const directories = [...(process.env.PATH ?? '').split(delimiter), ...ATTACHMENT_STORAGE.ffmpegDirectories].filter(Boolean);
  const ffmpeg = directories.flatMap((directory) => ATTACHMENT_STORAGE.ffmpegNames.map((name) => join(directory, name))).find((path) => existsSync(path));

  if (!ffmpeg) {
    return;
  }

  const roots = [await attachmentStorageAgents(deps)];
  const path = await attachmentStoragePath(deps, params);

  try {
    const descriptor = runtimeBotFilesOpen(roots, path, ATTACHMENT.maxBytes);

    try {
      runtimeBotFilesWrite(roots, attachmentStoragePosterPath(path), await attachmentStoragePosterRender(ffmpeg, descriptor), { mode: 0o600 });
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    log.debug({
      tag: 'attachment',
      message: 'Video poster could not be made',
      error,
    });
  }

  // SAFETY: /dev/stdin, not pipe:0, so ffmpeg can seek in the file it was given (an MP4 index is often at its end).
  function attachmentStoragePosterRender(command: string, input: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      const child = spawn(command, [
        '-nostdin',
        '-loglevel', 'error',
        '-i', '/dev/stdin',
        '-vf', `thumbnail,scale='min(${String(ATTACHMENT_STORAGE.posterWidth)},iw)':-2`,
        '-frames:v', '1',
        '-q:v', '4',
        '-f', 'image2',
        '-c:v', 'mjpeg',
        'pipe:1',
      ], { stdio: [input, 'pipe', 'ignore'], timeout: ATTACHMENT_STORAGE.posterTimeoutMs });

      child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => match({ code, hasOutput: chunks.length > 0 })
        .with({ code: 0, hasOutput: true }, () => resolve(Buffer.concat(chunks)))
        .otherwise(() => reject(new Errors.INTERNAL_ERROR({ internal: `ffmpeg exited with ${String(code)}` }))));
    });
  }
}
