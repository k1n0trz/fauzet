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

export const gameSlugSchema = z.enum(["tap-miner", "memory-drops"]);
export const gameEventTypeSchema = z.enum(["TAP", "TAP_BATCH", "FLIP"]);
export const gameSessionStatusSchema = z.enum([
  "ACTIVE",
  "POSTED",
  "HELD",
  "REJECTED",
  "EXPIRED",
  "ABORTED",
]);

export const gameEventRequestSchema = z
  .object({
    sessionToken: z.string().min(80).max(256),
    sequence: z.number().int().positive(),
    nonce: z.string().uuid(),
    eventId: z.string().uuid(),
    type: gameEventTypeSchema,
    atMs: z.number().int().nonnegative().max(120_000),
    payload: z.record(z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    if (value.type === "FLIP") {
      const cardIndex = value.payload.cardIndex;
      if (!Number.isInteger(cardIndex) || Number(cardIndex) < 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payload", "cardIndex"],
          message: "FLIP requires a non-negative integer cardIndex",
        });
      }
    }
    if (value.type === "TAP_BATCH") {
      const offsets = value.payload.tapOffsetsMs;
      if (
        !Array.isArray(offsets) ||
        offsets.length < 1 ||
        offsets.length > 25 ||
        offsets.some((offset) => !Number.isInteger(offset) || offset < 0)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payload", "tapOffsetsMs"],
          message: "TAP_BATCH requires 1-25 integer tapOffsetsMs",
        });
      }
    }
  });

export const gameCompleteRequestSchema = z.object({
  sessionToken: z.string().min(80).max(256),
});

export const gameCatalogResponseSchema = z.object({
  games: z.array(
    z.object({
      slug: gameSlugSchema,
      name: z.string(),
      category: z.enum(["quick", "skill"]),
      difficulty: z.enum(["EASY", "MEDIUM"]),
      enabled: z.boolean(),
      lockedReason: z.string().nullable(),
      energyCost: z.number().int().nonnegative(),
      durationSeconds: z.number().int().positive(),
      reward: z.object({
        asset: z.literal("ZYXE"),
        minMinorUnits: z.string().regex(/^\d+$/),
        maxMinorUnits: z.string().regex(/^\d+$/),
        bucket: z.literal("AVAILABLE"),
      }),
      dailyRemaining: z.number().int().nonnegative(),
      bestScore: z.number().int().nonnegative().nullable(),
    }),
  ),
  energy: z.object({
    current: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    regenIntervalSeconds: z.number().int().positive(),
    nextUnitAt: z.string().datetime().nullable(),
  }),
  configVersion: z.number().int().positive(),
});

export const gameEnergySchema = gameCatalogResponseSchema.shape.energy;
export const gameSessionViewSchema = z.object({
  id: z.string().uuid(),
  game: gameSlugSchema,
  status: gameSessionStatusSchema,
  token: z.string().min(80).max(256),
  nonce: z.string().uuid(),
  startedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  nextSequence: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  reasonCode: z.string().nullable(),
  reward: z
    .object({
      asset: z.literal("ZYXE"),
      minorUnits: z.string().regex(/^\d+$/),
      bucket: z.literal("AVAILABLE"),
    })
    .nullable(),
  transactionId: z.string().uuid().nullable(),
  configVersion: z.number().int().positive(),
  serverNow: z.string().datetime(),
  serverElapsedMs: z.number().int().nonnegative(),
  remainingMs: z.number().int().nonnegative(),
  rules: z.object({
    durationSeconds: z.number().int().positive(),
    energyCost: z.number().int().nonnegative(),
    reward: z.object({
      asset: z.literal("ZYXE"),
      minMinorUnits: z.string().regex(/^\d+$/),
      maxMinorUnits: z.string().regex(/^\d+$/),
      bucket: z.literal("AVAILABLE"),
    }),
    minTapIntervalMs: z.number().int().positive().optional(),
    maxBatchSize: z.number().int().positive().optional(),
    mismatchLockMs: z.number().int().nonnegative().optional(),
    minFlipIntervalMs: z.number().int().positive().optional(),
  }),
  energy: gameEnergySchema.optional(),
  tap: z.object({ taps: z.number().int().nonnegative() }).optional(),
  memory: z
    .object({
      cardCount: z.number().int().positive(),
      matchedIndices: z.array(z.number().int().nonnegative()),
      pendingIndex: z.number().int().nonnegative().nullable(),
      pendingReveal: z
        .object({
          cardIndex: z.number().int().nonnegative(),
          symbol: z.string(),
        })
        .optional(),
      pairs: z.number().int().nonnegative(),
      flips: z.number().int().nonnegative(),
      lockedUntilMs: z.number().int().nonnegative(),
    })
    .optional(),
});

export const gameSessionResponseSchema = z.object({
  session: gameSessionViewSchema,
  replayed: z.boolean().optional(),
});

export const gameEventResponseSchema = z.object({
  accepted: z.literal(true),
  nextSequence: z.number().int().positive(),
  configVersion: z.number().int().positive(),
  state: z.object({
    score: z.number().int().nonnegative(),
    taps: z.number().int().nonnegative().optional(),
    pairs: z.number().int().nonnegative().optional(),
    matchedIndices: z.array(z.number().int().nonnegative()).optional(),
    pendingIndex: z.number().int().nonnegative().nullable().optional(),
    lockedUntilMs: z.number().int().nonnegative().optional(),
  }),
  reveal: z
    .object({
      cardIndex: z.number().int().nonnegative(),
      symbol: z.string(),
      matched: z.boolean(),
      matchedIndices: z.array(z.number().int().nonnegative()),
      pairs: z.number().int().nonnegative(),
    })
    .optional(),
});

export const missionStatusSchema = z.enum([
  "IN_PROGRESS",
  "CLAIMABLE",
  "CLAIMED",
  "LOCKED",
]);
export const missionClaimRequestSchema = z.object({
  periodKey: z.string().min(4).max(64),
  configVersion: z.number().int().positive(),
});
export const missionCatalogResponseSchema = z.object({
  missions: z.array(
    z.object({
      id: z.string(),
      periodKey: z.string(),
      configVersion: z.number().int().positive(),
      title: z.string(),
      category: z.string(),
      requirement: z.string(),
      premium: z.boolean(),
      status: missionStatusSchema,
      reasonCode: z.string().nullable(),
      progress: z.number().int().nonnegative(),
      target: z.number().int().positive(),
      reward: z.object({
        asset: z.literal("ZYXE"),
        minorUnits: z.string().regex(/^\d+$/),
        bucket: z.literal("AVAILABLE"),
      }),
      periodEndsAt: z.string().datetime().nullable(),
      expiresAt: z.string().datetime().nullable(),
    }),
  ),
  configVersion: z.number().int().positive(),
});
export const missionClaimResponseSchema = z.object({
  missionClaim: z.object({
    id: z.string().uuid(),
    missionId: z.string(),
    periodKey: z.string(),
    status: z.literal("POSTED"),
    progress: z.number().int().nonnegative(),
    target: z.number().int().positive(),
    reward: z.object({
      asset: z.literal("ZYXE"),
      minorUnits: z.string().regex(/^\d+$/),
      bucket: z.literal("AVAILABLE"),
    }),
    transactionId: z.string().uuid(),
    configVersion: z.number().int().positive(),
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
export type GameSlug = z.infer<typeof gameSlugSchema>;
export type GameEventRequest = z.infer<typeof gameEventRequestSchema>;
export type GameCompleteRequest = z.infer<typeof gameCompleteRequestSchema>;
export type GameCatalogResponse = z.infer<typeof gameCatalogResponseSchema>;
export type GameSessionResponse = z.infer<typeof gameSessionResponseSchema>;
export type GameEventResponse = z.infer<typeof gameEventResponseSchema>;
export type MissionCatalogResponse = z.infer<
  typeof missionCatalogResponseSchema
>;
export type MissionClaimResponse = z.infer<typeof missionClaimResponseSchema>;
