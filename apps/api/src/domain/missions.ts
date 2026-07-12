import type { PublicUser } from "@fauzet/contracts";
import type { GameContext } from "./games.js";

export type MissionStatus = "IN_PROGRESS" | "CLAIMABLE" | "CLAIMED" | "LOCKED";

export interface MissionView {
  id: string;
  periodKey: string;
  configVersion: number;
  title: string;
  category: string;
  requirement: string;
  premium: boolean;
  status: MissionStatus;
  reasonCode: string | null;
  progress: number;
  target: number;
  reward: {
    asset: "ZYXE";
    minorUnits: string;
    bucket: "AVAILABLE";
  };
  periodEndsAt: string | null;
  expiresAt: string | null;
}

export interface MissionCatalogResult {
  missions: MissionView[];
  configVersion: number;
}

export interface MissionClaimResult {
  missionClaim: {
    id: string;
    missionId: string;
    periodKey: string;
    status: "POSTED";
    progress: number;
    target: number;
    reward: {
      asset: "ZYXE";
      minorUnits: string;
      bucket: "AVAILABLE";
    };
    transactionId: string;
    configVersion: number;
  };
  replayed: boolean;
}

export interface MissionStore {
  catalog(userId: string): Promise<MissionCatalogResult>;
  claim(input: {
    userId: string;
    missionId: string;
    periodKey: string;
    configVersion: number;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<MissionClaimResult>;
}

export type MissionErrorCode =
  | "MISSION_ACCOUNT_NOT_ELIGIBLE"
  | "MISSION_DEVICE_REQUIRED"
  | "MISSION_DISABLED"
  | "MISSION_NOT_FOUND"
  | "MISSION_PERIOD_INVALID"
  | "MISSION_LOCKED"
  | "MISSION_INCOMPLETE"
  | "MISSION_ALREADY_CLAIMED"
  | "MISSION_CLAIM_REVERSED"
  | "MISSION_RISK_BLOCKED"
  | "MISSION_BUDGET_EXHAUSTED"
  | "MISSION_POOL_EXHAUSTED"
  | "MISSION_IDEMPOTENCY_CONFLICT"
  | "MISSION_CONFIG_INVALID"
  | "MISSION_BUSY";

export class MissionError extends Error {
  constructor(
    public readonly code: MissionErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Readonly<
      Record<string, string | number | boolean | null>
    >,
  ) {
    super(message);
    this.name = "MissionError";
  }
}

export class MissionService {
  constructor(private readonly store: MissionStore) {}

  async catalog(user: PublicUser) {
    assertEligible(user);
    return this.store.catalog(user.id);
  }

  async claim(
    user: PublicUser,
    missionId: string,
    periodKey: string,
    configVersion: number,
    idempotencyKey: string,
    context: GameContext,
  ) {
    assertEligible(user);
    if (!context.deviceId)
      throw new MissionError(
        "MISSION_DEVICE_REQUIRED",
        "A valid session-bound UUIDv4 x-device-id is required",
        400,
      );
    return this.store.claim({
      userId: user.id,
      missionId,
      periodKey,
      configVersion,
      idempotencyKey,
      context,
    });
  }
}

function assertEligible(user: PublicUser) {
  if (user.status !== "ACTIVE")
    throw new MissionError(
      "MISSION_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required for missions",
      403,
    );
}
