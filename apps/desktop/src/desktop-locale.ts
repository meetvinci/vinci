import { matchLocale, setLocale } from '@repo/i18n/client';

function desktopLocaleTags(): string[] {
  const apple = process.platform === 'darwin'
    ? Bun.spawnSync(['defaults', 'read', '-g', 'AppleLanguages'], { stdout: 'pipe', stderr: 'ignore' }).stdout.toString()
    : '';

  const posix = process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? '';

  return [
    ...apple.match(/[A-Za-z]{2,3}(?:-[A-Za-z\d]+)*/g) ?? [],
    posix.split('.')[0].replaceAll('_', '-'),
    new Intl.DateTimeFormat().resolvedOptions().locale,
  ].filter((tag) => tag !== '' && tag !== 'C' && tag !== 'POSIX');
}

export function desktopLocaleApply() {
  void setLocale(matchLocale(desktopLocaleTags()), { reload: false });
}
