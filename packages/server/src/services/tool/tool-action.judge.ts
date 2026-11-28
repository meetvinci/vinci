import { log, redactSecrets } from '@repo/logger/server';
import { match } from 'ts-pattern';
import { TOOL } from './tool.constants';
import { toolPromptsApprovalQuestion, toolPromptsAskFirstQuestion, toolPromptsCommandQuestion } from './tool.prompts';
import type { ToolJudgeParams, ToolServiceDeps } from '../../types/tool.types';

export async function toolActionJudge({ credentials, providers }: ToolServiceDeps, params: ToolJudgeParams): Promise<boolean> {
  const input = JSON.stringify(params.arguments);

  const judged = match(params.kind)
    .with('command', () => ({
      inputLimit: TOOL.judgeCommandLimit,
      safe: toolPromptsCommandQuestion(),
      isRequestRequired: false,
    }))
    .with('tool', () => ({
      inputLimit: TOOL.judgeInputLimit,
      safe: toolPromptsApprovalQuestion(),
      isRequestRequired: true,
    }))
    .exhaustive();

  const asked = input.length <= judged.inputLimit ? await params.getRequest() : null;

  if (asked === null || (judged.isRequestRequired && (asked.length === 0 || asked.length > TOOL.judgeRequestLimit))) {
    return false;
  }

  const request = asked.slice(0, TOOL.judgeRequestLimit);

  const answers = await providers.actions.classify({
    apiKey: await credentials.queries.get({ key: TOOL.jevCredential }),
    provider: params.provider,
    signal: params.context.abortSignal,
    state: {
      instructions: redactSecrets(params.instructions),
      request: redactSecrets(request),
      call: { tool: params.name, input: redactSecrets(input) },
      secrets: params.secrets.map(({ name, hosts }) => ({ name, hosts })),
      rules: {
        allow: params.approvalRules.filter((rule) => rule.behavior === 'allow').map((rule) => redactSecrets(rule.when)),
        askFirst: params.approvalRules.filter((rule) => rule.behavior === 'ask').map((rule) => redactSecrets(rule.when)),
      },
    },
    questions: { safe: judged.safe, askFirst: toolPromptsAskFirstQuestion() },
  });

  if (!answers) {
    log.warn({
      tag: 'tool',
      message: 'Automatic approval unavailable; requesting owner approval.',
      botId: params.botId,
    });

    return false;
  }

  return answers.safe >= TOOL.judgeThreshold && answers.askFirst <= TOOL.judgeAskThreshold;
}
