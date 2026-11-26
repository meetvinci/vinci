import { DOCS_ALERT } from './docs.constants';
import type { DocsAlertData } from '@/types/docs.types';
import type { Blockquote, Root } from 'mdast';

function docsAlertMark(node: Blockquote) {
  const paragraph = node.children.at(0);
  const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;

  if (text?.type !== 'text') {
    return;
  }

  const alert = DOCS_ALERT.markers.find(({ marker }) => text.value.startsWith(marker));

  if (!alert) {
    return;
  }

  const data: DocsAlertData = { ...node.data, hProperties: { [DOCS_ALERT.attribute]: alert.type } };
  text.value = text.value.slice(alert.marker.length).trimStart();
  node.data = data;
}

export function docsAlertRemark() {
  return (tree: Root) => {
    for (const node of tree.children) {
      if (node.type === 'blockquote') {
        docsAlertMark(node);
      }
    }
  };
}
