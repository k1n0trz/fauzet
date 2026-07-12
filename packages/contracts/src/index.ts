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

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export type Money = z.infer<typeof moneySchema>;
export type Balance = z.infer<typeof balanceSchema>;
