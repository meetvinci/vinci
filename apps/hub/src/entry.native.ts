#!/usr/bin/env bun
import { env } from '@repo/env/server';
import { isAppError } from '@repo/errors/universal';
import { initNativeLogger, log } from '@repo/logger/server';
import { match } from 'ts-pattern';
import { coreNativeRun } from './core/core.native';

initNativeLogger(env.LOG_LEVEL);

try {
  await coreNativeRun();
} catch (error) {
  process.exitCode = 1;
  log.error({
    tag: 'hub',
    message: match(error).when(isAppError, (failure) => failure.internal).otherwise(() => 'Hub failed'),
    error,
  });
}
