import { randomUUID } from "node:crypto";
import {
  FaucetError,
  type FaucetChallenge,
  type FaucetClaimResult,
  type FaucetRequestContext,
  type FaucetStatus,
  type FaucetStore,
} from "../domain/faucet.js";

interface MemoryChallenge {
  id: string;
  userId: string;
  context: FaucetRequestContext;
  expiresAt: Date;
  status: "ISSUED" | "CONSUMED" | "EXPIRED";
}

interface MemoryClaim {
  userId: string;
  challengeId: string;
  idempotencyKey: string;
  createdAt: Date;
  context: FaucetRequestContext;
  result: FaucetClaimResult;
}

const config = {
  version: 1,
  rewardMinMinor: 5,
  rewardMaxMinor: 25,
  dailyBudgetMinor: 200_000,
  cooldownSeconds: 900,
  dailyClaimLimit: 8,
  deviceDailyClaimLimit: 8,
  ipDailyClaimLimit: 24,
  captchaAfterClaims: 3,
  streakBonusAfterDays: 7,
  streakBonusPercent: 20,
  challengeTtlSeconds: 300,
} as const;

export class MemoryFaucetStore implements FaucetStore {
  private readonly challenges = new Map<string, MemoryChallenge>();
  private readonly claims: MemoryClaim[] = [];

  async status(
    userId: string,
    context: FaucetRequestContext,
    now: Date,
  ): Promise<FaucetStatus> {
    const today = claimsToday(this.claims, userId, now);
    const allToday = claimsToday(this.claims, undefined, now);
    const deviceClaims = context.deviceId
      ? allToday.filter((claim) => claim.context.deviceId === context.deviceId)
          .length
      : 0;
    const ipClaims = allToday.filter(
      (claim) => claim.context.ipHash === context.ipHash,
    ).length;
    const spent = allToday.reduce(
      (total, claim) => total + BigInt(claim.result.claim.reward.minorUnits),
      0n,
    );
    const last = this.claims
      .filter((claim) => claim.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const nextClaimAt = last ? new Date(last.result.claim.nextClaimAt) : null;
    const cooling = nextClaimAt !== null && nextClaimAt > now;
    const { streakDays, prospectiveStreak } = memoryStreak(
      this.claims,
      userId,
      now,
    );
    const bonusPercent =
      prospectiveStreak >= config.streakBonusAfterDays
        ? config.streakBonusPercent
        : 0;
    const state = cooling
      ? "COOLDOWN"
      : today.length >= config.dailyClaimLimit
        ? "DAILY_LIMIT"
        : deviceClaims >= config.deviceDailyClaimLimit
          ? "DEVICE_LIMIT"
          : ipClaims >= config.ipDailyClaimLimit
            ? "IP_LIMIT"
            : today.length >= config.captchaAfterClaims
              ? "CAPTCHA_REQUIRED"
              : spent + BigInt(config.rewardMinMinor) >
                  BigInt(config.dailyBudgetMinor)
                ? "BUDGET_EXHAUSTED"
                : "READY";
    return {
      state,
      canClaim: state === "READY",
      captchaRequired: state === "CAPTCHA_REQUIRED",
      nextClaimAt: cooling ? nextClaimAt!.toISOString() : null,
      claimsToday: today.length,
      dailyClaimLimit: config.dailyClaimLimit,
      cooldownSeconds: config.cooldownSeconds,
      streakDays,
      bonusMultiplier: multiplier(bonusPercent),
      reward: {
        asset: "ZYXE",
        minMinorUnits: String(config.rewardMinMinor),
        maxMinorUnits: String(config.rewardMaxMinor),
        bucket: "AVAILABLE",
      },
      configVersion: config.version,
    };
  }

  async createChallenge(
    userId: string,
    context: FaucetRequestContext,
    now: Date,
  ): Promise<FaucetChallenge> {
    assertReady(await this.status(userId, context, now));
    for (const challenge of this.challenges.values()) {
      if (challenge.userId === userId && challenge.status === "ISSUED") {
        challenge.status = "EXPIRED";
      }
    }
    const challenge: MemoryChallenge = {
      id: randomUUID(),
      userId,
      context,
      expiresAt: new Date(now.getTime() + config.challengeTtlSeconds * 1_000),
      status: "ISSUED",
    };
    this.challenges.set(challenge.id, challenge);
    return {
      id: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  async claim(input: {
    userId: string;
    challengeId: string;
    idempotencyKey: string;
    context: FaucetRequestContext;
    now: Date;
  }): Promise<FaucetClaimResult> {
    const existing = this.claims.filter(
      (claim) =>
        claim.userId === input.userId &&
        (claim.challengeId === input.challengeId ||
          claim.idempotencyKey === input.idempotencyKey),
    );
    if (existing.length === 1) {
      const match = existing[0]!;
      if (
        match.challengeId === input.challengeId &&
        match.idempotencyKey === input.idempotencyKey
      ) {
        return { ...match.result, replayed: true };
      }
    }
    if (existing.length > 0) {
      throw new FaucetError(
        "FAUCET_IDEMPOTENCY_CONFLICT",
        "Idempotency-Key or challenge identity conflicts with another claim",
        409,
      );
    }

    assertReady(await this.status(input.userId, input.context, input.now));
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.userId !== input.userId) {
      throw new FaucetError(
        "FAUCET_CHALLENGE_INVALID",
        "The faucet challenge is invalid",
        400,
      );
    }
    if (challenge.status === "CONSUMED") {
      throw new FaucetError(
        "FAUCET_CHALLENGE_CONSUMED",
        "The faucet challenge was already consumed",
        409,
      );
    }
    if (challenge.status !== "ISSUED" || challenge.expiresAt <= input.now) {
      throw new FaucetError(
        "FAUCET_CHALLENGE_EXPIRED",
        "The faucet challenge has expired",
        410,
      );
    }
    if (challenge.context.deviceId !== input.context.deviceId) {
      throw new FaucetError(
        "FAUCET_CONTEXT_MISMATCH",
        "The faucet challenge does not match this session-bound device",
        403,
      );
    }
    challenge.status = "CONSUMED";
    const nextClaimAt = new Date(
      input.now.getTime() + config.cooldownSeconds * 1_000,
    );
    const { prospectiveStreak: streakDays } = memoryStreak(
      this.claims,
      input.userId,
      input.now,
    );
    const bonusPercent =
      streakDays >= config.streakBonusAfterDays ? config.streakBonusPercent : 0;
    const rewardMinor =
      (BigInt(config.rewardMinMinor) * BigInt(100 + bonusPercent)) / 100n;
    const result: FaucetClaimResult = {
      claim: {
        id: randomUUID(),
        status: "POSTED",
        reward: {
          asset: "ZYXE",
          minorUnits: rewardMinor.toString(),
          bucket: "AVAILABLE",
        },
        nextClaimAt: nextClaimAt.toISOString(),
        transactionId: randomUUID(),
        configVersion: config.version,
        streakDays,
        bonusMultiplier: multiplier(bonusPercent),
      },
      replayed: false,
    };
    this.claims.push({
      userId: input.userId,
      challengeId: input.challengeId,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
      context: input.context,
      result,
    });
    return result;
  }
}

function claimsToday(
  claims: readonly MemoryClaim[],
  userId: string | undefined,
  now: Date,
): MemoryClaim[] {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const end = start + 86_400_000;
  return claims.filter(
    (claim) =>
      (userId === undefined || claim.userId === userId) &&
      claim.createdAt.getTime() >= start &&
      claim.createdAt.getTime() < end,
  );
}

function assertReady(status: FaucetStatus): void {
  if (status.state === "READY") return;
  if (status.state === "COOLDOWN") {
    throw new FaucetError(
      "FAUCET_COOLDOWN",
      "The faucet cooldown is still active",
      429,
      { nextClaimAt: status.nextClaimAt },
    );
  }
  if (status.state === "CAPTCHA_REQUIRED") {
    throw new FaucetError(
      "FAUCET_CAPTCHA_REQUIRED",
      "A real CAPTCHA provider is required for further claims today",
      403,
      { captchaRequired: true },
    );
  }
  if (status.state === "DEVICE_LIMIT" || status.state === "IP_LIMIT") {
    throw new FaucetError(
      status.state === "DEVICE_LIMIT"
        ? "FAUCET_DEVICE_LIMIT"
        : "FAUCET_IP_LIMIT",
      "The daily faucet context limit has been reached",
      429,
    );
  }
  throw new FaucetError(
    status.state === "DAILY_LIMIT"
      ? "FAUCET_DAILY_LIMIT"
      : "FAUCET_BUDGET_EXHAUSTED",
    "The faucet is not currently available",
    429,
  );
}

function memoryStreak(
  claims: readonly MemoryClaim[],
  userId: string,
  now: Date,
): { streakDays: number; prospectiveStreak: number } {
  const days = new Set(
    claims
      .filter((claim) => claim.userId === userId)
      .map((claim) => utcDate(claim.createdAt)),
  );
  const today = utcStart(now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const includesToday = days.has(utcDate(today));
  let cursor = includesToday ? today : yesterday;
  if (!days.has(utcDate(cursor))) {
    return { streakDays: 0, prospectiveStreak: 1 };
  }
  let streakDays = 0;
  while (days.has(utcDate(cursor))) {
    streakDays += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return {
    streakDays,
    prospectiveStreak: includesToday ? streakDays : streakDays + 1,
  };
}

function utcStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcDate(date: Date): string {
  return utcStart(date).toISOString().slice(0, 10);
}

function multiplier(bonusPercent: number): string {
  return String(1 + bonusPercent / 100);
}
