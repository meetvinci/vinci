import { defineExtension } from '@earendil-works/pi-durable';
import { createToolSearchTool, TOOL_SEARCH_TOOL_NAME } from '@earendil-works/pi-durable/tool-search';
import { RUNTIME_TOOL_SEARCH } from './runtime.constants';

export function runtimeToolSearchExtension() {
  const tool = createToolSearchTool();

  return defineExtension({
    name: 'tool-search',
    tools: [{ ...tool, name: RUNTIME_TOOL_SEARCH, description: tool.description.replaceAll(TOOL_SEARCH_TOOL_NAME, RUNTIME_TOOL_SEARCH) }],
  });
}
