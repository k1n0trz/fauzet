import type { BalanceStore } from "../domain/balances.js";
const buckets = [
  "PENDING",
  "AVAILABLE",
  "PROMOTIONAL",
  "LOCKED",
  "ELIGIBLE",
  "RESERVED",
  "WITHDRAWN",
] as const;
export class MemoryBalanceStore implements BalanceStore {
  async forUser(_userId: string) {
    return buckets.map((bucket) => ({
      asset: "ZYXE",
      bucket,
      minorUnits: "0",
    }));
  }
}
