import { match, P } from 'ts-pattern';
import { toolActionJudge } from './tool-action.judge';
import { toolQuerySettings } from './tool-query.settings';
import { toolQueryTarget } from './tool-query.target';
import { TOOL } from './tool.constants';
import { toolControlFor, toolIsRead } from './tool.utils';
import type { ToolAuthorizeParams, ToolServiceDeps } from '../../types/tool.types';
import type { RuntimeToolDecision } from '@repo/runtime/server';

export async function toolActionAuthorize(deps: ToolServiceDeps, call: ToolAuthorizeParams): Promise<RuntimeToolDecision> {
  call.context.abortSignal?.throwIfAborted();

  const toolReadBot = () => deps.database.db.selectFrom('bot')
    .select(['permission', 'instructions', 'modelProvider'])
    .where('id', '=', call.botId)
    .executeTakeFirst();

  const bot = await toolReadBot();

  return match({
    bot,
    isReadOnly: call.isReadOnly,
    isOwn: call.isOwn,
    approved: call.approved === true,
  })
    .with({ bot: P.nullish }, () => 'deny' as const)
    .with({ isReadOnly: true }, () => 'allow' as const)
    .with({ bot: { permission: 'no-questions' } }, () => 'allow' as const)
    .with({ bot: { permission: 'read-only' } }, () => 'deny' as const)
    .with({ isOwn: true }, () => 'allow' as const)
    .with({ approved: true }, () => 'allow' as const)
    .with({ bot: P.nonNullable }, async ({ bot: current }) => {
      const settings = await toolQuerySettings(deps);
      const target = toolQueryTarget(deps, { botId: call.botId, toolName: call.name });
      const secrets = call.isSandboxed && call.name === TOOL.commandTool ? await deps.secrets.queries.rules() : [];

      const kind = match({
        isSandboxed: call.isSandboxed,
        hasSecrets: secrets.length > 0,
        hasRules: settings.approvalRules.length > 0,
      })
        .with({ hasSecrets: true }, () => 'command' as const)
        .with({ isSandboxed: false, hasRules: true }, () => 'tool' as const)
        .otherwise(() => null);

      return match({
        isAskFirst: TOOL.askFirstTools.some((name) => name === call.name),
        control: toolControlFor(settings, target),
        isSandboxed: call.isSandboxed,
        isRead: toolIsRead(settings, target),
        kind,
      })
        .with({ isAskFirst: true }, () => 'ask' as const)
        .with({ control: 'allow', kind: P.not('command') }, () => 'allow' as const)
        .with({ control: 'ask' }, () => 'ask' as const)
        .with({ isSandboxed: true, kind: null }, () => 'allow' as const)
        .with({ isRead: true }, () => 'allow' as const)
        .with({ kind: P.nonNullable }, async ({ kind: judged }) => {
          const isAllowed = await toolActionJudge(deps, {
            ...call,
            kind: judged,
            instructions: current.instructions,
            provider: current.modelProvider,
            secrets,
            approvalRules: settings.approvalRules,
          });

          const [latest, latestSettings] = await Promise.all([
            toolReadBot(),
            toolQuerySettings(deps),
          ]);

          const hasCurrentRules = JSON.stringify(settings.approvalRules) === JSON.stringify(latestSettings.approvalRules);

          call.context.abortSignal?.throwIfAborted();

          return match({ bot: latest, canApprove: isAllowed && hasCurrentRules })
            .with({ bot: P.nullish }, () => 'deny' as const)
            .with({ bot: { permission: 'read-only' } }, () => 'deny' as const)
            .with({ bot: { permission: 'no-questions' } }, () => 'allow' as const)
            .with({ bot: { permission: 'normal', instructions: current.instructions }, canApprove: true }, () => 'allow' as const)
            .otherwise(() => 'ask' as const);
        })
        .otherwise(() => 'ask' as const);
    })
    .exhaustive();
}
