import { z } from 'zod';

const userEntry = z.strictObject({
  id: z.string().regex(/^[a-z\d][a-z\d-]{0,62}$/u),
  daemonUrl: z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin),
  socketPath: z.string().startsWith('/'),
});

export const userFile = z.strictObject({ users: z.record(z.email(), userEntry) }).transform(({ users }, context) => {
  const entries = Object.entries(users).map(([email, entry]) => ({ ...entry, email: email.toLowerCase() }));
  const fields = ['email', 'id', 'daemonUrl', 'socketPath'] as const;

  if (fields.some((field) => new Set(entries.map((entry) => entry[field])).size !== entries.length)) {
    context.addIssue({ code: 'custom', message: 'Each email, user id, daemonUrl and socketPath must appear once' });
    return z.NEVER;
  }

  return new Map(entries.map((user) => [user.email, user]));
});

export type User = z.infer<typeof userEntry> & { email: string };

export interface UserServiceParams {
  directory: string;
}

export interface UserServiceDeps {
  path: string;
  state: UserState;
}

export interface UserState {
  users: Map<string, User>;
  mtimeMs: number | null | undefined;
  checkedAt: number;
}

export interface UserFindParams {
  email: string;
}

export interface UserService {
  queries: {
    find: (params: UserFindParams) => Promise<User | null>;
  };
}
