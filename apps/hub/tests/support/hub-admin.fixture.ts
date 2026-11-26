import { makeHttpClient } from '@repo/client/client';
import { authPairCode, authRedeemResult } from '@repo/contracts/universal';
import { test } from 'vitest';
import { z } from 'zod';
import { hubFixtureCookie, hubFixtureStart } from './hub.fixture';
import type { HubFixture, HubFixtureConfig } from './hub.fixture';

interface HubAdminTestWrite {
  method?: string;
  body?: object;
  headers?: Record<string, string>;
  base?: string;
}

interface HubAdminTestFixtures {
  config: HubFixtureConfig;
  fixture: HubFixture;
  tokens: { alice: string; bob: string; root: string; eve: string };
}

async function hubAdminTestJson(response: Response) {
  const text = await response.text();

  return { status: response.status, json: text ? z.json().parse(JSON.parse(text)) : null };
}

export function hubAdminTestKit(config: HubFixtureConfig) {
  const { hub, publicOrigin, emails, admin } = config;
  const writeHeaders = { 'content-type': 'application/json', 'origin': publicOrigin };

  const get = (path: string, token?: string, headers: Record<string, string> = {}): Promise<Response> => (
    fetch(`${hub}${path}`, { headers: token ? { 'cookie': hubFixtureCookie(token), ...headers } : headers, redirect: 'manual' })
  );

  const read = async (token: string, path: string, base = hub) => hubAdminTestJson(await fetch(`${base}${path}`, { headers: { 'cookie': hubFixtureCookie(token) } }));

  const write = async (token: string, path: string, { method = 'POST', body, headers = {}, base = hub }: HubAdminTestWrite = {}) => hubAdminTestJson(await fetch(`${base}${path}`, {
    method,
    headers: { 'cookie': hubFixtureCookie(token), ...writeHeaders, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }));

  const person = async (token: string) => {
    const handoff = await get('/connect', token);
    const { pin } = authPairCode.parse(new URL(handoff.headers.get('location') ?? '', hub).searchParams.get('code'));

    const redeemed = await fetch(`${hub}/rpc/pairing/redeem`, {
      method: 'POST',
      headers: { 'cookie': hubFixtureCookie(token), ...writeHeaders, 'x-bots-protocol': '1' },
      body: JSON.stringify({ json: { pin, name: 'hub test device' } }),
    });

    const device = z.object({ json: authRedeemResult }).parse(await redeemed.json()).json;

    return makeHttpClient(() => ({
      url: `${hub}/rpc`,
      serverId: device.serverId,
      token: () => device.token,
      fetch: (url, init) => {
        const headers = new Headers(init.headers);

        headers.set('cookie', hubFixtureCookie(token));
        headers.set('origin', publicOrigin);

        return fetch(url, { ...init, headers });
      },
    }));
  };

  const it = test.extend<HubAdminTestFixtures>({
    config: [config, { scope: 'file' }],
    fixture: [async ({ config: started }, use) => {
      const fixture = await hubFixtureStart(started);

      await use(fixture);
      await fixture.stop();
    }, { scope: 'file' }],
    tokens: [async ({ fixture }, use) => {
      await use({
        alice: await fixture.mint({ email: emails.alice }),
        bob: await fixture.mint({ email: emails.bob }),
        root: await fixture.mint({ email: admin }),
        eve: await fixture.mint({ email: 'eve@team.example' }),
      });
    }, { scope: 'file' }],
  });

  return { it, get, read, write, person };
}
