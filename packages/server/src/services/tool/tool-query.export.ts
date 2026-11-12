import { TOOL } from './tool.constants';
import type { ToolServiceDeps } from '../../types/tool.types';
import type { ToolExport } from '@repo/contracts/universal';

export async function toolQueryExport({ credentials }: ToolServiceDeps): Promise<ToolExport> {
  return { jevApiKey: await credentials.queries.get({ key: TOOL.jevCredential }) };
}
