import type {
  PublicUser,
  ReferralCodeResponse,
  ReferralCommissionsResponse,
  ReferralTreeResponse,
} from "@fauzet/contracts";

export interface ReferralStore {
  code(userId: string): Promise<ReferralCodeResponse>;
  tree(userId: string): Promise<ReferralTreeResponse>;
  commissions(userId: string): Promise<ReferralCommissionsResponse>;
}

export type ReferralErrorCode =
  | "REFERRAL_ACCOUNT_NOT_ELIGIBLE"
  | "REFERRAL_CONFIG_INVALID"
  | "REFERRAL_DISABLED"
  | "REFERRAL_SOURCE_NOT_ALLOWED"
  | "REFERRAL_ACTIVITY_CONFLICT"
  | "REFERRAL_POOL_INSUFFICIENT"
  | "REFERRAL_CLAWBACK_PENDING"
  | "REFERRAL_BUSY";

export class ReferralError extends Error {
  constructor(
    public readonly code: ReferralErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Readonly<
      Record<string, string | number | boolean | null>
    >,
  ) {
    super(message);
    this.name = "ReferralError";
  }
}

export class ReferralService {
  constructor(private readonly store: ReferralStore) {}

  code(user: PublicUser) {
    assertEligible(user);
    return this.store.code(user.id);
  }

  tree(user: PublicUser) {
    assertEligible(user);
    return this.store.tree(user.id);
  }

  commissions(user: PublicUser) {
    assertEligible(user);
    return this.store.commissions(user.id);
  }
}

function assertEligible(user: PublicUser) {
  if (user.status !== "ACTIVE")
    throw new ReferralError(
      "REFERRAL_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required",
      403,
    );
}
