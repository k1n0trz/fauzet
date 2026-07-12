import type { RegisterRequest } from "@fauzet/contracts";
import type { AuthStore, SessionContext, StoredUser } from "../domain/auth.js";

export class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, StoredUser>();
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
