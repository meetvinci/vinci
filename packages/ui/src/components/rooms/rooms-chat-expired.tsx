import { toolPresentation, toolPreview } from '@repo/client/client';
import { m } from '@repo/i18n/client';
import { Event, EventBody, EventContent, EventLabel, EventName, EventTrigger } from '../ai/event';
import { ToolIcon } from '../tools/tool-icon';
import type { ToolBot } from '@repo/client/client';
import type { DynamicToolUIPart } from 'ai';

interface RoomsChatExpiredProps {
  bot: ToolBot
  part: DynamicToolUIPart
}

export function RoomsChatExpired({ bot, part }: RoomsChatExpiredProps) {
  const presentation = toolPresentation(part);

  return (
    <Event>
      <EventTrigger status="denied">
        <EventLabel>{m.rooms_event_approval_expired()}</EventLabel>
        <EventName icon={<ToolIcon icon={presentation.icon} />}>{toolPreview(part)}</EventName>
      </EventTrigger>
      <EventContent>
        <EventBody>{m.rooms_event_approval_expired_detail({ name: bot.name })}</EventBody>
      </EventContent>
    </Event>
  );
}
