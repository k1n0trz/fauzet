import { getDatabase, Prisma, type PrismaClient } from "@fauzet/database";
import { LedgerInvariantError } from "../domain/ledger.js";
import {
  buildCompensatingPostings,
  LedgerAccountPolicyError,
  LedgerAccountNotFoundError,
  LedgerInsufficientBalanceError,
  LedgerPostingConflictError,
  LedgerReversalError,
  LedgerTransactionNotFoundError,
  validatePostInput,
  type LedgerJsonValue,
  type LedgerPostingStore,
  type LedgerReversalResult,
  type PersistedLedgerPosting,
  type PersistedLedgerTransaction,
  type PostLedgerTransactionInput,
  type ReverseLedgerTransactionInput,
} from "../domain/ledger-posting.js";

const transactionInclude = {
  postings: {
    include: { account: true },
    orderBy: { id: "asc" as const },
  },
};

type TransactionRecord = Prisma.LedgerTransactionGetPayload<{
  include: typeof transactionInclude;
}>;

type LedgerQueryClient = Pick<
  Prisma.TransactionClient,
  "ledgerAccount" | "ledgerTransaction"
>;

class ConcurrentLedgerReversalError extends Error {}

export class PrismaLedgerStore implements LedgerPostingStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}

  async post(
    input: PostLedgerTransactionInput,
  ): Promise<PersistedLedgerTransaction> {
    validatePostInput(input);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.database.$transaction(
          async (tx) => postLedgerTransactionInTransaction(tx, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRecoverableDatabaseConflict(error)) throw error;

        const recovered = await findExisting(this.database, input);
        if (recovered) return toPersistedTransaction(recovered);
        if (isSerializationConflict(error) && attempt === 0) continue;
        throw new LedgerPostingConflictError();
      }
    }

    throw new LedgerPostingConflictError();
  }

  async reverse(
    input: ReverseLedgerTransactionInput,
  ): Promise<LedgerReversalResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.database.$transaction(
          async (tx) => this.reverseInTransaction(tx, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRecoverableReversalConflict(error)) throw error;

        const recovered = await this.recoverReversal(input);
        if (recovered) return recovered;
        if (isSerializationConflict(error) && attempt === 0) continue;
        throw new LedgerPostingConflictError(
          "The transaction was reversed by a different request",
        );
      }
    }

    throw new LedgerPostingConflictError(
      "The transaction was reversed by a different request",
    );
  }

  private async reverseInTransaction(
    tx: Prisma.TransactionClient,
    input: ReverseLedgerTransactionInput,
  ): Promise<LedgerReversalResult> {
    const original = await tx.ledgerTransaction.findUnique({
      where: { id: input.transactionId },
      include: transactionInclude,
    });
    if (!original) {
      throw new LedgerTransactionNotFoundError(input.transactionId);
    }

    const reversalInput = makeReversalInput(original, input);
    const existing = await findExisting(tx, reversalInput);
    if (existing) {
      return linkedReversalResult(original, existing);
    }

    if (original.status !== "POSTED" || original.reversedById !== null) {
      throw new LedgerReversalError(
        `Only an unreversed POSTED transaction can be reversed: ${original.id}`,
      );
    }

    const resolvedReversal = await resolveAccounts(tx, reversalInput);
    const reversal = await tx.ledgerTransaction.create({
      data: {
        idempotencyKey: resolvedReversal.idempotencyKey,
        type: resolvedReversal.type,
        sourceType: resolvedReversal.sourceType,
        sourceId: resolvedReversal.sourceId,
        status: "POSTED",
        configVersion: resolvedReversal.configVersion,
        metadata: toPrismaJson(resolvedReversal.metadata ?? {}),
        postedAt: new Date(),
        postings: {
          create: resolvedReversal.postings.map((posting) => ({
            accountId: posting.account.id,
            amount: posting.amount.toString(),
          })),
        },
      },
      include: transactionInclude,
    });

    const updated = await tx.ledgerTransaction.updateMany({
      where: {
        id: original.id,
        status: "POSTED",
        reversedById: null,
      },
      data: {
        status: "REVERSED",
        reversedById: reversal.id,
      },
    });
    if (updated.count !== 1) throw new ConcurrentLedgerReversalError();

    const reversedOriginal = await tx.ledgerTransaction.findUnique({
      where: { id: original.id },
      include: transactionInclude,
    });
    if (!reversedOriginal) {
      throw new LedgerTransactionNotFoundError(original.id);
    }

    return {
      original: toPersistedTransaction(reversedOriginal),
      reversal: toPersistedTransaction(reversal),
    };
  }

  private async recoverReversal(
    input: ReverseLedgerTransactionInput,
  ): Promise<LedgerReversalResult | null> {
    const original = await this.database.ledgerTransaction.findUnique({
      where: { id: input.transactionId },
      include: transactionInclude,
    });
    if (!original) {
      throw new LedgerTransactionNotFoundError(input.transactionId);
    }

    const reversalInput = makeReversalInput(original, input);
    const reversal = await findExisting(this.database, reversalInput);
    if (!reversal) return null;
    return linkedReversalResult(original, reversal);
  }
}

export async function postLedgerTransactionInTransaction(
  tx: Prisma.TransactionClient,
  input: PostLedgerTransactionInput,
): Promise<PersistedLedgerTransaction> {
  validatePostInput(input);
  const existing = await findExisting(tx, input);
  if (existing) return toPersistedTransaction(existing);

  const resolvedInput = await resolveAccounts(tx, input);
  const created = await tx.ledgerTransaction.create({
    data: {
      idempotencyKey: resolvedInput.idempotencyKey,
      type: resolvedInput.type,
      sourceType: resolvedInput.sourceType,
      sourceId: resolvedInput.sourceId,
      status: "POSTED",
      configVersion: resolvedInput.configVersion,
      metadata: toPrismaJson(resolvedInput.metadata ?? {}),
      postedAt: new Date(),
      postings: {
        create: resolvedInput.postings.map((posting) => ({
          accountId: posting.account.id,
          amount: posting.amount.toString(),
        })),
      },
    },
    include: transactionInclude,
  });
  return toPersistedTransaction(created);
}

async function resolveAccounts(
  tx: Prisma.TransactionClient,
  input: PostLedgerTransactionInput,
): Promise<PostLedgerTransactionInput> {
  const accountIds = [
    ...new Set(input.postings.map(({ account }) => account.id)),
  ];
  const accounts = await tx.ledgerAccount.findMany({
    where: { id: { in: accountIds }, active: true },
    select: {
      id: true,
      asset: true,
      kind: true,
      code: true,
      allowNegative: true,
    },
  });
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const missing = accountIds.filter((accountId) => !byId.has(accountId));
  if (missing.length > 0) throw new LedgerAccountNotFoundError(missing);

  if (accounts.some(({ code }) => code.startsWith("treasury:owner:"))) {
    throw new LedgerAccountPolicyError(
      "Owner accounts require the dedicated approved treasury workflow",
    );
  }

  const deltas = new Map<string, bigint>();
  for (const posting of input.postings) {
    deltas.set(
      posting.account.id,
      (deltas.get(posting.account.id) ?? 0n) + posting.amount,
    );
  }
  const currentBalances = await tx.ledgerPosting.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: accountIds },
      transaction: { status: { in: ["POSTED", "REVERSED"] } },
    },
    _sum: { amount: true },
  });
  const balancesByAccount = new Map(
    currentBalances.map(({ accountId, _sum }) => [
      accountId,
      BigInt(_sum.amount?.toFixed(0) ?? "0"),
    ]),
  );
  for (const account of accounts) {
    const resultingBalance =
      (balancesByAccount.get(account.id) ?? 0n) +
      (deltas.get(account.id) ?? 0n);
    if (!account.allowNegative && resultingBalance < 0n) {
      throw new LedgerInsufficientBalanceError(account.id, resultingBalance);
    }
  }

  const resolved = input.postings.map((posting) => {
    const stored = byId.get(posting.account.id)!;
    if (
      stored.asset !== posting.account.asset ||
      stored.kind !== posting.account.kind
    ) {
      throw new LedgerInvariantError(
        `Ledger account reference does not match stored account: ${stored.id}`,
      );
    }
    return {
      account: {
        id: stored.id,
        asset: stored.asset,
        kind: stored.kind,
      },
      amount: posting.amount,
    };
  });

  const resolvedInput = { ...input, postings: resolved };
  validatePostInput(resolvedInput);
  return resolvedInput;
}

async function findExisting(
  client: LedgerQueryClient,
  input: PostLedgerTransactionInput,
): Promise<TransactionRecord | null> {
  const records = await client.ledgerTransaction.findMany({
    where: {
      OR: [
        { idempotencyKey: input.idempotencyKey },
        {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          type: input.type,
        },
      ],
    },
    include: transactionInclude,
    take: 2,
  });

  if (records.length === 0) return null;
  if (records.length === 1 && matchesInput(records[0]!, input)) {
    return records[0]!;
  }
  throw new LedgerPostingConflictError();
}

function makeReversalInput(
  original: TransactionRecord,
  input: ReverseLedgerTransactionInput,
): PostLedgerTransactionInput {
  const persistedOriginal = toPersistedTransaction(original);
  const result: PostLedgerTransactionInput = {
    idempotencyKey: input.idempotencyKey,
    type: `${original.type}_REVERSAL`,
    sourceType: "ledger_transaction",
    sourceId: original.id,
    configVersion: original.configVersion,
    postings: buildCompensatingPostings(persistedOriginal.postings),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
  validatePostInput(result);
  return result;
}

function linkedReversalResult(
  original: TransactionRecord,
  reversal: TransactionRecord,
): LedgerReversalResult {
  if (original.status !== "REVERSED" || original.reversedById !== reversal.id) {
    throw new LedgerReversalError(
      `Reversal ${reversal.id} is not linked from transaction ${original.id}`,
    );
  }
  return {
    original: toPersistedTransaction(original),
    reversal: toPersistedTransaction(reversal),
  };
}

function matchesInput(
  record: TransactionRecord,
  input: PostLedgerTransactionInput,
): boolean {
  return (
    (record.status === "POSTED" || record.status === "REVERSED") &&
    record.idempotencyKey === input.idempotencyKey &&
    record.type === input.type &&
    record.sourceType === input.sourceType &&
    record.sourceId === input.sourceId &&
    record.configVersion === input.configVersion &&
    canonicalJson(record.metadata as LedgerJsonValue) ===
      canonicalJson(input.metadata ?? {}) &&
    canonicalRecordPostings(record.postings) ===
      canonicalInputPostings(input.postings)
  );
}

function canonicalRecordPostings(
  postings: TransactionRecord["postings"],
): string {
  return JSON.stringify(
    postings
      .map((posting) => [
        posting.account.id,
        posting.account.asset,
        posting.account.kind,
        posting.amount.toFixed(0),
      ])
      .sort(compareCanonicalPosting),
  );
}

function canonicalInputPostings(
  postings: PostLedgerTransactionInput["postings"],
): string {
  return JSON.stringify(
    postings
      .map((posting) => [
        posting.account.id,
        posting.account.asset,
        posting.account.kind,
        posting.amount.toString(),
      ])
      .sort(compareCanonicalPosting),
  );
}

function compareCanonicalPosting(a: string[], b: string[]): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function canonicalJson(value: LedgerJsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function toPersistedTransaction(
  record: TransactionRecord,
): PersistedLedgerTransaction {
  return {
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    type: record.type,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    status: record.status,
    configVersion: record.configVersion,
    metadata: record.metadata as LedgerJsonValue,
    postedAt: record.postedAt,
    reversedById: record.reversedById,
    postings: record.postings.map(toPersistedPosting),
  };
}

function toPersistedPosting(
  posting: TransactionRecord["postings"][number],
): PersistedLedgerPosting {
  return {
    id: posting.id,
    account: {
      id: posting.account.id,
      asset: posting.account.asset,
      kind: posting.account.kind,
    },
    amount: BigInt(posting.amount.toFixed(0)),
    balanceAfter:
      posting.balanceAfter === null
        ? null
        : BigInt(posting.balanceAfter.toFixed(0)),
  };
}

function toPrismaJson(value: LedgerJsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isRecoverableDatabaseConflict(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2002") || isSerializationConflict(error);
}

function isRecoverableReversalConflict(error: unknown): boolean {
  return (
    error instanceof ConcurrentLedgerReversalError ||
    isRecoverableDatabaseConflict(error)
  );
}

function isSerializationConflict(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2034");
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
