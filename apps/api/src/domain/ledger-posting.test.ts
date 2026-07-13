import { describe, expect, it, vi } from "vitest";
import { LedgerInvariantError } from "./ledger.js";
import {
  buildCompensatingPostings,
  LedgerPostingService,
  type LedgerPostingStore,
  type PersistedLedgerTransaction,
  type PostLedgerTransactionInput,
} from "./ledger-posting.js";

const balanced: PostLedgerTransactionInput = {
  idempotencyKey: "faucet:claim-1",
  type: "FAUCET_REWARD",
  sourceType: "faucet_claim",
  sourceId: "claim-1",
  configVersion: 1,
  metadata: { channel: "web" },
  postings: [
    {
      account: { id: "treasury", asset: "ZYXE", kind: "EQUITY" },
      amount: -25n,
    },
    {
      account: { id: "user", asset: "ZYXE", kind: "LIABILITY" },
      amount: 25n,
    },
  ],
};

describe("LedgerPostingService", () => {
  it("validates a balanced transaction before passing it to persistence", async () => {
    const stored = persistedTransaction();
    const store = fakeStore(stored);
    const service = new LedgerPostingService(store);

    await expect(service.post(balanced)).resolves.toBe(stored);
    expect(store.post).toHaveBeenCalledOnce();
  });

  it("rejects fewer than two postings before touching persistence", async () => {
    const store = fakeStore(persistedTransaction());
    const service = new LedgerPostingService(store);

    await expect(
      service.post({ ...balanced, postings: [balanced.postings[0]!] }),
    ).rejects.toBeInstanceOf(LedgerInvariantError);
    expect(store.post).not.toHaveBeenCalled();
  });

  it("rejects a non-zero total for any asset", async () => {
    const store = fakeStore(persistedTransaction());
    const service = new LedgerPostingService(store);

    await expect(
      service.post({
        ...balanced,
        postings: [
          balanced.postings[0]!,
          { ...balanced.postings[1]!, amount: 24n },
        ],
      }),
    ).rejects.toThrow("Postings for ZYXE are not balanced");
    expect(store.post).not.toHaveBeenCalled();
  });

  it("requires a positive economic configuration version", async () => {
    const store = fakeStore(persistedTransaction());
    const service = new LedgerPostingService(store);

    await expect(
      service.post({ ...balanced, configVersion: 0 }),
    ).rejects.toThrow("configVersion must be a positive safe integer");
  });

  it("builds exact compensating postings", () => {
    const reversal = buildCompensatingPostings(persistedTransaction().postings);
    expect(reversal.map(({ amount }) => amount)).toEqual([25n, -25n]);
  });
});

function fakeStore(stored: PersistedLedgerTransaction) {
  return {
    post: vi.fn().mockResolvedValue(stored),
    reverse: vi.fn(),
  } satisfies LedgerPostingStore;
}

function persistedTransaction(): PersistedLedgerTransaction {
  return {
    id: "transaction-1",
    idempotencyKey: balanced.idempotencyKey,
    type: balanced.type,
    sourceType: balanced.sourceType,
    sourceId: balanced.sourceId,
    status: "POSTED",
    configVersion: balanced.configVersion,
    metadata: balanced.metadata ?? {},
    postedAt: new Date("2026-07-12T00:00:00.000Z"),
    reversedById: null,
    postings: balanced.postings.map((posting, index) => ({
      id: `posting-${index}`,
      account: posting.account,
      amount: posting.amount,
      balanceAfter: null,
    })),
  };
}
