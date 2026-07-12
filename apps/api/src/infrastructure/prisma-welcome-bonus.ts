import { getDatabase, type PrismaClient } from "@fauzet/database";
import { z } from "zod";
import type { WelcomeBonusIssuer } from "../domain/welcome-bonus.js";
import { PrismaLedgerStore } from "./prisma-ledger-store.js";

export class PrismaWelcomeBonusIssuer implements WelcomeBonusIssuer {
  private readonly ledger: PrismaLedgerStore;
  constructor(private readonly database: PrismaClient = getDatabase()) {
    this.ledger = new PrismaLedgerStore(database);
  }

  async issue(userId: string) {
    const now = new Date();
    const [config, pool, promotional] = await Promise.all([
      this.database.economicConfigVersion.findFirstOrThrow({
        where: {
          status: "ACTIVE",
          OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
        },
        orderBy: { id: "desc" },
      }),
      this.database.ledgerAccount.findUniqueOrThrow({
        where: { code: "platform:zyxe:promotional-pool" },
      }),
      this.database.ledgerAccount.findFirstOrThrow({
        where: { userId, asset: "ZYXE", bucket: "PROMOTIONAL" },
      }),
    ]);
    const { welcomeBonusMinor } = welcomeParameters.parse(config.parameters);
    const amount = BigInt(welcomeBonusMinor);
    const transaction = await this.ledger.post({
      idempotencyKey: `welcome-bonus:${userId}`,
      type: "PROMOTIONAL_BONUS",
      sourceType: "onboarding",
      sourceId: userId,
      configVersion: config.id,
      metadata: { nonWithdrawable: true },
      postings: [
        {
          account: { id: pool.id, asset: pool.asset, kind: pool.kind },
          amount: -amount,
        },
        {
          account: {
            id: promotional.id,
            asset: promotional.asset,
            kind: promotional.kind,
          },
          amount,
        },
      ],
    });
    return { transactionId: transaction.id };
  }
}

const welcomeParameters = z
  .object({ welcomeBonusMinor: z.number().int().positive() })
  .passthrough();
