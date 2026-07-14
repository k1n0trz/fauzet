import type { RegisterRequest } from "@fauzet/contracts";
import {
  AuthStoreGoogleError,
  type AuthStore,
  type SessionContext,
  type StoredUser,
} from "../domain/auth.js";

export class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, StoredUser>();
  private readonly googleSubjects = new Map<string, string>();
  private readonly googleByUser = new Map<string, string>();
  private readonly sessions = new Map<
    string,
    {
      userId: string;
      expiresAt: Date;
      credentialVersion: number;
      context: SessionContext;
      revokedAt?: Date;
    }
  >();

  async findUserByEmail(email: string) {
    return this.users.get(email) ?? null;
  }
  async createUser(input: RegisterRequest & { passwordHash: string }) {
    const user: StoredUser = {
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      locale: input.locale,
      countryCode: input.countryCode,
      status: "PENDING_VERIFICATION",
      roles: ["USER"],
      credentialVersion: 1,
    };
    this.users.set(user.email, user);
    return user;
  }
  async authenticateWithGoogle(
    input: Parameters<AuthStore["authenticateWithGoogle"]>[0],
  ) {
    const { identity, registration, passwordHash } = input;
    const linkedUserId = this.googleSubjects.get(identity.subject);
    const linked = linkedUserId
      ? [...this.users.values()].find(({ id }) => id === linkedUserId)
      : undefined;
    if (linked) {
      assertGoogleUserAllowed(linked);
      return { user: linked, created: false, becameVerified: false };
    }

    const existing = this.users.get(identity.email);
    if (existing) {
      assertGoogleUserAllowed(existing);
      const otherSubject = this.googleByUser.get(existing.id);
      if (otherSubject && otherSubject !== identity.subject) {
        throw new AuthStoreGoogleError(
          "GOOGLE_IDENTITY_CONFLICT",
          "This account is already linked to another Google identity",
        );
      }
      const becameVerified = existing.status === "PENDING_VERIFICATION";
      if (becameVerified) existing.status = "ACTIVE";
      this.googleSubjects.set(identity.subject, existing.id);
      this.googleByUser.set(existing.id, identity.subject);
      return { user: existing, created: false, becameVerified };
    }

    if (!registration || !passwordHash) {
      throw new AuthStoreGoogleError(
        "GOOGLE_REGISTRATION_REQUIRED",
        "Complete registration details before creating a Google account",
      );
    }
    const user: StoredUser = {
      id: crypto.randomUUID(),
      email: identity.email,
      passwordHash,
      displayName: registration.displayName || identity.displayName,
      locale: registration.locale,
      countryCode: registration.countryCode,
      status: "ACTIVE",
      roles: ["USER"],
      credentialVersion: 1,
    };
    this.users.set(user.email, user);
    this.googleSubjects.set(identity.subject, user.id);
    this.googleByUser.set(user.id, identity.subject);
    return { user, created: true, becameVerified: true };
  }
  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    context: SessionContext,
    credentialVersion: number,
  ) {
    const user = [...this.users.values()].find(({ id }) => id === userId);
    if (!user || user.credentialVersion !== credentialVersion) return false;
    this.sessions.set(tokenHash, {
      userId,
      expiresAt,
      credentialVersion,
      context,
    });
    return true;
  }
  async findSession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    const stored = [...this.users.values()].find(
      ({ id }) => id === session.userId,
    );
    if (!stored || stored.credentialVersion !== session.credentialVersion)
      return null;
    const {
      passwordHash: _,
      credentialVersion: _credentialVersion,
      ...user
    } = stored;
    return { user, expiresAt: session.expiresAt, context: session.context };
  }
  async revokeSession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    if (session) session.revokedAt = now;
  }
}

function assertGoogleUserAllowed(user: StoredUser) {
  if (["SUSPENDED", "CLOSED"].includes(user.status)) {
    throw new AuthStoreGoogleError(
      "ACCOUNT_RESTRICTED",
      "Account access is restricted",
    );
  }
}
