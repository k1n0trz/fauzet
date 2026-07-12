import { Prisma, type PrismaClient } from "@fauzet/database";
import { describe, expect, it, vi } from "vitest";
import { LedgerInvariantError } from "../domain/ledger.js";
import {
  LedgerAccountPolicyError,
  LedgerInsufficientBalanceError,
  LedgerPostingConflictError,
  LedgerReversalError,
} from "../domain/ledger-posting.js";
import { PrismaLedgerStore } from "./prisma-ledger-store.js";

const input = {
  idempotencyKey: "faucet:claim-1",
  type: "FAUCET_REWARD",
  sourceType: "faucet_claim",
  sourceId: "claim-1",
  configVersion: 1,
  metadata: { channel: "web" },
  postings: [
    {
      account: { id: "treasury", asset: "ZYXE", kind: "EQUITY" as const },
      amount: -25n,
    },
    {
      account: { id: "user", asset: "ZYXE", kind: "LIABILITY" as const },
      amount: 25n,
    },
  ],
};

describe("PrismaLedgerStore", () => {
  it("creates the transaction and all postings in one database transaction", async () => {
    const created = transactionRecord();
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findMany.mockResolvedValue([]);
    tx.ledgerAccount.findMany.mockResolvedValue([
      accountRecord("treasury", "EQUITY"),
      accountRecord("user", "LIABILITY"),
    ]);
    tx.ledgerTransaction.create.mockResolvedValue(created);

    const result = await new PrismaLedgerStore(database).post(input);

    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(tx.ledgerTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "POSTED",
          idempotencyKey: input.idempotencyKey,
          postings: {
            create: [
              { accountId: "treasury", amount: "-25" },
              { accountId: "user", amount: "25" },
            ],
          },
        }),
      }),
    );
    expect(result.postings.map(({ amount }) => amount)).toEqual([-25n, 25n]);
  });

  it("returns the original transaction for an identical idempotent retry", async () => {
    const existing = transactionRecord();
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findMany.mockResolvedValue([existing]);

    const result = await new PrismaLedgerStore(database).post(input);

    expect(result.id).toBe(existing.id);
    expect(tx.ledgerAccount.findMany).not.toHaveBeenCalled();
    expect(tx.ledgerTransaction.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key with a different source", async () => {
    const existing = transactionRecord({ sourceId: "another-claim" });
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findMany.mockResolvedValue([existing]);

    await expect(
      new PrismaLedgerStore(database).post(input),
    ).rejects.toBeInstanceOf(LedgerPostingConflictError);
  });

  it("rejects an account reference that differs from the stored account", async () => {
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findMany.mockResolvedValue([]);
    tx.ledgerAccount.findMany.mockResolvedValue([
      accountRecord("treasury", "EQUITY", "OTHER"),
      accountRecord("user", "LIABILITY"),
    ]);

    await expect(
      new PrismaLedgerStore(database).post(input),
    ).rejects.toBeInstanceOf(LedgerInvariantError);
    expect(tx.ledgerTransaction.create).not.toHaveBeenCalled();
  });

  it("rejects a posting that would overdraw a protected account", async () => {
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findMany.mockResolvedValue([]);
    tx.ledgerPosting.groupBy.mockResolvedValue([]);
    tx.ledgerAccount.findMany.mockResolvedValue([
      accountRecord("treasury", "EQUITY"),
      accountRecord("user", "LIABILITY"),
    ]);

    await expect(
      new PrismaLedgerStore(database).post({
        ...input,
        postings: [
          {
            account: { id: "user", asset: "ZYXE", kind: "LIABILITY" },
            amount: -1n,
          },
          {
            account: { id: "treasury", asset: "ZYXE", kind: "EQUITY" },
            amount: 1n,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(LedgerInsufficientBalanceError);
  });

  it("blocks owner accounts from the generic posting service", async () => {
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findMany.mockResolvedValue([]);
    tx.ledgerAccount.findMany.mockResolvedValue([
      {
        ...accountRecord("owner", "EQUITY"),
        code: "treasury:owner:available:zyxe",
      },
      accountRecord("user", "LIABILITY"),
    ]);

    await expect(
      new PrismaLedgerStore(database).post({
        ...input,
        postings: [
          {
            account: { id: "owner", asset: "ZYXE", kind: "EQUITY" },
            amount: -1n,
          },
          {
            account: { id: "user", asset: "ZYXE", kind: "LIABILITY" },
            amount: 1n,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(LedgerAccountPolicyError);
  });

  it("recovers an identical concurrent insert after the unique constraint wins", async () => {
    const existing = transactionRecord();
    const { database, databaseMock, tx } = fakeDatabase();
    databaseMock.$transaction.mockRejectedValueOnce({ code: "P2002" });
    tx.ledgerTransaction.findMany.mockResolvedValue([existing]);

    const result = await new PrismaLedgerStore(database).post(input);

    expect(result.id).toBe(existing.id);
  });

  it("creates compensating postings and links the original atomically", async () => {
    const original = transactionRecord();
    const reversal = transactionRecord({
      id: "transaction-reversal",
      idempotencyKey: "reversal:transaction-1",
      type: "FAUCET_REWARD_REVERSAL",
      sourceType: "ledger_transaction",
      sourceId: "transaction-1",
      metadata: {},
      postings: [
        postingRecord("reversal-posting-1", "treasury", "EQUITY", 25n),
        postingRecord("reversal-posting-2", "user", "LIABILITY", -25n),
      ],
    });
    const reversedOriginal = transactionRecord({
      status: "REVERSED",
      reversedById: reversal.id,
    });
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findUnique
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(reversedOriginal);
    tx.ledgerTransaction.findMany.mockResolvedValue([]);
    tx.ledgerTransaction.create.mockResolvedValue(reversal);
    tx.ledgerTransaction.updateMany.mockResolvedValue({ count: 1 });

    const result = await new PrismaLedgerStore(database).reverse({
      transactionId: original.id,
      idempotencyKey: reversal.idempotencyKey,
    });

    expect(tx.ledgerTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "FAUCET_REWARD_REVERSAL",
          sourceType: "ledger_transaction",
          sourceId: original.id,
          postings: {
            create: [
              { accountId: "treasury", amount: "25" },
              { accountId: "user", amount: "-25" },
            ],
          },
        }),
      }),
    );
    expect(tx.ledgerTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: original.id, status: "POSTED", reversedById: null },
      data: { status: "REVERSED", reversedById: reversal.id },
    });
    expect(tx.faucetClaim.updateMany).toHaveBeenCalledWith({
      where: {
        id: original.sourceId,
        transactionId: original.id,
        status: "POSTED",
      },
      data: { status: "REJECTED" },
    });
    expect(result.original.status).toBe("REVERSED");
    expect(result.reversal.postings.map(({ amount }) => amount)).toEqual([
      25n,
      -25n,
    ]);
  });

  it("makes a repeated reversal idempotent and does not post twice", async () => {
    const reversal = transactionRecord({
      id: "transaction-reversal",
      idempotencyKey: "reversal:transaction-1",
      type: "FAUCET_REWARD_REVERSAL",
      sourceType: "ledger_transaction",
      sourceId: "transaction-1",
      metadata: {},
      postings: [
        postingRecord("reversal-posting-1", "treasury", "EQUITY", 25n),
        postingRecord("reversal-posting-2", "user", "LIABILITY", -25n),
      ],
    });
    const original = transactionRecord({
      status: "REVERSED",
      reversedById: reversal.id,
    });
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findUnique.mockResolvedValue(original);
    tx.ledgerTransaction.findMany.mockResolvedValue([reversal]);

    const result = await new PrismaLedgerStore(database).reverse({
      transactionId: original.id,
      idempotencyKey: reversal.idempotencyKey,
    });

    expect(result.reversal.id).toBe(reversal.id);
    expect(tx.ledgerTransaction.create).not.toHaveBeenCalled();
    expect(tx.ledgerTransaction.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      "game_session",
      "gameSession",
      "COMPLETED",
      { status: "REJECTED", reasonCode: "REWARD_REVERSED" },
    ],
    ["mission_claim", "missionClaim", "POSTED", { status: "REJECTED" }],
  ] as const)(
    "rejects the %s reward projection in the reversal transaction",
    async (sourceType, delegate, status, data) => {
      const original = transactionRecord({ sourceType, sourceId: "source-1" });
      const reversal = transactionRecord({
        id: "transaction-reversal",
        idempotencyKey: "reversal:transaction-1",
        type: `${original.type}_REVERSAL`,
        sourceType: "ledger_transaction",
        sourceId: original.id,
        metadata: {},
        postings: [
          postingRecord("reversal-posting-1", "treasury", "EQUITY", 25n),
          postingRecord("reversal-posting-2", "user", "LIABILITY", -25n),
        ],
      });
      const reversedOriginal = transactionRecord({
        ...original,
        status: "REVERSED",
        reversedById: reversal.id,
      });
      const { database, tx } = fakeDatabase();
      tx.ledgerTransaction.findUnique
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(reversedOriginal);
      tx.ledgerTransaction.findMany.mockResolvedValue([]);
      tx.ledgerTransaction.create.mockResolvedValue(reversal);
      tx.ledgerTransaction.updateMany.mockResolvedValue({ count: 1 });

      await new PrismaLedgerStore(database).reverse({
        transactionId: original.id,
        idempotencyKey: reversal.idempotencyKey,
      });

      expect(tx[delegate].updateMany).toHaveBeenCalledWith({
        where: {
          id: original.sourceId,
          transactionId: original.id,
          status,
        },
        data,
      });
    },
  );

  it.each(["store_purchase", "miner_action"])(
    "blocks generic reversal for effectful source %s",
    async (sourceType) => {
      const original = transactionRecord({ sourceType });
      const { database, tx } = fakeDatabase();
      tx.ledgerTransaction.findUnique.mockResolvedValue(original);

      await expect(
        new PrismaLedgerStore(database).reverse({
          transactionId: original.id,
          idempotencyKey: `reverse:${sourceType}`,
        }),
      ).rejects.toBeInstanceOf(LedgerReversalError);
      expect(tx.ledgerTransaction.create).not.toHaveBeenCalled();
    },
  );

  it("marks a reversed mining epoch and its payouts as reversed", async () => {
    const original = transactionRecord({
      sourceType: "mining_epoch",
      sourceId: "2026-07-11",
      type: "MINING_EPOCH_PAYOUT",
    });
    const reversal = transactionRecord({
      id: "transaction-reversal",
      idempotencyKey: "reverse:mining:2026-07-11",
      type: "MINING_EPOCH_PAYOUT_REVERSAL",
      sourceType: "ledger_transaction",
      sourceId: original.id,
      metadata: {},
      postings: [
        postingRecord("reversal-posting-1", "treasury", "EQUITY", 25n),
        postingRecord("reversal-posting-2", "user", "LIABILITY", -25n),
      ],
    });
    const reversedOriginal = transactionRecord({
      ...original,
      status: "REVERSED",
      reversedById: reversal.id,
    });
    const { database, tx } = fakeDatabase();
    tx.ledgerTransaction.findUnique
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(reversedOriginal);
    tx.ledgerTransaction.findMany.mockResolvedValue([]);
    tx.ledgerTransaction.create.mockResolvedValue(reversal);
    tx.ledgerTransaction.updateMany.mockResolvedValue({ count: 1 });

    await new PrismaLedgerStore(database).reverse({
      transactionId: original.id,
      idempotencyKey: reversal.idempotencyKey,
    });

    expect(tx.miningEpoch.updateMany).toHaveBeenCalledWith({
      where: {
        periodDate: new Date("2026-07-11T00:00:00.000Z"),
        transactionId: original.id,
        status: "SETTLED",
      },
      data: { status: "REVERSED", reasonCode: "PAYOUT_REVERSED" },
    });
    expect(tx.miningPayout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: original.id, status: "POSTED" },
        data: expect.objectContaining({ status: "REVERSED" }),
      }),
    );
  });
});

function fakeDatabase() {
  const tx = {
    ledgerTransaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    ledgerAccount: {
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          where.id.in.map((id: string) =>
            accountRecord(id, id === "user" ? "LIABILITY" : "EQUITY"),
          ),
        ),
    },
    ledgerPosting: {
      groupBy: vi.fn().mockResolvedValue([
        {
          accountId: "user",
          _sum: { amount: new Prisma.Decimal("25") },
        },
      ]),
    },
    gameSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    missionClaim: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    faucetClaim: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    miningEpoch: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    miningPayout: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const database = {
    ...tx,
    $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  return {
    database: database as unknown as PrismaClient,
    tx,
    databaseMock: database,
  };
}

function transactionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "transaction-1",
    idempotencyKey: input.idempotencyKey,
    type: input.type,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    status: "POSTED",
    configVersion: input.configVersion,
    metadata: input.metadata,
    postedAt: new Date("2026-07-12T00:00:00.000Z"),
    reversedById: null,
    createdAt: new Date("2026-07-12T00:00:00.000Z"),
    postings: [
      postingRecord("posting-1", "treasury", "EQUITY", -25n),
      postingRecord("posting-2", "user", "LIABILITY", 25n),
    ],
    ...overrides,
  };
}

function postingRecord(
  id: string,
  accountId: string,
  kind: "EQUITY" | "LIABILITY",
  amount: bigint,
) {
  return {
    id,
    transactionId: "transaction-1",
    accountId,
    amount: new Prisma.Decimal(amount.toString()),
    balanceAfter: null,
    createdAt: new Date("2026-07-12T00:00:00.000Z"),
    account: accountRecord(accountId, kind),
  };
}

function accountRecord(
  id: string,
  kind: "EQUITY" | "LIABILITY",
  asset = "ZYXE",
) {
  return {
    id,
    code: `account:${id}`,
    name: id,
    kind,
    asset,
    bucket: null,
    userId: null,
    active: true,
    allowNegative: id === "treasury",
    createdAt: new Date("2026-07-12T00:00:00.000Z"),
  };
}
