import { z } from 'zod';

export const limitWindow = z.object({
  maxRequests: z.number().int().min(1).max(1_000_000),
  windowMs: z.number().int().min(100).max(86_400_000),
});

export const limitSettings = z.object({
  public: limitWindow,
  redeem: limitWindow,
  device: limitWindow,
  rpcInFlight: z.number().int().min(1).max(10_000),
  watchInFlight: z.number().int().min(1).max(10_000),
});

export const LIMIT_BOUNDS = {
  requests: { min: 60, max: 100_000 },
  redeem: { min: 1, max: 100 },
  windowMs: 60_000,
  inFlight: { min: 4, max: 1000 },
} as const;

const limitWindowMs = z.literal(LIMIT_BOUNDS.windowMs);
const limitInFlight = z.number().int().min(LIMIT_BOUNDS.inFlight.min).max(LIMIT_BOUNDS.inFlight.max);

const limitRequestsInput = z.object({
  maxRequests: z.number().int().min(LIMIT_BOUNDS.requests.min).max(LIMIT_BOUNDS.requests.max),
  windowMs: limitWindowMs,
}).partial();

const limitRedeemInput = z.object({
  maxRequests: z.number().int().min(LIMIT_BOUNDS.redeem.min).max(LIMIT_BOUNDS.redeem.max),
  windowMs: limitWindowMs,
}).partial();

export const limitConfigure = z.object({
  public: limitRequestsInput,
  redeem: limitRedeemInput,
  device: limitRequestsInput,
  rpcInFlight: limitInFlight,
  watchInFlight: limitInFlight,
}).partial();

export type LimitWindow = z.infer<typeof limitWindow>;
export type LimitSettings = z.infer<typeof limitSettings>;
export type LimitConfigureInput = z.infer<typeof limitConfigure>;
