import type { BalanceBucket } from "@fauzet/contracts";

export interface BucketBalance {
  asset: string;
  bucket: BalanceBucket;
  minorUnits: string;
}
export interface BalanceStore {
  forUser(userId: string): Promise<BucketBalance[]>;
}
export class BalanceService {
  constructor(private readonly store: BalanceStore) {}
  forUser(userId: string) {
    return this.store.forUser(userId);
  }
}
