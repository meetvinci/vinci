import { useRpc } from '@repo/client/react';
import { LIMIT_BOUNDS } from '@repo/contracts/universal';
import { m } from '@repo/i18n/client';
import { ButtonLoading } from '@repo/ui/button-loading';
import { FormErrors } from '@repo/ui/forms/form';
import { Input } from '@repo/ui/input';
import { PanelContent, PanelDescription, PanelFooter, PanelRow, PanelTitle } from '@repo/ui/panel';
import { SettingsGroup } from '@repo/ui/settings/settings-group';
import { Skeleton } from '@repo/ui/skeleton';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LayoutUnsaved } from '@/components/layout/layout-unsaved';
import { adminProblem } from '@/services/admin/admin.utils';
import type { AdminLimitValues } from '@/types/admin.types';
import type { LimitSettings } from '@repo/contracts/universal';

export function AdminUserLimits() {
  const { rpc } = useRpc();
  const limits = useQuery(rpc.limits.settings.queryOptions());

  return (
    <SettingsGroup isTitleVisible title={m.admin_limits_title()}>
      {limits.data
        ? <AdminUserLimitsForm key={JSON.stringify(limits.data)} settings={limits.data} />
        : (
          <PanelRow>
            {limits.isError ? <PanelDescription>{m.admin_limits_unreachable()}</PanelDescription> : <Skeleton className="h-40 w-full" />}
          </PanelRow>
        )}
    </SettingsGroup>
  );
}

interface AdminUserLimitsFormProps {
  settings: LimitSettings
}

function AdminUserLimitsForm({ settings }: AdminUserLimitsFormProps) {
  const { rpc } = useRpc();

  const saved: AdminLimitValues = {
    device: settings.device.maxRequests,
    public: settings.public.maxRequests,
    redeem: settings.redeem.maxRequests,
    rpcInFlight: settings.rpcInFlight,
    watchInFlight: settings.watchInFlight,
  };

  const [values, setValues] = useState(saved);

  const save = useMutation(rpc.limits.configure.mutationOptions({
    meta: {
      success: m.admin_limits_saved(),
      invalidates: [rpc.limits.settings.key()],
    },
  }));

  const fields = [
    { name: 'device', title: m.admin_limits_device(), hint: m.admin_limits_device_hint(), bounds: LIMIT_BOUNDS.requests },
    { name: 'public', title: m.admin_limits_public(), hint: m.admin_limits_public_hint(), bounds: LIMIT_BOUNDS.requests },
    { name: 'redeem', title: m.admin_limits_redeem(), hint: m.admin_limits_redeem_hint(), bounds: LIMIT_BOUNDS.redeem },
    { name: 'rpcInFlight', title: m.admin_limits_rpc(), hint: m.admin_limits_rpc_hint(), bounds: LIMIT_BOUNDS.inFlight },
    { name: 'watchInFlight', title: m.admin_limits_watch(), hint: m.admin_limits_watch_hint(), bounds: LIMIT_BOUNDS.inFlight },
  ] as const;

  const minute = (maxRequests: number) => ({ maxRequests, windowMs: LIMIT_BOUNDS.windowMs });

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          device: minute(values.device),
          public: minute(values.public),
          redeem: minute(values.redeem),
          rpcInFlight: values.rpcInFlight,
          watchInFlight: values.watchInFlight,
        });
      }}
    >
      <LayoutUnsaved isDirty={fields.some(({ name }) => values[name] !== saved[name])} />
      <PanelRow>
        <PanelDescription>{m.admin_limits_hint()}</PanelDescription>
      </PanelRow>
      {fields.map(({ name, title, hint, bounds }) => (
        <PanelRow key={name}>
          <PanelContent>
            <PanelTitle asChild><label htmlFor={`admin-limit-${name}`}>{title}</label></PanelTitle>
            <PanelDescription>{hint} {m.admin_limits_range({ min: bounds.min, max: bounds.max })}</PanelDescription>
          </PanelContent>
          <Input
            required
            className="w-28 shrink-0"
            disabled={save.isPending}
            id={`admin-limit-${name}`}
            max={bounds.max}
            min={bounds.min}
            step={1}
            type="number"
            value={Number.isFinite(values[name]) ? values[name] : ''}
            onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.valueAsNumber }))}
          />
        </PanelRow>
      ))}
      <PanelFooter>
        <FormErrors error={save.isError ? adminProblem({ error: save.error, failed: m.admin_limits_failed() }) : null} />
        <ButtonLoading
          loading={save.isPending}
          size="sm"
          type="submit"
        >
          {m.admin_limits_save()}
        </ButtonLoading>
      </PanelFooter>
    </form>
  );
}
