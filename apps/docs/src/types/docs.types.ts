import type { Data } from 'mdast';

export interface DocsAlertData extends Data {
  hProperties?: Record<string, string>;
}
