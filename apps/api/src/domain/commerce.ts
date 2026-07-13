import type {
  MinerActionResponse,
  MiningStatusResponse,
  PublicUser,
  StoreCatalogResponse,
  StorePurchaseResponse,
} from "@fauzet/contracts";
import type { GameContext } from "./games.js";

export interface CommerceStore {
  catalog(userId: string): Promise<StoreCatalogResponse>;
  purchase(input: {
    userId: string;
    productId: string;
    configVersion: number;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<StorePurchaseResponse>;
  miningStatus(userId: string): Promise<MiningStatusResponse>;
  mutateMiner(input: {
    userId: string;
    minerId: string;
    type: "UPGRADE" | "REPAIR";
    configVersion: number;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<MinerActionResponse>;
}

export type CommerceErrorCode =
  | "COMMERCE_ACCOUNT_NOT_ELIGIBLE"
  | "COMMERCE_DEVICE_REQUIRED"
  | "COMMERCE_DISABLED"
  | "COMMERCE_CONFIG_CHANGED"
  | "COMMERCE_CONFIG_INVALID"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_LOCKED"
  | "PRODUCT_LIMIT_REACHED"
  | "BOOST_ALREADY_ACTIVE"
  | "MINER_SLOTS_FULL"
  | "MINER_NOT_FOUND"
  | "MINER_MAX_LEVEL"
  | "MINER_REPAIR_NOT_NEEDED"
  | "INSUFFICIENT_PURCHASE_FUNDS"
  | "COMMERCE_IDEMPOTENCY_CONFLICT"
  | "COMMERCE_PURCHASE_REVERSED"
  | "COMMERCE_ACTION_REVERSED"
  | "COMMERCE_RISK_BLOCKED"
  | "COMMERCE_BUSY";

export class CommerceError extends Error {
  constructor(
    public readonly code: CommerceErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Readonly<
      Record<string, string | number | boolean | null>
    >,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

export class StoreService {
  constructor(private readonly store: CommerceStore) {}
  catalog(user: PublicUser) {
    assertEligible(user);
    return this.store.catalog(user.id);
  }
  purchase(
    user: PublicUser,
    productId: string,
    configVersion: number,
    idempotencyKey: string,
    context: GameContext,
  ) {
    assertEligible(user);
    assertDevice(context);
    return this.store.purchase({
      userId: user.id,
      productId,
      configVersion,
      idempotencyKey,
      context,
    });
  }
}

export class MiningService {
  constructor(private readonly store: CommerceStore) {}
  status(user: PublicUser) {
    assertEligible(user);
    return this.store.miningStatus(user.id);
  }
  mutate(
    user: PublicUser,
    minerId: string,
    type: "UPGRADE" | "REPAIR",
    configVersion: number,
    idempotencyKey: string,
    context: GameContext,
  ) {
    assertEligible(user);
    assertDevice(context);
    return this.store.mutateMiner({
      userId: user.id,
      minerId,
      type,
      configVersion,
      idempotencyKey,
      context,
    });
  }
}

function assertEligible(user: PublicUser) {
  if (user.status !== "ACTIVE")
    throw new CommerceError(
      "COMMERCE_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required",
      403,
    );
}

function assertDevice(context: GameContext) {
  if (!context.deviceId)
    throw new CommerceError(
      "COMMERCE_DEVICE_REQUIRED",
      "A valid session-bound UUIDv4 x-device-id is required",
      400,
    );
}
