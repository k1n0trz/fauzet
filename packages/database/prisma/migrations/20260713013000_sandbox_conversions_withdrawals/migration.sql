CREATE TYPE "ExternalWalletStatus" AS ENUM ('PENDING_COOLDOWN', 'ACTIVE', 'REVOKED');
CREATE TYPE "ConversionQuoteStatus" AS ENUM ('OPEN', 'CONSUMED', 'EXPIRED');
CREATE TYPE "ConversionStatus" AS ENUM ('RESERVED', 'COMPLETED', 'CANCELLED', 'REJECTED');
CREATE TYPE "WithdrawalStatus" AS ENUM ('REVIEW', 'CONFIRMED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ExternalWallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" "ExternalWalletStatus" NOT NULL DEFAULT 'PENDING_COOLDOWN',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionQuote" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "asset" TEXT NOT NULL,
  "eligibleMinor" DECIMAL(36,0) NOT NULL,
  "rateNumerator" DECIMAL(36,0) NOT NULL,
  "rateDenominator" DECIMAL(36,0) NOT NULL,
  "spreadBps" INTEGER NOT NULL,
  "grossAssetMinor" DECIMAL(36,0) NOT NULL,
  "networkFeeAssetMinor" DECIMAL(36,0) NOT NULL,
  "netAssetMinor" DECIMAL(36,0) NOT NULL,
  "status" "ConversionQuoteStatus" NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversionQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "ConversionStatus" NOT NULL DEFAULT 'RESERVED',
  "reserveTransactionId" TEXT NOT NULL,
  "releaseTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Withdrawal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversionId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "WithdrawalStatus" NOT NULL,
  "riskScore" INTEGER NOT NULL,
  "reasonCodes" JSONB NOT NULL DEFAULT '[]',
  "assurance" TEXT NOT NULL,
  "sandboxTxId" TEXT,
  "confirmations" INTEGER NOT NULL DEFAULT 0,
  "settlementTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalWallet_userId_network_address_key" ON "ExternalWallet"("userId", "network", "address");
CREATE INDEX "ExternalWallet_userId_status_createdAt_idx" ON "ExternalWallet"("userId", "status", "createdAt");
CREATE INDEX "ConversionQuote_userId_status_expiresAt_idx" ON "ConversionQuote"("userId", "status", "expiresAt");
CREATE UNIQUE INDEX "Conversion_quoteId_key" ON "Conversion"("quoteId");
CREATE UNIQUE INDEX "Conversion_idempotencyKey_key" ON "Conversion"("idempotencyKey");
CREATE UNIQUE INDEX "Conversion_reserveTransactionId_key" ON "Conversion"("reserveTransactionId");
CREATE UNIQUE INDEX "Conversion_releaseTransactionId_key" ON "Conversion"("releaseTransactionId");
CREATE INDEX "Conversion_userId_status_createdAt_idx" ON "Conversion"("userId", "status", "createdAt");
CREATE UNIQUE INDEX "Withdrawal_conversionId_key" ON "Withdrawal"("conversionId");
CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");
CREATE UNIQUE INDEX "Withdrawal_sandboxTxId_key" ON "Withdrawal"("sandboxTxId");
CREATE UNIQUE INDEX "Withdrawal_settlementTransactionId_key" ON "Withdrawal"("settlementTransactionId");
CREATE INDEX "Withdrawal_userId_status_createdAt_idx" ON "Withdrawal"("userId", "status", "createdAt");
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

ALTER TABLE "ExternalWallet"
  ADD CONSTRAINT "ExternalWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ExternalWallet_sandbox_check" CHECK (
    "network" IN ('SANDBOX_LTC', 'SANDBOX_DOGE') AND
    "address" ~ '^sandbox:[a-zA-Z0-9_-]{8,64}$' AND length("label") BETWEEN 2 AND 80 AND
    (("status" = 'REVOKED' AND "revokedAt" IS NOT NULL) OR ("status" <> 'REVOKED' AND "revokedAt" IS NULL))
  );

ALTER TABLE "ConversionQuote"
  ADD CONSTRAINT "ConversionQuote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConversionQuote_amount_check" CHECK (
    "asset" IN ('SANDBOX_LTC', 'SANDBOX_DOGE') AND "eligibleMinor" >= 500 AND
    "rateNumerator" > 0 AND "rateDenominator" > 0 AND "spreadBps" BETWEEN 0 AND 1000 AND
    "grossAssetMinor" > 0 AND "networkFeeAssetMinor" >= 0 AND
    "netAssetMinor" = "grossAssetMinor" - "networkFeeAssetMinor" AND "netAssetMinor" > 0 AND
    "expiresAt" > "createdAt"
  );

ALTER TABLE "Conversion"
  ADD CONSTRAINT "Conversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ConversionQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversion_reserveTransactionId_fkey" FOREIGN KEY ("reserveTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversion_releaseTransactionId_fkey" FOREIGN KEY ("releaseTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversion_state_check" CHECK (
    ("status" IN ('RESERVED', 'COMPLETED') AND "releaseTransactionId" IS NULL) OR
    ("status" IN ('CANCELLED', 'REJECTED') AND "releaseTransactionId" IS NOT NULL)
  );

ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Withdrawal_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Withdrawal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ExternalWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Withdrawal_settlementTransactionId_fkey" FOREIGN KEY ("settlementTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Withdrawal_state_check" CHECK (
    "riskScore" BETWEEN 0 AND 100 AND "assurance" = 'PASSWORD_REAUTH_SANDBOX' AND
    (("status" = 'REVIEW' AND "sandboxTxId" IS NULL AND "settlementTransactionId" IS NULL AND "confirmations" = 0) OR
     ("status" = 'CONFIRMED' AND "sandboxTxId" IS NOT NULL AND "settlementTransactionId" IS NOT NULL AND "confirmations" >= 1) OR
     ("status" IN ('REJECTED', 'CANCELLED') AND "sandboxTxId" IS NULL AND "settlementTransactionId" IS NULL AND "confirmations" = 0))
  );

CREATE FUNCTION "prevent_sandbox_economic_delete"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Sandbox economic records cannot be deleted';
END;
$$;

CREATE TRIGGER "ConversionQuote_no_delete" BEFORE DELETE ON "ConversionQuote"
FOR EACH ROW EXECUTE FUNCTION "prevent_sandbox_economic_delete"();
CREATE TRIGGER "Conversion_no_delete" BEFORE DELETE ON "Conversion"
FOR EACH ROW EXECUTE FUNCTION "prevent_sandbox_economic_delete"();
CREATE TRIGGER "Withdrawal_no_delete" BEFORE DELETE ON "Withdrawal"
FOR EACH ROW EXECUTE FUNCTION "prevent_sandbox_economic_delete"();
