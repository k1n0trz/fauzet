import type {
  FiatCatalogResponse,
  FiatInventoryResponse,
  PublicUser,
} from "@fauzet/contracts";

export type FiatCommerceFlags = Readonly<{
  catalogEnabled: boolean;
  checkoutEnabled: boolean;
  activationEnabled: boolean;
}>;

export interface FiatCommerceStore {
  catalog(input: {
    userId: string;
    flags: FiatCommerceFlags;
  }): Promise<FiatCatalogResponse>;
  inventory(input: {
    userId: string;
    flags: FiatCommerceFlags;
  }): Promise<FiatInventoryResponse>;
}

export type FiatCommerceErrorCode =
  | "FIAT_ACCOUNT_NOT_ELIGIBLE"
  | "FIAT_CATALOG_DISABLED";

export class FiatCommerceError extends Error {
  constructor(
    public readonly code: FiatCommerceErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FiatCommerceError";
  }
}

export class FiatCommerceService {
  constructor(
    private readonly store: FiatCommerceStore,
    private readonly flags: FiatCommerceFlags,
  ) {}

  async catalog(user: PublicUser) {
    assertEligible(user);
    if (!this.flags.catalogEnabled) {
      throw new FiatCommerceError(
        "FIAT_CATALOG_DISABLED",
        "The fiat sandbox catalog is not available",
        404,
      );
    }
    return this.store.catalog({ userId: user.id, flags: this.flags });
  }

  async inventory(user: PublicUser) {
    assertEligible(user);
    return this.store.inventory({ userId: user.id, flags: this.flags });
  }
}

function assertEligible(user: PublicUser) {
  if (user.status !== "ACTIVE") {
    throw new FiatCommerceError(
      "FIAT_ACCOUNT_NOT_ELIGIBLE",
      "An active, verified account is required",
      403,
    );
  }
}
