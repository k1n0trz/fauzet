import { createHmac, randomBytes } from "node:crypto";
import { hashPassword } from "./auth.js";

export interface TokenOwner {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
}
export interface AccountSecurityStore {
  findUserByEmail(email: string): Promise<TokenOwner | null>;
  createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  consumeEmailVerificationToken(
    tokenHash: string,
    now: Date,
  ): Promise<TokenOwner | null>;
  createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<TokenOwner | null>;
}
export interface TransactionalMailer {
  sendEmailVerification(to: TokenOwner, token: string): Promise<void>;
  sendPasswordReset(to: TokenOwner, token: string): Promise<void>;
}
export class AccountTokenError extends Error {
  readonly code = "TOKEN_INVALID_OR_EXPIRED";
  readonly statusCode = 400;
}

export class AccountSecurityService {
  constructor(
    private readonly store: AccountSecurityStore,
    private readonly mailer: TransactionalMailer,
    private readonly tokenSecret: string,
  ) {}

  async requestEmailVerification(user: TokenOwner): Promise<void> {
    const token = this.newToken();
    await this.store.createEmailVerificationToken(
      user.id,
      this.hashToken(token),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    await this.mailer.sendEmailVerification(user, token);
  }

  async confirmEmail(token: string): Promise<TokenOwner> {
    const user = await this.store.consumeEmailVerificationToken(
      this.hashToken(token),
      new Date(),
    );
    if (!user)
      throw new AccountTokenError("Verification link is invalid or expired");
    return user;
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.store.findUserByEmail(email);
    if (!user) return;
    const token = this.newToken();
    await this.store.createPasswordResetToken(
      user.id,
      this.hashToken(token),
      new Date(Date.now() + 60 * 60 * 1000),
    );
    await this.mailer.sendPasswordReset(user, token);
  }

  async resetPassword(token: string, password: string): Promise<TokenOwner> {
    const user = await this.store.consumePasswordResetToken(
      this.hashToken(token),
      await hashPassword(password),
      new Date(),
    );
    if (!user)
      throw new AccountTokenError("Password reset link is invalid or expired");
    return user;
  }

  private newToken() {
    return randomBytes(32).toString("base64url");
  }
  private hashToken(token: string) {
    return createHmac("sha256", this.tokenSecret).update(token).digest("hex");
  }
}
