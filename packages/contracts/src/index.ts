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

export const accountActivityQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const accountActivityResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      sourceType: z.string(),
      sourceId: z.string(),
      status: z.string(),
      createdAt: z.string().datetime(),
      postedAt: z.string().datetime().nullable(),
      movements: z
        .array(
          z.object({
            asset: z.string().min(2).max(12),
            bucket: balanceBucketSchema,
            minorUnits: z.string().regex(/^-?\d+$/),
            balanceAfterMinorUnits: z
              .string()
              .regex(/^-?\d+$/)
              .nullable(),
          }),
        )
        .min(1),
    }),
  ),
  nextCursor: z.string().uuid().nullable(),
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

export const storeProductIdSchema = z.enum([
  "b1",
  "b2",
  "b3",
  "b4",
  "b5",
  "b6",
]);
export const storePurchaseRequestSchema = z.object({
  productId: storeProductIdSchema,
  configVersion: z.number().int().positive(),
});
export const storeCatalogResponseSchema = z.object({
  serverNow: z.string().datetime(),
  configVersion: z.number().int().positive(),
  paymentBalances: z.object({
    AVAILABLE: z.string().regex(/^\d+$/),
    PROMOTIONAL: z.string().regex(/^\d+$/),
  }),
  paymentOrder: z.tuple([z.literal("PROMOTIONAL"), z.literal("AVAILABLE")]),
  allowedPaymentBuckets: z.tuple([
    z.literal("PROMOTIONAL"),
    z.literal("AVAILABLE"),
  ]),
  slots: z.object({
    used: z.number().int().nonnegative(),
    max: z.number().int().positive(),
  }),
  split: z.object({
    burnBps: z.number().int().nonnegative(),
    recycleBps: z.number().int().nonnegative(),
    treasuryBps: z.number().int().nonnegative(),
  }),
  products: z.array(
    z.object({
      id: storeProductIdSchema,
      kind: z.enum([
        "ENERGY_REFILL",
        "HASH_BOOST",
        "LOCKED",
        "REPAIR_KIT",
        "MINER",
      ]),
      name: z.string(),
      description: z.string(),
      category: z.enum(["UTILITY", "BOOST", "PREMIUM", "MINER"]),
      enabled: z.boolean(),
      lockedReason: z.string().nullable(),
      state: z.enum([
        "AVAILABLE",
        "LOCKED",
        "ACTIVE",
        "LIMIT_REACHED",
        "NO_SLOT",
        "DISABLED",
      ]),
      reasonCode: z.string().nullable(),
      priceMinorUnits: z.string().regex(/^\d+$/),
      price: z.object({
        asset: z.literal("ZYXE"),
        minorUnits: z.string().regex(/^\d+$/),
      }),
      meta: z.string(),
      purchasesToday: z.number().int().nonnegative(),
      remainingToday: z.number().int().nonnegative().nullable(),
      effect: z.object({
        type: z.string(),
        label: z.string(),
        durationSeconds: z.number().int().positive().optional(),
        multiplierBps: z.number().int().positive().optional(),
        maxPerDay: z.number().int().positive().optional(),
        energyTo: z.number().int().positive().optional(),
        miner: z
          .object({
            modelId: z.string(),
            name: z.string(),
            tier: z.string(),
            hashRate: z.number().int().positive(),
            energyPerHour: z.number().int().nonnegative(),
            efficiencyBps: z.number().int().positive(),
          })
          .optional(),
      }),
      limits: z.object({
        perUtcDay: z.number().int().positive().nullable(),
        remainingToday: z.number().int().nonnegative().nullable(),
        maxActive: z.number().int().positive().nullable(),
        requiresSlot: z.boolean(),
      }),
    }),
  ),
});

export const miningStatusResponseSchema = z.object({
  serverNow: z.string().datetime(),
  configVersion: z.number().int().positive(),
  state: z.enum([
    "ACTIVE",
    "IDLE",
    "OUT_OF_ENERGY",
    "DISABLED",
    "RISK_BLOCKED",
  ]),
  reasonCode: z.string().nullable(),
  profile: z.object({
    energy: z.object({
      current: z.number().int().nonnegative(),
      max: z.number().int().positive(),
      consumptionPerHour: z.number().int().nonnegative(),
      estimatedExhaustsAt: z.string().datetime().nullable(),
    }),
    boost: z
      .object({
        multiplierBps: z.number().int().positive(),
        expiresAt: z.string().datetime(),
      })
      .nullable(),
    repairKits: z.number().int().nonnegative(),
    activeMiners: z.number().int().nonnegative(),
    maxSlots: z.number().int().positive(),
  }),
  miners: z.array(
    z.object({
      id: z.string().uuid(),
      modelId: z.string(),
      name: z.string(),
      tier: z.string(),
      slot: z.number().int().positive(),
      status: z.enum(["ACTIVE", "DISABLED"]),
      reasonCode: z.string().nullable(),
      level: z.number().int().positive(),
      hashRate: z.number().int().positive(),
      energyPerHour: z.number().int().nonnegative(),
      efficiencyBps: z.number().int().positive(),
      durabilityBps: z.number().int().nonnegative(),
      effectiveHashRate: z.number().int().nonnegative(),
      upgrade: z.object({
        nextLevel: z.number().int().positive(),
        priceMinorUnits: z.string().regex(/^\d+$/),
        hashRate: z.number().int().positive(),
        enabled: z.boolean(),
      }),
      repair: z.object({
        priceMinorUnits: z.string().regex(/^\d+$/),
        usesKit: z.boolean(),
        enabled: z.boolean(),
      }),
    }),
  ),
  today: z.object({
    periodKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    hashMillis: z.string().regex(/^\d+$/),
    poolMinorUnits: z.string().regex(/^\d+$/),
    estimatedPayoutMinorUnits: z.string().regex(/^\d+$/),
    asOf: z.string().datetime(),
    isGuaranteed: z.literal(false),
    status: z.enum(["OPEN", "BLOCKED", "SETTLED", "REVERSED"]),
    allocatedMinorUnits: z.string().regex(/^\d+$/).nullable(),
    residueMinorUnits: z.string().regex(/^\d+$/),
    userWeight: z.string().regex(/^\d+$/),
    totalWeight: z.string().regex(/^\d+$/),
  }),
});

const appliedEffectSchema = z.object({
  type: z.string(),
  status: z.literal("APPLIED"),
  refId: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
});
export const storePurchaseResponseSchema = z.object({
  purchase: z.object({
    id: z.string().uuid(),
    productId: storeProductIdSchema,
    status: z.literal("POSTED"),
    quantity: z.literal(1),
    totalMinorUnits: z.string().regex(/^\d+$/),
    price: z.object({
      asset: z.literal("ZYXE"),
      minorUnits: z.string().regex(/^\d+$/),
    }),
    payment: z.object({
      availableMinorUnits: z.string().regex(/^\d+$/),
      promotionalMinorUnits: z.string().regex(/^\d+$/),
    }),
    split: z.object({
      burnMinorUnits: z.string().regex(/^\d+$/),
      rewardPoolsMinorUnits: z.string().regex(/^\d+$/),
      recycleMinorUnits: z.string().regex(/^\d+$/),
      treasuryMinorUnits: z.string().regex(/^\d+$/),
    }),
    effect: appliedEffectSchema,
    transactionId: z.string().uuid(),
    configVersion: z.number().int().positive(),
    createdAt: z.string().datetime(),
  }),
  mining: miningStatusResponseSchema,
  replayed: z.boolean(),
});

export const fiatProductKindSchema = z.enum([
  "MINER",
  "BOOST",
  "CONSUMABLE",
  "BUNDLE",
]);
export const fiatCatalogProductStateSchema = z.enum([
  "AVAILABLE",
  "COMING_SOON",
  "DISABLED",
]);
export const fiatEntitlementStateSchema = z.enum([
  "PURCHASED",
  "ACTIVE",
  "CONSUMED",
  "EXPIRED",
  "REFUND_PENDING",
  "REFUNDED",
  "REVOKED",
]);
const fiatEffectParameterSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export const fiatEffectSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1),
  parameters: z.record(fiatEffectParameterSchema),
});
export const fiatCatalogResponseSchema = z.object({
  serverNow: z.string().datetime(),
  mode: z.literal("SANDBOX"),
  realChargeEnabled: z.literal(false),
  provider: z.literal("MERCADO_PAGO"),
  checkoutTermsVersion: z.string().min(1).max(128),
  catalogEnabled: z.boolean(),
  checkoutEnabled: z.boolean(),
  activationEnabled: z.boolean(),
  currency: z.literal("COP"),
  exponent: z.literal(0),
  disabledReason: z.string().nullable(),
  products: z.array(
    z.object({
      productVersionId: z.string().uuid(),
      sku: z.string().min(1),
      version: z.number().int().positive(),
      kind: fiatProductKindSchema,
      state: fiatCatalogProductStateSchema,
      reasonCode: z.string().nullable(),
      name: z.string().min(1),
      description: z.string().min(1),
      price: z.object({
        currency: z.literal("COP"),
        minorUnits: z.string().regex(/^\d+$/),
        exponent: z.literal(0),
      }),
      durationSeconds: z.number().int().positive().nullable(),
      effect: fiatEffectSchema,
      rewardEligible: z.literal(false),
      refundPolicyVersion: z.string().min(1),
      activationConsentVersion: z.string().min(1),
    }),
  ),
});
export const fiatInventoryResponseSchema = z.object({
  serverNow: z.string().datetime(),
  activationEnabled: z.boolean(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      orderId: z.string().uuid(),
      productVersionId: z.string().uuid(),
      sku: z.string().min(1),
      name: z.string().min(1),
      state: fiatEntitlementStateSchema,
      quantity: z.number().int().positive(),
      purchasedAt: z.string().datetime(),
      activatedAt: z.string().datetime().nullable(),
      startsAt: z.string().datetime().nullable(),
      endsAt: z.string().datetime().nullable(),
      canActivate: z.boolean(),
      canRequestRefund: z.boolean(),
      reasonCode: z.string().nullable(),
      effect: fiatEffectSchema,
    }),
  ),
});

export const fiatPaymentOrderStatusSchema = z.enum([
  "CREATED",
  "CHECKOUT_READY",
  "PENDING",
  "PAID",
  "REFUND_PENDING",
  "REFUNDED",
  "CANCELLED",
  "EXPIRED",
  "HELD",
  "DISPUTED",
]);

export const fiatCheckoutRequestSchema = z
  .object({
    productVersionId: z.string().uuid(),
    quantity: z.literal(1),
    termsVersion: z.string().trim().min(1).max(128),
    refundPolicyVersion: z.string().trim().min(1).max(128),
  })
  .strict();

const fiatCheckoutSchema = z.object({
  preferenceId: z.string().min(1).max(256),
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:", {
      message: "Checkout URL must use HTTPS",
    }),
  expiresAt: z.string().datetime(),
});

export const fiatOrderResponseSchema = z.object({
  serverNow: z.string().datetime(),
  mode: z.literal("SANDBOX"),
  realChargeEnabled: z.literal(false),
  provider: z.literal("MERCADO_PAGO"),
  environment: z.literal("TEST"),
  order: z.object({
    id: z.string().uuid(),
    status: fiatPaymentOrderStatusSchema,
    productVersionId: z.string().uuid(),
    sku: z.string().min(1),
    name: z.string().min(1),
    quantity: z.literal(1),
    price: z.object({
      currency: z.literal("COP"),
      minorUnits: z.string().regex(/^\d+$/),
      exponent: z.literal(0),
    }),
    termsVersion: z.string().min(1),
    refundPolicyVersion: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    checkout: fiatCheckoutSchema.nullable(),
    entitlementId: z.string().uuid().nullable(),
    reasonCode: z.string().nullable(),
  }),
  replayed: z.boolean(),
});

export const minerMutationRequestSchema = z.object({
  configVersion: z.number().int().positive(),
});
export const minerActionResponseSchema = z.object({
  action: z.object({
    id: z.string().uuid(),
    minerId: z.string().uuid(),
    type: z.enum(["UPGRADE", "REPAIR"]),
    status: z.literal("POSTED"),
    costMinorUnits: z.string().regex(/^\d+$/),
    payment: z.object({
      availableMinorUnits: z.string().regex(/^\d+$/),
      promotionalMinorUnits: z.string().regex(/^\d+$/),
    }),
    split: z.object({
      burnMinorUnits: z.string().regex(/^\d+$/),
      recycleMinorUnits: z.string().regex(/^\d+$/),
      treasuryMinorUnits: z.string().regex(/^\d+$/),
    }),
    transactionId: z.string().uuid().nullable(),
    configVersion: z.number().int().positive(),
  }),
  mining: miningStatusResponseSchema,
  replayed: z.boolean(),
});

export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^FZ-[A-Z2-9]{8,16}$/);

const referralProgramStateSchema = z.enum([
  "ACTIVE",
  "ATTRIBUTION_ONLY",
  "DISABLED",
  "RISK_BLOCKED",
]);

export const referralCodeResponseSchema = z.object({
  serverNow: z.string().datetime(),
  configVersion: z.number().int().positive(),
  state: referralProgramStateSchema,
  reasonCode: z.string().nullable(),
  code: referralCodeSchema,
  invitePath: z.string().startsWith("/r/"),
  sponsor: z
    .object({
      displayName: z.string(),
      joinedAt: z.string().datetime(),
    })
    .nullable(),
  rates: z.array(
    z.object({
      level: z.number().int().min(1).max(4),
      rateBps: z.number().int().nonnegative(),
    }),
  ),
  monthlyCapMinorUnits: z.string().regex(/^\d+$/),
  reviewWindowHours: z.number().int().nonnegative(),
});

export const referralTreeResponseSchema = z.object({
  serverNow: z.string().datetime(),
  state: referralProgramStateSchema,
  reasonCode: z.string().nullable(),
  totalMembers: z.number().int().nonnegative(),
  activeMembers: z.number().int().nonnegative(),
  levels: z.array(
    z.object({
      level: z.number().int().min(1).max(4),
      rateBps: z.number().int().nonnegative(),
      members: z.number().int().nonnegative(),
      activeMembers: z.number().int().nonnegative(),
    }),
  ),
  recentMembers: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      level: z.number().int().min(1).max(4),
      state: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]),
      joinedAt: z.string().datetime(),
    }),
  ),
});

export const referralCommissionsResponseSchema = z.object({
  serverNow: z.string().datetime(),
  state: referralProgramStateSchema,
  reasonCode: z.string().nullable(),
  summary: z.object({
    pendingMinorUnits: z.string().regex(/^\d+$/),
    availableMinorUnits: z.string().regex(/^\d+$/),
    reversedMinorUnits: z.string().regex(/^\d+$/),
    cappedMinorUnits: z.string().regex(/^\d+$/),
    monthEarnedMinorUnits: z.string().regex(/^\d+$/),
    monthRemainingMinorUnits: z.string().regex(/^\d+$/),
  }),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      level: z.number().int().min(1).max(4),
      memberDisplayName: z.string(),
      sourceType: z.string(),
      status: z.enum([
        "PENDING",
        "AVAILABLE",
        "CAPPED",
        "HELD",
        "REVERSED",
        "CLAWBACK_PENDING",
      ]),
      baseMinorUnits: z.string().regex(/^\d+$/),
      rewardMinorUnits: z.string().regex(/^\d+$/),
      qualifiedAt: z.string().datetime(),
      availableAt: z.string().datetime().nullable(),
    }),
  ),
});

export const adminRoleSchema = z.enum([
  "SUPPORT",
  "CONTENT",
  "FRAUD",
  "FINANCE",
  "AUDITOR",
  "SUPERADMIN",
  "OWNER",
]);
export const adminPermissionSchema = z.enum([
  "OVERVIEW_READ",
  "USERS_READ",
  "USERS_STATUS_WRITE",
  "RISK_READ",
  "RISK_WRITE",
  "LEDGER_READ",
  "AUDIT_READ",
  "CONFIG_READ",
  "WITHDRAWALS_READ",
  "WITHDRAWALS_WRITE",
]);
export const adminStepUpRequestSchema = z.object({
  password: z.string().min(1).max(128),
});
export const adminSessionResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().nullable(),
    locale: z.enum(["es", "en"]),
    countryCode: z.string().nullable(),
    status: z.string(),
    roles: z.array(z.string()),
  }),
  roles: z.array(adminRoleSchema).min(1),
  permissions: z.array(adminPermissionSchema),
  assurance: z.literal("PASSWORD_REAUTH"),
  expiresAt: z.string().datetime(),
});
const adminBucketBalancesSchema = z.record(
  z.enum([
    "PENDING",
    "AVAILABLE",
    "PROMOTIONAL",
    "LOCKED",
    "ELIGIBLE",
    "RESERVED",
    "WITHDRAWN",
  ]),
  z.string().regex(/^-?\d+$/),
);
export const adminOverviewResponseSchema = z.object({
  serverNow: z.string().datetime(),
  users: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    restricted: z.number().int().nonnegative(),
    suspended: z.number().int().nonnegative(),
    registered24h: z.number().int().nonnegative(),
  }),
  risk: z.object({
    elevated: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    signals24h: z.number().int().nonnegative(),
  }),
  ledger: z.object({
    transactions24h: z.number().int().nonnegative(),
    userLiabilities: adminBucketBalancesSchema,
  }),
  features: z.object({
    realMoney: z.literal(false),
    withdrawals: z.literal(false),
    trading: z.literal(false),
  }),
});
export const adminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  countryCode: z.string().nullable(),
  status: z.enum([
    "PENDING_VERIFICATION",
    "ACTIVE",
    "RESTRICTED",
    "SUSPENDED",
    "CLOSED",
  ]),
  riskLevel: z.number().int().min(0).max(100),
  roles: z.array(z.string()),
  balances: adminBucketBalancesSchema,
  emailVerified: z.boolean(),
  createdAt: z.string().datetime(),
});
export const adminUsersResponseSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const adminLedgerResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      status: z.string(),
      sourceType: z.string(),
      sourceId: z.string(),
      configVersion: z.number().int().positive(),
      createdAt: z.string().datetime(),
      postingCount: z.number().int().positive(),
      balanced: z.boolean(),
      totalDebitsMinorUnits: z.string().regex(/^\d+$/),
      totalCreditsMinorUnits: z.string().regex(/^\d+$/),
    }),
  ),
});
export const adminAuditResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      actor: z.string().nullable(),
      action: z.string(),
      targetType: z.string(),
      targetId: z.string(),
      reason: z.string().nullable(),
      before: z.unknown().nullable(),
      after: z.unknown().nullable(),
      requestId: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
});
export const adminRiskResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      userId: z.string().uuid(),
      userDisplayName: z.string().nullable(),
      actor: z.string().nullable(),
      type: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      scoreDelta: z.number().int(),
      previousScore: z.number().int().min(0).max(100),
      nextScore: z.number().int().min(0).max(100),
      reason: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
});
export const adminUserStatusRequestSchema = z.object({
  status: z.enum(["ACTIVE", "RESTRICTED", "SUSPENDED"]),
  reason: z.string().trim().min(10).max(500),
});
export const adminRiskUpdateRequestSchema = z.object({
  riskLevel: z.number().int().min(0).max(100),
  reason: z.string().trim().min(10).max(500),
});
export const adminMutationResponseSchema = z.object({
  user: adminUserSchema.omit({ balances: true }).extend({
    balances: adminBucketBalancesSchema.optional(),
  }),
  auditEventId: z.string().uuid(),
});

export const adminWithdrawalsResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      userId: z.string().uuid(),
      userEmail: z.string().email(),
      userDisplayName: z.string().nullable(),
      conversionId: z.string().uuid(),
      asset: z.enum(["SANDBOX_LTC", "SANDBOX_DOGE"]),
      eligibleMinorUnits: z.string().regex(/^\d+$/),
      netAssetMinorUnits: z.string().regex(/^\d+$/),
      walletLabel: z.string(),
      walletAddressMasked: z.string(),
      status: z.enum(["REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"]),
      riskScore: z.number().int().min(0).max(100),
      reasonCodes: z.array(z.string()),
      sandboxTxId: z.string().nullable(),
      confirmations: z.number().int().nonnegative(),
      createdAt: z.string().datetime(),
    }),
  ),
});
export const adminWithdrawalDecisionRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(10).max(500),
});
export const adminWithdrawalDecisionResponseSchema = z.object({
  withdrawal: adminWithdrawalsResponseSchema.shape.items.element,
  auditEventId: z.string().uuid(),
  replayed: z.boolean(),
});

export const sandboxAssetSchema = z.enum(["SANDBOX_LTC", "SANDBOX_DOGE"]);
export const sandboxWalletRequestSchema = z.object({
  network: sandboxAssetSchema,
  address: z
    .string()
    .trim()
    .regex(/^sandbox:[a-zA-Z0-9_-]{8,64}$/),
  label: z.string().trim().min(2).max(80),
});
const sandboxWalletSchema = z.object({
  id: z.string().uuid(),
  network: sandboxAssetSchema,
  addressMasked: z.string(),
  label: z.string(),
  status: z.enum(["PENDING_COOLDOWN", "ACTIVE", "REVOKED"]),
  availableAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
const sandboxQuoteSchema = z.object({
  id: z.string().uuid(),
  asset: sandboxAssetSchema,
  eligibleMinorUnits: z.string().regex(/^\d+$/),
  grossAssetMinorUnits: z.string().regex(/^\d+$/),
  networkFeeAssetMinorUnits: z.string().regex(/^\d+$/),
  netAssetMinorUnits: z.string().regex(/^\d+$/),
  spreadBps: z.number().int().nonnegative(),
  status: z.enum(["OPEN", "CONSUMED", "EXPIRED"]),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
const sandboxConversionSchema = z.object({
  id: z.string().uuid(),
  quote: sandboxQuoteSchema,
  status: z.enum(["RESERVED", "COMPLETED", "CANCELLED", "REJECTED"]),
  reserveTransactionId: z.string().uuid(),
  releaseTransactionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
const sandboxWithdrawalSchema = z.object({
  id: z.string().uuid(),
  conversionId: z.string().uuid(),
  walletId: z.string().uuid(),
  status: z.enum(["REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"]),
  riskScore: z.number().int().min(0).max(100),
  reasonCodes: z.array(z.string()),
  assurance: z.enum(["PASSWORD_REAUTH_SANDBOX", "PASSWORD_EMAIL_OTP_SANDBOX"]),
  sandboxTxId: z.string().nullable(),
  confirmations: z.number().int().nonnegative(),
  settlementTransactionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export const sandboxStatusResponseSchema = z.object({
  serverNow: z.string().datetime(),
  mode: z.literal("SANDBOX"),
  enabled: z.boolean(),
  realWithdrawalsEnabled: z.literal(false),
  disclaimer: z.string(),
  eligibleMinorUnits: z.string().regex(/^\d+$/),
  reservedMinorUnits: z.string().regex(/^\d+$/),
  withdrawnMinorUnits: z.string().regex(/^\d+$/),
  walletCooldownHours: z.literal(24),
  quoteTtlSeconds: z.literal(120),
  wallets: z.array(sandboxWalletSchema),
  conversions: z.array(sandboxConversionSchema),
  withdrawals: z.array(sandboxWithdrawalSchema),
});
export const sandboxQuoteRequestSchema = z.object({
  asset: sandboxAssetSchema,
  eligibleMinorUnits: z
    .string()
    .max(36)
    .regex(/^\d+$/)
    .refine((value) => {
      try {
        return BigInt(value) >= 500n;
      } catch {
        return false;
      }
    }),
});
export const sandboxQuoteResponseSchema = z.object({
  quote: sandboxQuoteSchema,
});
export const sandboxConversionRequestSchema = z.object({
  quoteId: z.string().uuid(),
});
export const sandboxConversionResponseSchema = z.object({
  conversion: sandboxConversionSchema,
  replayed: z.boolean(),
});
export const sandboxWithdrawalRequestSchema = z.object({
  conversionId: z.string().uuid(),
  walletId: z.string().uuid(),
  password: z.string().min(1).max(128),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});
export const sandboxWithdrawalChallengeRequestSchema = z.object({
  conversionId: z.string().uuid(),
  walletId: z.string().uuid(),
});
export const sandboxWithdrawalChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  delivery: z.literal("EMAIL_MASKED"),
  recipientMasked: z.string(),
});
export const sandboxWithdrawalResponseSchema = z.object({
  withdrawal: sandboxWithdrawalSchema,
  conversion: sandboxConversionSchema,
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
  termsVersion: z.literal("beta-2026-07-13").optional(),
  privacyVersion: z.literal("beta-2026-07-13").optional(),
  referralCode: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    referralCodeSchema.optional(),
  ),
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
export type AccountActivityQuery = z.infer<typeof accountActivityQuerySchema>;
export type AccountActivityResponse = z.infer<
  typeof accountActivityResponseSchema
>;
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
export type StorePurchaseRequest = z.infer<typeof storePurchaseRequestSchema>;
export type StoreCatalogResponse = z.infer<typeof storeCatalogResponseSchema>;
export type StorePurchaseResponse = z.infer<typeof storePurchaseResponseSchema>;
export type FiatCatalogResponse = z.infer<typeof fiatCatalogResponseSchema>;
export type FiatInventoryResponse = z.infer<typeof fiatInventoryResponseSchema>;
export type FiatCheckoutRequest = z.infer<typeof fiatCheckoutRequestSchema>;
export type FiatOrderResponse = z.infer<typeof fiatOrderResponseSchema>;
export type FiatPaymentOrderStatus = z.infer<
  typeof fiatPaymentOrderStatusSchema
>;
export type MiningStatusResponse = z.infer<typeof miningStatusResponseSchema>;
export type MinerMutationRequest = z.infer<typeof minerMutationRequestSchema>;
export type MinerActionResponse = z.infer<typeof minerActionResponseSchema>;
export type ReferralCodeResponse = z.infer<typeof referralCodeResponseSchema>;
export type ReferralTreeResponse = z.infer<typeof referralTreeResponseSchema>;
export type ReferralCommissionsResponse = z.infer<
  typeof referralCommissionsResponseSchema
>;
export type AdminPermission = z.infer<typeof adminPermissionSchema>;
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;
export type AdminOverviewResponse = z.infer<typeof adminOverviewResponseSchema>;
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;
export type AdminLedgerResponse = z.infer<typeof adminLedgerResponseSchema>;
export type AdminAuditResponse = z.infer<typeof adminAuditResponseSchema>;
export type AdminRiskResponse = z.infer<typeof adminRiskResponseSchema>;
export type AdminWithdrawalsResponse = z.infer<
  typeof adminWithdrawalsResponseSchema
>;
export type AdminWithdrawalDecisionResponse = z.infer<
  typeof adminWithdrawalDecisionResponseSchema
>;
export type SandboxStatusResponse = z.infer<typeof sandboxStatusResponseSchema>;
export type SandboxQuoteResponse = z.infer<typeof sandboxQuoteResponseSchema>;
export type SandboxConversionResponse = z.infer<
  typeof sandboxConversionResponseSchema
>;
export type SandboxWithdrawalResponse = z.infer<
  typeof sandboxWithdrawalResponseSchema
>;
export type SandboxWithdrawalChallengeResponse = z.infer<
  typeof sandboxWithdrawalChallengeResponseSchema
>;
