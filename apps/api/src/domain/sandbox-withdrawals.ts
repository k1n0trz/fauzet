import type {
  SandboxConversionResponse,
  SandboxQuoteResponse,
  SandboxStatusResponse,
  SandboxWithdrawalResponse,
  SandboxWithdrawalChallengeResponse,
} from "@fauzet/contracts";

export interface SandboxWithdrawalStore {
  status(userId: string): Promise<SandboxStatusResponse>;
  createWallet(input: {
    userId: string;
    network: "SANDBOX_LTC" | "SANDBOX_DOGE";
    address: string;
    label: string;
  }): Promise<SandboxStatusResponse>;
  quote(input: {
    userId: string;
    asset: "SANDBOX_LTC" | "SANDBOX_DOGE";
    eligibleMinor: bigint;
  }): Promise<SandboxQuoteResponse>;
  convert(input: {
    userId: string;
    quoteId: string;
    idempotencyKey: string;
  }): Promise<SandboxConversionResponse>;
  withdraw(input: {
    userId: string;
    conversionId: string;
    walletId: string;
    password: string;
    challengeId: string;
    code: string;
    idempotencyKey: string;
  }): Promise<SandboxWithdrawalResponse>;
  challenge(input: {
    userId: string;
    conversionId: string;
    walletId: string;
  }): Promise<SandboxWithdrawalChallengeResponse>;
  cancel(input: {
    userId: string;
    conversionId: string;
    idempotencyKey: string;
  }): Promise<SandboxConversionResponse>;
}

export class SandboxWithdrawalError extends Error {
  constructor(
    public readonly code:
      | "SANDBOX_DISABLED"
      | "SANDBOX_ACCOUNT_INELIGIBLE"
      | "SANDBOX_QUOTE_INVALID"
      | "SANDBOX_CONVERSION_CONFLICT"
      | "SANDBOX_WALLET_COOLDOWN"
      | "SANDBOX_STEP_UP_INVALID"
      | "SANDBOX_CHALLENGE_INVALID"
      | "SANDBOX_INSUFFICIENT_ELIGIBLE"
      | "SANDBOX_BUSY",
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export class SandboxWithdrawalService {
  constructor(
    private readonly store: SandboxWithdrawalStore,
    private readonly enabled: boolean,
  ) {}

  status(userId: string) {
    this.assertEnabled();
    return this.store.status(userId);
  }
  createWallet(
    userId: string,
    input: Omit<
      Parameters<SandboxWithdrawalStore["createWallet"]>[0],
      "userId"
    >,
  ) {
    this.assertEnabled();
    return this.store.createWallet({ userId, ...input });
  }
  quote(
    userId: string,
    input: Omit<Parameters<SandboxWithdrawalStore["quote"]>[0], "userId">,
  ) {
    this.assertEnabled();
    return this.store.quote({ userId, ...input });
  }
  convert(
    userId: string,
    input: Omit<Parameters<SandboxWithdrawalStore["convert"]>[0], "userId">,
  ) {
    this.assertEnabled();
    return this.store.convert({ userId, ...input });
  }
  withdraw(
    userId: string,
    input: Omit<Parameters<SandboxWithdrawalStore["withdraw"]>[0], "userId">,
  ) {
    this.assertEnabled();
    return this.store.withdraw({ userId, ...input });
  }
  challenge(
    userId: string,
    input: Omit<Parameters<SandboxWithdrawalStore["challenge"]>[0], "userId">,
  ) {
    this.assertEnabled();
    return this.store.challenge({ userId, ...input });
  }
  cancel(
    userId: string,
    input: Omit<Parameters<SandboxWithdrawalStore["cancel"]>[0], "userId">,
  ) {
    this.assertEnabled();
    return this.store.cancel({ userId, ...input });
  }

  private assertEnabled() {
    if (!this.enabled)
      throw new SandboxWithdrawalError(
        "SANDBOX_DISABLED",
        "Sandbox withdrawals are disabled",
        503,
      );
  }
}
