import { Errors } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { match, P } from 'ts-pattern';
import { GLOBAL } from './global.constants';
import { globalDriverAvatar } from './global.driver';
import { globalClients, globalQueue, globalSectionState, globalSerial } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';
import type { AdminBotCopy } from '@repo/contracts/universal';

export async function globalActionBots(deps: GlobalTypes.GlobalServiceDeps, { id, bots, by }: GlobalTypes.GlobalBotsParams): Promise<AdminBotCopy[]> {
  const user = await deps.users.queries.get({ id });

  if (!user) {
    throw new Errors.NOT_FOUND({
      resource: 'user',
      resourceId: id,
      internal: `No enabled user ${id}`,
    });
  }

  const copies: AdminBotCopy[] = [];

  await globalQueue(deps, id, async () => {
    const { template, person, templateUrl } = await globalClients(deps, { user });
    const hasGlobalSecrets = globalSectionState(deps.state.file, id, 'secrets').mode === 'global';

    await globalSerial(bots, async (from) => {
      const copy = await (async () => {
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, avatar, ...fields } = await template.bots.get({ botId: from });
        const { files, mcp } = await template.bots.exportFiles({ botId: from });

        const copied = await person.bots.create({
          ...fields,
          avatar: await match(avatar)
            .with({ kind: 'image' }, async ({ src }) => person.avatars.upload({ file: await globalDriverAvatar(templateUrl, src) }))
            .with(P._, async (other) => other)
            .exhaustive(),
        });

        await person.bots.importFiles({
          botId: copied.id,
          files,
          mcp: hasGlobalSecrets ? mcp : { ...mcp, credentials: {} },
        }).catch(async (error: unknown) => {
          await person.bots.delete({ botId: copied.id }).catch(() => undefined);
          throw error;
        });

        return { from, botId: copied.id };
      })().catch((error: unknown) => ({
        from,
        botId: null,
        error: match(error)
          .with({ code: 'CONFLICT' }, () => 'This user already has a bot with that handle')
          .with({ data: { fields: { files: { message: 'validation_workspace_too_large' } } } }, () => 'The bot\'s own files are too large to copy (over 2000 files or 6 MiB)')
          .with(P.instanceOf(Error), ({ message }) => message)
          .otherwise(String)
          .slice(0, GLOBAL.errorMaxLength),
      }));

      copies.push(copy);
    });
  });

  log.info({
    tag: 'hub',
    message: 'Admin copied template bots to a user',
    by,
    user: id,
    copied: copies.filter(({ botId }) => botId !== null).length,
    failed: copies.filter(({ botId }) => botId === null).length,
  });

  return copies;
}
