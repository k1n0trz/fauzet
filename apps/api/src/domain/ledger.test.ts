import { describe, expect, it } from "vitest";
import {
  buildReversal,
  LedgerInvariantError,
  validateBalancedTransaction,
  type LedgerTransactionInput,
} from "./ledger.js";

const balanced: LedgerTransactionInput = {
  idempotencyKey: "claim:1",
  type: "FAUCET_REWARD",
  sourceType: "faucet_claim",
  sourceId: "1",
  postings: [
    { account: { id: "pool", asset: "ZYXE", kind: "EQUITY" }, amount: -25n },
    { account: { id: "user", asset: "ZYXE", kind: "LIABILITY" }, amount: 25n },
  ],
};

describe("ledger invariants", () => {
  it("accepts a balanced transaction", () => {
    expect(() => validateBalancedTransaction(balanced)).not.toThrow();
  });

  it("rejects an unbalanced transaction", () => {
    expect(() =>
      validateBalancedTransaction({
        ...balanced,
        postings: [balanced.postings[0]!],
      }),
    ).toThrow(LedgerInvariantError);
  });

  it("creates a balanced compensating reversal", () => {
    const reversal = buildReversal(balanced, "reversal:claim:1");
    expect(() => validateBalancedTransaction(reversal)).not.toThrow();
    expect(reversal.postings[1]?.amount).toBe(-25n);
  });
});
