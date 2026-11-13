import { match } from 'ts-pattern';
import { globalClients } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';

export async function globalActionCopy(deps: GlobalTypes.GlobalServiceDeps, { user, section }: GlobalTypes.GlobalCopyParams): Promise<void> {
  const { template, person } = await globalClients(deps, { user });

  await match(section)
    .with('models', async () => person.providers.import(await template.providers.export()))
    .with('chat', async () => {
      await person.conversation.configure(await template.conversation.settings());
    })
    .with('tools', async () => {
      const [{ approvalRules, approvalTimeoutMinutes }, { jevApiKey }] = await Promise.all([
        template.tools.settings(),
        template.tools.export(),
      ]);

      await person.tools.configure({
        approvalRules,
        approvalTimeoutMinutes,
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
      const [skills, instructions, plugins, mcp, files] = await Promise.all([
        template.skills.settings(),
        template.instructions.settings(),
        template.plugins.settings(),
        template.mcp.settings(),
        template.workspace.export(),
      ]);

      await person.workspace.import(files);
      await person.skills.configure(skills);
      await person.instructions.configure(instructions);
      await person.plugins.configure(plugins);
      await person.mcp.configure(mcp);
    })
    .exhaustive();
}
