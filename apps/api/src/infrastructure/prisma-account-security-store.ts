import { getDatabase, type PrismaClient } from "@fauzet/database";
import type { AccountSecurityStore } from "../domain/account-security.js";

const tokenOwnerSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
} as const;

export class PrismaAccountSecurityStore implements AccountSecurityStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}
  async findUserByEmail(email: string) {
    return this.database.user.findUnique({
      where: { email },
      select: tokenOwnerSelect,
    });
  }
  async createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    await this.database.$transaction([
      this.database.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.database.emailVerificationToken.create({
        data: { userId, tokenHash, expiresAt },
      }),
    ]);
  }
  async consumeEmailVerificationToken(tokenHash: string, now: Date) {
    return this.database.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
      });
      if (!token || token.usedAt || token.expiresAt <= now) return null;
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return null;
      await tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
      });
      await tx.user.updateMany({
        where: { id: token.userId, status: "PENDING_VERIFICATION" },
        data: { status: "ACTIVE" },
      });
      await tx.auditEvent.create({
        data: {
          actorId: token.userId,
          action: "user.email_verified",
          targetType: "user",
          targetId: token.userId,
          requestId: crypto.randomUUID(),
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: token.userId },
        select: tokenOwnerSelect,
      });
    });
  }
  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    await this.database.$transaction([
      this.database.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.database.passwordResetToken.create({
        data: { userId, tokenHash, expiresAt },
      }),
    ]);
  }
  async consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ) {
    return this.database.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!token || token.usedAt || token.expiresAt <= now) return null;
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return null;
      const user = await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, credentialVersion: { increment: 1 } },
        select: tokenOwnerSelect,
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditEvent.create({
        data: {
          actorId: token.userId,
          action: "user.password_reset",
          targetType: "user",
          targetId: token.userId,
          requestId: crypto.randomUUID(),
        },
      });
      return user;
    });
  }
}
