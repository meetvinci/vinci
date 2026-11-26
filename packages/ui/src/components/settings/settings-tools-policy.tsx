import { TOOL_POLICY_CHOICES, toolPolicyChoiceLabel, toolPolicyServerHint, toolPresentation } from '@repo/client/client';
import { useSettingsToolPolicy } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import IconChevronRight from '~icons/lucide/chevron-right';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../collapsible';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '../item';
import { PanelContent, PanelDescription, PanelRow, PanelTitle } from '../panel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { Skeleton } from '../skeleton';
import { Switch } from '../switch';
import { SettingsGroup } from './settings-group';
import type { ToolPolicyChoice, ToolPolicyServerRow } from '@repo/client/client';
import type { ToolControl } from '@repo/contracts/universal';

interface SettingsToolsPolicySelectProps {
  label: string
  choice: ToolPolicyChoice
  fallback: ToolControl['behavior'] | null
  disabled: boolean
  onChange: (behavior: ToolControl['behavior'] | null) => void
}

function SettingsToolsPolicySelect({ label, choice, fallback, disabled, onChange }: SettingsToolsPolicySelectProps) {
  return (
    <Select
      disabled={disabled}
      value={choice}
      onValueChange={(next) => onChange(next === 'allow' || next === 'ask' ? next : null)}
    >
      <SelectTrigger aria-label={label} className="w-auto">
        <SelectValue>{toolPolicyChoiceLabel(choice, fallback)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TOOL_POLICY_CHOICES.map((option) => <SelectItem key={option} value={option}>{toolPolicyChoiceLabel(option, fallback)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

interface SettingsToolsPolicyServerProps {
  server: ToolPolicyServerRow
  policy: ReturnType<typeof useSettingsToolPolicy>
}

function SettingsToolsPolicyServer({ server, policy }: SettingsToolsPolicyServerProps) {
  return (
    <Collapsible className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-start gap-2 text-left">
          <IconChevronRight className="mt-0.5 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
          <PanelContent>
            <PanelTitle>{server.title}</PanelTitle>
            <PanelDescription className="font-mono break-all">{server.key}</PanelDescription>
            <PanelDescription>{toolPolicyServerHint(server)}</PanelDescription>
          </PanelContent>
        </CollapsibleTrigger>
        <SettingsToolsPolicySelect
          choice={server.choice}
          disabled={policy.isPending}
          fallback={server.fallback}
          label={m.settings_tools_policy_server({ server: server.title })}
          onChange={(behavior) => policy.change({
            server: server.key,
            tool: null,
            behavior,
          })}
        />
      </div>
      {server.isShipped || server.isAdminTrusted ? null : (
        <label className="flex items-center justify-between gap-3 text-sm">
          {m.settings_tools_policy_trust()}
          <Switch
            checked={server.isTrusted}
            disabled={policy.isPending}
            onCheckedChange={(isTrusted) => policy.trust(server.key, isTrusted)}
          />
        </label>
      )}
      <CollapsibleContent>
        <ItemGroup variant="outline">
          {server.tools.map((tool) => (
            <Item key={tool.name} size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full"><span className="truncate" title={tool.name}>{tool.title}</span></ItemTitle>
                <ItemDescription>{tool.isRead ? m.settings_tools_policy_read() : m.settings_tools_policy_effect()}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <SettingsToolsPolicySelect
                  choice={tool.choice}
                  disabled={policy.isPending}
                  fallback={tool.fallback}
                  label={m.settings_tools_policy_tool({ tool: tool.title })}
                  onChange={(behavior) => policy.change({
                    server: server.key,
                    tool: tool.name,
                    behavior,
                  })}
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SettingsToolsPolicy() {
  const policy = useSettingsToolPolicy();

  return (
    <SettingsGroup isTitleVisible title={m.settings_tools_policy()}>
      <PanelRow className="block">
        <PanelDescription>{m.settings_tools_policy_hint()}</PanelDescription>
      </PanelRow>
      {policy.isLoading ? (
        <PanelRow>
          <Skeleton className="h-10 w-full" />
        </PanelRow>
      ) : null}
      {!policy.isLoading && policy.servers.length === 0 ? (
        <PanelRow className="block">
          <PanelDescription>{m.settings_tools_policy_empty()}</PanelDescription>
        </PanelRow>
      ) : null}
      {policy.servers.map((server) => (
        <PanelRow className="block" key={server.key}>
          <SettingsToolsPolicyServer policy={policy} server={server} />
        </PanelRow>
      ))}
      {policy.others.length > 0 ? (
        <PanelRow className="flex-col items-stretch">
          <PanelTitle>{m.settings_tools_policy_other()}</PanelTitle>
          <ItemGroup variant="outline">
            {policy.others.map((control) => {
              const label = toolPresentation({ toolName: control.tool ?? '' }).label;

              return (
                <Item key={control.tool} size="sm">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full"><span className="truncate" title={control.tool ?? ''}>{label}</span></ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <SettingsToolsPolicySelect
                      choice={control.behavior}
                      disabled={policy.isPending}
                      fallback="ask"
                      label={m.settings_tools_policy_tool({ tool: label })}
                      onChange={(behavior) => policy.change({
                        server: null,
                        tool: control.tool,
                        behavior,
                      })}
                    />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </PanelRow>
      ) : null}
      {policy.problem ? (
        <PanelRow className="block">
          <p className="text-xs text-destructive" role="alert">{policy.problem}</p>
        </PanelRow>
      ) : null}
    </SettingsGroup>
  );
}
