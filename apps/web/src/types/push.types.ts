import type { NotificationWebPushPayload } from '@repo/contracts/universal';

export interface PushState {
  status: 'desktop' | 'install' | 'unsupported' | 'blocked' | 'off' | 'on';
  background: boolean;
}

export interface PushClearParams {
  botId: string;
}

export interface PushShowParams {
  payload: NotificationWebPushPayload;
  icon: string;
}
