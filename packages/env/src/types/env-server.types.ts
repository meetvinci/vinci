import { z } from 'zod';

export const envServerSchema = {
  APP_NAME: z.string().trim().min(1).default('Orbs'),
  DATA_DIR: z.string().trim().min(1).default('~/.config/orbs/'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DAEMON_HOST: z.string().trim().min(1).default('0.0.0.0'),
  DAEMON_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DAEMON_ALLOWED_ORIGINS: z.string().trim().default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)
      .map((origin) => URL.parse(origin)?.origin ?? origin)),
  DAEMON_PUBLIC_URLS: z.string().trim().default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url({ protocol: /^https?$/ }).refine((url) => new URL(url).pathname === '/', 'Use a bare origin without a path')))
    .transform((origins) => origins.map((origin) => new URL(origin).origin)),
  DAEMON_TEAM: z.stringbool().default(false),

  WEB_HOST: z.string().trim().min(1).default('127.0.0.1'),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(47190),
  WEB_PUBLIC_URL: z.url({ protocol: /^https?$/ }).default('http://127.0.0.1:47190'),
  WEB_HUB_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin).optional(),

  MOBILE_SCHEME: z.string().trim().min(1).default('orbs'),

  HUB_HOST: z.string().trim().min(1).default('127.0.0.1'),
  HUB_PORT: z.coerce.number().int().min(1).max(65535).default(47192),
  HUB_DATA_DIR: z.string().trim().min(1).default('~/.config/orbs-hub/'),
  HUB_WEB_URL: z.url({ protocol: /^https?$/ }).default('http://127.0.0.1:47190'),
  HUB_PUBLIC_URL: z.url({ protocol: /^https?$/ }).transform((value) => new URL(value)).optional(),
  ACCESS_TEAM_DOMAIN: z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin).optional(),
  ACCESS_AUD: z.string().trim().min(1).optional(),
  HUB_ADMIN_EMAILS: z.string().trim().default('')
    .transform((value) => value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.email())),
  PROVISIONER_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin).optional(),
  PROVISIONER_TOKEN: z.string().trim().min(16).optional(),
};
