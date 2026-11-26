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
        internal: routineScheduleRunAtHint(runAt, now),
      });
    })
    .otherwise(() => undefined);
}

function routineScheduleRunAtHint(runAt: number, now: number) {
  const past = `runAt ${runAt} is ${new Date(runAt).toISOString()}, in the past. Now is ${now} (${new Date(now).toISOString()}): runAt is epoch milliseconds.`;

  return match(runAt)
    .with(P.number.lt(ROUTINE.secondsRunAtBelow), () => `${past} It looks like seconds: ${runAt * 1000} would be ${new Date(runAt * 1000).toISOString()}.`)
    .otherwise(() => past);
}
