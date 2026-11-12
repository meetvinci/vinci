import { BotMcpPanel } from '@repo/ui/bots/bot-mcp-panel';
import { useSectionScope } from '@/hooks/use-section-scope';
import { useTeam } from '@/hooks/use-team';
import { settingsIsTeamVisible } from '@/services/settings/settings.utils';
import type { Bot } from '@repo/contracts/universal';

interface BotMcpProps {
  bot: Bot
}

export function BotMcp({ bot }: BotMcpProps) {
  const scope = useSectionScope();
  const team = useTeam();

  return (
    <BotMcpPanel
      bot={bot}
      canSignIn={!scope.isAdmin}
      isSourcesVisible={settingsIsTeamVisible({ ...team, section: 'sources' })}
      removeLink={(server) => scope.bots.mcpRemove(bot.id, server)}
    />
  );
}
