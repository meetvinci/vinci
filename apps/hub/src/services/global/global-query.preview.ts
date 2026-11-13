import { Errors } from '@repo/errors/universal';
import { createHmac } from 'node:crypto';
import { match, P } from 'ts-pattern';
import { globalMcpFile } from '../../types/global.types';
import { globalClients } from './global.utils';
import type * as GlobalTypes from '../../types/global.types';
import type { Client } from '@repo/client/client';
import type * as UniversalTypes from '@repo/contracts/universal';

export async function globalQueryPreview(
  deps: GlobalTypes.GlobalServiceDeps,
  { id, section }: GlobalTypes.GlobalPreviewParams,
): Promise<UniversalTypes.AdminSectionPreview> {
  const user = await deps.users.queries.get({ id });

  if (!user) {
    throw new Errors.NOT_FOUND({
      resource: 'user',
      resourceId: id,
      internal: `No enabled user ${id}`,
    });
  }

  const { template, person } = await globalClients(deps, { user });

  const globalSorted = (entries: [string, string][]): Record<string, string> => Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));

  const globalValues = (settings: object): Record<string, string> => globalSorted(Object.entries(settings)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, JSON.stringify(value)]));

  const globalRead = async (client: Client): Promise<GlobalTypes.GlobalPreviewGroups> => match(section)
    .with('models', async () => {
      const [{ keys }, { providers }] = await Promise.all([
        client.providers.export(),
        client.providers.list(),
      ]);

      return {
        keys: globalSorted(keys.map(({ providerId, key, env }) => [providerId, JSON.stringify({ key, env })])),
        oauth: globalSorted(providers.filter(({ credentialType, source }) => credentialType === 'oauth' && source === 'stored').map(({ id: providerId }) => [providerId, 'oauth'])),
      };
    })
    .with('chat', async () => ({ settings: globalValues(await client.conversation.settings()) }))
    .with('tools', async () => {
      const [{ approvalRules, approvalTimeoutMinutes }, { jevApiKey }] = await Promise.all([
        client.tools.settings(),
        client.tools.export(),
      ]);

      return {
        settings: globalValues({
          approvalRules,
          approvalTimeoutMinutes,
          jevApiKey,
        }),
      };
    })
    .with('secrets', async () => {
      const [settings, secrets, rules] = await Promise.all([
        client.secrets.settings(),
        client.secrets.export(),
        client.secrets.list(),
      ]);

      return {
        settings: globalValues(settings),
        secrets: globalSorted(secrets.map(({ name, ...secret }) => [name, JSON.stringify(secret)])),
        own: globalSorted(rules.filter(({ isGlobal }) => isGlobal !== true).map(({ name }) => [name, 'own'])),
      };
    })
    .with('sources', async () => {
      const [skills, instructions, plugins, mcp, { files }] = await Promise.all([
        client.skills.settings(),
        client.instructions.settings(),
        client.plugins.settings(),
        client.mcp.settings(),
        client.workspace.export(),
      ]);

      return {
        settings: globalValues({
          skills,
          instructions,
          plugins,
          mcp,
        }),
        files: globalSorted(files.map(({ path, content, isExecutable }) => [path, `${String(isExecutable)}:${content}`])),
      };
    })
    .exhaustive();

  const [mine, wanted] = await Promise.all([
    globalRead(person),
    globalRead(template),
  ]).catch((error: unknown) => {
    deps.daemons.actions.forget({ user });
    throw error;
  });

  const globalDiff = ({ kind, person: own, template: global }: GlobalTypes.GlobalPreviewDiff): UniversalTypes.AdminPreviewItem[] => {
    const names = [...new Set([...Object.keys(own), ...Object.keys(global)])].sort();

    return names.flatMap((name) => {
      const change = match({ isOwn: Object.hasOwn(own, name), isGlobal: Object.hasOwn(global, name) })
        .returnType<UniversalTypes.AdminPreviewChange | null>()
        .with({ isGlobal: false }, () => 'removed')
        .with({ isOwn: false }, () => 'added')
        .otherwise(() => (own[name] === global[name] ? null : 'changed'));

      return change ? [{
        kind,
        name,
        change,
      }] : [];
    });
  };

  const globalMcpParts = (path: string, value: string): GlobalTypes.GlobalPreviewPart[] => {
    const text = Buffer.from(value.slice(value.indexOf(':') + 1), 'base64').toString('utf8');
    const parsed = globalMcpFile.safeParse(text);

    if (!parsed.success) {
      return [{
        kind: 'file',
        name: path,
        value,
      }];
    }

    const { mcpServers, ...rest } = parsed.data;

    return [
      ...Object.entries(mcpServers).map(([name, entry]) => ({
        kind: 'mcpServer' as const,
        name,
        value: JSON.stringify(entry),
      })),
      ...Object.keys(rest).length > 0 ? [{
        kind: 'file' as const,
        name: path,
        value: JSON.stringify(rest),
      }] : [],
    ];
  };

  const globalFiles = (groups: GlobalTypes.GlobalPreviewGroups, kind: UniversalTypes.AdminPreviewKind): Record<string, string> => {
    const parts = Object.entries(groups.files ?? {}).flatMap(([path, value]): GlobalTypes.GlobalPreviewPart[] => {
      const [top, name, ...rest] = path.split('/');

      return match({ top, name })
        .with({ top: P.union('skills', 'plugins'), name: P.string }, ({ top: folder, name: entry }) => [{
          kind: folder === 'skills' ? 'skill' as const : 'plugin' as const,
          name: entry,
          value: `${rest.join('/')}=${value}`,
        }])
        .with({ top: 'AGENTS.md', name: P.nullish }, () => [{
          kind: 'instruction' as const,
          name: path,
          value,
        }])
        .with({ top: 'mcp.json', name: P.nullish }, () => globalMcpParts(path, value))
        .otherwise(() => [{
          kind: 'file' as const,
          name: path,
          value,
        }]);
    });

    const named = parts
      .filter((part) => part.kind === kind)
      .reduce((found, part) => found.set(part.name, [...found.get(part.name) ?? [], part.value]), new Map<string, string[]>());

    return globalSorted([...named].map(([name, list]) => [name, list.sort().join('\n')]));
  };

  const globalPair = (kind: UniversalTypes.AdminPreviewKind, group: keyof GlobalTypes.GlobalPreviewGroups): GlobalTypes.GlobalPreviewDiff => ({
    kind,
    person: mine[group] ?? {},
    template: wanted[group] ?? {},
  });

  const items = match(section)
    .with('models', () => {
      const keys = wanted.keys ?? {};
      const replaced = Object.entries(mine.oauth ?? {}).filter(([providerId]) => Object.hasOwn(keys, providerId));

      return globalDiff({
        kind: 'provider',
        person: { ...Object.fromEntries(replaced), ...mine.keys },
        template: keys,
      });
    })
    .with('chat', () => globalDiff(globalPair('chatSetting', 'settings')))
    .with('tools', () => globalDiff(globalPair('toolSetting', 'settings')))
    .with('secrets', () => {
      const own = mine.own ?? {};
      const global = wanted.secrets ?? {};
      const shared = Object.fromEntries(Object.entries(mine.secrets ?? {}).filter(([name]) => !Object.hasOwn(own, name)));

      return [
        ...globalDiff(globalPair('secretSetting', 'settings')),
        ...globalDiff({
          kind: 'secret',
          person: shared,
          template: global,
        }).filter(({ name }) => !Object.hasOwn(own, name)),
        ...Object.keys(own).filter((name) => Object.hasOwn(global, name)).map((name) => ({
          kind: 'secret' as const,
          name,
          change: 'replaced' as const,
        })),
      ];
    })
    .with('sources', () => [
      ...globalDiff(globalPair('sourceSetting', 'settings')),
      ...(['skill', 'instruction', 'plugin', 'mcpServer', 'file'] as const).flatMap((kind) => globalDiff({
        kind,
        person: globalFiles(mine, kind),
        template: globalFiles(wanted, kind),
      })),
    ])
    .exhaustive();

  return {
    section,
    marker: createHmac('sha256', deps.state.previewKey).update(JSON.stringify({
      section,
      mine,
      wanted,
    })).digest('base64url'),
    items,
  };
}
