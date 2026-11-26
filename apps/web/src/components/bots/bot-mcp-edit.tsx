import { useBotMcpFile } from '@repo/client/react';
import { m } from '@repo/i18n/client';
import { ButtonLoading } from '@repo/ui/button-loading';
import { FormErrors, FormHint } from '@repo/ui/forms/form';
import { Label } from '@repo/ui/label';
import { SettingsSubview } from '@repo/ui/settings/settings-subview';
import { Skeleton } from '@repo/ui/skeleton';
import { Textarea } from '@repo/ui/textarea';
import { useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { match, P } from 'ts-pattern';
import { LayoutUnsaved } from '@/components/layout/layout-unsaved';
import { useSectionScope } from '@/hooks/use-section-scope';
import type { Bot } from '@repo/contracts/universal';

interface BotMcpEditProps {
  bot: Bot
}

export function BotMcpEdit({ bot }: BotMcpEditProps) {
  const navigate = useNavigate();
  const scope = useSectionScope();

  const onBack = () => void navigate(scope.bots.section(bot.id, 'mcp'));

  const file = useBotMcpFile({ botId: bot.id, onDone: () => void navigate({ ...scope.bots.section(bot.id, 'mcp'), ignoreBlocker: true }) });

  return (
    <SettingsSubview
      backLabel={m.bots_mcp()}
      description={m.bots_mcp_edit_description({ bot: bot.name })}
      isBackDisabled={file.isPending}
      title={m.bots_mcp_edit_title()}
      onBack={onBack}
    >
      {match(file)
        .with({ text: P.string }, ({ text }) => <BotMcpEditForm file={file} text={text} />)
        .with({ isLoadFailed: true }, () => <FormErrors error={m.bots_mcp_edit_load_failed()} />)
        .otherwise(() => <Skeleton className="h-64 w-full" />)}
    </SettingsSubview>
  );
}

interface BotMcpEditFormProps {
  file: ReturnType<typeof useBotMcpFile>
  text: string
}

function BotMcpEditForm({ file, text }: BotMcpEditFormProps) {
  const id = useId();
  const [draft, setDraft] = useState(text);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        file.save(draft);
      }}
    >
      <LayoutUnsaved isDirty={draft !== text} />
      <fieldset className="contents" disabled={file.isPending}>
        <Label htmlFor={id}>{m.bots_mcp_edit_label()}</Label>
        <Textarea
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="min-h-64"
          id={id}
          maxLength={262144}
          spellCheck={false}
          value={draft}
          variant="code"
          onChange={(event) => {
            setDraft(event.target.value);
            file.clear();
          }}
        />
        <FormHint hint={m.bots_mcp_edit_hint()} />
        <FormErrors error={file.problem} />
        <ButtonLoading
          className="self-end"
          loading={file.isPending}
          type="submit"
        >
          {m.bots_mcp_edit_save()}
        </ButtonLoading>
      </fieldset>
    </form>
  );
}
