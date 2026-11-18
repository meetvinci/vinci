import { botSection } from '@repo/contracts/universal';
import { match } from 'ts-pattern';
import type { BotDialogView, BotDialogViewParams } from '@/types/bot.types';

export function botDialogView({ path, params }: BotDialogViewParams): BotDialogView | null {
  const { botId = '', tab, routineId = '', todoId = '', server = '' } = params;

  return match(path)
    .returnType<BotDialogView | null>()
    .with('/create', () => ({ kind: 'create' }))
    .with('/$botId/$tab', () => match(botSection.safeParse(tab))
      .returnType<BotDialogView | null>()
      .with({ success: true }, ({ data }) => ({ kind: 'section', botId, section: data }))
      .otherwise(() => null))
    .with('/$botId/skills/local', () => ({ kind: 'section', botId, section: 'skills' }))
    .with('/$botId/delete', () => ({ kind: 'delete', botId }))
    .with('/$botId/reset', () => ({ kind: 'reset', botId }))
    .with('/$botId/routines/$routineId/edit', () => ({ kind: 'routine-edit', botId, routineId }))
    .with('/$botId/routines/$routineId/delete', () => ({ kind: 'routine-delete', botId, routineId }))
    .with('/$botId/todos/$todoId/delete', () => ({ kind: 'todo-delete', botId, todoId }))
    .with('/$botId/mcp/edit', () => ({ kind: 'mcp-edit', botId }))
    .with('/$botId/mcp/$server/remove', () => ({ kind: 'mcp-remove', botId, server }))
    .otherwise(() => null);
}
