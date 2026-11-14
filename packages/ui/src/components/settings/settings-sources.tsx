import { useSettingsSources } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import IconTriangleAlert from '~icons/lucide/triangle-alert';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { PanelDescription, PanelRow } from '../panel';
import { SettingsGroup } from './settings-group';
import { SettingsPathList } from './settings-path-list';
import type { SkillSkipReason, SkillStatus } from '@repo/contracts/universal';

const SETTINGS_SOURCES_SKIPPED = {
  frontmatter: m.settings_sources_skipped_frontmatter,
  description: m.settings_sources_skipped_description,
  duplicate: m.settings_sources_skipped_duplicate,
  other: m.settings_sources_skipped_other,
} satisfies Record<SkillSkipReason, () => string>;

export function SettingsSources() {
  const sources = useSettingsSources();

  const lists = [
    { key: 'skills', source: sources.skills, title: m.settings_sources_skills(), placeholder: m.settings_sources_skills_placeholder() },
    { key: 'instructions', source: sources.instructions, title: m.settings_sources_instructions(), placeholder: m.settings_sources_instructions_placeholder() },
    { key: 'plugins', source: sources.plugins, title: m.settings_sources_plugins(), placeholder: m.settings_sources_plugins_placeholder() },
    { key: 'mcp', source: sources.mcp, title: m.settings_sources_mcp(), placeholder: m.settings_sources_mcp_placeholder() },
  ];

  return (
    <div className="flex flex-col gap-4">
      {lists.map((list) => (
        <SettingsGroup key={list.key} title={list.title}>
          <PanelRow className="items-start">
            <div className="min-w-0 flex-1">
              <SettingsPathList
                isFailed={list.source.isFailed}
                isPending={list.source.isPending}
                paths={list.source.paths}
                placeholder={list.placeholder}
                title={list.title}
                onChange={list.source.save}
              />
            </div>
          </PanelRow>
          {list.key === 'mcp' ? (
            <PanelRow className="pt-0">
              <PanelDescription>{m.settings_sources_mcp_env()}</PanelDescription>
            </PanelRow>
          ) : null}
          {list.key === 'skills' && sources.skills.skipped.length > 0 ? (
            <PanelRow className="pt-0">
              <SettingsSourcesSkipped skipped={sources.skills.skipped} />
            </PanelRow>
          ) : null}
        </SettingsGroup>
      ))}
    </div>
  );
}

interface SettingsSourcesSkippedProps {
  skipped: SkillStatus['skipped']
}

function SettingsSourcesSkipped({ skipped }: SettingsSourcesSkippedProps) {
  return (
    <Alert>
      <IconTriangleAlert />
      <AlertTitle>{m.settings_sources_skipped()}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p className="text-muted-foreground">{m.settings_sources_skipped_hint()}</p>
        <ul className="flex flex-col gap-3">
          {skipped.map((skill) => (
            <li className="flex min-w-0 flex-col gap-0.5" key={skill.path}>
              <span className="font-mono text-xs break-all">{skill.path}</span>
              <span>{SETTINGS_SOURCES_SKIPPED[skill.reason]()}</span>
              {skill.reason === 'frontmatter' ? <span className="font-mono text-xs break-all text-muted-foreground">{skill.message}</span> : null}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
