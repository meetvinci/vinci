import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { TEAM_PASSWORD, teamPasswordInput } from '@repo/contracts/universal';
import { isAppError } from '@repo/errors/universal';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/dialog';
import { Form, FormErrors } from '@repo/ui/forms/form';
import { FormInput } from '@repo/ui/forms/form-input';
import { PanelContent, PanelDescription, PanelRow, PanelTitle } from '@repo/ui/panel';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { match, P } from 'ts-pattern';
import { teamPasswordChange } from '@/services/team/team.client';

export function SettingsPassword() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PanelRow>
      <PanelContent>
        <PanelTitle>{m.settings_password()}</PanelTitle>
        <PanelDescription>{m.settings_password_description()}</PanelDescription>
      </PanelContent>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(true)}
      >
        {m.settings_password_change()}
      </Button>
      {isOpen ? <SettingsPasswordDialog onOpenChange={setIsOpen} /> : null}
    </PanelRow>
  );
}

interface SettingsPasswordDialogProps {
  onOpenChange: (open: boolean) => void
}

export function SettingsPasswordDialog({ onOpenChange }: SettingsPasswordDialogProps) {
  const form = useForm({
    resolver: standardSchemaResolver(teamPasswordInput),
    defaultValues: { current: '', password: '' },
  });

  const change = useMutation({
    mutationFn: teamPasswordChange,
    meta: { success: m.settings_password_changed() },
    onSuccess: () => onOpenChange(false),
  });

  const problem = match(change.error)
    .with(null, () => null)
    .with(P.when(isAppError), (error) => match(error)
      .with({ code: 'FORBIDDEN' }, () => m.settings_password_wrong())
      .with({ code: 'RATE_LIMITED', data: { retryAfter: P.number.select() } }, (seconds) => m.settings_password_too_many({ minutes: String(Math.max(1, Math.ceil(seconds / 60))) }))
      .otherwise(() => m.settings_password_failed()))
    .otherwise(() => m.settings_password_failed());

  return (
    <Dialog open onOpenChange={(open) => !change.isPending && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.settings_password_change()}</DialogTitle>
          <DialogDescription>{m.settings_password_description()}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((input) => change.mutate(input))}>
            <fieldset className="flex flex-col gap-4" disabled={change.isPending}>
              <FormInput
                autoComplete="current-password"
                label={m.settings_password_current()}
                name="current"
                type="password"
              />
              <FormInput
                autoComplete="new-password"
                context={{ minimum: String(TEAM_PASSWORD.min) }}
                hint={m.settings_password_new_hint({ minimum: String(TEAM_PASSWORD.min) })}
                label={m.settings_password_new()}
                name="password"
                type="password"
              />
            </fieldset>
            <FormErrors error={problem} />
            <DialogFooter>
              <Button
                disabled={change.isPending}
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {m.ui_cancel()}
              </Button>
              <ButtonLoading loading={change.isPending} type="submit">{m.settings_password_change()}</ButtonLoading>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
