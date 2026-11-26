import { defineDoc } from '@earendil-works/pi-durable';
import type { RoutineDocument } from '../../types/routine.types';

export const ROUTINE = {
  task: 'bots.routine',
  pastRunAtGraceMs: 60_000,
  secondsRunAtBelow: 100_000_000_000,
} as const;

export const routineDocument = defineDoc<RoutineDocument>({
  kind: 'bots.routines',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  initial: () => ({ routines: {} }),
  checkpointWhen: () => false,
});
