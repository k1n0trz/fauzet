import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@fauzet/database";
import { PrismaFiatCommerceStore } from "./prisma-fiat-commerce-store.js";

const NOW = new Date("2026-07-13T12:00:00.000Z");

describe("PrismaFiatCommerceStore", () => {
  it("keeps active products outside their sale window unavailable", async () => {
    const findMany = vi.fn().mockResolvedValue([
      product({
        id: "10000000-0000-4000-8000-000000000001",
        saleStartsAt: new Date("2026-07-14T00:00:00.000Z"),
      }),
      product({
        id: "10000000-0000-4000-8000-000000000002",
        saleEndsAt: new Date("2026-07-13T11:59:59.000Z"),
      }),
      product({ id: "10000000-0000-4000-8000-000000000003" }),
    ]);
    const store = new PrismaFiatCommerceStore(
      database({ fiatProductVersion: { findMany } }),
      () => NOW,
    );

    const catalog = await store.catalog({
      userId: "20000000-0000-4000-8000-000000000001",
      flags: {
        catalogEnabled: true,
        checkoutEnabled: true,
        activationEnabled: false,
      },
    });

    expect(
      catalog.products.map(({ state, reasonCode }) => [state, reasonCode]),
    ).toEqual([
      ["DISABLED", "SALE_NOT_STARTED"],
      ["DISABLED", "SALE_ENDED"],
      ["AVAILABLE", null],
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ displayOrder: "asc" }, { sku: "asc" }],
      }),
    );
  });

  it("keeps activation and refunds closed for purchased inventory", async () => {
    const store = new PrismaFiatCommerceStore(
      database({
        entitlement: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "30000000-0000-4000-8000-000000000001",
              orderId: "40000000-0000-4000-8000-000000000001",
              status: "PURCHASED",
              purchasedAt: NOW,
              activatedAt: null,
              startsAt: null,
              endsAt: null,
              effectType: "VIRTUAL_MINER",
              effectSnapshot: {
                label: "0,25 MH/s",
                parameters: { advertisedHashRateMilliMh: 250 },
              },
              order: {
                productVersionId: "10000000-0000-4000-8000-000000000009",
                quantity: 1,
                productVersion: {
                  sku: "MINER_DRIPPER_MINI",
                  name: "Dripper Mini",
                },
              },
            },
          ]),
        },
      }),
      () => NOW,
    );

    const inventory = await store.inventory({
      userId: "20000000-0000-4000-8000-000000000001",
      flags: {
        catalogEnabled: true,
        checkoutEnabled: false,
        activationEnabled: true,
      },
    });

    expect(inventory.items[0]).toMatchObject({
      state: "PURCHASED",
      canActivate: false,
      canRequestRefund: false,
      reasonCode: "ACTIVATION_NOT_IMPLEMENTED",
    });
  });
});

function product(input: {
  id: string;
  saleStartsAt?: Date | null;
  saleEndsAt?: Date | null;
}) {
  return {
    id: input.id,
    sku: `SKU_${input.id.at(-1)}`,
    version: 1,
    status: "ACTIVE",
    kind: "BOOST",
    name: "Producto fiat",
    description: "Producto de prueba",
    unitAmountMinor: new Prisma.Decimal(3900),
    durationSeconds: 86_400,
    effectType: "MINING_HASH_BOOST",
    effectConfig: { hashBonusBps: 2000 },
    content: { es: { effect: "+20% hashpower" } },
    refundPolicyVersion: "fiat-beta-2026-07-13",
    saleStartsAt: input.saleStartsAt ?? null,
    saleEndsAt: input.saleEndsAt ?? null,
  };
}

function database(delegates: Record<string, unknown>) {
  return delegates as unknown as PrismaClient;
}
