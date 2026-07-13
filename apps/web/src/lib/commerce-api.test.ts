import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMiningStatus,
  isConfirmedMiningAction,
  mutateMiner,
} from "./mining-api";
import { fetchStoreCatalog, purchaseStoreProduct } from "./store-api";

const now = "2026-07-12T12:00:00.000Z";
const minerId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => "20000000-0000-4000-8000-000000000002"),
    setItem: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("commerce API adapters", () => {
  it("normalizes the current store catalog contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(storeCatalogFixture())),
    );

    const catalog = await fetchStoreCatalog();

    expect(catalog.paymentBalances).toEqual({
      AVAILABLE: "900",
      PROMOTIONAL: "100",
    });
    expect(catalog.paymentOrder).toEqual(["PROMOTIONAL", "AVAILABLE"]);
    expect(catalog.products[0]).toMatchObject({
      id: "b1",
      state: "AVAILABLE",
      price: { asset: "ZYXE", minorUnits: "80" },
    });
    expect(catalog.products[1]).toMatchObject({
      id: "b3",
      state: "LOCKED",
      reasonCode: "PRODUCT_LOCKED",
    });
  });

  it("sends the canonical purchase body and parses its ledger breakdown", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse({
          purchase: {
            id: "30000000-0000-4000-8000-000000000003",
            productId: "b1",
            status: "POSTED",
            totalMinorUnits: "80",
            payment: {
              availableMinorUnits: "0",
              promotionalMinorUnits: "80",
            },
            split: {
              burnMinorUnits: "32",
              rewardPoolsMinorUnits: "32",
              treasuryMinorUnits: "16",
            },
            effect: {
              type: "ENERGY_REFILL",
              status: "APPLIED",
              refId: "energy-event",
              startsAt: now,
              endsAt: null,
            },
            transactionId: "40000000-0000-4000-8000-000000000004",
            configVersion: 7,
            createdAt: now,
          },
          mining: miningFixture(),
          replayed: false,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const receipt = await purchaseStoreProduct("b1", 7, "idem-purchase");
    const init = fetchMock.mock.calls[0]?.[1];

    expect(JSON.parse(String(init?.body))).toEqual({
      productId: "b1",
      configVersion: 7,
    });
    expect(receipt.payment.promotionalMinorUnits).toBe("80");
    expect(receipt.split.recycleMinorUnits).toBe("32");
    expect(receipt.transactionId).toBeTruthy();
  });

  it("uses the canonical miner route and accepts a posted kit repair", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse({
          action: {
            id: "50000000-0000-4000-8000-000000000005",
            minerId,
            type: "REPAIR",
            status: "POSTED",
            costMinorUnits: "0",
            transactionId: null,
            configVersion: 7,
          },
          mining: miningFixture(),
          replayed: true,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const receipt = await mutateMiner(minerId, "repair", 7, "idem-repair");
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe(`/api/v1/miners/${minerId}/repair`);
    expect(JSON.parse(String(init?.body))).toEqual({ configVersion: 7 });
    expect(isConfirmedMiningAction(receipt)).toBe(true);
    expect(receipt.mining?.miners[0]?.repair?.enabled).toBe(true);
  });

  it("normalizes mining energy separately from game energy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(miningFixture())),
    );

    const status = await fetchMiningStatus();

    expect(status.profile.energy).toMatchObject({ current: 64, max: 100 });
    expect(status.period.estimatedRewardMinorUnits).toBe("184");
    expect(status.miners[0]?.durabilityBps).toBe(8200);
  });
});

function storeCatalogFixture() {
  return {
    serverNow: now,
    configVersion: 7,
    paymentBalances: { AVAILABLE: "900", PROMOTIONAL: "100" },
    paymentOrder: ["PROMOTIONAL", "AVAILABLE"],
    slots: { used: 1, max: 4 },
    split: { burnBps: 4000, rewardPoolsBps: 4000, treasuryBps: 2000 },
    products: [
      {
        id: "b1",
        kind: "ENERGY_REFILL",
        name: "Recarga de energía",
        description: "Restaura la energía de minería.",
        category: "UTILITY",
        enabled: true,
        lockedReason: null,
        priceMinorUnits: "80",
        purchasesToday: 0,
        remainingToday: 3,
        effect: { type: "ENERGY_REFILL", label: "Energía → 100", maxPerDay: 3 },
      },
      {
        id: "b3",
        kind: "LOCKED",
        name: "Acelerador de cooldown",
        description: "No habilitado.",
        category: "BOOST",
        enabled: false,
        lockedReason: "PRODUCT_LOCKED",
        priceMinorUnits: "200",
        purchasesToday: 0,
        remainingToday: null,
        effect: { type: "LOCKED", label: "Bloqueado" },
      },
    ],
  };
}

function miningFixture() {
  return {
    serverNow: now,
    configVersion: 7,
    profile: {
      energy: { current: 64, max: 100 },
      boost: null,
      repairKits: 1,
      activeMiners: 1,
      maxSlots: 4,
    },
    miners: [
      {
        id: minerId,
        modelId: "drip-node",
        name: "Drip Node",
        tier: "BASIC",
        slot: 1,
        status: "ACTIVE",
        level: 2,
        hashRate: 24,
        energyPerHour: 2,
        efficiencyBps: 9600,
        durabilityBps: 8200,
        upgrade: {
          nextLevel: 3,
          priceMinorUnits: "220",
          hashRate: 30,
          enabled: true,
        },
        repair: { priceMinorUnits: "0", usesKit: true, enabled: true },
      },
    ],
    today: {
      periodKey: "2026-07-12",
      hashMillis: "86400000",
      poolMinorUnits: "250000",
      estimatedPayoutMinorUnits: "184",
    },
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
