import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type {
  LoginRequest,
  PublicUser,
  RegisterRequest,
} from "@fauzet/contracts";

const scrypt = promisify(scryptCallback);

export interface SessionContext {
  ipHash?: string;
  deviceId?: string;
}

export interface StoredUser extends PublicUser {
  passwordHash: string;
}

export interface StoredSession {
  token: string;
  expiresAt: Date;
  user: PublicUser;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<StoredUser | null>;
  createUser(
    input: RegisterRequest & { passwordHash: string },
  ): Promise<StoredUser>;
  createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    context: SessionContext,
  ): Promise<void>;
  findSession(
    tokenHash: string,
    now: Date,
  ): Promise<{ user: PublicUser; expiresAt: Date } | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMAIL_TAKEN"
      | "INVALID_CREDENTIALS"
      | "UNAUTHORIZED"
      | "ACCOUNT_RESTRICTED",
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = (await scrypt(
    password,
    Buffer.from(saltValue, "base64url"),
    expected.length,
  )) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly sessionSecret: string,
    private readonly sessionTtlDays: number,
  ) {}

  async register(
    input: RegisterRequest,
    context: SessionContext = {},
  ): Promise<StoredSession> {
    if (await this.store.findUserByEmail(input.email)) {
      throw new AuthError(
        "An account with this email already exists",
        "EMAIL_TAKEN",
        409,
      );
    }
    const user = await this.store.createUser({
      ...input,
      passwordHash: await hashPassword(input.password),
    });
    return this.issueSession(user, context);
  }

  async login(
    input: LoginRequest,
    context: SessionContext = {},
  ): Promise<StoredSession> {
    const user = await this.store.findUserByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AuthError(
        "Invalid email or password",
        "INVALID_CREDENTIALS",
        401,
      );
    }
    if (["SUSPENDED", "CLOSED"].includes(user.status)) {
      throw new AuthError(
        "Account access is restricted",
        "ACCOUNT_RESTRICTED",
        403,
      );
    }
    return this.issueSession(user, context);
  }

  async authenticate(token: string | undefined): Promise<PublicUser> {
    if (!token)
      throw new AuthError("Authentication required", "UNAUTHORIZED", 401);
    const found = await this.store.findSession(
      hashSessionToken(token, this.sessionSecret),
      new Date(),
    );
    if (!found)
      throw new AuthError("Session is invalid or expired", "UNAUTHORIZED", 401);
    return found.user;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token)
      await this.store.revokeSession(
        hashSessionToken(token, this.sessionSecret),
        new Date(),
      );
  }

  private async issueSession(
    user: StoredUser,
    context: SessionContext,
  ): Promise<StoredSession> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.sessionTtlDays * 86_400_000);
    await this.store.createSession(
      user.id,
      hashSessionToken(token, this.sessionSecret),
      expiresAt,
      context,
    );
    const { passwordHash: _, ...publicUser } = user;
    return { token, expiresAt, user: publicUser };
  }
}
