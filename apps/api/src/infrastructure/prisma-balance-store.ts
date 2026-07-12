import type { BalanceBucket } from "@fauzet/contracts";
import { getDatabase, type PrismaClient } from "@fauzet/database";
import type { BalanceStore } from "../domain/balances.js";

export class PrismaBalanceStore implements BalanceStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}
  async forUser(userId: string) {
    const accounts = await this.database.ledgerAccount.findMany({
      where: { userId, bucket: { not: null } },
      include: {
        postings: {
          where: {
            transaction: { status: { in: ["POSTED", "REVERSED"] } },
          },
          select: { amount: true },
        },
      },
      orderBy: [{ asset: "asc" }, { bucket: "asc" }],
    });
    return accounts.map((account) => ({
      asset: account.asset,
      bucket: account.bucket as BalanceBucket,
      minorUnits: account.postings
        .reduce((sum, posting) => sum + BigInt(posting.amount.toFixed(0)), 0n)
        .toString(),
    }));
  }
}
