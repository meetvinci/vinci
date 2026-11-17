import { GIF, REACTION } from '@repo/contracts/universal';

export const CHAT = {
  activityDetailMaxLength: 160,
  activityElapsedMinSeconds: 5,
  activityReplyTools: new Set<string>([REACTION.toolName, GIF.toolName]),
  preambleMaxLength: 200,
  preambleKey: 'vinciPreamble',
  preambleMetadata: { vinciPreamble: {} },
  commentaryPhase: '"phase":"commentary"',
  finalAnswerPhase: '"phase":"final_answer"',
  contextWarningPercent: 60,
  contextCriticalPercent: 80,
  attachmentScheme: 'attachment:',
  filesPath: '/files',
  posterPath: 'poster',
  videoFirstFrame: '#t=0.001',
  attachmentUrlKey: 'objectUrl',
  entryPrefix: 'entry-',
  liveMessageId: 'live',
  outgoingPrefix: 'outgoing-',
  historyPageSize: 50,
  aroundPageSize: 25,
  reactionsPageSize: 100,
  peerNotePattern: /^\[[^\]\n]*\]\n\n/u,
  megabyte: 1024 * 1024,
} as const;

export const CHAT_FILE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  heic: 'image/heic',
  heif: 'image/heif',
} as const;

export const CHAT_IMAGE = {
  maxSide: 2000,
  quality: 0.85,
  shrinks: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  kept: ['image/png', 'image/webp'],
  fallbackType: 'image/jpeg',
} as const;
