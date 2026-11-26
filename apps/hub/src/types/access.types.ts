import { z } from 'zod';

const accessSegment = z.string().transform((encoded, context) => {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    context.addIssue({ code: 'custom', message: 'access_segment_invalid' });
    return z.NEVER;
  }
});

export const accessHeader = accessSegment.pipe(z.object({
  alg: z.literal('RS256'),
  kid: z.string().min(1),
}));

export const accessClaims = accessSegment.pipe(z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  nbf: z.number().optional(),
  email: z.email().optional(),
}));

export const accessKeys = z.object({
  keys: z.array(z.looseObject({
    kty: z.string(),
    kid: z.string().min(1),
    n: z.string().optional(),
    e: z.string().optional(),
  })),
});

export interface AccessServiceParams {
  teamDomain: string;
  audience: string;
}

export interface AccessServiceDeps extends AccessServiceParams {
  state: AccessState;
}

export interface AccessState {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
  attemptedAt: number;
  loading: Promise<void> | null;
}

export interface AccessVerifyParams {
  token: string;
}

export interface AccessIdentity {
  kind: 'access' | 'session';
  email: string;
  token: string;
  expiresAt: number;
}
