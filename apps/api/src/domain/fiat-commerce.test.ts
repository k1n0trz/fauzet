import { describe, expect, it } from "vitest";
import {
  fiatCatalogResponseSchema,
  fiatInventoryResponseSchema,
  type PublicUser,
} from "@fauzet/contracts";
import { MemoryFiatCommerceStore } from "../infrastructure/memory-fiat-commerce-store.js";
import { FiatCommerceService } from "./fiat-commerce.js";

const activeUser: PublicUser = {
  id: "20000000-0000-4000-8000-000000000001",
  email: "fiat-test@fauzet.local",
  displayName: "Fiat Test",
  locale: "es",
  countryCode: "CO",
  status: "ACTIVE",
  roles: ["USER"],
};

describe("FiatCommerceService", () => {
  it("exposes the versioned COP catalog without enabling real charges", async () => {
    const service = new FiatCommerceService(new MemoryFiatCommerceStore(), {
      catalogEnabled: true,
      checkoutEnabled: false,
      activationEnabled: false,
    });

    const catalog = fiatCatalogResponseSchema.parse(
      await service.catalog(activeUser),
    );

    expect(catalog.realChargeEnabled).toBe(false);
    expect(catalog.currency).toBe("COP");
    expect(catalog.exponent).toBe(0);
    expect(catalog.products).toHaveLength(13);
    expect(
      catalog.products.filter(({ state }) => state === "DISABLED"),
    ).toHaveLength(3);
    expect(
      catalog.products.filter(({ state }) => state === "COMING_SOON"),
    ).toHaveLength(10);
    expect(
      catalog.products.every(({ rewardEligible }) => !rewardEligible),
    ).toBe(true);
  });

  it("keeps paused beta miners unavailable even when the sandbox checkout gate is open", async () => {
    const service = new FiatCommerceService(new MemoryFiatCommerceStore(), {
      catalogEnabled: true,
      checkoutEnabled: true,
      activationEnabled: false,
    });
    const catalog = await service.catalog(activeUser);

    expect(catalog.products.some(({ state }) => state === "AVAILABLE")).toBe(
      false,
    );
    expect(
      catalog.products
        .filter(({ reasonCode }) => reasonCode === "PRODUCT_PAUSED")
        .map(({ sku }) => sku),
    ).toEqual(["MINER_DRIPPER_MINI", "MINER_FLOW_ONE", "MINER_AQUA_RIG"]);
  });

  it("returns an empty, server-authoritative inventory before fulfillment exists", async () => {
    const service = new FiatCommerceService(new MemoryFiatCommerceStore(), {
      catalogEnabled: true,
      checkoutEnabled: false,
      activationEnabled: false,
    });
    const inventory = fiatInventoryResponseSchema.parse(
      await service.inventory(activeUser),
    );
    expect(inventory).toMatchObject({ activationEnabled: false, items: [] });
  });

  it("rejects ineligible accounts and a closed catalog", async () => {
    const store = new MemoryFiatCommerceStore();
    const service = new FiatCommerceService(store, {
      catalogEnabled: true,
      checkoutEnabled: false,
      activationEnabled: false,
    });
    await expect(
      service.catalog({ ...activeUser, status: "RESTRICTED" }),
    ).rejects.toMatchObject({ code: "FIAT_ACCOUNT_NOT_ELIGIBLE" });

    const disabled = new FiatCommerceService(store, {
      catalogEnabled: false,
      checkoutEnabled: false,
      activationEnabled: false,
    });
    await expect(disabled.catalog(activeUser)).rejects.toMatchObject({
      code: "FIAT_CATALOG_DISABLED",
    });
  });
});
