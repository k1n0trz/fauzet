import {
  LedgerInvariantError,
  validateBalancedTransaction,
  type LedgerAccount,
  type LedgerTransactionInput,
  type PostingInput,
} from "./ledger.js";

export type LedgerJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly LedgerJsonValue[]
  | { readonly [key: string]: LedgerJsonValue };

export type LedgerMetadata = Readonly<Record<string, LedgerJsonValue>>;

export interface PostLedgerTransactionInput extends LedgerTransactionInput {
  configVersion: number;
  metadata?: LedgerMetadata;
}

export interface ReverseLedgerTransactionInput {
  transactionId: string;
  idempotencyKey: string;
  metadata?: LedgerMetadata;
}

export type PersistedLedgerTransactionStatus =
  | "PENDING"
  | "POSTED"
  | "REVERSED"
  | "REJECTED";

export interface PersistedLedgerPosting {
  id: string;
  account: LedgerAccount;
  amount: bigint;
  balanceAfter: bigint | null;
}

export interface PersistedLedgerTransaction {
  id: string;
  idempotencyKey: string;
  type: string;
  sourceType: string;
  sourceId: string;
  status: PersistedLedgerTransactionStatus;
  configVersion: number;
  metadata: LedgerJsonValue;
  postedAt: Date | null;
  reversedById: string | null;
  postings: readonly PersistedLedgerPosting[];
}

export interface LedgerReversalResult {
  original: PersistedLedgerTransaction;
  reversal: PersistedLedgerTransaction;
}

export interface LedgerPostingStore {
  post(input: PostLedgerTransactionInput): Promise<PersistedLedgerTransaction>;
  reverse(input: ReverseLedgerTransactionInput): Promise<LedgerReversalResult>;
}

export class LedgerPostingConflictError extends Error {
  readonly code = "LEDGER_POSTING_CONFLICT";

  constructor(message = "Ledger idempotency or source identity conflicts") {
    super(message);
    this.name = "LedgerPostingConflictError";
  }
}

export class LedgerAccountNotFoundError extends Error {
  readonly code = "LEDGER_ACCOUNT_NOT_FOUND";

  constructor(readonly accountIds: readonly string[]) {
    super(
      `Ledger accounts were not found or are inactive: ${accountIds.join(", ")}`,
    );
    this.name = "LedgerAccountNotFoundError";
  }
}

export class LedgerInsufficientBalanceError extends Error {
  readonly code = "LEDGER_INSUFFICIENT_BALANCE";

  constructor(
    readonly accountId: string,
    readonly resultingBalance: bigint,
  ) {
    super(`Ledger account cannot become negative: ${accountId}`);
    this.name = "LedgerInsufficientBalanceError";
  }
}

export class LedgerAccountPolicyError extends Error {
  readonly code = "LEDGER_ACCOUNT_POLICY_REJECTED";

  constructor(message: string) {
    super(message);
    this.name = "LedgerAccountPolicyError";
  }
}

export class LedgerTransactionNotFoundError extends Error {
  readonly code = "LEDGER_TRANSACTION_NOT_FOUND";

  constructor(readonly transactionId: string) {
    super(`Ledger transaction was not found: ${transactionId}`);
    this.name = "LedgerTransactionNotFoundError";
  }
}

export class LedgerReversalError extends Error {
  readonly code = "LEDGER_REVERSAL_REJECTED";

  constructor(message: string) {
    super(message);
    this.name = "LedgerReversalError";
  }
}

export class LedgerPostingService {
  constructor(private readonly store: LedgerPostingStore) {}

  async post(input: PostLedgerTransactionInput) {
    validatePostInput(input);
    return this.store.post(input);
  }

  async reverse(input: ReverseLedgerTransactionInput) {
    requireNonEmpty(input.transactionId, "transactionId");
    requireNonEmpty(input.idempotencyKey, "idempotencyKey");
    return this.store.reverse(input);
  }
}

export function validatePostInput(input: PostLedgerTransactionInput): void {
  requireNonEmpty(input.idempotencyKey, "idempotencyKey");
  requireNonEmpty(input.type, "type");
  requireNonEmpty(input.sourceType, "sourceType");
  requireNonEmpty(input.sourceId, "sourceId");

  if (!Number.isSafeInteger(input.configVersion) || input.configVersion < 1) {
    throw new LedgerInvariantError(
      "configVersion must be a positive safe integer",
    );
  }

  validateBalancedTransaction(input);
}

export function buildCompensatingPostings(
  postings: readonly PersistedLedgerPosting[],
): readonly PostingInput[] {
  return postings.map(({ account, amount }) => ({
    account,
    amount: -amount,
  }));
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new LedgerInvariantError(`${field} must not be empty`);
  }
}
