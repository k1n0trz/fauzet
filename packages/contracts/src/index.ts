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
