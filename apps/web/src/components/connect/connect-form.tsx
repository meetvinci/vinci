import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { authPairEntry, connectionPairForm } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { Button } from '@repo/ui/button';
import { ButtonLoading } from '@repo/ui/button-loading';
import { Form } from '@repo/ui/forms/form';
import { FormInput } from '@repo/ui/forms/form-input';
import { FormOTP } from '@repo/ui/forms/form-otp';
import { toasty } from '@repo/ui/sonner';
import { useLoaderData, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { match, P } from 'ts-pattern';
import { connectionPair, connectionRead } from '@/services/connection/connection.client';
import { connectionCodeFromLink, connectionDeviceName } from '@/services/connection/connection.utils';
import IconSpinner from '~icons/svg-spinners/90-ring-with-bg';
import type { AuthPairEntry, ConnectionPairForm } from '@repo/contracts/universal';

export function ConnectForm() {
  const router = useRouter();
  const search = useSearch({ from: '/connect' });
  const team = useLoaderData({ from: '/connect' });
  const navigate = useNavigate({ from: '/connect' });

  const form = useForm({
    resolver: standardSchemaResolver(connectionPairForm),
    defaultValues: {
      code: '',
      name: m.connect_device_name_default(),
    },
  });

  const [isTeamFailed, setIsTeamFailed] = useState(() => team !== null && !authPairEntry.safeParse(search.code ?? '').success);
  const linkedTarget = useRef<AuthPairEntry['target']>(null);
  const isConfirmPending = useRef(false);
  const isRedeeming = useRef(false);

  const readCode = useEffectEvent(() => {
    const code = search.code ?? new URLSearchParams(location.hash.slice(1)).get('code');
    const entry = authPairEntry.safeParse(code ?? '');

    const isAutoSubmit = document.documentElement.dataset.shell === 'desktop'
      || (entry.success && (team !== null || entry.data.target?.addresses.every((address) => address.url === location.origin) === true));

    isConfirmPending.current = entry.success && !isAutoSubmit;

    match({ code, entry })
      .with({ entry: { success: true } }, ({ entry: { data } }) => {
        linkedTarget.current = data.target;
        form.setValue('code', data.pin, { shouldValidate: true });
      })
      .with({ code: P.string }, () => form.setError('code', { message: m.connect_code_invalid() }))
      .otherwise(() => undefined);

    if (search.code) {
      void navigate({ search: { reason: search.reason }, replace: true });
    }

    if (code && isAutoSubmit) {
      void form.handleSubmit(handleSubmit)();
    }
  });

  useEffect(() => {
    form.setValue('name', connectionDeviceName());
  }, [form]);

  useEffect(() => {
    readCode();
    window.addEventListener('hashchange', readCode);

    return () => window.removeEventListener('hashchange', readCode);
  }, []);

  useEffect(() => {
    void connectionRead()
      .then((connection) => connection ? router.invalidate() : undefined)
      .catch(() => toasty(m.connect_failed(), '🔴', { id: 'connect' }));
  }, [form, router]);

  function pastePin(text: string): string {
    const entry = authPairEntry.safeParse(connectionCodeFromLink(text.trim()));

    return match(entry)
      .with({ success: true }, ({ data }) => {
        linkedTarget.current = data.target ?? linkedTarget.current;
        queueMicrotask(() => form.setValue('code', data.pin, { shouldValidate: true }));

        return data.pin;
      })
      .otherwise(() => text.replaceAll(/\D/gu, ''));
  }

  async function handleSubmit({ code, name }: ConnectionPairForm) {
    const entry = authPairEntry.safeParse(code);

    await match(entry)
      .with({ success: false }, () => {
        form.setError('code', { message: m.connect_code_invalid() });
      })
      .with({ success: true }, async ({ data }) => {
        if (isRedeeming.current) {
          return;
        }

        isRedeeming.current = true;

        try {
          await connectionPair({ entry: { pin: data.pin, target: data.target ?? linkedTarget.current }, name });
          location.assign('/rooms');
        } catch {
          isRedeeming.current = false;
          match(team)
            .with(null, () => toasty(m.connect_failed(), '🔴', { id: 'connect' }))
            .otherwise(() => setIsTeamFailed(true));
        }
      })
      .exhaustive();
  }

  if (team !== null) {
    return isTeamFailed
      ? (
        <div className="mx-auto grid w-full max-w-68 gap-4 text-center">
          <p className="text-sm text-muted-foreground">{m.connect_team_failed()}</p>
          <Button className="w-full" onClick={() => location.assign('/connect')}>{m.connect_team_retry()}</Button>
        </div>
      )
      : <IconSpinner aria-hidden className="mx-auto size-5 animate-spin text-muted-foreground" />;
  }

  return (
    <Form {...form}>
      <form className="mx-auto grid w-full max-w-68 gap-5" onSubmit={form.handleSubmit(handleSubmit)}>
        <fieldset className="contents" disabled={form.formState.isSubmitting}>
          <FormOTP
            required
            autoComplete="one-time-code"
            label={m.connect_code()}
            name="code"
            pasteTransformer={pastePin}
            pattern={REGEXP_ONLY_DIGITS}
            splitEvery={3}
            onComplete={() => {
              if (isConfirmPending.current) {
                isConfirmPending.current = false;
                return;
              }

              queueMicrotask(() => void form.handleSubmit(handleSubmit)());
            }}
          />
          <FormInput
            required
            label={m.connect_device_name()}
            name="name"
          />
          <ButtonLoading
            className="w-full"
            disabled={!form.formState.isValid}
            loading={form.formState.isSubmitting}
            type="submit"
          >
            {m.connect_submit()}
          </ButtonLoading>
        </fieldset>
      </form>
    </Form>
  );
}
