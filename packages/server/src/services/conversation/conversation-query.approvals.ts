import type { ConversationServiceDeps } from '../../types/conversation.types';
import type { ConversationTarget } from '@repo/contracts/universal';

export async function conversationQueryApprovals({ runtime, bots, tools }: ConversationServiceDeps, params: ConversationTarget) {
  await bots.queries.get(params);
  const approvals = await runtime.queries.approvals(params);

  return approvals.map((approval) => ({ ...approval, action: tools.queries.action({ botId: approval.botId, toolName: approval.toolName }) }));
}
