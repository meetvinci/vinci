import { GIF, gifToolDetails, MCP_PRESETS, TOOL_APPROVAL, toolCallArtifact, toolCallJson, toolCallPeerDetails, toolCallSubagent, toolCallSubagentDetails, toolCallText } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { match, P } from 'ts-pattern';
import { TOOL_ACTIVITY_TOPIC_LABELS, TOOL_ACTIVITY_TOPIC_PATTERNS, TOOL_ACTIVITY_TOPICS, TOOL_APPROVAL_SENTENCES, TOOL_ARTIFACT_NAMES, TOOL_MCP_NAME, TOOL_PATH_KEYS, TOOL_PEER_NAMES, TOOL_PRESENTATIONS, TOOL_PREVIEW_KEYS, TOOL_SUBAGENT } from './tool.constants';
import type * as ToolTypes from '../../types/tool.types';
import type { Bot, ToolApproval, ToolControl } from '@repo/contracts/universal';
import type { DynamicToolUIPart } from 'ai';

export function toolInputTexts(part: DynamicToolUIPart): ToolTypes.ToolInputText[] {
  const input = toolCallJson.safeParse(part.input);

  return Object.entries(input.success ? input.data : {}).flatMap(([key, value]) => {
    const text = toolCallText.trim().min(1).safeParse(value);

    return text.success ? [{ key, value: text.data }] : [];
  });
}

export function toolInputText({ input, key }: ToolTypes.ToolInputTextParams): string | undefined {
  return toolCallText.min(1).safeParse(toolCallJson.safeParse(input).data?.[key]).data;
}

export function toolReadableName(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toolPeers(parts: DynamicToolUIPart[], bots: Bot[]): ToolTypes.ToolPeer[] {
  const peers = parts.flatMap((part) => {
    const details = TOOL_PEER_NAMES.has(part.toolName) ? toolCallPeerDetails.safeParse(part.toolMetadata?.details).data : undefined;
    const peer = bots.find((bot) => bot.id === (details?.recipientId ?? toolInputText({ input: part.input, key: 'botId' })));

    return peer ? [{ peer, conversationId: details?.recipientConversationId }] : [];
  });

  return [...new Map(peers.map((item) => [item.peer.id, item])).values()];
}

export function toolIdentity(part: Pick<DynamicToolUIPart, 'toolName'>): ToolTypes.ToolIdentity {
  const mcp = TOOL_MCP_NAME.exec(part.toolName);

  return { name: mcp?.[1] ?? part.toolName, identifier: part.toolName, isMcp: Boolean(mcp) };
}

export function toolApprovalSentence({ action, arguments: input, toolName }: Pick<ToolApproval, 'action' | 'arguments' | 'toolName'>): string {
  const template = action.server === null ? undefined : TOOL_APPROVAL_SENTENCES.get(action.server)?.get(action.tool);
  const subject = template?.keys.map((key) => toolInputText({ input, key })).find(Boolean);
  const tool = action.server === null ? toolPresentation({ toolName }).label : toolReadableName(action.tool);
  const server = MCP_PRESETS.find((preset) => preset.url === action.server)?.title ?? action.serverName;

  return match({
    template,
    subject,
    server,
  })
    .with({ template: P.nonNullable, subject: P.string }, ({ template: known, subject: named }) => known.sentence({ subject: named }))
    .with({ template: { keys: [] } }, ({ template: known }) => known.sentence({ subject: '' }))
    .with({ server: P.string }, ({ server: title }) => m.tool_approval_generic({ tool, server: title }))
    .otherwise(() => tool);
}

export function toolPresentation(part: Pick<DynamicToolUIPart, 'toolName'>): ToolTypes.ToolPresentation {
  const identity = toolIdentity(part);
  const known = identity.isMcp ? undefined : TOOL_PRESENTATIONS.get(identity.name);

  return {
    label: known?.label() ?? toolReadableName(identity.name),
    icon: known?.icon ?? (identity.isMcp ? 'mcp' : 'tool'),
  };
}

// SAFETY: built from the tool's name alone, never its arguments, output or the model's text, so a person who cannot see steps reads no technical detail.
export function toolActivityFriendly(part: Pick<DynamicToolUIPart, 'toolName' | 'toolCallId'>): string {
  const words = toolReadableName(toolIdentity(part).name).toLowerCase();
  const isOwn = part.toolName.startsWith('bot_');
  const topic = TOOL_ACTIVITY_TOPICS.get(part.toolName) ?? (isOwn ? undefined : TOOL_ACTIVITY_TOPIC_PATTERNS.find((rule) => rule.pattern.test(words))?.topic) ?? 'working';
  const labels = TOOL_ACTIVITY_TOPIC_LABELS[topic];
  const variant = part.toolCallId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % labels.length;

  return (labels[variant] ?? labels[0])();
}

export function toolPreview(part: DynamicToolUIPart): string | undefined {
  const texts = toolInputTexts(part);
  const preferred = TOOL_PREVIEW_KEYS.map((key) => texts.find((text) => text.key === key)).find(Boolean) ?? texts.at(0);
  const line = preferred?.value.split('\n')[0];

  if (!preferred || !TOOL_PATH_KEYS.has(preferred.key)) {
    return line;
  }

  return line
    ?.split('/')
    .filter(Boolean)
    .at(-1);
}

export function toolOutputText(part: DynamicToolUIPart): string | undefined {
  return match(part)
    .with({ state: 'output-error' }, ({ errorText }) => errorText)
    .with({ state: 'output-available', output: P.string }, ({ output }) => output.trimEnd() || undefined)
    .with({ state: 'output-available' }, ({ output }) => JSON.stringify(output, null, 2))
    .otherwise(() => undefined);
}

export function toolCollapsed({ part, grouped, expanded }: ToolTypes.ToolCollapsedParams): boolean {
  return grouped && !expanded && part.state !== 'approval-requested';
}

export function toolRunning(part: DynamicToolUIPart): boolean {
  return part.state === 'input-streaming' || part.state === 'input-available' || part.state === 'approval-responded';
}

export function toolGroupState({ parts }: ToolTypes.ToolGroupStateParams): DynamicToolUIPart['state'] {
  if (parts.some(toolRunning)) {
    return 'input-available';
  }

  if (parts.some((part) => part.state === 'output-error')) {
    return 'output-error';
  }

  return 'output-available';
}

export function toolOwnBlock(part: DynamicToolUIPart, index: number): ToolTypes.ToolBlock | undefined {
  const artifact = TOOL_ARTIFACT_NAMES.has(part.toolName) && part.state === 'output-available' ? toolCallArtifact.safeParse(part.output).data : undefined;
  const gif = part.toolName === GIF.toolName && part.state === 'output-available' ? gifToolDetails.safeParse(part.toolMetadata?.details).data : undefined;
  const subagentInput = part.toolName === TOOL_SUBAGENT ? toolCallSubagent.safeParse(part.input).data : undefined;
  const subagentDetails = toolCallSubagentDetails.safeParse(part.toolMetadata?.details).data;

  return match({
    artifact,
    gif,
    subagentInput,
    isExpired: part.state === 'output-error' && part.errorText.includes(TOOL_APPROVAL.expiredResult),
  })
    .returnType<ToolTypes.ToolBlock | undefined>()
    .with({ artifact: P.nonNullable }, ({ artifact: found }) => ({ kind: 'artifact', index, artifact: found }))
    .with({ gif: P.nonNullable }, ({ gif: found }) => ({ kind: 'gif', index, gif: found }))
    .with({ subagentInput: P.nonNullable }, ({ subagentInput: input }) => ({ kind: 'subagent', index, part, subagent: { ...input, conversationId: subagentDetails?.conversationId } }))
    .with({ isExpired: true }, () => ({ kind: 'expired', index, part }))
    .otherwise(() => undefined);
}

export function toolPolicyServers({ policy, defaults, servers }: ToolTypes.ToolPolicyServersParams): ToolTypes.ToolPolicyServerRow[] {
  const toolFind = (controls: ToolControl[], server: string, tool: string | null) => (
    controls.find((control) => control.server === server && control.tool === tool)?.behavior
  );

  const keys = [...policy.controls, ...defaults.controls].flatMap((control) => (control.server === null ? [] : [control.server]));
  const known = new Set(servers.map((server) => server.key));

  const listed = [
    ...servers,
    ...[...new Set([...keys, ...policy.trusted])].filter((key) => !known.has(key)).map((key) => ({
      key,
      names: [],
      isShipped: MCP_PRESETS.some((preset) => preset.url === key),
      tools: [...policy.controls, ...defaults.controls].flatMap((control) => (
        control.server === key && control.tool !== null ? [{ name: control.tool, title: control.tool, declaresReadOnly: false }] : []
      )),
    })),
  ];

  return listed.map((server) => {
    const isTrusted = policy.trusted.includes(server.key);
    const ownServer = toolFind(policy.controls, server.key, null);
    const adminServer = toolFind(defaults.controls, server.key, null);

    return {
      key: server.key,
      title: MCP_PRESETS.find((preset) => preset.url === server.key)?.title ?? (server.names.join(', ') || server.key),
      isShipped: server.isShipped,
      isTrusted,
      choice: ownServer ?? 'default',
      fallback: adminServer ?? null,
      tools: [...new Map(server.tools.map((tool) => [tool.name, tool])).values()].map((tool) => {
        const isRead = tool.declaresReadOnly && (server.isShipped || isTrusted);

        return {
          name: tool.name,
          title: tool.title,
          isRead,
          choice: toolFind(policy.controls, server.key, tool.name) ?? 'default',
          fallback: ownServer ?? toolFind(defaults.controls, server.key, tool.name) ?? adminServer ?? (isRead ? 'allow' as const : 'ask' as const),
        };
      }),
    };
  });
}

export function toolPolicyChoiceLabel(choice: ToolTypes.ToolPolicyChoice, fallback: ToolControl['behavior'] | null): string {
  return match(choice)
    .with('allow', () => m.settings_tools_policy_allow())
    .with('ask', () => m.settings_tools_policy_ask())
    .with('default', () => match(fallback)
      .with('allow', () => m.settings_tools_policy_default_runs())
      .with('ask', () => m.settings_tools_policy_default_asks())
      .with(null, () => m.settings_tools_policy_default())
      .exhaustive())
    .exhaustive();
}

export function toolPolicyServerHint(server: Pick<ToolTypes.ToolPolicyServerRow, 'isShipped' | 'isTrusted'>): string {
  return match(server)
    .with({ isShipped: true }, () => m.settings_tools_policy_shipped())
    .with({ isTrusted: true }, () => m.settings_tools_policy_trusted())
    .otherwise(() => m.settings_tools_policy_untrusted());
}
