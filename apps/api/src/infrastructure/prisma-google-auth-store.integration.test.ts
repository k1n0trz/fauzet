import { afterAll, describe, expect, it } from "vitest";
import { getDatabase } from "@fauzet/database";
import { AuthStoreGoogleError } from "../domain/auth.js";
import { PrismaAuthStore } from "./prisma-auth-store.js";

const integration = process.env.RUN_INTEGRATION === "true";
const runId = crypto.randomUUID();
const email = `google-${runId}@example.com`;

describe.runIf(integration)("Prisma Google authentication store", () => {
  const database = getDatabase();
  const store = new PrismaAuthStore(database);

  afterAll(async () => {
    await database.$disconnect();
  });

  it("creates, verifies and reuses one durable Google identity", async () => {
    const now = new Date();
    const first = await store.authenticateWithGoogle({
      identity: {
        subject: `google-subject-${runId}`,
        email,
        displayName: "Google Integration",
      },
      registration: {
        displayName: "Google Integration",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
      passwordHash: "scrypt$integration-only$integration-only",
      now,
    });
    expect(first).toMatchObject({ created: true, becameVerified: true });

    const stored = await database.user.findUniqueOrThrow({ where: { email } });
    expect(stored).toMatchObject({
      id: first.user.id,
      status: "ACTIVE",
      googleSubject: `google-subject-${runId}`,
    });
    expect(stored.emailVerifiedAt).not.toBeNull();
    expect(stored.googleLinkedAt).not.toBeNull();

    const repeated = await store.authenticateWithGoogle({
      identity: {
        subject: `google-subject-${runId}`,
        email,
        displayName: "Google Integration",
      },
      now: new Date(now.getTime() + 1_000),
    });
    expect(repeated).toMatchObject({
      created: false,
      becameVerified: false,
      user: { id: first.user.id },
    });

    await expect(
      store.authenticateWithGoogle({
        identity: {
          subject: `different-subject-${runId}`,
          email,
          displayName: "Google Integration",
        },
        now: new Date(now.getTime() + 2_000),
      }),
    ).rejects.toBeInstanceOf(AuthStoreGoogleError);
  });

  it("serializes competing Google subjects for the same verified email", async () => {
    const raceEmail = `google-race-${runId}@example.com`;
    const registration = {
      displayName: "Google Race",
      countryCode: "CO",
      locale: "es" as const,
      acceptedTerms: true as const,
      isAdult: true as const,
    };
    const attempts = await Promise.allSettled(
      ["subject-a", "subject-b"].map((label) =>
        store.authenticateWithGoogle({
          identity: {
            subject: `${label}-${runId}`,
            email: raceEmail,
            displayName: "Google Race",
          },
          registration,
          passwordHash: "scrypt$integration-only$integration-only",
          now: new Date(),
        }),
      ),
    );
    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = attempts.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "GOOGLE_IDENTITY_CONFLICT" },
    });
    expect(await database.user.count({ where: { email: raceEmail } })).toBe(1);
  });
});
