import { match, P } from 'ts-pattern';
import { SPEECH_SERVICE } from './speech.constants';
import type { SpeechRun } from '../../types/speech.types';

export function speechText(markdown: string): string {
  const text = markdown
    .replaceAll(/^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:^\1[ \t]*$|(?![\s\S]))/gm, (_block, _fence: string, info: string, code: string) => {
      const language = info.trim().split(/\s/, 1)[0] ?? '';
      const lines = code.split('\n').filter((line) => line.trim()).length;

      return `[code block: ${language || 'code'}, ${String(lines)} lines]\n`;
    })
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replaceAll(/<\/?[a-z][\w-]*(?:\s[^>\n]*)?\/?>/gi, ' ')
    .replaceAll(/<?\bhttps?:\/\/[^\s)>\]]+>?/gi, (address) => match(URL.parse(address.replaceAll(/^<|>$/g, '')))
      .with(P.nonNullable, ({ hostname }) => `[link: ${hostname.replace(/^www\./, '')}]`)
      .otherwise(() => '[link]'));

  return speechShorten(text.split('\n'))
    .join('\n')
    .replaceAll(/[ \t]+\n/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

function speechShorten(lines: string[]): string[] {
  const runs: SpeechRun[] = [];

  for (const line of lines) {
    const last = runs.at(-1);

    const kind = match(line)
      .when((value) => /^ {0,3}(?:[-*+]|\d{1,3}[.)])\s/.test(value), () => 'list' as const)
      .when((value) => /^\s*\|.*\|\s*$/.test(value), () => 'table' as const)
      .otherwise(() => 'text' as const);

    match({ kind, last })
      .with({ kind: 'text', last: { kind: 'list' } }, ({ last: list }) => match(/^\s{2,}\S/.test(line))
        .with(true, () => list.items.at(-1)?.push(line))
        .otherwise(() => runs.push({ kind, items: [[line]] })))
      .with({ kind: P.union('list', 'table'), last: { kind: P.string } }, ({ last: run }) => match(run.kind === kind)
        .with(true, () => run.items.push([line]))
        .otherwise(() => runs.push({ kind, items: [[line]] })))
      .otherwise(() => runs.push({ kind, items: [[line]] }));
  }

  return runs.flatMap(({ kind, items }) => {
    const { shown, kept, head, noun } = match(kind)
      .with('list', () => ({ shown: SPEECH_SERVICE.listItems, kept: SPEECH_SERVICE.listKept, head: 0, noun: 'items' }))
      .with('table', () => ({ shown: SPEECH_SERVICE.tableRows, kept: SPEECH_SERVICE.tableKept, head: 2, noun: 'rows' }))
      .with('text', () => ({ shown: Number.POSITIVE_INFINITY, kept: 0, head: 0, noun: '' }))
      .exhaustive();

    return match(items.length - head > shown)
      .with(true, () => [...items.slice(0, head + kept).flat(), `[and ${String(items.length - head - kept)} more ${noun}]`])
      .otherwise(() => items.flat());
  });
}
