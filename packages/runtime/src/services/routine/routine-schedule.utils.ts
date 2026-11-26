import { Errors } from '@repo/errors/universal';
import { CronExpressionParser } from 'cron-parser';
import { match, P } from 'ts-pattern';
import { ROUTINE } from './routine.constants';
import type { RoutineSchedule } from '@repo/contracts/universal';

export function routineScheduleNextRunAt(schedule: RoutineSchedule, after: number): number {
  return match(schedule)
    .with({ kind: 'once' }, ({ runAt }) => runAt)
    .with({ kind: 'interval' }, ({ minutes }) => after + minutes * 60_000)
    .with({ kind: 'cron' }, ({ expression, timezone }) => {
      try {
        match(expression.split(/\s+/).length === 5 && !/\bH\b/.test(expression))
          .with(true, () => undefined)
          .with(false, () => {
            throw new Errors.VALIDATION_ERROR({ fields: { schedule: { message: 'validation_routine_schedule' } } });
          })
          .exhaustive();
        new Intl.DateTimeFormat('en', { timeZone: timezone }).format(after);

        return CronExpressionParser.parse(expression, { currentDate: after, tz: timezone }).next().getTime();
      } catch {
        throw new Errors.VALIDATION_ERROR({ fields: { schedule: { message: 'validation_routine_schedule' } } });
      }
    })
    .exhaustive();
}

export function routineScheduleAssertFuture(schedule: RoutineSchedule, now: number) {
  match(schedule)
    .with({ kind: 'once', runAt: P.number.lt(now - ROUTINE.pastRunAtGraceMs) }, ({ runAt }) => {
      throw new Errors.VALIDATION_ERROR({
        fields: { schedule: { message: 'validation_routine_run_at' } },
        internal: `runAt ${new Date(runAt).toISOString()} is in the past (now ${new Date(now).toISOString()}); give runAt in epoch milliseconds`,
      });
    })
    .otherwise(() => undefined);
}
