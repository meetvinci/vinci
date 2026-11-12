import { rpcContext } from '@repo/client/react';
import { BotAvatar } from '@repo/ui/bots/bot-avatar';
import { Checkbox } from '@repo/ui/checkbox';
import { adminRpc } from '@/services/admin/admin.client';
import { ADMIN } from '@/services/admin/admin.constants';
import type { Bot } from '@repo/contracts/universal';

interface AdminBotChecklistProps {
  label: string
  bots: Bot[]
  selected: readonly string[]
  disabled?: boolean
  onToggle: (botId: string, isTicked: boolean) => void
}

export function AdminBotChecklist({ label, bots, selected, disabled, onToggle }: AdminBotChecklistProps) {
  const templateRpc = adminRpc({ userId: ADMIN.templateId });

  return (
    <rpcContext.Provider value={templateRpc}>
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">{label}</legend>
        {bots.map((bot) => (
          <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm has-disabled:opacity-60" key={bot.id}>
            <Checkbox
              checked={selected.includes(bot.id)}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(bot.id, checked === true)}
            />
            <span aria-hidden className="contents">
              <BotAvatar
                animate={false}
                bot={bot}
                size={24}
              />
            </span>
            <span className="min-w-0 flex-1 truncate">{bot.name}</span>
            <span className="truncate text-xs text-muted-foreground">@{bot.handle}</span>
          </label>
        ))}
      </fieldset>
    </rpcContext.Provider>
  );
}
