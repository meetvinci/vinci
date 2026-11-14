import { realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { match, P } from 'ts-pattern';
import { ATTACHMENT_STORAGE } from './attachment-storage.constants';
import type { AttachmentStorageDeps, AttachmentStorageParams, AttachmentStorageRange } from '../../types/attachment-storage.types';

export async function attachmentStoragePath({ root }: AttachmentStorageDeps, { botId, conversationId, attachment }: AttachmentStorageParams) {
  return resolve(await realpath(root), 'agents', botId, '.attachments', String(conversationId), attachment.id, attachment.name);
}

export function attachmentStoragePosterPath(path: string) {
  return join(dirname(path), ATTACHMENT_STORAGE.posterName);
}

// SAFETY: attachments live in bot folders, which a bot can change at any moment: use them only through runtimeBotFiles.
export async function attachmentStorageAgents({ root }: Pick<AttachmentStorageDeps, 'root'>) {
  return resolve(await realpath(root), 'agents');
}

export function attachmentStorageRange(header: string | undefined, size: number): AttachmentStorageRange {
  const parsed = /^bytes=(\d*)-(\d*)$/u.exec(header?.trim() ?? '');
  const first = parsed?.[1] ?? '';
  const last = parsed?.[2] ?? '';

  return match({
    parsed,
    first,
    last,
  })
    .returnType<AttachmentStorageRange>()
    .with({ parsed: P.nullish }, { first: '', last: '' }, () => ({ kind: 'full' }))
    .with({ first: '' }, () => (Number(last) === 0 ? { kind: 'unsatisfiable' } : { kind: 'partial', start: Math.max(0, size - Number(last)), end: size - 1 }))
    .when(() => Number(first) >= size, () => ({ kind: 'unsatisfiable' }))
    .with({ last: '' }, () => ({ kind: 'partial', start: Number(first), end: size - 1 }))
    .when(() => Number(last) < Number(first), () => ({ kind: 'full' }))
    .otherwise(() => ({ kind: 'partial', start: Number(first), end: Math.min(Number(last), size - 1) }));
}
