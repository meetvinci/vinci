import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type * as UniversalTypes from '@repo/contracts/universal';

export interface ProviderServiceDeps {
  models: ModelRuntime;
  sessions: Map<string, ProviderLoginRecord>;
}

export interface ProviderLoginParams extends UniversalTypes.ProviderLoginInput {
  deviceId: string | null;
  serverId: string;
}

export interface ProviderCompleteParams extends UniversalTypes.ProviderCompleteInput {
  deviceId: string | null;
}

export interface ProviderSessionParams extends UniversalTypes.ProviderSessionIdInput {
  deviceId: string | null;
}

export type ProviderCancelParams = ProviderSessionParams;
export type ProviderListParams = Pick<ProviderLoginParams, 'deviceId'>;
export type ProviderLogoutParams = UniversalTypes.ProviderLogoutInput;
export interface ProviderCancelDeviceParams {
  deviceId: string;
}

export interface ProviderPromptWaiter {
  promptId: string;
  resolve: (answer: string) => void;
  reject: (error: Error) => void;
}

export interface ProviderLoginRecord {
  id: string;
  providerId: string;
  authType: UniversalTypes.ProviderAuthType;
  deviceId: string | null;
  status: UniversalTypes.ProviderSession['status'];
  expiresAt: number;
  abort: AbortController;
  timeout?: ReturnType<typeof setTimeout>;
  prompt?: UniversalTypes.ProviderPrompt;
  events: UniversalTypes.ProviderEvent[];
  pending?: ProviderPromptWaiter;
  done: Promise<void>;
  error?: string;
}

export type ProviderSettle = () => void;

export interface ProviderService {
  models: ModelRuntime;
  actions: {
    login(params: ProviderLoginParams): UniversalTypes.ProviderSession;
    complete(params: ProviderCompleteParams): UniversalTypes.ProviderSession;
    cancel(params: ProviderCancelParams): void;
    logout(params: ProviderLogoutParams): Promise<void>;
    cancelDevice(params: ProviderCancelDeviceParams): void;
  };
  queries: {
    list(params: ProviderListParams): UniversalTypes.ProviderList;
    session(params: ProviderSessionParams): UniversalTypes.ProviderSession;
  };
  close(): Promise<void>;
}
