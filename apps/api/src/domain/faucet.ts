import type { PublicUser } from "@fauzet/contracts";

export type FaucetState =
  | "READY"
  | "COOLDOWN"
  | "DAILY_LIMIT"
  | "DEVICE_LIMIT"
  | "IP_LIMIT"
  | "CAPTCHA_REQUIRED"
  | "RISK_BLOCKED"
  | "BUDGET_EXHAUSTED"
  | "DISABLED";

export interface FaucetRequestContext {
  ipHash: string;
  deviceId?: string;
}

export interface FaucetRewardRange {
  asset: "ZYXE";
  minMinorUnits: string;
  maxMinorUnits: string;
  bucket: "AVAILABLE";
}

export interface FaucetStatus {
  state: FaucetState;
  canClaim: boolean;
  captchaRequired: boolean;
  nextClaimAt: string | null;
  claimsToday: number;
  dailyClaimLimit: number;
  cooldownSeconds: number;
  streakDays: number;
  bonusMultiplier: string;
  reward: FaucetRewardRange;
  configVersion: number;
}

export interface FaucetChallenge {
  id: string;
  expiresAt: string;
}

export interface FaucetClaimResult {
  claim: {
    id: string;
    status: "POSTED";
    reward: {
      asset: "ZYXE";
      minorUnits: string;
      bucket: "AVAILABLE";
    };
    nextClaimAt: string;
    transactionId: string;
    configVersion: number;
    streakDays: number;
    bonusMultiplier: string;
  };
  replayed: boolean;
}

export interface FaucetStore {
  status(
    userId: string,
    context: FaucetRequestContext,
    now: Date,
  ): Promise<FaucetStatus>;
  createChallenge(
    userId: string,
    context: FaucetRequestContext,
    now: Date,
  ): Promise<FaucetChallenge>;
  claim(input: {
    userId: string;
    challengeId: string;
    idempotencyKey: string;
    context: FaucetRequestContext;
    now: Date;
  }): Promise<FaucetClaimResult>;
}

export type FaucetErrorCode =
  | "FAUCET_ACCOUNT_NOT_ELIGIBLE"
  | "FAUCET_DISABLED"
  | "FAUCET_COOLDOWN"
  | "FAUCET_DAILY_LIMIT"
  | "FAUCET_DEVICE_LIMIT"
  | "FAUCET_DEVICE_REQUIRED"
  | "FAUCET_IP_LIMIT"
  | "FAUCET_CAPTCHA_REQUIRED"
  | "FAUCET_RISK_BLOCKED"
  | "FAUCET_BUDGET_EXHAUSTED"
  | "FAUCET_CHALLENGE_INVALID"
  | "FAUCET_CHALLENGE_EXPIRED"
  | "FAUCET_CHALLENGE_CONSUMED"
  | "FAUCET_CONTEXT_MISMATCH"
  | "FAUCET_IDEMPOTENCY_CONFLICT"
  | "FAUCET_BUSY"
  | "FAUCET_POOL_EXHAUSTED"
  | "FAUCET_CONFIG_INVALID";

export class FaucetError extends Error {
  constructor(
    public readonly code: FaucetErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Readonly<
      Record<string, string | number | boolean | null>
    >,
  ) {
    super(message);
    this.name = "FaucetError";
  }
}

export class FaucetService {
  constructor(
    private readonly store: FaucetStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async status(
    user: PublicUser,
    context: FaucetRequestContext,
  ): Promise<FaucetStatus> {
    assertEligibleUser(user);
    return this.store.status(user.id, context, this.clock());
  }

  async createChallenge(
    user: PublicUser,
    context: FaucetRequestContext,
  ): Promise<FaucetChallenge> {
    assertEligibleUser(user);
    assertDevice(context);
    return this.store.createChallenge(user.id, context, this.clock());
  }

  async claim(
    user: PublicUser,
    input: { challengeId: string; idempotencyKey: string },
    context: FaucetRequestContext,
  ): Promise<FaucetClaimResult> {
    assertEligibleUser(user);
    assertDevice(context);
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
      throw new FaucetError(
        "FAUCET_IDEMPOTENCY_CONFLICT",
        "Idempotency-Key must contain between 8 and 128 characters",
        400,
      );
    }
    return this.store.claim({
      userId: user.id,
      challengeId: input.challengeId,
      idempotencyKey: input.idempotencyKey,
      context,
      now: this.clock(),
    });
  }
}

function assertDevice(context: FaucetRequestContext): void {
  if (!context.deviceId) {
    throw new FaucetError(
      "FAUCET_DEVICE_REQUIRED",
      "A valid session-bound UUIDv4 x-device-id header is required for faucet mutations",
      400,
    );
  }
}

function assertEligibleUser(user: PublicUser): void {
  if (user.status !== "ACTIVE") {
    throw new FaucetError(
      "FAUCET_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required to use the faucet",
      403,
    );
  }
}
