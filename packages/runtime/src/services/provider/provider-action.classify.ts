import { clampThinkingLevel } from '@earendil-works/pi-ai/models';
import { match, P } from 'ts-pattern';
import { providerClassifyAnswers } from '../../types/provider.types';
import { PROVIDER } from './provider.constants';
import { providerPromptsClassify } from './provider.prompts';
import type * as ProviderTypes from '../../types/provider.types';

export async function providerActionClassify(
  { models }: ProviderTypes.ProviderServiceDeps,
  { state, questions, apiKey, provider, signal }: ProviderTypes.ProviderClassifyParams,
): Promise<ProviderTypes.ProviderClassifyAnswers | null> {
  const providerSignal = (timeoutMs: number) => AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  const providerComplete = (found: ProviderTypes.ProviderClassifyAnswers) => (Object.keys(questions).every((id) => id in found) ? found : null);

  try {
    const classifiers = apiKey === null ? await models.getAvailableOfType('classifier') : [];

    const classifier = apiKey === null
      ? PROVIDER.classifierOrder.map((name) => classifiers.find((model) => model.id.includes(name))).find(Boolean) ?? classifiers.at(0)
      : models.getModelOfType('classifier', PROVIDER.classifierModel.provider, PROVIDER.classifierModel.id);

    return await match(classifier)
      .with(P.nonNullable, async (model) => {
        const result = await models.classify(model, {
          state,
          questions: Object.fromEntries(Object.entries(questions).map(([id, question]) => [id, { type: 'bool' as const, ...question }])),
        }, { apiKey: apiKey ?? undefined, signal: providerSignal(PROVIDER.classifyTimeoutMs) });

        const found = Object.fromEntries(Object.entries(result.answers).flatMap(([id, answer]) => (answer.type === 'bool' ? [[id, answer.probability]] : [])));

        return result.stopReason === 'stop' ? providerComplete(found) : null;
      })
      .otherwise(async () => {
        const available = await models.getAvailable(provider);
        const prices = available.map((model) => model.cost.input + model.cost.output);
        const chat = available.at(prices.indexOf(Math.min(...prices)));

        if (!chat) {
          return null;
        }

        const level = clampThinkingLevel(chat, PROVIDER.classifyChatThinking);

        const reply = await models.completeSimple(chat, {
          systemPrompt: providerPromptsClassify(),
          messages: [{ role: 'user', content: JSON.stringify({ state, questions }), timestamp: Date.now() }],
        }, {
          maxTokens: PROVIDER.classifyChatMaxTokens,
          reasoning: level === 'off' ? undefined : level,
          signal: providerSignal(PROVIDER.classifyChatTimeoutMs),
        });

        const text = reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
        const found = providerClassifyAnswers.parse(JSON.parse(PROVIDER.classifyReply.exec(text)?.[0] ?? ''));

        return reply.stopReason === 'stop' ? providerComplete(found) : null;
      });
  } catch {
    return null;
  }
}
