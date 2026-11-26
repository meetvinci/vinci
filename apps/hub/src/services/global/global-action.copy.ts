import { log } from '@repo/logger/server';
import { match } from 'ts-pattern';
import { globalClients } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionCopy(deps: GlobalTypes.GlobalServiceDeps, { user, section }: GlobalTypes.GlobalCopyParams): Promise<void> {
  const { template, person } = await globalClients(deps, { user });

  await match(section)
    .with('models', async () => {
      const [keys, settings] = await Promise.all([
        template.providers.export(),
        template.models.settings(),
      ]);

      await person.providers.import(keys);
      await person.models.configure(settings);
    })
    .with('chat', async () => {
      await person.conversation.configure(await template.conversation.settings());
    })
    .with('tools', async () => {
      const [{ approvalRules, approvalTimeoutMinutes, policy }, { jevApiKey }] = await Promise.all([
        template.tools.settings(),
        template.tools.export(),
      ]);

      await person.tools.configure({
        approvalRules,
        approvalTimeoutMinutes,
        policyDefaults: { ...policy, trusted: [] },
        jevApiKey,
      });
    })
    .with('secrets', async () => {
      const [settings, secrets] = await Promise.all([
        template.secrets.settings(),
        template.secrets.export(),
      ]);

      await person.secrets.configure(settings);
      await person.secrets.import(secrets);
    })
    .with('sources', async () => {
      const [skills, instructions, plugins, mcp, { files, skipped }] = await Promise.all([
        template.skills.settings(),
        template.instructions.settings(),
        template.plugins.settings(),
        template.mcp.settings(),
        template.workspace.export(),
      ]);

      match(skipped)
        .with([], () => undefined)
        .otherwise(() => log.warn({
          tag: 'hub',
          message: 'Shared folder copied without its links and special files',
          user: user.id,
          skipped,
        }));

      await person.workspace.import({ files });
      await person.skills.configure(skills);
      await person.instructions.configure(instructions);
      await person.plugins.configure(plugins);
      await person.mcp.configure(mcp);
    })
    .exhaustive();
}
