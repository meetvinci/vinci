import { RUNTIME_PDF } from './runtime-pdf.constants';
import type { RuntimePdfRun } from '../../types/runtime.types';
import type { Context } from '@earendil-works/chord/context';
import type { ToolExecutionApi } from '@earendil-works/pi-durable';
import type { ExecutionEnv } from '@earendil-works/pi-durable/env';
import type { createReadTool, ReadToolInput } from '@earendil-works/pi-durable/tools';

export function runtimePdfReadTool(read: ReturnType<typeof createReadTool>): ReturnType<typeof createReadTool> {
  return {
    ...read,
    description: `${read.description}${RUNTIME_PDF.description}`,
    execute: (args, api, context) => (RUNTIME_PDF.extension.test(args.path) ? runtimePdfRead(read, args, api, context) : read.execute(args, api, context)),
  };
}

async function runtimePdfRead(read: ReturnType<typeof createReadTool>, args: ReadToolInput, api: ToolExecutionApi, context: Context) {
  const env = api.env;
  const path = env && await env.absolutePath(args.path, context);
  const file = env && path?.ok ? await env.fileInfo(path.value, context) : undefined;

  if (!env || !path?.ok || !file?.ok) {
    return read.execute(args, api, context);
  }

  const info = await runtimePdfRun(env, ['pdfinfo', path.value], context);

  if (info.isMissing || info.exitCode !== 0) {
    return runtimePdfError(info);
  }

  const pages = /^Pages:\s*(\d+)/mu.exec(info.output)?.[1] ?? '?';
  const text = await env.createTempFile({ prefix: 'pdf-', suffix: '.txt' }, context);

  if (!text.ok) {
    throw text.error;
  }

  try {
    const extracted = await runtimePdfRun(env, ['pdftotext', '-enc', 'UTF-8', path.value, text.value], context);

    if (extracted.isMissing || extracted.exitCode !== 0) {
      return runtimePdfError(extracted);
    }

    const hasText = await runtimePdfRun(env, ['grep', '-q', '[^[:space:]]', text.value], context);

    if (hasText.exitCode === 1) {
      return { output: [], isError: true, diagnostics: [{ severity: 'error' as const, code: 'pdf_no_text', message: RUNTIME_PDF.scanned(pages, args.path) }] };
    }

    const result = await read.execute({ ...args, path: text.value }, api, context);

    return { ...result, diagnostics: [{ severity: 'info' as const, code: 'pdf', message: RUNTIME_PDF.read(pages) }, ...(result.diagnostics ?? [])] };
  } finally {
    await env.remove(text.value, { force: true }, context);
  }
}

async function runtimePdfRun(env: ExecutionEnv, command: string[], context: Context): Promise<RuntimePdfRun> {
  let output = '';

  const result = await env.exec(command, {
    timeout: RUNTIME_PDF.timeoutSeconds,
    onOutput: (chunk) => {
      output = `${output}${chunk}`.slice(0, RUNTIME_PDF.maxOutputBytes);
    },
  }, context);

  if (!result.ok && result.error.code !== 'spawn_error' && result.error.code !== 'timeout') {
    throw result.error;
  }

  return {
    isMissing: result.ok ? result.value.exitCode === RUNTIME_PDF.missingExitCode : result.error.code === 'spawn_error',
    isTimedOut: !result.ok && result.error.code === 'timeout',
    exitCode: result.ok ? result.value.exitCode : undefined,
    output,
  };
}

function runtimePdfError(run: RuntimePdfRun) {
  return { output: [], isError: true, diagnostics: [{ severity: 'error' as const, code: 'pdf_unreadable', message: runtimePdfProblem(run) }] };
}

function runtimePdfProblem({ isMissing, isTimedOut, exitCode, output }: RuntimePdfRun) {
  if (isMissing) {
    return RUNTIME_PDF.missing;
  }

  if (isTimedOut) {
    return RUNTIME_PDF.timedOut(RUNTIME_PDF.timeoutSeconds);
  }

  if (/password/iu.test(output)) {
    return RUNTIME_PDF.encrypted;
  }

  return RUNTIME_PDF.damaged(output.trim() === '' ? `exit code ${exitCode}` : output.trim().split('\n').at(-1) ?? '');
}
