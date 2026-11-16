import { defineExtension, hook, ToolTask } from '@earendil-works/pi-durable';
import { createBashTool, createEditTool, createReadTool, createWriteTool } from '@earendil-works/pi-durable/tools';
import * as m from '@repo/i18n/messages';
import { runtimeImageReadTool } from './runtime-image.utils';
import { runtimePdfReadTool } from './runtime-pdf.utils';
import { RUNTIME_SANDBOX } from './runtime-sandbox.constants';
import type { RuntimeCodingToolsParams } from '../../types/runtime.types';

export function runtimeCodingToolsExtension({ images, secrets }: RuntimeCodingToolsParams) {
  return defineExtension({
    name: 'coding-tools',
    tools: [
      runtimePdfReadTool(runtimeImageReadTool(createReadTool({ images }))),
      createWriteTool(),
      createEditTool(),
      createBashTool({ prepare: secrets && ((execution) => secrets.actions.prepare(execution)) }),
    ],
    hooks: [hook(ToolTask, {
      afterTool: (_call, result) => (result.diagnostics?.some((diagnostic) => RUNTIME_SANDBOX.lost.test(diagnostic.message)) ? {
        ...result,
        diagnostics: result.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          message: diagnostic.message.replace(RUNTIME_SANDBOX.lost, m.ui_sandbox_lost()),
        })),
      } : result),
    })],
  });
}
