import { modelSelection } from '@repo/contracts/universal';
import { z } from 'zod';
import type * as PiAiTypes from '@earendil-works/pi-ai';
import type { Models, ModelsSimpleStreamOptions } from '@earendil-works/pi-ai/models';

export const runtimeModelRoute = z.object({
  primary: modelSelection,
  fallback: modelSelection,
});

export type RuntimeModelRoute = z.infer<typeof runtimeModelRoute>;

export interface RuntimeModelRequest {
  route: RuntimeModelRoute;
  context: PiAiTypes.Context;
  options?: ModelsSimpleStreamOptions;
}

export interface RuntimeModelStallRequest {
  stream: Models['streamSimple'];
  model: PiAiTypes.Model<PiAiTypes.Api>;
  context: PiAiTypes.Context;
  options?: ModelsSimpleStreamOptions;
  output: PiAiTypes.AssistantMessageEventStream;
}

export interface RuntimeModelStallState {
  isStalled: boolean;
  partial: PiAiTypes.AssistantMessage | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
}
