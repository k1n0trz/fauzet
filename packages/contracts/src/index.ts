import { z } from "zod";

export const balanceBucketSchema = z.enum([
  "PENDING",
  "AVAILABLE",
  "PROMOTIONAL",
  "LOCKED",
  "ELIGIBLE",
  "RESERVED",
  "WITHDRAWN",
]);

export type BalanceBucket = z.infer<typeof balanceBucketSchema>;

export const moneySchema = z.object({
  asset: z.string().min(2).max(12),
  minorUnits: z.string().regex(/^-?\d+$/),
});

export const balanceSchema = moneySchema.extend({
  bucket: balanceBucketSchema,
});

export const claimRequestSchema = z.object({
  challengeId: z.string().uuid(),
});

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const faucetStateSchema = z.enum([
  "READY",
  "COOLDOWN",
  "DAILY_LIMIT",
  "DEVICE_LIMIT",
  "IP_LIMIT",
  "CAPTCHA_REQUIRED",
  "RISK_BLOCKED",
  "BUDGET_EXHAUSTED",
  "DISABLED",
]);

export const faucetStatusResponseSchema = z.object({
  faucet: z.object({
    state: faucetStateSchema,
    canClaim: z.boolean(),
    captchaRequired: z.boolean(),
    nextClaimAt: z.string().datetime().nullable(),
    claimsToday: z.number().int().nonnegative(),
    dailyClaimLimit: z.number().int().positive(),
    cooldownSeconds: z.number().int().positive(),
    streakDays: z.number().int().nonnegative(),
    bonusMultiplier: z.string().regex(/^\d+(?:\.\d+)?$/),
    reward: z.object({
      asset: z.literal("ZYXE"),
      minMinorUnits: z.string().regex(/^\d+$/),
      maxMinorUnits: z.string().regex(/^\d+$/),
      bucket: z.literal("AVAILABLE"),
    }),
    configVersion: z.number().int().positive(),
  }),
});

export const faucetChallengeResponseSchema = z.object({
  challenge: z.object({
    id: z.string().uuid(),
    expiresAt: z.string().datetime(),
  }),
});

export const faucetClaimResponseSchema = z.object({
  claim: z.object({
    id: z.string().uuid(),
    status: z.literal("POSTED"),
    reward: z.object({
      asset: z.literal("ZYXE"),
      minorUnits: z.string().regex(/^\d+$/),
      bucket: z.literal("AVAILABLE"),
    }),
    nextClaimAt: z.string().datetime(),
    transactionId: z.string().uuid(),
    configVersion: z.number().int().positive(),
    streakDays: z.number().int().positive(),
    bonusMultiplier: z.string().regex(/^\d+(?:\.\d+)?$/),
  }),
  replayed: z.boolean(),
});

export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(12)
    .max(128)
    .regex(/[a-z]/, "Password requires a lowercase letter")
    .regex(/[A-Z]/, "Password requires an uppercase letter")
    .regex(/[0-9]/, "Password requires a number"),
  displayName: z.string().trim().min(2).max(80),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  locale: z.enum(["es", "en"]).default("es"),
  acceptedTerms: z.literal(true),
  isAdult: z.literal(true),
});

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const emailRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export const tokenRequestSchema = z.object({
  token: z.string().min(32).max(256),
});
export const passwordResetRequestSchema = tokenRequestSchema.extend({
  password: registerRequestSchema.shape.password,
});

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  locale: z.enum(["es", "en"]),
  countryCode: z.string().nullable(),
  status: z.string(),
  roles: z.array(z.string()),
});

export const authResponseSchema = z.object({
  user: publicUserSchema,
  sessionExpiresAt: z.string().datetime(),
});

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export type Money = z.infer<typeof moneySchema>;
export type Balance = z.infer<typeof balanceSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type FaucetStatusResponse = z.infer<typeof faucetStatusResponseSchema>;
export type FaucetChallengeResponse = z.infer<
  typeof faucetChallengeResponseSchema
>;
export type FaucetClaimResponse = z.infer<typeof faucetClaimResponseSchema>;
