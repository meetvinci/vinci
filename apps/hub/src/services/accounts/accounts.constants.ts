export const ACCOUNTS = {
  timeoutMs: 10_000,
  usersPath: '/internal/users/',
  sessionPath: '/internal/session',
  passwordPath: '/internal/session/password',
  sessionCookie: 'vinci_session',
  sessionToken: /^\d{1,20}\|[A-Za-z0-9]{1,200}$/u,
  sessionCacheMs: 5000,
  sessionCacheMax: 1000,
};
