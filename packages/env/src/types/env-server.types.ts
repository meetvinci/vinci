import { z } from 'zod';

export const envServerSchema = {
  APP_NAME: z.string().trim().min(1).default('Vinci'),
  DATA_DIR: z.string().trim().min(1).default('~/.config/vinci/'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DAEMON_HOST: z.string().trim().min(1).default('0.0.0.0'),
  DAEMON_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DAEMON_ALLOWED_ORIGINS: z.string().trim().default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)
      .map((origin) => URL.parse(origin)?.origin ?? origin)),
  DAEMON_PUBLIC_URLS: z.string().trim().default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url({ protocol: /^https?$/ }).refine((url) => (URL.parse(url)?.pathname ?? '/') === '/', 'Use a bare origin without a path')))
    .transform((origins) => origins.map((origin) => new URL(origin).origin)),
  DAEMON_SANDBOX_DIR: z.string().trim().min(1).optional(),
  VINCI_INTERNAL_ALLOW: z.string().trim().default('')
    .transform((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d):(?:6553[0-5]|655[0-2]\d|65[0-4]\d\d|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})$/u))),

  WEB_HOST: z.string().trim().min(1).default('127.0.0.1'),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(47190),
  WEB_PUBLIC_URL: z.url({ protocol: /^https?$/ }).default('http://127.0.0.1:47190'),
  WEB_HUB_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin).optional(),

  MOBILE_SCHEME: z.string().trim().min(1).default('vinci'),

  HUB_HOST: z.string().trim().min(1).default('127.0.0.1'),
  HUB_PORT: z.coerce.number().int().min(1).max(65535).default(47192),
  HUB_DATA_DIR: z.string().trim().min(1).default('~/.config/vinci-hub/'),
  HUB_WEB_URL: z.url({ protocol: /^https?$/ }).default('http://127.0.0.1:47190'),
  HUB_PUBLIC_URL: z.url({ protocol: /^https?$/ }).transform((value) => new URL(value)).optional(),
  HUB_VERSION: z.string().trim().min(1).optional(),
  VINCI_VERSION: z.string().trim().min(1).default('dev'),
  HUB_ADMIN_EMAILS: z.string().trim().default('')
    .transform((value) => value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.email())),
  PROVISIONER_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin).optional(),
  PROVISIONER_TOKEN: z.string().trim().min(16).optional(),
  HUB_ACCOUNTS_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin).optional(),
  HUB_ACCOUNTS_TOKEN: z.string().trim().min(16).optional(),
};
