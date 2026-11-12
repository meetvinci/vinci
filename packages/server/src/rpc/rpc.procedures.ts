import { implement } from '@orpc/server';
import { contract, SERVER_PROTOCOL } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { match, P } from 'ts-pattern';
import { rpcLimitOutput } from './rpc-limit.utils';
import { rpcLocalAuthorize } from './rpc-local.utils';
import type { RpcContext, RpcOwnerContext } from '../types/rpc.types';

export const rpcRouter = implement(contract).$context<RpcContext>();

export const baseRouter = rpcRouter.use(async ({ context, next, path }, input) => {
  rpcLocalAuthorize({
    isLocal: context.isLocal,
    path,
    input,
  });
  await context.limits.throttle({ kind: 'public', peer: context.peerAddress });
  await match(path.join('.'))
    .with('pairing.redeem', () => context.limits.throttle({ kind: 'redeem', peer: context.peerAddress }))
    .otherwise(() => undefined);
  const lease = context.limits.acquire({ kind: 'rpc' });

  try {
    await context.server.queries.validateConnection({
      protocolVersion: context.reqHeaders?.get(SERVER_PROTOCOL.versionHeader) ?? null,
      serverId: context.reqHeaders?.get(SERVER_PROTOCOL.serverIdHeader) ?? null,
    });

    return await next();
  } finally {
    lease.release();
  }
});

export const ownerRouter = baseRouter.use(async ({ context, next, signal }) => match(context.isLocal)
  .with(true, () => next<RpcOwnerContext>({ context: { device: null } }))
  .with(false, async () => {
    const authorization = context.reqHeaders?.get('authorization');
    const device = await context.auth.queries.authenticate({ authorization });
    await context.limits.throttle({ kind: 'device', deviceId: device.id });

    const result = await next<RpcOwnerContext>({ context: { device } });

    const output = await rpcLimitOutput({
      limits: context.limits,
      auth: context.auth,
      deviceId: device.id,
      authorization,
      output: result.output,
      signal,
    });

    return { ...result, output };
  })
  .exhaustive());

export const localRouter = ownerRouter.use(async ({ context, next }) => match(context.isLocal)
  .with(true, () => next())
  .with(false, () => {
    throw new Errors.FORBIDDEN({ internal: 'Served only on the owner socket' });
  })
  .exhaustive());

export const authedRouter = ownerRouter.use(async ({ context, next }) => next({
  context: {
    device: match(context.device)
      .with(P.nonNullable, (device) => device)
      .otherwise(() => {
        throw new Errors.UNAUTHORIZED();
      }),
  },
}));
