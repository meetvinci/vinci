import { useLocalSearchParams } from 'expo-router';
import { BotAlwaysApprovedClearDialog } from '@/components/bots/bot-always-approved-clear-dialog';
import type { BotDetailsRouteParams } from '@/types/bot-details.types';

export default function BotAlwaysApprovedClearRoute() {
  const { botId } = useLocalSearchParams<BotDetailsRouteParams>();

  return <BotAlwaysApprovedClearDialog botId={botId} />;
}
