import type {
  AccountActivityQuery,
  AccountActivityResponse,
} from "@fauzet/contracts";
import { getDatabase, type PrismaClient } from "@fauzet/database";
import type { AccountActivityStore } from "../domain/account-activity.js";

export class PrismaAccountActivityStore implements AccountActivityStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}

  async list(
    userId: string,
    query: AccountActivityQuery,
  ): Promise<AccountActivityResponse> {
    const transactions = await this.database.ledgerTransaction.findMany({
      where: {
        postings: { some: { account: { userId } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        sourceType: true,
        sourceId: true,
        status: true,
        createdAt: true,
        postedAt: true,
        postings: {
          where: { account: { userId } },
          orderBy: { createdAt: "asc" },
          select: {
            amount: true,
            balanceAfter: true,
            account: { select: { asset: true, bucket: true } },
          },
        },
      },
    });

    const hasMore = transactions.length > query.limit;
    const page = hasMore ? transactions.slice(0, query.limit) : transactions;

    return {
      items: page.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        sourceType: transaction.sourceType,
        sourceId: transaction.sourceId,
        status: transaction.status,
        createdAt: transaction.createdAt.toISOString(),
        postedAt: transaction.postedAt?.toISOString() ?? null,
        movements: transaction.postings.flatMap((posting) =>
          posting.account.bucket
            ? [
                {
                  asset: posting.account.asset,
                  bucket: posting.account.bucket,
                  minorUnits: posting.amount.toFixed(0),
                  balanceAfterMinorUnits:
                    posting.balanceAfter?.toFixed(0) ?? null,
                },
              ]
            : [],
        ),
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
