import type { RegisterRequest } from "@fauzet/contracts";
import { getDatabase, type PrismaClient } from "@fauzet/database";
import type { AuthStore, SessionContext, StoredUser } from "../domain/auth.js";

const buckets = [
  "PENDING",
  "AVAILABLE",
  "PROMOTIONAL",
  "LOCKED",
  "ELIGIBLE",
  "RESERVED",
  "WITHDRAWN",
] as const;

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const user = await this.database.user.findUnique({
      where: { email },
      include: { roles: true },
    });
    return user ? this.toStoredUser(user) : null;
  }

  async createUser(
    input: RegisterRequest & { passwordHash: string },
  ): Promise<StoredUser> {
    const now = new Date();
    const user = await this.database.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          locale: input.locale,
          countryCode: input.countryCode,
          acceptedTermsAt: now,
          adultDeclaredAt: now,
          roles: { create: { role: "USER" } },
        },
        include: { roles: true },
      });
      await tx.ledgerAccount.createMany({
        data: buckets.map((bucket) => ({
          code: `user:${created.id}:zyxe:${bucket.toLowerCase()}`,
          name: `${created.email} ${bucket.toLowerCase()} ZYXE`,
          kind: "LIABILITY" as const,
          asset: "ZYXE",
          bucket,
          userId: created.id,
        })),
      });
      await tx.auditEvent.create({
        data: {
          action: "user.registered",
          targetType: "user",
          targetId: created.id,
          requestId: crypto.randomUUID(),
          after: { status: created.status },
        },
      });
      return created;
    });
    return this.toStoredUser(user);
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    context: SessionContext,
  ): Promise<void> {
    await this.database.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        deviceId: context.deviceId ?? null,
        ipHash: context.ipHash ?? null,
      },
    });
  }

  async findSession(tokenHash: string, now: Date) {
    const session = await this.database.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: { include: { roles: true } } },
    });
    if (!session) return null;
    const { passwordHash: _, ...user } = this.toStoredUser(session.user);
    return { user, expiresAt: session.expiresAt };
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this.database.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private toStoredUser(user: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
    locale: string;
    countryCode: string | null;
    status: string;
    roles: { role: string }[];
  }): StoredUser {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      locale: user.locale === "en" ? "en" : "es",
      countryCode: user.countryCode,
      status: user.status,
      roles: user.roles.map(({ role }) => role),
    };
  }
}
