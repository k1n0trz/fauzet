import type { RegisterRequest } from "@fauzet/contracts";
import { getDatabase, Prisma, type PrismaClient } from "@fauzet/database";
import {
  AuthStoreConflictError,
  AuthStoreGoogleError,
  AuthStoreReferralError,
  type AuthStore,
  type SessionContext,
  type StoredUser,
} from "../domain/auth.js";

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
    context: SessionContext = {},
  ): Promise<StoredUser> {
    const now = new Date();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const user = await this.database.$transaction(async (tx) => {
          const sponsor = input.referralCode
            ? await tx.referralProfile.findUnique({
                where: { code: input.referralCode },
                include: { user: true },
              })
            : null;
          if (
            input.referralCode &&
            (!sponsor ||
              sponsor.user.status !== "ACTIVE" ||
              !sponsor.user.emailVerifiedAt)
          )
            throw new AuthStoreReferralError(
              "REFERRAL_CODE_INVALID",
              "Referral code is invalid or its sponsor is not eligible",
            );
          if (sponsor && context.deviceId) {
            const sameDevice = await tx.session.findFirst({
              where: {
                userId: sponsor.userId,
                deviceId: context.deviceId,
                revokedAt: null,
              },
              select: { id: true },
            });
            if (sameDevice)
              throw new AuthStoreReferralError(
                "REFERRAL_ATTRIBUTION_BLOCKED",
                "Referral attribution is blocked by account-integrity controls",
              );
          }
          const created = await tx.user.create({
            data: {
              email: input.email,
              passwordHash: input.passwordHash,
              displayName: input.displayName,
              locale: input.locale,
              countryCode: input.countryCode,
              acceptedTermsAt: now,
              acceptedTermsVersion: input.termsVersion ?? "beta-2026-07-13",
              acceptedPrivacyVersion: input.privacyVersion ?? "beta-2026-07-13",
              adultDeclaredAt: now,
              roles: { create: { role: "USER" } },
            },
            include: { roles: true },
          });
          await tx.referralProfile.create({
            data: { userId: created.id, code: referralCode() },
          });
          if (sponsor) {
            const inherited = await tx.referralAncestor.findMany({
              where: { descendantId: sponsor.userId, depth: { lt: 4 } },
              orderBy: { depth: "asc" },
            });
            await tx.referralEdge.create({
              data: {
                sponsorId: sponsor.userId,
                referredUserId: created.id,
                codeSnapshot: sponsor.code,
                attributionEvidence: {
                  source: "registration",
                  devicePresent: Boolean(context.deviceId),
                },
              },
            });
            await tx.referralAncestor.createMany({
              data: [
                {
                  descendantId: created.id,
                  ancestorId: sponsor.userId,
                  depth: 1,
                },
                ...inherited.map(({ ancestorId, depth }) => ({
                  descendantId: created.id,
                  ancestorId,
                  depth: depth + 1,
                })),
              ],
            });
          }
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
      } catch (error) {
        if (error instanceof AuthStoreReferralError) throw error;
        if (isUniqueConflict(error, "code") && attempt < 2) continue;
        if (isUniqueConflict(error)) throw new AuthStoreConflictError();
        throw error;
      }
    }
    throw new AuthStoreConflictError();
  }

  async authenticateWithGoogle(
    input: Parameters<AuthStore["authenticateWithGoogle"]>[0],
    context: SessionContext = {},
  ) {
    const { identity, registration, passwordHash, now } = input;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.database.$transaction(async (tx) => {
          const bySubject = await tx.user.findUnique({
            where: { googleSubject: identity.subject },
            include: { roles: true },
          });
          if (bySubject) {
            assertGoogleUserAllowed(bySubject.status);
            const becameVerified =
              bySubject.emailVerifiedAt === null ||
              bySubject.status === "PENDING_VERIFICATION";
            const user = await tx.user.update({
              where: { id: bySubject.id },
              data: {
                googleLastLoginAt: now,
                emailVerifiedAt: bySubject.emailVerifiedAt ?? now,
                ...(bySubject.status === "PENDING_VERIFICATION"
                  ? { status: "ACTIVE" as const }
                  : {}),
              },
              include: { roles: true },
            });
            return { user, created: false, becameVerified };
          }

          const lockedByEmail = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT "id"
              FROM "User"
              WHERE "email" = ${identity.email}
              FOR UPDATE
            `,
          );
          const byEmail = lockedByEmail[0]
            ? await tx.user.findUnique({
                where: { id: lockedByEmail[0].id },
                include: { roles: true },
              })
            : null;
          if (byEmail) {
            assertGoogleUserAllowed(byEmail.status);
            if (
              byEmail.googleSubject &&
              byEmail.googleSubject !== identity.subject
            ) {
              throw new AuthStoreGoogleError(
                "GOOGLE_IDENTITY_CONFLICT",
                "This account is already linked to another Google identity",
              );
            }
            const becameVerified =
              byEmail.emailVerifiedAt === null ||
              byEmail.status === "PENDING_VERIFICATION";
            const user = await tx.user.update({
              where: { id: byEmail.id },
              data: {
                googleSubject: identity.subject,
                googleLinkedAt: byEmail.googleLinkedAt ?? now,
                googleLastLoginAt: now,
                emailVerifiedAt: byEmail.emailVerifiedAt ?? now,
                displayName: byEmail.displayName ?? identity.displayName,
                ...(byEmail.status === "PENDING_VERIFICATION"
                  ? { status: "ACTIVE" as const }
                  : {}),
              },
              include: { roles: true },
            });
            await tx.auditEvent.create({
              data: {
                action: "user.google_linked",
                targetType: "user",
                targetId: user.id,
                requestId: crypto.randomUUID(),
                after: { provider: "GOOGLE", becameVerified },
              },
            });
            return { user, created: false, becameVerified };
          }

          if (!registration || !passwordHash) {
            throw new AuthStoreGoogleError(
              "GOOGLE_REGISTRATION_REQUIRED",
              "Complete registration details before creating a Google account",
            );
          }

          const sponsor = registration.referralCode
            ? await tx.referralProfile.findUnique({
                where: { code: registration.referralCode },
                include: { user: true },
              })
            : null;
          if (
            registration.referralCode &&
            (!sponsor ||
              sponsor.user.status !== "ACTIVE" ||
              !sponsor.user.emailVerifiedAt)
          ) {
            throw new AuthStoreGoogleError(
              "REFERRAL_CODE_INVALID",
              "Referral code is invalid or its sponsor is not eligible",
            );
          }
          if (sponsor && context.deviceId) {
            const sameDevice = await tx.session.findFirst({
              where: {
                userId: sponsor.userId,
                deviceId: context.deviceId,
                revokedAt: null,
              },
              select: { id: true },
            });
            if (sameDevice) {
              throw new AuthStoreGoogleError(
                "REFERRAL_ATTRIBUTION_BLOCKED",
                "Referral attribution is blocked by account-integrity controls",
              );
            }
          }

          const created = await tx.user.create({
            data: {
              email: identity.email,
              passwordHash,
              displayName: registration.displayName || identity.displayName,
              locale: registration.locale,
              countryCode: registration.countryCode,
              status: "ACTIVE",
              emailVerifiedAt: now,
              googleSubject: identity.subject,
              googleLinkedAt: now,
              googleLastLoginAt: now,
              acceptedTermsAt: now,
              acceptedTermsVersion:
                registration.termsVersion ?? "beta-2026-07-13",
              acceptedPrivacyVersion:
                registration.privacyVersion ?? "beta-2026-07-13",
              adultDeclaredAt: now,
              roles: { create: { role: "USER" } },
            },
            include: { roles: true },
          });
          await tx.referralProfile.create({
            data: { userId: created.id, code: referralCode() },
          });
          if (sponsor) {
            const inherited = await tx.referralAncestor.findMany({
              where: { descendantId: sponsor.userId, depth: { lt: 4 } },
              orderBy: { depth: "asc" },
            });
            await tx.referralEdge.create({
              data: {
                sponsorId: sponsor.userId,
                referredUserId: created.id,
                codeSnapshot: sponsor.code,
                attributionEvidence: {
                  source: "google-registration",
                  devicePresent: Boolean(context.deviceId),
                },
              },
            });
            await tx.referralAncestor.createMany({
              data: [
                {
                  descendantId: created.id,
                  ancestorId: sponsor.userId,
                  depth: 1,
                },
                ...inherited.map(({ ancestorId, depth }) => ({
                  descendantId: created.id,
                  ancestorId,
                  depth: depth + 1,
                })),
              ],
            });
          }
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
              after: { status: created.status, provider: "GOOGLE" },
            },
          });
          return { user: created, created: true, becameVerified: true };
        });
        return { ...result, user: this.toStoredUser(result.user) };
      } catch (error) {
        if (error instanceof AuthStoreGoogleError) throw error;
        if (isUniqueConflict(error) && attempt < 2) continue;
        if (isUniqueConflict(error)) {
          throw new AuthStoreGoogleError(
            "GOOGLE_IDENTITY_CONFLICT",
            "Google identity could not be linked safely",
          );
        }
        throw error;
      }
    }
    throw new AuthStoreGoogleError(
      "GOOGLE_IDENTITY_CONFLICT",
      "Google identity could not be linked safely",
    );
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    context: SessionContext,
    credentialVersion: number,
  ): Promise<boolean> {
    return this.database.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${userId}
          AND "credentialVersion" = ${credentialVersion}
        FOR UPDATE
      `);
      if (locked.length !== 1) return false;
      await tx.session.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
          credentialVersion,
          deviceId: context.deviceId ?? null,
          ipHash: context.ipHash ?? null,
        },
      });
      return true;
    });
  }

  async findSession(tokenHash: string, now: Date) {
    const session = await this.database.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: { include: { roles: true } } },
    });
    if (
      !session ||
      session.credentialVersion !== session.user.credentialVersion
    )
      return null;
    const {
      passwordHash: _,
      credentialVersion: _credentialVersion,
      ...user
    } = this.toStoredUser(session.user);
    return {
      user,
      expiresAt: session.expiresAt,
      context: {
        ...(session.deviceId === null ? {} : { deviceId: session.deviceId }),
        ...(session.ipHash === null ? {} : { ipHash: session.ipHash }),
      },
    };
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
    credentialVersion: number;
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
      credentialVersion: user.credentialVersion,
    };
  }
}

function referralCode() {
  return `FZ-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .toUpperCase()
    .replace(/[01]/g, "Z")
    .slice(0, 12)}`;
}

function assertGoogleUserAllowed(status: string) {
  if (["SUSPENDED", "CLOSED"].includes(status)) {
    throw new AuthStoreGoogleError(
      "ACCOUNT_RESTRICTED",
      "Account access is restricted",
    );
  }
}

function isUniqueConflict(error: unknown, target?: string) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "P2002"
  )
    return false;
  if (!target) return true;
  return JSON.stringify("meta" in error ? error.meta : {}).includes(target);
}
