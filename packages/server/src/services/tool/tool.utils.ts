import { MCP_PRESETS } from '@repo/contracts/universal';
import type { ToolTarget } from '../../types/tool.types';
import type { ToolControl, ToolSettings } from '@repo/contracts/universal';

export function toolIsShipped(key: string): boolean {
  return MCP_PRESETS.some((preset) => preset.url === key);
}

export function toolControlFor({ policy, policyDefaults }: Pick<ToolSettings, 'policy' | 'policyDefaults'>, target: ToolTarget): ToolControl['behavior'] | undefined {
  return [policy, policyDefaults].flatMap(({ controls }) => [
    controls.find((control) => control.server === target.server && control.tool === target.tool),
    controls.find((control) => target.server !== null && control.server === target.server && control.tool === null),
  ]).find((control) => control !== undefined)?.behavior;
}

// SAFETY: annotations are hints a server writes about itself, so they count only for a server Vinci ships or one the person trusted.
export function toolIsRead({ policy, policyDefaults }: Pick<ToolSettings, 'policy' | 'policyDefaults'>, target: ToolTarget): boolean {
  const isTrusted = target.server !== null
    && (toolIsShipped(target.server) || policy.trusted.includes(target.server) || policyDefaults.trusted.includes(target.server));

  return isTrusted && target.declaresReadOnly;
}
