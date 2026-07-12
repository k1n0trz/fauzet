import { afterAll, describe, expect, it } from "vitest";
import { getDatabase } from "@fauzet/database";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PrismaAccountSecurityStore } from "./infrastructure/prisma-account-security-store.js";
import { PrismaAuthStore } from "./infrastructure/prisma-auth-store.js";
import { PrismaBalanceStore } from "./infrastructure/prisma-balance-store.js";
import { MemoryMailer } from "./infrastructure/memory-mailer.js";
import { PrismaLedgerStore } from "./infrastructure/prisma-ledger-store.js";
import { PrismaWelcomeBonusIssuer } from "./infrastructure/prisma-welcome-bonus.js";
import { PrismaFaucetStore } from "./infrastructure/prisma-faucet-store.js";

const integration = process.env.RUN_INTEGRATION === "true";

describe.runIf(integration)("persistent auth vertical", () => {
  const database = getDatabase();
  const mailer = new MemoryMailer();
  const authStore = new PrismaAuthStore(database);
  const appPromise = createApp(
    loadConfig({
      NODE_ENV: "test",
      SESSION_SECRET: "integration-session-secret-at-least-32-characters",
    }),
    {
      authStore,
      balanceStore: new PrismaBalanceStore(database),
      accountSecurityStore: new PrismaAccountSecurityStore(database),
      mailer,
      welcomeBonus: new PrismaWelcomeBonusIssuer(database),
      faucetStore: new PrismaFaucetStore(database, () => 5),
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
    ).resolves.toMatchObject({ status: "SUSPENDED" });
  });

  it("posts exactly one funded faucet reward under concurrent retries", async () => {
    const app = await appPromise;
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
      url: "/v1/faucet/challenges",
      cookies: { fz_session: cookie.value },
    });
    expect(missingDevice.statusCode).toBe(400);
    expect(missingDevice.json().error.code).toBe("FAUCET_DEVICE_REQUIRED");

    const rotatedDevice = await app.inject({
      method: "POST",
      url: "/v1/faucet/challenges",
      headers: { "x-device-id": crypto.randomUUID() },
      cookies: { fz_session: cookie.value },
    });
    expect(rotatedDevice.statusCode).toBe(400);
    expect(rotatedDevice.json().error.code).toBe("FAUCET_DEVICE_REQUIRED");

    const status = await app.inject({
      method: "GET",
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
      url: "/v1/faucet/challenges",
      headers: { "x-device-id": deviceId },
      cookies: { fz_session: cookie.value },
    });
    expect(challengeResponse.statusCode).toBe(201);
    const challengeId = challengeResponse.json().challenge.id as string;
    const idempotencyKey = `claim-${crypto.randomUUID()}`;
    const attempts = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
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
});
