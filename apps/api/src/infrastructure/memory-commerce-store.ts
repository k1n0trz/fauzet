import type {
  MiningStatusResponse,
  StoreCatalogResponse,
} from "@fauzet/contracts";
import { CommerceError, type CommerceStore } from "../domain/commerce.js";

export class MemoryCommerceStore implements CommerceStore {
  async catalog(): Promise<StoreCatalogResponse> {
    const now = new Date().toISOString();
    return {
      serverNow: now,
      configVersion: 1,
      paymentBalances: { AVAILABLE: "0", PROMOTIONAL: "0" },
      paymentOrder: ["PROMOTIONAL", "AVAILABLE"],
      allowedPaymentBuckets: ["PROMOTIONAL", "AVAILABLE"],
      slots: { used: 1, max: 4 },
      split: { burnBps: 4000, recycleBps: 4000, treasuryBps: 2000 },
      products: [],
    };
  }
  async miningStatus(): Promise<MiningStatusResponse> {
    const now = new Date();
    return {
      serverNow: now.toISOString(),
      configVersion: 1,
      state: "ACTIVE",
      reasonCode: null,
      profile: {
        energy: {
          current: 100,
          max: 100,
          consumptionPerHour: 2,
          estimatedExhaustsAt: null,
        },
        boost: null,
        repairKits: 0,
        activeMiners: 1,
        maxSlots: 4,
      },
      miners: [],
      today: {
        periodKey: now.toISOString().slice(0, 10),
        startAt: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        ).toISOString(),
        endAt: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
          ),
        ).toISOString(),
        hashMillis: "0",
        poolMinorUnits: "250000",
        estimatedPayoutMinorUnits: "0",
        asOf: now.toISOString(),
        isGuaranteed: false,
        status: "OPEN",
        allocatedMinorUnits: null,
        residueMinorUnits: "250000",
        userWeight: "0",
        totalWeight: "0",
      },
    };
  }
  async purchase(): Promise<never> {
    throw unavailable();
  }
  async mutateMiner(): Promise<never> {
    throw unavailable();
  }
}

function unavailable() {
  return new CommerceError(
    "COMMERCE_CONFIG_INVALID",
    "Persistent commerce store is required for mutations",
    503,
  );
}
