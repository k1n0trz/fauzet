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
