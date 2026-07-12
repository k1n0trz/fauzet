export type AccountKind =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE"
  | "CONTRA";

export interface LedgerAccount {
  id: string;
  asset: string;
  kind: AccountKind;
}

export interface PostingInput {
  account: LedgerAccount;
  amount: bigint;
}

export interface LedgerTransactionInput {
  idempotencyKey: string;
  type: string;
  sourceType: string;
  sourceId: string;
  postings: readonly PostingInput[];
}

export class LedgerInvariantError extends Error {}

export function validateBalancedTransaction(
  input: LedgerTransactionInput,
): void {
  if (input.postings.length < 2) {
    throw new LedgerInvariantError(
      "A ledger transaction requires at least two postings",
    );
  }

  const totals = new Map<string, bigint>();
  for (const posting of input.postings) {
    totals.set(
      posting.account.asset,
      (totals.get(posting.account.asset) ?? 0n) + posting.amount,
    );
  }

  for (const [asset, total] of totals) {
    if (total !== 0n) {
      throw new LedgerInvariantError(
        `Postings for ${asset} are not balanced: ${total}`,
      );
    }
  }
}

export function buildReversal(
  original: LedgerTransactionInput,
  idempotencyKey: string,
): LedgerTransactionInput {
  return {
    idempotencyKey,
    type: `${original.type}_REVERSAL`,
    sourceType: "ledger_transaction",
    sourceId: original.idempotencyKey,
    postings: original.postings.map((posting) => ({
      account: posting.account,
      amount: -posting.amount,
    })),
  };
}
