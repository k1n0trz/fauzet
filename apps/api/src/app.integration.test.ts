import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { getDatabase } from "@fauzet/database";
import {
  accountActivityResponseSchema,
  gameCatalogResponseSchema,
  gameEventResponseSchema,
  gameSessionResponseSchema,
  missionCatalogResponseSchema,
  missionClaimResponseSchema,
  miningStatusResponseSchema,
  referralCodeResponseSchema,
  referralCommissionsResponseSchema,
  referralTreeResponseSchema,
  storeCatalogResponseSchema,
  storePurchaseResponseSchema,
  fiatCatalogResponseSchema,
  fiatInventoryResponseSchema,
  adminAuditResponseSchema,
  adminOverviewResponseSchema,
  adminRiskResponseSchema,
  adminUsersResponseSchema,
} from "@fauzet/contracts";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PrismaAccountSecurityStore } from "./infrastructure/prisma-account-security-store.js";
import { PrismaAccountActivityStore } from "./infrastructure/prisma-account-activity-store.js";
import { PrismaAuthStore } from "./infrastructure/prisma-auth-store.js";
import { PrismaBalanceStore } from "./infrastructure/prisma-balance-store.js";
import { MemoryMailer } from "./infrastructure/memory-mailer.js";
import { PrismaLedgerStore } from "./infrastructure/prisma-ledger-store.js";
import { PrismaWelcomeBonusIssuer } from "./infrastructure/prisma-welcome-bonus.js";
import { PrismaFaucetStore } from "./infrastructure/prisma-faucet-store.js";
import { PrismaGameStore } from "./infrastructure/prisma-game-store.js";
import { PrismaMissionStore } from "./infrastructure/prisma-mission-store.js";
import { PrismaReferralStore } from "./infrastructure/prisma-referral-store.js";
import { PrismaCommerceStore } from "./infrastructure/prisma-commerce-store.js";
import { PrismaFiatCommerceStore } from "./infrastructure/prisma-fiat-commerce-store.js";
import { PrismaAdminStore } from "./infrastructure/prisma-admin-store.js";

const integration = process.env.RUN_INTEGRATION === "true";

describe.runIf(integration)("persistent auth vertical", () => {
  const database = getDatabase();
  const mailer = new MemoryMailer();
  const authStore = new PrismaAuthStore(database);
  let gameNow = new Date();
  const appPromise = createApp(
    loadConfig({
      NODE_ENV: "test",
      SESSION_SECRET: "integration-session-secret-at-least-32-characters",
    }),
    {
      authStore,
      balanceStore: new PrismaBalanceStore(database),
      accountActivityStore: new PrismaAccountActivityStore(database),
      accountSecurityStore: new PrismaAccountSecurityStore(database),
      mailer,
      welcomeBonus: new PrismaWelcomeBonusIssuer(database),
      faucetStore: new PrismaFaucetStore(database, () => 5),
      gameStore: new PrismaGameStore(
        database,
        "integration-session-secret-at-least-32-characters",
        () => new Date(gameNow),
      ),
      missionStore: new PrismaMissionStore(database, () => new Date(gameNow)),
      referralStore: new PrismaReferralStore(database, () => new Date(gameNow)),
      commerceStore: new PrismaCommerceStore(database, () => new Date(gameNow)),
      fiatCommerceStore: new PrismaFiatCommerceStore(
        database,
        () => new Date(gameNow),
      ),
      adminStore: new PrismaAdminStore(database),
    },
  );

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
    await database.$disconnect();
  });

  it("advances the economic configuration sequence after seeding id 1", async () => {
    const config = await database.economicConfigVersion.create({
      data: {
        status: "DRAFT",
        parameters: { integration: true },
        reason: "Integration sequence check",
        createdById: "integration-test",
      },
    });
    expect(config.id).toBeGreaterThan(1);
  });

  it("never reactivates a suspended account through an old verification link", async () => {
    const app = await appPromise;
    const email = `suspended-${crypto.randomUUID()}@fauzet.local`;
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "ValidPassword123",
        displayName: "Suspended User",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/request",
      cookies: { fz_session: cookie.value },
    });
    const verification = mailer.verification.at(-1)!;
    await database.user.update({
      where: { email },
      data: { status: "SUSPENDED" },
    });
    const confirmation = await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/confirm",
      payload: { token: verification.token },
    });
    expect(confirmation.statusCode).toBe(200);
    expect(confirmation.json().bonusTransactionId).toBeNull();
    await expect(
      database.user.findUniqueOrThrow({ where: { email } }),
    ).resolves.toMatchObject({
      status: "SUSPENDED",
      acceptedTermsVersion: "beta-2026-07-13",
      acceptedPrivacyVersion: "beta-2026-07-13",
    });
  });

  it("serves the persisted fiat catalog and an empty authoritative inventory", async () => {
    const app = await appPromise;
    const email = `fiat-${crypto.randomUUID()}@fauzet.local`;
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "ValidPassword123",
        displayName: "Fiat Catalog User",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    expect(registration.statusCode).toBe(201);
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/request",
      cookies: { fz_session: cookie.value },
    });
    const verification = mailer.verification.at(-1)!;
    const confirmation = await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/confirm",
      payload: { token: verification.token },
    });
    expect(confirmation.statusCode).toBe(200);

    const fiatCatalog = await app.inject({
      method: "GET",
      url: "/v1/fiat/catalog",
      cookies: { fz_session: cookie.value },
    });
    const fiatInventory = await app.inject({
      method: "GET",
      url: "/v1/fiat/entitlements",
      cookies: { fz_session: cookie.value },
    });

    expect(fiatCatalog.statusCode).toBe(200);
    expect(fiatCatalog.headers["cache-control"]).toBe("no-store");
    expect(
      fiatCatalogResponseSchema.parse(fiatCatalog.json()).products,
    ).toHaveLength(13);
    expect(fiatInventory.statusCode).toBe(200);
    expect(
      fiatInventoryResponseSchema.parse(fiatInventory.json()).items,
    ).toEqual([]);
  });

  it("posts exactly one funded faucet reward under concurrent retries", async () => {
    const app = await appPromise;
    const remoteAddress = testRemoteAddress();
    const email = `faucet-${crypto.randomUUID()}@fauzet.local`;
    const deviceId = crypto.randomUUID();
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "x-device-id": deviceId },
      payload: {
        email,
        password: "ValidPassword123",
        displayName: "Faucet User",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/request",
      cookies: { fz_session: cookie.value },
    });
    const verification = mailer.verification.at(-1)!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/email-verification/confirm",
          payload: { token: verification.token },
        })
      ).statusCode,
    ).toBe(200);

    const missingDevice = await app.inject({
      method: "POST",
      remoteAddress,
      url: "/v1/faucet/challenges",
      cookies: { fz_session: cookie.value },
    });
    expect(missingDevice.statusCode).toBe(400);
    expect(missingDevice.json().error.code).toBe("FAUCET_DEVICE_REQUIRED");

    const rotatedDevice = await app.inject({
      method: "POST",
      remoteAddress,
      url: "/v1/faucet/challenges",
      headers: { "x-device-id": crypto.randomUUID() },
      cookies: { fz_session: cookie.value },
    });
    expect(rotatedDevice.statusCode).toBe(400);
    expect(rotatedDevice.json().error.code).toBe("FAUCET_DEVICE_REQUIRED");

    const status = await app.inject({
      method: "GET",
      remoteAddress,
      url: "/v1/faucet/status",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().faucet).toMatchObject({
      state: "READY",
      canClaim: true,
      reward: {
        minMinorUnits: "5",
        maxMinorUnits: "25",
        bucket: "AVAILABLE",
      },
    });

    const challengeResponse = await app.inject({
      method: "POST",
      remoteAddress,
      url: "/v1/faucet/challenges",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(challengeResponse.statusCode).toBe(201);
    const challengeId = challengeResponse.json().challenge.id as string;
    const idempotencyKey = `claim-${crypto.randomUUID()}`;
    const rotatedProxyAddress = testRemoteAddress();
    const attempts = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          remoteAddress: rotatedProxyAddress,
          url: "/v1/faucet/claims",
          headers: {
            "x-device-id": deviceId,
            "idempotency-key": idempotencyKey,
          },
          cookies: { fz_session: cookie.value },
          payload: { challengeId },
        }),
      ),
    );
    expect(attempts.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    expect(attempts.map((attempt) => attempt.json().replayed).sort()).toEqual([
      false,
      true,
    ]);
    const firstClaim = attempts[0]!.json().claim;
    expect(firstClaim.reward).toEqual({
      asset: "ZYXE",
      minorUnits: "5",
      bucket: "AVAILABLE",
    });

    const userId = registration.json().user.id as string;
    const claims = await database.faucetClaim.findMany({
      where: { userId },
      include: { transaction: { include: { postings: true } } },
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]!.transaction!.configVersion).toBe(
      status.json().faucet.configVersion,
    );
    expect(
      claims[0]!.transaction!.postings.reduce(
        (sum, posting) => sum + BigInt(posting.amount.toFixed(0)),
        0n,
      ),
    ).toBe(0n);

    const balances = await app.inject({
      method: "GET",
      url: "/v1/balances",
      cookies: { fz_session: cookie.value },
    });
    expect(
      balances
        .json()
        .balances.find(
          ({ bucket }: { bucket: string }) => bucket === "AVAILABLE",
        ).minorUnits,
    ).toBe("5");
    const cooling = await app.inject({
      method: "GET",
      remoteAddress,
      url: "/v1/faucet/status",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(cooling.json().faucet.state).toBe("COOLDOWN");

    await database.user.update({
      where: { id: userId },
      data: { riskLevel: 99 },
    });
    const blocked = await app.inject({
      method: "GET",
      remoteAddress,
      url: "/v1/faucet/status",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(blocked.json().faucet.state).toBe("RISK_BLOCKED");
  });

  it("never exceeds the global daily budget under concurrent users", async () => {
    const app = await appPromise;

    async function registerVerifiedUser(label: string) {
      const email = `${label}-${crypto.randomUUID()}@fauzet.local`;
      const deviceId = crypto.randomUUID();
      const remoteAddress = testRemoteAddress();
      const registration = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-id": deviceId },
        payload: {
          email,
          password: "ValidPassword123",
          displayName: `Budget ${label}`,
          countryCode: "CO",
          locale: "es",
          acceptedTerms: true,
          isAdult: true,
        },
      });
      expect(registration.statusCode).toBe(201);
      const cookie = registration.cookies.find(
        ({ name }) => name === "fz_session",
      )!;
      await app.inject({
        method: "POST",
        url: "/v1/auth/email-verification/request",
        cookies: { fz_session: cookie.value },
      });
      const verification = mailer.verification.at(-1)!;
      const confirmation = await app.inject({
        method: "POST",
        url: "/v1/auth/email-verification/confirm",
        payload: { token: verification.token },
      });
      expect(confirmation.statusCode).toBe(200);
      return {
        cookie: cookie.value,
        deviceId,
        remoteAddress,
        userId: registration.json().user.id as string,
      };
    }

    const actors = [
      await registerVerifiedUser("alpha"),
      await registerVerifiedUser("beta"),
    ];
    const originalActive = await database.economicConfigVersion.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    const now = new Date();
    const budgetDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const spentToday = await database.faucetClaim.aggregate({
      where: { budgetDate, status: "POSTED" },
      _sum: { rewardMinor: true },
    });
    const dailyBudgetMinor = Number(
      BigInt(spentToday._sum.rewardMinor?.toFixed(0) ?? "0") + 5n,
    );
    expect(Number.isSafeInteger(dailyBudgetMinor)).toBe(true);
    const budgetConfig = await database.economicConfigVersion.create({
      data: {
        status: "DRAFT",
        reason: "Integration test: one globally funded faucet reward",
        createdById: "integration-test",
        parameters: {
          welcomeBonusMinor: 100,
          welcomeBonusBudgetMinor: 1_000_000,
          faucet: {
            enabled: true,
            rewardMinMinor: 5,
            rewardMaxMinor: 5,
            dailyBudgetMinor,
            cooldownSeconds: 900,
            dailyClaimLimit: 8,
            deviceDailyClaimLimit: 8,
            ipDailyClaimLimit: 1_000,
            captchaAfterClaims: 3,
            captchaProviderEnabled: false,
            maxRiskLevel: 50,
            streakBonusAfterDays: 7,
            streakBonusPercent: 20,
            challengeTtlSeconds: 300,
            creditBucket: "AVAILABLE",
          },
        },
      },
    });

    try {
      await database.$transaction(async (tx) => {
        await tx.economicConfigVersion.updateMany({
          where: { status: "ACTIVE" },
          data: { status: "SUPERSEDED" },
        });
        await tx.economicConfigVersion.update({
          where: { id: budgetConfig.id },
          data: { status: "ACTIVE", effectiveAt: new Date() },
        });
      });

      const challenges = await Promise.all(
        actors.map((actor) =>
          app.inject({
            method: "POST",
            remoteAddress: actor.remoteAddress,
            url: "/v1/faucet/challenges",
            headers: { "x-device-id": actor.deviceId },
            cookies: { fz_session: actor.cookie },
          }),
        ),
      );
      expect(
        challenges.map((response) => ({
          statusCode: response.statusCode,
          body: response.json(),
        })),
      ).toEqual([
        {
          statusCode: 201,
          body: {
            challenge: {
              id: expect.any(String),
              expiresAt: expect.any(String),
            },
          },
        },
        {
          statusCode: 201,
          body: {
            challenge: {
              id: expect.any(String),
              expiresAt: expect.any(String),
            },
          },
        },
      ]);

      const claims = await Promise.all(
        actors.map((actor, index) =>
          app.inject({
            method: "POST",
            remoteAddress: actor.remoteAddress,
            url: "/v1/faucet/claims",
            headers: {
              "x-device-id": actor.deviceId,
              "idempotency-key": `budget-race-${crypto.randomUUID()}`,
            },
            cookies: { fz_session: actor.cookie },
            payload: { challengeId: challenges[index]!.json().challenge.id },
          }),
        ),
      );
      expect(claims.map(({ statusCode }) => statusCode).sort()).toEqual([
        200, 503,
      ]);
      const rejected = claims.find(({ statusCode }) => statusCode === 503)!;
      expect(rejected.json().error.code).toBe("FAUCET_BUDGET_EXHAUSTED");

      const [persistedClaims, ledgerTransactions] = await Promise.all([
        database.faucetClaim.findMany({
          where: {
            ruleVersion: budgetConfig.id,
            userId: { in: actors.map(({ userId }) => userId) },
          },
        }),
        database.ledgerTransaction.findMany({
          where: {
            configVersion: budgetConfig.id,
            type: "FAUCET_REWARD",
          },
          include: { postings: true },
        }),
      ]);
      expect(persistedClaims).toHaveLength(1);
      expect(persistedClaims[0]!.rewardMinor.toFixed(0)).toBe("5");
      expect(ledgerTransactions).toHaveLength(1);
      expect(
        ledgerTransactions[0]!.postings.reduce(
          (sum, posting) => sum + BigInt(posting.amount.toFixed(0)),
          0n,
        ),
      ).toBe(0n);
    } finally {
      await database.$transaction(async (tx) => {
        await tx.economicConfigVersion.update({
          where: { id: budgetConfig.id },
          data: { status: "SUPERSEDED" },
        });
        await tx.economicConfigVersion.updateMany({
          where: { id: { in: originalActive.map(({ id }) => id) } },
          data: { status: "ACTIVE" },
        });
      });
    }
  });

  it("runs signed Tap and Memory sessions with atomic energy and rewards", async () => {
    const app = await appPromise;
    gameNow = new Date();
    const remoteAddress = testRemoteAddress();
    const email = `games-${crypto.randomUUID()}@fauzet.local`;
    const deviceId = crypto.randomUUID();
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "x-device-id": deviceId },
      payload: {
        email,
        password: "ValidPassword123",
        displayName: "Games User",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/request",
      cookies: { fz_session: cookie.value },
    });
    const verification = mailer.verification.at(-1)!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/email-verification/confirm",
          payload: { token: verification.token },
        })
      ).statusCode,
    ).toBe(200);

    const catalog = await app.inject({
      method: "GET",
      remoteAddress,
      url: "/v1/games/catalog",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(catalog.statusCode).toBe(200);
    expect(() => gameCatalogResponseSchema.parse(catalog.json())).not.toThrow();
    expect(catalog.json().energy.current).toBe(100);

    const startKey = `tap-start-${crypto.randomUUID()}`;
    const starts = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          remoteAddress,
          url: "/v1/games/tap-miner/sessions",
          headers: {
            "x-device-id": deviceId,
            "idempotency-key": startKey,
          },
          cookies: { fz_session: cookie.value },
          payload: {},
        }),
      ),
    );
    expect(starts.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 201,
    ]);
    const tap = starts
      .find(({ statusCode }) => statusCode === 201)!
      .json().session;
    expect(tap.energy.current).toBe(95);
    expect(
      starts.find(({ statusCode }) => statusCode === 200)!.json().session.id,
    ).toBe(tap.id);

    const tamperedToken = `${tap.token.slice(0, -1)}${tap.token.endsWith("a") ? "b" : "a"}`;
    expect(
      (
        await app.inject({
          method: "GET",
          remoteAddress,
          url: `/v1/games/sessions/${tap.id}`,
          headers: {
            "x-device-id": deviceId,
            "x-game-session-token": tamperedToken,
          },
          cookies: { fz_session: cookie.value },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          remoteAddress,
          url: `/v1/games/sessions/${tap.id}`,
          headers: {
            "x-device-id": crypto.randomUUID(),
            "x-game-session-token": tap.token,
          },
          cookies: { fz_session: cookie.value },
        })
      ).statusCode,
    ).toBe(400);
    const distinctStart = await app.inject({
      method: "POST",
      remoteAddress,
      url: "/v1/games/tap-miner/sessions",
      headers: {
        "x-device-id": deviceId,
        "idempotency-key": `tap-distinct-${crypto.randomUUID()}`,
      },
      cookies: { fz_session: cookie.value },
      payload: {},
    });
    expect(distinctStart.statusCode).toBe(409);
    await expect(
      database.gameEnergy.findUniqueOrThrow({
        where: { userId: registration.json().user.id as string },
      }),
    ).resolves.toMatchObject({ current: 95 });

    const tapEvent = {
      sessionToken: tap.token,
      sequence: 1,
      nonce: tap.nonce,
      eventId: crypto.randomUUID(),
      type: "TAP_BATCH",
      atMs: 320,
      payload: { tapOffsetsMs: [0, 80, 160, 240, 320] },
    };
    const event = await app.inject({
      method: "POST",
      remoteAddress,
      url: `/v1/games/tap-miner/sessions/${tap.id}/events`,
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
      payload: tapEvent,
    });
    expect(event.statusCode).toBe(200);
    expect(() => gameEventResponseSchema.parse(event.json())).not.toThrow();
    expect(event.json()).toMatchObject({
      accepted: true,
      nextSequence: 2,
      state: { taps: 5, score: 5 },
    });
    const replay = await app.inject({
      method: "POST",
      remoteAddress,
      url: `/v1/games/tap-miner/sessions/${tap.id}/events`,
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
      payload: tapEvent,
    });
    expect(replay.json()).toEqual(event.json());

    const sequenceGap = await app.inject({
      method: "POST",
      remoteAddress,
      url: `/v1/games/tap-miner/sessions/${tap.id}/events`,
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
      payload: {
        ...tapEvent,
        sequence: 3,
        eventId: crypto.randomUUID(),
        atMs: 400,
        payload: { tapOffsetsMs: [400] },
      },
    });
    expect(sequenceGap.statusCode).toBe(409);
    expect(sequenceGap.json().error.code).toBe("GAME_SEQUENCE_INVALID");

    gameNow = new Date(gameNow.getTime() + 11_000);
    const lateEvent = await app.inject({
      method: "POST",
      remoteAddress,
      url: `/v1/games/tap-miner/sessions/${tap.id}/events`,
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
      payload: {
        ...tapEvent,
        sequence: 2,
        eventId: crypto.randomUUID(),
        atMs: 400,
        payload: { tapOffsetsMs: [400] },
      },
    });
    expect(lateEvent.statusCode).toBe(422);
    expect(lateEvent.json().error.code).toBe("GAME_EVENT_INVALID");
    const completeKey = `tap-complete-${crypto.randomUUID()}`;
    const completions = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          remoteAddress,
          url: `/v1/games/tap-miner/sessions/${tap.id}/complete`,
          headers: {
            "x-device-id": deviceId,
            "idempotency-key": completeKey,
          },
          cookies: { fz_session: cookie.value },
          payload: { sessionToken: tap.token },
        }),
      ),
    );
    expect(completions.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    expect(
      completions.map((response) => response.json().replayed).sort(),
    ).toEqual([false, true]);
    expect(completions[0]!.json().session).toMatchObject({
      status: "POSTED",
      score: 5,
      reward: { minorUnits: "6", bucket: "AVAILABLE" },
    });
    expect(() =>
      gameSessionResponseSchema.parse(completions[0]!.json()),
    ).not.toThrow();

    const eventAfterCompletion = await app.inject({
      method: "POST",
      remoteAddress,
      url: `/v1/games/tap-miner/sessions/${tap.id}/events`,
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
      payload: {
        ...tapEvent,
        sequence: 2,
        eventId: crypto.randomUUID(),
        atMs: 400,
        payload: { tapOffsetsMs: [400] },
      },
    });
    expect(eventAfterCompletion.statusCode).toBe(409);

    const recovered = await app.inject({
      method: "GET",
      remoteAddress,
      url: `/v1/games/sessions/${tap.id}`,
      headers: {
        "x-device-id": deviceId,
        "x-game-session-token": tap.token,
      },
      cookies: { fz_session: cookie.value },
    });
    expect(recovered.json().session.status).toBe("POSTED");

    const userId = registration.json().user.id as string;
    const persisted = await database.gameSession.findUniqueOrThrow({
      where: { id: tap.id },
      include: { events: true, transaction: { include: { postings: true } } },
    });
    expect(persisted.events).toHaveLength(1);
    expect(
      persisted.transaction!.postings.reduce(
        (sum, posting) => sum + BigInt(posting.amount.toFixed(0)),
        0n,
      ),
    ).toBe(0n);
    const gameLedger = new PrismaLedgerStore(database);
    await gameLedger.reverse({
      transactionId: persisted.transactionId!,
      idempotencyKey: `integration:game-reversal:${tap.id}`,
    });
    const rejectedRecovery = await app.inject({
      method: "GET",
      remoteAddress,
      url: `/v1/games/sessions/${tap.id}`,
      headers: {
        "x-device-id": deviceId,
        "x-game-session-token": tap.token,
      },
      cookies: { fz_session: cookie.value },
    });
    expect(rejectedRecovery.json().session).toMatchObject({
      status: "REJECTED",
      reasonCode: "REWARD_REVERSED",
    });
    await expect(
      database.gameEnergy.findUniqueOrThrow({ where: { userId } }),
    ).resolves.toMatchObject({ current: 95 });

    const memoryStart = await app.inject({
      method: "POST",
      remoteAddress,
      url: "/v1/games/memory-drops/sessions",
      headers: {
        "x-device-id": deviceId,
        "idempotency-key": `memory-start-${crypto.randomUUID()}`,
      },
      cookies: { fz_session: cookie.value },
      payload: {},
    });
    expect(memoryStart.statusCode).toBe(201);
    const memory = memoryStart.json().session;
    expect(memory.energy.current).toBe(87);
    expect(memory.memory).not.toHaveProperty("layout");
    const storedMemory = await database.gameSession.findUniqueOrThrow({
      where: { id: memory.id },
    });
    const layout = storedMemory.layout as string[];
    const firstIndex = 0;
    const pairIndex = layout.findIndex(
      (symbol, index) => index !== firstIndex && symbol === layout[firstIndex],
    );
    const firstFlip = await app.inject({
      method: "POST",
      remoteAddress,
      url: `/v1/games/memory-drops/sessions/${memory.id}/events`,
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
      payload: {
        sessionToken: memory.token,
        sequence: 1,
        nonce: memory.nonce,
        eventId: crypto.randomUUID(),
        type: "FLIP",
        atMs: 0,
        payload: { cardIndex: firstIndex },
      },
    });
    expect(firstFlip.json().reveal).toMatchObject({
      cardIndex: firstIndex,
      symbol: layout[firstIndex],
    });
    const memoryRecovery = await app.inject({
      method: "GET",
      remoteAddress,
      url: `/v1/games/sessions/${memory.id}`,
      headers: {
        "x-device-id": deviceId,
        "x-game-session-token": memory.token,
      },
      cookies: { fz_session: cookie.value },
    });
    expect(memoryRecovery.json().session.memory.pendingReveal).toEqual({
      cardIndex: firstIndex,
      symbol: layout[firstIndex],
    });
    const pairFlip = await app.inject({
      method: "POST",
      remoteAddress,
      url: `/v1/games/memory-drops/sessions/${memory.id}/events`,
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
      payload: {
        sessionToken: memory.token,
        sequence: 2,
        nonce: memory.nonce,
        eventId: crypto.randomUUID(),
        type: "FLIP",
        atMs: 120,
        payload: { cardIndex: pairIndex },
      },
    });
    expect(pairFlip.json().reveal).toMatchObject({ matched: true, pairs: 1 });
  });

  it("derives missions from posted sources and claims once through the ledger", async () => {
    const app = await appPromise;
    gameNow = new Date();
    const email = `missions-${crypto.randomUUID()}@fauzet.local`;
    const deviceId = crypto.randomUUID();
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "x-device-id": deviceId },
      payload: {
        email,
        password: "ValidPassword123",
        displayName: "Missions User",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/request",
      cookies: { fz_session: cookie.value },
    });
    const verification = mailer.verification.at(-1)!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/email-verification/confirm",
          payload: { token: verification.token },
        })
      ).statusCode,
    ).toBe(200);

    const userId = registration.json().user.id as string;
    const config = await database.economicConfigVersion.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { id: "desc" },
    });
    const [pool, available] = await Promise.all([
      database.ledgerAccount.findUniqueOrThrow({
        where: { code: "platform:zyxe:game-reward-pool" },
      }),
      database.ledgerAccount.findFirstOrThrow({
        where: { userId, asset: "ZYXE", bucket: "AVAILABLE" },
      }),
    ]);
    const gameSessionId = crypto.randomUUID();
    const ledger = new PrismaLedgerStore(database);
    const gameReward = await ledger.post({
      idempotencyKey: `integration:mission-game:${gameSessionId}`,
      type: "GAME_REWARD",
      sourceType: "game_session",
      sourceId: gameSessionId,
      configVersion: config.id,
      postings: [
        {
          account: { id: pool.id, asset: pool.asset, kind: pool.kind },
          amount: -50n,
        },
        {
          account: {
            id: available.id,
            asset: available.asset,
            kind: available.kind,
          },
          amount: 50n,
        },
      ],
    });
    const startedAt = new Date(gameNow.getTime() - 10_000);
    await database.gameSession.create({
      data: {
        id: gameSessionId,
        userId,
        game: "TAP_MINER",
        status: "COMPLETED",
        creationKey: `integration:mission-game:start:${gameSessionId}`,
        completionKey: `integration:mission-game:complete:${gameSessionId}`,
        nonce: crypto.randomUUID(),
        tokenHash: createHash("sha256")
          .update(`integration:${gameSessionId}`)
          .digest("hex"),
        ruleVersion: config.id,
        budgetDate: new Date(
          Date.UTC(
            gameNow.getUTCFullYear(),
            gameNow.getUTCMonth(),
            gameNow.getUTCDate() - 1,
          ),
        ),
        energyCost: 5,
        nextSequence: 1,
        lastEventAtMs: -1,
        eventCount: 0,
        score: 50,
        state: { taps: 50 },
        rewardMinor: "50",
        transactionId: gameReward.id,
        deviceId,
        ipHash: "integration-mission-ip",
        startedAt,
        expiresAt: new Date(startedAt.getTime() + 15_000),
        completedAt: gameNow,
      },
    });

    const catalog = await app.inject({
      method: "GET",
      url: "/v1/missions",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(catalog.statusCode).toBe(200);
    const catalogBody = missionCatalogResponseSchema.parse(catalog.json());
    const faucetMission = catalogBody.missions.find(({ id }) => id === "m1")!;
    const gameMission = catalogBody.missions.find(({ id }) => id === "m2")!;
    expect(faucetMission).toMatchObject({
      status: "IN_PROGRESS",
      progress: 0,
      target: 3,
    });
    expect(gameMission).toMatchObject({
      status: "CLAIMABLE",
      progress: 50,
      target: 50,
    });
    expect(
      catalogBody.missions.filter(({ status }) => status === "LOCKED"),
    ).toHaveLength(4);

    const stale = await app.inject({
      method: "POST",
      url: `/v1/missions/${faucetMission.id}/claim`,
      headers: {
        "x-device-id": deviceId,
        "idempotency-key": `mission-stale-${crypto.randomUUID()}`,
      },
      cookies: { fz_session: cookie.value },
      payload: {
        periodKey: faucetMission.periodKey,
        configVersion: catalogBody.configVersion + 1,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("MISSION_PERIOD_INVALID");

    const incomplete = await app.inject({
      method: "POST",
      url: `/v1/missions/${faucetMission.id}/claim`,
      headers: {
        "x-device-id": deviceId,
        "idempotency-key": `mission-incomplete-${crypto.randomUUID()}`,
      },
      cookies: { fz_session: cookie.value },
      payload: {
        periodKey: faucetMission.periodKey,
        configVersion: catalogBody.configVersion,
      },
    });
    expect(incomplete.statusCode).toBe(409);
    expect(incomplete.json().error.code).toBe("MISSION_INCOMPLETE");

    const claimKeys = [
      `mission-claim-a-${crypto.randomUUID()}`,
      `mission-claim-b-${crypto.randomUUID()}`,
    ];
    const claims = await Promise.all(
      claimKeys.map((claimKey) =>
        app.inject({
          method: "POST",
          url: `/v1/missions/${gameMission.id}/claim`,
          headers: {
            "x-device-id": deviceId,
            "idempotency-key": claimKey,
          },
          cookies: { fz_session: cookie.value },
          payload: {
            periodKey: gameMission.periodKey,
            configVersion: catalogBody.configVersion,
          },
        }),
      ),
    );
    expect(claims.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 409,
    ]);
    const winnerIndex = claims.findIndex(
      ({ statusCode }) => statusCode === 200,
    );
    const winner = claims[winnerIndex]!;
    const loser = claims[1 - winnerIndex]!;
    expect(loser.json().error.code).toBe("MISSION_ALREADY_CLAIMED");
    const postedClaim = missionClaimResponseSchema.parse(winner.json());
    expect(postedClaim).toMatchObject({
      replayed: false,
      missionClaim: { reward: { minorUnits: "40" } },
    });
    const claimKey = claimKeys[winnerIndex]!;
    const exactReplay = await app.inject({
      method: "POST",
      url: `/v1/missions/${gameMission.id}/claim`,
      headers: {
        "x-device-id": deviceId,
        "idempotency-key": claimKey,
      },
      cookies: { fz_session: cookie.value },
      payload: {
        periodKey: gameMission.periodKey,
        configVersion: catalogBody.configVersion,
      },
    });
    expect(missionClaimResponseSchema.parse(exactReplay.json())).toMatchObject({
      replayed: true,
      missionClaim: { id: postedClaim.missionClaim.id },
    });
    const persistedClaims = await database.missionClaim.findMany({
      where: { userId, missionId: gameMission.id },
      include: { transaction: { include: { postings: true } } },
    });
    expect(persistedClaims).toHaveLength(1);
    expect(
      persistedClaims[0]!.transaction!.postings.reduce(
        (sum, posting) => sum + BigInt(posting.amount.toFixed(0)),
        0n,
      ),
    ).toBe(0n);

    await ledger.reverse({
      transactionId: persistedClaims[0]!.transactionId!,
      idempotencyKey: `integration:mission-reversal:${persistedClaims[0]!.id}`,
    });
    const reversedCatalog = missionCatalogResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/v1/missions",
          headers: { "x-device-id": deviceId },
          cookies: { fz_session: cookie.value },
        })
      ).json(),
    );
    expect(
      reversedCatalog.missions.find(({ id }) => id === gameMission.id),
    ).toMatchObject({ status: "LOCKED", reasonCode: "CLAIM_REVERSED" });
    const reversedReplay = await app.inject({
      method: "POST",
      url: `/v1/missions/${gameMission.id}/claim`,
      headers: {
        "x-device-id": deviceId,
        "idempotency-key": claimKey,
      },
      cookies: { fz_session: cookie.value },
      payload: {
        periodKey: gameMission.periodKey,
        configVersion: catalogBody.configVersion,
      },
    });
    expect(reversedReplay.statusCode).toBe(409);
    expect(reversedReplay.json().error.code).toBe("MISSION_CLAIM_REVERSED");
  });

  it("serves the store and applies a funded mining refill exactly once", async () => {
    const app = await appPromise;
    gameNow = new Date();
    const remoteAddress = testRemoteAddress();
    const deviceId = crypto.randomUUID();
    const email = `commerce-${crypto.randomUUID()}@fauzet.local`;
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "x-device-id": deviceId },
      payload: {
        email,
        password: "ValidPassword123",
        displayName: "Commerce User",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/request",
      cookies: { fz_session: cookie.value },
    });
    const verification = mailer.verification.at(-1)!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/email-verification/confirm",
          payload: { token: verification.token },
        })
      ).statusCode,
    ).toBe(200);

    const catalogResponse = await app.inject({
      method: "GET",
      remoteAddress,
      url: "/v1/store/catalog",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(catalogResponse.statusCode).toBe(200);
    const catalog = storeCatalogResponseSchema.parse(catalogResponse.json());
    expect(catalog.products).toHaveLength(6);
    expect(
      catalog.products.filter(
        ({ id, enabled }) => ["b3", "b5"].includes(id) && !enabled,
      ),
    ).toHaveLength(2);
    expect(catalog.paymentBalances.PROMOTIONAL).toBe("100");

    gameNow = new Date(gameNow.getTime() + 3_600_000);
    const purchaseKey = `store-refill-${crypto.randomUUID()}`;
    const attempts = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          remoteAddress,
          url: "/v1/store/purchases",
          headers: {
            "x-device-id": deviceId,
            "idempotency-key": purchaseKey,
          },
          cookies: { fz_session: cookie.value },
          payload: { productId: "b1", configVersion: catalog.configVersion },
        }),
      ),
    );
    expect(attempts.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    const receipts = attempts.map((response) =>
      storePurchaseResponseSchema.parse(response.json()),
    );
    expect(receipts.map(({ replayed }) => replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(receipts[0]!.purchase).toMatchObject({
      payment: { promotionalMinorUnits: "80", availableMinorUnits: "0" },
      split: {
        burnMinorUnits: "32",
        recycleMinorUnits: "32",
        treasuryMinorUnits: "16",
      },
    });

    const miningResponse = await app.inject({
      method: "GET",
      remoteAddress,
      url: "/v1/mining/status",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(miningResponse.statusCode).toBe(200);
    const mining = miningStatusResponseSchema.parse(miningResponse.json());
    expect(mining.profile).toMatchObject({
      energy: { current: 100, max: 100 },
      activeMiners: 1,
      maxSlots: 4,
    });

    const [codeResponse, treeResponse, commissionsResponse] = await Promise.all(
      [
        app.inject({
          method: "GET",
          url: "/v1/referrals/code",
          cookies: { fz_session: cookie.value },
        }),
        app.inject({
          method: "GET",
          url: "/v1/referrals/tree",
          cookies: { fz_session: cookie.value },
        }),
        app.inject({
          method: "GET",
          url: "/v1/referrals/commissions",
          cookies: { fz_session: cookie.value },
        }),
      ],
    );
    const referralCode = referralCodeResponseSchema.parse(codeResponse.json());
    const referralTree = referralTreeResponseSchema.parse(treeResponse.json());
    const referralCommissions = referralCommissionsResponseSchema.parse(
      commissionsResponse.json(),
    );
    expect(referralCode).toMatchObject({
      state: "ATTRIBUTION_ONLY",
      reasonCode: "LEGAL_AND_REVENUE_GATE",
    });
    expect(referralTree.totalMembers).toBe(0);
    expect(referralCommissions.summary.availableMinorUnits).toBe("0");
  });

  it("registers, verifies, resets password and revokes the old session", async () => {
    const app = await appPromise;
    const email = `integration-${crypto.randomUUID()}@fauzet.local`;
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "ValidPassword123",
        displayName: "Integration User",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    expect(registration.statusCode).toBe(201);
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;

    const balances = await app.inject({
      method: "GET",
      url: "/v1/balances",
      cookies: { fz_session: cookie.value },
    });
    expect(balances.statusCode).toBe(200);
    expect(balances.json().balances).toHaveLength(7);
    expect(balances.headers["cache-control"]).toBe("no-store");

    const userId = registration.json().user.id as string;
    const promotional = await database.ledgerAccount.findFirstOrThrow({
      where: { userId, asset: "ZYXE", bucket: "PROMOTIONAL" },
    });
    const pool = await database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:promotional-pool" },
    });
    const ledger = new PrismaLedgerStore(database);
    const posted = await ledger.post({
      idempotencyKey: `integration:bonus:${userId}`,
      type: "PROMOTIONAL_BONUS",
      sourceType: "integration_test",
      sourceId: userId,
      configVersion: 1,
      postings: [
        {
          account: { id: pool.id, asset: pool.asset, kind: pool.kind },
          amount: -100n,
        },
        {
          account: {
            id: promotional.id,
            asset: promotional.asset,
            kind: promotional.kind,
          },
          amount: 100n,
        },
      ],
    });
    const repeated = await ledger.post({
      idempotencyKey: `integration:bonus:${userId}`,
      type: "PROMOTIONAL_BONUS",
      sourceType: "integration_test",
      sourceId: userId,
      configVersion: 1,
      postings: [
        {
          account: { id: pool.id, asset: pool.asset, kind: pool.kind },
          amount: -100n,
        },
        {
          account: {
            id: promotional.id,
            asset: promotional.asset,
            kind: promotional.kind,
          },
          amount: 100n,
        },
      ],
    });
    expect(repeated.id).toBe(posted.id);

    const activity = await app.inject({
      method: "GET",
      url: "/v1/account/activity?limit=1",
      cookies: { fz_session: cookie.value },
    });
    expect(activity.statusCode).toBe(200);
    expect(activity.headers["cache-control"]).toBe("no-store");
    const activityPayload = accountActivityResponseSchema.parse(
      activity.json(),
    );
    expect(activityPayload.items[0]).toMatchObject({
      id: posted.id,
      type: "PROMOTIONAL_BONUS",
      sourceType: "integration_test",
      movements: [
        {
          asset: "ZYXE",
          bucket: "PROMOTIONAL",
          minorUnits: "100",
        },
      ],
    });

    const withBonus = await app.inject({
      method: "GET",
      url: "/v1/balances",
      cookies: { fz_session: cookie.value },
    });
    expect(
      withBonus
        .json()
        .balances.find(
          ({ bucket }: { bucket: string }) => bucket === "PROMOTIONAL",
        ).minorUnits,
    ).toBe("100");
    await ledger.reverse({
      transactionId: posted.id,
      idempotencyKey: `integration:bonus-reversal:${userId}`,
    });
    const afterReversal = await app.inject({
      method: "GET",
      url: "/v1/balances",
      cookies: { fz_session: cookie.value },
    });
    expect(
      afterReversal
        .json()
        .balances.find(
          ({ bucket }: { bucket: string }) => bucket === "PROMOTIONAL",
        ).minorUnits,
    ).toBe("0");

    await app.inject({
      method: "POST",
      url: "/v1/auth/email-verification/request",
      cookies: { fz_session: cookie.value },
    });
    const verification = mailer.verification.at(-1)!;
    const confirmations = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/auth/email-verification/confirm",
        payload: { token: verification.token },
      }),
      app.inject({
        method: "POST",
        url: "/v1/auth/email-verification/confirm",
        payload: { token: verification.token },
      }),
    ]);
    expect(confirmations.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 400,
    ]);
    const confirmed = confirmations.find(
      ({ statusCode }) => statusCode === 200,
    )!;
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().bonusTransactionId).toEqual(expect.any(String));
    const afterVerification = await app.inject({
      method: "GET",
      url: "/v1/balances",
      cookies: { fz_session: cookie.value },
    });
    expect(
      afterVerification
        .json()
        .balances.find(
          ({ bucket }: { bucket: string }) => bucket === "PROMOTIONAL",
        ).minorUnits,
    ).toBe("100");

    const burn = await database.ledgerAccount.findUniqueOrThrow({
      where: { code: "platform:zyxe:burn" },
    });
    const concurrentSpends = await Promise.allSettled(
      ["a", "b"].map((attempt) =>
        ledger.post({
          idempotencyKey: `integration:spend:${userId}:${attempt}`,
          type: "PROMOTIONAL_SPEND",
          sourceType: "integration_test_spend",
          sourceId: `${userId}:${attempt}`,
          configVersion: 1,
          postings: [
            {
              account: {
                id: promotional.id,
                asset: promotional.asset,
                kind: promotional.kind,
              },
              amount: -80n,
            },
            {
              account: { id: burn.id, asset: burn.asset, kind: burn.kind },
              amount: 80n,
            },
          ],
        }),
      ),
    );
    expect(
      concurrentSpends.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      concurrentSpends.filter(({ status }) => status === "rejected"),
    ).toHaveLength(1);

    await app.inject({
      method: "POST",
      url: "/v1/auth/password/forgot",
      payload: { email },
    });
    const reset = mailer.resets.at(-1)!;
    const passwords = ["NewValidPassword123", "OtherValidPassword123"];
    const resetAttempts = await Promise.all(
      passwords.map((password) =>
        app.inject({
          method: "POST",
          url: "/v1/auth/password/reset",
          payload: { token: reset.token, password },
        }),
      ),
    );
    expect(resetAttempts.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 400,
    ]);
    const winningPassword =
      passwords[
        resetAttempts.findIndex(({ statusCode }) => statusCode === 200)
      ]!;
    const changed = resetAttempts.find(({ statusCode }) => statusCode === 200)!;
    expect(changed.statusCode).toBe(200);

    await expect(
      authStore.createSession(
        userId,
        `stale-${crypto.randomUUID()}`,
        new Date(Date.now() + 60_000),
        {},
        1,
      ),
    ).resolves.toBe(false);

    const oldSession = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { fz_session: cookie.value },
    });
    expect(oldSession.statusCode).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: winningPassword },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.status).toBe("ACTIVE");
  });

  it("enforces admin step-up, RBAC, session revocation and append-only audit", async () => {
    const app = await appPromise;
    const adminEmail = `admin-${crypto.randomUUID()}@fauzet.local`;
    const targetEmail = `admin-target-${crypto.randomUUID()}@fauzet.local`;
    const password = "ValidAdminPassword123";
    const register = async (email: string, displayName: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email,
          password,
          displayName,
          countryCode: "CO",
          locale: "es",
          acceptedTerms: true,
          isAdult: true,
        },
      });
      expect(response.statusCode).toBe(201);
      return {
        id: response.json().user.id as string,
        cookie: response.cookies.find(({ name }) => name === "fz_session")!
          .value,
      };
    };
    const adminUser = await register(adminEmail, "Admin Integration");
    const target = await register(targetEmail, "Risk Target");
    await database.$transaction([
      database.user.update({
        where: { id: adminUser.id },
        data: { status: "ACTIVE", emailVerifiedAt: new Date() },
      }),
      database.userRole.create({
        data: { userId: adminUser.id, role: "SUPERADMIN" },
      }),
      database.user.update({
        where: { id: target.id },
        data: { status: "ACTIVE", emailVerifiedAt: new Date() },
      }),
    ]);

    const regularAttempt = await app.inject({
      method: "POST",
      url: "/v1/admin/auth/step-up",
      cookies: { fz_session: target.cookie },
      payload: { password },
    });
    expect(regularAttempt.statusCode).toBe(403);
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/v1/admin/auth/step-up",
      cookies: { fz_session: adminUser.cookie },
      payload: { password: "WrongPassword123" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    const stepUp = await app.inject({
      method: "POST",
      url: "/v1/admin/auth/step-up",
      cookies: { fz_session: adminUser.cookie },
      payload: { password },
    });
    expect(stepUp.statusCode).toBe(200);
    expect(stepUp.json()).toMatchObject({
      roles: expect.arrayContaining(["SUPERADMIN"]),
      assurance: "PASSWORD_REAUTH",
    });
    const adminCookie = stepUp.cookies.find(
      ({ name }) => name === "fz_admin_session",
    )!.value;
    const cookies = {
      fz_session: adminUser.cookie,
      fz_admin_session: adminCookie,
    };
    const [overviewResponse, usersResponse, ledgerResponse] = await Promise.all(
      [
        app.inject({ method: "GET", url: "/v1/admin/overview", cookies }),
        app.inject({ method: "GET", url: "/v1/admin/users", cookies }),
        app.inject({ method: "GET", url: "/v1/admin/ledger", cookies }),
      ],
    );
    expect(overviewResponse.statusCode).toBe(200);
    expect(usersResponse.statusCode).toBe(200);
    expect(ledgerResponse.statusCode).toBe(200);
    expect(
      adminOverviewResponseSchema.parse(overviewResponse.json()).users.total,
    ).toBeGreaterThan(1);
    expect(adminUsersResponseSchema.parse(usersResponse.json()).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: target.id })]),
    );

    const riskUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${target.id}/risk`,
      cookies,
      payload: {
        riskLevel: 85,
        reason: "Integration high-risk manual assessment",
      },
    });
    expect(riskUpdate.statusCode).toBe(200);
    expect(riskUpdate.json().user.riskLevel).toBe(85);
    const risk = await app.inject({
      method: "GET",
      url: "/v1/admin/risk",
      cookies,
    });
    expect(
      adminRiskResponseSchema
        .parse(risk.json())
        .items.some(
          ({ userId, nextScore }) => userId === target.id && nextScore === 85,
        ),
    ).toBe(true);

    const suspension = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${target.id}/status`,
      cookies,
      payload: {
        status: "SUSPENDED",
        reason: "Integration confirmed abuse investigation",
      },
    });
    expect(suspension.statusCode).toBe(200);
    const revokedTarget = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { fz_session: target.cookie },
    });
    expect(revokedTarget.statusCode).toBe(401);
    const selfMutation = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${adminUser.id}/status`,
      cookies,
      payload: {
        status: "SUSPENDED",
        reason: "Must be rejected as a self mutation",
      },
    });
    expect(selfMutation.statusCode).toBe(409);

    const audit = await app.inject({
      method: "GET",
      url: "/v1/admin/audit",
      cookies,
    });
    const auditItems = adminAuditResponseSchema.parse(audit.json()).items;
    const statusAudit = auditItems.find(
      ({ action, targetId }) =>
        action === "ADMIN_USER_STATUS_CHANGED" && targetId === target.id,
    );
    expect(statusAudit).toBeTruthy();
    await expect(
      database.auditEvent.update({
        where: { id: statusAudit!.id },
        data: { reason: "Tampered audit" },
      }),
    ).rejects.toBeTruthy();

    const logout = await app.inject({
      method: "POST",
      url: "/v1/admin/auth/logout",
      cookies,
    });
    expect(logout.statusCode).toBe(204);
    const expired = await app.inject({
      method: "GET",
      url: "/v1/admin/session",
      cookies,
    });
    expect(expired.statusCode).toBe(401);
  });
});

function testRemoteAddress(): string {
  const hex = crypto.randomUUID().replaceAll("-", "");
  return `2001:db8:${hex.slice(0, 4)}:${hex.slice(4, 8)}:${hex.slice(8, 12)}:${hex.slice(12, 16)}::1`;
}
