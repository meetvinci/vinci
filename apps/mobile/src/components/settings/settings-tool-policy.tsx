import { TOOL_POLICY_CHOICES, toolPolicyChoiceLabel, toolPolicyServerHint, toolPresentation } from '@repo/client/client';
import { useSettingsToolPolicy } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { Plug, ShieldQuestion, Wrench } from 'lucide-react-native';
import { Switch } from 'react-native';
import { BotDetailsSection } from '@/components/bots/bot-details-section';
import { BotSettingsMenuRow } from '@/components/bots/bot-settings-menu-row';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { LabelDescription } from '@/components/ui/label';
import type { MenuItem } from '@/types/menu.types';
import type { ToolPolicyChange, ToolPolicyChoice } from '@repo/client/client';
import type { ToolControl } from '@repo/contracts/universal';

export function SettingsToolPolicy() {
  const policy = useSettingsToolPolicy();

  const items = (choice: ToolPolicyChoice, fallback: ToolControl['behavior'] | null, target: Omit<ToolPolicyChange, 'behavior'>): MenuItem[] => (
    TOOL_POLICY_CHOICES.map((option) => ({
      label: toolPolicyChoiceLabel(option, fallback),
      systemImage: option === choice ? 'checkmark' : undefined,
      onSelect: () => policy.change({ ...target, behavior: option === 'default' ? null : option }),
    }))
  );

  return (
    <BotDetailsSection
      icon={ShieldQuestion}
      title={m.settings_tools_policy()}
    >
      <LabelDescription>{m.settings_tools_policy_hint()}</LabelDescription>
      {!policy.isLoading && policy.servers.length === 0 ? <LabelDescription>{m.settings_tools_policy_empty()}</LabelDescription> : null}
      {policy.servers.map((server) => (
        <ItemGroup key={server.key}>
          <BotSettingsMenuRow
            description={`${server.key}\n${toolPolicyServerHint(server)}`}
            icon={Plug}
            isDisabled={policy.isPending}
            items={items(server.choice, server.fallback, { server: server.key, tool: null })}
            title={server.title}
            value={toolPolicyChoiceLabel(server.choice, server.fallback)}
          />
          {server.isShipped ? null : (
            <Item>
              <ItemContent>
                <ItemTitle>{m.settings_tools_policy_trust()}</ItemTitle>
              </ItemContent>
              <Switch
                accessibilityLabel={m.settings_tools_policy_trust()}
                disabled={policy.isPending}
                value={server.isTrusted}
                onValueChange={(isTrusted) => policy.trust(server.key, isTrusted)}
              />
            </Item>
          )}
          {server.tools.map((tool) => (
            <BotSettingsMenuRow
              description={tool.isRead ? m.settings_tools_policy_read() : m.settings_tools_policy_effect()}
              icon={Wrench}
              isDisabled={policy.isPending}
              items={items(tool.choice, tool.fallback, { server: server.key, tool: tool.name })}
              key={tool.name}
              title={tool.title}
              value={toolPolicyChoiceLabel(tool.choice, tool.fallback)}
            />
          ))}
        </ItemGroup>
      ))}
      {policy.others.length > 0 ? (
        <ItemGroup>
          <Item>
            <ItemContent>
              <ItemDescription>{m.settings_tools_policy_other()}</ItemDescription>
            </ItemContent>
          </Item>
          {policy.others.map((control) => (
            <BotSettingsMenuRow
              icon={Wrench}
              isDisabled={policy.isPending}
              items={items(control.behavior, 'ask', { server: null, tool: control.tool })}
              key={control.tool}
              title={toolPresentation({ toolName: control.tool ?? '' }).label}
              value={toolPolicyChoiceLabel(control.behavior, 'ask')}
            />
          ))}
        </ItemGroup>
      ) : null}
      {policy.problem ? <LabelDescription accessibilityRole="alert" variant="error">{policy.problem}</LabelDescription> : null}
    </BotDetailsSection>
  );
}
