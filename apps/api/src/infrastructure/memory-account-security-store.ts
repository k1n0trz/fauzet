import type {
  AccountSecurityStore,
  TokenOwner,
} from "../domain/account-security.js";

type Token = { userId: string; expiresAt: Date; usedAt?: Date };
export class MemoryAccountSecurityStore implements AccountSecurityStore {
  readonly users = new Map<
    string,
    TokenOwner & { passwordHash?: string; verified?: boolean }
  >();
  private readonly verification = new Map<string, Token>();
  private readonly resets = new Map<string, Token>();
  addUser(user: TokenOwner) {
    this.users.set(user.email, user);
  }
  async findUserByEmail(email: string) {
    return this.users.get(email) ?? null;
  }
  async createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    this.verification.set(tokenHash, { userId, expiresAt });
  }
  async consumeEmailVerificationToken(tokenHash: string, now: Date) {
    return this.consume(this.verification, tokenHash, now, (user) => {
      user.verified = true;
      if (user.status === "PENDING_VERIFICATION") user.status = "ACTIVE";
    });
  }
  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    this.resets.set(tokenHash, { userId, expiresAt });
  }
  async consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ) {
    return this.consume(this.resets, tokenHash, now, (user) => {
      user.passwordHash = passwordHash;
    });
  }
  private consume(
    tokens: Map<string, Token>,
    tokenHash: string,
    now: Date,
    action: (
      user: TokenOwner & { passwordHash?: string; verified?: boolean },
    ) => void,
  ) {
    const token = tokens.get(tokenHash);
    if (!token || token.usedAt || token.expiresAt <= now) return null;
    const user = [...this.users.values()].find(({ id }) => id === token.userId);
    if (!user) return null;
    token.usedAt = now;
    action(user);
    return user;
  }
}
